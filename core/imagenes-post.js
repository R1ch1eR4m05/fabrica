// Imágenes para el feed (4:5, 1080x1350) a partir de un video ya hecho, sin gastar créditos:
//  - frase.jpg: la frase más fuerte del video sobre su imagen (publicación suelta).
//  - carrusel-01..N.jpg: una diapositiva por escena (su línea de voz sobre su imagen), para álbum/carrusel.
//  - texto.txt: el texto para publicar.
// Mismo look del estilo: imagen en un solo tono, letra Cinzel, sello. Todo en proyectos/<id>/imagenes/ y en listos/.
import fs from "node:fs";
import path from "node:path";
import { CFG, RAIZ, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, textoEscena } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { pedir, jsonDe } from "./llm.js";
import { abrirNavegador } from "./render.js";
import { imagenDeEscena } from "./miniatura.js";

const W = 1080, H = 1350, MAX_DIAPOS = 8;
const FUENTES = path.join(RAIZ, "estilos", "_comun", "fuentes");
const TONOS = { turquesa: "#3fb2a3", ambar: "#d49a5a", plata: "#9a9a9a", rojo: "#b5473a" };
export const dirImagenes = (id) => path.join(dirProyecto(id), "imagenes");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const b64 = (f) => fs.readFileSync(f).toString("base64");
const palabras = (t) => String(t).split(/\s+/).filter(Boolean).length;
const oraciones = (t) => (String(t).match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || []).map((s) => s.trim()).filter(Boolean);

function html({ fondo, texto, tono, sello, canal, n, total }) {
  const cinzel = b64(path.join(FUENTES, "cinzel-latin-800-normal.woff2"));
  const tinte = tono ? `<div class="capa" style="background:${tono};mix-blend-mode:color"></div>` : "";
  const filtro = tono ? "grayscale(1) contrast(1.15) brightness(1.02)" : "contrast(1.05) brightness(.95)";
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:C;font-weight:800;src:url(data:font/woff2;base64,${cinzel}) format("woff2")}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#06090a}
.capa{position:absolute;inset:0}
#bg{position:absolute;inset:0;background:${fondo ? `url(data:image/jpeg;base64,${b64(fondo)})` : "#0d1517"} center/cover;filter:${filtro};transform:scale(1.04)}
#sombra{background:radial-gradient(ellipse at 50% 42%,rgba(0,0,0,.34) 0%,rgba(0,0,0,.1) 50%,rgba(0,0,0,.4) 100%)}
#t{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:${Math.round(W * 0.86)}px;text-align:center;
  font:800 88px/1.14 C,serif;color:#f4f4f2;text-transform:uppercase;letter-spacing:.01em;
  -webkit-text-stroke:8px rgba(0,0,0,.85);paint-order:stroke fill;text-shadow:0 0 26px rgba(255,255,255,.28),0 4px 18px rgba(0,0,0,.8)}
#sello{position:absolute;left:50%;bottom:${canal ? 118 : 86}px;transform:translateX(-50%);width:68px;height:68px;border-radius:50%;
  border:3px solid #f2f2f2;box-shadow:inset 0 0 0 6px rgba(0,0,0,.35),inset 0 0 0 7.5px #f2f2f2;background:rgba(0,0,0,.35);
  display:flex;align-items:center;justify-content:center;font:800 30px C,serif;color:#f2f2f2}
