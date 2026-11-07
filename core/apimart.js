// APIMart: imágenes con IA para los anuncios (y lo que venga después).
// Docs (verificadas 2026-11-07):
//   POST https://api.apimart.ai/v1/images/generations  {model, prompt, size, resolution, n, image_urls}  → data[0].task_id
//     https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md
//   GET  https://api.apimart.ai/v1/tasks/{task_id}  → data.status (pending|processing|completed|failed|cancelled),
//        data.result.images[0].url[0]   https://docs.apimart.ai/en/api-reference/tasks/status.md
// Modelo por defecto: Nano Banana 2 (gemini-3.1-flash-image-preview). Cámbialo con APIMART_MODELO_IMAGEN en el .env.
import fs from "node:fs";
import path from "node:path";
import { CFG } from "./config.js";
import { dirProyecto, leer } from "./proyectos.js";
import { dirClips, clipDeEscena } from "./historia.js";

const BASE = "https://api.apimart.ai/v1";
const RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "5:4", "4:5"];
export const hayAPIMart = () => !!CFG.apimartKey;
const modelo = () => process.env.APIMART_MODELO_IMAGEN || "gemini-3.1-flash-image-preview";
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function llamar(ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: cuerpo ? "POST" : "GET", signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${CFG.apimartKey}`, "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = null; }
  if (!r.ok || (j && j.code && j.code !== 200)) {
    const msg = j?.error?.message || j?.message || j?.msg || txt.slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new Error("APIMart no aceptó la llave (revisa APIMART_API_KEY en el .env).");
    if (r.status === 402 || /balance|insufficient|余额/i.test(msg)) throw new Error("APIMart: saldo insuficiente. Recarga créditos en apimart.ai.");
    throw new Error(`APIMart respondió ${r.status}: ${msg}`);
  }
  return j;
}

// una imagen: devuelve los bytes. refs = rutas de imágenes locales (foto del producto) que se mandan como referencia
export async function generarImagen(prompt, { size = "9:16", refs = [], resolucion = "1K" } = {}) {
  if (!hayAPIMart()) throw new Error("Falta APIMART_API_KEY en el .env.");
  const image_urls = refs.slice(0, 6).map((f) => {
    const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg");
    return `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
  });
  const r = await llamar("/images/generations", { model: modelo(), prompt, size: RATIOS.includes(size) ? size : "9:16", resolution: resolucion, n: 1, ...(image_urls.length ? { image_urls } : {}) });
  const tarea = r?.data?.[0]?.task_id;
  if (!tarea) throw new Error("APIMart no devolvió el número de tarea.");
  const t0 = Date.now();
  for (;;) {
    await espera(4000);
    const s = (await llamar(`/tasks/${encodeURIComponent(tarea)}?language=es`))?.data || {};
    if (s.status === "completed") {
      const url = s.result?.images?.[0]?.url?.[0];
      if (!url) throw new Error("APIMart terminó pero sin imagen.");
      const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!img.ok) throw new Error(`No pude bajar la imagen de APIMart (${img.status}).`);
      return { bytes: Buffer.from(await img.arrayBuffer()), ext: /\.png(\?|$)/i.test(url) ? ".png" : /\.webp(\?|$)/i.test(url) ? ".webp" : ".jpg", costo: s.credits_cost ?? s.cost };
    }
    if (s.status === "failed" || s.status === "cancelled") throw new Error(`APIMart: ${s.error?.message || s.status}`);
    if (Date.now() - t0 > 4 * 60000) throw new Error("APIMart tardó más de 4 minutos en una imagen.");
  }
}

// fotos del producto que subiste (proyectos/<id>/producto/*): se mandan de referencia para que el empaque salga igual
export const dirProducto = (id) => path.join(dirProyecto(id), "producto");
export function fotosProducto(id) {
  const d = dirProducto(id);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => /\.(jpe?g|png|webp)$/i.test(x)).sort().map((x) => path.join(d, x)) : [];
}

