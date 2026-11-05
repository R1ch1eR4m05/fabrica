// Llamadas a modelos de lenguaje: Gemini (llave gratis de AI Studio) o Claude (API de pago).
// Gemini: reintenta si está saturado (503/429) y cambia de modelo; puede buscar en Google para verificar datos.
import { CFG } from "./config.js";

export const hayIA = () => !!(CFG.geminiKey || CFG.anthropicKey);
export const motorIA = () => (CFG.anthropicKey ? "Claude" : CFG.geminiKey ? "Gemini" : null);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function gemini(sistema, texto, { json = true, buscar = false } = {}) {
  let ultimo = "";
  for (const modelo of CFG.geminiModelos) {
    for (let intento = 0; intento < 4; intento++) {
      if (intento) await espera([0, 10000, 25000, 45000][intento]);
      try {
        const cuerpo = {
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: "user", parts: [{ text: texto }] }],
          generationConfig: { temperature: 0.8, ...(json && !buscar ? { responseMimeType: "application/json" } : {}) },
          ...(buscar ? { tools: [{ google_search: {} }] } : {}),
        };
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(180000), headers: { "x-goog-api-key": CFG.geminiKey, "content-type": "application/json" }, body: JSON.stringify(cuerpo),
        });
        if (r.ok) {
          const j = await r.json();
          const c = j.candidates?.[0] || {};
          const out = (c.content?.parts || []).map((p) => p.text || "").join("");
          const fuentes = (c.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter(Boolean).map((w) => ({ titulo: w.title, url: w.uri }));
          if (out.trim()) return { texto: out, fuentes, modelo };
          ultimo = `${modelo}: respuesta vacía`; continue;
        }
        const cuerpoErr = await r.text();
        ultimo = `${modelo} → ${r.status}: ${cuerpoErr.slice(0, 160)}`;
        // se acabó la cuota del día de este modelo: reintentar solo gasta tiempo; pasa directo al siguiente modelo
        if (r.status === 429 && /quota|exceeded/i.test(cuerpoErr)) break;
        if (![429, 500, 502, 503, 504].includes(r.status)) break;
      } catch (e) { ultimo = `${modelo}: ${e.message}`; }
    }
  }
  if (/429/.test(ultimo) && /quota|exceeded/i.test(ultimo)) throw new Error("Se acabó la cuota gratis de Gemini de hoy (se reinicia a medianoche, hora del Pacífico). Mientras: pídeselo a Claude Code, o activa la facturación en Google AI Studio.");
  throw new Error(`Gemini no respondió (saturado o con error). Último: ${ultimo}`);
}

export async function claude(sistema, contenido, { buscar = false, maxTokens = 16000 } = {}) {
  let mensajes = [{ role: "user", content: contenido }], r;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(240000),
      headers: { "x-api-key": CFG.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CFG.anthropicModelo, max_tokens: maxTokens, system: sistema, messages: mensajes,
        ...(buscar ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] } : {}) }),
    });
    if (!res.ok) throw new Error(`La API de Claude respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    r = await res.json();
    if (r.stop_reason !== "pause_turn") break;
    mensajes = [...mensajes, { role: "assistant", content: r.content }];
  }
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join(""), fuentes: [] };
}

// usa el que haya (Claude primero si existe, porque es el que pagas; si no, Gemini gratis)
export async function pedir(sistema, texto, op = {}) {
  if (CFG.anthropicKey) return claude(sistema, texto, op);
  if (CFG.geminiKey) return gemini(sistema, typeof texto === "string" ? texto : texto.filter((b) => b.type === "text").map((b) => b.text).join("\n"), op);
  throw new Error("SIN_IA");
}

export function jsonDe(texto) {
  const limpio = texto.replace(/```(json)?/g, "");
  const a = limpio.indexOf("{"), b = limpio.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("La IA no devolvió el resultado en el formato esperado. Intenta otra vez.");
  return JSON.parse(limpio.slice(a, b + 1));
}
