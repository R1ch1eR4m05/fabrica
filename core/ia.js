// Escribe el guion con la IA que haya: Claude (de pago) o Gemini (gratis), las dos con búsqueda web para verificar datos.
// Si no hay ninguna llave, el panel le dice al usuario que se lo pida a Claude Code.
import { hayIA, pedir, jsonDe } from "./llm.js";
import { leerEstilo, instruccionesGuion } from "./estilos.js";

const FORMATO_SALIDA = `
Devuelve SOLO un objeto JSON válido (sin texto antes ni después, sin \`\`\`), con esta forma:
{
  "titulo": "título corto del video",
  "escenas": [ { "tipo": "<tipo>", "texto": "lo que dice la voz y se ve en pantalla", "visual": "<visual>" } ],
  "fuentes": [ { "dato": "la cifra o hecho", "url": "https://..." } ],
  "subir": { "titulo": "título para publicar", "descripcion": "2-3 líneas", "hashtags": ["#..."] }
}
Agrega también los campos extra que pidan las instrucciones del estilo (en el guion o en cada escena), con esos mismos nombres.`;

// el mismo pedido que se le hace a la IA, para pegarlo en Claude (app o web) cuando no hay IA o se acabó la cuota
export function pedidoParaCopiar(proyecto, { cambios = "", guionActual = null } = {}) {
  const { sistema, pedido } = armar(proyecto, { cambios, guionActual });
  return `${sistema}

---
${pedido}

Responde SOLO con el JSON.`;
}

// el gancho manda: es lo primero que se mide al revisar el video y lo que decide si la gente se queda
const REGLA_GANCHO = `PRIORIDAD 1 — EL GANCHO. Antes que todo lo demás, escribe la primera escena para detener el scroll en los primeros 2 segundos:
- La primera frase se entiende sola, mide 4 a 9 palabras y se dice en 2 segundos o menos. Nada de saludos, presentaciones ni "hoy te voy a hablar de".
- Es una verdad incómoda, una contradicción, una pregunta directa al espectador o una situación concreta que duela o intrigue. Nada genérico.
- Justo después (segundo 2-4) viene un giro o una promesa que obligue a quedarse.
- Su imagen (flowPrompt) debe ser la más potente y con movimiento del video: un rostro cercano, una acción, un contraste fuerte; nunca un paisaje vacío ni oscuro.
Escribe 3 ganchos posibles en tu cabeza y usa el más fuerte.`;

// Historia con Flow en modo diálogos: los personajes hablan dentro de cada clip (Veo genera la voz y el movimiento de labios)
const REGLA_DIALOGOS = `MODO DIÁLOGOS (manda sobre la narración en off de las instrucciones del estilo): NO hay narrador; la historia se cuenta con lo que dicen los personajes en cada toma.
- Cada escena dura máximo 8 segundos: 1 a 3 líneas de diálogo cortas en total (unas 8 a 22 palabras entre todas), en español de México, naturales, números en palabras.
- Cada escena lleva "dialogo": [ { "quien": "Mamá", "texto": "...", "tono": "agotada pero cariñosa" } ] con los nombres de personaje iguales en todo el guion, y "voz" con las mismas líneas unidas, sin nombres (se usa para los subtítulos).
- El guion lleva "voces" (inglés): una descripción fija de la voz de cada personaje, que se repite en cada clip para que no cambie. Ej.: { "Mamá": "warm Mexican woman's voice in her 30s, soft and a little tired", "Niño": "bright 6-year-old Mexican boy's voice" }.
- El gancho (escena 1) ya es una línea hablada fuerte de 4 a 9 palabras.
- Evita en los diálogos y en las tomas lo que el filtro de Flow suele bloquear: peligro, heridas, gritos, pánico, llanto fuerte, un niño solo o en apuros. La emoción se muestra con calma (mirada, silencio, un abrazo).
- "flowPrompt" describe la acción y el plano, sin repetir las líneas habladas.`;

function armar(proyecto, { cambios = "", guionActual = null } = {}) {
  const estilo = leerEstilo(proyecto.estilo);
  const sistema = [
    `Eres guionista de videos para redes en español de México (neutro, natural, nada de España: nada de "vosotros", "vale", "ordenador").`,
    `Estilo del video: ${estilo.nombre}.`,
    instruccionesGuion(proyecto.estilo),
    REGLA_GANCHO,
    proyecto.opciones?.modo === "dialogos" ? REGLA_DIALOGOS : "",
    proyecto.segundos > 0
      ? `Formato: ${proyecto.formato}. Duración EXACTA pedida: unos ${proyecto.segundos} segundos de voz (± 10%), es decir, alrededor de ${Math.max(3, Math.round(proyecto.segundos / 5))} escenas. Esta indicación manda sobre cualquier otra duración que aparezca arriba.`
      : `Formato: ${proyecto.formato}. Duración: ${proyecto.duracion === "largo" ? estilo.duraciones?.largo || "6 a 10 minutos" : estilo.duraciones?.corto || "45 a 90 segundos"}.`,
    `Nunca inventes una cifra, estudio o fecha. Verifica cada dato con la búsqueda web en al menos 2 fuentes fiables y ponlas en "fuentes". Si un dato no se sostiene, usa otro que sí.`,
    FORMATO_SALIDA,
  ].join("\n\n");

  const pedido = guionActual
    ? `Este es el guion actual:\n${JSON.stringify(guionActual)}\n\nCámbialo así: ${cambios}\nMantén el resto igual.`
    : `Tema o idea del video: ${proyecto.idea || proyecto.titulo}${cambios ? `\nIndicaciones extra: ${cambios}` : ""}`;
  return { sistema, pedido };
}

