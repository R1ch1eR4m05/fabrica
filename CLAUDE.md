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

## Cuando pida un estilo nuevo
Sigue ESTILOS.md: carpeta nueva con `estilo.json`, `GUION.md`, `plantilla.html` e `ideas.json`.
Pruébalo con un proyecto de prueba y `node fabrica.js fotos`, en 9:16 y 16:9. Mira las imágenes y corrige lo que se encime o se salga del cuadro.
Si el estilo ya existía como "pronto", quítale `"estado": "pronto"`.

## Motion graphics ("construye el motion de <id>")
La skill vive en `motion/` (claude-video, MIT, textos en portugués; tú hablas en español con Richie). `$SKILL` = `<raíz de la fábrica>/motion`.
1. Lee `proyectos/<id>/BRIEF.md` y `proyectos/<id>/proyecto.json` (campo `motion`). Las etapas A y B ya están hechas: no vuelvas a preguntar lo que ya dice el brief.
2. Sigue `motion/SKILL.md` desde la **etapa C** con la carpeta de trabajo `proyectos/<id>/motion/` (proyecto en `proyectos/<id>/motion/proj`).
   Formato del brief (por defecto **9:16 → `9x16`**, 1080×1920). Las fichas vienen en 16:9: reacomoda la composición a vertical, mantén mecanismo, paleta, traço y ritmo.
3. Mismos portones: tarjetas aprobadas antes de animar, 3 fotogramas aprobados antes del render (guárdalos en `proj/frames/`, el panel los muestra).
4. Clips de IA: no Higgsfield. Usa flow-mcp si está conectado (9:16, con aprobación y tope de créditos) o pídele el clip a Richie.
5. Render final con `bash motion/scripts/render.sh proyectos/<id>/motion/proj proyectos/<id>/final.mp4 high` y luego `node fabrica.js listo-motion <id>` (lo copia a `listos/`).
Requisitos en la laptop: Node 22+, ffmpeg, Python 3 y Git Bash (`bash motion/scripts/checar.sh` lo revisa).

## Investigador desde Claude Code (sin API de Claude)
Cuando Richie diga "investiga" o "dame frases virales":
1. Si hay `APIFY_TOKEN` en el .env: `node fabrica.js recolectar` y lee el archivo `investigacion/datos-*.json` que indica (40 publicaciones con vistas, guardados, compartidos y `rebase` = vistas/seguidores).
   Descarga las portadas de las 12 mejores a una carpeta temporal y míralas: ahí suele ir la frase. Si no hay Apify, investiga con búsqueda web y dilo (sin métricas reales).
2. Saca 5-8 patrones concretos y escribe `investigacion/AAAA-MM-DD-HH-MM.json` con este formato:
   `{ "fecha", "modo": "metricas"|"web", "errores": [], "patrones": [...], "propuestas": [{ "n", "frase" (original, con *palabra clave*), "autor" (solo cita real verificada), "cierre", "tema", "porque", "inspiradaEn": [urls], "flowPrompt" (inglés, 9:16, slow motion, shallow depth of field, una acción emotiva, no text), "pexels", "tituloPost", "descripcion", "hashtags" }], "publicaciones": [...] }`
   Usa `investigacion/nicho.json` (audiencia, marca, número de propuestas). Nunca copies frases de otras cuentas.
   Las cuentas en inglés son señal temprana: adapta (no traduzcas) a mamás hispanas de México y EE. UU. y llena `origen` (en/es/ambos), `llegada` (ya está en español / poco en español / aún no llega) y `adaptacion`. Prioriza lo que "aún no llega".
3. Dile a Richie que recargue el Investigador del panel: ahí puede crear los videos.

## Informes externos (Gemini Deep Research, muse.ai, n8n)
- Los informes llegan a `investigacion/informes/*.md` (pegados en el panel, soltados en `investigacion/entrada/` o enviados por n8n a `POST /api/investigacion/importar`).
- Los que no terminan en `.hecho.md` están pendientes. Si Richie dice "convierte los informes pendientes": léelos, escribe la investigación en el formato de arriba (`"modo": "informe"`, `"fuente"`) y renombra el informe a `.hecho.md`.

## Investigador y Flow
- El nicho vive en `investigacion/nicho.json`; cada investigación en `investigacion/<fecha>.json` (patrones + propuestas).
- Si Richie pide investigar desde Claude Code sin API: busca en la web, sigue el mismo formato de propuestas y guarda el archivo ahí; el panel lo muestra.
- Si flow-mcp está conectado como MCP, puedes generar el clip de una propuesta con su `flowPrompt` (9:16) y copiarlo como `proyectos/<id>/fondo-propio.mp4`; luego en el panel "Buscar otro fondo" o rehacer la voz lo vuelve a preparar.
- Frases de otras cuentas: solo como inspiración. Nunca copiarlas.

## Reglas
- No pidas llaves por el chat: van en `.env`.
- No borres nada de `proyectos/` ni de `listos/` sin que Richie lo pida.
- Código y textos propios: no copies código ni textos de plantillas de terceros (la "Plantilla gratis de Animaciones" de Skool no permite reutilizarse para esto).
