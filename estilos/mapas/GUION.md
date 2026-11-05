# Cómo se escribe un guion de "Mapas"

Shorts de geografía e historia, verticales (9:16), 35-60 s, ritmo rápido. Español de México, tono de "curiosidad que no sabías".
Cada escena es una frase corta (6 a 18 palabras) con lo que pasa en el mapa en ese momento.

## Tipos de short (elige uno según la idea)
1. **Historia de un territorio**: por qué X es de Y. Gancho → contexto → 2-4 momentos históricos con fecha → dato → cierre.
2. **Comparar tamaños reales**: el país A movido sobre B con su tamaño real (Mercator engaña). Usa `mapa.comparar`.
3. **Fronteras raras**: acércate mucho (`zoom` 7-10) a enclaves, líneas rectas, territorios partidos; usa `estados` y `etiquetas`.
4. **Rutas y viajes**: `mapa.ruta` con puntos, icono y kilómetros que cuentan solos.

## Escenas
- `tipo`: `gancho` (primera, la pregunta), `narracion`, `dato` (una cifra grande verificada; pon "cifra" y "fuente"), `cierre`.
- `texto`: lo que dice la voz.
- `sfx` opcional: "whoosh" cuando la cámara viaja lejos, "pop" cuando salen banderas.
- `mapa` (lo que hace la cámara):
  - `enfocar`: "MEX" (código ISO de 3 letras del país), "MX-MIC" (estado ISO 3166-2), "Gibraltar" (ciudad o lugar) o una lista ["ESP","GBR"]. Encuadra y resalta.
  - `resaltar`: lista de lo que se pinta de color (si no, se pinta lo enfocado). `colores` opcional ["#e5484d", …].
  - `centro`: [lon, lat] y `zoom` (1 = mundo, 4 = país grande, 7 = ciudad) para una vista exacta. `acercar`: +0.5 para acercarse más.
  - `estados`: ["MEX"] para dibujar las divisiones de estados de ese país.
  - `etiquetas`: [{ "texto": "Estrecho de Gibraltar", "en": [-5.6, 36.0] }, { "en": "Ceuta" }]. Con `"etiquetas": false` no rotula lo resaltado.
  - `ruta`: { "puntos": ["Acapulco", "Manila"], "icono": "barco" | "avion" | "coche", "km": 14500 (opcional) }. `seguir`: true para que la cámara siga la punta.
  - `comparar`: { "pais": "MEX", "a": "DEU" } mueve México, con su tamaño real, encima de Alemania. "a" también acepta [lon, lat].
  Si una escena no trae `mapa`, la cámara se queda donde estaba.
- `banderas`: [{ "pais": "ESP", "cara": "enojado" | "feliz" | "triste" | "sorprendido" | "neutral", "mira": "GBR" }]. Salen sobre su país (si se ve) o arriba en fila. Úsalas en 2-4 escenas, no en todas.
- `pegatinas` (opcional): [{ "imagen": "img/soldado.png", "en": "Gibraltar", "tam": 0.3 }] con PNG transparentes del proyecto.

## Reglas
- Cada dato histórico (fechas, tratados, cifras, km²) verificado en 2 fuentes fiables, listadas en "fuentes".
- El `titulo` del guion sale arriba todo el video: la pregunta-gancho en 4-8 palabras.
- Cambia de encuadre casi en cada escena: el movimiento es lo que retiene.
