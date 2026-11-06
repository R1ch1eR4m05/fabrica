// Configuración común: rutas y variables del archivo .env
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIR_ESTILOS = path.join(RAIZ, "estilos");
export const DIR_PROYECTOS = path.join(RAIZ, "proyectos");
export const DIR_LISTOS = path.join(RAIZ, "listos");

for (const d of [DIR_PROYECTOS, DIR_LISTOS]) fs.mkdirSync(d, { recursive: true });

// .env (Node 22 trae loadEnvFile; si no existe el archivo, seguimos con lo que haya)
try { process.loadEnvFile(path.join(RAIZ, ".env")); } catch {}

const e = process.env;
// ffmpeg: el del .env, si no el que se instala con npm (ffmpeg-static), si no el del sistema
const req = createRequire(import.meta.url);
const intenta = (fn) => { try { const r = fn(); return r && fs.existsSync(r) ? r : ""; } catch { return ""; } };
const ffmpegNpm = intenta(() => req("ffmpeg-static"));
const ffprobeNpm = intenta(() => req("ffprobe-static").path);
export const CFG = {
  host: e.HOST || "127.0.0.1",
  puerto: Number(e.PORT || 4870),
  clave: e.PANEL_CLAVE || "",
  anthropicKey: e.ANTHROPIC_API_KEY || "",
  anthropicModelo: e.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  elevenKey: e.ELEVENLABS_API_KEY || "",
  elevenVoz: e.ELEVENLABS_VOICE_ID || "",
  elevenModelo: e.ELEVENLABS_MODEL || "eleven_multilingual_v2",
  pexelsKey: e.PEXELS_API_KEY || "",
  pixabayKey: e.PIXABAY_API_KEY || "",
  geminiKey: e.GEMINI_API_KEY || "",
  // varios modelos separados por coma: si uno está saturado se prueba el siguiente
  geminiModelos: (e.GEMINI_MODEL || "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash").split(",").map((x) => x.trim()).filter(Boolean),
  apimartKey: e.APIMART_API_KEY || "",
  apifyToken: e.APIFY_TOKEN || "",
  ghlToken: e.GHL_TOKEN || "", ghlLocation: e.GHL_LOCATION_ID || "", ghlUsuario: e.GHL_USER_ID || "",
  flowUrl: (e.FLOW_MCP_URL || "http://127.0.0.1:8787").replace(/\/$/, ""),
  hilos: Math.max(1, Number(e.RENDER_HILOS || Math.min(4, os.cpus().length))),
  fps: Number(e.FPS || 30),
  chrome: e.CHROME_PATH || "",
  ffmpeg: e.FFMPEG_PATH || ffmpegNpm || "ffmpeg",
  ffprobe: e.FFPROBE_PATH || ffprobeNpm || "ffprobe",
};

// voz por estilo: VOZ_TERROR_LINTERNA=xxxx en el .env (si no, ELEVENLABS_VOICE_ID)
export const vozDeEstilo = (id) => process.env["VOZ_" + id.toUpperCase().replace(/[^A-Z0-9]/g, "_")] || CFG.elevenVoz;

export const FORMATOS = {
  "9:16": { w: 1080, h: 1920, nombre: "Vertical (TikTok, Reels, Shorts)" },
  "16:9": { w: 1920, h: 1080, nombre: "Horizontal (YouTube)" },
  "1:1": { w: 1080, h: 1080, nombre: "Cuadrado" },
};
