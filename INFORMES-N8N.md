# Mandar informes diarios a la fábrica (muse.ai, Gemini, lo que uses)

La fábrica acepta informes de texto (markdown, texto, CSV, JSON o HTML) y los convierte en propuestas de video.

## 3 formas
1. **A mano:** Investigador → "Importar un informe" → pegar → "Importar y proponer".
2. **Carpeta:** suelta el archivo en `fabrica/investigacion/entrada/`. Cada minuto se importa solo (con el panel abierto).
   Truco: si tu herramienta guarda en Google Drive, sincroniza esa carpeta de Drive con `investigacion/entrada/`.
3. **n8n (automático, diario):** en tu n8n del VPS:
   - **Disparador:** Schedule (todos los días 7:00) o el correo/webhook donde te llega el informe de muse.ai.
   - **Obtener el informe:** el nodo que corresponda (Gmail, Google Drive, HTTP de la API de muse.ai si tiene).
   - **HTTP Request:**
     - Método `POST`, URL `http://IP-DE-TU-FABRICA:4870/api/investigacion/importar`
     - Autenticación: Basic Auth (usuario cualquiera, contraseña = tu `PANEL_CLAVE`)
     - Body JSON: `{ "texto": "{{ $json.texto_del_informe }}", "fuente": "muse" }`
   La fábrica corre en el VPS para esto (o en la laptop si n8n la alcanza).

## Quién convierte el informe en propuestas
- Con `GEMINI_API_KEY` (gratis): al instante.
- Con `ANTHROPIC_API_KEY` (de pago): al instante.
- Sin ninguna: queda guardado como pendiente; en Claude Code di "convierte los informes pendientes".
