# Anti-diapositivas: reglas para que el motion se vea como video, no como presentación

Ideas tomadas de **Bang Motion** (Bang Tutorial, MIT, https://github.com/bangtutorial/bang-motion), reescritas en
español y adaptadas a Reels/TikTok 9:16 de la fábrica. Donde algo choque con la ficha del estilo elegido o con la
lista de "lo que no puede" de `SKILL.md`, gana lo nuestro (por ejemplo: aquí no se usa brillo/bloom en el texto).

Léelo en la etapa C **antes de los cards** y vuelve a pasarlo como lista en los 3 frames y antes del render final.

## 1. El primer segundo (gente que no te sigue decide en 1 s)
- Fotograma 0 = el gancho ya completo y legible. Nada de armar la frase palabra por palabra en el arranque.
- Algo se mueve desde el fotograma 0 (cámara acercándose, objeto entrando). Un primer segundo quieto se ignora.
- En el segundo 1-3 llega el giro o la contradicción que obliga a quedarse.

## 2. Revisiones que se hacen sobre el CÓDIGO (no "a ojo")
Si falla una sola, rehaz antes de enseñar nada:
1. **Escenas = bloques que se prenden y apagan.** Si 3 o más escenas son contenedores que solo cambian de opacidad,
   es una presentación. Las escenas cambian porque la cámara o el mundo se mueven.
2. **Hilo visual.** Un sujeto u objeto que sigue en pantalla más del 60 % del tiempo, o un mismo mundo que la cámara
   recorre. Imágenes que se reemplazan una tras otra sin nada en común = presentación.
3. **Máximo 2 niveles de texto por escena:** una frase o número grande + una etiqueta. Antetítulo + título + cuerpo =
   diapositiva.
4. **El único movimiento no puede ser un acercamiento lento a una imagen.** Cada escena necesita otra fuente de vida
   (fondo que se mueve, objeto que actúa, cambio de tamaño de plano).
5. **Transiciones variadas:** al menos 2 tipos distintos en el video y al menos 1 con profundidad. Fundido + rebote
   en todos los cortes = plantilla.
6. **Estructura de plantilla:** si el guion es "texto que crece y sale a la izquierda → tres tarjetas de beneficios
   → caja de búsqueda que se escribe → logo → llamado", y no es porque la idea lo pida, cambia la estructura.

## 3. Texto
- Una escena = una afirmación. Más de 6 palabras es un error: parte la frase en dos escenas o vuélvela visual.
- Orden de atención: primero la frase, luego el objeto principal, al final el detalle. Nunca al revés.
- **Legible en el celular (cuadro de 1080 de ancho):** nada por debajo de 30 px; cuerpo ≥ 44 px, etiquetas ≥ 34 px.
- No todo en MAYÚSCULAS, ni todo centrado, ni todo entrando con el mismo escalonado de letras. Alterna tamaño,
  dirección y posición; pon el texto cerca de su objeto cuando se pueda.
- Sin punto automático al final de cada frase corta; `?` solo si es pregunta de verdad.
- Si resaltas palabras, un solo tipo de resaltado en todo el video (subrayado, marcador, cambio de color…) y no en
  todas las frases. "Sin resaltado" también es válido.
- Números que cambian cada cuadro: `font-variant-numeric: tabular-nums` y ancho mínimo para que no bailen.
- Nada de metadatos (URLs largas, nombres de paquete, versiones).

## 4. Contraste (el texto manda sobre el fondo)
- Debajo del texto blanco el fondo debe quedar oscuro (≈ 25 % de luminancia o menos); si el fondo es movido, pon una
  "bolsa" oscura difuminada detrás del texto que aparece con él.
- Elementos de fondo con colores del lado oscuro de la paleta, opacidad ≤ 0,35 cerca del texto, pocos (≤ 40 brillantes).
- **Prueba rápida:** pasa un frame a blanco y negro. Si algo del fondo brilla tanto como las letras, el fondo sobra.
  Con el texto oculto, el fondo debe sentirse tranquilo, no llamativo.
- Alternar escenas oscuras y claras da más contraste que cualquier efecto.
- En duda: fondo más oscuro y letra más grande.

## 5. Cámara y tamaño de plano
- **Respiración de cámara** siempre encendida (deriva de zoom suave ±4-5 % por escena, dirección alternada, sin
  saltos). Es la base, pero casi no se nota: no cuenta como "zoom".
- Si el video se siente quieto, el arreglo es **cambiar de tamaño de plano**: la cámara se acerca a lo que está
  contando (el texto que acaba de entrar, el objeto que llega) y luego se abre a plano general cuando la composición
  lo necesita. No repitas el mismo tamaño dos veces seguidas.
- Una escena puede nacer ya en primer plano y abrirse. El cierre (logo, llamado) también lleva un acercamiento lento:
  nunca se congela.
- Movimiento con sentido: acercarse = énfasis; paneo = revelar poco a poco; alejarse = revelar el todo.

## 6. Transiciones (elige del menú; mínimo 2 tipos, 1 con profundidad, barridos máximo 2)
| Transición | Cómo | Sensación |
|---|---|---|
| Atravesar en 3D | capas a distinta profundidad; la de enfrente pasa más rápido | entrar al mundo |
| Tarjeta u objeto que gira desde el fondo | `rotateY` −35° → 0 con perspectiva; el anterior se va al revés | premium |
| Objeto con grosor que pasa por la lente | crece 1 → 2,5× con desenfoque direccional y tapa el cuadro un instante | cinematográfico |
| Barrido de luz | la luz cubre 40-60 % del cuadro en el corte | suave |
| Máscara con forma de la marca | la escena nueva se ve por un hueco con forma de logo/letra que crece | marca fuerte |
| Latigazo con desenfoque | el mundo se corre 120-200 px con desenfoque, 0,3 s, dirección alternada | energía |
| Cambio de foco | la escena vieja se desenfoca y se va atrás; la nueva entra nítida | narrativo |
| Coreografía encimada sin corte | lo viejo sale rápido mientras lo nuevo ya entra | fluido |

No usar como default: bloques planos de color barriendo todo el cuadro, líneas delgadas barriendo, ni la misma
transición en todos los cortes. Nada de giros/zooms de golpe con desenfoque en cada corte (eso es preset de editor).
Nunca correr el mundo tanto que se vea el borde negro.

## 7. Ritmo de entradas y salidas
- **Asimétrico:** entrar lento y firme (0,7-1,3 s, `power4.out`), salir rápido (0,35-0,55 s, `power2.in`).
  Simétrico se siente mecánico.
- Elige 1 o 2 momentos especiales para el efecto más caro. En todas partes deja de ser especial.

## 8. Fondo: siempre vivo, nunca plano
Elige UN lenguaje de movimiento de fondo por pieza (dos si cambia de segmento) y anótalo en el BRIEF:
fondo con textura + respiración de cámara · degradado grande que se desplaza lento · manchas de color flotando ·
grano vivo (desplazado según `t`, nunca aleatorio) · un barrido de luz por segmento · formas grandes de la marca
girando lento en 2 capas · partículas que suben (no horizontales) · rejilla que respira · texto fantasma gigante
deslizándose · foto con paralaje de 2 capas · campos de color que se alternan al ritmo.
Las rayas/estelas horizontales solo si el tema es velocidad, y no dos piezas seguidas.
Fondo de un solo color plano de principio a fin = falla: al menos 2 capas (resplandor de horizonte, degradado
diagonal, manchas, foco + tinte, textura).

## 9. Clips dentro del motion
Un clip (de Flow o de Richie) va como capa amarrada al mismo reloj: dentro de un marco, celular, máscara o tarjeta
que también se anima, con el texto vivo encima. Nunca pegado a pantalla completa con su propio reloj mientras todo
lo demás se congela.

## 10. Prueba de gusto (con cada frame que revises)
- ¿Este cuadro podría ser una diapositiva corporativa sin cambiarle nada? → falla, rehaz.
- ¿Sé a dónde mirar en 0,2 s? → si no, quita elementos.
- Sin el texto, ¿el fondo sigue siendo interesante pero tranquilo? → las dos cosas deben ser sí.
- ¿Algo se mueve por la cámara y no solo porque el elemento se anima solo? → sí en cada transición.
