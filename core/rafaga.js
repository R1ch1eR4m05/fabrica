// Modo «ráfaga» del Corporativo (24 nov 2026): video de marca de 60-75 s con el ritmo de Absen «Beyond the Display»
// (medido: 71 tomas en 69 s, toma típica de 0.6 s; el nuestro anterior: 30 tomas en 144 s, 4.8 s cada una).
// Se activa con "modo": "rafaga" en guion.json. Cada escena es un BLOQUE (con voz corta o en silencio, "duracion") y trae
// varias "tomas" que se van cortando AL GOLPE DE LA MÚSICA (cada N pulsos, "cada"; 1 = ráfaga). Encima:
//   "numero": { "valor": 12000, "prefijo": "+", "sufijo": "", "etiqueta": "CLIENTES" } → número enorme que cuenta hasta su valor
//   "sobre" (texto grande) y "etiqueta" (chico) · "cierre": true → fondo negro y el logo entra (material/logo.png o el texto de la marca)
//   la marca chica en la esquina todo el video ("marca" en el guion; material/logo.png si existe).
// Toma: { "fuente": "V2.mp4", "desde": 63 } (video: avanza solo cada vez que se reusa) · { "fuente": "I10.jpg" } (foto con empujón)
//       "ajuste": "llenar" | "fondo" (vertical en horizontal: completo sobre su imagen desenfocada; sin él se decide por la forma).
// Nada de esto gasta: solo ffmpeg.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, RAIZ } from "./config.js";
import { dirProyecto } from "./proyectos.js";
import { ffmpeg, duracion, medidas } from "./ff.js";
import { resolverMaterial, dirMaterial } from "./corporativo.js";
import { archivoASS } from "./render-ffmpeg.js";

const FPS = 30;
const tc = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
const limpia = (t) => String(t).replace(/[{}\\]/g, "").replace(/\n/g, "\\N");
const rutaFiltro = (f) => f.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
const colorASS = (hex) => { const h = String(hex || "#E6194B").replace("#", "").padEnd(6, "0"); return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };

// ---------- pulsos de la música (sin librerías): energía → golpes → tempo por autocorrelación → fase ----------
export async function pulsos(musica, total) {
  const reserva = (bpm = 120) => Array.from({ length: Math.ceil(total * bpm / 60) + 1 }, (_, i) => i * 60 / bpm);
  if (!musica || !fs.existsSync(musica)) return { bpm: 120, golpes: reserva(), deMusica: false };
  const SR = 11025, HOP = 256;
  const datos = await new Promise((ok) => {
    const p = spawn(CFG.ffmpeg, ["-v", "error", "-i", musica, "-t", String(total + 1), "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"]);
    const partes = []; p.stdout.on("data", (d) => partes.push(d)); p.on("error", () => ok(null)); p.on("close", () => ok(Buffer.concat(partes)));
  });
  if (!datos || datos.length < SR * 4 * 4) return { bpm: 120, golpes: reserva(), deMusica: false };
  const x = new Float32Array(datos.buffer, datos.byteOffset, Math.floor(datos.length / 4));
  const n = Math.floor(x.length / HOP), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < HOP; j++) { const v = x[i * HOP + j]; s += v * v; } e[i] = Math.log(1e-6 + Math.sqrt(s / HOP)); }
  const o = new Float32Array(n);
  for (let i = 3; i < n; i++) o[i] = Math.max(0, e[i] - (e[i - 1] + e[i - 2] + e[i - 3]) / 3);
  const fpsE = SR / HOP;
  const en = (t) => { const i = Math.floor(t), f = t - i; return (o[i] || 0) * (1 - f) + (o[i + 1] || 0) * f; };
  // tempo: peine sobre toda la canción (con fase libre) — el periodo que mejor «cae» en los golpes
  let mejor = { p: 0, v: -1, bpm: 120 };
  for (let bpm = 80; bpm <= 160; bpm += 0.1) {
    const P = fpsE * 60 / bpm; let mx = 0;
    for (let f = 0; f < P; f += 1) { let v = 0, c = 0; for (let t = f; t < n - 1; t += P) { v += en(t); c++; } if (c) mx = Math.max(mx, v / c); }
    if (mx > mejor.v) mejor = { p: P, v: mx, bpm };
  }
  const P = mejor.p; let fase = { f: 0, v: -1 };
  for (let f = 0; f < P; f += 0.25) { let v = 0; for (let t = f; t < n - 1; t += P) v += en(t); if (v > fase.v) fase = { f, v }; }
  const golpes = []; for (let t = fase.f; t / fpsE < total + 1; t += P) golpes.push(t / fpsE);
  return { bpm: mejor.bpm, golpes, deMusica: true };
}

