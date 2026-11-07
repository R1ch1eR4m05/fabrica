// Anuncios: un estilo con varias plantillas (advertorial, dato, testimonio, nosotros vs ellos, antes/después,
// notificaciones, UGC, oferta). Sale como imágenes (una por variación) o como video, en 1:1, 4:5 y 9:16.
// También es la puerta del "cerebro": POST /api/anuncios crea anuncios desde un brief.
import fs from "node:fs";
import path from "node:path";
import { FORMATOS, DIR_LISTOS } from "./config.js";
import * as P from "./proyectos.js";
import { prepararHistoria } from "./historia.js";
import { render, abrirNavegador, abrirPagina, servidorTemporal } from "./render.js";
import { hacerVoz } from "./voz.js";

export const MEDIDAS = ["9:16", "4:5", "1:1"];
export const PLANTILLAS = ["advertorial", "dato", "testimonio", "versus", "antes-despues", "notificaciones", "ugc", "oferta"];
export const medidasDe = (p) => (p.opciones?.medidas === "esta" ? [p.formato] : MEDIDAS);
const sufijo = (f) => f.replace(":", "x");

// cambia la medida del proyecto mientras corre fn, y la deja como estaba
async function conMedida(id, formato, fn) {
  const p = P.leer(id, "proyecto.json"), antes = p.formato;
  p.formato = formato; P.guardar(id, "proyecto.json", p);
  try { return await fn(); } finally { const q = P.leer(id, "proyecto.json"); q.formato = antes; P.guardar(id, "proyecto.json", q); }
}

// anuncios de imagen: una imagen por escena (cada escena = una variación) en cada medida
export async function exportarImagenes(id, avisar = () => {}, formatos) {
  const p = P.leer(id, "proyecto.json"), g = P.leer(id, "guion.json");
  if (!g?.escenas?.length) throw new Error("Primero hace falta el guion.");
  formatos ||= medidasDe(p);
  if (!P.leer(id, "tiempos.json") || P.leer(id, "tiempos.json").escenas?.length !== g.escenas.length) {
    if (p.conVoz !== false) { p.conVoz = false; P.guardar(id, "proyecto.json", p); }
    avisar({ paso: "render", progreso: 0.02, msg: "Calculando tiempos…" });
    await hacerVoz(id, () => {}); // sin voz: solo marca los tiempos de cada variación
  }
  const t = P.leer(id, "tiempos.json"), dir = path.join(P.dirProyecto(id), "anuncios");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const x of fs.readdirSync(DIR_LISTOS)) if (x.startsWith(`${id}-`) && /-v\d+\.jpg$/.test(x)) fs.rmSync(path.join(DIR_LISTOS, x));
  const { s, base } = await servidorTemporal();
  const nav = await abrirNavegador();
  const hechos = [];
  try {
    for (const [k, f] of formatos.entries()) {
      await conMedida(id, f, async () => {
        avisar({ paso: "render", progreso: k / formatos.length, msg: `Preparando imágenes en ${f}…` });
        await prepararHistoria(id, (a) => avisar({ ...a, paso: "render" }), { formato: f });
        const pag = await abrirPagina(nav, base, { ...P.leer(id, "proyecto.json"), formato: f }, FORMATOS[f]);
        for (const [i, te] of t.escenas.entries()) {
          const momento = Math.min(te.fin - 0.05, te.ini + 1.8); // ya entró todo
          const [b64] = await pag.evaluate(([x]) => window.__frames(x, 1, 0, 0.95), [momento]);
          const nombre = `${id}-${sufijo(f)}-v${i + 1}.jpg`;
          fs.writeFileSync(path.join(dir, nombre), Buffer.from(b64, "base64"));
          fs.copyFileSync(path.join(dir, nombre), path.join(DIR_LISTOS, nombre));
          hechos.push(nombre);
          avisar({ paso: "render", progreso: (k + (i + 1) / t.escenas.length) / formatos.length, msg: `Imagen ${i + 1} de ${t.escenas.length} en ${f}` });
        }
        await pag.close();
      });
    }
  } finally { await nav.close(); s.close(); }
  // portada (para el panel y la lista) y texto para subir
  fs.copyFileSync(path.join(dir, hechos[0]), path.join(P.dirProyecto(id), "portada.jpg"));
  fs.writeFileSync(path.join(DIR_LISTOS, `${id}-anuncio.txt`), textoAnuncio(g));
  return { imagenes: hechos.length, archivos: hechos };
}

