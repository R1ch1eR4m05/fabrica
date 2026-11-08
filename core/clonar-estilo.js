// "Sacar el estilo de un video": toma un video de referencia (archivo o enlace), lo MIDE con ffmpeg
// (duración, cortes, ritmo, brillo, paleta HEX), saca cuadros clave y le pide a Claude el análisis del lenguaje
// visual + un "prompt maestro" que parte cualquier guion en clips con ese mismo estilo (para Flow / Omni Flash).
// Todo queda en referencias/<id>/. Solo se copia la FORMA (movimiento, color, tipografía, ritmo):
// nunca cuadros, textos, marcas ni personajes del original. Código propio.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, RAIZ } from "./config.js";
import { correr, ffmpeg } from "./ff.js";
import { claude, jsonDe } from "./llm.js";

export const dirReferencias = path.join(RAIZ, "referencias");
export const dirReferencia = (id) => path.join(dirReferencias, id);
const leerJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return def; } };
const slug = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ffmpeg escribe showinfo / scene en stderr
const stderrDe = (args) => new Promise((res, rej) => {
  const p = spawn(CFG.ffmpeg, ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => (err += d)); p.on("error", rej); p.on("close", () => res(err));
});
const rgbCuadros = (archivo, { fps, w = 64, h = 64, desde = 0, dur }) => new Promise((res, rej) => {
  const args = ["-v", "error", "-ss", String(desde), ...(dur ? ["-t", String(dur)] : []), "-i", archivo, "-vf", `fps=${fps},scale=${w}:${h}:flags=area,format=rgb24`, "-f", "rawvideo", "-"];
  const p = spawn(CFG.ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] }); const partes = [];
  p.stdout.on("data", (d) => partes.push(d)); p.on("error", rej);
  p.on("close", (c) => (c === 0 ? res(Buffer.concat(partes)) : rej(new Error("ffmpeg no pudo leer el video"))));
});

// ---------------- conseguir el video ----------------
async function conseguirVideo(origen, destino, avisar) {
  if (/^https?:\/\//i.test(origen)) {
    avisar({ progreso: 0.05, msg: "Bajando el video de referencia…" });
    try {
      await correr("yt-dlp", ["-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4", "--no-playlist", "-o", destino, origen]);
    } catch (e) {
      throw new Error(`No pude bajar el enlace (${String(e.message).slice(0, 160)}). Bájalo tú y pásame el archivo .mp4, o ponlo en referencias/<id>/video.mp4.`);
    }
  } else {
    const f = path.resolve(origen);
    if (!fs.existsSync(f)) throw new Error(`No encuentro el archivo ${origen}.`);
    if (f !== path.resolve(destino)) fs.copyFileSync(f, destino);
  }
  if (!fs.existsSync(destino)) throw new Error("No quedó el video de referencia.");
}

