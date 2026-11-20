# Cine · Toma continua (Wan 3.0)

Un solo plano de hasta 30 segundos, SIN CORTES: la cámara (en mano, a la altura de los ojos) sigue la acción de principio
a fin y los personajes hablan con su propia voz (Wan genera imagen, diálogo y sonido en una pasada). Se siente como una
escena de película filmada de corrido. Lo que funciona: UNA situación con conflicto, 2 personajes como máximo, un lugar,
y un remate que se entiende sin contexto.

## Reglas
- Gancho en los primeros 2 segundos: la primera línea de diálogo (4-9 palabras) o una acción que intriga, ya en movimiento.
- Diálogo en español de México, natural y corto: 2 a 3 palabras por segundo como máximo (30 s ≈ 50-70 palabras en total).
  Deja respiros sin diálogo: la cámara y la acción también cuentan.
- Una sola locación continua (la cámara puede caminar de un cuarto a otro, pero sin saltos de tiempo ni de lugar).
- Nada de texto en pantalla dentro del video (los subtítulos los pone la fábrica). Nada de marcas, logos ni personas reales.
- Las descripciones para Wan (`wan`, `referencias`, `protagonista`, `lugar`, `accion`, `camara`) van en INGLÉS; los diálogos (`voz`) en español.
- Duración: el `hasta` de la última escena (máx. 30). El costo depende de los segundos: no alargues de más.

## Formato de guion.json
```json
{
  "titulo": "Lo que mi padre nunca me dijo",
  "gancho": "¿Por qué no le regresaste el golpe?",
  "wan": {
    "camara": "handheld camera walking backwards in front of the two characters at eye level, slow natural breathing movement, ends in a close-up of the father",
    "pelicula": "35mm Kodak Vision3 250D film, soft natural grain, shallow depth of field",
    "luz": "warm golden-hour sunlight from behind, long shadows",
    "paleta": "amber, dusty orange, deep teal shadows",
    "idioma": "Mexican Spanish",
    "sonido": "quiet street ambience, birds, distant dogs, footsteps on gravel, no music",
    "estiloVisual": "photorealistic cinematic film still"
  },
  "referencias": [
    { "id": "padre", "nombre": "the father", "tipo": "personaje", "descripcion": "Mexican man, 45, short grey-streaked black hair, trimmed beard, tired kind eyes, faded denim work shirt, brown leather boots" },
    { "id": "hijo", "nombre": "the son", "tipo": "personaje", "descripcion": "Mexican boy, 12, messy black hair, small cut on the lip, white school polo shirt and navy pants, backpack" }
  ],
  "protagonista": "the father, calm and slow, never raises his voice",
  "lugar": "a dirt road at the edge of a small Mexican town at sunset, adobe walls, a mesquite tree",
  "escenas": [
    { "desde": 0, "hasta": 4, "quien": "hijo", "accion": "The son walks fast ahead, angry, wiping his lip. The father follows.", "voz": "¿Por qué no le regresaste el golpe?" },
    { "desde": 4, "hasta": 12, "quien": "padre", "accion": "The father catches up and walks beside him, looking ahead.", "voz": "Porque él quería que yo fuera como él. Y no le di ese gusto." },
    { "desde": 12, "hasta": 20, "quien": "hijo", "accion": "The son stops under the mesquite tree, confused.", "camara": "slow push-in on both faces", "voz": "Pero todos vieron que no hiciste nada." },
    { "desde": 20, "hasta": 30, "quien": "padre", "accion": "The father kneels to his level and smiles slightly.", "camara": "ends in a close-up of the father", "voz": "Vieron a un hombre que decidió quién manda en él." }
  ],
  "subir": { "titulos": ["…", "…", "…"], "descripcion": "…", "hashtags": ["#…", "#…", "#…"] }
}
```

## Cómo lo hace la fábrica
1. «Generar con Wan» (panel) muestra el costo estimado y pide confirmación. Sin confirmar no gasta.
2. Hace las hojas de referencia que falten (Nano Banana por APIMart, centavos): 3 vistas por personaje, lugar u objeto,
   en `proyectos/<id>/refs/<id>.png`. Si subes tus propias hojas con ese nombre, usa las tuyas.
3. Manda a Wan 3.0 el prompt armado (`wan-prompt.txt`): plano único sin cortes, cámara, película, luz, referencias numeradas
   y la coreografía con los diálogos. Guarda `clips/wan.mp4` (el anterior no se borra).
4. Transcribe el diálogo con ElevenLabs (tiempos reales de cada palabra) y quema los subtítulos en el video final.
