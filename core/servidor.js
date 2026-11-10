// Servidor del panel. En la laptop escucha solo en 127.0.0.1.
// En el VPS: HOST=0.0.0.0 y PANEL_CLAVE=algo en el .env (pide usuario "fabrica" y esa clave).
import http from "node:http";
import { CFG, FORMATOS, DIR_LISTOS } from "./config.js";
import { listarEstilos, leerEstilo } from "./estilos.js";
import * as P from "./proyectos.js";
import { servirArchivo } from "./estatico.js";
import { escribirGuion, pedidoParaCopiar, extraerJSON } from "./ia.js";
import { hacerVoz } from "./voz.js";
import { render, textoParaSubir } from "./render.js";
import { EFECTOS } from "./audio.js";
import fs from "node:fs";
import path from "node:path";
import { prepararFondo } from "./fondos.js";
import * as INV from "./investigador.js";
import { clipDeFlow, flowDisponible } from "./flow.js";
import * as MOT from "./motion.js";
import * as ACT from "./actualizar.js";
import { musicaIA, promptMusica } from "./musica.js";
import { crearDesdePropuesta } from "./propuestas.js";
import * as HIS from "./historia.js";
import * as COPY from "./copy.js";
import * as GHL from "./ghl.js";
import * as BANCO from "./banco.js";
import { pexels, pixabay } from "./fondos.js";
import { flowSkillListo, MODELOS_VIDEO, MODELOS_IMAGEN, matarFlow } from "./flowskill.js";
import { leerAjustes, guardarAjustes, MODELOS_VOZ } from "./ajustes.js";
import * as ANU from "./anuncios.js";
import * as AM from "./apimart.js";

let investigando = null;
function correrInvestigacion(nicho) {
  if (investigando) throw new Error("Ya hay una investigación en marcha.");
  investigando = { inicio: Date.now() };
  const av = (a) => emitir({ id: "_investigador", paso: "investigar", estado: "trabajando", ...a });
  av({ progreso: 0, msg: "Empezando…" });
  INV.investigar(av, nicho)
    .then((r) => emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: `Listo: ${r.propuestas} propuestas`, resultado: r }))
    .catch((e) => { console.error(e); emitir({ id: "_investigador", paso: "investigar", estado: "error", msg: e.message }); })
    .finally(() => (investigando = null));
}

// ---- trabajos (uno a la vez, en fila) ----
const fila = [];
let actual = null;
const oyentes = new Set();
const ultimos = {}; // último aviso por proyecto

function emitir(ev) {
  if (ev.id) ultimos[ev.id] = ev;
  const linea = `data: ${JSON.stringify(ev)}\n\n`;
  for (const r of oyentes) r.write(linea);
}

const NOMBRE_PASO = { guion: "el guion", voz: "la voz", fondo: "las imágenes/fondo", musica: "la música", render: "el render" };
const quienVa = () => (actual ? `${NOMBRE_PASO[actual.paso] || actual.paso} de «${actual.id}» (lleva ${Math.round((Date.now() - actual.desde) / 60000)} min)` : "");

function encolar(id, paso, fn) {
  // el mismo paso no se pide dos veces; pasos distintos (voz e imágenes de Flow, p. ej.) se forman en fila
  if ((actual?.id === id && actual.paso === paso) || fila.some((t) => t.id === id && t.paso === paso)) throw new Error("Eso ya se está haciendo en este video. Espera a que termine.");
  fila.push({ id, paso, fn });
  P.marcar(id, paso, "en-fila");
  emitir({ id, paso, estado: "en-fila", msg: actual ? `En fila: primero termina ${quienVa()}. Si está trabado, usa «Cancelar todo» abajo.` : "Empezando…" });
  siguiente();
}

async function siguiente() {
  if (actual || !fila.length) return;
  const mia = (actual = { ...fila.shift(), desde: Date.now(), cancelado: false });
  const { id, paso, fn } = mia;
  P.marcar(id, paso, "trabajando");
  emitir({ id, paso, estado: "trabajando", progreso: 0, msg: "Trabajando…" });
  try {
    const r = await fn((a) => { if (mia.cancelado) throw new Error("Cancelado"); emitir({ id, paso, estado: "trabajando", ...a }); });
    if (mia.cancelado) return;
    P.marcar(id, paso, "listo");
    const faltan = r?.fallos?.length || 0;
    emitir({ id, paso, estado: "listo", msg: faltan ? `Listo, pero ${faltan} no salieron (${r.fallos.slice(0, 6).join(", ")}${faltan > 6 ? "…" : ""})${r.motivo ? `: ${String(r.motivo).slice(0, 120)}` : ""}. Dale otra vez a «Generar en Flow las imágenes que faltan».` : "Listo", resultado: r });
    if (BANCO.hayEspejo() && !id.startsWith("_")) BANCO.sincronizar(undefined, id).catch((e) => console.warn("Espejo:", e.message)); // el celular (VPS) ve el video, el copy y las imágenes
  } catch (e) {
    if (mia.cancelado) return;
    console.error(`[${id}/${paso}]`, e);
    P.marcar(id, paso, "error", { error: e.message });
    emitir({ id, paso, estado: "error", msg: e.message });
  } finally { if (actual === mia) { actual = null; siguiente(); } }
}

// suelta lo que esté en marcha y vacía la fila (por si algo se quedó trabado)
function cancelarTodo() {
  const hechos = [];
  try { matarFlow(); } catch {}
  if (actual) { actual.cancelado = true; hechos.push(actual); actual = null; }
  while (fila.length) hechos.push(fila.shift());
  for (const t of hechos) { P.marcar(t.id, t.paso, "error", { error: "Cancelado" }); emitir({ id: t.id, paso: t.paso, estado: "error", msg: "Cancelado" }); }
  siguiente();
  return hechos.length;
}

