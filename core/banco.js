// Banco de imágenes y biblioteca de música que se reutilizan entre videos.
//
// Imágenes: banco/<estilo>/ guarda lo que salió de Flow (o que subiste) en videos anteriores, con sus etiquetas
// (las palabras de "buscar" y del prompt). Cuando un video nuevo no tiene imagen para una escena, primero se busca
// en el banco algo parecido, luego en Pexels, y si Pexels no da nada, cualquier imagen del banco que no se haya usado
// en ese video. Así, aunque lo hagas desde el celular (sin Flow), siempre salen estatuas.
//
// Música: lo que generas con ElevenLabs se guarda en musica/nichos/<nicho>/ y aparece en el panel de cualquier video
// de ese nicho para reutilizarla (se ajusta sola al largo del video: se repite o se corta con fundido).
//
// Espejo: si en el .env de la laptop pones ESPEJO_URL (la dirección del panel del VPS) y ESPEJO_CLAVE (su PANEL_CLAVE),
// cada imagen y pista nueva se manda también al VPS, para tenerlas desde el celular.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CFG, RAIZ, DIR_PROYECTOS, DIR_LISTOS } from "./config.js";
import { dirProyecto, leer, guardar, slug, listarProyectos } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";

export const DIR_BANCO = path.join(RAIZ, "banco");
const DIR_MUSICA = path.join(RAIZ, "musica");
const VIDEO = /\.(mp4|mov|webm|m4v)$/i, IMAGEN = /\.(jpe?g|png|webp)$/i, AUDIO = /\.(mp3|m4a|wav|ogg)$/i;
const ARCH_VIDEO = /\.(json|txt|mp3|m4a|wav|mp4|mov|webm|m4v|jpe?g|png|webp)$/i;
const rel = (f) => path.relative(RAIZ, f).replace(/\\/g, "/");

// ---------------- nicho de un proyecto ----------------
export async function nichoDeProyecto(p) {
  const INV = await import("./investigador.js");
  if (p.nicho) return p.nicho;
  if (p.desdeInvestigacion) try { return INV.nichoDe(INV.leerInvestigacion(p.desdeInvestigacion.archivo)); } catch {}
  const deEstilo = INV.listarNichos().map((n) => INV.leerConfig(n.id)).find((c) => (c.estilos || []).includes(p.estilo));
  return deEstilo?.id || INV.nichoActivo();
}

// ---------------- etiquetas ----------------
const VACIAS = new Set("a an the of in on at to with and or for by from into over under near its his her their this that is are be very no not text letters logos logo watermark vertical cinematic photo shot dark moody light low high soft dramatic style image".split(" "));
export const etiquetas = (...t) => [...new Set(t.join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VACIAS.has(w)))];
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 12);

// ---------------- banco de imágenes ----------------
const dirEstilo = (estilo) => path.join(DIR_BANCO, estilo);
function indice(estilo) { try { return JSON.parse(fs.readFileSync(path.join(dirEstilo(estilo), "indice.json"), "utf8")); } catch { return []; } }
function guardarIndice(estilo, lista) { fs.mkdirSync(dirEstilo(estilo), { recursive: true }); fs.writeFileSync(path.join(dirEstilo(estilo), "indice.json"), JSON.stringify(lista, null, 1)); }

export function listarBanco(estilo) {
  return indice(estilo).filter((x) => fs.existsSync(path.join(dirEstilo(estilo), x.archivo))).map((x) => ({ ...x, ruta: `banco/${estilo}/${x.archivo}` }));
}

// de dónde vino cada clip de un proyecto (pexels y banco no vuelven a entrar al banco)
const fOrigen = (id) => path.join(dirProyecto(id), "clips", "origen.json");
export function origenes(id) { try { return JSON.parse(fs.readFileSync(fOrigen(id), "utf8")); } catch { return {}; } }
export function marcarOrigen(id, n, origen) { const o = origenes(id); if (origen) o[n] = origen; else delete o[n]; fs.mkdirSync(path.dirname(fOrigen(id)), { recursive: true }); fs.writeFileSync(fOrigen(id), JSON.stringify(o)); }

