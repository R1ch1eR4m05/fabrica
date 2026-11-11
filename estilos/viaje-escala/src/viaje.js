// Viaje de escala: motor 3D procedural. La cámara sube sin parar desde la calle hasta el universo.
// Siete mundos, cada uno en su propia escala; se funden entre sí según la altura (en metros).
// TODO es determinista: el cuadro depende solo de (altura, tiempo). Nada de Math.random ni Date.now().
import * as THREE from "three";

export const LY = 9.4607e15, AU = 1.495978707e11;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;
const lg = Math.log10;
function rng(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- puntos con brillo suave (estrellas, galaxias, planetas) ----------
const VS = `attribute float aSize; attribute float aMin; attribute vec3 aColor; varying vec3 vC; varying float vA; uniform float uEsc, uFade; uniform vec3 uC;
void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  vA = uFade>0. ? smoothstep(0.,uFade,length((modelMatrix*vec4(position,1.)).xyz-uC)) : 1.;
  gl_PointSize=max(aMin, aSize*length(modelViewMatrix[0].xyz)*uEsc/max(-mv.z,1e-9)); }`;
const FS = `varying vec3 vC; varying float vA; uniform float uA;
void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard; float a=1.-r; a=a*a*(3.-2.*a); gl_FragColor=vec4(vC, a*uA*vA); }`;
function puntos(mats, pos, size, min, col, alpha = 1) {
  const n = pos.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size instanceof Float32Array ? size : new Float32Array(n).fill(size), 1));
  g.setAttribute("aMin", new THREE.BufferAttribute(min instanceof Float32Array ? min : new Float32Array(n).fill(min), 1));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uEsc: { value: 1000 }, uA: { value: alpha }, uFade: { value: 0 }, uC: { value: new THREE.Vector3() } } });
  mats.push(m);
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
const col3 = (c, k = 1) => { const x = new THREE.Color(c); return [x.r * k, x.g * k, x.b * k]; };

// fondo de estrellas que sigue a la cámara
function cielo(mats, semilla, n = 2600, brillo = 1) {
  const r = rng(semilla), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(a), z, s * Math.sin(a)], i * 3);
    const b = (0.25 + r() * r() * 0.75) * brillo, w = r();
    col.set(w < 0.2 ? [b * 0.8, b * 0.9, b] : w > 0.85 ? [b, b * 0.85, b * 0.7] : [b, b, b], i * 3);
    mn[i] = 1 + r() * r() * 2;
  }
  const p = puntos(mats, pos, 0, mn, col); p.userData.cielo = true; return p;
}
function orbita(cam, target, d, el, az, vfov) {
  const ce = Math.cos(el);
  cam.position.set(target.x + d * ce * Math.sin(az), target.y + d * Math.sin(el), target.z + d * ce * Math.cos(az));
  cam.up.set(0, 1, 0); cam.near = d * 1e-3; cam.far = d * 1e4; cam.fov = vfov; cam.updateProjectionMatrix(); cam.lookAt(target);
}

// ---------- ruido GLSL ----------
const NOISE2 = `float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+vec2(5.2,1.3); a*=.5; } return s; }`;
const NOISE3 = `float h31(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<6;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }`;

