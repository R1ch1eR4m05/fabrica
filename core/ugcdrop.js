// Anuncios UGC por combinaciones (estilo UGCdrop): escenas ya generadas (gancho → demo → niños → cierre)
// + texto de gancho + cierre con CTA → MP4 terminado 9:16, sin editar. Datos en ugcdrop/, salida en listos/anuncios-ugc/.
//   armarLote(5)                     5 anuncios nuevos (nunca repite: registro en listos/anuncios-ugc/registro.json)
//   elegirLote(datos, n, opciones)   solo decide qué armar (estilo, tema, combos)
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, RAIZ, DIR_LISTOS } from "./config.js";

const DIR_DATOS = path.join(RAIZ, "ugcdrop");
export const DIR_SALIDA = path.join(DIR_LISTOS, "anuncios-ugc");
const REGISTRO = path.join(DIR_SALIDA, "registro.json");
const DIR_CACHE = path.join(RAIZ, "cache", "ugcdrop", "escenas");
const DIR_PROPIAS = path.join(DIR_DATOS, "escenas"); // aquí puedes soltar escenas a mano: "U01 algo.mp4"
const DIR_TMP = path.join(RAIZ, "cache", "ugcdrop", "tmp");
const EXT = /\.(mp4|mov|m4v|webm)$/i;

export const TEMAS = ["manana", "noche", "tarea", "escuela", "comida", "orden", "hermanos", "casa", "reto", "general"];

// ---------------- datos ----------------
const OPCIONES_BASE = {"video": {"ancho": 1080, "alto": 1920, "fps": 30, "crf": 20, "preset": "veryfast"}, "escenas": {"recorte_inicio_seg": 0.15, "max_seg_por_escena": null, "max_seg_gancho": null}, "texto_gancho": {"segundos": 3.2, "fuente": "estilos/_comun/fuentes/Montserrat-ExtraBold.ttf", "tamano": 64, "color": "#FFFFFF", "fondo": "#C4837A", "posicion_y": 0.17, "max_letras_por_linea": 22}, "cierre": {"segundos": 2.6, "fondo": "#F5EDE3", "color_titulo": "#3B2F2A", "color_cta": "#FFFFFF", "fondo_cta": "#C4837A", "acento": "#8FA68E", "fuente_titulo": "estilos/_comun/fuentes/Montserrat-ExtraBold.ttf", "fuente_texto": "estilos/_comun/fuentes/Montserrat-SemiBold.ttf", "imagen_producto": "ugcdrop/producto.png"}, "etiqueta_ia": {"mostrar": false, "tamano": 30}, "musica": {"usar": true, "carpetas": ["musica/anuncios-ugc", "musica/nichos/levania"], "volumen": 0.12}, "mezcla_lote": {"porcentaje_realista": 70}, "final": {"modo": "rotar", "texto": ""}, "revision_audio": {"usar": true, "idioma": "spa"}};
const mezclar = (a, b) => {
  const r = { ...a };
  for (const [k, v] of Object.entries(b || {})) r[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? mezclar(a[k], v) : v;
  return r;
};
const leerJSON = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : def);
function leerTSV(f) {
  const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const cab = lineas.shift().split("\t");
  return lineas.map((l) => { const c = l.split("\t"); return Object.fromEntries(cab.map((k, i) => [k, (c[i] || "").trim()])); });
}

export function cargar() {
  // ugcdrop/opciones.json (no "ajustes.json": ese nombre lo ignora .gitignore). Si falta algo, van los valores de fábrica.
  const ajustes = mezclar(OPCIONES_BASE, leerJSON(path.join(DIR_DATOS, "opciones.json"), {}));
  const { escenas } = leerJSON(path.join(DIR_DATOS, "escenas.json"));
  const porCodigo = Object.fromEntries(escenas.map((e) => [e.codigo, e]));
  const textos = leerJSON(path.join(DIR_DATOS, "textos.json"));
  const combos = [
    ...leerTSV(path.join(DIR_DATOS, "combinaciones_animadas.tsv")).map((f) => ({ id: f.id, estilo: "animado", angulo: f.angulo, escenas: f.escenas.split(/\s+/), textoBase: f.texto_gancho })),
    ...leerTSV(path.join(DIR_DATOS, "combinaciones_ugc.tsv")).map((f) => ({ id: f.id, estilo: "realista", escenas: f.escenas.split(/\s+/) })),
  ];
  for (const c of combos) for (const e of c.escenas) if (!porCodigo[e]) throw new Error(`La combinación ${c.id} usa la escena ${e}, que no está en ugcdrop/escenas.json`);
  return { ajustes, escenas, porCodigo, textos, combos, registro: leerJSON(REGISTRO, null) || { entregados: leerJSON(path.join(DIR_DATOS, "registro-inicial.json"), { entregados: [] }).entregados } };
}

