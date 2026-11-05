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

export const DIR_INV = path.join(RAIZ, "investigacion");
fs.mkdirSync(DIR_INV, { recursive: true });
const F_CONFIG = path.join(DIR_INV, "nicho.json");

const CONFIG_INICIAL = {
  nombre: "Levania · crianza y familia",
  descripcion: "Mamás hispanas (México y EE. UU.) con hijos de 3 a 10 años: rutinas, paciencia, culpa de mamá, tiempo de calidad, disciplina con amor.",
  redes: ["tiktok", "instagram"],
  cuentasTiktok: [],
  cuentasInstagram: [
    // disciplina positiva / dejar de gritar
    "drbeckyatgoodinside", "biglittlefeelings", "dr.siggie", "themompsychologist", "transformingtoddlerhood", "destini.ann", "simplyonpurpose", "responsive_parenting", "janetlansbury", "unconditional_parenting",
    // rutinas visuales e independencia (nicho exacto)
    "busytoddler", "agnes.more.than.mom", "miss_crafty_mama", "parentingtranslator", "thrivinglittles",
    // mentalidad de crecimiento, resiliencia, inteligencia emocional
    "nurturedfirst", "biglifejournal", "biglifejournal.espanol", "doctorshefali", "instituteofchildpsych", "curious.parenting", "seed.and.sew", "resilientlittlehearts",
    // armonía familiar
    "gottmaninstitute", "happily.family",
  ],
  hashtags: ["maternidad", "crianzarespetuosa", "frasesdemama", "mamaprimeriza", "crianzaconamor"],
  busquedas: ["frases para mamás", "reflexión maternidad"],
  dias: 45,
  porFuente: 25,
  propuestas: 10,
  marca: "Levania vende rutinas y checklists para familias. Las frases NO venden: conectan. El cierre invita a comentar una palabra (p. ej. RUTINA).",
};

export function leerConfig() {
  if (!fs.existsSync(F_CONFIG)) fs.writeFileSync(F_CONFIG, JSON.stringify(CONFIG_INICIAL, null, 2));
  const guardado = JSON.parse(fs.readFileSync(F_CONFIG, "utf8"));
  // si nunca pusiste cuentas, se usan las de referencia sugeridas
  for (const k of ["cuentasInstagram", "cuentasTiktok"]) if (Array.isArray(guardado[k]) && !guardado[k].length && !guardado.cuentasEditadas) delete guardado[k];
  return { ...CONFIG_INICIAL, ...guardado };
}
export function guardarConfig(c) { fs.writeFileSync(F_CONFIG, JSON.stringify({ ...leerConfig(), ...c, cuentasEditadas: true }, null, 2)); return leerConfig(); }

export function listarInvestigaciones() {
  return fs.readdirSync(DIR_INV).filter((f) => /^\d{4}-.*\.json$/.test(f) && !f.startsWith("datos-")).sort().reverse()
    .map((f) => { const j = JSON.parse(fs.readFileSync(path.join(DIR_INV, f), "utf8")); return { archivo: f, fecha: j.fecha, modo: j.modo, propuestas: j.propuestas?.length || 0, analizadas: j.publicaciones?.length || 0 }; });
}
export const leerInvestigacion = (f) => JSON.parse(fs.readFileSync(path.join(DIR_INV, path.basename(f)), "utf8"));

