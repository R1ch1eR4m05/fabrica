// Voz con ElevenLabs (con marcas de tiempo por letra → sabemos en qué segundo se dice cada palabra).
// Sin llave de ElevenLabs genera una "voz de prueba" muda con tiempos estimados, para ensayar el video.
import fs from "node:fs";
import { leerAjustes } from "./ajustes.js";
import path from "node:path";
import { CFG, vozDeEstilo } from "./config.js";
import { dirProyecto, leer, guardar, textoEscena } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import { ffmpeg, duracion } from "./ff.js";

const SR = 44100;

function palabrasCon(texto) {
  const out = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(texto))) out.push({ w: m[0], i: m.index, f: m.index + m[0].length - 1 });
  return out;
}

// Modelo de voz: el del estilo (panel) → el general (panel) → ELEVENLABS_MODEL del .env.
// "google_chirp3" usa Google Cloud TTS (Chirp 3 HD): mucho más barato, pero no da tiempos por letra
// y los estimamos repartiendo la duración real de cada escena entre sus letras.
let modeloBueno = null; // si el modelo pedido no existe, se usa el estable y se avisa una vez
const normaliza = (m) => String(m || "").replace(/^eleven_multilingual_v(3|4)$/, "eleven_v$1");
export function modeloDe(estiloId) {
  const a = leerAjustes();
  return normaliza(a.modeloPorEstilo?.[estiloId] || a.modeloVoz || CFG.elevenModelo);
}
export const esGoogle = (m) => /^google_/.test(m);
// v3/v4 no aceptan previous_text/next_text (solo v2 y flash): sin ellos cada escena va sola
const esNuevo = (m) => /^eleven_v[3-9]/.test(m);
export const hayVozReal = (modelo, vozId) => esGoogle(modelo) ? !!CFG.googleTtsKey : !!(CFG.elevenKey && vozId);