function guardarRegistro(reg) {
  fs.mkdirSync(DIR_SALIDA, { recursive: true });
  fs.writeFileSync(REGISTRO, JSON.stringify(reg, null, 1));
}

// escenas bloqueadas solas por la revisión de audio (no están en español), por compu
const ARCH_BLOQ = path.join(DIR_SALIDA, "bloqueadas-audio.json");
const BLOQ_AUTO = () => leerJSON(ARCH_BLOQ, {});
function bloquearAuto(codigo, motivo) {
  const b = BLOQ_AUTO(); b[codigo] = motivo;
  fs.mkdirSync(DIR_SALIDA, { recursive: true }); fs.writeFileSync(ARCH_BLOQ, JSON.stringify(b, null, 1));
}

// ---------------- qué armar ----------------
const sinEmoji = (t) => t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
const temaDe = (c, pc) => c.escenas.map((x) => pc[x].tema).find((t) => t && t !== "general") || "general";
// ángulo del anuncio: el de la escena más "especial" (objeción, papá, reacción…); si ninguna trae, el del gancho; si no, clásico
export const ANGULOS = ["dolor", "objecion", "papa", "reaccion", "nino", "clasico"];
const PRIORIDAD_ANGULO = ["papa", "objecion", "reaccion", "nino", "dolor"];
export const anguloDe = (c, pc) => PRIORIDAD_ANGULO.find((a) => c.escenas.some((x) => pc[x]?.angulo === a)) || "clasico";
// una misma persona en todo el anuncio: nunca dos papás distintos (o dos actores con distinto "persona")
const personasOk = (esc, pc) => new Set(esc.map((x) => pc[x]?.persona).filter(Boolean)).size <= 1;

function textosGancho(c, pc, textos) {
  const l = [];
  if (c.textoBase) l.push(c.textoBase);
  l.push(...(textos.ganchos_por_escena[c.escenas[0]] || []));
  if (!l.length) l.push(pc[c.escenas[0]].titulo);
  return [...new Set(l.map(sinEmoji))];
}

// combinaciones automáticas por tema (realistas): gancho del tema → niños del tema → cierre del tema o general
export function generarAutomaticas(escenas, existentes) {
  const ya = new Set(existentes.map((c) => c.escenas.join(" ")));
  const real = escenas.filter((e) => e.estilo === "realista" && !e.bloqueada && !e.solo_curadas && !BLOQ_AUTO()[e.codigo]);
  const pc = Object.fromEntries(escenas.map((e) => [e.codigo, e]));
  const nuevas = [];
  let n = 1;
  for (const tema of [...new Set(real.map((e) => e.tema).filter((t) => t !== "general"))]) {
    for (const g of real.filter((e) => e.tipo === "gancho" && e.tema === tema))
      for (const k of real.filter((e) => e.tipo === "ninos" && e.tema === tema))
        for (const c of real.filter((e) => e.tipo === "cierre" && (e.tema === tema || e.tema === "general"))) {
          // versión corta (gancho → niños → cierre) y, si hay, versión con demo del tema (gancho → demo → niños → cierre)
          const demos = real.filter((e) => e.tipo === "demo" && (e.tema === tema || e.tema === "general"));
          const d = demos.length ? demos[n % demos.length] : null;
          // con gancho de dolor, además la versión que responde la objeción (si hay escena de objeción)
          const obj = g.angulo === "dolor" ? real.filter((e) => e.angulo === "objecion") : [];
          if (obj.length) {
            const esc = [g.codigo, obj[n % obj.length].codigo, k.codigo, c.codigo];
            if (!ya.has(esc.join(" ")) && personasOk(esc, pc)) { ya.add(esc.join(" ")); n++; nuevas.push({ id: "AU-" + esc.join("-"), estilo: "realista", escenas: esc, automatica: true }); }
          }
          for (const esc of [[g.codigo, k.codigo, c.codigo], d ? [g.codigo, d.codigo, k.codigo, c.codigo] : null]) {
            if (!esc || ya.has(esc.join(" ")) || !personasOk(esc, pc)) continue;
            ya.add(esc.join(" "));
            n++;
            nuevas.push({ id: "AU-" + esc.join("-"), estilo: "realista", escenas: esc, automatica: true }); // id estable: no cambia al agregar escenas
          }
        }
  }
  return nuevas;
}

