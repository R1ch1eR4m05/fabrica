// "Revisar antes de publicar": mide el final.mp4 y da un semáforo (verde / amarillo / rojo) por cosa:
//  formato, gancho (movimiento de los primeros 2 s), brillo (qué tan oscuro y cuánto casi negro),
//  volumen (LUFS integrados y pico), pantallas negras y congeladas, y una tira a tamaño celular para mirar.
// Idea y umbrales base tomados de qc.py de cinecode (MIT, Sarp Yıldız); código propio.
import fs from "node:fs";
import path from "node:path";
import { CFG, FORMATOS } from "./config.js";
import { dirProyecto, leer } from "./proyectos.js";
import { spawn } from "node:child_process";
import { correr, ffmpeg, duracion } from "./ff.js";

// ffmpeg escribe las mediciones (loudnorm, blackdetect, freezedetect) en stderr
const medir = (args) => new Promise((res, rej) => {
  const p = spawn(CFG.ffmpeg, ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => (err += d)); p.on("error", rej); p.on("close", () => res(err));
});
const ORDEN = { verde: 0, amarillo: 1, rojo: 2 };
const peor = (a, b) => (ORDEN[a] >= ORDEN[b] ? a : b);

// cuadros en gris, chiquitos, como un solo buffer
async function cuadrosGris(archivo, { desde = 0, dur, fps, w = 96, h = 96 }) {
  const args = ["-v", "error", "-ss", String(desde), ...(dur ? ["-t", String(dur)] : []), "-i", archivo,
    "-vf", `fps=${fps},scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"];
  const buf = await new Promise((res, rej) => {
    const p = spawn(CFG.ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    const partes = []; p.stdout.on("data", (d) => partes.push(d)); p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(Buffer.concat(partes)) : rej(new Error("ffmpeg no pudo leer los cuadros"))));
  });
  const n = Math.floor(buf.length / (w * h));
  return Array.from({ length: n }, (_, i) => buf.subarray(i * w * h, (i + 1) * w * h));
}

async function gancho(archivo) {
  // energía de movimiento: diferencia promedio entre cuadros seguidos (0-255) en los primeros 2 s
  const cs = await cuadrosGris(archivo, { desde: 0, dur: 2, fps: 12 });
  let suma = 0, n = 0;
  for (let i = 1; i < cs.length; i++) { let d = 0; const a = cs[i - 1], b = cs[i]; for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]); suma += d / a.length; n++; }
  const energia = n ? +(suma / n).toFixed(2) : 0;
  const estado = energia < 0.5 ? "rojo" : energia < 1.2 ? "amarillo" : "verde";
  const msg = estado === "rojo" ? "Los primeros 2 s están casi quietos: la gente pasa de largo. Que algo se mueva desde el cuadro 0."
    : estado === "amarillo" ? "Poco movimiento al inicio. Un acercamiento más rápido o texto que entre con movimiento ayuda." : "El inicio se mueve.";
  return { estado, valor: energia, msg };
}

async function brillo(archivo) {
  const cs = await cuadrosGris(archivo, { fps: 1 });
  let suma = 0, oscuros = 0, total = 0;
  for (const c of cs) for (let k = 0; k < c.length; k++) { suma += c[k]; if (c[k] < 30) oscuros++; total++; }
  const prom = total ? suma / total : 0, pct = total ? (100 * oscuros) / total : 0;
  const estado = prom < 38 || pct > 70 ? "rojo" : prom < 55 || pct > 50 ? "amarillo" : "verde";
  const msg = estado === "verde" ? "Brillo bien." : `Se ve muy oscuro (${Math.round(pct)} % del cuadro casi negro). En el feed lo oscuro se ve chico y apagado, y hasta parece que tiene bordes.`;
  return { estado, valor: Math.round(prom), oscuroPct: Math.round(pct), msg };
}

async function volumen(archivo) {
  const txt = await medir(["-i", archivo, "-vn", "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]);
  const m = String(txt).match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return { estado: "amarillo", msg: "No pude medir el volumen (¿el video no trae audio?)." };
  const j = JSON.parse(m[0]), lufs = +j.input_i, pico = +j.input_tp;
  if (!isFinite(lufs) || lufs < -60) return { estado: "rojo", valor: lufs, msg: "El video no tiene sonido." };
  let estado = lufs >= -17 && lufs <= -12 ? "verde" : lufs >= -20 && lufs <= -10 ? "amarillo" : "rojo";
  if (pico > -0.5) estado = peor(estado, "amarillo");
  const msg = estado === "verde" ? `Volumen bien (${lufs} LUFS).`
    : lufs < -17 ? `Se oye bajito (${lufs} LUFS; lo ideal en redes es -14 a -16).` : lufs > -12 ? `Se oye muy fuerte (${lufs} LUFS).` : `Pico muy alto (${pico} dBTP): puede tronar en algunos teléfonos.`;
  return { estado, valor: lufs, pico, msg };
}

async function negrosYCongelados(archivo) {
  const txt = await medir(["-i", archivo, "-vf", "blackdetect=d=0.4:pix_th=0.06,freezedetect=n=0.002:d=2", "-an", "-f", "null", "-"]);
  const negros = [...String(txt).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  const cong = [...String(txt).matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const estado = negros.some(([a]) => a < 1) || cong.some((a) => a < 2) ? "rojo" : negros.length || cong.length ? "amarillo" : "verde";
  const partes = [];
  if (negros.length) partes.push(`pantalla negra en ${negros.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)} s`).join(", ")}`);
  if (cong.length) partes.push(`imagen congelada desde ${cong.map((a) => `${a.toFixed(1)} s`).join(", ")}`);
  return { estado, negros, congelados: cong, msg: partes.length ? partes.join("; ") + "." : "Sin pantallas negras ni congeladas." };
}

