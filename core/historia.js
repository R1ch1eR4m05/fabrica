// Estilo "Historia con Flow": cada escena tiene su propio clip.
// Orden por escena: tu clip (clips/escena-N.*) → clip de Google Flow (si lo generaste) → búsqueda en Pexels/Pixabay → dibujo animado.
// Los clips se convierten una vez a fotogramas (clips/N/00001.jpg…) del largo exacto de la escena, para que el render sea exacto.
import fs from "node:fs";
import path from "node:path";
import { CFG, FORMATOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { ffmpeg, duracion } from "./ff.js";
import { pexels, pixabay } from "./fondos.js";
import { llamar, flowDisponible } from "./flow.js";
import { flowSkillListo, lote } from "./flowskill.js";
import { leerEstilo } from "./estilos.js";

const FPS = 24;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i, IMAGEN = /\.(jpe?g|png|webp)$/i;
export const dirClips = (id) => path.join(dirProyecto(id), "clips");

export function clipDeEscena(id, n) {
  const d = dirClips(id); if (!fs.existsSync(d)) return null;
  if (fs.existsSync(path.join(d, `anim-${n}.mp4`))) return path.join(d, `anim-${n}.mp4`); // la escena animada en Flow va antes que su imagen
  const f = fs.readdirSync(d).find((x) => x.startsWith(`escena-${n}.`) && (VIDEO.test(x) || IMAGEN.test(x)));
  return f ? path.join(d, f) : null;
}

const AUD = (id) => path.join(dirClips(id), "auditoria.json");
export const leerAuditoria = (id) => { try { return JSON.parse(fs.readFileSync(AUD(id), "utf8")); } catch { return null; } };
export function quitarDeAuditoria(id, escenas) { const a = leerAuditoria(id); if (!a) return; for (const n of escenas) delete a.escenas?.[n]; fs.writeFileSync(AUD(id), JSON.stringify(a, null, 2)); }

export function estadoClips(id) {
  const g = leer(id, "guion.json") || { escenas: [] };
  let org = {}; try { org = JSON.parse(fs.readFileSync(path.join(dirClips(id), "origen.json"), "utf8")); } catch {}
  return g.escenas.map((e, k) => { const f = clipDeEscena(id, k + 1); return { n: k + 1, tipo: e.tipo, archivo: f ? path.basename(f) : null, origen: f ? org[k + 1] || "" : "", flowPrompt: e.flowPrompt || "", buscar: e.buscar || "", misma: !!e.misma && !f }; });
}

// prompt de Flow de una escena: estilo visual y personajes del guion + la acción de la escena (así los personajes salen iguales)
export function promptFlow(guion, e) {
  return [guion.estiloVisual, guion.personajes && `Characters (keep them identical in every shot): ${guion.personajes}`, e.flowPrompt,
    "Vertical 9:16, cinematic, smooth camera, no text, no subtitles, no logos."].filter(Boolean).join(" ");
}

// con Google Flow Skill: 1) una imagen de los personajes, 2) el primer cuadro de cada escena usando esa imagen de
// referencia, 3) cada escena animada desde su cuadro. Así la familia se ve igual en todas las tomas.
async function clipsConSkill(id, avisar, { soloFaltantes = true, conCuadros = true, escenas = null, notas = {} } = {}) {
  const g = leer(id, "guion.json");
  const pr = leer(id, "proyecto.json"), est = leerEstilo(pr.estilo);
  // anuncios: la foto de la escena va en "imagen"; se anima solo si el anuncio es video y pidieron clips
  if (est?.anuncios) for (const e of g.escenas) if (!e.flowPrompt && e.imagen) e.flowPrompt = e.imagen;
  const soloImagen = est?.clipsFlow === "imagen" || (est?.anuncios && !(pr.opciones?.tipo === "video" && pr.opciones?.animar === "si"));
  const pend = g.escenas.map((e, k) => ({ e, n: k + 1 })).filter(({ e, n }) => (est?.anuncios || e.tipo !== "cierre" || soloImagen) && !e.misma && e.flowPrompt && (escenas ? escenas.includes(n) : !soloFaltantes || !clipDeEscena(id, n)));
  if (!pend.length) return { generados: 0 };
  // rehacer con corrección: la nota (del auditor o tuya) se suma al prompt de esa escena
  for (const x of pend) if (notas[x.n]) x.e = { ...x.e, flowPrompt: `${String(x.e.flowPrompt).trim().replace(/([^.!?])$/, "$1.")} ${String(notas[x.n]).trim()}` };
  // proporción de Flow: la del proyecto (16:9 para YouTube largo); 4:5 y 1:1 se piden en 9:16 y se recortan
  const ratio = pr.formato === "16:9" ? "16:9" : "9:16";
  const estilo = [g.estiloVisual || est?.estiloVisual, ratio === "16:9" ? "horizontal 16:9 widescreen" : "vertical 9:16"].filter(Boolean).join(", ");
  const jobs = [];
  // estilos de imagen fija con movimiento de cámara (p. ej. Reflexión · Estatuas): solo imágenes, mucho más barato
  if (soloImagen) {
    // Flow a veces se satura y deja escenas sin salir ("no completó en 120s"): se reintentan solo las que faltan,
    // hasta 3 vueltas, con una pausa para que Flow respire. Lo que siga faltando se avisa (no se da por listo).
    fs.mkdirSync(dirClips(id), { recursive: true });
    let generados = 0, fallos = [], faltan = pend;
    for (let vuelta = 1; vuelta <= 3 && faltan.length; vuelta++) {
      if (vuelta > 1) {
        avisar({ paso: "fondo", progreso: 0.9, msg: `Flow dejó ${faltan.length} sin salir; espero 90 s y reintento (vuelta ${vuelta} de 3)…` });
        await new Promise((r) => setTimeout(r, 90000));
      }
      const jobs = faltan.map(({ e, n }) => ({ type: "image", name: `escena-${n}`, prompt: `${estilo}. ${String(e.flowPrompt).trim()} No text, no letters, no logos, no watermark.` }));
      avisar({ paso: "fondo", progreso: 0.02, msg: `Flow: ${jobs.length} imágenes${vuelta > 1 ? ` (vuelta ${vuelta})` : ""}…` });
      let r;
      try { r = await lote(id, `imagenes-${Date.now()}`, jobs, (a) => avisar({ ...a, paso: "fondo" }), { ratio, minutos: Math.max(60, jobs.length * 3) }); }
      catch (err) { fallos = [err.message]; if (generados) break; throw err; }
      fallos = r.fallos;
      for (const { n } of faltan) { const f = r.archivos[`escena-${n}`]; if (!f) continue;
        for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x));
        fs.copyFileSync(f, path.join(dirClips(id), `escena-${n}${path.extname(f).toLowerCase()}`)); generados++; }
      faltan = faltan.filter(({ n }) => !clipDeEscena(id, n));
    }
    if (!generados) throw new Error("Flow no entregó imágenes: " + fallos.join(" | "));
    return { generados, fallos: faltan.map(({ n }) => `escena-${n}`), motivo: fallos[0] || "" };
  }
  const conRef = conCuadros && g.personajes;
  // la imagen de personajes se guarda la primera vez y se reutiliza al rehacer escenas (así salen iguales que las demás)
  const refGuardada = conRef && fs.existsSync(dirClips(id)) && fs.readdirSync(dirClips(id)).find((x) => /^personajes\.(png|jpe?g|webp)$/i.test(x));
  const ref = refGuardada ? path.join(dirClips(id), refGuardada) : "personajes";
  if (conRef && !refGuardada) jobs.push({ type: "image", name: "personajes", prompt: `${estilo}. Character reference, full body, front view, neutral pose, plain soft background, no text: ${g.personajes}` });
  const fin = (x) => String(x || "").trim().replace(/([^.!?])$/, "$1.");
  for (const { e, n } of pend) {
    if (conCuadros) {
      jobs.push({ type: "image", name: `cuadro-${n}`, ...(conRef ? { image: ref } : {}), prompt: `${estilo}. ${g.personajes ? "Same characters as the reference, identical faces, hair and clothes. " : ""}First frame of the shot: ${fin(e.flowPrompt)} No text, no logos.` });
      jobs.push({ type: "video", name: `escena-${n}`, start: `cuadro-${n}`, prompt: `${fin(e.flowPrompt)} Keep the characters exactly as in the first frame. Smooth cinematic camera, no text.` });
    } else jobs.push({ type: "video", name: `escena-${n}`, prompt: promptFlow(g, e) });
  }
  avisar({ paso: "fondo", progreso: 0.02, msg: `Flow: ${jobs.length} trabajos (${pend.length} escenas)…` });
  const { archivos, fallos } = await lote(id, `historia-${Date.now()}`, jobs, (a) => avisar({ ...a, paso: "fondo" }), { ratio });
  fs.mkdirSync(dirClips(id), { recursive: true });
  if (archivos.personajes && fs.existsSync(archivos.personajes)) fs.copyFileSync(archivos.personajes, path.join(dirClips(id), `personajes${path.extname(archivos.personajes).toLowerCase()}`));
  let generados = 0;
  for (const { n } of pend) {
    const f = archivos[`escena-${n}`]; if (!f) continue;
    for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x));
    fs.copyFileSync(f, path.join(dirClips(id), `escena-${n}${path.extname(f).toLowerCase()}`)); generados++;
  }
  if (!generados) throw new Error("Flow no entregó clips: " + fallos.join(" | "));
  return { generados, fallos };
}

