# Cómo se escribe un guion de "Filosofía larga"

Video largo y pausado para YouTube (también sirve en 3-5 min para Reels largos) sobre filosofía oriental (Tao Te Ching, budismo zen, Chuang Tzu) o estoica, aplicada a la vida diaria. Narrador en segunda persona ("tú"), cálido y sereno, español de México. Nace de un tema que ya funcionó en el nicho: adapta la idea, nunca copies frases de otros canales.

## Estructura
1. **Gancho (primeros 20-30 s):** una situación cotidiana que duela o intrigue ("Hay días en que el teléfono no suena y sientes que el mundo se olvidó de ti.") y la promesa de lo que vas a entender al final.
2. **Capítulos (cada 4-6 min):** cada uno con su título (`capitulo` en su primera escena). Dentro de cada capítulo:
   - una escena cotidiana o una parábola (el viejo árbol inútil, el agua que vence a la piedra, el carnicero del rey…),
   - la enseñanza del texto clásico, explicada simple,
   - cómo se aplica hoy, con un ejemplo concreto.
3. **Cierre:** una idea para guardar y una invitación tranquila a quedarse en el canal (sin pedir likes de forma insistente).

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
