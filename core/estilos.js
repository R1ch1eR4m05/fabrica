// Registro de estilos: cada carpeta de estilos/ con un estilo.json es un estilo.
// Para agregar uno nuevo basta con crear su carpeta (ver ESTILOS.md).
import fs from "node:fs";
import path from "node:path";
import { DIR_ESTILOS } from "./config.js";

export function listarEstilos() {
  return fs.readdirSync(DIR_ESTILOS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => leerEstilo(d.name))
    .filter(Boolean)
    .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
}

export function leerEstilo(id) {
  const dir = path.join(DIR_ESTILOS, id);
  const f = path.join(dir, "estilo.json");
  if (!fs.existsSync(f)) return null;
  const est = JSON.parse(fs.readFileSync(f, "utf8"));
  est.id = id;
  est.listo = est.estado !== "pronto" && (est.tipo === "motion" || fs.existsSync(path.join(dir, "plantilla.html")));
  const cat = path.join(dir, "catalogo.json");
  if (fs.existsSync(cat)) est.catalogo = JSON.parse(fs.readFileSync(cat, "utf8"));
  const ideas = path.join(dir, "ideas.json");
  est.ideas = fs.existsSync(ideas) ? JSON.parse(fs.readFileSync(ideas, "utf8")) : [];
  return est;
}

export function instruccionesGuion(id) {
  const f = path.join(DIR_ESTILOS, id, "GUION.md");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
}
