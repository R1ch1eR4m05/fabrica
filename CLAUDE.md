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

## Investigador y Flow
- El nicho vive en `investigacion/nicho.json`; cada investigación en `investigacion/<fecha>.json` (patrones + propuestas).
- Si Richie pide investigar desde Claude Code sin API: busca en la web, sigue el mismo formato de propuestas y guarda el archivo ahí; el panel lo muestra.
- Si flow-mcp está conectado como MCP, puedes generar el clip de una propuesta con su `flowPrompt` (9:16) y copiarlo como `proyectos/<id>/fondo-propio.mp4`; luego en el panel "Buscar otro fondo" o rehacer la voz lo vuelve a preparar.
- Frases de otras cuentas: solo como inspiración. Nunca copiarlas.

## Reglas
- No pidas llaves por el chat: van en `.env`.
- No borres nada de `proyectos/` ni de `listos/` sin que Richie lo pida.
- Código y textos propios: no copies código ni textos de plantillas de terceros (la "Plantilla gratis de Animaciones" de Skool no permite reutilizarse para esto).
