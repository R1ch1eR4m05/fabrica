# Cómo se escribe un guion de "Filosofía larga"

Video largo y pausado para YouTube (también sirve en 3-5 min para Reels largos) sobre filosofía oriental (Tao Te Ching, budismo zen, Chuang Tzu) o estoica, aplicada a la vida diaria. Narrador en segunda persona ("tú"), cálido y sereno, español de México. Nace de un tema que ya funcionó en el nicho: adapta la idea, nunca copies frases de otros canales.

## Estructura (video largo de 10 a 15 min, 16:9)
1. **Intro con promesa (primeros 20-30 s):** una situación cotidiana que duela o intrigue y la promesa concreta de lo que el espectador se lleva ("En 12 minutos vas a entender por qué el agua vence a la piedra y cómo usarlo con tu ansiedad.").
2. **Capítulos (3 a 5, de 2 a 4 min cada uno):** **una sola idea por capítulo**, con su título (`capitulo` en su primera escena). Dentro de cada capítulo:
   - una escena cotidiana o una parábola (el viejo árbol inútil, el agua que vence a la piedra…),
   - la enseñanza del texto clásico, explicada simple,
   - cómo se aplica hoy, con un ejemplo concreto.
3. **Cierre:** la idea para guardar, invitación a suscribirse (una vez, sin insistir) y a ver el siguiente video de la serie ("En el siguiente capítulo de la serie…").
4. Pertenece a una **serie** de Monarca; la fábrica le asigna el número.

## Metadatos (en `subir`; la fábrica los valida antes de programar)
- `subir.titulos`: 3 opciones con la fórmula [número o promesa concreta] + [problema real] + [autor]: "7 lecciones del Tao para dejar de preocuparte".
- `subir.descripcion`: 2-3 líneas con la promesa. Los capítulos con su minuto, el llamado a suscribirse y los 3 hashtags los agrega la fábrica.

## Campos
- `estiloVisual` (inglés): opcional; si no lo pones se usa acuarela con tinta (el del estilo).
- `escenas[]`:
  - `voz`: 1 o 2 frases (5-9 s, 15-22 palabras). Frases completas y con ritmo de lectura lenta; números con letra.
  - `flowPrompt` (inglés): la ilustración de esa escena, literal a lo que se dice. Alterna planos: paisaje amplio (montañas con niebla, río, bosque de bambú, camino), personaje (un monje viajero, un anciano, una mujer joven, de espaldas o de perfil, rostro sereno), detalle (manos sobre una carta, una taza de té, un pincel, hojas sobre el agua). No describas estilo ni color: la fábrica lo agrega.
  - `buscar` (inglés, 2-3 palabras): por si no hay imagen.
  - `misma: true` (opcional): la escena sigue con la imagen de la anterior con otro movimiento de cámara. Úsalo en 1 de cada 3 escenas para ahorrar imágenes en videos largos; nunca más de dos seguidas.
  - `camara` (opcional): `acercar`, `alejar`, `derecha`, `izquierda`, `subir` o `quieto`. Si no lo pones, la fábrica alterna sola.
  - `capitulo`: solo en la primera escena de cada capítulo (sale en la descripción de YouTube con su minuto). Cada capítulo debe entenderse solo: se publica aparte en Facebook.
  - `reel: true` (opcional, una por capítulo): dónde empieza el Reel vertical de ese capítulo (45-60 s). Que sea un arranque con gancho; si no la pones, el Reel empieza con el capítulo.
- `fuentes`: si citas un texto clásico (capítulo del Tao Te Ching, Meditaciones de Marco Aurelio…), pon de dónde sale.

## Reglas
- Citas solo reales y verificadas; si no estás seguro, parafrasea sin atribuir.
- Nada de promesas de salud, dinero ni "ley de la atracción".
- Nada de copiar guiones de otros canales: misma idea, palabras y ejemplos propios.

## Miniatura (obligatoria: es lo que decide si alguien da clic)
En `guion.json` pon `"miniatura"`: una lista de 3 opciones `{ "lineas": ["…","…"], "acento": 1, "escena": N }`.
- 2 a 4 palabras EN TOTAL, en 1-2 líneas cortas (máx. 12 letras por línea). Se lee a 168 px de ancho.
- No repite el título: lo complementa con la emoción o la promesa ("LA SEGUNDA / FLECHA", "DEJA DE / SUFRIR DOBLE"). Dice la verdad del video, sin engaño.
- Nombra el dolor o el deseo PRIVADO de quien lo ve, o una contradicción que intriga ("SOLO, NO / SOLITARIO"). Nada de metáforas que solo se entienden después de ver el video ("TU CASA / INTERIOR"): quien se siente solo no busca su casa interior, busca dejar de sentirse solo. Las 3 opciones van por ángulos distintos: dolor, contradicción y promesa (pon `"angulo"` y `"porque"` en cada una).
- Para la `escena` prefiere un rostro grande con la emoción visible o una silueta a contraluz. La fábrica avisa en el panel si el texto repite el título, no se conecta con su tema o pasa de 4 palabras (`revisarTexto`).
- `acento` = la línea que va en dorado; `escena` = la escena con la figura más clara (una estatua, un monje, un rostro; que se pueda recortar), distinta en cada opción.
- La fábrica las arma sola al terminar el video: figura recortada en grande a un lado con un halo, fondo oscuro desenfocado y el texto enorme del otro lado. La A se sube a YouTube al programar.
