# Cómo se escribe un guion de "Reflexión · Estatuas"

Monólogo de 45 a 120 s en segunda persona ("tú"), voz grave de hombre, tono sobrio y directo: una verdad incómoda, su consecuencia y qué hacer hoy. Español de México. Nace siempre de un video viral del formato (estoicismo, disciplina, vejez, soledad, energía): adapta la idea, nunca copies sus frases.

## Estructura
1. **Gancho (escena 1):** una pregunta o afirmación que incomode ("¿Quién te va a cuidar cuando seas viejo?").
2. **Desarmar la respuesta fácil (2-4 escenas):** "¿Tus hijos? Tendrán sus propios problemas."
3. **La verdad (3-6 escenas):** frases cortas y rotundas, una idea por escena.
4. **Qué hacer (3-6 escenas):** órdenes simples ("Protege tu energía. Aléjate de lo que te drena.").
5. **Remate (1-2 escenas):** una frase para guardar. `cierre` solo si hay un cierre autorizado.

## Campos
- `estiloVisual` (inglés, una línea para todas las imágenes), por ejemplo: "Dark cinematic photo of ancient Greek marble statues, dramatic moody low light, misty, high contrast, monochrome, shallow depth of field".
- `escenas[]`:
  - `voz`: 1 a 3 frases cortas (4-12 s). Puntos y signos de pregunta marcan dónde se limpia el texto en pantalla.
  - `flowPrompt` (inglés): la imagen de esa escena. Alterna: estatua en plano medio o primer plano (pensativa, de espaldas, caminando, mirando al horizonte, dos estatuas), paisajes (montañas, mar oscuro, camino, bosque, banca vacía, persona en un acantilado), ruinas (Coliseo, columnas). Cada imagen debe ilustrar literalmente la frase.
  - `buscar` (inglés, 2-3 palabras): para Pexels si no hay imagen ("greek statue", "stormy sea", "empty road").
- La fábrica pinta todo del mismo tono y mueve la cámara sola (acercamiento lento); no describas color ni movimiento en los prompts.

## Reglas
- Frases cortas: el texto sale palabra por palabra y se limpia en cada punto.
- Cambia de imagen cada 3-8 s; nunca dos escenas seguidas con la misma imagen.
- Sin promesas de salud ni datos inventados.
