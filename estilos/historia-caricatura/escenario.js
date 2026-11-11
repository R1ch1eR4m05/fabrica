// Historia · Caricatura: el mundo 3D de cada escena, armado desde el guion (sin código por video).
// Personajes planos con contorno en un mundo 3D pintado, con tinta, desenfoque y color del kit de LuisPa / Mr omi
// (lib/caricatura.js, MIT: ver kit/LICENSE-kit.txt). Este archivo es propio de la fábrica.
// Regla de oro: todo depende solo de t (misma t → mismo fotograma).
import {
  THREE, EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction,
  Pen, bodyFront, SKINS, fxShadow, fxContact,
  Pool, Actor, Fx, tier, light2D, blob, BODY,
  TONE, CHAR, twoTone, untone, LIGHTS, LOOK,
  grassHD, cloudHD, stoneHD, cobbleHD, roofHD, planksHD, rep, ctex, CLOUD_DAY, CLOUD_GOLD,
  NOINK, InkPass, noInkFallback, LensBlur, GradeEffect, GRADES, gradeFor, Crowd, atlas,
} from "./lib/caricatura.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hh = (i, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoother = (x) => { const u = clamp01(x); return u * u * u * (u * (6 * u - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const lam = (p) => twoTone(new THREE.MeshLambertMaterial(p));

// ---------------- luces ----------------
const NOCHE = {
  ...LIGHTS.golden, az: 40, el: 30, lit: [0.36, 0.42, 0.72], shade: [0.07, 0.08, 0.18], lift: [0.02, 0.03, 0.08],
  charTint: [0.78, 0.82, 1.0], fog: "#1f2742", sunCol: "#a8b8ff", sunI: 2.0, sky: "#4a5a8a", ground: "#2a2a3a", actorShadow: false,
};
const NOCHE_LOOK = { ...LOOK.golden, sky: { c: ["#3b4670", "#2f3a62", "#222b4e", "#18203c", "#0e1428"], e: [0, 4, 10, 20, 40] }, sat: 0.9, cloud: { lit: "#6f7aa8", mid: "#4c5684", shade: "#323a62" } };
const TORMENTA = { ...LIGHTS.day, el: 40, lit: [1.0, 1.0, 1.08], shade: [0.26, 0.27, 0.36], fog: "#8f98a8", sunCol: "#dde4f0", sunI: 2.0 };
const TORMENTA_LOOK = { ...LOOK.day, sky: { c: ["#9aa3b2", "#8d97a8", "#7a8496", "#646e82", "#4b5468"], e: [0, 3, 8, 16, 40] }, sat: 0.85, cloud: { lit: "#c9ced8", mid: "#9ea6b6", shade: "#6c7488" } };
export const LUCES = {
  dia: { L: LIGHTS.day, K: LOOK.day, grade: "day", nubes: CLOUD_DAY },
  atardecer: { L: { ...LIGHTS.golden, el: 14 }, K: LOOK.golden, grade: "golden", nubes: CLOUD_GOLD },
  noche: { L: NOCHE, K: NOCHE_LOOK, grade: "golden", nubes: NOCHE_LOOK.cloud },
  nublado: { L: TORMENTA, K: TORMENTA_LOOK, grade: "day", nubes: TORMENTA_LOOK.cloud },
};

// ---------------- reparto: del guion (español) al vestuario del kit ----------------
const SOMBRERO = { pelo: "hair", corona: "crown", casco: "greek", "casco-dorado": "greek_gold", persa: "persian", gorra: "cap", sombrero: "tophat", cofia: "bonnet", ninguno: null };
const CUERPO = { adulto: "adult", robusto: "stout", "niño": "kid", nino: "kid" };
export function vestuario(r = {}) {
  const o = {
    jacket: r.ropa || "#c9b48a", pants: r.pantalon || r.ropa || "#7a5a3a", boots: r.botas || "#5a3b2a",
    hat: r.sombrero in SOMBRERO ? SOMBRERO[r.sombrero] : "hair", hair: r.pelo || "#4a3426",
    skin: typeof r.piel === "number" ? SKINS[r.piel % SKINS.length] : r.piel || SKINS[0],
    build: CUERPO[r.cuerpo] || "adult",
  };
  if (r.capa) o.cape = r.capa;
  if (r.barba) o.beard = r.barba;
  if (r.bigote) o.moustache = r.bigote;
  o.buttons = r.botones || "ninguno"; // sin botones salvo que se pidan
  if (r.toga) o.toga = r.toga;
  if (r.faja) o.sash = r.faja;
  if (r.gorro) o.cap = r.gorro;
  if (r.lanza) o.spear = true;
  if (r.escudo) o.shield = r.escudo === true ? "#c98f3e" : r.escudo;
  return o;
}
const CARA = {
  neutral: "neutral", serio: "stern", sonrie: "smile", contento: "grin", rie: "laugh", sorpresa: "shock", nervioso: "nervous",
  grita: "shout", dolor: "pained", alivio: "relief", mareado: "dazed", silba: "whistle", tranquilo: "smile_closed",
};
const cara = (c) => CARA[c] || (Object.values(CARA).includes(c) ? c : "neutral");

