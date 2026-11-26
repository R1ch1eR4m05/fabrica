# Anuncios UGC por combinaciones (estilo UGCdrop)

Pides "dame 5" y salen 5 anuncios **terminados** en 9:16 (1080×1920, H.264 High), listos para subir, sin editar:

- Escenas unidas (gancho → demo → niños solos → cierre), con el arranque de cada toma recortado.
- **Texto del gancho** los primeros 3 s, en cajas rosa polvoso estilo TikTok.
- **Cierre de marca**: "Kit Mamá en Calma", foto del producto y CTA (rota: "Comenta RUTINA…", "Link en el perfil"…).
- Música de fondo si hay pistas en `musica/anuncios-ugc/` (o `musica/nichos/levania/`).
- Junto a los videos: `copys.txt` (texto principal, titular y CTA) y `resumen.csv`.

Nunca repite: el registro vive en `listos/anuncios-ugc/registro.json`. Cada combinación vuelve a salir con otro texto de gancho (hasta 4).

## Probarlo en la laptop

1. `Actualizar (Windows).cmd` (o `git pull`) para tener esta versión.
2. En el `.env` pon `LEVANIA_DRIVE=G:/Mi unidad/Levania` (la carpeta de Levania en Google Drive para escritorio; usa `/`).
3. Pon el mockup del kit en `ugcdrop/producto.png` (PNG, mejor con fondo transparente). Sin él, el cierre sale sin foto.
4. Doble clic en **`Anuncios UGC - dame 5 (Windows).cmd`**: revisa qué escenas encuentra, pregunta cuántos y abre la carpeta con los anuncios.
   O en el panel: botón **«Anuncios UGC (combinaciones)»** → «Dame los anuncios» (ahí también los ves, bajas, copias el copy y marcas ✅ publicado / 🏆 ganador / ✕ descartado).

## Órdenes

```
node fabrica.js ugc-escenas                    qué escenas encuentra y cuáles faltan
node fabrica.js ugc-lote 5                     5 anuncios (70 % realistas, 30 % animados)
node fabrica.js ugc-lote 10 --realista         solo UGC realista   (--animado: solo 3D)
node fabrica.js ugc-lote 5 --tema noche        manana, noche, tarea, escuela, comida, orden, hermanos, casa, reto
node fabrica.js ugc-lote 3 --combo UG064,AN001 combinaciones exactas
node fabrica.js ugc-lote 5 --prueba            solo muestra qué armaría
node fabrica.js ugc-estado                     entregados, ganadores, cuántos quedan
node fabrica.js ugc-marcar UG064-v2 ganador    (publicado / ganador / descartado)
```

## De dónde saca cada escena (en orden)

1. `ugcdrop/escenas/`: cualquier archivo que empiece con el código (`U01 algo.mp4`).
2. `cache/ugcdrop/escenas/` (lo ya descargado).
3. Drive (`LEVANIA_DRIVE` + la ruta de `escenas.json`). Las animadas por nombre exacto (tolera acentos); las realistas buscan el código al inicio del nombre en las carpetas 07 y 08.
4. La URL de Higgsfield (`url`): se baja una vez.

Si a una combinación le falta una escena, se salta y el lote toma otra; al final te dice qué escenas faltan.

## Hacerlo crecer

| Archivo | Qué es |
|---|---|
| `escenas.json` | Catálogo: código, estilo (realista/animado), tipo (gancho, demo, ninos, cierre / gancho, producto, resultado), tema, archivo en Drive, url |
| `combinaciones_ugc.tsv` / `combinaciones_animadas.tsv` | Combinaciones curadas (las mismas de la hoja de Levania) |
| `textos.json` | Textos de gancho por escena, copy por tema, titulares, CTAs y cierre |
| `ajustes.json` | Tamaños, colores, tipografías, tiempos, música, mezcla del lote |
| `registro-inicial.json` | Los 5 del Lote 1 (armados en el chat) para no repetirlos |

- Escena nueva → agrégala a `escenas.json` con su tema: entra sola en las combinaciones automáticas (gancho del tema → niños del tema → cierre).
- Cada texto de gancho nuevo en `textos.json` = un anuncio más por cada combinación con esa escena.

## Reglas
- La etiqueta de IA no va en el video (regla de la fábrica): márcala en la app al publicar (en TikTok es obligatoria). Si algún día la quieres quemada, `ajustes.json` → `etiqueta_ia.mostrar: true`.
- Los textos son voz de marca, no testimonios: nada de "a mí me funcionó" inventado. Testimonios solo con reseñas reales.
- No pongas en los textos datos del producto que no estén verificados (edades, "no necesitan saber leer"…).