// mete al banco las imágenes/clips propios (Flow o subidos) de un proyecto
export async function guardarDeProyecto(id) {
  const p = leer(id, "proyecto.json"), est = leerEstilo(p.estilo);
  if (!est?.banco) return 0;
  const g = leer(id, "guion.json") || { escenas: [] }, d = path.join(dirProyecto(id), "clips");
  if (!fs.existsSync(d)) return 0;
  const org = origenes(id), lista = indice(est.id), hashes = new Set(lista.map((x) => x.hash));
  const nicho = await nichoDeProyecto(p);
  let nuevos = 0;
  for (const f of fs.readdirSync(d)) {
    const m = f.match(/^escena-(\d+)\.(\w+)$/); if (!m || !(VIDEO.test(f) || IMAGEN.test(f))) continue;
    if (["pexels", "banco"].includes(org[m[1]])) continue;
    const src = path.join(d, f), hash = md5(src); if (hashes.has(hash)) continue;
    const e = g.escenas[Number(m[1]) - 1] || {};
    const archivo = `${slug(e.buscar || e.flowPrompt || "imagen").slice(0, 40) || "imagen"}-${hash}${path.extname(f).toLowerCase()}`;
    fs.mkdirSync(dirEstilo(est.id), { recursive: true });
    fs.copyFileSync(src, path.join(dirEstilo(est.id), archivo));
    const item = { archivo, hash, etiquetas: etiquetas(e.buscar || "", e.flowPrompt || ""), prompt: e.flowPrompt || "", buscar: e.buscar || "", nicho, de: id, fecha: new Date().toISOString() };
    lista.push(item); hashes.add(hash); nuevos++;
    espejo(path.join(dirEstilo(est.id), archivo), { tipo: "banco", estilo: est.id, item });
  }
  if (nuevos) guardarIndice(est.id, lista);
  return nuevos;
}

// la mejor imagen del banco para una escena (sin repetir dentro del mismo video)
export function delBanco(estilo, e, usados = new Set(), { minimo = 2, nicho } = {}) {
  const quiero = etiquetas(e.buscar || "", e.flowPrompt || "");
  const cands = listarBanco(estilo).filter((x) => !usados.has(x.archivo)).map((x) => {
    const tags = new Set(x.etiquetas || []); let s = 0;
    for (const w of quiero) if (tags.has(w)) s += (e.buscar || "").toLowerCase().includes(w) ? 2 : 1;
    if (nicho && x.nicho === nicho) s += 0.5;
    return { ...x, puntos: s };
  }).sort((a, b) => b.puntos - a.puntos);
  const mejor = cands[0];
  return mejor && mejor.puntos >= minimo ? mejor : null;
}
export function cualquieraDelBanco(estilo, usados = new Set(), semilla = 0) {
  const libres = listarBanco(estilo).filter((x) => !usados.has(x.archivo));
  return libres.length ? libres[semilla % libres.length] : null;
}
export const archivoBanco = (estilo, archivo) => path.join(dirEstilo(estilo), path.basename(archivo));

// pone una imagen del banco como clip de la escena n
export function usarDelBanco(id, n, archivo) {
  const p = leer(id, "proyecto.json"), src = archivoBanco(p.estilo, archivo);
  if (!fs.existsSync(src)) throw new Error("Esa imagen ya no está en el banco.");
  const d = path.join(dirProyecto(id), "clips"); fs.mkdirSync(d, { recursive: true });
  for (const x of fs.readdirSync(d)) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(d, x));
  fs.copyFileSync(src, path.join(d, `escena-${n}${path.extname(src)}`));
  marcarOrigen(id, n, "banco");
}

// ---------------- biblioteca de música ----------------
export const dirMusicaNicho = (nicho) => path.join(DIR_MUSICA, "nichos", nicho);
const metaDe = (f) => { try { return JSON.parse(fs.readFileSync(f.replace(AUDIO, ".json"), "utf8")); } catch { return {}; } };

// guarda una pista generada en la biblioteca del nicho (y la manda al VPS si hay espejo)
export function guardarPista(nicho, origen, meta) {
  const d = dirMusicaNicho(nicho); fs.mkdirSync(d, { recursive: true });
  const nombre = `${slug(meta.tema || meta.estilo || "pista").slice(0, 40) || "pista"}-${Date.now().toString(36)}${path.extname(origen) || ".mp3"}`;
  const f = path.join(d, nombre);
  fs.copyFileSync(origen, f);
  const m = { ...meta, nicho, fecha: new Date().toISOString() };
  fs.writeFileSync(f.replace(AUDIO, ".json"), JSON.stringify(m, null, 2));
  espejo(f, { tipo: "musica", meta: m });
  return rel(f);
}

