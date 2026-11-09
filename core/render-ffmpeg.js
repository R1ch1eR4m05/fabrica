// Render rápido para estilos de imagen fija (p. ej. Filosofía larga, 20-40 min): sin navegador.
// Cada escena = su imagen con movimiento de cámara lento (zoompan) + subtítulos (libass), en tramos paralelos
// que luego se juntan sin volver a codificar. Mucho más rápido que dibujar fotograma por fotograma.
// El movimiento de cámara se calcula igual que en la plantilla.html del estilo (vista previa del panel).
import fs from "node:fs";
import path from "node:path";
import { CFG, RAIZ } from "./config.js";
import { dirProyecto, leer } from "./proyectos.js";
import { ffmpeg, duracion } from "./ff.js";

// movimientos de cámara: "acercar", "alejar", "derecha", "izquierda", "subir", "quieto"
export const MOVIMIENTOS = ["acercar", "derecha", "alejar", "izquierda", "acercar", "subir"];
export function movimiento(e, n) {
  if (e?.camara && MOVIMIENTOS.concat("quieto").includes(e.camara)) return e.camara;
  return MOVIMIENTOS[(n * 7 + 3) % MOVIMIENTOS.length];
}

const ZOOM = 0.13; // cuánto se acerca en toda la escena (13 %)
// zoom, x e y (fracciones del espacio libre) en el avance p (0→1) de la escena
export function camara(mov, p) {
  const z1 = 1 + ZOOM;
  switch (mov) {
    case "acercar": return { z: 1 + ZOOM * p, x: 0.5, y: 0.45 };
    case "alejar": return { z: z1 - ZOOM * p, x: 0.5, y: 0.5 };
    case "derecha": return { z: z1, x: p, y: 0.5 };
    case "izquierda": return { z: z1, x: 1 - p, y: 0.5 };
    case "subir": return { z: z1, x: 0.5, y: 1 - p };
    default: return { z: 1.04, x: 0.5, y: 0.5 };
  }
}
// lo mismo como expresión de ffmpeg (on = fotograma, N = total)
// (off/total: si la escena sigue con la misma imagen que la anterior, el movimiento continúa donde se quedó, sin brincar)
// gancho: la primera toma arranca con un acercamiento rápido (casi todo en 1,6 s) y luego sigue lento; así los primeros 2 s siempre se mueven
const GANCHO_Z = 0.24, GANCHO_S = 1.6;
const exprGancho = (fps, total) => `1+${GANCHO_Z * 0.8}*(1-pow(1-min(1,on/${(GANCHO_S * fps).toFixed(1)}),3))+${GANCHO_Z * 0.2}*(on/${Math.max(1, total - 1)})`;
function exprCamara(mov, N, off = 0, total = N, fps = 24, gancho = false) {
  if (gancho) return { z: exprGancho(fps, total), x: "(iw-iw/zoom)*0.5", y: "(ih-ih/zoom)*0.45" };
  const p = `((on+${off})/${Math.max(1, total - 1)})`, z1 = (1 + ZOOM).toFixed(4);
  const zz = { acercar: `1+${ZOOM}*${p}`, alejar: `${z1}-${ZOOM}*${p}`, quieto: "1.04" }[mov] || z1;
  const fx = { derecha: p, izquierda: `(1-${p})` }[mov] || "0.5";
  const fy = { subir: `(1-${p})`, acercar: "0.45" }[mov] || "0.5";
  return { z: zz, x: `(iw-iw/zoom)*${fx}`, y: `(ih-ih/zoom)*${fy}` };
}

