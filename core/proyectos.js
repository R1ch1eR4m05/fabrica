// Proyectos: cada video vive en proyectos/<id>/
//   proyecto.json  datos y estado
//   guion.json     escenas (lo escribe la IA, Claude Code o tú en el panel)
//   voz.mp3 + tiempos.json
//   final.mp4
import fs from "node:fs";
import path from "node:path";
import { DIR_PROYECTOS } from "./config.js";

export const dirProyecto = (id) => path.join(DIR_PROYECTOS, id);
const archivo = (id, f) => path.join(dirProyecto(id), f);

export function slug(txt) {
  return (txt || "video").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
}

export function crearProyecto({ estilo, titulo, formato = "9:16", duracion = "corto", idea = "", conVoz = true, opciones = {}, segundos = null }) {
  let id = slug(titulo || idea);
  let n = 2;
  while (fs.existsSync(dirProyecto(id))) id = `${slug(titulo || idea)}-${n++}`;
  fs.mkdirSync(dirProyecto(id), { recursive: true });
  const p = {
    id, estilo, titulo: titulo || idea.slice(0, 60), formato, duracion, segundos: Number(segundos) > 0 ? Math.round(Number(segundos)) : null, idea, conVoz, opciones,
    creado: new Date().toISOString(),
    estado: { guion: "pendiente", voz: "pendiente", render: "pendiente" },
  };
  guardar(id, "proyecto.json", p);
  return p;
}

export function listarProyectos() {
  return fs.readdirSync(DIR_PROYECTOS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(archivo(d.name, "proyecto.json")))
    .map((d) => leer(d.name, "proyecto.json"))
    .sort((a, b) => b.creado.localeCompare(a.creado));
}

export function leer(id, f) {
  const r = archivo(id, f);
  return fs.existsSync(r) ? JSON.parse(fs.readFileSync(r, "utf8")) : null;
}

export function guardar(id, f, datos) {
  fs.writeFileSync(archivo(id, f), JSON.stringify(datos, null, 2));
}

export function existe(id, f) { return fs.existsSync(archivo(id, f)); }

export function marcar(id, paso, valor, extra = {}) {
  const p = leer(id, "proyecto.json");
  p.estado[paso] = valor;
  if (valor === "listo" || valor === "trabajando") delete p.error; // el error viejo ya no aplica
  Object.assign(p, extra);
  // si cambia un paso, los siguientes quedan desactualizados
  const orden = ["guion", "voz", "render"];
  const despues = paso === "fondo" || paso === "musica" ? ["render"] : orden.includes(paso) ? orden.slice(orden.indexOf(paso) + 1) : [];
  if (valor === "listo") for (const s of despues) if (p.estado[s] === "listo") p.estado[s] = "desactualizado";
  guardar(id, "proyecto.json", p);
  return p;
}

export function detalle(id) {
  const p = leer(id, "proyecto.json");
  if (!p) return null;
  return {
    ...p,
    guion: leer(id, "guion.json"),
    tiempos: leer(id, "tiempos.json"),
    tieneVoz: existe(id, "voz.mp3"),
    tieneFinal: existe(id, "final.mp4"),
    miniaturas: (() => { try { return JSON.parse(fs.readFileSync(path.join(dirProyecto(id), "miniaturas", "miniaturas.json"), "utf8")); } catch { return null; } })(),
    cortes: (() => { try { return JSON.parse(fs.readFileSync(path.join(dirProyecto(id), "capitulos", "cortes.json"), "utf8")); } catch { return []; } })(),
    fondo: leer(id, "fondo.json"),
    archivos: fs.readdirSync(dirProyecto(id)).filter((n) => /^(fondo-propio|musica)\./.test(n)),
  };
}

// Texto que se manda a la voz: las escenas en orden
// (los *asteriscos* marcan la palabra destacada en pantalla; no se leen)
export function textoEscena(e) { return (e.voz ?? e.texto ?? "").replace(/[*_]/g, "").trim(); }