// prompt de la imagen de una escena del anuncio
export function promptImagen(g, e, conProducto, anuncio = true) {
  if (!anuncio) return [g.estiloVisual, e.flowPrompt || e.imagen, "No text, no letters, no logos, no watermark."].filter(Boolean).join(". ");
  return [g.estiloVisual, e.imagen || e.flowPrompt,
    conProducto ? "Use the attached product photo(s) as the exact product: same packaging, label, shape and colors." : "",
    "Photorealistic advertising photo, clean composition with empty space for text, no text, no letters, no logos, no watermark."].filter(Boolean).join(" ");
}

// genera con APIMart las imágenes que faltan (clips/escena-N.ext), con tope por tanda
export async function imagenesDeAPIMart(id, avisar = () => {}, { max = 8, soloFaltantes = true } = {}) {
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  if (!g) throw new Error("Primero hace falta el guion.");
  const { leerEstilo } = await import("./estilos.js");
  const anuncio = !!leerEstilo(p.estilo)?.anuncios;
  const refs = anuncio ? fotosProducto(id) : [];
  const pend = g.escenas.map((e, k) => ({ e, n: k + 1 })).filter(({ e, n }) => (e.imagen || e.flowPrompt) && e.sinImagen !== true && (anuncio || e.tipo !== "cierre" || leerEstilo(p.estilo)?.clipsFlow === "imagen") && (!soloFaltantes || !clipDeEscena(id, n)));
  if (!pend.length) return { generados: 0, fallos: [] };
  const lote = pend.slice(0, Math.max(1, max));
  // las imágenes se piden en la medida más alta del proyecto para que al recortar a 1:1 o 4:5 no se pierda lo importante
  const size = !anuncio || p.opciones?.medidas === "esta" ? p.formato : "4:5";
  fs.mkdirSync(dirClips(id), { recursive: true });
  let generados = 0; const fallos = [];
  for (const [k, { e, n }] of lote.entries()) {
    avisar({ paso: "fondo", progreso: k / lote.length, msg: `APIMart: imagen ${k + 1} de ${lote.length} (escena ${n})…` });
    try {
      const r = await generarImagen(promptImagen(g, e, refs.length && e.producto !== false, anuncio), { size, refs: e.producto === false ? [] : refs });
      for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x));
      fs.writeFileSync(path.join(dirClips(id), `escena-${n}${r.ext}`), r.bytes);
      generados++;
    } catch (er) { fallos.push(`escena ${n}: ${er.message}`); if (/llave|saldo/i.test(er.message)) break; }
  }
  if (!generados && fallos.length) throw new Error(fallos.join(" | "));
  // lo generado entra al banco del estilo (y con espejo se manda al VPS/laptop)
  if (generados && leerEstilo(p.estilo)?.banco) try { const B = await import("./banco.js"); await B.guardarDeProyecto(id); } catch {}
  return { generados, fallos, faltan: pend.length - lote.length };
}

