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
const archivoFuente = (receta) => (receta?.fuente === "moderna" ? "montserrat-latin-800-normal.woff2" : "cinzel-latin-800-normal.woff2");
const W = 1280, H = 720;
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const leerJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };

// ---------------- receta ----------------
const RECETA_BASE = {
  palabras: { min: 2, max: 4 }, mayusculas: true, textoPosicion: "izquierda", tema: "oscuro",
  colorTexto: "#FFFFFF", colorAcento: "#F2C14E", paleta: [], sujeto: "", fondo: "", evitar: [],
  fuente: "romana", pincel: true,
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
    fuente: r.fuente === "moderna" ? "moderna" : "romana", pincel: r.pincel !== false,
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
  // el guion puede traer su miniatura (la escribe quien escribe el guion): "miniatura": { "lineas": [...], "acento": 1, "escena": 3 } o una lista de 3
  const delGuion = [].concat(guion.miniatura || []).filter((o) => o?.lineas?.length);
  if (delGuion.length) {
    const pasos = [1, Math.round(nEsc / 3) || 1, Math.round((2 * nEsc) / 3) || 1];
    return { origen: "guion", opciones: [0, 1, 2].map((i) => { const o = delGuion[i] || delGuion[0]; return { lineas: o.lineas, acento: o.acento ?? o.lineas.length - 1, escena: Math.max(1, Math.min(nEsc, +(delGuion[i]?.escena || (i ? pasos[i] : o.escena) || 1))) }; }) };
  }
  if (!CFG.anthropicKey && !CFG.geminiKey) return { origen: "título", opciones: conceptoDeTitulo(guion, nEsc, receta) };
  const resumen = guion.escenas.map((e, k) => `${k + 1}${e.capitulo ? ` [CAPÍTULO: ${e.capitulo}]` : ""}: ${textoEscena(e).slice(0, 90)}`).slice(0, 70).join("\n");
  const sistema = `Diseñas el CONTENIDO de miniaturas de YouTube para un canal en español de México (${estilo.nombre}: ${estilo.descripcion}).
Receta del nicho (patrones de miniaturas que funcionan): ${JSON.stringify(leerReceta(estilo.id).patrones)}. Ajustes: ${JSON.stringify(receta)}.
Reglas: el texto de la miniatura tiene ${receta.palabras.min} a ${receta.palabras.max} palabras EN TOTAL, repartidas en 2 o 3 líneas de máximo 10 letras cada una (las palabras chicas como LA/EL/DE pueden ir solas arriba), con ortografía perfecta (revisa letra por letra, con acentos), ${receta.mayusculas ? "en MAYÚSCULAS" : "en minúsculas o frase"}; provoca curiosidad o emoción pero DICE LA VERDAD de lo que trata el video (nada de engañar); complementa el título en vez de repetirlo; nunca copies frases de otros canales. "escena" es el número de la escena del guion cuya imagen mejor funciona de fondo (una figura clara y con espacio libre). "promptFondo" es el prompt en inglés para generar un fondo NUEVO: estilo "${estilo.estiloVisual || ""}", 16:9, un solo sujeto fuerte, alto contraste, espacio vacío en el lado donde va el texto, sin letras ni marcas de agua.
Criterio del texto (lo más importante): ${CRITERIO_TEXTO.join(" ")}\nPara la escena prefiere una figura humana con el rostro grande y la emoción visible (ojos cerrados en paz, tensión, tristeza) o una silueta dramática a contraluz.\nDa 3 opciones DISTINTAS de texto y de escena. Responde SOLO JSON: {"opciones":[{"lineas":["…"],"acento":0,"escena":1,"angulo":"dolor|contradicción|promesa","porque":"una frase: qué siente el espectador al leerlo","promptFondo":"…"}]} (acento = índice de la línea que va en color de énfasis).`;
  const texto = `Título del video: ${guion.titulo || ""}\nEscenas:\n${resumen}`;
  const j = jsonDe((await pedir(sistema, texto, { maxTokens: 3000 })).texto);
  const opciones = (j.opciones || []).slice(0, 3).map((o) => ({ ...o, escena: Math.max(1, Math.min(nEsc, +o.escena || 1)) })).filter((o) => o.lineas?.length);
  if (!opciones.length) return { origen: "título", opciones: conceptoDeTitulo(guion, nEsc, receta) };
  return { origen: "IA", opciones };
}