// todas las pistas que puede usar un video: las generadas de su nicho, las del estilo y las generales
export async function opcionesMusica(id) {
  const p = leer(id, "proyecto.json"), est = leerEstilo(p.estilo) || {};
  const nicho = await nichoDeProyecto(p), oscuro = est.sonido?.ambiente && est.sonido.ambiente !== "suave";
  const lista = [];
  const leerDir = (d, origen) => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d).filter((x) => AUDIO.test(x)).sort()) { const f = path.join(d, n), m = metaDe(f);
    lista.push({ ruta: rel(f), nombre: m.tema ? `${m.tema}${m.estilo && m.estilo !== est.id ? " · " + m.estilo : ""}` : n.replace(AUDIO, "").replace(/[-_]+/g, " "), origen, estilo: m.estilo || "", segundos: m.segundos || null, prompt: m.prompt || "", tema: m.tema || "" }); } };
  leerDir(dirMusicaNicho(nicho), "generada");
  leerDir(path.join(DIR_MUSICA, est.id || "x"), "estilo");
  if (!oscuro) leerDir(DIR_MUSICA, "general");
  // cuál recomienda la fábrica: la del mismo estilo y tema, luego la del estilo, luego la de la biblioteca
  const tema = etiquetas(p.tema || p.titulo || "", p.idea || "");
  const puntos = (x) => (x.origen === "generada" ? 3 : x.origen === "estilo" ? 2 : 0) + (x.estilo === est.id ? 4 : 0) + etiquetas(x.tema, x.prompt).filter((w) => tema.includes(w)).length;
  let reco = null;
  if (lista.length) {
    const orden = [...lista].sort((a, b) => puntos(b) - puntos(a));
    const empatados = orden.filter((x) => puntos(x) === puntos(orden[0]));
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; // entre iguales, cada video toma una distinta
    reco = empatados[h % empatados.length].ruta;
  }
  return { nicho, lista, recomendada: reco, elegida: p.musicaElegida || null };
}

// ruta absoluta de una pista de la biblioteca (solo dentro de musica/)
export function archivoMusica(ruta) {
  const f = path.resolve(RAIZ, String(ruta || ""));
  if (!f.startsWith(DIR_MUSICA + path.sep) || !AUDIO.test(f) || !fs.existsSync(f)) throw new Error("No encuentro esa pista.");
  return f;
}
export function elegirMusica(id, ruta) {
  const f = archivoMusica(ruta), d = dirProyecto(id);
  for (const n of fs.readdirSync(d)) if (n.startsWith("musica.")) fs.rmSync(path.join(d, n));
  fs.copyFileSync(f, path.join(d, "musica" + path.extname(f).toLowerCase()));
  const p = leer(id, "proyecto.json"); p.musicaElegida = ruta; p.musicaIA = { reusada: ruta }; guardar(id, "proyecto.json", p);
}

