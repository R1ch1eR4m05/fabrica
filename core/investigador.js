// Agente investigador: mira qué se está haciendo viral en el nicho y propone frases ORIGINALES listas para video.
//
// 1. Recolecta publicaciones (Apify: TikTok e Instagram) de cuentas, hashtags y búsquedas del nicho.
// 2. Las puntúa: vistas, vistas contra seguidores (si rebasó a su audiencia), guardados y compartidos (lo que más pesa en frases).
// 3. Claude mira las mejores (texto + portada, donde suele ir la frase) y saca los patrones.
// 4. Propone frases nuevas con su prompt de Flow en 9:16, su búsqueda de Pexels y el texto para publicar.
// Sin APIFY_TOKEN usa la búsqueda web de Claude (sin métricas reales: lo dice en el resultado).
import fs from "node:fs";
import path from "node:path";
import { CFG, RAIZ } from "./config.js";
import { listarEstilos } from "./estilos.js";

export const DIR_INV = path.join(RAIZ, "investigacion");
fs.mkdirSync(DIR_INV, { recursive: true });
// Un nicho por marca (Levania, Monarca…): cada uno con sus cuentas, hashtags, público, cierres, estilos y canal.
// Viven en investigacion/nichos/<id>.json; el que está activo en el panel se guarda en investigacion/nicho-activo.txt.
const F_VIEJO = path.join(DIR_INV, "nicho.json"); // antes había uno solo (Levania): se migra solo
export const DIR_NICHOS = path.join(DIR_INV, "nichos");
fs.mkdirSync(DIR_NICHOS, { recursive: true });
const F_ACTIVO = path.join(DIR_INV, "nicho-activo.txt");
const slug = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

const COMUN = {
  redes: ["tiktok", "instagram"], cuentasTiktok: [], cuentasInstagram: [], hashtags: [], busquedas: [],
  dias: 45,
  porFuente: 10,   // por hashtag o búsqueda
  porCuenta: 6,    // publicaciones recientes por cada cuenta de referencia
  topeUsd: 0.3,    // tope de gasto de Apify por cada tarea (la corrida se corta sola al llegar)
  propuestas: 10,
  cierres: [],     // los llamados a la acción que TÚ autorizas. Vacío = sin "comenta X"
  canal: "",       // @ del canal con que nacen los videos de este nicho
  estilos: [],     // estilos que puede proponer (vacío = todos)
  opciones: {},    // opciones por estilo con que nacen los videos, p. ej. { "reflexion-estatuas": { "tono": "turquesa" } }
  historia: false, // obligar al menos una propuesta en historia-flow
  adaptacion: "",  // cómo adaptar al público (va tal cual a la IA)
  reglas: "",      // qué sí y qué no del tono (va tal cual a la IA)
};

const PLANTILLAS = {
  levania: {
    nombre: "Levania · crianza y familia",
    descripcion: "Mamás hispanas (México y EE. UU.) con hijos de 3 a 10 años: rutinas, paciencia, culpa de mamá, tiempo de calidad, disciplina con amor.",
    cuentasInstagram: [
      "drbeckyatgoodinside", "biglittlefeelings", "dr.siggie", "themompsychologist", "transformingtoddlerhood", "destini.ann", "simplyonpurpose", "responsive_parenting", "janetlansbury", "unconditional_parenting",
      "busytoddler", "agnes.more.than.mom", "miss_crafty_mama", "parentingtranslator", "thrivinglittles",
      "nurturedfirst", "biglifejournal", "biglifejournal.espanol", "doctorshefali", "instituteofchildpsych", "curious.parenting", "seed.and.sew", "resilientlittlehearts",
      "gottmaninstitute", "happily.family",
    ],
    hashtags: ["maternidad", "crianzarespetuosa", "frasesdemama", "mamaprimeriza", "crianzaconamor"],
    busquedas: ["frases para mamás", "reflexión maternidad"],
    marca: "Levania vende rutinas y checklists para familias. Las frases NO venden: conectan.",
    historia: true,
    reglas: "Nada de culpa ni de vergüenza hacia las mamás; sí de reconocimiento y ternura.",
    adaptacion: "Muchas fuentes son cuentas en inglés de EE. UU. a propósito, porque ahí aparecen primero las tendencias. Trátalas como señal temprana de lo que viene. No traduzcas literal: adapta la idea a mamás hispanas de México y EE. UU. (familia extendida y abuelas, la escuela y las tareas, las mañanas con prisa, el trabajo y la culpa, la fe cuando venga al caso, la comida, el 'mijo/mija'), con español natural de México. Para EE. UU. se vale un toque bilingüe solo si suena natural.",
  },
  monarca: {
    nombre: "Monarca · reflexión estoica",
    descripcion: "Hispanos de 20 a 45 años (México y EE. UU.) que buscan disciplina, fortaleza mental y paz: soledad, energía, vejez, dinero, familia, propósito.",
    hashtags: ["estoicismo", "disciplina", "reflexion", "mentalidadfuerte", "crecimientopersonal"],
    busquedas: ["reflexiones estoicas", "frases de disciplina"],
    marca: "Monarca: monólogos sobrios y directos, voz grave de hombre, estatuas y paisajes en un solo tono. Verdades incómodas y qué hacer hoy.",
    estilos: ["reflexion-estatuas"],
    opciones: { "reflexion-estatuas": { tono: "turquesa", logo: "monarca" } },
    reglas: "Tono sobrio, firme y respetuoso; nada de odio hacia nadie, nada de promesas de dinero o salud, nada de frases atribuidas a filósofos sin verificar.",
    adaptacion: "Las tendencias suelen nacer en cuentas en inglés (stoic, discipline, self-improvement). No traduzcas literal: adapta la idea a hispanos de México y EE. UU. (familia, trabajo, deudas, padres que envejecen, amigos que se van), en español natural de México.",
  },
};

