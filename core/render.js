// Render: abre la plantilla del estilo en un navegador sin ventana, dibuja cada fotograma
// y se lo pasa a ffmpeg. Usa varios hilos (RENDER_HILOS) y al final junta video + audio.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { CFG, FORMATOS, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { servirArchivo } from "./estatico.js";
import { ffmpeg, ffmpegTubo } from "./ff.js";
import { mezclar } from "./audio.js";

const LOTE = 6; // fotogramas por viaje al navegador

function buscarChrome() {
  if (CFG.chrome) return CFG.chrome;
  const candidatos = process.platform === "win32"
    ? [] // en Windows usamos el Chromium que instala Playwright
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidatos.find((c) => fs.existsSync(c)) || undefined;
}

async function abrirNavegador() {
  return chromium.launch({
    executablePath: buscarChrome(),
    args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
}

// servidor temporal para que el navegador lea la plantilla y los datos del proyecto
function servidorTemporal() {
  return new Promise((res) => {
    const s = http.createServer((req, r) => { if (!servirArchivo(req, r, req.url)) { r.writeHead(404); r.end(); } });
    s.listen(0, "127.0.0.1", () => res({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

async function abrirPagina(nav, base, proyecto, fmt) {
  const pag = await nav.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: 1 });
  const errores = [];
  pag.on("pageerror", (e) => errores.push(e.message));
  await pag.goto(`${base}/estilos/${proyecto.estilo}/plantilla.html?p=${encodeURIComponent(proyecto.id)}&f=${encodeURIComponent(proyecto.formato)}&render=1`);
  try {
    await pag.waitForFunction(() => window.__listo === true || window.__error, null, { timeout: 90000 });
  } catch { throw new Error("La plantilla no terminó de cargar. " + errores.join(" | ")); }
  const err = await pag.evaluate(() => window.__error || null);
  if (err) throw new Error("La plantilla falló: " + err);
  return pag;
}

export async function fotogramas(id, segundos, salidaDir) {
  // saca imágenes sueltas (para revisar o para la portada)
  const proyecto = leer(id, "proyecto.json");
  const fmt = FORMATOS[proyecto.formato];
  const { s, base } = await servidorTemporal();
  const nav = await abrirNavegador();
  try {
    const pag = await abrirPagina(nav, base, proyecto, fmt);
    fs.mkdirSync(salidaDir, { recursive: true });
    const archivos = [];
    for (const [i, t] of segundos.entries()) {
      const [b64] = await pag.evaluate(([t]) => window.__frames(t, 1, 0, 0.92), [t]);
      const f = path.join(salidaDir, `f${String(i + 1).padStart(2, "0")}.jpg`);
      fs.writeFileSync(f, Buffer.from(b64, "base64"));
      archivos.push(f);
    }
    return archivos;
  } finally { await nav.close(); s.close(); }
}

export async function render(id, avisar = () => {}) {
  const proyecto = leer(id, "proyecto.json");
  const tiempos = leer(id, "tiempos.json");
  const guion = leer(id, "guion.json");
  if (!tiempos) throw new Error("Primero hace falta la voz.");
  const estilo = leerEstilo(proyecto.estilo);
  const fmt = FORMATOS[proyecto.formato];
  const dir = dirProyecto(id);
  const tmp = path.join(dir, "_render"); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  const fps = CFG.fps;
  const total = Math.ceil(tiempos.duracion * fps);
  const hilos = Math.min(CFG.hilos, Math.max(1, Math.floor(total / 60)));
  const t0 = Date.now();

  avisar({ paso: "render", progreso: 0, msg: "Preparando el audio…" });
  const mezcla = await mezclar({ estilo, guion, tiempos, voz: path.join(dir, "voz.mp3"), salida: path.join(tmp, "mezcla.m4a"), tmp: path.join(tmp, "sfx"), dirProyecto: dir });

  const { s, base } = await servidorTemporal();
  const nav = await abrirNavegador();
  let hechos = 0;
  try {
    if (estilo.preparar === "historia") {
      const { prepararHistoria } = await import("./historia.js");
      await prepararHistoria(id, avisar);
    }
    if (estilo.preparar === "mapas") {
      const { prepararMapa } = await import("./mapas.js");
      await prepararMapa(id, avisar, { abrirPagina, nav, base, fmt });
    }
    const tramo = Math.ceil(total / hilos);
    const segmentos = [];
    await Promise.all(Array.from({ length: hilos }, async (_, h) => {
      const desde = h * tramo, hasta = Math.min(total, desde + tramo);
      if (desde >= hasta) return;
      const seg = path.join(tmp, `seg${h}.mp4`); segmentos[h] = seg;
      const pag = await abrirPagina(nav, base, proyecto, fmt);
      const tubo = ffmpegTubo(["-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p", "-r", String(fps), seg]);
      for (let f = desde; f < hasta; f += LOTE) {
        const n = Math.min(LOTE, hasta - f);
        const lote = await pag.evaluate(([t, n, dt]) => window.__frames(t, n, dt, 0.9), [f / fps, n, 1 / fps]);
        for (const b64 of lote) await tubo.escribir(Buffer.from(b64, "base64"));
        hechos += n;
        const seg_ = (Date.now() - t0) / 1000;
        const falta = hechos ? Math.round((seg_ / hechos) * (total - hechos)) : 0;
        avisar({ paso: "render", progreso: hechos / total, msg: `Dibujando ${hechos} de ${total} fotogramas · faltan ~${falta < 90 ? falta + " s" : Math.round(falta / 60) + " min"}` });
      }
      await tubo.cerrar();
      await pag.close();
    }));

    avisar({ paso: "render", progreso: 1, msg: "Juntando video y audio…" });
    const lista = path.join(tmp, "lista.txt");
    fs.writeFileSync(lista, segmentos.filter(Boolean).map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
    const soloVideo = path.join(tmp, "video.mp4");
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", soloVideo]);
    const final = path.join(dir, "final.mp4");
    await ffmpeg(["-i", soloVideo, "-i", mezcla, "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", final]);

    // portada + texto para subir
    const pag = await abrirPagina(nav, base, proyecto, fmt);
    const [b64] = await pag.evaluate(([t]) => window.__frames(t, 1, 0, 0.92), [estilo.portadaEn ?? 1.2]);
    fs.writeFileSync(path.join(dir, "portada.jpg"), Buffer.from(b64, "base64"));
  } finally { await nav.close(); s.close(); }

  const nombre = `${id}-${proyecto.formato.replace(":", "x")}`;
  fs.copyFileSync(path.join(dir, "final.mp4"), path.join(DIR_LISTOS, `${nombre}.mp4`));
  fs.copyFileSync(path.join(dir, "portada.jpg"), path.join(DIR_LISTOS, `${nombre}.jpg`));
  fs.writeFileSync(path.join(DIR_LISTOS, `${nombre}.txt`), textoParaSubir(guion, estilo, tiempos, leer(id, "fondo.json")));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { segundos: Math.round((Date.now() - t0) / 1000), archivo: `listos/${nombre}.mp4` };
}

export function textoParaSubir(guion, estilo, tiempos, fondo) {
  const s = guion.subir || {};
  const lineas = [s.titulo || guion.titulo || "", "", s.descripcion || ""];
  // capítulos (útiles en YouTube largo)
  if (tiempos?.duracion > 120) {
    const caps = guion.escenas.map((e, i) => ({ e, t: tiempos.escenas[i]?.ini })).filter((x) => x.e.capitulo);
    if (caps.length) {
      lineas.push("", ...caps.map(({ e, t }, i) => `${i === 0 ? "0:00" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`} ${e.capitulo}`));
    }
  }
  if (s.hashtags?.length) lineas.push("", s.hashtags.join(" "));
  if (guion.fuentes?.length) lineas.push("", "Fuentes:", ...guion.fuentes.map((f) => `- ${f.dato}: ${f.url}`));
  if (fondo?.credito) lineas.push("", fondo.credito);
  if (estilo.creditos) lineas.push("", estilo.creditos);
  return lineas.join("\n").trim() + "\n";
}
