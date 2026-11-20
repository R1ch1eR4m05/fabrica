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
# Google le da a cada cuenta textos distintos (nov 2026: "Configuración" en unas, "Ajustes" en otras, en español de España):
# se busca por etiqueta Y por el icono "tune" de la caja del agente, que es el mismo en todas.
SEL_AJUSTES_AGENTE = ('flow-agent-panel button[aria-label="Configuración"], flow-agent-panel button[aria-label="Ajustes"], '
                      'flow-agent-panel button[aria-label="Settings"], flow-agent-panel button[aria-label^="Configuración de"], '
                      'flow-agent-panel button[aria-label^="Configuración del"], flow-agent-panel button[aria-label^="Agent settings"], '
                      'flow-agent-panel flow-creative-agent-prompt-box button.agent-action-button:has(mat-icon:text-is("tune"))')
SEL_VISTA_AJUSTES = "flow-settings-view"
# Flow de nov 2026 (19-20 nov): el engrane va arriba del panel y abre "flow-unified-settings-view"; ahí está
# "Confirmar antes de generar" (Siempre/Nunca) y un renglón para imagen y otro para video, cada uno con su pantalla
# (modelo en radios, proporción, cantidad). No hay "Guardar": se guarda solo; se sale con "Atrás".
SEL_VISTA_NUEVA = "flow-unified-settings-view"
SEL_VISTA_DEFAULTS = "flow-generation-defaults-view"
SEL_ATRAS = 'flow-agent-panel button[aria-label="Atrás"], flow-agent-panel button[aria-label="Back"], flow-agent-panel button[aria-label="Volver"]'

SEL_GUARDAR = "flow-agent-panel button.settings-save-button"  # por clase: el texto ("Guardar"/"Save") cambia
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

SEL_AGREGAR = ('flow-agent-panel button[aria-label="Agregar ingredientes al cuadro de instrucción"], '
               'flow-agent-panel button[aria-label="Añadir ingredientes a ventana para peticiones"], '
               'flow-agent-panel flow-creative-agent-prompt-box button.add-menu-trigger')
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
    await page.wait_for_timeout(800)  # el aviso de novedades aparece un momento después
    await cerrar_novedades(page)


# orden de los controles en "Configuración de agentes" (si cambian las etiquetas, se usan por posición)
ORDEN = {"imagen": {"ratio": 0, "cantidad": 1, "modelo": 0}, "video": {"ratio": 2, "cantidad": 3, "modelo": 1}}


async def _grupo(vista, modo, clave):
    sel = TOGGLES[modo][clave]
    if await vista.locator(sel).count() > 0:
        return sel
    n = ORDEN[modo][clave]
    if clave == "modelo":
        return f"button.mat-mdc-menu-trigger >> nth={n}"
    return f"flow-toggles >> nth={n}"


async def _clic_toggle(vista, grupo, texto):
    botones = vista.locator(grupo).locator("button")
    btn = botones.filter(has_text=re.compile(r"(^|\s)" + re.escape(texto) + r"\s*$")).first
    if await btn.count() == 0:
        btn = botones.filter(has_text=texto).first
    if await btn.count() > 0:
        if (await btn.get_attribute("aria-pressed")) != "true":
            await btn.click()
            await vista.page.wait_for_timeout(250)
    else:
        print(f"    [agente] No encontré la opción '{texto}' (sigo con la que esté).")


async def cerrar_novedades(page) -> None:
    """Quita el aviso de novedades de Flow ("A faster, easier-to-reach Flow Agent") que tapa todo y no se cierra con Escape."""
    try:
        await page.evaluate("""() => {
          let quitado = false;
          document.querySelectorAll('.cdk-overlay-pane').forEach(p => { if (p.querySelector('flow-change-log-modal')) { p.remove(); quitado = true; } });
          if (quitado) {
            document.querySelectorAll('.cdk-overlay-backdrop').forEach(b => b.remove());
            document.documentElement.classList.remove('cdk-global-scrollblock');
          }
        }""")
    except Exception:
        pass