export function nichoActivo() {
  try { const id = fs.readFileSync(F_ACTIVO, "utf8").trim(); if (id && fs.existsSync(path.join(DIR_NICHOS, id + ".json"))) return id; } catch {}
  return "levania";
}
export function activarNicho(id) { if (!fs.existsSync(path.join(DIR_NICHOS, id + ".json"))) throw new Error("No existe ese nicho."); fs.writeFileSync(F_ACTIVO, id); return id; }

function sembrar() {
  if (!fs.existsSync(path.join(DIR_NICHOS, "levania.json"))) {
    let viejo = {}; try { viejo = JSON.parse(fs.readFileSync(F_VIEJO, "utf8")); } catch {}
    for (const k of ["cuentasInstagram", "cuentasTiktok"]) if (Array.isArray(viejo[k]) && !viejo[k].length && !viejo.cuentasEditadas) delete viejo[k];
    fs.writeFileSync(path.join(DIR_NICHOS, "levania.json"), JSON.stringify({ ...COMUN, ...PLANTILLAS.levania, ...viejo, id: "levania" }, null, 2));
  }
  if (!fs.existsSync(path.join(DIR_NICHOS, "monarca.json")) && !fs.existsSync(path.join(DIR_NICHOS, "monarca.borrado")))
    fs.writeFileSync(path.join(DIR_NICHOS, "monarca.json"), JSON.stringify({ ...COMUN, ...PLANTILLAS.monarca, id: "monarca" }, null, 2));
}

export function listarNichos() {
  sembrar();
  return fs.readdirSync(DIR_NICHOS).filter((f) => f.endsWith(".json")).map((f) => { const c = leerConfig(f.slice(0, -5)); return { id: c.id, nombre: c.nombre, canal: c.canal }; });
}

export function leerConfig(id = nichoActivo()) {
  sembrar();
  const f = path.join(DIR_NICHOS, path.basename(String(id)) + ".json");
  if (!fs.existsSync(f)) return leerConfig("levania");
  const guardado = JSON.parse(fs.readFileSync(f, "utf8"));
  const c = { ...COMUN, ...guardado, id: path.basename(f, ".json") };
  // la marca vieja no tenía estas reglas: se toman de su plantilla si están vacías
  for (const k of ["adaptacion", "reglas"]) if (!c[k] && PLANTILLAS[c.id]?.[k]) c[k] = PLANTILLAS[c.id][k];
  if (c.id === "levania" && guardado.historia == null) c.historia = true;
  return c;
}
export function guardarConfig(c, id = c?.id || nichoActivo()) {
  const actual = leerConfig(id);
  fs.writeFileSync(path.join(DIR_NICHOS, actual.id + ".json"), JSON.stringify({ ...actual, ...c, id: actual.id, cuentasEditadas: true }, null, 2));
  return leerConfig(actual.id);
}
export function crearNicho(nombre) {
  let id = slug(nombre) || "nicho"; while (fs.existsSync(path.join(DIR_NICHOS, id + ".json"))) id += "-2";
  fs.writeFileSync(path.join(DIR_NICHOS, id + ".json"), JSON.stringify({ ...COMUN, nombre, descripcion: "", marca: "", id }, null, 2));
  activarNicho(id); return leerConfig(id);
}
// de qué nicho es una investigación (las viejas, sin marca, son de Levania)
export const nichoDe = (inv) => inv?.nicho || inv?.config?.id || "levania";
export const configDe = (inv) => leerConfig(nichoDe(inv));

