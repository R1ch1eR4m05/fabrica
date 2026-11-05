// Preparación del estilo Mapas: descarga las teselas de satélite que el video va a mostrar (solo en el look "Satélite").
// Capa: Sentinel-2 cloudless 2016 de EOX (CC BY 4.0, crédito obligatorio). Las capas de años posteriores son NO comerciales: no las uses.
// Se guardan en cache/teselas/ y se reutilizan entre videos.
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.js";
import { leer, guardar } from "./proyectos.js";

const URL_EOX = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`;
export const DIR_TESELAS = path.join(RAIZ, "cache", "teselas");
export const CREDITO_EOX = "Satélite: Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0.";

export async function prepararMapa(id, avisar = () => {}, { abrirPagina, nav, base, fmt }) {
  const p = leer(id, "proyecto.json");
  if ((p.opciones || {}).mapa !== "satelite") return { teselas: 0 };
  const pag = await abrirPagina(nav, base, p, fmt);
  const lista = await pag.evaluate(() => window.__teselas());
  await pag.close();
  const faltan = lista.filter((k) => !fs.existsSync(path.join(DIR_TESELAS, k + ".jpg")));
  let hechas = 0, fallos = 0;
  const trabajar = async () => {
    while (faltan.length) {
      const k = faltan.pop(); const [z, x, y] = k.split("/").map(Number);
      try {
        const r = await fetch(URL_EOX(z, x, y), { signal: AbortSignal.timeout(20000) });
        if (r.ok) { const f = path.join(DIR_TESELAS, k + ".jpg"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
        else fallos++;
      } catch { fallos++; }
      hechas++;
      if (hechas % 20 === 0) avisar({ paso: "render", progreso: 0, msg: `Bajando mapa de satélite: ${hechas} de ${hechas + faltan.length}` });
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajar));
  const fondo = leer(id, "fondo.json") || {};
  guardar(id, "fondo.json", { ...fondo, credito: CREDITO_EOX });
  if (fallos > lista.length * 0.3) throw new Error(`No pude bajar ${fallos} teselas de satélite (¿sin internet?). Prueba el look "Plano" o "Papel".`);
  return { teselas: lista.length, nuevas: hechas, fallos };
}
