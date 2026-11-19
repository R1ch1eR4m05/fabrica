// GoHighLevel · Social Planner: sube el video a la biblioteca de medios de GHL y programa una publicación por red,
// cada una con su copy (copys.json). GHL guarda el video en su propio almacenamiento, así que no hace falta Drive.
import fs from "node:fs";
import path from "node:path";
import { CFG, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { leerCopys } from "./copy.js";
import { dirImagenes } from "./imagenes-post.js";
import crypto from "node:crypto";

// ---- registro de programación (idempotente) · listos/programacion.jsonl ----
// cada línea: { fecha (cuándo se pidió), publica (fecha/hora CDMX de publicación), plataforma, cuenta, titulo, id, archivoHash, guionHash, postId, estado }
// estado: simulado (dry-run, no publica) | programado | duplicado (se saltó) | error
const REGISTRO = path.join(DIR_LISTOS, "programacion.jsonl");
export function leerRegistro() { try { return fs.readFileSync(REGISTRO, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
const anotar = (x) => fs.appendFileSync(REGISTRO, JSON.stringify({ fecha: new Date().toISOString(), ...x }) + "\n");
const hashArchivo = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/#\w+/g, "").replace(/[^a-z0-9ñ ]/g, "").replace(/\s+/g, " ").trim();
export const enCDMX = (d) => new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function huellas(id) {
  const g = leer(id, "guion.json") || {}, c = leerCopys(id);
  return {
    archivoHash: hashArchivo(path.join(dirProyecto(id), "final.mp4")),
    guionHash: crypto.createHash("sha1").update(normal((g.escenas || []).map((e) => e.voz || e.texto || "").join(" "))).digest("hex").slice(0, 16),
    titulo: String(c.youtube?.titulo || g.titulo || id).replace(/#\w+/g, "").trim(),
    formato: leer(id, "proyecto.json")?.formato || "9:16",
  };
}
// ¿ya está programado esto (mismo archivo, mismo guion o mismo título) en esa red y cuenta?
// el mismo título en un Short (9:16) y en su video largo (16:9) es normal: son dos videos distintos
const mismoFormato = (r, h) => { const f = r.formato || leer(r.id, "proyecto.json")?.formato; return !f || !h.formato || f === h.formato; };
// estado "cancelado": Richie borró ese post en GHL y le pidió a la fábrica olvidarlo (ya no bloquea volver a programar)
const cancelados = (reg) => new Set(reg.filter((r) => r.estado === "cancelado").map((r) => `${r.postId}|${r.cuenta}`));
// lo programado que sigue vivo (sin los que Richie borró y mandó olvidar)
export const vigentes = (reg = leerRegistro()) => { const fuera = cancelados(reg); return reg.filter((r) => r.estado === "programado" && !fuera.has(`${r.postId}|${r.cuenta}`)); };
export function duplicado(h, plataforma, cuenta, reg = leerRegistro()) {
  const fuera = cancelados(reg);
  return reg.find((r) => r.estado === "programado" && r.tipo !== "imagen" && !fuera.has(`${r.postId}|${r.cuenta}`) && r.plataforma === plataforma && r.cuenta === cuenta &&
    (r.archivoHash === h.archivoHash || r.guionHash === h.guionHash || (normal(r.titulo) === normal(h.titulo) && mismoFormato(r, h)))) || null;
}

// lo que hoy bloquea programar este video (mismo archivo, guion o título ya programado, de este u otro proyecto)
export function bloqueos(id, reg = leerRegistro()) {
  const h = huellas(id), fuera = cancelados(reg), vistos = new Map();
  for (const r of reg) if (r.estado === "programado" && r.tipo !== "imagen" && !fuera.has(`${r.postId}|${r.cuenta}`) && duplicado(h, r.plataforma, r.cuenta, [r])) vistos.set(`${r.postId}|${r.cuenta}`, r);
  return [...vistos.values()];
}
// "ya lo borré en GHL": anota esos posts como cancelados para poder programar la versión nueva. No toca GHL.
export function olvidarProgramados(id) {
  const b = bloqueos(id);
  for (const r of b) anotar({ id: r.id, plataforma: r.plataforma, cuenta: r.cuenta, titulo: r.titulo, archivoHash: r.archivoHash, guionHash: r.guionHash, publica: r.publica, postId: r.postId, estado: "cancelado", por: id });
  // si estaban guardados en el propio proyecto (registro viejo), también se olvidan ahí
  const p = leer(id, "proyecto.json");
  if (p?.ghl?.programados?.length) { p.ghl.programados = []; guardar(id, "proyecto.json", p); }
  return b.map((r) => ({ id: r.id, plataforma: r.plataforma, publica: r.publica }));
}

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

// quita etiquetas tipo <cite>…</cite> que a veces deja la IA en las fuentes. YouTube rechaza CUALQUIER "<" o ">"
// en título y descripción ("Descripción de vídeo no válida"), y además pide ≤ 100 caracteres de título y ≤ 5000 bytes de descripción.
export const limpiarTexto = (t) => String(t || "").replace(/<\/?[a-z][^>]*>/gi, "").replace(/[ \t]{2,}/g, " ").trim();
const paraYoutube = (t) => limpiarTexto(t).replace(/</g, "‹").replace(/>/g, "›");
const recortarBytes = (t, max) => { let s = t; while (Buffer.byteLength(s, "utf8") > max) s = s.slice(0, -1); return s; };
const textoPara = (c, plataforma) => {
  if (/instagram/.test(plataforma)) return limpiarTexto(c.instagram);
  if (/facebook/.test(plataforma)) return limpiarTexto(c.facebook).replace(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/\S+/gi, "").replace(/\n{3,}/g, "\n\n").trim(); // Reel nativo, nunca el link de YouTube
  if (/tiktok/.test(plataforma)) return limpiarTexto(c.tiktok);
  if (/youtube/.test(plataforma)) return recortarBytes(paraYoutube([c.youtube?.titulo, c.youtube?.descripcion].filter(Boolean).join("\n\n")), 4900);
  return limpiarTexto(c.instagram || c.facebook);
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

// GHL rechaza (422) cualquier fecha a menos de 1 min de "ahora". Subir el video tarda, así que se revisa ANTES de subir
// (una hora ya pasada da un error claro sin gastar la subida) y, justo antes de mandar cada red, si la hora quedó
// demasiado cerca, se recorre a 3 min desde ahora y se avisa.
const MARGEN = 3 * 60000;
function revisarFecha(fecha) {
  const cuando = fecha ? new Date(fecha) : new Date(Date.now() + 10 * 60000);
  if (isNaN(cuando)) throw new Error("La fecha no es válida.");
  if (cuando < Date.now() - 60000) throw new Error(`Esa hora ya pasó (${cuando.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })}). Elige una hora futura; si recargas el panel la fecha de mañana se actualiza.`);
  return cuando;
}
const aTiempo = (cuando) => (cuando.getTime() < Date.now() + MARGEN ? new Date(Date.now() + MARGEN) : cuando);

// programa una publicación por red (mismo video, copy de esa red). fecha: ISO; si falta, en 10 minutos
// simular = dry-run: arma exactamente lo que se mandaría a GHL (por red y cuenta), sin subir ni publicar nada.
// Publicar de verdad exige una simulación previa del MISMO archivo en esas redes (últimas 72 h) y el QA aprobado.
export async function programar(id, { cuentasIds = [], fecha, simular = false } = {}, avisar = () => {}) {
  if (!cuentasIds.length) throw new Error("Elige al menos una cuenta.");
  const todas = await cuentas(), elegidas = todas.filter((a) => cuentasIds.includes(a.id));
  if (!elegidas.length) throw new Error("Esas cuentas ya no están conectadas en GHL.");
  let cuando = revisarFecha(fecha);
  // QA que bloquea: sin aprobado no se programa (ni se simula como "listo")
  const QA = await import("./qa.js");
  const q = QA.qaVigente(id) || (avisar({ progreso: 0.05, msg: "Pasando el QA antes de programar…" }), await QA.qaVideo(id));
  if (!q.aprobado) throw new Error(`QA rechazado, no se programa: ${q.motivos.join(" | ")}`);
  const h = huellas(id), reg = leerRegistro();
  // idempotencia: cada cuenta que ya tiene este video (o este guion / título) se salta
  // lo programado antes del registro (nov 2026) vive en proyecto.json → ghl.programados: también cuenta como ya hecho
  const viejo = (leer(id, "proyecto.json")?.ghl?.programados || []).map((x) => ({ plataforma: x.plataforma, cuentas: x.cuentas || [], publica: x.fecha, postId: x.postId }));
  const libres = elegidas.filter((a) => { const d = duplicado(h, a.plataforma, a.id, reg) || viejo.find((x) => x.plataforma === a.plataforma && x.cuentas.includes(a.id)); if (d) { anotar({ id, plataforma: a.plataforma, cuenta: a.id, titulo: h.titulo, ...h, publica: d.publica, postId: d.postId, estado: "duplicado" }); avisar({ progreso: 0.1, msg: `Ya estaba programado en ${a.plataforma} (${enCDMX(d.publica)}): no se repite.` }); } return !d; });
  if (!libres.length) return [];
  if (!simular) {
    const sinSim = libres.filter((a) => !reg.some((r) => r.estado === "simulado" && r.id === id && r.archivoHash === h.archivoHash && r.cuenta === a.id && Date.now() - new Date(r.fecha).getTime() < 72 * 3600e3));
    if (sinSim.length) throw new Error(`Primero haz la simulación (dry-run) de este video en: ${sinSim.map((a) => a.plataforma).join(", ")}. No se publica nada real sin simular antes.`);
  }
  const c = leerCopys(id);
  if (simular) {
    const plan = libres.map((a) => {
      const esYoutube = /youtube/.test(a.plataforma);
      const plan = { plataforma: a.plataforma, cuenta: a.id, nombre: a.nombre, publica: aTiempo(cuando).toISOString(), titulo: esYoutube ? paraYoutube(c.youtube?.titulo || h.titulo).slice(0, 100) : String(textoPara(c, a.plataforma) || "").split("\n")[0], texto: textoPara(c, a.plataforma) || "", tipo: /instagram|facebook/.test(a.plataforma) ? "reel" : "post" };
      anotar({ id, plataforma: a.plataforma, cuenta: a.id, titulo: h.titulo, ...h, publica: plan.publica, postId: null, estado: "simulado" });
      return plan;
    });
    avisar({ progreso: 1, msg: "Simulación lista: no se publicó nada." });
    return plan.map((x) => ({ ...x, simulado: true }));
  }
  avisar({ progreso: 0.1, msg: "Subiendo el video a GoHighLevel…" });
  const url = await subirVideo(id);
  const usuario = await usuarioGHL();
  const miniatura = libres.some((a) => /youtube/.test(a.plataforma)) ? await subirMiniatura(id) : null;
  const porRed = {};
  for (const a of libres) (porRed[a.plataforma] ||= []).push(a.id);
  const hechos = [];
  for (const [plataforma, ids] of Object.entries(porRed)) {
    avisar({ progreso: 0.5, msg: `Programando en ${plataforma}…` });
    const antes = cuando; cuando = aTiempo(cuando);
    if (cuando !== antes) avisar({ progreso: 0.5, msg: `La hora quedó muy cerca; se programa para las ${cuando.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}` });
    const esYoutube = /youtube/.test(plataforma);
    const cuerpo = { accountIds: ids, summary: textoPara(c, plataforma) || "", media: [{ url, type: "video/mp4", ...(esYoutube && miniatura ? { thumbnail: miniatura } : {}) }], status: "scheduled", scheduleDate: cuando.toISOString(),
      type: /instagram|facebook/.test(plataforma) ? "reel" : "post", userId: usuario,
      ...(esYoutube ? { youtubePostDetails: { title: paraYoutube(c.youtube?.titulo || leer(id, "guion.json")?.titulo || id).slice(0, 100), privacyLevel: "public", type: "video" } } : {}) };
    let j;
    try { j = await pedir("POST", `/social-media-posting/${CFG.ghlLocation}/posts`, cuerpo); }
    catch (e) { for (const cu of ids) anotar({ id, plataforma, cuenta: cu, titulo: h.titulo, ...h, publica: cuando.toISOString(), postId: null, estado: "error", error: e.message.slice(0, 200) }); throw e; }
    const postId = j.results?.post?._id || j.results?.post?.id || j.post?._id || j.id || null;
    for (const cu of ids) anotar({ id, plataforma, cuenta: cu, titulo: h.titulo, ...h, publica: cuando.toISOString(), postId, estado: "programado" });
    hechos.push({ plataforma, cuentas: ids, fecha: cuando.toISOString(), postId });
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
  const base = revisarFecha(fecha);
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
    const cuando = aTiempo(new Date(base.getTime() + i * 864e5));
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

// ---- imágenes del día (core/imagenes-dia.js) ----
// Cada imagen a su hora: página de Facebook (todas), Instagram (las marcadas) y grupos de Facebook (las marcadas; GHL solo
// publica en grupos donde Richie es admin y que estén conectados en el Social Planner). Igual que los videos: primero
// simular (dry-run, no sube ni publica nada) y luego programar exactamente eso; lo ya programado no se repite.
const esGrupo = (a) => /group/i.test(`${a.tipo} ${a.plataforma}`);
const destinoDe = (a) => (esGrupo(a) ? "grupo" : /instagram/.test(a.plataforma) ? "instagram" : /facebook/.test(a.plataforma) ? "facebook" : null);
async function subirArchivoImagen(ruta, nombre) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(ruta)], { type: "image/jpeg" }), nombre);
  form.append("hosted", "false"); form.append("name", nombre);
  return (await pedir("POST", "/medias/upload-file", form, { form: true, ms: 120000 })).url;
}
export async function programarDia(fecha, { cuentasIds = [], simular = false } = {}, avisar = () => {}) {
  const D = await import("./imagenes-dia.js");
  const d = D.leerDia(fecha); if (!d?.imagenes?.length) throw new Error("No hay imágenes de ese día.");
  if (!cuentasIds.length) throw new Error("Elige al menos una cuenta.");
  const elegidas = (await cuentas()).filter((a) => cuentasIds.includes(a.id) && !a.caducada && destinoDe(a));
  if (!elegidas.length) throw new Error("Elige la página de Facebook, Instagram o un grupo de Facebook (YouTube y TikTok no llevan imágenes).");
  const reg = leerRegistro(), vivos = vigentes(reg), usuario = simular ? null : await usuarioGHL();
  const hechos = [], saltadas = [];
  const listas = d.imagenes.filter((x) => x.archivo && fs.existsSync(path.join(D.dirDia(fecha), x.archivo)));
  if (!listas.length) throw new Error("Ninguna imagen está compuesta todavía: primero genera los fondos en Flow y compón las imágenes.");
  for (const [k, x] of listas.entries()) {
    const cuando = D.fechaDe(fecha, x.hora);
    if (cuando.getTime() < Date.now() + MARGEN) { saltadas.push(`${x.n} (${x.hora} ya pasó)`); continue; }
    const id = `img-${fecha}-${String(x.n).padStart(2, "0")}`, ruta = path.join(D.dirDia(fecha), x.archivo);
    const hash = hashArchivo(ruta);
    const destinos = elegidas.filter((a) => { const t = destinoDe(a); return t === "facebook" || (t === "instagram" && x.instagram) || (t === "grupo" && x.grupos); });
    const libres = destinos.filter((a) => !vivos.some((r) => r.tipo === "imagen" && r.cuenta === a.id && (r.archivoHash === hash || r.id === id)));
    if (destinos.length > libres.length) saltadas.push(`${x.n} ya programada en ${destinos.length - libres.length} cuenta(s)`);
    if (!libres.length) continue;
    if (!simular) {
      const sinSim = libres.filter((a) => !reg.some((r) => r.estado === "simulado" && r.tipo === "imagen" && r.archivoHash === hash && r.cuenta === a.id && Date.now() - new Date(r.fecha).getTime() < 72 * 3600e3));
      if (sinSim.length) throw new Error(`La imagen ${x.n} no se ha simulado en ${sinSim.map((a) => a.nombre).join(", ")}. Primero «Simular». No se publica nada sin simular antes.`);
    }
    avisar({ progreso: (k + 0.3) / listas.length, msg: `${simular ? "Simulando" : "Programando"} imagen ${x.n} (${x.hora})…` });
    let url = null;
    if (!simular) { url = x.ghl?.hash === hash && x.ghl.url ? x.ghl.url : await subirArchivoImagen(ruta, `${id}.jpg`); x.ghl = { url, hash }; }
    // un post por destino (la página/IG con hashtags; el grupo sin ellos)
    const porDestino = {};
    for (const a of libres) (porDestino[destinoDe(a)] ||= []).push(a);
    for (const [destino, cs] of Object.entries(porDestino)) {
      const texto = (await import("./imagenes-dia.js")).textoPara(x, destino), base = { id, tipo: "imagen", titulo: x.frase, archivoHash: hash, publica: cuando.toISOString(), formato: "4:5" };
      if (simular) { for (const a of cs) anotar({ ...base, plataforma: a.plataforma, cuenta: a.id, postId: null, estado: "simulado" }); hechos.push({ n: x.n, hora: x.hora, destino, cuentas: cs.map((a) => a.nombre), texto }); continue; }
      try {
        const j = await pedir("POST", `/social-media-posting/${CFG.ghlLocation}/posts`, { accountIds: cs.map((a) => a.id), summary: texto, media: [{ url, type: "image/jpeg" }], status: "scheduled", scheduleDate: cuando.toISOString(), type: "post", userId: usuario });
        const postId = j.results?.post?._id || j.results?.post?.id || j.post?._id || j.id || null;
        for (const a of cs) anotar({ ...base, plataforma: a.plataforma, cuenta: a.id, postId, estado: "programado" });
        hechos.push({ n: x.n, hora: x.hora, destino, cuentas: cs.map((a) => a.nombre), postId });
      } catch (e) { for (const a of cs) anotar({ ...base, plataforma: a.plataforma, cuenta: a.id, postId: null, estado: "error", error: e.message.slice(0, 200) }); throw new Error(`Imagen ${x.n}: ${e.message}`); }
    }
  }
  if (!simular) D.guardarDia({ ...D.leerDia(fecha), imagenes: D.leerDia(fecha).imagenes.map((y) => listas.find((z) => z.n === y.n)?.ghl ? { ...y, ghl: listas.find((z) => z.n === y.n).ghl } : y) });
  return { hechos, saltadas };
}
