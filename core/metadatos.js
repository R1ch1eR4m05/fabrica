// Metadatos que venden (nov 2026, feedback de Muse sobre la competencia de Monarca):
// título con fórmula [número o promesa] + [problema real] + [autor], 3 opciones con puntaje explícito y la elegida en el log,
// descripción por plataforma (Short de YouTube, video largo con capítulos, Reel nativo de Facebook), 3 hashtags y CTA.
// Se genera ANTES de renderizar y el QA (core/qa.js) bloquea la programación si el título no pasa.
// Sin IA: se usan los títulos que escribe Claude Code en guion.json → subir.titulos (3) y el título del guion.
import fs from "node:fs";
import path from "node:path";
import { DIR_LISTOS } from "./config.js";
import { leer, guardar, existe } from "./proyectos.js";
import { leerCopys } from "./copy.js";
import * as INV from "./investigador.js";
import { asignarSerie, etiquetaSerie, exigeSerie, marcaDe } from "./serie.js";
import { pedir, jsonDe, hayIA } from "./llm.js";

const LOG = path.join(DIR_LISTOS, "metadatos.log.jsonl");
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const AUTORES = /\b(marco aurelio|seneca|epicteto|zenon|lao ?tse|lao ?tzu|chuang ?tzu|zhuangzi|confucio|buda|budismo|zen|tao(ismo)?|sun ?tzu|musashi|socrates|platon|aristoteles|nietzsche|estoic[oa]s?|estoicismo|catón|caton|diogenes|epicuro|alan watts|thich nhat hanh|krishnamurti)\b/;
const PROBLEMAS = /\b(preocup\w*|ansiedad|ansios\w*|estres|enojo|ira|miedo|soledad|solo|tristeza|depresi\w*|culpa|celos|envidia|pereza|procrastin\w*|opinion|critica\w*|rechazo|control\w*|dinero|deudas?|trabajo|jefe|familia|padres|pareja|ruptura|perdida|muerte|vejez|tiempo|distraccion\w*|celular|redes|atencion|disciplina|habitos?|vicios?|fracas\w*|err(or|ores)|dolor|sufr\w*|calma|paz|insomnio|sobrepensar|overthinking|ego|orgullo|traicion|amistad|amigos|respeto|limites|energia)\b/;
const PROMESA = /(\b\d+\b|\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b|\bcomo\b|\bpor que\b|\bpara (dejar|no|ser|tener|vencer|controlar|soltar|dominar|recuperar|dormir|sanar|superar|ganar|vivir|encontrar)\b|\bdeja de\b|\blecci[oó]n|\breglas?\b|\bsenales\b|\bclaves?\b|\bhabitos\b|\berrores\b|\bverdades?\b|\bque hacer\b|\blo que nadie\b|\bnunca\b|\bsecreto\b|\baprende\b|\basi se\b|\bel truco\b|\bel metodo\b|\bejercicio\b|\bpaso\b|\blo que [a-z ]{2,30} (haria|harias|diria|te diria|hacia|sabia|entendio|descubrio)\b|\bsi [a-z ]{2,30} (hiciera|supiera|viviera)\b)/;
const GENERICOS = /^(reflexion|reflexiones|frase del dia|frases?|estoicismo|motivacion|filosofia|mensaje|video|short|reel|pensamiento|sabiduria)( (del dia|de hoy|estoica|estoico|corta))?$/;

