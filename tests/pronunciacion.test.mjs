import test from "node:test";
import assert from "node:assert/strict";
import { paraDecir, PRONUNCIACION_BASE } from "../core/voz.js";

test("la voz dice la forma del diccionario y los subtítulos guardan la escrita", () => {
  const { dicho, mapa } = paraDecir("Somos «SRYLED», la marca: sryled. Hola", PRONUNCIACION_BASE);
  assert.equal(dicho, "Somos «Ese-erre-i-led», la marca: Ese-erre-i-led. Hola");
  assert.deepEqual(mapa.map((p) => p.w), ["Somos", "«SRYLED»,", "la", "marca:", "sryled.", "Hola"]);
  assert.equal(dicho.slice(mapa[1].i, mapa[1].f + 1), "«Ese-erre-i-led»,");
});
