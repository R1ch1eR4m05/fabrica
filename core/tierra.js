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
