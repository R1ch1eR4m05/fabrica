// Escribe el guion con la API de Claude (con búsqueda web para verificar datos).
// Si no hay ANTHROPIC_API_KEY, el panel le dice al usuario que se lo pida a Claude Code.
import { CFG } from "./config.js";
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
  if (!CFG.anthropicKey) throw new Error("Falta ANTHROPIC_API_KEY en el archivo .env. También puedes pedirle el guion a Claude Code.");
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

  let mensajes = [{ role: "user", content: pedido }];
  let ultima;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": CFG.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CFG.anthropicModelo,
        max_tokens: 16000,
        system: sistema,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        messages: mensajes,
      }),
    });
    if (!r.ok) throw new Error(`La API de Claude respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    ultima = await r.json();
    if (ultima.stop_reason !== "pause_turn") break;
    mensajes = [...mensajes, { role: "assistant", content: ultima.content }];
  }
  const texto = ultima.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return extraerJSON(texto);
}

export function extraerJSON(texto) {
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("La IA no devolvió el guion en el formato esperado. Intenta otra vez.");
  const g = JSON.parse(texto.slice(a, b + 1));
  if (!Array.isArray(g.escenas) || !g.escenas.length) throw new Error("El guion llegó sin escenas.");
  return g;
}
