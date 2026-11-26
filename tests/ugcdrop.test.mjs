import test from "node:test";
import assert from "node:assert/strict";
import { cargar, elegirLote, contar, generarAutomaticas } from "../core/ugcdrop.js";

const datosLimpios = () => ({ ...cargar(), registro: { entregados: [] } });

test("todas las combinaciones usan escenas del catálogo", () => {
  const d = cargar();
  assert.equal(d.combos.length, 239);
  for (const c of d.combos) for (const e of c.escenas) assert.ok(d.porCodigo[e], `${c.id} usa ${e}`);
});

test("un lote de 5 mezcla estilos y no repite gancho", () => {
  const lote = elegirLote(datosLimpios(), 5, { semilla: 7 });
  assert.equal(lote.length, 5);
  assert.equal(lote.filter((a) => a.estilo === "realista").length, 4); // 70 % de 5 ≈ 4
  assert.equal(new Set(lote.map((a) => a.escenas[0])).size, 5);
  for (const a of lote) assert.ok(a.textoGancho && a.copy && a.titular && a.cta);
});

test("una combinación entregada vuelve a salir con OTRO texto de gancho", () => {
  const d = datosLimpios();
  const [a] = elegirLote(d, 1, { combos: ["UG064"] });
  d.registro.entregados.push({ id: a.id, combo: a.combo, variante: a.variante, estado: "entregado" });
  const [b] = elegirLote(d, 1, { combos: ["UG064"] });
  assert.equal(b.variante, 2);
  assert.notEqual(a.textoGancho, b.textoGancho);
});

test("filtros de estilo y tema", () => {
  const d = datosLimpios();
  assert.ok(elegirLote(d, 6, { estilo: "animado" }).every((a) => a.estilo === "animado"));
  assert.ok(elegirLote(d, 4, { tema: "noche" }).every((a) => a.tema === "noche"));
});

test("las automáticas no duplican las curadas y el conteo cuadra", () => {
  const d = cargar();
  const curadas = new Set(d.combos.map((c) => c.escenas.join(" ")));
  for (const c of generarAutomaticas(d.escenas, d.combos)) assert.ok(!curadas.has(c.escenas.join(" ")));
  const c = contar({ ...d, registro: { entregados: [] } });
  assert.ok(c.posibles > 1000);
});
