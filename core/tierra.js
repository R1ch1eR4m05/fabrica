// Entrada «de la Tierra a tu ciudad» para el Corporativo (24 nov 2026): estilos/corporativo/tierra/tierra.html dibujado cuadro por
// cuadro con el navegador → proyectos/<id>/material/<nombre>.mp4 (por defecto T1.mp4), para usarlo como toma en el guion.
// Globo con NASA Blue Marble (dominio público) + mapa de México de @svg-maps/mexico (CC BY 4.0: atribución en la descripción).
// NO Google Earth / Earth Studio: sus reglas prohíben usarlo en videos promocionales o anuncios. No gasta nada.
import fs from "node:fs";
import path from "node:path";
import { dirProyecto } from "./proyectos.js";
import { ffmpegTubo } from "./ff.js";

export const CREDITO_MAPA = "Mapa de México: @svg-maps/mexico (Victor Cazanave), CC BY 4.0. Imagen de la Tierra: NASA Blue Marble.";

export async function hacerTierra(id, { lat = 19.706, lon = -101.195, lugar = "MORELIA", detalle = "", estado = "mic", color = "#E6194B", dur = 7, nombre = "T1", w = 1920, h = 1080, avisar = () => {} } = {}) {
  const { abrirNavegador, servidorTemporal } = await import("./render.js");
  const salida = path.join(dirProyecto(id), "material", `${nombre}.mp4`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const { s, base } = await servidorTemporal();
  const nav = await abrirNavegador();
  try {
    const pag = await nav.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const q = new URLSearchParams({ lat, lon, lugar, detalle, estado, color, dur });
    await pag.goto(`${base}/estilos/corporativo/tierra/tierra.html?${q}`);
    await pag.waitForFunction(() => window.__listo === true || window.__error, null, { timeout: 60000 });
    const err = await pag.evaluate(() => window.__error || null); if (err) throw new Error(err);
    const fps = 30, N = Math.round(dur * fps);
    const tubo = ffmpegTubo(["-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", salida]);
    for (let f = 0; f < N; f++) {
      await pag.evaluate((t) => window.renderAt(t), f / fps);
      await tubo.escribir(await pag.screenshot({ type: "jpeg", quality: 92 }));
      if (f % 15 === 0) avisar({ paso: "render", progreso: f / N, msg: `De la Tierra a ${lugar}: cuadro ${f} de ${N}` });
    }
    await tubo.cerrar();
  } finally { await nav.close(); s.close(); }
  return salida;
}

// Render de Google Earth Studio (Richie, 24 nov 2026: es un demo de edición, no publicidad) → material/T1.mp4.
// Acepta el .zip que baja Earth Studio, una carpeta con los .jpeg o un .mp4. Deja la atribución de Google Earth que trae el render.
export async function desdeEarth(id, origen, { nombre = "T1", fps = 30, w = 1920, h = 1080 } = {}) {
  const { ffmpeg } = await import("./ff.js");
  const salida = path.join(dirProyecto(id), "material", `${nombre}.mp4`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ajuste = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},format=yuv420p`;
  if (/\.(mp4|mov|webm)$/i.test(origen)) { await ffmpeg(["-y", "-i", origen, "-an", "-vf", ajuste, "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", salida]); return salida; }
  let dir = origen;
  if (/\.zip$/i.test(origen)) {
    dir = path.join(dirProyecto(id), "material", "_earth");
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const { execFileSync } = await import("node:child_process");
    if (process.platform === "win32") execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${origen}' -DestinationPath '${dir}' -Force`]);
    else execFileSync("unzip", ["-qo", origen, "-d", dir]);
  }
  const todas = []; const buscar = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) buscar(p); else if (/\.(jpe?g|png)$/i.test(f.name)) todas.push(p); } };
  buscar(dir);
  if (!todas.length) throw new Error(`No encontré cuadros .jpeg en ${origen}`);
  todas.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const lista = path.join(path.dirname(salida), "_earth-lista.txt");
  fs.writeFileSync(lista, todas.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'\nduration ${(1 / fps).toFixed(6)}`).join("\n"));
  await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", lista, "-vf", ajuste, "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", salida]);
  fs.rmSync(lista, { force: true });
  return salida;
}
