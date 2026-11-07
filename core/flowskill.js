// Conexión con Google Flow Skill (https://github.com/BRPLia/google-flow-skill-v1, MIT): CLI de Python que maneja Flow
// en tu Chrome y descarga los resultados. Solo en la compu con escritorio (tu laptop). Cada generación gasta créditos de Flow.
// Ventaja: lotes ordenados y encadenar imagen → video (personajes iguales en todas las escenas).
// Ojo: automatiza la página web de Flow; puede romperse si Google la cambia y puede ir contra sus términos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { CFG } from "./config.js";
import { dirProyecto } from "./proyectos.js";
import { leerAjustes } from "./ajustes.js";

export const MODELOS_VIDEO = ["Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality", "Omni 1.1 Flash"];
export const MODELOS_IMAGEN = ["Nano Banana 2 Lite", "Nano Banana 2", "Nano Banana Pro", "Imagen 4"];

export const flowSkillListo = () => !!(CFG.flowSkillDir && fs.existsSync(path.join(CFG.flowSkillDir, "flow.py")));
export const modelos = () => { const a = leerAjustes(); return { video: a.flowVideo || "Veo 3.1 - Lite", imagen: a.flowImagen || "Nano Banana 2 Lite" }; };

// Arreglos a la skill (MIT) para el Flow nuevo (noviembre 2026: se genera desde el panel del agente).
// Se copian core/flow-compat/agente.py a la skill y se enganchan 5 puntos. Se aplican solos antes de cada lote;
// si ya están, no se toca nada. Si Google vuelve a cambiar Flow, los selectores están juntos en agente.py.
const COMPAT = path.join(path.dirname(fileURLToPath(import.meta.url)), "flow-compat", "agente.py");
const VIS = (s) => `", ".join(x.strip() + ":visible" for x in ${s}.split(","))`;
const PARCHES = [
  // página lista: también vale el panel del agente
  ["flow_provider/project.py", [`await page.locator(SEL_SETTINGS_TRIGGER).first.wait_for(state="visible", timeout=15_000)`, `await page.locator(${VIS("SEL_SETTINGS_TRIGGER")}).first.wait_for(state="visible", timeout=15_000)`],
    `from .agente import esperar_listo; await esperar_listo(page, timeout=30_000)`],
  ["flow_provider/browser.py", [`await page.locator(SEL_SETTINGS_TRIGGER).wait_for(state="visible", timeout=45_000)`, `await page.locator(${VIS("SEL_SETTINGS_TRIGGER")}).first.wait_for(state="visible", timeout=45_000)`],
    `from .agente import esperar_listo; await esperar_listo(page, timeout=45_000)`],
  // el botón de ajustes viejo, si aparece dos veces
  ["flow_provider/configure.py", [`await page.locator(SEL_PANEL_TRIGGER).click(timeout=10_000)`], `await page.locator(${VIS("SEL_PANEL_TRIGGER")}).first.click(timeout=10_000)`],
  // imagen y video: con agente se configura desde "Configuración de agentes"
  ["flow_provider/configure.py", [`"""Abre el panel y configura modo IMAGE usando los selectores exactos del DOM de Flow. Debe llamarse con lock."""
    page = await get_page()`],
    `"""Abre el panel y configura modo IMAGE usando los selectores exactos del DOM de Flow. Debe llamarse con lock."""
    page = await get_page()
    from .agente import es_agente, configurar
    if await es_agente(page):
        return await configurar(page, "imagen", aspect_ratio, count, model)`],
  ["flow_provider/configure.py", [`    from playwright.async_api import expect
    page = await get_page()
    panel = await _open_settings(page)`],
    `    from playwright.async_api import expect
    page = await get_page()
    from .agente import es_agente, configurar
    if await es_agente(page):
        if mode != "texto":
            raise RuntimeError("El Flow nuevo (con agente) todavía no está adaptado para video desde fotogramas o ingredientes; solo video de texto.")
        return await configurar(page, "video", aspect_ratio, count, model)
    panel = await _open_settings(page)`],
  // con agente, el prompt va envuelto para que genere 1 sin reescribirlo
  ["flow_provider/prompt.py", [`"""Escribe el prompt y hace click en submit. Debe llamarse con lock."""
    page = await get_page()`],
    `"""Escribe el prompt y hace click en submit. Debe llamarse con lock."""
    page = await get_page()
    from .agente import envolver
    prompt = await envolver(page, prompt)`],
];
export function parcharSkill() {
  let n = 0;
  try { // agente.py siempre en su última versión
    const dest = path.join(CFG.flowSkillDir, "flow_provider", "agente.py");
    const nuevo = fs.readFileSync(COMPAT, "utf8");
    if (!fs.existsSync(dest) || fs.readFileSync(dest, "utf8") !== nuevo) { fs.writeFileSync(dest, nuevo); n++; }
  } catch (e) { console.warn("Flow compat:", e.message); }
  for (const [rel, viejos, nuevo] of PARCHES) {
    const f = path.join(CFG.flowSkillDir, rel);
    try {
      let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      if (s.includes(nuevo)) continue;
      const v = viejos.find((x) => s.includes(x)); if (!v) { console.warn(`Flow compat: no encontré dónde parchar ${rel}`); continue; }
      fs.writeFileSync(f, s.split(v).join(nuevo)); n++;
    } catch {}
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
      // casi siempre que Flow falla así es porque Google cambió la página: se avisa para adaptarla
      const cambio = /Timeout|locator|selector|no encontr|strict mode|not visible|intercepts/i.test(salida);
      if (!fs.existsSync(rep)) return mal(new Error(`Flow falló: ${errorLegible(salida)}.${cambio ? " Parece que Google cambió la página de Flow: abre Claude Code en la fábrica y dile \"adapta Flow\"." : ""} (detalle en proyectos/${id}/flow/${nombre}.log)`));
      const r = JSON.parse(fs.readFileSync(rep, "utf8"));
      const archivos = Object.fromEntries(r.filter((x) => x.ok && x.file).map((x) => [x.name, path.isAbsolute(x.file) ? x.file : path.join(CFG.flowSkillDir, x.file)]));
      ok({ archivos, fallos: r.filter((x) => !x.ok).map((x) => `${x.name}: ${x.error}`) });
    });
  });
}
