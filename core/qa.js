// QA que BLOQUEA (nov 2026): antes de programar en GHL, cada video pasa esta lista. Si algo falla, no se programa.
// Distinto de revision.js (semáforo de calidad para mejorar): aquí cada punto es aprobado / rechazado con su motivo.
// Deja proyectos/<id>/qa.json, qa-cuadro.jpg (cuadro de verificación) y listos/<id>-qa.txt (reporte).
// renderConQA(): si el render falla o sale sin audio / sin subtítulos / corrupto, reintenta UNA vez y luego lo marca fallido.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { correr, ffmpeg, duracion } from "./ff.js";
import { leerCopys } from "./copy.js";
import { puntuarTitulo, leerMetadatos, generarMetadatos } from "./metadatos.js";
import { exigeSerie, marcaDe, etiquetaSerie } from "./serie.js";

const MEDIDAS = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };
// duración: Short/Reel 9:16 (Richie eligió 20-30 s; se acepta 15-60 s y fuera de 20-30 solo avisa); largo 16:9 ≥ 60 s (ideal 10-15 min)
export const DURACION = { short: { min: 15, max: 60, ideal: [20, 30] }, largo: { min: 60, max: 3 * 3600, ideal: [600, 900] } };
// motivos por los que vale la pena volver a renderizar (lo demás se arregla en el guion o el copy)
const REINTENTABLES = ["archivo", "audio", "subtitulos", "codec"];

