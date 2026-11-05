// Arma la voz final de un video sin regenerar nada en ElevenLabs:
// corta el cuerpo justo antes de una palabra, lo retrasa N segundos y le pega un cierre reutilizable.
// Uso:
//   node tools/montar_voz.js --cuerpo voz/sueno --antes-de Comenta --retraso 7 \
//        --cierre voz/cierres/escuela_meta --pausa 0.35 --salida voz/montaje/sueno_meta
//   (--cierre es opcional: sin él sólo sale el cuerpo cortado y retrasado)
//   --max-silencio 0.3   acorta los silencios más largos a 0.25 s y ajusta los tiempos
// Entrada: <cuerpo>.mp3 + <cuerpo>.words.json, <cierre>.mp3 + <cierre>.words.json
// Salida:  <salida>.mp3 + <salida>.words.json (tiempos ya desplazados)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const CUERPO = arg("cuerpo"), ANTES = arg("antes-de"), SALIDA = arg("salida");
const RETRASO = Number(arg("retraso", 0)), PAUSA = Number(arg("pausa", 0.35)), CIERRE = arg("cierre");
if (!CUERPO || !SALIDA) { console.error("Faltan --cuerpo y --salida"); process.exit(1); }

const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]/g, "");
const leer = (f) => JSON.parse(fs.readFileSync(f + ".words.json", "utf8"));

let cuerpo = leer(CUERPO);
let corte = null;
if (ANTES) {
  const i = cuerpo.findIndex((w) => norm(w.w) === norm(ANTES));
  if (i < 1) { console.error(`No encontré "${ANTES}" en ${CUERPO}.words.json`); process.exit(1); }
  // a la mitad del silencio entre la palabra anterior y la del corte (máx. 0.15 s después de la anterior)
  corte = Math.min(cuerpo[i - 1].end + 0.15, (cuerpo[i - 1].end + cuerpo[i].start) / 2);
  cuerpo = cuerpo.slice(0, i);
}
const durCuerpo = corte ?? parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", CUERPO + ".mp3"], { encoding: "utf8" }).stdout);
const iniCierre = RETRASO + durCuerpo + PAUSA;

const fmt = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono";
const ins = ["-i", CUERPO + ".mp3"];
let fc = `aevalsrc=0:d=${RETRASO}:s=44100,${fmt}[s0];`;
fc += `[0:a]${corte != null ? `atrim=0:${corte},afade=t=out:st=${(corte - 0.06).toFixed(3)}:d=0.06,` : ""}asetpts=N/SR/TB,${fmt}[c];`;
let partes = "[s0][c]", n = 2;
if (CIERRE) {
  ins.push("-i", CIERRE + ".mp3");
  fc += `aevalsrc=0:d=${PAUSA}:s=44100,${fmt}[s1];[1:a]${fmt}[k];`;
  partes += "[s1][k]"; n = 4;
}
fc += `${partes}concat=n=${n}:v=0:a=1[out]`;
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...ins, "-filter_complex", fc, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", SALIDA + ".mp3"], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);

const mover = (ws, d) => ws.map((w) => ({ w: w.w, start: +(w.start + d).toFixed(3), end: +(w.end + d).toFixed(3) }));
let words = mover(cuerpo, RETRASO);
if (CIERRE) words = words.concat(mover(leer(CIERRE), iniCierre));
// --max-silencio 0.3: acorta cada silencio más largo (medido con silencedetect a -40 dB) a 0.25 s
const MAXS = arg("max-silencio");
if (MAXS) {
  const det = spawnSync("ffmpeg", ["-hide_banner", "-i", SALIDA + ".mp3", "-af", `silencedetect=n=-40dB:d=${MAXS}`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const ini = [...det.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const fin = [...det.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const quitar = ini.map((a, k) => fin[k] != null && { a: a + 0.125, b: fin[k] - 0.125 }).filter((c) => c && c.b > c.a);
  if (quitar.length) {
    let segs = [], p = 0;
    for (const c of quitar) { segs.push([p, c.a]); p = c.b; }
    segs.push([p, null]);
    const f = segs.map(([a, b], k) => `[0:a]atrim=start=${a.toFixed(3)}${b != null ? `:end=${b.toFixed(3)}` : ""},asetpts=N/SR/TB[p${k}]`).join(";") +
      ";" + segs.map((_, k) => `[p${k}]`).join("") + `concat=n=${segs.length}:v=0:a=1[o]`;
    const tmp = SALIDA + ".tmp.mp3";
    const r2 = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", SALIDA + ".mp3", "-filter_complex", f, "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "192k", tmp], { stdio: "inherit" });
    if (r2.status !== 0) process.exit(1);
    fs.renameSync(tmp, SALIDA + ".mp3");
    const mueve = (x) => { let d = 0; for (const c of quitar) { if (x >= c.b) d += c.b - c.a; else if (x > c.a) d += x - c.a; } return +(x - d).toFixed(3); };
    words = words.map((w) => ({ w: w.w, start: mueve(w.start), end: mueve(w.end) }));
    console.log(`Silencios acortados: ${quitar.length} (−${quitar.reduce((s, c) => s + c.b - c.a, 0).toFixed(2)} s)`);
  }
}
fs.writeFileSync(SALIDA + ".words.json", JSON.stringify(words, null, 1));
console.log(`Listo: ${SALIDA}.mp3  cuerpo ${RETRASO}s → ${(RETRASO + durCuerpo).toFixed(2)}s` + (CIERRE ? `, cierre desde ${iniCierre.toFixed(2)}s` : "") + `, ${words.length} palabras`);
