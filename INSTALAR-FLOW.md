# Google Flow en la fábrica

## Opción recomendada: Google Flow Skill (en tu laptop)
Repositorio: https://github.com/BRPLia/google-flow-skill-v1 (MIT). Maneja Flow en tu Chrome y descarga los clips solo.
1. En PowerShell: `cd C:\Users\jr_ra` y `git clone https://github.com/BRPLia/google-flow-skill-v1 flow-skill`
2. `cd flow-skill` → `python setup.py` → `python flow.py login` (se abre Chrome: entra con tu cuenta de Google y cierra cuando veas Flow).
3. En `C:\Users\jr_ra\fabrica\.env`: `FLOW_SKILL_DIR=C:\Users\jr_ra\flow-skill` y reinicia la fábrica. El aviso de arriba dirá "Flow (skill) ✓".
4. En Historia con Flow: "Generar en Flow los que faltan" (con "personajes iguales" hace imagen de personajes → cuadro por escena → video).
Gasta créditos de Flow. Automatiza la página de Flow: puede romperse si Google la cambia y puede ir contra sus términos.

## Opción anterior: flow-mcp
# Conectar Google Flow (flow-mcp) — opcional

flow-mcp (https://github.com/GTAI-1/flow-mcp, licencia ISC) abre su propio Chrome con tu sesión de Google y maneja Flow por ti.
**Su autor avisa que automatizar Flow puede ir contra los términos de Google.** Úsalo con una cuenta que estés dispuesto a arriesgar.

## Windows (una sola vez)
1. Instala Git (git-scm.com) si no lo tienes.
2. Abre una terminal en `C:\Users\TU_USUARIO` (no en Escritorio ni Documentos si OneDrive los sincroniza) y corre:
   ```
   git clone https://github.com/GTAI-1/flow-mcp.git
   cd flow-mcp
   npm install
   npm run build
   npm run login
   ```
3. Se abre un Chrome aparte: inicia sesión en Google, abre Flow y deja la ventana abierta.

## Cada vez que lo uses
- Doble clic en `flow-mcp\Flow Studio.cmd` (deja esa ventana y su Chrome abiertos; la computadora no debe dormirse).
- En el panel de la fábrica debe aparecer arriba "Flow conectado ✓".
- Opcional: conéctalo también a Claude Code: `claude mcp add --scope user flow -- node C:\Users\TU_USUARIO\flow-mcp\dist\index.js`

Nota: el propio autor dice que en Windows todavía no se ha probado en una PC real. Si algo falla, el camino "Copiar prompt" siempre funciona.
