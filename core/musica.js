// Música a la medida con ElevenLabs Music (solo planes de pago de ElevenLabs).
// Se genera del largo exacto del video. En los estilos que lo permiten (frases) se guarda en la biblioteca
// musica/<estilo>/ por tema y se reutiliza cuando vuelve a salir ese tema, así no se paga una nueva cada vez.
import fs from "node:fs";
import path from "node:path";
import { CFG, RAIZ } from "./config.js";
import { dirProyecto, leer, guardar, slug } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { duracion } from "./ff.js";

const DIR_MUSICA = path.join(RAIZ, "musica");

export function promptMusica(id) {
  const p = leer(id, "proyecto.json"), est = leerEstilo(p.estilo) || {};
  const base = est.musicaIA?.prompt || "Warm, gentle instrumental background music for a short social media video.";
  const tema = p.tema || p.titulo || "";
  return `${base}${tema ? ` Theme and mood of this video: ${tema}.` : ""} Instrumental only, no vocals, no lyrics. Clean ending.`;
}

export async function musicaIA(id, avisar = () => {}, { prompt, reusar, desdePanel = false } = {}) {
  const p = leer(id, "proyecto.json"), est = leerEstilo(p.estilo) || {};
  const t = leer(id, "tiempos.json");
  const finalMotion = path.join(dirProyecto(id), "final.mp4");
  const largo = t?.duracion || (est.tipo === "motion" && fs.existsSync(finalMotion) ? await duracion(finalMotion).catch(() => 0) : 0) || p.motion?.segundos || 30;
  const necesito = Math.ceil(largo + 0.5);
  reusar = reusar ?? !!est.musicaIA?.reusar;
  const dirLib = path.join(DIR_MUSICA, est.id || "general");
  const clave = `ia-${slug(p.tema || p.titulo || "general").slice(0, 40)}`;
  const enLib = path.join(dirLib, `${clave}.mp3`), meta = path.join(dirLib, `${clave}.json`);
  const destino = path.join(dirProyecto(id), "musica.mp3");
  for (const n of fs.readdirSync(dirProyecto(id))) if (n.startsWith("musica.")) fs.rmSync(path.join(dirProyecto(id), n));

  // desde el panel, "reusar" ya viene decidido (si editaste el texto, no se reutiliza); en automático, solo si el prompt es el sugerido
  const propio = !desdePanel && prompt && prompt.trim() !== promptMusica(id);
  if (reusar && !propio && fs.existsSync(enLib)) {
    const m = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, "utf8")) : {};
    if ((m.segundos || 0) >= necesito) {
      fs.copyFileSync(enLib, destino);
      p.musicaIA = { reusada: path.relative(RAIZ, enLib).replace(/\\/g, "/") }; guardar(id, "proyecto.json", p);
      avisar({ progreso: 1, msg: "Reutilicé una pista que ya tenías para este tema (sin gastar créditos)." });
      return { reusada: true };
    }
  }

  if (!CFG.elevenKey) throw new Error("Falta ELEVENLABS_API_KEY en el .env.");
  const segundos = reusar ? Math.max(necesito, 45) : necesito; // las reutilizables se hacen un poco más largas para que sirvan a otros videos
  const texto = (prompt || "").trim() || promptMusica(id);
  avisar({ progreso: 0.1, msg: `Componiendo ${segundos} s de música con ElevenLabs…` });
  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST", signal: AbortSignal.timeout(300000),
    headers: { "xi-api-key": CFG.elevenKey, "content-type": "application/json" },
    body: JSON.stringify({ prompt: texto, music_length_ms: segundos * 1000, force_instrumental: true }),
  });
  if (!r.ok) {
    const err = (await r.text()).slice(0, 300);
    if (/missing_permissions|music_generation/i.test(err)) throw new Error("Tu llave de ElevenLabs no tiene permiso de música. En elevenlabs.io → Developers → API Keys, edita la llave y activa \"Music Generation\" (no hace falta cambiar el .env). Si usas otra llave nueva, ponla en el .env y reinicia la fábrica. Llave usada: …" + CFG.elevenKey.slice(-4) + ". Detalle: " + err.slice(0, 160));
    if (r.status === 401 || r.status === 403 || /plan|subscription|paid/i.test(err)) throw new Error(`ElevenLabs no dejó generar música (la música solo está en planes de pago): ${err}`);
    throw new Error(`ElevenLabs Music respondió ${r.status}: ${err}`);
  }
  const audio = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(destino, audio);
  if (reusar) { fs.mkdirSync(dirLib, { recursive: true }); fs.writeFileSync(enLib, audio); fs.writeFileSync(meta, JSON.stringify({ segundos, prompt: texto, fecha: new Date().toISOString() }, null, 2)); }
  // toda pista generada queda en la biblioteca de su nicho para reutilizarla en otros videos
  let enNicho = null;
  try { const B = await import("./banco.js"); enNicho = B.guardarPista(await B.nichoDeProyecto(p), destino, { segundos, prompt: texto, estilo: est.id, tema: p.tema || p.titulo || "", de: id }); } catch (e) { console.warn("Biblioteca:", e.message); }
  p.musicaIA = { prompt: texto, segundos }; if (enNicho) p.musicaElegida = enNicho; guardar(id, "proyecto.json", p);
  avisar({ progreso: 1, msg: "Música lista." });
  return { reusada: false, segundos };
}
