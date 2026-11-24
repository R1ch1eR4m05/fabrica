// Efectos de sonido del banco de earshot (MIT, ver core/extras.js): golpe en el gancho, whoosh en cada cambio de
// escena y un swell al cierre, alineados al corte (el punto más fuerte del sonido cae justo en el cambio).
// Se renderizan una vez y quedan en cache/sfx/. Sin earshot instalado no pasa nada: el video sale sin estos efectos.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RAIZ } from "./config.js";
import { hayExtra, PY } from "./extras.js";

const DIR = path.join(RAIZ, "cache", "sfx");
const nombre = (id, o) => `${id.replace(/[^\w]+/g, "_")}${o.dur ? `-d${o.dur}` : ""}${o.apex ? `-a${o.apex}` : ""}.wav`;

// un sonido del banco → { archivo, pico } (pico = segundos desde el inicio hasta lo más fuerte)
export async function sonido(id, { dur, apex } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const f = path.join(DIR, nombre(id, { dur, apex })), meta = f.replace(/\.wav$/, ".json");
  if (fs.existsSync(f) && fs.existsSync(meta)) return { archivo: f, ...JSON.parse(fs.readFileSync(meta, "utf8")) };
  if (!(await hayExtra("earshot"))) return null;
  const args = ["-m", "earshot", "sfx", "render", id, "-o", f, "--json", "--peak", "-3", ...(dur ? ["--dur", String(dur)] : []), ...(apex ? ["--apex", String(apex)] : [])];
  const salida = await new Promise((ok) => {
    const p = spawn(PY(), args, { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let o = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d));
    p.on("error", (e) => ok({ c: -1, o: e.message })); p.on("close", (c) => ok({ c, o }));
  });
  if (salida.c !== 0 || !fs.existsSync(f)) { console.warn(`  · Efecto ${id}: ${salida.o.trim().split("\n").pop()}`); return null; }
  // el JSON de earshot trae onset/peak/end en segundos; si no se puede leer, se usa el apex pedido
  let pico = apex ?? 0;
  try { const j = JSON.parse(salida.o.slice(salida.o.indexOf("{"))); pico = j.peak_s ?? j.meta?.peak_s ?? j.take?.peak_s ?? pico; } catch {}
  fs.writeFileSync(meta, JSON.stringify({ pico }));
  return { archivo: f, pico };
}

// plan de efectos de un video: [{ archivo, inicio (s), volumen }]
// plan = estilo.sonido.earshot: { gancho, cambios: [ids], cierre, volumen, volumenCambio }
export async function planEfectos(plan, tiempos, { golpeEn = 0, extra = [] } = {}) {
  if (!plan || !(await hayExtra("earshot"))) return [];
  const out = [], esc = tiempos.escenas || [], vol = plan.volumen ?? 0.45;
  const poner = async (id, enCorte, o = {}, v = vol) => {
    const s = await sonido(id, o); if (!s) return;
    out.push({ archivo: s.archivo, inicio: Math.max(0, enCorte - (s.pico || 0)), volumen: v });
  };
  // gancho: el golpe arranca con el video (lo más fuerte en el primer cuadro)
  if (plan.gancho) await poner(plan.gancho, golpeEn, { dur: plan.durGancho ?? 1.8 });
  if (golpeEn > 2 && plan.cierre) await poner(plan.cierre, golpeEn, { dur: 2.2 }, vol * 0.8); // subida que remata en el golpe
  // cambios de escena: se alternan los whooshes; el pico cae en el corte. El último cambio lleva el swell de cierre.
  const cambios = [].concat(plan.cambios || []);
  for (let k = 1; k < esc.length; k++) {
    const corte = esc[k].ini;
    if (golpeEn && Math.abs(corte - golpeEn) < 0.05) continue; // ahí ya está el golpe
    if (k === esc.length - 1 && plan.cierre) { await poner(plan.cierre, corte, { dur: plan.durCierre ?? 1.6 }, vol * 0.9); continue; }
    if (!cambios.length) continue;
    await poner(cambios[(k - 1) % cambios.length], corte, { dur: plan.durCambio ?? 1.2, apex: plan.apexCambio ?? 0.8 }, plan.volumenCambio ?? vol * 0.6);
  }
  // golpes extra (ráfaga: cada número que cuenta, el logo del cierre)
  for (const x of extra) await poner(x.id, x.t, { dur: x.dur ?? 1.4 }, x.volumen ?? vol);
  return out;
}