function barajar(a, semilla = Date.now()) {
  let s = semilla % 2147483647;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function elegirLote(datos, n, op = {}) {
  const { porCodigo: pc, textos, registro, ajustes } = datos;
  let combos = [...datos.combos];
  if (op.automaticas !== false) combos = combos.concat(generarAutomaticas(datos.escenas, combos));
  if (op.disponibles) combos = combos.filter((c) => c.escenas.every((x) => op.disponibles.has(x)));
  if (op.excluir?.size) combos = combos.filter((c) => !op.excluir.has(c.id));
  if (op.combos?.length) combos = combos.filter((c) => op.combos.includes(c.id));
  if (op.estilo) combos = combos.filter((c) => c.estilo === op.estilo);
  if (op.tema) combos = combos.filter((c) => temaDe(c, pc) === op.tema);
  if (op.angulo) combos = combos.filter((c) => anguloDe(c, pc) === op.angulo);

  const usados = {};
  for (const e of registro.entregados) usados[e.combo] = (usados[e.combo] || 0) + 1;
  const cand = [];
  for (const c of combos) {
    const vs = textosGancho(c, pc, textos), v = usados[c.id] || 0;
    if (v < vs.length) cand.push({ combo: c, variante: v, texto: vs[v], tema: temaDe(c, pc), angulo: anguloDe(c, pc), curada: !c.automatica });
  }
  barajar(cand, op.semilla);
  cand.sort((a, b) => a.variante - b.variante || b.curada - a.curada); // nuevas curadas → nuevas automáticas → otro texto de gancho

  const metaReal = op.estilo ? n : Math.round((n * ajustes.mezcla_lote.porcentaje_realista) / 100);
  const elegidos = [], ganchos = new Set(), temas = {}, angulos = {};
  const tope = Math.max(1, Math.ceil(n / 4));
  const tomar = (filtro, limite, libre = false) => {
    for (const x of cand) {
      if (elegidos.length >= limite) break;
      if (elegidos.includes(x) || !filtro(x)) continue;
      if (!libre && (ganchos.has(x.combo.escenas[0]) || (temas[x.tema] || 0) >= tope || (x.combo.estilo === "realista" && (angulos[x.angulo] || 0) >= tope))) continue; // variedad dentro del lote (tema y ángulo)
      elegidos.push(x); ganchos.add(x.combo.escenas[0]); temas[x.tema] = (temas[x.tema] || 0) + 1; if (x.combo.estilo === "realista") angulos[x.angulo] = (angulos[x.angulo] || 0) + 1;
    }
  };
  tomar((x) => x.combo.estilo === "realista", metaReal);
  tomar((x) => x.combo.estilo === "animado", n);
  tomar(() => true, n);
  tomar(() => true, n, true);

  let iTit = registro.entregados.length;
  // final del video: el que pidan en el lote, si no el de opciones.json
  const final = { ...ajustes.final, ...(op.final || {}) };
  if (final.modo === "texto" && !String(final.texto || "").trim()) final.modo = "marca";
  return elegidos.map((x) => {
    const copys = textos.copy_por_tema[x.tema] || textos.copy_por_tema.general;
    return {
      id: `${x.combo.id}-v${x.variante + 1}`, combo: x.combo.id, variante: x.variante + 1, estilo: x.combo.estilo, tema: x.tema, angulo: x.angulo,
      escenas: x.combo.escenas, textoGancho: x.texto,
      copy: copys[x.variante % copys.length], titular: textos.titulares[iTit++ % textos.titulares.length],
      cta: final.modo === "texto" ? final.texto : final.modo === "rotar" ? textos.cierre.ctas[x.variante % textos.cierre.ctas.length] : "",
      final,
    };
  });
}

export function contar(datos = cargar()) {
  const todos = datos.combos.concat(generarAutomaticas(datos.escenas, datos.combos));
  const posibles = todos.reduce((s, c) => s + textosGancho(c, datos.porCodigo, datos.textos).length, 0);
  const e = datos.registro.entregados;
  const por = (s) => e.filter((x) => x.estado === s).length;
  const rev = revisarEscenas();
  const disp = new Set(rev.filter((e) => e.donde).map((e) => e.codigo));
  const armables = todos.filter((c) => c.escenas.every((x) => disp.has(x))).reduce((s2, c) => s2 + textosGancho(c, datos.porCodigo, datos.textos).length, 0);
  const porDonde = {};
  for (const e of rev) porDonde[e.donde || "falta"] = (porDonde[e.donde || "falta"] || 0) + 1;
  return { curadas: datos.combos.length, automaticas: todos.length - datos.combos.length, posibles, armables, escenas: { total: rev.length, porDonde, faltan: rev.filter((e) => !e.donde).map((e) => e.codigo) }, drive: process.env.LEVANIA_DRIVE || "", entregados: e.length, publicados: por("publicado"), ganadores: e.filter((x) => x.estado === "ganador").map((x) => x.id), quedan: posibles - e.length };
}

export function marcar(id, estado) {
  const ok = ["entregado", "publicado", "ganador", "descartado"];
  if (!ok.includes(estado)) throw new Error("El estado debe ser: " + ok.join(", "));
  const d = cargar(), x = d.registro.entregados.find((a) => a.id === id);
  if (!x) throw new Error(`No encontré ${id} en el registro.`);
  x.estado = estado; guardarRegistro(d.registro);
  return x;
}

// ---------------- escenas: carpeta propia → caché → Drive → descarga ----------------
function buscarPorCodigo(dir, codigo) {
  if (!dir || !fs.existsSync(dir)) return null;
  const re = new RegExp("^" + codigo + "([\\s_\\-.·]|$)", "i");
  const f = fs.readdirSync(dir).find((n) => EXT.test(n) && re.test(n));
  return f ? path.join(dir, f) : null;
}

// nombre exacto de Drive, o el mismo sin acentos/mayúsculas (Drive en Windows a veces cambia la forma de los acentos)
const normal = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function buscarEnDrive(e) {
  const drive = process.env.LEVANIA_DRIVE;
  if (!drive || !e.archivo) return null;
  const ruta = path.join(drive, e.archivo), dir = path.dirname(ruta);
  if (EXT.test(ruta)) {
    if (fs.existsSync(ruta)) return ruta;
    if (fs.existsSync(dir)) { const n = normal(path.basename(ruta)); const f = fs.readdirSync(dir).find((x) => normal(x) === n); if (f) return path.join(dir, f); }
  }
  return buscarPorCodigo(dir, e.codigo); // realistas: "…/08 UGC realista ninos/N01" → busca "N01 …" en esa carpeta
}

export async function resolverEscena(e) {
  const local = buscarPorCodigo(DIR_PROPIAS, e.codigo) || buscarPorCodigo(DIR_CACHE, e.codigo);
  if (local) return local;
  const enDrive = buscarEnDrive(e);
  if (enDrive) return enDrive;
  if (e.url) {
    fs.mkdirSync(DIR_CACHE, { recursive: true });
    const res = await fetch(e.url).catch(() => null);
    if (!res?.ok) throw new Error(`No se pudo bajar ${e.codigo} de Higgsfield (${res ? res.status : "sin conexión"}). Ponla a mano en ugcdrop/escenas/.`);
    const f = path.join(DIR_CACHE, `${e.codigo}.mp4`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    return f;
  }
  throw new Error(`Falta la escena ${e.codigo} (${e.titulo}). Ponla en ugcdrop/escenas/ como "${e.codigo} ….mp4" o pon LEVANIA_DRIVE en el .env.`);
}

// ---------------- revisión de audio (ElevenLabs Speech to Text, una vez por escena) ----------------
// Detecta el idioma (bloquea las que no estén en español) y dónde empieza y termina la voz, para no cortar frases.
const DIR_AUDIO = path.join(RAIZ, "cache", "ugcdrop", "audio");
export async function revisarAudio(e, archivo, aj) {
  const cache = path.join(DIR_AUDIO, `${e.codigo}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  if (!aj.revision_audio?.usar || !CFG.elevenKey) return null;
  fs.mkdirSync(DIR_AUDIO, { recursive: true });
  const mp3 = path.join(DIR_AUDIO, `${e.codigo}.mp3`);
  try {
    await correr(CFG.ffmpeg, ["-y", "-loglevel", "error", "-i", archivo, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3]);
  } catch { return null; } // sin pista de audio
  try {
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("file", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), "escena.mp3");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": CFG.elevenKey }, body: fd, signal: AbortSignal.timeout(120000) });
    if (!r.ok) return null;
    const j = await r.json();
    const pal = (j.words || []).filter((w) => w.type === "word" && String(w.text).trim());
    const info = { idioma: j.language_code || "", prob: j.language_probability ?? null, texto: (j.text || "").trim(),
      inicio: pal.length ? +pal[0].start : null, fin: pal.length ? +pal[pal.length - 1].end : null, fecha: new Date().toISOString() };
    fs.writeFileSync(cache, JSON.stringify(info, null, 1));
    const quiere = aj.revision_audio.idioma || "spa";
    if (info.texto && info.idioma && info.idioma !== quiere && (info.prob ?? 1) >= 0.6)
      bloquearAuto(e.codigo, `Habla en otro idioma (${info.idioma}): «${info.texto.slice(0, 80)}»`);
    return info;
  } catch { return null; } finally { fs.rmSync(mp3, { force: true }); }
}

// revisa el audio de todas las escenas disponibles (para hacerlo antes del primer lote)
export async function revisarAudioTodas(avisar = () => {}) {
  if (!CFG.elevenKey) throw new Error("Falta ELEVENLABS_API_KEY en el .env para revisar el audio.");
  const d = cargar(), lista = revisarEscenas().filter((e) => e.donde);
  const res = { revisadas: 0, otroIdioma: [], sinVoz: [] };
  for (const [i, e] of lista.entries()) {
    avisar({ progreso: i / lista.length, msg: `Escuchando ${e.codigo} (${i + 1} de ${lista.length})…` });
    try {
      const info = await revisarAudio(d.porCodigo[e.codigo], await resolverEscena(d.porCodigo[e.codigo]), d.ajustes);
      res.revisadas++;
      if (BLOQ_AUTO()[e.codigo]) res.otroIdioma.push(`${e.codigo}: ${BLOQ_AUTO()[e.codigo]}`);
      else if (info && !info.texto) res.sinVoz.push(e.codigo);
    } catch {}
  }
  return res;
}

// qué escenas ya se encuentran (sin descargar): para revisar antes del primer lote
export function revisarEscenas() {
  const { escenas } = cargar();
  return escenas.map((e) => {
    const auto = BLOQ_AUTO()[e.codigo];
    if (e.bloqueada || auto) return { codigo: e.codigo, titulo: e.titulo, estilo: e.estilo, donde: null, bloqueada: e.bloqueada || auto };
    let donde = buscarPorCodigo(DIR_PROPIAS, e.codigo) ? "ugcdrop/escenas" : buscarPorCodigo(DIR_CACHE, e.codigo) ? "caché" : buscarEnDrive(e) ? "Drive" : null;
    if (!donde && e.url) donde = "se baja de Higgsfield";
    return { codigo: e.codigo, titulo: e.titulo, estilo: e.estilo, donde };
  });
}

// ---------------- render con ffmpeg ----------------
function correr(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] }); // cwd = raíz: rutas relativas en los filtros (sin "C:")
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${path.basename(bin)} falló: ${err.slice(-700)}`))));
  });
}

