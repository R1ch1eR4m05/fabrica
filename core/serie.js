// Series: cada video de una marca pertenece a una serie fija y numerada ("Actitudes de Acero #4").
// La lista de series vive en proyectos/.series.json (no va a GitHub: Actualizar hace reset --hard).
// El número se asigna una sola vez por video y no cambia aunque se vuelva a renderizar.
import fs from "node:fs";
import path from "node:path";
import { DIR_PROYECTOS } from "./config.js";
import { leer, guardar, listarProyectos } from "./proyectos.js";

const F = path.join(DIR_PROYECTOS, ".series.json");
// series con que nace cada marca (Richie eligió "Actitudes de Acero" para Monarca, nov 2026)
const INICIALES = { monarca: ["Actitudes de Acero"] };

// de qué marca es un video (mismo criterio que el panel: Estatuas o canal/nicho Monarca = Monarca)
export const marcaDe = (p) => (p?.estilo === "reflexion-estatuas" || /monarca/i.test(`${p?.canal || ""} ${p?.nicho || ""}`) ? "monarca" : p?.nicho || "levania");

export function leerSeries() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(F, "utf8")); } catch {}
  for (const [m, l] of Object.entries(INICIALES)) if (!s[m]?.length) s[m] = [...l];
  return s;
}
export function agregarSerie(marca, nombre) {
  const s = leerSeries(); nombre = String(nombre || "").trim(); if (!nombre) throw new Error("Falta el nombre de la serie.");
  s[marca] = [...new Set([...(s[marca] || []), nombre])]; fs.writeFileSync(F, JSON.stringify(s, null, 2)); return s[marca];
}
export const seriesDe = (marca) => leerSeries()[marca] || [];
// ¿la marca exige serie? (las que tienen al menos una serie registrada)
export const exigeSerie = (marca) => seriesDe(marca).length > 0;

// asigna serie y número al video si aún no tiene (la primera serie de su marca, o la que se pida)
export function asignarSerie(id, nombre) {
  const p = leer(id, "proyecto.json"); if (!p) throw new Error("No existe ese video.");
  const marca = marcaDe(p), lista = seriesDe(marca);
  if (p.serie?.nombre && p.serie?.numero && (!nombre || nombre === p.serie.nombre)) return p.serie;
  const elegida = nombre || lista[0]; if (!elegida) return null;
  if (!lista.includes(elegida)) agregarSerie(marca, elegida);
  const usados = listarProyectos().filter((q) => q.id !== id && q.serie?.nombre === elegida).map((q) => Number(q.serie.numero) || 0);
  p.serie = { nombre: elegida, numero: (usados.length ? Math.max(...usados) : 0) + 1, marca };
  guardar(id, "proyecto.json", p);
  return p.serie;
}
export const etiquetaSerie = (s) => (s?.nombre ? `${s.nombre} #${s.numero}` : "");
