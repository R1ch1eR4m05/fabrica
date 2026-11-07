# Cómo se escribe un guion de "Anuncios"

Anuncios pagados para Meta (Facebook/Instagram) y TikTok, en español de México, para el público del nicho.
El proyecto dice en `opciones`: `tipo` (imagen o video), `plantilla` (la principal), `paleta` y `medidas`.
La idea trae el brief: producto, beneficios, precio/oferta, público y, si vienen del cerebro, los ángulos ganadores.

## Dos modos
- **Imagen** (`tipo: imagen`): **cada escena es una variación completa** del anuncio (se exporta como una imagen
  por escena en 9:16, 4:5 y 1:1). Haz 3-6 variaciones que prueben **ángulos distintos** (dolor, deseo, prueba, precio,
  urgencia, comparación), no la misma frase reescrita. Sin `voz`.
- **Video** (`tipo: video`): las escenas van en secuencia, 15-30 s. Escena 1 = gancho completo y legible desde el
  primer cuadro (≤ 7 palabras); 2-4 = beneficio/prueba; la última = oferta + botón. Cada escena lleva `voz` (lo que se
  dice, natural, de recomendación) y `texto` (lo que se ve, más corto). Puedes cambiar de plantilla por escena con
  `plantilla` para que no se sienta como diapositivas.

## Campos del guion
- `marca` (como se firma), `estiloVisual` (inglés, una línea para todas las fotos: luz, ambiente, tipo de foto).
- `colores` (opcional, de la marca): `{ "fondo": "#hex", "tinta": "#hex", "acento": "#hex", "suave": "#hex", "sobre": "#hex" }`.
- `anuncio`: el texto que va en Meta, fuera de la imagen: `textoPrincipal` (gancho en la primera línea, 2-5 líneas),
  `titular` (≤ 40 caracteres), `descripcion` (≤ 30), `boton` (Comprar, Más información, Registrarte…).
- `subir`: `{ titulo, descripcion, hashtags }` como en los demás estilos.

## Campos por escena (según la plantilla)
Todas: `texto` (titular en la imagen, ≤ 9 palabras), `imagen` (inglés: la foto que pide APIMart; describe escena,
persona y producto en uso; nada de texto en la foto), `buscar` (2-3 palabras para Pexels si no hay APIMart),
`cta` (texto del botón en la imagen; vacío = sin botón), `sub` (una línea de apoyo, opcional).
`producto: false` en una escena si su foto NO debe llevar el producto (p. ej. la del dolor).

| plantilla | campos extra |
|---|---|
| `oferta` | `precio` ("$199"), `precioAntes` ("$299"), `badge` ("2x1", "Envío gratis") |
| `advertorial` | `medio` (la sección, p. ej. "Crianza"), `sub` = bajada de 1-2 frases |
| `dato` | `dato` ("87%", "3 de cada 4"), `texto` = qué significa, `fuente` (corta). **Dato verificado** con 2 fuentes en `fuentes` |
| `testimonio` | `cita`, `autor`, `estrellas` (1-5). **Solo reseñas reales que vengan en el brief**, copiadas tal cual con el nombre como lo dieron. Si no hay reseñas reales, NO uses esta plantilla: usa `dato` u `oferta` |
| `versus` | `nosotros` [3-4 puntos cortos], `ellos` [3-4], `marcaNos`, `marcaEllos` ("Lo de siempre"; nunca el nombre de un competidor) |
| `antes-despues` | `antes` [2-3 frases cortas del problema], `despues` [2-3 del resultado], `etiquetaAntes`, `etiquetaDespues`. Sin resultados de salud o peso |
| `notificaciones` | `hora` ("7:02"), `notis` [{ `app`, `titulo`, `texto` }] 3-5, que cuenten una mini historia |
| `ugc` | `texto` = 2-4 frases cortas como subtítulos de creador; `sub` = etiqueta arriba ("Reseña honesta") |

## Reglas (Meta y sentido común)
- Nada de promesas de salud, peso, dinero o resultados garantizados. Nada de "¿Tienes X problema?" que señale un
  atributo personal (Meta lo rechaza): habla del problema, no de la persona.
- Ninguna reseña, cifra ni "cliente" inventado. Datos solo con fuente verificada.
- Texto en la imagen corto: la imagen vende con la foto y el titular; el resto va en `anuncio.textoPrincipal`.
- Si el brief trae ángulos ganadores del cerebro, úsalos; si trae perdedores, evítalos.
- Del anuncio de referencia se toma la estructura y el ángulo, nunca sus frases.

## Ejemplo (imagen, plantilla oferta, 2 variaciones)
```json
{
  "titulo": "Kit de actividades sin pantallas",
  "marca": "Levania",
  "estiloVisual": "Bright natural window light, cozy Mexican home, warm tones, candid lifestyle photo",
  "anuncio": { "textoPrincipal": "Tarde sin pantallas y sin berrinches.\n30 actividades listas para imprimir.", "titular": "Kit de 30 actividades", "descripcion": "Descarga inmediata", "boton": "Comprar" },
  "escenas": [
    { "tipo": "oferta", "texto": "30 tardes sin pantallas", "imagen": "Mexican mom and 6-year-old daughter doing a printed activity sheet at the kitchen table, laughing", "buscar": "mom kid crafts", "precio": "$149", "precioAntes": "$249", "badge": "Descarga inmediata", "cta": "Lo quiero" },
    { "tipo": "oferta", "plantilla": "versus", "texto": "Mejor que darle el celular", "nosotros": ["Lo imprimes hoy", "Aprende jugando", "Juntos en la mesa"], "ellos": ["Más horas de pantalla", "Berrinche al quitarlo", "Cada quien por su lado"], "marcaEllos": "El celular", "imagen": "Printed activity sheets with crayons on a wooden table", "cta": "Ver el kit" }
  ],
  "fuentes": [],
  "subir": { "titulo": "Kit de 30 actividades", "descripcion": "Actividades imprimibles para niños de 4 a 8.", "hashtags": ["#mamas", "#actividadesparaniños"] }
}
```
