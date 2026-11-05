// Mezcla final de audio: voz + ambiente + efectos.
// Los sonidos se sintetizan aquí mismo con ffmpeg (sin licencias que citar).
// Un estilo puede traer su propia música en estilos/<id>/musica/ (y su CREDITOS.txt).
import fs from "node:fs";
import path from "node:path";
import { DIR_ESTILOS } from "./config.js";
import { ffmpeg } from "./ff.js";

const SR = 44100;

const SINTE = {
  // ambientes (se generan con la duración del video)
  oscuro: (d) => [
    "-f", "lavfi", "-i", `aevalsrc='0.22*sin(2*PI*55*t)*(0.6+0.4*sin(2*PI*0.07*t))+0.15*sin(2*PI*82.41*t+0.8*sin(2*PI*0.13*t))+0.06*sin(2*PI*110.6*t)*(0.5+0.5*sin(2*PI*0.031*t))':s=${SR}:d=${d}`,
    "-f", "lavfi", "-i", `anoisesrc=c=brown:a=0.10:r=${SR}:d=${d}`,
    "-filter_complex", "[1]lowpass=f=300[n];[0][n]amix=inputs=2:normalize=0,afade=t=in:d=3,lowpass=f=1800[a]", "-map", "[a]",
  ],
  suave: (d) => [ // colchón tranquilo (para frases)
    "-f", "lavfi", "-i", `aevalsrc='(0.10*sin(2*PI*130.81*t)+0.08*sin(2*PI*164.81*t+0.3)+0.07*sin(2*PI*196.0*t)+0.05*sin(2*PI*246.94*t)+0.05*sin(2*PI*261.2*t))*(0.7+0.3*sin(2*PI*0.06*t))+0.03*sin(2*PI*392.4*t)*(0.5+0.5*sin(2*PI*0.11*t))':s=${SR}:d=${d}`,
    "-af", "lowpass=f=1400,aecho=0.8:0.7:420|780:0.25|0.18,afade=t=in:d=3",
  ],
  // efectos cortos
  golpe: () => [
    "-f", "lavfi", "-i", `aevalsrc='0.9*sin(2*PI*(34+46*exp(-7*t))*t)*exp(-2.4*t)':s=${SR}:d=2.6`,
    "-f", "lavfi", "-i", `anoisesrc=c=brown:a=0.6:r=${SR}:d=2.6`,
    "-filter_complex", "[1]lowpass=f=180,afade=t=out:st=0:d=1.2[n];[0][n]amix=inputs=2:normalize=0[a]", "-map", "[a]",
  ],
  estatica: () => ["-f", "lavfi", "-i", `anoisesrc=c=white:a=0.35:r=${SR}:d=0.7`, "-af", "highpass=f=1200,afade=t=in:d=0.03,afade=t=out:st=0.4:d=0.3"],
  latido: () => ["-f", "lavfi", "-i", `aevalsrc='0.9*sin(2*PI*48*t)*(exp(-18*t)+0.7*exp(-18*max(t-0.28\\,0))*gte(t\\,0.28))':s=${SR}:d=1.2`],
  susurro: () => ["-f", "lavfi", "-i", `anoisesrc=c=pink:a=0.25:r=${SR}:d=1.6`, "-af", "bandpass=f=3000:w=1800,tremolo=f=7:d=0.6,afade=t=in:d=0.4,afade=t=out:st=0.9:d=0.7"],
  whoosh: () => ["-f", "lavfi", "-i", `anoisesrc=c=pink:a=0.5:r=${SR}:d=0.9`, "-af", "bandpass=f=900:w=1400,afade=t=in:d=0.35:curve=exp,afade=t=out:st=0.35:d=0.55"],
  pop: () => ["-f", "lavfi", "-i", `aevalsrc='0.8*sin(2*PI*(520+900*exp(-30*t))*t)*exp(-14*t)':s=${SR}:d=0.35`],
  tic: () => ["-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*2400*t)*exp(-t*90)':s=${SR}:d=0.06`],
  tac: () => ["-f", "lavfi", "-i", `aevalsrc='0.45*sin(2*PI*1700*t)*exp(-t*90)':s=${SR}:d=0.06`],
  barrido: () => ["-f", "lavfi", "-i", `aevalsrc='0.4*sin(2*PI*(180*t+260*t*t))*sin(PI*t/1.2)':s=${SR}:d=1.2`],
  campana: () => ["-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*392*t)*exp(-1.4*t)+0.25*sin(2*PI*587.3*t)*exp(-2*t)+0.12*sin(2*PI*1046*t)*exp(-3*t)':s=${SR}:d=3.5`],
};
export const AMBIENTES = ["oscuro", "suave"];
export const EFECTOS = Object.keys(SINTE).filter((k) => !AMBIENTES.includes(k));

async function sintetizar(tmp, nombre, d) {
  const f = path.join(tmp, `${nombre}.wav`);
  if (!fs.existsSync(f)) await ffmpeg([...SINTE[nombre](d), "-ac", "1", "-ar", String(SR), f]);
  return f;
}

/**
 * @param estilo  objeto de estilo.json  (estilo.sonido: { ambiente, volumenAmbiente, golpesEn: [tipos] })
 * @param guion   guion.json   (escena.sfx opcional)
 * @param tiempos tiempos.json
 */
// Biblioteca de música: musica/<id del estilo>/ primero, si no musica/ (tus pistas libres de derechos; no aplica a terror).
// Cada video toma una distinta (se reparten por el nombre del proyecto, así no se repite seguido).
const DIR_MUSICA = path.join(path.dirname(DIR_ESTILOS), "musica");
const esAudio = (n) => /\.(mp3|m4a|wav|ogg)$/i.test(n);
export function musicaDeBiblioteca(estiloId, dirProyecto, ambiente) {
  // la carpeta general no aplica a estilos con ambiente propio oscuro (terror): esos solo usan su subcarpeta
  const dirs = [path.join(DIR_MUSICA, estiloId), ...(ambiente && ambiente !== "suave" ? [] : [DIR_MUSICA])];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const pistas = fs.readdirSync(d).filter(esAudio).sort();
    if (!pistas.length) continue;
    const id = path.basename(dirProyecto || "x");
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return path.join(d, pistas[h % pistas.length]);
  }
  return null;
}

export async function mezclar({ estilo, guion, tiempos, voz, salida, tmp, dirProyecto }) {
  fs.mkdirSync(tmp, { recursive: true });
  const s = estilo.sonido || {};
  const D = tiempos.duracion;
  const entradas = ["-i", voz];
  const filtros = ["[0]volume=1.0[v0]"];
  const etiquetas = ["[v0]"];
  let n = 1;

  // ambiente
  let amb = null;
  // música propia del video: proyectos/<id>/musica.mp3 (o .m4a/.wav) manda sobre la del estilo
  const propia = dirProyecto && ["musica.mp3", "musica.m4a", "musica.wav"].map((n) => path.join(dirProyecto, n)).find((f) => fs.existsSync(f));
  const deBiblioteca = !propia && musicaDeBiblioteca(estilo.id, dirProyecto, s.ambiente);
  if (propia) amb = propia;
  else if (deBiblioteca) amb = deBiblioteca;
  else if (s.ambiente && SINTE[s.ambiente]) amb = await sintetizar(tmp, s.ambiente, D.toFixed(2));
  else if (s.ambiente) amb = path.join(DIR_ESTILOS, estilo.id, s.ambiente); // archivo de música del estilo
  if (amb && fs.existsSync(amb)) {
    entradas.push("-stream_loop", "-1", "-i", amb);
    const vol = (propia || deBiblioteca) ? (tiempos.sinVoz ? s.volumenMusicaSinVoz ?? 0.9 : s.volumenMusica ?? 0.16) : ((tiempos.sinVoz ? s.volumenSinVoz : null) ?? s.volumenAmbiente ?? 0.35);
    filtros.push(`[${n}]atrim=0:${D.toFixed(2)},volume=${vol},afade=t=out:st=${Math.max(0, D - 3).toFixed(2)}:d=3[v${n}]`);
    etiquetas.push(`[v${n}]`); n++;
  }

  // efectos: los que pide cada escena (sfx) + golpes automáticos por tipo
  const golpesEn = new Set(s.golpesEn || []);
  for (let k = 0; k < guion.escenas.length; k++) {
    const e = guion.escenas[k], t = tiempos.escenas[k];
    if (!t) continue;
    const lista = [].concat(e.sfx || []);
    if (golpesEn.has(e.tipo) && !lista.length) lista.push("golpe");
    if (s.efectosPorTipo?.[e.tipo] && !lista.length) lista.push(s.efectosPorTipo[e.tipo]);
    for (const fx of lista) {
      if (!SINTE[fx] || AMBIENTES.includes(fx)) continue;
      const f = await sintetizar(tmp, fx);
      entradas.push("-i", f);
      const ms = Math.max(0, Math.round((t.ini - 0.05) * 1000));
      filtros.push(`[${n}]volume=${s.volumenEfectos ?? 0.7},adelay=${ms}|${ms}[v${n}]`);
      etiquetas.push(`[v${n}]`); n++;
    }
  }

  filtros.push(`${etiquetas.join("")}amix=inputs=${etiquetas.length}:normalize=0:duration=first,alimiter=limit=0.95[out]`);
  await ffmpeg([...entradas, "-filter_complex", filtros.join(";"), "-map", "[out]", "-ac", "2", "-ar", String(SR), "-c:a", "aac", "-b:a", "192k", salida]);
  return salida;
}
