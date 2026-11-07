// Miniaturas de YouTube.
//  1. ESTUDIAR: junta las miniaturas de los videos que mejor van en el nicho (Apify, o enlaces que tú pegues),
//     las baja a investigacion/miniaturas/<estilo>/ref/ y saca una "receta" (qué tienen en común: cuántas palabras,
//     dónde va el texto, colores, qué figura domina, qué evitan). La receta se guarda en receta.json.
//  2. CREAR: para un video, saca 3 opciones de 1280x720 (A, B, C) con texto grande, usando la receta.
//     El fondo sale de las escenas del propio video (gratis) o, si lo pides, de una imagen nueva de APIMart.
// Las miniaturas de otras cuentas son solo referencia: nunca se copian imágenes ni frases.
import fs from "node:fs";
import path from "node:path";
import { CFG, RAIZ, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, textoEscena } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { claude, pedir, jsonDe } from "./llm.js";
import { generarImagen, hayAPIMart } from "./apimart.js";
import { abrirNavegador } from "./render.js";
import { ffmpeg } from "./ff.js";

const DIR_MINI = path.join(RAIZ, "investigacion", "miniaturas");
export const dirRef = (estilo) => path.join(DIR_MINI, estilo);
export const dirMiniProyecto = (id) => path.join(dirProyecto(id), "miniaturas");
const FUENTES = path.join(RAIZ, "estilos", "_comun", "fuentes");
const W = 1280, H = 720;
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const leerJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };

// ---------------- receta ----------------
const RECETA_BASE = {
  palabras: { min: 2, max: 4 }, mayusculas: true, textoPosicion: "izquierda", tema: "oscuro",
  colorTexto: "#FFFFFF", colorAcento: "#F2C14E", paleta: [], sujeto: "", fondo: "", evitar: [],
};
const POSICIONES = ["izquierda", "derecha", "centro", "abajo"];
const hex = (c, def) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : def);

function normalizarReceta(r = {}) {
  const b = RECETA_BASE;
  return {
    palabras: { min: Math.max(1, +r.palabras?.min || b.palabras.min), max: Math.min(6, +r.palabras?.max || b.palabras.max) },
    mayusculas: r.mayusculas !== false,
    textoPosicion: POSICIONES.includes(r.textoPosicion) ? r.textoPosicion : b.textoPosicion,
    tema: r.tema === "claro" ? "claro" : "oscuro",
    colorTexto: hex(r.colorTexto, b.colorTexto), colorAcento: hex(r.colorAcento, b.colorAcento),
    paleta: (r.paleta || []).filter((c) => hex(c, null)).slice(0, 6),
    sujeto: String(r.sujeto || ""), fondo: String(r.fondo || ""), evitar: (r.evitar || []).map(String).slice(0, 8),
  };
}

export function leerReceta(estilo) {
  const j = leerJson(path.join(dirRef(estilo), "receta.json"));
  if (!j) return { estilo, sinEstudio: true, patrones: [], fuentes: [], receta: normalizarReceta() };
  return { ...j, sinEstudio: false, receta: normalizarReceta(j.receta) };
}

// ---------------- estudiar el nicho ----------------
const ID_YT = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/;
const idDeEnlace = (u) => String(u || "").match(ID_YT)?.[1] || (/^[\w-]{11}$/.test(String(u || "").trim()) ? String(u).trim() : null);
const segundos = (d) => { if (typeof d === "number") return d; const p = String(d || "").split(":").map(Number); return p.some(isNaN) || !p.length ? 0 : p.reduce((a, x) => a * 60 + x, 0); };

