// Imágenes del día (Monarca): el informe de la mañana de Muse → 10 imágenes de frase originales, cada una con su
// fondo de Flow, su copy y su hora, listas para programarse en GHL (página de Facebook, grupos de Facebook donde Richie
// es admin e Instagram).
//
// Todo vive en imagenes-dia/AAAA-MM-DD/:
//   dia.json      → { fecha, nicho, informe, referencias: [...], pedido, imagenes: [{ n, hora, frase, clave, autor, tema,
//                     inspiradaEn, flowPrompt, copy, hashtags, instagram, grupos, fondo, archivo }] }
//   fondos/       → la imagen que dio Flow (img-NN.png|jpg)
//   img-NN.jpg    → la imagen final 4:5 (1080x1350) con la frase, el tono y el sello M
//
// Flujo: armarDia (lee el informe; con IA escribe las 10; sin IA, Claude Code: "escribe las imágenes del día")
//        → generarEnFlow (fondos que falten; gasta Flow) → componer (gratis) → GHL: simularDia / programarDia.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { RAIZ } from "./config.js";
import * as INV from "./investigador.js";
import { parsearInforme } from "./informe-diario.js";
import { informeReciente } from "./plan-dia.js";
import { hayIA, pedir, jsonDe } from "./llm.js";
import { leerAjustes } from "./ajustes.js";
import { html } from "./imagenes-post.js";

export const DIR = path.join(RAIZ, "imagenes-dia");
export const hoyCDMX = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
export const dirDia = (fecha) => path.join(DIR, fecha);
const fDia = (fecha) => path.join(dirDia(fecha), "dia.json");
const W = 1080, H = 1350;
const TONOS = { turquesa: "#3fb2a3", ambar: "#d49a5a", plata: "#9a9a9a", rojo: "#b5473a" };
const ESTILO_BASE = "Dark cinematic photo of ancient Greek marble statues or misty classical landscapes, dramatic moody low light, high contrast, monochrome, shallow depth of field";

// ajustes.json → "imagenesDia": { "cantidad": 10, "horas": [...], "instagram": [1,5,9], "grupos": [3,7,10], "tonos": [...] }
// instagram / grupos = números de imagen (1 a 10) que también van ahí (sin la clave: todas); la página de Facebook lleva todas.
export function config() {
  const a = leerAjustes().imagenesDia || {};
  const horas = Array.isArray(a.horas) && a.horas.length ? a.horas : ["08:00", "09:30", "11:00", "12:00", "14:30", "16:00", "17:30", "18:30", "20:30", "21:30"];
  return {
    cantidad: Number(a.cantidad) || horas.length,
    horas,
    // por defecto TODAS van también a Instagram y a los grupos (Richie las publica en todo); se puede limitar con una lista
    instagram: Array.isArray(a.instagram) ? a.instagram : horas.map((_, i) => i + 1),
    grupos: Array.isArray(a.grupos) ? a.grupos : horas.map((_, i) => i + 1),
    tonos: Array.isArray(a.tonos) && a.tonos.length ? a.tonos : ["turquesa", "ambar", "plata", "rojo"],
  };
}

export function leerDia(fecha) { try { return JSON.parse(fs.readFileSync(fDia(fecha), "utf8")); } catch { return null; } }
export function guardarDia(d) { fs.mkdirSync(dirDia(d.fecha), { recursive: true }); fs.writeFileSync(fDia(d.fecha), JSON.stringify(d, null, 2)); return d; }
export function diaReciente() {
  if (!fs.existsSync(DIR)) return null;
  const f = fs.readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop();
  return f ? leerDia(f) : null;
}