// ---------------- mediciones ----------------
async function datosBasicos(archivo) {
  const j = JSON.parse(await correr(CFG.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", archivo]));
  const s = j.streams?.[0] || {}; const [a, b] = String(s.r_frame_rate || "30/1").split("/").map(Number);
  return { ancho: s.width, alto: s.height, fps: +((a / (b || 1)) || 30).toFixed(2), duracion: +Number(j.format?.duration || 0).toFixed(2) };
}

async function cortes(archivo, dur) {
  const txt = await stderrDe(["-i", archivo, "-vf", "select='gt(scene,0.22)',showinfo", "-an", "-f", "null", "-"]);
  const t = [...txt.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]).filter((x) => x > 0.3 && x < dur - 0.3);
  const limpios = []; for (const x of t) if (!limpios.length || x - limpios[limpios.length - 1] > 0.3) limpios.push(+x.toFixed(2));
  const marcas = [0, ...limpios, dur];
  return marcas.slice(0, -1).map((ini, i) => ({ n: i + 1, inicio: ini, fin: marcas[i + 1], dur: +(marcas[i + 1] - ini).toFixed(2) }));
}

// paleta: histograma a 4 bits por canal, se juntan colores parecidos
function paleta(buf, cuantos = 6) {
  const cubos = new Map(); const n = Math.floor(buf.length / 3);
  for (let i = 0; i < n; i++) { const k = ((buf[i * 3] >> 4) << 8) | ((buf[i * 3 + 1] >> 4) << 4) | (buf[i * 3 + 2] >> 4); cubos.set(k, (cubos.get(k) || 0) + 1); }
  const lista = [...cubos].map(([k, c]) => ({ r: ((k >> 8) & 15) * 17, g: ((k >> 4) & 15) * 17, b: (k & 15) * 17, c })).sort((a, b) => b.c - a.c);
  const salida = [];
  for (const x of lista) {
    const cerca = salida.find((s) => Math.hypot(s.r - x.r, s.g - x.g, s.b - x.b) < 48);
    if (cerca) cerca.c += x.c; else if (salida.length < cuantos * 3) salida.push({ ...x });
  }
  const hex = (v) => v.toString(16).padStart(2, "0").toUpperCase();
  return salida.sort((a, b) => b.c - a.c).slice(0, cuantos).map((s) => ({ hex: `#${hex(s.r)}${hex(s.g)}${hex(s.b)}`, pct: +((100 * s.c) / n).toFixed(1) }));
}

function brilloYMovimiento(buf, fps) {
  const px = 64 * 64 * 3, n = Math.floor(buf.length / px); let lum = 0, mov = 0, pares = 0;
  for (let f = 0; f < n; f++) {
    let l = 0; for (let i = 0; i < px; i += 3) l += 0.2126 * buf[f * px + i] + 0.7152 * buf[f * px + i + 1] + 0.0722 * buf[f * px + i + 2];
    lum += l / (px / 3);
    if (f) { let d = 0; for (let i = 0; i < px; i++) d += Math.abs(buf[f * px + i] - buf[(f - 1) * px + i]); mov += d / px; pares++; }
  }
  return { brillo: n ? Math.round(lum / n) : 0, movimiento: pares ? +(mov / pares).toFixed(2) : 0, cuadrosMedidos: n, fps };
}

async function cuadrosClave(archivo, esc, dir, tope = 14) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  // un cuadro por escena (en su 40 %); si hay más escenas que tope, se reparten parejo; si hay pocas, se completa con cuadros extra
  let tiempos = esc.map((e) => +(e.inicio + e.dur * 0.4).toFixed(2));
  if (tiempos.length > tope) tiempos = Array.from({ length: tope }, (_, i) => tiempos[Math.floor((i * tiempos.length) / tope)]);
  const total = esc.at(-1)?.fin || 0;
  while (tiempos.length < Math.min(tope, 8) && total) { // video con pocos cortes: más cuadros repartidos para ver el movimiento
    tiempos = Array.from({ length: Math.min(tope, 8) }, (_, i) => +(((i + 0.5) * total) / Math.min(tope, 8)).toFixed(2)); break;
  }
  const hechos = [];
  for (const [i, t] of tiempos.entries()) {
    const nombre = `${String(i + 1).padStart(2, "0")}.jpg`;
    try { await ffmpeg(["-ss", String(t), "-i", archivo, "-frames:v", "1", "-vf", "scale='min(640,iw)':-2", "-q:v", "4", path.join(dir, nombre)]); hechos.push({ n: i + 1, t, archivo: `cuadros/${nombre}` }); } catch {}
  }
  return hechos;
}

// ---------------- Claude ----------------
const SISTEMA = `Eres director de motion graphics y experto en generar video con IA (Google Flow / Omni Flash / Veo).
Te doy MEDICIONES reales de un video de referencia (cortes, duración, ritmo, brillo, paleta HEX) y cuadros clave en orden.
Tu trabajo: describir con precisión el LENGUAJE VISUAL (no el contenido) y convertirlo en un prompt maestro reutilizable.
Reglas:
- Usa las mediciones como verdad para tiempos, ritmo y colores; los cuadros para forma, tipografía y composición. Si algo no se deduce de los cuadros, di "aproximado" y no lo inventes.
- Describe SOLO la forma: movimiento, transiciones, composición, tipografía (estilo, peso, mayúsculas, animación de entrada/salida), color, textura, iluminación, ritmo. Nunca transcribas textos, marcas, logotipos ni personajes del original; el prompt maestro debe servir para OTRO tema.
- Español de México. Responde SOLO un JSON con esta forma exacta:
{
 "resumen": "2-3 frases: de qué estilo se trata",
 "formato": {"relacion":"9:16|16:9|1:1","duracionClip":"segundos típicos por clip","fps":0},
 "paleta": {"fondo":"#HEX","texto":"#HEX","acentos":["#HEX"],"notas":"degradados, texturas, sombras"},
 "tipografia": "familia o tipo parecido, peso, caja, tamaño relativo, cómo entra y sale",
 "composicion": "dónde va cada cosa, márgenes, jerarquía, espacio negativo",
 "movimiento": "cámara y elementos: dirección, velocidad, easing, loops",
 "transiciones": "cómo pasa de un clip a otro",
 "ritmo": "cortes por segundo, cuándo acelera o respira, golpes de edición",
 "escenas": [{"n":1,"inicio":0,"fin":0,"que_pasa":"forma, no contenido","dificultad":"baja|media|alta"}],
 "evitar": ["errores típicos de la IA con este estilo"],
 "promptMaestro": "Instrucciones completas para otra IA: recibe un guion, lo divide en clips de la duración típica y escribe, para cada clip, un prompt de video con ESTE estilo (incluye reglas fijas de paleta, tipografía, movimiento, transiciones y qué no hacer). Termina con una línea 'GUION:' donde se pegará el texto. Formato de salida pedido a esa IA: lista numerada de clips con duración, texto en pantalla y prompt.",
 "promptClip": "Plantilla corta de UN clip, con {TEXTO} y {DURACION}, lista para pegar en Flow",
 "estiloFabrica": "Cómo se haría en la fábrica (plantilla HTML con Playwright o ffmpeg): qué capas, qué animaciones y qué datos necesita"
}`;