async function apifyYoutube(busquedas, porBusqueda, tope) {
  const url = `https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(CFG.apifyToken)}&timeout=280&maxTotalChargeUsd=${tope}`;
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(300000),
    body: JSON.stringify({ searchQueries: busquedas, maxResults: porBusqueda, maxResultsShorts: 0, maxResultStreams: 0, downloadSubtitles: false }) });
  if (!r.ok) throw new Error(`Apify (YouTube) respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function puntuarVideo(v) {
  const rebase = v.suscriptores ? v.vistas / v.suscriptores : null; // >1: el video llegó más allá de la gente que sigue al canal
  return +(Math.log10(v.vistas + 1) * (rebase ? Math.min(3, 1 + Math.log10(1 + rebase)) : 1)).toFixed(2);
}

async function bajar(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 6000 && b.length < 4.5e6 ? b : null;
  } catch { return null; }
}
async function bajarMiniatura(id, preferida) {
  for (const u of [preferida, `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`].filter(Boolean)) { const b = await bajar(u); if (b) return b; }
  return null;
}

const SISTEMA_RECETA = `Eres analista de miniaturas de YouTube. Recibes las miniaturas de los videos que mejor van en un nicho (con sus vistas) y sacas qué tienen en común, para que un diseñador haga miniaturas ORIGINALES con la misma fuerza.
Fíjate en lo medible: cuántas palabras trae el texto, si va en mayúsculas, en qué parte del cuadro, de qué color y con qué contorno; qué figura domina (rostro, estatua, paisaje, objeto), cuánto espacio vacío deja, qué paleta usa, si el fondo es claro u oscuro, qué emoción provoca, y qué NO hacen (flechas, círculos, caras exageradas, etc.).
Reglas: no copies textos de las miniaturas; descríbelos en patrones. Todo en español de México.
Responde SOLO JSON: {"patrones":["…máximo 8, cada uno concreto y accionable…"],"receta":{"palabras":{"min":2,"max":4},"mayusculas":true,"textoPosicion":"izquierda|derecha|centro|abajo","tema":"oscuro|claro","colorTexto":"#RRGGBB","colorAcento":"#RRGGBB","paleta":["#RRGGBB"],"sujeto":"qué figura domina y cómo se encuadra","fondo":"cómo es el fondo típico","evitar":["…"]}}`;

// Junta las miniaturas del nicho. enlaces: links de YouTube que Richie quiere que se estudien (van primero).
export async function investigarMiniaturas(estiloId, { enlaces = [], avisar = () => {} } = {}) {
  const estilo = leerEstilo(estiloId);
  if (!estilo) throw new Error(`No existe el estilo «${estiloId}».`);
  const dir = dirRef(estiloId), ref = path.join(dir, "ref");
  fs.rmSync(ref, { recursive: true, force: true }); fs.mkdirSync(ref, { recursive: true });
  const archivoEnlaces = path.join(dir, "enlaces.txt");
  const manuales = [...new Set([...enlaces, ...(fs.existsSync(archivoEnlaces) ? fs.readFileSync(archivoEnlaces, "utf8").split(/\s+/) : [])].map(idDeEnlace).filter(Boolean))];
  const busquedas = estilo.miniaturas?.busquedas || [];
  let candidatos = [], aviso = "";

  avisar({ progreso: 0.05, msg: "Buscando videos del nicho en YouTube…" });
  if (CFG.apifyToken && busquedas.length) {
    try {
      const items = await apifyYoutube(busquedas, 12, 0.4);
      candidatos = items.map((x) => ({
        id: x.id || idDeEnlace(x.url), titulo: x.title || "", canal: x.channelName || x.channel || "", url: x.url || `https://www.youtube.com/watch?v=${x.id}`,
        vistas: Number(x.viewCount ?? x.views ?? 0), suscriptores: Number(x.numberOfSubscribers ?? x.subscribers ?? 0), duracion: segundos(x.duration), fecha: x.date || null,
        miniatura: x.thumbnailUrl || null,
      })).filter((v) => v.id && v.duracion >= 180).map((v) => ({ ...v, puntaje: puntuarVideo(v) }));
      const vistos = new Set(); candidatos = candidatos.filter((v) => !vistos.has(v.id) && vistos.add(v.id)).sort((a, b) => b.puntaje - a.puntaje);
    } catch (e) { aviso = e.message; }
  } else aviso = CFG.apifyToken ? "El estilo no tiene búsquedas (estilo.json → miniaturas.busquedas)." : "Sin APIFY_TOKEN no puedo buscar solo.";
  for (const id of manuales.slice().reverse()) {
    const ya = candidatos.find((v) => v.id === id);
    if (ya) { candidatos = [ya, ...candidatos.filter((v) => v !== ya)]; continue; }
    candidatos.unshift({ id, titulo: "", canal: "", url: `https://www.youtube.com/watch?v=${id}`, vistas: 0, suscriptores: 0, duracion: 0, manual: true, miniatura: null, puntaje: 0 });
  }
  if (!candidatos.length) throw new Error(`No hay videos que estudiar. ${aviso} Pega enlaces de videos que te gusten (o ponlos en investigacion/miniaturas/${estiloId}/enlaces.txt).`);

  avisar({ progreso: 0.25, msg: `Bajando las miniaturas (${Math.min(candidatos.length, 12)})…` });
  const guardados = [];
  for (const v of candidatos.slice(0, 16)) {
    if (guardados.length >= 12) break;
    const b = await bajarMiniatura(v.id, v.miniatura);
    if (!b) continue;
    const n = String(guardados.length + 1).padStart(2, "0");
    fs.writeFileSync(path.join(ref, `${n}.jpg`), b);
    guardados.push({ n: guardados.length + 1, archivo: `ref/${n}.jpg`, ...v });
  }
  if (!guardados.length) throw new Error("No pude bajar ninguna miniatura (¿hay internet desde aquí?).");
  fs.writeFileSync(path.join(dir, "candidatos.json"), JSON.stringify({ fecha: new Date().toISOString(), aviso, videos: guardados }, null, 2));

  if (!CFG.anthropicKey) {
    avisar({ progreso: 1, msg: "Miniaturas bajadas. Falta la receta: pídele a Claude Code que las mire (no hay ANTHROPIC_API_KEY)." });
    return { videos: guardados.length, pendiente: true, aviso };
  }
  avisar({ progreso: 0.55, msg: "Claude está mirando las miniaturas…" });
  const contenido = [{ type: "text", text: `Nicho: ${estilo.nombre}. ${estilo.descripcion}\nMiniaturas ordenadas de mejor a peor desempeño:\n` +
    JSON.stringify(guardados.map((v) => ({ n: v.n, titulo: v.titulo, canal: v.canal, vistas: v.vistas || undefined, suscriptores: v.suscriptores || undefined })), null, 1) }];
  for (const v of guardados) contenido.push({ type: "text", text: `Miniatura n=${v.n}` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(path.join(dir, v.archivo)).toString("base64") } });
  contenido.push({ type: "text", text: "Analiza y responde el JSON." });
  const j = jsonDe((await claude(SISTEMA_RECETA, contenido, { maxTokens: 4000 })).texto);
  guardarReceta(estiloId, j, guardados);
  avisar({ progreso: 1, msg: `Listo: receta de miniaturas con ${guardados.length} referencias.` });
  return { videos: guardados.length, patrones: (j.patrones || []).length };
}

