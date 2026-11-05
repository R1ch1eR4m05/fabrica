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
}`;

export async function escribirGuion(proyecto, { cambios = "", guionActual = null } = {}) {
  if (!hayIA()) throw new Error("Falta GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el .env. También puedes pedirle el guion a Claude Code.");
  const estilo = leerEstilo(proyecto.estilo);
  const sistema = [
    `Eres guionista de videos para redes en español de México (neutro, natural, nada de España: nada de "vosotros", "vale", "ordenador").`,
    `Estilo del video: ${estilo.nombre}.`,
    instruccionesGuion(proyecto.estilo),
    `Formato: ${proyecto.formato}. Duración: ${proyecto.duracion === "largo" ? estilo.duraciones?.largo || "6 a 10 minutos" : estilo.duraciones?.corto || "45 a 90 segundos"}.`,
    `Nunca inventes una cifra, estudio o fecha. Verifica cada dato con la búsqueda web en al menos 2 fuentes fiables y ponlas en "fuentes". Si un dato no se sostiene, usa otro que sí.`,
    FORMATO_SALIDA,
  ].join("\n\n");

  const pedido = guionActual
    ? `Este es el guion actual:\n${JSON.stringify(guionActual)}\n\nCámbialo así: ${cambios}\nMantén el resto igual.`
    : `Tema o idea del video: ${proyecto.idea || proyecto.titulo}${cambios ? `\nIndicaciones extra: ${cambios}` : ""}`;

  const r = await pedir(sistema, pedido, { buscar: true });
  const g = extraerJSON(r.texto);
  // si la IA no puso fuentes pero sí buscó, se guardan las páginas que consultó
  if ((!g.fuentes || !g.fuentes.length) && r.fuentes?.length) g.fuentes = r.fuentes.slice(0, 6).map((x) => ({ dato: x.titulo || "Fuente consultada", url: x.url }));
  return g;
}

export function extraerJSON(texto) {
  const g = jsonDe(texto);
  if (!Array.isArray(g.escenas) || !g.escenas.length) throw new Error("El guion llegó sin escenas.");
  return g;
}