// anuncios de video: el mismo video en cada medida (listos/<id>-9x16.mp4, -4x5, -1x1)
export async function renderMedidas(id, avisar = () => {}, formatos) {
  const p = P.leer(id, "proyecto.json");
  formatos ||= medidasDe(p);
  const hechos = [];
  for (const [k, f] of formatos.entries()) {
    await conMedida(id, f, () => render(id, (a) => avisar({ ...a, msg: `[${f}] ${a.msg || ""}`, progreso: (k + (a.progreso || 0)) / formatos.length })));
    hechos.push(`listos/${id}-${sufijo(f)}.mp4`);
  }
  // el final.mp4 del proyecto queda en la medida principal
  const principal = path.join(DIR_LISTOS, `${id}-${sufijo(p.formato)}.mp4`);
  if (fs.existsSync(principal)) fs.copyFileSync(principal, path.join(P.dirProyecto(id), "final.mp4"));
  fs.writeFileSync(path.join(DIR_LISTOS, `${id}-anuncio.txt`), textoAnuncio(P.leer(id, "guion.json")));
  return { videos: hechos };
}

export function textoAnuncio(g) {
  const s = g?.subir || {}, a = g?.anuncio || {};
  return [s.titulo && `TÍTULO: ${s.titulo}`, a.textoPrincipal && `TEXTO PRINCIPAL:\n${a.textoPrincipal}`, a.titular && `TITULAR: ${a.titular}`,
    a.descripcion && `DESCRIPCIÓN: ${a.descripcion}`, a.boton && `BOTÓN: ${a.boton}`, s.descripcion && `\n${s.descripcion}`, s.hashtags?.length && s.hashtags.join(" ")]
    .filter(Boolean).join("\n");
}

export function listarExportadas(id) {
  const d = path.join(P.dirProyecto(id), "anuncios");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => /\.jpg$/.test(x)).sort() : [];
}

// ---- la puerta del cerebro ----
// brief = { idea | brief, nicho?, producto?: { nombre, beneficios, precio, oferta, fotos: [url|dataURI] },
//           plantillas?: [..], tipo?: "imagen"|"video", medidas?: "todas"|"esta", formato?, paleta?, variaciones?, guion?, hacer? }
export async function crearDesdeBrief(b, { escribirGuion } = {}) {
  const idea = String(b.idea || b.brief || "").trim();
  if (!idea && !b.guion) throw new Error("Falta el brief (idea).");
  const plantillas = (b.plantillas?.length ? b.plantillas : [b.plantilla || "oferta"]).filter((x) => PLANTILLAS.includes(x));
  if (!plantillas.length) throw new Error(`Plantillas válidas: ${PLANTILLAS.join(", ")}`);
  const creados = [];
  for (const pl of plantillas) {
    const opciones = { tipo: b.tipo === "video" ? "video" : "imagen", plantilla: pl, paleta: b.paleta || "crema", medidas: b.medidas === "esta" ? "esta" : "todas" };
    const p = P.crearProyecto({ estilo: "anuncios", titulo: `${b.producto?.nombre || idea.slice(0, 40)} · ${pl}`, idea: [idea, b.producto && `Producto: ${JSON.stringify(b.producto)}`, b.variaciones && `Variaciones: ${b.variaciones}`].filter(Boolean).join("\n"),
      formato: b.formato || "9:16", conVoz: opciones.tipo === "video", opciones });
    const q = P.leer(p.id, "proyecto.json");
    if (b.nicho) q.nicho = b.nicho;
    if (b.canal) q.canal = b.canal;
    q.desdeCerebro = { fecha: new Date().toISOString(), ref: b.ref || null };
    P.guardar(p.id, "proyecto.json", q);
    // fotos del producto (urls públicas o data URI) → referencia para APIMart
    for (const [k, f] of (b.producto?.fotos || []).slice(0, 6).entries()) {
      try {
        const d = path.join(P.dirProyecto(p.id), "producto"); fs.mkdirSync(d, { recursive: true });
        let buf, ext = ".jpg";
        if (/^data:image\/(\w+);base64,/.test(f)) { ext = "." + f.match(/^data:image\/(\w+)/)[1].replace("jpeg", "jpg"); buf = Buffer.from(f.split(",")[1], "base64"); }
        else { const r = await fetch(f, { signal: AbortSignal.timeout(30000) }); if (!r.ok) continue; buf = Buffer.from(await r.arrayBuffer()); ext = /png/.test(r.headers.get("content-type") || "") ? ".png" : ".jpg"; }
        fs.writeFileSync(path.join(d, `foto-${k + 1}${ext}`), buf);
      } catch {}
    }
    if (b.guion) { P.guardar(p.id, "guion.json", b.guion); P.marcar(p.id, "guion", "listo"); }
    else if (escribirGuion) {
      try { const g = await escribirGuion(P.leer(p.id, "proyecto.json")); P.guardar(p.id, "guion.json", g); P.marcar(p.id, "guion", "listo"); }
      catch (e) { console.warn("Anuncio sin guion:", e.message); }
    }
    creados.push({ id: p.id, plantilla: pl, conGuion: P.existe(p.id, "guion.json") });
  }
  return { creados };
}