export async function sintetizar(modelo, voz, texto, anterior, siguiente, salida) {
  if (esGoogle(modelo)) return ttsGoogle(texto, salida);
  const m = modeloBueno || modelo;
  let r = await pedirTTS(voz, texto, esNuevo(m) ? null : anterior, esNuevo(m) ? null : siguiente, m);
  if (r.status === 400 && !esNuevo(m) && /previous_text|next_text/i.test(await r.clone().text())) r = await pedirTTS(voz, texto, null, null, m);
  if (r.status === 400 && !modeloBueno) {
    const t = await r.clone().text();
    if (/model_not_found|model with model id/i.test(t) && m !== "eleven_multilingual_v2") {
      console.warn(`ElevenLabs: el modelo "${m}" no existe o tu cuenta no lo tiene; uso eleven_multilingual_v2.`);
      modeloBueno = "eleven_multilingual_v2";
      r = await pedirTTS(voz, texto, anterior, siguiente, modeloBueno);
    }
  }
  return terminarTTS(r, salida);
}
async function pedirTTS(voz, texto, anterior, siguiente, modelo) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": CFG.elevenKey, "content-type": "application/json" },
    body: JSON.stringify({
      text: texto, model_id: modelo,
      previous_text: anterior || undefined, next_text: siguiente || undefined,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, speed: 1.0 },
    }),
  });
}
async function terminarTTS(r, salida) {
  if (!r.ok) throw new Error(`ElevenLabs respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  fs.writeFileSync(salida, Buffer.from(j.audio_base64, "base64"));
  return j.alignment; // { characters, character_start_times_seconds, character_end_times_seconds }
}

// Google Cloud Text-to-Speech (Chirp 3 HD). Llave: GOOGLE_TTS_KEY; voz: GOOGLE_TTS_VOZ (p. ej. es-US-Chirp3-HD-Charon)
async function ttsGoogle(texto, salida) {
  const voz = CFG.googleTtsVoz;
  const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(CFG.googleTtsKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text: texto },
      voice: { languageCode: voz.split("-").slice(0, 2).join("-"), name: voz },
      audioConfig: { audioEncoding: "MP3", sampleRateHertz: SR, speakingRate: CFG.googleTtsVelocidad },
    }),
  });
  if (!r.ok) throw new Error(`Google TTS respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  fs.writeFileSync(salida, Buffer.from(j.audioContent, "base64"));
  // tiempos estimados: reparte la duración entre las letras (los espacios y signos pesan menos)
  const dur = await duracion(salida);
  const peso = [...texto].map((c) => (/\s/.test(c) ? 0.4 : /[.,;:!?¿¡…]/.test(c) ? 1.5 : 1));
  const total = peso.reduce((a, b) => a + b, 0) || 1;
  const util = Math.max(0.1, dur - 0.15), ini = [], fin = [];
  let t = 0.05;
  for (const w of peso) { ini.push(t); t += (w / total) * util; fin.push(t); }
  return { characters: [...texto], character_start_times_seconds: ini, character_end_times_seconds: fin, estimado: true };
}

export async function hacerVoz(id, avisar = () => {}) {
  const proyecto = leer(id, "proyecto.json");
  const guion = leer(id, "guion.json");
  if (!guion) throw new Error("Primero hace falta el guion.");
  const estilo = leerEstilo(proyecto.estilo);
  const pausaBase = (estilo.pausaEntreEscenas ?? 0.5) / ({ rapido: 1.35, pausado: 0.78 }[(proyecto.opciones || {}).ritmo] || 1);
  const dir = dirProyecto(id);
  const tmp = path.join(dir, "_voz"); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  const vozId = proyecto.vozId || leerAjustes().vozPorEstilo?.[estilo.id] || vozDeEstilo(estilo.id);
  const sinVoz = proyecto.conVoz === false;          // el usuario eligió video sin voz (solo música)
  const modelo = modeloDe(estilo.id);
  const prueba = sinVoz || !hayVozReal(modelo, vozId);
  // ritmo del texto cuando va sin voz: Normal / Rápido / Pausado (opción del proyecto)
  const vel = { rapido: 1.35, pausado: 0.78 }[(proyecto.opciones || {}).ritmo] || 1;
  const base = estilo.lectura || { porSegundo: 2.2, extra: 1.4 };
  const lect = sinVoz ? { porSegundo: base.porSegundo * vel, extra: base.extra / vel } : { porSegundo: 2.6, extra: 0.3 };
  // versión TikTok/YouTube: las escenas con vozTT usan ese texto (el cierre cambia según la red)
  const tt = (proyecto.opciones || {}).cierre === "tt";
  const escenas = guion.escenas.map((e) => (tt && e.vozTT ? { ...e, voz: e.vozTT } : e));

  const piezas = [];   // wavs en orden
  const tiempos = [];  // por escena
  let t = estilo.inicioVoz ?? 0.4; // un respiro al principio (Levania: 0, la voz entra en el primer cuadro)
  if (t > 0) piezas.push(await silencio(tmp, "ini", t));

  for (let k = 0; k < escenas.length; k++) {
    const e = escenas[k];
    const texto = textoEscena(e);
    const pal = palabrasCon(texto);
    avisar({ paso: "voz", progreso: k / escenas.length, msg: `Voz: escena ${k + 1} de ${escenas.length}` });
    let dur, palabras;
    if (!texto) {
      dur = e.duracion ?? 2.5;
      piezas.push(await silencio(tmp, `e${k}`, dur));
      palabras = [];
    } else if (prueba) {
      dur = Math.max(1.2, pal.length / lect.porSegundo + lect.extra);
      piezas.push(await silencio(tmp, `e${k}`, dur));
      const paso = (dur - lect.extra) / pal.length;
      palabras = pal.map((p, j) => ({ w: p.w, t0: t + j * paso, t1: t + (j + 1) * paso }));
    } else {
      const mp3 = path.join(tmp, `e${k}.mp3`);
      const al = await sintetizar(modelo, vozId, texto, textoEscena(escenas[k - 1] || {}), textoEscena(escenas[k + 1] || {}), mp3);
      const wav = path.join(tmp, `e${k}.wav`);
      await ffmpeg(["-i", mp3, "-ar", String(SR), "-ac", "1", wav]);
      dur = await duracion(wav);
      piezas.push(wav);
      const ini = al.character_start_times_seconds, fin = al.character_end_times_seconds;
      palabras = pal.map((p) => ({ w: p.w, t0: t + (ini[p.i] ?? 0), t1: t + (fin[Math.min(p.f, fin.length - 1)] ?? dur) }));
    }
    const pausa = e.pausa ?? pausaBase;
    tiempos.push({ ini: t, finVoz: t + dur, fin: t + dur + pausa, palabras });
    t += dur;
    if (pausa > 0) { piezas.push(await silencio(tmp, `p${k}`, pausa)); t += pausa; }
  }
  const cola = estilo.colaFinal ?? 2;
  piezas.push(await silencio(tmp, "fin", cola)); t += cola;

  // unir todo y nivelar volumen
  const lista = path.join(tmp, "lista.txt");
  fs.writeFileSync(lista, piezas.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const unida = path.join(tmp, "unida.wav");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", unida]);
  await ffmpeg(["-i", unida, ...(prueba ? [] : ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]), "-ar", String(SR), "-b:a", "192k", path.join(dir, "voz.mp3")]);
  fs.rmSync(tmp, { recursive: true, force: true });

  guardar(id, "tiempos.json", { duracion: t, prueba, sinVoz, modelo: prueba ? null : (modeloBueno || modelo), escenas: tiempos });
  if (estilo.fondo) {
    const { prepararFondo } = await import("./fondos.js");
    await prepararFondo(id, avisar);
  }
  return { duracion: t, prueba, sinVoz };
}

async function silencio(dir, nombre, seg) {
  const f = path.join(dir, `${nombre}.wav`);
  await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=${SR}:cl=mono`, "-t", seg.toFixed(3), f]);
  return f;
}

// Comparar modelos: el mismo texto con cada modelo disponible → listos/comparar-voces/<modelo>.mp3
export const TEXTO_COMPARAR = "Hay un tipo de silencio que no es vacío. Es el silencio del que camina solo y, por primera vez, escucha sus propios pasos. Nadie lo aplaude. Nadie lo espera. Y justo ahí, sin testigos, empieza a saber quién es.";
const COSTO = { eleven_v4: 1, eleven_v3: 1, eleven_multilingual_v2: 1, eleven_v4_turbo: 0.5, eleven_flash_v2_5: 0.5 };
export async function compararVoces({ texto, vozId, estiloId } = {}, avisar = () => {}) {
  const { MODELOS_VOZ } = await import("./ajustes.js");
  const { DIR_LISTOS } = await import("./config.js");
  texto = String(texto || TEXTO_COMPARAR).trim().slice(0, 1200);
  const voz = vozId || (estiloId && leerAjustes().vozPorEstilo?.[estiloId]) || (estiloId ? vozDeEstilo(estiloId) : CFG.elevenVoz);
  const dir = path.join(DIR_LISTOS, "comparar-voces");
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const modelos = Object.keys(MODELOS_VOZ);
  for (let k = 0; k < modelos.length; k++) {
    const m = modelos[k];
    const r = { modelo: m, nombre: MODELOS_VOZ[m], letras: texto.length };
    if (!hayVozReal(m, voz)) { out.push({ ...r, error: esGoogle(m) ? "Falta GOOGLE_TTS_KEY en el .env" : "Falta la llave o la voz de ElevenLabs" }); continue; }
    avisar({ paso: "voz", progreso: k / modelos.length, msg: `Comparando voces: ${MODELOS_VOZ[m]}` });
    const f = path.join(dir, `${m}.mp3`);
    try {
      modeloBueno = esGoogle(m) ? null : m; // fija el modelo: si no existe, que falle en vez de gastar en otro
      let al;
      try { al = await sintetizar(m, voz, texto, null, null, f); } finally { modeloBueno = null; }
      const seg = await duracion(f);
      out.push({ ...r, archivo: `/listos/comparar-voces/${m}.mp3`, segundos: Math.round(seg * 10) / 10,
        costo: esGoogle(m) ? `~$${(texto.length * 30 / 1e6).toFixed(4)} USD (gratis el primer millón de letras al mes)` : `${Math.round(texto.length * (COSTO[m] ?? 1))} créditos`,
        tiempos: al?.estimado ? "estimados" : "exactos",
        // un video de 30 min ≈ 30 mil letras
        video30: esGoogle(m) ? "~$0.90 USD" : `~${Math.round(30000 * (COSTO[m] ?? 1) / 1000)} mil créditos` });
    } catch (e) { out.push({ ...r, error: /model_not_found|model with model id/i.test(e.message) ? "Tu cuenta no tiene este modelo" : e.message.slice(0, 200) }); }
  }
  fs.writeFileSync(path.join(dir, "comparacion.json"), JSON.stringify({ texto, voz, fecha: new Date().toISOString(), modelos: out }, null, 2));
  return { texto, modelos: out };
}