// =====================================================================================
// MUNDO 0: la calle (de 1.7 m a ~3 km). Casas, árboles, ciudad al fondo, atardecer.
// =====================================================================================
function mundoCalle() {
  const sc = new THREE.Scene(), r = rng(11), mats = [];
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uH: { value: new THREE.Color("#f3b07c") }, uZ: { value: new THREE.Color("#35456f") }, uN: { value: new THREE.Color("#a79788") }, uS: { value: V3(0.1, 0.085, 1).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vD; uniform vec3 uH,uZ,uN,uS; void main(){ float y=vD.y; vec3 c = y>0. ? mix(uH,uZ,pow(y,.5)) : mix(uH,uN,pow(-y,.35));
      float s=max(dot(vD,uS),0.); c+=vec3(1.,.82,.55)*(pow(s,900.)*4.+pow(s,14.)*.4); gl_FragColor=vec4(c,1.); }`,
  }));
  sky.renderOrder = -1; sc.add(sky);
  sc.fog = new THREE.Fog("#eab68c", 120, 4200);
  sc.add(new THREE.HemisphereLight("#ffd9b0", "#6f7a5a", 1.15));
  const sol = new THREE.DirectionalLight("#ffc890", 2.1); sol.position.set(0.1, 0.085, 1); sc.add(sol);

  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#86a468" }));
  suelo.position.y = -0.05; sc.add(suelo);

  // calles en cuadrícula de 100 m
  const K = 24, calleMat = new THREE.MeshLambertMaterial({ color: "#45454f" });
  const calles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), calleMat, (2 * K + 1) * 2);
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc1 = new THREE.Vector3(), ps = new THREE.Vector3();
  let n = 0;
  for (let k = -K; k <= K; k++) {
    M4.compose(ps.set(k * 100, 0, 0), q, sc1.set(10, 1, 5000)); calles.setMatrixAt(n++, M4);
    M4.compose(ps.set(0, 0, k * 100), q, sc1.set(5000, 1, 10)); calles.setMatrixAt(n++, M4);
  }
  sc.add(calles);
  const amar = new THREE.MeshLambertMaterial({ color: "#e0ad22" });
  for (const x of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 5000), amar); l.position.set(x, 0.02, 0); sc.add(l); }
  const blanca = new THREE.MeshLambertMaterial({ color: "#d8d4c8" });
  for (const x of [-4.4, 4.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 5000), blanca); l.position.set(x, 0.02, 0); sc.add(l); }

  // casas, torres y árboles por manzana
  const cbd = { x: 320, z: 950 }, paleta = ["#e8c9a0", "#d9a48f", "#c9d3c0", "#e9e1cf", "#b8c4d6", "#e0b88a", "#cfa3a3", "#f0dfb8"].map((c) => new THREE.Color(c));
  const techos = ["#8c4a3a", "#6e4b3e", "#8a5a44", "#5e5a63"].map((c) => new THREE.Color(c));
  const casas = [], torres = [], arbol = [];
  for (let i = -K + 1; i < K; i++) for (let j = -K + 1; j < K; j++) {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const cx = i * 100 + 27 + a * 46 + (r() - 0.5) * 6, cz = j * 100 + 27 + b * 46 + (r() - 0.5) * 6;
      if (Math.abs(i * 100 + 50) < 0 && Math.abs(j * 100 + 50) < 0) continue;
      const dc = Math.hypot(cx - cbd.x, cz - cbd.z), u = r();
      if (dc < 420 && u < 0.8) { torres.push([cx, cz, 26 + r() * 28, 14 + r() * 80 * Math.exp(-dc * dc / (2 * 260 * 260)) + 10]); continue; }
      if (u < 0.12) { arbol.push([cx, cz, 4 + r() * 3]); arbol.push([cx + 8, cz + 6, 3.5 + r() * 3]); continue; }
      casas.push([cx, cz, 10 + r() * 14, 5 + r() * 3.5, 9 + r() * 12, Math.floor(r() * paleta.length), Math.floor(r() * techos.length)]);
      if (r() < 0.65) arbol.push([cx + (r() > 0.5 ? 14 : -14), cz + (r() - 0.5) * 20, 3 + r() * 3]);
    }
  }
  const paredes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#ffffff" }), casas.length + torres.length);
  const techo = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: "#ffffff" }), casas.length);
  const c = new THREE.Color();
  casas.forEach(([x, z, w, h, d, ci, ti], k) => {
    M4.compose(ps.set(x, h / 2, z), q, sc1.set(w, h, d)); paredes.setMatrixAt(k, M4); paredes.setColorAt(k, paleta[ci]);
    M4.compose(ps.set(x, h + 1.6, z), q, sc1.set(w * 1.1, 3.2, d * 1.1)); techo.setMatrixAt(k, M4); techo.setColorAt(k, techos[ti]);
  });
  torres.forEach(([x, z, w, h], k) => {
    const kk = casas.length + k; M4.compose(ps.set(x, h / 2, z), q, sc1.set(w, h, w)); paredes.setMatrixAt(kk, M4);
    paredes.setColorAt(kk, c.setHSL(0.58 + r() * 0.05, 0.12, 0.62 + r() * 0.2));
  });
  sc.add(paredes, techo);
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), arbol.length);
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1, 5), new THREE.MeshLambertMaterial({ color: "#5b4332" }), arbol.length);
  arbol.forEach(([x, z, h], k) => {
    M4.compose(ps.set(x, h * 0.35, z), q, sc1.set(1, h * 0.7, 1)); troncos.setMatrixAt(k, M4);
    M4.compose(ps.set(x, h * 0.9, z), q, sc1.set(h * 0.42, h * 0.5, h * 0.42)); copas.setMatrixAt(k, M4); copas.setColorAt(k, c.setHSL(0.27 + r() * 0.07, 0.45, 0.28 + r() * 0.12));
  });
  sc.add(copas, troncos);

  // coches parados a lo largo de la calle
  const coches = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.4, 4.4), new THREE.MeshLambertMaterial({ color: "#ffffff" }), 60);
  for (let k = 0; k < 60; k++) { const z = -300 + k * 11 + r() * 5, x = (k % 2 ? 6.2 : -6.2); if (Math.abs(z) < 6) { M4.compose(ps.set(0, -50, 0), q, sc1.set(1, 1, 1)); } else M4.compose(ps.set(x, 0.7, z), q, sc1.set(1, 1, 1)); coches.setMatrixAt(k, M4); coches.setColorAt(k, c.setHSL(r(), 0.5, 0.45)); }
  sc.add(coches);

  // tú y tu problema (una nube gris sobre la cabeza)
  const tu = new THREE.Group();
  const L = (col) => new THREE.MeshLambertMaterial({ color: col });
  const piernas = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.85, 0.2), L("#2e4a7a")); piernas.position.y = 0.43;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), L("#d8cdb0")); torso.position.y = 1.15;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), L("#e9b894")); cabeza.position.y = 1.62;
  const brazos = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.14), L("#d8cdb0")); brazos.position.y = 1.3;
  tu.add(piernas, torso, cabeza, brazos);
  const nube = new THREE.Group();
  for (let k = 0; k < 7; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + r() * 0.09, 1), new THREE.MeshLambertMaterial({ color: "#3a3a46", flatShading: true })); s.position.set((r() - 0.5) * 0.4, (r() - 0.5) * 0.14, (r() - 0.5) * 0.2); nube.add(s); }
  nube.position.y = 2.1; tu.add(nube); sc.add(tu);

  const mundo = { id: "calle", dentro: [-9, -8], fuera: [2.5, 3.7], sc, mats, tu, nube, persona: V3(0, 0, 0), etiquetas: [] };
  mundo.render = (R, cam, h, t, vfov, asp) => {
    nube.position.y = 2.1 + Math.sin(t * 1.3) * 0.04; nube.rotation.y = t * 0.4;
    const bajo = 1 - sm(1.8, 320, h);                      // 1 = cámara baja detrás de ti, 0 = vista cenital
    const atras = 3.6 * Math.pow(bajo, 1.2);
    const alto = h;
    const az = t * 0.025 * (1 - bajo);
    const arriba = sm(2, 120, h);
    cam.position.set(0, Math.max(alto, 1.7), -atras);
    cam.up.set(Math.sin(az) * arriba, 1 - arriba, Math.cos(az) * arriba).normalize();
    const mira = V3(0, mix(1.2, 0, sm(1.7, 200, h)), mix(6, 0, sm(1.7, 160, h)));
    cam.near = 0.1; cam.far = 12000; cam.fov = vfov; cam.updateProjectionMatrix(); cam.lookAt(mira);
    sky.position.copy(cam.position); sc.fog.near = 120 + h * 0.2; sc.fog.far = 4200 + h * 3;
    return h; // distancia de cámara
  };
  return mundo;
}

// =====================================================================================
// MUNDO 1: el mapa (de 300 m a ~1 000 km). Campos, ciudades y mares generados en el shader.
// =====================================================================================
function mundoMapa() {
  const sc = new THREE.Scene(), mats = [];
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uS: { value: 1000 } },
    vertexShader: `varying vec2 vP; uniform float uS; void main(){ vP=position.xz*uS; gl_Position=projectionMatrix*modelViewMatrix*vec4(position*vec3(uS,1.,uS),1.); }`,
    fragmentShader: `precision highp float; varying vec2 vP; uniform float uPx;
${NOISE2}
float lineAA(float d,float w){ return 1.-smoothstep(w*.5,w*.5+uPx,d); }
void main(){
  vec2 p=vP;
  float L=fbm(p/150000.+vec2(3.7,1.2)); float bias=.3*(1.-smoothstep(0.,160000.,length(p)));
  float land=smoothstep(.47,.5,L+bias), coast=smoothstep(.36,.5,L+bias);
  vec2 c=floor(p/260.); float r1=h21(c), r2=h21(floor(p/3200.)+9.);
  vec3 f=mix(vec3(.46,.6,.28),vec3(.82,.74,.4),r1); f=mix(f,vec3(.34,.5,.25),step(.72,r2)*.7);
  vec2 q=fract(p/260.); float ed=min(min(q.x,1.-q.x),min(q.y,1.-q.y))*260.; f*=1.-.16*(1.-smoothstep(0.,max(3.,uPx*1.5),ed))*smoothstep(1.5,6.,260./uPx);
  f=mix(f,vec3(.26,.43,.23),smoothstep(.55,.7,fbm(p/9000.))*.75);
  f=mix(f,vec3(.74,.64,.44),smoothstep(.6,.8,fbm(p/32000.+4.))*.65);
  float ur=clamp(smoothstep(7500.,1500.,length(p))+smoothstep(.64,.8,fbm(p/14000.+11.)),0.,1.);
  vec2 b=fract(p/100.); float bx=min(b.x,1.-b.x)*100., by=min(b.y,1.-b.y)*100.;
  float roads=max(lineAA(bx,9.),lineAA(by,9.));
  float fade=smoothstep(1.5,9.,100./uPx);
  vec3 blk=mix(vec3(.8,.64,.52),vec3(.7,.71,.76),h21(floor(p/100.)+3.)); blk=mix(blk,vec3(.5,.62,.4),step(.8,h21(floor(p/100.)+8.))*.8);
  vec3 uc=mix(blk,vec3(.28,.28,.33),roads); uc=mix(vec3(.55,.52,.52),uc,fade);
  vec3 col=mix(f,uc,ur);
  float hw=max(lineAA(abs(fract(p.x/1600.+.5)-.5)*1600.,22.),lineAA(abs(fract(p.y/1600.+.5)-.5)*1600.,22.))*smoothstep(1.5,8.,1600./uPx);
  col=mix(col,vec3(.9,.82,.55),hw*.85*land);
  vec3 sea=mix(vec3(.04,.17,.33),vec3(.15,.46,.57),coast); sea+=.03*n2(p/9000.);
  col=mix(sea,col,land);
  col=mix(col,vec3(.86,.8,.6),(1.-abs(land*2.-1.))*.55*smoothstep(0.,1.,coast));
  col*=vec3(1.05,.98,.9);
  gl_FragColor=vec4(col,1.);
}`,
  });
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), m); plano.frustumCulled = false; sc.add(plano);
  const mundo = { id: "mapa", dentro: [2.5, 3.7], fuera: [5.2, 6.3], sc, mats, persona: V3(0, 0, 0), etiquetas: [] };
  mundo.render = (R, cam, h, t, vfov) => {
    const az = t * 0.025;
    cam.position.set(0, h, 0); cam.up.set(Math.sin(az), 0, Math.cos(az)); cam.near = h * 0.01; cam.far = h * 40; cam.fov = vfov; cam.updateProjectionMatrix(); cam.lookAt(0, 0, 0);
    m.uniforms.uS.value = h * 14; m.uniforms.uPx.value = (2 * h * Math.tan(THREE.MathUtils.degToRad(vfov) / 2)) / R.getSize(new THREE.Vector2()).y;
    return h;
  };
  return mundo;
}

// =====================================================================================
// MUNDO 2: la Tierra y la Luna (unidad = 1000 km)
// =====================================================================================
function mundoTierra() {
  const sc = new THREE.Scene(), mats = [], RT = 6.371;
  const sun = V3(0, 0.08, 1).normalize();
  const tierra = new THREE.Mesh(new THREE.SphereGeometry(RT, 128, 96), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uT: { value: 0 } },
    vertexShader: `varying vec3 vO, vW; void main(){ vO=normalize(position); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: `precision highp float; varying vec3 vO, vW; uniform vec3 uSun; uniform float uT;
${NOISE3}
void main(){
  vec3 n=normalize(vO); vec3 ax=normalize(vec3(.35,.25,-.2));
  float L=fbm3(n*2.3+vec3(4.,2.,7.)); L+=.5*smoothstep(.94,1.,n.y);
  float land=smoothstep(.5,.515,L), shallow=smoothstep(.42,.5,L);
  float hum=fbm3(n*5.+vec3(1.,8.,2.));
  vec3 lc=mix(vec3(.3,.45,.2),vec3(.62,.52,.32),smoothstep(.45,.7,hum)); lc=mix(lc,vec3(.2,.36,.2),smoothstep(.55,.4,hum)*.6);
  vec3 sea=mix(vec3(.02,.1,.26),vec3(.1,.36,.5),shallow);
  vec3 col=mix(sea,lc,land);
  float ice=smoothstep(.8,.92,abs(dot(n,ax))+.05*fbm3(n*8.)); col=mix(col,vec3(.93,.96,1.),ice);
  float cl=smoothstep(.52,.78,fbm3(n*3.1+vec3(uT*.004,0.,uT*.002)+vec3(9.)));
  col=mix(col,vec3(1.),cl*.88);
  vec3 N=normalize(vW); vec3 V=normalize(cameraPosition-vW);
  float d=dot(N,normalize(uSun)); float day=smoothstep(-.12,.35,d);
  vec3 lit=col*(.06+1.15*day);
  lit+=vec3(1.,.55,.3)*.18*smoothstep(.35,0.,abs(d))*col.b;
  float rim=pow(1.-max(dot(N,V),0.),3.); lit+=vec3(.35,.6,1.)*rim*(.15+.85*day);
  gl_FragColor=vec4(lit,1.);
}`,
  }));
  sc.add(tierra);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(RT * 1.03, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: { uSun: { value: sun } },
    vertexShader: `varying vec3 vW; void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: `varying vec3 vW; uniform vec3 uSun; void main(){ vec3 N=normalize(vW); vec3 V=normalize(cameraPosition-vW);
      float q=-dot(N,V); float I=pow(smoothstep(0.,.24,q),1.6); float day=smoothstep(-.3,.5,dot(N,normalize(uSun)));
      gl_FragColor=vec4(vec3(.32,.58,1.),I*.8*(.25+.75*day)); }`,
  }));
  sc.add(atm);
  const luna = new THREE.Mesh(new THREE.SphereGeometry(1.737, 48, 32), new THREE.MeshLambertMaterial({ color: "#b9b6ae" }));
  const lunaPos = V3(0.55, 0.22, 0.8).normalize().multiplyScalar(384.4); luna.position.copy(lunaPos); sc.add(luna);
  const luz = new THREE.DirectionalLight("#fff3e0", 2.6); luz.position.copy(sun); sc.add(luz); sc.add(new THREE.AmbientLight("#223", 0.4));
  const estrellas = cielo(mats, 5, 2600); sc.add(estrellas);
  const mundo = { id: "tierra", dentro: [5.2, 6.3], fuera: [9.8, 10.8], sc, mats, persona: V3(0, RT, 0),
    etiquetas: [{ p: lunaPos, txt: "LA LUNA", d0: 40, d1: 9000 }] };
  mundo.render = (R, cam, h, t, vfov) => {
    const hu = h / 1e6, az = t * 0.02, s = sm(-1, 1.6, Math.log10(hu));
    const target = V3(0, RT * (1 - s), 0);
    orbita(cam, target, Math.max(hu + RT * s, 0.00002), mix(1.5, 1.02, sm(0.5, 2.4, Math.log10(hu))), az, vfov);
    tierra.material.uniforms.uT.value = t;
    estrellas.position.copy(cam.position); estrellas.scale.setScalar(cam.far * 0.4);
    return cam.position.distanceTo(target);
  };
  return mundo;
}

// =====================================================================================
// MUNDO 3: el sistema solar (unidad = 1 millón de km). La Tierra está en el origen.
// =====================================================================================
function mundoSistema() {
  const sc = new THREE.Scene(), mats = [], r = rng(31), U = 1e9, S = V3(0, 0, AU / U);
  const cuerpos = [ // [nombre, radio órbita (UA), radio cuerpo (millones de km), color, grados]
    ["MERCURIO", 0.387, 0.0049, "#b9a99a", 40], ["VENUS", 0.723, 0.0121, "#e8cf9d", 250], ["TIERRA", 1, 0.0128, "#5aa2ff", 180],
    ["MARTE", 1.524, 0.0068, "#e0764f", 95], ["JÚPITER", 5.203, 0.14, "#e6c9a0", 20], ["SATURNO", 9.537, 0.116, "#ead7a4", 300],
    ["URANO", 19.19, 0.051, "#a7e1e8", 130], ["NEPTUNO", 30.07, 0.049, "#6f8cff", 210],
  ];
  const pos = [], size = [], mn = [], col = [], et = [];
  pos.push(S.x, S.y, S.z); size.push(1.39); mn.push(46); col.push(1, 0.86, 0.6);
  et.push({ p: S.clone(), txt: "EL SOL", d0: 20, d1: 5e5 });
  for (const [nom, ua, rad, c, g] of cuerpos) {
    const a = THREE.MathUtils.degToRad(g), p = V3(Math.sin(a) * ua * AU / U, 0, S.z + Math.cos(a) * ua * AU / U);
    if (nom === "TIERRA") p.set(0, 0, 0);
    pos.push(p.x, p.y, p.z); size.push(rad * 2); mn.push(nom === "TIERRA" ? 0 : 6); col.push(...col3(c));
    if (nom !== "TIERRA") et.push({ p, txt: nom, d0: 8, d1: ua > 4 ? 3e4 : 1500 });
    const pts = []; for (let k = 0; k <= 256; k++) { const th = (k / 256) * Math.PI * 2; pts.push(V3(Math.sin(th) * ua * AU / U, 0, S.z + Math.cos(th) * ua * AU / U)); }
    sc.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#6b7ba8", transparent: true, opacity: 0.35, depthWrite: false })));
  }
  sc.add(puntos(mats, new Float32Array(pos), new Float32Array(size), new Float32Array(mn), new Float32Array(col)));
  // cinturón de asteroides y de Kuiper
  const anillo = (n, r0, r1, c, tam) => { const p = new Float32Array(n * 3), cc = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, rr = (r0 + (r1 - r0) * r()) * AU / U; p.set([Math.sin(a) * rr, (r() - 0.5) * rr * 0.04, S.z + Math.cos(a) * rr], i * 3); cc.set(col3(c, 0.5 + r() * 0.5), i * 3); } return puntos(mats, p, tam, 1.2, cc, 0.9); };
  sc.add(anillo(2500, 2.1, 3.3, "#b8a58f", 0.01)); sc.add(anillo(3500, 30, 50, "#9fb2d0", 0.3));
  const estrellas = cielo(mats, 7, 2200, 0.8); sc.add(estrellas);
  // halo del Sol
  const mundo = { id: "sistema", dentro: [9.8, 10.8], fuera: [13.2, 14.0], sc, mats, persona: V3(0, 0, 0), etiquetas: et };
  mundo.render = (R, cam, h, t, vfov) => {
    const hu = h / U, s = sm(10.2, 12.2, Math.log10(h));
    const target = S.clone().multiplyScalar(s);
    orbita(cam, target, Math.max(hu, 0.01) + S.z * s * 0.0, mix(1.5, 1.05, sm(10, 12.5, Math.log10(h))), t * 0.015 + 0.3, vfov);
    estrellas.position.copy(cam.position); estrellas.scale.setScalar(cam.far * 0.4);
    return cam.position.distanceTo(target);
  };
  return mundo;
}

// =====================================================================================
// MUNDO 4: el vecindario estelar (unidad = 1 año luz)
// =====================================================================================
function mundoVecindario() {
  const sc = new THREE.Scene(), mats = [], r = rng(77), N = 7000;
  const pos = new Float32Array(N * 3 + 3), size = new Float32Array(N + 1), mn = new Float32Array(N + 1), col = new Float32Array(N * 3 + 3);
  pos.set([0, 0, 0], 0); size[0] = 0.00006; mn[0] = 14; col.set([1, 0.88, 0.64], 0);
  const tem = (u) => (u < 0.1 ? [0.65, 0.78, 1] : u < 0.45 ? [1, 0.96, 0.9] : u < 0.8 ? [1, 0.82, 0.6] : [1, 0.6, 0.42]);
  for (let i = 1; i <= N; i++) {
    const rr = 0.3 * Math.pow(1300, Math.pow(r(), 0.8)), z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z), b = 0.35 + r() * r() * 0.65;
    pos.set([s * Math.cos(a) * rr, z * rr * 0.9, s * Math.sin(a) * rr], i * 3);
    size[i] = 0.002 + r() * r() * 0.03; mn[i] = 1.3 + r() * r() * 2.2; col.set(tem(r()).map((x) => x * b), i * 3);
  }
  sc.add(puntos(mats, pos, size, mn, col));
  const nombrar = (txt, dist, d0, d1, dir) => { const v = dir.normalize().multiplyScalar(dist); return { p: v, txt, d0, d1 }; };
  const et = [nombrar("PRÓXIMA CENTAURI", 4.24, 0.4, 40, V3(0.6, 0.15, -0.8)), nombrar("SIRIO", 8.6, 2, 90, V3(-0.7, 0.35, -0.5)), nombrar("VEGA", 25, 6, 220, V3(0.2, 0.5, 0.8))];
  const dst = new Float32Array(et.length * 3), dsz = new Float32Array(et.length).fill(0.01), dmn = new Float32Array(et.length).fill(4), dco = new Float32Array(et.length * 3);
  et.forEach((e, i) => { dst.set([e.p.x, e.p.y, e.p.z], i * 3); dco.set([0.9, 0.95, 1], i * 3); });
  sc.add(puntos(mats, dst, dsz, dmn, dco));
  const estrellas = cielo(mats, 9, 1800, 0.5); sc.add(estrellas);
  const mundo = { id: "vecindario", dentro: [13.2, 14.0], fuera: [18.0, 18.9], sc, mats, persona: V3(0, 0, 0), etiquetas: et };
  mundo.render = (R, cam, h, t, vfov) => {
    orbita(cam, V3(0, 0, 0), Math.max(h / LY, 1e-4), 1.1, t * 0.012 + 1.2, vfov);
    estrellas.position.copy(cam.position); estrellas.scale.setScalar(cam.far * 0.4);
    return h / LY;
  };
  return mundo;
}

// =====================================================================================
// MUNDO 5: la Vía Láctea (unidad = 1000 años luz)
// =====================================================================================
export function geometriaGalaxia(mats, semilla = 5) {
  const r = rng(semilla), N = 110000, B = 14000, T = N + B, pos = new Float32Array(T * 3), size = new Float32Array(T), mn = new Float32Array(T), col = new Float32Array(T * 3);
  const tan = Math.tan(THREE.MathUtils.degToRad(13));
  for (let i = 0; i < N; i++) {
    const rr = Math.min(52, 1.2 + -Math.log(1 - r() * 0.985) * 11), arm = Math.floor(r() * 4);
    let th = Math.log(rr / 1.5) / tan * 0.9 + arm * Math.PI / 2 + gauss(r) * (0.16 + 0.35 / (1 + rr * 0.3));
    pos.set([Math.cos(th) * rr, gauss(r) * 0.25 * (1 + 1 / (1 + rr * 0.2)), Math.sin(th) * rr], i * 3);
    const b = 0.25 + r() * r() * 0.9, w = r(), cen = Math.exp(-rr / 9);
    col.set(w < 0.55 ? [0.62 * b + 0.3 * cen, 0.75 * b + 0.15 * cen, b] : [b, 0.88 * b, 0.7 * b], i * 3);
    size[i] = 0.14 + r() * 0.35; mn[i] = 1;
  }
  for (let i = N; i < T; i++) {
    const rr = Math.abs(gauss(r)) * 3.3 + 0.1, z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(a) * rr, z * rr * 0.55, s * Math.sin(a) * rr], i * 3);
    const b = 0.35 + r() * 0.65; col.set([b, 0.78 * b, 0.5 * b], i * 3); size[i] = 0.2 + r() * 0.4; mn[i] = 1.1;
  }
  return puntos(mats, pos, size, mn, col, 0.78);
}
function mundoGalaxia() {
  const sc = new THREE.Scene(), mats = [], r = rng(81), SOL = V3(26, 0, 0);
  const gal = geometriaGalaxia(mats); sc.add(gal);
  // estrellas de la vecindad (para que el cambio desde el mundo anterior sea continuo)
  const n = 7000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p.set([SOL.x + gauss(r) * 0.22, gauss(r) * 0.09, SOL.z + gauss(r) * 0.22], i * 3); const b = 0.3 + r() * r() * 0.7; c.set([b, b * 0.93, b * 0.82], i * 3); }
  const vecinos = puntos(mats, p, 0.006, 1.2, c, 0.9); sc.add(vecinos);
  const est = cielo(mats, 13, 1500, 0.35); sc.add(est);
  const mundo = { id: "galaxia", dentro: [18.0, 18.9], fuera: [21.2, 22.3], sc, mats, vecinos, persona: SOL, etiquetas: [{ p: V3(0, 0, 0), txt: "EL CENTRO DE LA GALAXIA", d0: 25, d1: 800 }] };
  mundo.render = (R, cam, h, t, vfov) => {
    const d = h / (LY * 1000), s = sm(Math.log10(0.2), Math.log10(60), Math.log10(d));
    const target = SOL.clone().multiplyScalar(1 - s);
    orbita(cam, target, Math.max(d, 1e-4), mix(1.05, 0.95, s), t * 0.01 + 0.4, vfov);
    gal.rotation.y = 0; est.position.copy(cam.position); est.scale.setScalar(cam.far * 0.4);
    return d;
  };
  return mundo;
}

// =====================================================================================
// MUNDO 6: el universo (unidad = 1 millón de años luz): grupo local, cúmulos, la telaraña cósmica
// =====================================================================================
function mundoUniverso() {
  const sc = new THREE.Scene(), mats = [], r = rng(97), RU = 46000;
  // telaraña cósmica: nodos (cúmulos) unidos por filamentos a sus 4 vecinos más cercanos
  const nodos = [];
  for (let i = 0; i < 900; i++) {
    const rr = i < 260 ? 3 * Math.pow(RU / 3, Math.pow(r(), 0.9)) : RU * Math.cbrt(r()), zz = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - zz * zz);
    nodos.push(V3(q * Math.cos(a) * rr, zz * rr, q * Math.sin(a) * rr));
  }
  const vec = nodos.map((n, i) => nodos.map((m, j) => [n.distanceToSquared(m), j]).sort((x, y) => x[0] - y[0]).slice(1, 5).map((x) => x[1]));
  const N = 125000, pos = new Float32Array(N * 3), size = new Float32Array(N).fill(0.015), mn = new Float32Array(N), col = new Float32Array(N * 3);
  let k = 0;
  const poner = (x, y, z, brillo, minpx) => {
    pos.set([x, y, z], k * 3); const w = r(), b = brillo * (0.45 + r() * 0.55);
    col.set(w < 0.3 ? [b * 0.8, b * 0.9, b] : w < 0.75 ? [b, b * 0.93, b * 0.82] : [b, b * 0.72, b * 0.5], k * 3); mn[k] = minpx + r() * r() * 1.2; k++;
  };
  for (let i = 0; i < 55000; i++) { const a = Math.floor(r() * nodos.length), b = vec[a][Math.floor(r() * 4)], A = nodos[a], B = nodos[b], t = r(), sg = 60 + 0.02 * A.distanceTo(B); poner(mix(A.x, B.x, t) + gauss(r) * sg, mix(A.y, B.y, t) + gauss(r) * sg, mix(A.z, B.z, t) + gauss(r) * sg, 0.85, 1.1); }
  for (let i = 0; i < 30000; i++) { const A = nodos[Math.floor(r() * nodos.length)], sg = 25 + 0.012 * A.length(); poner(A.x + gauss(r) * sg, A.y + gauss(r) * sg, A.z + gauss(r) * sg, 1, 1.4); }
  for (let i = 0; i < 25000; i++) { const rr = 1.2 * Math.pow(3000 / 1.2, Math.pow(r(), 0.85)), zz = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - zz * zz); poner(q * Math.cos(a) * rr, zz * rr, q * Math.sin(a) * rr, 0.9, 1.1); }
  for (; k < N;) { const rr = RU * Math.cbrt(r()), zz = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - zz * zz); poner(q * Math.cos(a) * rr, zz * rr, q * Math.sin(a) * rr, 0.6, 1); }
  sc.add(puntos(mats, pos, size, mn, col, 1));
  // la Vía Láctea y Andrómeda, a escala (la misma galaxia, 1000 veces más chica)
  const g1 = geometriaGalaxia(mats, 5); g1.scale.setScalar(0.001); sc.add(g1);
  const g2 = geometriaGalaxia(mats, 21); g2.scale.setScalar(0.0014); g2.position.copy(V3(1.5, 0.6, -2).normalize().multiplyScalar(2.5)); g2.rotation.set(1.1, 0.5, 0.4); sc.add(g2);
  const nm = (txt, mly, dir, d0, d1) => ({ p: dir.normalize().multiplyScalar(mly), txt, d0, d1 });
  const et = [{ p: g2.position.clone(), txt: "ANDRÓMEDA", d0: 0.6, d1: 25 }, nm("CÚMULO DE VIRGO", 54, V3(-0.5, 0.7, 0.4), 12, 500), nm("LA GRAN MURALLA", 1000, V3(0.7, -0.3, 0.6), 160, 9000)];
  const dst = new Float32Array(et.length * 3).fill(0), dsz = new Float32Array(et.length).fill(0.02), dmn = new Float32Array(et.length).fill(5), dco = new Float32Array(et.length * 3).fill(1);
  et.forEach((e, i) => dst.set([e.p.x, e.p.y, e.p.z], i * 3)); sc.add(puntos(mats, dst, dsz, dmn, dco, 0.9));
  const mundo = { id: "universo", dentro: [21.2, 22.3], fuera: [99, 100], sc, mats, persona: V3(0, 0, 0), etiquetas: et };
  mundo.render = (R, cam, h, t, vfov) => {
    const d = h / (LY * 1e6);
    orbita(cam, V3(0, 0, 0), Math.max(d, 1e-3), mix(0.9, 0.6, sm(0, 3, Math.log10(d) + 0.2)), t * 0.012 + 2.0, vfov);
    return d;
  };
  return mundo;
}

// =====================================================================================
// El viaje: compone los mundos según la altura (m) y devuelve el cuadro + las etiquetas
// =====================================================================================
export class Viaje {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.gl = document.createElement("canvas"); this.gl.width = W; this.gl.height = H;
    this.r = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.r.setPixelRatio(1); this.r.setSize(W, H, false); this.r.setClearColor(0x000000, 1);
    this.out = document.createElement("canvas"); this.out.width = W; this.out.height = H; this.c = this.out.getContext("2d");
    this.cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 1e6);
    this.vfov = W < H ? 78 : 58;
    this.mundos = [mundoCalle(), mundoMapa(), mundoTierra(), mundoSistema(), mundoVecindario(), mundoGalaxia(), mundoUniverso()];
  }
  peso(m, lh) { return sm(m.dentro[0], m.dentro[1], lh) * (1 - sm(m.fuera[0], m.fuera[1], lh)); }
  dibujar(h, t) {
    const lh = lg(h), c = this.c, esc = this.H / (2 * Math.tan(THREE.MathUtils.degToRad(this.vfov) / 2));
    c.globalAlpha = 1; c.fillStyle = "#000"; c.fillRect(0, 0, this.W, this.H);
    const etiquetas = []; let primero = true, dom = null, domW = 0;
    for (const m of this.mundos) {
      const w = this.peso(m, lh); if (w < 0.004) continue;
      const dist = m.render(this.r, this.cam, h, t, this.vfov, this.W / this.H);
      for (const mt of m.mats) { mt.uniforms.uEsc.value = esc; if (m.id === "universo") mt.uniforms.uFade.value = dist * 0.05; }
      if (m.id === "galaxia" && m.vecinos) { m.vecinos.material.uniforms.uFade.value = dist * 0.012; m.vecinos.material.uniforms.uC.value.copy(m.persona); }
      this.r.render(m.sc, this.cam); this.cam.updateMatrixWorld();
      c.globalAlpha = primero ? 1 : w; c.drawImage(this.gl, 0, 0); primero = false;
      if (w > domW) { domW = w; dom = m.id; }
      for (const e of m.etiquetas || []) {
        const a = w * sm(e.d0 * 0.5, e.d0, dist) * (1 - sm(e.d1, e.d1 * 2, dist)); if (a < 0.02) continue;
        const v = e.p.clone().project(this.cam); if (v.z > 1 || Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.96) continue;
        etiquetas.push({ x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, txt: e.txt, a });
      }
      if (m.persona) {
        const wt = w * (1 - sm(9.8, 10.6, lh)) * sm(1.2, 2.2, lh); if (wt > 0.02 && m.id !== "vecindario") {
          const v = m.persona.clone().project(this.cam);
          if (v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2) etiquetas.push({ x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, txt: "TÚ", a: wt, anillo: true });
        }
      }
    }
    c.globalAlpha = 1;
    return { canvas: this.out, etiquetas, mundo: dom };
  }
}
