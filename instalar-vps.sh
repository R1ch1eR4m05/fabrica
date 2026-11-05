#!/usr/bin/env bash
# Instalación en el VPS (Ubuntu/Debian). Uso:  bash instalar-vps.sh
# Deja la fábrica corriendo como servicio en el puerto del .env (4870 por defecto).
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "Instalo Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y ffmpeg
npm install --no-audit --no-fund
npx playwright install --with-deps chromium

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^HOST=.*/HOST=0.0.0.0/" .env
  CLAVE=$(head -c 12 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 14)
  sed -i "s/^PANEL_CLAVE=.*/PANEL_CLAVE=$CLAVE/" .env
  echo "Clave del panel: $CLAVE  (guárdala; está en el .env)"
fi

sudo tee /etc/systemd/system/fabrica.service >/dev/null <<EOF
[Unit]
Description=Fabrica de videos
After=network.target
[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) $DIR/fabrica.js panel --sin-abrir
Restart=always
User=$(whoami)
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now fabrica
echo "Listo. Abre http://IP-DEL-VPS:$(grep ^PORT= .env | cut -d= -f2 || echo 4870)/  (si no abre, permite el puerto en el firewall)"
