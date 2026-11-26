// Anuncios UGC por combinaciones (estilo UGCdrop): escenas ya generadas (gancho → demo → niños → cierre)
// + texto de gancho + cierre con CTA → MP4 terminado 9:16, sin editar. Datos en ugcdrop/, salida en listos/anuncios-ugc/.
//   armarLote(5)                     5 anuncios nuevos (nunca repite: registro en listos/anuncios-ugc/registro.json)
//   elegirLote(datos, n, opciones)   solo decide qué armar (estilo, tema, combos)
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CFG, RAIZ, DIR_LISTOS } from "./config.js";

const DIR_DATOS = path.join(RAIZ, "ugcdrop");
export const DIR_SALIDA = path.join(DIR_LISTOS, "anuncios-ugc");
const REGISTRO = path.join(DIR_SALIDA, "registro.json");
const DIR_CACHE = path.join(RAIZ, "cache", "ugcdrop", "escenas");
const DIR_PROPIAS = path.join(DIR_DATOS, "escenas"); // aquí puedes soltar escenas a mano: "U01 algo.mp4"
const DIR_TMP = path.join(RAIZ, "cache", "ugcdrop", "tmp");
const EXT = /\.(mp4|mov|m4v|webm)$/i;

export const TEMAS = ["manana", "noche", "tarea", "escuela", "comida", "orden", "hermanos", "casa", "reto", "general"];

// ---------------- datos ----------------
const leerJSON = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : def);
function leerTSV(f) {
  const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const cab = lineas.shift().split("\t");
  return lineas.map((l) => { const c = l.split("\t"); return Object.fromEntries(cab.map((k, i) => [k, (c[i] || "").trim()])); });
}

export function cargar() {
  const ajustes = leerJSON(path.join(DIR_DATOS, "ajustes.json"));
  const { escenas } = leerJSON(path.join(DIR_DATOS, "escenas.json"));
  const porCodigo = Object.fromEntries(escenas.map((e) => [e.codigo, e]));
  const textos = leerJSON(path.join(DIR_DATOS, "textos.json"));
  const combos = [
    ...leerTSV(path.join(DIR_DATOS, "combinaciones_animadas.tsv")).map((f) => ({ id: f.id, estilo: "animado", angulo: f.angulo, escenas: f.escenas.split(/\s+/), textoBase: f.texto_gancho })),
    ...leerTSV(path.join(DIR_DATOS, "combinaciones_ugc.tsv")).map((f) => ({ id: f.id, estilo: "realista", escenas: f.escenas.split(/\s+/) })),
  ];
  for (const c of combos) for (const e of c.escenas) if (!porCodigo[e]) throw new Error(`La combinación ${c.id} usa la escena ${e}, que no está en ugcdrop/escenas.json`);
  return { ajustes, escenas, porCodigo, textos, combos, registro: leerJSON(REGISTRO, null) || { entregados: leerJSON(path.join(DIR_DATOS, "registro-inicial.json"), { entregados: [] }).entregados } };
}

function guardarRegistro(reg) {
  fs.mkdirSync(DIR_SALIDA, { recursive: true });
  fs.writeFileSync(REGISTRO, JSON.stringify(reg, null, 1));
}

// ---------------- qué armar ----------------
const sinEmoji = (t) => t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
const temaDe = (c, pc) => c.escenas.map((x) => pc[x].tema).find((t) => t && t !== "general") || "general";

function textosGancho(c, pc, textos) {
  const l = [];
  if (c.textoBase) l.push(c.textoBase);
  l.push(...(textos.ganchos_por_escena[c.escenas[0]] || []));
  if (!l.length) l.push(pc[c.escenas[0]].titulo);
  return [...new Set(l.map(sinEmoji))];
}

