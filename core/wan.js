// Cine · Toma continua (Wan 3.0 por APIMart): un solo plano de hasta 30 s, sin cortes, con diálogo y sonido nativos.
// Flujo: hojas de referencia (personajes, lugar, objetos) con Nano Banana → Wan 3.0 con esas referencias → transcripción
// con ElevenLabs (tiempos de palabra para los subtítulos) → final.mp4 con subtítulos quemados.
// Docs (verificadas 2026-11-20): https://apimart.ai/model/wan-3-0-prime  ·  POST /v1/videos/generations
//   model wan3.0-video | wan3.0-video-prime, prompt, duration 2-30, resolution 480P|720P|1080P, size 9:16|16:9…,
//   audio, image_urls (hasta 10) + generation_type "reference"; no se mezclan referencias con primer/último cuadro.
// GASTA: cada generación cobra por segundo. Solo corre con confirmación explícita (proyecto.wan.confirmado) y bajo el tope.
import fs from "node:fs";
import path from "node:path";
import { CFG, FORMATOS, RAIZ } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerAjustes } from "./ajustes.js";
import { ffmpeg, duracion } from "./ff.js";

// US$ por segundo (APIMart, nivel Gold, 20 nov 2026). Prime viene en la página; el estándar no publica tabla y es más
// barato: se estima con la tarifa oficial (RMB 0.30 / 0.60 / 1.20 por s ≈ US$ 0.042 / 0.083 / 0.167) como techo.
const PRECIO = {
  "wan3.0-video-prime": { "480P": 0.0514, "720P": 0.1029, "1080P": 0.2057 },
  "wan3.0-video": { "480P": 0.0417, "720P": 0.0833, "1080P": 0.1667 },
};
export const MODELOS = { "wan3.0-video": "Wan 3.0", "wan3.0-video-prime": "Wan 3.0 Prime" };
export const RESOLUCIONES = ["480P", "720P", "1080P"];

export function configWan(p) {
  const w = p?.wan || {};
  const modelo = MODELOS[w.modelo] ? w.modelo : "wan3.0-video";
  const resolucion = RESOLUCIONES.includes(w.resolucion) ? w.resolucion : "720P";
  const g = leer(p.id, "guion.json") || {};
  const fin = Math.max(0, ...(g.escenas || []).map((e) => +e.hasta || 0));
  const segundos = Math.min(30, Math.max(2, Math.round(+w.duracion || fin || 30)));
  const costo = +(segundos * PRECIO[modelo][resolucion]).toFixed(2);
  const tope = +(leerAjustes().wanTopeUSD ?? 8);
  return { modelo, resolucion, segundos, costo, tope };
}

const dirRefs = (id) => path.join(dirProyecto(id), "refs");
export function refsDe(id) {
  const d = dirRefs(id); if (!fs.existsSync(d)) return {};
  const r = {}; for (const f of fs.readdirSync(d)) { const m = f.match(/^(.+)\.(png|jpe?g|webp)$/i); if (m) r[m[1]] = f; }
  return r;
}
export const clipWan = (id) => path.join(dirProyecto(id), "clips", "wan.mp4");

// hoja de referencia: 3 vistas en una imagen 16:9 (frente, espalda y retrato) sobre gris liso, para que Wan mantenga la identidad
export function promptHoja(ref, estiloVisual = "") {
  const vistas = ref.tipo === "lugar"
    ? "three panels side by side: wide establishing view, reverse angle view, and a close detail of the most recognizable element"
    : ref.tipo === "objeto"
      ? "three panels side by side: front view, side view and top view of the same object"
      : "three panels side by side: full body front view, full body back view, and a head-and-shoulders portrait of the same person";
  return `Reference sheet, 16:9, ${vistas}. ${ref.descripcion}. Neutral studio light on a plain light grey background, identical identity, proportions, clothing and colors in every panel. ${estiloVisual ? "Rendering style: " + estiloVisual + ". " : ""}No text, no labels, no logos, no watermark.`;
}

