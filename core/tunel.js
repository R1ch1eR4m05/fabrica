// Túnel laptop ⇄ VPS por SSH (sin Tailscale ni puertos abiertos).
// En la LAPTOP, con VPS_SSH=root@IP en el .env, la fábrica abre sola:
//   -L 4871 → panel del VPS   (la laptop se trae las investigaciones y manda banco/música/imágenes de Flow)
//   -R 4872 → panel de la laptop, visto desde el VPS  (el VPS le pide a la laptop que haga Flow)
// Se configura una vez con: node fabrica.js conectar-vps root@IP
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CFG, RAIZ } from "./config.js";

export const PUERTO_VPS_LOCAL = () => Number(process.env.TUNEL_LOCAL || 4871);   // en la laptop: el panel del VPS
export const PUERTO_LAPTOP_EN_VPS = () => Number(process.env.TUNEL_REMOTO || 4872); // en el VPS: el panel de la laptop
const LLAVE = path.join(os.homedir(), ".ssh", "id_ed25519");

export const estado = { activo: false, desde: null, error: "" };

function argsBase() {
  return ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=15"];
}

// lo llama el servidor de la laptop al arrancar
export function iniciarTunel(alConectar = () => {}) {
  const destino = process.env.VPS_SSH;
  if (!destino) return false;
  const pv = Number(process.env.VPS_PUERTO || 4870);
  let espera = 5000, ultimoError = "";
  const abrir = () => {
    const args = [...argsBase(), "-N", "-o", "ExitOnForwardFailure=yes",
      "-L", `${PUERTO_VPS_LOCAL()}:127.0.0.1:${pv}`,
      "-R", `${PUERTO_LAPTOP_EN_VPS()}:127.0.0.1:${CFG.puerto}`, destino];
    const p = spawn("ssh", args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "", t0 = Date.now();
    p.stderr.on("data", (d) => (err += d));
    // si a los 4 s sigue vivo, está conectado
    const ok = setTimeout(() => {
      estado.activo = true; estado.desde = new Date().toISOString(); estado.error = ""; espera = 5000; ultimoError = "";
      console.log(`  · Conectado al VPS (${destino}): su panel en http://127.0.0.1:${PUERTO_VPS_LOCAL()}/`);
      alConectar();
    }, 4000);
    p.on("error", (e) => { err += e.message; });
    p.on("close", () => {
      clearTimeout(ok);
      const msg = (err.trim().split("\n").pop() || "se cerró").slice(0, 200);
      if (estado.activo) console.log("  · Se cayó la conexión con el VPS; reintento…");
      else if (msg !== ultimoError) {
        console.warn(`  · No pude conectar con el VPS (${msg}).` + (/Permission denied|publickey/i.test(msg) ? " Corre: node fabrica.js conectar-vps " + destino : /forwarding failed|Address already in use/i.test(msg) ? ` ¿Tienes otra ventana con un túnel al puerto ${PUERTO_VPS_LOCAL()}? Ciérrala.` : ""));
        ultimoError = msg;
      }
      estado.activo = false; estado.error = msg;
      if (Date.now() - t0 > 60000) espera = 5000;
      setTimeout(abrir, espera); espera = Math.min(espera * 2, 5 * 60000);
    });
  };
  abrir();
  return true;
}

// ---------- configuración (una vez, en la laptop) ----------
const correr = (bin, args, opts = {}) => spawnSync(bin, args, { encoding: "utf8", ...opts });

function ponerEnv(archivo, valores) {
  let txt = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf8") : "";
  for (const [k, v] of Object.entries(valores)) {
    const linea = `${k}=${v}`;
    const re = new RegExp(`^#?\\s*${k}=.*$`, "m");
    txt = re.test(txt) ? txt.replace(re, linea) : txt.replace(/\n?$/, "\n") + linea + "\n";
  }
  fs.writeFileSync(archivo, txt);
}

export function conectarVps(destino) {
  if (!destino || !/^[\w.-]+@[\w.-]+$/.test(destino)) throw new Error('Uso: node fabrica.js conectar-vps root@IP-DEL-VPS');
  if (correr("ssh", ["-V"]).error) throw new Error("No encontré ssh. En Windows viene con Git Bash o con 'OpenSSH Client' (Configuración → Aplicaciones → Características opcionales).");

  // 1) llave propia (sin contraseña) para que el túnel entre solo
  if (!fs.existsSync(LLAVE)) {
    fs.mkdirSync(path.dirname(LLAVE), { recursive: true });
    const r = correr("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", LLAVE, "-C", "fabrica-laptop"]);
    if (r.status !== 0) throw new Error("No pude crear la llave SSH: " + (r.stderr || r.error?.message));
    console.log("  ✓ Llave SSH creada");
  }
  const pub = fs.readFileSync(LLAVE + ".pub", "utf8").trim();
  const prueba = () => correr("ssh", [...argsBase(), destino, "echo ok"]).stdout?.trim() === "ok";
  if (!prueba()) {
    console.log("\n  Escribe UNA vez la contraseña del VPS (para dejar la llave instalada):\n");
    const r = correr("ssh", ["-o", "StrictHostKeyChecking=accept-new", destino,
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qF '${pub}' ~/.ssh/authorized_keys || echo '${pub}' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys`], { stdio: "inherit" });
    if (r.status !== 0 || !prueba()) throw new Error("No pude instalar la llave en el VPS (¿contraseña correcta?).");
  }
  console.log("  ✓ La laptop entra al VPS sin contraseña");

  // 2) en el VPS: LAPTOP_URL por el túnel inverso, y leer su clave/puerto
  const remoto = `set -e
cd ~/fabrica
touch .env
poner() { if grep -qE "^#?\\s*$1=" .env; then sed -i -E "s|^#?\\s*$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
poner LAPTOP_URL "http://127.0.0.1:${PUERTO_LAPTOP_EN_VPS()}"
poner LAPTOP_CLAVE "${CFG.clave}"
echo "CLAVE=$(grep -E '^PANEL_CLAVE=' .env | cut -d= -f2-)"
echo "PUERTO=$(grep -E '^PORT=' .env | cut -d= -f2-)"
(sudo -n systemctl restart fabrica 2>/dev/null || systemctl restart fabrica 2>/dev/null) && echo REINICIADO || true`;
  const r = correr("ssh", [...argsBase(), destino, "bash -s"], { input: remoto });
  if (r.status !== 0) throw new Error("No pude configurar el VPS: " + (r.stderr || "").slice(-300) + "\n(¿la fábrica está en ~/fabrica del VPS?)");
  const val = (k) => (r.stdout.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() || "";
  const claveVps = val("CLAVE"), puertoVps = val("PUERTO") || "4870";
  console.log(`  ✓ VPS: LAPTOP_URL=http://127.0.0.1:${PUERTO_LAPTOP_EN_VPS()}${/REINICIADO/.test(r.stdout) ? " (fábrica reiniciada)" : " — reinicia la fábrica del VPS: sudo systemctl restart fabrica"}`);

  // 3) en la laptop: el espejo apunta al túnel
  ponerEnv(path.join(RAIZ, ".env"), { VPS_SSH: destino, VPS_PUERTO: puertoVps, ESPEJO_URL: `http://127.0.0.1:${PUERTO_VPS_LOCAL()}`, ESPEJO_CLAVE: claveVps });
  console.log(`  ✓ Laptop: VPS_SSH=${destino}, ESPEJO_URL=http://127.0.0.1:${PUERTO_VPS_LOCAL()} (la clave del VPS quedó en tu .env)`);
  console.log(`\n  Listo. Cierra y vuelve a abrir la fábrica de la laptop: se conecta sola al VPS mientras esté abierta.`);
  console.log(`  El panel del VPS lo ves en http://127.0.0.1:${PUERTO_VPS_LOCAL()}/ (ya no necesitas abrir el túnel a mano; cierra el que tengas).\n`);
}
