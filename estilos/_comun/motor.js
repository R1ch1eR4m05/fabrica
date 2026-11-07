// Motor común para las plantillas de estilo.
// Una plantilla solo tiene que llamar a Motor.iniciar({ fuentes, preparar, dibujar }).
// dibujar(ctx, t, M) debe depender SOLO de t (así el render es exacto y se puede repartir en hilos).
(function () {
  const q = new URLSearchParams(location.search);
  const M = {
    proyecto: null, guion: null, tiempos: null, W: 1080, H: 1920, u: 1, vertical: true,
    render: q.get("render") === "1",
  };

  // ---------- utilidades ----------
  M.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  M.lerp = (a, b, k) => a + (b - a) * k;
  M.suave = (x) => { x = M.clamp(x); return x * x * (3 - 2 * x); };
  M.salida = (x) => 1 - Math.pow(1 - M.clamp(x), 3);
  M.rango = (t, a, b) => M.clamp((t - a) / (b - a));
  M.rng = (semilla) => { let s = (semilla * 2654435761) >>> 0 || 1; return () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) / 4294967296); };
  M.hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  M.ruido1 = (x) => { const i = Math.floor(x), f = x - i; return M.lerp(M.hash(i), M.hash(i + 1), f * f * (3 - 2 * f)); };

  // texto en varias líneas que caben en un ancho
  M.lineas = (ctx, texto, ancho) => {
    const pal = texto.split(/\s+/).filter(Boolean); const out = []; let l = "";
    for (const p of pal) { const prueba = l ? l + " " + p : p; if (ctx.measureText(prueba).width > ancho && l) { out.push(l); l = p; } else l = prueba; }
    if (l) out.push(l); return out;
  };

  // ---------- tiempos ----------
  M.escenaEn = (t) => {
    const es = M.tiempos.escenas; let i = 0;
    for (let k = 0; k < es.length; k++) if (t >= es[k].ini) i = k;
    return i;
  };

  // reparte las palabras de una escena en frases cortas (subtítulos) y dice cuál toca
  M.frases = (palabras, max = 7) => {
    const out = []; let cur = [];
    for (const p of palabras) {
      cur.push(p);
      const corta = /[.,;:!?…]$/.test(p.w);
      if (cur.length >= max || (corta && cur.length >= 3)) { out.push(cur); cur = []; }
    }
    if (cur.length) out.push(cur);
    return out;
  };

  // tiempos estimados si todavía no hay voz (para la vista previa del guion)
  function estimar(guion) {
    let t = M.inicioVoz ?? 0.4; const escenas = [];
    for (const e of guion.escenas) {
      const pal = (e.voz ?? e.texto ?? "").split(/\s+/).filter(Boolean);
      const d = pal.length ? Math.max(1.2, pal.length / 2.6 + 0.3) : (e.duracion ?? 2.5);
      const paso = (d - 0.3) / Math.max(1, pal.length);
      escenas.push({ ini: t, finVoz: t + d, fin: t + d + 0.45, palabras: pal.map((w, j) => ({ w, t0: t + j * paso, t1: t + (j + 1) * paso })) });
      t += d + 0.45;
    }
    return { duracion: t + 2, prueba: true, estimado: true, escenas };
  }

  // ---------- texturas ----------
  M.lienzo = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  M.grano = (n = 6, tam = 384, fuerza = 1) => Array.from({ length: n }, (_, k) => {
    const c = M.lienzo(tam, tam), x = c.getContext("2d"), d = x.createImageData(tam, tam), r = M.rng(k + 7);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 * fuerza; }
    x.putImageData(d, 0, 0); return c;
  });

  // ---------- arranque ----------
  M.iniciar = async function ({ fuentes = [], preparar, dibujar }) {
    try {
      const id = q.get("p");
      const leer = async (f, op) => { const r = await fetch(`/proyectos/${encodeURIComponent(id)}/${f}?v=${Date.now()}`); if (!r.ok) { if (op) return null; throw new Error(`No encuentro ${f}`); } return r.json(); };
      M.proyecto = await leer("proyecto.json");
      M.guion = await leer("guion.json");
      M.tiempos = (await leer("tiempos.json", true)) || estimar(M.guion);
      if (M.tiempos.escenas.length !== M.guion.escenas.length) M.tiempos = estimar(M.guion); // el guion cambió después de la voz
      const fmt = q.get("f") || M.proyecto.formato;
      [M.W, M.H] = ({ "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] })[fmt] || [1080, 1920];
      M.vertical = M.H > M.W; M.u = Math.min(M.W, M.H) / 1080;
      M.duracion = M.tiempos.duracion;

      for (const [familia, url, opciones] of fuentes) { const f = new FontFace(familia, `url(${url})`, opciones || {}); await f.load(); document.fonts.add(f); }
      await document.fonts.ready;

      const lienzo = document.getElementById("lienzo") || document.body.appendChild(document.createElement("canvas"));
      lienzo.width = M.W; lienzo.height = M.H;
      const ctx = lienzo.getContext("2d");
      M.ctx = ctx; M.lienzoPrincipal = lienzo;
      if (preparar) await preparar(M);

      // dibujar puede ser normal o async (si necesita cargar el fotograma de un fondo de video)
      let fila = Promise.resolve();
      const pintar = (t) => (fila = fila.then(async () => {
        const tt = M.clamp(t, 0, M.duracion);
        if (M.antesDeDibujar) await M.antesDeDibujar(tt);
        ctx.save(); dibujar(ctx, tt, M); ctx.restore();
      }).catch((e) => console.error(e)));
      window.__duracion = M.duracion;
      window.__seek = (t) => { M.ultimoPedido = t; return pintar(t); };
      window.__frames = async (t0, n, dt, calidad) => {
        const out = [];
        for (let k = 0; k < n; k++) { await pintar(t0 + k * dt); out.push(lienzo.toDataURL("image/jpeg", calidad).split(",")[1]); }
        return out;
      };
      await pintar(Number(q.get("t") || 0.8));
      window.__listo = true;
    } catch (e) { console.error(e); window.__error = e.message; document.body.innerHTML = `<pre style="color:#f88;padding:20px">${e.message}</pre>`; }
  };

  window.Motor = M;
})();
