# Levania · Proyecto de videos

Este archivo es el contexto del proyecto. Léelo completo antes de trabajar. Responde siempre en español.

## La marca
- **Levania** (levaniastore.com): productos digitales para mamás hispanas en México y EE.UU. Producto principal: "Mamá en Calma – Kit de Rutinas" (15 checklists visuales + extras + guía de 23 páginas).
- **Valores:** calma, orden, amor familiar. Tono cercano, de mamá a mamá, nunca regañón.
- **Paleta:** rosa #C4837A · salvia #8FA58A · crema #F6EEE4 · tinta #3D3230. Versión oscura para gráficas: fondo #2A211F, rosa brillante #E8A095, salvia apagado #5F735C, texto crema.
- **Tipografías:** Cormorant Garamond (títulos, con `font-variant-numeric: lining-nums`) y Jost (texto). Están en `*/assets/fonts` y `video-3d/fonts`.
- **Logo:** `marca/levania_logo.png` (color) y `marca/levania_logo_blanco.png` (fondos oscuros), ambos con fondo transparente.
- **Redes:** @levania.mx en Instagram, Facebook, TikTok y YouTube. Publicación con el Social Planner de GoHighLevel.

## Voz
- ElevenLabs, voz **Monica Mendez**, Voice ID `1VQaMRazTeAqnqdb5C33`. Debe sonar a mamá mexicana cálida, no a locutora.
- La llave va en `.env` (`ELEVENLABS_API_KEY`). Nunca la imprimas ni la subas a ningún lado.
- Modelo: `eleven_v4` (si no se indica, la API usa otro). Cámbialo con `ELEVENLABS_MODEL` en `.env`.
- La llave debe ser restringida: solo permisos de Text to Speech y lectura de Voices.
- Antes de generar, revisa el costo: `node tools/voz.js guion.txt salida --solo-contar` (1 carácter ≈ 1 crédito).
- Guiones: frases cortas, sin paréntesis y con los números escritos en palabras ("ocho y media", no "8:30").
- `node tools/voz.js guion.txt salida` genera `salida.mp3` y `salida.words.json` (tiempos de cada palabra) para sincronizar animación y subtítulos.

## El embudo
- Cierre en Instagram y Facebook: "Comenta RUTINA y te mando gratis tu checklist". GHL responde por DM.
- Cierre en TikTok y YouTube: "Tu checklist gratis está en el link de mi perfil". Ahí no hay DM automático.
- Cada video se exporta en 2 versiones: `_meta.mp4` y `_tt.mp4`; solo cambia el cierre.
- Regalos: `regalos/Checklist_Diario_Escuela_Levania.pdf` (RUTINA) y `regalos/Reglas_y_Deberes_Levania.pdf` (AUTONOMÍA).

## Formatos (en orden de prioridad)
1. **Gráficas con datos reales** (estilo oscuro de la marca). Ejemplo: `video-3d/sueno.html`.
2. **Explicaciones 3D literales** con Three.js, nunca metáforas forzadas. Ejemplo de técnica: `video-3d/scene.html`.
3. **Clip de fondo con texto encima**, con clips generados en Google Flow (Veo 3.1).
4. **Micro-novelas** de 30 a 45 s con la familia Levania (mamá, niño, maestra), con imágenes en Flow animadas con Frames to Video.
5. **Tarjetas de texto** (`plantilla-a/`): solo para carruseles e infografías, no para reels.

## Reglas para que un reel funcione
- Gancho visual y de texto en el primer segundo.
- Algo cambia en pantalla cada 2 o 3 segundos: zoom, paneo, nuevo elemento o cambio de escena.
- Subtítulos grandes, palabra por palabra, sincronizados con la voz (desde `*.words.json`).
- La animación sigue a la voz: cada elemento aparece cuando la voz lo menciona.
- Duración de 15 a 30 s, vertical 1080×1920, 30 fps.
- El audio final se normaliza a -14 LUFS (lo hace `render.js`).
- Sin música con derechos de autor. Si se usa sonido, que sea libre de derechos.