// la usa también Claude Code cuando mira las imágenes de ref/ y escribe la receta él mismo
export function guardarReceta(estiloId, j, videos) {
  const dir = dirRef(estiloId); fs.mkdirSync(dir, { recursive: true });
  const fuentes = (videos || leerJson(path.join(dir, "candidatos.json"), {}).videos || []).map((v) => ({ n: v.n, titulo: v.titulo, canal: v.canal, url: v.url, vistas: v.vistas }));
  const salida = { fecha: new Date().toISOString(), estilo: estiloId, fuentes, patrones: (j.patrones || []).map(String).slice(0, 10), receta: normalizarReceta(j.receta) };
  fs.writeFileSync(path.join(dir, "receta.json"), JSON.stringify(salida, null, 2));
  return salida;
}

// ---------------- concepto: qué dice la miniatura y qué imagen lleva ----------------
const PARAS = new Set("de la el los las en y que por para un una con a del al se tu su lo es o como mas".split(" "));
const sinTildes = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function conceptoDeTitulo(guion, nEscenas, receta) {
  // si el título trae ":" lo de antes suele ser el tema ("Paz en el Tao: …"); si cabe, va completo
  const titulo = String(guion.titulo || "");
  const tema = titulo.split(/[:|—–-]/)[0].replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const todas = titulo.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  let pal = tema.length >= 2 && tema.length <= receta.palabras.max + 1 ? tema : todas.filter((p) => !PARAS.has(sinTildes(p.toLowerCase())) && p.length <= 14).slice(0, receta.palabras.max);
  if (pal.length < 2) pal = todas.slice(0, receta.palabras.max);
  const base = pal.map((p) => (receta.mayusculas ? p.toUpperCase() : p));
  const mitad = Math.ceil(base.length / 2);
  const lineas = base.length > 2 ? [base.slice(0, mitad).join(" "), base.slice(mitad).join(" ")] : base;
  const pasos = [1, Math.round(nEscenas / 3) || 1, Math.round((2 * nEscenas) / 3) || 1];
  return pasos.map((escena, i) => ({ lineas, acento: lineas.length - 1, escena: Math.max(1, Math.min(nEscenas, escena)), promptFondo: "", nota: i ? "" : "texto sacado del título" }));
}

