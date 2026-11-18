// Herramientas externas (de código abierto) que la fábrica usa si están instaladas. Se instalan con
//   node fabrica.js instalar-extras [earshot|rea-video|huashu-motion]
// Fijadas a un commit revisado (no se actualizan solas: si quieres una versión nueva, se revisa y se cambia aquí).
//  · earshot (Leon Lin, MIT): banco de 252 efectos de sonido hechos con código, sin modelos ni red → golpes, whooshes y
//    swells alineados a los cortes del video (core/sfx.js). Solo se instala lo del banco (numpy/scipy/soundfile/soxr),
//    sin torch: lo de "escuchar" (describe/critique) no se usa.
//  · rea-video (JuneYaooo, Apache-2.0): desarma un video toma por toma (filmado / IA / código, cortes, cámara, cómo
//    rehacerlo) y escribe VIDEO.md → lo usa «clona el estilo» (core/clonar-estilo.js).
//  · huashu-motion (alchaincyf, MIT): skill de Claude Code para videos de lanzamiento de producto con música compuesta
//    en código (anuncios de Levania). Se clona en extras/huashu-motion; Claude Code la usa leyendo su SKILL.md.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, RAIZ } from "./config.js";

export const DIR_EXTRAS = path.join(RAIZ, "extras");
export const PY = () => CFG.python || (process.platform === "win32" ? "python" : "python3");

export const EXTRAS = {
  earshot: {
    nombre: "earshot (efectos de sonido)", licencia: "MIT",
    repo: "https://github.com/Leonxlnx/earshot", commit: "4ac3d2ac2b151e1c23376f9ce7f3047a17050013",
    pip: ["numpy>=1.26", "scipy>=1.11", "soundfile>=0.12", "soxr>=0.3"], // solo el banco; sin torch
    sinDeps: true, prueba: ["-c", "import earshot.forge.bank"],
  },
  "rea-video": {
    nombre: "rea-video (desarmar videos)", licencia: "Apache-2.0",
    repo: "https://github.com/JuneYaooo/rea-video", commit: "538eb3a757db94826cb90c4297279e50c5dd0f83",
    pip: [], sinDeps: false, prueba: ["-c", "import rea_video.cli"],
  },
  "huashu-motion": {
    nombre: "huashu-motion (videos de lanzamiento)", licencia: "MIT",
    repo: "https://github.com/alchaincyf/huashu-motion", commit: "f09dd7a29e2c9c574939d54db6c0768aad51232a",
    soloClonar: true,
  },
};

const correr = (cmd, args, opts = {}) => new Promise((ok) => {
  const p = spawn(cmd, args, { ...opts, shell: false });
  let salida = ""; p.stdout?.on("data", (d) => (salida += d)); p.stderr?.on("data", (d) => (salida += d));
  p.on("error", (e) => ok({ codigo: -1, salida: e.message })); p.on("close", (c) => ok({ codigo: c, salida }));
});

const cache = {};
export async function hayExtra(id) {
  if (cache[id] !== undefined) return cache[id];
  const x = EXTRAS[id]; if (!x) return false;
  if (x.soloClonar) return (cache[id] = fs.existsSync(path.join(DIR_EXTRAS, id, ".git")));
  return (cache[id] = (await correr(PY(), x.prueba, { env: { ...process.env, PYTHONIOENCODING: "utf-8" } })).codigo === 0);
}
export async function estadoExtras() {
  const out = {};
  for (const id of Object.keys(EXTRAS)) out[id] = await hayExtra(id);
  return out;
}

// clona (o pone al día) el repo en extras/<id> en el commit fijado
async function clonar(id, x, avisar) {
  const dir = path.join(DIR_EXTRAS, id);
  fs.mkdirSync(DIR_EXTRAS, { recursive: true });
  if (!fs.existsSync(path.join(dir, ".git"))) {
    avisar(`Bajando ${x.nombre}…`);
    const r = await correr("git", ["clone", "--filter=blob:none", x.repo, dir]);
    if (r.codigo !== 0) throw new Error(`No pude clonar ${x.repo}: ${r.salida.slice(-300)}`);
  } else await correr("git", ["-C", dir, "fetch", "--quiet", "origin"]);
  const r = await correr("git", ["-C", dir, "checkout", "--quiet", x.commit]);
  if (r.codigo !== 0) throw new Error(`No pude fijar ${id} en ${x.commit.slice(0, 7)}: ${r.salida.slice(-300)}`);
  return dir;
}

// pip install; en Linux nuevo (Debian/Ubuntu) el Python del sistema pide --break-system-packages
async function pip(args) {
  let r = await correr(PY(), ["-m", "pip", "install", "--quiet", ...args]);
  if (r.codigo !== 0 && /externally-managed-environment/i.test(r.salida)) r = await correr(PY(), ["-m", "pip", "install", "--quiet", "--break-system-packages", ...args]);
  if (r.codigo !== 0) throw new Error(`pip falló: ${r.salida.slice(-400)}`);
}

export async function instalarExtra(id, avisar = console.log) {
  const x = EXTRAS[id]; if (!x) throw new Error(`No conozco «${id}». Opciones: ${Object.keys(EXTRAS).join(", ")}`);
  const dir = await clonar(id, x, avisar);
  if (!x.soloClonar) {
    if (x.pip.length) { avisar(`Instalando lo que necesita ${id} (${x.pip.join(", ")})…`); await pip(x.pip); }
    avisar(`Instalando ${id}…`);
    await pip([...(x.sinDeps ? ["--no-deps"] : []), "-e", dir]);
  }
  delete cache[id];
  if (!(await hayExtra(id))) throw new Error(`${id} se instaló pero no responde. Prueba: ${PY()} ${(x.prueba || []).join(" ")}`);
  avisar(`✓ ${x.nombre} listo (${x.licencia}).`);
  return true;
}
