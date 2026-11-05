# Fábrica de videos

Una sola interfaz para hacer videos de varios estilos. Cada estilo es una carpeta dentro de `estilos/`: para agregar uno nuevo basta con crear su carpeta, y aparece solo en el panel.

**Estilos**
- ✅ **Terror · Linterna**: relatos y reglas de terror, en 9:16 y 16:9, cortos o largos.
- ✅ **Frases · Fondo desenfocado**: clip de Pexels o tuyo, desenfocado, letra elegante palabra por palabra, con voz o solo música. Temas Noche, Cálido, Levania y Claro.
- ✅ **Mapas · Shorts de geografía**: historia de un territorio, comparar tamaños reales, fronteras raras y rutas con kilómetros. Looks Plano, Satélite y Papel antiguo. Banderas con ojos y caras, estados de cada país, ciudades. Ver `estilos/mapas/CREDITOS.md`.
- ✅ **Motion graphics · 21 estilos** (de la skill claude-video, MIT): eliges el estilo en una galería, llenas el brief en el panel y Claude Code construye la pieza; se renderiza con HyperFrames.
- ✅ **Levania · Datos**: gráficas con datos reales en la paleta de Levania (reloj que avanza, barra de rango recomendado, contador, comparación, tarjetas "en vez de / di"). Voz desde el primer cuadro, cortes secos, fuente en pantalla y versión Instagram (Comenta RUTINA) o TikTok (link en mi perfil).
- ⏳ Animación 3D tipo película (Kling vía APIMart)

## Investigador de virales
Botón **Investigador de virales** en el panel. Pones las cuentas de referencia de tu nicho, hashtags y búsquedas. El investigador:
1. Recolecta las publicaciones recientes de TikTok e Instagram (con Apify).
2. Las ordena por lo que de verdad indica viralidad en frases: guardados, compartidos y **cuánto rebasaron a sus seguidores**.
3. Claude mira las mejores (texto y portada), saca los patrones y propone **frases originales** (inspiradas, no copiadas), cada una con su cierre, su **prompt de Flow en 9:16 y cámara lenta**, su búsqueda de Pexels y el texto para publicar.
4. **Crear video 9:16** deja el proyecto listo: guion escrito y prompt de Flow puesto.

## Clips con Google Flow (flow-mcp)
En el paso "Voz y fondo" de cada frase tienes el prompt para Flow y dos caminos:
- **Copiar prompt** → lo pegas tú en Flow (9:16), descargas el clip y lo subes con "Subir mi fondo". Es lo más seguro para tus cuentas.
- **Generar en Flow** → si tienes abierto flow-mcp (ver INSTALAR-FLOW.md), la fábrica le pide el clip, lo descarga y lo pone de fondo. Te pide confirmación y respeta un tope de créditos.

> El propio flow-mcp avisa que automatizar Flow puede ir contra los términos de Google. Úsalo bajo tu riesgo; si te preocupa una cuenta, usa "Copiar prompt".

## Cómo se hace un video
1. **Nuevo video**: eliges el estilo, la idea, el formato (9:16 o 16:9) y la duración.
2. **Guion**: lo escribe la IA desde el panel (con datos verificados en internet), o Claude Code, o tú. Se edita escena por escena: tipo, fondo, texto, efecto.
3. **Voz**: ElevenLabs genera la voz y guarda en qué segundo se dice cada palabra. Así el texto y los dibujos aparecen justo cuando la voz los dice.
4. **Vista previa** en vivo y **Sacar el video**: se genera el MP4, la portada y el texto para subir (título, descripción, hashtags y fuentes). Todo queda también en la carpeta `listos/`.

En los estilos con fondo puedes **subir tu propio clip o foto** y **tu propia música** desde el panel (paso 2). Si no, el panel busca un clip en Pexels con las palabras que puso el guion.

**Lotes:** el botón **Voz + video** hace todo de un jalón, y en el investigador **Crear y hacer todas** deja en fila un video por propuesta.

Para tener el mismo video en los dos formatos, cambia el botón 9:16 / 16:9 y vuelve a sacarlo. No hace falta repetir la voz.

## Actualizar
La fábrica vive en GitHub (repositorio privado). Cuando haya estilos o arreglos nuevos:
- **Windows:** doble clic en **`Actualizar (Windows).cmd`**.
- **VPS:** `bash actualizar-vps.sh`.

Tu `.env`, tus proyectos, tus videos, las investigaciones y la caché del satélite **no se tocan nunca** (están fuera del repositorio).

## Instalar en la laptop (Windows)
1. Instala **Node.js 22 o más nuevo** (nodejs.org) y **Git** (git-scm.com).
2. Abre una terminal en `C:\Users\TU_USUARIO` y descarga la fábrica (te pedirá entrar a GitHub la primera vez):
   ```
   git clone https://github.com/R1ch1eR4m05/fabrica.git
   ```
3. Entra a la carpeta `fabrica` y doble clic en **`Instalar (Windows).cmd`**. Instala el motor de render, ffmpeg y el navegador, y abre el `.env` para que pongas tus llaves.
4. Doble clic en **`Abrir fábrica (Windows).cmd`**. El panel se abre en tu navegador. No cierres esa ventana negra mientras lo usas.

## Instalar en el VPS (Contabo, Ubuntu)
```
git clone https://github.com/R1ch1eR4m05/fabrica.git && cd fabrica && bash instalar-vps.sh
```
Deja la fábrica como servicio, abierta en `http://IP-DEL-VPS:4870/` y protegida con la clave que aparece al final (queda guardada en el `.env`). Desde ahí también puedes hacer lotes con `node fabrica.js todo <id>`.

> El VPS no tiene tarjeta gráfica: renderiza más lento. Sirve para dejar videos haciéndose de noche.

## Llaves (archivo `.env`)
| Llave | Para qué | Sin ella |
|---|---|---|
| `ANTHROPIC_API_KEY` | Escribir el guion desde el panel | Lo escribe Claude Code o tú |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Voz real | Voz de prueba muda (para ensayar) |
| `VOZ_TERROR_LINTERNA`, `VOZ_FRASES_DESENFOCADO` | Una voz distinta por estilo | Usa `ELEVENLABS_VOICE_ID` |
| `PEXELS_API_KEY` | Buscar clips de fondo para las frases | Fondo degradado, o subes el tuyo |
| `APIFY_TOKEN` | Investigador con métricas reales | Investiga con búsqueda web, sin métricas |
| `FLOW_MCP_URL` | Dirección de flow-mcp (por defecto 127.0.0.1:8787) | — |
| `APIMART_API_KEY` | Imágenes y video con IA (próximos estilos) | — |
| `PANEL_CLAVE` | Proteger el panel en el VPS | En la laptop no hace falta |

## Órdenes (para Claude Code o el VPS)
```
node fabrica.js panel
node fabrica.js nuevo terror-linterna "idea" --formato 16:9 --duracion largo
node fabrica.js guion <id>          # guion con la API de Claude
node fabrica.js listo <id>          # marca como listo un guion.json escrito a mano
node fabrica.js voz <id>
node fabrica.js fotos <id>          # fotogramas para revisar
node fabrica.js render <id> [--formato 9:16]
node fabrica.js todo <id>           # voz + render
```

## Licencias
- Todo el código de esta fábrica es tuyo. Se escribió desde cero; no usa código de ninguna plantilla de terceros.
- Tipografías Oswald, Special Elite e Inter: SIL Open Font License, uso comercial libre.
- Música y efectos: se sintetizan con ffmpeg al hacer el video, así que no hay créditos que citar.
- Playwright (Apache 2.0) y ffmpeg (LGPL/GPL).