// multitudes de fondo (dibujadas una vez en un atlas, miles de copias)
const MULTITUD = {
  "soldados-romanos": (v) => ({ jacket: v % 3 === 2 ? "#a32a28" : "#b8322f", pants: "#8a6a44", boots: "#5a3b2a", hat: "greek", spear: v % 2 === 1, shield: "#c0353a", skin: SKINS[v % 4] }),
  barbaros: (v) => ({ jacket: ["#6b5a3a", "#5a6b4a", "#7a4a32", "#4a5a6a"][v % 4], pants: "#5a4632", boots: "#3a2a20", hat: "hair", hair: ["#c9a050", "#7a4a2a", "#d8c08a", "#3a2a1a"][v % 4], beard: ["#b08a40", "#5a3420", "#c8b07a", "#2a1d16"][v % 4], spear: v % 3 === 0, skin: SKINS[v % 3] }),
  pueblo: (v) => ({ jacket: ["#c98f3e", "#7b5ac9", "#3f8a5a", "#efe3c8", "#c0503a", "#2f6fae"][v % 6], pants: ["#5a4632", "#3b3f52", "#8a7a5a"][v % 3], boots: "#4a3426", hat: v % 5 === 4 ? "cap" : "hair", cap: "#e8dcc0", hair: ["#3a2a1a", "#7a4a2a", "#1d140e", "#a07a4a"][v % 4], skin: SKINS[v % 4], build: v % 7 === 3 ? "kid" : "adult" }),
  senadores: (v) => ({ jacket: "#efe8d8", pants: "#e2d8c2", boots: "#6b4a2a", hat: "hair", hair: ["#9a9a9a", "#4a3426", "#d0d0d0", "#2a1d16"][v % 4], sash: "#8a2a3a", skin: SKINS[v % 4], build: v % 3 === 1 ? "stout" : "adult" }),
};

// ---------------- texturas propias ----------------
const lona = (col) => ctex("lona" + col, 512, 512, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(i * 20 + r() * 4, 0, 3, 512); }
  for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(60,40,20,0.07)"; g.fillRect(r() * 512, r() * 512, 2 + r() * 10, 1 + r() * 3); }
});
const tierra = () => ctex("tierraHC", 512, 512, (g, r) => {
  g.fillStyle = "#a88a62"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? "rgba(110,86,60,0.35)" : "rgba(196,170,130,0.3)"; g.beginPath(); g.ellipse(r() * 512, r() * 512, 2 + r() * 9, 1 + r() * 4, r() * 3, 0, 6.3); g.fill(); }
  for (let i = 0; i < 120; i++) { g.fillStyle = "rgba(90,120,60,0.35)"; g.fillRect(r() * 512, r() * 512, 2, 6 + r() * 6); }
});
const marmol = () => ctex("marmolHC", 512, 512, (g, r) => {
  g.fillStyle = "#e9e1d2"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(150,135,120,0.35)"; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 70; y += r() * 40; g.lineTo(x, y); } g.stroke(); }
  g.strokeStyle = "rgba(120,104,90,0.5)"; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512);
});
const tela = (col, oro) => ctex("estandarte" + col, 256, 768, (g) => {
  g.fillStyle = col; g.fillRect(0, 0, 256, 768);
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 5; i++) g.fillRect(30 + i * 48, 0, 10, 768);
  g.fillStyle = oro; g.fillRect(0, 40, 256, 18); g.fillRect(0, 700, 256, 18);
  g.beginPath(); g.arc(128, 330, 60, 0, 6.3); g.lineWidth = 14; g.strokeStyle = oro; g.stroke();
});