const stderr = (args) => new Promise((res, rej) => {
  const p = spawn(CFG.ffmpeg, ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  let e = ""; p.stderr.on("data", (d) => (e += d)); p.on("error", rej); p.on("close", (c) => res({ codigo: c, texto: e }));
});
const tipoDe = (p) => (p.formato === "16:9" && (p.duracion === "largo" || (p.estilo === "filosofia-larga"))) ? "largo" : "short";

export async function qaVideo(id, { regenerarMetadatos = false } = {}) {
  const dir = dirProyecto(id), f = path.join(dir, "final.mp4"), p = leer(id, "proyecto.json") || {};
  const checks = {}, ok = (k, msg, extra = {}) => (checks[k] = { ok: true, msg, ...extra }), mal = (k, msg, extra = {}) => (checks[k] = { ok: false, msg, ...extra });
  const tipo = tipoDe(p);

  // 1. archivo: existe, ffprobe lo abre y se decodifica entero sin errores
  let info = null;
  if (!fs.existsSync(f)) mal("archivo", "No hay final.mp4.");
  else {
    try {
      info = JSON.parse(await correr(CFG.ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", f]));
      const dec = await stderr(["-v", "error", "-i", f, "-f", "null", "-"]);
      const errores = dec.texto.split("\n").filter((l) => l.trim()).slice(0, 3);
      if (dec.codigo !== 0 || errores.length) mal("archivo", `El archivo tiene errores al leerlo: ${errores.join(" · ") || "código " + dec.codigo}`);
      else ok("archivo", "Se lee completo sin errores.");
    } catch (e) { mal("archivo", "No se pudo abrir: " + e.message.slice(0, 160)); }
  }
  const v = info?.streams?.find((s) => s.codec_type === "video"), a = info?.streams?.find((s) => s.codec_type === "audio");
  const dur = info ? +(+info.format?.duration || 0).toFixed(1) : 0;

  // 2. formato según el tipo (Short/Reel 9:16, largo 16:9) y medidas exactas
  if (v) {
    const [W, H] = MEDIDAS[p.formato] || [];
    const esperado = tipo === "largo" ? "16:9" : "9:16";
    if (p.formato !== esperado && !(tipo === "short" && ["1:1", "4:5"].includes(p.formato))) mal("formato", `Es ${p.formato} y para ${tipo === "largo" ? "video largo" : "Short/Reel"} debe ser ${esperado}.`);
    else if (W && (v.width !== W || v.height !== H)) mal("formato", `Mide ${v.width}×${v.height} y debe medir ${W}×${H}.`);
    else ok("formato", `${p.formato} · ${v.width}×${v.height}.`);
    // 3. códec: H.264 High, yuv420p (nunca yuv444p: muchos teléfonos y Facebook no lo reproducen)
    const perfil = String(v.profile || "");
    if (v.codec_name !== "h264") mal("codec", `Códec ${v.codec_name}; debe ser H.264.`);
    else if (v.pix_fmt !== "yuv420p") mal("codec", `Color ${v.pix_fmt}; debe ser yuv420p.`);
    else if (!/^High/i.test(perfil)) mal("codec", `Perfil H.264 «${perfil}»; debe ser High.`);
    else ok("codec", `H.264 ${perfil}, ${v.pix_fmt}.`);
  }

  // 4. duración correcta para su tipo
  if (info) {
    const r = DURACION[tipo];
    if (dur < r.min || dur > r.max) mal("duracion", `Dura ${dur} s; ${tipo === "largo" ? "un video largo" : "un Short/Reel"} debe durar entre ${r.min} y ${r.max} s.`, { valor: dur });
    else ok("duracion", `${dur} s${dur < r.ideal[0] || dur > r.ideal[1] ? ` (aviso: lo ideal es ${r.ideal[0]}-${r.ideal[1]} s)` : ""}.`, { valor: dur, aviso: dur < r.ideal[0] || dur > r.ideal[1] });
  }

  // 5. audio presente y normalizado (-18 a -12 LUFS; la fábrica apunta a -14/-16)
  if (info && !a) mal("audio", "El video no trae pista de audio.");
  else if (a) {
    const m = await stderr(["-i", f, "-vn", "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]);
    const j = (() => { try { return JSON.parse(m.texto.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/)[0]); } catch { return null; } })();
    const lufs = j ? +j.input_i : NaN;
    if (!isFinite(lufs) || lufs < -50) mal("audio", "El audio está en silencio.");
    else if (lufs < -18 || lufs > -12) mal("audio", `Volumen ${lufs} LUFS; debe estar entre -18 y -12 (usa «Nivelar volumen» en Revisar).`, { lufs });
    else ok("audio", `Audio normalizado (${lufs} LUFS).`, { lufs });
  }

  // 6. subtítulos: el estilo los quema en el video (no se pueden apagar) y hay palabras con tiempo para cada escena con voz
  const est = leerEstilo(p.estilo) || {}, t = leer(id, "tiempos.json"), o = p.opciones || {};
  const apagados = o.subtitulos === "no" || est.tipo === "motion";
  const palabras = (t?.escenas || []).reduce((n, e) => n + (e.palabras?.length || 0), 0);
  if (apagados) mal("subtitulos", est.tipo === "motion" ? "Los motion no llevan subtítulos automáticos: revisa a mano que el texto esté en pantalla." : "Los subtítulos están apagados en las opciones del video.", { config: true });
  else if (!palabras) mal("subtitulos", "No hay tiempos de palabras (tiempos.json): el video saldría sin subtítulos. Haz la voz otra vez.");
  else ok("subtitulos", `Subtítulos quemados en el video (${palabras} palabras con su tiempo).`);

  // 7. metadatos: título que vende (fórmula), descripción no vacía, serie
  let meta = leerMetadatos(id);
  if (!meta || regenerarMetadatos) { try { meta = await generarMetadatos(id); } catch (e) { meta = null; } }
  const c = leerCopys(id), tituloYT = String(c.youtube?.titulo || "").replace(/#\w+/g, "").trim(), descYT = String(c.youtube?.descripcion || "").trim();
  const pt = puntuarTitulo(tituloYT);
  if (!pt.ok) mal("titulo", `Título «${tituloYT || "(vacío)"}»: ${pt.motivos.filter((x) => x.startsWith("✗")).join("; ")}.`, { titulo: tituloYT });
  else ok("titulo", `«${tituloYT}» (${pt.puntos} puntos).`, { titulo: tituloYT, puntos: pt.puntos });
  if (!descYT || descYT.length < 30) mal("descripcion", "La descripción de YouTube está vacía o es demasiado corta.");
  else if (!String(c.facebook || "").trim()) mal("descripcion", "El texto de Facebook está vacío.");
  else ok("descripcion", "Descripciones de YouTube y Facebook listas.");
  const p2 = leer(id, "proyecto.json") || p; // los metadatos pudieron asignarle serie hace un momento
  const marca = marcaDe(p2);
  if (exigeSerie(marca)) { if (p2.serie?.nombre) ok("serie", etiquetaSerie(p2.serie)); else mal("serie", "El video no pertenece a ninguna serie."); }

  // cuadro de verificación (a la mitad del video) y reporte
  let cuadro = null;
  if (checks.archivo?.ok) { try { cuadro = "qa-cuadro.jpg"; await ffmpeg(["-ss", String(Math.max(0, dur / 2).toFixed(2)), "-i", f, "-frames:v", "1", "-vf", "scale=540:-2", path.join(dir, cuadro)]); } catch { cuadro = null; } }
  const motivos = Object.entries(checks).filter(([, x]) => !x.ok).map(([k, x]) => `${k}: ${x.msg}`);
  const r = {
    fecha: new Date().toISOString(), id, tipo, aprobado: !motivos.length, estado: motivos.length ? "rechazado" : "aprobado", motivos, checks,
    titulo: tituloYT, duracion: dur, resolucion: v ? `${v.width}×${v.height}` : "", serie: etiquetaSerie(p2.serie),
    vistasEsperadas: "sin estimar: la fábrica no inventa vistas", cuadro, mtimeFinal: fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0,
  };
  guardar(id, "qa.json", r);
  const txt = [`QA · ${id}`, `Estado: ${r.estado.toUpperCase()}`, `Título: ${r.titulo || "(sin título)"}`, `Serie: ${r.serie || "—"}`, `Tipo: ${tipo === "largo" ? "video largo" : "Short/Reel"}`,
    `Duración: ${dur} s · Resolución: ${r.resolucion || "—"}`, `Vistas esperadas: ${r.vistasEsperadas}`, "", ...Object.entries(checks).map(([k, x]) => `${x.ok ? "✓" : "✗"} ${k}: ${x.msg}`)].join("\n");
  try { fs.writeFileSync(path.join(DIR_LISTOS, `${id}-qa.txt`), txt + "\n"); } catch {}
  return r;
}

export const leerQA = (id) => leer(id, "qa.json");
// ¿el QA sigue valiendo para el final.mp4 actual?
export function qaVigente(id) {
  const q = leerQA(id), f = path.join(dirProyecto(id), "final.mp4");
  return q && fs.existsSync(f) && Math.abs(fs.statSync(f).mtimeMs - q.mtimeFinal) < 50 ? q : null;
}

// render + QA; si falla por algo que un nuevo render puede arreglar, reintenta una vez; luego marca el video como fallido
export async function renderConQA(id, avisar = () => {}, renderizar) {
  const p0 = leer(id, "proyecto.json");
  try { await generarMetadatos(id); } catch (e) { console.warn("Metadatos:", e.message); } // antes de renderizar
  let ultimoError = null;
  for (let intento = 1; intento <= 2; intento++) {
    let r = null;
    try { r = await renderizar(id, avisar); ultimoError = null; } catch (e) { ultimoError = e; }
    if (!ultimoError) {
      const q = await qaVideo(id);
      if (q.aprobado) { marcarQA(id, "aprobado", []); return { ...r, qa: q }; }
      const graves = Object.keys(q.checks).filter((k) => !q.checks[k].ok && !q.checks[k].config && REINTENTABLES.includes(k)); // lo que es de configuración no se arregla renderizando
      if (!graves.length || intento === 2) { marcarQA(id, intento === 2 && graves.length ? "fallido" : "rechazado", q.motivos); return { ...r, qa: q }; }
      avisar({ paso: "render", progreso: 0.05, msg: `QA: ${graves.join(", ")} falló. Reintento el render una vez…` });
    } else if (intento === 1) avisar({ paso: "render", progreso: 0.05, msg: `El render falló (${ultimoError.message.slice(0, 120)}). Reintento una vez…` });
  }
  marcarQA(id, "fallido", [ultimoError?.message || "render"]);
  if (ultimoError) throw ultimoError;
  return null;
  function marcarQA(i, estado, motivos) { const p = leer(i, "proyecto.json") || p0; p.qa = { estado, motivos, fecha: new Date().toISOString() }; guardar(i, "proyecto.json", p); }
}
