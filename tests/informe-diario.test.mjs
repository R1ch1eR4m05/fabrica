// node --test tests/   (pruebas del módulo que convierte el informe de la mañana en el plan del día)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { numero, multiplicador, parsearInforme, planDelDia, SIN_CIFRAS } from "../core/informe-diario.js";

const md = fs.readFileSync(new URL("./fixtures/informe-ejemplo.md", import.meta.url), "utf8");

test("números: miles con coma o punto, K/M y '?' como desconocido", () => {
  assert.equal(numero("83,053"), 83053); assert.equal(numero("83.053"), 83053); assert.equal(numero("13.6K"), 13600);
  assert.equal(numero("?"), null); assert.equal(numero("??"), null);
  assert.deepEqual(multiplicador("28-110x su normal"), { min: 28, max: 110 }); assert.deepEqual(multiplicador("~32x"), { min: 32, max: 32 });
});

test("lee las 5 secciones del informe", () => {
  const inf = parsearInforme(md);
  assert.equal(inf.publicaciones.length, 6); assert.equal(inf.propuestas.length, 6); assert.equal(inf.loQueViene.length, 3);
  assert.ok(inf.cuentasNuevas.some((c) => c.cuenta === "@placerfilosofico"));
});

test("'?' en vistas/guardados/compartidos es desconocido, no cero", () => {
  const p = parsearInforme(md).publicaciones[0];
  assert.equal(p.vistas, null); assert.equal(p.guardados, null); assert.deepEqual(p.desconocidos, ["vistas", "guardados", "compartidos"]);
  assert.equal(parsearInforme(md).publicaciones[1].guardados, 2100);
});

test("pico relativo: el de la nota y el derivado del promedio de la cuenta", () => {
  const ps = parsearInforme(md).publicaciones;
  assert.equal(ps[0].pico, 32); assert.equal(ps[1].pico, 28); // rango → el mínimo (conservador)
  assert.equal(ps[2].pico, Math.round((55418 / (83053 / 32)) * 10) / 10); // misma cuenta: 55,418 / su promedio
});

test("YouTube en español sin cifras: no se asume viral", () => {
  const yt = parsearInforme(md).publicaciones[5];
  assert.equal(yt.sinCifras, SIN_CIFRAS); assert.equal(yt.pico, null);
});

test("ranking: los 3 picos en español primero; el partidista se descarta aunque tenga 50-250x", () => {
  const plan = planDelDia(md);
  assert.deepEqual(plan.ranking.slice(0, 3).map((x) => x.n), [1, 2, 3]);
  assert.ok(plan.descartadas.some((x) => x.n === 4 && /riesgo/.test(x.motivo)));
  assert.ok(!plan.videos.some((v) => v.base.n === 4));
});

test("salida: exactamente 5 videos (3 Shorts, 1 largo del ganador, 1 experimento de LO QUE VIENE)", () => {
  const plan = planDelDia(md);
  assert.equal(plan.videos.length, 5);
  assert.deepEqual(plan.videos.map((v) => v.tipo), ["short", "short", "short", "largo", "experimento"]);
  assert.equal(plan.videos[3].base.n, plan.videos[0].base.n); // el largo sale del Short ganador
  assert.equal(plan.videos[3].estilo, "filosofia-larga"); assert.equal(plan.videos[3].formato, "16:9");
  assert.equal(plan.videos[4].base.n, 5); // diagrama de flujo (en inglés, aún no llega)
});

test("sin picos claros: se dice y se repite el mejor formato de la semana", () => {
  const plano = md.replace(/~32x su promedio/, "normal").replace(/28-110x su normal/, "normal").replace(/~6x su normal/, "normal");
  const plan = planDelDia(plano, { mejorDeLaSemana: { n: 99, frase: "Mejor de la semana" } });
  assert.ok(plan.avisos.some((a) => /no hay picos claros/.test(a)));
  assert.equal(plan.videos[0].base.n, 99);
});
