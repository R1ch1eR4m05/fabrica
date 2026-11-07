# Anuncios (estilo `anuncios`) y la conexión con el cerebro

## En el panel
Nuevo video → estilo **Anuncios** y elige:
- **Sale como:** imágenes (cada escena del guion = una variación) o video.
- **Plantilla:** oferta, advertorial, dato, testimonio, nosotros vs. lo de siempre, antes y después, notificaciones, UGC.
  En el guion cada escena puede usar otra plantilla (`"plantilla": "versus"`), así un lote de imágenes prueba varios formatos.
- **Colores:** 5 paletas, o los de la marca en `guion.colores`.
- **Medidas:** 9:16 + 4:5 + 1:1 (por defecto) o solo la de arriba.

En el paso 2 sube **la foto del producto** (sirve de referencia para que APIMart lo pinte igual) y dale
**"Generar con APIMart las que faltan"** (Nano Banana 2, con tope por tanda). "Hacer todo" hace eso y luego saca
todas las medidas. Las imágenes quedan en `proyectos/<id>/anuncios/` y en `listos/<id>-<medida>-v<n>.jpg`, con el
texto para Meta en `listos/<id>-anuncio.txt`. Los videos: `listos/<id>-9x16.mp4`, `-4x5.mp4`, `-1x1.mp4`.

Requisitos: `APIMART_API_KEY` en el .env (opcional `APIMART_MODELO_IMAGEN`, p. ej. `gpt-image-2` o `seedream-5-0-pro`).
Sin APIMart usa Pexels con `buscar` o un degradado de la paleta.

## Desde el cerebro (o n8n): `POST /api/anuncios`
```json
{
  "idea": "Brief: qué se vende, a quién, ángulo ganador que se va a modelar y por qué",
  "nicho": "levania",
  "producto": { "nombre": "Kit de 30 actividades", "precio": "$149", "precioAntes": "$249", "beneficios": ["…"], "resenasReales": ["texto tal cual — Nombre"], "fotos": ["https://…/foto.jpg"] },
  "plantillas": ["oferta", "versus", "dato"],
  "tipo": "imagen",
  "medidas": "todas",
  "paleta": "crema",
  "hacer": true,
  "maxImagenes": 8,
  "ref": "id del anuncio de la biblioteca que se modeló"
}
```
Crea un proyecto por plantilla. Si el servidor tiene IA escribe el guion; si no, quedan para "escribe los guiones
pendientes" en Claude Code. Con `"hacer": true` genera imágenes y medidas en cuanto haya guion. También acepta `"guion"`
ya escrito (formato de `estilos/anuncios/GUION.md`). Responde `{ creados: [{ id, plantilla, conGuion }] }`.
Cada proyecto guarda `desdeCerebro.ref` para que, cuando el anuncio corra, sus métricas regresen a la biblioteca del cerebro.

## Formato nuevo a partir de un anuncio de referencia
Dile a Claude Code "agrega un formato de anuncio como este" con la captura: agrega una función a `DIBUJOS` en
`estilos/anuncios/plantilla.html` (mismas piezas: `foto`, `texto`, `boton`, `chip`…), su opción en `estilo.json`, sus campos en
`GUION.md`, y pruébalo con `node fabrica.js todo <id> --sin-apimart` en las tres medidas mirando las imágenes. Se copia la
estructura y el ángulo, nunca textos, marcas ni fotos del anuncio original.

Base: ideas de adforge (MIT, https://github.com/JonnyFi/adforge) adaptadas; el código es propio de la fábrica.