// el prompt de Wan: plano único sin cortes, cámara, película, luz, referencias numeradas y la coreografía con los diálogos
export function promptWan(g, refsUsadas = [], { vertical = true } = {}) {
  const w = g.wan || {};
  const lineas = [
    `ONE CONTINUOUS SINGLE TAKE, NO CUTS, NO EDITS, NO SCENE CHANGES for the whole clip.`,
    `Camera: ${w.camara || "handheld camera that follows the action at eye level, natural breathing movement"}. Shot on ${w.pelicula || "35mm Kodak Vision3 250D film, natural grain"}. Light: ${w.luz || "motivated natural light"}. Palette: ${w.paleta || "natural, cinematic"}. ${vertical ? "Vertical 9:16 framing." : "Horizontal 16:9 framing."}`,
    `Dialogue in ${w.idioma || "Mexican Spanish"} with natural lip sync and realistic voices. Sound: ${w.sonido || "natural ambient sound of the location, no music"}. No subtitles, no on-screen text, no logos, no watermark.`,
  ];
  if (refsUsadas.length) lineas.push("References: " + refsUsadas.map((r, i) => `image ${i + 1} = ${r.nombre || r.id} (${r.tipo || "personaje"}): keep exactly this identity and look`).join("; ") + ".");
  if (g.protagonista) lineas.push(`Protagonist: ${g.protagonista}.`);
  if (g.lugar) lineas.push(`Location: ${g.lugar}.`);
  lineas.push("Choreography, in order, as one uninterrupted shot:");
  for (const e of g.escenas || []) {
    const t = e.desde != null && e.hasta != null ? `${e.desde}-${e.hasta}s` : "";
    const quien = e.quien ? (refsUsadas.find((r) => r.id === e.quien)?.nombre || e.quien) : "";
    lineas.push(`- ${t ? t + ": " : ""}${e.accion || ""}${e.camara ? ` Camera: ${e.camara}.` : ""}${e.voz ? ` ${quien || "The character"} says in Spanish: "${e.voz}"` : ""}`.trim());
  }
  return lineas.join("\n");
}

// tiempos de palabra con ElevenLabs Speech to Text (scribe_v1); si falla, se reparten según la ventana de cada escena
async function transcribir(audio) {
  if (!CFG.elevenKey) return null;
  try {
    const fd = new FormData();
    fd.append("model_id", "scribe_v1"); fd.append("language_code", "spa");
    fd.append("file", new Blob([fs.readFileSync(audio)], { type: "audio/mpeg" }), "voz.mp3");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": CFG.elevenKey }, body: fd, signal: AbortSignal.timeout(180000) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.words || []).filter((w) => w.type === "word" && String(w.text).trim()).map((w) => ({ w: String(w.text).trim(), t0: +w.start, t1: +w.end }));
  } catch { return null; }
}
function estimadas(g) {
  const out = [];
  for (const e of g.escenas || []) {
    const pal = String(e.voz || "").split(/\s+/).filter(Boolean); if (!pal.length) continue;
    const a = +e.desde || 0, b = Math.max(a + 0.5, +e.hasta || a + pal.length / 2.6), paso = (b - a) / pal.length;
    pal.forEach((p, j) => out.push({ w: p, t0: a + j * paso, t1: a + (j + 1) * paso }));
  }
  return out;
}

// tiempos.json desde el clip: una entrada por escena (ventana del guion) con las palabras que caen en ella
export async function tiemposDelClip(id) {
  const g = leer(id, "guion.json") || {}, dir = dirProyecto(id), clip = clipWan(id);
  const voz = path.join(dir, "voz.mp3");
  await ffmpeg(["-i", clip, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "192k", voz]);
  const D = await duracion(clip);
  let palabras = await transcribir(voz), fuente = "elevenlabs";
  if (!palabras?.length) { palabras = estimadas(g); fuente = "estimadas"; }
  const esc = (g.escenas || []).map((e, i, xs) => ({ ini: +e.desde || 0, fin: i < xs.length - 1 ? (+xs[i + 1].desde || +e.hasta || D) : D }));
  const escenas = esc.map((e) => ({ ini: e.ini, finVoz: e.fin, fin: e.fin, palabras: palabras.filter((p) => p.t0 >= e.ini && p.t0 < e.fin) }));
  if (escenas.length && palabras.some((p) => !escenas.some((e) => e.palabras.includes(p)))) escenas[escenas.length - 1].palabras.push(...palabras.filter((p) => !escenas.some((e) => e.palabras.includes(p))));
  guardar(id, "tiempos.json", { duracion: D, prueba: false, sinVoz: false, modelo: "wan-nativo", subtitulos: fuente, escenas });
  return { duracion: D, palabras: palabras.length, fuente };
}

