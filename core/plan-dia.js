// Plan del día: informe de la mañana → 5 videos listos para programar (3 Shorts, 1 largo del ganador, 1 experimento).
// La selección (qué entra y en qué orden) vive en informe-diario.js; aquí se arma el plan con guion, títulos, CTA,
// descripción, hashtags, flowPrompt, inspiración y horario propuesto, y se guarda en investigacion/plan-AAAA-MM-DD.json
// y listos/plan-AAAA-MM-DD.md. Con IA (Gemini/Claude API) escribe los guiones; sin IA los escribe Claude Code en el JSON
// del plan ("escribe los guiones del plan") y luego `node fabrica.js plan-dia --crear` crea los proyectos.
import fs from "node:fs";
import path from "node:path";
import { DIR_LISTOS } from "./config.js";
import * as P from "./proyectos.js";
import * as INV from "./investigador.js";
import { planDelDia } from "./informe-diario.js";
import { huecosLibres } from "./cola.js";
import { hayIA } from "./llm.js";

const DIR_INV = path.dirname(INV.DIR_INFORMES);
const hoyCDMX = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
export const fPlan = (fecha = hoyCDMX()) => path.join(DIR_INV, `plan-${fecha}.json`);

// el plan más reciente (hoy o el último que haya)
export function planReciente() {
  const f = fs.readdirSync(DIR_INV).filter((x) => /^plan-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
  if (!f) return null;
  try { return { ...JSON.parse(fs.readFileSync(path.join(DIR_INV, f), "utf8")), dia: f.slice(5, 15) }; } catch { return null; }
}

// el informe más reciente de la marca (pendiente o ya convertido)
export function informeReciente(nicho = "monarca") {
  const fs_ = fs.readdirSync(INV.DIR_INFORMES).filter((f) => f.endsWith(".md")).sort().reverse();
  for (const f of fs_) { const t = fs.readFileSync(path.join(INV.DIR_INFORMES, f), "utf8"); if (new RegExp(`nicho: ${nicho}|INFORME[^\\n]*${nicho}`, "i").test(t.slice(0, 600))) return path.join(INV.DIR_INFORMES, f); }
  return fs_[0] ? path.join(INV.DIR_INFORMES, fs_[0]) : null;
}

function pedidoGuion(v, cfg) {
  const b = v.base, cierre = (cfg.cierres || [])[0] || "Envíale esto a alguien que necesita oírlo hoy.";
  const comun = `Toma la IDEA de la publicación de referencia, NO su guion ni sus frases: escríbelo original, en español natural de México, para Monarca.
Idea: ${b.idea || ""}. Frase de partida: ${b.frase || ""}. Tema: ${b.tema || ""}. ${b.adaptacion ? `Adaptación: ${b.adaptacion}.` : ""} ${b.notaAdaptacion ? `Indicación de Richie: ${b.notaAdaptacion}.` : ""}
Gancho: la primera frase se entiende sola y dura 2 segundos o menos. Títulos (subir.titulos, 3): [número o promesa concreta] + [problema real] + [autor si es de verdad].
Cierre de voz: "${cierre}" (puedes precisar el final, pero empieza con "Envíale esto a alguien que").`;
  if (v.tipo === "largo") return `${comun}\nVideo LARGO de 10 a 15 minutos derivado del Short ganador: intro con promesa, 3-5 capítulos con una idea por capítulo (campo capitulo), cierre con suscripción y siguiente video de la serie.`;
  if (v.tipo === "experimento") return `${comun}\nEXPERIMENTO de un formato que aún no llega al español (LO QUE VIENE): ${b.idea || b.frase}. Short de 20 a 30 segundos con voz en off.`;
  return `${comun}\nShort/Reel de 20 a 30 segundos: gancho con el conflicto → idea central → ejemplo de hoy → qué hacer → cierre.`;
}

export async function armarPlanDia({ archivo, nicho = "monarca", forzar = false, conIA = true, notas = {} } = {}) {
  archivo = archivo || informeReciente(nicho);
  if (!archivo || !fs.existsSync(archivo)) throw new Error("No hay ningún informe de Muse en este equipo (ni lo pude traer del otro). Los informes llegan al VPS: ábrelo ahí o revisa la conexión laptop ⇄ VPS.");
  const md = fs.readFileSync(archivo, "utf8"), cfg = INV.leerConfig(nicho);
  const mejor = INV.sugerencias(nicho, 1)[0] || null; // por si hoy no hay picos claros
  const ahora = Date.now();
  const horarios = { short: huecosLibres({ short: 4 }).short, largo: huecosLibres({ largo: 1 }, { desde: ahora + 72 * 3600e3 }).largo }; // el largo, con 3 días para producirlo
  const plan = planDelDia(md, { mejorDeLaSemana: mejor && { n: mejor.n, frase: mejor.frase, idea: mejor.idea, tema: mejor.tema, inspiradaEn: mejor.inspiradaEn }, horarios });
  plan.informe = path.basename(archivo);
  // lo que ya se escribió o creó en un plan anterior del mismo día no se pisa
  let previo = null; try { previo = JSON.parse(fs.readFileSync(fPlan(), "utf8")); } catch {}
  for (const [i, v] of plan.videos.entries()) {
    const viejo = !forzar && previo?.videos?.[i]?.base?.n === v.base.n && previo.videos[i].tipo === v.tipo ? previo.videos[i] : null;
    if (viejo) Object.assign(v, { guion: viejo.guion, creado: viejo.creado });
    v.base.notaAdaptacion = notas[v.base.n] || v.base.notaAdaptacion || "";
    v.inspiracion = (v.base.inspiradaEn || []).concat(v.base.publicacion?.link || []).filter((x, k, a) => x && a.indexOf(x) === k);
    v.flowPrompt = v.base.flowPrompt || ""; v.hashtags = v.base.hashtags || cfg.hashtags?.slice(0, 3) || [];
    v.pedido = pedidoGuion(v, cfg);
    if (!v.guion && conIA && hayIA()) {
      try { const { escribirGuion } = await import("./ia.js"); v.guion = await escribirGuion({ estilo: v.estilo, formato: v.formato, duracion: v.duracion, titulo: v.base.frase || v.base.idea, idea: v.pedido }); }
      catch (e) { v.errorGuion = e.message; }
    }
  }
  fs.writeFileSync(fPlan(), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(DIR_LISTOS, `plan-${hoyCDMX()}.md`), resumen(plan));
  return plan;
}

const voz = (g) => (g?.escenas || []).map((e) => (e.capitulo ? `\n[${e.capitulo}]\n` : "") + (e.voz || e.texto || "")).join("\n").trim();
export function resumen(plan) {
  const L = [`# Plan del día · ${plan.informe}`, "", ...plan.avisos.map((a) => `> ${a}`), ""];
  if (plan.descartadas.length) L.push("**Descartadas por riesgo de marca:** " + plan.descartadas.map((x) => `${x.cuenta || "#" + x.n} (${x.motivo})`).join("; "), "");
  L.push("**Ranking del informe (pico relativo):**", ...plan.ranking.map((x, i) => `${i + 1}. ${x.frase} · ${x.cuenta || "—"} · ${x.pico != null ? x.pico + "x" : "pico desconocido"} · ${x.motivo}`), "");
  for (const [i, v] of plan.videos.entries()) {
    const g = v.guion, s = g?.subir || {};
    L.push(`## ${i + 1}. ${v.tipo === "largo" ? "Video largo (16:9)" : v.tipo === "experimento" ? "Experimento · LO QUE VIENE (9:16)" : "Short/Reel (9:16)"}`,
      `**Por qué:** ${v.base.motivo}`, `**Horario GHL propuesto:** ${v.horario?.cuando || "sin hueco libre en 3 semanas"}`,
      `**Títulos:** ${(s.titulos || []).join(" | ") || "(pendientes)"}`, `**Gancho (≤ 2 s):** ${g?.escenas?.[0]?.voz || "(pendiente)"}`,
      `**Guion:**\n${voz(g) || "(pendiente: «escribe los guiones del plan» en Claude Code)"}`,
      `**Descripción:** ${s.descripcion || "(pendiente)"}`, `**Hashtags:** ${(s.hashtags || v.hashtags || []).map((h) => "#" + String(h).replace(/^#/, "")).join(" ")}`,
      `**flowPrompt:** ${v.flowPrompt || g?.escenas?.[0]?.flowPrompt || "—"}`, `**Inspiración:** ${v.inspiracion.join(" ") || "—"}`, "");
  }
  return L.join("\n");
}

// crea los proyectos de los videos que ya tienen guion (idempotente: los ya creados no se repiten)
export async function crearDelPlan(fecha = hoyCDMX()) {
  const f = fPlan(fecha), plan = JSON.parse(fs.readFileSync(f, "utf8")), cfg = INV.leerConfig("monarca"), hechos = [];
  const { generarMetadatos } = await import("./metadatos.js");
  for (const v of plan.videos) {
    if (v.creado && P.leer(v.creado, "proyecto.json")) { hechos.push({ id: v.creado, ya: true }); continue; }
    if (!v.guion?.escenas?.length) { hechos.push({ tipo: v.tipo, pendiente: "sin guion" }); continue; }
    const p = P.crearProyecto({ estilo: v.estilo, titulo: v.guion.titulo || v.base.frase || v.base.idea, idea: v.pedido, formato: v.formato, duracion: v.duracion, opciones: { ...(cfg.opciones?.[v.estilo] || {}) } });
    Object.assign(p, { nicho: "monarca", canal: cfg.canal || p.canal, plan: { fecha, tipo: v.tipo, informe: plan.informe }, horarioPropuesto: v.horario, inspiradaEn: v.inspiracion });
    P.guardar(p.id, "proyecto.json", p); P.guardar(p.id, "guion.json", v.guion); P.marcar(p.id, "guion", "listo");
    try { await generarMetadatos(p.id, { conIA: false }); } catch {}
    v.creado = p.id; hechos.push({ id: p.id, tipo: v.tipo });
  }
  fs.writeFileSync(f, JSON.stringify(plan, null, 2));
  return hechos;
}
