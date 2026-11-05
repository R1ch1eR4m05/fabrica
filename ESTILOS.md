# Cómo agregar un estilo nuevo

Un estilo es una carpeta en `estilos/<id>/`. El panel la detecta sola.

```
estilos/<id>/
  estilo.json     nombre, descripción, formatos, tipos de escena, fondos, sonido   (obligatorio)
  GUION.md        instrucciones para escribir el guion (se le pasan a la IA)       (obligatorio)
  plantilla.html  dibuja el video: una función del tiempo t                        (obligatorio para estar "Listo")
  ideas.json      lista de ideas sugeridas                                         (opcional)
  musica/…        música propia + CREDITOS.txt                                     (opcional)
```

Mientras no tenga `plantilla.html`, o si tiene `"estado": "pronto"`, sale en el panel como "Pronto".

## estilo.json
```json
{
  "nombre": "Frases · Fondo desenfocado",
  "descripcion": "Una línea para el panel",
  "orden": 2,
  "formatos": ["9:16", "16:9"],
  "duraciones": { "corto": "20 a 40 segundos", "largo": "3 a 5 minutos" },
  "tipos": ["frase", "autor", "cierre"],
  "visuales": ["clip", "foto", "degradado"],
  "pausaEntreEscenas": 0.6,
  "inicioVoz": 0.4,         // segundos de silencio antes de la voz (Levania: 0)
  "sonido": { "ambiente": "oscuro" | "musica/archivo.mp3", "volumenAmbiente": 0.3, "golpesEn": [], "volumenEfectos": 0.6,
             "efectosPorTipo": { "contador": "pop", "rango": "tic" } },   // efecto automático por tipo de escena (pop, tic, tac, barrido, whoosh, golpe…)
  "fondo": true,            // usa fondo de video/foto (Pexels, propio o degradado) → la plantilla lee fondo.json y fondo/00001.jpg…
  "vozOpcional": true,      // el panel ofrece "Con voz / Solo música"
  "lectura": { "porSegundo": 2.0, "extra": 1.8 },   // ritmo de lectura cuando va sin voz
  "opciones": [ { "clave": "tema", "nombre": "Tema", "valores": { "noche": "Noche", "claro": "Claro" } } ],  // salen como menús en el panel → M.proyecto.opciones
  "camposAvanzados": ["mapa", "banderas"],   // el panel muestra un cuadro JSON por escena para estos campos
  "preparar": "mapas",      // paso extra antes del render (core/<nombre>.js), p. ej. bajar teselas de satélite
  "portadaEn": 1.5,
  "vozSugerida": "…",
  "creditos": "texto de créditos que va en la descripción, si la música lo pide"
}
```

## guion.json (lo produce la IA, Claude Code o el panel)
```json
{ "titulo": "…", "escenas": [ { "tipo": "…", "texto": "lo que dice la voz", "visual": "…", "sfx": "golpe" } ],
  "fuentes": [ { "dato": "…", "url": "…" } ], "subir": { "titulo": "…", "descripcion": "…", "hashtags": ["#…"] } }
```
Una escena con `vozTT` usa ese texto cuando el proyecto tiene la opción `cierre: "tt"`.
Cada escena puede llevar los campos extra que su estilo entienda (`cifra`, `hora`, `imagen`, `etiqueta`, `pausa`, `capitulo`…).
Si una escena lleva `"voz"`, eso es lo que se dice y `"texto"` lo que se ve.

## plantilla.html
Carga `../_comun/motor.js` y llama:
```js
Motor.iniciar({
  fuentes: [["Oswald", "../_comun/fuentes/oswald-latin-700-normal.woff2", { weight: "700" }]],
  async preparar(M) { /* texturas, imágenes, cálculos que no cambian */ },
  dibujar(ctx, t, M) { /* pinta el fotograma del segundo t en un canvas de M.W × M.H */ },
});
```
Lo que trae `M`: `M.guion`, `M.tiempos` (por escena: `ini`, `finVoz`, `fin`, `palabras` [{w, t0, t1}]), `M.W`, `M.H`, `M.vertical`, `M.u` (escala, 1 = 1080 px),
`M.escenaEn(t)`, `M.frases(palabras, max)`, `M.rng`, `M.hash`, `M.ruido1`, `M.suave`, `M.salida`, `M.rango`, `M.lienzo`, `M.grano`.

Si necesitas cargar algo por fotograma (por ejemplo el fondo de video), define `M.antesDeDibujar = async (t) => {…}` en `preparar`: el motor lo espera antes de cada `dibujar`.

**Regla de oro:** `dibujar` depende solo de `t`. Nada de `Date.now()` ni de animaciones CSS. Así el render es exacto, se puede repartir en varios hilos y la vista previa del panel coincide con el video.

Para usar Three.js u otra librería: dibuja en tu propio canvas y cópialo al canvas principal (`ctx.drawImage`) dentro de `dibujar`.
Los clips de video de fondo: extrae los fotogramas con ffmpeg en `preparar` (o usa imágenes); un `<video>` no es exacto fotograma a fotograma.

## Probar
```
node fabrica.js nuevo <id-estilo> "idea de prueba"
# escribe proyectos/<id>/guion.json
node fabrica.js listo <id> && node fabrica.js voz <id> && node fabrica.js fotos <id>
```
Revisa las imágenes de `proyectos/<id>/revision/` en los dos formatos antes de dar el estilo por terminado.