async function concepto(id, receta, estilo, guion) {
  const nEsc = guion.escenas.length;
  const mano = leerJson(path.join(dirProyecto(id), "miniatura.json"));
  if (mano?.opciones?.length) return { origen: "miniatura.json", opciones: mano.opciones.slice(0, 3) };
  if (!CFG.anthropicKey && !CFG.geminiKey) return { origen: "título", opciones: conceptoDeTitulo(guion, nEsc, receta) };
  const resumen = guion.escenas.map((e, k) => `${k + 1}${e.capitulo ? ` [CAPÍTULO: ${e.capitulo}]` : ""}: ${textoEscena(e).slice(0, 90)}`).slice(0, 70).join("\n");
  const sistema = `Diseñas el CONTENIDO de miniaturas de YouTube para un canal en español de México (${estilo.nombre}: ${estilo.descripcion}).
Receta del nicho (patrones de miniaturas que funcionan): ${JSON.stringify(leerReceta(estilo.id).patrones)}. Ajustes: ${JSON.stringify(receta)}.
Reglas: el texto de la miniatura tiene ${receta.palabras.min} a ${receta.palabras.max} palabras EN TOTAL, repartidas en 1 a 3 líneas de máximo 14 letras cada una, ${receta.mayusculas ? "en MAYÚSCULAS" : "en minúsculas o frase"}; provoca curiosidad o emoción pero DICE LA VERDAD de lo que trata el video (nada de engañar); complementa el título en vez de repetirlo; nunca copies frases de otros canales. "escena" es el número de la escena del guion cuya imagen mejor funciona de fondo (una figura clara y con espacio libre). "promptFondo" es el prompt en inglés para generar un fondo NUEVO: estilo "${estilo.estiloVisual || ""}", 16:9, un solo sujeto fuerte, alto contraste, espacio vacío en el lado donde va el texto, sin letras ni marcas de agua.
Da 3 opciones DISTINTAS de texto y de escena. Responde SOLO JSON: {"opciones":[{"lineas":["…"],"acento":0,"escena":1,"promptFondo":"…"}]} (acento = índice de la línea que va en color de énfasis).`;
  const texto = `Título del video: ${guion.titulo || ""}\nEscenas:\n${resumen}`;
  const j = jsonDe((await pedir(sistema, texto, { maxTokens: 3000 })).texto);
  const opciones = (j.opciones || []).slice(0, 3).map((o) => ({ ...o, escena: Math.max(1, Math.min(nEsc, +o.escena || 1)) })).filter((o) => o.lineas?.length);
  if (!opciones.length) return { origen: "título", opciones: conceptoDeTitulo(guion, nEsc, receta) };
  return { origen: "IA", opciones };
}

// ---------------- fondo ----------------
export async function imagenDeEscena(id, n, tmp) {
  const dir = dirProyecto(id), info = leer(id, path.join("clips", "historia.json")) || [];
  for (let k = n - 1; k >= 0; k--) {
    const e = info[k]; if (!e?.archivo) continue;
    const f = path.isAbsolute(e.archivo) ? e.archivo : path.join(dir, e.archivo);
    if (!fs.existsSync(f)) continue;
    if (e.tipo !== "video" && /\.(jpe?g|png|webp)$/i.test(f)) return f;
    const sal = path.join(tmp, `frame-${n}.jpg`);
    if (/\.(mp4|mov|webm)$/i.test(f)) { await ffmpeg(["-ss", "1", "-i", f, "-frames:v", "1", "-q:v", "2", sal]); return sal; }
  }
  return null;
}

