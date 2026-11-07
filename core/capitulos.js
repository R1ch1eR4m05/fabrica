// Cortar por capítulos: de un video largo ya hecho (final.mp4) saca
//  - cada capítulo como video propio (misma medida, con título al inicio y cierre suave) para Facebook, y
//  - un Reel vertical de 35-60 s por capítulo (se vuelve a armar en 9:16 con sus imágenes y subtítulos verticales).
// Todo queda en proyectos/<id>/capitulos/ y una copia en listos/, cada uno con su portada y su texto para subir.
import fs from "node:fs";
import path from "node:path";
import { FORMATOS, DIR_LISTOS, RAIZ } from "./config.js";
import { dirProyecto, leer, textoEscena } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { ffmpeg } from "./ff.js";
import { archivoASS, renderImagenes } from "./render-ffmpeg.js";

const PREVIO = 1.2, CIERRE = 1.0;          // segundos con el título antes de la voz / imagen quieta al final
const MIN_CAP = 75;                          // capítulos más cortos se juntan con el siguiente
const REEL_MIN = 45, REEL_MAX = 62;

export const dirCortes = (id) => path.join(dirProyecto(id), "capitulos");
export function listarCortes(id) { try { return JSON.parse(fs.readFileSync(path.join(dirCortes(id), "cortes.json"), "utf8")); } catch { return []; } }

const tc = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const ruta = (f) => f.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
const limpia = (t) => String(t || "").replace(/[{}\\]/g, "").replace(/\n/g, " ").trim();
const fuentes = () => path.join(RAIZ, "estilos", "_comun", "fuentes");

// tramos de capítulo: [{ titulo, desde (índice de escena), hasta (exclusivo) }]
export function tramos(guion) {
  const marcas = guion.escenas.map((e, k) => (e.capitulo ? k : -1)).filter((k) => k >= 0);
  if (!marcas.length) return [];
  const titulos = marcas.map((k) => guion.escenas[k].capitulo);
  marcas[0] = 0; // lo que va antes del primer capítulo es parte de él
  return marcas.map((k, j) => ({ titulo: titulos[j], desde: k, hasta: marcas[j + 1] ?? guion.escenas.length }));
}

function rango(tiempos, t) {
  const E = tiempos.escenas, ini = t.desde === 0 ? 0 : Math.max(0, E[t.desde].ini - 0.15);
  const fin = t.hasta < E.length ? E[t.hasta].ini - 0.05 : tiempos.duracion;
  return { ini, fin, dur: fin - ini };
}

function juntarCortos(ts, tiempos) {
  const out = [];
  for (const t of ts) {
    const prev = out[out.length - 1];
    if (prev && rango(tiempos, prev).dur < MIN_CAP) { prev.hasta = t.hasta; continue; }
    out.push({ ...t });
  }
  if (out.length > 1 && rango(tiempos, out[out.length - 1]).dur < MIN_CAP) { const ult = out.pop(); out[out.length - 1].hasta = ult.hasta; }
  return out;
}

function textoSubir(guion, t, n, total, reel) {
  const s = guion.subir || {};
  const voces = guion.escenas.slice(t.desde, t.hasta).map(textoEscena).filter(Boolean);
  let desc = ""; for (const v of voces) { if ((desc + " " + v).length > 230) break; desc = (desc + " " + v).trim(); }
  const titulo = `${t.titulo} | ${guion.titulo || s.titulo || ""}`.replace(/\s*\|\s*$/, "");
  return [titulo, "", desc, "",
    reel ? "El capítulo completo y el video entero están en la página." : `Capítulo ${n} de ${total}. Video completo: (pon aquí el enlace de YouTube)`,
    s.hashtags?.length ? "\n" + s.hashtags.join(" ") : ""].join("\n").trim() + "\n";
}

function cabeceraASS(guion, tiempos, fmt) { return archivoASS(guion, { ...tiempos, escenas: [] }, fmt, { sinFrases: true }); }
function titulosASS(fmt, titulo, n, desde, hasta) {
  const x = Math.round(fmt.w / 2), vertical = fmt.h > fmt.w;
  if (vertical) return `Dialogue: 1,${tc(desde)},${tc(hasta)},T,,0,0,0,,{\\fad(300,400)\\an8\\pos(${x},${Math.round(fmt.h * 0.13)})}${limpia(titulo)}\n`;
  return `Dialogue: 1,${tc(desde)},${tc(hasta)},C,,0,0,0,,{\\fad(350,350)\\an2\\pos(${x},${Math.round(fmt.h * 0.42)})}CAPÍTULO ${n}\n` +
    `Dialogue: 1,${tc(desde)},${tc(hasta)},T,,0,0,0,,{\\fad(350,450)\\an8\\pos(${x},${Math.round(fmt.h * 0.45)})}${limpia(titulo)}\n`;
}

