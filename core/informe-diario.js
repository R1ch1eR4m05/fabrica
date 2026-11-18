// Informe de la mañana → plan del día (nov 2026). Módulo separado y testeable (tests/informe-diario.test.mjs).
// El informe es la ÚNICA fuente de decisiones del día. Trae: PUBLICACIONES (top 15), PATRONES DE HOY, CUENTAS NUEVAS,
// LO QUE VIENE y PROPUESTAS_JSON ({ patrones, propuestas[] }).
// Reglas:
//  - Se puntúa por PICO RELATIVO (likes del post / likes promedio de esa cuenta), no por likes absolutos.
//  - Lo que trae riesgo de marca (partidista, polarizado, odio, "no replicar"…) se descarta aunque tenga pico alto.
//  - Prioridad: 1) ya está en español y pico comprobado · 2) en inglés, aún no llega en español, con adaptación clara ·
//    3) formato de LO QUE VIENE · 4) lo demás.
//  - "?" en vistas / guardados / compartidos = desconocido (null), nunca cero. YouTube en español sin cifras verificables
//    se marca "sin cifras verificables, no asumir viralidad".
//  - Sin picos claros (ninguno ≥ 3x comprobado) se dice y se repite el mejor formato de la semana; no se inventa un viral.
// Salida: exactamente 5 videos: 3 Shorts/Reels, 1 largo derivado del Short ganador y 1 experimento de LO QUE VIENE.

export const PICO_CLARO = 3; // veces su normal para considerar "pico comprobado"
export const SIN_CIFRAS = "sin cifras verificables, no asumir viralidad";
const RIESGO = /(partidist|pol[ií]tic[oa]s?\b|elecci[oó]n|polariz|(?<!\bsin\s)\bodio\b|racis|xen[oó]fob|machis|homof[oó]b|violen|\barmas?\b|desinformaci|conspira|antivacun|no replicar|riesgo de marca|riesgo reputacional|religi[oó]n contra|insult|ataque a|misogin)/i;

// ---------- números ----------
// "83,053" · "83.053" · "13.6K" · "1,2 M" · "?" → número o null (desconocido)
export function numero(t) {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s || /^\?+$/.test(s) || /^(n\/?d|desconocido|sin dato)/i.test(s)) return null;
  const m = s.match(/(\d[\d.,]*)\s*([kKmM])?/); if (!m) return null;
  let n = m[1];
  if (m[2]) n = Number(n.replace(",", ".")) * (/k/i.test(m[2]) ? 1e3 : 1e6);
  else if (/^\d{1,3}([.,]\d{3})+$/.test(n)) n = Number(n.replace(/[.,]/g, ""));
  else n = Number(n.replace(",", "."));
  return isFinite(n) ? Math.round(n) : null;
}
// "~32x" · "28-110x" · "50 a 250 veces" → { min, max } o null
export function multiplicador(t) {
  const s = String(t || "");
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|a)\s*(\d+(?:[.,]\d+)?)\s*(?:x|veces)/i);
  if (m) return { min: Number(m[1].replace(",", ".")), max: Number(m[2].replace(",", ".")) };
  m = s.match(/~?\s*(\d+(?:[.,]\d+)?)\s*(?:x|veces)\b/i);
  return m ? { min: Number(m[1].replace(",", ".")), max: Number(m[1].replace(",", ".")) } : null;
}

// ---------- texto ----------
// correos que pasan por n8n a veces llegan con la codificación rota ("espaÃ±ol", "â" en vez de "—"): se repara
export function arreglarCodificacion(t) {
  const s = String(t ?? "");
  if (!/[ÃÂâ][\u0080-\u00BF]/.test(s)) return s;
  return s.replace(/[\u00C2-\u00F4][\u0080-\u00BF]{1,3}/g, (m) => { const d = Buffer.from(m, "latin1").toString("utf8"); return d.includes("\uFFFD") ? m : d; });
}
// el objeto JSON que empieza en el primer "{" (respeta comillas), con los saltos de línea del correo convertidos en espacios
function objetoJSON(s) {
  const i = s.indexOf("{"); if (i < 0) return null;
  let prof = 0, enCad = false, esc = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (enCad) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') enCad = false; continue; }
    if (c === '"') enCad = true; else if (c === "{") prof++; else if (c === "}" && --prof === 0) return s.slice(i, k + 1);
  }
  return s.slice(i);
}

