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
//   node fabrica.js todo <id>                     voz + render (anuncios: APIMart [--max N|--sin-apimart] + todas las medidas)
//   node fabrica.js pendientes                    (Claude Code) TODO lo que falta: propuestas sin crear, guiones, motion y videos sin sacar
//   node fabrica.js crear-propuesta <archivo> <n> [--sin-ia]   crea el video de una propuesta del investigador
//   node fabrica.js voz-motion <id>               voz en off de un motion (narración del brief)
//   node fabrica.js guiones-pendientes            (Claude Code) lista los videos que esperan guion
//   node fabrica.js motion-pendientes             (Claude Code) lista los motion graphics con brief que faltan por construir
//   node fabrica.js listo-motion <id>             (Claude Code) marca terminado un motion graphics y lo copia a listos/
//   node fabrica.js convertir                     convierte en propuestas los informes pendientes (Gemini o Claude)
//   node fabrica.js recolectar [--nicho id]       junta y puntúa publicaciones virales (Apify) para que Claude Code las analice
//   node fabrica.js nichos [id]                   lista los nichos (Levania, Monarca…) y, con id, deja ese activo
//   node fabrica.js investigaciones [--nicho id]  lista las investigaciones
//   node fabrica.js capitulos <id> [--sin-reels]  video largo → un video por capítulo (+ Reel vertical de cada uno)
//   node fabrica.js comparar-voces ["texto"] [--estilo id]   mismo texto con cada modelo de voz → listos/comparar-voces/
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
      // vigilante: corre el panel como proceso hijo y lo vuelve a levantar cuando se actualiza desde el panel (sale con código 3)
      if (!process.env.FABRICA_HIJO) {
        const { spawn } = await import("node:child_process");
        let extra = [];
        const lanzar = () => {
          const h = spawn(process.execPath, [process.argv[1], ...process.argv.slice(2), ...extra], { stdio: "inherit", env: { ...process.env, FABRICA_HIJO: "1" } });
          h.on("exit", (c) => { if (c === 3) { console.log("\n  Fábrica actualizada. Reiniciando…\n"); extra = ["--sin-abrir"]; lanzar(); } else process.exit(c ?? 0); });
        };
        lanzar(); return;
      }
      const { arrancar } = await import("./core/servidor.js");
      arrancar();
      if (!args.includes("--sin-abrir") && String(CFG.host).split(",")[0].trim() === "127.0.0.1") {
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
      const { leerEstilo } = await import("./core/estilos.js");
      if (leerEstilo(P.leer(id, "proyecto.json").estilo)?.anuncios) { // anuncios: APIMart (si hay llave y faltan) → imágenes o videos en todas las medidas
        const A = await import("./core/anuncios.js"), AM = await import("./core/apimart.js"), q = P.leer(id, "proyecto.json");
        if (orden === "todo" && AM.hayAPIMart() && !args.includes("--sin-apimart")) { const r = await AM.imagenesDeAPIMart(id, avisar, { max: Number(opc("max", 8)) }).catch((e) => ({ error: e.message })); console.log("APIMart:", JSON.stringify(r)); }
        if (q.opciones?.tipo === "video") { if (orden === "todo") { const { hacerVoz } = await import("./core/voz.js"); await hacerVoz(id, avisar); P.marcar(id, "voz", "listo"); } console.log(await A.renderMedidas(id, avisar)); }
        else console.log(await A.exportarImagenes(id, avisar));
        P.marcar(id, "render", "listo"); return;
      }
      if (orden === "todo") { const { hacerVoz } = await import("./core/voz.js"); await hacerVoz(id, avisar); P.marcar(id, "voz", "listo"); }
      const { render } = await import("./core/render.js");
      const r = await render(id, avisar); P.marcar(id, "render", "listo");
      console.log(`\nVideo listo en ${r.archivo} (${r.segundos} s)`); return;
    }
    case "pendientes": { // todo lo que falta, para que Claude Code lo termine con una sola orden: "haz los pendientes"
      const MOT = await import("./core/motion.js");
      const INV = await import("./core/investigador.js");
      const ps = P.listarProyectos();
      const sinGuion = ps.filter((p) => p.estilo !== "motion" && p.estado?.guion !== "listo");
      const motion = ps.filter((p) => p.estilo === "motion" && p.motion?.estiloMotion && p.estado?.render !== "listo" && !MOT.estadoMotion(p.id).construido);
      const sinVozM = motion.filter((p) => p.motion?.narracion?.trim() && !p.motionVoz);
      const sinVideo = ps.filter((p) => p.estilo !== "motion" && p.estado?.guion === "listo" && p.estado?.render !== "listo" && !["trabajando", "en-fila"].includes(p.estado?.render));
      // la última investigación de CADA nicho (Levania, Monarca…)
      let sinCrear = [];
      const base = (a) => String(a || "").split(/[\\/]/).pop(); // "investigacion/x.json" y "x.json" son la misma
      for (const ni of INV.listarNichos()) {
        const ultima = INV.listarInvestigaciones(ni.id)[0]; if (!ultima) continue;
        const inv = INV.leerInvestigacion(ultima.archivo);
        const hechas = new Set(ps.filter((p) => base(p.desdeInvestigacion?.archivo) === base(ultima.archivo)).map((p) => p.desdeInvestigacion.n));
        sinCrear.push(...(inv.propuestas || []).filter((x) => !hechas.has(x.n) && (x.viral ?? (x.inspiradaEn || []).length > 0)).map((x) => ({ archivo: ultima.archivo, nicho: ni.nombre, n: x.n, estilo: x.estilo || "frases-desenfocado", tema: x.tema || x.frase })));
      }
      const lin = (t, l, f) => console.log(`\n${t} (${l.length})` + (l.length ? "\n" + l.map(f).join("\n") : ""));
      lin("Propuestas sin crear (última investigación de cada nicho)", sinCrear, (x) => `  ${x.archivo} #${x.n} · ${x.nicho} · ${x.estilo} · ${x.tema}`);
      lin("Videos sin guion", sinGuion, (p) => `  ${p.id} · ${p.estilo} · ${p.titulo}`);
      lin("Motion que necesitan voz antes de construir (node fabrica.js voz-motion <id>)", sinVozM, (p) => `  ${p.id} · ${p.titulo}`);
      lin("Motion graphics sin construir", motion, (p) => `  ${p.id} · ${p.motion.estiloMotion} · ${p.titulo}${p.motionVoz ? " · con voz (" + p.motionVoz.duracion.toFixed(1) + " s)" : ""}`);
      lin("Con guion pero sin video (o con error)", sinVideo, (p) => `  ${p.id} · ${p.estilo} · voz ${p.estado.voz} · video ${p.estado.render}${p.error ? " · error: " + p.error : ""}`);
      return;
    }
    case "crear-propuesta": { // node fabrica.js crear-propuesta <archivo> <n> [--sin-ia]: lo mismo que "Solo crear" en el panel
      const { crearDesdePropuesta } = await import("./core/propuestas.js");
      const r = await crearDesdePropuesta(libres[0], Number(libres[1]), { formato: opc("formato", "9:16"), sinIA: args.includes("--sin-ia") });
      console.log(`${r.id}  ·  ${r.estilo}${r.guionPendiente ? "  ·  SIN GUION: escríbelo tú" : r.estilo === "motion" ? "  ·  brief listo: constrúyelo" : "  ·  guion listo"}`);
      return;
    }
    case "voz-motion": { // node fabrica.js voz-motion <id>: voz en off del motion (narración del brief) con sus tiempos
      const MOT = await import("./core/motion.js");
      const r = await MOT.vozMotion(libres[0], (a) => a.msg && console.log(a.msg));
      console.log(`Voz lista: ${r.duracion.toFixed(1)} s. Tiempos en proyectos/${libres[0]}/tiempos.json`);
      return;
    }
    case "guiones-pendientes": {
      const ps = P.listarProyectos().filter((p) => p.estado?.guion !== "listo" && p.estilo !== "motion");
      console.log(ps.length ? ps.map((p) => `${p.id}  ·  ${p.estilo}  ·  ${p.titulo}`).join("\n") : "No hay guiones pendientes.");
      return;
    }
    case "motion-pendientes": {
      const MOT = await import("./core/motion.js");
      const ps = P.listarProyectos().filter((p) => p.estilo === "motion" && p.motion?.estiloMotion && p.estado?.render !== "listo" && !MOT.estadoMotion(p.id).construido);
      console.log(ps.length ? ps.map((p) => `${p.id}  ·  ${p.motion.estiloMotion}  ·  ${p.titulo}`).join("\n") : "No hay motion graphics pendientes.");
      return;
    }
    case "listo-motion": {
      const MOT = await import("./core/motion.js");
      const r = await MOT.terminar(libres[0]); console.log(`Listo: ${r.archivo}`); return;
    }
    case "investigaciones": {
      const INV = await import("./core/investigador.js");
      for (const x of INV.listarInvestigaciones(opc("nicho"))) console.log(`${x.archivo}  ·  ${x.nicho}  ·  ${x.propuestas} propuestas  ·  ${x.modo}`);
      return;
    }
    case "convertir": {
      const INV = await import("./core/investigador.js");
      const pend = INV.informesPendientes();
      if (!pend.length) { console.log("No hay informes pendientes."); return; }
      for (const n of pend) {
        console.log(`Convirtiendo ${n}…`);
        const t0 = Date.now();
        let r; try { r = await INV.convertirInforme(n, n.replace(/^[\d-]+-/, "").replace(/\.md$/, ""), avisar); } catch (e) { console.log("  " + e.message); continue; }
        console.log(r.pendiente ? "\n  Sin IA configurada: queda pendiente." : `\n  Listo: ${r.propuestas} propuestas en ${Math.round((Date.now() - t0) / 1000)} s (${r.archivo})`);
      }
      return;
    }
    case "recolectar": {
      const { soloDatos } = await import("./core/investigador.js");
      const r = await soloDatos(avisar, opc("nicho"));
      console.log(`\nListo: ${r.total} publicaciones. Las 40 mejores están en ${r.archivo}`); return;
    }
    case "nichos": {
      const INV = await import("./core/investigador.js");
      if (libres[0]) INV.activarNicho(libres[0]);
      const act = INV.nichoActivo();
      for (const n of INV.listarNichos()) console.log(`${n.id === act ? "→" : " "} ${n.id}  ·  ${n.nombre}${n.canal ? "  ·  " + n.canal : ""}  (investigacion/nichos/${n.id}.json)`);
      return;
    }
    case "capitulos": {
      const CAP = await import("./core/capitulos.js");
      const r = await CAP.cortarCapitulos(libres[0], avisar, { reels: !args.includes("--sin-reels") });
      console.log(`\nListo: ${r.capitulos} capítulos y ${r.reels} reels en proyectos/${libres[0]}/capitulos/ (y en listos/)`); return;
    }
    case "comparar-voces": {
      const VOZ = await import("./core/voz.js");
      const r = await VOZ.compararVoces({ texto: libres[0], estiloId: opc("estilo") }, avisar);
      console.log("");
      for (const x of r.modelos) console.log(`${x.nombre}\n   ${x.error ? "✗ " + x.error : `${x.archivo} · ${x.segundos} s · ${x.costo} · 30 min: ${x.video30}`}`);
      return;
    }
    default: console.log("Orden desconocida. Mira la cabecera de fabrica.js.");
  }
}
main().catch((e) => { console.error("\n✗ " + e.message); process.exit(1); });