// ---------- plan de cortes: dentro de cada bloque, una toma por cada N golpes ----------
export function planCortes(guion, tiempos, golpes) {
  const esc = tiempos.escenas, D = tiempos.duracion, cortes = [];
  for (let k = 0; k < esc.length; k++) {
    const e = guion.escenas[k] || {}, ini = k === 0 ? 0 : esc[k].ini, fin = k < esc.length - 1 ? esc[k + 1].ini : D;
    if (fin - ini < 0.05) continue;
    const tomas = e.cierre ? [{ negro: true }] : e.testimonio ? [{ fuente: e.testimonio.fuente, desde: e.testimonio.desde, ajuste: e.testimonio.ajuste, quieto: !e.testimonio.empujon }] : (e.tomas?.length ? e.tomas : e.fuente ? [{ fuente: e.fuente, desde: e.desde, ajuste: e.ajuste }] : [{ negro: true }]);
    const cada = Math.max(1, Math.round(e.cada ?? (tomas.length > 2 ? 1 : 2)));
    const minimo = e.minimo ?? 0.38; // nada más corto que ~11 cuadros
    const marcas = [ini];
    if (tomas.length > 1) {
      const enBloque = golpes.filter((g) => g > ini + minimo && g < fin - minimo);
      enBloque.forEach((g, i) => { if ((i + 1) % cada === 0 && g - marcas[marcas.length - 1] >= minimo) marcas.push(g); });
    }
    marcas.push(fin);
    for (let i = 0; i < marcas.length - 1; i++) cortes.push({ k, i, ini: marcas[i], fin: marcas[i + 1], toma: tomas[i % tomas.length], primero: i === 0 });
  }
  return cortes;
}

