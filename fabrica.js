#!/usr/bin/env node
// Órdenes de la fábrica (las usa Claude Code o el VPS para lotes):
//   node fabrica.js panel                         abre el panel
//   node fabrica.js estilos                       lista los estilos
//   node fabrica.js nuevo <estilo> "<idea>" [--formato 9:16|16:9] [--duracion corto|largo]
//   node fabrica.js guion <id>                    escribe el guion con la API de Claude
//   node fabrica.js listo <id>                    marca el guion.json (escrito a mano/Claude Code) como listo
//   node fabrica.js voz <id>                      genera la voz
//   node fabrica.js fotos <id> [seg,seg,…]        saca fotogramas para revisar (proyectos/<id>/revision/)
//   node fabrica.js render <id> [--formato 16:9]  saca el video final (también en listos/)
//   node fabrica.js todo <id>                     voz + render
import path from "node:path";
import { exec } from "node:child_process";
import { CFG } from "./core/config.js";
import { listarEstilos } from "./core/estilos.js";
import * as P from "./core/proyectos.js";

const [orden, ...args] = process.argv.slice(2);
const opc = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : def; };
const libres = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const avisar = (a) => process.stdout.write(`\r  ${a.msg}`.padEnd(80));

async function main() {
  switch (orden) {
    case "panel": case undefined: {
      const { arrancar } = await import("./core/servidor.js");
      arrancar();
      if (!args.includes("--sin-abrir") && CFG.host === "127.0.0.1") {
        const url = `http://127.0.0.1:${CFG.puerto}/`;
        const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
        setTimeout(() => exec(cmd, () => {}), 600);
      }
      return;
    }
    case "estilos":
      for (const e of listarEstilos()) console.log(`${e.listo ? "✓" : "·"} ${e.id.padEnd(20)} ${e.nombre}${e.listo ? "" : "  (pronto)"}`);
      return;
    case "nuevo": {
      const p = P.crearProyecto({ estilo: libres[0], idea: libres[1] || "", titulo: opc("titulo", libres[1]), formato: opc("formato", "9:16"), duracion: opc("duracion", "corto") });
      console.log(p.id); return;
    }
    case "guion": {
      const { escribirGuion } = await import("./core/ia.js");
      const p = P.leer(libres[0], "proyecto.json");
      P.guardar(p.id, "guion.json", await escribirGuion(p, { cambios: opc("cambios", "") }));
      P.marcar(p.id, "guion", "listo"); console.log("Guion listo."); return;
    }
    case "listo": P.marcar(libres[0], "guion", "listo"); console.log("Guion marcado como listo."); return;
    case "voz": {
      const { hacerVoz } = await import("./core/voz.js");
      const r = await hacerVoz(libres[0], avisar); P.marcar(libres[0], "voz", "listo");
      console.log(`\nVoz lista: ${r.duracion.toFixed(1)} s${r.prueba ? " (voz de prueba, muda)" : ""}`); return;
    }
    case "fotos": {
      const { fotogramas } = await import("./core/render.js");
      const t = P.leer(libres[0], "tiempos.json");
      const seg = libres[1] ? libres[1].split(",").map(Number) : t.escenas.map((e) => Math.min(e.finVoz, e.ini + 1.2));
      const fs = await fotogramas(libres[0], seg, path.join(P.dirProyecto(libres[0]), "revision"));
      console.log(fs.join("\n")); return;
    }
    case "render": case "todo": {
      const id = libres[0];
      if (opc("formato")) { const p = P.leer(id, "proyecto.json"); p.formato = opc("formato"); P.guardar(id, "proyecto.json", p); }
      if (orden === "todo") { const { hacerVoz } = await import("./core/voz.js"); await hacerVoz(id, avisar); P.marcar(id, "voz", "listo"); }
      const { render } = await import("./core/render.js");
      const r = await render(id, avisar); P.marcar(id, "render", "listo");
      console.log(`\nVideo listo en ${r.archivo} (${r.segundos} s)`); return;
    }
    default: console.log("Orden desconocida. Mira la cabecera de fabrica.js.");
  }
}
main().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
