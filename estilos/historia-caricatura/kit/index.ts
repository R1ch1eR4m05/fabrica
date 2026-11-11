// Punto de entrada del paquete 3D del estilo historia-caricatura.
// Junta three.js, postprocessing y las piezas del kit de LuisPa / Mr omi (MIT, ver LICENSE-kit.txt).
export * as THREE from "three";
export { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction } from "postprocessing";
export * from "./toon";
export * from "./troop";
export * from "./cardshade";
export * from "./shade";
export * from "./lights";
export * from "./paint";
export * from "./ink";
export * from "./lensblur";
export * from "./grade";
export * from "./crowd";
