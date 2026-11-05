# Cómo se escribe un guion de "Levania · Datos"

Reels de 24 a 28 s para mamás hispanas (hijos de 3 a 10 años). Tono de mamá a mamá, cálido, nunca regañón. Español de México.
Las reglas completas de la marca están en `referencia/LEVANIA-REGLAS.md`: léelas antes de escribir.

## Reglas duras
- Solo datos reales con fuente verificable (2 fuentes fiables). Pon `"fuente"` corta (sale en pantalla desde el primer dato) y la lista `"fuentes"`.
- Nada de promesas médicas (no decir que algo trata TDAH, TEA, etc.).
- `voz`: frases cortas, sin paréntesis, números escritos en palabras ("ocho y media", no "8:30"). Lo que se VE sí lleva números (`titulo`, `cifra`, `reloj`, `rango`).
- La voz empieza en 0 s: la primera escena es un `gancho` con texto grande que se ve desde el primer cuadro.
- Cambia algo cada 1.5 s en los primeros 6 s: escenas cortas al inicio (1 a 2 s cada una), luego de 2.5 a 4 s.
- Cada cosa aparece cuando la voz la nombra: usa `dice` con la primera palabra de la voz que la nombra.
- Total entre 60 y 75 palabras de voz.

## Formato
```json
{
  "titulo": "Horas de sueño por edad",
  "fuente": "AASM, 2016",
  "fuentes": [{ "dato": "9 a 12 h de 6 a 12 años", "url": "https://..." }],
  "chip": "6–12 años",
  "escenas": [
    { "tipo": "gancho", "titulo": "¿Tu hijo duerme *lo suficiente*?", "voz": "¿Tu hijo duerme lo suficiente?" },
    { "tipo": "reloj", "titulo": "Se duerme", "reloj": { "de": "10:30 pm", "a": "6:30 am" }, "voz": "Si se duerme a las diez y media y se levanta a las seis y media..." },
    { "tipo": "rango", "titulo": "Lo recomendado", "rango": { "min": 6, "max": 14, "unidad": " h", "desde": 9, "hasta": 12, "dice": "nueve", "etiqueta": "6 a 12 años", "marcador": 8, "diferencia": "−1 hora cada noche", "diferenciaDice": "hora" }, "voz": "..." },
    { "tipo": "contador", "cifra": "365 h", "detalle": "menos de sueño al año", "voz": "..." },
    { "tipo": "comparar", "comparar": [{ "valor": "8 h", "etiqueta": "duerme", "dice": "ocho" }, { "valor": "10 h", "etiqueta": "necesita", "dice": "diez" }], "voz": "..." },
    { "tipo": "palabras", "palabras": ["menos", "berrinches", "más calma"], "voz": "..." },
    { "tipo": "tarjeta", "tarjetas": [{ "etiqueta": "EN VEZ DE", "texto": "¡Ya duérmete!", "tachar": true }, { "etiqueta": "DI", "texto": "Vamos a apagar la luz juntos", "dice": "vamos" }], "voz": "..." },
    { "tipo": "cierre", "voz": "Comenta RUTINA y te mando gratis tu checklist." }
  ]
}
```

## Tipos
- `gancho`: `titulo` grande (palabras clave entre *asteriscos* salen en rosa). Opcional `reloj: "10:30 pm"` (reloj fijo) o `imagen`.
- `reloj`: `reloj.de` y `reloj.a`; el reloj avanza en vivo y al final muestra la duración ("8 h 00 min").
- `rango`: barra de `min` a `max` con el rango recomendado (`desde`–`hasta`), `marcador` (lo que pasa en realidad) y `diferencia`.
- `contador`: `cifra` que cuenta desde 0 ("365 h", "70%"; los años no cuentan) y `detalle` debajo.
- `comparar`: dos tarjetas (`valor`, `etiqueta`, `dice`); la segunda sale en rosa.
- `palabras`: 1 a 3 palabras gigantes que saltan cuando la voz las dice.
- `tarjeta`: "EN VEZ DE / DI" (`tachar: true` tacha la primera cuando aparece la segunda).
- `frase`: `texto` en cursiva, para una idea sin dato.
- `cierre`: logo y botón. Si no pones `boton`, sale "Comenta RUTINA" (o "Link en mi perfil" con la opción Cierre = TikTok). `sub` opcional ("Descárgalo gratis e imprímelo"). La voz del cierre cambia según la versión: escribe la de Instagram; en TikTok la fábrica usa `vozTT` si la pones.
- **Dibujos animados (úsalos en casi todas las escenas):** `"dibujo": "<nombre>"` pone un dibujo que se mueve solo (la luna brilla, el celular hace scroll, el reloj gira, la cama respira con "z"). Si no lo pones, la fábrica elige uno según lo que dice la voz; `"dibujo": false` lo quita. `dibujoDice` hace que aparezca en esa palabra. En `palabras`, `"dibujos": [...]` pone uno junto a cada palabra.
  Disponibles: luna, sol, telefono, tele, cama, nino, nina, mama, abrazo, reloj, alarma, corazon, libro, cerebro, bateria, casa, escuela, plato, nube, check, tache, calendario, lupa, estrellas.
- Ritmo: escenas de 1.5 a 3 s; ningún momento de solo texto más de 2 s. Mejor más escenas cortas que pocas largas.
- Cualquier escena acepta `titulo`, `chip` y `sfx` (tic, tac, pop, barrido) para cambiar el efecto.

## Piezas 3D a la medida
Si Richie pide una explicación 3D literal (Three.js), no cabe en este estilo: hazla como pieza aparte siguiendo `referencia/video-3d_scene.html` y `referencia/video-3d_render.js` (todo depende de `renderAt(t)`), con storyboard aprobado antes de programar.
