# Cómo se escribe un guion de "Filosofía · Viaje de escala"

La cámara sube sin parar desde la calle donde estás hasta el universo observable. Un panel de datos y una frase en cursiva cuentan una idea filosófica que se vuelve tangible con la altura. Funciona sin voz (la frase lleva la narración) o con voz grave. Español de México, segunda persona ("tú").

Nace de algo que ya funcionó (regla de la fábrica): adapta la idea, nunca copies frases ni el texto de otros videos. Todas las cifras, con 2 fuentes fiables; nunca inventes datos.

## La idea de fondo
Cada video es UN pensamiento que se entiende mejor al alejarte: el tamaño de tu problema (Marco Aurelio y su "vista desde arriba"), lo que no controlas, la opinión de los demás. El panel muestra una cifra que cambia con la altura y esa cifra ES el argumento. Si la idea no se vuelve una cifra que cambia al subir, no es para este estilo.

## Estructura (corto, 60-90 s)
1. **Gancho (0-4 s):** la primera frase de 4-9 palabras, sin saludo, que se entiende sola ("Hoy cargas un problema que te parece enorme."). En ese momento la cámara está a ~2 m, detrás de ti, con tu problema como una nube sobre la cabeza.
2. **Subida (12-16 escenas):** cada escena sube a un lugar con nombre (la ciudad, el borde del espacio, la Luna, el Sol, la estrella más cercana, la galaxia, el universo). Una frase de 8-16 palabras por escena; ritmo de una escena cada 4-6 s.
3. **Cierre:** vuelve a la persona: lo que cambia (y lo que NO) al mirar desde arriba. Una idea para guardar. Cierre de "comenta X" solo si Richie lo autorizó en el nicho.

## Campos de cada escena
- `voz`: lo que dice la voz (si no hay `texto`, también es la frase que se ve). 8-16 palabras, números con letra.
- `texto` (opcional): frase distinta a la voz para la pantalla.
- `altura` **(obligatoria)**: altura de la cámara, en **metros**, cuando EMPIEZA esa escena. Tiene que crecer de una escena a la siguiente. Entre una y otra la cámara sube suave (en logaritmo). La primera: 1.7.
- `hito` (opcional): nombre del lugar al que llega la cámara en esa escena (en mayúsculas). El panel muestra "SIGUIENTE <hito>" y los metros que faltan; para que cuente bien, pon el `hito` en la escena donde la cámara ALCANZA ese lugar.
- `nota` (opcional): línea chica bajo la altura ("MÁS ALTO QUE UNA AZOTEA").
- `der` (opcional): reemplaza el dato de la derecha en esa escena: `{ "titulo": "LO QUE CONTROLAS", "valor": "100 %", "nota": "DE LO QUE VES" }`. Por defecto sale "TU PROBLEMA OCUPA" con el % real de tu campo visual (un problema de 50 cm). Para otras ideas, cambia los textos de todo el video con `hud` (abajo).
- `izq` (opcional): igual, para el dato de la izquierda (por defecto la altura).
- `capitulo` / `reel` (videos largos): ver abajo.

A nivel de guion:
- `alturaFin`: a dónde llega la cámara al final (m). Por defecto 8 veces la última altura.
- `hud`: `{ "izq": "TU ALTURA", "der": "TU PROBLEMA OCUPA", "derNota": "DE LO QUE VES", "sig": "SIGUIENTE" }` para cambiar los títulos fijos del panel.
- `titulo`, `fuentes` [{dato, url}] y `subir` {titulo, descripcion, hashtags}, como en los demás estilos.

## Los mundos (la altura decide cuál se ve)
| Altura (m) | Qué se ve |
|---|---|
| 1.7 – 300 | Tu calle al atardecer, casas, árboles; tú y tu problema |
| 300 – 100 000 | Vista cenital: ciudad, campos, mar |
| 100 000 – 3×10⁹ | La Tierra curva, la atmósfera, la Luna (3.84×10⁸) |
| 3×10⁹ – 10¹³ | El sistema solar: Sol (1.5×10¹¹), planetas, Neptuno (4.5×10¹²) |
| 10¹³ – 10¹⁸ | Estrellas cercanas: Próxima Centauri (4.0×10¹⁶), Sirio, Vega |
| 10¹⁸ – 10²² | La Vía Láctea: el Sol a 2.5×10²⁰ del centro, la galaxia entera ~10²¹ |
| 10²² – 10²⁷ | Grupo local, Andrómeda (2.4×10²²), cúmulo de Virgo (5×10²³), la telaraña cósmica; el universo observable llega a ~4×10²⁶ |

Referencias útiles: 1 km = 10³ m · Everest 8.8×10³ · línea de Kármán 10⁵ · ISS 4×10⁵ · 1 UA = 1.5×10¹¹ · 1 año luz = 9.46×10¹⁵ · 1 millón de años luz = 9.46×10²¹.

## Reglas
- Citas solo reales y verificadas (Marco Aurelio, Meditaciones: libros 7 y 9 hablan de mirar desde arriba); si no estás seguro, parafrasea sin atribuir.
- Nada de promesas de salud, dinero ni "ley de la atracción".
- Que la última altura no se pase de ~4×10²⁶ m: más allá ya no hay nada que mostrar.

## Versión larga horizontal (16:9, 6-12 min)
Mismo estilo, formato 16:9. Se arma en capítulos, uno por escala, cada uno con su propia idea y su propio gancho (se publica aparte en Facebook):
1. **Tu calle** (1.7 m – 10 km): el problema de hoy frente a tu ciudad.
2. **El planeta** (10 km – Luna): lo que ve quien mira la Tierra entera.
3. **El sistema solar** (Luna – Neptuno).
4. **Las estrellas** (hasta la galaxia).
5. **El universo** (hasta el borde) y el cierre.
Marca `capitulo` en la primera escena de cada uno y `reel: true` en la escena donde conviene empezar el Reel vertical de 45-60 s de ese capítulo. "Cortar por capítulos" (panel) saca un video por capítulo y un Reel de cada uno. Pon 25-45 escenas de 10-15 s.
