// Crea el video de una propuesta del investigador (lo usan el panel y Claude Code con `node fabrica.js crear-propuesta`).
// Frases: con la frase tal cual. Motion: proyecto con su brief (lo construye Claude Code). Otros estilos: guion con la IA;
// si no hay IA o falla (o se pide sinIA), el proyecto queda creado sin guion para que lo escriba Claude Code.
import * as P from "./proyectos.js";
import * as INV from "./investigador.js";
import * as MOT from "./motion.js";
import { leerEstilo } from "./estilos.js";
import { escribirGuion } from "./ia.js";

export async function crearDesdePropuesta(archivo, n, b = {}) {
  const inv = INV.leerInvestigacion(archivo), prop = inv.propuestas.find((x) => x.n === Number(n));
  if (!prop) throw Object.assign(new Error("No encuentro esa propuesta."), { codigo: 404 });
      // el estilo lo eligió el investigador según el contenido; si no hay (propuestas viejas) o no existe, frases
      if (String(prop.estilo || "").startsWith("motion:")) { // motion graphics: brief automático; lo construye Claude Code
        const mot = leerEstilo("motion"), c = (mot.catalogo || []).find((x) => x.id === prop.estilo.slice(7));
        if (!c) throw Object.assign(new Error("Ese estilo de motion ya no existe."), { codigo: 400 });
        const cfg = INV.leerConfig();
        const p = P.crearProyecto({ estilo: "motion", titulo: prop.tituloPost || prop.tema, idea: prop.idea || prop.frase, formato: b.formato || "9:16", duracion: "corto", conVoz: false });
        p.desdeInvestigacion = { archivo, n: prop.n }; if (b.canal) p.canal = b.canal; P.guardar(p.id, "proyecto.json", p);
        MOT.guardarBrief(p.id, { estiloMotion: c.id, formato: b.formato || "9:16", para: "Reels / TikTok", segundos: Math.round(c.seg || 12), loop: false,
          textos: [String(prop.frase || "").replace(/\*/g, ""), INV.cierreValido(prop.cierre)].filter(Boolean).join("\n"),
          marca: /levania/i.test(cfg.nombre) ? "Levania: rosa #C4837A, salvia #8FA58A, crema #F6EEE4, tinta #3D3230. Tipografías Cormorant Garamond (títulos) y Jost (texto). Logo: estilos/render-datos/marca/levania_logo.png" : cfg.marca || "",
          medios: "ninguno, solo gráfico", notas: [prop.idea, prop.porque, prop.adaptacion && `Adaptación: ${prop.adaptacion}`].filter(Boolean).join("\n") });
        P.marcar(p.id, "guion", "listo");
        return P.detalle(p.id);
      }
      const pedido = prop.estilo ? leerEstilo(prop.estilo) : null;
      const est = pedido?.listo && pedido.tipo !== "motion" ? pedido : leerEstilo("frases-desenfocado");
      const esFrases = est.id === "frases-desenfocado";
      const opciones = b.opciones || (esFrases ? { tema: "noche", letra: "serif" } : Object.fromEntries((est.opciones || []).map((o) => [o.clave, Object.keys(o.valores)[0]])));
      const datos = { estilo: est.id, titulo: prop.tituloPost || prop.tema, idea: prop.idea || prop.frase, formato: b.formato || "9:16", duracion: "corto", conVoz: est.vozOpcional ? (b.conVoz ?? false) : true, opciones };
      let guion;
      if (esFrases) guion = INV.guionDesdePropuesta(prop);
      else {
        const cfg = INV.leerConfig();
        const idea = `${prop.idea || prop.frase}\nÁngulo: ${prop.tema || ""}. Gancho sugerido: "${prop.frase}".${prop.adaptacion ? ` Adaptación al público hispano: ${prop.adaptacion}.` : ""}\nMarca: ${cfg.nombre}. Audiencia: ${cfg.descripcion} ${cfg.marca}\n${INV.cierreValido(prop.cierre) ? `Cierre (úsalo tal cual): ${INV.cierreValido(prop.cierre)}` : (cfg.cierres || []).length ? `Cierre: usa uno de estos tal cual: ${cfg.cierres.join(" / ")}` : "Sin cierre de 'comenta una palabra': no inventes ninguno."}`;
        try { if (b.sinIA) throw new Error("Creado sin IA: el guion lo escribe Claude Code."); guion = await escribirGuion({ ...datos, idea }); }
        catch (e) { // sin IA (cuota, saturación): el proyecto se crea igual y el guion lo escribe Claude Code
          const p = P.crearProyecto({ ...datos, idea });
          p.flowPrompt = prop.flowPrompt; p.fondoBuscar = prop.pexels; p.desdeInvestigacion = { archivo, n: prop.n }; p.tema = prop.tema || ""; p.guionPendiente = e.message;
          if (b.canal) p.canal = b.canal;
          P.guardar(p.id, "proyecto.json", p);
          return { ...P.detalle(p.id), guionPendiente: true, aviso: e.message };
        }
        guion.inspiracion = prop.inspiradaEn || [];
        if (!guion.subir) guion.subir = { titulo: prop.tituloPost || "", descripcion: prop.descripcion || "", hashtags: prop.hashtags || [] };
      }
      const p = P.crearProyecto(datos);
      p.flowPrompt = prop.flowPrompt; p.fondoBuscar = prop.pexels; p.desdeInvestigacion = { archivo, n: prop.n }; p.tema = prop.tema || "";
      if (b.canal) p.canal = b.canal;
      P.guardar(p.id, "proyecto.json", p);
      P.guardar(p.id, "guion.json", guion);
      P.marcar(p.id, "guion", "listo");
      return P.detalle(p.id);
}