## Reglas duras de ritmo (desde el storyboard v2 de sueño; mandan sobre la lista anterior si chocan)
1. **La voz empieza en 0.00 s.** Prohibido retrasar el audio.
2. **El primer cuadro ya tiene acción y texto grande.** Nada de fundidos desde vacío ni elementos que entren despacio.
3. **En los primeros 6 s cambia algo visible cada 1.5 s como máximo** (corte seco, empuje de cámara, número que salta, cambio de plano). Después, cada 2.5 s.
4. **Subtítulos palabra por palabra desde 0.00 s.**
5. **Cortes secos entre escenas.** Nada de fundidos lentos.
6. **Cada elemento nuevo aparece en la palabra que lo nombra.**
7. **Nada de silencio mayor a 0.3 s**, salvo el cuadro final (`montar_voz.js --max-silencio 0.3` lo corrige sin regenerar).
8. **Duración total: 24 a 28 s.**
9. **Fuente visible** desde que aparece el primer dato hasta el final.
10. **Todo video nuevo empieza con un storyboard (`STORYBOARD_<video>.md`), aprobado por Richie antes de programar.**
- Prueba de aceptación con FFmpeg antes de entregar: primer silencio termina en ≤ 0.3 s, al menos 4 cambios de imagen entre 0 y 6 s (`select='gt(scene,0.08)'`), duración 24–28 s.
- Efectos de sonido (tic, pop, barrido) sintetizados con FFmpeg, sin archivos externos, 12 dB por debajo de la voz; mezcla final a -14 LUFS.

## Portadas
- Cada video genera además `portada.png` (1080×1920) **desde la misma escena 3D**, con los títulos del video ocultos. Nunca recortada de un MP4 renderizado: se renderiza aparte para que se vea nítida.
- Diseño (referencia: `portada_propuesta.png`): máximo 4 palabras grandes (una en rosa), un elemento protagonista y un chip con el número clave.
- Todo lo importante dentro de la franja central de 1080×1440, es decir, entre y = 240 y y = 1680 (lo de fuera lo tapan las interfaces de Instagram y TikTok).
- La portada va como fila "Portada" en el storyboard de cada video.

## Reglas fijas (no negociables)
- Solo datos con fuente real y verificable, citada en pantalla. Nunca inventar cifras.
- Declarar que el contenido se hizo con apoyo de IA con la etiqueta de la app al publicar (no como leyenda dentro del video ni en el texto).
- Nada de testimonios ni reseñas falsas, ni avatares de IA presentados como clientas.
- Ningún niño generado con IA mostrado como resultado real.
- Nada de promesas médicas: no decir que el kit trata TEA, TDAH ni ninguna condición.

## Skills de Claude Code
- Instaladas en el proyecto con `npx skills add heygen-com/hyperframes` (grupo Core Skills, agente Claude Code). Tras instalarlas, reinicia Claude Code y verifica con `/hyperframes`.
- Úsalas para las plantillas de HyperFrames; las escenas de `video-3d` se renderizan con `render.js`.

## Estructura
- `video-3d/`: escenas en HTML (`scene.html` = 3D, `sueno.html` = gráfica). `render.js` las convierte a MP4.
  - `node render.js --page sueno.html --out horas_de_sueno.mp4 --dur 20 --audio voz/sueno.mp3`
  - `--frames 1,5,9` saca capturas PNG para revisar antes de renderizar.
  - Cada escena expone `window.renderAt(t)`: todo el estado depende solo del tiempo `t`.
- `plantilla-a/`: plantilla HyperFrames con el contenido en `data.js`.
- `tools/voz.js`: voz de ElevenLabs con tiempos por palabra.
- `marca/`, `regalos/`.

## Plan completo
El plan de contenido de 2 semanas (28 guiones, 8 carruseles, fases y pendientes) está en el doc de Claude:
https://claude.ai/artifact/Y2j6H9nq7dDeq5esbahZ9S