// ---------- subtítulos (ASS) ----------
const tc = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const limpia = (w) => String(w).replace(/[{}\\]/g, "");
// junta las palabras en frases cortas: corta en punto/coma o al llegar a ~maxLetras
export function frasesSubtitulo(palabras, maxLetras = 44) {
  const out = []; let cur = [], largo = 0;
  for (const p of palabras) {
    if (cur.length && largo + p.w.length + 1 > maxLetras) {
      // no dejar colgando "el", "que", "de"… al final de la línea: pasan a la siguiente
      const pasa = cur.length > 2 && cur[cur.length - 1].w.length <= 3 && !/[,.;:]$/.test(cur[cur.length - 1].w) ? [cur.pop()] : [];
      out.push(cur); cur = pasa; largo = pasa.reduce((a, x) => a + x.w.length + 1, 0);
    }
    cur.push(p); largo += p.w.length + 1;
    if (/[.!?…]$/.test(p.w) || (/[,;:]$/.test(p.w) && largo > maxLetras * 0.45)) { out.push(cur); cur = []; largo = 0; }
  }
  if (cur.length) out.push(cur);
  // una o dos palabras sueltas ("de ti.") se juntan con la línea anterior si cabe
  const lg = (f) => f.reduce((a, x) => a + x.w.length + 1, 0);
  for (let j = out.length - 1; j > 0; j--) if (out[j].length <= 2 && !/[.!?…]$/.test(out[j - 1].at(-1).w) && lg(out[j - 1]) + lg(out[j]) <= maxLetras * 1.25) { out[j - 1].push(...out[j]); out.splice(j, 1); }
  return out;
}
export function archivoASS(guion, tiempos, fmt, { fuente = "Montserrat SemiBold", sinFrases = false } = {}) {
  const vertical = fmt.h > fmt.w, u = fmt.h / 1080;
  const tam = Math.round((vertical ? 76 : 56) * (vertical ? fmt.w / 1080 : u));
  const margen = Math.round(vertical ? fmt.h * 0.2 : 62 * u);
  const lin = [];
  for (const [k, te] of tiempos.escenas.entries()) {
    const e = guion.escenas[k] || {};
    if (e.subtitulos === false || sinFrases) continue;
    const fr = frasesSubtitulo(te.palabras || [], vertical ? 30 : 46);
    fr.forEach((f, j) => {
      const ini = f[0].t0 - 0.05, sig = fr[j + 1]?.[0].t0 ?? Infinity;
      const fin = Math.min(f[f.length - 1].t1 + 0.35, sig - 0.02, te.fin);
      if (fin > ini) lin.push(`Dialogue: 0,${tc(ini)},${tc(fin)},S,,0,0,0,,${f.map((p) => limpia(p.w)).join(" ")}`);
    });
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${fmt.w}
PlayResY: ${fmt.h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,${fuente},${tam},&H00FFFFFF,&H00FFFFFF,&H00141414,&H96000000,0,0,0,0,100,100,0.5,0,1,${(2.6 * u).toFixed(1)},${(1.6 * u).toFixed(1)},2,${Math.round(fmt.w * 0.08)},${Math.round(fmt.w * 0.08)},${margen},1
Style: T,${fuente},${Math.round(tam * (vertical ? 1.45 : 1.75))},&H00FFFFFF,&H00FFFFFF,&H00141414,&H96000000,0,0,0,0,100,100,1,0,1,${(3.4 * u).toFixed(1)},${(2 * u).toFixed(1)},${vertical ? 8 : 5},${Math.round(fmt.w * 0.1)},${Math.round(fmt.w * 0.1)},${Math.round(vertical ? fmt.h * 0.14 : 0)},1
Style: C,${fuente},${Math.round(tam * 0.8)},&H00E8EEF2,&H00FFFFFF,&H00141414,&H96000000,0,0,0,0,100,100,4,0,1,${(2.2 * u).toFixed(1)},${(1.2 * u).toFixed(1)},${vertical ? 8 : 5},0,0,${Math.round(vertical ? fmt.h * 0.1 : 0)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lin.join("\n")}
`;
}

// ruta para filtros de ffmpeg (Windows: C\:/…; comillas escapadas)
const rutaFiltro = (f) => f.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

async function enParalelo(tareas, hilos) {
  let i = 0; const err = [];
  await Promise.all(Array.from({ length: Math.max(1, hilos) }, async () => {
    while (i < tareas.length && !err.length) { const t = tareas[i++]; try { await t(); } catch (e) { err.push(e); } }
  }));
  if (err.length) throw err[0];
}

// devuelve la ruta del video sin audio con subtítulos
// (info: fotos por escena; por defecto clips/historia.json; los cortes por capítulo mandan solo un tramo)
export async function renderImagenes({ id, guion, tiempos, estilo, fmt, tmp, avisar = () => {}, info = null, extraASS = "" }) {
  const dir = dirProyecto(id), fps = estilo.fps || 24;
  info = info || leer(id, path.join("clips", "historia.json")) || [];
  const ass = path.join(tmp, "subs.ass");
  const frases = (leer(id, "proyecto.json")?.opciones || {}).subtitulos !== "no", conSubs = frases || !!extraASS;
  fs.writeFileSync(ass, archivoASS(guion, tiempos, fmt, { sinFrases: !frases }) + extraASS);
  const fuentes = path.join(RAIZ, "estilos", "_comun", "fuentes");
  const fondo = (estilo.colorFondo || "#EDE6D8").replace("#", "0x");
  // escala de trabajo para que el movimiento lento no tiemble (zoompan redondea a píxeles enteros)
  const W2 = fmt.w * 2, H2 = fmt.h * 2;
  const n = tiempos.escenas.length, segs = [];
  // grupos: una escena "misma" con el mismo archivo que la anterior es la continuación de la misma toma
  const fr = tiempos.escenas.map((te, k) => { const ini = k === 0 ? 0 : te.ini, fin = k < n - 1 ? tiempos.escenas[k + 1].ini : tiempos.duracion; return Math.max(0, Math.round(fin * fps) - Math.round(ini * fps)); });
  const grupo = []; // [k] → { cabeza, off (cuadros antes en la toma), total (cuadros de toda la toma) }
  for (let k = 0; k < n; k++) {
    const sigue = k > 0 && guion.escenas[k]?.misma && info[k]?.archivo && info[k].archivo === info[k - 1]?.archivo;
    grupo[k] = sigue ? { cabeza: grupo[k - 1].cabeza, off: grupo[k - 1].off + fr[k - 1] } : { cabeza: k, off: 0 };
  }
  for (let k = n - 1; k >= 0; k--) grupo[k].total = (k + 1 < n && grupo[k + 1].cabeza === grupo[k].cabeza) ? grupo[k + 1].total : grupo[k].off + fr[k];
  const tareas = tiempos.escenas.map((te, k) => async () => {
    const ini = k === 0 ? 0 : te.ini, fin = k < n - 1 ? tiempos.escenas[k + 1].ini : tiempos.duracion;
    const f0 = Math.round(ini * fps), f1 = Math.round(fin * fps), N = f1 - f0;
    if (N <= 0) return;
    const c = info[k] || {}, e = guion.escenas[k] || {};
    const src = c.archivo ? (path.isAbsolute(c.archivo) ? c.archivo : path.join(dir, c.archivo)) : null;
    const seg = path.join(tmp, `s${String(k).padStart(4, "0")}.mp4`); segs[k] = seg;
    // los subtítulos usan la hora del video completo: se corre el reloj al inicio del tramo y se regresa
    const subs = !conSubs ? "null" : `setpts=PTS+${(f0 / fps).toFixed(4)}/TB,ass='${rutaFiltro(ass)}':fontsdir='${rutaFiltro(fuentes)}',setpts=PTS-STARTPTS`;
    const sal = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps), "-threads", "2", seg];
    if (src && fs.existsSync(src) && c.tipo === "imagen") {
      const G = grupo[k], m = exprCamara(movimiento(guion.escenas[G.cabeza] || e, G.cabeza + 1), N, G.off, G.total, fps, G.cabeza === 0 && G.off === 0 && k === 0);
      await ffmpeg(["-loop", "1", "-framerate", String(fps), "-t", (N / fps).toFixed(4), "-i", src, "-vf",
        `scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=1:s=${fmt.w}x${fmt.h}:fps=${fps},` +
        `trim=end_frame=${N},${subs}`, ...sal]);
    } else if (src && fs.existsSync(src) && c.tipo === "video") {
      // el clip (8 s) casi nunca dura lo mismo que la escena: se estira hasta 1.4x (movimiento más lento y suave) y, si aún falta, se sostiene el último cuadro
      // si la escena sigue la misma toma, el clip continúa donde se quedó (no vuelve al inicio); si ya se acabó, se sostiene su último cuadro
      const G = grupo[k], dv = await duracion(src).catch(() => 0), objetivo = N / fps, f = dv > 0 ? Math.min(1.4, Math.max(1, G.total / fps / dv)) : 1;
      const desde = dv > 0 ? Math.min(G.off / fps / f, Math.max(0, dv - 0.15)) : 0;
      await ffmpeg([...(desde > 0 ? ["-ss", desde.toFixed(3)] : []), "-i", src, "-vf",
        `fps=${fps},setpts=${f.toFixed(4)}*PTS,fps=${fps},tpad=stop_mode=clone:stop_duration=${Math.max(0, objetivo).toFixed(2)},${k === 0 ? `scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},zoompan=z='${exprGancho(fps, G.total)}':x='(iw-iw/zoom)*0.5':y='(ih-ih/zoom)*0.45':d=1:s=${fmt.w}x${fmt.h}:fps=${fps}` : `scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h}`},trim=end_frame=${N},${subs}`, ...sal]);
    } else {
      await ffmpeg(["-f", "lavfi", "-i", `color=c=${fondo}:s=${fmt.w}x${fmt.h}:r=${fps}`, "-vf", `trim=end_frame=${N},vignette=PI/5,${subs}`, ...sal]);
    }
    hechos++;
    avisar({ paso: "render", progreso: hechos / n, msg: `Escena ${hechos} de ${n} · ${Math.round((Date.now() - t0) / 1000)} s` });
  });
  let hechos = 0; const t0 = Date.now();
  await enParalelo(tareas, Math.max(1, Math.floor(CFG.hilos)));
  const lista = path.join(tmp, "segmentos.txt");
  fs.writeFileSync(lista, segs.filter(Boolean).map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  const video = path.join(tmp, "video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", video]);
  return video;
}
