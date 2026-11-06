// Motion graphics (skill claude-video, MIT, en motion/): el panel guarda el brief, Claude Code construye la pieza
// en proyectos/<id>/motion/proj y aquí se renderiza con HyperFrames.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RAIZ, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { ffmpeg, duracion } from "./ff.js";
import { musicaDeBiblioteca } from "./audio.js";
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
${p.motionVoz ? `- **Voz en off:** \`proyectos/${id}/voz.mp3\` (${p.motionVoz.duracion.toFixed(1)} s, ${p.motionVoz.lineas} escenas). Los tiempos de cada escena y de cada palabra están en \`proyectos/${id}/tiempos.json\`: cada línea de la narración es una escena; haz que cada escena entre cuando empieza su línea y que la palabra clave aparezca cuando se dice. La pieza dura lo que la voz + 1 s. No metas el audio en el render: la fábrica lo mezcla al final con la música.` : b.narracion?.trim() ? `- **Narración (aún sin voz):** ${b.narracion.replace(/\n/g, " / ")}` : ""}

Carpeta de trabajo: \`proyectos/${id}/motion/\` (el proyecto HyperFrames va en \`proyectos/${id}/motion/proj/\`).
Al terminar: \`node fabrica.js listo-motion ${id}\`.
`;
  fs.writeFileSync(path.join(dirProyecto(id), "BRIEF.md"), md);
  return p;
}

// voz en off para un motion: la narración del brief (una línea por escena) se convierte en voz con ElevenLabs
// y deja los tiempos de cada palabra en tiempos.json, para que Claude Code anime cada escena al ritmo de la voz.
export async function vozMotion(id, avisar = () => {}) {
  const p = leer(id, "proyecto.json");
  const lineas = String(p.motion?.narracion || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lineas.length) throw new Error("Escribe la narración en el brief (una línea por escena) y guárdalo.");
  guardar(id, "guion.json", { titulo: p.titulo, escenas: lineas.map((l) => ({ tipo: "escena", voz: l })) });
  const antes = p.estado.voz; p.conVoz = true; guardar(id, "proyecto.json", p);
  const { hacerVoz } = await import("./voz.js");
  await hacerVoz(id, avisar);
  const q = leer(id, "proyecto.json"), t = leer(id, "tiempos.json");
  q.estado.voz = antes; q.motionVoz = { duracion: t.duracion, fecha: new Date().toISOString(), lineas: lineas.length };
  guardar(id, "proyecto.json", q);
  guardarBrief(id, q.motion);
  return q.motionVoz;
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
  // música (si la hay): se mezcla sobre el render limpio, que se guarda aparte para poder cambiarla o quitarla
  const limpio = path.join(dir, "final-sin-musica.mp4");
  const mt = fs.statSync(final).mtimeMs;
  if (!fs.existsSync(limpio) || p.motionMezcla !== mt) fs.copyFileSync(final, limpio); // render nuevo (de aquí o de Claude Code)
  // la tuya o la de ElevenLabs; si no hay, una de tu biblioteca musica/ (así nunca sale mudo)
  const propia = fs.readdirSync(dir).find((n) => /^musica\.(mp3|m4a|wav)$/i.test(n));
  const deBib = !propia && musicaDeBiblioteca("motion", dir);
  const musica = propia || (deBib && path.relative(dir, deBib));
  const voz = p.motionVoz && fs.existsSync(path.join(dir, "voz.mp3")) ? path.join(dir, "voz.mp3") : null;
  if (musica || voz) {
    const D = await duracion(limpio), fade = `afade=t=out:st=${Math.max(0, D - 1.5).toFixed(2)}:d=1.5`;
    const ent = ["-i", limpio], fil = [];
    let k = 1;
    if (musica) { ent.push("-stream_loop", "-1", "-i", path.join(dir, musica)); fil.push(`[${k}:a]atrim=0:${D.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,volume=${voz ? 0.16 : 0.9},${fade}[m]`); k++; }
    if (voz) { ent.push("-i", voz); fil.push(`[${k}:a]apad,atrim=0:${D.toFixed(2)},volume=1.0[v]`); }
    const sal = musica && voz ? `${fil.join(";")};[m][v]amix=inputs=2:duration=first:normalize=0[a]` : `${fil[0].replace(/\[(m|v)\]$/, "[a]")}`;
    await ffmpeg([...ent, "-filter_complex", sal, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", D.toFixed(2), final]);
  } else fs.copyFileSync(limpio, final);
  p.motionMezcla = fs.statSync(final).mtimeMs;
  await ffmpeg(["-ss", "1.5", "-i", final, "-frames:v", "1", "-q:v", "2", path.join(dir, "portada.jpg")]).catch(() => {});
  const nombre = `${id}-${(p.formato || "9:16").replace(":", "x")}`;
  fs.copyFileSync(final, path.join(DIR_LISTOS, `${nombre}.mp4`));
  if (fs.existsSync(path.join(dir, "portada.jpg"))) fs.copyFileSync(path.join(dir, "portada.jpg"), path.join(DIR_LISTOS, `${nombre}.jpg`));
  const creditos = "Motion graphics hecho en código con HyperFrames.";
  fs.writeFileSync(path.join(DIR_LISTOS, `${nombre}.txt`), `${p.titulo}\n\n${p.idea || ""}\n\n${creditos}\n`);
  p.estado.render = "listo"; guardar(id, "proyecto.json", p);
  return { archivo: `listos/${nombre}.mp4` };
}
