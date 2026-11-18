// Cola automática de publicación (nov 2026): los videos con QA aprobado toman el siguiente hueco libre del calendario
// y se programan en GHL. Siempre en dos pasos: 1) simular (dry-run, no publica) → plan en listos/cola-<marca>.json;
// 2) confirmar → programa EXACTAMENTE ese plan. Idempotente: lo que ya está en el registro no se repite.
// Calendario por defecto (hora de Ciudad de México, sin horario de verano desde 2022 = UTC-6):
//   Short/Reel: lunes a viernes, DOS por día, a las 13:00 y a las 19:00 (nov 2026) · Video largo: uno por semana, el primer día hábil libre a las 16:00
//   (antes iba a las 13:00; se movió para no chocar con el Short de esa hora en YouTube y Facebook).
// Se cambia en ajustes.json → "calendario": { "short": { "dias": [1,2,3,4,5], "horas": ["13:00","19:00"] }, "largo": { "dias": [1,2,3,4,5], "hora": "16:00", "porSemana": 1 } }
// ("hora": "19:00" sola también sirve: un Short por día).
import fs from "node:fs";
import path from "node:path";
import { DIR_LISTOS } from "./config.js";
import { leerAjustes, guardarAjustes } from "./ajustes.js";
import { listarProyectos, dirProyecto, leer } from "./proyectos.js";
import { marcaDe } from "./serie.js";
import * as GHL from "./ghl.js";
import { qaVigente, qaVideo } from "./qa.js";

const CAL_BASE = { short: { dias: [1, 2, 3, 4, 5], horas: ["13:00", "19:00"] }, largo: { dias: [1, 2, 3, 4, 5], horas: ["16:00"], porSemana: 1 } };
const OFFSET = "-06:00"; // Ciudad de México
const fPlan = (marca) => path.join(DIR_LISTOS, `cola-${marca}.json`);
const conHoras = (base, c = {}) => { const horas = Array.isArray(c.horas) && c.horas.length ? c.horas : c.hora ? [c.hora] : base.horas; return { ...base, ...c, horas: [...horas].sort() }; };
export const calendario = () => { const c = leerAjustes().calendario || {}; return { short: conHoras(CAL_BASE.short, c.short), largo: conHoras(CAL_BASE.largo, c.largo) }; };

// cuentas de GHL de la marca: ajustes.json → "ghlCuentas": { "monarca": ["id", …] }, o las que se llaman como la marca
export async function cuentasDe(marca, tipo) {
  const todas = (await GHL.cuentas()).filter((a) => !a.caducada);
  const fijas = leerAjustes().ghlCuentas?.[marca];
  let l = fijas?.length ? todas.filter((a) => fijas.includes(a.id)) : todas.filter((a) => new RegExp(marca, "i").test(a.nombre));
  if (tipo === "largo") l = l.filter((a) => /youtube|facebook/.test(a.plataforma)); // el largo va a YouTube y a Facebook (nativo)
  return l;
}

const tipoDe = (p) => (p.formato === "16:9" && (p.duracion === "largo" || p.estilo === "filosofia-larga") ? "largo" : "short");
// fecha (YYYY-MM-DD) + hora local CDMX → Date
const enHora = (dia, hora) => new Date(`${dia}T${hora}:00${OFFSET}`);
const diaCDMX = (d) => new Date(d.getTime() - 6 * 3600e3).toISOString().slice(0, 10);
const horaCDMX = (d) => new Date(d.getTime() - 6 * 3600e3).toISOString().slice(11, 16);
// lo ya programado, por tipo → día → horas (CDMX)
function ocupacion(regs) {
  const oc = { short: new Map(), largo: new Map() }, semanasLargo = new Map();
  for (const r of regs) {
    const p = leer(r.id, "proyecto.json"), t = p ? tipoDe(p) : "short", f = new Date(r.publica), d = diaCDMX(f);
    if (!oc[t].has(d)) oc[t].set(d, new Set());
    oc[t].get(d).add(horaCDMX(f));
    if (t === "largo") semanasLargo.set(semana(d), (semanasLargo.get(semana(d)) || 0) + 1);
  }
  return { oc, semanasLargo };
}
// huecos del calendario desde "desde": cada día válido da una entrada por hora libre (un día no recibe más publicaciones que horas tiene)
function huecosCal(cal, oc, tipo, dias, desde) {
  const out = [];
  for (let k = 0; k <= dias; k++) {
    const dia = diaCDMX(new Date(Date.now() + k * 864e5));
    if (!cal[tipo].dias.includes(diaSemana(dia))) continue;
    const usadas = oc[tipo].get(dia) || new Set(); let libres = cal[tipo].horas.length - usadas.size;
    for (const hora of cal[tipo].horas) {
      if (libres <= 0) break;
      const f = enHora(dia, hora); if (f.getTime() <= desde || usadas.has(hora)) continue;
      out.push({ dia, hora, fecha: f }); libres--;
    }
  }
  return out;
}
const diaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
const semana = (dia) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export async function armarPlan(marca = "monarca", { dias = 14, max = 20 } = {}) {
  const cal = calendario(), reg = GHL.leerRegistro();
  const cuentasMarca = new Set((await cuentasDe(marca)).map((a) => a.id));
  // huecos ya ocupados por lo programado de esta marca (por día, hora y tipo); una publicación = un video (no una por cuenta)
  const regMarca = reg.filter((x) => x.estado === "programado" && cuentasMarca.has(x.cuenta));
  const { oc, semanasLargo } = ocupacion([...new Map(regMarca.map((x) => [`${x.id}|${x.publica}`, x])).values()]);
  // candidatos: de la marca, con video, QA aprobado y sin programar (por id o por archivo)
  const yaProgramados = new Set(reg.filter((x) => x.estado === "programado").map((x) => x.id));
  for (const p of listarProyectos()) if (p.ghl?.programados?.length) yaProgramados.add(p.id); // programados antes del registro
  const cand = [];
  for (const p of listarProyectos()) {
    if (marcaDe(p) !== marca || yaProgramados.has(p.id) || !fs.existsSync(path.join(dirProyecto(p.id), "final.mp4"))) continue;
    let q = qaVigente(p.id); if (!q) { try { q = await qaVideo(p.id); } catch { continue; } }
    cand.push({ p, q, mtime: fs.statSync(path.join(dirProyecto(p.id), "final.mp4")).mtimeMs });
  }
  cand.sort((a, b) => a.mtime - b.mtime);
  const rechazados = cand.filter((c) => !c.q.aprobado).map((c) => ({ id: c.p.id, motivos: c.q.motivos }));
  // huecos libres desde ahora (+30 min de margen)
  const desde = Date.now() + 30 * 60000, plan = [];
  const libresShort = huecosCal(cal, oc, "short", dias, desde), libresLargo = huecosCal(cal, oc, "largo", dias, desde);
  for (const c of cand.filter((x) => x.q.aprobado)) {
    if (plan.length >= max) break;
    const tipo = tipoDe(c.p);
    let h = null;
    if (tipo === "short") h = libresShort.shift();
    else { const i = libresLargo.findIndex((x) => (semanasLargo.get(semana(x.dia)) || 0) < cal.largo.porSemana); if (i >= 0) { h = libresLargo.splice(i, 1)[0]; semanasLargo.set(semana(h.dia), (semanasLargo.get(semana(h.dia)) || 0) + 1); } }
    if (!h) continue;
    const cuentas = await cuentasDe(marca, tipo);
    if (!cuentas.length) throw new Error(`No encuentro cuentas de GHL de ${marca}. Ponlas en ajustes.json → "ghlCuentas": { "${marca}": ["id", …] }.`);
    plan.push({ id: c.p.id, tipo, titulo: c.q.titulo, serie: c.q.serie, fecha: h.fecha.toISOString(), cuando: GHL.enCDMX(h.fecha), cuentas: cuentas.map((a) => a.id), redes: cuentas.map((a) => `${a.plataforma} (${a.nombre})`) });
  }
  return { plan, rechazados };
}