// lo que sale de Flow entra al banco de imágenes en ese momento (y, con espejo, se manda solo al VPS)
async function alBanco(id, r) { try { const B = await import("./banco.js"); await B.guardarDeProyecto(id); } catch (e) { console.warn("Banco:", e.message); } return r; }

// genera en Flow los clips que faltan (todas las escenas de una vez); cada uno queda como clips/escena-N.mp4
export async function clipsDeFlow(id, avisar = () => {}, { maxCreditos = 25, soloFaltantes = true, conCuadros = true, escenas = null, notas = {} } = {}) {
  if (flowSkillListo()) { const r = await alBanco(id, await clipsConSkill(id, avisar, { soloFaltantes, conCuadros, escenas, notas })); if (escenas) quitarDeAuditoria(id, escenas); return r; }
  if (escenas) throw new Error("Rehacer escenas sueltas necesita la skill de Flow (laptop).");
  if (!(await flowDisponible())) throw new Error("No encuentro flow-mcp abierto. Abre 'Flow Studio' y vuelve a intentar.");
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  const pendientes = g.escenas.map((e, k) => ({ e, n: k + 1 })).filter(({ e, n }) => e.tipo !== "cierre" && e.flowPrompt && (!soloFaltantes || !clipDeEscena(id, n)));
  if (!pendientes.length) return { generados: 0 };
  avisar({ paso: "fondo", progreso: 0.05, msg: `Pidiendo ${pendientes.length} clips a Flow…` });
  const pedidas = pendientes.map(({ e }) => ({ prompt: promptFlow(g, e), type: "video", aspect_ratio: p.formato === "16:9" ? "16:9" : "9:16", max_credits: maxCreditos, retries: 1 }));
  const { jobs } = await llamar("generate", { project: `fabrica-${id}`, scenes: pedidas });
  const ids = jobs.map((j) => j.id), t0 = Date.now();
  fs.mkdirSync(dirClips(id), { recursive: true });
  for (;;) {
    const w = await llamar("wait", { job_ids: ids, timeout_seconds: 40 }, 60000);
    const listos = (w.jobs || []).filter((j) => ["done", "failed", "error"].includes(j.status)).length;
    avisar({ paso: "fondo", progreso: Math.min(0.95, 0.1 + 0.85 * (listos / ids.length)), msg: `Flow: ${listos} de ${ids.length} clips (${Math.round((Date.now() - t0) / 1000)} s)` });
    if (w.finished) {
      let generados = 0; const fallos = [];
      (w.jobs || []).forEach((job) => {
        const k = ids.indexOf(job.id), { n } = pendientes[k] || {};
        const archivo = (job.files || []).find((f) => VIDEO.test(f));
        if (n && archivo && fs.existsSync(archivo)) { for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x)); fs.copyFileSync(archivo, path.join(dirClips(id), `escena-${n}${path.extname(archivo).toLowerCase()}`)); generados++; }
        else if (n) fallos.push(`escena ${n}: ${job.error || job.status}`);
      });
      if (!generados) throw new Error("Flow no entregó clips: " + fallos.join(" | "));
      return alBanco(id, { generados, fallos });
    }
    if (Date.now() - t0 > 40 * 60000) throw new Error("Flow tardó más de 40 minutos. Revisa la ventana de Flow.");
  }
}

