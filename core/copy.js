// Copy para publicar, uno por red (Instagram, Facebook, TikTok, YouTube Shorts), listo para pegar en GoHighLevel (Social Planner).
// Sin IA se arma con el guion (título, descripción, hashtags, fuentes) y el cierre autorizado. Con IA (Gemini) se reescribe por red.
// Se guarda en proyectos/<id>/copys.json y lo puedes editar en el panel.
import { leer, guardar, existe } from "./proyectos.js";
import { leerEstilo } from "./estilos.js";
import * as INV from "./investigador.js";
import { pedir, jsonDe, hayIA } from "./llm.js";

const REDES = ["instagram", "facebook", "tiktok", "youtube"];

function base(id) {
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json") || {}, est = leerEstilo(p.estilo) || {};
  const s = g.subir || {};
  let prop = null;
  if (p.desdeInvestigacion) try { prop = INV.leerInvestigacion(p.desdeInvestigacion.archivo).propuestas.find((x) => x.n === p.desdeInvestigacion.n); } catch {}
  const cfg = INV.leerConfig(p.nicho || (p.desdeInvestigacion ? (() => { try { return INV.nichoDe(INV.leerInvestigacion(p.desdeInvestigacion.archivo)); } catch { return undefined; } })() : undefined));
  const cierre = INV.cierreValido(prop?.cierre, cfg) || (cfg.cierres || [])[0] || "";
  const hashtags = [...new Set([...(s.hashtags || []), ...(prop?.hashtags || [])].map((h) => "#" + String(h).replace(/^#/, "").replace(/\s+/g, "")))].filter((h) => h.length > 1);
  const ia = ""; // la etiqueta de IA se marca en la app al publicar (regla de Levania), no en el texto
  const fuentes = (g.fuentes || []).map((f) => f.dato ? `${f.dato}${f.url ? " (" + f.url + ")" : ""}` : "").filter(Boolean);
  return { p, g, est, prop, cfg, titulo: s.titulo || prop?.tituloPost || g.titulo || p.titulo, desc: s.descripcion || prop?.descripcion || p.idea || "", cierre, hashtags, ia, fuentes };
}

export function copysBasicos(id) {
  const b = base(id), tags = (n) => b.hashtags.slice(0, n).join(" ");
  const fuente = b.g.fuente ? `Fuente: ${b.g.fuente}` : b.fuentes.length ? `Fuente: ${b.fuentes[0].replace(/\s*\(.*\)$/, "")}` : "";
  const cuerpo = [b.titulo, "", b.desc, b.cierre && "", b.cierre].filter((x) => x !== undefined && x !== null && x !== false).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    instagram: [cuerpo, fuente, b.ia, tags(5)].filter(Boolean).join("\n\n"),
    facebook: [cuerpo, fuente, b.ia, tags(3)].filter(Boolean).join("\n\n"),
    tiktok: [b.titulo, b.cierre, b.ia, tags(5)].filter(Boolean).join("\n"),
    youtube: { titulo: String(b.titulo).slice(0, 95) + (b.hashtags.length ? " #shorts" : ""), descripcion: [b.desc, b.cierre, fuente, b.ia, tags(3)].filter(Boolean).join("\n\n") },
    hecho: "plantilla",
  };
}

export function leerCopys(id) { return existe(id, "copys.json") ? leer(id, "copys.json") : copysBasicos(id); }
export function guardarCopys(id, c) { guardar(id, "copys.json", { ...c, editado: new Date().toISOString() }); return leerCopys(id); }

export async function copysConIA(id) {
  if (!hayIA()) throw new Error("Falta la llave de Gemini en el .env.");
  const b = base(id);
  const voz = (b.g.escenas || []).map((e) => e.voz || e.texto).filter(Boolean).join(" ").slice(0, 1500);
  const sistema = `Eres community manager de ${b.cfg.nombre}. Audiencia: ${b.cfg.descripcion} ${b.cfg.marca}
Escribe el copy para publicar UN video corto en cada red, en español de México, cálido y directo, sin clichés de IA ni exceso de emojis (máximo 2).
Reglas: la primera línea es un gancho que se entiende sola (no repitas literal el texto del video). Nada de promesas médicas.
${b.cierre ? `El llamado a la acción es EXACTAMENTE este (cópialo tal cual): "${b.cierre}". No inventes otra palabra para comentar.` : "No pongas 'comenta una palabra': la marca no autorizó ninguno. Puedes invitar a guardar o compartir."}
${b.fuentes.length ? ` Si citas el dato, menciona la fuente: ${b.fuentes.join("; ")}.` : ""}
Devuelve SOLO JSON: {"instagram":"3-6 líneas + 3-5 hashtags","facebook":"parecido a Instagram, un poco más conversacional, 2-3 hashtags","tiktok":"1-3 líneas cortas + 3-5 hashtags","youtube":{"titulo":"máx. 70 caracteres, con #shorts al final","descripcion":"2-4 líneas + 3 hashtags"}}`;
  const pedido = `Título: ${b.titulo}\nDe qué trata: ${b.desc}\nLo que dice el video: ${voz}\nHashtags sugeridos: ${b.hashtags.join(" ")}`;
  const j = jsonDe(await pedir(sistema, pedido));
  const c = { instagram: j.instagram || "", facebook: j.facebook || "", tiktok: j.tiktok || "", youtube: { titulo: j.youtube?.titulo || "", descripcion: j.youtube?.descripcion || "" }, hecho: "ia" };
  guardar(id, "copys.json", c);
  return c;
}
export { REDES };