async def _modelo_radio(page, vista, model) -> None:
    opciones = vista.locator("label.radio-option, [role='radio']")
    if await opciones.count() == 0:
        return
    op = opciones.filter(has_text=re.compile(r"(^|\s)" + re.escape(model) + r"\s*$", re.I)).first
    if await op.count() == 0:
        op = opciones.filter(has_text=model).first
    if await op.count() > 0:
        await op.click()
        await page.wait_for_timeout(250)
    else:
        print(f"    [agente] El modelo '{model}' no aparece; uso el que está.")


async def _configurar_nuevo(page, modo, aspect_ratio, count, model) -> None:
    vista = page.locator(SEL_VISTA_NUEVA).first
    # Confirmar antes de generar → Nunca (si no, el agente pregunta y nunca genera)
    conf = vista.locator("flow-toggles").first
    nunca = conf.locator("button").filter(has_text=re.compile(r"Nunca|Never", re.I)).first
    if await nunca.count() == 0:
        nunca = conf.locator("button").nth(1)
    if await nunca.count() > 0:
        await nunca.click()
        await page.wait_for_timeout(250)
    fila = vista.locator('button[class*="image-default"]' if modo == "imagen" else 'button[class*="video-default"]').first
    if await fila.count() == 0:  # por orden: imagen es el primer renglón, video el segundo
        fila = vista.locator('button[class*="defaults-row"]').nth(0 if modo == "imagen" else 1)
    await fila.click(timeout=10_000)
    defs = page.locator(SEL_VISTA_DEFAULTS).first
    await defs.wait_for(state="visible", timeout=10_000)
    if model:
        await _modelo_radio(page, defs, model)
    ratio = defs.locator('flow-toggles[aria-label*="aspecto"], flow-toggles[aria-label*="spect"]')
    cant = defs.locator('flow-toggles[aria-label*="antidad"], flow-toggles[aria-label*="umber"], flow-toggles[aria-label*="utputs"]')
    await _clic_toggle(defs, 'flow-toggles[aria-label*="aspecto"], flow-toggles[aria-label*="spect"]' if await ratio.count() else "flow-toggles >> nth=0", aspect_ratio)
    await _clic_toggle(defs, 'flow-toggles[aria-label*="antidad"], flow-toggles[aria-label*="umber"], flow-toggles[aria-label*="utputs"]' if await cant.count() else "flow-toggles >> nth=1", f"x{count}")
    await page.wait_for_timeout(300)
    # salir: Atrás hasta volver al chat (se guarda solo)
    for _ in range(3):
        if await page.locator(f"{SEL_VISTA_DEFAULTS}, {SEL_VISTA_NUEVA}").count() == 0:
            break
        atras = page.locator(SEL_ATRAS).first
        if await atras.count() == 0:
            await page.keyboard.press("Escape")
        else:
            await atras.click()
        await page.wait_for_timeout(500)


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
    await cerrar_novedades(page)
    await page.locator(SEL_AJUSTES_AGENTE).first.click(timeout=10_000)
    await page.locator(f"{SEL_VISTA_AJUSTES}, {SEL_VISTA_NUEVA}").first.wait_for(state="visible", timeout=10_000)
    if await page.locator(SEL_VISTA_NUEVA).count() > 0:
        await _configurar_nuevo(page, modo, aspect_ratio, count, model)
        _estado["configurado"].add(clave)
        return
    vista = page.locator(SEL_VISTA_AJUSTES).first
    await vista.wait_for(state="visible", timeout=10_000)
    # "Confirmar antes de generar: Nunca" (si no, el agente pregunta y nunca genera)
    nunca = vista.locator("mat-radio-button").filter(has_text=re.compile(r"Nunca|Never", re.I)).first
    if await nunca.count() == 0:
        nunca = vista.locator("mat-radio-button").nth(1)  # el segundo es "Nunca" en todas las versiones vistas
    if await nunca.count() > 0:
        await nunca.click()
        await page.wait_for_timeout(200)
    await _clic_toggle(vista, await _grupo(vista, modo, "ratio"), aspect_ratio)
    await _clic_toggle(vista, await _grupo(vista, modo, "cantidad"), f"x{count}")
    if model:
        boton = vista.locator(await _grupo(vista, modo, "modelo")).first
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