// anuncios: imágenes (APIMart o Flow, las que falten, con tope) [+ animarlas] → imágenes en las 3 medidas, o voz + video en las 3
// plantilla "avatar": primero cambia la persona de tu video (APIMart: Kling o Seedance) y luego arma el video con subtítulos
function hacerAnuncio(id, { maxImagenes = 8, musica = false } = {}) {
  const p = P.leer(id, "proyecto.json"), op = p.opciones || {}, faltan = HIS.estadoClips(id).some((x) => !x.archivo);
  const esVideo = op.tipo === "video" || op.plantilla === "avatar";
  const errorDe = (q) => (e) => emitir({ id, paso: "fondo", estado: "error", msg: `${q}: ${e.message}. Sigo con lo que haya (Pexels o degradado).` });
  if (op.plantilla === "avatar" && !AM.archivosAvatar(id).resultado && AM.archivosAvatar(id).fuente && AM.hayAPIMart())
    encolar(id, "fondo", (av) => AM.cambiarAvatar(id, av, { motor: op.motorAvatar || "kling", descripcion: p.avatarDescripcion, fondo: p.avatarFondo }).catch(errorDe("Cambiar avatar")));
  else if (faltan && op.generador === "flow" && flowSkillListo())
    encolar(id, "fondo", (av) => HIS.clipsDeFlow(id, (a) => av({ ...a, paso: "fondo" }), { conCuadros: false }).catch(errorDe("Flow")));
  else if (faltan && AM.hayAPIMart())
    encolar(id, "fondo", async (av) => {
      const r = await AM.imagenesDeAPIMart(id, (a) => av({ ...a, paso: "fondo" }), { max: maxImagenes }).catch((e) => { errorDe("APIMart")(e); return null; });
      if (esVideo && op.animar === "si") await AM.animarEscenas(id, av, { max: maxImagenes }).catch(errorDe("Animar"));
      return r;
    });
  if (esVideo) {
    encolar(id, "voz", (av) => (op.plantilla === "avatar" ? ANU.prepararAvatar(id, av) : hacerVoz(id, av)));
    if (musica && CFG.elevenKey) { fila.push({ id, paso: "musica", fn: (av) => musicaIA(id, av).catch((e) => emitir({ id, paso: "musica", estado: "error", msg: `Música: ${e.message}` })) }); P.marcar(id, "musica", "en-fila"); }
    fila.push({ id, paso: "render", fn: (av) => ANU.renderMedidas(id, av) }); P.marcar(id, "render", "en-fila");
  } else encolar(id, "render", (av) => ANU.exportarImagenes(id, av));
}

// ---- utilidades http ----
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const cuerpo = (req) => new Promise((ok, mal) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { mal(e); } }); });

function autorizado(req) {
  if (!CFG.clave) return true;
  const h = req.headers.authorization || "";
  const [, b64] = h.split(" ");
  const [, clave] = Buffer.from(b64 || "", "base64").toString().split(":");
  return clave === CFG.clave;
}

