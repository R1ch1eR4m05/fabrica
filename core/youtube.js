// Portada propia en YouTube (24 nov 2026): YouTube elegía un cuadro de en medio de los Shorts (sin el gancho) y GHL no la pone.
// Con la API de YouTube (thumbnails.set acepta Shorts una vez que el video terminó de procesarse) la fábrica busca cada video
// publicado por título en el canal y le sube su portada: listos/<id>-portada.jpg (Short 9:16) o listos/<id>-miniatura.jpg (largo).
// Una sola vez: YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET en el .env (cliente OAuth «App de escritorio» con YouTube Data API v3)
// y `node fabrica.js youtube-login`. El permiso queda en cache/youtube-token.json (fuera de git). Cada llamada gasta ~50 de cuota (de 10,000 al día).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { CFG, RAIZ, DIR_LISTOS, DIR_PROYECTOS, recargarLlaves } from "./config.js";
import { leer, guardar } from "./proyectos.js";

const FTOKEN = path.join(RAIZ, "cache", "youtube-token.json");
const ALCANCE = "https://www.googleapis.com/auth/youtube.force-ssl";
export const hayYoutube = () => { recargarLlaves(); return !!(CFG.ytClientId && CFG.ytClientSecret && fs.existsSync(FTOKEN)); };

