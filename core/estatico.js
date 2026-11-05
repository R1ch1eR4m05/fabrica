// Sirve archivos de estilos/ y proyectos/ (lo usan el panel y el render)
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.js";

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".wav": "audio/wav", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};

const PERMITIDAS = ["estilos", "proyectos", "panel", "listos", "cache", "motion"];

export function servirArchivo(req, res, rutaUrl) {
  const limpia = decodeURIComponent(rutaUrl.split("?")[0]).replace(/^\/+/, "");
  const raiz = limpia.split("/")[0];
  if (!PERMITIDAS.includes(raiz)) return false;
  const f = path.resolve(RAIZ, limpia);
  if (!f.startsWith(path.join(RAIZ, raiz) + path.sep) && f !== path.join(RAIZ, raiz)) return false;
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return false;
  const st = fs.statSync(f);
  const tipo = TIPOS[path.extname(f).toLowerCase()] || "application/octet-stream";
  const rango = req.headers.range;
  const base = { "content-type": tipo, "cache-control": "no-store", "accept-ranges": "bytes" };
  if (rango) {
    const [a, b] = rango.replace("bytes=", "").split("-");
    const ini = Number(a), fin = b ? Number(b) : st.size - 1;
    res.writeHead(206, { ...base, "content-range": `bytes ${ini}-${fin}/${st.size}`, "content-length": fin - ini + 1 });
    fs.createReadStream(f, { start: ini, end: fin }).pipe(res);
  } else {
    res.writeHead(200, { ...base, "content-length": st.size });
    fs.createReadStream(f).pipe(res);
  }
  return true;
}