// ---------------- fondo ----------------
// La imagen de la escena n (o la más cercana). Se busca por varias vías porque historia.json puede traer rutas de
// otra máquina (la laptop, C:\\Users\\…) o de banco/: 1) lo que dice historia.json, 2) clips/escena-N.*,
// 3) cualquier imagen de clips/, 4) un cuadro del video terminado en el punto de esa escena.
const IMG = /\.(jpe?g|png|webp)$/i, VID = /\.(mp4|mov|webm)$/i;
async function cuadroDe(video, seg, sal) {
  try { await ffmpeg(["-y", "-ss", String(Math.max(0, seg)), "-i", video, "-frames:v", "1", "-q:v", "2", sal]); return fs.existsSync(sal) ? sal : null; } catch { return null; }
}
export async function imagenDeEscena(id, n, tmp) {
  const dir = dirProyecto(id), clips = path.join(dir, "clips");
  const info = leer(id, path.join("clips", "historia.json")) || [];
  const enClips = fs.existsSync(clips) ? fs.readdirSync(clips) : [];
  const total = Math.max(info.length, n);
  const candidatos = (k) => {
    const r = [], e = info[k - 1];
    if (e?.archivo) {
      const a = String(e.archivo), base = a.split(/[\\/]/).pop();
      if (path.isAbsolute(a) && !/^[A-Za-z]:/.test(a)) r.push(a);
      r.push(path.join(dir, a.replace(/\\/g, "/")), path.join(clips, base), path.join(RAIZ, "banco", ...a.replace(/\\/g, "/").split("/").slice(-2)));
    }
    for (const x of enClips) if (x.startsWith(`escena-${k}.`)) r.push(path.join(clips, x));
    return r.filter((f) => !/^[A-Za-z]:/.test(f) && fs.existsSync(f));
  };
  // la escena pedida, luego hacia atrás y luego hacia adelante; primero imágenes (más limpias que un cuadro de video)
  const orden = [n]; for (let d = 1; d < total; d++) { if (n - d >= 1) orden.push(n - d); if (n + d <= total) orden.push(n + d); }
  for (const soloImg of [true, false]) for (const k of orden) for (const f of candidatos(k)) {
    if (IMG.test(f)) return f;
    if (!soloImg && VID.test(f)) { const c = await cuadroDe(f, 1, path.join(tmp, `frame-${n}.jpg`)); if (c) return c; }
  }
  const otra = enClips.find((x) => IMG.test(x) && !/^cuadro-|personajes/.test(x));
  if (otra) return path.join(clips, otra);
  // último recurso: un cuadro del video terminado, en el punto de esa escena
  const fin = path.join(dir, "final.mp4");
  if (fs.existsSync(fin)) {
    const t = leer(id, "tiempos.json");
    const e = t?.escenas?.[n - 1], seg = e ? (e.ini + Math.min(e.fin, e.ini + 6)) / 2 : t?.duracion ? (t.duracion * (n - 0.5)) / total : 5;
    return cuadroDe(fin, seg, path.join(tmp, `final-${n}.jpg`));
  }
  return null;
}

// ---------------- prompt para generarla fuera (Nano Banana, ChatGPT, Midjourney…) ----------------
// Describe la miniatura completa: formato, sujeto, composición, luz, colores, texto exacto y tipografía.
export function promptExterno({ estilo = {}, guion = {}, o = {}, receta = RECETA_BASE, lado = "derecha" }) {
  // Estilo que mejor ha funcionado (nov 2026): pintura cinematográfica épica, contraluz dorado, una escena que cuenta la
  // idea con 1-2 elementos (sujeto + símbolo), letra romana enorme con el acento en oro y una pincelada de tinta detrás.
  const esc2 = guion.escenas?.[Math.max(0, (+o.escena || 1) - 1)] || {};
  const sujeto = (o.promptFondo || esc2.flowPrompt || receta.sujeto || "a single strong central figure").replace(/\s+/g, " ").trim();
  const lineas = (o.lineas || []).map(String), ac = Math.min(Math.max(0, +o.acento || 0), Math.max(0, lineas.length - 1));
  const txtLado = lado === "derecha" ? "left" : "right", figLado = lado === "derecha" ? "right" : "left";
  const texto = lineas.map((t, i) => `line ${i + 1}: "${t}" ${i === ac ? `(BIGGEST, textured metallic gold ${receta.colorAcento}, with a golden brush-stroke underline)` : "(bright white, smaller)"}`).join("; ");
  return [
    `YouTube thumbnail, 16:9 (1280x720), for a Spanish-language philosophy channel. It must read instantly at a tiny size (168x94 px) in the "suggested videos" sidebar.`,
    `SCENE: ${sujeto}. Tell the idea with ONE main subject (large, close, on the ${figLado} 45% of the frame) plus at most one symbolic element (for example a calm Buddha statue, a temple, an arrow), never more. If the subject is a person, the FACE is big (about a third of the frame) with the emotion clearly visible (eyes closed in peace, tension, sorrow); otherwise a dramatic backlit silhouette.`,
    `LOOK: warm, saturated and high-contrast (never pale, washed-out or light watercolor: it disappears next to YouTube's white background). Epic cinematic digital painting, dramatic golden-hour backlight with the sun behind the subject, warm orange-gold vs deep shadow contrast, atmospheric mist and mountains, a few red leaves floating, rich detail on the subject but a simple, darker background behind the text. ${guion.estiloVisual || estilo.estiloVisual ? `Keep a nod to the video's art style: ${guion.estiloVisual || estilo.estiloVisual}.` : ""}`,
    `TEXT (render EXACTLY, Spanish, keep accents, ${receta.mayusculas ? "ALL CAPS" : "as written"}): ${texto}. Heavy classical Roman serif typeface (like Trajan / Cinzel Black), huge: the text block covers about half of the image on the ${txtLado} side, over a rough black ink brush-stroke band that makes it pop. Thick dark outline and drop shadow. The text never covers the subject's face. No other words anywhere.`,
    `VIDEO TITLE (for context, do not write it): "${guion.titulo || ""}". TEXT CHECK: if the text above is an abstract metaphor that does not name the viewer's pain or desire behind that title, still render it exactly, but after the image suggest a more direct 2-4 word alternative in Spanish.${(o.avisos || []).length ? ` Note from the factory: ${o.avisos.join(" ")}` : ""}`,
    `AVOID: extra or misspelled words, logos, watermarks, borders, frames, tiny details near the text, multiple people, cluttered composition${receta.evitar.length ? ", " + receta.evitar.join(", ") : ""}.`,
  ].join("\n");
}

