# Cómo se escribe un guion de "Reflexión · Estatuas"

Short/Reel de **20 a 30 s** (55 a 80 palabras de voz) en segunda persona ("tú"), voz grave de hombre, tono sobrio y directo. Español de México. Nace siempre de un video viral del formato (estoicismo, taoísmo, filosofía oriental): adapta la idea clásica, nunca copies frases de otros creadores. Cada video pertenece a una **serie** numerada de Monarca (hoy: "Actitudes de Acero"); la fábrica le pone el número.

## Estructura (20-30 s, 5 a 7 escenas)
1. **Gancho con el conflicto (escena 1, ≤ 2 s):** 4 a 9 palabras que nombran el problema real y se entienden solas; sale completo en pantalla desde el cuadro 0 ("Tu enojo es el negocio de otros.").
2. **Idea central (1-2 escenas):** la enseñanza clásica dicha en simple, con su autor si lo es de verdad ("Epicteto lo sabía: no te altera lo que pasa, sino tu juicio.").
3. **Ejemplo de hoy (1-2 escenas):** dónde le pasa esto a alguien en 2026 (el celular, el jefe, la familia, las deudas). Concreto, no abstracto.
4. **Qué hacer (1 escena):** una acción simple para hoy.
5. **Cierre con envío privado (última escena):** la voz termina con el cierre autorizado de Monarca: "Envíale esto a alguien que necesita oírlo hoy." (puedes cambiar el final por algo más preciso del tema, p. ej. "…a alguien que no suelta el celular", pero siempre empieza con "Envíale esto a alguien que").

## Metadatos (van en `subir`, la fábrica los valida antes de programar)
- `subir.titulos`: **3 opciones** con la fórmula [número o promesa concreta] + [problema real] + [autor]: "3 reglas de Epicteto para que tu enojo no sea negocio de otros", "Lo que Séneca haría con tu ansiedad del domingo". Nada de títulos vacíos, genéricos ("Reflexión estoica") ni poéticos sin promesa. La fábrica puntúa y elige (criterio en `core/metadatos.js`).
- `subir.descripcion`: 1-2 líneas con la idea y la promesa. `subir.hashtags`: 3 relevantes (sin #).

## Campos
- `estiloVisual` (inglés, una línea para todas las imágenes), por ejemplo: "Dark cinematic photo of ancient Greek marble statues, dramatic moody low light, misty, high contrast, monochrome, shallow depth of field".
- `escenas[]`:
  - `voz`: 1 a 2 frases cortas (3-6 s). Puntos y signos de pregunta marcan dónde se limpia el texto en pantalla.
  - `flowPrompt` (inglés): la imagen de esa escena. Alterna: estatua en plano medio o primer plano (pensativa, de espaldas, caminando, mirando al horizonte, dos estatuas), paisajes (montañas, mar oscuro, camino, bosque, banca vacía, persona en un acantilado), ruinas (Coliseo, columnas). Cada imagen debe ilustrar literalmente la frase.
  - `buscar` (inglés, 2-3 palabras): para Pexels si no hay imagen ("greek statue", "stormy sea", "empty road").
  - `clave` (opcional): la palabra (o lista de palabras, tal como se dicen) que sale en color de acento, por ejemplo `"clave": "energía"` o `["juicio", "calma"]`. Elige la que carga la idea de la frase, una por bloque de 3-6 palabras como mucho. Sin `clave`, la fábrica elige la palabra con más peso de cada bloque.
- En pantalla el texto sale en bloques de 3 a 6 palabras (se cortan en puntos, comas y punto y coma): escribe frases con pausas naturales para que cada bloque se entienda solo.
- La fábrica pinta todo del mismo tono y mueve la cámara sola (acercamiento lento); no describas color ni movimiento en los prompts.

## Reglas
- Frases cortas: el texto sale palabra por palabra y se limpia en cada punto.
- Cambia de imagen cada 3-6 s; nunca dos escenas seguidas con la misma imagen.
- Los subtítulos salen palabra por palabra desde el segundo 0; no hace falta escribir texto aparte.
- Sin promesas de salud ni datos inventados.

## Portada (Shorts y Reels)
Opcional en `guion.json`: `"miniatura": { "lineas": ["TU ENOJO","ES DE OTROS"], "acento": 1, "escena": 1 }` (2-5 palabras). Sin eso, la fábrica usa la primera frase del gancho. Al terminar el video saca `listos/<id>-portada.jpg` (1080x1920: figura recortada abajo, gancho enorme arriba, mismo tono): para la portada del Reel en Instagram/Facebook y para YouTube cuando el canal pueda subir portadas de Shorts.