async function api(req, res, partes) {
  const [, , recurso, id, accion] = partes; // /api/<recurso>/<id>/<accion>
  const m = req.method;

  if (recurso === "ghl" && id === "cuentas" && m === "GET") {
    try { return json(res, 200, await GHL.cuentas({ forzar: new URL(req.url, "http://x").searchParams.has("forzar") })); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (recurso === "voces" && id === "comparar") {
    const f = path.join(DIR_LISTOS, "comparar-voces", "comparacion.json");
    if (m === "GET") { try { return json(res, 200, JSON.parse(fs.readFileSync(f, "utf8"))); } catch { return json(res, 200, { modelos: [] }); } }
    if (m === "POST") {
      const VOZ = await import("./voz.js");
      try { return json(res, 200, await VOZ.compararVoces(await cuerpo(req))); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
  }
  if (recurso === "ajustes") {
    if (m === "GET") return json(res, 200, { ...leerAjustes(), modelosVoz: MODELOS_VOZ, modeloVozEnv: CFG.elevenModelo, modelosFlowVideo: MODELOS_VIDEO, modelosFlowImagen: MODELOS_IMAGEN });
    if (m === "PUT") return json(res, 200, guardarAjustes(await cuerpo(req)));
  }
  if (recurso === "actualizacion") {
    if (m === "GET") return json(res, 200, await ACT.hayNovedad({ forzar: id === "revisar" }));
    if (m === "POST") {
      if (actual || fila.length) return json(res, 409, { error: "Hay videos haciéndose. Espera a que terminen y vuelve a actualizar." });
      try { await ACT.aplicar(); } catch (e) { return json(res, 500, { error: e.message }); }
      json(res, 200, { ok: true });
      setTimeout(() => process.exit(3), 400); // el vigilante la vuelve a levantar con la versión nueva
      return;
    }
  }
  if (recurso === "banco") { // banco de imágenes y música compartida (y el espejo laptop → VPS)
    if (id === "recibir" && m === "POST") {
      const partes = []; for await (const d of req) partes.push(d);
      try { BANCO.recibir(decodeURIComponent(req.headers["x-ruta"] || ""), JSON.parse(decodeURIComponent(req.headers["x-datos"] || "{}")), Buffer.concat(partes)); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (id === "inventario" && m === "GET") return json(res, 200, BANCO.inventario());
    if (id === "sincronizar" && m === "POST") {
      try { const b = await cuerpo(req); const r = await BANCO.sincronizar(undefined, b.id || null); return json(res, 200, r); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (!id && m === "GET") { const est = new URL(req.url, "http://x").searchParams.get("estilo") || ""; return json(res, 200, { lista: BANCO.listarBanco(path.basename(est)), espejo: BANCO.hayEspejo() }); }
    return json(res, 404, { error: "No existe" });
  }
  if (recurso === "investigacion") {
    const qn = new URL(req.url, "http://x").searchParams.get("nicho") || undefined;
    if (id === "nichos" && m === "POST") { const b = await cuerpo(req); if (!String(b.nombre || "").trim()) return json(res, 400, { error: "Ponle nombre al nicho." }); return json(res, 200, INV.crearNicho(String(b.nombre).trim())); }
    if (id === "activo" && m === "PUT") { const b = await cuerpo(req); try { return json(res, 200, { activo: INV.activarNicho(b.id) }); } catch (e) { return json(res, 400, { error: e.message }); } }
    if (!id && m === "GET") { const cfg = INV.leerConfig(qn); return json(res, 200, { config: cfg, nichos: INV.listarNichos(), activo: INV.nichoActivo(), estilos: INV.estilosDisponibles(), lista: INV.listarInvestigaciones(cfg.id), trabajando: !!investigando, apify: !!CFG.apifyToken, ia: INV.hayIA(), motor: CFG.geminiKey ? "Gemini" : CFG.anthropicKey ? "Claude" : null, pendientes: INV.informesPendientes() }); }
    if (id === "sugerencias" && m === "GET") {
      const nichos = INV.listarNichos(), n = qn || INV.nichoActivo();
      const usadas = new Set(P.listarProyectos().map((x) => { try { const d = (x.desdeInvestigacion || P.leer(x.id, "proyecto.json")?.desdeInvestigacion); return d ? `${d.archivo}#${d.n}` : ""; } catch { return ""; } }).filter(Boolean));
      return json(res, 200, { nichos, activo: INV.nichoActivo(), nicho: n, config: nichos.some((x) => x.id === n) ? INV.leerConfig(n) : null, sugerencias: nichos.some((x) => x.id === n) ? INV.sugerencias(n, 30, usadas) : [] });
    }
    if (id === "archivos" && m === "GET") { // para que laptop y VPS se pasen las investigaciones
      return json(res, 200, { archivos: INV.archivosInvestigacion() });
    }
    if (id === "prompt" && m === "GET") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return res.end(INV.promptDeepResearch(qn)); }
    if (id === "importar" && m === "POST") {
      // también lo llama n8n: POST /api/investigacion/importar  { "texto": "...", "fuente": "muse" }   (o texto plano)
      // responde al instante (el informe queda guardado) y convierte en segundo plano
      const crudo = await new Promise((ok) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => ok(b)); });
      let datos; try { datos = JSON.parse(crudo); } catch { datos = { texto: crudo }; }
      const fuente = datos.fuente || "informe";
      let nombre;
      // ¿de qué marca es? explícito, o por el asunto/encabezado: "INFORME FABRICA MONARCA" → monarca (sin marca: la activa)
      const txt0 = String(datos.texto ?? datos.informe ?? crudo);
      const cab = `${datos.asunto || datos.subject || ""}\n${txt0.slice(0, 300)}`;
      const marcaInf = datos.nicho || qn || INV.listarNichos().find((x) => new RegExp(`INFORME\\s+FABRICA\\W{0,3}(${[x.id, x.nombre].filter(Boolean).map((v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i").test(cab))?.id;
      try { nombre = INV.guardarInforme(txt0, fuente, marcaInf); } catch (e) { return json(res, 400, { error: e.message }); }
      const conIA = INV.hayIA();
      json(res, 200, { recibido: true, informe: nombre, convirtiendo: conIA, pendiente: !conIA });
      if (!conIA) { emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: "Informe guardado. Pídele a Claude Code que lo convierta." }); return; }
      const correr = async () => {
        while (investigando) await new Promise((r) => setTimeout(r, 5000));
        investigando = { inicio: Date.now() };
        const av = (a) => emitir({ id: "_investigador", paso: "investigar", estado: "trabajando", ...a });
        try {
          const r = await INV.convertirInforme(nombre, fuente, av);
          emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: `Llegó un informe (${fuente}): ${r.propuestas} propuestas`, resultado: r });
        } catch (e) { console.error("Informe", nombre, e.message); emitir({ id: "_investigador", paso: "investigar", estado: "error", msg: `No pude convertir el informe todavía (${e.message}). Quedó guardado y se reintenta solo cada 15 minutos.` }); }
        finally { investigando = null; }
      };
      correr();
      return;
    }
    if (!id && m === "PUT") { const b = await cuerpo(req); return json(res, 200, INV.guardarConfig(b, b.id || qn)); }
    if (!id && m === "POST") { const b = await cuerpo(req).catch(() => ({})); correrInvestigacion(b?.nicho || qn); return json(res, 200, { ok: true }); }
    if (id && !accion && m === "GET") return json(res, 200, INV.leerInvestigacion(id));
    if (id && accion === "reproponer" && m === "POST") {
      if (investigando) return json(res, 409, { error: "Ya hay una investigación en marcha." });
      investigando = { inicio: Date.now() };
      const av = (a) => emitir({ id: "_investigador", paso: "investigar", estado: "trabajando", ...a });
      INV.reproponer(id, av)
        .then((r) => emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: `Listo: ${r.propuestas} propuestas nuevas`, resultado: r }))
        .catch((e) => emitir({ id: "_investigador", paso: "investigar", estado: "error", msg: e.message }))
        .finally(() => (investigando = null));
      return json(res, 200, { ok: true });
    }
    if (id && accion === "crear" && m === "POST") {
      const b = await cuerpo(req);
      try { return json(res, 200, await crearDesdePropuesta(id, Number(b.n), b)); }
      catch (e) { return json(res, e.codigo || 500, { error: e.message }); }
    }
    return json(res, 404, { error: "No existe" });
  }

  if (recurso === "anuncios" && m === "POST") { // el cerebro (o n8n) manda un brief y salen los anuncios
    try {
      const b = await cuerpo(req);
      const r = await ANU.crearDesdeBrief(b, { escribirGuion: INV.hayIA() ? (p) => escribirGuion(p) : null });
      if (b.hacer) for (const x of r.creados) if (x.conGuion) try { hacerAnuncio(x.id, { maxImagenes: Number(b.maxImagenes) || 8, musica: !!b.musica }); } catch {}
      return json(res, 200, { ...r, sinGuion: r.creados.filter((x) => !x.conGuion).length ? "Sin IA en el servidor: dile a Claude Code \"escribe los guiones pendientes\"." : undefined });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (recurso === "cola") {
    if (m === "POST" && id === "cancelar") return json(res, 200, { ok: true, cancelados: cancelarTodo() });
    return json(res, 200, { actual: actual ? { id: actual.id, paso: actual.paso, minutos: Math.round((Date.now() - actual.desde) / 60000) } : null, esperando: fila.map((t) => ({ id: t.id, paso: t.paso })) });
  }

  if (recurso === "info") return json(res, 200, {
    flow: await flowDisponible(), flowSkill: flowSkillListo(), laptop: BANCO.hayLaptop(), espejo: BANCO.hayEspejo(), apify: !!CFG.apifyToken, ghl: GHL.ghlListo(),
    estilos: listarEstilos(), formatos: FORMATOS, efectos: EFECTOS,
    ia: INV.hayIA(), motorIA: CFG.anthropicKey ? "Claude" : CFG.geminiKey ? "Gemini" : null, voz: !!(CFG.elevenKey || CFG.googleTtsKey), pexels: !!(CFG.pexelsKey || CFG.pixabayKey), gemini: !!CFG.geminiKey, apimart: !!CFG.apimartKey, trabajando: actual ? { id: actual.id, paso: actual.paso } : null,
  });

  if (recurso === "eventos") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": hola\n\n");
    for (const ev of Object.values(ultimos)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    oyentes.add(res);
    const latido = setInterval(() => res.write(": ·\n\n"), 20000);
    req.on("close", () => { oyentes.delete(res); clearInterval(latido); });
    return;
  }

  if (recurso !== "proyectos") return json(res, 404, { error: "No existe" });

  if (!id && m === "GET") return json(res, 200, P.listarProyectos());
  if (!id && m === "POST") {
    const b = await cuerpo(req);
    if (!leerEstilo(b.estilo)?.listo) return json(res, 400, { error: "Ese estilo todavía no está listo." });
    return json(res, 200, P.crearProyecto(b));
  }

  const p = P.leer(id, "proyecto.json");
  if (!p) return json(res, 404, { error: "No encuentro ese video." });

  if (!accion && m === "GET") {
    const d = P.detalle(id); if (leerEstilo(p.estilo)?.tipo === "motion") d.motionEstado = MOT.estadoMotion(id);
    if (leerEstilo(p.estilo)?.preparar === "historia") { d.clips = HIS.estadoClips(id); d.auditoria = HIS.leerAuditoria(id); }
    if (leerEstilo(p.estilo)?.anuncios) { d.exportadas = ANU.listarExportadas(id); d.fotosProducto = AM.fotosProducto(id).map((f) => path.basename(f)); d.apimart = AM.hayAPIMart();
      const av = AM.archivosAvatar(id); d.avatar = { fuente: av.fuente && path.basename(av.fuente), imagen: av.avatar && path.basename(av.avatar), resultado: !!av.resultado, descripcion: p.avatarDescripcion || "", fondo: p.avatarFondo || "" }; }
    // de dónde salió la idea (si vino del investigador): enlaces, por qué y la adaptación
    if (p.desdeInvestigacion) try {
      const inv = INV.leerInvestigacion(p.desdeInvestigacion.archivo), pr = inv.propuestas.find((x) => x.n === p.desdeInvestigacion.n);
      if (pr) d.inspiracion = { enlaces: pr.inspiradaEn || [], porque: pr.porque || "", adaptacion: pr.adaptacion || "", llegada: pr.llegada || "", origen: pr.origen || "", porQueEstilo: pr.porQueEstilo || "", fuente: inv.fuente || inv.modo || "", archivo: p.desdeInvestigacion.archivo, n: pr.n };
    } catch {}
    return json(res, 200, d);
  }
  if (accion === "brief" && m === "PUT") {
    MOT.guardarBrief(id, await cuerpo(req)); P.marcar(id, "guion", "listo");
    const d = P.detalle(id); d.motionEstado = MOT.estadoMotion(id); return json(res, 200, d);
  }
  if (!accion && m === "PATCH") { // cambiar título, formato, duración
    const b = await cuerpo(req);
    for (const k of ["titulo", "formato", "duracion", "segundos", "idea", "canal", "vozId", "conVoz", "fondoBuscar", "flowPrompt", "musicaParametros"]) if (b[k] !== undefined) p[k] = b[k];
    if (b.opciones) p.opciones = { ...(p.opciones || {}), ...b.opciones };
    if ((b.formato || b.opciones) && p.estado.render === "listo") p.estado.render = "desactualizado";
    if (b.conVoz !== undefined && p.estado.voz === "listo") p.estado.voz = "desactualizado";
    P.guardar(id, "proyecto.json", p);
    return json(res, 200, P.detalle(id));
  }

  if (accion === "pedido-guion" && m === "POST") { // el pedido para pegarlo en Claude (sin API)
    const b = await cuerpo(req).catch(() => ({}));
    return json(res, 200, { texto: pedidoParaCopiar(p, { cambios: b.cambios || "", guionActual: b.conActual ? P.leer(id, "guion.json") : null }) });
  }
  if (accion === "guion-pegado" && m === "POST") { // guion que te dio Claude (o cualquier IA): se acepta aunque venga con texto alrededor
    const b = await cuerpo(req);
    let g; try { g = extraerJSON(String(b.texto || "")); } catch (e) { return json(res, 400, { error: "No encontré un guion válido en lo que pegaste (tiene que ser el JSON con \"escenas\"). " + e.message }); }
    P.guardar(id, "guion.json", g); P.marcar(id, "guion", "listo");
    return json(res, 200, P.detalle(id));
  }
  if (accion === "guion" && m === "PUT") { // guardar guion editado a mano
    const g = await cuerpo(req);
    if (!Array.isArray(g.escenas)) return json(res, 400, { error: "El guion necesita escenas." });
    P.guardar(id, "guion.json", g);
    P.marcar(id, "guion", "listo");
    return json(res, 200, P.detalle(id));
  }
  if (accion === "guion" && m === "POST") { // escribir con IA
    const b = await cuerpo(req);
    encolar(id, "guion", async () => {
      const g = await escribirGuion(p, { cambios: b.cambios || "", guionActual: b.cambios && P.leer(id, "guion.json") ? P.leer(id, "guion.json") : null });
      P.guardar(id, "guion.json", g);
    });
    return json(res, 200, { ok: true });
  }
  if (accion === "fondo" && m === "POST") {
    const b = await cuerpo(req);
    if (b.buscar !== undefined) { p.fondoBuscar = b.buscar; P.guardar(id, "proyecto.json", p); }
    encolar(id, "fondo", (av) => prepararFondo(id, (a) => av({ ...a, paso: "fondo" }), { buscar: b.buscar }));
    return json(res, 200, { ok: true });
  }
  if (accion === "archivo" && (m === "POST" || m === "DELETE")) {
    // subir o quitar: ?tipo=fondo|musica|imagen   (el archivo va en el cuerpo, el nombre en la cabecera x-nombre)
    const q = new URL(req.url, "http://x").searchParams, tipo = q.get("tipo");
    const dir = P.dirProyecto(id);
    const limpiar = (pref) => fs.readdirSync(dir).filter((n) => n.startsWith(pref + ".")).forEach((n) => fs.rmSync(path.join(dir, n)));
    const base = { fondo: "fondo-propio", musica: "musica" }[tipo];
    if (m === "DELETE") {
      if (tipo === "avatar-imagen") { for (const x of fs.existsSync(AM.dirAvatar(id)) ? fs.readdirSync(AM.dirAvatar(id)) : []) if (/^avatar\./.test(x)) fs.rmSync(path.join(AM.dirAvatar(id), x)); return json(res, 200, P.detalle(id)); }
      if (tipo === "producto") { const f = path.join(AM.dirProducto(id), path.basename(q.get("nombre") || "")); if (q.get("nombre") && fs.existsSync(f)) fs.rmSync(f); return json(res, 200, P.detalle(id)); }
      if (tipo === "clip" && fs.existsSync(HIS.dirClips(id))) for (const x of fs.readdirSync(HIS.dirClips(id))) if (x.startsWith(`escena-${q.get("n")}.`)) fs.rmSync(path.join(HIS.dirClips(id), x));
      if (base) limpiar(base);
      if (base === "fondo" && P.existe(id, "tiempos.json")) { try { encolar(id, "fondo", (av) => prepararFondo(id, (a) => av({ ...a, paso: "fondo" }))); } catch {} }
      return json(res, 200, P.detalle(id));
    }
    const nombre = decodeURIComponent(req.headers["x-nombre"] || "archivo.bin");
    const ext = path.extname(nombre).toLowerCase().replace(/[^.a-z0-9]/g, "");
    let destino;
    if (base) { limpiar(base); destino = path.join(dir, base + ext); }
    else if (tipo === "clip") { // historia: clip de la escena N (clips/escena-N.ext)
      const n = Number(q.get("n")); if (!n) return json(res, 400, { error: "Falta el número de escena." });
      fs.mkdirSync(HIS.dirClips(id), { recursive: true });
      for (const x of fs.readdirSync(HIS.dirClips(id))) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(HIS.dirClips(id), x));
      destino = path.join(HIS.dirClips(id), `escena-${n}${ext}`);
      BANCO.marcarOrigen(id, n, null); // subido por ti: entra al banco
      HIS.quitarDeAuditoria(id, [n]);
    }
    else if (tipo === "avatar-fuente" || tipo === "avatar-imagen") {
      const d = AM.dirAvatar(id), pre = tipo === "avatar-fuente" ? "fuente" : "avatar"; fs.mkdirSync(d, { recursive: true });
      for (const x of fs.readdirSync(d)) if (x.startsWith(pre + ".") || x === "resultado.mp4") fs.rmSync(path.join(d, x));
      destino = path.join(d, pre + (ext || (pre === "fuente" ? ".mp4" : ".jpg")));
    }
    else if (tipo === "producto") { fs.mkdirSync(AM.dirProducto(id), { recursive: true }); destino = path.join(AM.dirProducto(id), `foto-${Date.now()}${ext || ".jpg"}`); }
    else if (tipo === "imagen") { fs.mkdirSync(path.join(dir, "img"), { recursive: true }); destino = path.join(dir, "img", P.slug(path.basename(nombre, ext)) + ext); }
    else return json(res, 400, { error: "Tipo de archivo no válido." });
    await new Promise((ok, mal) => { const w = fs.createWriteStream(destino); req.pipe(w); w.on("finish", ok); w.on("error", mal); });
    if (base && p.estado.render === "listo") { p.estado.render = "desactualizado"; P.guardar(id, "proyecto.json", p); }
    if (base === "fondo" && P.existe(id, "tiempos.json")) { try { encolar(id, "fondo", (av) => prepararFondo(id, (a) => av({ ...a, paso: "fondo" }))); } catch {} }
    return json(res, 200, { ...P.detalle(id), subido: path.relative(dir, destino).replace(/\\/g, "/") });
  }
  if (accion === "flow" && m === "POST") {
    const b = await cuerpo(req);
    const prompt = (b.prompt || p.flowPrompt || P.leer(id, "guion.json")?.fondo?.flowPrompt || "").trim();
    if (!prompt) return json(res, 400, { error: "Falta el prompt para Flow." });
    p.flowPrompt = prompt; P.guardar(id, "proyecto.json", p);
    encolar(id, "fondo", (av) => clipDeFlow(id, prompt, (a) => av({ ...a, paso: "fondo" }), { maxCreditos: Number(b.maxCreditos) || 25 }));
    return json(res, 200, { ok: true });
  }
  if (accion === "todo" && m === "POST") { // voz + video seguidos (para lotes)
    const b = await cuerpo(req).catch(() => ({}));
    const est = leerEstilo(p.estilo);
    if (est?.tipo === "motion") { // se construye en Claude Code; si ya está construido, se renderiza
      if (!MOT.estadoMotion(id).construido) {
        // primero la voz (si hay narración y llave), para que Claude Code anime al ritmo de la voz
        const vozEnCamino = !!(p.motion?.narracion?.trim() && !p.motionVoz && CFG.elevenKey);
        if (vozEnCamino) encolar(id, "voz", (av) => MOT.vozMotion(id, av));
        return json(res, 200, { ok: true, motionPendiente: true, vozEnCamino });
      }
      encolar(id, "render", (av) => MOT.renderMotion(id, av)); return json(res, 200, { ok: true });
    }
    if (est?.anuncios) { hacerAnuncio(id, { maxImagenes: Number(b?.maxImagenes) || 8, musica: !!b?.musica }); return json(res, 200, { ok: true }); }
    // fondo con Google Flow antes de la voz (solo si lo pidieron, hay prompt y Flow está abierto; si falla, sigue con Pexels)
    const prompt = (p.flowPrompt || P.leer(id, "guion.json")?.fondo?.flowPrompt || "").trim();
    // Reflexión · Estatuas (clipsFlow "imagen"): las imágenes siempre salen de Flow si la skill está lista
    if ((b?.flow || est?.clipsFlow === "imagen") && est?.preparar === "historia" && (await flowDisponible()))
      encolar(id, "fondo", (av) => HIS.clipsDeFlow(id, (a) => av({ ...a, paso: "fondo" }), { maxCreditos: Number(b?.flow?.maxCreditos) || 25 })
        .catch((e) => { console.error("Flow", e.message); emitir({ id, paso: "fondo", estado: "error", msg: `Flow falló (${e.message}); sigo con Pexels o dibujos.` }); }));
    else if (b?.flow && est?.fondo && prompt && (await flowDisponible()))
      encolar(id, "fondo", (av) => clipDeFlow(id, prompt, (a) => av({ ...a, paso: "fondo" }), { maxCreditos: Number(b.flow.maxCreditos) || 25 })
        .catch((e) => { console.error("Flow", e.message); emitir({ id, paso: "fondo", estado: "error", msg: `Flow falló (${e.message}); sigo con Pexels.` }); }));
    encolar(id, "voz", (av) => hacerVoz(id, av));
    // música a la medida con ElevenLabs (si la pidieron); si falla, el video sale con la música de la biblioteca
    if (b?.musica && CFG.elevenKey && est?.musicaIA) { fila.push({ id, paso: "musica", fn: (av) => musicaIA(id, av).catch((e) => { console.error("Música", e.message); emitir({ id, paso: "musica", estado: "error", msg: `No se pudo generar la música (${e.message}); sigue con la de la biblioteca.` }); }) }); P.marcar(id, "musica", "en-fila"); }
    fila.push({ id, paso: "render", fn: (av) => render(id, av) }); P.marcar(id, "render", "en-fila");
    return json(res, 200, { ok: true });
  }
  if (accion === "clips" && m === "POST") { // historia: genera en Flow los clips que faltan
    const b = await cuerpo(req);
    // escenas: [n…] para rehacer solo esas (aunque ya tengan clip); notas: {n: "corrección en inglés"} se suma a su prompt
    const escenas = Array.isArray(b.escenas) && b.escenas.length ? b.escenas.map(Number).filter(Boolean) : null;
    encolar(id, "fondo", (av) => HIS.clipsDeFlow(id, (a) => av({ ...a, paso: "fondo" }), { maxCreditos: Number(b.maxCreditos) || 25, soloFaltantes: b.todos !== true, conCuadros: b.conCuadros !== false, escenas, notas: b.notas || {}, reanimar: b.reanimar === true }));
    return json(res, 200, { ok: true });
  }
  if (accion === "auditar" && m === "POST") { // revisa con IA (Gemini/Claude) qué clips salieron mal; no gasta Flow
    const AU = await import("./auditor.js");
    encolar(id, "fondo", (av) => AU.auditarEscenas(id, (a) => av({ ...a, paso: "fondo" })));
    return json(res, 200, { ok: true });
  }
  if (accion === "animar-flow" && m === "POST") { // anima en Flow las escenas marcadas (primero hay que tener las imágenes)
    const b = await cuerpo(req);
    let n; try { n = HIS.elegirAnimadas(id, { proporcion: Number(b.proporcion) || 1 / 3 }); } catch (e) { return json(res, 400, { error: e.message }); }
    encolar(id, "fondo", (av) => HIS.animarEscenas(id, (a) => av({ ...a, paso: "fondo" }), { soloFaltantes: b.todas !== true }));
    return json(res, 200, { ok: true, marcadas: n });
  }
  if (accion === "flow-laptop" && m === "POST") { // VPS: la laptop hace las imágenes en Flow y las regresa por el espejo
    const b = await cuerpo(req);
    try { return json(res, 200, await BANCO.flowEnLaptop(id, { maxCreditos: Number(b.maxCreditos) || 25 })); }
    catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (accion === "animar" && m === "POST") { // anuncios en video: anima con APIMart (Seedance) las fotos de las escenas
    const b = await cuerpo(req);
    if (!AM.hayAPIMart()) return json(res, 400, { error: "Falta APIMART_API_KEY en el .env." });
    encolar(id, "fondo", (av) => AM.animarEscenas(id, av, { max: Number(b.max) || 6 }));
    return json(res, 200, { ok: true });
  }
  if (accion === "avatar" && m === "POST") { // cambia la persona de tu video por el personaje (Kling o Seedance en APIMart)
    const b = await cuerpo(req);
    if (!AM.hayAPIMart()) return json(res, 400, { error: "Falta APIMART_API_KEY en el .env." });
    if (b.descripcion !== undefined) p.avatarDescripcion = String(b.descripcion);
    if (b.fondo !== undefined) p.avatarFondo = String(b.fondo).trim();
    P.guardar(id, "proyecto.json", p);
    encolar(id, "fondo", (av) => AM.cambiarAvatar(id, av, { motor: b.motor || p.opciones?.motorAvatar || "kling", calidad: b.calidad, descripcion: p.avatarDescripcion, fondo: p.avatarFondo }));
    return json(res, 200, { ok: true });
  }
  if (accion === "apimart" && m === "POST") { // anuncios: imágenes con APIMart (las que faltan, o todas)
    const b = await cuerpo(req);
    if (!AM.hayAPIMart()) return json(res, 400, { error: "Falta APIMART_API_KEY en el .env." });
    encolar(id, "fondo", (av) => AM.imagenesDeAPIMart(id, (a) => av({ ...a, paso: "fondo" }), { max: Number(b.max) || 8, soloFaltantes: b.todas !== true }));
    return json(res, 200, { ok: true });
  }
  if (accion === "voz-motion" && m === "POST") { encolar(id, "voz", (av) => MOT.vozMotion(id, av)); return json(res, 200, { ok: true }); }
  if (accion === "remezclar" && m === "POST") { encolar(id, "render", () => MOT.terminar(id)); return json(res, 200, { ok: true }); } // motion: vuelve a mezclar la música (o la quita)
  if (accion === "musica" && m === "GET") return json(res, 200, { prompt: promptMusica(id) });
  if (accion === "musicas" && m === "GET") return json(res, 200, await BANCO.opcionesMusica(id));
  if (accion === "musica-elegir" && m === "POST") { // usa una pista de la biblioteca (se ajusta sola al largo del video)
    const b = await cuerpo(req);
    try { BANCO.elegirMusica(id, b.ruta); } catch (e) { return json(res, 400, { error: e.message }); }
    if (b.rehacer && P.leer(id, "tiempos.json")) { const esMot = leerEstilo(p.estilo)?.tipo === "motion"; encolar(id, "render", (av) => (esMot ? MOT.terminar(id) : render(id, av))); }
    return json(res, 200, P.detalle(id));
  }
  if (accion === "clip-banco" && m === "POST") {
    const b = await cuerpo(req);
    try { BANCO.usarDelBanco(id, Number(b.n), b.archivo); } catch (e) { return json(res, 400, { error: e.message }); }
    return json(res, 200, { ok: true });
  }
  if (accion === "clip-pexels" && m === "POST") { // busca en Pexels/Pixabay y lo pone como clip de la escena
    const b = await cuerpo(req), n = Number(b.n), buscar = String(b.buscar || "").trim();
    if (!n || !buscar) return json(res, 400, { error: "Falta qué buscar." });
    if (!CFG.pexelsKey && !CFG.pixabayKey) return json(res, 400, { error: "Falta PEXELS_API_KEY (gratis en pexels.com/api) en el .env." });
    const vertical = p.formato !== "16:9";
    let r = CFG.pexelsKey ? await pexels(buscar, vertical).catch(() => null) : null;
    if (!r && CFG.pixabayKey) r = await pixabay(buscar, vertical).catch(() => null);
    if (!r) return json(res, 404, { error: `Pexels no encontró nada con "${buscar}". Prueba otras palabras en inglés o usa el banco.` });
    const d = HIS.dirClips(id); fs.mkdirSync(d, { recursive: true });
    for (const x of fs.readdirSync(d)) if (x.startsWith(`escena-${n}.`)) fs.rmSync(path.join(d, x));
    fs.writeFileSync(path.join(d, `escena-${n}${r.ext}`), Buffer.from(await (await fetch(r.url)).arrayBuffer()));
    BANCO.marcarOrigen(id, n, "pexels");
    return json(res, 200, { ok: true, credito: r.credito });
  }
  if (accion === "musica" && m === "POST") {
    const b = await cuerpo(req);
    const esMot = leerEstilo(p.estilo)?.tipo === "motion";
    if (!esMot && !P.leer(id, "tiempos.json")) return json(res, 400, { error: "Primero haz la voz: la música se hace del largo exacto del video." });
    if (esMot && !fs.existsSync(path.join(P.dirProyecto(id), "final.mp4"))) return json(res, 400, { error: "Primero renderiza el motion: la música se hace del largo exacto del video." });
    encolar(id, "musica", (av) => musicaIA(id, av, { prompt: (b.prompt || "").trim() || undefined, reusar: b.reusar, desdePanel: true }));
    if (b.insertar) { fila.push({ id, paso: "render", fn: (av) => (esMot ? MOT.terminar(id) : render(id, av)) }); P.marcar(id, "render", "en-fila"); } // y se vuelve a sacar el video con la música nueva
    return json(res, 200, { ok: true });
  }
  if (accion === "voz" && m === "POST") { encolar(id, "voz", (av) => (leerEstilo(p.estilo)?.anuncios && p.opciones?.plantilla === "avatar" ? ANU.prepararAvatar(id, av) : hacerVoz(id, av))); return json(res, 200, { ok: true }); }
  if (accion === "render" && m === "POST") {
    const esMotion = leerEstilo(p.estilo)?.tipo === "motion";
    if (leerEstilo(p.estilo)?.anuncios) { encolar(id, "render", (av) => (p.opciones?.tipo === "video" || p.opciones?.plantilla === "avatar" ? ANU.renderMedidas(id, av) : ANU.exportarImagenes(id, av))); return json(res, 200, { ok: true }); }
    encolar(id, "render", (av) => (esMotion ? MOT.renderMotion(id, av) : render(id, av)));
    return json(res, 200, { ok: true });
  }
  if (accion === "revisar") { // revisión antes de publicar
    const REV = await import("./revision.js");
    if (m === "GET") return json(res, 200, REV.leerRevision(id) || {});
    encolar(id, "render", (av) => REV.revisar(id, { avisar: av }));
    return json(res, 200, { ok: true });
  }
  if (accion === "imagenes") { // imágenes 4:5 para el feed: frase + carrusel
    const IMG = await import("./imagenes-post.js");
    if (m === "GET") return json(res, 200, IMG.leerImagenes(id) || {});
    encolar(id, "render", (av) => IMG.sacarImagenes(id, { avisar: av }));
    return json(res, 200, { ok: true });
  }
  if (accion === "miniatura") { // 3 miniaturas de YouTube del video
    const MIN = await import("./miniatura.js");
    if (m === "GET") return json(res, 200, MIN.leerMiniaturas(id) || {});
    const b = await cuerpo(req).catch(() => ({}));
    if (b?.usar) { try { return json(res, 200, MIN.usarMiniatura(id, String(b.usar))); } catch (e) { return json(res, 400, { error: e.message }); } }
    encolar(id, "render", (av) => MIN.crearMiniaturas(id, { avisar: av, ia: !!b?.ia }));
    return json(res, 200, { ok: true });
  }
  if (accion === "capitulos" && m === "POST") { // video largo → un video por capítulo + un Reel vertical de cada uno
    const b = await cuerpo(req).catch(() => ({}));
    const CAP = await import("./capitulos.js");
    encolar(id, "render", (av) => CAP.cortarCapitulos(id, av, { reels: b?.reels !== false }));
    return json(res, 200, { ok: true });
  }
  if (accion === "ghl" && m === "POST") { // programar en el Social Planner de GHL
    const b = await cuerpo(req);
    try { return json(res, 200, { ok: true, programados: await GHL.programar(id, { cuentasIds: b.cuentas || [], fecha: b.fecha }) }); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (accion === "copys") { // copy por red para GHL
    if (m === "GET") return json(res, 200, COPY.leerCopys(id));
    if (m === "PUT") return json(res, 200, COPY.guardarCopys(id, await cuerpo(req)));
    if (m === "POST") { try { return json(res, 200, await COPY.copysConIA(id)); } catch (e) { return json(res, 502, { error: e.message }); } }
    if (m === "DELETE") { fs.rmSync(path.join(P.dirProyecto(id), "copys.json"), { force: true }); return json(res, 200, COPY.leerCopys(id)); }
  }
  if (accion === "subir" && m === "GET") {
    const g = P.leer(id, "guion.json");
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(g ? textoParaSubir(g, leerEstilo(p.estilo), P.leer(id, "tiempos.json"), P.leer(id, "fondo.json")) : "");
  }
  return json(res, 404, { error: "No existe" });
}

export function arrancar() {
  const srv = http.createServer(async (req, res) => {
    if (!autorizado(req)) { res.writeHead(401, { "www-authenticate": 'Basic realm="Fabrica"' }); return res.end("Clave necesaria"); }
    try {
      const url = req.url.split("?")[0];
      if (url === "/" || url === "/index.html") return servirArchivo(req, res, "/panel/index.html");
      if (url.startsWith("/api/")) return await api(req, res, url.split("/"));
      if (servirArchivo(req, res, url)) return;
      res.writeHead(404); res.end("No existe");
    } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
  });
  // banco de imágenes: mete lo que ya se generó antes (una vez al arrancar)
  BANCO.llenarBancoDeAntes().then((n) => n && console.log(`  · Banco de imágenes: ${n} nuevas de videos anteriores`)).catch(() => {});
  // investigaciones: laptop ⇄ VPS (cada una trae las que le falten a la otra; así da igual desde dónde las veas)
  const traer = () => INV.traerDelOtro().then((n) => n && emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: `Llegaron ${n} investigación(es) del otro equipo` })).catch((e) => console.warn("  · Investigaciones del otro equipo:", e.message));
  setTimeout(traer, 15000); setInterval(traer, 10 * 60000);
  // carpeta de entrada: lo que caiga en investigacion/entrada/ se importa solo (cada minuto)
  setInterval(async () => {
    if (investigando) return;
    investigando = { inicio: Date.now() };
    try {
      for (const r of await INV.reintentarPendientes()) emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: `Se convirtió un informe pendiente: ${r.propuestas} propuestas`, resultado: r });
      for (const r of await INV.revisarEntrada()) emitir({ id: "_investigador", paso: "investigar", estado: "listo", msg: r.pendiente ? "Llegó un informe nuevo (pendiente de convertir)" : `Llegó un informe: ${r.propuestas} propuestas`, resultado: r });
    } catch (e) { console.error(e); } finally { investigando = null; }
  }, 60000);
  // HOST puede ser una lista separada por comas (p. ej. "172.17.0.1,127.0.0.1": n8n por Docker y Tailscale por localhost)
  const hosts = String(CFG.host).split(",").map((x) => x.trim()).filter(Boolean);
  for (const h of hosts.slice(1)) http.createServer(srv.listeners("request")[0]).listen(CFG.puerto, h);
  srv.listen(CFG.puerto, hosts[0], () => {
    const dir = hosts.map((h) => `http://${h === "0.0.0.0" ? "TU-IP" : h}:${CFG.puerto}/`).join("  ·  ");
    console.log(`\n  Fábrica lista → ${dir}\n  (deja esta ventana abierta mientras la usas)\n`);
    if (!CFG.anthropicKey && !CFG.geminiKey) console.log("  · Sin GEMINI_API_KEY ni ANTHROPIC_API_KEY: el guion lo escribe Claude Code o tú en el panel.");
    if (!CFG.elevenKey) console.log("  · Sin ELEVENLABS_API_KEY: se usará voz de prueba (muda) para ensayar.");
    if (hosts.includes("0.0.0.0") && !CFG.clave) console.log("  ⚠ Estás abriendo el panel a internet sin PANEL_CLAVE. Ponle una en el .env.");
  });
  return srv;
}