async function sonda(f) {
  const j = JSON.parse(await correr(CFG.ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", f]));
  return { duracion: parseFloat(j.format.duration), audio: (j.streams || []).some((s) => s.codec_type === "audio") };
}

function partir(t, max) {
  const l = []; let a = "";
  for (const p of t.split(" ")) { if ((a + " " + p).trim().length > max && a) { l.push(a); a = p; } else a = (a + " " + p).trim(); }
  if (a) l.push(a);
  return l;
}
const hex = (c) => "0x" + c.replace("#", "");
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join("/");

function capasTexto(tmp, clave, lineas, o) {
  const alto = Math.round(o.tamano * 1.42), y0 = Math.round(o.y - (lineas.length * alto) / 2);
  return lineas.map((l, i) => {
    const tf = path.join(tmp, `${clave}_${i}.txt`);
    fs.writeFileSync(tf, l, "utf8");
    return `drawtext=fontfile=${o.fuente}:textfile=${rel(tf)}:expansion=none:fontsize=${o.tamano}:fontcolor=${hex(o.color)}` +
      (o.fondo ? `:box=1:boxcolor=${hex(o.fondo)}:boxborderw=${Math.round(o.tamano * 0.32)}` : "") +
      `:x=(w-text_w)/2:y=${y0 + i * alto}` + (o.enable ? `:enable='${o.enable}'` : "");
  });
}

function elegirMusica(aj) {
  if (!aj.musica.usar) return null;
  for (const c of aj.musica.carpetas) {
    const dir = path.join(RAIZ, c);
    if (!fs.existsSync(dir)) continue;
    const p = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|wav|aac|ogg)$/i.test(f));
    if (p.length) return path.join(dir, p[Math.floor(Math.random() * p.length)]);
  }
  return null;
}

