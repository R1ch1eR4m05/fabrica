// Convierte una escena HTML (con window.renderAt(t)) en MP4.
// Uso:
//   node render.js --page sueno.html --out horas_de_sueno.mp4 --dur 20 [--audio voz/sueno.mp3]
//   node render.js --page sueno.html --frames 1,5,9      (solo capturas PNG para revisar)
//   --dur auto       duración del audio + --tail segundos (1.5 por defecto)
//   --escala 0.4     capturas reducidas
//   --min 24.2       duración mínima del video (alarga el cuadro final quieto)
//   --png portada.png --at 7   una sola imagen a tamaño completo (portadas)
//   Si la página expone window.SFX = [{tipo:"tic"|"tac"|"pop"|"barrido", t, d}], se sintetizan con FFmpeg
//   (sin archivos externos), 12 dB por debajo de la voz, y se mezclan antes de normalizar a -14 LUFS.
//   --prefix x_      nombre de las capturas (still_ por defecto)
//   La página puede llevar parámetros: --page "sueno.html?v=sueno_tt"
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const PAGE = arg("page", "scene.html");
const OUT = arg("out", PAGE.split("?")[0].replace(".html", ".mp4"));
const AUDIO = arg("audio", null);
const TAIL = Number(arg("tail", 1.5));
const PREFIX = arg("prefix", "still_");
const ESCALA = Number(arg("escala", 1));
const MIN = Number(arg("min", 0));
const PNG = arg("png", null), AT = Number(arg("at", 0));
function duracion() {
  const d = arg("dur", "20");
  if (d !== "auto") return Number(d);
  if (!AUDIO) throw new Error("--dur auto necesita --audio");
  const r = require("child_process").spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", AUDIO], { encoding: "utf8" });
  const a = parseFloat(r.stdout);
  if (!a) throw new Error("No pude leer la duración de " + AUDIO);
  console.log(`Audio: ${a.toFixed(2)} s -> video: ${(a + TAIL).toFixed(2)} s`);
  return Math.max(a + TAIL, MIN);
}
const DUR = PNG ? 0 : duracion();
const FPS = 30;
const stills = arg("frames", null) ? arg("frames").split(",").map(Number) : null;

const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(__dirname, decodeURIComponent(req.url.split("?")[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(d); });
}).listen(8765);

const run = (cmd, args) => new Promise((ok, fail) => { const p = spawn(cmd, args, { stdio: "inherit" }); p.on("close", (c) => (c === 0 ? ok() : fail(new Error(cmd + " salió con " + c)))); });

// efectos sintetizados: amplitud ~0.2 (≈ -12 dB respecto a la voz, que llega cerca de 0 dBFS)
const SINTE = {
  tic: () => ["0.14*sin(2*PI*2400*t)*exp(-t*90)", 0.06],
  tac: () => ["0.12*sin(2*PI*1700*t)*exp(-t*90)", 0.06],
  pop: () => ["0.22*sin(2*PI*(260*t+2600*t*t))*exp(-t*28)", 0.16],
  barrido: (d) => [`0.12*sin(2*PI*(180*t+${(380 / d).toFixed(3)}*t*t))*sin(PI*t/${d.toFixed(3)})`, d],
};
async function efectos(lista, dur, out) {
  const ins = [], fc = [];
  lista.forEach((e, k) => {
    const [expr, d] = SINTE[e.tipo](e.d || 0.5);
    ins.push("-f", "lavfi", "-i", `aevalsrc=${expr}:s=44100:d=${d}`);
    fc.push(`[${k}:a]adelay=${Math.round(e.t * 1000)}:all=1[e${k}]`);
  });
  fc.push(lista.map((_, k) => `[e${k}]`).join("") + `amix=inputs=${lista.length}:normalize=0:duration=longest,apad,atrim=0:${dur.toFixed(3)}[o]`);
  await run("ffmpeg", ["-y", "-v", "error", ...ins, "-filter_complex", fc.join(";"), "-map", "[o]", "-ac", "1", out]);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("console", (m) => m.type() === "error" && console.error("página:", m.text()));
  await page.goto("http://localhost:8765/" + PAGE);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });

  if (PNG) {
    await page.evaluate((x) => window.renderAt(x), AT);
    await page.screenshot({ path: PNG });
    console.log("Imagen lista:", PNG);
  } else if (stills) {
    for (const t of stills) { await page.evaluate((x) => window.renderAt(x), t); const f = `${PREFIX}${t}.png`; await page.screenshot({ path: f }); if (ESCALA !== 1) { await run("ffmpeg", ["-y", "-v", "error", "-i", f, "-vf", `scale=iw*${ESCALA}:-1`, f + ".tmp.png"]); fs.renameSync(f + ".tmp.png", f); } }
    console.log("Capturas listas:", stills.map((t) => `${PREFIX}${t}.png`).join(", "));
  } else {
    const silent = AUDIO ? OUT.replace(".mp4", "_sinaudio.mp4") : OUT;
    const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: ["pipe", "ignore", "inherit"] });
    const N = Math.round(DUR * FPS);
    for (let i = 0; i < N; i++) {
      await page.evaluate((x) => window.renderAt(x), i / FPS);
      const buf = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 90 === 0) console.log(`cuadro ${i}/${N}`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
    if (AUDIO) {
      const sfx = await page.evaluate(() => window.SFX || []);
      const pista = sfx.length ? OUT.replace(".mp4", "_sfx.wav") : null;
      if (pista) await efectos(sfx, DUR, pista);
      const ins = ["-i", silent, "-i", AUDIO].concat(pista ? ["-i", pista] : []);
      const mezcla = pista ? "[1:a][2:a]amix=inputs=2:normalize=0:duration=longest," : "[1:a]";
      // loudnorm en dos pasadas: primero mide, luego aplica (llega a -14 LUFS con precisión)
      const med = require("child_process").spawnSync("ffmpeg", ["-hide_banner", ...ins, "-filter_complex", mezcla + "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]", "-map", "[a]", "-f", "null", "-"], { encoding: "utf8" }).stderr;
      const j = JSON.parse(med.slice(med.lastIndexOf("{"), med.lastIndexOf("}") + 1));
      const fc = mezcla + `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,apad[a]`;
      await run("ffmpeg", ["-y", "-v", "error", ...ins, "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", OUT]);
      fs.unlinkSync(silent); if (pista) fs.unlinkSync(pista);
    }
    console.log("Listo:", OUT);
  }
  await browser.close(); server.close();
})();