// ---------------- espejo (laptop → VPS) ----------------
export const hayEspejo = () => !!(CFG.espejoUrl && CFG.espejoClave);
async function espejo(f, datos) {
  if (!hayEspejo()) return;
  try {
    const r = await fetch(`${CFG.espejoUrl.replace(/\/+$/, "")}/api/banco/recibir`, {
      method: "POST", signal: AbortSignal.timeout(900000),
      headers: { authorization: "Basic " + Buffer.from("fabrica:" + CFG.espejoClave).toString("base64"), "x-ruta": encodeURIComponent(rel(f)), "x-datos": encodeURIComponent(JSON.stringify(datos)), "content-type": "application/octet-stream" },
      body: fs.readFileSync(f),
    });
    if (!r.ok) console.warn("Espejo:", r.status, (await r.text()).slice(0, 150));
  } catch (e) { console.warn("Espejo:", e.message); }
}
// lo recibe el VPS
export function recibir(ruta, datos, buffer) {
  const f = path.resolve(RAIZ, ruta);
  const okBanco = f.startsWith(DIR_BANCO + path.sep) && (VIDEO.test(f) || IMAGEN.test(f));
  const okMusica = f.startsWith(path.join(DIR_MUSICA, "nichos") + path.sep) && AUDIO.test(f);
  const okVideo = (f.startsWith(DIR_PROYECTOS + path.sep) && !/[\\/](flow|tmp)[\\/]/.test(f.slice(DIR_PROYECTOS.length)) || f.startsWith(DIR_LISTOS + path.sep)) && ARCH_VIDEO.test(f);
  if (!okBanco && !okMusica && !okVideo) throw new Error("Ruta no permitida.");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
  if (okMusica && datos?.meta) fs.writeFileSync(f.replace(AUDIO, ".json"), JSON.stringify(datos.meta, null, 2));
  if (okBanco && datos?.estilo && datos.item) { const l = indice(datos.estilo).filter((x) => x.hash !== datos.item.hash); l.push(datos.item); guardarIndice(datos.estilo, l); }
}
// manda todo lo que el VPS aún no tenga (banco, música, y los videos con sus imágenes, voz, copy y portada)
let sincronizando = false;
export async function sincronizar(avisar = () => {}, soloId = null) {
  if (!hayEspejo()) throw new Error("Pon ESPEJO_URL y ESPEJO_CLAVE en el .env de la laptop.");
  if (sincronizando) throw new Error("Ya se está enviando al VPS. Espera a que termine.");
  sincronizando = true;
  try {
    const base = CFG.espejoUrl.replace(/\/+$/, ""), auth = { authorization: "Basic " + Buffer.from("fabrica:" + CFG.espejoClave).toString("base64") };
    const r = await fetch(`${base}/api/banco/inventario`, { headers: auth, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`El VPS respondió ${r.status} (¿URL o clave mal?)`);
    const vps = await r.json(), tiene = new Set(vps.archivos || []), tam = vps.tamanos || {};
    const inv = inventario();
    const mios = inv.archivos.filter((x) => {
      if (soloId && !(x.startsWith(`proyectos/${soloId}/`) || x.startsWith(`listos/${soloId}-`))) return false;
      if (x.startsWith("proyectos/") || x.startsWith("listos/")) return tam[x] !== inv.tamanos[x]; // cambió o no existe
      return !tiene.has(x);
    });
    let k = 0;
    for (const ruta of mios) {
      const f = path.join(RAIZ, ruta);
      let datos = {};
      if (ruta.startsWith("banco/")) { const estilo = ruta.split("/")[1]; datos = { tipo: "banco", estilo, item: indice(estilo).find((x) => x.archivo === path.basename(f)) }; }
      else if (ruta.startsWith("musica/")) datos = { tipo: "musica", meta: metaDe(f) };
      else datos = { tipo: "video" };
      await espejo(f, datos); avisar({ progreso: ++k / mios.length, msg: `Enviando al VPS ${k} de ${mios.length}…` });
    }
    return { enviados: mios.length };
  } finally { sincronizando = false; }
}
function recorrer(dir, salida, saltar = () => false) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!saltar(e.name)) recorrer(f, salida, saltar); }
    else if (ARCH_VIDEO.test(e.name)) salida.push(f);
  }
}
export function inventario() {
  const archivos = [], tamanos = {};
  if (fs.existsSync(DIR_BANCO)) for (const e of fs.readdirSync(DIR_BANCO)) for (const x of listarBanco(e)) archivos.push(x.ruta);
  const dn = path.join(DIR_MUSICA, "nichos");
  if (fs.existsSync(dn)) for (const n of fs.readdirSync(dn)) for (const a of fs.readdirSync(path.join(dn, n)).filter((x) => AUDIO.test(x))) archivos.push(`musica/nichos/${n}/${a}`);
  const fv = [];
  recorrer(DIR_PROYECTOS, fv, (n) => n === "flow" || n === "tmp"); recorrer(DIR_LISTOS, fv);
  for (const f of fv) { const r = rel(f); archivos.push(r); try { tamanos[r] = fs.statSync(f).size; } catch {} }
  return { archivos, tamanos };
}

// al arrancar: mete al banco lo que ya se haya generado antes (una sola pasada, barata: compara por hash)
export async function llenarBancoDeAntes() {
  let n = 0;
  for (const p of listarProyectos()) if (leerEstilo(p.estilo)?.banco) n += await guardarDeProyecto(p.id).catch(() => 0);
  return n;
}
