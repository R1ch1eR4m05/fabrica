// Conexión con Google Flow Skill (https://github.com/BRPLia/google-flow-skill-v1, MIT): CLI de Python que maneja Flow
// en tu Chrome y descarga los resultados. Solo en la compu con escritorio (tu laptop). Cada generación gasta créditos de Flow.
// Ventaja: lotes ordenados y encadenar imagen → video (personajes iguales en todas las escenas).
// Ojo: automatiza la página web de Flow; puede romperse si Google la cambia y puede ir contra sus términos.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG } from "./config.js";
import { dirProyecto } from "./proyectos.js";
import { leerAjustes } from "./ajustes.js";

export const MODELOS_VIDEO = ["Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality", "Omni 1.1 Flash"];
export const MODELOS_IMAGEN = ["Nano Banana 2 Lite", "Nano Banana 2", "Nano Banana Pro", "Imagen 4"];

export const flowSkillListo = () => !!(CFG.flowSkillDir && fs.existsSync(path.join(CFG.flowSkillDir, "flow.py")));
export const modelos = () => { const a = leerAjustes(); return { video: a.flowVideo || "Veo 3.1 - Lite", imagen: a.flowImagen || "Nano Banana 2 Lite" }; };

// Arreglos a la skill (MIT) para la página actual de Flow: ahora hay dos botones de ajustes en la página y la skill
// pedía "el" botón, así que Playwright se negaba (strict mode). Se aplican solos antes de cada lote; si la skill ya
// los trae, no se toca nada.
const PARCHES = [
  ["flow_provider/configure.py", "await page.locator(SEL_PANEL_TRIGGER).click(timeout=10_000)", 'await page.locator(", ".join(x.strip() + ":visible" for x in SEL_PANEL_TRIGGER.split(","))).first.click(timeout=10_000)'],
  ["flow_provider/browser.py", "await page.locator(SEL_SETTINGS_TRIGGER).wait_for(state=\"visible\", timeout=45_000)", 'await page.locator(", ".join(x.strip() + ":visible" for x in SEL_SETTINGS_TRIGGER.split(","))).first.wait_for(state="visible", timeout=45_000)'],
  ["flow_provider/project.py", "await page.locator(SEL_SETTINGS_TRIGGER).first.wait_for(", 'await page.locator(", ".join(x.strip() + ":visible" for x in SEL_SETTINGS_TRIGGER.split(","))).first.wait_for('],
];
export function parcharSkill() {
  let n = 0;
  for (const [rel, viejo, nuevo] of PARCHES) {
    const f = path.join(CFG.flowSkillDir, rel);
    try { const s = fs.readFileSync(f, "utf8"); if (s.includes(viejo)) { fs.writeFileSync(f, s.split(viejo).join(nuevo)); n++; } } catch {}
  }
  return n;
}
// del texto de error de Python, la línea que de verdad dice qué pasó
function errorLegible(salida) {
  const l = String(salida).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const clave = [...l].reverse().find((x) => /(Error|Exception|Timeout|violation|intercepts|not found|No se|FALL)/i.test(x) && !/^\s*File "/.test(x));
  return (clave || l.slice(-3).join(" ")).replace(/<[^>]{60,}>/g, "<…>").slice(0, 300);
}

// corre un lote; devuelve { nombre: archivo } de lo que salió bien y la lista de fallos
export function lote(id, nombre, jobs, avisar = () => {}, { minutos = 60 } = {}) {
  return new Promise((ok, mal) => {
    if (!flowSkillListo()) return mal(new Error("No encuentro Google Flow Skill. Pon FLOW_SKILL_DIR en el .env (la carpeta donde está flow.py) y haz 'python flow.py login' una vez."));
    try { parcharSkill(); } catch {}
    const m = modelos(), dir = path.join(dirProyecto(id), "flow");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `${nombre}.json`);
    fs.writeFileSync(archivo, JSON.stringify({ project: nombre, defaults: { ratio: "9:16", image_model: m.imagen, video_model: m.video, video_duration: "8s" }, jobs }, null, 2));
    const p = spawn(CFG.python || (process.platform === "win32" ? "python" : "python3"), ["flow.py", "batch", archivo, "--out", dir], { cwd: CFG.flowSkillDir, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let salida = "", hechos = 0;
    const t0 = Date.now();
    const reloj = setTimeout(() => { p.kill(); mal(new Error(`Flow tardó más de ${minutos} minutos.`)); }, minutos * 60000);
    const leerLinea = (txt) => {
      salida += txt;
      for (const l of String(txt).split(/\r?\n/)) {
        const mm = l.match(/--- \[(\d+)\/(\d+)\] (\w+) :: (.+?) ---/);
        if (mm) avisar({ progreso: Math.min(0.95, (Number(mm[1]) - 1) / Number(mm[2])), msg: `Flow ${mm[1]}/${mm[2]}: ${mm[3] === "video" ? "animando" : "imagen"} ${mm[4]} (${Math.round((Date.now() - t0) / 60000)} min)` });
        if (/^\s*OK ->/.test(l)) hechos++;
        if (/SIN SESION/.test(l)) mal(new Error("Flow no tiene sesión: en la carpeta de la skill corre 'python flow.py login' e inicia sesión en Google."));
      }
    };
    p.stdout.on("data", leerLinea); p.stderr.on("data", (d) => (salida += d));
    p.on("error", (e) => { clearTimeout(reloj); mal(new Error(`No pude abrir Python (${e.message}). ¿Está instalado? Puedes poner PYTHON=ruta en el .env.`)); });
    p.on("close", () => {
      clearTimeout(reloj);
      const rep = path.join(dir, nombre, "batch_report.json");
      try { fs.writeFileSync(path.join(dir, `${nombre}.log`), salida); } catch {}
      if (!fs.existsSync(rep)) return mal(new Error(`Flow falló: ${errorLegible(salida)} (detalle completo en proyectos/${id}/flow/${nombre}.log)`));
      const r = JSON.parse(fs.readFileSync(rep, "utf8"));
      const archivos = Object.fromEntries(r.filter((x) => x.ok && x.file).map((x) => [x.name, path.isAbsolute(x.file) ? x.file : path.join(CFG.flowSkillDir, x.file)]));
      ok({ archivos, fallos: r.filter((x) => !x.ok).map((x) => `${x.name}: ${x.error}`) });
    });
  });
}
