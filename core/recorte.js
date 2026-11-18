// Recorte del sujeto (estatua, persona) para poner el texto DETRÁS de él.
// Modelo: ISNet "general use" (DIS, Apache-2.0) en ONNX, el mismo que publica rembg (MIT) en sus releases de GitHub.
// Corre en la CPU con onnxruntime-node (dependencia opcional); la primera vez baja el modelo (~180 MB) a cache/modelos/.
// Sin onnxruntime o sin modelo, devuelve null y el texto va encima como antes (nunca rompe el render).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { CFG, RAIZ } from "./config.js";

const DIR_MODELOS = path.join(RAIZ, "cache", "modelos"), DIR_MASCARAS = path.join(RAIZ, "cache", "mascaras");
const MODELO = path.join(DIR_MODELOS, "isnet-general-use.onnx");
const URL_MODELO = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx";
const LADO = 1024;

let sesion = null, ort = null, sinRecorte = "";

function correr(args, entrada) {
  return new Promise((res, rej) => {
    const p = spawn(CFG.ffmpeg, ["-hide_banner", "-v", "error", ...args], { stdio: [entrada ? "pipe" : "ignore", "pipe", "pipe"] });
    const out = [], err = []; p.stdout.on("data", (d) => out.push(d)); p.stderr.on("data", (d) => err.push(d)); p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(Buffer.concat(out)) : rej(new Error("ffmpeg: " + Buffer.concat(err).toString().slice(-300)))));
    if (entrada) { p.stdin.on("error", () => {}); p.stdin.end(entrada); }
  });
}

async function bajarModelo(avisar) {
  if (fs.existsSync(MODELO) && fs.statSync(MODELO).size > 100e6) return;
  fs.mkdirSync(DIR_MODELOS, { recursive: true });
  avisar({ paso: "render", msg: "Bajando el modelo para poner el texto detrás de la estatua (una sola vez, ~180 MB)…" });
  const r = await fetch(URL_MODELO);
  if (!r.ok) throw new Error(`no pude bajar el modelo (${r.status})`);
  const tmp = MODELO + ".parcial";
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(tmp, MODELO);
}

async function abrir(avisar) {
  if (sesion) return sesion;
  if (sinRecorte) return null;
  try { ort = await import("onnxruntime-node"); }
  catch { sinRecorte = "falta onnxruntime-node (dale Actualizar para instalarlo)"; console.warn("Recorte:", sinRecorte); return null; }
  try { await bajarModelo(avisar); sesion = await (ort.InferenceSession || ort.default.InferenceSession).create(MODELO, { graphOptimizationLevel: "all" }); return sesion; }
  catch (e) { sinRecorte = e.message; console.warn("Recorte:", e.message); return null; }
}

// imagen → máscara PNG en gris (blanco = sujeto) del mismo tamaño que la imagen. Devuelve la ruta o null.
export async function mascara(imagen, salida, { avisar = () => {} } = {}) {
  const buf = fs.readFileSync(imagen), hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
  const guardada = path.join(DIR_MASCARAS, hash + "-v3.png");
  if (fs.existsSync(guardada)) { fs.copyFileSync(guardada, salida); return salida; }
  const s = await abrir(avisar); if (!s) return null;
  const rgb = await correr(["-i", imagen, "-vf", `scale=${LADO}:${LADO}:flags=bilinear,format=rgb24`, "-f", "rawvideo", "-"]);
  const N = LADO * LADO, x = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) x[c * N + i] = rgb[i * 3 + c] / 255 - 0.5; // ISNet: media 0.5, desviación 1
  const T = ort.Tensor || ort.default.Tensor;
  const res = await s.run({ [s.inputNames[0]]: new T("float32", x, [1, 3, LADO, LADO]) });
  const y = res[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < N; i++) { if (y[i] < lo) lo = y[i]; if (y[i] > hi) hi = y[i]; }
  const g = Buffer.alloc(N), k = hi - lo || 1;
  for (let i = 0; i < N; i++) g[i] = Math.round((255 * (y[i] - lo)) / k);
  // medida original de la imagen
  const dims = await medida(imagen);
  fs.mkdirSync(DIR_MASCARAS, { recursive: true });
  await correr(["-f", "rawvideo", "-pix_fmt", "gray", "-s", `${LADO}x${LADO}`, "-i", "-", "-filter_complex", `[0]scale=${dims.w}:${dims.h}:flags=bicubic,lut=c0='clip((val-50)*255/120,0,255)',split[c][a];[c][a]alphamerge,format=rgba`, "-frames:v", "1", "-y", guardada], g);
  fs.copyFileSync(guardada, salida);
  return salida;
}

async function medida(imagen) {
  const txt = await new Promise((res) => {
    const p = spawn(CFG.ffmpeg, ["-hide_banner", "-i", imagen], { stdio: ["ignore", "ignore", "pipe"] });
    let e = ""; p.stderr.on("data", (d) => (e += d)); p.on("close", () => res(e)); p.on("error", () => res(""));
  });
  const m = txt.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  return m ? { w: +m[1], h: +m[2] } : { w: LADO, h: LADO };
}

export const recorteDisponible = () => !sinRecorte;