// ---------------- video ----------------
// Subidas (dan una URL pública temporal, ~72 h):  POST /v1/uploads/images | /v1/uploads/videos  (multipart, campo "file") → { url }
//   https://docs.apimart.ai/en/api-reference/uploads/videos.md
// Video:  POST /v1/videos/generations → data[0].task_id ;  GET /v1/tasks/{id} → data.result.videos[0].url[0]
//   Seedance 2.5: https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation.md
//   Kling Motion Control: https://docs.apimart.ai/en/api-reference/videos/kling-v2-6/kling-v2-6-motion-control-generation.md
export async function subir(archivo) {
  if (!hayAPIMart()) throw new Error("Falta APIMART_API_KEY en el .env.");
  const esVideo = /\.(mp4|mov|webm)$/i.test(archivo);
  const fd = new FormData();
  const tipo = esVideo ? (/\.mov$/i.test(archivo) ? "video/quicktime" : /\.webm$/i.test(archivo) ? "video/webm" : "video/mp4") : /\.png$/i.test(archivo) ? "image/png" : /\.webp$/i.test(archivo) ? "image/webp" : "image/jpeg";
  fd.append("file", new Blob([fs.readFileSync(archivo)], { type: tipo }), path.basename(archivo));
  const r = await fetch(`${BASE}/uploads/${esVideo ? "videos" : "images"}`, { method: "POST", headers: { authorization: `Bearer ${CFG.apimartKey}` }, body: fd, signal: AbortSignal.timeout(300000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(`APIMart no aceptó el archivo (${r.status}): ${j?.error?.message || j?.message || ""}`.trim());
  return j.url;
}

async function esperarVideo(tarea, avisar, etiqueta, minutos = 20) {
  const t0 = Date.now();
  for (;;) {
    await espera(8000);
    const s = (await llamar(`/tasks/${encodeURIComponent(tarea)}?language=es`))?.data || {};
    avisar({ progreso: Math.min(0.95, (s.progress || 0) / 100), msg: `${etiqueta}: ${s.status || "en cola"} ${s.progress ? s.progress + "%" : ""} (${Math.round((Date.now() - t0) / 60000)} min)` });
    if (s.status === "completed") {
      const url = s.result?.videos?.[0]?.url?.[0] || s.result?.videos?.[0]?.url;
      if (!url) throw new Error("APIMart terminó pero sin video.");
      const v = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!v.ok) throw new Error(`No pude bajar el video de APIMart (${v.status}).`);
      return Buffer.from(await v.arrayBuffer());
    }
    if (s.status === "failed" || s.status === "cancelled") throw new Error(`APIMart: ${s.error?.message || s.status}`);
    if (Date.now() - t0 > minutos * 60000) throw new Error(`APIMart tardó más de ${minutos} minutos.`);
  }
}
async function pedirVideo(cuerpo, avisar, etiqueta) {
  const r = await llamar("/videos/generations", cuerpo);
  const tarea = r?.data?.[0]?.task_id;
  if (!tarea) throw new Error("APIMart no devolvió el número de tarea.");
  return esperarVideo(tarea, avisar, etiqueta);
}
const ratioVideo = (f) => (["16:9", "4:3", "1:1", "3:4", "9:16"].includes(f) ? f : f === "4:5" ? "3:4" : "9:16");

// anuncios en video con "Clips de video con IA": anima la imagen de cada escena con Seedance 2.5 (primer cuadro = la imagen)
export async function animarEscenas(id, avisar = () => {}, { max = 6, segundos = 5 } = {}) {
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  const pend = g.escenas.map((e, k) => ({ e, n: k + 1, f: clipDeEscena(id, k + 1) })).filter((x) => x.f && /\.(jpe?g|png|webp)$/i.test(x.f)).slice(0, max);
  if (!pend.length) return { animados: 0 };
  let animados = 0; const fallos = [];
  for (const [k, { e, n, f }] of pend.entries()) {
    try {
      const url = await subir(f);
      const buf = await pedirVideo({ model: process.env.APIMART_MODELO_VIDEO || "seedance-2.5", prompt: `${e.imagen || e.flowPrompt || ""} Subtle natural motion, slow cinematic camera push-in, no text, no logos.`,
        size: ratioVideo(p.formato), resolution: "720p", duration: segundos, generate_audio: false, image_with_roles: [{ url, role: "first_frame" }] },
        (a) => avisar({ ...a, paso: "fondo", progreso: (k + (a.progreso || 0)) / pend.length }), `Animando escena ${n} (${k + 1}/${pend.length})`);
      fs.renameSync(f, f.replace(/\.(jpe?g|png|webp)$/i, ".foto$&")); // la foto se guarda aparte por si quieres volver a ella
      fs.writeFileSync(path.join(dirClips(id), `escena-${n}.mp4`), buf); animados++;
    } catch (er) { fallos.push(`escena ${n}: ${er.message}`); if (/llave|saldo/i.test(er.message)) break; }
  }
  if (!animados && fallos.length) throw new Error(fallos.join(" | "));
  return { animados, fallos };
}

// ---------------- cambiar el avatar (estilo Genjutsu) ----------------
// Tu video (fuente) + la foto del personaje (p. ej. una mamá mexicana) → mismo movimiento, cámara y audio, otra persona.
// Motores: "kling" (Kling Motion Control: guarda el audio original, hasta 30 s) o "seedance" (Seedance 2.5 con el video de
// referencia en modo edición; el audio original se vuelve a poner con ffmpeg). Idea tomada de open-genjutsu (MIT).
export const dirAvatar = (id) => path.join(dirProyecto(id), "avatar");
export function archivosAvatar(id) {
  const d = dirAvatar(id), ls = fs.existsSync(d) ? fs.readdirSync(d) : [];
  const f = (re) => { const x = ls.find((n) => re.test(n)); return x ? path.join(d, x) : null; };
  return { fuente: f(/^fuente\.(mp4|mov|webm)$/i), avatar: f(/^avatar\.(jpe?g|png|webp)$/i), resultado: f(/^resultado\.mp4$/i) };
}
export async function cambiarAvatar(id, avisar = () => {}, { motor = "kling", calidad = "std", descripcion = "" } = {}) {
  const { ffmpeg, duracion } = await import("./ff.js");
  const p = leer(id, "proyecto.json"), d = dirAvatar(id);
  let { fuente, avatar } = archivosAvatar(id);
  if (!fuente) throw new Error("Sube primero tu video (el que se va a reactuar).");
  const dur = await duracion(fuente).catch(() => 0);
  if (dur && dur < 3) throw new Error("El video debe durar al menos 3 segundos.");
  if (dur > 30) throw new Error("El video debe durar 30 segundos o menos (recórtalo).");
  // sin foto del personaje: se genera de la descripción (cuerpo completo, fondo liso)
  if (!avatar) {
    const desc = String(descripcion || p.avatarDescripcion || "").trim();
    if (!desc) throw new Error("Sube la foto del personaje o escribe cómo es (p. ej. 'mamá mexicana de 35 años, cabello castaño, blusa blanca').");
    avisar({ paso: "fondo", progreso: 0.02, msg: "Creando la foto del personaje con APIMart…" });
    const r = await generarImagen(`Full body photo of a fictional person: ${desc}. Standing, front view, neutral pose, natural light, plain light background, photorealistic, no text.`, { size: "9:16", resolucion: "2K" });
    fs.mkdirSync(d, { recursive: true }); avatar = path.join(d, `avatar${r.ext}`); fs.writeFileSync(avatar, r.bytes);
  }
  avisar({ paso: "fondo", progreso: 0.05, msg: "Subiendo video y personaje a APIMart…" });
  const [urlV, urlA] = [await subir(fuente), await subir(avatar)];
  const av = (a) => avisar({ ...a, paso: "fondo" });
  let buf;
  if (motor === "seedance") {
    buf = await pedirVideo({ model: "seedance-2.5", omni_reference_task_type: "edit", video_urls: [urlV], image_urls: [urlA], generate_audio: false,
      prompt: "Replace the main person in @视频1 with the person from @图片1 (same face, hair, body and clothes). Keep exactly the same motion, gestures, camera, framing, background, lighting and timing. No text.",
      size: ratioVideo(p.formato), resolution: "720p", duration: Math.max(4, Math.min(30, Math.round(dur || 8))) }, av, "Cambiando el avatar (Seedance)");
  } else {
    buf = await pedirVideo({ model: process.env.APIMART_MODELO_AVATAR || "kling-v2-6-motion-control", image_url: urlA, video_url: urlV, character_orientation: "video", mode: calidad === "pro" ? "pro" : "std",
      keep_original_sound: "yes", prompt: "Same motion, gestures, camera and background as the reference video; natural, photorealistic." }, av, "Cambiando el avatar (Kling)");
  }
  const crudo = path.join(d, "crudo.mp4"), res = path.join(d, "resultado.mp4");
  fs.writeFileSync(crudo, buf);
  // el audio de tu video se respeta (Seedance sale mudo; Kling ya lo trae, pero así queda idéntico)
  await ffmpeg(["-i", crudo, "-i", fuente, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", res]).catch(() => fs.copyFileSync(crudo, res));
  // queda como clip de la escena 1 (para armar el anuncio con subtítulos y botón) y como pieza suelta en listos/
  fs.mkdirSync(dirClips(id), { recursive: true });
  for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith("escena-1.")) fs.rmSync(path.join(dirClips(id), x));
  fs.copyFileSync(res, path.join(dirClips(id), "escena-1.mp4"));
  const { DIR_LISTOS } = await import("./config.js");
  fs.copyFileSync(res, path.join(DIR_LISTOS, `${id}-avatar.mp4`));
  return { archivo: `listos/${id}-avatar.mp4`, segundos: Math.round(dur) };
}
