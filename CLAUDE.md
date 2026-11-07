# Fábrica de videos de Richie

Fábrica de videos con estilos enchufables y un panel web (`node fabrica.js panel`, http://127.0.0.1:4870).
Habla con Richie en español de México, directo y sin rodeos.

## Estructura
- `core/`: servidor del panel, voz (ElevenLabs con marcas de tiempo), audio (sintetizado con ffmpeg), render (Playwright → ffmpeg) e IA del guion.
- `estilos/<id>/`: cada estilo. Cómo hacer uno nuevo: **ESTILOS.md**.
- `estilos/_comun/`: motor de plantillas y tipografías.
- `proyectos/<id>/`: cada video (`proyecto.json`, `guion.json`, `voz.mp3`, `tiempos.json`, `final.mp4`).
- `listos/`: videos terminados, con su portada y el texto para subir.

## Cuando Richie pida un guion ("escribe el guion de <id>")
1. Lee `proyectos/<id>/proyecto.json` (idea, formato, duración) y `estilos/<estilo>/GUION.md`.
2. Verifica cada dato en internet con 2 fuentes fiables. Nunca inventes cifras.
3. Escribe `proyectos/<id>/guion.json` con el formato de ESTILOS.md, en español de México.
4. `node fabrica.js listo <id>`. El panel lo muestra al recargar.

## "Haz los pendientes" (la orden de siempre)
1. `node fabrica.js pendientes` muestra todo lo que falta, en 4 grupos.
2. **Propuestas sin crear** de la última investigación: `node fabrica.js crear-propuesta <archivo> <n> --sin-ia` por cada una (crea el proyecto en su estilo; frases ya sale con guion).
3. **Videos sin guion**: escribe cada guion (sección de abajo) y `node fabrica.js listo <id>`.
4. **Motion graphics sin construir**: si salen en "necesitan voz", primero `node fabrica.js voz-motion <id>` (gasta voz de ElevenLabs, es parte normal del video); luego construye cada uno al ritmo de `tiempos.json` (sección Motion graphics). Si Richie dijo "sin preguntarme", sáltate las aprobaciones y revisa tú los fotogramas.
5. **Con guion pero sin video (o con error)**: `node fabrica.js todo <id>` (voz + video). Si hay error, léelo y arréglalo antes de reintentar.
6. Al final, `node fabrica.js pendientes` otra vez y dile a Richie qué quedó listo (en `listos/`) y qué no y por qué. No gastes créditos de Flow ni de música de ElevenLabs sin que él lo pida.

### "Escribe los guiones pendientes"
`node fabrica.js guiones-pendientes` los lista (suelen ser los que el investigador creó cuando Gemini no respondió; la idea, el tema y el ángulo están en `proyecto.json` → `idea`). Escribe cada uno con el proceso de arriba, `node fabrica.js listo <id>`, y si Richie lo pide, hazlos completos con `node fabrica.js todo <id>`.

### Copy para publicar (GHL)
Cada video tiene `proyectos/<id>/copys.json` ({instagram, facebook, tiktok, youtube:{titulo, descripcion}}), editable en el panel. Si Richie pide el copy, escríbelo ahí: gancho en la primera línea, cierre solo de los autorizados, 3-5 hashtags. La etiqueta de IA NO va en el texto ni en el video: se marca en la app al publicar.

## Cuando pida un estilo nuevo
Sigue ESTILOS.md: carpeta nueva con `estilo.json`, `GUION.md`, `plantilla.html` e `ideas.json`.
Pruébalo con un proyecto de prueba y `node fabrica.js fotos`, en 9:16 y 16:9. Mira las imágenes y corrige lo que se encime o se salga del cuadro.
Si el estilo ya existía como "pronto", quítale `"estado": "pronto"`.

## Levania · Datos (`render-datos`)
- Antes de escribir un guion lee `estilos/render-datos/referencia/LEVANIA-REGLAS.md` (reglas duras de ritmo, embudo, reglas fijas) y `estilos/render-datos/GUION.md`.
- Las dos versiones de un video (Instagram/Facebook y TikTok/YouTube) son el mismo proyecto con la opción Cierre distinta; la voz del cierre de TikTok va en `vozTT`.
- Piezas 3D literales a la medida (Three.js) no caben en el estilo: hazlas aparte con el patrón de `referencia/video-3d_*.html` (`renderAt(t)`) y storyboard aprobado antes.

## Google Flow Skill (clips de Flow en la laptop)
Si `FLOW_SKILL_DIR` está en el .env, la fábrica usa esa skill (https://github.com/BRPLia/google-flow-skill-v1) para Flow: fondos de Frases y clips de Historia (imagen de personajes → cuadro por escena → video). Tú también puedes usarla directo con `python flow.py batch <lote.json>` desde esa carpeta, siguiendo su SKILL.md. Gasta créditos de Flow: no la uses sin que Richie lo pida.

### "Adapta Flow" (cuando Google cambia la página de Flow)
La skill maneja la página de Flow con selectores; cuando Google la rediseña, falla con Timeout/locator. Para adaptarla:
1. Lee el último `proyectos/<id>/flow/*.log` y el diagnóstico de la skill (`<FLOW_SKILL_DIR>/scratch/*.png|html` y `<carpeta del lote>/_debug/`).
2. Abre Flow en el Chrome de Richie (Claude in Chrome), crea un proyecto y revisa el DOM nuevo (javascript_tool). Una imagen de prueba con Nano Banana 2 Lite está bien; nada de lotes.
3. Corrige los selectores en `core/flow-compat/agente.py` (o agrega un parche en `PARCHES` de `core/flowskill.js`). La fábrica los copia/aplica sola a la skill antes de cada lote.
4. Sube los cambios y pídele a Richie que actualice y vuelva a dar "Generar en Flow".
Estado: noviembre 2026, Flow genera desde el panel del agente ("Configuración de agentes": Confirmar = Nunca, 9:16, x1, modelo). Imágenes y video de texto adaptados; video desde fotogramas/ingredientes aún no.

## Historia con Flow (`historia-flow`)
- Guion según `estilos/historia-flow/GUION.md`: `estiloVisual` y `personajes` (inglés, iguales para todas las escenas) y en cada escena `voz`, `texto` opcional, `flowPrompt` (inglés) y `buscar`.
- Clips: `proyectos/<id>/clips/escena-N.mp4` (el panel los sube o los genera en Flow con "Generar en Flow los que faltan"). Si flow-mcp está conectado como MCP y Richie lo autoriza, puedes generarlos tú y guardarlos ahí con ese nombre. Sin clip, la escena usa Pexels (`buscar`) o un dibujo animado.
- Siempre nace de una publicación viral: la historia adapta su gancho y su emoción a una familia hispana.

## Reflexión · Estatuas (`reflexion-estatuas`)
- Monólogo estoico en segunda persona con imágenes de estatuas y paisajes, pintadas de un solo tono (turquesa, ámbar, plata o rojo), acercamiento lento y texto romano (Cinzel) grande: la frase completa se ve tenue y cada palabra se vuelve blanca cuando se dice; se limpia en cada punto (nunca queda una frase de 1-2 palabras sola). El gancho sale completo y más grande desde el cuadro 0. Imagen más clara que antes (en el feed lo muy oscuro se ve chico).
- Guion según `estilos/reflexion-estatuas/GUION.md`: `estiloVisual` en inglés y por escena `voz`, `flowPrompt` (la imagen) y `buscar`.
- Imágenes: `proyectos/<id>/clips/escena-N.jpg|png|mp4`. Richie autorizó que este estilo SIEMPRE las genere con la skill de Flow (como imágenes, no video) al darle "Hacer todo"; solo las que falten. Sin skill usa Pexels y si no, niebla.
- Sello: "M" de Monarca (la página se llama Monarca).
- Banco de imágenes (`banco/<estilo>/`, con `indice.json`): las imágenes de Flow o subidas de cada video entran solas. Si una escena no tiene imagen: banco (la que más se parezca) → Pexels → cualquier imagen del banco no usada en ese video. En el panel cada escena tiene "Banco" y "Pexels".
- Voz de hombre grave: en el panel "Usar esta voz en todos los de Reflexión · Estatuas".

## Filosofía larga (`filosofia-larga`)
- Video largo de YouTube (3-35 min) de filosofía oriental/estoica: ilustración de acuarela y tinta por escena, cámara lenta (acercar/alejar/paneos), voz pausada, subtítulos y capítulos.
- Guion según `estilos/filosofia-larga/GUION.md`: por escena `voz` (15-22 palabras), `flowPrompt`, `buscar`, opcional `misma: true` (reusa la imagen anterior), `camara` y `capitulo`. Con la API, los largos se escriben por capítulos (`guionPorPartes`).
- Render con ffmpeg (`"render": "ffmpeg"` → `core/render-ffmpeg.js`), sin navegador: ~1/3 del tiempo real con 2 núcleos. La plantilla.html es solo la vista previa (mismos movimientos).
- Imágenes: Flow (16:9), APIMart o banco. Cada imagen de Flow/APIMart gasta: no las generes desde Claude Code sin que Richie lo pida.
- "Cortar por capítulos" (panel, debajo del video) o `node fabrica.js capitulos <id> [--sin-reels]`: de `final.mp4` saca un video por capítulo (título al inicio, cierre suave; para Facebook) y un Reel 9:16 de 45-60 s de cada uno (empieza en el capítulo o en la escena con `"reel": true`). Quedan en `proyectos/<id>/capitulos/` y en `listos/`, con portada y texto.

### Miniatura de YouTube (Filosofía larga)
- Panel: "Crear miniaturas de YouTube" (debajo del video) o `node fabrica.js miniatura <id> [--ia]`: saca 3 opciones de 1280x720 (A, B, C) con texto grande, más una comparativa a tamaño chico. La A queda en `listos/<id>-miniatura.jpg`; "Usar esta" cambia la elegida. Por defecto el fondo sale de las imágenes del video (gratis); `--ia` genera fondos nuevos con APIMart (gasta: no lo uses sin que Richie lo pida).
- Receta del nicho: `node fabrica.js miniatura-estudiar [--estilo id] [enlaces de YouTube…]` junta las miniaturas de los videos que mejor van (Apify, o los enlaces que pegue Richie / `investigacion/miniaturas/<estilo>/enlaces.txt`), las baja a `investigacion/miniaturas/<estilo>/ref/` y, con ANTHROPIC_API_KEY, saca la receta sola.
- Sin API (desde Claude Code): corre el mismo comando, MIRA las imágenes de `ref/` y escribe `investigacion/miniaturas/<estilo>/receta.json` con `{ "patrones": [...], "receta": { "palabras": {"min","max"}, "mayusculas", "textoPosicion": "izquierda|derecha|centro|abajo", "tema": "oscuro|claro", "colorTexto", "colorAcento", "paleta": [], "sujeto", "fondo", "evitar": [] } }` (y `fuentes`). Sin receta se usa una base (2-4 palabras, mayúsculas, texto a la izquierda).
- Texto de la miniatura: 2-4 palabras, que digan la verdad del video, nunca frases de otros canales. Para escribirlo tú: `proyectos/<id>/miniatura.json` → `{ "opciones": [{ "lineas": ["PAZ","EN EL TAO"], "acento": 1, "escena": 3, "promptFondo": "(inglés, solo con --ia)" }] }` (hasta 3). Sin eso lo pone la IA (o, sin IA, sale del título).
- Las miniaturas de otras cuentas son solo referencia: nunca copies su imagen ni su texto.

## Anuncios (`anuncios`) — ver ANUNCIOS.md
- 8 plantillas (oferta, advertorial, dato, testimonio, versus, antes-despues, notificaciones, ugc) como imágenes (cada escena = una variación) o video, en 9:16, 4:5 y 1:1.
- Guion según `estilos/anuncios/GUION.md`. Testimonios SOLO con reseñas reales del brief; datos con 2 fuentes; nada de promesas de salud/dinero.
- Imágenes con APIMart (`core/apimart.js`, Nano Banana 2 por defecto) usando `proyectos/<id>/producto/*` como referencia. Gasta créditos: en el panel va con tope; desde Claude Code solo si Richie lo pide (`node fabrica.js todo <id>`; sin gastar: `--sin-apimart`).
- Generador: APIMart o Flow (`opciones.generador`); en video, `animar: "si"` vuelve cada foto un clip (Seedance 2.5 o Flow).
- Plantilla `avatar`: video de Richie + foto/descripción del personaje → Kling Motion Control o Seedance 2.5 en APIMart (`cambiarAvatar` en `core/apimart.js`). Solo videos propios/con licencia y personajes ficticios o con permiso.
- El cerebro manda briefs a `POST /api/anuncios`.

## Motion graphics ("construye el motion de <id>")
La skill vive en `motion/` (claude-video, MIT, textos en portugués; tú hablas en español con Richie). `$SKILL` = `<raíz de la fábrica>/motion`.
1. Lee `proyectos/<id>/BRIEF.md` y `proyectos/<id>/proyecto.json` (campo `motion`). Las etapas A y B ya están hechas: no vuelvas a preguntar lo que ya dice el brief.
2. Sigue `motion/SKILL.md` desde la **etapa C** con la carpeta de trabajo `proyectos/<id>/motion/` (proyecto en `proyectos/<id>/motion/proj`).
   Formato del brief (por defecto **9:16 → `9x16`**, 1080×1920). Las fichas vienen en 16:9: reacomoda la composición a vertical, mantén mecanismo, paleta, traço y ritmo.
   Si es para Reels/TikTok (casi siempre): lee las notas del brief (enlaces de inspiración y REGLAS DE REEL). Intenta ver la publicación de referencia; si no se abre, apóyate en la descripción del informe. Cada línea de "Texto en pantalla" es una escena. Nada de piezas de 5 s con una frase: 15-25 s con gancho, desarrollo y remate.
3. Antes de las tarjetas lee `motion/referencias/anti-diapositivas.md` y úsalo como lista en tarjetas, fotogramas y render final (gancho completo y en movimiento desde el segundo 0, nada de texto < 30 px en 1080, tamaños de plano, transiciones variadas, fondo siempre vivo).
   Mismos portones: tarjetas aprobadas antes de animar, 3 fotogramas aprobados antes del render (guárdalos en `proj/frames/`, el panel los muestra).
4. Clips de IA: no Higgsfield. Usa flow-mcp si está conectado (9:16, con aprobación y tope de créditos) o pídele el clip a Richie.
5. Render final con `bash motion/scripts/render.sh proyectos/<id>/motion/proj proyectos/<id>/final.mp4 high` y luego `node fabrica.js listo-motion <id>` (lo copia a `listos/`).
Requisitos en la laptop: Node 22+, ffmpeg, Python 3 y Git Bash (`bash motion/scripts/checar.sh` lo revisa).

### Motion con voz
Si el brief trae **Voz en off**, la pieza se sincroniza con `proyectos/<id>/tiempos.json` (una escena por línea de narración; cada palabra con su tiempo): dura lo que la voz + 1 s, cada escena entra cuando empieza su línea y la palabra clave aparece cuando se dice. No metas el audio en el render: `listo-motion` mezcla voz y música. Si el brief trae narración pero aún no hay voz, pídele a Richie que le dé "Hacer la voz" en el panel antes de construir.

### "Construye los motion pendientes"
`node fabrica.js motion-pendientes` lista los que dejó el investigador con su brief. Constrúyelos uno por uno con el proceso de arriba.
Si Richie dice que los hagas sin preguntarle, puedes saltarte las aprobaciones: revisa tú mismo tarjetas y fotogramas, corrige lo que se encime y renderiza. No gastes créditos de Flow sin su permiso.

## Investigador desde Claude Code (sin API de Claude)
Cuando Richie diga "investiga" o "dame frases virales":
1. Si hay `APIFY_TOKEN` en el .env: `node fabrica.js recolectar` y lee el archivo `investigacion/datos-*.json` que indica (40 publicaciones con vistas, guardados, compartidos y `rebase` = vistas/seguidores).
   Descarga las portadas de las 12 mejores a una carpeta temporal y míralas: ahí suele ir la frase. Si no hay Apify, investiga con búsqueda web y dilo (sin métricas reales).
2. Saca 5-8 patrones concretos y escribe `investigacion/AAAA-MM-DD-HH-MM.json` con este formato:
   `{ "fecha", "modo": "metricas"|"web", "errores": [], "patrones": [...], "propuestas": [{ "n", "frase" (original, con *palabra clave*), "autor" (solo cita real verificada), "cierre", "tema", "porque", "inspiradaEn": [urls], "flowPrompt" (inglés, 9:16, slow motion, shallow depth of field, una acción emotiva, no text), "pexels", "tituloPost", "descripcion", "hashtags" }], "publicaciones": [...] }`
   Usa el nicho que diga Richie (`investigacion/nichos/<id>.json`: audiencia, marca, adaptación, reglas, estilos permitidos, número de propuestas; si no dice, el activo: `node fabrica.js nichos`) y pon `"nicho": "<id>"` en el archivo. Con Apify: `node fabrica.js recolectar --nicho <id>`. Nunca copies frases de otras cuentas.
   Las cuentas en inglés son señal temprana: adapta (no traduzcas) a mamás hispanas de México y EE. UU. y llena `origen` (en/es/ambos), `llegada` (ya está en español / poco en español / aún no llega) y `adaptacion`. Prioriza lo que "aún no llega".
3. Dile a Richie que recargue el Investigador del panel: ahí puede crear los videos.

## Informes externos (Gemini Deep Research, muse.ai, n8n)
- Los informes llegan a `investigacion/informes/*.md` (pegados en el panel, soltados en `investigacion/entrada/` o enviados por n8n a `POST /api/investigacion/importar`).
- Los que no terminan en `.hecho.md` están pendientes. Si Richie dice "convierte los informes pendientes": léelos, escribe la investigación en el formato de arriba (`"modo": "informe"`, `"fuente"`) y renombra el informe a `.hecho.md`.

## "Vuelve a proponer" desde Claude Code (sin Gemini)
Lee la investigación más reciente de `investigacion/` (o la que diga Richie) y su informe en `investigacion/informes/*.hecho.md` si lo hay. Escribe una investigación NUEVA en el mismo formato y del mismo `nicho`, con `estilo` (solo de los permitidos en ese nicho), `porQueEstilo`, `idea` y los `cierres` de su nicho (tal cual, o vacío). Los estilos válidos salen de `node fabrica.js estilos` y de `estilos/motion/catalogo.json` (como `motion:<id>`).

## Propuestas del investigador y estilos
- **Regla número uno: cada propuesta nace de una publicación que ya fue viral** (o rindió muy por encima de lo normal) y lleva su url real en `inspiradaEn`, copiada de los datos o del informe. Sin eso no es propuesta: no la escribas. La fábrica descarta enlaces que no estaban en los datos y marca la propuesta "Sin referencia viral"; "Crear y hacer todas" y `pendientes` se las saltan.
- Cada propuesta lleva `estilo` (id exacto de un estilo listo, o `motion:<id del catálogo>` para motion graphics), `porQueEstilo` e `idea`. Elige el que mejor le queda al contenido; si todo son frases, todo va en `frases-desenfocado`.
- Al crear el video desde una propuesta, `frases-desenfocado` usa la frase tal cual; los demás estilos escriben el guion con la IA siguiendo el GUION.md de ese estilo. Propuestas viejas sin `estilo` se hacen como frases. Los `motion:` quedan creados con su brief y esperan a "construye los motion pendientes".
- Cierres: solo los que Richie puso en el nicho de esa investigación (`investigacion/nichos/<id>.json` → `cierres`), copiados tal cual. Si la lista está vacía, sin cierre de "comenta X". Nunca inventes la palabra.
- Música: pistas libres de derechos en `musica/` o `musica/<estilo>/`, y las generadas con ElevenLabs en `musica/nichos/<nicho>/` (con su .json). Sin música propia, cada video sale con la que recomienda la fábrica (generada del nicho y del mismo estilo/tema primero). En el panel se elige y se escucha.
- Espejo laptop → VPS: con `ESPEJO_URL` y `ESPEJO_CLAVE` en el .env de la laptop, banco y música nueva se mandan solos al VPS.
- "Crear y hacer" con la casilla de Flow: si flow-mcp está abierto y el estilo usa fondo, primero genera el clip con el `flowPrompt` (con tope de créditos); si falla, sigue con Pexels.

## Investigador y Flow
- Un nicho por marca: `investigacion/nichos/<id>.json` (levania, monarca…), editables en el panel (selector "Nicho"). Cada uno con sus cuentas, hashtags, público, adaptación, reglas, cierres, canal, estilos permitidos y opciones por estilo. Cada investigación en `investigacion/<fecha>.json` con `"nicho"` (las viejas sin él son de Levania).
- Monarca (página de reflexión estoica) solo usa `reflexion-estatuas`; Levania, los demás.
- Si Richie pide investigar desde Claude Code sin API: busca en la web, sigue el mismo formato de propuestas y guarda el archivo ahí; el panel lo muestra.
- Si flow-mcp está conectado como MCP, puedes generar el clip de una propuesta con su `flowPrompt` (9:16) y copiarlo como `proyectos/<id>/fondo-propio.mp4`; luego en el panel "Buscar otro fondo" o rehacer la voz lo vuelve a preparar.
- Frases de otras cuentas: solo como inspiración. Nunca copiarlas.

## Voz
- El modelo de voz se elige por estilo en el panel (junto a la voz): Eleven v4, v4 Turbo (mitad de precio), Multilingual v2, Flash v2.5 o Google Chirp 3 HD (`GOOGLE_TTS_KEY`; tiempos de subtítulos estimados).
- "Comparar modelos" (panel) o `node fabrica.js comparar-voces` hace el mismo párrafo con cada uno en `listos/comparar-voces/`.

## Reglas
- No pidas llaves por el chat: van en `.env`.
- No borres nada de `proyectos/` ni de `listos/` sin que Richie lo pida.
- Código y textos propios: no copies código ni textos de plantillas de terceros (la "Plantilla gratis de Animaciones" de Skool no permite reutilizarse para esto).

## Flow desde el celular (VPS → laptop) y APIMart en cualquier estilo de imágenes
- Flow solo corre en la laptop. Con `LAPTOP_URL`/`LAPTOP_CLAVE` en el .env del VPS, el botón "Generar en la laptop (Flow)" manda el proyecto a la laptop (por Tailscale), la laptop genera y el espejo regresa las imágenes al VPS. La laptop debe estar prendida, con la fábrica abierta, escuchando en su IP de Tailscale (`HOST=127.0.0.1,100.x.x.x`) y con `ESPEJO_*` configurado.
- "Generar con APIMart" está en todos los estilos de imágenes por escena (Estatuas, Historia): Nano Banana 2, unos centavos por imagen; lo generado entra al banco.

## Ver los videos desde el celular (espejo laptop → VPS)
Con `ESPEJO_URL`/`ESPEJO_CLAVE` en la laptop, al terminar cada paso de un video la laptop manda al VPS el proyecto completo (guion, voz, imágenes, copy, portada, video final y `listos/`). Botón "Enviar al VPS" en cada video para forzarlo. Si el mismo id está en las dos máquinas, gana la laptop. La carpeta `flow/` (logs) no se manda.
