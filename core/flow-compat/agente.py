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
SEL_CHIP = 'flow-agent-panel span.mention-chip, flow-agent-panel flow-rich-text-editor img, flow-agent-panel [class*="ingredient"] img, flow-agent-panel [class*="attachment"] img'

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
    import re
    ruta = str(ruta)
    print(f"    [agente] Adjuntando imagen: {ruta}")
    antes = await page.locator(SEL_CHIP).count()
    await page.locator(SEL_AGREGAR).first.click(timeout=10_000)
    pop = page.locator(SEL_POPOVER).first
    await pop.wait_for(state="visible", timeout=8_000)
    subir = page.locator('flow-add-menu-popover-content button, flow-add-menu-popover-content [role="button"]').filter(
        has_text=re.compile(r"(Cargar contenido multimedia|Cargar medios|Subir archivo multimedia|Upload media|Subir imagen)", re.I)).first
    async with page.expect_file_chooser(timeout=8_000) as fc:
        await subir.click(force=True)
    await (await fc.value).set_files(ruta)
    # aviso de derechos (primera vez) y vista previa que pide confirmar
    for patron in (r"(Acepto|Aceptar|I agree|Entendido|Got it)", r"(Añadir a petición|Agregar a la instrucci|Add to prompt|Add to instruction)"):
        b = page.locator('button, [role="button"]').filter(has_text=re.compile(patron, re.I)).first
        try:
            await b.wait_for(state="visible", timeout=8_000)
            await b.click()
            await page.wait_for_timeout(500)
        except Exception:
            pass
    if await pop.is_visible():  # si el popover sigue abierto, escoge la imagen recién subida (la primera de "Cargas")
        fila = pop.get_by_role("option").first
        if await fila.count() > 0:
            await fila.click()
        if await pop.is_visible():
            await page.keyboard.press("Escape")
    await page.wait_for_timeout(1500)
    if await page.locator(SEL_CHIP).count() <= antes:
        raise RuntimeError("No pude adjuntar la imagen en el panel del agente de Flow (cambió la página; hay que revisar adjuntar_imagen en agente.py).")
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
