// GoHighLevel · Social Planner: sube el video a la biblioteca de medios de GHL y programa una publicación por red,
// cada una con su copy (copys.json). GHL guarda el video en su propio almacenamiento, así que no hace falta Drive.
import fs from "node:fs";
import path from "node:path";
import { CFG, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerCopys } from "./copy.js";
import { dirImagenes } from "./imagenes-post.js";

const API = "https://services.leadconnectorhq.com";
export const ghlListo = () => !!(CFG.ghlToken && CFG.ghlLocation);
const cab = (extra = {}) => ({ Authorization: `Bearer ${CFG.ghlToken}`, Version: "2021-07-28", Accept: "application/json", ...extra });

async function pedir(metodo, ruta, cuerpo, { form = false, ms = 60000 } = {}) {
  if (!ghlListo()) throw new Error("Faltan GHL_TOKEN y GHL_LOCATION_ID en el .env.");
  const r = await fetch(API + ruta, { method: metodo, headers: form ? cab() : cab({ "Content-Type": "application/json" }), body: form ? cuerpo : cuerpo && JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { texto: t }; }
  if (!r.ok) {
    const msg = j.message || j.error || j.texto || r.status;
    if (r.status === 401 || r.status === 403) throw new Error(`GHL no dejó (${r.status}): revisa que la integración privada tenga los permisos de medias y socialplanner. ${Array.isArray(msg) ? msg.join("; ") : msg}`);
    throw new Error(`GHL respondió ${r.status}: ${Array.isArray(msg) ? msg.join("; ") : String(msg).slice(0, 300)}`);
  }
  return j;
}

let cacheCuentas = { t: 0, l: null };
export async function cuentas({ forzar = false } = {}) {
  if (!forzar && cacheCuentas.l && Date.now() - cacheCuentas.t < 2 * 60000) return cacheCuentas.l;
  const j = await pedir("GET", `/social-media-posting/${CFG.ghlLocation}/accounts`);
  const lista = (j.results?.accounts || j.accounts || []).map((a) => ({ id: a.id || a._id, plataforma: String(a.platform || "").toLowerCase(), nombre: a.name || a.displayName || a.platform, tipo: a.type || "", caducada: !!a.isExpired }));
  cacheCuentas = { t: Date.now(), l: lista };
  return lista;
}

// sube el video (solo si cambió desde la última vez)
export async function subirVideo(id) {
  const p = leer(id, "proyecto.json"), f = path.join(dirProyecto(id), "final.mp4");
  if (!fs.existsSync(f)) throw new Error("Primero saca el video.");
  const mt = fs.statSync(f).mtimeMs;
  if (p.ghl?.media?.mtime === mt && p.ghl.media.url) return p.ghl.media.url;
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(f)], { type: "video/mp4" }), `${id}.mp4`);
  form.append("hosted", "false"); form.append("name", `${id}.mp4`);
  const j = await pedir("POST", "/medias/upload-file", form, { form: true, ms: 300000 });
  p.ghl = { ...(p.ghl || {}), media: { url: j.url, fileId: j.fileId, mtime: mt } }; guardar(id, "proyecto.json", p);
  return j.url;
}

// sube la miniatura a la biblioteca de medios de GHL (para poder pasarle su URL a YouTube). jpg, por si acaso.
async function subirMiniatura(id) {
  const p = leer(id, "proyecto.json"), f = path.join(DIR_LISTOS, `${id}-miniatura.jpg`);
  if (!fs.existsSync(f)) return null;
  const mt = fs.statSync(f).mtimeMs;
  if (p.ghl?.miniatura?.mtime === mt && p.ghl.miniatura.url) return p.ghl.miniatura.url;
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(f)], { type: "image/jpeg" }), `${id}-miniatura.jpg`);
  form.append("hosted", "false"); form.append("name", `${id}-miniatura.jpg`);
  const j = await pedir("POST", "/medias/upload-file", form, { form: true, ms: 120000 });
  p.ghl = { ...(p.ghl || {}), miniatura: { url: j.url, mtime: mt } }; guardar(id, "proyecto.json", p);
  return j.url;
}