// ---------------- dibujo ----------------
const DISENOS = {
  izquierda: { caja: "left:64px;top:50%;transform:translateY(-50%);width:700px;max-height:580px;align-items:flex-start;text-align:left", scrim: "linear-gradient(90deg,S .88 0%,S .62 38%,S 0 72%)" },
  derecha: { caja: "right:64px;top:50%;transform:translateY(-50%);width:700px;max-height:580px;align-items:flex-end;text-align:right", scrim: "linear-gradient(270deg,S .88 0%,S .62 38%,S 0 72%)" },
  abajo: { caja: "left:64px;bottom:70px;width:900px;max-height:400px;align-items:flex-start;text-align:left", scrim: "linear-gradient(0deg,S .9 0%,S .55 36%,S 0 66%)" },
  centro: { caja: "left:50%;top:50%;transform:translate(-50%,-50%);width:1000px;max-height:540px;align-items:center;text-align:center", scrim: "radial-gradient(ellipse at center,S .72 0%,S .4 48%,S 0 82%)" },
};

function ordenDeDisenos(pref) {
  // A y B llevan la figura recortada; C es la imagen completa con el texto al lado de la receta (con sombra detrás),
  // nunca encima del centro, donde suele estar la figura
  const lado = pref === "centro" || pref === "abajo" ? "izquierda" : pref;
  return [lado, lado === "izquierda" ? "derecha" : "izquierda", lado];
}

function htmlMiniatura({ fondo, lineas, acento, diseno, receta }) {
  const d = DISENOS[diseno], claro = receta.tema === "claro";
  const S = claro ? "rgba(244,238,223," : "rgba(8,11,16,";
  const scrim = d.scrim.replace(/S ([\d.]+)/g, (_, a) => `${S}${a})`);
  const txt = claro ? "#17130E" : receta.colorTexto, contorno = claro ? "#F4EEDF" : "#0B0E13";
  const fuente = fs.readFileSync(path.join(FUENTES, archivoFuente(receta))).toString("base64");
  const bg = fondo ? `url('data:image/jpeg;base64,${fs.readFileSync(fondo).toString("base64")}')` : "linear-gradient(135deg,#2a3340,#0e1319)";
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:800;src:url(data:font/woff2;base64,${fuente}) format("woff2")}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
#bg{position:absolute;inset:0;background:${bg} center/cover;filter:saturate(1.12) contrast(1.08)}
#sc{position:absolute;inset:0;background:${scrim}}
#caja{position:absolute;display:flex;flex-direction:column;justify-content:center;${d.caja}}
.l{font:800 100px/0.98 M,sans-serif;letter-spacing:-0.02em;white-space:nowrap;color:${txt};
  -webkit-text-stroke:12px ${contorno};paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.35)}