// publicaciones del informe que sirven de referencia para imágenes: primero las de imagen o carrusel, luego las demás,
// sin las de riesgo de marca, ordenadas por pico (veces su normal) y likes
export function referencias(md) {
  const inf = parsearInforme(md);
  const esImagen = (p) => /instagram\.com\/p\//i.test(p.link || "") || /imagen|carrusel|foto|frase|cita/i.test(p.seVe || "");
  const pubs = inf.publicaciones.filter((p) => p.link && !p.riesgo && !p.sinCifras)
    .sort((a, b) => (esImagen(b) - esImagen(a)) || ((b.pico ?? 0) - (a.pico ?? 0)) || ((b.likes ?? 0) - (a.likes ?? 0)));
  return {
    publicaciones: pubs.map((p) => ({ link: p.link, cuenta: p.cuenta, idea: p.idea, seVe: p.seVe, cta: p.cta, likes: p.likes, pico: p.pico, imagen: esImagen(p) })),
    patrones: inf.patrones,
    propuestas: (inf.propuestas || []).map((p) => ({ frase: p.frase, idea: p.idea, inspiradaEn: p.inspiradaEn })),
  };
}

function pedido(cfg, refs, nichoCfg) {
  const cierre = (nichoCfg.cierres || []).find((c) => /env[ií]ale|comp[aá]rt/i.test(c)) || "Envíale esto a alguien que necesita leerlo hoy.";
  return `Escribe ${cfg.cantidad} imágenes de frase para Monarca (página de reflexión estoica en español, público hispano de México y EE. UU.).
Cada imagen nace de UNA publicación del informe que ya funcionó: toma su IDEA, nunca su texto. Pon su enlace exacto en "inspiradaEn" (solo enlaces de la lista de referencias). Puedes usar la misma referencia para 2 imágenes como máximo, con ángulos distintos.
- "frase": original, 6 a 18 palabras, se entiende sola sin contexto, verdad incómoda o consuelo firme, en segunda persona o impersonal. Nada de clichés de gurú, nada de promesas, nada de política ni religión polémica. Nunca copies frases de otras cuentas.
- "autor": vacío, salvo que la frase sea una cita REAL verificada con 2 fuentes (Séneca, Marco Aurelio, Epicteto, Buda…); en ese caso la frase es la cita exacta y en "fuente" pones obra y capítulo. Ante la duda, sin autor.
- "clave": la palabra más fuerte de la frase.
- "tema": 2 a 4 palabras.
- "flowPrompt": en inglés, la imagen de fondo: una estatua clásica o un paisaje que diga lo mismo que la frase, vertical, sujeto centrado con espacio libre arriba y abajo para el texto, sin texto. Estilo: ${ESTILO_BASE}.
- "copy": 50 a 90 palabras para Facebook e Instagram: primera línea gancho (no repitas la frase tal cual), luego qué significa con un ejemplo de la vida diaria, una acción pequeña para hoy y el cierre "${cierre}" (puedes precisar a quién). Pensado para que la gente la comparta en sus grupos y por WhatsApp. Máximo 2 emojis. Separa líneas con \\n.
- "hashtags": 3 a 5, en español.
Varía los temas (no 10 veces lo mismo): sufrimiento, límites, disciplina, soledad, tiempo, ira, aceptación, carácter, familia, muerte…
Devuelve SOLO JSON: {"imagenes":[{"frase","autor","fuente","clave","tema","inspiradaEn":["url"],"flowPrompt","copy","hashtags":[]}]}

REFERENCIAS (las de imagen primero):
${refs.publicaciones.slice(0, 15).map((p, i) => `${i + 1}. ${p.link} ${p.cuenta || ""} · ${p.imagen ? "IMAGEN/CARRUSEL" : "video"} · ${p.pico ? `${p.pico}x su normal · ` : ""}${p.likes ? `${p.likes} likes` : ""}\n   Idea: ${p.idea || ""}\n   Qué se ve: ${p.seVe || ""}`).join("\n")}
PATRONES DE HOY: ${(refs.patrones || []).join(" | ")}`;
}

// lo que se escribió (por IA o por Claude Code) se valida y se reparte en las horas del día
function normalizar(d, lista) {
  const cfg = config(), validos = new Set(d.referencias.publicaciones.map((p) => p.link));
  return lista.slice(0, cfg.cantidad).map((x, i) => {
    const previo = d.imagenes?.[i];
    const insp = (x.inspiradaEn || []).filter((u) => validos.has(u));
    return {
      ...(previo && previo.frase === x.frase ? previo : {}), // si no cambió la frase, conserva fondo y archivo
      n: i + 1, hora: cfg.horas[i] || cfg.horas[cfg.horas.length - 1],
      frase: String(x.frase || "").trim(), autor: String(x.autor || "").trim(), fuente: String(x.fuente || "").trim(),
      clave: String(x.clave || "").trim(), tema: String(x.tema || "").trim(), inspiradaEn: insp,
      flowPrompt: String(x.flowPrompt || "").trim(), copy: String(x.copy || "").trim(),
      hashtags: (x.hashtags || []).map((t) => (String(t).startsWith("#") ? t : "#" + t)).slice(0, 5),
      instagram: cfg.instagram.includes(i + 1), grupos: cfg.grupos.includes(i + 1),
      tono: cfg.tonos[i % cfg.tonos.length],
      sinReferencia: !insp.length,
    };
  });
}