// ---------------- dibujo ----------------
const DISENOS = {
  izquierda: { caja: "left:64px;top:50%;transform:translateY(-50%);width:700px;max-height:580px;align-items:flex-start;text-align:left", scrim: "linear-gradient(90deg,S .88 0%,S .62 38%,S 0 72%)" },
  derecha: { caja: "right:64px;top:50%;transform:translateY(-50%);width:700px;max-height:580px;align-items:flex-end;text-align:right", scrim: "linear-gradient(270deg,S .88 0%,S .62 38%,S 0 72%)" },
  abajo: { caja: "left:64px;bottom:70px;width:900px;max-height:400px;align-items:flex-start;text-align:left", scrim: "linear-gradient(0deg,S .9 0%,S .55 36%,S 0 66%)" },
  centro: { caja: "left:50%;top:50%;transform:translate(-50%,-50%);width:1000px;max-height:540px;align-items:center;text-align:center", scrim: "radial-gradient(ellipse at center,S .72 0%,S .4 48%,S 0 82%)" },
};

function ordenDeDisenos(pref) {
  const resto = ["izquierda", "abajo", "centro", "derecha"].filter((x) => x !== pref);
  return [pref, ...resto].slice(0, 3);
}

function htmlMiniatura({ fondo, lineas, acento, diseno, receta }) {
  const d = DISENOS[diseno], claro = receta.tema === "claro";
  const S = claro ? "rgba(244,238,223," : "rgba(8,11,16,";
  const scrim = d.scrim.replace(/S ([\d.]+)/g, (_, a) => `${S}${a})`);
  const txt = claro ? "#17130E" : receta.colorTexto, contorno = claro ? "#F4EEDF" : "#0B0E13";
  const fuente = fs.readFileSync(path.join(FUENTES, "montserrat-latin-800-normal.woff2")).toString("base64");
  const bg = fondo ? `url('data:image/jpeg;base64,${fs.readFileSync(fondo).toString("base64")}')` : "linear-gradient(135deg,#2a3340,#0e1319)";
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:800;src:url(data:font/woff2;base64,${fuente}) format("woff2")}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
#bg{position:absolute;inset:0;background:${bg} center/cover;filter:saturate(1.12) contrast(1.08)}
#sc{position:absolute;inset:0;background:${scrim}}
#caja{position:absolute;display:flex;flex-direction:column;justify-content:center;${d.caja}}
.l{font:800 100px/0.98 M,sans-serif;letter-spacing:-0.02em;white-space:nowrap;color:${txt};
  -webkit-text-stroke:12px ${contorno};paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.35)}