async function formato(archivo, p) {
  const o = await correr(CFG.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", archivo]);
  const [w, h, fr] = o.trim().split(","), fps = fr.split("/").reduce((a, b) => a / b);
  const esperado = FORMATOS[p.formato] || null;
  let estado = "verde", msg = `${w}×${h} a ${Math.round(fps)} fps.`;
  if (esperado && (+w !== esperado.w || +h !== esperado.h)) { estado = "rojo"; msg = `Mide ${w}×${h} y debería ser ${esperado.w}×${esperado.h}.`; }
  else if (p.formato === "9:16" && (+w < 1080)) { estado = "amarillo"; msg += " Menos de 1080 de ancho: se puede ver borroso."; }
  return { estado, w: +w, h: +h, fps: +fps.toFixed(2), msg };
}

async function tiraCelular(archivo, dur, salida) {
  const ts = [0.5, Math.min(3, dur * 0.2), dur * 0.5, Math.max(0, dur - 1.5)];
  const tmp = salida.replace(/\.jpg$/, "");
  const fs_ = [];
  for (const [i, t] of ts.entries()) { const f = `${tmp}-${i}.jpg`; await ffmpeg(["-ss", t.toFixed(2), "-i", archivo, "-frames:v", "1", "-vf", "scale=390:-2", f]); fs_.push(f); }
  await ffmpeg([...fs_.flatMap((f) => ["-i", f]), "-filter_complex", `hstack=${fs_.length}`, "-q:v", "3", salida]);
  for (const f of fs_) fs.rmSync(f, { force: true });
  return ts.map((t) => +t.toFixed(1));
}

export async function revisar(id, { avisar = () => {} } = {}) {
  const dir = dirProyecto(id), archivo = path.join(dir, "final.mp4");
  if (!fs.existsSync(archivo)) throw new Error("Este video todavía no tiene final.mp4.");
  const p = leer(id, "proyecto.json") || {};
  avisar({ paso: "render", progreso: 0.1, msg: "Revisando antes de publicar…" });
  const dur = await duracion(archivo);
  const r = { fecha: new Date().toISOString(), duracion: +dur.toFixed(1) };
  r.formato = await formato(archivo, p);
  r.gancho = await gancho(archivo);
  avisar({ paso: "render", progreso: 0.35, msg: "Midiendo brillo y volumen…" });
  r.brillo = await brillo(archivo);
  r.volumen = await volumen(archivo);
  r.cortes = await negrosYCongelados(archivo);
  r.celular = { archivo: "revision-celular.jpg", tiempos: await tiraCelular(archivo, dur, path.join(dir, "revision-celular.jpg")),
    msg: "Así se ve a tamaño de celular: revisa que el texto se lea sin acercarte." };
  r.estado = ["formato", "gancho", "brillo", "volumen", "cortes"].reduce((e, k) => peor(e, r[k].estado), "verde");
  fs.writeFileSync(path.join(dir, "revision.json"), JSON.stringify(r, null, 2));
  avisar({ paso: "render", progreso: 1, msg: `Revisión: ${r.estado}.` });
  return r;
}

export const leerRevision = (id) => { try { return JSON.parse(fs.readFileSync(path.join(dirProyecto(id), "revision.json"), "utf8")); } catch { return null; } };
