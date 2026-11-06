// Ajustes que se cambian desde el panel (sin tocar el .env ni reiniciar). Viven en ajustes.json (no se sube a GitHub).
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.js";

const F = path.join(RAIZ, "ajustes.json");
export const MODELOS_VOZ = { eleven_multilingual_v2: "Multilingual v2 (estable, entonación pareja entre escenas)", eleven_v4: "Eleven v4 (la más nueva y expresiva)", eleven_flash_v2_5: "Flash v2.5 (rápida y más barata)" };
export function leerAjustes() { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return {}; } }
export function guardarAjustes(cambios) {
  const a = { ...leerAjustes(), ...cambios };
  if (a.modeloVoz && !MODELOS_VOZ[a.modeloVoz]) delete a.modeloVoz;
  fs.writeFileSync(F, JSON.stringify(a, null, 2));
  return a;
}
