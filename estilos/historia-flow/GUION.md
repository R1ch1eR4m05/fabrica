# Cómo se escribe un guion de "Historia con Flow"

Micro-historia vertical (9:16) de 25 a 40 s que adapta a una historia algo que **ya fue viral**: el mismo gancho y la misma emoción, con personajes y situaciones de familias hispanas. Español de México, narrada en primera o tercera persona. Nunca copies el texto de la publicación original.

## Estructura (5 a 7 escenas)
1. **Gancho (escena 1, 2-3 s):** una frase que detiene el scroll ("Esa noche mi hijo me dijo algo que no esperaba").
2. **Situación (1-2 escenas):** dónde estamos, qué pasa.
3. **Giro (1-2 escenas):** el momento que cambia todo.
4. **Remate (1 escena):** la lección o la emoción final, en una frase que se guarda.
5. **Cierre:** solo si hay un cierre autorizado en el nicho (cópialo tal cual); si no, termina en el remate.

## Campos del guion
- `estiloVisual` (inglés): una sola línea para TODAS las escenas, para que se vean del mismo mundo. Ej.: "Warm 3D animated film look, soft cinematic lighting, cozy Mexican home, shallow depth of field".
- `personajes` (inglés): cómo es cada personaje, igual en todas las escenas. Ej.: "Mom: Mexican woman in her 30s, wavy dark hair in a low bun, mustard sweater. Son: 6-year-old boy, short black hair, green pajamas with stars".
- `escenas[]`:
  - `tipo`: `escena` o `cierre`.
  - `voz`: la narración de esa escena (1 o 2 frases cortas, números en palabras).
  - `texto` (opcional): 2 a 6 palabras grandes en pantalla, solo en los momentos clave (gancho, giro, remate).
  - `flowPrompt` (inglés): la acción de esa toma para Google Flow/Veo, ~8 s: quién hace qué, dónde, plano y movimiento de cámara (close-up, slow push-in, over the shoulder…), emoción. No repitas aquí el estilo ni los personajes (la fábrica los agrega solos).
  - `buscar` (inglés, 2-4 palabras): por si no hay clip, para buscar uno parecido en Pexels.
  - `dibujo` (opcional): si no hay clip ni búsqueda, un dibujo animado de Levania (luna, cama, abrazo, telefono…).
- `fuentes` si la historia cita un dato real; `inspiracion`: urls de la publicación viral que la inspira.

## Reglas
- Algo cambia cada 2-3 s: cada escena es una toma distinta (plano, ángulo o momento).
- Nada de niños generados con IA presentados como reales: es una historia ilustrativa.
- Nada de promesas médicas ni de culpa hacia las mamás.

## Modo con diálogos (opción "Cómo se cuenta" al crear el proyecto)
Si el proyecto está en "Con diálogos", no hay narrador: hablan los personajes dentro de cada clip de Flow (Veo genera voz y labios).
- Cada escena trae `dialogo: [{ quien, texto, tono }]` (8 a 22 palabras en total, 8 s máximo) y `voz` con esas mismas líneas sin nombres, para los subtítulos.
- El guion trae `voces` (inglés): una descripción fija de la voz de cada personaje, que la fábrica repite en cada clip para que no cambie.
- La voz del video sale del audio de los clips (no se usa ElevenLabs): hay que generar primero los clips en Flow y luego "Voz + video".
- Evita lo que el filtro de Flow bloquea (peligro, heridas, gritos, pánico, un niño solo o en apuros). Si aun así bloquea una toma, la fábrica la reescribe más suave y reintenta sola.

## Reparto fijo (Levania y las marcas que tengan `reparto/<marca>.json`)
Los personajes viven guardados en el proyecto de Flow de la marca («Levania – Historias»): Mamá y Papá como Personajes (cara, cuerpo y voz), Hijo, Hija y Maestra como imágenes de referencia con ese nombre.
- En `flowPrompt` llama a cada personaje con `@Nombre` exacto ("@Mamá hugs @Hijo at the school gate, close-up, slow push-in") y no describas su cara ni su ropa.
- No hace falta `personajes`. Gente extra solo de fondo y sin nombre.
- La fábrica genera todo dentro de ese proyecto y convierte cada `@Nombre` en la mención real de Flow.