// paso «voz» del estilo: hojas de referencia (centavos) + clip de Wan (lo caro, solo con confirmación) + tiempos
export async function prepararWan(id, avisar = () => {}) {
  const A = await import("./apimart.js");
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  if (!g?.escenas?.length) throw new Error("Primero hace falta el guion.");
  const c = configWan(p);
  const yaHay = fs.existsSync(clipWan(id));
  if (!p.wan?.confirmado) {
    if (yaHay) { avisar({ paso: "voz", progreso: 0.5, msg: "Uso el clip de Wan que ya estaba (no gasto)…" }); return tiemposDelClip(id); }
    throw new Error(`Generar con Wan cuesta ≈ US$ ${c.costo} (${c.segundos} s, ${c.resolucion}, ${MODELOS[c.modelo]}). Confírmalo con «Generar con Wan» en el panel.`);
  }
  if (c.costo > c.tope) throw new Error(`≈ US$ ${c.costo} pasa el tope de US$ ${c.tope} por video (ajustes.json → wanTopeUSD). Baja la resolución o la duración.`);
  if (!A.hayAPIMart()) throw new Error("Falta APIMART_API_KEY en el .env.");
  // la confirmación vale para UNA generación
  const p1 = leer(id, "proyecto.json"); p1.wan = { ...(p1.wan || {}), confirmado: false }; guardar(id, "proyecto.json", p1);

  // 1) hojas de referencia que falten
  fs.mkdirSync(dirRefs(id), { recursive: true });
  const refs = (g.referencias || []).slice(0, 10);
  let hechas = refsDe(id);
  for (const [i, r] of refs.entries()) {
    if (!r?.id || hechas[r.id]) continue;
    avisar({ paso: "voz", progreso: 0.02 + (0.1 * i) / refs.length, msg: `Hoja de referencia: ${r.nombre || r.id}…` });
    const img = await A.generarImagen(promptHoja(r, g.wan?.estiloVisual), { size: "16:9", resolucion: "2K" });
    fs.writeFileSync(path.join(dirRefs(id), r.id + img.ext), img.bytes);
  }
  hechas = refsDe(id);
  const usadas = refs.filter((r) => hechas[r.id]);
  const urls = [];
  for (const r of usadas) urls.push(await A.subir(path.join(dirRefs(id), hechas[r.id])));

  // 2) el clip
  const vertical = (p.formato || "9:16") === "9:16";
  const prompt = promptWan(g, usadas, { vertical });
  fs.writeFileSync(path.join(dirProyecto(id), "wan-prompt.txt"), prompt);
  avisar({ paso: "voz", progreso: 0.15, msg: `Wan 3.0: ${c.segundos} s a ${c.resolucion} (≈ US$ ${c.costo}). Tarda varios minutos…` });
  const buf = await A.pedirVideo({
    model: c.modelo, prompt, duration: c.segundos, resolution: c.resolucion, size: vertical ? "9:16" : "16:9", audio: true, watermark: false,
    ...(urls.length ? { image_urls: urls, generation_type: "reference" } : {}),
  }, (a) => avisar({ ...a, paso: "voz", progreso: 0.15 + 0.75 * (a.progreso || 0) }), "Wan 3.0", 45);
  fs.mkdirSync(path.dirname(clipWan(id)), { recursive: true });
  if (fs.existsSync(clipWan(id))) fs.renameSync(clipWan(id), clipWan(id).replace(/\.mp4$/, `-${Date.now()}.mp4`)); // el anterior no se borra
  fs.writeFileSync(clipWan(id), buf);
  const p2 = leer(id, "proyecto.json");
  p2.wan = { ...(p2.wan || {}), generaciones: [...(p2.wan?.generaciones || []), { fecha: new Date().toISOString(), modelo: c.modelo, resolucion: c.resolucion, segundos: c.segundos, costoAprox: c.costo }] };
  guardar(id, "proyecto.json", p2);
  avisar({ paso: "voz", progreso: 0.93, msg: "Transcribiendo el diálogo para los subtítulos…" });
  return tiemposDelClip(id);
}

