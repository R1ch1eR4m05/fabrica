// Actualizar la fábrica desde el panel: baja la versión nueva de GitHub y se reinicia sola.
// Tus videos, proyectos, investigaciones, música y el .env no están en GitHub, así que no se tocan.
import { spawn } from "node:child_process";
import { RAIZ } from "./config.js";

const win = process.platform === "win32";
function correr(cmd, args, { ok = [0] } = {}) {
  return new Promise((res, mal) => {
    const p = spawn(cmd, args, { cwd: RAIZ, shell: win });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => mal(new Error(`No pude correr ${cmd}: ${e.message}`)));
    p.on("close", (c) => (ok.includes(c) ? res({ codigo: c, out: out.trim() }) : mal(new Error(`${cmd} ${args[0]} falló: ${(err || out).trim().slice(-300)}`))));
  });
}

let cache = { t: 0, r: null };
export async function hayNovedad({ forzar = false } = {}) {
  if (!forzar && cache.r && Date.now() - cache.t < 10 * 60000) return cache.r;
  try {
    await correr("git", ["fetch", "--quiet", "origin", "main"]);
    const actual = (await correr("git", ["rev-parse", "HEAD"])).out, remota = (await correr("git", ["rev-parse", "origin/main"])).out;
    const cambios = actual === remota ? [] : (await correr("git", ["log", "--format=%s", `${actual}..${remota}`])).out.split("\n").filter(Boolean);
    cache = { t: Date.now(), r: { nueva: cambios.length > 0, cambios } };
  } catch (e) { cache = { t: Date.now(), r: { nueva: false, cambios: [], error: e.message } }; }
  return cache.r;
}

export async function aplicar() {
  await correr("git", ["fetch", "--quiet", "origin", "main"]);
  const sucio = (await correr("git", ["diff", "--quiet", "HEAD"], { ok: [0, 1] })).codigo === 1;
  if (sucio) await correr("git", ["stash", "push", "-m", "antes de actualizar"]);
  await correr("git", ["reset", "--hard", "origin/main"]);
  await correr(win ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"]);
  cache = { t: 0, r: null };
}
