// Estilo "Historia con Flow": cada escena tiene su propio clip.
// Orden por escena: tu clip (clips/escena-N.*) → clip de Google Flow (si lo generaste) → búsqueda en Pexels/Pixabay → dibujo animado.
// Los clips se convierten una vez a fotogramas (clips/N/00001.jpg…) del largo exacto de la escena, para que el render sea exacto.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { hayIA, pedir } from "./llm.js";
import path from "node:path";
import { CFG, FORMATOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { ffmpeg, duracion } from "./ff.js";
import { pexels, pixabay } from "./fondos.js";
import { llamar, flowDisponible } from "./flow.js";
import { flowSkillListo, lote } from "./flowskill.js";
import { leerEstilo } from "./estilos.js";
import { repartoDe, usaReparto, conMenciones, sinMenciones } from "./reparto.js";

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
  return g.escenas.map((e, k) => { const f = clipDeEscena(id, k + 1); return { n: k + 1, tipo: e.tipo, cuadro: fs.existsSync(path.join(dirClips(id), `cuadro-${k + 1}.png`)), archivo: f ? path.basename(f) : null, origen: f ? org[k + 1] || "" : "", flowPrompt: e.flowPrompt || "", buscar: e.buscar || "", misma: !!e.misma && !f }; });
}

// prompt de Flow de una escena: estilo visual y personajes del guion + la acción de la escena (así los personajes salen iguales)
export function promptFlow(guion, e) {
  return [guion.estiloVisual, guion.personajes && `Characters (keep them identical in every shot): ${guion.personajes}`, e.flowPrompt,
    "Vertical 9:16, cinematic, smooth camera, no text, no subtitles, no logos."].filter(Boolean).join(" ");
}

