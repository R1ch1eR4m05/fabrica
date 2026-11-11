# Cómo se escribe un guion de "Historia · Caricatura 3D"

Shorts verticales (9:16) de 30-50 s que cuentan una historia REAL y sorprendente (Roma, estoicos, batallas, emperadores,
inventos, desastres) con personajes de caricatura en un mundo 3D pintado. Español de México, voz rápida y pareja.
Todo se dibuja con código: no hay imágenes de IA ni Pexels. Lo que no está en esta lista, no se puede dibujar: no lo pidas.

## La fórmula (medida en 20 shorts de referencia)
1. **Gancho:** el dato absurdo en una sola frase de 6-10 palabras, sin introducción ("Un emperador romano vendió los tesoros de su propio palacio.").
2. **Lugar y época:** año, lugar, qué estaba en juego.
3. **Escalada:** 2-4 momentos, cada uno más grande que el anterior.
4. **El momento en que se rompe** o la decisión clave (frase corta y seca: "Marco Aurelio dijo que no.").
5. **Dato** con cifra verificada (`cifra` arriba del cuadro, discreta).
6. **Consecuencia y remate** con sorpresa. El video termina en la última palabra.
- Nunca describas con la voz lo que ya se ve. Una escena = una frase de 6 a 20 palabras.
- Cada dato (fecha, cifra, quién dijo qué) verificado en 2 fuentes fiables, en `fuentes`. Si las fuentes antiguas exageran, usa la estimación moderna y dilo.
- Para Monarca: el remate conecta con la idea estoica (sin sermón: la historia ya enseña).

## Guion
```json
{
  "titulo": "4-8 palabras",
  "luz": "dia",                        // luz por defecto: dia | atardecer | noche | nublado
  "reparto": {                          // cada personaje UNA vez; en las escenas se llama por su id
    "marco": { "nombre": "Marco Aurelio", "ropa": "#efe8d8", "toga": "#5b2a86", "pelo": "#5a3b26", "barba": "#4a3020", "piel": 1 }
  },
  "escenas": [ { "tipo": "gancho", "texto": "…", "lugar": "palacio", "personajes": [{ "id": "marco", "cara": "serio" }], "camara": "acercar", "plano": "medio" } ],
  "fuentes": [ { "dato": "…", "url": "https://…" } ],
  "subir": { "titulo": "…", "descripcion": "2-3 líneas", "hashtags": ["#…"] }
}
```

### Reparto (vestuario)
`ropa` (torso), `pantalon`, `botas`, `pelo` (color), `barba`, `bigote`, `capa`, `toga` (banda diagonal, p. ej. morado imperial),
`faja` (banda en la cintura), `sombrero`: `pelo` (por defecto) | `corona` | `casco` (casco griego/romano con penacho) |
`casco-dorado` | `persa` | `gorra` | `sombrero` (de copa) | `cofia` | `ninguno`; `gorro` (color de la gorra/persa),
`lanza`: true, `escudo`: "#color", `cuerpo`: `adulto` | `robusto` | `niño`, `piel`: 0 a 3 (de más clara a más morena), `semilla`: 1-7 (cambia la forma de la cabeza).
Colores en HEX. Romanos: toga blanca `#efe8d8` con banda morada `#5b2a86`; legionario `ropa #b8322f`, `sombrero casco`, `lanza`, `escudo #c0353a`.

### Escena
- `tipo`: `gancho` (la primera), `narracion`, `dato` (con `cifra`), `cierre`.
- `texto`: lo que dice la voz.
- `lugar`: `palacio` (columnas, trono, alfombra roja) | `foro` (plaza con templos) | `campamento` (tiendas, empalizada, fogatas) |
  `campo` (pasto, árboles, camino) | `batalla` (suelo quemado, fuegos, estandartes) | `pueblo` (calle con casas).
  Cambiar de lugar hace un fundido corto; repetir lugar en escenas seguidas se siente continuo.
- `luz`: `dia` | `atardecer` | `noche` | `nublado`. Que la luz cuente la emoción: guerra al atardecer, decisión de día, reflexión de noche.
- `personajes`: lista de 0 a 4 con `id` (del reparto), `cara` y `pose`. Uno sale al centro; dos, escalonados (uno adelante, otro atrás).
  - `cara`: `neutral` | `serio` | `sonrie` | `contento` | `rie` | `sorpresa` | `nervioso` | `grita` | `dolor` | `alivio` | `mareado` | `tranquilo` | `silba`.
  - `pose`: `de-pie` | `camina` | `marcha` | `sentado` | `cae` | `levanta-arma` (con lanza) | `espada` | `saluda`.
  - Opcionales: `x`, `z` (metros; z negativo = más atrás), `mira` (-1, 0, 1: hacia dónde voltea).
- `multitud`: `{ "tipo": "soldados-romanos" | "barbaros" | "pueblo" | "senadores", "n": 40 a 4000 }`. Detrás de los personajes. Úsala para mostrar escala.
- `camara`: `frente` (acercamiento lento) | `acercar` | `alejar` | `subir` (sube y enseña la multitud) | `bajar` | `paneo-izq` | `paneo-der` |
  `rodear` | `pasar` (pasa enfrente y se mete entre la gente) | `temblor` (impacto). Cambia de movimiento casi en cada escena.
- `plano`: `cerca` (cara y pecho) | `medio` (cuerpo, por defecto) | `abierto` (escenario completo).
- `foco`: id del personaje al que mira la cámara (si no, al grupo).
- `fuego`: true pone una fogata junto al personaje (de noche se ve muy bien).
- `cifra` y `cifraSub`: número grande arriba ("2 MESES" / "de subasta"); solo en escenas `dato`.
- `desenfoque` (px), `zoom` (1 = normal, 0.8 = más cerca), `sol` (grados, de dónde viene la luz) solo si algo no se ve bien.

## Reglas del estilo
- Una voz pareja de 3.2-3.8 palabras por segundo, casi sin silencios. Sin subtítulos en la versión principal (opción del panel).
- Nada de recuadros ni flechas encima de los personajes. La cifra va discreta arriba.
- La primera versión siempre sale "bonita, de día de campo": si la historia es guerra o peste, usa `atardecer`, `nublado` o `noche`, `batalla` y caras serias.
- Un ejército enorme nunca debe terminar dentro del cuadro: usa `n` grande (800-4000) con `subir`.
- Presenta a cada protagonista de frente (`frente`/`acercar`) antes de moverte alrededor.
- Personajes históricos: solo hechos documentados. No pongas en su boca frases que no dijeron; si citas, que sea cita real con fuente.
