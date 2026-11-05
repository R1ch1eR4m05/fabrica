# Cómo se escribe un guion de "Terror · Linterna"

Videos de terror cotidiano y leyendas, contados en segunda persona ("tú"), con frases cortas y pausas.
Funciona en dos formas (elige la que pida la idea):
- **Reglas:** "Si te pasa X, sigue estas reglas". Cada regla es una escena de tipo `regla`.
- **Relato:** una historia corta con un giro al final.

## Estructura
1. `gancho` (obligatorio, primera escena): una pregunta o situación que da miedo en 1-2 frases. Máximo 18 palabras.
2. `titulo`: el nombre del relato o "Si ___". Muy corto (3-7 palabras). Puedes poner "etiqueta" (por ejemplo "LEYENDA", "CASO REAL", "REGLAS").
3. `narracion`: contexto. Frases de 6 a 14 palabras. Una idea por escena (1-3 frases por escena).
4. `dato`: un hecho real verificado que vuelve creíble el miedo (cifra, estudio, año). Pon el número en "cifra" ("37 %", "1996") y una fuente corta en "fuente" ("Sleep Medicine Reviews, 2011"). Al menos 1 en corto y 3 en largo.
5. `regla`: (si es formato reglas) una regla clara en imperativo y su porqué. 3-5 reglas en corto, 7-12 en largo.
6. `giro`: la vuelta de tuerca final, la que da escalofrío.
7. `cierre`: una frase que invite a comentar o seguir ("¿Tú ya la rompiste?"). Corto.

## Campos de cada escena
- `tipo`: uno de los de arriba.
- `texto`: lo que dice la voz y aparece en pantalla. Escribe los números como se leen si hay riesgo ("las tres de la mañana"), pero en `cifra` va el número.
- `visual`: el fondo. Elige el que mejor pinte la frase:
  `oscuridad` (nada), `linterna` (haz que barre una pared y descubre una silueta), `puerta` (puerta que se entreabre),
  `pasillo` (pasillo con foco que falla y una figura que se acerca), `ojos` (dos ojos en la oscuridad; "color":"rojo" opcional),
  `ventana` (ventana con luna y silueta detrás), `reloj` (reloj rojo; "hora":"3:33" opcional), `estatica` (televisión con estática),
  `escalera` (escalera que baja a lo oscuro), `telefono` (llamada entrante; "quien" y "hora" opcionales), `bosque`,
  `cama` (algo debajo de la cama), `espejo` (otra figura en el reflejo), `imagen` (con "imagen":"img/archivo.jpg" del proyecto).
  Cambia de visual cada 1-3 escenas; repetir el mismo en escenas seguidas mantiene el plano.
- Opcionales: `sfx` ("golpe", "estatica", "latido", "susurro", "campana"), `pausa` (segundos de silencio después, 0.2-2),
  `capitulo` (texto, solo en largo, para los capítulos de YouTube).

## Tono
- Español de México natural. Nada de groserías ni gore. El miedo viene de lo cotidiano y de lo que no se ve.
- Nunca inventes datos. Si la idea dice algo que no se sostiene, cámbialo por algo verificable.
- Las leyendas se cuentan como leyendas ("dicen que…"), no como hechos.
- `subir.titulo`: la pregunta-gancho. `subir.hashtags`: 4-6, en español.