export async function renderAnuncio(a, archivos, salida, datos, audios = []) {
  const { ajustes: aj, textos } = datos;
  const { ancho: W, alto: H, fps } = aj.video;
  const tmp = path.join(DIR_TMP, a.id);
  fs.mkdirSync(tmp, { recursive: true });
  const args = ["-y", "-hide_banner", "-loglevel", "error"], f = [], partes = [];
  let total = 0, nIn = 0;

  // 1. escenas: recorte, 9:16, fps y audio parejos
  for (const [i, arch] of archivos.entries()) {
    const s = await sonda(arch);
    const esc = datos?.porCodigo?.[a.escenas[i]] || {};
    const voz = audios?.[i] || null;
    // inicio: "desde" de la escena, o un recorte chico que nunca se come la primera palabra
    let ini = esc.desde != null ? esc.desde : aj.escenas.recorte_inicio_seg;
    if (esc.desde == null && voz?.inicio != null) ini = Math.min(ini, Math.max(0, voz.inicio - 0.1));
    ini = Math.min(ini, Math.max(0, s.duracion - 1));
    // fin: 0.45 s después de la última palabra (sin cortar frases); tope opcional de opciones.json
    let fin = s.duracion - 0.05;
    if (voz?.fin != null && voz.fin > ini) fin = Math.min(fin, voz.fin + 0.45);
    const tope = i === 0 ? aj.escenas.max_seg_gancho : aj.escenas.max_seg_por_escena;
    if (tope && !(voz?.fin > ini + tope)) fin = Math.min(fin, ini + tope); // el tope nunca corta la voz
    const dur = Math.max(0.5, fin - ini);
    total += dur;
    args.push("-ss", ini.toFixed(2), "-t", dur.toFixed(2), "-i", arch); nIn++;
    f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p[v${i}]`);
    f.push(s.audio ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${dur.toFixed(2)}[a${i}]` : `anullsrc=r=48000:cl=stereo,atrim=0:${dur.toFixed(2)}[a${i}]`);
    partes.push(`[v${i}][a${i}]`);
  }

  // 2. cierre: con CTA (rotar o texto propio), solo marca, o sin cierre
  const modoFinal = a.final?.modo || "rotar";
  if (modoFinal !== "ninguno") {
    const c = aj.cierre, iC = nIn++;
    args.push("-f", "lavfi", "-t", String(c.segundos), "-i", `color=c=${hex(c.fondo)}:s=${W}x${H}:r=${fps}`);
    const img = path.join(RAIZ, c.imagen_producto);
    const conImg = fs.existsSync(img);
    let iImg = null;
    if (conImg) { iImg = nIn++; args.push("-loop", "1", "-t", String(c.segundos), "-i", rel(img)); }
    const titulos = [
      ...capasTexto(tmp, "tit", [textos.cierre.titulo], { fuente: c.fuente_titulo, tamano: 78, color: c.color_titulo, y: conImg ? H * 0.15 : H * 0.36 }),
      ...capasTexto(tmp, "sub", [textos.cierre.subtitulo], { fuente: c.fuente_texto, tamano: 44, color: c.acento, y: conImg ? H * 0.21 : H * 0.43 }),
    ];
    const cta = a.cta ? capasTexto(tmp, "cta", partir(a.cta, 24), { fuente: c.fuente_titulo, tamano: 56, color: c.color_cta, fondo: c.fondo_cta, y: H * 0.84 }) : [];
    f.push(`[${iC}:v]format=yuv420p,${titulos.join(",")}[vcb]`);
    if (conImg) {
      f.push(`[${iImg}:v]scale=${Math.round(W * 0.76)}:${Math.round(H * 0.5)}:force_original_aspect_ratio=decrease,format=rgba[prod]`);
      f.push(`[vcb][prod]overlay=(W-w)/2:${Math.round(H * 0.52)}-h/2:shortest=1[vci]`);
    } else f.push(`[vcb]null[vci]`);
    f.push(`[vci]${cta.length ? cta.join(",") + "," : ""}fade=t=in:st=0:d=0.25[vc]`);
    f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${c.segundos}[ac]`);
    partes.push("[vc][ac]");
    total += c.segundos;
  }
  f.push(`${partes.join("")}concat=n=${partes.length}:v=1:a=1[vcat][acat]`);

  // 3. texto del gancho (y etiqueta de IA si se activa en ajustes)
  const tg = aj.texto_gancho;
  const capas = capasTexto(tmp, "gancho", partir(a.textoGancho, tg.max_letras_por_linea), { fuente: tg.fuente, tamano: tg.tamano, color: tg.color, fondo: tg.fondo, y: H * tg.posicion_y, enable: `lt(t,${tg.segundos})` });
  if (aj.etiqueta_ia.mostrar) {
    const tf = path.join(tmp, "ia.txt"); fs.writeFileSync(tf, textos.etiqueta_ia, "utf8");
    capas.push(`drawtext=fontfile=${aj.cierre.fuente_texto}:textfile=${rel(tf)}:expansion=none:fontsize=${aj.etiqueta_ia.tamano}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=10:x=36:y=h-text_h-70:enable='lt(t,${(total - (modoFinal === "ninguno" ? 0 : aj.cierre.segundos)).toFixed(2)})'`);
  }
  f.push(`[vcat]${capas.join(",")}[vtxt]`);

  // 4. música de fondo (musica/anuncios-ugc o musica/nichos/levania)
  const mus = elegirMusica(aj);
  let au = "[acat]";
  if (mus) {
    const iM = nIn++;
    args.push("-stream_loop", "-1", "-i", mus);
    f.push(`[${iM}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${aj.musica.volumen},atrim=0:${total.toFixed(2)}[mus]`);
    f.push(`[acat][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    au = "[amix]";
  }
  f.push(`${au}afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6[afin]`);

  const guion = path.join(tmp, "filtro.txt");
  fs.writeFileSync(guion, f.join(";\n"));
  args.push("-filter_complex_script", rel(guion), "-map", "[vtxt]", "-map", "[afin]",
    "-c:v", "libx264", "-profile:v", "high", "-preset", aj.video.preset, "-crf", String(aj.video.crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", total.toFixed(2), salida);
  await correr(CFG.ffmpeg, args);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { duracion: +total.toFixed(1) };
}

// ---------------- lote completo ----------------
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function armarLote(n = 5, op = {}, avisar = () => {}) {
  const datos = cargar();
  // solo combinaciones cuyas escenas existen (carpeta propia, caché, Drive o enlace de Higgsfield)
  const revision = revisarEscenas();
  const disponibles = new Set(revision.filter((e) => e.donde).map((e) => e.codigo));
  op = { ...op, disponibles };
  if (!elegirLote(datos, 1, op).length) {
    const faltan = revision.filter((e) => !e.donde).map((e) => e.codigo);
    throw new Error(`No hay combinaciones nuevas con las escenas que encuentro (${disponibles.size} de ${revision.length}). ` +
      (process.env.LEVANIA_DRIVE ? `Revisa que LEVANIA_DRIVE (${process.env.LEVANIA_DRIVE}) sea la carpeta Levania de tu Drive.` : "Pon LEVANIA_DRIVE en el .env (carpeta Levania de Google Drive para escritorio) o suelta las escenas en ugcdrop/escenas/.") +
      ` Faltan: ${faltan.slice(0, 30).join(" ")}${faltan.length > 30 ? "…" : ""}`);
  }
  if (op.prueba) {
    const anuncios = elegirLote(datos, n, op);
    if (!anuncios.length) throw new Error("No quedan combinaciones nuevas con esos filtros.");
    return { lote: null, anuncios, hechos: [], fallos: [] };
  }
  let k = 1, carpeta;
  do carpeta = path.join(DIR_SALIDA, `Lote ${hoy()} #${k++}`); while (fs.existsSync(carpeta));

  const filas = [["Anuncio", "Estilo", "Tema", "Escenas", "Texto del gancho", "Copy", "Titular", "CTA", "Duración (s)", "Archivo"]];
  const copys = [], hechos = [], fallos = [], excluir = new Set(), faltan = new Set(), bloqueadasAhora = new Set();
  // si a una combinación le falta una escena, se salta y se busca otra (hasta 4 rondas)
  for (let ronda = 0; ronda < 4 && hechos.length < n; ronda++) {
    const anuncios = elegirLote(datos, n - hechos.length, { ...op, excluir });
    if (!anuncios.length) break;
    for (const a of anuncios) {
      excluir.add(a.combo);
      avisar({ progreso: hechos.length / n, msg: `Armando ${a.id} (${hechos.length + 1} de ${n})…` });
      try {
        const archivos = [], audios = [];
        for (const cod of a.escenas) {
          if (faltan.has(cod)) throw new Error(`Falta la escena ${cod}.`);
          try { archivos.push(await resolverEscena(datos.porCodigo[cod])); } catch (e) { faltan.add(cod); throw e; }
          // revisión de audio: idioma y límites de la voz (una sola vez por escena)
          const voz = await revisarAudio(datos.porCodigo[cod], archivos.at(-1), datos.ajustes);
          if (BLOQ_AUTO()[cod]) { bloqueadasAhora.add(cod); faltan.add(cod); throw new Error(`${cod}: ${BLOQ_AUTO()[cod]}`); }
          audios.push(voz);
        }
        fs.mkdirSync(carpeta, { recursive: true });
        const salida = path.join(carpeta, `${a.id}.mp4`);
        const r = await renderAnuncio(a, archivos, salida, datos, audios);
        datos.registro.entregados.push({ id: a.id, combo: a.combo, variante: a.variante, fecha: hoy(), lote: path.basename(carpeta), estado: "entregado" });
        guardarRegistro(datos.registro);
        filas.push([a.id, a.estilo, a.tema, a.escenas.join(" → "), a.textoGancho, a.copy, a.titular, a.cta, r.duracion, `${a.id}.mp4`]);
        copys.push(`━━━ ${a.id} ━━━\nTexto principal:\n${a.copy}\n\nTitular: ${a.titular}\n${a.cta ? `CTA: ${a.cta}\n` : ""}(Al subir, marca en la app que es contenido hecho con IA)\n`);
        hechos.push({ ...a, archivo: rel(salida), duracion: r.duracion });
      } catch (e) { fallos.push({ id: a.id, error: e.message.split("\n")[0] }); }
    }
  }
  if (!hechos.length) throw new Error("No salió ningún anuncio. " + [...new Set(fallos.map((x) => x.error))].slice(0, 4).join(" | "));
  fs.writeFileSync(path.join(carpeta, "resumen.csv"), "\ufeff" + filas.map((r) => r.map(csv).join(",")).join("\n"));
  fs.writeFileSync(path.join(carpeta, "copys.txt"), copys.join("\n"));
  const faltantes = [...faltan].filter((c) => !bloqueadasAhora.has(c));
  fs.writeFileSync(path.join(carpeta, "lote.json"), JSON.stringify({ hechos, fallos, faltantes, bloqueadasAudio: [...bloqueadasAhora] }, null, 1));
  return { lote: path.basename(carpeta), carpeta, hechos, fallos, faltantes, bloqueadasAudio: [...bloqueadasAhora] };
}

export function listarLotes() {
  if (!fs.existsSync(DIR_SALIDA)) return [];
  const reg = leerJSON(REGISTRO, { entregados: [] });
  const estado = Object.fromEntries(reg.entregados.map((e) => [e.id, e.estado]));
  return fs.readdirSync(DIR_SALIDA).filter((d) => d.startsWith("Lote ") && fs.existsSync(path.join(DIR_SALIDA, d, "lote.json")))
    .sort((a, b) => fs.statSync(path.join(DIR_SALIDA, b)).mtimeMs - fs.statSync(path.join(DIR_SALIDA, a)).mtimeMs)
    .map((d) => {
      const j = leerJSON(path.join(DIR_SALIDA, d, "lote.json"), { hechos: [], fallos: [] });
      return { lote: d, fallos: j.fallos, faltantes: j.faltantes || [], bloqueadasAudio: j.bloqueadasAudio || [], anuncios: j.hechos.map((a) => ({ ...a, estado: estado[a.id] || "entregado", url: "/" + a.archivo.split("/").map(encodeURIComponent).join("/") })) };
    });
}