// ---------------- animar en Flow solo las escenas que lo piden (imagen → video de 8 s) ----------------
// Primero salen todas las imágenes (clips/escena-N.png); luego se animan las marcadas con "animar": true en el guion.
// El video queda en clips/anim-N.mp4 y el render lo usa en lugar de la imagen (estirado a lo que dura la escena).
const IMG_ESCENA = (id, n) => { const d = dirClips(id); if (!fs.existsSync(d)) return null; const f = fs.readdirSync(d).find((x) => x.startsWith(`escena-${n}.`) && IMAGEN.test(x)); return f ? path.join(d, f) : null; };
const MOVIBLE = /water|river|stream|waterfall|lake|pond|rain|mist|fog|cloud|steam|smoke|tea|teapot|cup|candle|lantern|fire|flame|brush|ink|calligraph|writ|leaves|petal|snow|wind|bamboo|rice|field|sunset|sunrise|ripple|reflection|breath|walk|pour|stir/i;

// marca (en guion.json) cuáles animar: 1 de cada 3 aprox., las que más se mueven (agua, vapor, pincel…), sin 3 seguidas
export function elegirAnimadas(id, { proporcion = 1 / 3 } = {}) {
  const g = leer(id, "guion.json"); if (!g) throw new Error("No hay guion.");
  if (g.escenas.some((e) => e.animar)) return g.escenas.filter((e) => e.animar).length;
  const tope = Math.max(1, Math.round(g.escenas.length * proporcion));
  const puntos = g.escenas.map((e, k) => ({ k, p: (MOVIBLE.test(String(e.flowPrompt || "")) ? 2 : 0) + (e.misma ? -3 : 0) + (e.tipo === "cierre" ? -1 : 0) + (k % 3 === 0 ? 0.5 : 0) + (k === 0 ? 5 : 0) })) // la escena 1 (gancho) se anima siempre
    .filter((x) => x.p > 0 && IMG_ESCENA(id, x.k + 1)).sort((a, b) => b.p - a.p || a.k - b.k);
  const elegidas = new Set();
  for (const { k } of puntos) { if (elegidas.size >= tope) break; if (elegidas.has(k - 1) && elegidas.has(k - 2)) continue; if (elegidas.has(k + 1) && elegidas.has(k + 2)) continue; elegidas.add(k); }
  g.escenas.forEach((e, k) => { if (elegidas.has(k)) e.animar = true; });
  guardar(id, "guion.json", g);
  return elegidas.size;
}