// ---------- un corte → un segmento de video del tamaño exacto ----------
const cursores = new Map(); // tramos ya usados de cada video (no se repite el mismo pedazo)
const repetidos = { n: 0, de: {} };
async function hacerCorte(id, c, fmt, salida, efecto) {
  const W = fmt.w, H = fmt.h, N = Math.max(1, Math.round(c.fin * FPS) - Math.round(c.ini * FPS)), seg = N / FPS; // cuadros absolutos: los redondeos no se acumulan
  const sal = ["-an", "-r", String(FPS), "-frames:v", String(N), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360", "-avoid_negative_ts", "make_zero", salida]; // misma base de tiempo en todos: el concat sin recodificar queda al cuadro
  // empujón: entra 9 % más grande y asienta en 6 cuadros (punch); luego acercamiento lento que da vida
  const z = efecto === "punch" ? `if(lt(on,6),1.09-0.015*on,1.0+0.0009*(on-6))` : `1.0+0.0011*on`;
  const t0 = c.toma || {};
  const zp = t0.quieto ? `scale=${W}:${H}` : `zoompan=z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS}`; // quieto: la toma ya trae su propio movimiento (la Tierra)
  const destello = efecto === "flash" ? ",fade=t=in:st=0:d=0.14:color=white" : efecto === "negro" ? ",fade=t=in:st=0:d=0.2" : "";
  const t = c.toma || {};
  const src = t.negro ? null : resolverMaterial(id, t.fuente);
  if (!src) return ffmpeg(["-f", "lavfi", "-i", `color=c=0x0B0B0C:s=${W}x${H}:r=${FPS}`, "-t", seg.toFixed(3), ...sal]);
  const m = await medidas(src).catch(() => ({ w: 0, h: 0 }));
  const dif = m.w && m.h ? Math.abs(Math.log((m.w / m.h) / (W / H))) : 0;
  const ajuste = t.ajuste === "llenar" || t.ajuste === "fondo" ? t.ajuste : dif > 0.35 ? "fondo" : "llenar";
  const W2 = W * 2, H2 = H * 2; // trabajo al doble para que el zoom no tiemble
  const encuadre = ajuste === "fondo"
    ? `split=2[a][b];[a]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=40:2,eq=brightness=-0.12:saturation=0.85[bg];[b]scale=${W2}:${H2}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
    : `scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2}`;
  if (/\.(jpe?g|png|webp)$/i.test(src)) {
    return ffmpeg(["-loop", "1", "-framerate", String(FPS), "-t", seg.toFixed(3), "-i", src, "-filter_complex", `[0:v]${encuadre},setsar=1,${zp}${destello},format=yuv420p[v]`, "-map", "[v]", ...sal]);
  }
  const dv = await duracion(src).catch(() => 0);
  // sin repetir (24 nov 2026, Richie: «no me gusta que se repitan tanto»): cada video lleva la lista de tramos ya usados en
  // todo el montaje; la toma busca el siguiente pedazo libre desde su «desde» (y si no hay, desde el inicio del video)
  const tope = Math.min(dv || Infinity, t.hasta ?? Infinity), margen = 0.15;
  const usados = cursores.get(src) || []; cursores.set(src, usados);
  const libre = (d) => d >= 0 && d + seg <= tope - 0.05 && !usados.some(([a, b]) => d < b + margen && d + seg > a - margen);
  const buscar = (d0) => { for (let d = d0; d + seg <= tope - 0.05; d += 0.1) if (libre(d)) return d; return null; };
  let desde = buscar(+t.desde || 0) ?? buscar(0);
  if (desde == null && !usados.length) desde = Math.max(0, Math.min(+t.desde || 0, (dv || seg) - seg)); // un solo uso más largo que el video: no es repetir
  if (desde == null) { desde = Math.max(0, Math.min(+t.desde || 0, (dv || seg) - seg)); repetidos.n += seg; repetidos.de[path.basename(src)] = (repetidos.de[path.basename(src)] || 0) + seg; } // ya no queda nada nuevo
  usados.push([desde, desde + seg]);
  return ffmpeg(["-ss", desde.toFixed(3), "-i", src, "-filter_complex",
    `[0:v]fps=${FPS},${encuadre},setsar=1,${zp},tpad=stop_mode=clone:stop_duration=${seg.toFixed(2)}${destello},format=yuv420p[v]`, "-map", "[v]", ...sal]);
}

// ---------- texto encima (ASS): números que cuentan, sobreimpresos, marca en la esquina, cierre con el logo ----------
function capas(guion, tiempos, fmt, cortes, conLogo) {
  const W = fmt.w, H = fmt.h, u = H / 1080, vertical = H > W, lin = [];
  const f = Math.round(Math.min(H * 0.27, W * 0.2)); // número: como en Absen, ocupa casi un tercio del alto
  const acento = colorASS(guion.marca?.color || "#E6194B"), nombre = guion.marca?.nombre || "SRYLED MX";
  const esc = tiempos.escenas, D = tiempos.duracion;
  const miles = (v) => Math.round(v).toLocaleString("en-US");
  for (const [k, e] of (guion.escenas || []).entries()) {
    const te = esc[k]; if (!te) continue;
    const ini = (k === 0 ? 0 : te.ini) + 0.08, fin = (esc[k + 1]?.ini ?? D) - 0.06;
    const cy = Math.round(H * (vertical ? 0.42 : 0.46));
    // franja oscura difusa detrás del texto grande, para que se lea sobre cualquier toma
    if (e.numero || (e.sobre && !e.cierre)) { const alto = Math.round(H * (e.numero ? 0.42 : 0.26)); lin.push(`Dialogue: 1,${tc(ini)},${tc(fin)},B,,0,0,0,,{\\an7\\pos(0,${cy - Math.round(alto / 2)})\\fad(150,200)\\blur${Math.round(40 * u)}\\1a&H70&\\p1}m 0 0 l ${W} 0 ${W} ${alto} 0 ${alto}{\\p0}`); }
    if (e.numero) { // cuenta en 0.7 s con un poco de crecimiento, luego queda y sale con fundido
      const n = e.numero, pasos = 14, dur = 0.7;
      for (let i = 0; i <= pasos; i++) {
        const a = ini + (dur * i) / pasos, b = i === pasos ? fin : ini + (dur * (i + 1)) / pasos;
        const v = n.valor * (1 - Math.pow(1 - i / pasos, 3));
        const esc0 = i === pasos ? "\\fscx100\\fscy100" : `\\fscx${Math.round(86 + 14 * i / pasos)}\\fscy${Math.round(86 + 14 * i / pasos)}`;
        lin.push(`Dialogue: 3,${tc(a)},${tc(b)},N,,0,0,0,,{\\an5\\pos(${W / 2},${cy})${esc0}${i === pasos ? "\\fad(0,200)" : ""}}${limpia(n.prefijo || "")}${miles(v)}${limpia(n.sufijo || "")}`);
      }
      if (n.etiqueta) {
        const yb = cy + Math.round(f * 0.62), ancho = Math.round(W * 0.06); // barrita del color de la marca entre el número y la etiqueta
        lin.push(`Dialogue: 3,${tc(ini + 0.2)},${tc(fin)},B,,0,0,0,,{\\an7\\pos(${Math.round(W / 2 - ancho / 2)},${yb})\\fad(150,200)\\1c${acento}\\1a&H00&\\p1}m 0 0 l ${ancho} 0 ${ancho} ${Math.round(6 * u)} 0 ${Math.round(6 * u)}{\\p0}`);
        lin.push(`Dialogue: 3,${tc(ini + 0.25)},${tc(fin)},E,,0,0,0,,{\\an5\\pos(${W / 2},${yb + Math.round(H * 0.06)})\\fad(200,200)\\fsp${Math.round(12 * u)}}${limpia(n.etiqueta)}`);
      }
    }
    if (e.testimonio?.nombre) { // rótulo de la persona abajo a la izquierda: barrita de la marca + nombre + cargo
      const x = Math.round(W * 0.06), y = Math.round(H * 0.8);
      lin.push(`Dialogue: 2,${tc(ini + 0.3)},${tc(fin - 0.2)},B,,0,0,0,,{\\an7\\pos(${x},${y})\\fad(200,200)\\1c${acento}\\1a&H00&\\p1}m 0 0 l ${Math.round(8 * u)} 0 ${Math.round(8 * u)} ${Math.round(H * 0.085)} 0 ${Math.round(H * 0.085)}{\\p0}`);
      lin.push(`Dialogue: 3,${tc(ini + 0.35)},${tc(fin - 0.2)},G,,0,0,0,,{\\an7\\pos(${x + Math.round(24 * u)},${y - Math.round(4 * u)})\\fad(200,200)\\fs${Math.round(H * 0.058)}}${limpia(e.testimonio.nombre)}`);
      if (e.testimonio.cargo) lin.push(`Dialogue: 3,${tc(ini + 0.5)},${tc(fin - 0.2)},E,,0,0,0,,{\\an7\\pos(${x + Math.round(26 * u)},${y + Math.round(H * 0.05)})\\fad(200,200)\\fs${Math.round(H * 0.03)}}${limpia(e.testimonio.cargo)}`);
    }
    if (e.sobre && !e.cierre) lin.push(`Dialogue: 3,${tc(ini)},${tc(fin)},G,,0,0,0,,{\\an5\\pos(${W / 2},${cy})\\fad(120,200)\\t(0,350,\\fscx100\\fscy100)\\fscx112\\fscy112}${limpia(e.sobre)}`);
    if (e.etiqueta && !e.numero && !e.cierre) lin.push(`Dialogue: 3,${tc(ini + 0.2)},${tc(fin)},E,,0,0,0,,{\\an5\\pos(${W / 2},${cy + Math.round(H * (e.sobre ? 0.11 : 0))})\\fad(200,200)\\fsp${Math.round(10 * u)}}${limpia(e.etiqueta)}`);
    if (e.cierre) { // logo de texto: entra desenfocado y con espacio entre letras, se junta y queda nítido
      if (!conLogo) lin.push(`Dialogue: 4,${tc(ini + 0.15)},${tc(fin)},L,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.47)})\\fad(300,0)\\blur18\\fsp${Math.round(60 * u)}\\t(0,900,\\blur0\\fsp${Math.round(6 * u)})}${limpia(e.sobre || nombre)}`);
      const ancho = Math.round(W * 0.08);
      lin.push(`Dialogue: 4,${tc(ini + 0.8)},${tc(fin)},B,,0,0,0,,{\\an7\\pos(${Math.round(W / 2 - ancho / 2)},${Math.round(H * 0.565)})\\fad(250,0)\\1c${acento}\\1a&H00&\\p1}m 0 0 l ${ancho} 0 ${ancho} ${Math.round(7 * u)} 0 ${Math.round(7 * u)}{\\p0}`);
      const sub = e.etiqueta || "";
      if (sub) lin.push(`Dialogue: 4,${tc(ini + 0.9)},${tc(fin)},E,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.63)})\\fad(300,0)\\fsp${Math.round(8 * u)}}${limpia(sub)}`);
    }
  }
  // marca chica en la esquina (como el «Absen» de arriba a la izquierda), menos en el cierre
  const cierre = (guion.escenas || []).findIndex((e) => e.cierre);
  const finMarca = cierre >= 0 && esc[cierre] ? esc[cierre].ini : D;
  if (!conLogo) lin.push(`Dialogue: 2,${tc(0.3)},${tc(finMarca)},M,,0,0,0,,{\\an7\\pos(${Math.round(W * 0.03)},${Math.round(H * 0.035)})\\fad(300,200)}${limpia(nombre)}`);

  return `
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: N,Montserrat ExtraBold,${f},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,${(5 * u).toFixed(1)},5,0,0,0,1
Style: G,Montserrat ExtraBold,${Math.round(f * 0.62)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,2,0,1,0,${(4 * u).toFixed(1)},5,0,0,0,1
Style: B,Montserrat ExtraBold,10,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: E,Montserrat ExtraBold,${Math.round(Math.min(H * 0.052, W * 0.04))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,${(3 * u).toFixed(1)},5,0,0,0,1
Style: L,Montserrat ExtraBold,${Math.round(f * 0.72)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: M,Montserrat ExtraBold,${Math.round(H * 0.03)},&H30FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,${(3 * u).toFixed(1)},0,1,0,${(2 * u).toFixed(1)},7,0,0,0,1
`.replace("[V4+ Styles]\nFormat:", "[V4+ Styles]\nFormat:") + "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + lin.join("\n") + "\n";
}

// ---------- todo junto: cortes al golpe → segmentos → concat → texto y marca encima ----------
export async function renderRafaga({ id, guion, tiempos, fmt, tmp, avisar = () => {}, musica }) {
  const dir = dirProyecto(id);
  avisar({ paso: "render", progreso: 0.02, msg: "Buscando los golpes de la música…" });
  // la entrada «de la Tierra a tu ciudad» se hace sola si el guion la pide (guion.tierra) y aún no existe (core/tierra.js, gratis)
  if (guion.tierra) {
    const nombre = guion.tierra.nombre || "T1";
    if (!resolverMaterial(id, `${nombre}.mp4`)) {
      avisar({ paso: "render", progreso: 0.01, msg: "Haciendo la entrada de la Tierra…" });
      const T = await import("./tierra.js"); await T.hacerTierra(id, { ...guion.tierra, nombre, w: fmt.w, h: fmt.h, avisar });
    }
  }
  // tomas que no existen en material/ se quitan; si un bloque se queda sin tomas, sigue con las del bloque anterior
  let previas = null;
  guion = { ...guion, escenas: guion.escenas.map((e) => {
    if (e.cierre || !e.tomas) return e;
    const ok = e.tomas.filter((t) => t.negro || resolverMaterial(id, t.fuente)).map((t) => (guion.tierra && t.fuente === `${guion.tierra.nombre || "T1"}.mp4` ? { quieto: true, ...t } : t));
    if (ok.length < e.tomas.length) avisar({ paso: "render", msg: `Ojo: falta en material/: ${e.tomas.filter((t) => !ok.includes(t)).map((t) => t.fuente).join(", ")}` });
    const tomas = ok.length ? ok : previas || [];
    if (tomas.length) previas = tomas;
    return { ...e, tomas };
  }) };
  // cierre SIN logo de verdad (material/logo.png): nada de letras simulando el logo (Richie, 24 nov 2026); el video sigue con tomas y se va a negro
  const hayLogo = ["logo.png", "logo.webp"].some((f) => fs.existsSync(path.join(dirMaterial(id), f)));
  if (!hayLogo) {
    let ultimas = [];
    guion = { ...guion, escenas: guion.escenas.map((e) => {
      if (!e.cierre) { if (e.tomas?.length) ultimas = e.tomas; return e; }
      avisar({ paso: "render", msg: "Sin material/logo.png: el cierre va con video y fundido a negro, sin letras." });
      const { cierre, sobre, etiqueta, ...resto } = e; return { ...resto, tomas: e.cierreTomas || ultimas, fundido: true };
    }) };
  }
  const p = await pulsos(musica, tiempos.duracion);
  const cortes = planCortes(guion, tiempos, p.golpes);
  avisar({ paso: "render", progreso: 0.05, msg: `${cortes.length} cortes a ${Math.round(p.bpm)} BPM${p.deMusica ? "" : " (sin música: pulso de 120)"}` });
  cursores.clear(); repetidos.n = 0; repetidos.de = {};
  const segs = []; let hechos = 0; const t0 = Date.now();
  const tareas = cortes.map((c, j) => async () => {
    // efectos: destello blanco al cambiar de bloque, empujón en cada 2.º corte de la ráfaga, negro al cierre
    const e = guion.escenas[c.k] || {};
    const efecto = e.cierre ? "negro" : c.primero && c.k > 0 ? (e.efecto || "flash") : c.i % 2 === 1 ? "punch" : "nada";
    const s = path.join(tmp, `r${String(j).padStart(4, "0")}.mp4`); segs[j] = s;
    await hacerCorte(id, c, fmt, s, efecto);
    hechos++; avisar({ paso: "render", progreso: 0.05 + 0.8 * hechos / cortes.length, msg: `Corte ${hechos} de ${cortes.length} · ${Math.round((Date.now() - t0) / 1000)} s` });
  });
  // en orden (los videos que se reusan avanzan su cursor en el orden del montaje)
  for (const t of tareas) await t();
  const lista = path.join(tmp, "rafaga.txt");
  fs.writeFileSync(lista, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  const crudo = path.join(tmp, "rafaga-crudo.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", crudo]);

  avisar({ paso: "render", progreso: 0.88, msg: "Números, marca y subtítulos encima…" });
  const logo = ["logo.png", "logo.webp"].map((f) => path.join(dirMaterial(id), f)).find((f) => fs.existsSync(f));
  const frases = ((leerProyecto(id)?.opciones || {}).subtitulos) !== "no";
  const base = archivoASS(guion, tiempos, fmt, { sinFrases: !frases });
  const [cabeza] = base.split("\n[V4+ Styles]");
  const estilosBase = base.slice(base.indexOf("[V4+ Styles]"), base.indexOf("\n[Events]")).split("\n").filter((l) => l.startsWith("Style:"));
  const eventosBase = base.slice(base.indexOf("[Events]")).split("\n").filter((l) => l.startsWith("Dialogue:"));
  const extra = capas(guion, tiempos, fmt, cortes, !!logo);
  const estilosExtra = extra.split("\n").filter((l) => l.startsWith("Style:"));
  const eventosExtra = extra.split("\n").filter((l) => l.startsWith("Dialogue:"));
  const ass = path.join(tmp, "rafaga.ass");
  fs.writeFileSync(ass, `${cabeza}\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${[...estilosBase, ...estilosExtra].join("\n")}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${[...eventosBase, ...eventosExtra].join("\n")}\n`);
  const fuentes = path.join(RAIZ, "estilos", "_comun", "fuentes");
  const video = path.join(tmp, "video.mp4");
  const subs = `ass='${rutaFiltro(ass)}':fontsdir='${rutaFiltro(fuentes)}'`;
  if (logo) {
    const cierre = (guion.escenas || []).findIndex((e) => e.cierre), D = tiempos.duracion;
    const tc0 = cierre >= 0 ? tiempos.escenas[cierre].ini : D;
    const lw = Math.round(fmt.w * 0.09), LW = Math.round(fmt.w * 0.36);
    await ffmpeg(["-i", crudo, "-loop", "1", "-i", logo, "-loop", "1", "-i", logo, "-filter_complex",
      `[1:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=0.75[bug];[2:v]scale=${LW}:-1:flags=lanczos,format=rgba,fade=t=in:st=${(tc0 + 0.2).toFixed(2)}:d=0.8:alpha=1[grande];` +
      `[0:v][bug]overlay=${Math.round(fmt.w * 0.03)}:${Math.round(fmt.h * 0.035)}:enable='lt(t,${tc0.toFixed(2)})'[a];[a][grande]overlay=(W-w)/2:(H-h)/2-${Math.round(fmt.h * 0.04)}:enable='gte(t,${tc0.toFixed(2)})'[b];[b]${subs}[v]`,
      "-map", "[v]", "-t", D.toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS), video]);
  } else {
    const fundido = (guion.escenas || []).some((e) => e.fundido) ? `,fade=t=out:st=${Math.max(0, tiempos.duracion - 1.4).toFixed(2)}:d=1.4` : "";
    await ffmpeg(["-i", crudo, "-vf", subs + fundido, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS), video]);
  }
  avisar({ paso: "render", progreso: 0.97, msg: `Montaje listo: ${cortes.length} cortes en ${Math.round(tiempos.duracion)} s${repetidos.n > 0.5 ? ` (se repiten ${repetidos.n.toFixed(1)} s: ${Object.entries(repetidos.de).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(", ")})` : " (sin repetir material)"}` });
  return video;
}

function leerProyecto(id) { try { return JSON.parse(fs.readFileSync(path.join(dirProyecto(id), "proyecto.json"), "utf8")); } catch { return null; } }