export async function cortarCapitulos(id, avisar = () => {}, { reels = true } = {}) {
  const p = leer(id, "proyecto.json"), guion = leer(id, "guion.json"), tiempos = leer(id, "tiempos.json");
  const dir = dirProyecto(id), final = path.join(dir, "final.mp4");
  if (!fs.existsSync(final)) throw new Error("Primero saca el video completo.");
  const ts = juntarCortos(tramos(guion), tiempos);
  if (ts.length < 2) throw new Error("Este guion no tiene capítulos (marca \"capitulo\" en la primera escena de cada uno).");
  const estilo = leerEstilo(p.estilo), fmt = FORMATOS[p.formato];
  const sal = dirCortes(id); fs.rmSync(sal, { recursive: true, force: true }); fs.mkdirSync(sal, { recursive: true });
  const tmp = path.join(sal, "_tmp"); fs.mkdirSync(tmp, { recursive: true });
  const cortes = [];
  const info = leer(id, path.join("clips", "historia.json")) || [];
  const total = ts.length * (reels ? 2 : 1); let hechos = 0;
  const paso = (msg) => avisar({ paso: "render", progreso: hechos / total, msg });

  for (const [j, t] of ts.entries()) {
    const n = j + 1, nn = String(n).padStart(2, "0"), r = rango(tiempos, t);
    // ---- capítulo completo ----
    paso(`Capítulo ${n} de ${ts.length}: ${t.titulo}`);
    const D = r.dur + PREVIO + CIERRE;
    const ass = path.join(tmp, `cap${nn}.ass`);
    fs.writeFileSync(ass, cabeceraASS(guion, tiempos, fmt) + titulosASS(fmt, t.titulo, n, 0.15, PREVIO + 2.4));
    const mp4 = path.join(sal, `cap-${nn}.mp4`);
    await ffmpeg(["-ss", r.ini.toFixed(3), "-to", r.fin.toFixed(3), "-i", final, "-filter_complex",
      `[0:v]tpad=start_duration=${PREVIO}:start_mode=clone:stop_duration=${CIERRE}:stop_mode=clone,fade=in:st=0:d=0.5,fade=out:st=${(D - 0.8).toFixed(2)}:d=0.8,` +
      `ass='${ruta(ass)}':fontsdir='${ruta(fuentes())}'[v];` +
      `[0:a]adelay=delays=${Math.round(PREVIO * 1000)}:all=1,apad=pad_dur=${CIERRE},afade=t=in:st=0:d=${PREVIO},afade=t=out:st=${(D - 1.2).toFixed(2)}:d=1.2[a]`,
      "-map", "[v]", "-map", "[a]", "-t", D.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", mp4]);
    await ffmpeg(["-ss", "1.0", "-i", mp4, "-frames:v", "1", "-q:v", "2", path.join(sal, `cap-${nn}.jpg`)]);
    fs.writeFileSync(path.join(sal, `cap-${nn}.txt`), textoSubir(guion, t, n, ts.length, false));
    cortes.push({ tipo: "capitulo", n, titulo: t.titulo, archivo: `cap-${nn}.mp4`, segundos: Math.round(D) });
    hechos++;

    // ---- Reel vertical: desde el inicio del capítulo (o la escena marcada "reel"), 35-60 s, terminando en frase completa ----
    if (!reels) continue;
    paso(`Reel del capítulo ${n}…`);
    const E = tiempos.escenas;
    let a = t.desde; const marca = guion.escenas.slice(t.desde, t.hasta).findIndex((e) => e.reel); if (marca >= 0) a = t.desde + marca;
    let b = a + 1;
    while (b < t.hasta && E[b - 1].fin - E[a].ini < REEL_MIN) b++;
    while (b > a + 1 && E[b - 1].fin - E[a].ini > REEL_MAX) b--;
    const t0 = Math.max(0, E[a].ini - 0.15), t1 = E[b - 1].fin;
    const sub = { ...tiempos, duracion: t1 - t0, escenas: E.slice(a, b).map((x) => ({ ...x, ini: x.ini - t0, finVoz: x.finVoz - t0, fin: x.fin - t0, palabras: (x.palabras || []).map((w) => ({ ...w, t0: w.t0 - t0, t1: w.t1 - t0 })) })) };
    const gsub = { ...guion, escenas: guion.escenas.slice(a, b) };
    const vfmt = FORMATOS["9:16"], tmpR = path.join(tmp, `reel${nn}`); fs.mkdirSync(tmpR, { recursive: true });
    const video = await renderImagenes({ id, guion: gsub, tiempos: sub, estilo, fmt: vfmt, tmp: tmpR, info: info.slice(a, b), extraASS: titulosASS(vfmt, t.titulo, n, 0.1, 3.2) });
    const reel = path.join(sal, `reel-${nn}.mp4`), Dr = t1 - t0;
    await ffmpeg(["-i", video, "-ss", t0.toFixed(3), "-to", t1.toFixed(3), "-i", final, "-map", "0:v", "-map", "1:a",
      "-af", `afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, Dr - 1).toFixed(2)}:d=1`, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", reel]);
    await ffmpeg(["-ss", "1.0", "-i", reel, "-frames:v", "1", "-q:v", "2", path.join(sal, `reel-${nn}.jpg`)]);
    fs.writeFileSync(path.join(sal, `reel-${nn}.txt`), textoSubir(guion, { ...t, desde: a, hasta: b }, n, ts.length, true));
    cortes.push({ tipo: "reel", n, titulo: t.titulo, archivo: `reel-${nn}.mp4`, segundos: Math.round(Dr) });
    hechos++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(sal, "cortes.json"), JSON.stringify(cortes, null, 2));
  // copia en listos/ (y con espejo se va al VPS)
  for (const c of cortes) for (const ext of [".mp4", ".jpg", ".txt"]) {
    const f = path.join(sal, c.archivo.replace(/\.mp4$/, ext));
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DIR_LISTOS, `${id}-${c.archivo.replace(/\.mp4$/, "").replace("-", "")}${ext}`));
  }
  return { capitulos: cortes.filter((c) => c.tipo === "capitulo").length, reels: cortes.filter((c) => c.tipo === "reel").length };
}