const promptMovimiento = (g, e) => (e.animacion || `Very subtle, calm natural motion only: ${String(e.flowPrompt || "").replace(/\.$/, "")}. Gentle drifting mist or water ripples, soft light changes, slight breathing and small hand movements if a person is present. Camera almost still, no cuts, no new objects, keep the watercolor ink painting style exactly as in the first frame.`) + " No text, no subtitles.";

export async function animarEscenas(id, avisar = () => {}, { soloFaltantes = true } = {}) {
  if (!flowSkillListo()) throw new Error("Animar necesita la skill de Flow (FLOW_SKILL_DIR en el .env de la laptop).");
  const pr = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  const ratio = pr.formato === "16:9" ? "16:9" : "9:16";
  let faltan = g.escenas.map((e, k) => ({ e, n: k + 1, img: IMG_ESCENA(id, k + 1) })).filter(({ e, n, img }) => e.animar && img && (!soloFaltantes || !fs.existsSync(path.join(dirClips(id), `anim-${n}.mp4`))));
  if (!faltan.length) return { generados: 0, fallos: [], motivo: "No hay escenas marcadas para animar que tengan imagen." };
  let generados = 0, fallos = [];
  for (let vuelta = 1; vuelta <= 3 && faltan.length; vuelta++) {
    if (vuelta > 1) { avisar({ paso: "fondo", progreso: 0.9, msg: `Flow dejó ${faltan.length} animaciones sin salir; espero 90 s y reintento (vuelta ${vuelta} de 3)…` }); await new Promise((r) => setTimeout(r, 90000)); }
    const jobs = faltan.map(({ e, n, img }) => ({ type: "video", name: `anim-${n}`, start: img, duration: "8s", prompt: promptMovimiento(g, e) }));
    avisar({ paso: "fondo", progreso: 0.02, msg: `Flow: animando ${jobs.length} escenas${vuelta > 1 ? ` (vuelta ${vuelta})` : ""}…` });
    let r;
    try { r = await lote(id, `animar-${Date.now()}`, jobs, (a) => avisar({ ...a, paso: "fondo" }), { ratio, minutos: Math.max(60, jobs.length * 6) }); }
    catch (err) { fallos = [err.message]; if (generados) break; throw err; }
    fallos = r.fallos;
    for (const { n } of faltan) { const f = r.archivos[`anim-${n}`]; if (!f) continue; fs.copyFileSync(f, path.join(dirClips(id), `anim-${n}.mp4`)); generados++; }
    faltan = faltan.filter(({ n }) => !fs.existsSync(path.join(dirClips(id), `anim-${n}.mp4`)));
  }
  if (!generados) throw new Error("Flow no entregó animaciones: " + fallos.join(" | "));
  return { generados, fallos: faltan.map(({ n }) => `anim-${n}`), motivo: fallos[0] || "" };
}

