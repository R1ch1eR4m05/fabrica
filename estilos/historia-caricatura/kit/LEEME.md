# Kit 3D del estilo historia-caricatura

Copia de las piezas del kit «Shorts animados con Claude» (Crea con LuisPa), basado en «claude-animated-shorts» de Mr omi.
Licencia MIT: ver `LICENSE-kit.txt`. Cambios de la fábrica: banda de toga (`toga`) y `buttons: "ninguno"` en `toon.ts`.

`../lib/caricatura.js` es este kit + three.js 0.186.1 + postprocessing 6.37 empaquetados en un solo archivo (así no hace falta
instalar nada). Si cambias algo de esta carpeta, vuelve a empaquetar:

```
mkdir -p /tmp/kit3d && cd /tmp/kit3d && npm init -y && npm i three@0.186.1 postprocessing@6.37 esbuild --legacy-peer-deps
cp -r <fabrica>/estilos/historia-caricatura/kit ./kit
npx esbuild kit/index.ts --bundle --format=esm --minify --target=es2020 --outfile=<fabrica>/estilos/historia-caricatura/lib/caricatura.js
```