export async function armarDia({ archivo, nicho = "monarca", fecha = hoyCDMX(), forzar = false, conIA = true } = {}) {
  archivo = archivo || informeReciente(nicho);
  if (!archivo || !fs.existsSync(archivo)) throw new Error("No hay ningún informe de Muse en este equipo.");
  const md = fs.readFileSync(archivo, "utf8"), cfg = config(), nichoCfg = INV.leerConfig(nicho);
  const previo = leerDia(fecha);
  const d = { fecha, nicho, informe: path.basename(archivo), creado: new Date().toISOString(), referencias: referencias(md), imagenes: [] };
  if (!d.referencias.publicaciones.length) throw new Error("El informe no trae publicaciones con enlace que sirvan de referencia.");
  d.pedido = pedido(cfg, d.referencias, nichoCfg);
  if (previo?.imagenes?.length && !forzar) d.imagenes = previo.imagenes; // lo ya escrito no se pisa
  if (!d.imagenes.length && conIA && hayIA()) {
    try { const j = jsonDe((await pedir(d.pedido, "Escribe las imágenes.", { maxTokens: 12000 })).texto); d.imagenes = normalizar(d, j.imagenes || []); }
    catch (e) { d.errorIA = e.message === "SIN_IA" ? "no hay IA conectada" : e.message; }
  }
  return guardarDia(d);
}

// Claude Code (o el panel) entrega la lista escrita → se valida y se guarda
export function guardarEscritas(fecha, lista) {
  const d = leerDia(fecha); if (!d) throw new Error(`No hay imágenes del día ${fecha}: primero ármalas con el informe.`);
  d.imagenes = normalizar(d, lista);
  const malas = d.imagenes.filter((x) => !x.frase || !x.flowPrompt || !x.copy);
  if (malas.length) throw new Error(`A ${malas.map((x) => x.n).join(", ")} les falta frase, flowPrompt o copy.`);
  return guardarDia(d);
}

// edición a mano de una imagen desde el panel (frase, autor, copy, hashtags, hora, redes)
export function editarImagen(fecha, n, cambios) {
  const d = leerDia(fecha), x = d?.imagenes?.find((i) => i.n === Number(n));
  if (!x) throw new Error("No encuentro esa imagen.");
  const antes = x.frase + "|" + x.autor;
  for (const k of ["frase", "autor", "copy", "hora", "flowPrompt"]) if (typeof cambios[k] === "string") x[k] = cambios[k].trim();
  if (Array.isArray(cambios.hashtags)) x.hashtags = cambios.hashtags.map((t) => (String(t).startsWith("#") ? t : "#" + t));
  for (const k of ["instagram", "grupos"]) if (typeof cambios[k] === "boolean") x[k] = cambios[k];
  if (typeof cambios.flowPrompt === "string") delete x.fondo; // otro fondo
  if (antes !== x.frase + "|" + x.autor || cambios.flowPrompt) delete x.archivo; // hay que volver a componerla
  return guardarDia(d);
}

const fondoDe = (d, x) => x.fondo && fs.existsSync(path.join(dirDia(d.fecha), x.fondo)) ? path.join(dirDia(d.fecha), x.fondo) : null;