export async function escribirGuion(proyecto, { cambios = "", guionActual = null } = {}) {
  if (!hayIA()) throw new Error("Falta GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el .env. También puedes pedirle el guion a Claude Code.");
  const est = leerEstilo(proyecto.estilo);
  const minutos = proyecto.segundos > 0 ? proyecto.segundos / 60 : proyecto.duracion === "largo" ? est.minutosLargo || 0 : 0;
  // videos largos (20-40 min): primero el índice de capítulos y luego cada capítulo, para no rebasar el tope de la IA
  if (est.guionPorPartes && minutos > 6 && !guionActual) return escribirLargo(proyecto, est, minutos, cambios);
  const { sistema, pedido } = armar(proyecto, { cambios, guionActual });

  const r = await pedir(sistema, pedido, { buscar: true });
  const g = extraerJSON(r.texto);
  // si la IA no puso fuentes pero sí buscó, se guardan las páginas que consultó
  if ((!g.fuentes || !g.fuentes.length) && r.fuentes?.length) g.fuentes = r.fuentes.slice(0, 6).map((x) => ({ dato: x.titulo || "Fuente consultada", url: x.url }));
  return g;
}

export function extraerJSON(texto) {
  let g;
  // los teléfonos y algunos chats cambian las comillas por “curvas”: se enderezan si el JSON no se deja leer así
  try { g = jsonDe(texto); } catch (e) { try { g = jsonDe(String(texto).replace(/[“”„«»]/g, '"')); } catch { throw e; } }
  if (!Array.isArray(g.escenas) || !g.escenas.length) throw new Error("El guion llegó sin escenas.");
  return g;
}

async function escribirLargo(proyecto, est, minutos, cambios) {
  const base = [
    `Eres guionista de videos largos de YouTube en español de México (neutro, natural, nada de España).`,
    `Estilo del video: ${est.nombre}.`, instruccionesGuion(proyecto.estilo), REGLA_GANCHO,
    `Nunca inventes una cifra, estudio, fecha ni cita. Si citas un texto clásico, que sea real y verificado con la búsqueda web.`,
  ].join("\n\n");
  const nCap = Math.max(3, Math.round(minutos / 5));
  const ind = jsonDe((await pedir(base + `\n\nAhora solo el ÍNDICE. Devuelve SOLO JSON: { "titulo", "estiloVisual" (inglés), "capitulos": [ { "titulo", "idea" (3-4 líneas: qué se cuenta, qué escena cotidiana o parábola, qué enseñanza), "minutos" } ], "fuentes": [ { "dato", "url" } ], "subir": { "titulo", "descripcion", "hashtags" } }`,
    `Tema o idea del video: ${proyecto.idea || proyecto.titulo}${cambios ? `\nIndicaciones extra: ${cambios}` : ""}\nDuración total: ${Math.round(minutos)} minutos de voz, en ${nCap} capítulos (el primero es la introducción con el gancho; el último, el cierre).`,
    { buscar: true })).texto);
  const escenas = [];
  for (const [k, c] of ind.capitulos.entries()) {
    const previas = escenas.slice(-3).map((e) => e.voz).join(" ");
    const r = await pedir(base + `\n\nEscribe SOLO el capítulo que se pide. Devuelve SOLO JSON: { "escenas": [ ... ] } con los campos de escena de las instrucciones. La primera escena lleva "capitulo": "${String(c.titulo).replace(/"/g, "'")}".`,
      `Video: ${ind.titulo}\nÍndice completo:\n${ind.capitulos.map((x, j) => `${j + 1}. ${x.titulo}: ${x.idea}`).join("\n")}\n\nEscribe el capítulo ${k + 1} de ${ind.capitulos.length}: "${c.titulo}" — ${c.idea}\nDuración: ${c.minutos || Math.round(minutos / ind.capitulos.length)} minutos de voz (unas ${Math.round((c.minutos || minutos / ind.capitulos.length) * 125)} palabras).${previas ? `\nAsí terminó el capítulo anterior (continúa sin repetir): "${previas}"` : ""}`,
      { maxTokens: 16000 });
    const cap = jsonDe(r.texto).escenas || [];
    if (cap[0]) cap[0].capitulo = cap[0].capitulo || c.titulo;
    escenas.push(...cap);
  }
  if (!escenas.length) throw new Error("La IA no devolvió escenas.");
  return { titulo: ind.titulo, estiloVisual: ind.estiloVisual || est.estiloVisual, escenas, fuentes: ind.fuentes || [], subir: ind.subir };
}
