#!/usr/bin/env bash
# Actualiza la fábrica en el VPS y reinicia el servicio. Uso: bash actualizar-vps.sh
set -e
cd "$(dirname "$0")"
git fetch origin main
# cambios locales a archivos de la fábrica: se guardan aparte (git stash) y se pone la versión nueva.
# proyectos/, listos/, investigacion/ y .env no están en GitHub: no se tocan.
git diff --quiet HEAD || git stash push -m "antes de actualizar" >/dev/null
git reset --hard origin/main
npm install --no-audit --no-fund
sudo systemctl restart fabrica 2>/dev/null || true
echo "Fábrica actualizada."