const textoPara = (c, plataforma) => {
  if (/instagram/.test(plataforma)) return c.instagram;
  if (/facebook/.test(plataforma)) return c.facebook;
  if (/tiktok/.test(plataforma)) return c.tiktok;
  if (/youtube/.test(plataforma)) return [c.youtube?.titulo, c.youtube?.descripcion].filter(Boolean).join("\n\n");
  return c.instagram || c.facebook;
};

// GHL exige quién crea la publicación (userId). Si no está GHL_USER_ID en el .env, se busca solo: el dueño/admin de la subcuenta
let cacheUsuario = null;
async function usuarioGHL() {
  if (CFG.ghlUsuario) return CFG.ghlUsuario;
  if (cacheUsuario) return cacheUsuario;
  let us = [];
  try { const j = await pedir("GET", `/users/?locationId=${CFG.ghlLocation}`); us = j.users || []; }
  catch (e) { throw new Error(`GHL pide el usuario que publica y no pude buscarlo (${e.message.slice(0, 120)}). Pon GHL_USER_ID en el .env: en GHL ve a Settings → My Staff, edita tu usuario y copia el id que sale en la dirección. O dale a la integración privada el permiso users.readonly.`); }
  const ok = us.filter((u) => !u.deleted);
  const elegido = ok.find((u) => /admin/i.test(u.roles?.role || "") && /agency/i.test(u.roles?.type || "")) || ok.find((u) => /admin/i.test(u.roles?.role || "")) || ok[0];
  if (!elegido) throw new Error("GHL no regresó usuarios de esta subcuenta. Pon GHL_USER_ID en el .env (Settings → My Staff → tu usuario → id en la dirección).");
  cacheUsuario = elegido.id;
  return cacheUsuario;
}

// programa una publicación por red (mismo video, copy de esa red). fecha: ISO; si falta, en 10 minutos
export async function programar(id, { cuentasIds = [], fecha } = {}, avisar = () => {}) {
  if (!cuentasIds.length) throw new Error("Elige al menos una cuenta.");
  const todas = await cuentas(), elegidas = todas.filter((a) => cuentasIds.includes(a.id));
  if (!elegidas.length) throw new Error("Esas cuentas ya no están conectadas en GHL.");
  avisar({ progreso: 0.1, msg: "Subiendo el video a GoHighLevel…" });
  const url = await subirVideo(id);
  const usuario = await usuarioGHL();
  const miniatura = elegidas.some((a) => /youtube/.test(a.plataforma)) ? await subirMiniatura(id) : null;
  const c = leerCopys(id), cuando = fecha ? new Date(fecha) : new Date(Date.now() + 10 * 60000);
  if (isNaN(cuando) || cuando < Date.now() - 60000) throw new Error("La fecha ya pasó.");
  const porRed = {};
  for (const a of elegidas) (porRed[a.plataforma] ||= []).push(a.id);
  const hechos = [];
  for (const [plataforma, ids] of Object.entries(porRed)) {
    avisar({ progreso: 0.5, msg: `Programando en ${plataforma}…` });
    const esYoutube = /youtube/.test(plataforma);
    const cuerpo = { accountIds: ids, summary: textoPara(c, plataforma) || "", media: [{ url, type: "video/mp4", ...(esYoutube && miniatura ? { thumbnail: miniatura } : {}) }], status: "scheduled", scheduleDate: cuando.toISOString(),
      type: /instagram|facebook/.test(plataforma) ? "reel" : "post", userId: usuario,
      ...(esYoutube ? { youtubePostDetails: { title: (c.youtube?.titulo || leer(id, "guion.json")?.titulo || id).slice(0, 100), privacyLevel: "public", type: "video" } } : {}) };
    const j = await pedir("POST", `/social-media-posting/${CFG.ghlLocation}/posts`, cuerpo);
    hechos.push({ plataforma, cuentas: ids, fecha: cuando.toISOString(), postId: j.results?.post?._id || j.results?.post?.id || j.post?._id || j.id || null });
  }
  const p = leer(id, "proyecto.json");
  p.ghl = { ...(p.ghl || {}), programados: [...(p.ghl?.programados || []), ...hechos] }; guardar(id, "proyecto.json", p);
  avisar({ progreso: 1, msg: "Programado en GHL." });
  return hechos;
}

