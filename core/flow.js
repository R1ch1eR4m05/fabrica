// Conexión con flow-mcp (https://github.com/GTAI-1/flow-mcp), que maneja Google Flow con tu sesión.
// flow-mcp debe estar abierto aparte (su "Flow Studio" o como MCP de Claude Code); aquí solo le hablamos por su API local.
// Aviso del propio flow-mcp: automatizar Flow puede ir contra los términos de Google. Usa tu cuenta bajo tu riesgo.
import fs from "node:fs";
import path from "node:path";
import { CFG } from "./config.js";
import { dirProyecto, leer, guardar } from "./proyectos.js";
import { prepararFondo } from "./fondos.js";

async function llamar(metodo, datos, ms = 60000) {
  const r = await fetch(`${CFG.flowUrl}/api/${metodo}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos || {}), signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Flow: ${j.error || r.status}`);
  return j;
}

export async function flowDisponible() {
  try { const r = await fetch(`${CFG.flowUrl}/api/health`, { signal: AbortSignal.timeout(1200) }); return r.ok; } catch { return false; }
}

// Genera un clip con el prompt, lo descarga y lo deja como fondo del proyecto
export async function clipDeFlow(id, prompt, avisar = () => {}, { maxCreditos = 25, modelo } = {}) {
  if (!(await flowDisponible())) throw new Error("No encuentro flow-mcp abierto. Abre 'Flow Studio' (o 'npm run studio' en su carpeta) y vuelve a intentar.");
  const p = leer(id, "proyecto.json");
  const escena = { prompt, type: "video", aspect_ratio: p.formato === "16:9" ? "16:9" : "9:16", max_credits: maxCreditos, retries: 1 };
  if (modelo) escena.model = modelo;
  avisar({ msg: "Pidiendo el clip a Flow…", progreso: 0.05 });
  const { jobs } = await llamar("generate", { project: `fabrica-${id}`, scenes: [escena] });
  const ids = jobs.map((j) => j.id);
  const t0 = Date.now();
  for (;;) {
    const w = await llamar("wait", { job_ids: ids, timeout_seconds: 40 }, 60000);
    const job = w.jobs?.[0] || {};
    const seg = Math.round((Date.now() - t0) / 1000);
    avisar({ msg: `Flow: ${job.status || "trabajando"}${job.progress ? " · " + job.progress : ""}${w.pacing ? " · " + w.pacing : ""} (${seg} s)`, progreso: Math.min(0.9, 0.1 + seg / 400) });
    if (w.finished) {
      if (job.status !== "done" && !(job.files || []).length) throw new Error(`Flow no entregó el clip: ${job.error || job.note || job.status}`);
      const archivo = (job.files || []).find((f) => /\.(mp4|mov|webm)$/i.test(f));
      if (!archivo || !fs.existsSync(archivo)) throw new Error("Flow terminó pero no encuentro el archivo descargado.");
      const dir = dirProyecto(id);
      for (const n of fs.readdirSync(dir)) if (n.startsWith("fondo-propio.")) fs.rmSync(path.join(dir, n));
      fs.copyFileSync(archivo, path.join(dir, "fondo-propio" + path.extname(archivo).toLowerCase()));
      const pr = leer(id, "proyecto.json"); pr.flowPrompt = prompt; pr.flowCreditos = job.credits; guardar(id, "proyecto.json", pr);
      avisar({ msg: "Preparando el fondo…", progreso: 0.95 });
      return prepararFondo(id, avisar);
    }
    if (Date.now() - t0 > 20 * 60000) throw new Error("Flow tardó más de 20 minutos. Revisa la ventana de Flow.");
  }
}