# ---------------- descarga de imágenes sin menú (nov 2026) ----------------
# El Flow nuevo cambió la lista de resultados: el botón "Descargar" de la barrita (descargar · reutilizar · papelera)
# ya no abre el submenú 1K/2K y no dispara el evento "download" de Playwright, así que el lote se quedaba 60 s
# esperando, no guardaba nada y en el siguiente intento volvía a generar (y a gastar créditos).
# La miniatura trae su enlace directo (flow.google.com/asb/…=s512-rw); se pide en tamaño original y se guarda.
JS_BAJAR = """async ([src, quiere]) => {
  const r = await fetch(src, { credentials: 'include' });
  if (!r.ok) return { error: 'HTTP ' + r.status };
  let b = await r.blob();
  // Flow entrega JPEG/WebP; si el archivo se llama .png se convierte (ffmpeg elige el decodificador por la extensión)
  if (quiere && b.type !== quiere && b.type.startsWith('image/')) {
    const bm = await createImageBitmap(b);
    const cv = new OffscreenCanvas(bm.width, bm.height);
    cv.getContext('2d').drawImage(bm, 0, 0);
    b = await cv.convertToBlob(quiere === 'image/jpeg' ? { type: quiere, quality: 0.95 } : { type: quiere });
  }
  const datos = await new Promise((ok, mal) => { const f = new FileReader(); f.onloadend = () => ok(f.result.split(',')[1]); f.onerror = mal; f.readAsDataURL(b); });
  return { tipo: b.type, datos };
}"""


def _tamanos(src: str):
    """Variantes del enlace, de mejor a peor: original, 2048 px, y el que trae la miniatura."""
    base = re.sub(r"=[a-z0-9-]+$", "", src, flags=re.I) if "=" in src.rsplit("/", 1)[-1] else src
    vistos, out = set(), []
    for u in (base + "=s0", base + "=s2048", base + "=d", src):
        if u not in vistos:
            vistos.add(u); out.append(u)
    return out


async def descargar_imagen_directa(page, card, output_path: str):
    """Baja la imagen de la tarjeta por su enlace directo. Regresa la ruta o None si no se pudo (y se usa el menú)."""
    import base64
    from pathlib import Path
    try:
        img = card.locator("img.image, flow-image-tile img, img").first
        await img.wait_for(state="attached", timeout=15_000)
        src = await img.get_attribute("src") or ""
    except Exception as e:
        print(f"  [download] Sin enlace directo en la tarjeta ({e}); se intenta con el menú.")
        return None
    if not src.startswith("http"):
        print("  [download] La tarjeta no trae enlace http; se intenta con el menú.")
        return None
    ext = Path(output_path).suffix.lower()
    quiere = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(ext, "")
    for url in _tamanos(src):
        try:
            r = await page.evaluate(JS_BAJAR, [url, quiere])
        except Exception as e:
            print(f"  [download] No se pudo pedir {url[-12:]} ({e})")
            continue
        if not r or r.get("error") or not r.get("datos"):
            print(f"  [download] {url[-12:]} → {r.get('error') if r else 'vacío'}")
            continue
        datos = base64.b64decode(r["datos"])
        if len(datos) < 20_000 or not str(r.get("tipo", "")).startswith("image/"):
            continue
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(datos)
        print(f"  [download] OK: imagen bajada directo ({r.get('tipo')}, {len(datos) // 1024} KB) → {output_path}")
        return output_path
    return None
