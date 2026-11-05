// Genera la voz con ElevenLabs y los tiempos de cada palabra.
// Uso: node tools/voz.js guion.txt salida
//   -> salida.mp3 y salida.words.json  [{ "w": "palabra", "start": 0.12, "end": 0.48 }, ...]
// Requiere Node 18+ y un archivo .env en la raíz con ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID.
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const f = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const [guion, salida] = process.argv.slice(2);
  if (!guion || !salida) { console.error("Uso: node tools/voz.js guion.txt salida"); process.exit(1); }
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID || "1VQaMRazTeAqnqdb5C33";
  if (!key) { console.error("Falta ELEVENLABS_API_KEY en .env"); process.exit(1); }
  const text = fs.readFileSync(guion, "utf8").trim();
  console.log(`Guion: ${text.length} caracteres (aprox. ${text.length} créditos de ElevenLabs)`);
  if (process.argv.includes("--solo-contar")) return;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_v4",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!res.ok) { console.error("ElevenLabs respondió", res.status, await res.text()); process.exit(1); }
  const data = await res.json();

  fs.writeFileSync(`${salida}.mp3`, Buffer.from(data.audio_base64, "base64"));

  // De tiempos por carácter a tiempos por palabra
  const a = data.normalized_alignment || data.alignment;
  const words = [];
  let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { w: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  fs.writeFileSync(`${salida}.words.json`, JSON.stringify(words, null, 1));
  const dur = words.length ? words[words.length - 1].end : 0;
  console.log(`Listo: ${salida}.mp3 (${dur.toFixed(1)} s, ${words.length} palabras)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
