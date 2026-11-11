// Instanced crowd for the 100,000: one quad per soldier, spherical billboards built in the vertex shader, each
// instance picks a tile of a painted atlas (the same toon drawings as the cards, drawn once at 160 x 267).
import * as THREE from "three";
import { Pen, bodyFront, Outfit, FrontOpts } from "./toon";
import { NOINK } from "./ink";

const TW = 160, TH = 267, K = TW / 600;
export const atlas = (outfits: Outfit[], light: number, extra?: (i: number) => Partial<FrontOpts>) => {
  const cols = 4, rows = Math.ceil(outfits.length / cols);
  const cv = document.createElement("canvas"); cv.width = cols * TW; cv.height = rows * TH;
  const g = cv.getContext("2d")!;
  outfits.forEach((o, i) => {
    g.setTransform(K, 0, 0, K, (i % cols) * TW, Math.floor(i / cols) * TH);
    bodyFront(new Pen(g), o, { mode: "stand", expr: i % 3 ? "neutral" : "stern", light, seed: (i % 7) + 1, ...(extra ? extra(i) : {}) });
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { tex: t, cols, rows, n: outfits.length };
};

export class Crowd {
  mesh: THREE.InstancedMesh;
  shift = { value: new THREE.Vector3() };
  constructor(parent: THREE.Object3D, at: ReturnType<typeof atlas>, pts: { x: number; z: number }[], seed = 1) {
    const h = 2.16, w = h * 0.6;
    const geo = new THREE.PlaneGeometry(w, h).translate(0, h * 0.475, 0);
    const tiles = new Float32Array(pts.length * 2);
    pts.forEach((_, i) => {
      const k = Math.floor(Math.abs(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453) % at.n);
      tiles[i * 2] = (k % at.cols) / at.cols; tiles[i * 2 + 1] = 1 - (Math.floor(k / at.cols) + 1) / at.rows;
    });
    geo.setAttribute("aTile", new THREE.InstancedBufferAttribute(tiles, 2));
    const mat = new THREE.MeshBasicMaterial({ map: at.tex, alphaTest: 0.4, alphaToCoverage: true, color: new THREE.Color(0.86, 0.86, 0.86), side: THREE.DoubleSide });
    const tileSize = { value: new THREE.Vector2(1 / at.cols, 1 / at.rows) }, shift = this.shift;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTileSize = tileSize; sh.uniforms.uShift = shift;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aTile;\nuniform vec2 uTileSize;\nuniform vec3 uShift;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * uTileSize + aTile;\n#endif")
        .replace("#include <project_vertex>", `vec4 mvPosition = modelViewMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0) + vec4(uShift, 0.0));
mvPosition.xy += position.xy;
gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => "crowd1";
    this.mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => this.mesh.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z)));
    this.mesh.frustumCulled = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
}
