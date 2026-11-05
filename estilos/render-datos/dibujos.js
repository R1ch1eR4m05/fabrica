// Dibujos animados de Levania (vectoriales, hechos en canvas, propios). Cada dibujo vive en una caja de 200×200
// centrada en (0,0). dibujar(c, nombre, x, y, tam, t, k, C): t = segundos (para que se mueva solo), k = 0..1 (entrada).
(function () {
  const PI = Math.PI;
  const piel = "#E9B99A", pelo = "#4A3530", pelo2 = "#6B4A3F";
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 2 * PI); };
  const linea = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
  const trazo = (c, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); };

  function persona(c, t, { alto = 1, vestido, cabello = "corto", brazo = 0, ojos = "abiertos", C }) {
    c.save(); c.scale(alto, alto);
    // cuerpo
    c.fillStyle = vestido; rr(c, -34, -10, 68, 90, 30); c.fill();
    // brazos
    c.strokeStyle = vestido; c.lineWidth = 16; c.lineCap = "round";
    linea(c, [[-30, 6], [-52, 40]]); c.stroke();
    c.save(); c.translate(30, 6); c.rotate(-0.4 - brazo); linea(c, [[0, 0], [0, 42]]); c.stroke(); circ(c, 0, 46, 9); c.fillStyle = piel; c.fill(); c.restore();
    // cabeza
    circ(c, 0, -42, 34); c.fillStyle = piel; c.fill();
    c.fillStyle = pelo;
    if (cabello === "chongo") { circ(c, 0, -84, 16); c.fill(); c.beginPath(); c.arc(0, -46, 36, PI * 1.02, PI * 1.98); c.fill(); }
    else if (cabello === "largo") { c.beginPath(); c.arc(0, -46, 37, PI * 0.9, PI * 2.1); c.lineTo(36, 0); c.lineTo(-36, 0); c.closePath(); c.fill(); circ(c, 0, -42, 30); c.fillStyle = piel; c.fill(); c.fillStyle = pelo; c.beginPath(); c.arc(0, -50, 32, PI * 1.05, PI * 1.95); c.fill(); }
    else { c.beginPath(); c.arc(0, -48, 35, PI * 1.0, PI * 2.0); c.fill(); }
    // cara
    c.strokeStyle = "#3D3230"; c.lineWidth = 4; c.lineCap = "round";
    if (ojos === "dormido") { c.beginPath(); c.arc(-12, -40, 6, 0.1 * PI, 0.9 * PI); c.stroke(); c.beginPath(); c.arc(12, -40, 6, 0.1 * PI, 0.9 * PI); c.stroke(); }
    else { const parp = Math.sin(t * 2.3) > 0.97 ? 0.2 : 1; c.save(); c.translate(-12, -42); c.scale(1, parp); circ(c, 0, 0, 4); c.fillStyle = "#3D3230"; c.fill(); c.restore(); c.save(); c.translate(12, -42); c.scale(1, parp); circ(c, 0, 0, 4); c.fill(); c.restore(); }
    c.beginPath(); c.arc(0, -28, 9, 0.15 * PI, 0.85 * PI); c.stroke();
    circ(c, -22, -30, 5); c.fillStyle = "rgba(232,160,149,.6)"; c.fill(); circ(c, 22, -30, 5); c.fill();
    c.restore();
  }

  function corazonPath(c, s) { c.beginPath(); c.moveTo(0, 30 * s); c.bezierCurveTo(-60 * s, -10 * s, -30 * s, -60 * s, 0, -28 * s); c.bezierCurveTo(30 * s, -60 * s, 60 * s, -10 * s, 0, 30 * s); }

  const D = {
    luna(c, t, k, C) {
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, r = 70 + (i % 3) * 18, x = Math.cos(a) * r * 1.2, y = Math.sin(a) * r - 10, b = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        c.save(); c.translate(x, y); c.rotate(t * 0.5 + i); c.globalAlpha *= 0.4 + 0.6 * b; estrella(c, 6 + (i % 2) * 4, C.texto); c.restore(); }
      c.save(); c.rotate(Math.sin(t * 0.8) * 0.06);
      c.save(); c.beginPath(); c.rect(-200, -200, 400, 400); c.arc(30, -18, 56, 0, 2 * PI); c.clip("evenodd"); // media luna: todo menos el círculo de la sombra
      circ(c, 0, 0, 62); c.fillStyle = "#F6EEE4"; c.fill();
      c.fillStyle = "rgba(196,131,122,.35)"; circ(c, -30, 16, 8); c.fill(); circ(c, -20, 40, 5); c.fill(); c.restore();
      c.restore();
    },
    sol(c, t, k, C) {
      c.save(); c.rotate(t * 0.6);
      for (let i = 0; i < 12; i++) { c.save(); c.rotate((i * PI) / 6); rr(c, -6, -96, 12, 26 + 6 * Math.sin(t * 4 + i), 6); c.fillStyle = "#F2C46D"; c.fill(); c.restore(); }
      c.restore(); circ(c, 0, 0, 56); c.fillStyle = "#F2C46D"; c.fill(); circ(c, 0, 0, 44); c.fillStyle = "#F7D58C"; c.fill();
    },
    telefono(c, t, k, C) {
      c.save(); c.rotate(Math.sin(t * 1.6) * 0.06);
      rr(c, -52, -92, 104, 184, 20); c.fillStyle = "#1c1513"; c.fill();
      const g = c.createLinearGradient(0, -80, 0, 80); g.addColorStop(0, C.rosa); g.addColorStop(1, "#7a5a8f");
      rr(c, -44, -80, 88, 156, 12); c.fillStyle = g; c.fill();
      // publicaciones que pasan (scroll infinito)
      c.save(); rr(c, -44, -80, 88, 156, 12); c.clip();
      const off = (t * 60) % 52;
      for (let i = -1; i < 4; i++) { const y = -76 + i * 52 + off; rr(c, -36, y, 72, 40, 8); c.fillStyle = "rgba(255,255,255,.28)"; c.fill(); circ(c, -24, y + 12, 6); c.fillStyle = "rgba(255,255,255,.6)"; c.fill(); }
      c.restore(); c.restore();
      // corazones y notificaciones saliendo
      for (let i = 0; i < 3; i++) { const f = ((t * 0.9 + i / 3) % 1); c.save(); c.translate(60 + i * 8, 40 - f * 120); c.globalAlpha *= 1 - f; c.fillStyle = C.rosa; corazonPath(c, 0.32); c.fill(); c.restore(); }
      const n = (t * 0.7) % 1; if (n < 0.6) { c.save(); c.translate(-62, -70); c.scale(ease(n * 4), ease(n * 4)); circ(c, 0, 0, 16); c.fillStyle = "#E0473F"; c.fill(); c.fillStyle = "#fff"; c.font = "700 18px Jost"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(3 + Math.floor(t * 0.7) % 7), 0, 1); c.restore(); }
    },
    cama(c, t, k, C) {
      rr(c, -96, 10, 192, 46, 10); c.fillStyle = "#6f8a6b"; c.fill();
      rr(c, -100, -40, 18, 110, 8); c.fill(); rr(c, 82, -10, 18, 80, 8); c.fill();
      rr(c, -80, -16, 54, 28, 14); c.fillStyle = "#F6EEE4"; c.fill();
      c.save(); c.translate(-52, -22); c.scale(0.55, 0.55); persona(c, t, { vestido: "transparent", ojos: "dormido", C }); c.restore();
      const resp = 1 + 0.03 * Math.sin(t * 2);
      c.save(); c.translate(20, 6); c.scale(1, resp); rr(c, -76, -22, 156, 44, 20); c.fillStyle = C.rosa; c.fill(); c.restore();
      for (let i = 0; i < 3; i++) { const f = (t * 0.5 + i / 3) % 1; c.save(); c.translate(-20 + f * 60, -50 - f * 70); c.globalAlpha *= Math.sin(f * PI); c.fillStyle = C.texto; c.font = `600 ${22 + i * 8}px Cormorant`; c.fillText("z", 0, 0); c.restore(); }
    },
    nino(c, t, k, C) { c.translate(0, 30 + Math.abs(Math.sin(t * 3)) * -8); persona(c, t, { alto: 0.95, vestido: "#8FA58A", brazo: 0.6 + 0.6 * Math.sin(t * 6), C }); },
    nina(c, t, k, C) { c.translate(0, 30 + Math.abs(Math.sin(t * 3)) * -8); persona(c, t, { alto: 0.95, vestido: C.rosa, cabello: "largo", brazo: 0.6 + 0.6 * Math.sin(t * 6), C }); },
    mama(c, t, k, C) { c.translate(0, 18); persona(c, t, { alto: 1.12, vestido: C.rosa, cabello: "chongo", brazo: 0.2 + 0.2 * Math.sin(t * 2), C }); },
    abrazo(c, t, k, C) {
      c.save(); c.translate(-30, 22); persona(c, t, { alto: 1.08, vestido: C.rosa, cabello: "chongo", brazo: 1.3, C }); c.restore();
      c.save(); c.translate(38, 46); persona(c, t, { alto: 0.72, vestido: "#8FA58A", brazo: 1.1, C }); c.restore();
      const s = 0.55 + 0.07 * Math.sin(t * 6); c.save(); c.translate(0, -100); c.fillStyle = C.rosa; corazonPath(c, s); c.fill(); c.restore();
    },
    reloj(c, t, k, C) {
      circ(c, 0, 0, 82); c.fillStyle = "#F6EEE4"; c.fill(); c.lineWidth = 10; c.strokeStyle = C.rosa; c.stroke();
      for (let i = 0; i < 12; i++) { c.save(); c.rotate((i * PI) / 6); rr(c, -3, -72, 6, i % 3 ? 8 : 14, 3); c.fillStyle = "#3D3230"; c.fill(); c.restore(); }
      c.save(); c.rotate(t * 0.5); rr(c, -5, -44, 10, 50, 5); c.fillStyle = "#3D3230"; c.fill(); c.restore();
      c.save(); c.rotate(t * 6); rr(c, -3, -64, 6, 70, 3); c.fillStyle = C.rosa; c.fill(); c.restore();
      circ(c, 0, 0, 8); c.fillStyle = "#3D3230"; c.fill();
    },
    alarma(c, t, k, C) {
      c.save(); c.rotate(Math.sin(t * 38) * 0.09);
      for (const s of [-1, 1]) { c.save(); c.translate(s * 46, -66); c.rotate(s * 0.5); c.beginPath(); c.arc(0, 0, 26, PI, 2 * PI); c.fillStyle = C.rosa; c.fill(); c.restore(); }
      D.reloj(c, t * 3, k, C); c.restore();
      c.strokeStyle = C.texto; c.lineWidth = 5; c.lineCap = "round";
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.5; c.beginPath(); c.moveTo(s * (100 + 4 * Math.sin(t * 20)), a * 40); c.lineTo(s * (124 + 4 * Math.sin(t * 20)), a * 50); c.stroke(); }
    },
    corazon(c, t, k, C) { const s = 2.2 * (1 + 0.08 * Math.max(0, Math.sin(t * 7)) + 0.05 * Math.max(0, Math.sin(t * 7 + 0.9))); c.translate(0, 10); c.fillStyle = C.rosa; corazonPath(c, s); c.fill(); c.globalAlpha *= 0.5; c.fillStyle = "#fff"; circ(c, -30, -36, 10); c.fill(); },
    libro(c, t, k, C) {
      c.fillStyle = "#6f8a6b"; rr(c, -96, -54, 192, 118, 10); c.fill();
      c.fillStyle = "#F6EEE4"; rr(c, -88, -62, 86, 116, 6); c.fill(); rr(c, 2, -62, 86, 116, 6); c.fill();
      c.strokeStyle = "rgba(61,50,48,.3)"; c.lineWidth = 3; for (let i = 0; i < 5; i++) { linea(c, [[-76, -40 + i * 18], [-16, -40 + i * 18]]); c.stroke(); linea(c, [[14, -40 + i * 18], [74, -40 + i * 18]]); c.stroke(); }
      const f = (t * 0.6) % 1, sx = Math.cos(f * PI); c.save(); c.translate(0, 0); c.scale(sx, 1); c.fillStyle = sx > 0 ? "#fffaf4" : "#efe3d6"; rr(c, 0, -62, 86, 116, 6); c.fill(); c.restore();
      for (let i = 0; i < 3; i++) { const b = (t * 0.8 + i / 3) % 1; c.save(); c.translate(-40 + i * 40, -70 - b * 60); c.globalAlpha *= Math.sin(b * PI); estrella(c, 8, "#F2C46D"); c.restore(); }
    },
    cerebro(c, t, k, C) {
      c.fillStyle = C.rosa; for (const [x, y, r] of [[-34, -16, 40], [8, -34, 42], [40, 0, 36], [-12, 22, 38], [24, 30, 30]]) { circ(c, x, y, r); c.fill(); }
      c.strokeStyle = "rgba(61,50,48,.35)"; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -60); c.bezierCurveTo(-20, -20, 20, 10, 0, 56); c.stroke();
      for (let i = 0; i < 5; i++) { const a = t * 1.5 + i * 1.26, b = 0.5 + 0.5 * Math.sin(t * 4 + i); c.save(); c.translate(Math.cos(a) * 96, Math.sin(a) * 76); c.globalAlpha *= b; estrella(c, 9, "#F2C46D"); c.restore(); }
    },
    bateria(c, t, k, C) {
      rr(c, -70, -40, 132, 80, 14); c.lineWidth = 10; c.strokeStyle = C.texto; c.stroke(); rr(c, 66, -16, 14, 32, 5); c.fillStyle = C.texto; c.fill();
      const nivel = 0.15 + 0.7 * (0.5 + 0.5 * Math.cos(t * 1.2)); rr(c, -60, -30, 112 * nivel, 60, 8); c.fillStyle = nivel < 0.35 ? "#E0473F" : "#8FA58A"; c.fill();
      c.fillStyle = "#F2C46D"; linea(c, [[-6, -54], [-22, 6], [-2, 6], [-14, 60], [26, -12], [4, -12], [16, -54]]); c.closePath(); c.globalAlpha *= 0.85; c.fill();
    },
    casa(c, t, k, C) {
      c.fillStyle = "#F6EEE4"; rr(c, -70, -20, 140, 100, 8); c.fill();
      c.fillStyle = C.rosa; linea(c, [[-90, -16], [0, -96], [90, -16]]); c.closePath(); c.fill();
      c.fillStyle = "#6f8a6b"; rr(c, -18, 26, 36, 54, 6); c.fill();
      const luz = 0.6 + 0.4 * Math.sin(t * 3); c.fillStyle = `rgba(242,196,109,${luz})`; rr(c, -56, 0, 30, 30, 4); c.fill(); rr(c, 26, 0, 30, 30, 4); c.fill();
      c.fillStyle = "rgba(246,238,228,.5)"; for (let i = 0; i < 3; i++) { const f = (t * 0.5 + i / 3) % 1; circ(c, 52 + f * 20, -80 - f * 60, 8 + f * 10); c.globalAlpha *= 1; c.fill(); }
    },
    escuela(c, t, k, C) {
      c.fillStyle = "#F6EEE4"; rr(c, -90, -30, 180, 110, 6); c.fill(); c.fillStyle = C.rosa; linea(c, [[-100, -26], [0, -80], [100, -26]]); c.closePath(); c.fill();
      c.fillStyle = "#8FA58A"; for (let i = 0; i < 3; i++) { rr(c, -70 + i * 50, -6, 32, 30, 4); c.fill(); } rr(c, -16, 34, 32, 46, 4); c.fill();
      c.strokeStyle = C.texto; c.lineWidth = 5; linea(c, [[0, -80], [0, -136]]); c.stroke();
      c.fillStyle = "#E0473F"; c.beginPath(); c.moveTo(0, -136); for (let i = 0; i <= 10; i++) c.lineTo(i * 5, -136 + 8 + Math.sin(t * 6 + i * 0.6) * 4 - (i === 10 ? 0 : 0)); for (let i = 10; i >= 0; i--) c.lineTo(i * 5, -112 + Math.sin(t * 6 + i * 0.6) * 4); c.closePath(); c.fill();
    },
    plato(c, t, k, C) {
      c.fillStyle = "#F6EEE4"; c.beginPath(); c.ellipse(0, 30, 96, 30, 0, 0, 2 * PI); c.fill(); c.fillStyle = "#e9dccd"; c.beginPath(); c.ellipse(0, 26, 70, 20, 0, 0, 2 * PI); c.fill();
      c.fillStyle = "#8FA58A"; circ(c, -26, 14, 18); c.fill(); c.fillStyle = "#F2C46D"; circ(c, 10, 10, 16); c.fill(); c.fillStyle = C.rosa; circ(c, 34, 18, 14); c.fill();
      c.strokeStyle = "rgba(246,238,228,.6)"; c.lineWidth = 5; for (let i = 0; i < 3; i++) { const o = Math.sin(t * 2 + i) * 8; c.beginPath(); c.moveTo(-30 + i * 30, -10); c.bezierCurveTo(-40 + i * 30 + o, -40, -20 + i * 30 - o, -60, -30 + i * 30, -90); c.stroke(); }
    },
    tele(c, t, k, C) {
      rr(c, -96, -66, 192, 124, 16); c.fillStyle = "#1c1513"; c.fill();
      const v = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5); c.fillStyle = `rgba(143,165,138,${v})`; rr(c, -84, -54, 168, 100, 10); c.fill();
      c.fillStyle = "rgba(255,255,255,.35)"; for (let i = 0; i < 4; i++) rr(c, -76, -46 + ((t * 80 + i * 26) % 100), 152, 6, 3), c.fill();
      c.strokeStyle = "#1c1513"; c.lineWidth = 8; linea(c, [[-40, 60], [-56, 86]]); c.stroke(); linea(c, [[40, 60], [56, 86]]); c.stroke();
    },
    nube(c, t, k, C) {
      c.translate(Math.sin(t * 0.8) * 14, 0); c.fillStyle = "#F6EEE4";
      for (const [x, y, r] of [[-50, 0, 34], [-10, -22, 44], [36, -6, 36], [0, 14, 34]]) { circ(c, x, y, r); c.fill(); }
      c.fillStyle = "#8FA58A"; for (let i = 0; i < 5; i++) { const f = (t * 1.4 + i / 5) % 1; rr(c, -48 + i * 24, 40 + f * 60, 6, 16, 3); c.globalAlpha *= 1; c.fill(); }
    },
    check(c, t, k, C) { circ(c, 0, 0, 84); c.fillStyle = "#8FA58A"; c.fill(); const f = ease((k - 0.3) / 0.7); c.setLineDash([200 * f, 400]); linea(c, [[-40, 2], [-10, 32], [44, -28]]); trazo(c, "#fff", 20); c.setLineDash([]); },
    tache(c, t, k, C) { circ(c, 0, 0, 84); c.fillStyle = "#E0473F"; c.fill(); const f = ease((k - 0.3) / 0.7); c.setLineDash([120 * f, 400]); linea(c, [[-34, -34], [34, 34]]); trazo(c, "#fff", 20); linea(c, [[34, -34], [-34, 34]]); trazo(c, "#fff", 20); c.setLineDash([]); },
    calendario(c, t, k, C) {
      rr(c, -80, -76, 160, 152, 16); c.fillStyle = "#F6EEE4"; c.fill(); rr(c, -80, -76, 160, 40, 16); c.fillStyle = C.rosa; c.fill();
      const hoy = Math.floor(t * 2.5) % 9;
      for (let i = 0; i < 9; i++) { const x = -50 + (i % 3) * 50, y = -10 + Math.floor(i / 3) * 34; rr(c, x - 14, y - 12, 28, 24, 5); c.fillStyle = i === hoy ? "#8FA58A" : "#e9dccd"; c.fill();
        if (i < hoy) { c.strokeStyle = C.rosa; c.lineWidth = 4; linea(c, [[x - 9, y - 7], [x + 9, y + 7]]); c.stroke(); } }
    },
    lupa(c, t, k, C) { c.save(); c.translate(Math.sin(t * 1.5) * 18, Math.cos(t * 1.2) * 10); circ(c, -12, -12, 52); c.fillStyle = "rgba(246,238,228,.2)"; c.fill(); c.lineWidth = 14; c.strokeStyle = C.texto; c.stroke(); linea(c, [[26, 26], [70, 70]]); trazo(c, C.rosa, 20); c.restore(); },
    estrellas(c, t, k, C) { for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 20 + i * 9; c.save(); c.translate(Math.cos(a) * r, Math.sin(a) * r * 0.8); c.rotate(t + i); c.globalAlpha *= 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + i)); estrella(c, 8 + (i % 3) * 5, i % 2 ? "#F2C46D" : C.texto); c.restore(); } },
  };
  D.abrazar = D.abrazo; D.hijo = D.nino; D.hija = D.nina; D.pantalla = D.telefono; D.celular = D.telefono; D.dormir = D.cama; D.noche = D.luna; D.manana = D.sol;

  function estrella(c, r, col) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * PI) / 5 - PI / 2, rad = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); c.fillStyle = col; c.fill(); }

  // qué dibujo le toca a un texto si el guion no dice
  const PALABRAS = [
    [/pantall|celular|tablet|telefon|redes|scroll|video/, "telefono"], [/tele\b|televis|caricatur/, "tele"], [/dorm|sueñ|suen|cama|acost/, "cama"],
    [/noche|luna|oscur/, "luna"], [/despert|alarma|madrug/, "alarma"], [/mañana|manana|sol\b|amanec/, "sol"], [/hora|minut|tiempo|reloj/, "reloj"],
    [/abraz|amor|cariñ|carin|beso|apapach/, "abrazo"], [/escuel|tarea|maestr|clase/, "escuela"], [/comid|cena|desayun|come\b|plato/, "plato"],
    [/libro|cuento|leer|lectur/, "libro"], [/cerebr|memoria|atenci|aprend|concentr|piens/, "cerebro"], [/energ|cansad|agotad|pila/, "bateria"],
    [/casa|hogar/, "casa"], [/calm|tranquil|respir|paz/, "nube"], [/semana|dias|días|rutina|diario/, "calendario"], [/estudi|dato|investig|ciencia/, "lupa"],
    [/mamá|mama|madre/, "mama"], [/hij|niñ|nin|peque/, "nino"], [/coraz|sentir|emoci/, "corazon"],
  ];
  function auto(texto) { const s = String(texto || "").toLowerCase(); for (const [re, n] of PALABRAS) if (re.test(s)) return n; return null; }

  function dibujar(c, nombre, x, y, tam, t, k, C) {
    const f = D[nombre]; if (!f || k <= 0) return;
    const e = ease(k), sal = k < 1 ? 1 + 0.18 * Math.sin(Math.min(1, k) * PI) : 1;
    c.save(); c.translate(x, y + (1 - e) * tam * 0.25 + Math.sin(t * 1.7) * tam * 0.015); c.scale((tam / 200) * e * sal, (tam / 200) * e * sal);
    c.globalAlpha *= Math.min(1, k * 3);
    c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 18; c.shadowOffsetY = 8;
    f(c, t, k, C);
    c.restore();
  }

  window.Dibujos = { dibujar, auto, lista: Object.keys(D) };
})();
