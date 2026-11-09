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
  // nov 2026: al crear proyecto la página nueva nunca dispara "load" a tiempo; basta con que cambie la URL
  ["flow_provider/project.py", [`await page.wait_for_url("**/project/**", timeout=15000)`], `await page.wait_for_url("**/project/**", timeout=60000, wait_until="commit")`],
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
    panel = await _open_settings(page)`, `    from .agente import es_agente, configurar
    if await es_agente(page):
        if mode != "texto":
            raise RuntimeError("El Flow nuevo (con agente) todavía no está adaptado para video desde fotogramas o ingredientes; solo video de texto.")
        return await configurar(page, "video", aspect_ratio, count, model)`],
    `    from .agente import es_agente, configurar
    if await es_agente(page):
        if mode == "ingredientes":
            raise RuntimeError("El Flow nuevo (con agente) todavía no está adaptado para video con ingredientes.")
        return await configurar(page, "video", aspect_ratio, count, model)`],
  // video desde imagen con agente: se adjunta la imagen en el panel del agente (no hay ranuras de fotograma)
  ["flow_provider/canvas.py", [`"""Sube un frame para modo Fotogramas. slot: 'initial' o 'final'."""
    page = await get_page()`],
    `"""Sube un frame para modo Fotogramas. slot: 'initial' o 'final'."""
    page = await get_page()
    from .agente import es_agente, adjuntar_imagen
    if await es_agente(page):
        if slot != "initial":
            raise RuntimeError("El Flow nuevo (con agente) solo admite imagen inicial, no fotograma final.")
        return await adjuntar_imagen(page, file_path)`],
  // con agente, el prompt va envuelto para que genere 1 sin reescribirlo
  ["flow_provider/prompt.py", [`"""Escribe el prompt y hace click en submit. Debe llamarse con lock."""
    page = await get_page()`],
    `"""Escribe el prompt y hace click en submit. Debe llamarse con lock."""
    page = await get_page()
    from .agente import envolver
    prompt = await envolver(page, prompt)`],
  // el Flow nuevo avisa con "No se pudo completar la acción" (política de contenido) y no con "No se pudo generar": se reconoce al instante
  ["flow_provider/wait.py", [`SEL_ERROR_TEXT = ':text("No se pudo generar")'`], `SEL_ERROR_TEXT = ':text("No se pudo generar"), :text("No se pudo completar")'`],
  ["flow_provider/wait.py", [`_ERROR_CARD_RE = re.compile(r"No se pudo generar|Se produjo un error", re.IGNORECASE)`], `_ERROR_CARD_RE = re.compile(r"No se pudo generar|No se pudo completar|Se produjo un error", re.IGNORECASE)`],
  // si la tarjeta de error habla de políticas, no se reenvía lo mismo (volvería a fallar): se corta con "POLITICA:" y la fábrica reintenta con el prompt suavizado
  ["flow_provider/wait.py", [`        if intento >= max_retries:
            raise Exception(
                f"Generación de {kind} falló {max_retries + 1} veces seguidas. "`],
    `        try:
            _txt = await page.locator(SEL_RESULT_CARD).first.inner_text(timeout=3000)
        except Exception:
            _txt = ""
        if re.search(r"pol[ií]tica", _txt, re.IGNORECASE):
            raise Exception("POLITICA: Flow bloqueó la generación por sus políticas de contenido")
        if intento >= max_retries:
            raise Exception(
                f"Generación de {kind} falló {max_retries + 1} veces seguidas. "`],
  // reparto fijo: el lote entra al proyecto de Flow de la marca (donde viven los personajes) en vez de crear uno nuevo
  ["flow.py", [`    await flow.startup()
    try:
        await flow.create_project()
        for i, job in enumerate(jobs, 1):`], `    await flow.startup()
    try:
        if data.get("project_uuid"):
            print(f"  Abriendo el proyecto de Flow {data['project_uuid']} (reparto fijo)")
            await flow.navigate_to_project(data["project_uuid"])
        else:
            await flow.create_project()
        for i, job in enumerate(jobs, 1):`],
  // @{Nombre} en el prompt → mención real (chip @) del personaje o imagen guardada en el proyecto
  ["flow_provider/prompt.py", [`    from .agente import envolver
    prompt = await envolver(page, prompt)
`], `    from .agente import envolver
    prompt = await envolver(page, prompt)
    if "@{" in prompt:
        segs = []
        for i, trozo in enumerate(re.split(r"@\{([^}]+)\}", prompt)):
            if i % 2:
                segs.append({"type": "mention", "name": trozo})
            elif trozo:
                segs.append({"type": "text", "value": trozo})
        print(f"    [prompt] Prompt con {sum(1 for x in segs if x['type'] == 'mention')} mención(es) de personajes...")
        return await submit_prompt_with_mentions(segs)
`],
  // tras elegir la mención, volver al final del texto sin hacer clic (un clic al centro podía caer sobre un chip y abrirlo)
  ["flow_provider/prompt.py", [`    if await dialog.is_visible():
        await page.keyboard.press("Escape")
    await box.click()
    await page.keyboard.press("Control+End")`], `    if await dialog.is_visible():
        await page.keyboard.press("Escape")
    await box.evaluate("el => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }")`],
  // con la lista filtrada por el buscador, el clic en la fila solo la marca (vista previa): hay que confirmar con "Agregar a la instrucción"
  ["flow_provider/prompt.py", [`    await row.click()
    await chips.nth(before).wait_for(state="visible", timeout=8_000)`], `    await row.click()
    try:
        await chips.nth(before).wait_for(state="visible", timeout=2_500)
    except Exception:
        try:
            await dialog.locator("button").filter(has_text=_ADD_TO_PROMPT_RE).first.click(timeout=5_000)
            await chips.nth(before).wait_for(state="visible", timeout=8_000)
        except Exception:
            await page.keyboard.press("Escape")  # que no quede el menú abierto tapando los trabajos siguientes
            raise`],
  // proyecto fijo con muchas imágenes: la cuadrícula se virtualiza y no crece; se detecta lo nuevo por la primera tarjeta
  ["flow_provider/canvas.py", [`    return await page.locator('flow-grid-tile-container, flow-tile-container, [aria-roledescription="draggable"]').count()`],
    `    n = await page.locator('flow-grid-tile-container, flow-tile-container, [aria-roledescription="draggable"]').count()
    try:
        from . import wait as _w
        from .agente import JS_ESTADO
        _w._ANTES.update(await page.evaluate(JS_ESTADO))
    except Exception:
        pass
    return n`],
  ["flow_provider/wait.py", [`async def error_card_count(page) -> int:`], `_ANTES = {"clave": None, "burbujas": 0}


async def error_card_count(page) -> int:`],
  ["flow_provider/wait.py", [`    guard = "true" if pre_cards is None else f"cards.length > {pre_cards}"
    if pre_cards is not None and _ANTES.get("clave") is not None:
        import json as _json
        guard = (f"(cards.length > {pre_cards} || (((c) => {{ const m = c && (c.querySelector('img') || c.querySelector('video')); "
                 f"return m ? (m.getAttribute('src') || '') : (c ? 'sin-media' : ''); }})(cards[0])) !== {_json.dumps(_ANTES['clave'])}))")`, `    guard = "true" if pre_cards is None else f"cards.length > {pre_cards}"`],
    `    guard = "true" if pre_cards is None else f"cards.length > {pre_cards}"
    if pre_cards is not None and _ANTES.get("clave") is not None:
        import json as _json
        guard = (f"(cards.length > {pre_cards} || (((c) => {{ const m = c && (c.querySelector('img') || c.querySelector('video')); "
                 f"return m ? (m.getAttribute('src') || '') : (c ? 'sin-media' : ''); }})(cards[0]) !== {_json.dumps(_ANTES['clave'])}))")`],
  ["flow_provider/wait.py", [`        if elapsed >= 8:
            try:
                from .agente import JS_RESPUESTA
                _r = await page.evaluate(JS_RESPUESTA, _ANTES.get("burbujas", 0))
            except Exception:
                _r = ""
            if _r:
                raise Exception(f"AGENTE: el agente de Flow no generó y respondió: {_r}")
        if await error_card_count(page) > pre_errors:
            print(f"    [wait] Detectada card de error de generación en Flow.")`, `        if await error_card_count(page) > pre_errors:
            print(f"    [wait] Detectada card de error de generación en Flow.")`],
    `        if elapsed >= 15:
            try:
                from .agente import JS_RESPUESTA
                _r = await page.evaluate(JS_RESPUESTA, _ANTES.get("burbujas", 0))
            except Exception:
                _r = ""
            if _r:
                raise Exception(f"AGENTE: el agente de Flow no generó y respondió: {_r}")
        if await error_card_count(page) > pre_errors:
            print(f"    [wait] Detectada card de error de generación en Flow.")`],
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

// busca en la carpeta del lote archivos ya generados (escena-N.png, etc.) por si no quedó el reporte
function rescatar(dir, nombres) {
  const salida = {};
  const ver = (d, nivel = 0) => { let ls = []; try { ls = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ls) { const f = path.join(d, e.name);
      if (e.isDirectory() && nivel < 3) ver(f, nivel + 1);
      else if (/\.(png|jpe?g|webp|mp4)$/i.test(e.name)) { const base = e.name.replace(/\.[^.]+$/, ""); const n = nombres.find((x) => base === x || base.startsWith(x + "_") || base.startsWith(x + "-")); if (n && !salida[n] && fs.statSync(f).size > 5000) salida[n] = f; } } };
  ver(dir); return salida;
}

// corre un lote; devuelve { nombre: archivo } de lo que salió bien y la lista de fallos
let flowActivo = null;
export function matarFlow() { try { flowActivo?.kill(); } catch {} flowActivo = null; }

export function lote(id, nombre, jobs, avisar = () => {}, { minutos = 60, ratio = "9:16", proyecto = null } = {}) {
  return new Promise((ok, mal) => {
    if (!flowSkillListo()) return mal(new Error("No encuentro Google Flow Skill. Pon FLOW_SKILL_DIR en el .env (la carpeta donde está flow.py) y haz 'python flow.py login' una vez."));
    try { parcharSkill(); } catch {}
    const m = modelos(), dir = path.join(dirProyecto(id), "flow");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `${nombre}.json`);
    fs.writeFileSync(archivo, JSON.stringify({ project: nombre, ...(proyecto ? { project_uuid: proyecto } : {}), defaults: { ratio, image_model: m.imagen, video_model: m.video, video_duration: "8s" }, jobs }, null, 2));
    const p = spawn(CFG.python || (process.platform === "win32" ? "python" : "python3"), ["flow.py", "batch", archivo, "--out", dir], { cwd: CFG.flowSkillDir, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    flowActivo = p;
    let salida = "", hechos = 0;
    const t0 = Date.now();
    let sePaso = false;
    const reloj = setTimeout(() => { sePaso = true; p.kill(); }, minutos * 60000);
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
      if (!fs.existsSync(rep)) {
        // si Flow se cortó (tiempo, cierre) pero ya había sacado imágenes, se rescatan: no se vuelve a pedir lo que ya salió
        const rescatados = rescatar(path.join(dir, nombre), jobs.map((j) => j.name));
        if (Object.keys(rescatados).length) return ok({ archivos: rescatados, fallos: jobs.filter((j) => !rescatados[j.name]).map((j) => `${j.name}: ${sePaso ? `Flow tardó más de ${minutos} minutos` : "se cortó"}`) });
        if (sePaso) return mal(new Error(`Flow tardó más de ${minutos} minutos.`));
      }
      if (!fs.existsSync(rep)) return mal(new Error(`Flow falló: ${errorLegible(salida)}.${cambio ? " Parece que Google cambió la página de Flow: abre Claude Code en la fábrica y dile \"adapta Flow\"." : ""} (detalle en proyectos/${id}/flow/${nombre}.log)`));
      const r = JSON.parse(fs.readFileSync(rep, "utf8"));
      const archivos = Object.fromEntries(r.filter((x) => x.ok && x.file).map((x) => [x.name, path.isAbsolute(x.file) ? x.file : path.join(CFG.flowSkillDir, x.file)]));
      ok({ archivos, fallos: r.filter((x) => !x.ok).map((x) => `${x.name}: ${x.error}`) });
    });
  });
}
