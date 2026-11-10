"""
Compatibilidad con el Flow nuevo (noviembre 2026): la caja de prompt clásica desapareció y ahora se genera
desde el panel del agente ("Sesión sin título · ¿Qué quieres crear?"). Los ajustes (proporción, cantidad,
modelo y "Confirmar antes de generar") viven en "Configuración de agentes" y se guardan por proyecto.

La fábrica copia este archivo a flow_provider/ de Google Flow Skill y engancha:
  - project._wait_for_settings  → acepta el panel del agente como "página lista"
  - configure.select_image_mode → si hay agente, configura aquí y no toca el panel viejo
  - configure.select_video_mode → igual, para video de solo texto
  - canvas.upload_frame         → con agente, adjunta la imagen en el panel del agente (video desde imagen)
  - prompt.submit_prompt        → con agente, envuelve el prompt para que genere exactamente 1 sin reescribirlo

Si Google vuelve a cambiar la página, aquí están todos los selectores del Flow nuevo juntos.
"""
import re

SEL_PANEL_AGENTE = "flow-agent-panel"
SEL_AJUSTES_AGENTE = 'flow-agent-panel button[aria-label="Configuración"]'
SEL_VISTA_AJUSTES = "flow-settings-view"
SEL_GUARDAR = "flow-agent-panel button.settings-save-button"
SEL_LISTO = ('flow-agent-panel div.ProseMirror[contenteditable="true"]:visible, '
             'button[aria-label="Botón de configuración"]:visible, button[aria-label="Activador de ajustes"]:visible')
TOGGLES = {
    "imagen": {
        "ratio": 'flow-toggles[aria-label*="Relación de aspecto predeterminada de la generación de imágenes"]',
        "cantidad": 'flow-toggles[aria-label*="Cantidad predeterminada de resultados para la generación de imágenes"]',
        "modelo": 'button[aria-label="Modelo predeterminado de la generación de imágenes"]',
    },
    "video": {
        "ratio": 'flow-toggles[aria-label*="Relación de aspecto predeterminada de generación de video"]',
        "cantidad": 'flow-toggles[aria-label*="Cantidad predeterminada de resultados de generación de video"]',
        "modelo": 'button[aria-label="Modelo predeterminado de generación de video"]',
    },
}

SEL_AGREGAR = 'flow-agent-panel button[aria-label="Agregar ingredientes al cuadro de instrucción"]'
SEL_POPOVER = "flow-add-menu-popover-content"
# solo lo adjunto en la caja de abajo (antes contaba también los chips del historial del chat y fallaba al azar)
SEL_CHIP = 'flow-agent-panel flow-creative-agent-prompt-box img, flow-agent-panel flow-creative-agent-prompt-box flow-image-ingredient-chip'

# estado de la cuadrícula y del chat antes de enviar (lo usa wait.py: la cuadrícula se virtualiza y ya no crece en proyectos grandes)
JS_ESTADO = """() => {
  const c = document.querySelector('flow-grid-tile-container, flow-tile-container, [aria-roledescription="draggable"]');
  const m = c && (c.querySelector('img') || c.querySelector('video'));
  return { clave: m ? (m.getAttribute('src') || '') : (c ? 'sin-media' : ''),
           burbujas: document.querySelectorAll('flow-agent-panel flow-chat-bubble').length };
}"""
# el agente contestó con texto en vez de generar (pregunta, se niega, pide elegir): se corta en segundos, no a los 3 minutos
JS_RESPUESTA = """(antes) => {
  const panel = document.querySelector('flow-agent-panel');
  if (panel && /actividad inusual|unusual activity/i.test(panel.innerText || '')) return 'BLOQUEO_GOOGLE';
  const b = [...document.querySelectorAll('flow-agent-panel flow-chat-bubble')];
  if (b.length < antes + 2) return '';
  const u = b[b.length - 1];
  if (u.querySelector('img, video')) return '';
  const t = (u.innerText || '').replace(/\\s+/g, ' ').trim();
  return (/(cannot|can't|unable|would you like|do you want|which (one|option)|no puedo|¿quieres|¿te gustar|¿prefieres|elige)/i.test(t)) ? t.slice(0, 300) : '';
}"""

_ADD_RE = __import__("re").compile(r"(Agregar a la instrucci|Añadir a petición|Add to prompt|Add to instruction)", __import__("re").I)

_estado = {"modo": None, "configurado": set(), "imagen": False}


async def es_agente(page) -> bool:
    try:
        return await page.locator(SEL_PANEL_AGENTE).count() > 0 and await page.locator(SEL_AJUSTES_AGENTE).count() > 0
    except Exception:
        return False


