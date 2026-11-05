// Motor del estilo "Mapas". Todo depende solo de t (para el render exacto).
// Proyección Mercator girada para que el centro de la cámara siempre quede al centro (así Rusia o el Pacífico no se parten).
(function () {
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const COLORES = ["#e5484d", "#3e7bfa", "#f5b700", "#30a46c", "#8e4ec6", "#ff8b3d"];
  const LOOKS = {
    satelite: { oceano: "#0a1626", tierra: "#3a4630", frontera: "rgba(255,255,255,0.6)", costa: "rgba(255,255,255,0.35)", texto: "#ffffff", trazo: "rgba(0,0,0,0.85)", rellenoAlfa: 0.3, fuente: "Montserrat", pesoEtiqueta: 800, rejilla: null },
    papel:    { oceano: "#e6d6b3", tierra: "#f4e9cf", frontera: "rgba(110,80,45,0.75)", costa: "#4b3a26", texto: "#3b2c1b", trazo: "rgba(244,233,207,0.9)", rellenoAlfa: 0.5, fuente: "Cormorant", pesoEtiqueta: 600, rejilla: "rgba(110,85,50,0.22)" },
    plano:    { oceano: "#86c8ec", tierra: "#f7f2e8", frontera: "#ffffff", costa: "rgba(40,80,110,0.35)", texto: "#1d2733", trazo: "#ffffff", rellenoAlfa: 0.92, fuente: "Montserrat", pesoEtiqueta: 800, rejilla: null },
  };

  const G = { paises50: [], paises10: [], estados: [], lugares: [], porA3: {}, porEstado: {}, nombres: {}, banderas: {}, teselas: new Map(), listas: new Map(), faltan: new Set(), pegatinas: {} };
  let M, LOOK, look, camaras = [], escRef = [], textura;

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // ---------------- datos ----------------
  async function cargar(Mo) {
    M = Mo;
    const base = "datos/";
    const [p110, p50, p10, est, lug, nom] = await Promise.all(["paises-110m.json", "paises-50m.json", "paises-10m.json", "estados.json", "lugares.geojson", "paises.json"].map((f) => fetch(base + f).then((r) => r.json())));
    G.nombres = nom;
    const prep = (fs) => fs.map(enderezar).map((f) => {
      const n = nom[String(f.id).padStart(3, "0")] || {};
      f.a3 = n.a3 || (f.properties?.name || "").slice(0, 3).toUpperCase();
      f.a2 = n.a2 || ""; f.nombre = n.es || f.properties?.name || "";
      f.centro = d3.geoCentroid(f); f.radio = radioDe(f);
      return f;
    });
    G.paises110 = prep(topojson.feature(p110, p110.objects.countries).features);
    G.paises50 = prep(topojson.feature(p50, p50.objects.countries).features);
    G.paises10 = prep(topojson.feature(p10, p10.objects.countries).features);
    for (const f of G.paises10) G.porA3[f.a3] = f;
    G.porA3_50 = {}; for (const f of G.paises50) G.porA3_50[f.a3] = f;
    G.estados = topojson.feature(est, est.objects[Object.keys(est.objects)[0]]).features.map(enderezar).map((f) => {
      f.codigo = f.properties.iso_3166_2; f.pais = f.properties.adm0_a3; f.nombre = f.properties.name_es || f.properties.name;
      f.centro = d3.geoCentroid(f); f.radio = radioDe(f); return f;
    });
    for (const f of G.estados) if (f.codigo) G.porEstado[f.codigo.toUpperCase()] = f;
    G.lugares = lug.features;
    LOOK = (M.proyecto.opciones || {}).mapa || "plano";
    look = LOOKS[LOOK] || LOOKS.plano;
    textura = texturaPapel();
    // banderas e imágenes usadas
    const usados = new Set();
    for (const e of M.guion.escenas) for (const b of [].concat(e.banderas || [])) usados.add(String(b.pais || b).toUpperCase());
    await Promise.all([...usados].map(async (a3) => { const a2 = codigoA2(a3); if (!a2) return; const im = new Image(); im.src = `banderas/${a2}.svg`; await im.decode().catch(() => {}); if (im.naturalWidth) G.banderas[a3] = rasterBandera(im); }));
    for (const e of M.guion.escenas) for (const pg of [].concat(e.pegatinas || [])) if (pg.imagen && !G.pegatinas[pg.imagen]) {
      const im = new Image(); im.src = `/proyectos/${encodeURIComponent(M.proyecto.id)}/${pg.imagen}`; await im.decode().catch(() => {}); if (im.naturalWidth) G.pegatinas[pg.imagen] = im;
    }
    prepararCamaras();
  }

  // algunos polígonos vienen con el giro al revés y "llenan" el planeta: se corrigen
  function enderezar(f) {
    const g = f.geometry; if (!g) return f;
    const pols = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const p of pols) if (d3.geoArea({ type: "Polygon", coordinates: p }) > 2 * Math.PI) for (const anillo of p) anillo.reverse();
    return f;
  }
  function radioDe(f) { const b = d3.geoBounds(f); let dl = b[1][0] - b[0][0]; if (dl < 0) dl += 360; return Math.max(dl, b[1][1] - b[0][1]) / 2; }
  function codigoA2(a3) { for (const k in G.nombres) if (G.nombres[k].a3 === a3) return G.nombres[k].a2; return null; }

  // "MEX", "MX-MIC", "Gibraltar", "Michoacán", [lon, lat]  →  { tipo, f?, punto, nombre }
  function buscar(ref) {
    if (!ref) return null;
    if (Array.isArray(ref)) return { tipo: "punto", punto: ref, nombre: "" };
    if (typeof ref === "object") return ref.lon != null ? { tipo: "punto", punto: [ref.lon, ref.lat], nombre: ref.nombre || "" } : null;
    const s = String(ref).trim(), S = s.toUpperCase();
    if (G.porA3[S]) return { tipo: "pais", f: G.porA3[S], punto: G.porA3[S].centro, nombre: G.porA3[S].nombre };
    if (G.porEstado[S]) return { tipo: "estado", f: G.porEstado[S], punto: G.porEstado[S].centro, nombre: G.porEstado[S].nombre };
    const n = norm(s);
    const pais = G.paises10.find((f) => norm(f.nombre) === n || norm(f.properties?.name) === n);
    if (pais) return { tipo: "pais", f: pais, punto: pais.centro, nombre: pais.nombre };
    const lugar = G.lugares.filter((l) => norm(l.properties.name) === n || norm(l.properties.nameascii) === n).sort((a, b) => b.properties.pop_max - a.properties.pop_max)[0];
    if (lugar) return { tipo: "ciudad", punto: lugar.geometry.coordinates, nombre: lugar.properties.name };
    const est = G.estados.find((f) => norm(f.nombre) === n || norm(f.properties.name) === n);
    if (est) return { tipo: "estado", f: est, punto: est.centro, nombre: est.nombre };
    console.warn("No encuentro en el mapa:", ref);
    return null;
  }

  // parte principal de un país para encuadrar (sin islas lejanas: Alaska, Hawái, Canarias…)
  const cachePrincipal = new Map();
  function principal(f) {
    if (f.geometry.type !== "MultiPolygon") return f;
    if (cachePrincipal.has(f)) return cachePrincipal.get(f);
    const pol = f.geometry.coordinates.map((c) => ({ c, a: d3.geoArea({ type: "Polygon", coordinates: c }) }));
    const max = Math.max(...pol.map((p) => p.a));
    const r = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: pol.filter((p) => p.a >= max * 0.25).map((p) => p.c) } };
    cachePrincipal.set(f, r); return r;
  }

  // ---------------- cámara ----------------
  const proyeccion = (cam) => {
    const k = (256 * Math.pow(2, cam.zoom)) / TAU;
    const yLat = Math.log(Math.tan(Math.PI / 4 + (cam.lat * RAD) / 2));
    return d3.geoMercator().rotate([-cam.lon, 0]).scale(k).translate([M.W / 2, M.H / 2 + k * yLat]).precision(0);
  };

  function encuadre(refs, pad = 0.72) {
    const objs = refs.map(buscar).filter(Boolean);
    if (!objs.length) return null;
    const geos = objs.map((o) => (o.f ? principal(o.f) : { type: "Feature", geometry: { type: "Point", coordinates: o.punto } }));
    const col = { type: "FeatureCollection", features: geos };
    const c = d3.geoCentroid(col);
    const p0 = proyeccion({ lon: c[0], lat: c[1], zoom: 0 });
    const [[x0, y0], [x1, y1]] = d3.geoPath(p0).bounds(col);
    const w = Math.max(x1 - x0, 0.02), h = Math.max(y1 - y0, 0.02);
    const soloPuntos = objs.every((o) => !o.f);
    let zoom = soloPuntos && objs.length === 1 ? 6 : Math.log2(Math.min((M.W * pad) / w, (M.H * (M.vertical ? 0.5 : pad)) / h));
    zoom = Math.max(1.2, Math.min(11, zoom));
    const centro = p0.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
    // en vertical subimos un poco el mapa: abajo van los subtítulos
    const cam = { lon: centro[0], lat: centro[1], zoom };
    if (M.vertical) { const p = proyeccion(cam); const q = p.invert([M.W / 2, M.H / 2 + M.H * 0.06]); cam.lat = q[1]; }
    return cam;
  }

  function camaraDeEscena(e, previa) {
    const m = e.mapa || {};
    let cam = null;
    if (m.centro) cam = { lon: m.centro[0], lat: m.centro[1], zoom: m.zoom ?? previa?.zoom ?? 4 };
    else if (m.enfocar) cam = encuadre([].concat(m.enfocar), m.margen ?? 0.72);
    else if (m.ruta?.puntos) cam = encuadre(m.ruta.puntos, 0.62);
    else if (m.comparar) cam = encuadre([m.comparar.pais, m.comparar.a || m.comparar.sobre].filter(Boolean), 0.55);
    if (cam && m.zoom != null && !m.centro) cam.zoom = m.zoom;
    if (cam && m.acercar) cam.zoom += m.acercar;
    return cam || previa || { lon: 0, lat: 20, zoom: 1.6 };
  }

  function prepararCamaras() {
    let previa = null;
    camaras = M.guion.escenas.map((e, i) => {
      const cam = camaraDeEscena(e, previa);
      const te = M.tiempos.escenas[i];
      const ang = previa ? d3.geoDistance([previa.lon, previa.lat], [cam.lon, cam.lat]) : 0;
      const dz = previa ? Math.abs(cam.zoom - previa.zoom) : 0;
      const dur = previa ? Math.min(Math.max(1.1, 0.9 + ang * 1.4 + dz * 0.18), Math.max(1.0, (te.fin - te.ini) * 0.7), 3.2) : 0;
      const r = { cam, desde: previa, ini: te.ini, dur, ang };
      previa = cam; return r;
    });
  }

  function camaraEn(t) {
    const i = M.escenaEn(t), k = camaras[i];
    const sig = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    let cam;
    if (!k.desde || t >= k.ini + k.dur || k.dur === 0) cam = { ...k.cam };
    else {
      const e = sig(M.clamp((t - k.ini) / k.dur));
      const c = d3.geoInterpolate([k.desde.lon, k.desde.lat], [k.cam.lon, k.cam.lat])(e);
      // vuelo: si está lejos, se aleja a medio camino
      const zLejos = Math.log2(M.W / Math.max(1e-3, (k.ang / TAU) * 256 * 1.3));
      const zMin = Math.min(k.desde.zoom, k.cam.zoom);
      const dip = Math.max(0, zMin - Math.min(zMin, zLejos));
      cam = { lon: c[0], lat: c[1], zoom: M.lerp(k.desde.zoom, k.cam.zoom, e) - dip * Math.sin(Math.PI * e) };
    }
    // acercamiento lento mientras se queda quieta
    const quieto = Math.max(0, t - (k.ini + k.dur));
    cam.zoom += Math.min(0.22, quieto * 0.03);
    // seguir la punta de una ruta
    const m = M.guion.escenas[i].mapa || {};
    if (m.ruta && m.seguir) { const tip = puntaRuta(i, t); if (tip) { const e2 = M.suave(M.clamp((t - k.ini - k.dur) / 0.8)); cam.lon = M.lerp(cam.lon, tip[0], e2); cam.lat = M.lerp(cam.lat, tip[1], e2); } }
    return cam;
  }

  // ---------------- satélite (teselas EOX, preparadas con antelación) ----------------
  const N = (z) => Math.pow(2, z);
  function teselasVisibles(cam, zt) {
    const n = N(zt), s = Math.pow(2, cam.zoom - zt) * 256;
    const cx = ((cam.lon + 180) / 360) * n * 256, cy = ((1 - Math.log(Math.tan(Math.PI / 4 + (cam.lat * RAD) / 2)) / Math.PI) / 2) * n * 256;
    const x0 = Math.floor((cx - (M.W / 2) * (256 / s)) / 256), x1 = Math.floor((cx + (M.W / 2) * (256 / s)) / 256);
    const y0 = Math.max(0, Math.floor((cy - (M.H / 2) * (256 / s)) / 256)), y1 = Math.min(n - 1, Math.floor((cy + (M.H / 2) * (256 / s)) / 256));
    const out = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z: zt, x: ((x % n) + n) % n, xs: x, y, sx: M.W / 2 + (x * 256 - cx) * (s / 256), sy: M.H / 2 + (y * 256 - cy) * (s / 256), s });
    return out;
  }
  const nivelTesela = (zoom) => Math.max(1, Math.min(13, Math.round(zoom + 0.35)));
  const claveT = (t) => `${t.z}/${t.x}/${t.y}`;

  async function cargarTeselas(cam) {
    if (LOOK !== "satelite") return;
    const zt = nivelTesela(cam.zoom);
    const pedir = [...teselasVisibles(cam, Math.max(1, zt - 2)), ...teselasVisibles(cam, zt)];
    await Promise.all(pedir.map(async (t) => {
      const k = claveT(t);
      if (G.teselas.has(k) || G.faltan.has(k)) return;
      const p = fetch(`/cache/teselas/${k}.jpg`).then((r) => (r.ok ? r.blob().then(createImageBitmap) : null)).catch(() => null);
      G.teselas.set(k, p);
      const img = await p; if (!img) { G.teselas.delete(k); G.faltan.add(k); } else G.listas.set(k, img);
      if (G.teselas.size > 700) { const v = G.teselas.keys().next().value; G.teselas.delete(v); G.listas.delete(v); }
    }));
  }
  let hayTeselas = false;
  function dibujarTeselas(c, cam) {
    const zt = nivelTesela(cam.zoom); hayTeselas = false;
    if (LOOK !== "satelite") return;
    for (const nivel of [Math.max(1, zt - 2), zt]) for (const t of teselasVisibles(cam, nivel)) {
      const img = G.listas.get(claveT(t)); if (!img) continue;
      c.drawImage(img, t.sx, t.sy, t.s + 0.8, t.s + 0.8); hayTeselas = true;
    }
  }

  // lista de teselas que el video necesita (la usa la fábrica para descargarlas antes del render)
  function teselasNecesarias() {
    const s = new Set();
    for (let t = 0; t < M.duracion; t += 0.4) {
      const cam = camaraEn(t), zt = nivelTesela(cam.zoom);
      for (const nivel of [Math.max(1, zt - 2), zt]) for (const x of teselasVisibles(cam, nivel)) s.add(claveT(x));
    }
    return [...s];
  }

  // ---------------- dibujo ----------------
  function texturaPapel() {
    const c = M.lienzo(512, 512), x = c.getContext("2d"), r = M.rng(21);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 512, 512); // blanco: al multiplicar no oscurece, solo mancha
    for (let k = 0; k < 2600; k++) { x.fillStyle = `rgba(130,95,50,${r() * 0.06})`; x.beginPath(); x.arc(r() * 512, r() * 512, 1 + r() * 12, 0, 7); x.fill(); }
    for (let k = 0; k < 9; k++) { const cx = r() * 512, cy = r() * 512, g = x.createRadialGradient(cx, cy, 0, cx, cy, 60 + r() * 120); g.addColorStop(0, "rgba(140,95,40,0.16)"); g.addColorStop(1, "rgba(140,95,40,0)"); x.fillStyle = g; x.fillRect(0, 0, 512, 512); }
    return c;
  }

  // ---- capas rápidas: cada figura se convierte UNA vez a Path2D en coordenadas de mundo (zoom 0, 256×256)
  const MUNDO = d3.geoMercator().scale(256 / TAU).translate([128, 128]).precision(0);
  function p2d(f) {
    if (!f._p2d) { const p = new Path2D(); d3.geoPath(MUNDO, p)(f); f._p2d = p; }
    return f._p2d;
  }
  // dibuja con la cámara aplicada; repite el mundo a izquierda/derecha si hace falta (cruce del Pacífico)
  function enMundo(c, cam, fn) {
    const s = Math.pow(2, cam.zoom);
    const x0 = ((cam.lon + 180) / 360) * 256, y0 = 128 - (256 / TAU) * Math.log(Math.tan(Math.PI / 4 + (cam.lat * RAD) / 2));
    for (const dx of [-256, 0, 256]) {
      const tx = M.W / 2 - (x0 - dx) * s;
      if (tx > M.W || tx + 256 * s < 0) continue;
      c.save(); c.setTransform(s, 0, 0, s, tx, M.H / 2 - y0 * s); fn(1 / s); c.restore();
    }
  }

  function visibles(lista, cam) {
    const radioVista = (Math.max(M.W, M.H) / (256 * Math.pow(2, cam.zoom))) * 360 * 0.75 + 2;
    return lista.filter((f) => d3.geoDistance(f.centro, [cam.lon, cam.lat]) / RAD < radioVista + f.radio * 1.2);
  }

  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  function resaltadosDe(i) {
    const m = M.guion.escenas[i].mapa || {};
    const lista = [].concat(m.resaltar ?? m.enfocar ?? []).filter((r) => typeof r === "string");
    return lista.map((r, j) => ({ o: buscar(r), color: (m.colores && m.colores[j]) || COLORES[j % COLORES.length] })).filter((x) => x.o && x.o.f);
  }

  function dibujarMapa(c, t, cam, i, te) {
    const W = M.W, H = M.H, u = M.u;
    const proj = proyeccion(cam), path = d3.geoPath(proj, c);
    c.fillStyle = look.oceano; c.fillRect(0, 0, W, H);
    if (LOOK === "papel") { // mar con rayado
      c.save(); c.strokeStyle = "rgba(110,85,50,0.12)"; c.lineWidth = 2 * u;
      for (let y = -W; y < H + W; y += 14 * u) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + W * 0.25); c.stroke(); }
      c.restore();
    }
    dibujarTeselas(c, cam);
    const lista = cam.zoom >= 5 ? G.paises10 : cam.zoom >= 2.6 ? G.paises50 : G.paises110;
    const vis = visibles(lista, cam);
    const res = resaltadosDe(i);
    const entra = M.clamp((t - te.ini - 0.2) / 0.6);
    const m = M.guion.escenas[i].mapa || {};
    const paisesEstados = new Set([].concat(m.estados || []).map((x) => String(x).toUpperCase()));
    for (const { o } of res) if (o.tipo === "estado") paisesEstados.add(o.f.pais);
    const conTeselas = LOOK === "satelite" && hayTeselas;
    enMundo(c, cam, (px) => {
      // tierra
      if (!conTeselas) { c.fillStyle = look.tierra; for (const f of vis) c.fill(p2d(f)); }
      if (look.rejilla) { if (!G._rej) { G._rej = new Path2D(); d3.geoPath(MUNDO, G._rej)(d3.geoGraticule10()); } c.strokeStyle = look.rejilla; c.lineWidth = 1.2 * u * px; c.setLineDash([6 * u * px, 6 * u * px]); c.stroke(G._rej); c.setLineDash([]); }
      // resaltados
      for (const { o, color } of res) { c.fillStyle = rgba(color, look.rellenoAlfa * M.salida(entra)); c.fill(p2d(o.f)); }
      // fronteras
      c.lineJoin = "round"; c.strokeStyle = LOOK === "papel" ? look.costa : look.frontera; c.lineWidth = (LOOK === "papel" ? 2.2 : 1.8) * u * px;
      for (const f of vis) c.stroke(p2d(f));
      // estados
      if (paisesEstados.size && cam.zoom > 2.5) {
        c.strokeStyle = LOOK === "papel" ? "rgba(90,65,35,0.5)" : LOOK === "satelite" ? "rgba(255,255,255,0.35)" : "rgba(120,140,160,0.55)";
        c.lineWidth = 1.1 * u * px; c.setLineDash([5 * u * px, 4 * u * px]);
        for (const f of G.estados) if (paisesEstados.has(f.pais)) c.stroke(p2d(f));
        c.setLineDash([]);
      }
      for (const { o, color } of res) {
        c.strokeStyle = color; c.lineWidth = (3 + 3 * (1 - entra)) * u * px;
        if (LOOK === "satelite") { c.shadowColor = color; c.shadowBlur = 22 * u; }
        c.stroke(p2d(o.f)); c.shadowBlur = 0;
      }
    });
    if (LOOK === "satelite" && !conTeselas) { c.save(); c.globalCompositeOperation = "multiply"; c.globalAlpha = 0.5; c.drawImage(textura, 0, 0, W, H); c.restore(); }
    return proj;
  }

  function etiqueta(c, texto, x, y, { tam = 44, color = look.texto, trazo = look.trazo, peso = look.pesoEtiqueta, fuente = look.fuente, alfa = 1, punto = false } = {}) {
    const u = M.u;
    c.save(); c.globalAlpha *= alfa;
    if (punto) { c.fillStyle = "#e5484d"; c.strokeStyle = "#fff"; c.lineWidth = 4 * u; c.beginPath(); c.arc(x, y, 11 * u, 0, 7); c.fill(); c.stroke(); y -= 34 * u; }
    c.font = `${LOOK === "papel" ? "italic " : ""}${peso} ${tam * u}px ${fuente}`; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineJoin = "round"; c.strokeStyle = trazo; c.lineWidth = (LOOK === "papel" ? 6 : 10) * u; c.strokeText(texto, x, y);
    c.fillStyle = color; c.fillText(texto, x, y); c.restore();
  }

  function etiquetas(c, t, proj, i, te) {
    const e = M.guion.escenas[i], m = e.mapa || {};
    const a = M.salida((t - te.ini - 0.5) / 0.5);
    if (m.etiquetas !== false) for (const { o } of resaltadosDe(i)) {
      const [x, y] = proj(o.f.centro) || []; if (x == null) continue;
      etiqueta(c, o.nombre, x, y, { tam: o.tipo === "estado" ? 38 : 46, alfa: a });
    }
    for (const [j, et] of [].concat(Array.isArray(m.etiquetas) ? m.etiquetas : []).entries()) {
      const o = buscar(et.en || et.texto); if (!o) continue;
      const p = proj(o.punto); if (!p) continue;
      const aj = M.salida((t - te.ini - 0.4 - j * 0.35) / 0.4);
      etiqueta(c, et.texto || o.nombre, p[0], p[1], { tam: et.tam || 40, alfa: aj, punto: o.tipo === "ciudad" || o.tipo === "punto" });
    }
  }

  // ---------------- rutas ----------------
  const cacheRutas = {};
  function rutaDe(i) {
    if (cacheRutas[i]) return cacheRutas[i];
    const r = M.guion.escenas[i].mapa?.ruta; if (!r?.puntos) return null;
    const pts = r.puntos.map(buscar).filter(Boolean).map((o) => o.punto);
    const linea = []; let km = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const f = d3.geoInterpolate(pts[k], pts[k + 1]), d = d3.geoDistance(pts[k], pts[k + 1]);
      const pasos = Math.max(8, Math.round(d * 120));
      for (let s = k ? 1 : 0; s <= pasos; s++) linea.push(f(s / pasos));
      km += d * 6371;
    }
    return (cacheRutas[i] = { linea, km: r.km ?? Math.round(km), icono: r.icono || "avion", color: r.color || "#e5484d" });
  }
  function avanceRuta(i, t) { const te = M.tiempos.escenas[i], k = camaras[i]; const a = te.ini + (k.dur || 0) * 0.6, b = Math.max(a + 1.5, te.finVoz - 0.3); return M.clamp((t - a) / (b - a)); }
  function puntaRuta(i, t) { const r = rutaDe(i); if (!r) return null; const k = avanceRuta(i, t); return r.linea[Math.min(r.linea.length - 1, Math.floor(k * (r.linea.length - 1)))]; }

  function icono(c, tipo, x, y, ang, tam, color) {
    c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = color; c.strokeStyle = "#fff"; c.lineWidth = tam * 0.08; c.lineJoin = "round";
    c.beginPath();
    if (tipo === "avion") { // silueta de avión hacia la derecha
      c.moveTo(tam * 0.6, 0); c.lineTo(tam * 0.1, -tam * 0.08); c.lineTo(-tam * 0.05, -tam * 0.5); c.lineTo(-tam * 0.18, -tam * 0.5); c.lineTo(-tam * 0.08, -tam * 0.1);
      c.lineTo(-tam * 0.4, -tam * 0.1); c.lineTo(-tam * 0.5, -tam * 0.25); c.lineTo(-tam * 0.58, -tam * 0.25); c.lineTo(-tam * 0.52, 0);
      c.lineTo(-tam * 0.58, tam * 0.25); c.lineTo(-tam * 0.5, tam * 0.25); c.lineTo(-tam * 0.4, tam * 0.1); c.lineTo(-tam * 0.08, tam * 0.1);
      c.lineTo(-tam * 0.18, tam * 0.5); c.lineTo(-tam * 0.05, tam * 0.5); c.lineTo(tam * 0.1, tam * 0.08); c.closePath();
    } else if (tipo === "barco") {
      c.rotate(-ang); c.moveTo(-tam * 0.5, 0); c.lineTo(tam * 0.5, 0); c.lineTo(tam * 0.35, tam * 0.22); c.lineTo(-tam * 0.38, tam * 0.22); c.closePath();
      c.moveTo(-tam * 0.05, -tam * 0.02); c.lineTo(-tam * 0.05, -tam * 0.55); c.lineTo(tam * 0.3, -tam * 0.06); c.closePath();
    } else { // coche, tren, pie: un círculo con flecha
      c.arc(0, 0, tam * 0.3, 0, 7); c.moveTo(tam * 0.55, 0); c.lineTo(tam * 0.25, -tam * 0.2); c.lineTo(tam * 0.25, tam * 0.2); c.closePath();
    }
    c.fill(); c.stroke(); c.restore();
  }

  function dibujarRuta(c, t, proj, i) {
    const r = rutaDe(i); if (!r) return null;
    const k = avanceRuta(i, t), n = Math.max(1, Math.floor(k * (r.linea.length - 1)));
    const pts = r.linea.slice(0, n + 1).map((p) => proj(p)).filter(Boolean);
    const u = M.u;
    // la ruta completa tenue
    c.beginPath(); r.linea.forEach((p, j) => { const q = proj(p); if (q) j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
    c.strokeStyle = LOOK === "papel" ? "rgba(75,58,38,0.35)" : "rgba(255,255,255,0.35)"; c.lineWidth = 4 * u; c.setLineDash([10 * u, 10 * u]); c.stroke(); c.setLineDash([]);
    if (pts.length > 1) {
      c.beginPath(); pts.forEach((q, j) => (j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
      c.strokeStyle = r.color; c.lineWidth = 8 * u; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
      const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 4)];
      icono(c, r.icono, a[0], a[1], Math.atan2(a[1] - b[1], a[0] - b[0]), 74 * u, r.color);
    }
    return { km: Math.round(r.km * k), total: r.km, k };
  }

  // ---------------- comparar tamaños reales ----------------
  function rotarGeometria(geom, de, a) {
    const r1 = d3.geoRotation([-de[0], -de[1]]), r2 = d3.geoRotation([-a[0], -a[1]]);
    const f = (p) => r2.invert(r1(p));
    const mapa = (co, prof) => (prof === 0 ? f(co) : co.map((x) => mapa(x, prof - 1)));
    const prof = { Polygon: 2, MultiPolygon: 3 }[geom.type];
    return { type: geom.type, coordinates: mapa(geom.coordinates, prof) };
  }
  function dibujarComparar(c, t, proj, i, te) {
    const m = M.guion.escenas[i].mapa?.comparar; if (!m) return;
    const o = buscar(m.pais); if (!o?.f) return;
    const f50 = G.porA3_50[o.f.a3] || o.f;
    const destino = buscar(m.a || m.sobre); if (!destino) return;
    const largo = Math.max(1.2, Math.min(2.6, (te.finVoz - te.ini) * 0.65));
    const k0 = te.ini + 0.25, k = M.suave(M.clamp((t - k0) / largo));
    const origen = d3.geoCentroid(principal(o.f));
    const centro = d3.geoInterpolate(origen, destino.punto)(k);
    const g = rotarGeometria(principal(f50).geometry, origen, centro);
    const color = m.color || "#e5484d";
    const path = d3.geoPath(proj, c);
    c.beginPath(); path(g); c.fillStyle = rgba(color, 0.55); c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 4 * M.u; c.stroke();
    c.strokeStyle = color; c.lineWidth = 2 * M.u; c.stroke();
    const p = proj(centro); if (p) etiqueta(c, o.nombre, p[0], p[1], { tam: 44, alfa: M.clamp((t - k0) / 0.4) });
  }

  // ---------------- banderas con ojos ----------------
  function rasterBandera(img) { const w = 360, h = 240, c = M.lienzo(w, h); c.getContext("2d").drawImage(img, 0, 0, w, h); return c; }

  function bandera(c, a3, x, y, w, t, t0, { cara = "feliz", mira = null } = {}) {
    const src = G.banderas[a3]; if (!src) return;
    const u = M.u, h = w * (2 / 3);
    const pop = M.clamp((t - t0) / 0.45), esc = pop < 1 ? 1.18 * Math.sin((pop * Math.PI) / 2) - 0.18 * pop : 1;
    if (pop <= 0) return;
    const bob = Math.sin((t - t0) * 2.2) * 6 * u;
    c.save(); c.translate(x, y + bob); c.scale(esc, esc);
    // sombra y borde
    c.fillStyle = "rgba(0,0,0,0.28)"; c.beginPath(); c.roundRect(-w / 2 + 8 * u, -h / 2 + 12 * u, w, h, 16 * u); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.roundRect(-w / 2 - 7 * u, -h / 2 - 7 * u, w + 14 * u, h + 14 * u, 18 * u); c.fill();
    // tela ondeando: tiras verticales desplazadas
    c.save(); c.beginPath(); c.roundRect(-w / 2, -h / 2 - 12 * u, w, h + 24 * u, 12 * u); c.clip();
    const tiras = 36, tw = w / tiras;
    for (let k = 0; k < tiras; k++) {
      const off = Math.sin(t * 4 + k * 0.35) * 7 * u * (k / tiras);
      c.drawImage(src, (k / tiras) * src.width, 0, src.width / tiras + 1, src.height, -w / 2 + k * tw, -h / 2 + off, tw + 1, h);
      const luz = Math.sin(t * 4 + k * 0.35 + 1.2) * 0.08; c.fillStyle = luz > 0 ? `rgba(255,255,255,${luz})` : `rgba(0,0,0,${-luz})`; c.fillRect(-w / 2 + k * tw, -h / 2 + off, tw + 1, h);
    }
    c.restore();
    // cara
    let dx = 0, dy = 0;
    if (mira) { const d = Math.hypot(mira[0] - x, mira[1] - y) || 1; dx = ((mira[0] - x) / d) * w * 0.035; dy = ((mira[1] - y) / d) * w * 0.035; }
    const parp = ((t - t0 + a3.charCodeAt(0) * 0.37) % 3.1) > 2.95 ? 0.12 : 1;
    const ojos = [-w * 0.16, w * 0.16], ey = -h * 0.06, rx = w * 0.105, ry = w * 0.125;
    for (const ox of ojos) {
      c.save(); c.translate(ox, ey); c.scale(1, parp);
      c.fillStyle = "#fff"; c.strokeStyle = "#1b1b1b"; c.lineWidth = 4 * u; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = "#1b1b1b"; c.beginPath(); c.arc(dx, dy + (cara === "triste" ? 3 * u : 0), rx * 0.48, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(dx + rx * 0.16, dy - rx * 0.18, rx * 0.14, 0, 7); c.fill();
      c.restore();
    }
    c.strokeStyle = "#1b1b1b"; c.lineWidth = 6 * u; c.lineCap = "round";
    if (cara === "enojado" || cara === "triste") for (const [s, ox] of [[-1, ojos[0]], [1, ojos[1]]]) {
      const by = ey - ry * 1.3, sube = cara === "enojado" ? 1 : -1;
      c.beginPath(); c.moveTo(ox + s * rx * 0.9, by - sube * rx * 0.2); c.lineTo(ox - s * rx * 0.9, by + sube * rx * 0.3); c.stroke();
    }
    const my = h * 0.26;
    c.beginPath();
    if (cara === "feliz") c.arc(0, my - w * 0.05, w * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (cara === "triste") c.arc(0, my + w * 0.06, w * 0.08, 1.15 * Math.PI, 1.85 * Math.PI);
    else if (cara === "sorprendido") { c.ellipse(0, my, w * 0.04, w * 0.055, 0, 0, 7); }
    else { c.moveTo(-w * 0.07, my); c.lineTo(w * 0.07, my); }
    c.stroke();
    c.restore();
  }

  function dibujarBanderas(c, t, proj, i, te) {
    const lista = [].concat(M.guion.escenas[i].banderas || []);
    const posiciones = lista.map((b, j) => {
      const bb = typeof b === "string" ? { pais: b } : b;
      const o = buscar(bb.en || bb.pais);
      let p = o ? proj(o.punto) : null;
      const w = (bb.tam || (lista.length > 2 ? 0.26 : 0.32)) * Math.min(M.W, M.H);
      if (!p || bb.fija || p[0] < w * 0.6 || p[0] > M.W - w * 0.6 || p[1] < M.H * 0.18 || p[1] > M.H * 0.66) {
        // si el lugar no se ve, en fila arriba
        p = [M.W * ((j + 1) / (lista.length + 1)), M.H * (M.vertical ? 0.27 : 0.3)];
      } else p = [p[0], p[1] - w * 0.55];
      return { bb, p, w };
    });
    posiciones.forEach(({ bb, p, w }, j) => {
      const otro = posiciones[bb.mira != null ? lista.findIndex((x) => (x.pais || x) === bb.mira) : (j + 1) % posiciones.length];
      bandera(c, String(bb.pais).toUpperCase(), p[0], p[1], w, t, te.ini + 0.3 + j * 0.25, { cara: bb.cara || "feliz", mira: otro && otro !== posiciones[j] ? otro.p : null });
    });
  }

  function dibujarPegatinas(c, t, proj, i, te) {
    for (const [j, pg] of [].concat(M.guion.escenas[i].pegatinas || []).entries()) {
      const img = G.pegatinas[pg.imagen]; if (!img) continue;
      const o = buscar(pg.en); let p = o ? proj(o.punto) : [M.W * 0.5, M.H * 0.4]; if (!p) continue;
      const w = (pg.tam || 0.3) * Math.min(M.W, M.H), h = w * (img.height / img.width);
      const pop = M.clamp((t - te.ini - 0.3 - j * 0.2) / 0.4); if (pop <= 0) continue;
      const esc = 1.15 * Math.sin((pop * Math.PI) / 2) - 0.15 * pop, bob = Math.sin(t * 2 + j) * 6 * M.u;
      c.save(); c.translate(p[0], p[1] - h * 0.5 + bob); c.scale(esc, esc); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 20 * M.u;
      c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
    }
  }

  window.MAPA = { cargar, camaraEn, dibujarMapa, etiquetas, dibujarRuta, dibujarComparar, dibujarBanderas, dibujarPegatinas, cargarTeselas, dibujarTeselas, teselasNecesarias, look: () => look, LOOK: () => LOOK, textura: () => textura };
})();