// con Google Flow Skill: 1) una imagen de los personajes, 2) el primer cuadro de cada escena usando esa imagen de
// referencia, 3) cada escena animada desde su cuadro. Así la familia se ve igual en todas las tomas.
// ¿el video arranca de verdad en su cuadro? (Flow a veces animaba la imagen o el video de otra escena). Diferencia media 0-255
// entre el cuadro y el primer fotograma, en miniatura y gris: la misma imagen da 2-16 (Veo a veces reencuadra un poco); otra escena, 60 o más.
function difCuadro(img, vid) {
  const px = (args) => spawnSync(CFG.ffmpeg, ["-v", "error", ...args, "-vf", "scale=36:64,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 }).stdout || Buffer.alloc(0);
  const a = px(["-i", img]), b = px(["-ss", "0.05", "-i", vid, "-frames:v", "1"]);
  if (!a.length || a.length !== b.length) return 0; // si no se pudo medir, no se bloquea
  let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

async function clipsConSkill(id, avisar, { soloFaltantes = true, conCuadros = true, escenas = null, notas = {}, reanimar = false } = {}) {
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
      const jobs = faltan.map(({ e, n }) => ({ type: "image", name: `escena-${n}`, prompt: `${estilo}. ${sinMenciones(String(e.flowPrompt).trim())} One single continuous image, no collage, no split panels, no inset frames, no text, no letters, no logos, no watermark.` }));
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
  // reparto fijo de la marca (reparto/<marca>.json): se trabaja en su proyecto de Flow y cada personaje se llama con @
  const rep = usaReparto(g, repartoDe(pr)) ? repartoDe(pr) : null;
  const conRef = conCuadros && g.personajes && !rep;
  // la imagen de personajes se guarda la primera vez y se reutiliza al rehacer escenas (así salen iguales que las demás)
  const refGuardada = conRef && fs.existsSync(dirClips(id)) && fs.readdirSync(dirClips(id)).find((x) => /^personajes\.(png|jpe?g|webp)$/i.test(x));
  let ref = refGuardada ? path.join(dirClips(id), refGuardada) : "personajes";
  const fin = (x) => String(x || "").trim().replace(/([^.!?])$/, "$1.");
  const dialogos = pr.opciones?.modo === "dialogos";
  // modo diálogos: los personajes hablan en el clip (Veo genera la voz); se piden las líneas tal cual y se describe cada voz
  const hablan = (e) => {
    if (!dialogos) return "";
    const ls = (e.dialogo || []).filter((l) => l?.texto).map((l) => `${l.quien || "Character"} says in Mexican Spanish${l.tono ? ` (${l.tono})` : ""}: "${String(l.texto).trim()}"`);
    // la voz de cada quien, siempre la misma descripción (con reparto, la del archivo de la marca)
    const vs = rep ? rep.personajes.filter((p) => p.vozVideo).map((p) => `${p.nombre}: ${p.vozVideo}`).join("; ") : Object.entries(g.voces || {}).map(([q, d]) => `${q}: ${d}`).join("; ");
    return ls.length ? ` Spoken dialogue, lip-synced to the mouths, one line after another: ${ls.join(" ")}${vs ? ` Voices (keep them identical in every clip): ${vs}.` : ""} No background music, no subtitles.` : "";
  };
  const trabajos = ({ e, n }, cuadro) => {
    if (!conCuadros) return [{ type: "video", name: `escena-${n}`, prompt: sinMenciones(promptFlow(g, e)) + hablan(e) }];
    const out = [];
    if (!cuadro) out.push({ type: "image", name: `cuadro-${n}`, ...(conRef ? { image: ref } : {}), prompt: rep
      ? `${estilo}. First frame of the shot, keep every mentioned character exactly as saved (same face, hair and clothes): ${fin(conMenciones(e.flowPrompt, rep))} One single continuous image, no collage, no split panels, no inset frames, no text, no letters, no logos, no watermark.`
      : `${estilo}. ${g.personajes ? "Same characters as the reference, identical faces, hair and clothes. " : ""}First frame of the shot: ${fin(e.flowPrompt)} One single continuous image, no collage, no split panels, no inset frames, no text, no letters, no logos, no watermark.` });
    out.push({ type: "video", name: `escena-${n}`, start: cuadro || `cuadro-${n}`, prompt: `${fin(sinMenciones(e.flowPrompt))} Keep the characters exactly as in the first frame. Smooth cinematic camera, no text.${hablan(e)}` });
    return out;
  };
  // Flow a veces bloquea una toma por sus políticas de contenido ("No se pudo completar la acción"; no cobra) o se satura.
  // Hasta 3 vueltas, solo con lo que falta: si fue política, el prompt de esa escena se reescribe más suave (misma escena,
  // palabras neutras); si fue saturación o tiempo, se repite igual tras una pausa. Lo que siga sin salir se avisa con su motivo.
  fs.mkdirSync(dirClips(id), { recursive: true });
  const todos = {}, errores = {};
  // el primer cuadro de cada escena se guarda en clips/cuadro-N.png en cuanto sale: si el video falla, la próxima vez
  // se anima ese mismo cuadro en lugar de pedir otra imagen igual (al rehacer una escena a propósito sí se pide uno nuevo)
  const CUADRO = (n) => path.join(dirClips(id), `cuadro-${n}.png`);
  for (const { n } of pend) {
    if (escenas && !reanimar) { try { fs.rmSync(CUADRO(n)); } catch {} }
    else if (escenas && reanimar && fs.existsSync(CUADRO(n))) todos[`cuadro-${n}`] = CUADRO(n); // misma imagen, solo otra animación
    else if (conCuadros && fs.existsSync(CUADRO(n))) todos[`cuadro-${n}`] = CUADRO(n);
  }
  let porHacer = pend.map((x) => ({ ...x, suaves: 0 }));
  for (let ronda = 1; ronda <= 3 && porHacer.length; ronda++) {
    if (ronda > 1) {
      avisar({ paso: "fondo", progreso: 0.9, msg: `Flow dejó ${porHacer.length} escena(s) sin salir; espero 45 s y reintento (vuelta ${ronda} de 3)…` });
      await new Promise((r) => setTimeout(r, 45000));
    }
    const jobs = [];
    if (conRef && !refGuardada && !todos.personajes) jobs.push({ type: "image", name: "personajes", prompt: `${estilo}. Character reference, full body, front view, neutral pose, plain soft background, no text: ${g.personajes}` });
    for (const x of porHacer) jobs.push(...trabajos(x, todos[`cuadro-${x.n}`]));
    avisar({ paso: "fondo", progreso: 0.02, msg: `Flow: ${jobs.length} trabajos (${porHacer.length} escenas${ronda > 1 ? `, vuelta ${ronda}` : ""})…` });
    let r;
    try { r = await lote(id, `historia-${Date.now()}`, jobs, (a) => avisar({ ...a, paso: "fondo" }), { ratio, minutos: Math.max(60, jobs.length * 4), proyecto: rep?.flowProyecto }); }
    catch (err) { if (/actividad inusual/.test(err.message) || !Object.keys(todos).some((k) => k.startsWith("escena-"))) throw err; break; }
    Object.assign(todos, r.archivos);
    for (const { n } of porHacer) { const c = r.archivos[`cuadro-${n}`]; if (c && fs.existsSync(c)) { fs.copyFileSync(c, CUADRO(n)); todos[`cuadro-${n}`] = CUADRO(n); } }
    for (const { n } of porHacer) { // un video que no arranca en su cuadro no sirve: se descarta y se reintenta
      const v = r.archivos[`escena-${n}`], c = todos[`cuadro-${n}`];
      if (v && c && fs.existsSync(c) && difCuadro(c, v) > 35) { delete r.archivos[`escena-${n}`]; delete todos[`escena-${n}`]; errores[`escena-${n}`] = "Flow animó otra imagen (no la de esta escena); se descartó"; }
    }
    // si en toda la vuelta no salió ningún video y no fue por políticas, repetir igual solo gasta créditos: se para y se avisa
    const salieron = porHacer.filter((x) => r.archivos[`escena-${x.n}`]).length;
    const hayPolitica = r.fallos.some((f) => esPolitica(f));
    for (const f of r.fallos) { const m = f.match(/^([\w-]+): ([\s\S]*)/); if (m) errores[m[1]] = m[2]; }
    if (todos.personajes && !refGuardada) ref = todos.personajes;
    porHacer = porHacer.filter((x) => !todos[`escena-${x.n}`]);
    if (!salieron && !hayPolitica) break;
    for (const x of porHacer) {
      if (esPolitica(errores[`cuadro-${x.n}`]) || esPolitica(errores[`escena-${x.n}`])) {
        avisar({ paso: "fondo", progreso: 0.9, msg: `Escena ${x.n}: Flow la bloqueó por políticas; la reescribo más suave y reintento…` });
        x.suaves++; x.e = { ...x.e, flowPrompt: await suavizarPrompt(x.e.flowPrompt, x.suaves) };
        delete todos[`cuadro-${x.n}`]; try { fs.rmSync(CUADRO(x.n)); } catch {} // el cuadro nuevo sale del prompt suave
      }
    }
  }
  if (todos.personajes && fs.existsSync(todos.personajes)) fs.copyFileSync(todos.personajes, path.join(dirClips(id), `personajes${path.extname(todos.personajes).toLowerCase()}`));
  let generados = 0;
  for (const { n } of pend) {
    const f = todos[`escena-${n}`]; if (!f) continue;
    for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x));
    fs.copyFileSync(f, path.join(dirClips(id), `escena-${n}${path.extname(f).toLowerCase()}`)); generados++;
  }
  // con diálogos la voz sale de los clips: la que había ya no corresponde
  if (generados && pr.opciones?.modo === "dialogos") { const q = leer(id, "proyecto.json"); if (q?.estado?.voz === "listo") { q.estado.voz = "desactualizado"; guardar(id, "proyecto.json", q); } }
  const fallos = porHacer.map((x) => `escena-${x.n}: ${esPolitica(errores[`cuadro-${x.n}`]) || esPolitica(errores[`escena-${x.n}`]) ? "Flow la bloqueó por políticas de contenido (aun suavizada)" : String(errores[`escena-${x.n}`] || errores[`cuadro-${x.n}`] || "no salió").split("\n")[0].slice(0, 140)}`);
  if (!generados) throw new Error("Flow no entregó clips: " + fallos.join(" | "));
  return { generados, fallos };
}

const esPolitica = (m) => /POLITICA/.test(m || "");
// reescribe una toma bloqueada por políticas: misma escena y emoción, en palabras neutras. Sin IA, limpia las palabras que más disparan el filtro.
async function suavizarPrompt(prompt, intento) {
  const SIS = "You rewrite one shot description for an AI image/video generator so it passes a strict content-safety filter. Keep the same story beat, characters, setting and camera move, but describe it in gentle, wholesome, neutral terms. Remove or replace anything about danger, injury, crying, screaming, panic, fear, blood, fighting, a child alone or in distress, bathing, nightwear or beds in close-up, real names and brands. Show emotion through calm facial expressions and body language. Max 60 words. Keep every @Name or @{Name} token exactly as written (they are saved characters). Return ONLY the rewritten prompt, in English.";
  if (hayIA()) {
    try { const r = await pedir(SIS, `Attempt ${intento}${intento > 1 ? " (be even more neutral)" : ""}. Shot: ${prompt}`); const t = String(r.texto || "").trim().replace(/^["']|["']$/g, ""); if (t.length > 20) return t; } catch {}
  }
  return String(prompt).replace(/\b(crying|cries|tears?|screaming|screams?|panic(ked)?|terrified|scared|afraid|danger(ous)?|injur\w*|blood\w*|fight\w*|alone|lost|trapped|pajamas|sleepwear)\b/gi, (w) => ({ crying: "looking sad", cries: "looks sad", scared: "uneasy", afraid: "uneasy", alone: "quiet", lost: "thoughtful", pajamas: "cozy clothes", sleepwear: "cozy clothes" }[w.toLowerCase()] || "calm"));
}

// lo que sale de Flow entra al banco de imágenes en ese momento (y, con espejo, se manda solo al VPS)
async function alBanco(id, r) { try { const B = await import("./banco.js"); await B.guardarDeProyecto(id); } catch (e) { console.warn("Banco:", e.message); } return r; }

// genera en Flow los clips que faltan (todas las escenas de una vez); cada uno queda como clips/escena-N.mp4
export async function clipsDeFlow(id, avisar = () => {}, { maxCreditos = 25, soloFaltantes = true, conCuadros = true, escenas = null, notas = {}, reanimar = false } = {}) {
  if (flowSkillListo()) { const r = await alBanco(id, await clipsConSkill(id, avisar, { soloFaltantes, conCuadros, escenas, notas, reanimar })); if (escenas) quitarDeAuditoria(id, escenas); return r; }
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