async def esperar_listo(page, timeout=45_000) -> None:
    await page.locator(SEL_LISTO).first.wait_for(state="visible", timeout=timeout)


async def _clic_toggle(vista, grupo, texto):
    btn = vista.locator(f"{grupo} button").filter(has_text=re.compile(r"(^|\s)" + re.escape(texto) + r"\s*$")).first
    if await btn.count() == 0:
        btn = vista.locator(f"{grupo} button").filter(has_text=texto).first
    if await btn.count() > 0:
        if (await btn.get_attribute("aria-pressed")) != "true":
            await btn.click()
            await vista.page.wait_for_timeout(250)
    else:
        print(f"    [agente] No encontré la opción '{texto}' (sigo con la que esté).")


async def configurar(page, modo, aspect_ratio="9:16", count=1, model=None) -> None:
    """Abre 'Configuración de agentes', pone generar sin confirmar, proporción, cantidad y modelo, y guarda."""
    _estado["modo"] = modo
    if await page.locator(".cdk-overlay-backdrop-showing").count() > 0:  # una ventana abierta de un trabajo anterior tapa todo
        for _ in range(3):
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
    clave = (page.url, modo, aspect_ratio, count, model)
    if clave in _estado["configurado"]:
        return
    print(f"    [agente] Configurando el agente de Flow: {modo}, {aspect_ratio}, x{count}, {model or 'modelo actual'}...")
    await page.locator(SEL_AJUSTES_AGENTE).first.click(timeout=10_000)
    vista = page.locator(SEL_VISTA_AJUSTES).first
    await vista.wait_for(state="visible", timeout=10_000)
    # "Confirmar antes de generar: Nunca" (si no, el agente pregunta y nunca genera)
    nunca = vista.locator("mat-radio-button").filter(has_text=re.compile(r"Nunca|Never", re.I)).first
    if await nunca.count() > 0:
        await nunca.click()
        await page.wait_for_timeout(200)
    t = TOGGLES[modo]
    await _clic_toggle(vista, t["ratio"], aspect_ratio)
    await _clic_toggle(vista, t["cantidad"], f"x{count}")
    if model:
        boton = vista.locator(t["modelo"]).first
        if await boton.count() > 0:
            actual = (await boton.inner_text()).replace("arrow_drop_down", "").replace("🍌", "").strip().casefold()
            if actual != model.casefold():
                await boton.click()
                item = page.locator('.cdk-overlay-container [role="menuitem"]').filter(has_text=re.compile(re.escape(model) + r"\s*$", re.I)).first
                if await item.count() == 0:
                    item = page.locator('.cdk-overlay-container [role="menuitem"]').filter(has_text=model).first
                if await item.count() > 0:
                    await item.click()
                else:
                    print(f"    [agente] El modelo '{model}' no aparece; uso el que está.")
                    await page.keyboard.press("Escape")
                await page.wait_for_timeout(300)
    await page.locator(SEL_GUARDAR).first.click(timeout=10_000)
    await vista.wait_for(state="hidden", timeout=10_000)
    _estado["configurado"].add(clave)


async def adjuntar_imagen(page, ruta: str) -> None:
    """Video desde imagen en el Flow nuevo: sube la imagen con '+' (Agregar ingredientes) y la deja adjunta al cuadro del agente."""
    import re, os
    ruta = str(ruta)
    print(f"    [agente] Adjuntando imagen: {ruta}")
    if not os.path.isfile(ruta):
        raise RuntimeError(f"No encuentro la imagen a adjuntar: {ruta} (la imagen anterior no salió).")
    try:
        await _adjuntar(page, ruta)
    except Exception:
        # que un fallo no deje la ventana de selección abierta: tapaba los botones de todos los trabajos siguientes
        for _ in range(3):
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
        raise