// sube una imagen del feed a la biblioteca de medios de GHL (solo si cambió desde la última vez)
async function subirImagen(id, archivo) {
  const p = leer(id, "proyecto.json"), f = path.join(dirImagenes(id), archivo);
  if (!fs.existsSync(f)) throw new Error(`No encuentro la imagen ${archivo}. Dale a «Rehacer imágenes».`);
  const mt = fs.statSync(f).mtimeMs;
  const c = p.ghl?.imagenes?.[archivo];
  if (c?.mtime === mt && c.url) return c.url;
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(f)], { type: "image/jpeg" }), `${id}-${archivo}`);
  form.append("hosted", "false"); form.append("name", `${id}-${archivo}`);
  const j = await pedir("POST", "/medias/upload-file", form, { form: true, ms: 120000 });
  const p2 = leer(id, "proyecto.json");
  p2.ghl = { ...(p2.ghl || {}), imagenes: { ...(p2.ghl?.imagenes || {}), [archivo]: { url: j.url, mtime: mt } } }; guardar(id, "proyecto.json", p2);
  return j.url;
}

// programa las imágenes del feed. posts: [{ archivos: ["carrusel-01.jpg", ...], texto }] — un post por elemento
// (varias imágenes = carrusel; una sola = imagen suelta). Cada post cae un día después del anterior.
export async function programarImagenes(id, { cuentasIds = [], fecha, posts = [] } = {}, avisar = () => {}) {
  if (!cuentasIds.length) throw new Error("Elige al menos una cuenta.");
  if (!posts.length) throw new Error("Elige al menos una imagen.");
  const todas = await cuentas(), elegidas = todas.filter((a) => cuentasIds.includes(a.id) && !/youtube/.test(a.plataforma));
  if (!elegidas.length) throw new Error("Elige una red que acepte imágenes (Instagram, Facebook…). YouTube no.");
  const base = fecha ? new Date(fecha) : new Date(Date.now() + 10 * 60000);
  if (isNaN(base) || base < Date.now() - 60000) throw new Error("La fecha ya pasó.");
  for (const x of posts) {
    if (!x.archivos?.length || x.archivos.some((a) => !/^(frase|carrusel-\d+)\.jpg$/.test(a))) throw new Error("Imagen no válida.");
    if (!String(x.texto || "").trim()) throw new Error("Cada publicación necesita su descripción.");
  }
  const usuario = await usuarioGHL();
  const porRed = {};
  for (const a of elegidas) (porRed[a.plataforma] ||= []).push(a.id);
  const hechos = [];
  for (const [i, x] of posts.entries()) {
    avisar({ progreso: (i + 0.2) / posts.length, msg: `Subiendo imágenes de la publicación ${i + 1} de ${posts.length}…` });
    const urls = []; for (const a of x.archivos) urls.push(await subirImagen(id, a));
    const cuando = new Date(base.getTime() + i * 864e5);
    for (const [plataforma, ids] of Object.entries(porRed)) {
      const cuerpo = { accountIds: ids, summary: String(x.texto), media: urls.map((u) => ({ url: u, type: "image/jpeg" })), status: "scheduled", scheduleDate: cuando.toISOString(), type: "post", userId: usuario };
      const j = await pedir("POST", `/social-media-posting/${CFG.ghlLocation}/posts`, cuerpo);
      hechos.push({ plataforma, tipo: x.archivos.length > 1 ? "carrusel" : "imagen", imagenes: x.archivos, cuentas: ids, fecha: cuando.toISOString(), postId: j.results?.post?._id || j.results?.post?.id || j.post?._id || j.id || null });
    }
  }
  const p = leer(id, "proyecto.json");
  p.ghl = { ...(p.ghl || {}), programados: [...(p.ghl?.programados || []), ...hechos] }; guardar(id, "proyecto.json", p);
  avisar({ progreso: 1, msg: "Imágenes programadas en GHL." });
  return hechos;
}