// paso 1: simular (dry-run en GHL por cada video) y guardar el plan
export async function simularCola(marca = "monarca", op = {}, avisar = () => {}) {
  // el panel manda las cuentas que tiene asignadas a la marca: se guardan para que la línea de comandos use las mismas
  if (Array.isArray(op.cuentas) && op.cuentas.length) { const a = leerAjustes(); guardarAjustes({ ...a, ghlCuentas: { ...(a.ghlCuentas || {}), [marca]: op.cuentas } }); }
  const { plan, rechazados } = await armarPlan(marca, op);
  for (const [i, x] of plan.entries()) {
    avisar({ progreso: i / Math.max(1, plan.length), msg: `Simulando ${x.id}…` });
    x.simulacion = await GHL.programar(x.id, { cuentasIds: x.cuentas, fecha: x.fecha, simular: true });
  }
  const r = { creado: new Date().toISOString(), marca, plan, rechazados };
  fs.writeFileSync(fPlan(marca), JSON.stringify(r, null, 2));
  return r;
}

// paso 2: programar exactamente el plan simulado (máx. 24 h de antigüedad)
export async function confirmarCola(marca = "monarca", avisar = () => {}) {
  let r; try { r = JSON.parse(fs.readFileSync(fPlan(marca), "utf8")); } catch { throw new Error("No hay plan simulado. Primero simula la cola."); }
  if (Date.now() - new Date(r.creado).getTime() > 24 * 3600e3) throw new Error("El plan simulado tiene más de 24 h. Simula otra vez.");
  const hechos = [];
  for (const [i, x] of r.plan.entries()) {
    avisar({ progreso: i / Math.max(1, r.plan.length), msg: `Programando ${x.id} (${x.cuando})…` });
    try { hechos.push({ id: x.id, cuando: x.cuando, programados: await GHL.programar(x.id, { cuentasIds: x.cuentas, fecha: x.fecha }) }); }
    catch (e) { hechos.push({ id: x.id, cuando: x.cuando, error: e.message }); }
  }
  fs.rmSync(fPlan(marca), { force: true });
  return hechos;
}
export const leerPlan = (marca = "monarca") => { try { return JSON.parse(fs.readFileSync(fPlan(marca), "utf8")); } catch { return null; } };

// huecos libres del calendario (sin consultar GHL): para proponer horario a un plan antes de que exista el video.
// ocupados = lo ya programado en el registro (cualquier cuenta) por tipo y día.
export function huecosLibres({ short = 0, largo = 0 } = {}, { dias = 21, desde = Date.now() + 30 * 60000 } = {}) {
  const cal = calendario(), reg = GHL.leerRegistro().filter((x) => x.estado === "programado");
  const { oc, semanasLargo } = ocupacion([...new Map(reg.map((x) => [`${x.id}|${x.publica}`, x])).values()]);
  const out = { short: [], largo: [] };
  for (const tipo of ["short", "largo"]) {
    const n = tipo === "short" ? short : largo;
    for (const h of huecosCal(cal, oc, tipo, dias, desde)) {
      if (out[tipo].length >= n) break;
      if (tipo === "largo") { if ((semanasLargo.get(semana(h.dia)) || 0) >= cal.largo.porSemana) continue; semanasLargo.set(semana(h.dia), (semanasLargo.get(semana(h.dia)) || 0) + 1); }
      out[tipo].push({ fecha: h.fecha.toISOString(), cuando: GHL.enCDMX(h.fecha) });
    }
  }
  return out;
}
