// Motion graphics (skill claude-video, MIT, en motion/): el panel guarda el brief, Claude Code construye la pieza
// en proyectos/<id>/motion/proj y aquí se renderiza con HyperFrames.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RAIZ, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { ffmpeg } from "./ff.js";
import { CFG } from "./config.js";
import { chromium } from "playwright";

// HyperFrames usa el mismo navegador que la fábrica (el de Playwright o el del sistema): no baja otro
function navegador() {
  if (process.env.HYPERFRAMES_BROWSER_PATH) return process.env.HYPERFRAMES_BROWSER_PATH;
  if (CFG.chrome && fs.existsSync(CFG.chrome)) return CFG.chrome;
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch {}
  return ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((x) => fs.existsSync(x));
}

const HF = "hyperframes@0.8.181"; // la versión con la que se hicieron los estilos

export const dirTrabajo = (id) => path.join(dirProyecto(id), "motion");
export const dirProj = (id) => path.join(dirTrabajo(id), "proj");

export function guardarBrief(id, b) {
  const p = leer(id, "proyecto.json");
  const cat = leerEstilo("motion").catalogo || [];
  const est = cat.find((x) => x.id === b.estiloMotion) || {};
  p.motion = { ...b };
  if (b.formato) p.formato = b.formato;
  guardar(id, "proyecto.json", p);
  const md = `# Brief · ${p.titulo}

- **Estilo:** ${est.nombre || b.estiloMotion} (\`${b.estiloMotion}\`) — ficha en \`motion/estilos/${b.estiloMotion}/ESTILO.md\`, video en \`motion/galeria/videos/${b.estiloMotion}.mp4\`
- **Formato:** ${b.formato || p.formato} · **Duración:** ${b.segundos || est.seg || 12} s · **Loop:** ${b.loop ? "sí" : "no"}
- **Para qué es:** ${b.para || "Reels / TikTok"}
- **Tema / idea:** ${p.idea || p.titulo}
- **Texto en pantalla:** ${b.textos?.trim() ? b.textos : "(lo escribe Claude a partir del tema; máximo 6 palabras a la vez)"}
- **Marca:** ${b.marca?.trim() ? b.marca : "(colores y fuentes del estilo)"}
- **Medios:** ${b.medios || "ninguno, solo gráfico"}
- **Notas:** ${b.notas || "-"}

Carpeta de trabajo: \`proyectos/${id}/motion/\` (el proyecto HyperFrames va en \`proyectos/${id}/motion/proj/\`).
Al terminar: \`node fabrica.js listo-motion ${id}\`.
`;
  fs.writeFileSync(path.join(dirProyecto(id), "BRIEF.md"), md);
  return p;
}

export function estadoMotion(id) {
  const proj = dirProj(id);
  const frames = path.join(proj, "frames");
  return {
    construido: fs.existsSync(path.join(proj, "index.html")),
    frames: fs.existsSync(frames) ? fs.readdirSync(frames).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => `proyectos/${id}/motion/proj/frames/${f}`) : [],
    brief: fs.existsSync(path.join(dirProyecto(id), "BRIEF.md")),
  };
}

function correr(args, avisar) {
  return new Promise((ok, mal) => {
    const win = process.platform === "win32";
    const nav = navegador();
    const env = { ...process.env, ...(nav ? { HYPERFRAMES_BROWSER_PATH: nav } : {}) };
    const p = spawn(win ? "npx.cmd" : "npx", args, { cwd: RAIZ, shell: win, env });
    let err = "";
    const seguir = (d) => { const t = String(d); err += t; const m = t.match(/(\d{1,3})%/); if (m) avisar({ progreso: Number(m[1]) / 100, msg: `Renderizando con HyperFrames… ${m[1]}%` }); };
    p.stdout.on("data", seguir); p.stderr.on("data", seguir);
    p.on("error", mal);
    p.on("close", (c) => (c === 0 ? ok() : mal(new Error("HyperFrames falló: " + err.slice(-500)))));
  });
}

export async function renderMotion(id, avisar = () => {}) {
  const proj = dirProj(id);
  if (!fs.existsSync(path.join(proj, "index.html"))) throw new Error("Todavía no está construido. En Claude Code di: construye el motion de " + id);
  const final = path.join(dirProyecto(id), "final.mp4");
  avisar({ progreso: 0, msg: "Renderizando con HyperFrames (la primera vez baja el motor)…" });
  await correr(["--yes", HF, "render", proj, "-o", final, "-q", "high", "-w", "auto"], avisar);
  return terminar(id);
}

// copia a listos/, saca portada y texto para subir
export async function terminar(id) {
  const p = leer(id, "proyecto.json");
  const dir = dirProyecto(id);
  let final = path.join(dir, "final.mp4");
  if (!fs.existsSync(final)) {
    const out = path.join(dirTrabajo(id), "out", "final.mp4");
    if (fs.existsSync(out)) fs.copyFileSync(out, final); else throw new Error("No encuentro el video final.");
  }
  await ffmpeg(["-ss", "1.5", "-i", final, "-frames:v", "1", "-q:v", "2", path.join(dir, "portada.jpg")]).catch(() => {});
  const nombre = `${id}-${(p.formato || "9:16").replace(":", "x")}`;
  fs.copyFileSync(final, path.join(DIR_LISTOS, `${nombre}.mp4`));
  if (fs.existsSync(path.join(dir, "portada.jpg"))) fs.copyFileSync(path.join(dir, "portada.jpg"), path.join(DIR_LISTOS, `${nombre}.jpg`));
  const creditos = "Motion graphics hecho en código con HyperFrames.";
  fs.writeFileSync(path.join(DIR_LISTOS, `${nombre}.txt`), `${p.titulo}\n\n${p.idea || ""}\n\n${creditos}\n`);
  p.estado.render = "listo"; guardar(id, "proyecto.json", p);
  return { archivo: `listos/${nombre}.mp4` };
}
