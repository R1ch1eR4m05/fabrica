// Proyectos precargados: cada estilo puede traer ejemplos en estilos/<id>/ejemplos/*.json
// ({ titulo, formato, duracion, idea, opciones, guion }). La primera vez que abres el panel (o con `node fabrica.js precargar`)
// se crean como proyectos con el guion listo. Se anotan en proyectos/.precargados.json: si luego borras uno, no vuelve a aparecer.
// Los proyectos no van en GitHub (Actualizar te los pisaría), por eso se crean aquí y no se descargan hechos.
import fs from "node:fs";
import path from "node:path";
import { DIR_ESTILOS, DIR_PROYECTOS } from "./config.js";
import * as P from "./proyectos.js";

const REGISTRO = path.join(DIR_PROYECTOS, ".precargados.json");

export function precargar() {
  let hechos = [];
  try { hechos = JSON.parse(fs.readFileSync(REGISTRO, "utf8")); } catch {}
  const nuevos = [];
  const estilos = fs.readdirSync(DIR_ESTILOS, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_"));
  for (const est of estilos) {
    const dir = path.join(DIR_ESTILOS, est.name, "ejemplos");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const clave = `${est.name}/${f}`;
      if (hechos.includes(clave)) continue;
      try {
        const ej = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const p = P.crearProyecto({ estilo: est.name, titulo: ej.titulo, formato: ej.formato || "9:16", duracion: ej.duracion || "corto", idea: ej.idea || "", opciones: ej.opciones || {}, conVoz: ej.conVoz !== false });
        P.guardar(p.id, "guion.json", ej.guion);
        P.marcar(p.id, "guion", "listo");
        hechos.push(clave); nuevos.push(p.id);
      } catch (e) { console.error(`  No pude precargar ${clave}: ${e.message}`); }
    }
  }
  if (nuevos.length) fs.writeFileSync(REGISTRO, JSON.stringify(hechos, null, 1));
  return nuevos;
}
