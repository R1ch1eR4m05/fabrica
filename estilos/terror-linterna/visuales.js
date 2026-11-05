// Fondos del estilo "Terror · Linterna". Cada uno dibuja la pantalla completa.
// Firma: (c, M, p, d, r, e)  c=contexto · p=segundos dentro del plano · d=duración del plano
//                            r=número fijo de 0 a 1 por plano · e=escena
(function () {
  const HUESO = "233,228,216";
  const FRIO = "170,190,225";

  function figura(c, x, piso, alto, color = "#000", alfa = 1) {
    // silueta de persona: cabeza, hombros y cuerpo
    c.save(); c.globalAlpha *= alfa; c.fillStyle = color;
    const cab = alto * 0.085, hom = alto * 0.19;
    const yc = piso - alto + cab;
    c.beginPath(); c.ellipse(x, yc, cab * 0.82, cab, 0, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(x - cab * 0.45, yc + cab * 0.8);
    c.quadraticCurveTo(x - hom, yc + cab * 1.3, x - hom * 1.02, yc + cab * 2.6);
    c.lineTo(x - hom * 0.8, piso); c.lineTo(x + hom * 0.8, piso);
    c.lineTo(x + hom * 1.02, yc + cab * 2.6);
    c.quadraticCurveTo(x + hom, yc + cab * 1.3, x + cab * 0.45, yc + cab * 0.8);
    c.closePath(); c.fill(); c.restore();
  }

  function luzRadial(c, x, y, rad, rgb, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  function base(c, M, color = "#050608") { c.fillStyle = color; c.fillRect(0, 0, M.W, M.H); }

  function pared(c, M, T, brillo = 0.5) {
    c.save(); c.globalAlpha = brillo;
    const k = Math.max(M.W / T.pared.width, M.H / T.pared.height);
    c.drawImage(T.pared, 0, 0, T.pared.width * k, T.pared.height * k); c.restore();
  }

  function parpadeo(M, t, semilla) { // luz que falla
    const n = M.ruido1(t * 9 + semilla * 50);
    return n > 0.82 ? 0.25 : 0.85 + 0.15 * M.ruido1(t * 3 + semilla);
  }

  const V = {};

  V.oscuridad = (c, M, p, d, r) => { base(c, M, "#030304"); luzRadial(c, M.W / 2, M.H * 0.45, Math.max(M.W, M.H) * 0.6, FRIO, 0.06); };

  V.linterna = (c, M, p, d, r, e, T) => {
    base(c, M, "#020203");
    const x = M.W * (0.5 + 0.26 * Math.sin(p * 0.42 + r * 6)), y = M.H * (0.46 + 0.1 * Math.sin(p * 0.29 + r * 3));
    const rad = Math.min(M.W, M.H) * 0.42 * (0.95 + 0.05 * M.ruido1(p * 4));
    c.save();
    c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.clip();
    pared(c, M, T, 0.9);
    // silueta fija que la luz descubre
    const fx = M.W * (0.3 + 0.4 * r), piso = M.H * (M.vertical ? 0.78 : 0.95);
    figura(c, fx, piso, M.H * (M.vertical ? 0.42 : 0.62), "#050505", 0.85 * M.rango(p, d * 0.35, d * 0.6));
    c.restore();
    const g = c.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    g.addColorStop(0, "rgba(255,244,215,0.18)"); g.addColorStop(0.7, "rgba(0,0,0,0.25)"); g.addColorStop(1, "rgba(0,0,0,1)");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad + 2, 0, Math.PI * 2); c.fill();
  };

  V.puerta = (c, M, p, d, r) => {
    base(c, M, "#040405");
    const w = M.vertical ? M.W * 0.5 : M.W * 0.22, h = M.vertical ? M.H * 0.5 : M.H * 0.7;
    const x = M.W / 2 - w / 2, y = M.vertical ? M.H * 0.22 : M.H * 0.12;
    c.strokeStyle = "rgba(120,120,120,0.35)"; c.lineWidth = 10 * M.u; c.strokeRect(x, y, w, h);
    const ab = M.suave(M.rango(p, 0.5, d * 0.9)) * w * 0.28 + w * 0.02; // abertura
    const g = c.createLinearGradient(x, 0, x + ab, 0);
    g.addColorStop(0, `rgba(${FRIO},0.9)`); g.addColorStop(1, `rgba(${FRIO},0.3)`);
    c.fillStyle = g; c.fillRect(x, y, ab, h);
    // luz en el piso
    c.fillStyle = `rgba(${FRIO},0.12)`;
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + ab, y + h); c.lineTo(x + ab * 3.4, M.H); c.lineTo(x - ab * 0.8, M.H); c.closePath(); c.fill();
    // algo asoma en la rendija
    if (p > d * 0.6) { const a = M.rango(p, d * 0.6, d * 0.8); c.fillStyle = `rgba(0,0,0,${0.9 * a})`; c.fillRect(x + ab * 0.35, y + h * 0.12, ab * 0.65, h * 0.88); luzRadial(c, x + ab * 0.65, y + h * 0.2, 14 * M.u, HUESO, 0.9 * a); }
    luzRadial(c, x + ab / 2, y + h / 2, h * 0.7, FRIO, 0.08);
  };

  V.pasillo = (c, M, p, d, r, e) => {
    base(c, M, "#030304");
    const cx = M.W / 2, cy = M.H * (M.vertical ? 0.42 : 0.45);
    const L = parpadeo(M, p, r);
    for (let k = 6; k >= 0; k--) {
      const s = Math.pow(0.62, k), w = M.W * 1.1 * s, h = M.H * (M.vertical ? 0.9 : 1.1) * s;
      c.strokeStyle = `rgba(${HUESO},${0.08 + 0.22 * (1 - k / 7) * L})`; c.lineWidth = 3 * M.u;
      c.strokeRect(cx - w / 2, cy - h / 2, w, h);
      if (k === 2) luzRadial(c, cx, cy - h / 2, w * 0.8, "255,236,200", 0.22 * L);
    }
    c.strokeStyle = `rgba(${HUESO},0.14)`;
    for (const [a, b] of [[0, 0], [M.W, 0], [0, M.H], [M.W, M.H]]) { c.beginPath(); c.moveTo(a, b); c.lineTo(cx, cy); c.stroke(); }
    const fondo = Math.pow(0.62, 6) * M.H;
    const crece = e.acercar === false ? 0 : M.suave(p / Math.max(d, 1));
    figura(c, cx, cy + fondo * (1.4 + 3 * crece), fondo * (2.2 + 6 * crece), "#000", 0.95);
  };

  V.ojos = (c, M, p, d, r, e) => {
    base(c, M, "#010101");
    const cx = M.W / 2 + Math.sin(p * 0.3) * 20 * M.u, cy = M.H * (M.vertical ? 0.4 : 0.42);
    const sep = 120 * M.u, tam = 40 * M.u;
    const ciclo = (p + r * 3) % 3.4, cierre = ciclo > 3.15 ? Math.sin((ciclo - 3.15) / 0.25 * Math.PI) : 0;
    const aparece = M.rango(p, 0.2, 1.4);
    const rgb = e.color === "rojo" ? "200,40,40" : "225,232,200";
    for (const s of [-1, 1]) {
      luzRadial(c, cx + s * sep, cy, tam * 4, rgb, 0.18 * aparece);
      c.save(); c.translate(cx + s * sep, cy); c.scale(1, Math.max(0.05, 0.42 * (1 - cierre)));
      c.fillStyle = `rgba(${rgb},${0.95 * aparece})`; c.beginPath(); c.arc(0, 0, tam, 0, Math.PI * 2); c.fill();
      c.fillStyle = `rgba(0,0,0,${0.9 * aparece})`; c.beginPath(); c.arc(s * -4 * M.u, 0, tam * 0.35, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  };

  V.ventana = (c, M, p, d, r) => {
    base(c, M, "#030406");
    const w = M.vertical ? M.W * 0.62 : M.W * 0.34, h = w * 1.25, x = M.W / 2 - w / 2, y = M.vertical ? M.H * 0.18 : M.H * 0.1;
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "rgba(60,75,110,0.9)"); g.addColorStop(1, "rgba(20,25,40,0.9)");
    c.fillStyle = g; c.fillRect(x, y, w, h);
    luzRadial(c, x + w * 0.7, y + h * 0.25, w * 0.25, "230,235,255", 0.5);
    figura(c, x + w * (0.3 + 0.3 * r), y + h * 1.05, h * 0.75, "#06070a", M.rango(p, d * 0.3, d * 0.65));
    c.fillStyle = "#050506"; const m = 16 * M.u;
    c.fillRect(x - m, y - m, w + 2 * m, m * 1.6); c.fillRect(x - m, y + h - m * 0.6, w + 2 * m, m * 1.6);
    c.fillRect(x - m, y, m * 1.6, h); c.fillRect(x + w - m * 0.6, y, m * 1.6, h);
    c.fillRect(x + w / 2 - m / 2, y, m, h); c.fillRect(x, y + h / 2 - m / 2, w, m);
    c.fillStyle = "rgba(90,105,150,0.10)";
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w, y + h); c.lineTo(x + w * 1.5, M.H); c.lineTo(x - w * 0.2, M.H); c.closePath(); c.fill();
  };

  V.reloj = (c, M, p, d, r, e) => {
    base(c, M, "#020202");
    const hora = e.hora || "3:00";
    const cx = M.W / 2, cy = M.H * (M.vertical ? 0.3 : 0.3), tam = (M.vertical ? 300 : 300) * M.u;
    c.font = `700 ${tam}px Oswald`; c.textAlign = "center"; c.textBaseline = "middle";
    const vis = Math.floor(p * 1.0) % 2 === 0 ? hora : hora.replace(":", " ");
    c.shadowColor = "rgba(230,30,30,0.9)"; c.shadowBlur = 60 * M.u;
    c.fillStyle = `rgba(235,45,40,${0.85 + 0.15 * M.ruido1(p * 7)})`; c.fillText(vis, cx, cy);
    c.shadowBlur = 0; c.font = `600 ${tam * 0.18}px Oswald`; c.fillStyle = "rgba(235,45,40,0.6)"; c.fillText("A.M.", cx, cy + tam * 0.62);
    luzRadial(c, cx, cy, tam * 2, "200,30,30", 0.12);
  };

  V.estatica = (c, M, p, d, r, e, T) => {
    base(c, M, "#030303");
    const w = M.vertical ? M.W * 0.78 : M.W * 0.46, h = w * 0.75, x = M.W / 2 - w / 2, y = M.H * (M.vertical ? 0.3 : 0.2);
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 40 * M.u); c.clip();
    const gr = T.grano[Math.floor(p * 24) % T.grano.length];
    c.imageSmoothingEnabled = false; c.globalAlpha = 0.85; c.drawImage(gr, x, y, w, h);
    c.globalAlpha = 1; c.imageSmoothingEnabled = true;
    const by = y + ((p * 0.35) % 1) * h; c.fillStyle = "rgba(255,255,255,0.08)"; c.fillRect(x, by, w, h * 0.08);
    c.restore();
    c.strokeStyle = "#151515"; c.lineWidth = 40 * M.u; c.beginPath(); c.roundRect(x - 20 * M.u, y - 20 * M.u, w + 40 * M.u, h + 40 * M.u, 50 * M.u); c.stroke();
    luzRadial(c, M.W / 2, y + h / 2, w, "200,210,230", 0.10);
  };

  V.escalera = (c, M, p, d, r) => {
    base(c, M, "#020203");
    const cx = M.W / 2, top = M.H * (M.vertical ? 0.2 : 0.12), L = parpadeo(M, p, r);
    for (let k = 0; k < 12; k++) {
      const s = Math.pow(0.84, k), w = M.W * 0.9 * s, y = top + (M.H * 0.9) * (1 - s) * 0.95;
      c.fillStyle = `rgba(${HUESO},${0.16 * s * L})`; c.fillRect(cx - w / 2, y, w, 8 * M.u * s + 2);
    }
    c.strokeStyle = `rgba(${HUESO},0.14)`; c.lineWidth = 6 * M.u;
    c.beginPath(); c.moveTo(cx + M.W * 0.42, top); c.lineTo(cx + M.W * 0.07, M.H * 0.9); c.stroke();
    const g = c.createLinearGradient(0, M.H * 0.4, 0, M.H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
    c.fillStyle = g; c.fillRect(0, 0, M.W, M.H);
    luzRadial(c, cx, top, M.W * 0.5, "255,236,200", 0.18 * L);
  };

  V.telefono = (c, M, p, d, r, e) => {
    base(c, M, "#020203");
    const vib = (p % 1.6) < 0.7 ? Math.sin(p * 90) * 6 * M.u : 0;
    const w = (M.vertical ? 420 : 300) * M.u, h = w * 2.05, x = M.W / 2 - w / 2 + vib, y = M.H * (M.vertical ? 0.2 : 0.1);
    luzRadial(c, x + w / 2, y + h / 2, h * 0.9, "180,200,255", 0.16);
    c.fillStyle = "#0d0d0f"; c.beginPath(); c.roundRect(x, y, w, h, 50 * M.u); c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#1b2233"); g.addColorStop(1, "#0b0e16");
    c.fillStyle = g; c.beginPath(); c.roundRect(x + 14 * M.u, y + 14 * M.u, w - 28 * M.u, h - 28 * M.u, 40 * M.u); c.fill();
    c.textAlign = "center"; c.fillStyle = `rgba(${HUESO},0.9)`;
    c.font = `600 ${w * 0.075}px Oswald`; c.fillText(e.quien || "Número desconocido", x + w / 2, y + h * 0.3);
    c.font = `400 ${w * 0.055}px Oswald`; c.fillStyle = `rgba(${HUESO},0.55)`; c.fillText(e.hora || "3:00 a. m.", x + w / 2, y + h * 0.37);
    for (const [k, col] of [[0.3, "#b3261e"], [0.7, "#2e7d32"]]) { c.fillStyle = col; c.beginPath(); c.arc(x + w * k, y + h * 0.82, w * 0.09, 0, Math.PI * 2); c.fill(); }
  };

  V.bosque = (c, M, p, d, r, e, T) => {
    base(c, M, "#03050a");
    luzRadial(c, M.W * 0.7, M.H * 0.12, M.W * 0.5, "160,180,220", 0.25);
    const rr = M.rng(Math.floor(r * 1000) + 3);
    const capas = [[0.35, 0.25, 10], [0.6, 0.55, 8], [1, 1, 6]];
    for (const [prof, osc, n] of capas) {
      for (let k = 0; k < n; k++) {
        const ancho = (20 + rr() * 50) * M.u * prof * 2;
        const x = ((rr() * 1.4 - 0.2) * M.W + p * 18 * M.u * prof) % (M.W * 1.3) - M.W * 0.1;
        c.fillStyle = `rgba(${Math.round(8 + 30 * (1 - osc))},${Math.round(10 + 34 * (1 - osc))},${Math.round(16 + 44 * (1 - osc))},1)`;
        c.fillRect(x, 0, ancho, M.H);
      }
      if (prof === 0.6) figura(c, M.W * (0.35 + 0.3 * r), M.H * 0.82, M.H * 0.3, "#04060a", M.rango(p, d * 0.4, d * 0.7));
      c.save(); c.globalAlpha = 0.25 * prof; const fx = (p * 30 * M.u * prof) % T.niebla.width;
      c.drawImage(T.niebla, -fx, M.H * 0.5, M.W * 2, M.H * 0.6); c.restore();
    }
  };

  V.cama = (c, M, p, d, r) => {
    base(c, M, "#030305");
    luzRadial(c, M.W * 0.2, M.H * 0.2, M.W * 0.8, "120,140,190", 0.12);
    const w = M.vertical ? M.W * 0.86 : M.W * 0.6, x = M.W / 2 - w / 2, y = M.H * (M.vertical ? 0.5 : 0.48), h = w * 0.14;
    luzRadial(c, M.W / 2, y, w * 0.8, "120,140,190", 0.12);
    c.fillStyle = "#22252f"; c.fillRect(x, y, w, h);                       // colchón
    c.fillStyle = "#2d3142"; c.beginPath(); c.moveTo(x + w * 0.25, y); c.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y); c.lineTo(x + w, y + h * 0.4); c.lineTo(x + w * 0.25, y + h * 0.4); c.fill(); // cobija
    c.fillStyle = "#101118"; c.fillRect(x - 20 * M.u, y - h * 1.6, 30 * M.u, h * 3.6);  // cabecera
    c.fillStyle = "#000"; c.fillRect(x, y + h, w, h * 1.6);                 // debajo
    c.fillStyle = "#101118"; c.fillRect(x, y + h * 2.6, 24 * M.u, 10 * M.u); c.fillRect(x + w - 24 * M.u, y + h * 2.6, 24 * M.u, 10 * M.u);
    const a = M.rango(p, d * 0.45, d * 0.65);
    for (const s of [-1, 1]) luzRadial(c, x + w * 0.55 + s * 26 * M.u, y + h * 1.8, 10 * M.u, "230,230,210", 0.95 * a);
  };

  V.espejo = (c, M, p, d, r) => {
    base(c, M, "#030304");
    const cx = M.W / 2, cy = M.H * (M.vertical ? 0.4 : 0.45), rx = M.vertical ? M.W * 0.3 : M.H * 0.25, ry = rx * 1.4;
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    const g = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry); g.addColorStop(0, "#2a2e38"); g.addColorStop(1, "#0d0e12");
    c.fillStyle = g; c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    figura(c, cx + rx * 0.15 * Math.sin(p * 0.2), cy + ry, ry * 1.5, "#050507", 0.8);
    const a = M.rango(p, d * 0.5, d * 0.75); // otra figura detrás
    figura(c, cx - rx * 0.45, cy + ry * 0.95, ry * 1.25, "#000", 0.95 * a);
    c.fillStyle = "rgba(255,255,255,0.05)"; c.fillRect(cx - rx, cy - ry, rx * 0.5, ry * 2);
    c.restore();
    c.strokeStyle = "#2b2420"; c.lineWidth = 26 * M.u; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  };

  V.imagen = (c, M, p, d, r, e, T) => {
    base(c, M, "#000");
    const img = T.imagenes[e.imagen]; if (!img) return;
    const k = Math.max(M.W / img.width, M.H / img.height) * (1.06 + 0.06 * M.suave(p / Math.max(d, 1)));
    const w = img.width * k, h = img.height * k;
    c.save(); c.filter = e.filtro || "grayscale(0.65) contrast(1.25) brightness(0.62)";
    c.drawImage(img, (M.W - w) / 2 + Math.sin(p * 0.2 + r) * 20 * M.u, (M.H - h) / 2, w, h); c.restore();
  };

  window.VISUALES = V;
  window.figuraSilueta = figura;
})();