// combinaciones automáticas por tema (realistas): gancho del tema → niños del tema → cierre del tema o general
export function generarAutomaticas(escenas, existentes) {
  const ya = new Set(existentes.map((c) => c.escenas.join(" ")));
  const real = escenas.filter((e) => e.estilo === "realista");
  const nuevas = [];
  let n = 1;
  for (const tema of [...new Set(real.map((e) => e.tema).filter((t) => t !== "general"))]) {
    for (const g of real.filter((e) => e.tipo === "gancho" && e.tema === tema))
      for (const k of real.filter((e) => e.tipo === "ninos" && e.tema === tema))
        for (const c of real.filter((e) => e.tipo === "cierre" && (e.tema === tema || e.tema === "general"))) {
          const esc = [g.codigo, k.codigo, c.codigo];
          if (ya.has(esc.join(" "))) continue;
          ya.add(esc.join(" "));
          nuevas.push({ id: "AU" + String(n++).padStart(4, "0"), estilo: "realista", escenas: esc, automatica: true });
        }
  }
  return nuevas;
}

function barajar(a, semilla = Date.now()) {
  let s = semilla % 2147483647;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function elegirLote(datos, n, op = {}) {
  const { porCodigo: pc, textos, registro, ajustes } = datos;
  let combos = [...datos.combos];
  if (op.automaticas !== false) combos = combos.concat(generarAutomaticas(datos.escenas, combos));
  if (op.excluir?.size) combos = combos.filter((c) => !op.excluir.has(c.id));
  if (op.combos?.length) combos = combos.filter((c) => op.combos.includes(c.id));
  if (op.estilo) combos = combos.filter((c) => c.estilo === op.estilo);
  if (op.tema) combos = combos.filter((c) => temaDe(c, pc) === op.tema);

  const usados = {};
  for (const e of registro.entregados) usados[e.combo] = (usados[e.combo] || 0) + 1;
  const cand = [];
  for (const c of combos) {
    const vs = textosGancho(c, pc, textos), v = usados[c.id] || 0;
    if (v < vs.length) cand.push({ combo: c, variante: v, texto: vs[v], tema: temaDe(c, pc), curada: !c.automatica });
  }
  barajar(cand, op.semilla);
  cand.sort((a, b) => a.variante - b.variante || b.curada - a.curada); // nuevas curadas → nuevas automáticas → otro texto de gancho

  const metaReal = op.estilo ? n : Math.round((n * ajustes.mezcla_lote.porcentaje_realista) / 100);
  const elegidos = [], ganchos = new Set(), temas = {};
  const tope = Math.max(1, Math.ceil(n / 4));
  const tomar = (filtro, limite, libre = false) => {
    for (const x of cand) {
      if (elegidos.length >= limite) break;
      if (elegidos.includes(x) || !filtro(x)) continue;
      if (!libre && (ganchos.has(x.combo.escenas[0]) || (temas[x.tema] || 0) >= tope)) continue; // variedad dentro del lote
      elegidos.push(x); ganchos.add(x.combo.escenas[0]); temas[x.tema] = (temas[x.tema] || 0) + 1;
    }
  };
  tomar((x) => x.combo.estilo === "realista", metaReal);
  tomar((x) => x.combo.estilo === "animado", n);
  tomar(() => true, n);
  tomar(() => true, n, true);

  let iTit = registro.entregados.length;
  return elegidos.map((x) => {
    const copys = textos.copy_por_tema[x.tema] || textos.copy_por_tema.general;
    return {
      id: `${x.combo.id}-v${x.variante + 1}`, combo: x.combo.id, variante: x.variante + 1, estilo: x.combo.estilo, tema: x.tema,
      escenas: x.combo.escenas, textoGancho: x.texto,
      copy: copys[x.variante % copys.length], titular: textos.titulares[iTit++ % textos.titulares.length],
      cta: textos.cierre.ctas[x.variante % textos.cierre.ctas.length],
    };
  });
}

export function contar(datos = cargar()) {
  const todos = datos.combos.concat(generarAutomaticas(datos.escenas, datos.combos));
  const posibles = todos.reduce((s, c) => s + textosGancho(c, datos.porCodigo, datos.textos).length, 0);
  const e = datos.registro.entregados;
  const por = (s) => e.filter((x) => x.estado === s).length;
  return { curadas: datos.combos.length, automaticas: todos.length - datos.combos.length, posibles, entregados: e.length, publicados: por("publicado"), ganadores: e.filter((x) => x.estado === "ganador").map((x) => x.id), quedan: posibles - e.length };
}

export function marcar(id, estado) {
  const ok = ["entregado", "publicado", "ganador", "descartado"];
  if (!ok.includes(estado)) throw new Error("El estado debe ser: " + ok.join(", "));
  const d = cargar(), x = d.registro.entregados.find((a) => a.id === id);
  if (!x) throw new Error(`No encontré ${id} en el registro.`);
  x.estado = estado; guardarRegistro(d.registro);
  return x;
}

// ---------------- escenas: carpeta propia → caché → Drive → descarga ----------------
function buscarPorCodigo(dir, codigo) {
  if (!dir || !fs.existsSync(dir)) return null;
  const re = new RegExp("^" + codigo + "([\\s_\\-.·]|$)", "i");
  const f = fs.readdirSync(dir).find((n) => EXT.test(n) && re.test(n));
  return f ? path.join(dir, f) : null;
}

// nombre exacto de Drive, o el mismo sin acentos/mayúsculas (Drive en Windows a veces cambia la forma de los acentos)
const normal = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function buscarEnDrive(e) {
  const drive = process.env.LEVANIA_DRIVE;
  if (!drive || !e.archivo) return null;
  const ruta = path.join(drive, e.archivo), dir = path.dirname(ruta);
  if (EXT.test(ruta)) {
    if (fs.existsSync(ruta)) return ruta;
    if (fs.existsSync(dir)) { const n = normal(path.basename(ruta)); const f = fs.readdirSync(dir).find((x) => normal(x) === n); if (f) return path.join(dir, f); }
  }
  return buscarPorCodigo(dir, e.codigo); // realistas: "…/08 UGC realista ninos/N01" → busca "N01 …" en esa carpeta
}

export async function resolverEscena(e) {
  const local = buscarPorCodigo(DIR_PROPIAS, e.codigo) || buscarPorCodigo(DIR_CACHE, e.codigo);
  if (local) return local;
  const enDrive = buscarEnDrive(e);
  if (enDrive) return enDrive;
  if (e.url) {
    fs.mkdirSync(DIR_CACHE, { recursive: true });
    const res = await fetch(e.url).catch(() => null);
    if (!res?.ok) throw new Error(`No se pudo bajar ${e.codigo} de Higgsfield (${res ? res.status : "sin conexión"}). Ponla a mano en ugcdrop/escenas/.`);
    const f = path.join(DIR_CACHE, `${e.codigo}.mp4`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    return f;
  }
  throw new Error(`Falta la escena ${e.codigo} (${e.titulo}). Ponla en ugcdrop/escenas/ como "${e.codigo} ….mp4" o pon LEVANIA_DRIVE en el .env.`);
}

// qué escenas ya se encuentran (sin descargar): para revisar antes del primer lote
export function revisarEscenas() {
  const { escenas } = cargar();
  return escenas.map((e) => {
    let donde = buscarPorCodigo(DIR_PROPIAS, e.codigo) ? "ugcdrop/escenas" : buscarPorCodigo(DIR_CACHE, e.codigo) ? "caché" : buscarEnDrive(e) ? "Drive" : null;
    if (!donde && e.url) donde = "se baja de Higgsfield";
    return { codigo: e.codigo, titulo: e.titulo, estilo: e.estilo, donde };
  });
}

// ---------------- render con ffmpeg ----------------
function correr(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { cwd: RAIZ, stdio: ["ignore", "pipe", "pipe"] }); // cwd = raíz: rutas relativas en los filtros (sin "C:")
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${path.basename(bin)} falló: ${err.slice(-700)}`))));
  });
}

async function sonda(f) {
  const j = JSON.parse(await correr(CFG.ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", f]));
  return { duracion: parseFloat(j.format.duration), audio: (j.streams || []).some((s) => s.codec_type === "audio") };
}

function partir(t, max) {
  const l = []; let a = "";
  for (const p of t.split(" ")) { if ((a + " " + p).trim().length > max && a) { l.push(a); a = p; } else a = (a + " " + p).trim(); }
  if (a) l.push(a);
  return l;
}
const hex = (c) => "0x" + c.replace("#", "");
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join("/");

function capasTexto(tmp, clave, lineas, o) {
  const alto = Math.round(o.tamano * 1.42), y0 = Math.round(o.y - (lineas.length * alto) / 2);
  return lineas.map((l, i) => {
    const tf = path.join(tmp, `${clave}_${i}.txt`);
    fs.writeFileSync(tf, l, "utf8");
    return `drawtext=fontfile=${o.fuente}:textfile=${rel(tf)}:expansion=none:fontsize=${o.tamano}:fontcolor=${hex(o.color)}` +
      (o.fondo ? `:box=1:boxcolor=${hex(o.fondo)}:boxborderw=${Math.round(o.tamano * 0.32)}` : "") +
      `:x=(w-text_w)/2:y=${y0 + i * alto}` + (o.enable ? `:enable='${o.enable}'` : "");
  });
}

function elegirMusica(aj) {
  if (!aj.musica.usar) return null;
  for (const c of aj.musica.carpetas) {
    const dir = path.join(RAIZ, c);
    if (!fs.existsSync(dir)) continue;
    const p = fs.readdirSync(dir).filter((f) => /\.(mp3|m4a|wav|aac|ogg)$/i.test(f));
    if (p.length) return path.join(dir, p[Math.floor(Math.random() * p.length)]);
  }
  return null;
}

export async function renderAnuncio(a, archivos, salida, { ajustes: aj, textos }) {
  const { ancho: W, alto: H, fps } = aj.video;
  const tmp = path.join(DIR_TMP, a.id);
  fs.mkdirSync(tmp, { recursive: true });
  const args = ["-y", "-hide_banner", "-loglevel", "error"], f = [], partes = [];
  let total = 0, nIn = 0;

  // 1. escenas: recorte, 9:16, fps y audio parejos
  for (const [i, arch] of archivos.entries()) {
    const s = await sonda(arch);
    const ini = Math.min(aj.escenas.recorte_inicio_seg, Math.max(0, s.duracion - 1));
    const dur = Math.max(0.5, Math.min(i === 0 ? aj.escenas.max_seg_gancho : aj.escenas.max_seg_por_escena, s.duracion - ini - 0.05));
    total += dur;
    args.push("-ss", ini.toFixed(2), "-t", dur.toFixed(2), "-i", arch); nIn++;
    f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p[v${i}]`);
    f.push(s.audio ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${dur.toFixed(2)}[a${i}]` : `anullsrc=r=48000:cl=stereo,atrim=0:${dur.toFixed(2)}[a${i}]`);
    partes.push(`[v${i}][a${i}]`);
  }

  // 2. cierre de marca: título, subtítulo, foto del producto (si hay) y CTA
  const c = aj.cierre, iC = nIn++;
  args.push("-f", "lavfi", "-t", String(c.segundos), "-i", `color=c=${hex(c.fondo)}:s=${W}x${H}:r=${fps}`);
  const img = path.join(RAIZ, c.imagen_producto);
  const conImg = fs.existsSync(img);
  let iImg = null;
  if (conImg) { iImg = nIn++; args.push("-loop", "1", "-t", String(c.segundos), "-i", rel(img)); }
  const titulos = [
    ...capasTexto(tmp, "tit", [textos.cierre.titulo], { fuente: c.fuente_titulo, tamano: 78, color: c.color_titulo, y: conImg ? H * 0.15 : H * 0.36 }),
    ...capasTexto(tmp, "sub", [textos.cierre.subtitulo], { fuente: c.fuente_texto, tamano: 44, color: c.acento, y: conImg ? H * 0.21 : H * 0.43 }),
  ];
  const cta = capasTexto(tmp, "cta", partir(a.cta, 24), { fuente: c.fuente_titulo, tamano: 56, color: c.color_cta, fondo: c.fondo_cta, y: H * 0.84 });
  f.push(`[${iC}:v]format=yuv420p,${titulos.join(",")}[vcb]`);
  if (conImg) {
    f.push(`[${iImg}:v]scale=${Math.round(W * 0.76)}:${Math.round(H * 0.5)}:force_original_aspect_ratio=decrease,format=rgba[prod]`);
    f.push(`[vcb][prod]overlay=(W-w)/2:${Math.round(H * 0.52)}-h/2:shortest=1[vci]`);
  } else f.push(`[vcb]null[vci]`);
  f.push(`[vci]${cta.join(",")},fade=t=in:st=0:d=0.25[vc]`);
  f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${c.segundos}[ac]`);
  partes.push("[vc][ac]");
  total += c.segundos;
  f.push(`${partes.join("")}concat=n=${partes.length}:v=1:a=1[vcat][acat]`);

  // 3. texto del gancho (y etiqueta de IA si se activa en ajustes)
  const tg = aj.texto_gancho;
  const capas = capasTexto(tmp, "gancho", partir(a.textoGancho, tg.max_letras_por_linea), { fuente: tg.fuente, tamano: tg.tamano, color: tg.color, fondo: tg.fondo, y: H * tg.posicion_y, enable: `lt(t,${tg.segundos})` });
  if (aj.etiqueta_ia.mostrar) {
    const tf = path.join(tmp, "ia.txt"); fs.writeFileSync(tf, textos.etiqueta_ia, "utf8");
    capas.push(`drawtext=fontfile=${c.fuente_texto}:textfile=${rel(tf)}:expansion=none:fontsize=${aj.etiqueta_ia.tamano}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=10:x=36:y=h-text_h-70:enable='lt(t,${(total - c.segundos).toFixed(2)})'`);
  }
  f.push(`[vcat]${capas.join(",")}[vtxt]`);

  // 4. música de fondo (musica/anuncios-ugc o musica/nichos/levania)
  const mus = elegirMusica(aj);
  let au = "[acat]";
  if (mus) {
    const iM = nIn++;
    args.push("-stream_loop", "-1", "-i", mus);
    f.push(`[${iM}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${aj.musica.volumen},atrim=0:${total.toFixed(2)}[mus]`);
    f.push(`[acat][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    au = "[amix]";
  }
  f.push(`${au}afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6[afin]`);

  const guion = path.join(tmp, "filtro.txt");
  fs.writeFileSync(guion, f.join(";\n"));
  args.push("-filter_complex_script", rel(guion), "-map", "[vtxt]", "-map", "[afin]",
    "-c:v", "libx264", "-profile:v", "high", "-preset", aj.video.preset, "-crf", String(aj.video.crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", total.toFixed(2), salida);
  await correr(CFG.ffmpeg, args);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { duracion: +total.toFixed(1) };
}

// ---------------- lote completo ----------------
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function armarLote(n = 5, op = {}, avisar = () => {}) {
  const datos = cargar();
  if (op.prueba) {
    const anuncios = elegirLote(datos, n, op);
    if (!anuncios.length) throw new Error("No quedan combinaciones nuevas con esos filtros.");
    return { lote: null, anuncios, hechos: [], fallos: [] };
  }
  let k = 1, carpeta;
  do carpeta = path.join(DIR_SALIDA, `Lote ${hoy()} #${k++}`); while (fs.existsSync(carpeta));

  const filas = [["Anuncio", "Estilo", "Tema", "Escenas", "Texto del gancho", "Copy", "Titular", "CTA", "Duración (s)", "Archivo"]];
  const copys = [], hechos = [], fallos = [], excluir = new Set(), faltan = new Set();
  // si a una combinación le falta una escena, se salta y se busca otra (hasta 4 rondas)
  for (let ronda = 0; ronda < 4 && hechos.length < n; ronda++) {
    const anuncios = elegirLote(datos, n - hechos.length, { ...op, excluir });
    if (!anuncios.length) break;
    for (const a of anuncios) {
      excluir.add(a.combo);
      avisar({ progreso: hechos.length / n, msg: `Armando ${a.id} (${hechos.length + 1} de ${n})…` });
      try {
        const archivos = [];
        for (const cod of a.escenas) {
          if (faltan.has(cod)) throw new Error(`Falta la escena ${cod}.`);
          try { archivos.push(await resolverEscena(datos.porCodigo[cod])); } catch (e) { faltan.add(cod); throw e; }
        }
        fs.mkdirSync(carpeta, { recursive: true });
        const salida = path.join(carpeta, `${a.id}.mp4`);
        const r = await renderAnuncio(a, archivos, salida, datos);
        datos.registro.entregados.push({ id: a.id, combo: a.combo, variante: a.variante, fecha: hoy(), lote: path.basename(carpeta), estado: "entregado" });
        guardarRegistro(datos.registro);
        filas.push([a.id, a.estilo, a.tema, a.escenas.join(" → "), a.textoGancho, a.copy, a.titular, a.cta, r.duracion, `${a.id}.mp4`]);
        copys.push(`━━━ ${a.id} ━━━\nTexto principal:\n${a.copy}\n\nTitular: ${a.titular}\nCTA: ${a.cta}\n(Al subir, marca en la app que es contenido hecho con IA)\n`);
        hechos.push({ ...a, archivo: rel(salida), duracion: r.duracion });
      } catch (e) { fallos.push({ id: a.id, error: e.message.split("\n")[0] }); }
    }
  }
  if (!hechos.length) throw new Error("No salió ningún anuncio. " + [...new Set(fallos.map((x) => x.error))].slice(0, 4).join(" | "));
  fs.writeFileSync(path.join(carpeta, "resumen.csv"), "\ufeff" + filas.map((r) => r.map(csv).join(",")).join("\n"));
  fs.writeFileSync(path.join(carpeta, "copys.txt"), copys.join("\n"));
  const faltantes = [...faltan];
  fs.writeFileSync(path.join(carpeta, "lote.json"), JSON.stringify({ hechos, fallos, faltantes }, null, 1));
  return { lote: path.basename(carpeta), carpeta, hechos, fallos, faltantes };
}

export function listarLotes() {
  if (!fs.existsSync(DIR_SALIDA)) return [];
  const reg = leerJSON(REGISTRO, { entregados: [] });
  const estado = Object.fromEntries(reg.entregados.map((e) => [e.id, e.estado]));
  return fs.readdirSync(DIR_SALIDA).filter((d) => d.startsWith("Lote ") && fs.existsSync(path.join(DIR_SALIDA, d, "lote.json")))
    .sort((a, b) => fs.statSync(path.join(DIR_SALIDA, b)).mtimeMs - fs.statSync(path.join(DIR_SALIDA, a)).mtimeMs)
    .map((d) => {
      const j = leerJSON(path.join(DIR_SALIDA, d, "lote.json"), { hechos: [], fallos: [] });
      return { lote: d, fallos: j.fallos, faltantes: j.faltantes || [], anuncios: j.hechos.map((a) => ({ ...a, estado: estado[a.id] || "entregado", url: "/" + a.archivo.split("/").map(encodeURIComponent).join("/") })) };
    });
}