// ---------------- recolección (Apify) ----------------
async function apify(actor, entrada) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(CFG.apifyToken)}&timeout=280`;
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
  const n = cfg.porFuente;
  if (cfg.redes.includes("tiktok")) {
    if (cfg.cuentasTiktok.length) tareas.push(["TikTok · cuentas", () => apify("clockworks~tiktok-scraper", { profiles: cfg.cuentasTiktok.map((c) => c.replace(/^@/, "")), resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }), normTiktok]);
    if (cfg.hashtags.length) tareas.push(["TikTok · hashtags", () => apify("clockworks~tiktok-scraper", { hashtags: cfg.hashtags.map((h) => h.replace(/^#/, "")), resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }), normTiktok]);
    if (cfg.busquedas.length) tareas.push(["TikTok · búsquedas", () => apify("clockworks~tiktok-scraper", { searchQueries: cfg.busquedas, resultsPerPage: n, shouldDownloadVideos: false, shouldDownloadCovers: false }), normTiktok]);
  }
  if (cfg.redes.includes("instagram")) {
    if (cfg.cuentasInstagram.length) tareas.push(["Instagram · cuentas", () => apify("apify~instagram-scraper", { directUrls: cfg.cuentasInstagram.map((c) => c.startsWith("http") ? c : `https://www.instagram.com/${c.replace(/^@/, "")}/`), resultsType: "posts", resultsLimit: n }), normInstagram]);
    if (cfg.hashtags.length) tareas.push(["Instagram · hashtags", () => apify("apify~instagram-hashtag-scraper", { hashtags: cfg.hashtags.map((h) => h.replace(/^#/, "")), resultsLimit: n }), normInstagram]);
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
export async function soloDatos(avisar = () => {}) {
  if (!CFG.apifyToken) throw new Error("Para recolectar métricas hace falta APIFY_TOKEN en el .env. Sin él, Claude Code puede investigar con búsqueda web.");
  const cfg = leerConfig();
  const { lista, errores } = await recolectar(cfg, avisar);
  const ranking = lista.map(puntuar).sort((a, b) => b.puntaje - a.puntaje).slice(0, 40);
  const archivo = `datos-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(path.join(DIR_INV, archivo), JSON.stringify({ fecha: new Date().toISOString(), config: cfg, errores, publicaciones: ranking }, null, 2));
  return { archivo: path.join("investigacion", archivo), total: lista.length };
}

// ---------------- análisis con Claude ----------------
const FORMATO = `Devuelve SOLO JSON válido:
{
  "patrones": ["5 a 8 hallazgos concretos de lo que funciona: temas, ganchos, estructura de la frase, emoción, largo, tipo de clip de fondo, CTA"],
  "propuestas": [{
    "frase": "frase ORIGINAL en español de México, 8 a 28 palabras, con 1-2 palabras clave entre *asteriscos*",
    "autor": "solo si es una cita real verificada; si no, vacío",
    "cierre": "llamada a la acción corta (comentar una palabra, guardar, enviar a alguien)",
    "tema": "1-3 palabras",
    "origen": "en" | "es" | "ambos" (de dónde viene la tendencia),
    "llegada": "ya está en español" | "poco en español" | "aún no llega" (qué tanto existe ya en español),
    "adaptacion": "qué cambiaste para que conecte con mamás hispanas (si viene del inglés)",
    "porque": "por qué debería funcionar, citando el patrón y las publicaciones que la inspiran",
    "inspiradaEn": ["url de las publicaciones que la inspiran"],
    "flowPrompt": "prompt EN INGLÉS para Google Flow/Veo, vertical 9:16, ~8 s: slow motion, shallow depth of field, soft natural light, una sola acción emotiva y simple (ej. a child running into their mother's arms in a sunlit field), cámara suave, cinematic, warm tones, no text, no logos, no subtitles",
    "pexels": "2-4 palabras en inglés para buscar un clip parecido en Pexels",
    "tituloPost": "título/gancho para publicar",
    "descripcion": "1-2 líneas para la descripción",
    "hashtags": ["#..."]
  }]
}`;

function sistemaDe(cfg) {
  return [
    "Eres investigador de contenido viral para redes sociales y estratega creativo. Trabajas para esta marca:",
    `${cfg.nombre}. Audiencia: ${cfg.descripcion}`, cfg.marca,
    "Formato de los videos: 9:16 vertical, frase en pantalla sobre un clip en cámara lenta desenfocado, 10-25 s.",
    "REGLAS: no copies frases de otras cuentas (eso es plagio y la plataforma lo castiga): toma el patrón y escribe algo nuevo con la voz de la marca.",
    "Nunca atribuyas una frase a una persona real si no puedes verificarla. Nada de culpa ni de vergüenza hacia las mamás; sí de reconocimiento y ternura.",
    "ADAPTACIÓN AL PÚBLICO HISPANO: muchas fuentes son cuentas en inglés de EE. UU. a propósito, porque ahí aparecen primero las tendencias. Trátalas como señal temprana de lo que viene. No traduzcas literal: adapta la idea a mamás hispanas de México y EE. UU. (familia extendida y abuelas, la escuela y las tareas, las mañanas con prisa, el trabajo y la culpa, la fe cuando venga al caso, la comida, el 'mijo/mija'), con español natural de México. Para EE. UU. se vale un toque bilingüe solo si suena natural.",
    "Prioriza las tendencias que ya funcionan en inglés y todavía casi no existen en español: ahí está la ventaja. Márcalo en cada propuesta.",
    `Da exactamente ${cfg.propuestas} propuestas, variadas en tema y emoción.`,
    FORMATO,
  ].join("\n\n");
}

// Llama al modelo que haya: Gemini (llave gratis de AI Studio) o Claude (API de pago). Devuelve texto.
export const hayIA = () => !!(CFG.geminiKey || CFG.anthropicKey);
async function pedirIA(sistema, texto) {
  if (CFG.geminiKey) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CFG.geminiModelo}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(240000), headers: { "x-goog-api-key": CFG.geminiKey, "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: texto }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8 } }),
    });
    if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  }
  if (CFG.anthropicKey) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(240000), headers: { "x-api-key": CFG.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CFG.anthropicModelo, max_tokens: 12000, system: sistema, messages: [{ role: "user", content: texto }] }) });
    if (!r.ok) throw new Error(`La API de Claude respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return (await r.json()).content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  throw new Error("SIN_IA");
}
function guardarResultado(salida, j) {
  salida.patrones = j.patrones || [];
  salida.propuestas = (j.propuestas || []).map((p, i) => ({ ...p, n: i + 1 }));
  const archivo = `${salida.fecha.slice(0, 16).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(path.join(DIR_INV, archivo), JSON.stringify(salida, null, 2));
  return { archivo, propuestas: salida.propuestas.length };
}
const jsonDe = (texto) => { const a = texto.indexOf("{"), b = texto.lastIndexOf("}"); return JSON.parse(texto.slice(a, b + 1)); };

// ---------------- informes externos (Gemini Deep Research, muse.ai, lo que sea) ----------------
export const DIR_INFORMES = path.join(DIR_INV, "informes");
export const DIR_ENTRADA = path.join(DIR_INV, "entrada");
for (const d of [DIR_INFORMES, DIR_ENTRADA]) fs.mkdirSync(d, { recursive: true });

export function promptDeepResearch() {
  const c = leerConfig();
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
export function guardarInforme(texto, fuente = "informe") {
  texto = String(texto || "").trim();
  if (texto.length < 80) throw new Error("El informe está vacío o es demasiado corto.");
  const fecha = new Date().toISOString();
  const nombre = `${fecha.slice(0, 19).replace(/[:T]/g, "-")}-${(fuente || "informe").replace(/[^\w-]+/g, "-").slice(0, 30)}.md`;
  fs.writeFileSync(path.join(DIR_INFORMES, nombre), texto);
  return nombre;
}

export async function convertirInforme(nombre, fuente = "informe", avisar = () => {}) {
  const fecha = new Date().toISOString();
  const texto = fs.readFileSync(path.join(DIR_INFORMES, nombre), "utf8");
  if (!hayIA()) return { pendiente: true, informe: `investigacion/informes/${nombre}` };
  avisar({ progreso: 0.5, msg: `Convirtiendo el informe en propuestas (${CFG.geminiKey ? "Gemini" : "Claude"})…` });
  const cfg = leerConfig();
  const j = jsonDe(await pedirIA(sistemaDe(cfg), `Este es un informe de investigación de tendencias (${fuente}). Úsalo como base: saca los patrones y propón.\n\n${texto.slice(0, 120000)}`));
  const r = guardarResultado({ fecha, config: cfg, modo: "informe", fuente, informe: nombre, errores: [] }, j);
  const f = path.join(DIR_INFORMES, nombre); fs.renameSync(f, f.replace(/\.md$/, ".hecho.md"));
  return r;
}

export async function importarInforme(texto, fuente = "informe", avisar = () => {}) {
  return convertirInforme(guardarInforme(texto, fuente), fuente, avisar);
}

export function informesPendientes() { return fs.readdirSync(DIR_INFORMES).filter((f) => f.endsWith(".md") && !f.endsWith(".hecho.md")); }

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

export async function investigar(avisar = () => {}) {
  if (!hayIA()) throw new Error("El botón necesita GEMINI_API_KEY (gratis en aistudio.google.com) o ANTHROPIC_API_KEY. Sin ellas, pídeselo a Claude Code o importa un informe.");
  const cfg = leerConfig();
  const salida = { fecha: new Date().toISOString(), config: cfg, modo: CFG.apifyToken ? "metricas" : "web", errores: [] };
  const sistema = sistemaDe(cfg);

  let contenido;
  if (CFG.apifyToken) {
    const { lista, errores } = await recolectar(cfg, avisar);
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
    contenido = `Investiga en la web qué videos de frases y reflexiones para este nicho se están haciendo virales ahora en TikTok, Instagram Reels y Facebook (cuentas, temas, formatos, ejemplos con enlace). Usa la búsqueda. Luego analiza y propón. Aclara en "patrones" que no hay métricas exactas.`;
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

// Convierte una propuesta en el guion del estilo de frases
export function guionDesdePropuesta(p) {
  const escenas = [{ tipo: "frase", texto: p.frase }];
  if (p.autor) escenas.push({ tipo: "autor", texto: p.autor });
  if (p.cierre) escenas.push({ tipo: "cierre", texto: p.cierre });
  return {
    titulo: p.tituloPost || p.tema || "Frase",
    escenas,
    fondo: { buscar: p.pexels || "", flowPrompt: p.flowPrompt || "" },
    inspiracion: p.inspiradaEn || [], // no va en el texto para publicar
    subir: { titulo: p.tituloPost || "", descripcion: p.descripcion || "", hashtags: p.hashtags || [] },
  };
}