export function listarInvestigaciones(nicho) {
  return fs.readdirSync(DIR_INV).filter((f) => /^\d{4}-.*\.json$/.test(f) && !f.startsWith("datos-")).sort().reverse()
    .map((f) => { const j = JSON.parse(fs.readFileSync(path.join(DIR_INV, f), "utf8")); return { archivo: f, fecha: j.fecha, modo: j.modo, nicho: nichoDe(j), propuestas: j.propuestas?.length || 0, analizadas: j.publicaciones?.length || 0 }; })
    .filter((x) => !nicho || x.nicho === nicho);
}
// sugerencias para "Nuevo video": propuestas recientes de la marca (las que nacen de un video viral real, primero)
export function sugerencias(nicho, max = 30) {
  const out = [];
  for (const x of listarInvestigaciones(nicho).slice(0, 6)) {
    let inv; try { inv = leerInvestigacion(x.archivo); } catch { continue; }
    for (const p of inv.propuestas || []) out.push({ archivo: x.archivo, fecha: x.fecha, n: p.n, estilo: p.estilo || "", frase: String(p.frase || "").replace(/\*/g, ""), idea: p.idea || "", tema: p.tema || "", viral: (p.inspiradaEn || []).length > 0, llegada: p.llegada || "", inspiradaEn: (p.inspiradaEn || []).slice(0, 3) });
  }
  return out.sort((a, b) => (b.viral - a.viral) || String(b.fecha).localeCompare(String(a.fecha))).slice(0, max);
}
export const leerInvestigacion = (f) => JSON.parse(fs.readFileSync(path.join(DIR_INV, path.basename(f)), "utf8"));

// ---------------- recolección (Apify) ----------------
async function apify(actor, entrada, tope = 0.3) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(CFG.apifyToken)}&timeout=280&maxTotalChargeUsd=${tope}`;
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entrada), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`Apify (${actor}) respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const num = (...v) => { for (const x of v) if (x != null && !isNaN(Number(x))) return Number(x); return 0; };

function normTiktok(x) {
  return {
    red: "tiktok", url: x.webVideoUrl || x.url, autor: x.authorMeta?.name || x.author?.uniqueId || "",
    seguidores: num(x.authorMeta?.fans, x.authorStats?.followerCount), texto: x.text || x.desc || "",
    vistas: num(x.playCount, x.stats?.playCount), likes: num(x.diggCount, x.stats?.diggCount),
    comentarios: num(x.commentCount, x.stats?.commentCount), compartidos: num(x.shareCount, x.stats?.shareCount),
    guardados: num(x.collectCount, x.stats?.collectCount), fecha: x.createTimeISO || (x.createTime ? new Date(x.createTime * 1000).toISOString() : null),
    portada: x.videoMeta?.coverUrl || x.videoMeta?.originalCoverUrl || x.covers?.default || null, duracion: num(x.videoMeta?.duration),
  };
}
function normInstagram(x) {
  return {
    red: "instagram", url: x.url || (x.shortCode ? `https://www.instagram.com/p/${x.shortCode}/` : ""), autor: x.ownerUsername || "",
    seguidores: num(x.ownerFollowersCount), texto: x.caption || "",
    vistas: num(x.videoPlayCount, x.videoViewCount, x.igPlayCount), likes: num(x.likesCount), comentarios: num(x.commentsCount),
    compartidos: num(x.sharesCount), guardados: 0, fecha: x.timestamp || null, portada: x.displayUrl || null, duracion: num(x.videoDuration),
    esVideo: x.type === "Video" || !!x.videoUrl,
  };
}