.l.a{color:${receta.colorAcento}}
</style><div id="bg"></div><div id="sc"></div><div id="caja">${lineas.map((t, i) => `<div class="l${i === acento ? " a" : ""}">${esc(t)}</div>`).join("")}</div>
<script>
document.fonts.load("800 100px M").then(()=>{
  const caja=document.getElementById("caja"),ls=[...caja.children],maxW=caja.clientWidth,maxH=parseFloat(getComputedStyle(caja).maxHeight);
  for(const l of ls){let s=300;l.style.fontSize=s+"px";while(l.scrollWidth>maxW&&s>40){s-=4;l.style.fontSize=s+"px"}}
  let alto=ls.reduce((a,l)=>a+l.getBoundingClientRect().height,0);
  if(alto>maxH){const f=maxH/alto;for(const l of ls)l.style.fontSize=(parseFloat(l.style.fontSize)*f)+"px"}
  document.body.dataset.listo="1";
});
</script>`;
}

async function dibujar(nav, html, salida) {
  const pag = await nav.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await pag.setContent(html, { waitUntil: "load" });
    await pag.waitForSelector("body[data-listo]", { timeout: 15000 });
    for (const q of [90, 82, 72]) { // YouTube acepta hasta 2 MB
      await pag.screenshot({ path: salida, type: "jpeg", quality: q });
      if (fs.statSync(salida).size < 1.9e6) break;
    }
  } finally { await pag.close(); }
}

// ---------------- crear las 3 opciones de un video ----------------
export async function crearMiniaturas(id, { avisar = () => {}, ia = false } = {}) {
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json");
  if (!p || !guion?.escenas?.length) throw new Error("Este video todavía no tiene guion.");
  const estilo = leerEstilo(p.estilo);
  const { receta, sinEstudio } = leerReceta(p.estilo);
  if (ia && !hayAPIMart()) throw new Error("Para generar fondos nuevos falta APIMART_API_KEY en el .env. Sin eso uso las imágenes del propio video.");
  const dir = dirMiniProyecto(id), tmp = path.join(dir, "_tmp");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });

  avisar({ paso: "render", progreso: 0.05, msg: "Pensando qué dice cada miniatura…" });
  const con = await concepto(id, receta, { ...estilo, id: p.estilo }, guion);
  const disenos = ordenDeDisenos(receta.textoPosicion);
  const nav = await abrirNavegador();
  const opciones = [];
  try {
    for (const [i, o] of con.opciones.entries()) {
      const letra = "ABC"[i];
      avisar({ paso: "render", progreso: 0.15 + (0.7 * i) / con.opciones.length, msg: `Miniatura ${letra}…` });
      let fondo = null, origen = "escena";
      if (ia && o.promptFondo) {
        const r = await generarImagen(`${o.promptFondo}. Leave the ${disenos[i] === "derecha" ? "right" : disenos[i] === "centro" ? "edges" : "left"} third calm and uncluttered. No text, no letters, no watermark.`, { size: "16:9" });
        fondo = path.join(dir, `fondo-${letra}${r.ext}`); fs.writeFileSync(fondo, r.bytes); origen = "ia";
      } else fondo = await imagenDeEscena(id, o.escena, tmp);
      const lineas = (o.lineas || []).slice(0, 3).map((t) => (receta.mayusculas ? String(t).toUpperCase() : String(t)));
      const archivo = `miniatura-${letra}.jpg`;
      await dibujar(nav, htmlMiniatura({ fondo, lineas, acento: Math.min(Math.max(0, +o.acento || 0), lineas.length - 1), diseno: disenos[i], receta }), path.join(dir, archivo));
      opciones.push({ letra, archivo, lineas, escena: o.escena, fondo: origen, diseno: disenos[i], conFondo: !!fondo });
    }
    // comparativa: así se verán en la página principal (grande) y en la barra lateral (chica)
    const datos = opciones.map((o) => `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, o.archivo)).toString("base64")}`);
    const grande = datos.map((u) => `<img src="${u}" width="420" height="236">`).join("");
    const chica = datos.map((u) => `<img src="${u}" width="168" height="94">`).join("");
    const pag = await nav.newPage({ viewport: { width: 1320, height: 400 } });
    await pag.setContent(`<body style="margin:0;background:#0f0f0f;padding:12px"><div style="display:flex;gap:12px">${grande}</div><div style="display:flex;gap:12px;margin-top:14px">${chica}</div></body>`, { waitUntil: "load" });
    await pag.screenshot({ path: path.join(dir, "comparativa.jpg"), type: "jpeg", quality: 88 });
    await pag.close();
  } finally { await nav.close(); fs.rmSync(tmp, { recursive: true, force: true }); }

  const info = { fecha: new Date().toISOString(), origen: con.origen, sinEstudio: !!sinEstudio, opciones, elegida: null };
  fs.writeFileSync(path.join(dir, "miniaturas.json"), JSON.stringify(info, null, 2));
  usarMiniatura(id, "A", info);
  avisar({ paso: "render", progreso: 1, msg: "Miniaturas listas." });
  return info;
}

// la elegida se copia a la carpeta del video y a listos/ (con espejo se va al VPS)
export function usarMiniatura(id, letra, info = null) {
  const dir = dirMiniProyecto(id);
  info = info || leerJson(path.join(dir, "miniaturas.json"));
  const o = info?.opciones?.find((x) => x.letra === letra);
  if (!o) throw new Error("Esa miniatura no existe. Créalas primero.");
  fs.copyFileSync(path.join(dir, o.archivo), path.join(dirProyecto(id), "miniatura-youtube.jpg"));
  fs.copyFileSync(path.join(dir, o.archivo), path.join(DIR_LISTOS, `${id}-miniatura.jpg`));
  info.elegida = letra;
  fs.writeFileSync(path.join(dir, "miniaturas.json"), JSON.stringify(info, null, 2));
  return info;
}

export const leerMiniaturas = (id) => leerJson(path.join(dirMiniProyecto(id), "miniaturas.json"));