export async function analizarEstilo(id, { pedido = "", avisar = () => {} } = {}) {
  const dir = dirReferencia(id), medidas = leerJson(path.join(dir, "medidas.json"));
  if (!medidas) throw new Error(`No hay mediciones de «${id}». Corre primero: node fabrica.js clonar-estilo <archivo|enlace>.`);
  avisar({ progreso: 0.6, msg: "Claude está mirando el video…" });
  const contenido = [{ type: "text", text: `Mediciones del video de referencia:\n${JSON.stringify(medidas, null, 1)}\n\nPedido de Richie (lo que quiere cambiar o lograr): ${pedido || "ninguno, clona el estilo tal cual para usarlo con otros guiones"}\n\nCuadros clave en orden:` }];
  for (const c of medidas.cuadros) contenido.push({ type: "text", text: `Cuadro ${c.n} (t=${c.t}s)` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(path.join(dir, c.archivo)).toString("base64") } });
  contenido.push({ type: "text", text: "Responde el JSON." });
  const j = jsonDe((await claude(SISTEMA, contenido, { maxTokens: 8000 })).texto);
  return guardarEstilo(id, j, pedido);
}

// la usa también Claude Code cuando mira los cuadros de referencias/<id>/cuadros/ y escribe el análisis él mismo
export function guardarEstilo(id, j, pedido = "") {
  const dir = dirReferencia(id); fs.mkdirSync(dir, { recursive: true });
  const salida = { fecha: new Date().toISOString(), id, pedido, ...j };
  fs.writeFileSync(path.join(dir, "estilo.json"), JSON.stringify(salida, null, 2));
  const md = [`# Estilo «${id}»`, "", j.resumen || "", "",
    "## Para otra IA (prompt maestro)", "", j.promptMaestro || "", "",
    "## Prompt de un clip", "", j.promptClip || "", "",
    "## Resumen técnico", "",
    `- Paleta: ${JSON.stringify(j.paleta || {})}`, `- Tipografía: ${j.tipografia || ""}`, `- Composición: ${j.composicion || ""}`,
    `- Movimiento: ${j.movimiento || ""}`, `- Transiciones: ${j.transiciones || ""}`, `- Ritmo: ${j.ritmo || ""}`,
    `- Evitar: ${(j.evitar || []).join("; ")}`, "", "## Cómo hacerlo en la fábrica", "", j.estiloFabrica || ""].join("\n");
  fs.writeFileSync(path.join(dir, "prompt-maestro.md"), md);
  return salida;
}

// ---------------- todo junto ----------------
export async function sacarEstilo(origen, { nombre, pedido = "", avisar = () => {} } = {}) {
  const id = slug(nombre) || slug(path.basename(String(origen).replace(/\?.*$/, ""), path.extname(String(origen)))) || `ref-${Date.now()}`;
  const dir = dirReferencia(id); fs.mkdirSync(dir, { recursive: true });
  const video = path.join(dir, "video.mp4");
  await conseguirVideo(origen, video, avisar);

  avisar({ progreso: 0.2, msg: "Midiendo cortes y ritmo…" });
  const base = await datosBasicos(video);
  const esc = await cortes(video, base.duracion || 1);
  const rgb = await rgbCuadros(video, { fps: base.duracion > 40 ? 2 : 6 });
  const bm = brilloYMovimiento(rgb, base.duracion > 40 ? 2 : 6);
  avisar({ progreso: 0.4, msg: "Sacando la paleta y los cuadros clave…" });
  const cuadros = await cuadrosClave(video, esc, path.join(dir, "cuadros"));
  const medidas = {
    fecha: new Date().toISOString(), origen: /^https?:/i.test(origen) ? origen : path.basename(origen), ...base,
    relacion: base.ancho && base.alto ? (base.alto > base.ancho ? "9:16" : base.ancho > base.alto ? "16:9" : "1:1") : null,
    escenas: esc.length, duracionMediaEscena: +(base.duracion / esc.length).toFixed(2), cortesPorSegundo: +((esc.length - 1) / (base.duracion || 1)).toFixed(2),
    brillo: bm.brillo, energiaMovimiento: bm.movimiento, paleta: paleta(rgb), cortes: esc, cuadros,
  };
  fs.writeFileSync(path.join(dir, "medidas.json"), JSON.stringify(medidas, null, 2));

  if (!CFG.anthropicKey) {
    avisar({ progreso: 1, msg: "Medido. Falta el análisis: pídele a Claude Code que mire los cuadros (no hay ANTHROPIC_API_KEY)." });
    return { id, pendiente: true, medidas };
  }
  const estilo = await analizarEstilo(id, { pedido, avisar });
  avisar({ progreso: 1, msg: `Listo: referencias/${id}/prompt-maestro.md` });
  return { id, medidas, estilo };
}

export function leerEstilosClonados() {
  if (!fs.existsSync(dirReferencias)) return [];
  return fs.readdirSync(dirReferencias).filter((d) => fs.existsSync(path.join(dirReferencias, d, "medidas.json")))
    .map((id) => ({ id, medidas: leerJson(path.join(dirReferencias, id, "medidas.json")), listo: fs.existsSync(path.join(dirReferencias, id, "estilo.json")) }));
}