// llama animada (tarjeta)
const llama = (v) => (p) => {
  const cx = 128, by = 250, j = [0, 1, 2].map((k) => Math.sin(v * 2.1 + k * 1.7) * 0.18);
  p.poly([[cx - 60, by], [cx - 70, by - 90], [cx - 20, by - (200 + 50 * j[0])], [cx + 10, by - 110], [cx + 40, by - (180 + 50 * j[1])], [cx + 70, by - 70], [cx + 60, by]], "#ff7a1a", 0);
  p.poly([[cx - 32, by], [cx - 32, by - 70], [cx, by - (140 + 40 * j[2])], [cx + 32, by - 66], [cx + 32, by]], "#ffd84a", 0);
};
const humo = (p) => {
  const g = p.g;
  for (const [x, y, r, a, c] of [[128, 140, 110, 0.5, "70,64,66"], [96, 120, 70, 0.4, "96,90,92"], [160, 110, 76, 0.4, "84,78,80"]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
};

// ---------------- lugares ----------------
// Cada lugar arma su escenario alrededor del origen; los personajes se paran cerca de z = 0 mirando a +z.
function cielo(R) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
      void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
        vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
        c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), mat);
  m.renderOrder = -1; m.frustumCulled = false; m.layers.set(NOINK); R.add(m);
  return m;
}
function nubes(R, pal, lista) {
  const cm = [0, 1, 2, 3].map((k) => cloudHD(k, pal));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hh(i, 20), d = 700 + hh(i, 21) * 600, w = 160 + hh(i, 23) * 140;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cm[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
    m.position.set(Math.cos(a) * d, 120 + hh(i, 22) * 280, Math.sin(a) * d); m.scale.set(w, w / 2, 1); m.layers.set(NOINK); lista.push(m); R.add(m);
  }
}
function colinas(R, mat, n = 14, d0 = 160, d1 = 320) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hh(k, 7), d = d0 + hh(k, 8) * (d1 - d0);
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    h.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); h.scale.set(70 + hh(k, 9) * 70, 14 + hh(k, 10) * 22, 50 + hh(k, 11) * 40);
    h.receiveShadow = true; R.add(h);
  }
}
function suelo(R, tex, rep_ = 400, col = "#ffffff") {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), lam({ map: rep(tex, rep_, rep_), color: col }));
  g.receiveShadow = true; R.add(g);
}
function arbol(R, x, z, s, i) {
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.6 * s, 8), lam({ color: "#6b4a2e" }));
  tronco.position.set(x, 0.8 * s, z); tronco.castShadow = true; R.add(tronco);
  const col = ["#4f8a3a", "#5a9a44", "#3f7a34"][i % 3];
  const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), lam({ color: col, flatShading: true }));
  copa.position.set(x, 2.2 * s, z); copa.scale.y = 1.15; copa.castShadow = copa.receiveShadow = true; R.add(copa);
}
function ciprés(R, x, z, s) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 4.2 * s, 10), lam({ color: "#3b6a34" }));
  m.position.set(x, 2.1 * s, z); m.castShadow = m.receiveShadow = true; R.add(m);
}
function columna(R, x, z, h = 6, r = 0.38, mat) {
  const fuste = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 16), mat);
  fuste.position.set(x, h / 2 + 0.25, z); fuste.castShadow = fuste.receiveShadow = true; R.add(fuste);
  for (const [y, s] of [[0.12, 1], [h + 0.38, 1]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6 * s, 0.26, r * 2.6 * s), mat);
    cap.position.set(x, y, z); cap.castShadow = cap.receiveShadow = true; R.add(cap);
  }
}
function templo(R, cx, cz, rotY, ancho = 14, fondo = 10, alto = 7) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rotY; R.add(g);
  const piedra = lam({ map: rep(marmol(), 3, 3) });
  const base = new THREE.Mesh(new THREE.BoxGeometry(ancho + 2, 1.2, fondo + 2), piedra); base.position.y = 0.6; base.receiveShadow = base.castShadow = true; g.add(base);
  const cella = new THREE.Mesh(new THREE.BoxGeometry(ancho - 3, alto, fondo - 3), lam({ map: rep(stoneHD("piedraTemplo"), 3, 2) })); cella.position.set(0, 1.2 + alto / 2, -0.5); cella.castShadow = cella.receiveShadow = true; g.add(cella);
  const n = Math.max(4, Math.round(ancho / 2.2));
  for (let i = 0; i < n; i++) { const x = -ancho / 2 + 0.6 + i * ((ancho - 1.2) / (n - 1)); columna(g, x, fondo / 2 - 0.2, alto - 0.4, 0.42, piedra); }
  const viga = new THREE.Mesh(new THREE.BoxGeometry(ancho + 1, 0.9, fondo + 1), piedra); viga.position.y = 1.2 + alto + 0.6; viga.castShadow = true; g.add(viga);
  const frontón = new THREE.Shape(); frontón.moveTo(-(ancho + 1) / 2, 0); frontón.lineTo((ancho + 1) / 2, 0); frontón.lineTo(0, 2.6); frontón.closePath();
  const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(frontón, { depth: fondo + 1, bevelEnabled: false }), lam({ map: rep(roofHD("#b5603e"), 2, 2) }));
  tri.position.set(0, 1.2 + alto + 1.05, -(fondo + 1) / 2); tri.castShadow = true; g.add(tri);
}
function tienda(R, x, z, rotY, s, col, i) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; g.scale.setScalar(s); R.add(g);
  const sh = new THREE.Shape(); sh.moveTo(-1.6, 0); sh.lineTo(1.6, 0); sh.lineTo(0, 2.2); sh.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3.2, bevelEnabled: false }), lam({ map: rep(lona(col), 1, 1) }));
  m.position.z = -1.6; m.castShadow = m.receiveShadow = true; g.add(m);
  const puerta = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), lam({ color: "#2a1d16" })); puerta.position.set(0, 0.75, 1.61); g.add(puerta);
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), lam({ color: "#5a3b22" })); p.position.set(sx * 0.1, 1.3, 1.7); p.castShadow = true; g.add(p); }
}
function empalizada(R, z, x0, x1) {
  const mat = lam({ color: "#8a6440" });
  for (let x = x0; x <= x1; x += 0.42) {
    const h = 2.6 + hh(x * 10, 3) * 0.5, m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, h, 7), mat);
    m.position.set(x, h / 2, z + (hh(x * 7, 4) - 0.5) * 0.1); m.castShadow = m.receiveShadow = true; R.add(m);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 7), mat); punta.position.set(m.position.x, h + 0.2, m.position.z); R.add(punta);
  }
}
function estandarte(R, x, z, col) {
  const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 6), lam({ color: "#c9a040" })); asta.position.set(x, 2.5, z); asta.castShadow = true; R.add(asta);
  const t = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), lam({ map: tela(col, "#e8c45a"), side: THREE.DoubleSide }));
  t.position.set(x, 3.6, z + 0.06); t.castShadow = true; R.add(t);
}
function casa(R, x, z, rotY, w, d, h, muro, techo) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; R.add(g);
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam({ map: rep(stoneHD("muro" + muro, [muro, muro, muro, muro]), w / 3, h / 3) }));
  cuerpo.position.y = h / 2; cuerpo.castShadow = cuerpo.receiveShadow = true; g.add(cuerpo);
  const sh = new THREE.Shape(); sh.moveTo(-w / 2 - 0.3, 0); sh.lineTo(w / 2 + 0.3, 0); sh.lineTo(0, 1.6); sh.closePath();
  const t = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d + 0.6, bevelEnabled: false }), lam({ map: rep(roofHD(techo), 1.5, 1.5) }));
  t.position.set(0, h, -d / 2 - 0.3); t.castShadow = true; g.add(t);
  for (const sx of [-w / 4, w / 4]) { const v = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), lam({ color: "#3a2a20" })); v.position.set(sx, h * 0.6, d / 2 + 0.01); g.add(v); }
}