#canal{position:absolute;left:0;right:0;bottom:66px;text-align:center;font:800 26px C,serif;color:rgba(242,242,242,.8);letter-spacing:.08em}
#n{position:absolute;right:46px;top:44px;font:800 26px C,serif;color:rgba(242,242,242,.75);letter-spacing:.08em}
</style><div id="bg" class="capa"></div>${tinte}<div id="sombra" class="capa"></div>
<div id="t">${oraciones(texto).map((o) => `<div style="margin-bottom:.32em">${esc(o)}</div>`).join("")}</div>${sello ? `<div id="sello">${esc(sello)}</div>` : ""}${canal ? `<div id="canal">@${esc(canal)}</div>` : ""}${total > 1 ? `<div id="n">${n}/${total}</div>` : ""}
<script>document.fonts.load("800 88px C").then(()=>{const t=document.getElementById("t");let s=96;t.style.fontSize=s+"px";
while((t.scrollHeight>${Math.round(H * 0.56)}||t.scrollWidth>t.clientWidth+2)&&s>44){s-=3;t.style.fontSize=s+"px"}document.body.dataset.listo="1"})</script>`;
}

// qué escenas van al carrusel: la primera (el gancho), la última y las de en medio repartidas
function elegirEscenas(escenas) {
  const ok = escenas.map((e, k) => ({ k, t: textoEscena(e) })).filter((x) => x.t && palabras(x.t) <= 26);
  if (ok.length <= MAX_DIAPOS) return ok;
  const out = [ok[0]];
  for (let j = 1; j < MAX_DIAPOS - 1; j++) out.push(ok[Math.round((j * (ok.length - 1)) / (MAX_DIAPOS - 1))]);
  out.push(ok[ok.length - 1]);
  return out.filter((x, i, a) => a.indexOf(x) === i);
}

// la frase suelta: la más fuerte (la IA elige, copiada tal cual del guion); sin IA, la primera oración del gancho
async function elegirFrase(guion) {
  const lista = [];
  guion.escenas.forEach((e, k) => oraciones(textoEscena(e)).forEach((o) => { if (palabras(o) >= 4 && palabras(o) <= 18) lista.push({ k, o }); }));
  const mano = guion.frasePost && lista.find((x) => x.o === guion.frasePost);
  if (mano) return mano;
  const primera = lista[0] || { k: 0, o: textoEscena(guion.escenas[0]) };
  if (!(CFG.anthropicKey || CFG.geminiKey) || lista.length < 2) return primera;
  try {
    const j = jsonDe((await pedir("Eliges, de una lista de frases de un video de reflexión estoica en español, la que más gente guardaría o compartiría como imagen suelta: verdad incómoda, se entiende sola sin contexto, breve. Responde SOLO JSON {\"n\": número}.",
      lista.map((x, i) => `${i + 1}. ${x.o}`).join("\n"), { maxTokens: 200 })).texto);
    return lista[(+j.n || 1) - 1] || primera;
  } catch { return primera; }
}

// copy para publicar: el de la imagen suelta (qué significa la frase) y el del carrusel (la idea completa), más una línea por diapositiva
const SIS_COPY = `Escribes el texto para publicar en Instagram/Facebook de imágenes de un video de reflexión (filosofía para la vida diaria) en español de México, tono sereno y cercano, sin clichés de gurú ni promesas.
Recibes la frase de la imagen suelta, las frases del carrusel en orden y el tema del video.
Devuelve SOLO JSON:
{"suelta":"copy de la imagen suelta: 1 línea gancho + 2 a 4 líneas cortas que explican qué significa la frase y cómo se aplica en la vida diaria + 1 pregunta o invitación a guardarla/compartirla",
 "carrusel":"copy del carrusel: 1 línea gancho que invite a deslizar + 3 a 5 líneas cortas con la idea completa que recorre las diapositivas + cierre que invite a guardar",
 "diapositivas":["por cada diapositiva, en el mismo orden, 1 frase corta (máx 20 palabras) con lo que significa"],
 "hashtags":["5 a 8 hashtags en español, sin repetir"]}