// fondos en Flow (solo los que falten). Se piden en 9:16 y se recortan a 4:5 al componer. Gasta créditos de Flow.
export async function generarEnFlow(fecha, avisar = () => {}) {
  const d = leerDia(fecha); if (!d?.imagenes?.length) throw new Error("Todavía no están escritas las imágenes de ese día.");
  const { lote } = await import("./flowskill.js");
  const dir = dirDia(fecha), dirF = path.join(dir, "fondos"); fs.mkdirSync(dirF, { recursive: true });
  let faltan = d.imagenes.filter((x) => x.flowPrompt && !fondoDe(d, x)), fallos = [], hechas = 0;
  for (let vuelta = 1; vuelta <= 2 && faltan.length; vuelta++) {
    const jobs = faltan.map((x) => ({ type: "image", name: `img-${String(x.n).padStart(2, "0")}`, prompt: `${ESTILO_BASE}, vertical 9:16, subject centered in the middle third, empty dark space above and below. ${x.flowPrompt} One single continuous image, no collage, no text, no letters, no logos, no watermark.` }));
    avisar({ progreso: 0.02, msg: `Flow: ${jobs.length} fondos${vuelta > 1 ? " (segunda vuelta)" : ""}…` });
    let r;
    try { r = await lote(`imagenes-${fecha}`, `fondos-${Date.now()}`, jobs, avisar, { ratio: "9:16", minutos: Math.max(40, jobs.length * 3), dir: path.join(dir, "flow") }); }
    catch (e) { fallos = [e.message]; if (hechas) break; throw e; }
    fallos = r.fallos;
    const d2 = leerDia(fecha);
    for (const x of d2.imagenes) {
      const f = r.archivos[`img-${String(x.n).padStart(2, "0")}`]; if (!f) continue;
      const nombre = `img-${String(x.n).padStart(2, "0")}${path.extname(f).toLowerCase() || ".png"}`;
      fs.copyFileSync(f, path.join(dirF, nombre)); x.fondo = `fondos/${nombre}`; delete x.archivo; hechas++;
    }
    guardarDia(d2);
    faltan = d2.imagenes.filter((x) => x.flowPrompt && !fondoDe(d2, x));
  }
  return { hechas, faltan: faltan.map((x) => x.n), fallos };
}

// pone la frase sobre su fondo (4:5, tono, sello M). Gratis; las que no tienen fondo de Flow no se componen.
export async function componer(fecha, avisar = () => {}) {
  const d = leerDia(fecha); if (!d?.imagenes?.length) throw new Error("Todavía no están escritas las imágenes de ese día.");
  const { abrirNavegador } = await import("./render.js");
  const nav = await abrirNavegador(), dir = dirDia(fecha), hechas = [];
  try {
    for (const x of d.imagenes) {
      const fondo = fondoDe(d, x); if (!fondo || !x.frase) continue;
      avisar({ progreso: x.n / d.imagenes.length, msg: `Componiendo ${x.n} de ${d.imagenes.length}…` });
      const pag = await nav.newPage({ viewport: { width: W, height: H } });
      try {
        await pag.setContent(html({ fondo, texto: x.frase, autor: x.autor, tono: TONOS[x.tono] || TONOS.turquesa, sello: "M", canal: "", n: 1, total: 1 }), { waitUntil: "load" });
        await pag.waitForSelector("body[data-listo]", { timeout: 15000 });
        const nombre = `img-${String(x.n).padStart(2, "0")}.jpg`;
        await pag.screenshot({ path: path.join(dir, nombre), type: "jpeg", quality: 90 });
        x.archivo = nombre; x.hash = crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, nombre))).digest("hex").slice(0, 16); hechas.push(x.n);
      } finally { await pag.close(); }
    }
  } finally { await nav.close(); }
  guardarDia(d);
  fs.writeFileSync(path.join(dir, "textos.txt"), d.imagenes.map((x) => `${x.n}. ${x.hora} · ${x.frase}${x.autor ? ` — ${x.autor}` : ""}\n${x.copy}\n${(x.hashtags || []).join(" ")}\n`).join("\n"));
  return { hechas };
}

// texto por destino: página e Instagram con hashtags; en grupos, sin hashtags (allí se ven como spam)
export const textoPara = (x, destino) => (destino === "grupo" ? x.copy : `${x.copy}\n\n${(x.hashtags || []).join(" ")}`).trim();

// fecha de publicación (CDMX, sin horario de verano) de la imagen
export const fechaDe = (fecha, hora) => new Date(`${fecha}T${hora}:00-06:00`);
