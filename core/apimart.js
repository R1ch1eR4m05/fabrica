// APIMart: imágenes con IA para los anuncios (y lo que venga después).
// Docs (verificadas 2026-11-07):
//   POST https://api.apimart.ai/v1/images/generations  {model, prompt, size, resolution, n, image_urls}  → data[0].task_id
//     https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md
//   GET  https://api.apimart.ai/v1/tasks/{task_id}  → data.status (pending|processing|completed|failed|cancelled),
//        data.result.images[0].url[0]   https://docs.apimart.ai/en/api-reference/tasks/status.md
// Modelo por defecto: Nano Banana 2 (gemini-3.1-flash-image-preview). Cámbialo con APIMART_MODELO_IMAGEN en el .env.
import fs from "node:fs";
import path from "node:path";
import { CFG } from "./config.js";
import { dirProyecto, leer } from "./proyectos.js";
import { dirClips, clipDeEscena } from "./historia.js";

const BASE = "https://api.apimart.ai/v1";
const RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "5:4", "4:5"];
export const hayAPIMart = () => !!CFG.apimartKey;
const modelo = () => process.env.APIMART_MODELO_IMAGEN || "gemini-3.1-flash-image-preview";
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function llamar(ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: cuerpo ? "POST" : "GET", signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${CFG.apimartKey}`, "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = null; }
  if (!r.ok || (j && j.code && j.code !== 200)) {
    const msg = j?.error?.message || j?.message || j?.msg || txt.slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new Error("APIMart no aceptó la llave (revisa APIMART_API_KEY en el .env).");
    if (r.status === 402 || /balance|insufficient|余额/i.test(msg)) throw new Error("APIMart: saldo insuficiente. Recarga créditos en apimart.ai.");
    throw new Error(`APIMart respondió ${r.status}: ${msg}`);
  }
  return j;
}

// una imagen: devuelve los bytes. refs = rutas de imágenes locales (foto del producto) que se mandan como referencia
export async function generarImagen(prompt, { size = "9:16", refs = [], resolucion = "1K" } = {}) {
  if (!hayAPIMart()) throw new Error("Falta APIMART_API_KEY en el .env.");
  const image_urls = refs.slice(0, 6).map((f) => {
    const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg");
    return `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
  });
  const r = await llamar("/images/generations", { model: modelo(), prompt, size: RATIOS.includes(size) ? size : "9:16", resolution: resolucion, n: 1, ...(image_urls.length ? { image_urls } : {}) });
  const tarea = r?.data?.[0]?.task_id;
  if (!tarea) throw new Error("APIMart no devolvió el número de tarea.");
  const t0 = Date.now();
  for (;;) {
    await espera(4000);
    const s = (await llamar(`/tasks/${encodeURIComponent(tarea)}?language=es`))?.data || {};
    if (s.status === "completed") {
      const url = s.result?.images?.[0]?.url?.[0];
      if (!url) throw new Error("APIMart terminó pero sin imagen.");
      const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!img.ok) throw new Error(`No pude bajar la imagen de APIMart (${img.status}).`);
      return { bytes: Buffer.from(await img.arrayBuffer()), ext: /\.png(\?|$)/i.test(url) ? ".png" : /\.webp(\?|$)/i.test(url) ? ".webp" : ".jpg", costo: s.credits_cost ?? s.cost };
    }
    if (s.status === "failed" || s.status === "cancelled") throw new Error(`APIMart: ${s.error?.message || s.status}`);
    if (Date.now() - t0 > 4 * 60000) throw new Error("APIMart tardó más de 4 minutos en una imagen.");
  }
}

// fotos del producto que subiste (proyectos/<id>/producto/*): se mandan de referencia para que el empaque salga igual
export const dirProducto = (id) => path.join(dirProyecto(id), "producto");
export function fotosProducto(id) {
  const d = dirProducto(id);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => /\.(jpe?g|png|webp)$/i.test(x)).sort().map((x) => path.join(d, x)) : [];
}

// prompt de la imagen de una escena del anuncio
export function promptImagen(g, e, conProducto) {
  return [g.estiloVisual, e.imagen || e.flowPrompt,
    conProducto ? "Use the attached product photo(s) as the exact product: same packaging, label, shape and colors." : "",
    "Photorealistic advertising photo, clean composition with empty space for text, no text, no letters, no logos, no watermark."].filter(Boolean).join(" ");
}

// genera con APIMart las imágenes que faltan (clips/escena-N.ext), con tope por tanda
export async function imagenesDeAPIMart(id, avisar = () => {}, { max = 8, soloFaltantes = true } = {}) {
  const p = leer(id, "proyecto.json"), g = leer(id, "guion.json");
  if (!g) throw new Error("Primero hace falta el guion.");
  const refs = fotosProducto(id);
  const pend = g.escenas.map((e, k) => ({ e, n: k + 1 })).filter(({ e, n }) => (e.imagen || e.flowPrompt) && e.sinImagen !== true && (!soloFaltantes || !clipDeEscena(id, n)));
  if (!pend.length) return { generados: 0, fallos: [] };
  const lote = pend.slice(0, Math.max(1, max));
  // las imágenes se piden en la medida más alta del proyecto para que al recortar a 1:1 o 4:5 no se pierda lo importante
  const size = p.opciones?.medidas === "esta" ? p.formato : "4:5";
  fs.mkdirSync(dirClips(id), { recursive: true });
  let generados = 0; const fallos = [];
  for (const [k, { e, n }] of lote.entries()) {
    avisar({ paso: "fondo", progreso: k / lote.length, msg: `APIMart: imagen ${k + 1} de ${lote.length} (escena ${n})…` });
    try {
      const r = await generarImagen(promptImagen(g, e, refs.length && e.producto !== false), { size, refs: e.producto === false ? [] : refs });
      for (const x of fs.readdirSync(dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(dirClips(id), x));
      fs.writeFileSync(path.join(dirClips(id), `escena-${n}${r.ext}`), r.bytes);
      generados++;
    } catch (er) { fallos.push(`escena ${n}: ${er.message}`); if (/llave|saldo/i.test(er.message)) break; }
  }
  if (!generados && fallos.length) throw new Error(fallos.join(" | "));
  return { generados, fallos, faltan: pend.length - lote.length };
}