// puntaje con criterio explícito; "bloquea" = no se puede publicar con ese título
export function puntuarTitulo(t0) {
  const t = String(t0 || "").replace(/#\w+/g, "").replace(/\s+/g, " ").trim(), n = sinAcentos(t);
  const motivos = [], bloquea = []; let puntos = 0;
  if (!t) bloquea.push("vacío");
  else {
    if (/untitled|sin titulo|^(video|short|reel|nuevo video)\s*\d*$/.test(n)) bloquea.push("es «Untitled» o un nombre de archivo");
    if (t.length < 20) bloquea.push("muy corto (menos de 20 letras)");
    if (t.length > 100) bloquea.push("más de 100 letras (YouTube lo corta)");
    if (GENERICOS.test(n) || n.split(" ").length < 4) bloquea.push("genérico: no dice de qué trata");
    if (PROMESA.test(n)) { puntos += 3; motivos.push("+3 promete algo concreto"); } else bloquea.push("sin promesa concreta (suena poético)");
    if (/\b\d+\b|\b(tres|cinco|siete|diez)\b/.test(n)) { puntos += 2; motivos.push("+2 número"); }
    if (PROBLEMAS.test(n)) { puntos += 3; motivos.push("+3 problema real"); }
    if (AUTORES.test(n)) { puntos += 2; motivos.push("+2 autor o escuela"); }
    if (t.length >= 35 && t.length <= 65) { puntos += 1; motivos.push("+1 largo ideal (35-65)"); } else if (t.length > 70) { puntos -= 1; motivos.push("-1 más de 70 letras"); }
  }
  return { texto: t, puntos: bloquea.length ? -1 : puntos, ok: !bloquea.length, motivos: [...motivos, ...bloquea.map((b) => "✗ " + b)] };
}
export const CRITERIO = "Gana el título válido con más puntos: promesa concreta +3, problema real +3, número +2, autor/escuela +2, largo 35-65 +1, más de 70 -1. Empate: el más corto. Se bloquean vacíos, «Untitled», genéricos, de menos de 20 o más de 100 letras y los poéticos sin promesa.";

function candidatos(id) {
  const g = leer(id, "guion.json") || {}, p = leer(id, "proyecto.json") || {}, s = g.subir || {};
  return [...new Set([...(Array.isArray(s.titulos) ? s.titulos : []), s.titulo, g.titulo, p.titulo].map((x) => String(x || "").trim()).filter(Boolean))];
}

async function titulosIA(id, ya) {
  const g = leer(id, "guion.json") || {}, p = leer(id, "proyecto.json") || {};
  const voz = (g.escenas || []).map((e) => e.voz || e.texto).filter(Boolean).join(" ").slice(0, 1500);
  const sis = `Escribes títulos de YouTube en español de México para un canal de filosofía (estoicismo, taoísmo, filosofía oriental).
Fórmula obligatoria: [número o promesa concreta] + [problema real de la vida] + [autor: Marco Aurelio, Séneca, Epicteto, Lao Tse, Buda…].
Ejemplos del formato (no los copies): "7 lecciones del Tao para dejar de preocuparte", "Lo que Séneca haría con tu ansiedad del domingo".
Prohibido: títulos vacíos, genéricos ("Reflexión estoica"), poéticos sin promesa, clickbait que el video no cumple, más de 70 letras.
Solo menciona un autor si el guion realmente habla de él. Devuelve SOLO JSON: {"titulos":["…","…","…"]}`;
  const j = jsonDe(await pedir(sis, `Guion: ${voz}\nIdea: ${p.idea || ""}\nTítulos que ya hay (mejóralos): ${ya.join(" | ")}`));
  return (j.titulos || []).map(String).filter(Boolean);
}

// capítulos para la descripción de YouTube (0:00 al inicio, ≥ 3 capítulos de ≥ 10 s, como pide YouTube)
export function capitulosYouTube(id) {
  const g = leer(id, "guion.json") || {}, t = leer(id, "tiempos.json");
  if (!t?.escenas?.length) return [];
  const caps = [];
  (g.escenas || []).forEach((e, i) => { if (e.capitulo && t.escenas[i]) caps.push({ t: i === 0 ? 0 : t.escenas[i].ini, titulo: String(e.capitulo) }); });
  if (caps.length && caps[0].t > 0) caps.unshift({ t: 0, titulo: "Introducción" });
  const ok = caps.filter((c, i) => i === caps.length - 1 || caps[i + 1].t - c.t >= 10);
  const fmt = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
  return ok.length >= 3 ? ok.map((c) => `${fmt(c.t)} ${c.titulo}`) : [];
}

const tags = (l, n) => [...new Set(l.map((h) => "#" + sinAcentos(String(h).replace(/^#/, "")).replace(/[^a-z0-9ñ]/g, "")).filter((h) => h.length > 2))].slice(0, n);
const sinEnlacesYT = (t) => String(t).replace(/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/\S+/gi, "").replace(/\n{3,}/g, "\n\n").trim();

// genera (o regenera) metadatos.json y, si Richie no editó el copy a mano, también copys.json con lo mismo
export async function generarMetadatos(id, { conIA = true } = {}) {
  const p = leer(id, "proyecto.json"); if (!p) throw new Error("No existe ese video.");
  const g = leer(id, "guion.json") || {}, s = g.subir || {}, marca = marcaDe(p);
  const serie = exigeSerie(marca) ? asignarSerie(id) : p.serie || null;
  let opciones = candidatos(id).map(puntuarTitulo);
  if (conIA && hayIA() && opciones.filter((o) => o.ok).length < 3) {
    try { opciones.push(...(await titulosIA(id, opciones.map((o) => o.texto))).map(puntuarTitulo)); } catch (e) { console.warn("Títulos con IA:", e.message); }
  }
  const vistos = new Set(); opciones = opciones.filter((o) => o.texto && !vistos.has(sinAcentos(o.texto)) && vistos.add(sinAcentos(o.texto)));
  opciones.sort((a, b) => b.puntos - a.puntos || a.texto.length - b.texto.length);
  const tres = opciones.slice(0, 3), elegido = tres.find((o) => o.ok) || null;
  const cfg = INV.leerConfig(marca), cierre = INV.cierreValido(s.cierre, cfg) || (cfg.cierres || [])[0] || "";
  const ht = tags([...(s.hashtags || []), ...(cfg.hashtags || [])], 3);
  const largo = p.formato === "16:9" && p.duracion === "largo";
  const caps = largo ? capitulosYouTube(id) : [];
  const idea = String(s.descripcion || p.idea || "").trim();
  const enlaceLargo = p.relacionado?.url ? `▶ Video completo: ${p.relacionado.url}` : "";
  const lineaSerie = serie ? `Serie: ${etiquetaSerie(serie)}` : "";
  const ytTitulo = elegido ? (largo ? elegido.texto : (elegido.texto.length <= 90 ? `${elegido.texto} #shorts` : elegido.texto)) : "";
  const ytDesc = largo
    ? [idea, caps.length ? "Capítulos:\n" + caps.join("\n") : "", "Si esto te sirvió, suscríbete: cada semana un video largo y un Short diario.", p.siguiente?.url ? `▶ Siguiente video: ${p.siguiente.url}` : "", lineaSerie, ht.join(" ")]
    : [idea, cierre, enlaceLargo, lineaSerie, ht.join(" ")];
  // Facebook: Reel nativo con su propio título (la segunda mejor opción válida, para no ser un simple repost) y sin enlace de YouTube
  const fbTitulo = (tres.filter((o) => o.ok)[1] || elegido)?.texto || "";
  const fb = sinEnlacesYT([fbTitulo, idea, cierre, ht.join(" ")].filter(Boolean).join("\n\n"));
  const m = {
    fecha: new Date().toISOString(), criterio: CRITERIO, opciones: tres, elegido: elegido?.texto || "", serie,
    textoPantalla: String((g.escenas || [])[0]?.voz || (g.escenas || [])[0]?.texto || "").trim(),
    hashtags: ht, cierre, capitulos: caps,
    youtube: { titulo: ytTitulo, descripcion: ytDesc.filter(Boolean).join("\n\n") },
    facebook: { titulo: fbTitulo, texto: fb },
  };
  guardar(id, "metadatos.json", m);
  fs.appendFileSync(LOG, JSON.stringify({ fecha: m.fecha, id, elegido: m.elegido, serie: etiquetaSerie(serie), opciones: tres.map((o) => ({ texto: o.texto, puntos: o.puntos })) }) + "\n");
  // el copy por red sale de aquí salvo que Richie lo haya editado a mano en el panel
  const c = existe(id, "copys.json") ? leer(id, "copys.json") : null;
  if (!c?.editado && elegido) {
    const base = leerCopys(id);
    const conTitulo = (t) => (t ? [elegido.texto, ...String(t).split("\n").slice(1)].join("\n") : t); // Instagram/TikTok abren con el título elegido
    guardar(id, "copys.json", { ...base, instagram: conTitulo(base.instagram), tiktok: conTitulo(base.tiktok), facebook: fb, youtube: m.youtube, hecho: "metadatos" });
  }
  return m;
}
export const leerMetadatos = (id) => (existe(id, "metadatos.json") ? leer(id, "metadatos.json") : null);
