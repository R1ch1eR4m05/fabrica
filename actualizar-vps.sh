#!/usr/bin/env bash
# Actualiza la fábrica en el VPS y reinicia el servicio. Uso: bash actualizar-vps.sh
set -e
cd "$(dirname "$0")"
git pull --ff-only
npm install --no-audit --no-fund
sudo systemctl restart fabrica 2>/dev/null || true
echo "Fábrica actualizada."
