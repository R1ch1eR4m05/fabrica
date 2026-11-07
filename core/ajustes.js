// Ajustes que se cambian desde el panel (sin tocar el .env ni reiniciar). Viven en ajustes.json (no se sube a GitHub).
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.js";

const F = path.join(RAIZ, "ajustes.json");
export const MODELOS_VOZ = {
  eleven_v4: "Eleven v4 · la más expresiva · 1 crédito por letra",
  eleven_v4_turbo: "Eleven v4 Turbo · casi igual, mitad de precio",
  eleven_multilingual_v2: "Multilingual v2 · estable · 1 crédito por letra",
  eleven_flash_v2_5: "Flash v2.5 · mitad de precio, más plana",
  google_chirp3: "Google Chirp 3 HD · casi gratis (1M letras/mes)",
};
export function leerAjustes() { try { return JSON.parse(fs.readFileSync(F, "utf8")); } catch { return {}; } }
export function guardarAjustes(cambios) {
  const a = { ...leerAjustes(), ...cambios };
  if (a.modeloVoz && !MODELOS_VOZ[a.modeloVoz]) delete a.modeloVoz;
  if (cambios.modeloPorEstilo) {
    a.modeloPorEstilo = { ...(leerAjustes().modeloPorEstilo || {}), ...cambios.modeloPorEstilo };
    for (const [k, v] of Object.entries(a.modeloPorEstilo)) if (!MODELOS_VOZ[v]) delete a.modeloPorEstilo[k];
  }
  if (cambios.vozPorEstilo) a.vozPorEstilo = { ...(leerAjustes().vozPorEstilo || {}), ...cambios.vozPorEstilo };
  fs.writeFileSync(F, JSON.stringify(a, null, 2));
  return a;
}