No copies frases de otras cuentas. Separa las líneas con \\n. Sin emojis de más (máximo 2 por copy).`;

async function copysConIA(guion, frase, carrusel) {
  const base = { suelta: "", carrusel: "", diapositivas: carrusel.map(() => ""), hashtags: guion.subir?.hashtags || [] };
  if (!(CFG.anthropicKey || CFG.geminiKey)) return base;
  try {
    const j = jsonDe((await pedir(SIS_COPY, `Tema: ${guion.titulo || guion.subir?.titulo || ""}\nImagen suelta: ${frase.o}\nCarrusel:\n${carrusel.map((x, i) => `${i + 1}. ${x.t}`).join("\n")}`, { maxTokens: 2500 })).texto);
    return { suelta: String(j.suelta || ""), carrusel: String(j.carrusel || ""), diapositivas: carrusel.map((_, i) => String(j.diapositivas?.[i] || "")), hashtags: (j.hashtags?.length ? j.hashtags : base.hashtags).map((t) => (String(t).startsWith("#") ? t : "#" + t)) };
  } catch (e) { console.warn("Copy de imágenes:", e.message); return base; }
}

function textoParaPublicar(guion, frase, carrusel, c) {
  const tags = (c.hashtags || []).join(" ");
  return [
    "— Imagen suelta —", c.suelta || frase.o, "", tags, "",
    "— Carrusel —", c.carrusel || `${carrusel[0]?.t || ""}\n\nDesliza y guárdalo para cuando lo necesites.`, "", tags, "",
    c.diapositivas?.some(Boolean) ? "— Qué dice cada diapositiva —" : "",
    ...(c.diapositivas?.some(Boolean) ? carrusel.map((x, i) => `${i + 1}. ${x.t}\n   → ${c.diapositivas[i]}`) : []),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export async function sacarImagenes(id, { avisar = () => {} } = {}) {
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json");
  if (!guion?.escenas?.length) throw new Error("Este video todavía no tiene guion.");
  const op = p.opciones || {};
  const tono = leerEstilo(p.estilo)?.id === "reflexion-estatuas" || p.estilo === "reflexion-estatuas" ? TONOS[op.tono] || TONOS.turquesa : null;
  const canal = op.logo === "canal" ? String(p.canal || guion.canal || "").replace(/^@/, "").trim() : "";
  const sello = op.logo === "no" ? "" : (canal || "M")[0].toUpperCase();
  const dir = dirImagenes(id), tmp = path.join(dir, "_tmp");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });

  avisar({ paso: "render", progreso: 0.05, msg: "Eligiendo la frase y las diapositivas…" });
  const frase = await elegirFrase(guion), carrusel = elegirEscenas(guion.escenas);
  const nav = await abrirNavegador();
  const hechas = [];
  const dibujar = async (datos, archivo) => {
    const pag = await nav.newPage({ viewport: { width: W, height: H } });
    try {
      await pag.setContent(html(datos), { waitUntil: "load" });
      await pag.waitForSelector("body[data-listo]", { timeout: 15000 });
      await pag.screenshot({ path: path.join(dir, archivo), type: "jpeg", quality: 90 });
      hechas.push(archivo);
    } finally { await pag.close(); }
  };
  try {
    await dibujar({ fondo: await imagenDeEscena(id, frase.k + 1, tmp), texto: frase.o, tono, sello, canal, n: 1, total: 1 }, "frase.jpg");
    for (const [i, x] of carrusel.entries()) {
      avisar({ paso: "render", progreso: 0.15 + (0.8 * i) / carrusel.length, msg: `Carrusel ${i + 1} de ${carrusel.length}…` });
      await dibujar({ fondo: await imagenDeEscena(id, x.k + 1, tmp), texto: x.t, tono, sello, canal, n: i + 1, total: carrusel.length }, `carrusel-${String(i + 1).padStart(2, "0")}.jpg`);
    }
  } finally { await nav.close(); fs.rmSync(tmp, { recursive: true, force: true }); }

  avisar({ paso: "render", progreso: 0.97, msg: "Escribiendo el copy de cada imagen…" });
  const c = await copysConIA(guion, frase, carrusel);
  fs.writeFileSync(path.join(dir, "texto.txt"), textoParaPublicar(guion, frase, carrusel, c));
  const info = { fecha: new Date().toISOString(), frase: frase.o, archivos: hechas, copy: { suelta: c.suelta, carrusel: c.carrusel, hashtags: c.hashtags, diapositivas: carrusel.map((x, i) => ({ texto: x.t, significado: c.diapositivas[i] })) } };
  fs.writeFileSync(path.join(dir, "imagenes.json"), JSON.stringify(info, null, 2));
  const dl = path.join(DIR_LISTOS, `${id}-imagenes`); fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  for (const f of [...hechas, "texto.txt"]) fs.copyFileSync(path.join(dir, f), path.join(dl, f));
  avisar({ paso: "render", progreso: 1, msg: "Imágenes listas." });
  return info;
}

export const leerImagenes = (id) => { try { return JSON.parse(fs.readFileSync(path.join(dirImagenes(id), "imagenes.json"), "utf8")); } catch { return null; } };
