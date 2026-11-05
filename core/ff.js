// Ayudas para ffmpeg / ffprobe
import { spawn } from "node:child_process";
import { CFG } from "./config.js";

const FFPROBE = CFG.ffprobe;

export function correr(bin, args, { entrada } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: [entrada ? "pipe" : "ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${bin} falló (${c}): ${err.slice(-600)}`))));
    if (entrada) { p.stdin.end(entrada); }
  });
}

export const ffmpeg = (args) => correr(CFG.ffmpeg, ["-v", "error", "-y", ...args]);

export async function duracion(archivo) {
  const o = await correr(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]);
  return Number(o.trim());
}

// Proceso ffmpeg al que se le van pasando imágenes (para el render)
export function ffmpegTubo(args) {
  const p = spawn(CFG.ffmpeg, ["-v", "error", "-y", ...args], { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  const fin = new Promise((res, rej) => p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg: " + err.slice(-600))))));
  return {
    escribir: (buf) => new Promise((res) => (p.stdin.write(buf) ? res() : p.stdin.once("drain", res))),
    cerrar: () => { p.stdin.end(); return fin; },
  };
}
