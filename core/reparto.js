// Reparto fijo por marca (reparto/<marca>.json): personajes guardados en un proyecto fijo de Google Flow.
// En el guion cada personaje se llama con @Nombre en el flowPrompt; al mandarlo a Flow se convierte en una mención real
// (el chip de @ del panel del agente), así Flow usa la cara, la ropa y la voz guardadas y salen iguales en todos los videos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "reparto");

export function leerReparto(marca) {
  if (!marca || marca === "ninguna") return null;
  try { const r = JSON.parse(fs.readFileSync(path.join(DIR, `${marca}.json`), "utf8")); return r.flowProyecto && r.personajes?.length ? r : null; } catch { return null; }
}
export const repartoDe = (proyecto) => leerReparto(proyecto?.opciones?.marca || "levania");

// texto para la IA del guion
export function reglaReparto(r) {
  return `REPARTO FIJO (manda sobre cualquier otra indicación de personajes): la historia usa SOLO estos personajes, ya guardados en Google Flow:
${r.personajes.map((p) => `- ${p.nombre}: ${p.descripcion}`).join("\n")}
- En cada "flowPrompt" (inglés) llama a cada personaje que sale en la toma escribiendo @ y su nombre exacto (ej.: "@Mamá kneels to fix the backpack of @Hijo at the school gate, medium shot, slow push-in"). No describas su cara, pelo ni ropa: Flow ya los tiene.
- Si en "dialogo" habla un personaje, "quien" es su nombre exacto del reparto.
- Gente extra (otros niños, vecinos) solo de fondo y sin nombre. No inventes personajes principales nuevos.
- No hace falta el campo "personajes" del guion.`;
}

// @Nombre (del reparto) → @{Nombre}: la marca que la skill de Flow convierte en mención. Se buscan primero los nombres largos.
export function conMenciones(texto, r) {
  if (!r || !texto) return texto;
  let s = String(texto);
  for (const n of r.personajes.map((p) => p.nombre).sort((a, b) => b.length - a.length))
    s = s.replace(new RegExp(`@\\{?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}?(?![\\p{L}\\d])`, "gu"), `@{${n}}`);
  return s;
}
export const sinMenciones = (texto) => String(texto || "").replace(/@\{([^}]+)\}/g, "$1").replace(/@(\p{L}+)/gu, "$1");
export const usaReparto = (g, r) => !!r && (g?.escenas || []).some((e) => /@\p{L}/u.test(e.flowPrompt || ""));