async function recolectar(cfg, avisar) {
  const tareas = [];
  const n = Math.min(cfg.porFuente || 10, 12), nc = Math.min(cfg.porCuenta || 6, 10), tope = cfg.topeUsd ?? 0.3;
  if (cfg.redes.includes("tiktok")) {
    if (cfg.cuentasTiktok.length) tareas.push(["TikTok · cuentas", () => apify("clockworks~tiktok-scraper", { profiles: cfg.cuentasTiktok.map((c) => c.replace(/^@/, "")), resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }, tope), normTiktok]);
    if (cfg.hashtags.length) tareas.push(["TikTok · hashtags", () => apify("clockworks~tiktok-scraper", { hashtags: cfg.hashtags.map((h) => h.replace(/^#/, "")), resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }, tope), normTiktok]);
    if (cfg.busquedas.length) tareas.push(["TikTok · búsquedas", () => apify("clockworks~tiktok-scraper", { searchQueries: cfg.busquedas, resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }, tope), normTiktok]);
  }
  if (cfg.redes.includes("instagram")) {
    if (cfg.cuentasInstagram.length) tareas.push(["Instagram · cuentas", () => apify("apify~instagram-scraper", { directUrls: cfg.cuentasInstagram.map((c) => c.startsWith("http") ? c : `https://www.instagram.com/${c.replace(/^@/, "")}/`), resultsType: "posts", resultsLimit: nc }, tope), normInstagram]);
    if (cfg.hashtags.length) tareas.push(["Instagram · hashtags", () => apify("apify~instagram-hashtag-scraper", { hashtags: cfg.hashtags.map((h) => h.replace(/^#/, "")), resultsLimit: n }, tope), normInstagram]);
  }
  const todas = [], errores = [];
  for (const [k, [nombre, fn, norm]] of tareas.entries()) {
    avisar({ progreso: k / (tareas.length + 2), msg: `Recolectando ${nombre}…` });
    try { todas.push(...(await fn()).map(norm)); } catch (e) { errores.push(`${nombre}: ${e.message}`); }
  }
  // sin repetidos, recientes, y en IG solo videos
  const vistos = new Set(), limite = Date.now() - cfg.dias * 864e5;
  const lista = todas.filter((p) => p.url && !vistos.has(p.url) && vistos.add(p.url))
    .filter((p) => !p.fecha || new Date(p.fecha).getTime() >= limite)
    .filter((p) => p.red !== "instagram" || p.esVideo !== false);
  return { lista, errores };
}

export function puntuar(p) {
  const v = Math.max(1, p.vistas);
  const interaccion = (p.likes + 2 * p.comentarios + 4 * p.compartidos + 4 * p.guardados) / v; // guardar y compartir es lo que mueve una frase
  const rebase = p.seguidores ? p.vistas / p.seguidores : null; // >1: llegó más allá de sus seguidores
  const puntaje = Math.log10(v + 1) * (1 + 8 * Math.min(interaccion, 0.5)) * (rebase ? Math.min(3, 1 + Math.log10(1 + rebase)) : 1);
  return { ...p, interaccion: +interaccion.toFixed(4), rebase: rebase ? +rebase.toFixed(2) : null, puntaje: +puntaje.toFixed(2) };
}

async function imagenBase64(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 4.5e6 ? null : { type: "image", source: { type: "base64", media_type: tipo, data: b.toString("base64") } };
  } catch { return null; }
}

// Solo recolecta y puntúa (sin Claude). Lo usa Claude Code: `node fabrica.js recolectar`
export async function soloDatos(avisar = () => {}, nicho) {
  if (!CFG.apifyToken) throw new Error("Para recolectar métricas hace falta APIFY_TOKEN en el .env. Sin él, Claude Code puede investigar con búsqueda web.");
  const cfg = leerConfig(nicho);
  const { lista, errores } = await recolectar(cfg, avisar);
  const ranking = lista.map(puntuar).sort((a, b) => b.puntaje - a.puntaje).slice(0, 40);
  const archivo = `datos-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(path.join(DIR_INV, archivo), JSON.stringify({ fecha: new Date().toISOString(), nicho: cfg.id, config: cfg, errores, publicaciones: ranking }, null, 2));
  return { archivo: path.join("investigacion", archivo), total: lista.length };
}

// ---------------- análisis con Claude ----------------
const FORMATO = `Devuelve SOLO JSON válido:
{
  "patrones": ["5 a 8 hallazgos concretos de lo que funciona: temas, ganchos, estructura de la frase, emoción, largo, tipo de clip de fondo, CTA"],
  "propuestas": [{
    "estilo": "id EXACTO del estilo de video que mejor le queda a esta idea, de la lista de estilos disponibles",
    "porQueEstilo": "una línea: por qué ese estilo es el mejor para este contenido",
    "beats": ["SOLO para motion y datos: 5 a 8 momentos del video, cada uno con el texto exacto en pantalla (máx. 8 palabras). El 1 es el gancho que detiene el scroll; el último es el remate o la acción"],
    "idea": "de qué trata el video en 1-2 frases (tema, ángulo y, si lleva datos, qué dato real hay que verificar). Para el estilo de frases puede ir vacío",
    "frase": "el gancho o mensaje central, ORIGINAL, en español de México, 8 a 28 palabras, con 1-2 palabras clave entre *asteriscos* (en el estilo de frases es lo que sale en pantalla)",
    "autor": "solo si es una cita real verificada; si no, vacío",
    "cierre": "uno de los cierres autorizados, copiado tal cual, o vacío",
    "tema": "1-3 palabras",
    "origen": "en" | "es" | "ambos" (de dónde viene la tendencia),
    "llegada": "ya está en español" | "poco en español" | "aún no llega" (qué tanto existe ya en español),
    "adaptacion": "qué cambiaste para que conecte con la audiencia hispana (si viene del inglés)",
    "porque": "por qué debería funcionar, citando el patrón y las publicaciones que la inspiran",
    "inspiradaEn": ["url REAL de las publicaciones que la inspiran, copiada de los datos o del informe; nunca inventes una. Si no hay, lista vacía"],
    "flowPrompt": "prompt EN INGLÉS para Google Flow/Veo, vertical 9:16, ~8 s: slow motion, shallow depth of field, soft natural light, una sola acción o imagen emotiva y simple que vaya con la marca, cámara suave, cinematic, no text, no logos, no subtitles",
    "pexels": "2-4 palabras en inglés para buscar un clip parecido en Pexels",
    "tituloPost": "título/gancho para publicar",
    "descripcion": "1-2 líneas para la descripción",
    "hashtags": ["#..."]
  }]
}`;

// estilos que puede elegir el investigador (los motion graphics quedan con su brief listo y los construye Claude Code)
export function estilosDisponibles(cfg) {
  const lista = [];
  for (const e of listarEstilos().filter((x) => x.listo)) {
    if (e.tipo !== "motion") lista.push({ id: e.id, nombre: e.nombre, descripcion: e.descripcion });
    else for (const c of e.catalogo || []) lista.push({ id: `motion:${c.id}`, nombre: `Motion graphics · ${c.nombre}`, descripcion: `${c.que} (sin voz, texto animado; bueno para pasos, listas, un dato fuerte o un anuncio)` });
  }
  const permitidos = (cfg?.estilos || []).filter(Boolean);
  return permitidos.length ? lista.filter((e) => permitidos.includes(e.id) || (e.id.startsWith("motion:") && permitidos.includes("motion"))) : lista;
}

function sistemaDe(cfg) {
  const estilos = estilosDisponibles(cfg);
  return [
    "Eres investigador de contenido viral para redes sociales y estratega creativo. Trabajas para esta marca:",
    `${cfg.nombre}. Audiencia: ${cfg.descripcion}`, cfg.marca,
    "Todos los videos son 9:16 vertical. Cada propuesta es una IDEA de video y debes elegir para ella el estilo que mejor le queda, según el contenido (no fuerces variedad; si todo son frases, todo va en frases). Estilos disponibles:\n" +
      estilos.map((e) => `- ${e.id}: ${e.nombre}. ${e.descripcion}`).join("\n") +
      "\nPon en \"estilo\" el id exacto. Si eliges un estilo con datos o cifras, la idea debe apoyarse en datos reales verificables (nada inventado)." +
      "\nElige un motion graphics SOLO si la publicación que inspira la idea ya es un formato visual que funcionó (lista, pasos, comparación, un dato que se anima) y tienes su enlace; para una frase emotiva usa frases. Un motion necesita contenido para 15-25 s: gancho, 4-6 momentos y remate, no una sola frase.",
    "REGLAS: no copies frases de otras cuentas (eso es plagio y la plataforma lo castiga): toma el patrón y escribe algo nuevo con la voz de la marca.",
    `Nunca atribuyas una frase a una persona real si no puedes verificarla. ${cfg.reglas || ""}`,
    cfg.adaptacion ? `ADAPTACIÓN AL PÚBLICO: ${cfg.adaptacion}` : "",
    "Prioriza las tendencias que ya funcionan en inglés y todavía casi no existen en español: ahí está la ventaja. Márcalo en cada propuesta.",
    "LO MÁS IMPORTANTE: cada propuesta tiene que nacer de una publicación concreta que YA fue viral o rindió muy por encima de lo normal (vistas, guardados, compartidos, rebase de seguidores). Pon su url exacta en \"inspiradaEn\", copiada de los datos o del informe. Una propuesta sin publicación viral detrás no sirve: no la incluyas. En \"porque\" di qué cifra o señal la hace viral.",
    (cfg.cierres || []).length
      ? `CIERRES: en "cierre" usa EXACTAMENTE uno de estos (cópialo tal cual, elige el que mejor le quede), o déjalo vacío. Nunca inventes otra palabra para comentar:\n${cfg.cierres.map((c) => "- " + c).join("\n")}`
      : `CIERRES: deja "cierre" vacío. No inventes llamados a "comenta una palabra": la marca no ha autorizado ninguno.`,
    cfg.historia && estilos.some((e) => e.id === "historia-flow") ? "Al menos UNA propuesta debe ir en el estilo historia-flow: toma una publicación viral (una anécdota, un momento, un antes/después) y adáptala a una micro-historia de 5-7 escenas con personajes de una familia hispana. En sus \"beats\" pon lo que pasa en cada escena." : "",
    `Da exactamente ${cfg.propuestas} propuestas, variadas en tema y emoción.`,
    estilos.length === 1 ? `Este nicho solo usa el estilo ${estilos[0].id}: todas las propuestas van en ese estilo.` : "",
    FORMATO,
  ].filter(Boolean).join("\n\n");
}

import { hayIA as _hayIA, pedir, jsonDe as _jsonDe } from "./llm.js";
export const hayIA = _hayIA;
async function pedirIA(sistema, texto) { return (await pedir(sistema, texto)).texto; }
// Solo valen enlaces que de verdad estaban en los datos (publicaciones recolectadas) o en el informe: la IA no puede inventarlos.
const normUrl = (u) => String(u || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^http:/, "https:").replace("://m.", "://www.").toLowerCase();
function enlacesConocidos(salida, texto = "") {
  const set = new Set((salida.publicaciones || []).map((p) => normUrl(p.url)).filter(Boolean));
  for (const m of String(texto).matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) set.add(normUrl(m[0].replace(/[.,;:]+$/, "")));
  return set;
}
function guardarResultado(salida, j, texto = "") {
  salida.patrones = j.patrones || [];
  const conocidos = enlacesConocidos(salida, texto);
  salida.propuestas = (j.propuestas || []).map((p, i) => {
    const pedidos = (p.inspiradaEn || []).filter(Boolean);
    const buenos = conocidos.size ? pedidos.filter((u) => conocidos.has(normUrl(u))) : [];
    return { ...p, n: i + 1, inspiradaEn: buenos, viral: buenos.length > 0, ...(pedidos.length > buenos.length ? { enlacesDescartados: pedidos.length - buenos.length } : {}) };
  });
  // primero las que sí tienen una publicación viral detrás
  salida.propuestas.sort((a, b) => Number(b.viral) - Number(a.viral)).forEach((p, i) => (p.n = i + 1));
  const archivo = `${salida.fecha.slice(0, 16).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(path.join(DIR_INV, archivo), JSON.stringify(salida, null, 2));
  return { archivo, propuestas: salida.propuestas.length };
}
const jsonDe = _jsonDe;

// ---------------- informes externos (Gemini Deep Research, muse.ai, lo que sea) ----------------
export const DIR_INFORMES = path.join(DIR_INV, "informes");
export const DIR_ENTRADA = path.join(DIR_INV, "entrada");
for (const d of [DIR_INFORMES, DIR_ENTRADA]) fs.mkdirSync(d, { recursive: true });

export function promptDeepResearch(nicho) {
  const c = leerConfig(nicho);
  return `Investiga qué videos cortos (TikTok, Instagram Reels, YouTube Shorts y Facebook) de frases, reflexiones y mensajes emotivos se están haciendo virales en los últimos ${c.dias} días para esta audiencia: ${c.descripcion}

${c.cuentasTiktok.length || c.cuentasInstagram.length ? `Revisa en especial estas cuentas: ${[...c.cuentasTiktok, ...c.cuentasInstagram].join(", ")}.
` : ""}Temas y hashtags a cubrir: ${c.hashtags.map((h) => "#" + h).join(" ")}.

Quiero un informe con:
1. Las 15-25 publicaciones con mejor desempeño que encuentres: enlace, cuenta, frase o texto que aparece en pantalla, vistas/likes/guardados/compartidos si se conocen, y tipo de clip de fondo.
2. Patrones: temas, emociones, estructura y largo de las frases, ganchos de los primeros 2 segundos, llamados a la acción que más comentarios generan, y horarios si los hay.
3. Qué tipo de clip de fondo acompaña a los que más funcionan (por ejemplo: niño corriendo a los brazos de su mamá en cámara lenta).
Cita las fuentes. No inventes métricas: si no hay datos, dilo.`;
}

// guarda el informe y, si hay IA configurada, lo convierte en propuestas
export function guardarInforme(texto, fuente = "informe", nicho = nichoActivo()) {
  texto = String(texto || "").trim();
  if (texto.length < 80) throw new Error("El informe está vacío o es demasiado corto.");
  const fecha = new Date().toISOString();
  const nombre = `${fecha.slice(0, 19).replace(/[:T]/g, "-")}-${(fuente || "informe").replace(/[^\w-]+/g, "-").slice(0, 30)}.md`;
  fs.writeFileSync(path.join(DIR_INFORMES, nombre), `<!-- nicho: ${leerConfig(nicho).id} -->\n` + texto);
  return nombre;
}

export async function convertirInforme(nombre, fuente = "informe", avisar = () => {}) {
  const fecha = new Date().toISOString();
  const ruta = path.join(DIR_INFORMES, nombre);
  if (!fs.existsSync(ruta)) throw new Error("Ese informe ya se convirtió.");
  const texto = fs.readFileSync(ruta, "utf8");
  if (!hayIA()) return { pendiente: true, informe: `investigacion/informes/${nombre}` };
  // candado: que nunca lo conviertan dos procesos a la vez (el panel y la orden de consola)
  const candado = ruta + ".lock";
  try { fs.writeFileSync(candado, String(process.pid), { flag: "wx" }); }
  catch { if (Date.now() - fs.statSync(candado).mtimeMs < 15 * 60000) throw new Error("Ese informe ya se está convirtiendo."); fs.writeFileSync(candado, String(process.pid)); }
  try { return await convertirConCandado(nombre, fuente, avisar, fecha, texto); } finally { fs.rmSync(candado, { force: true }); }
}

async function convertirConCandado(nombre, fuente, avisar, fecha, texto) {
  avisar({ progreso: 0.5, msg: `Convirtiendo el informe en propuestas (${CFG.geminiKey ? "Gemini" : "Claude"})…` });
  const cfg = leerConfig(texto.match(/^<!-- nicho: ([\w-]+) -->/)?.[1] || nichoActivo());
  const j = jsonDe(await pedirIA(sistemaDe(cfg), `Este es un informe de investigación de tendencias (${fuente}). Úsalo como base: saca los patrones y propón.\n\n${texto.slice(0, 120000)}`));
  const r = guardarResultado({ fecha, nicho: cfg.id, config: cfg, modo: "informe", fuente, informe: nombre, errores: [] }, j, texto);
  const f = path.join(DIR_INFORMES, nombre); if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.md$/, ".hecho.md"));
  return r;
}

export async function importarInforme(texto, fuente = "informe", avisar = () => {}, nicho) {
  return convertirInforme(guardarInforme(texto, fuente, nicho), fuente, avisar);
}

// reintenta solos los informes que no se pudieron convertir (cada 15 min, hasta 8 veces)
export async function reintentarPendientes(avisar = () => {}) {
  if (!hayIA()) return [];
  const hechos = [];
  for (const n of informesPendientes()) {
    const marca = path.join(DIR_INFORMES, n + ".intentos");
    const est = fs.existsSync(marca) ? JSON.parse(fs.readFileSync(marca, "utf8")) : { n: 0, ultimo: 0 };
    if (est.n >= 8 || Date.now() - est.ultimo < 15 * 60000) continue;
    try { hechos.push(await convertirInforme(n, n.replace(/^[\d-]+-/, "").replace(/\.md$/, ""), avisar)); fs.rmSync(marca, { force: true }); }
    catch (e) { fs.writeFileSync(marca, JSON.stringify({ n: est.n + 1, ultimo: Date.now(), error: e.message })); }
  }
  return hechos;
}

export function informesPendientes() { return fs.readdirSync(DIR_INFORMES).filter((f) => f.endsWith(".md") && !f.endsWith(".hecho.md")); }
export const intentosDe = (n) => { const f = path.join(DIR_INFORMES, n + ".intentos"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };

// archivos que caen en investigacion/entrada/ (n8n, una carpeta sincronizada, o tú) se importan solos
export async function revisarEntrada(avisar = () => {}) {
  const hechos = [];
  for (const f of fs.readdirSync(DIR_ENTRADA)) {
    if (!/\.(md|txt|csv|json|html?)$/i.test(f)) continue;
    const ruta = path.join(DIR_ENTRADA, f);
    try {
      let texto = fs.readFileSync(ruta, "utf8");
      if (/\.html?$/i.test(f)) texto = texto.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      hechos.push(await importarInforme(texto, path.basename(f).replace(/\.[^.]+$/, ""), avisar));
      fs.rmSync(ruta);
    } catch (e) { console.error("Entrada", f, e.message); fs.renameSync(ruta, ruta + ".error"); }
  }
  return hechos;
}

export async function investigar(avisar = () => {}, nicho) {
  if (!hayIA()) throw new Error("El botón necesita GEMINI_API_KEY (gratis en aistudio.google.com) o ANTHROPIC_API_KEY. Sin ellas, pídeselo a Claude Code o importa un informe.");
  const cfg = leerConfig(nicho);
  const salida = { fecha: new Date().toISOString(), nicho: cfg.id, config: cfg, modo: CFG.apifyToken ? "metricas" : "web", errores: [] };
  const sistema = sistemaDe(cfg);

  let contenido;
  if (CFG.apifyToken) {
    // Apify cuesta: si Gemini falla después, el siguiente intento reutiliza lo ya recolectado (hasta 12 h, misma configuración)
    const F_RECOL = path.join(DIR_INV, `recoleccion-${cfg.id}.json`);
    const huella = JSON.stringify({ r: cfg.redes, a: cfg.cuentasTiktok, b: cfg.cuentasInstagram, c: cfg.hashtags, d: cfg.busquedas, e: cfg.dias, f: cfg.porFuente, g: cfg.porCuenta });
    let rec = null;
    try { const x = JSON.parse(fs.readFileSync(F_RECOL, "utf8")); if (x.huella === huella && Date.now() - new Date(x.fecha) < 12 * 3600e3 && x.lista?.length) rec = x; } catch {}
    if (rec) avisar({ progreso: 0.65, msg: "Reutilizo las publicaciones que ya traje hace un rato (no vuelvo a gastar Apify)…" });
    const { lista, errores } = rec || (await recolectar(cfg, avisar));
    if (!rec && lista.length) fs.writeFileSync(F_RECOL, JSON.stringify({ fecha: new Date().toISOString(), huella, lista, errores }));
    salida.errores = errores;
    if (!lista.length) throw new Error("No encontré publicaciones. " + errores.join(" | "));
    const ranking = lista.map(puntuar).sort((a, b) => b.puntaje - a.puntaje);
    salida.publicaciones = ranking.slice(0, 40);
    const top = ranking.slice(0, 15);
    avisar({ progreso: 0.7, msg: `Analizando las ${top.length} mejores de ${lista.length} publicaciones…` });
    const imagenes = (await Promise.all(top.slice(0, 12).map((p) => (p.portada ? imagenBase64(p.portada) : null))));
    contenido = [{ type: "text", text: `Estas son las publicaciones con mejor desempeño del nicho (últimos ${cfg.dias} días), ordenadas por puntaje (vistas, interacción ponderando guardados y compartidos, y cuánto rebasaron a sus seguidores):\n` +
      JSON.stringify(top.map((p, i) => ({ n: i + 1, red: p.red, url: p.url, autor: p.autor, vistas: p.vistas, rebase: p.rebase, interaccion: p.interaccion, guardados: p.guardados, compartidos: p.compartidos, texto: p.texto.slice(0, 400), duracion: p.duracion })), null, 1) +
      "\n\nA continuación van las portadas (muchas traen la frase escrita). Cada imagen corresponde al número indicado." }];
    imagenes.forEach((img, i) => { if (img) contenido.push({ type: "text", text: `Portada n=${i + 1}` }, img); });
    contenido.push({ type: "text", text: "Analiza y propón." });
  } else {
    avisar({ progreso: 0.2, msg: "Sin Apify: investigando con búsqueda web (sin métricas exactas)…" });
    contenido = `Investiga en la web qué videos cortos para este nicho (${cfg.nombre}: ${cfg.descripcion}) se están haciendo virales ahora en TikTok, Instagram Reels y Facebook (cuentas, temas, formatos, ejemplos con enlace). Usa la búsqueda. Luego analiza y propón. Aclara en "patrones" que no hay métricas exactas.`;
  }

  if (!CFG.anthropicKey) { // solo Gemini: va el texto de las publicaciones (sin portadas ni búsqueda web)
    if (!CFG.apifyToken) throw new Error("Con Gemini gratis el botón necesita Apify para traer las publicaciones. Si no, usa Gemini Deep Research e importa el informe.");
    avisar({ progreso: 0.8, msg: "Gemini está escribiendo las propuestas…" });
    const soloTexto = contenido.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return guardarResultado(salida, jsonDe(await pedirIA(sistema, soloTexto)));
  }
  avisar({ progreso: 0.8, msg: "Claude está escribiendo las propuestas…" });
  let mensajes = [{ role: "user", content: contenido }], r;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": CFG.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CFG.anthropicModelo, max_tokens: 12000, system: sistema, messages: mensajes,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: CFG.apifyToken ? 3 : 8 }] }),
    });
    if (!res.ok) throw new Error(`La API de Claude respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    r = await res.json();
    if (r.stop_reason !== "pause_turn") break;
    mensajes = [...mensajes, { role: "assistant", content: r.content }];
  }
  const texto = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  const j = JSON.parse(texto.slice(a, b + 1));
  salida.patrones = j.patrones || [];
  salida.propuestas = (j.propuestas || []).map((p, i) => ({ ...p, n: i + 1 }));
  const archivo = `${salida.fecha.slice(0, 16).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(path.join(DIR_INV, archivo), JSON.stringify(salida, null, 2));
  return { archivo, propuestas: salida.propuestas.length };
}

// El cierre solo puede ser uno de los que Richie autorizó en el nicho (si la IA inventó otro, se quita)
export function cierreValido(c, cfg = leerConfig()) {
  const ok = cfg.cierres || [];
  const n = (x) => String(x || "").trim().toLowerCase();
  return ok.find((x) => n(x) === n(c)) || "";
}

// Vuelve a sacar propuestas de una investigación ya hecha (mismo informe o mismas publicaciones), con las reglas de hoy
// (estilos y cierres). No vuelve a gastar Apify.
export async function reproponer(archivo, avisar = () => {}) {
  const inv = leerInvestigacion(archivo), cfg = configDe(inv);
  let base;
  if (inv.informe) { const f = path.join(DIR_INFORMES, inv.informe.replace(/\.md$/, ".hecho.md")); const g = path.join(DIR_INFORMES, inv.informe);
    base = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : fs.existsSync(g) ? fs.readFileSync(g, "utf8") : null; }
  if (!base && inv.publicaciones?.length) base = "Publicaciones con mejor desempeño del nicho:\n" + JSON.stringify(inv.publicaciones.slice(0, 15).map((p, i) => ({ n: i + 1, red: p.red, url: p.url, autor: p.autor, vistas: p.vistas, rebase: p.rebase, guardados: p.guardados, compartidos: p.compartidos, texto: (p.texto || "").slice(0, 400) })), null, 1);
  if (!base) base = "Patrones encontrados antes:\n- " + (inv.patrones || []).join("\n- ") + "\n\nPropuestas anteriores (como referencia de temas):\n" + (inv.propuestas || []).map((p) => `- ${p.tema}: ${p.frase}`).join("\n");
  avisar({ progreso: 0.4, msg: "Volviendo a proponer con los estilos y cierres de hoy…" });
  const j = jsonDe(await pedirIA(sistemaDe(cfg), `Esta es la base de una investigación anterior. Saca los patrones y propón de nuevo.\n\n${base.slice(0, 120000)}`));
  const { propuestas, publicaciones, patrones, ...resto } = inv;
  return guardarResultado({ ...resto, fecha: new Date().toISOString(), nicho: cfg.id, config: cfg, publicaciones, rehechaDe: archivo }, j, base);
}

// Convierte una propuesta en el guion del estilo de frases
export function guionDesdePropuesta(p, cfg) {
  const escenas = [{ tipo: "frase", texto: p.frase }];
  if (p.autor) escenas.push({ tipo: "autor", texto: p.autor });
  const cierre = cierreValido(p.cierre, cfg);
  if (cierre) escenas.push({ tipo: "cierre", texto: cierre });
  return {
    titulo: p.tituloPost || p.tema || "Frase",
    escenas,
    fondo: { buscar: p.pexels || "", flowPrompt: p.flowPrompt || "" },
    inspiracion: p.inspiradaEn || [], // no va en el texto para publicar
    subir: { titulo: p.tituloPost || "", descripcion: p.descripcion || "", hashtags: p.hashtags || [] },
  };
}
