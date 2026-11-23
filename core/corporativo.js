// Corporativo (tipo Absen «Beyond the Display»): montaje de material REAL de la marca (videos y fotos que sube Richie a
// proyectos/<id>/material/) + tomas cinematográficas de Wan 3.0 solo donde no hace falta mostrar el producto real
// (gancho, «mundos» de uso), narración de ElevenLabs, música, subtítulos y sobreimpresos. Render con ffmpeg.
// Cada escena del guion trae UNA fuente:
//   "fuente": "material/V1.mp4" + "desde"/"hasta" (segundos del archivo) · "material/I2.jpg" (foto con movimiento lento)
//   "wan": "<prompt en inglés>" (+ "duracionToma" 4-15 s, "refs": ["material/I2.jpg"]) → clips/escena-N.mp4 generado (gasta)
//   o un clip subido a mano a clips/escena-N.* (manda sobre todo lo demás).
// Sobreimpresos: "sobre" (texto grande al centro) y "etiqueta" (texto chico, p. ej. lugar o dato).
import fs from "node:fs";
import path from "node:path";
import { FORMATOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { ffmpeg, duracion, medidas } from "./ff.js";
import { dirClips, clipDeEscena } from "./historia.js";

export const dirMaterial = (id) => path.join(dirProyecto(id), "material");
const VID = /\.(mp4|mov|webm|m4v|mkv)$/i, IMG = /\.(jpe?g|png|webp)$/i;
export function material(id) {
  const d = dirMaterial(id); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((x) => VID.test(x) || IMG.test(x)).sort();
}
// "material/V1.mp4", "V1.mp4" o "V1" → ruta real dentro de material/ (sin salirse de la carpeta)
export function resolverMaterial(id, ref) {
  if (!ref) return null;
  const nombre = path.basename(String(ref).replace(/\\/g, "/"));
  const lista = material(id);
  const x = lista.find((f) => f === nombre) || lista.find((f) => f.replace(/\.[^.]+$/, "").toLowerCase() === nombre.replace(/\.[^.]+$/, "").toLowerCase());
  return x ? path.join(dirMaterial(id), x) : null;
}

// tomas de Wan que faltan: escenas con "wan" (texto) y sin clip propio
export function tomasPendientes(id) {
  const g = leer(id, "guion.json") || {};
  return (g.escenas || []).map((e, k) => ({ e, n: k + 1 })).filter(({ e, n }) => typeof e.wan === "string" && e.wan.trim() && !clipDeEscena(id, n));
}
export const segundosToma = (e) => Math.min(15, Math.max(4, Math.round(+e.duracionToma || 8)));

export async function generarTomas(id, avisar = () => {}) {
  const W = await import("./wan.js");
  const p = leer(id, "proyecto.json"), c = W.configWan(p);
  const faltan = tomasPendientes(id);
  if (!faltan.length) return { hechas: 0 };
  if (!p.wan?.confirmado) throw new Error("Las tomas de Wan gastan: confírmalas con «Generar con Wan» en el panel.");
  p.wan = { ...(p.wan || {}), confirmado: false }; guardar(id, "proyecto.json", p); // vale para una tanda
  const g = leer(id, "guion.json"), vertical = (p.formato || "16:9") === "9:16";
  const visual = g.wanEstilo || "Cinematic commercial shot, shot on ARRI Alexa, anamorphic lens, shallow depth of field, rich contrast, natural film grain";
  fs.mkdirSync(dirClips(id), { recursive: true });
  let hechas = 0; const errores = [];
  for (const [i, { e, n }] of faltan.entries()) {
    const prompt = `ONE CONTINUOUS SHOT, no cuts. ${e.wan}. ${visual}. No text, no letters, no logos, no watermark, no subtitles.`;
    const refs = (e.refs || []).map((r) => resolverMaterial(id, r)).filter((f) => f && IMG.test(f)).slice(0, 9);
    avisar({ paso: "fondo", progreso: i / faltan.length, msg: `Toma ${i + 1} de ${faltan.length} (escena ${n}) con Wan por ${c.motor === "higgsfield" ? "Higgsfield" : "APIMart"}…` });
    try {
      const buf = await W.generarClip({ motor: c.motor, modelo: c.modelo, prompt, segundos: segundosToma(e), resolucion: c.resolucion, vertical, refs, audio: false },
        (a) => avisar({ ...a, paso: "fondo", progreso: (i + (a.progreso || 0)) / faltan.length }));
      fs.writeFileSync(path.join(dirClips(id), `escena-${n}.mp4`), buf); hechas++;
      fs.writeFileSync(path.join(dirClips(id), `escena-${n}.prompt.txt`), prompt);
    } catch (err) { errores.push(`escena ${n}: ${err.message}`); if (/saldo|credit|sesi|instalad|llave/i.test(err.message)) break; }
  }
  const p2 = leer(id, "proyecto.json");
  p2.wan = { ...(p2.wan || {}), generaciones: [...(p2.wan?.generaciones || []), { fecha: new Date().toISOString(), motor: c.motor, tomas: hechas, segundos: faltan.slice(0, hechas).reduce((a, x) => a + segundosToma(x.e), 0) }] };
  guardar(id, "proyecto.json", p2);
  if (errores.length) throw new Error(`Salieron ${hechas} de ${faltan.length} tomas. ${errores.join(" · ")}`);
  return { hechas };
}

// arma clips/historia.json (lo que usa render-ffmpeg): por escena { archivo, tipo }
export async function prepararCorporativo(id, avisar = () => {}) {
  const g = leer(id, "guion.json"), p = leer(id, "proyecto.json"), fmt = FORMATOS[p.formato] || FORMATOS["16:9"];
  fs.mkdirSync(dirClips(id), { recursive: true });
  const info = []; const avisos = []; let ultima = null;
  for (const [k, e] of g.escenas.entries()) {
    const n = k + 1;
    let archivo = clipDeEscena(id, n), tipo = archivo ? (VID.test(archivo) ? "video" : "imagen") : null;
    if (!archivo && e.fuente) {
      const src = resolverMaterial(id, e.fuente);
      if (!src) avisos.push(`escena ${n}: no encuentro «${e.fuente}» en material/`);
      else if (IMG.test(src)) { archivo = src; tipo = "imagen"; }
      else {
        // recorte del video real: de "desde" a "hasta" (o lo que dure), sin audio y a la medida
        const corte = path.join(dirClips(id), `corte-${n}.mp4`);
        const D = await duracion(src).catch(() => 0);
        const a = Math.max(0, +e.desde || 0), b = Math.min(D || Infinity, +e.hasta || (a + 12));
        // video vertical en proyecto horizontal (o al revés): si se recorta para llenar se pierde 2/3 de la imagen
        // (y los letreros quemados de los Shorts), así que va completo al centro sobre su misma imagen desenfocada.
        // En el guion: "ajuste": "llenar" (recorta) | "fondo" (desenfocado); sin él, se decide por la forma.
        const m = await medidas(src).catch(() => ({ w: 0, h: 0 }));
        const dif = m.w && m.h ? Math.abs(Math.log((m.w / m.h) / (fmt.w / fmt.h))) : 0;
        const ajuste = e.ajuste === "llenar" || e.ajuste === "fondo" ? e.ajuste : dif > 0.35 ? "fondo" : "llenar";
        const marca = JSON.stringify([a, b, ajuste]);
        if (!fs.existsSync(corte) || fs.statSync(corte).mtimeMs < fs.statSync(src).mtimeMs || marca !== (fs.existsSync(corte + ".json") ? fs.readFileSync(corte + ".json", "utf8") : "")) {
          avisar({ paso: "render", msg: `Escena ${n}: recortando ${path.basename(src)} (${a}-${b.toFixed(1)} s${ajuste === "fondo" ? ", con fondo desenfocado" : ""})…` });
          const W = fmt.w, H = fmt.h;
          const filtro = ajuste === "fondo"
            ? ["-filter_complex", `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12:saturation=0.85[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p[v]`, "-map", "[v]"]
            : ["-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30`];
          await ffmpeg(["-ss", String(a), "-i", src, "-t", String(Math.max(0.5, b - a)), "-an", ...filtro, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", corte]);
          fs.writeFileSync(corte + ".json", marca);
        }
        archivo = corte; tipo = "video";
      }
    }
    if (!archivo && typeof e.wan === "string") avisos.push(`escena ${n}: falta la toma de Wan (usa la escena anterior)`);
    if (!archivo && ultima) ({ archivo, tipo } = ultima);
    if (archivo) ultima = { archivo, tipo };
    info.push(archivo ? { archivo: path.relative(dirProyecto(id), archivo).replace(/\\/g, "/"), tipo } : {});
  }
  guardar(id, path.join("clips", "historia.json"), info);
  if (avisos.length) avisar({ paso: "render", msg: "Ojo: " + avisos.join(" · ") });
  return { escenas: info.length, avisos };
}

// sobreimpresos (ASS): "sobre" grande al centro (estilo T) y "etiqueta" chica (estilo C), durante su escena
const tc = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const limpia = (t) => String(t).replace(/[{}\\]/g, "").replace(/\n/g, "\\N");
export function sobreimpresos(guion, tiempos, fmt = { w: 1920, h: 1080 }) {
  const cx = Math.round(fmt.w / 2), y1 = Math.round(fmt.h * (fmt.h > fmt.w ? 0.4 : 0.44)), y2 = Math.round(fmt.h * (fmt.h > fmt.w ? 0.47 : 0.56));
  const lin = [];
  for (const [k, e] of (guion.escenas || []).entries()) {
    const te = tiempos.escenas[k]; if (!te) continue;
    const ini = te.ini + 0.15, fin = (tiempos.escenas[k + 1]?.ini ?? tiempos.duracion) - 0.1;
    const fade = "{\\fad(250,250)}";
    if (e.sobre) lin.push(`Dialogue: 1,${tc(ini)},${tc(fin)},T,,0,0,0,,{\\an5\\pos(${cx},${y1})\\fscx118\\fscy118}${fade}${limpia(e.sobre)}`);
    if (e.etiqueta) lin.push(`Dialogue: 1,${tc(ini)},${tc(fin)},C,,0,0,0,,{\\an5\\pos(${cx},${e.sobre ? y2 : y1})}${fade}${limpia(e.etiqueta)}`);
  }
  return lin.length ? "\n" + lin.join("\n") + "\n" : "";
}
