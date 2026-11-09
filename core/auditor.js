// Auditor de escenas: mira cada clip o imagen generada (3 cuadros por clip) junto con lo que pedía el guion y la imagen
// de los personajes, y marca las que salieron mal (cara distinta, personajes de más o de menos, manos o rostros deformes,
// texto, no corresponde a lo que dice la voz). Deja clips/auditoria.json con el problema y una corrección en inglés para
// rehacerla en Flow. No gasta créditos de Flow: usa Gemini (gratis) o Claude.
import fs from "node:fs";
import path from "node:path";
import { leer, textoEscena } from "./proyectos.js";
import { dirClips, clipDeEscena } from "./historia.js";
import { ffmpeg, duracion } from "./ff.js";
import { pedir, jsonDe, hayIA } from "./llm.js";

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const POR_LLAMADA = 5;

const SISTEMA = `Eres el supervisor de calidad de una serie de clips hechos con IA para un video narrado (historias de familia, estilo animación 3D tipo Pixar u otro).
Para cada escena recibes: lo que dice la voz, lo que se pidió a la IA (prompt) y 1 a 3 cuadros del clip (inicio, mitad, final). Puede venir antes una imagen de referencia de los personajes.
Marca una escena como mala SOLO si un espectador lo notaría:
- un personaje no se parece a la referencia o cambia entre cuadros (cara, edad, peinado, ropa, tono de piel);
- hay personajes de más o de menos, o el niño/la niña cambian de sexo o edad;
- caras, manos, ojos o cuerpos deformes, fundidos o duplicados; objetos que atraviesan cuerpos;
- aparece texto, letras, logos o marcas de agua;
- la imagen no corresponde a lo que dice la voz o a lo que pidió el prompt (acción, lugar, emoción);
- encuadre roto (personaje cortado a la mitad sin intención, cuadro negro o vacío).
No marques detalles mínimos ni cuestiones de gusto.
Devuelve SOLO JSON: {"escenas":[{"n":número,"ok":true|false,"gravedad":"alta"|"media","problema":"en español, corto y concreto (qué está mal y en qué cuadro)","correccion":"en inglés, 1-2 frases que se añaden al prompt para que salga bien (sé específico: quién, cuántos, cómo)"}]}
Incluye todas las escenas que recibiste, también las que están bien (ok:true, sin problema).`;

const imgBloque = (f) => ({ type: "image", source: { type: "base64", media_type: /\.png$/i.test(f) ? "image/png" : "image/jpeg", data: fs.readFileSync(f).toString("base64") } });

async function cuadros(archivo, tmp, n) {
  if (!VIDEO.test(archivo)) {
    const out = path.join(tmp, `e${n}-0.jpg`);
    await ffmpeg(["-i", archivo, "-vf", "scale=448:-2", "-q:v", "4", out]);
    return [out];
  }
  const d = await duracion(archivo).catch(() => 0);
  const ts = d > 0 ? [0.15, 0.5, 0.88].map((x) => x * d) : [0];
  const outs = [];
  for (const [i, t] of ts.entries()) {
    const out = path.join(tmp, `e${n}-${i}.jpg`);
    await ffmpeg(["-ss", t.toFixed(2), "-i", archivo, "-frames:v", "1", "-vf", "scale=448:-2", "-q:v", "4", out]).catch(() => {});
    if (fs.existsSync(out)) outs.push(out);
  }
  return outs;
}

export async function auditarEscenas(id, avisar = () => {}) {
  if (!hayIA()) throw new Error("El auditor necesita GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el .env.");
  const g = leer(id, "guion.json"); if (!g?.escenas?.length) throw new Error("No hay guion.");
  const dir = dirClips(id), tmp = path.join(dir, "_auditor");
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const lista = g.escenas.map((e, k) => ({ e, n: k + 1, f: clipDeEscena(id, k + 1) })).filter((x) => x.f && !x.e.misma);
  if (!lista.length) throw new Error("Todavía no hay clips que revisar.");
  const ref = fs.existsSync(dir) && fs.readdirSync(dir).find((x) => /^personajes\.(png|jpe?g|webp)$/i.test(x));
  const resultado = {};
  try {
    for (let i = 0; i < lista.length; i += POR_LLAMADA) {
      const grupo = lista.slice(i, i + POR_LLAMADA);
      avisar({ paso: "fondo", progreso: 0.05 + (0.9 * i) / lista.length, msg: `Auditor: revisando escenas ${grupo[0].n}–${grupo[grupo.length - 1].n} de ${lista.length}…` });
      const bloques = [];
      if (ref) bloques.push({ type: "text", text: "Imagen de referencia de los personajes:" }, imgBloque(path.join(dir, ref)));
      if (g.personajes) bloques.push({ type: "text", text: `Personajes del guion: ${g.personajes}` });
      if (g.estiloVisual) bloques.push({ type: "text", text: `Estilo visual: ${g.estiloVisual}` });
      for (const x of grupo) {
        bloques.push({ type: "text", text: `ESCENA ${x.n}\nVoz: ${textoEscena(x.e)}\nPrompt: ${x.e.flowPrompt || x.e.buscar || ""}\nCuadros:` });
        for (const c of await cuadros(x.f, tmp, x.n)) bloques.push(imgBloque(c));
      }
      let j;
      try { j = jsonDe((await pedir(SISTEMA, bloques, { maxTokens: 3000 })).texto); }
      catch (e) { for (const x of grupo) resultado[x.n] = { ok: null, problema: `No se pudo revisar: ${e.message.slice(0, 120)}` }; continue; }
      for (const r of j.escenas || []) if (grupo.some((x) => x.n === +r.n) && r.ok === false) resultado[+r.n] = { ok: false, gravedad: r.gravedad || "media", problema: String(r.problema || ""), correccion: String(r.correccion || "") };
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const info = { fecha: new Date().toISOString(), revisadas: lista.length, escenas: resultado };
  fs.writeFileSync(path.join(dir, "auditoria.json"), JSON.stringify(info, null, 2));
  const malas = Object.values(resultado).filter((r) => r.ok === false).length;
  avisar({ paso: "fondo", progreso: 1, msg: malas ? `Auditor: ${malas} de ${lista.length} escenas salieron mal. Están marcadas en rojo; dale «Rehacer las marcadas».` : `Auditor: las ${lista.length} escenas se ven bien.` });
  return info;
}
