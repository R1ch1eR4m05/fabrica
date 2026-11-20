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
