// Fondos para los estilos que los usan (estilo.json → "fondo": true).
// Orden: archivo propio subido (fondo-propio.*) → búsqueda en Pexels (guion.fondo.buscar) → degradado animado.
// El fondo se prepara una vez con ffmpeg (escala, desenfoque, oscurecido) en proyectos/<id>/fondo/00001.jpg…
import fs from "node:fs";
import path from "node:path";
import { CFG, FORMATOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { ffmpeg, duracion } from "./ff.js";

const FPS_FONDO = 15;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i, IMAGEN = /\.(jpe?g|png|webp)$/i;

export function fondoPropio(id) {
  const f = fs.readdirSync(dirProyecto(id)).find((n) => n.startsWith("fondo-propio."));
  return f ? path.join(dirProyecto(id), f) : null;
}

async function pexels(buscar, vertical) {
  const h = { Authorization: CFG.pexelsKey };
  const orient = vertical ? "portrait" : "landscape";
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(buscar)}&orientation=${orient}&size=medium&per_page=15`, { headers: h });
  if (!r.ok) throw new Error(`Pexels respondió ${r.status}`);
  const j = await r.json();
  const vids = (j.videos || []).filter((v) => v.duration >= 6);
  if (vids.length) {
    vids.sort((a, b) => b.duration - a.duration);
    const v = vids[Math.floor(Math.random() * Math.min(4, vids.length))]; // un poco de variedad
    const archivos = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width).sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    return { url: archivos[0].link, tipo: "video", credito: `Video de ${v.user?.name || "Pexels"} en Pexels`, ext: ".mp4" };
  }
  const rf = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(buscar)}&orientation=${orient}&per_page=10`, { headers: h });
  const jf = rf.ok ? await rf.json() : {};
  const foto = jf.photos?.[0];
  if (!foto) return null;
  return { url: foto.src.large2x || foto.src.original, tipo: "imagen", credito: `Foto de ${foto.photographer} en Pexels`, ext: ".jpg" };
}

async function pixabay(buscar, vertical) {
  const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(CFG.pixabayKey)}&q=${encodeURIComponent(buscar)}&per_page=30&safesearch=true`);
  if (!r.ok) throw new Error(`Pixabay respondió ${r.status}`);
  const j = await r.json();
  const opciones = (j.hits || []).filter((v) => v.duration >= 6).map((v) => {
    const f = [v.videos?.large, v.videos?.medium].find((x) => x?.url) || {};
    return { v, f, vert: f.height > f.width };
  }).filter((x) => x.f.url);
  if (!opciones.length) return null;
  const mejores = opciones.filter((x) => x.vert === vertical);
  const lista = mejores.length ? mejores : opciones;
  const x = lista[Math.floor(Math.random() * Math.min(4, lista.length))];
  return { url: x.f.url, tipo: "video", credito: `Video de ${x.v.user || "Pixabay"} en Pixabay`, ext: ".mp4" };
}

export async function prepararFondo(id, avisar = () => {}, { buscar } = {}) {
  const proyecto = leer(id, "proyecto.json");
  const guion = leer(id, "guion.json") || {};
  const tiempos = leer(id, "tiempos.json");
  const estilo = leerEstilo(proyecto.estilo);
  const dir = dirProyecto(id);
  const fmt = FORMATOS[proyecto.formato];
  const D = (tiempos?.duracion || 30) + 0.5;
  const salida = path.join(dir, "fondo");
  fs.rmSync(salida, { recursive: true, force: true }); fs.mkdirSync(salida);

  let fuente = fondoPropio(id), credito = "", tipo = null;
  if (fuente) tipo = VIDEO.test(fuente) ? "video" : "imagen";
  const consulta = buscar || proyecto.fondoBuscar || guion.fondo?.buscar;
  if (!fuente && consulta && (CFG.pexelsKey || CFG.pixabayKey)) {
    avisar({ paso: "voz", msg: `Buscando fondo: "${consulta}"…` });
    try {
      let p = CFG.pexelsKey ? await pexels(consulta, fmt.h > fmt.w).catch(() => null) : null;
      if (!p && CFG.pixabayKey) p = await pixabay(consulta, fmt.h > fmt.w);
      if (p) {
        const bin = Buffer.from(await (await fetch(p.url)).arrayBuffer());
        fuente = path.join(dir, "fondo-pexels" + p.ext); fs.writeFileSync(fuente, bin);
        tipo = p.tipo; credito = p.credito;
      }
    } catch (e) { console.warn("Pexels:", e.message); }
  }
  if (!fuente) { guardar(id, "fondo.json", { tipo: "degradado" }); return { tipo: "degradado" }; }

  avisar({ paso: "voz", msg: "Preparando el fondo (desenfoque)…" });
  // a la mitad de resolución: va desenfocado, así pesa poco y carga rápido
  const w = Math.round(fmt.w / 2 / 2) * 2, h = Math.round(fmt.h / 2 / 2) * 2;
  const blur = estilo.desenfoque ?? 14;
  const filtro = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=${blur},eq=saturation=0.9`;
  if (tipo === "video") {
    const dv = await duracion(fuente).catch(() => D);
    // se usan hasta 20 s del clip en "ida y vuelta" (adelante y luego en reversa): la plantilla lo repite sin que se note el salto
    const usa = Math.min(dv, 20, D);
    const pingpong = usa < D ? `,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0` : "";
    await ffmpeg(["-t", usa.toFixed(2), "-i", fuente, "-an",
      "-filter_complex", `[0:v]fps=${FPS_FONDO},${filtro}${pingpong}[o]`, "-map", "[o]", "-q:v", "4", path.join(salida, "%05d.jpg")]);
  } else {
    await ffmpeg(["-i", fuente, "-vf", filtro, "-frames:v", "1", "-q:v", "3", path.join(salida, "00001.jpg")]);
  }
  const frames = fs.readdirSync(salida).filter((f) => f.endsWith(".jpg")).length;
  const info = { tipo, frames, fps: FPS_FONDO, credito, origen: path.basename(fuente) };
  guardar(id, "fondo.json", info);
  return info;
}
