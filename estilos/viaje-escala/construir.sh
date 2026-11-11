#!/usr/bin/env bash
# Vuelve a empaquetar el motor (src/viaje.js + three.js) en lib/viaje.js. Úsalo si cambias algo de src/.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${TMPDIR:-/tmp}/viaje3d"
mkdir -p "$T" && cd "$T"
[ -d node_modules/three ] || { npm init -y >/dev/null; npm i three@0.186.1 esbuild --legacy-peer-deps; }
mkdir -p src && cp "$AQUI/src/viaje.js" src/viaje.js
npx esbuild src/viaje.js --bundle --format=esm --minify --target=es2020 --outfile="$AQUI/lib/viaje.js"