export async function login(avisar = console.log) {
  recargarLlaves({ forzar: true });
  if (!CFG.ytClientId || !CFG.ytClientSecret) throw new Error("Falta YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET en el .env");
  const codigo = await new Promise((ok, mal) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (!u.searchParams.get("code") && !u.searchParams.get("error")) { res.end(); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(u.searchParams.get("code") ? "<h2>Listo: la fábrica ya puede poner las portadas en YouTube. Cierra esta pestaña.</h2>" : "<h2>No se dio el permiso.</h2>");
      s.close(); u.searchParams.get("code") ? ok({ code: u.searchParams.get("code"), redirect: `http://127.0.0.1:${puerto}` }) : mal(new Error(u.searchParams.get("error")));
    });
    let puerto;
    s.listen(0, "127.0.0.1", () => {
      puerto = s.address().port;
      const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: CFG.ytClientId, redirect_uri: `http://127.0.0.1:${puerto}`, response_type: "code", scope: ALCANCE, access_type: "offline", prompt: "consent" })}`;
      avisar(`Abre esta página, entra con la cuenta del canal y acepta:\n${url}\n`);
      try { (process.platform === "win32" ? spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], { detached: true }) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true })).unref(); } catch {}
    });
    setTimeout(() => { s.close(); mal(new Error("Se acabó el tiempo (5 min) para dar el permiso.")); }, 300000).unref();
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ code: codigo.code, client_id: CFG.ytClientId, client_secret: CFG.ytClientSecret, redirect_uri: codigo.redirect, grant_type: "authorization_code" }) });
  const j = await r.json(); if (!j.refresh_token) throw new Error(`Google no dio permiso: ${JSON.stringify(j).slice(0, 200)}`);
  fs.mkdirSync(path.dirname(FTOKEN), { recursive: true });
  fs.writeFileSync(FTOKEN, JSON.stringify({ refresh_token: j.refresh_token, fecha: new Date().toISOString() }));
  const canal = await api("GET", "channels?part=snippet&mine=true");
  return canal.items?.[0]?.snippet?.title || "(canal)";
}

let acceso = null;
async function token() {
  if (acceso && acceso.vence > Date.now() + 60000) return acceso.t;
  recargarLlaves();
  const { refresh_token } = JSON.parse(fs.readFileSync(FTOKEN, "utf8"));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ refresh_token, client_id: CFG.ytClientId, client_secret: CFG.ytClientSecret, grant_type: "refresh_token" }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`YouTube: el permiso venció, corre «node fabrica.js youtube-login» (${j.error || "?"})`);
  acceso = { t: j.access_token, vence: Date.now() + (j.expires_in || 3000) * 1000 }; return acceso.t;
}
async function api(metodo, ruta, cuerpo, tipo) {
  const base = ruta.startsWith("upload:") ? "https://www.googleapis.com/upload/youtube/v3/" + ruta.slice(7) : "https://www.googleapis.com/youtube/v3/" + ruta;
  const r = await fetch(base, { method: metodo, headers: { authorization: `Bearer ${await token()}`, ...(tipo ? { "content-type": tipo } : {}) }, body: cuerpo });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function subidosRecientes() {
  const c = await api("GET", "channels?part=contentDetails&mine=true");
  const lista = c.items?.[0]?.contentDetails?.relatedPlaylists?.uploads; if (!lista) return [];
  const j = await api("GET", `playlistItems?part=snippet&maxResults=50&playlistId=${lista}`);
  return (j.items || []).map((x) => ({ videoId: x.snippet.resourceId.videoId, titulo: x.snippet.title, fecha: x.snippet.publishedAt }));
}
function portadaDe(id) {
  return [`${id}-portada.jpg`, `${id}-miniatura.jpg`].map((x) => path.join(DIR_LISTOS, x)).find((f) => fs.existsSync(f)) || null;
}

// Revisa los proyectos programados a YouTube que aún no tienen su portada puesta. Se llama sola cada 30 min desde el panel.
export async function ponerPortadas({ soloId, todos = false, avisar = () => {} } = {}) {
  if (!hayYoutube()) return { hechos: [], pendientes: [], nota: "Sin permiso de YouTube (youtube-login)" };
  const ids = soloId ? [soloId] : fs.readdirSync(DIR_PROYECTOS).filter((d) => fs.existsSync(path.join(DIR_PROYECTOS, d, "proyecto.json")));
  const candidatos = ids.map((id) => ({ id, p: leer(id, "proyecto.json") || {}, c: leer(id, "copys.json") || {} }))
    .filter(({ id, p }) => (soloId || todos || (p.ghl?.programados || []).some((x) => /youtube/.test(x.plataforma))) && !p.youtube?.portada && portadaDe(id));
  if (!candidatos.length) return { hechos: [], pendientes: [] };
  const subidos = await subidosRecientes(), hechos = [], pendientes = [];
  for (const { id, p, c } of candidatos) {
    const titulo = c.youtube?.titulo || leer(id, "metadatos.json")?.titulo || p.titulo;
    const v = (p.youtube?.videoId && subidos.find((x) => x.videoId === p.youtube.videoId)) || subidos.find((x) => norm(x.titulo) === norm(titulo)) || subidos.find((x) => norm(titulo).length > 12 && norm(x.titulo).startsWith(norm(titulo).slice(0, 40)));
    if (!v) { if (!todos) pendientes.push({ id, motivo: "todavía no aparece en el canal" }); continue; }
    const d = await api("GET", `videos?part=processingDetails,status&id=${v.videoId}`);
    const estado = d.items?.[0]?.processingDetails?.processingStatus;
    if (estado && estado !== "succeeded") { pendientes.push({ id, videoId: v.videoId, motivo: `YouTube aún lo procesa (${estado})` }); continue; }
    const f = portadaDe(id);
    try {
      await api("POST", `upload:thumbnails/set?videoId=${v.videoId}&uploadType=media`, fs.readFileSync(f), "image/jpeg");
      const pp = leer(id, "proyecto.json"); pp.youtube = { ...(pp.youtube || {}), videoId: v.videoId, portada: { archivo: path.basename(f), fecha: new Date().toISOString() } }; guardar(id, "proyecto.json", pp);
      hechos.push({ id, videoId: v.videoId, archivo: path.basename(f) }); avisar({ msg: `Portada puesta en YouTube: ${titulo}` });
    } catch (e) { pendientes.push({ id, videoId: v.videoId, motivo: e.message.slice(0, 200) }); }
  }
  return { hechos, pendientes };
}