// antes del render: fotogramas de cada escena
export async function prepararHistoria(id, avisar = () => {}, { formato } = {}) {
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json"), t = leer(id, "tiempos.json");
  if (formato) p.formato = formato; // anuncios: se prepara una vez por medida
  const fmt = FORMATOS[p.formato], vertical = fmt.h > fmt.w;
  const w = Math.round((fmt.w * 0.75) / 2) * 2, h = Math.round((fmt.h * 0.75) / 2) * 2;
  const filtro = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const info = [];
  const est = leerEstilo(p.estilo), B = est?.banco ? await import("./banco.js") : null;
  const usados = new Set();
  let ultima = null;
  if (B) { await B.guardarDeProyecto(id).catch(() => {}); }
  const nicho = B ? await B.nichoDeProyecto(p) : null;
  for (const [k, e] of g.escenas.entries()) {
    const n = k + 1, te = t.escenas[k], D = Math.max(1, te.fin - te.ini + 0.4);
    const sal = path.join(dirClips(id), String(n)); fs.rmSync(sal, { recursive: true, force: true }); fs.mkdirSync(sal, { recursive: true });
    let fuente = clipDeEscena(id, n), credito = "", origen = fuente ? (B?.origenes(id)[n] || "tuyo/Flow") : "";
    // "misma": true → la escena sigue con la imagen de la anterior (otro movimiento de cámara); ahorra imágenes en videos largos
    if (!fuente && e.misma && ultima) { fuente = ultima.fuente; origen = ultima.origen; credito = ultima.credito; }
    // banco de imágenes de videos anteriores: si hay una que se parezca, va antes que Pexels
    if (!fuente && B) { const x = B.delBanco(est.id, e, usados, { nicho }); if (x) { fuente = B.archivoBanco(est.id, x.archivo); usados.add(x.archivo); origen = "banco"; } }
    if (!fuente && e.buscar && (CFG.pexelsKey || CFG.pixabayKey)) {
      avisar({ paso: "render", msg: `Escena ${n}: buscando "${e.buscar}"…` });
      try {
        let r = CFG.pexelsKey ? await pexels(e.buscar, vertical).catch(() => null) : null;
        if (!r && CFG.pixabayKey) r = await pixabay(e.buscar, vertical);
        if (r) { fuente = path.join(dirClips(id), `pexels-${n}${r.ext}`); fs.writeFileSync(fuente, Buffer.from(await (await fetch(r.url)).arrayBuffer())); credito = r.credito; origen = "pexels"; }
      } catch (er) { console.warn("Pexels:", er.message); }
    }
    // Pexels no dio nada: cualquier imagen del banco que no se haya usado en este video
    if (!fuente && B) { const x = B.cualquieraDelBanco(est.id, usados, n * 7 + id.length); if (x) { fuente = B.archivoBanco(est.id, x.archivo); usados.add(x.archivo); origen = "banco"; } }
    if (!fuente) { info.push({ n, tipo: "ninguno" }); continue; }
    ultima = { fuente, origen, credito };
    avisar({ paso: "render", msg: `Preparando el clip de la escena ${n}…` });
    if (VIDEO.test(fuente)) {
      const dv = await duracion(fuente).catch(() => D);
      const usa = Math.min(dv, D), pingpong = usa < D ? `,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0` : "";
      await ffmpeg(["-t", usa.toFixed(2), "-i", fuente, "-an", "-filter_complex", `[0:v]fps=${FPS},${filtro},eq=saturation=1.05${pingpong}[o]`, "-map", "[o]", "-q:v", "3", path.join(sal, "%05d.jpg")]);
      info.push({ n, tipo: "video", fps: FPS, frames: fs.readdirSync(sal).length, credito, origen, archivo: path.relative(dirProyecto(id), fuente).startsWith("..") ? fuente : path.relative(dirProyecto(id), fuente) });
    } else {
      await ffmpeg(["-i", fuente, "-vf", filtro, "-frames:v", "1", "-q:v", "2", path.join(sal, "00001.jpg")]);
      info.push({ n, tipo: "imagen", frames: 1, credito, origen, archivo: path.relative(dirProyecto(id), fuente).startsWith("..") ? fuente : path.relative(dirProyecto(id), fuente) });
    }
  }
  guardar(id, path.join("clips", "historia.json"), info);
  return info;
}
