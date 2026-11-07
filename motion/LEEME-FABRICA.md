# Motion graphics dentro de la fábrica

Esta carpeta es la skill **claude-video** de Felipe Borges (MIT, ver `LICENSE` y `LICENSE-original.txt`), integrada a la fábrica.
Los textos originales están en portugués; Claude los entiende igual. Cambios de la integración:

- Los videos de la galería están comprimidos (vista previa); la referencia completa es el estilo de `estilos/<id>/`.
- La etapa A (elegir estilo) y la B (las 5 preguntas) se hacen en el **panel** de la fábrica y quedan en `proyectos/<id>/BRIEF.md`.
- El trabajo de cada pieza vive en `proyectos/<id>/motion/` y el video final se copia a `proyectos/<id>/final.mp4`.
- Formato por defecto **9:16** (1080×1920): las fichas vienen en 16:9; al adaptar se reacomoda la composición, se mantiene el mecanismo, la paleta y el ritmo.
- Clips de IA: en lugar de Higgsfield se usa Google Flow (flow-mcp) o APIMart; siempre con aprobación y tope de créditos.

- Reglas extra contra el "video tipo diapositivas" (primer segundo, legibilidad en celular, tamaños de plano, menú de transiciones y de fondos): `referencias/anti-diapositivas.md`, adaptadas de **Bang Motion** (Bang Tutorial, MIT, https://github.com/bangtutorial/bang-motion).
