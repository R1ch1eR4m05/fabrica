# Corporativo · Material real + cine

Video de marca al estilo de Absen «Beyond the Display»: la tecnología como creadora de experiencias, no como ficha
técnica. La credibilidad sale del MATERIAL REAL (fábrica, instalaciones, clientes, equipo); la IA solo pone el cine donde
no hace falta mostrar el producto exacto.

## Estructura (2-3 min, 16:9; también sale en 9:16)
1. **Gancho (0-15 s):** imagen épica + una frase que se entiende sola.
2. **Quiénes somos (15-40 s):** origen, años, escala (cifras verificadas).
3. **Producto en acción (40-80 s):** montaje rápido por «mundos» (concierto, estadio, corporativo, retail).
4. **Prueba real (80-110 s):** un caso con nombre y apellido, con su video y su testimonio real.
5. **Instalaciones (110-140 s):** showroom, almacén, equipo.
6. **El diferenciador (140-160 s):** soporte local, stock, garantía.
7. **Cierre (160-180 s):** marca, dirección, contacto, sobre la mejor toma.

## Reglas
- **Nada de producto inventado.** Lo que se vende (pantallas, el estadio, la fábrica, el equipo) va SIEMPRE con material
  real (`fuente`). Wan (`wan`) solo para el gancho y los «mundos» genéricos, sin logos, sin texto y sin prometer un modelo
  concreto.
- **Cifras y testimonios:** solo verificados (2 fuentes o la página oficial del caso), y van en `fuentes`. Las frases de
  clientes se citan tal cual y con su autor.
- **Narración:** frases de 8-18 palabras, tono seguro y cálido, en español de México. Unas 380-420 palabras para 3 min.
- **Ritmo:** ninguna escena de material dura más de 8 s; las tomas de Wan, 6-10 s.
- Logo, dirección y WhatsApp van como `sobre`/`etiqueta` (los pone la fábrica), nunca dentro de una toma de Wan.

## Formato de guion.json
```json
{
  "titulo": "…",
  "wanEstilo": "Cinematic commercial shot, shot on ARRI Alexa, anamorphic lens, shallow depth of field, rich contrast",
  "escenas": [
    { "voz": "La tecnología que se ve… se siente.", "wan": "Night stadium seen from the stands, colored smoke drifting, a gigantic LED screen lights up and the crowd raises their arms, slow dolly forward", "duracionToma": 8, "refs": ["I2.jpg"] },
    { "voz": "Desde 2013, en Shenzhen…", "fuente": "V2.mp4", "desde": 12, "hasta": 19, "etiqueta": "SHENZHEN · DESDE 2013" },
    { "voz": "…", "fuente": "I8.jpg", "camara": "acercar", "sobre": "12,000+ CLIENTES" }
  ],
  "fuentes": [{ "dato": "…", "url": "…" }],
  "subir": { "titulos": ["…", "…", "…"], "descripcion": "…", "hashtags": ["#…"] }
}
```
- `fuente`: archivo de `material/` (lo sube Richie con ese nombre). Videos con `desde`/`hasta` (segundos del archivo); fotos con `camara` (acercar, alejar, derecha, izquierda, subir, quieto).
- `wan`: prompt en inglés de la toma; `duracionToma` 4-15 s; `refs`: fotos reales de `material/` como referencia visual (p. ej. la foto del estadio).
- Una escena sin voz (solo imagen y música) lleva `"duracion": 3`.
- Si una escena no tiene fuente disponible, usa la de la escena anterior (el panel avisa).

## Cómo lo hace la fábrica
1. «Material real» (paso 2 del panel): subes los videos y fotos con el nombre que usa el guion.
2. «Generar las tomas con Wan»: muestra cuántas tomas y cuánto cuesta (APIMart en dólares o Higgsfield en créditos) y pide confirmación.
3. Voz con ElevenLabs → render con ffmpeg: recorta cada video real a su tramo, mueve las fotos, pone las tomas de Wan, sobreimpresos, subtítulos y música.


## Modo «ráfaga» (recomendado, 24 nov 2026): video de marca de 60-75 s con el ritmo de Absen
Medido en «Beyond the Display» de Absen: 71 tomas en 69 s (toma típica de 0.6 s), números enormes encima de la imagen, casi sin narrador, marca en la esquina y logo animado al final. El primer SRYLED (144 s, 30 tomas de 4.8 s) se sentía documental.
- En guion.json: `"modo": "rafaga"`, `"marca": { "nombre": "SRYLED MX", "color": "#E6194B" }`, `"volumenMusica": 0.6` (la música manda y baja sola cuando habla la voz).
- Cada escena es un BLOQUE: con `voz` corta (4-6 frases en todo el video, 3-8 palabras cada una) o en silencio con `"voz": ""`, `"duracion"` (3.5-6 s) y `"pausa": 0`.
- `"tomas": [{ "fuente": "V2.mp4", "desde": 63 }, { "fuente": "I10.jpg" }, …]`: se cortan AL GOLPE de la música, una cada `cada` pulsos (1 = ráfaga, 2 = respira). Un video que se repite avanza solo (no repite el mismo pedazo). Verticales en horizontal: completos sobre su imagen desenfocada (`"ajuste": "llenar"` para recortar).
- `"numero": { "valor": 12000, "prefijo": "+", "sufijo": " m²", "etiqueta": "CLIENTES EN EL MUNDO" }`: número enorme que cuenta hasta su valor, con barrita del color de la marca y la etiqueta. Solo cifras del kit verificado.
- `"sobre"`: texto grande; `"cierre": true` (último bloque, sin tomas): fondo negro y el logo entra (material/logo.png si existe; si no, el nombre de la marca en letra gruesa) con `"etiqueta"` debajo.
- Efectos: destello blanco al cambiar de bloque, empujón en cortes alternos, golpe/whoosh/swell de earshot si está instalado. Nada gasta.
- Las tomas de Wan se guardan en material/ como W1.mp4, W2.mp4… para usarlas como cualquier otra toma.

### Entrada «de la Tierra a tu ciudad» (modo ráfaga)
Pon en el guion `"tierra": { "lugar": "MORELIA", "detalle": "SHOWROOM · EUCALIPTO 238", "lat": 19.706, "lon": -101.195, "estado": "mic", "dur": 7 }` y como primer bloque `{ "voz": "", "duracion": 7, "tomas": [{ "fuente": "T1.mp4" }] }`. El siguiente bloque debe ser la toma REAL del exterior del lugar (celular o dron). Nunca Google Earth. Crédito del mapa en la descripción: «Mapa de México: @svg-maps/mexico (Victor Cazanave), CC BY 4.0. Imagen de la Tierra: NASA Blue Marble.»