// ---------- secciones del informe ----------
const SECCIONES = [["publicaciones", /PUBLICACIONES/i], ["patrones", /PATRONES/i], ["cuentas", /CUENTAS NUEVAS/i], ["viene", /LO QUE VIENE/i], ["json", /PROPUESTAS[_ ]JSON/i]];
export function secciones(md) {
  const lineas = String(md).replace(/\r/g, "").split("\n"), out = {}; let actual = null;
  for (const l of lineas) {
    const t = l.replace(/[#*_=>\s]+/g, " ").trim();
    // encabezado: markdown (#, **) o una línea que empieza en MAYÚSCULAS ("PUBLICACIONES — las 15 mejores", "CUENTAS NUEVAS QUE VALE…")
    const cab = /^(#{1,6}\s|\*\*|[A-ZÁÉÍÓÚÑ_ ]{6,}$)/.test(l.trim()) || /^#/.test(l.trim()) || /^[A-ZÁÉÍÓÚÑ_]{5,}(\s+[A-ZÁÉÍÓÚÑ_]+)*\s*([—–:\-].*)?$/.test(l.trim());
    const s = cab && t.length < 80 ? SECCIONES.find(([, re]) => re.test(t)) : null;
    if (s) { actual = s[0]; out[actual] = []; continue; }
    if (actual) out[actual].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()]));
}

// bloques numerados (1. / 1) / ### 1 / **1.) de la sección de publicaciones
function bloques(txt) {
  const out = []; let cur = null;
  for (const l of String(txt || "").split("\n")) {
    if (/^\s*(#{1,6}\s*)?(\*\*)?\s*\d{1,2}\s*[.)\-–]\s+/.test(l) || /^\s*#{2,6}\s*\d{1,2}\b/.test(l)) { if (cur) out.push(cur); cur = [l]; }
    else if (cur) cur.push(l);
  }
  if (cur) out.push(cur);
  return out.map((b) => b.join("\n"));
}
const campo = (b, re) => { const m = b.match(re); return m ? m[1].trim() : null; };
const metrica = (b, nombre) => { // "Likes: 83,053" · "83,053 likes" · "guardados: ?"
  const a = b.match(new RegExp(`${nombre}\\s*[:=]?\\s*([~≈]?\\s*[\\d.,]+\\s*[kKmM]?|\\?+)`, "i"));
  const d = b.match(new RegExp(`([\\d.,]+\\s*[kKmM]?)\\s*${nombre}`, "i"));
  const raw = a ? a[1] : d ? d[1] : null;
  return { raw, valor: raw == null ? null : numero(raw.replace(/[~≈]/g, "")) };
};

export function parsearPublicaciones(txt) {
  return bloques(txt).map((b, i) => {
    const cuenta = (b.match(/@[\w.]+/) || [null])[0];
    const link = (b.match(/https?:\/\/[^\s)>\]]+/) || [null])[0];
    const likes = metrica(b, "(?:likes?|me gusta)"), coment = metrica(b, "comentarios?"), vistas = metrica(b, "(?:vistas|views|reproducciones)");
    const guard = metrica(b, "guardados?"), comp = metrica(b, "(?:compartidos?|shares?)"), seg = metrica(b, "seguidores");
    const nota = campo(b, /(?:nota|pico)[^:\n]*:\s*([^\n]+)/i) || "";
    const mult = multiplicador(nota) || multiplicador(b);
    const promedio = numero(campo(b, /promedio[^\d?\n]{0,40}([\d.,]+\s*[kKmM]?)/i));
    const esYT = /youtu\.?be/i.test(link || "") || /youtube/i.test(b);
    const enEspanol = /espa[nñ]ol|\b(es)\b/i.test(campo(b, /(?:idioma|lengua)\s*[:=]\s*([^\n]+)/i) || "") || /youtube\s+en\s+espa[nñ]ol/i.test(b);
    return {
      orden: i + 1, cuenta, link, texto: b.trim(),
      seguidores: seg.valor, likes: likes.valor, comentarios: coment.valor,
      vistas: vistas.raw && /\?/.test(vistas.raw) ? null : vistas.valor, guardados: guard.raw && /\?/.test(guard.raw) ? null : guard.valor, compartidos: comp.raw && /\?/.test(comp.raw) ? null : comp.valor,
      desconocidos: ["vistas", "guardados", "compartidos"].filter((k) => ({ vistas, guardados: guard, compartidos: comp })[k].raw?.includes("?")),
      fecha: campo(b, /fecha\s*[:=]\s*([^\n|]+)/i), idea: campo(b, /idea(?: central)?\s*[:=]\s*([^\n]+)/i), seVe: campo(b, /qu[eé] se ve\s*[:=]\s*([^\n]+)/i), cta: campo(b, /CTA\s*[:=]\s*([^\n]+)/i),
      nota, multiplicador: mult, promedio, youtube: esYT,
      riesgo: RIESGO.test(b) ? (b.match(RIESGO) || [""])[0] : null,
      sinCifras: esYT && (enEspanol || /no verificable|sin cifras/i.test(b)) && !(likes.valor || vistas.valor) ? SIN_CIFRAS : null,
    };
  });
}

// pico relativo: likes / promedio de la cuenta. Si la nota trae "Nx", se usa (rango = el mínimo, conservador).
// Otras publicaciones de la misma cuenta heredan su promedio (likes/pico) para calcular el suyo.
export function calcularPicos(pubs) {
  const promedioCuenta = new Map();
  for (const p of pubs) {
    if (p.likes && p.promedio) p.pico = +(p.likes / p.promedio).toFixed(1), p.picoFuente = "likes/promedio";
    else if (p.multiplicador) p.pico = p.multiplicador.min, p.picoFuente = p.multiplicador.max !== p.multiplicador.min ? `informe (${p.multiplicador.min}-${p.multiplicador.max}x, se usa el mínimo)` : "informe";
    else p.pico = null;
    if (p.pico && p.likes && p.cuenta && !promedioCuenta.has(p.cuenta)) promedioCuenta.set(p.cuenta, p.likes / p.pico);
  }
  for (const p of pubs) if (p.pico == null && p.likes && promedioCuenta.has(p.cuenta)) { p.pico = +(p.likes / promedioCuenta.get(p.cuenta)).toFixed(1); p.picoFuente = "derivado del promedio de la cuenta"; }
  if (pubs.some((p) => p.sinCifras)) for (const p of pubs) if (p.sinCifras) { p.pico = null; p.picoFuente = SIN_CIFRAS; }
  return pubs;
}

export function propuestasJSON(txt) {
  const s = arreglarCodificacion(txt || ""), m = s.match(/```(?:json)?\s*([\s\S]*?)```/), crudo = m ? m[1] : objetoJSON(s);
  if (!crudo) return { patrones: [], propuestas: [] };
  // el correo corta las líneas largas a ~75 caracteres, incluso dentro de las cadenas: los saltos se vuelven espacios
  for (const intento of [crudo, crudo.replace(/\r?\n/g, " ")]) {
    try { const j = JSON.parse(intento); return { patrones: j.patrones || [], propuestas: (j.propuestas || []).map((p, i) => ({ n: p.n || i + 1, ...p })) }; } catch {}
  }
  return { patrones: [], propuestas: [], error: "PROPUESTAS_JSON no se pudo leer" };
}
const lista = (txt) => String(txt || "").split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, "").trim()).filter((l) => l && !/^#/.test(l));

export function parsearInforme(md) {
  md = arreglarCodificacion(md);
  const s = secciones(md), j = propuestasJSON(s.json || md);
  const pubs = calcularPicos(parsearPublicaciones(s.publicaciones));
  return {
    publicaciones: pubs, patrones: j.patrones.length ? j.patrones : lista(s.patrones).slice(0, 8),
    cuentasNuevas: lista(s.cuentas).map((l) => ({ cuenta: (l.match(/@[\w.]+/) || [null])[0], nota: l })).filter((x) => x.cuenta),
    loQueViene: lista(s.viene).slice(0, 3), propuestas: j.propuestas,
  };
}

// ---------- selección ----------
const norm = (u) => String(u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
const llegada = (p) => String(p.llegada || "").toLowerCase();

// enlaza cada propuesta con su publicación (por link o por @cuenta) y calcula nivel, pico y riesgo
export function evaluar(inf) {
  return inf.propuestas.map((p) => {
    const refs = (p.inspiradaEn || []).map(norm);
    const pub = inf.publicaciones.find((x) => x.link && refs.includes(norm(x.link)))
      || inf.publicaciones.find((x) => x.cuenta && JSON.stringify(p).toLowerCase().includes(x.cuenta.toLowerCase()));
    const texto = JSON.stringify(p);
    const riesgo = pub?.riesgo || (RIESGO.test(texto) ? (texto.match(RIESGO) || [""])[0] : null);
    const pico = pub?.pico ?? null, comprobado = pico != null && pico >= PICO_CLARO;
    const esViene = /lo que viene/i.test(texto) || inf.loQueViene.some((v) => v && texto.toLowerCase().includes(v.toLowerCase().slice(0, 25)));
    const enEsp = /ya est[aá] en espa[nñ]ol/.test(llegada(p)) || p.origen === "es";
    const noLlega = /a[uú]n no llega|poco en espa[nñ]ol/.test(llegada(p)) && /en|ambos/.test(String(p.origen || "en"));
    const nivel = riesgo ? 9 : enEsp && comprobado ? 1 : noLlega && String(p.adaptacion || "").trim().length > 10 ? 2 : esViene ? 3 : 4;
    const motivo = riesgo ? `descartada: riesgo de marca («${riesgo}») aunque tenga ${pico ? pico + "x" : "pico"}`
      : nivel === 1 ? `ya está en español y es pico comprobado (${pico}x su normal)` : nivel === 2 ? "en inglés, aún no llega al español y la adaptación es clara"
      : nivel === 3 ? "formato de LO QUE VIENE" : pub?.sinCifras ? SIN_CIFRAS : pico == null ? "pico desconocido" : `pico ${pico}x (por debajo de ${PICO_CLARO}x)`;
    return { ...p, loQueViene: esViene, publicacion: pub ? { cuenta: pub.cuenta, link: pub.link, likes: pub.likes, pico, picoFuente: pub.picoFuente, desconocidos: pub.desconocidos } : null, pico, nivel, riesgo, motivo };
  });
}
export const ordenar = (ev) => [...ev].sort((a, b) => a.nivel - b.nivel || (b.pico ?? -1) - (a.pico ?? -1) || (b.publicacion?.likes ?? -1) - (a.publicacion?.likes ?? -1));

// 5 videos: 3 Shorts, 1 largo (del Short ganador), 1 experimento de LO QUE VIENE
export function planDelDia(md, { mejorDeLaSemana = null, horarios = null } = {}) {
  const inf = parsearInforme(md), ev = ordenar(evaluar(inf));
  const descartadas = ev.filter((x) => x.riesgo), sanas = ev.filter((x) => !x.riesgo);
  const hayPicos = inf.publicaciones.some((p) => p.pico != null && p.pico >= PICO_CLARO && !p.riesgo);
  const avisos = [];
  if (!hayPicos) avisos.push(`Hoy no hay picos claros (ninguna publicación sana ≥ ${PICO_CLARO}x su normal comprobado). Se repite el mejor formato de la semana; no se inventa un viral.`);
  const desconocidos = inf.publicaciones.filter((p) => p.desconocidos.length).map((p) => `${p.cuenta || p.link}: ${p.desconocidos.join(", ")} = desconocido`);
  if (desconocidos.length) avisos.push(`Cifras con "?" tratadas como desconocidas (no cero): ${desconocidos.join("; ")}.`);
  const sinCif = inf.publicaciones.filter((p) => p.sinCifras).map((p) => p.cuenta || p.link);
  if (sinCif.length) avisos.push(`${sinCif.join(", ")}: ${SIN_CIFRAS}.`);

  // experimento: la mejor propuesta que sea un formato de LO QUE VIENE (aunque también califique como nivel 2)
  const experimento = sanas.find((x) => x.loQueViene) || (inf.loQueViene[0] ? { idea: inf.loQueViene[0], tema: "LO QUE VIENE", motivo: "formato de LO QUE VIENE (sin propuesta en el JSON)", nivel: 3 } : null);
  let cortos = sanas.filter((x) => x !== experimento && x.nivel <= 2);
  if (cortos.length < 3) cortos = [...cortos, ...sanas.filter((x) => x !== experimento && !cortos.includes(x))];
  if (!hayPicos && mejorDeLaSemana) cortos = [{ ...mejorDeLaSemana, motivo: "repetición del mejor formato de la semana (hoy no hay picos claros)", nivel: 5 }, ...cortos];
  cortos = cortos.slice(0, 3);
  const ganador = cortos[0] || null;
  const largo = ganador ? { ...ganador, motivo: `video largo derivado del Short ganador (${ganador.frase || ganador.idea || ganador.tema})` } : null;

  const videos = [
    ...cortos.map((x, i) => ({ tipo: "short", estilo: "reflexion-estatuas", formato: "9:16", duracion: "corto", base: x, horario: horarios?.short?.[i] || null })),
    ...(largo ? [{ tipo: "largo", estilo: "filosofia-larga", formato: "16:9", duracion: "largo", base: largo, horario: horarios?.largo?.[0] || null }] : []),
    ...(experimento ? [{ tipo: "experimento", estilo: "reflexion-estatuas", formato: "9:16", duracion: "corto", base: experimento, horario: horarios?.short?.[3] || null }] : []),
  ];
  return { fecha: new Date().toISOString(), avisos, patrones: inf.patrones, loQueViene: inf.loQueViene, cuentasNuevas: inf.cuentasNuevas,
    ranking: ev.map((x) => ({ n: x.n, frase: x.frase || x.idea, cuenta: x.publicacion?.cuenta || null, pico: x.pico, nivel: x.nivel, motivo: x.motivo })),
    descartadas: descartadas.map((x) => ({ n: x.n, frase: x.frase || x.idea, cuenta: x.publicacion?.cuenta || null, motivo: x.motivo })), videos };
}