// fuegos y humo de cada lugar: [x, z, tamaño]
const LUGARES = {
  campamento: (R, ctx) => {
    suelo(R, tierra(), 500); colinas(R, lam({ map: rep(grassHD(), 20, 8), color: "#c8d0b0" }));
    const cols = ["#d8c9a6", "#cbb88f", "#e2d5b4"];
    let i = 0;
    for (let k = 0; k < 7; k++) { tienda(R, -16 + k * 5.2 + hh(k, 1), -14 - hh(k, 2) * 3, hh(k, 3) * 0.4 - 0.2, 1.1, cols[k % 3], i++); }
    for (let k = 0; k < 5; k++) { tienda(R, -12 + k * 6, -24 - hh(k, 5) * 2, 0.1, 1.2, cols[(k + 1) % 3], i++); }
    tienda(R, -9, -6, 0.5, 1.0, cols[0], i++); tienda(R, 10, -7, -0.5, 1.05, cols[2], i++);
    empalizada(R, -32, -40, 40);
    estandarte(R, -3.5, -4.5, "#a32a28"); estandarte(R, 3.8, -5, "#a32a28");
    for (let k = 0; k < 18; k++) ciprés(R, -60 + k * 7 + hh(k, 9) * 3, -45 - hh(k, 8) * 15, 1 + hh(k, 7) * 0.5);
    ctx.fuegos = [[5.5, 2.5, 1], [-14, -9, 0.8]];
    ctx.multitudZ = -9;
  },
  palacio: (R, ctx) => {
    suelo(R, marmol(), 800); colinas(R, lam({ map: rep(grassHD(), 20, 8), color: "#c8d0b0" }), 10, 200, 360);
    const piedra = lam({ map: rep(marmol(), 2, 2) });
    for (let k = -4; k <= 4; k++) { columna(R, -6.5, -4 - k * 4.2, 8, 0.45, piedra); columna(R, 6.5, -4 - k * 4.2, 8, 0.45, piedra); }
    const muro = new THREE.Mesh(new THREE.BoxGeometry(30, 11, 1), lam({ map: rep(stoneHD("muroPalacio", ["#e8cfa0", "#dcc08e", "#efd9ae", "#d4b484"], "#b8966a"), 8, 3) }));
    muro.position.set(0, 5.5, -22); muro.receiveShadow = true; R.add(muro);
    const escalon = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 3.5), piedra); escalon.position.set(0, 0.2, -7); escalon.receiveShadow = true; R.add(escalon);
    const alfombra = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 14).rotateX(-Math.PI / 2), lam({ color: "#9a2a2e" })); alfombra.position.set(0, 0.012, 0); alfombra.receiveShadow = true; R.add(alfombra);
    const oro = lam({ color: "#d9a63a" }), rojo = lam({ color: "#8a1f2c" });
    const asiento = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.0), rojo); asiento.position.set(0, 0.85, -7.2); asiento.castShadow = true; R.add(asiento);
    const respaldo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.2), rojo); respaldo.position.set(0, 1.6, -7.65); respaldo.castShadow = true; R.add(respaldo);
    for (const sx of [-0.75, 0.75]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 1.0), oro); b.position.set(sx, 0.9, -7.2); b.castShadow = true; R.add(b); }
    const corona = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.26), oro); corona.position.set(0, 2.45, -7.65); R.add(corona);
    for (const x of [-9, 9]) { const cort = new THREE.Mesh(new THREE.PlaneGeometry(4, 9), lam({ map: tela("#8a1f2c", "#d9a63a"), side: THREE.DoubleSide })); cort.position.set(x, 5.4, -21.4); R.add(cort); }
    for (const x of [-4.5, 4.5]) estandarte(R, x, -21.3, "#5b2a86");
    for (const x of [-12, 12]) estandarte(R, x, -21.3, "#a32a28");
    ctx.fuegos = [[-3.2, -4, 0.55], [3.2, -4, 0.55]];
    ctx.multitudZ = -10;
  },
  foro: (R, ctx) => {
    suelo(R, cobbleHD(), 600); colinas(R, lam({ map: rep(grassHD(), 20, 8), color: "#c8d0b0" }), 12, 220, 380);
    templo(R, 0, -24, 0, 16, 11, 8);
    templo(R, -22, -6, Math.PI / 2, 12, 9, 6); templo(R, 22, -6, -Math.PI / 2, 12, 9, 6);
    const piedra = lam({ map: rep(marmol(), 2, 2) });
    for (let k = 0; k < 6; k++) { columna(R, -11, 4 - k * 4, 5, 0.32, piedra); columna(R, 11, 4 - k * 4, 5, 0.32, piedra); }
    for (let k = 0; k < 8; k++) ciprés(R, -40 + k * 11, -48 - hh(k, 4) * 8, 1.2);
    ctx.fuegos = [];
    ctx.multitudZ = -8;
  },
  campo: (R, ctx) => {
    suelo(R, grassHD(), 400); colinas(R, lam({ map: rep(grassHD(), 20, 8), color: "#d0dcb4" }), 16, 120, 300);
    const camino = new THREE.Mesh(new THREE.PlaneGeometry(4, 400).rotateX(-Math.PI / 2), lam({ map: rep(tierra(), 1, 100) }));
    camino.position.set(0, 0.01, -150); camino.receiveShadow = true; R.add(camino);
    for (let k = 0; k < 40; k++) { const x = (hh(k, 1) - 0.5) * 120, z = -8 - hh(k, 2) * 90; if (Math.abs(x) < 4) continue; arbol(R, x, z, 1 + hh(k, 3) * 0.8, k); }
    for (let k = 0; k < 10; k++) ciprés(R, -30 + k * 6 + hh(k, 5) * 2, -60 - hh(k, 6) * 10, 1.3);
    ctx.fuegos = [];
    ctx.multitudZ = -10;
  },
  batalla: (R, ctx) => {
    const quemado = ctex("quemadoHC", 512, 512, (g, r) => {
      g.fillStyle = "#8a7254"; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 240; i++) { const x = r() * 512, y = r() * 512, rr = 6 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rr);
        const c = r() < 0.55 ? "40,32,28" : "120,104,80"; gr.addColorStop(0, `rgba(${c},0.5)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
    });
    suelo(R, quemado, 500); colinas(R, lam({ map: rep(quemado, 20, 8), color: "#c8b8a8" }));
    for (let k = 0; k < 10; k++) estandarte(R, -30 + k * 6.5, -26 - hh(k, 3) * 4, k % 2 ? "#a32a28" : "#5b2a86");
    ctx.fuegos = [[-8, -6, 1.2], [9, -12, 1.4], [-18, -20, 1.6], [16, 2, 1], [2, -30, 2]];
    ctx.multitudZ = -12;
  },
  pueblo: (R, ctx) => {
    suelo(R, cobbleHD(), 600); colinas(R, lam({ map: rep(grassHD(), 20, 8), color: "#c8d0b0" }), 12, 160, 320);
    const muros = ["#e8d8b8", "#dcc6a0", "#efe3c8", "#d8b890"], techos = ["#b5603e", "#a84a32", "#c27a4a"];
    for (let k = 0; k < 8; k++) { casa(R, -8.5, 4 - k * 6.5, Math.PI / 2, 5.5, 5, 4 + hh(k, 1) * 2, muros[k % 4], techos[k % 3]); casa(R, 8.5, 4 - k * 6.5, -Math.PI / 2, 5.5, 5, 4 + hh(k, 2) * 2, muros[(k + 2) % 4], techos[(k + 1) % 3]); }
    casa(R, 0, -46, 0, 10, 6, 7, "#efe3c8", "#a84a32");
    ctx.fuegos = [];
    ctx.multitudZ = -8;
  },
};
export const LISTA_LUGARES = Object.keys(LUGARES);

class Mundo {
  constructor(lugar, nubesPal) {
    this.root = new THREE.Group();
    this.nubes = [];
    this.sky = cielo(this.root);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.root.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog("#bccbec", 60, 900);
    nubes(this.root, nubesPal, this.nubes);
    this.ctx = { fuegos: [], multitudZ: -10 };
    (LUGARES[lugar] || LUGARES.campo)(this.root, this.ctx);
    this.multitudes = new Map();
    noInkFallback(this.root);
  }
  // multitud instanciada detrás de los personajes (se crea una vez por tipo/tamaño)
  multitud(tipo, n, luz2d) {
    const k = `${tipo}|${n}`;
    if (this.multitudes.has(k)) return this.multitudes.get(k);
    const f = MULTITUD[tipo] || MULTITUD.pueblo;
    const at = atlas(Array.from({ length: 12 }, (_, i) => f(i)), luz2d, (i) => (tipo.startsWith("soldados") && i % 2 ? { raise: 0 } : {}));
    const pts = [], ancho = Math.max(14, Math.sqrt(n) * 1.3), z0 = this.ctx.multitudZ;
    let i = 0;
    for (let z = z0; i < n; z -= 1.1) for (let x = -ancho / 2; x <= ancho / 2 && i < n; x += 1.0) { pts.push({ x: x + (hh(i, 1) - 0.5) * 0.5, z: z + (hh(i, 2) - 0.5) * 0.4 }); i++; }
    const c = new Crowd(this.root, at, pts, 1.3);
    this.multitudes.set(k, c);
    return c;
  }
}

// ---------------- cámara ----------------
// Cada escena: un movimiento suave que nunca se detiene. dist = distancia base según el plano.
const PLANO = { cerca: { d: 1.9, h: 1.62, fov: 38, coc: 14 }, medio: { d: 3.0, h: 1.5, fov: 40, coc: 11 }, abierto: { d: 9, h: 3.0, fov: 46, coc: 0 } };
// ancho que debe caber (m) → distancia mínima para el formato
export function camara(esc, u, foco, ancho = 0, aspecto = 9 / 16) {
  const P = PLANO[esc.plano] || PLANO.medio, mov = esc.camara || "frente";
  const tanH = Math.tan(THREE.MathUtils.degToRad(P.fov / 2)) * aspecto;
  const d = Math.max(P.d, ancho > 0 ? (ancho / 2 + 0.35) / tanH : 0) * (esc.zoom || 1);
  const F = foco.clone(), k = smoother(u), drift = 0.04 * Math.sin(u * 3.1);
  let pos, look = F.clone(), fov = P.fov, coc = P.coc;
  const orb = (ang, dist, alt) => V(F.x + Math.sin(ang) * dist, alt, F.z + Math.cos(ang) * dist);
  switch (mov) {
    case "acercar": pos = orb(0.12, lerp(d * 1.7, d * 0.85, k), lerp(P.h + 0.5, P.h, k)); break;
    case "alejar": pos = orb(-0.1, lerp(d * 0.85, d * 2.4, k), lerp(P.h, P.h + 2.6, k)); coc = lerp(P.coc, 0, k); break;
    case "subir": pos = orb(0.05, lerp(d, d * 2.8 + 8, k), lerp(P.h, 16, k)); look = V(F.x, lerp(F.y, 0, k), F.z - 8 * k); fov = lerp(P.fov, 52, k); coc = lerp(P.coc, 0, k); break;
    case "paneo-izq": pos = orb(lerp(0.45, -0.25, k), d, P.h); break;
    case "paneo-der": pos = orb(lerp(-0.45, 0.25, k), d, P.h); break;
    case "rodear": pos = orb(lerp(-0.55, 0.55, k), d * 1.05, P.h + 0.2); break;
    case "pasar": pos = orb(lerp(0.15, 1.2, k), lerp(d, d * 1.3, k), lerp(P.h, P.h + 0.6, k)); look = V(F.x - 2 * k, F.y, F.z - 6 * k); coc = lerp(P.coc, P.coc * 0.4, k); break;
    case "bajar": pos = orb(0.05, lerp(d * 2.2 + 6, d, k), lerp(14, P.h, k)); look = V(F.x, lerp(0, F.y, k), F.z - 6 * (1 - k)); fov = lerp(52, P.fov, k); coc = lerp(0, P.coc, k); break;
    case "temblor": pos = orb(0.1, d * lerp(1.05, 0.95, k), P.h); break;
    default: pos = orb(0.08 + drift, lerp(d * 1.08, d * 0.96, k), P.h + drift); // "frente": acercamiento lento
  }
  return { pos, look, fov, coc };
}

// ---------------- motor ----------------
export class Escenario {
  constructor(M, guion) {
    this.M = M; this.guion = guion; this.reparto = guion.reparto || {};
    // calidad: "alta" = tamaño real con MSAA; "rapida" = mitad de resolución (para probar o en máquinas sin tarjeta gráfica)
    const q = new URLSearchParams(location.search), rapida = (q.get("calidad") || M.proyecto.opciones?.calidad) === "rapida";
    const k = Number(q.get("escala")) || (rapida ? 0.5 : 1), RW = Math.round(M.W * k), RH = Math.round(M.H * k);
    this.cv = document.createElement("canvas"); this.cv.width = RW; this.cv.height = RH;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    r.setPixelRatio(1); r.setSize(RW, RH, false);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, M.W / M.H, 0.2, 5000);
    this.cam.layers.enable(NOINK);
    this.pool = new Pool(); this.actores = []; this.efectos = [];
    this.mundos = new Map();
    this.fx = {
      ink: new InkPass(this.scene, this.cam), lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
      tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), grade: new GradeEffect(GRADES.day, 1),
    };
    const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
    const mip = bloom.mipmapBlurPass, setSize = mip.setSize.bind(mip);
    mip.setSize = (w, h) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
    const c = this.composer = new EffectComposer(r, { multisampling: M.render && !rapida && k >= 1 ? 4 : 0, frameBufferType: THREE.HalfFloatType });
    c.addPass(new RenderPass(this.scene, this.cam));
    c.addPass(this.fx.ink);
    c.addPass(new EffectPass(this.cam, this.fx.lens.pre));
    c.addPass(new EffectPass(this.cam, this.fx.lens.main));
    c.addPass(new EffectPass(this.cam, bloom, this.fx.tone, this.fx.grade));
    c.setSize(RW, RH);
    this.v = V(0, 0, 0); this.fwd = V(0, 0, 0);
  }
  luz(esc) { return LUCES[esc.luz || this.guion.luz] || LUCES.dia; }
  mundo(esc) {
    const lugar = esc.lugar || this.guion.lugar || "campo", lz = this.luz(esc), k = lugar + "|" + (esc.luz || this.guion.luz || "dia");
    if (!this.mundos.has(k)) this.mundos.set(k, new Mundo(lugar, lz.nubes));
    return this.mundos.get(k);
  }
  // dónde está cada personaje de la escena (x a lo ancho, z hacia el fondo)
  // por defecto: uno al centro; dos, escalonados (uno adelante a la izquierda, otro atrás a la derecha); más, en fila curva
  lugares(esc) {
    const ps = esc.personajes || [], n = ps.length;
    return ps.map((p, i) => {
      const dx = n === 2 ? (i ? 0.5 : -0.5) : (i - (n - 1) / 2) * 0.95, dz = n === 2 ? (i ? -0.7 : 0.5) : -Math.abs(i - (n - 1) / 2) * 0.35;
      return { ...p, x: p.x ?? dx, z: p.z ?? dz };
    });
  }
  ancho(esc) { const ps = this.lugares(esc); if (ps.length < 2) return 0; const xs = ps.map((p) => p.x); return Math.max(...xs) - Math.min(...xs) + 0.9; }
  foco(esc) {
    const ps = this.lugares(esc);
    if (!ps.length) return V(0, 1.5, 0);
    const p = esc.foco ? ps.find((q) => q.id === esc.foco) || ps[0] : null;
    let alto = (esc.plano === "cerca" ? 1.6 : esc.plano === "abierto" ? 1.1 : 1.35);
    if (ps.length && ps.every((q) => q.pose === "sentado")) alto -= 0.5;
    if (p) return V(p.x, alto, p.z);
    return V(ps.reduce((s, q) => s + q.x, 0) / ps.length, alto, ps.reduce((s, q) => s + q.z, 0) / ps.length);
  }
  // dibuja la escena i en el tiempo t (segundos del video) y devuelve el canvas
  dibujar(i, t) {
    const M = this.M, esc = this.guion.escenas[i], T = M.tiempos.escenas[i];
    const sig = M.tiempos.escenas[i + 1], fin = sig ? sig.ini : M.duracion;
    const u = clamp01((t - T.ini) / Math.max(0.5, fin - T.ini));
    const W = this.mundo(esc), { L, K, grade } = this.luz(esc);
    this.scene.children.length = 0; this.scene.add(W.root);
    const foco = this.foco(esc), ancho = esc.foco ? 0 : this.ancho(esc), asp = M.W / M.H;
    const c = camara(esc, u, foco, ancho, asp), cam = this.cam;
    if (esc.camara === "temblor") { const a = 0.05 * Math.sin(t * 47) * (1 - u); c.pos.x += a; c.pos.y += a * 0.6; }
    cam.position.copy(c.pos); cam.up.set(0, 1, 0); cam.lookAt(c.look);
    cam.fov = c.fov; cam.aspect = M.W / M.H; cam.near = 0.2; cam.far = 5000; cam.updateProjectionMatrix(); cam.updateMatrixWorld();

    // sol relativo a la cámara (fijo durante la escena)
    const cm = camara(esc, 0.5, foco, ancho, asp), fx0 = foco.x - cm.pos.x, fz0 = foco.z - cm.pos.z, nn = Math.hypot(fx0, fz0) || 1;
    const az = THREE.MathUtils.degToRad(esc.sol ?? 70), el = THREE.MathUtils.degToRad(L.el);
    const hx = (fx0 / nn) * Math.cos(az) - (fz0 / nn) * Math.sin(az), hz = (fz0 / nn) * Math.cos(az) + (fx0 / nn) * Math.sin(az);
    const sunDir = V(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    W.hemi.color.set(L.sky); W.hemi.groundColor.set(L.ground); W.hemi.intensity = L.hemiI;
    W.sun.color.set(L.sunCol); W.sun.intensity = L.sunI;
    const dist = cam.position.distanceTo(foco), Rr = THREE.MathUtils.clamp(dist * 1.15 + 9, 14, 90);
    W.sun.position.copy(foco).addScaledVector(sunDir, 300); W.sun.target.position.copy(foco);
    const sc = W.sun.shadow.camera; sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 700; sc.updateProjectionMatrix();
    W.sun.shadow.bias = L.bias; W.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = W.sky.material.uniforms;
    K.sky.c.forEach((h, j) => untone(h, su["c" + j].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg)); su.e.value.set(e[1], e[2], e[3], e[4]);
    W.sky.position.copy(cam.position);
    untone(L.fog, W.fog.color); W.fog.near = Math.max(30, L.fogNear * 1.5); W.fog.far = Math.max(400, L.fogFar * 2.5);
    this.scene.fog = W.fog; this.scene.background = null;
    for (const m of W.nubes) m.quaternion.copy(cam.quaternion);

    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0), luz2d = light2D(sunDir, right);
    // multitud
    for (const cr of W.multitudes.values()) cr.mesh.visible = false;
    if (esc.multitud) { const m = typeof esc.multitud === "string" ? { tipo: esc.multitud } : esc.multitud; W.multitud(m.tipo || "pueblo", Math.min(4000, m.n || 300), luz2d).mesh.visible = true; }

    // personajes y efectos como tarjetas
    const st = { places: [], fx: [] }, f = Math.round(t * 30);
    const parpadeo = (j) => { let s = Math.round(-60 * hh(j, 9)); for (let n = 0; s <= f && n < 200; n++) { const k = f - s; if (k >= 0 && k < 4) return [0.5, 1, 1, 0.5][k]; s += Math.round(15 + 54 * hh(j * 31 + n, 13)); } return 0; };
    this.lugares(esc).forEach((p, j) => {
      const r = this.reparto[p.id] || {}, o = vestuario(r), pose = p.pose || "de-pie";
      const d = cam.position.distanceTo(this.v.set(p.x, 1.2, p.z)), [w, h, kk] = tier(d);
      const fase = Math.floor((((t * 1.05 + j * 0.37) % 1) + 1) % 1 * 8) / 8;
      const ent = smoother((t - T.ini) * 3); // gestos que entran al empezar la escena
      const op = { expr: cara(p.cara), light: luz2d, seed: r.semilla ?? ((j * 5 + 3) % 7 + 1), blink: parpadeo(j + i * 7), facing: p.mira ?? 0, look: p.ojos ?? 0 };
      if (pose === "camina") Object.assign(op, { mode: "stroll", phase: fase });
      else if (pose === "marcha") Object.assign(op, { mode: "march", phase: fase, lift: 40 });
      else if (pose === "sentado") op.mode = "sit";
      else if (pose === "cae") op.mode = "fall";
      else op.mode = "stand";
      if (pose === "levanta-arma") op.raise = Math.round(6 * ent) / 6;
      if (pose === "espada") op.prop = ["sword", 1 - Math.round(6 * ent) / 6];
      if (pose === "saluda") op.wave = Math.sin(t * 8) * 0.5 + 0.5;
      // caminar: avanza hacia la cámara
      let z = p.z; if (pose === "camina" || pose === "marcha") z += (t - T.ini) * (p.velocidad ?? 0.6);
      st.places.push({ key: `${p.id}|${JSON.stringify(op)}`, x: p.x, y: 0, z, size: [w, h, kk], draw: (pen) => bodyFront(pen, o, op) });
      if (d < 60) blob(st, sunDir, p.x, 0, z);
    });
    const fuegos = [...W.ctx.fuegos];
    if (esc.fuego) { const p0 = this.lugares(esc)[0] || { x: 0, z: 0 }; fuegos.push([p0.x + 0.6, p0.z - 0.9, 0.6]); }
    for (const [x, z, s] of fuegos) {
      if (cam.position.distanceTo(this.v.set(x, 1, z)) > 80) continue;
      const vv = (f >> 1) % 4;
      st.fx.push({ key: `llama|${vv}`, cw: 256, ch: 256, draw: llama(vv), x, y: 0, z, w: 1.4 * s, h: 1.4 * s });
      if (s >= 0.8) for (let k = 0; k < 4; k++) { const uu = (t * 0.12 + k / 4) % 1, sz = (1.5 + uu * 5) * s; st.fx.push({ key: "humo", cw: 256, ch: 256, draw: humo, x: x - uu * 3, y: 1.5 + uu * 10 * s, z, w: sz, h: sz, soft: true }); }
    }
    let ai = 0;
    for (const p of st.places) {
      const a = this.actor(W, ai++), [w, h, k] = p.size;
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.geometry = BODY; a.mesh.visible = true; a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0); a.mesh.scale.set(1, 1, 1);
    }
    for (let j = ai; j < this.actores.length; j++) this.actores[j].mesh.visible = false;
    let fi = 0;
    for (const p of st.fx) {
      const e2 = this.efecto(W, fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft); e2.mesh.visible = true; e2.mesh.position.set(p.x, p.y + (p.flat || p.soft ? 0 : p.h / 2), p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.rotation.order = "YXZ"; e2.mesh.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0); if (p.soft) e2.mesh.quaternion.copy(cam.quaternion); }
      e2.mesh.scale.set(p.w, p.h, 1);
    }
    for (let j = fi; j < this.efectos.length; j++) this.efectos[j].mesh.visible = false;
    this.pool.flush();
    for (let j = 0; j < ai; j++) this.actores[j].bind();
    for (let j = 0; j < fi; j++) this.efectos[j].bind();

    // desenfoque: enfoca a los personajes; tomas abiertas, nítidas
    cam.getWorldDirection(this.fwd);
    this.fx.lens.focus = Math.max(0.3, this.v.copy(foco).sub(cam.position).dot(this.fwd));
    this.fx.lens.cInf = esc.desenfoque ?? c.coc;
    gradeFor(this.fx.grade, grade);
    this.composer.render();
    return this.cv;
  }
  // los actores viven en el mundo actual (si cambia el lugar, se mudan)
  actor(W, i) { while (this.actores.length <= i) this.actores.push(new Actor(W.root)); const a = this.actores[i]; if (a.mesh.parent !== W.root) W.root.add(a.mesh); return a; }
  efecto(W, i) { while (this.efectos.length <= i) this.efectos.push(new Fx(W.root)); const e = this.efectos[i]; if (e.mesh.parent !== W.root) W.root.add(e.mesh); return e; }
}