.l.a{color:${receta.colorAcento}${receta.pincel ? `;background:linear-gradient(180deg,#FFF3C4 0%,${receta.colorAcento} 42%,#B47C10 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:0;text-shadow:none;filter:drop-shadow(4px 0 0 #07090c) drop-shadow(-4px 0 0 #07090c) drop-shadow(0 4px 0 #07090c) drop-shadow(0 -4px 0 #07090c) drop-shadow(0 10px 22px rgba(0,0,0,.7))` : ""}}
#pin{position:absolute;inset:0}
</style><div id="bg"></div><div id="sc"></div><canvas id="pin"></canvas><div id="caja">${lineas.map((t, i) => `<div class="l${i === acento ? " a" : ""}">${esc(t)}</div>`).join("")}</div>
<script>
// cada línea llena el ancho; una línea de puras palabras chicas (LA, EL, DE, QUE…) va a 45 %; ninguna pasa de 1.25 veces la de acento; luego todo cabe en el alto
const CHICAS=new Set("LA EL LOS LAS DE DEL EN Y QUE TU TE SE LO UN UNA A AL POR NO".split(" "));
function ajustarTexto(ls,maxW,maxH){
  for(const l of ls){let z=360;l.style.fontSize=z+"px";while(l.scrollWidth>maxW&&z>30){z-=4;l.style.fontSize=z+"px"}
    const pal=l.textContent.trim().toUpperCase().split(/\s+/);if(ls.length>1&&pal.every((p)=>CHICAS.has(p)))l.style.fontSize=(z*0.45)+"px"}
  const a=ls.find((l)=>l.classList.contains("a"));if(a){const za=parseFloat(a.style.fontSize);for(const l of ls)if(l!==a)l.style.fontSize=Math.min(parseFloat(l.style.fontSize),za*1.25)+"px"}
  const alto=ls.reduce((s,l)=>s+l.getBoundingClientRect().height,0);
  if(alto>maxH){const f=maxH/alto;for(const l of ls)l.style.fontSize=(parseFloat(l.style.fontSize)*f)+"px"}
  if(PINCEL)pincel(ls);
}
const PINCEL=${receta.pincel ? "true" : "false"},ACENTO=${JSON.stringify(receta.colorAcento)};
function pincel(ls){
  const c=document.getElementById("pin"),W2=innerWidth,H2=innerHeight;c.width=W2;c.height=H2;const g=c.getContext("2d");
  let sem=7;const r=()=>(sem=(sem*16807)%2147483647)/2147483647;
  const x0=Math.min(...ls.map((l)=>l.getBoundingClientRect().left)),x1=Math.max(...ls.map((l)=>l.getBoundingClientRect().right));
  const y0=Math.min(...ls.map((l)=>l.getBoundingClientRect().top)),y1=Math.max(...ls.map((l)=>l.getBoundingClientRect().bottom));
  const pad=(y1-y0)*0.12;g.lineCap="round";
  for(let i=0;i<70;i++){
    const y=y0-pad+r()*(y1-y0+2*pad),a=x0-pad*(1.2+r()*2),b=x1+pad*(0.6+r()*2.2);
    g.strokeStyle="rgba(4,5,7,"+(0.18+r()*0.32)+")";g.lineWidth=(y1-y0)*(0.05+r()*0.12);
    g.beginPath();g.moveTo(a,y);g.bezierCurveTo(a+(b-a)*0.33,y+(r()-.5)*pad,a+(b-a)*0.66,y+(r()-.5)*pad,b,y+(r()-.5)*pad*0.6);g.stroke();
  }
  // cerdas sueltas en las orillas
  for(let i=0;i<60;i++){const y=y0-pad+r()*(y1-y0+2*pad),lado=r()<.5,xb=lado?x0-pad*(1.4+r()*2.4):x1+pad*(1+r()*2.4);
    g.strokeStyle="rgba(4,5,7,"+(0.2+r()*0.4)+")";g.lineWidth=1+r()*4;g.beginPath();g.moveTo(xb,y);g.lineTo(xb+(lado?1:-1)*pad*(1+r()*3),y+(r()-.5)*4);g.stroke()}
  const a=ls.find((l)=>l.classList.contains("a"));if(!a)return;
  const q=a.getBoundingClientRect(),yb=q.bottom+q.height*0.02,gr=q.height*0.09;
  const grad=g.createLinearGradient(q.left,0,q.right,0);grad.addColorStop(0,ACENTO+"00");grad.addColorStop(0.12,ACENTO);grad.addColorStop(0.85,ACENTO);grad.addColorStop(1,ACENTO+"00");
  g.fillStyle=grad;g.beginPath();g.moveTo(q.left-pad*0.3,yb+gr*0.5);
  g.quadraticCurveTo(q.left+q.width*0.5,yb-gr*0.9,q.right+pad*0.8,yb-gr*0.3);g.quadraticCurveTo(q.left+q.width*0.5,yb+gr*0.9,q.left-pad*0.3,yb+gr*0.5);g.fill();
}
</script>
<script>
document.fonts.load("800 100px M").then(()=>{
  const caja=document.getElementById("caja"),ls=[...caja.children],maxW=caja.clientWidth,maxH=parseFloat(getComputedStyle(caja).maxHeight);
  ajustarTexto(ls,maxW,maxH);
  document.body.dataset.listo="1";
});
</script>`;
}

// Diseño "recorte": la figura (estatua, monje, rostro) recortada con ISNet y en grande a un lado, con un halo del color de
// acento detrás; el resto de la imagen desenfocado y oscuro; 2-4 palabras enormes del otro lado. Es lo que más separa la
// miniatura del montón de "frase sobre estatua" y se sigue leyendo a 168 px de ancho.
function htmlRecorte({ fondo, recorte, lineas, acento, receta, lado = "derecha", ancho = W, alto = H, fuente = archivoFuente(receta), tinte = null }) {
  const f = fs.readFileSync(path.join(FUENTES, fuente)).toString("base64");
  const mime = (x) => (/\.png$/i.test(x) ? "png" : "jpeg");
  const bg = `data:image/${mime(fondo)};base64,${fs.readFileSync(fondo).toString("base64")}`;
  const fig = `data:image/png;base64,${fs.readFileSync(recorte).toString("base64")}`;
  const vertical = alto > ancho, txtLado = lado === "derecha" ? "izquierda" : "derecha";
  const caja = vertical
    ? `left:6%;right:6%;top:9%;height:30%;align-items:center;text-align:center`
    : `${txtLado === "izquierda" ? "left" : "right"}:4%;top:50%;transform:translateY(-50%);width:52%;height:86%;align-items:${txtLado === "izquierda" ? "flex-start" : "flex-end"};text-align:${txtLado === "izquierda" ? "left" : "right"}`;
  const tam = vertical ? 150 : 112;
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:F;font-weight:800;src:url(data:font/woff2;base64,${f}) format("woff2")}
*{margin:0;box-sizing:border-box}html,body{width:${ancho}px;height:${alto}px;overflow:hidden;background:#05070a}
#bg{position:absolute;inset:-40px;background:url('${bg}') center/cover;filter:blur(14px) brightness(.42) saturate(1.15)}
#tinte{position:absolute;inset:0;${tinte ? `background:${tinte};mix-blend-mode:color;opacity:.85` : "display:none"}}
#halo{position:absolute;border-radius:50%;background:radial-gradient(circle,${receta.colorAcento}99 0%,${receta.colorAcento}33 35%,transparent 68%);filter:blur(30px);opacity:.85}
#fig{position:absolute;filter:drop-shadow(0 0 2px ${receta.colorAcento}) drop-shadow(0 0 26px ${receta.colorAcento}88) drop-shadow(0 18px 30px rgba(0,0,0,.7)) contrast(1.12) brightness(1.22) saturate(1.12)}
#vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
#caja{position:absolute;display:flex;flex-direction:column;justify-content:center;${caja}}
.l{font:800 ${tam}px/0.98 F,sans-serif;letter-spacing:-0.01em;white-space:nowrap;color:${receta.colorTexto};
  -webkit-text-stroke:${vertical ? 16 : 13}px #07090c;paint-order:stroke fill;text-shadow:0 8px 24px rgba(0,0,0,.6)}
.l.a{color:${receta.colorAcento}${receta.pincel ? `;background:linear-gradient(180deg,#FFF3C4 0%,${receta.colorAcento} 42%,#B47C10 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:0;text-shadow:none;filter:drop-shadow(4px 0 0 #07090c) drop-shadow(-4px 0 0 #07090c) drop-shadow(0 4px 0 #07090c) drop-shadow(0 -4px 0 #07090c) drop-shadow(0 10px 22px rgba(0,0,0,.7))` : ""}}
#pin{position:absolute;inset:0}
</style><div id="bg"></div><div id="tinte"></div><div id="halo"></div><canvas id="fig"></canvas><div id="vig"></div>
<canvas id="pin"></canvas><div id="caja">${lineas.map((t, i) => `<div class="l${i === acento ? " a" : ""}">${esc(t)}</div>`).join("")}</div>
<script>
// cada línea llena el ancho; una línea de puras palabras chicas (LA, EL, DE, QUE…) va a 45 %; ninguna pasa de 1.25 veces la de acento; luego todo cabe en el alto
const CHICAS=new Set("LA EL LOS LAS DE DEL EN Y QUE TU TE SE LO UN UNA A AL POR NO".split(" "));
function ajustarTexto(ls,maxW,maxH){
  for(const l of ls){let z=360;l.style.fontSize=z+"px";while(l.scrollWidth>maxW&&z>30){z-=4;l.style.fontSize=z+"px"}
    const pal=l.textContent.trim().toUpperCase().split(/\s+/);if(ls.length>1&&pal.every((p)=>CHICAS.has(p)))l.style.fontSize=(z*0.45)+"px"}
  const a=ls.find((l)=>l.classList.contains("a"));if(a){const za=parseFloat(a.style.fontSize);for(const l of ls)if(l!==a)l.style.fontSize=Math.min(parseFloat(l.style.fontSize),za*1.25)+"px"}
  const alto=ls.reduce((s,l)=>s+l.getBoundingClientRect().height,0);
  if(alto>maxH){const f=maxH/alto;for(const l of ls)l.style.fontSize=(parseFloat(l.style.fontSize)*f)+"px"}
}
</script>
<script>
const W=${ancho},H=${alto},vertical=${vertical},lado=${JSON.stringify(lado)};
// la máscara guarda la FORMA (alfa); la figura se arma con la imagen de fondo recortada por esa forma
const carga=(u)=>new Promise((ok)=>{const i=new Image();i.onload=()=>ok(i);i.src=u});
(async()=>{
  const [foto,mas]=await Promise.all([carga(${JSON.stringify("BG")}),carga(${JSON.stringify("FIG")})]);
  const img=document.getElementById("fig");img.width=foto.naturalWidth;img.height=foto.naturalHeight;
  const g=img.getContext("2d");g.drawImage(foto,0,0);g.globalCompositeOperation="destination-in";g.drawImage(mas,0,0,foto.naturalWidth,foto.naturalHeight);

  // dónde está la figura dentro del recorte (alfa > 40)
  const NW=foto.naturalWidth,NH=foto.naturalHeight;
  const c=document.createElement("canvas"),k=Math.min(1,400/Math.max(NW,NH));
  c.width=Math.round(NW*k);c.height=Math.round(NH*k);
  const x=c.getContext("2d");x.drawImage(mas,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
  for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(d[(y*c.width+i)*4+3]>40){if(i<x0)x0=i;if(i>x1)x1=i;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<=x0||y1<=y0){x0=0;y0=0;x1=c.width;y1=c.height}
  const bw=(x1-x0)/k,bh=(y1-y0)/k;
  // la figura ocupa casi todo el alto (y como mucho la mitad del ancho en 16:9); se corta abajo, como un busto
  const altoObj=vertical?H*0.66:H*1.0,anchoMax=vertical?W*0.98:W*0.46;
  const s=Math.min(altoObj/bh,anchoMax/bw);
  img.style.width=NW*s+"px";img.style.height=NH*s+"px";
  const fx=vertical?(W-bw*s)/2:(lado==="derecha"?W*0.985-bw*s:W*0.015);
  const fy=vertical?H-bh*s+H*0.02:H*0.04+(H-bh*s)*0.0;
  img.style.left=(fx-x0/k*s)+"px";img.style.top=(fy-y0/k*s)+"px";
  const h=document.getElementById("halo"),hr=Math.max(bw,bh)*s*0.75;
  h.style.width=h.style.height=hr+"px";h.style.left=(fx+bw*s/2-hr/2)+"px";h.style.top=(fy+bh*s*0.3-hr/2)+"px";
  await document.fonts.load("800 100px F");
  const caja=document.getElementById("caja"),ls=[...caja.children],maxW=caja.clientWidth,maxH=caja.clientHeight||parseFloat(getComputedStyle(caja).maxHeight);
  ajustarTexto(ls,maxW,maxH);
  document.body.dataset.listo="1";
})();
</script>`.replace(JSON.stringify("BG"), JSON.stringify(bg)).replace(JSON.stringify("FIG"), JSON.stringify(fig));
}

async function dibujar(nav, html, salida, ancho = W, alto = H) {
  const pag = await nav.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  try {
    await pag.setContent(html, { waitUntil: "load" });
    await pag.waitForSelector("body[data-listo]", { timeout: 15000 });
    for (const q of [90, 82, 72]) { // YouTube acepta hasta 2 MB
      await pag.screenshot({ path: salida, type: "jpeg", quality: q });
      if (fs.statSync(salida).size < 1.9e6) break;
    }
  } finally { await pag.close(); }
}

// ---------------- criterio del texto (lo que aprendimos con «TU CASA INTERIOR» vs «SOLO, NO SOLITARIO») ----------------
// El texto gana el clic cuando nombra el dolor o el deseo PRIVADO del espectador, o una contradicción que intriga.
// Una metáfora bonita que solo se entiende después de ver el video («TU CASA INTERIOR») no le dice nada a quien no lo ha visto.
export const CRITERIO_TEXTO = [
  "Nombra el dolor o el deseo privado del espectador con palabras de la calle (soledad, ansiedad, que te traicionen, explicarte de más, no poder soltar) o plantea una contradicción que intriga («SOLO, NO SOLITARIO», «LA SEGUNDA FLECHA»).",
  "Nada de metáforas abstractas que solo se entienden después de ver el video («TU CASA INTERIOR», «EL RÍO SERENO»): quien se siente solo no busca su casa interior, busca dejar de sentirse solo.",
  "Las 3 opciones van por ángulos distintos: dolor (lo que le pasa), contradicción (lo que no esperaba) y promesa o consecuencia (lo que gana o pierde).",
  "Complementa el título, no lo repite, y dice la verdad del video.",
];
const CHICAS_T = new Set("LA EL LOS LAS DE DEL EN Y QUE TU TE SE LO UN UNA A AL POR NO MI SU ES".split(" "));
// avisos sin IA: repite el título, no se conecta con su tema (suele ser una metáfora abstracta) o es demasiado largo
export function revisarTexto(lineas, guion) {
  const pal = norm((lineas || []).join(" ")).split(/\s+/).filter(Boolean);
  const llenas = pal.filter((p) => !CHICAS_T.has(p));
  const tit = norm(`${guion.titulo || ""} ${(guion.subir?.titulos || []).join(" ")}`).split(/\s+/).filter((p) => p.length >= 3 && !CHICAS_T.has(p));
  const raiz = (p) => p.slice(0, 5);
  const enTitulo = (p) => tit.some((t) => raiz(t) === raiz(p));
  const avisos = [];
  if (pal.length > 4) avisos.push(`Son ${pal.length} palabras: deja 2 a 4.`);
  if (tit.length && llenas.length && llenas.every(enTitulo) && llenas.length >= Math.min(3, tit.length)) avisos.push("Repite el título: mejor complementarlo con el dolor o la promesa.");
  else if (tit.length && llenas.length && !llenas.some(enTitulo)) avisos.push("No se conecta con el tema del título: si es una metáfora, cámbiala por el dolor o el deseo de quien lo ve.");
  return avisos;
}

// palabras de la miniatura (4+ letras) que no salen en el título ni en el guion: casi siempre un error de dedo de la IA
const norm = (t) => sinTildes(String(t).toUpperCase()).replace(/[^A-ZÑ0-9\s]/g, " ");
function palabrasRaras(lineas, guion) {
  const corpus = new Set(norm([guion.titulo, guion.gancho, ...(guion.subir?.titulos || []), ...(guion.escenas || []).map((e) => `${e.voz || ""} ${e.texto || ""} ${e.capitulo || ""}`)].join(" ")).split(/\s+/));
  const raiz = (p) => p.replace(/(ES|S)$/, "");
  const cRaiz = new Set([...corpus].map(raiz));
  return lineas.join(" ").split(/\s+/).filter((p) => { const n = norm(p).trim(); return n.length >= 4 && !corpus.has(n) && !cRaiz.has(raiz(n)); });
}

// ---------------- crear las 3 opciones de un video ----------------
export async function crearMiniaturas(id, { avisar = () => {}, ia = false } = {}) {
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json");
  if (!p || !guion?.escenas?.length) throw new Error("Este video todavía no tiene guion.");
  const estilo = leerEstilo(p.estilo);
  const { receta, sinEstudio } = leerReceta(p.estilo);
  if (ia && !hayAPIMart()) throw new Error("Para generar fondos nuevos falta APIMART_API_KEY en el .env. Sin eso uso las imágenes del propio video.");
  const dir = dirMiniProyecto(id), tmp = path.join(dir, "_tmp");
  // la que Richie subió (S) se conserva al rehacer
  const previa = leerJson(path.join(dir, "miniaturas.json"));
  const suya = previa?.opciones?.find((o) => o.letra === "S"), suyaBytes = suya && fs.existsSync(path.join(dir, suya.archivo)) ? fs.readFileSync(path.join(dir, suya.archivo)) : null;
  const portada = previa?.portada, portadaBytes = portada && fs.existsSync(path.join(dir, portada.archivo)) ? fs.readFileSync(path.join(dir, portada.archivo)) : null;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  if (suyaBytes) fs.writeFileSync(path.join(dir, suya.archivo), suyaBytes);
  if (portadaBytes) fs.writeFileSync(path.join(dir, portada.archivo), portadaBytes);

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
      const archivo = `miniatura-${letra}.jpg`, ac = Math.min(Math.max(0, +o.acento || 0), lineas.length - 1);
      // A y B: figura recortada (derecha / izquierda); C: imagen completa con el texto encima (el diseño de antes)
      let diseno = disenos[i], rec = null;
      if (fondo && i < 2) rec = await recortar(fondo, path.join(tmp, `recorte-${letra}.png`));
      if (rec) {
        diseno = i === 0 ? "recorte-derecha" : "recorte-izquierda";
        await dibujar(nav, htmlRecorte({ fondo, recorte: rec, lineas, acento: ac, receta, lado: i === 0 ? "derecha" : "izquierda" }), path.join(dir, archivo));
      } else await dibujar(nav, htmlMiniatura({ fondo, lineas, acento: ac, diseno, receta }), path.join(dir, archivo));
      const raras = palabrasRaras(lineas, guion);
      const avisos = [...(raras.length ? [`Revisa la ortografía: «${raras.join("», «")}» no aparece en el guion.`] : []), ...revisarTexto(lineas, guion)];
      opciones.push({ letra, archivo, lineas, angulo: o.angulo, porque: o.porque, revisar: avisos.length ? avisos.join(" ") : undefined, escena: o.escena, fondo: origen, diseno, conFondo: !!fondo, prompt: promptExterno({ estilo, guion, o: { ...o, lineas, acento: ac, avisos: revisarTexto(lineas, guion) }, receta, lado: i === 1 ? "izquierda" : "derecha" }) });
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

  if (suyaBytes) opciones.push(suya);
  const info = { fecha: new Date().toISOString(), origen: con.origen, sinEstudio: !!sinEstudio, opciones, elegida: null, ...(portadaBytes ? { portada } : {}) };
  fs.writeFileSync(path.join(dir, "miniaturas.json"), JSON.stringify(info, null, 2));
  usarMiniatura(id, suyaBytes && previa?.elegida === "S" ? "S" : "A", info);
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

// ---------------- subir una hecha en otro lado (ChatGPT, Nano Banana, Canva…) ----------------
// Largo 16:9: se ajusta a 1280x720 (llena y recorta al centro), JPEG de menos de 2 MB, queda como opción «S» y elegida.
// Short 9:16: se vuelve la portada (1080x1920).
export async function subirMiniatura(id, original) {
  const p = leer(id, "proyecto.json"); if (!p) throw new Error("No existe ese video.");
  const dir = dirMiniProyecto(id); fs.mkdirSync(dir, { recursive: true });
  const vertical = p.formato === "9:16", [w, h] = vertical ? [1080, 1920] : [W, H];
  const salida = path.join(dir, vertical ? "portada.jpg" : "miniatura-S.jpg");
  for (const q of [2, 4, 6]) {
    await ffmpeg(["-y", "-i", original, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, "-frames:v", "1", "-q:v", String(q), salida]);
    if (fs.statSync(salida).size < 1.9e6) break;
  }
  fs.rmSync(original, { force: true });
  const info = leerJson(path.join(dir, "miniaturas.json")) || { fecha: new Date().toISOString(), origen: "subida", opciones: [], elegida: null };
  if (vertical) {
    fs.copyFileSync(salida, path.join(DIR_LISTOS, `${id}-portada.jpg`));
    info.portada = { archivo: "portada.jpg", lineas: [], subida: true, fecha: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, "miniaturas.json"), JSON.stringify(info, null, 2));
    return info;
  }
  info.opciones = (info.opciones || []).filter((o) => o.letra !== "S");
  info.opciones.push({ letra: "S", archivo: "miniatura-S.jpg", lineas: [], diseno: "subida", subida: true, conFondo: true });
  return usarMiniatura(id, "S", info);
}

export function leerMiniaturas(id) {
  const info = leerJson(path.join(dirMiniProyecto(id), "miniaturas.json"));
  if (!info?.opciones?.some((o) => !o.prompt && !o.subida)) return info;
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json") || {};
  const estilo = p ? leerEstilo(p.estilo) : {}, { receta } = leerReceta(p?.estilo || "");
  for (const [i, o] of info.opciones.entries()) if (!o.prompt && !o.subida) o.prompt = promptExterno({ estilo, guion, o: { ...o, acento: o.lineas?.length - 1 }, receta, lado: i === 1 ? "izquierda" : "derecha" });
  return info;
}

// ---------------- recorte de la figura (ISNet, el mismo de Estatuas) ----------------
async function recortar(imagen, salida) {
  try { const { mascara } = await import("./recorte.js"); return await mascara(imagen, salida); } catch { return null; }
}

// ---------------- portada de Shorts / Reels (1080x1920) ----------------
// La figura de la escena más fuerte recortada abajo, el gancho enorme arriba (zona que no tapan los botones de la app),
// con el tono y la letra romana de Estatuas. Sirve para: YouTube (cuando el canal pueda subir portadas a Shorts),
// la portada del Reel en Instagram/Facebook (se elige a mano en la app) y el feed. Queda en listos/<id>-portada.jpg.
const TONOS_PORTADA = { turquesa: ["#3fb2a3", "#f3c66f"], ambar: ["#d49a5a", "#fff0c7"], plata: ["#9a9a9a", "#e9c47c"], rojo: ["#b5473a", "#f3c66f"] };
function lineasDeGancho(guion) {
  const de = [].concat(guion.miniatura || []).find((o) => o?.lineas?.length);
  if (de) return { lineas: de.lineas.map((t) => String(t).toUpperCase()), acento: de.acento ?? de.lineas.length - 1, escena: de.escena || 1 };
  const voz = String(guion.escenas?.[0]?.voz || guion.titulo || "").split(/[.!?¿¡:;]/).map((x) => x.trim()).filter(Boolean)[0] || "";
  // la primera frase completa (si cabe en 7 palabras); si no, sus primeras 5 con puntos suspensivos
  let pal = voz.split(/\s+/).filter(Boolean);
  if (pal.length > 7) pal = [...pal.slice(0, 5), "…"];
  const corte = pal.length > 3 ? Math.ceil(pal.length / 2) : pal.length;
  const lineas = [pal.slice(0, corte).join(" "), pal.slice(corte).join(" ")].filter(Boolean).map((t) => t.toUpperCase());
  const clave = String([].concat(guion.escenas?.[0]?.clave || [])[0] || "").toUpperCase();
  const acento = Math.max(0, lineas.findIndex((l) => clave && l.includes(clave)));
  return { lineas, acento: clave ? acento : lineas.length - 1, escena: 1 };
}
export async function crearPortadaShort(id, { avisar = () => {} } = {}) {
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json");
  if (!p || !guion?.escenas?.length) throw new Error("Este video todavía no tiene guion.");
  const dir = dirMiniProyecto(id), tmp = path.join(dir, "_tmp"); fs.mkdirSync(tmp, { recursive: true });
  const g = lineasDeGancho(guion);
  const [tinte, acentoColor] = TONOS_PORTADA[p.opciones?.tono] || TONOS_PORTADA.turquesa;
  avisar({ paso: "render", progreso: 0.2, msg: "Portada del Short…" });
  let fondo = null, rec = null;
  for (const n of [g.escena, 1, 2, 3]) { fondo = await imagenDeEscena(id, n, tmp); if (fondo && (rec = await recortar(fondo, path.join(tmp, `recorte-${n}.png`)))) break; }
  if (!fondo) throw new Error("El video no tiene imágenes todavía.");
  const receta = { ...normalizarReceta(), colorTexto: "#FFFFFF", colorAcento: acentoColor };
  const nav = await abrirNavegador(), salida = path.join(dir, "portada.jpg");
  try {
    if (rec) await dibujar(nav, htmlRecorte({ fondo, recorte: rec, lineas: g.lineas, acento: g.acento, receta, ancho: 1080, alto: 1920, fuente: "cinzel-latin-800-normal.woff2", tinte }), salida, 1080, 1920);
    else await dibujar(nav, htmlMiniatura({ fondo, lineas: g.lineas, acento: g.acento, diseno: "centro", receta }).replace(new RegExp(`${W}px`, "g"), "1080px").replace(new RegExp(`${H}px`, "g"), "1920px"), salida, 1080, 1920);
  } finally { await nav.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.copyFileSync(salida, path.join(DIR_LISTOS, `${id}-portada.jpg`));
  const info = { ...(leerMiniaturas(id) || {}), portada: { archivo: "portada.jpg", lineas: g.lineas, conRecorte: !!rec, fecha: new Date().toISOString() } };
  fs.writeFileSync(path.join(dir, "miniaturas.json"), JSON.stringify(info, null, 2));
  return info.portada;
}

// Al terminar cada video: largo (16:9) → 3 miniaturas de YouTube (la A queda elegida y se sube a YouTube al programar);
// Short (9:16) → portada. Gratis (fondos del propio video). No pisa las que ya existen ni las elegidas a mano.
export async function miniaturasAutomaticas(id, avisar = () => {}) {
  const p = leer(id, "proyecto.json"); if (!p) return null;
  const ya = leerMiniaturas(id);
  if (p.formato === "16:9") return ya?.opciones?.length ? null : crearMiniaturas(id, { avisar });
  if (p.formato === "9:16" && !ya?.portada) return crearPortadaShort(id, { avisar });
  return null;
}
