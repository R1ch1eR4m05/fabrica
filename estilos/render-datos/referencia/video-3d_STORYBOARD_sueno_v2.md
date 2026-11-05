# Storyboard v2 · "¿Tu hijo se duerme a las diez? Haz esta cuenta."

Este archivo manda sobre cualquier otra instrucción anterior de este video. Los tiempos son objetivos aproximados; los exactos salen de `words.json`, pero el orden y la intención no cambian.

## Por qué existe la v2
La v1 falló porque la voz empezaba en el segundo 7, el primer cuadro era un muñeco dormido y quieto, no había cortes y el gancho era una pregunta genérica. Esta versión pone todo lo importante antes del segundo 3.

## Reglas duras (también van a CLAUDE.md)
1. **La voz empieza en 0.00 s.** Prohibido retrasar el audio.
2. **El primer cuadro ya tiene acción y texto grande.** Nada de fundidos desde vacío ni elementos que entren despacio.
3. **En los primeros 6 s cambia algo visible cada 1.5 s como máximo** (corte seco, empuje de cámara, número que salta, cambio de plano). Después, cada 2.5 s.
4. **Subtítulos palabra por palabra desde 0.00 s.**
5. **Cortes secos entre escenas.** Nada de fundidos lentos.
6. **Cada elemento nuevo aparece en la palabra que lo nombra.**
7. **Nada de silencio mayor a 0.3 s**, salvo el cuadro final.
8. **Duración total: 24 a 28 s.**
9. **Fuente visible** ("AASM 2016, avalado por la AAP") desde el segundo 8.8 hasta el final.
10. **Todo video nuevo empieza con un storyboard así, aprobado por Richie antes de programar.**

## Guion de voz (232 caracteres · cuerpo nuevo; el cierre se reutiliza)
> ¿Tu hijo se duerme a las diez? Haz esta cuenta. De diez de la noche a seis y media de la mañana son ocho horas y media. De seis a doce años necesita entre nueve y doce. Dormir menos se asocia con problemas de atención y de conducta.

Cierres ya generados en `voz/cierres/` (Meta y TikTok/YouTube). Se pegan al cuerpo con `tools/montar_voz.js`, **sin retraso**.

## Línea de tiempo

| Seg | Voz | Pantalla y cámara | Texto en pantalla | Sonido |
|---|---|---|---|---|
| 0.0–1.5 | "¿Tu hijo se duerme a las diez?" | **Primer cuadro:** el muñeco ya está sentado en la cama, con ojos grandes, mirando a cámara y con la almohada en brazos. Plano cercano, reloj gigante "10:00 pm" arriba y luna llena. Empuje de cámara visible desde el cuadro 0. | "¿SE DUERME A LAS 10?" en grande, palabra por palabra. Chip "6–12 años" arriba a la derecha. | Tic-tac suave. La voz entra en 0.00 s. |
| 1.5–3.3 | "Haz esta cuenta." | **Corte seco** a un plano más abierto. El muñeco se tapa con la almohada, se destapa y se da vuelta, inquieto. Aparece el rótulo "10:00 pm → 6:30 am". | "HAZ LA CUENTA" | Tic-tac más rápido. |
| 3.3–6.7 | "De diez de la noche a seis y media de la mañana…" | **Time-lapse:** el reloj gira de 10:00 pm a 6:30 am, la luna baja y sale el sol. El muñeco cambia de postura 3 veces. La cámara orbita. Un contador "8 h 30 min" sube abajo. | Contador + subtítulos | Barrido ascendente que acompaña el giro del reloj. |
| 6.7–8.8 | "…son ocho horas y media." | **Se congela a las 6:30 am.** El muñeco bosteza con ojeras. "8 h 30 min" hace un salto de escala (1.3 a 1) en rosa. | "8 h 30 min" gigante | Pop. |
| 8.8–12.2 | "De seis a doce años necesita entre nueve y doce." | **Corte seco** a fondo oscuro con **una sola barra** horizontal de 9 a 12 h (se quitan las demás edades). El marcador de 8.5 h entra desde la izquierda y se queda corto. | "NECESITA 9–12 h" y "−30 min cada noche" pulsando en rosa. Fuente en pie. | Tic al marcador, pop al "−30 min". |
| 12.2–16.7 | "Dormir menos se asocia con problemas de atención y de conducta." | Empuje de cámara hacia la barra. "ATENCIÓN" y "CONDUCTA" aparecen una por una, cada una en su palabra. | Las dos palabras en grande | Pop por palabra. |
| 16.7–25.5 | **Cierre** (Meta o TikTok/YouTube) | **Corte seco** al cierre de `cierre.html`: el checklist real entra con rotación, "GRATIS" y "PDF para imprimir" con sus palabras, cada punto de la lista con su frase y el botón al final. | Ver `cierre.html` | Barrido al entrar el checklist y pop por elemento. |
| 25.5–26.5 | (silencio) | Último cuadro quieto con el botón y la fuente. | | |
| Portada | — | `portada.png` 1080×1920, renderizada aparte desde la escena 3D (no recortada del video): el muñeco bostezando con ojeras a las 6:30 am, ventana con amanecer. Todo lo importante entre y = 240 y 1680. | "¿LE FALTA **SUEÑO**?" (SUEÑO en rosa) y chip "10 pm → 6:30 am = 8 h 30". | — |

## Audio
- Los efectos (tic, pop, barrido) se sintetizan con FFmpeg, sin archivos externos ni derechos de autor, y van **12 dB por debajo de la voz**.
- Normalizar el mezclado final a -14 LUFS.

## Prueba de aceptación (hazla con FFmpeg y repórtame los números, sin sacar capturas)
- Primera ventana de silencio: debe terminar en 0.3 s o menos.
- Cambios de imagen entre 0 y 6 s: al menos 4 (`select='gt(scene,0.08)'`).
- Duración entre 24 y 28 s.
- Después, saca **3 capturas a escala 0.4**: en 0.0 s, 5 s y 10 s.

## Gasto de créditos
Solo se genera el cuerpo nuevo (232 caracteres). Antes de generarlo, dime el conteo. Los cierres ya existen.