// ---------------- render: el clip a la medida exacta, audio a -14 LUFS y subtítulos quemados ----------------
function frases(palabras) {
  const out = []; let cur = [];
  for (const [i, p] of palabras.entries()) {
    cur.push(p);
    const sig = palabras[i + 1];
    if (cur.length >= 4 || /[.,;:!?…]$/.test(p.w) || !sig || sig.t0 - p.t1 > 0.6) { out.push({ texto: cur.map((x) => x.w).join(" "), t0: cur[0].t0, t1: Math.max(cur.at(-1).t1, cur[0].t0 + 0.6) }); cur = []; }
  }
  return out;
}

export async function renderWan(id, avisar = () => {}, tmp) {
  const p = leer(id, "proyecto.json"), t = leer(id, "tiempos.json") || { escenas: [] };
  const clip = clipWan(id);
  if (!fs.existsSync(clip)) throw new Error("Falta el clip de Wan: primero «Generar con Wan».");
  const W = FORMATOS[p.formato]?.w || 1080, H = FORMATOS[p.formato]?.h || 1920;
  const dir = dirProyecto(id), final = path.join(dir, "final.mp4");
  const conSubs = (p.opciones || {}).subtitulos !== "no";
  const fs_ = conSubs ? frases(t.escenas.flatMap((e) => e.palabras || [])) : [];
  const pngs = [];
  if (fs_.length) {
    avisar({ paso: "render", progreso: 0.1, msg: `Subtítulos: ${fs_.length} frases…` });
    const { abrirNavegador } = await import("./render.js");
    const fuente = fs.readFileSync(path.join(RAIZ, "estilos", "_comun", "fuentes", "montserrat-latin-800-normal.woff2")).toString("base64");
    const nav = await abrirNavegador();
    try {
      const pag = await nav.newPage({ viewport: { width: W, height: Math.round(H * 0.22) } });
      for (const [i, f] of fs_.entries()) {
        await pag.setContent(`<html><body style="margin:0;background:transparent"><style>@font-face{font-family:M;src:url(data:font/woff2;base64,${fuente})}
          div{width:${W}px;height:${Math.round(H * 0.22)}px;display:flex;align-items:center;justify-content:center;text-align:center;font:800 ${Math.round(W * (W < H ? 0.072 : 0.045))}px/1.1 M;color:#fff;
          -webkit-text-stroke:${Math.round(W * 0.009)}px #000;paint-order:stroke fill;text-shadow:0 4px 18px rgba(0,0,0,.6);padding:0 ${Math.round(W * 0.08)}px;box-sizing:border-box}</style>
          <div>${f.texto.replace(/[<&>]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" })[c])}</div></body></html>`);
        await pag.evaluate(() => document.fonts.ready);
        const png = path.join(tmp, `s${i}.png`);
        await pag.screenshot({ path: png, omitBackground: true });
        pngs.push({ png, ...f });
      }
    } finally { await nav.close(); }
  }
  avisar({ paso: "render", progreso: 0.4, msg: "Armando el video final…" });
  const y = Math.round(H * (W < H ? 0.62 : 0.74));
  const base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p[v0]`;
  const capas = pngs.map((s, i) => `[v${i}][${i + 1}:v]overlay=0:${y}:enable='between(t,${s.t0.toFixed(2)},${(s.t1 + 0.15).toFixed(2)})'[v${i + 1}]`);
  await ffmpeg([
    "-i", clip, ...pngs.flatMap((s) => ["-i", s.png]),
    "-filter_complex", [base, ...capas].join(";"), "-map", `[v${pngs.length}]`, "-map", "0:a?",
    "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", final,
  ]);
  await ffmpeg(["-ss", "1.0", "-i", final, "-frames:v", "1", "-q:v", "2", path.join(dir, "portada.jpg")]);
}