async def _adjuntar(page, ruta: str) -> None:
    import re, os
    caja = "flow-agent-panel flow-creative-agent-prompt-box"
    imgs = page.locator(f"{caja} flow-image-ingredient-chip")
    # 1) la caja debe quedar sin adjuntos viejos: Flow conserva el del video anterior y el nuevo lo reemplazaba sin que se notara
    if await page.locator(f"{caja} flow-ingredient-chip").count() > 0:
        borrar = page.locator(f'{caja} button[aria-label="Borrar instrucción"], {caja} button[aria-label="Clear prompt"]').first
        try:
            await borrar.click(timeout=3_000)
            await page.wait_for_timeout(600)
        except Exception:
            for chip in await page.locator(f"{caja} flow-ingredient-chip button").all():
                try:
                    await chip.hover(); await chip.click(timeout=2_000); await page.wait_for_timeout(300)
                except Exception:
                    pass
    antes = await imgs.count()
    # nombre único por contenido (cuadro-4-1a2b3c4d.png): si esa misma imagen ya está en el proyecto se elige, no se vuelve a subir
    import hashlib, shutil, tempfile
    with open(ruta, "rb") as fh:
        huella = hashlib.md5(fh.read()).hexdigest()[:8]
    raiz, ext = os.path.splitext(os.path.basename(ruta))
    base = f"{raiz}-{huella}{ext.lower() or '.png'}"
    copia = os.path.join(tempfile.gettempdir(), "fabrica-flow", base)
    os.makedirs(os.path.dirname(copia), exist_ok=True)
    if not os.path.exists(copia):
        shutil.copyfile(ruta, copia)
    pop = page.locator(SEL_POPOVER).first

    async def abrir():
        if not await pop.is_visible():
            await page.locator(SEL_AGREGAR).first.click(timeout=10_000)
            await pop.wait_for(state="visible", timeout=8_000)

    async def elegir(espera_ms):
        await abrir()
        buscar = pop.locator("input.search-input, input[type='text']").first
        if await buscar.count() > 0:
            await buscar.fill(base)
        fila = pop.get_by_role("option").filter(has_text=re.compile(r"^\s*" + re.escape(base), re.I)).first
        try:
            await fila.wait_for(state="visible", timeout=espera_ms)
        except Exception:
            return False
        await fila.click()  # en este menú el clic la adjunta directo
        await page.wait_for_timeout(1000)
        if await imgs.count() <= antes and await pop.is_visible():
            try:
                await pop.locator('button, [role="button"]').filter(has_text=_ADD_RE).first.click(timeout=4_000)
                await page.wait_for_timeout(800)
            except Exception:
                pass
        return await imgs.count() > antes

    # 2) ¿ya está subida? se elige y listo
    if not await elegir(2_500):
        # 3) si no, se sube con su nombre único y se elige POR NOMBRE (nunca "la primera de la lista": podía ser el video anterior)
        await abrir()
        buscar = pop.locator("input.search-input, input[type='text']").first
        if await buscar.count() > 0:
            await buscar.fill("")
        subir = pop.locator('button, [role="button"]').filter(
            has_text=re.compile(r"(Cargar contenido multimedia|Cargar medios|Subir archivo multimedia|Upload media|Subir imagen)", re.I)).first
        async with page.expect_file_chooser(timeout=8_000) as fc:
            await subir.click(force=True)
        await (await fc.value).set_files(copia)
        try:  # aviso de derechos (solo la primera vez)
            b = page.locator('button, [role="button"]').filter(has_text=re.compile(r"(Acepto|Aceptar|I agree|Entendido|Got it)", re.I)).first
            await b.wait_for(state="visible", timeout=4_000)
            await b.click()
            await page.wait_for_timeout(500)
        except Exception:
            pass
        await page.wait_for_timeout(1500)
        if await imgs.count() <= antes:
            await elegir(30_000)  # la subida tarda unos segundos en aparecer en la lista
    if await pop.is_visible():
        await page.keyboard.press("Escape")
    if await imgs.count() <= antes:
        raise RuntimeError(f"No pude adjuntar {base} en el panel del agente de Flow.")
    # quedó solo la imagen correcta: nada de videos ni otros adjuntos
    if await page.locator(f"{caja} flow-ingredient-chip").count() != await imgs.count():
        raise RuntimeError("Flow adjuntó algo distinto a la imagen inicial; lo dejo para no animar la escena equivocada.")
    _estado["imagen"] = True


async def envolver(page, prompt: str) -> str:
    """Con agente: que genere exactamente 1 resultado con el prompt tal cual (sin preguntar ni reescribir)."""
    if not await es_agente(page):
        return prompt
    if _estado["modo"] == "video" and _estado["imagen"]:
        _estado["imagen"] = False
        return ("Generate exactly one video now, animating the attached image: use it as the exact first frame, "
                "keep its composition and painted style, and apply this motion. Do not ask questions, do not make "
                f"variations, do not generate any new image. Motion: {prompt}")
    que = "video" if _estado["modo"] == "video" else "image"
    return (f"Generate exactly one {que} now, using exactly this prompt word for word. "
            f"Do not ask questions, do not change or add anything, do not make variations. Prompt: {prompt}")
