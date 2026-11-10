// Panel de la fábrica (sin librerías)
const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const api = async (ruta, metodo = "GET", datos) => {
  const r = await fetch(ruta, { method: metodo, headers: datos ? { "content-type": "application/json" } : {}, body: datos ? JSON.stringify(datos) : undefined });
  const j = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error(j.error || j || r.statusText);
  return j;
};

const S = { info: null, proyectos: [], actual: null, guion: null, sucio: false, progreso: {}, reproductor: null };
const PASOS = { guion: "Guion", voz: "Voz", render: "Video", fondo: "Fondo", musica: "Música" };
const PRINCIPALES = ["guion", "voz", "render"];
const ESTADO_TXT = { pendiente: "Pendiente", "en-fila": "En fila", trabajando: "Trabajando…", listo: "Listo", error: "Error", desactualizado: "Hay que rehacerlo" };

function avisar(msg, error = false) {
  const a = $("#aviso"); a.textContent = msg; a.className = "aviso" + (error ? " error" : "");
  clearTimeout(avisar.t); avisar.t = setTimeout(() => a.classList.add("oculto"), error ? 9000 : 3500);
}

async function cargar() {
  S.info = await api("/api/info");
  S.proyectos = await api("/api/proyectos");
  $("#chips").innerHTML = [
    `<span class="chip ${S.info.ia ? "ok" : "am"}">${S.info.ia ? `Guion con ${S.info.motorIA} ✓` : "Guion: Claude Code o a mano"}</span>`,
    `<span class="chip ${S.info.voz ? "ok" : "am"}">${S.info.voz ? "Voz ElevenLabs ✓" : "Voz de prueba (sin llave)"}</span>`,
    `<span class="chip ${S.info.pexels ? "ok" : ""}">${S.info.pexels ? "Pexels ✓" : "Sin Pexels"}</span>`,
    `<span class="chip ${S.info.apify ? "ok" : ""}">${S.info.apify ? "Apify ✓" : "Sin Apify"}</span>`,
    `<span class="chip ${S.info.flow ? "ok" : ""}" title="${S.info.flowSkill ? "Google Flow Skill (en esta compu)" : "flow-mcp en " + location.hostname + ":8787"}">${S.info.flowSkill ? "Flow (skill) ✓" : S.info.flow ? "Flow conectado ✓" : "Flow cerrado"}</span>`,
    `<span id="chipAct"></span>`,
  ].join("");
  pintarLista();
  revisarActualizacion();
}

// botón de actualizar: aparece solo cuando hay versión nueva en GitHub
async function revisarActualizacion() {
  const r = await api("/api/actualizacion").catch(() => null);
  const el = $("#chipAct"); if (!el) return;
  el.innerHTML = r?.nueva ? `<button class="chip am" id="btnAct" style="cursor:pointer" title="${h(r.cambios.slice(0, 8).join("\n"))}">Hay versión nueva · Actualizar ↻</button>`
    : r && !r.error ? `<span class="chip ok" title="Revisa GitHub al abrir y cada 30 min">Al día ✓</span>` : r?.error ? `<span class="chip" title="${h(r.error)}">No pude revisar versión</span>` : "";
  if (!r?.nueva) return;
  $("#btnAct").onclick = async () => {
    if (!confirm(`Novedades:\n• ${r.cambios.slice(0, 8).join("\n• ")}\n\nTus videos, proyectos y el .env no se tocan. ¿Actualizar ahora?`)) return;
    $("#btnAct").textContent = "Actualizando…"; $("#btnAct").disabled = true;
    try { await api("/api/actualizacion", "POST"); } catch (e) { avisar(e.message, true); return revisarActualizacion(); }
    avisar("Actualizado. Reiniciando la fábrica…");
    await new Promise((ok) => setTimeout(ok, 2500));
    for (let i = 0; i < 60; i++) { try { const x = await fetch("/api/info"); if (x.ok) break; } catch {} await new Promise((ok) => setTimeout(ok, 1000)); }
    location.reload();
  };
}
setInterval(() => revisarActualizacion(), 30 * 60000);

// ---------- teléfono ----------
const esMovil = () => matchMedia("(max-width: 860px)").matches;
document.addEventListener("click", (e) => {
  if (e.target.closest("#tituloLista") && esMovil()) { const a = document.querySelector("aside"); a.classList.toggle("cerrada"); $("#flechaLista").textContent = a.classList.contains("cerrada") ? "▸" : "▾"; }
  if (e.target.closest("#lista .item") && esMovil()) { document.querySelector("aside").classList.add("cerrada"); $("#flechaLista").textContent = "▸"; }
});
// en el teléfono no hay "pasar el mouse": las muestras se reproducen solas cuando están en pantalla
const vigia = "IntersectionObserver" in window ? new IntersectionObserver((es) => { for (const x of es) { if (!esMovil()) continue; x.isIntersecting ? x.target.play().catch(() => {}) : x.target.pause(); } }, { threshold: 0.6 }) : null;
new MutationObserver(() => { if (vigia) for (const v of document.querySelectorAll(".mot video:not([data-vigia])")) { v.dataset.vigia = "1"; v.preload = "metadata"; vigia.observe(v); } }).observe(document.body, { childList: true, subtree: true });
if (esMovil()) { document.querySelector("aside")?.classList.add("cerrada"); if ($("#flechaLista")) $("#flechaLista").textContent = "▸"; }

function pintarLista() {
  $("#lista").innerHTML = S.proyectos.map((p) => `
    <div class="item ${S.actual?.id === p.id ? "activo" : ""}" data-id="${h(p.id)}">
      <b>${h(p.titulo || p.id)}</b>
      <small>${h(estiloNombre(p.estilo))} · ${h(p.formato)}</small>
      <span class="puntos">${PRINCIPALES.map((k) => `<i class="punto ${p.estado[k]}" title="${PASOS[k]}: ${ESTADO_TXT[p.estado[k]]}"></i>`).join("")}</span>
    </div>`).join("") || `<small class="estado">Todavía no hay videos.</small>`;
  for (const el of document.querySelectorAll(".item")) el.onclick = () => abrir(el.dataset.id);
}

const estiloNombre = (id) => S.info.estilos.find((e) => e.id === id)?.nombre || id;
const estiloDe = (id) => S.info.estilos.find((e) => e.id === id);
// nombre del estilo de una propuesta del investigador ("motion:<id>" es un estilo del catálogo de motion graphics)
const esViral = (p) => p.viral ?? (p.inspiradaEn || []).length > 0;
function nombreEstiloProp(id) {
  if (String(id || "").startsWith("motion:")) { const c = (estiloDe("motion")?.catalogo || []).find((x) => x.id === id.slice(7)); return `Motion graphics · ${c?.nombre || id.slice(7)}`; }
  return estiloDe(id)?.nombre || "Frases · Fondo desenfocado";
}

// ---------- inicio: estilos ----------
function inicio() {
  S.actual = null; S.vista = null; parar(); pintarLista(); history.replaceState(null, "", "/");
  const tarjeta = (attrs, cls, video, poster, nombre, desc, pie, badge) => `
      <div class="card estilo mot ${cls}" ${attrs} style="padding:10px">
        ${badge ? `<span class="badge">${badge}</span>` : ""}
        ${video ? `<video src="${video}" poster="${poster}" muted loop playsinline preload="none" style="width:100%;border-radius:8px;height:190px;object-fit:cover;background:#000"></video>` : `<div style="height:190px;border-radius:8px;background:var(--f);display:flex;align-items:center;justify-content:center;color:var(--t2);font-size:13px">Sin vista previa</div>`}
        <h3 style="font-size:15px;margin:10px 0 4px;padding-right:0">${h(nombre)}</h3><p style="font-size:12.5px">${h(desc)}</p>
        ${pie ? `<p style="margin-top:8px;font-size:12px">${h(pie)}</p>` : ""}
      </div>`;
  let html = "";
  for (const e of S.info.estilos) {
    if (e.tipo === "motion" && e.listo) {
      const fams = [...new Set((e.catalogo || []).map((c) => c.familia))];
      html += fams.map((fa) => `<div class="estado" style="grid-column:1/-1;margin:14px 0 0;text-transform:uppercase;letter-spacing:1px;font-size:11px">Motion graphics · ${h(fa)}</div>` + e.catalogo.filter((c) => c.familia === fa).map((c) =>
        tarjeta(`data-id="${h(e.id)}" data-mot="${h(c.id)}"`, "", `/motion/galeria/videos/${h(c.id)}.mp4`, `/motion/galeria/portadas/${h(c.id)}.jpg`, c.nombre, c.que, `${(e.formatos || []).join(" · ")} · ${Math.round(c.seg)} s`)).join("")).join("");
    } else {
      html += tarjeta(`data-id="${h(e.id)}"`, e.listo ? "" : "pronto", e.preview ? `/estilos/${h(e.id)}/preview.mp4` : "", e.preview ? `/estilos/${h(e.id)}/preview.jpg` : "", e.nombre, e.descripcion, (e.formatos || []).join(" · "), e.listo ? "" : "Pronto");
    }
  }
  $("#main").innerHTML = `
    <h1>¿Qué video hacemos?</h1><p class="sub">Elige un estilo (${matchMedia("(max-width: 860px)").matches ? "las muestras se mueven solas" : "pasa el mouse para verlo moverse"}). Los que dicen "Pronto" los vamos agregando.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${html}</div>`;
  for (const c of document.querySelectorAll(".mot")) {
    const v = c.querySelector("video"); if (v) { c.onmouseenter = () => v.play().catch(() => {}); c.onmouseleave = () => v.pause(); }
    if (!c.classList.contains("pronto")) c.onclick = () => nuevo(c.dataset.id, c.dataset.mot);
  }
}

// ---------- nuevo video ----------
function nuevo(estiloId, motionId = "") {
  parar();
  const listos = S.info.estilos.filter((e) => e.listo);
  const est = estiloDe(estiloId) || listos[0];
  const st = { formato: est.formatos?.[0] || "9:16", duracion: "corto" };
  $("#main").innerHTML = `
    <h1>Nuevo video</h1><p class="sub">Cuéntame la idea; el guion se escribe en el siguiente paso.</p>
    <div class="card" style="max-width:720px">
      <label>¿Para qué marca?</label>
      <div class="seg" id="nMarca"><button data-v="">Cargando…</button></div>
      <label>Estilo</label>
      <select id="nEstilo">${listos.map((e) => `<option value="${h(e.id)}" ${e.id === est.id ? "selected" : ""}>${h(e.nombre)}</option>`).join("")}</select>
      <label>Idea o tema</label>
      <textarea id="nIdea" placeholder="Ej.: Si escuchas que alguien te llama por tu nombre a las 3 de la mañana"></textarea>
      <div class="ideas" id="nIdeas"></div>
      <div class="fila" style="margin-top:6px">
        <div><label>Formato</label><div class="seg" id="nFormato"></div></div>
        <div><label>Duración</label><div class="seg" id="nDur"><button data-v="corto">Corto</button><button data-v="largo">Largo</button></div></div>
        <div><label>Segundos exactos (opcional)</label><input id="nSeg" type="number" min="15" max="600" step="5" placeholder="Ej.: 60" style="width:130px"></div>
      </div>
      <div id="nExtra"></div>
      <div id="nGaleria"></div>
      <label>Nombre o @ del canal (se ve como marca de agua; opcional)</label>
      <input id="nCanal" value="${h(localStorage.getItem("canal") || "")}" placeholder="@tucanal">
      <div style="margin-top:18px" class="fila"><button class="btn primario" id="nCrear">Crear</button><button class="btn" id="nCancelar">Cancelar</button></div>
    </div>`;
  const extra = () => {
    const e = estiloDe($("#nEstilo").value);
    $("#nExtra").innerHTML = `<div class="fila">${(e.opciones || []).map((o) => `<div><label>${h(o.nombre)}</label><select data-op="${h(o.clave)}">${Object.entries(o.valores).map(([k, v]) => `<option value="${h(k)}">${h(v)}</option>`).join("")}</select></div>`).join("")}
      ${e.vozOpcional ? `<div><label>Voz</label><div class="seg" id="nVoz"><button data-v="si" class="on">Con voz</button><button data-v="no">Solo música</button></div></div>` : ""}</div>`;
    for (const b of document.querySelectorAll("#nVoz button")) b.onclick = () => { for (const x of document.querySelectorAll("#nVoz button")) x.classList.toggle("on", x === b); };
  };
  const formatos = () => {
    const e = estiloDe($("#nEstilo").value), fs = e.formatos || Object.keys(S.info.formatos);
    if (!fs.includes(st.formato)) st.formato = fs[0];
    $("#nFormato").innerHTML = fs.map((k) => `<button data-v="${k}" title="${h(S.info.formatos[k]?.nombre || k)}">${k}</button>`).join("");
    seg("#nFormato", "formato");
    $("#nIdea").placeholder = e.tipo === "motion" ? "Ej.: 3 pasos para mañanas sin gritos (anuncio de Levania)" : "Ej.: Si escuchas que alguien te llama por tu nombre a las 3 de la mañana";
  };
  let motionElegido = motionId;
  const galeria = () => {
    const e = estiloDe($("#nEstilo").value), cat = e.tipo === "motion" ? e.catalogo || [] : [];
    if (!cat.length) { $("#nGaleria").innerHTML = ""; return; }
    if (!cat.some((c) => c.id === motionElegido)) motionElegido = cat[0].id;
    $("#nGaleria").innerHTML = `<label>Estilo de motion</label><select id="nMot">${cat.map((c) => `<option value="${h(c.id)}" ${c.id === motionElegido ? "selected" : ""}>${h(c.familia)} · ${h(c.nombre)}</option>`).join("")}</select>`;
    $("#nMot").onchange = () => (motionElegido = $("#nMot").value);
  };
  // marca → sugerencias de las investigaciones de esa marca (lo viral primero); "Otra idea" → las ideas del estilo
  let marca = null, sug = { sugerencias: [], config: null }, elegida = null;
  const nomEstilo = (id) => (id.startsWith("motion:") ? "Motion" : estiloDe(id)?.nombre || id);
  const ponerMarca = () => { // la marca elige sello/logo y canal si el estilo los tiene
    for (const sel of document.querySelectorAll("[data-op]")) if (/^(marca|logo)$/.test(sel.dataset.op) && marca) {
      const vs = [...sel.options].map((o) => o.value); // si el estilo no tiene sello de esta marca: el del canal o ninguno (nunca el de otra marca)
      sel.value = vs.includes(marca) ? marca : vs.find((v) => v === "canal") || vs.find((v) => /^(ninguna|no)$/.test(v)) || sel.value;
    }
    if (marca && sug.config?.canal && !$("#nCanal").value.trim()) $("#nCanal").value = sug.config.canal;
  };
  const ideas = () => {
    extra(); formatos(); galeria(); ponerMarca();
    const e = estiloDe($("#nEstilo").value);
    if (!marca) { $("#nIdeas").innerHTML = (e.ideas || []).map((i) => `<span class="idea">${h(i)}</span>`).join(""); for (const el of document.querySelectorAll(".idea")) el.onclick = () => { elegida = null; $("#nIdea").value = el.textContent; }; return; }
    const ls = sug.sugerencias;
    $("#nIdeas").innerHTML = ls.length
      ? `<div class="estado" style="width:100%;margin:2px 0 4px">Ideas de lo que está funcionando para ${h(sug.config?.nombre || marca)} (● viral = nace de un video que ya pegó). Al elegir una se pone su estilo.</div>` + ls.map((x, k) => `<span class="idea" data-sug="${k}" title="${h(x.idea || x.frase)}">${x.viral ? `<b style="color:var(--ok)">●</b> ` : ""}${h(x.frase || x.idea || x.tema)} <span style="opacity:.6">· ${h(nomEstilo(x.estilo))}</span></span>`).join("")
      : `<div class="estado">Todavía no hay investigaciones de ${h(sug.config?.nombre || marca)}. Cuando llegue el informe diario aparecen aquí; mientras, escribe tu idea.</div>`;
    for (const el of document.querySelectorAll("[data-sug]")) el.onclick = () => {
      const x = ls[+el.dataset.sug]; elegida = x;
      $("#nIdea").value = [x.frase, x.idea].filter(Boolean).join("\n");
      const id = x.estilo.startsWith("motion:") ? "motion" : x.estilo;
      if (id && $("#nEstilo").querySelector(`option[value="${id}"]`) && $("#nEstilo").value !== id) { $("#nEstilo").value = id; if (id === "motion") motionElegido = x.estilo.slice(7); ideas(); $("#nIdea").value = [x.frase, x.idea].filter(Boolean).join("\n"); elegida = x; }
    };
  };
  const marcas = async (n) => {
    try { sug = await api(`/api/investigacion/sugerencias${n ? `?nicho=${encodeURIComponent(n)}` : ""}`); } catch { sug = { nichos: [], sugerencias: [] }; }
    if (marca === null) marca = sug.nicho || "";
    $("#nMarca").innerHTML = [...(sug.nichos || []).map((x) => `<button data-v="${h(x.id)}">${h(x.nombre || x.id)}</button>`), `<button data-v="">Otra idea</button>`].join("");
    for (const b of document.querySelectorAll("#nMarca button")) { b.classList.toggle("on", b.dataset.v === marca); b.onclick = async () => { marca = b.dataset.v; elegida = null; if (marca) await marcas(marca); else { for (const x of document.querySelectorAll("#nMarca button")) x.classList.toggle("on", x === b); ideas(); } }; }
    ideas();
  };
  const seg = (sel, k) => { for (const b of document.querySelectorAll(`${sel} button`)) { b.classList.toggle("on", b.dataset.v === st[k]); b.onclick = () => { st[k] = b.dataset.v; seg(sel, k); }; } };
  seg("#nDur", "duracion"); ideas(); marcas();
  $("#nEstilo").onchange = () => { elegida = null; ideas(); };
  $("#nCancelar").onclick = inicio;
  $("#nCrear").onclick = async () => {
    const idea = $("#nIdea").value.trim();
    if (!idea) return avisar("Escribe la idea del video.", true);
    const esMotion = estiloDe($("#nEstilo").value)?.tipo === "motion";
    localStorage.setItem("canal", $("#nCanal").value.trim());
    const opciones = {}; for (const sel of document.querySelectorAll("[data-op]")) opciones[sel.dataset.op] = sel.value;
    const conVoz = !$("#nVoz") || $("#nVoz button.on").dataset.v === "si";
    // idea elegida de la investigación y sin cambiar de estilo: se crea desde la propuesta (trae gancho, ángulo y la referencia viral)
    const estSel = $("#nEstilo").value, mismaProp = elegida && (elegida.estilo === estSel || (estSel === "motion" && elegida.estilo === `motion:${motionElegido}`));
    if (mismaProp && $("#nIdea").value.trim() === [elegida.frase, elegida.idea].filter(Boolean).join("\n")) {
      try {
        const q = await api(`/api/investigacion/${encodeURIComponent(elegida.archivo)}/crear`, "POST", { n: elegida.n, formato: st.formato, canal: $("#nCanal").value.trim(), opciones: esMotion ? undefined : opciones, conVoz });
        if (q.guionPendiente) avisar(`Creado sin guion (${q.aviso}). En Claude Code di: escribe el guion de ${q.id}`, true);
        S.proyectos = await api("/api/proyectos"); abrir(q.id); return;
      } catch (e) { return avisar(e.message, true); }
    }
    if (marca) opciones.nicho = marca;
    const p = await api("/api/proyectos", "POST", { estilo: $("#nEstilo").value, idea, titulo: idea, conVoz, opciones, ...st, segundos: Number($("#nSeg")?.value) || null });
    if ($("#nCanal").value.trim()) await api(`/api/proyectos/${p.id}`, "PATCH", { canal: $("#nCanal").value.trim() });
    if (esMotion) { const c = (estiloDe("motion").catalogo || []).find((x) => x.id === motionElegido); await api(`/api/proyectos/${p.id}/brief`, "PUT", { estiloMotion: motionElegido, formato: st.formato, para: "Reels / TikTok", segundos: Math.round(c?.seg || 12), loop: false, textos: "", marca: "", medios: "ninguno, solo gráfico", notas: "" }); }
    S.proyectos = await api("/api/proyectos"); abrir(p.id);
  };
}

// ---------- un video ----------
async function abrir(id, { mantener = false } = {}) {
  S.vista = null;
  if (S.sucio && !mantener && S.actual?.id !== id && !confirm("Tienes cambios sin guardar en el guion. ¿Salir sin guardar?")) return;
  const d = await api(`/api/proyectos/${encodeURIComponent(id)}`);
  const mismo = S.actual?.id === id;
  S.actual = d;
  if (!mismo || !S.sucio) { S.guion = d.guion ? JSON.parse(JSON.stringify(d.guion)) : null; S.sucio = false; }
  history.replaceState(null, "", "#" + id);
  pintarLista(); pintarProyecto();
}

function pasoCab(n, clave, titulo, derecha = "") {
  const est = S.actual.estado[clave];
  return `<div class="cab"><div class="num ${est}">${n}</div><div><h2>${titulo}</h2><div class="estado" id="est-${clave}">${ESTADO_TXT[est] || ""}${est === "error" && S.actual.error ? ": " + h(S.actual.error) : ""}</div></div><div class="der">${derecha}</div></div>`;
}

function pintarProyecto() {
  parar();
  const p = S.actual, est = estiloDe(p.estilo), ocupado = (k) => ["trabajando", "en-fila"].includes(p.estado[k]);
  if (est?.tipo === "motion") return pintarMotion(p, est, ocupado);
  $("#main").innerHTML = `
    <div class="fila" style="justify-content:space-between">
      <div style="flex:1;min-width:260px"><input id="pTitulo" value="${h(p.titulo)}" style="font-size:20px;font-weight:700;background:none;border-color:transparent;padding-left:0"></div>
      <div class="fila">
        ${(est?.opciones || []).map((o) => `<select data-pop="${h(o.clave)}" style="width:auto" title="${h(o.nombre)}">${Object.entries(o.valores).map(([k, v]) => `<option value="${h(k)}" ${(p.opciones?.[o.clave] || Object.keys(o.valores)[0]) === k ? "selected" : ""}>${h(v)}</option>`).join("")}</select>`).join("")}
        <div class="seg" id="pFormato">${(est?.formatos || ["9:16"]).map((k) => `<button data-v="${k}" class="${p.formato === k ? "on" : ""}">${k}</button>`).join("")}</div>
      </div>
    </div>
    <p class="sub">${h(est?.nombre)} · ${p.duracion === "largo" ? "Largo" : "Corto"} · <span style="opacity:.7">${h(p.idea)}</span> · <label style="display:inline;font-size:12px">Segundos <input id="pSeg" type="number" min="15" max="600" step="5" value="${p.segundos || ""}" placeholder="auto" title="Duración que se le pide al guion (vale para el próximo guion que escribas)" style="width:80px;padding:2px 6px"></label> ${S.info.espejo ? `<button class="mini" id="pEnviarVPS" title="Manda este video (imágenes, voz, copy, portada y video final) al VPS para verlo desde el celular">Enviar al VPS</button>` : ""}</p>
    ${panelInspiracion(p)}

    <div class="pasos">
      <section class="paso">${pasoCab(1, "guion", "Guion", `
        ${S.sucio ? `<button class="btn primario peq" id="gGuardar">Guardar cambios</button>` : ""}
        <button class="btn peq" id="gIA" ${ocupado("guion") || !S.info.ia ? "disabled" : ""}>${S.guion ? "Pedir cambios a la IA" : "Escribir con IA"}</button>`)}
        <div class="cont">
          ${S.info.ia ? `<textarea id="gCambios" placeholder="${S.guion ? "Ej.: haz el gancho más fuerte y agrega una regla sobre las ventanas" : "Indicaciones extra (opcional): tono, número de reglas, un dato que quieras usar…"}" style="min-height:44px"></textarea>`
            : `<div class="nota">Para escribirlo con IA desde aquí, pon <code>GEMINI_API_KEY</code> (gratis en aistudio.google.com) en el archivo <code>.env</code>. O abre Claude Code en la carpeta de la fábrica y dile: <code>escribe el guion de ${h(p.id)}</code>. También puedes escribirlo tú abajo.</div>`}
          <div class="barra oculto" id="bar-guion"><div></div></div>
          <details style="margin-top:8px" ${!S.guion ? "open" : ""}><summary class="estado" style="cursor:pointer"><b>Sin cuota de Gemini (o sin IA): pídeselo a Claude</b> en su app o en claude.ai</summary>
            <div class="estado" style="margin:6px 0">1) Copia el pedido. 2) Pégalo en Claude y espera su respuesta. 3) Copia lo que te responda y pégalo aquí abajo.</div>
            <div class="fila"><button class="btn peq" id="gPedido">Copiar pedido para Claude</button>${S.guion ? `<label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="gConActual" style="width:auto"> que cambie el guion actual (usa las indicaciones de arriba)</label>` : ""}</div>
            <textarea id="gPegado" placeholder="Pega aquí la respuesta de Claude (el JSON del guion)" style="min-height:70px;margin-top:6px;font:12px/1.4 ui-monospace,monospace"></textarea>
            <button class="btn primario peq" id="gUsarPegado" style="margin-top:6px">Usar este guion</button>
          </details>
          <div id="escenas" style="margin-top:8px"></div>
          <div class="fila" style="margin-top:10px"><button class="mini" id="gAgregar">+ Agregar escena</button>${!S.guion ? `<button class="mini" id="gVacio">Empezar a mano</button>` : ""}</div>
          ${S.guion?.fuentes?.length ? `<label>Fuentes del guion</label><div class="estado">${S.guion.fuentes.map((f) => `· ${h(f.dato)} — <a href="${h(f.url)}" target="_blank" style="color:var(--t2)">${h(f.url)}</a>`).join("<br>")}</div>` : ""}
        </div></section>

      <section class="paso">${pasoCab(2, "voz", est?.fondo ? "Voz y fondo" : "Voz", `<button class="btn peq ${p.estado.voz !== "listo" && p.estado.guion === "listo" ? "primario" : ""}" id="vHacer" ${p.estado.guion !== "listo" || S.sucio || ocupado("voz") ? "disabled" : ""}>${p.tieneVoz ? "Rehacer voz" : "Generar voz"}</button>`)}
        <div class="cont">
          <div class="fila" style="margin-bottom:10px">
            ${est?.vozOpcional ? `<div class="seg" id="vModo"><button data-v="si" class="${p.conVoz !== false ? "on" : ""}">Con voz</button><button data-v="no" class="${p.conVoz === false ? "on" : ""}">Solo música</button></div>` : ""}
            ${p.conVoz !== false ? `<input id="vId" placeholder="ID de voz de ElevenLabs para este video (opcional)" value="${h(p.vozId || "")}" style="max-width:380px">` : ""}
            ${p.conVoz !== false && S.info.voz ? `<button class="mini" id="vTodos" title="Guarda el ID de voz de arriba como la voz de todos los videos de este estilo">Usar esta voz en todos los de ${h(est?.nombre || "este estilo")}</button>` : ""}
            ${p.conVoz !== false && S.info.voz ? `<select id="vModelo" title="Modelo de voz para los videos de este estilo" style="max-width:340px"><option>Modelo de voz…</option></select><button class="mini" id="vComparar" title="Genera el mismo párrafo con cada modelo para oírlos y ver cuánto cuesta cada uno">Comparar modelos</button>` : ""}
          </div>
          <div id="vComparacion"></div>
          ${p.conVoz !== false && !S.info.voz ? `<div class="nota">Sin llave de ElevenLabs se genera una <b>voz de prueba muda</b> con tiempos estimados, para ensayar el video. Pon <code>ELEVENLABS_API_KEY</code> y <code>ELEVENLABS_VOICE_ID</code> en el <code>.env</code> para la voz real.${est?.vozSugerida ? "<br>Voz sugerida: " + h(est.vozSugerida) : ""}</div>` : ""}
          <div class="barra oculto" id="bar-voz"><div></div></div>
          ${p.tieneVoz ? `<div style="margin:6px 0 4px"><b>Voz</b></div><audio id="vAudio" controls src="/proyectos/${h(p.id)}/voz.mp3?v=${Date.now()}" style="width:100%"></audio><div class="estado">${p.tiempos ? `${p.tiempos.duracion.toFixed(1)} s${p.tiempos.sinVoz ? " · sin voz, solo música" : p.tiempos.prueba ? " · voz de prueba" : ""}` : ""}</div>` : `<div class="estado">Primero el guion.</div>`}
          ${est?.fondo ? panelFondo(p) : ""}
          ${est?.preparar === "historia" ? panelClips(p) : ""}
        </div></section>

      <section class="paso">${pasoCab(3, "render", "Vista previa y video", `<button class="btn peq" id="rTodo" title="${est?.anuncios ? "Imágenes con APIMart (las que falten) y luego todas las medidas" : "Hace la voz y luego el video, sin esperar"}" ${p.estado.guion !== "listo" || S.sucio || ocupado("voz") || ocupado("render") ? "disabled" : ""}>${est?.anuncios ? "Hacer todo" : "Voz + video"}</button><button class="btn peq ${p.estado.voz === "listo" ? "primario" : ""}" id="rHacer" ${(est?.anuncios && p.opciones?.tipo !== "video" && p.opciones?.plantilla !== "avatar" ? p.estado.guion !== "listo" : p.estado.voz !== "listo") || ocupado("render") || ocupado("fondo") ? "disabled" : ""}>${est?.anuncios ? (p.opciones?.tipo === "video" || p.opciones?.plantilla === "avatar" ? "Sacar videos (todas las medidas)" : "Sacar imágenes (todas las medidas)") : p.tieneFinal ? "Volver a sacar el video" : "Sacar el video"}</button>`)}
        <div class="cont">
          <div class="vista">
            <div>
              <div class="pantalla" id="pantalla"></div>
              <div class="controles"><button class="btn peq" id="play">▶</button><input type="range" id="scrub" min="0" max="1000" value="0" style="width:100%"><span class="estado" id="reloj" style="min-width:86px;text-align:right">0:00</span></div>
              <div class="estado">La vista previa es en vivo (sin música ni efectos). ${S.sucio ? "Guarda el guion para ver los cambios." : ""}</div>
            </div>
            <div>
              <div class="barra oculto" id="bar-render"><div></div></div>
              ${est?.anuncios ? galeriaAnuncios(p) : ""}
              ${p.tieneFinal ? `
                <video controls src="/proyectos/${h(p.id)}/final.mp4?v=${Date.now()}"></video>
                <div class="fila" style="margin:10px 0"><a class="btn peq" href="/proyectos/${h(p.id)}/final.mp4" download="${h(p.id)}.mp4">Descargar video</a><a class="btn peq" href="/proyectos/${h(p.id)}/portada.jpg" download="${h(p.id)}.jpg">Portada</a></div>
                <div class="estado">También queda guardado en la carpeta <b>listos</b>.</div>
                ${p.guion?.escenas?.filter((e) => e.capitulo).length > 1 ? panelCortes(p) : ""}`
              : `<div class="estado">Cuando tengas la voz, revisa la vista previa y pulsa "Sacar el video".</div>`}
              ${p.tieneFinal ? panelRevision(p) : ""}
              ${est?.miniaturas && p.guion?.escenas?.length ? panelMiniaturas(p) : ""}
              ${est?.imagenesPost && p.guion?.escenas?.length ? panelImagenes(p) : ""}
            </div>
          </div>
        </div></section>
      ${est?.musicaIA ? panelMusica(p, est) : ""}
      ${p.tieneFinal ? panelCopys() : ""}
    </div>`;

  pintarEscenas();
  // eventos
  $("#pTitulo").onchange = async (e) => { await api(`/api/proyectos/${p.id}`, "PATCH", { titulo: e.target.value }); S.proyectos = await api("/api/proyectos"); pintarLista(); };
  for (const b of document.querySelectorAll("#pFormato button")) b.onclick = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { formato: b.dataset.v }); abrir(p.id, { mantener: true }); };
  $("#gIA").onclick = async () => {
    if (S.sucio && !confirm("La IA va a reescribir el guion y perderás tus cambios sin guardar. ¿Seguir?")) return;
    S.sucio = false;
    await api(`/api/proyectos/${p.id}/guion`, "POST", { cambios: $("#gCambios")?.value || "" }).catch((e) => avisar(e.message, true));
  };
  $("#gPedido").onclick = async () => {
    const r = await api(`/api/proyectos/${p.id}/pedido-guion`, "POST", { cambios: $("#gCambios")?.value || "", conActual: !!$("#gConActual")?.checked });
    try { await navigator.clipboard.writeText(r.texto); avisar("Pedido copiado. Pégalo en Claude (app o claude.ai)."); }
    catch { $("#gPegado").value = r.texto; $("#gPegado").select(); avisar("No pude copiar solo: selecciona el texto del cuadro y cópialo.", true); }
  };
  $("#gUsarPegado").onclick = async () => {
    const t = $("#gPegado").value.trim(); if (!t) return avisar("Pega primero la respuesta de Claude.", true);
    try { await api(`/api/proyectos/${p.id}/guion-pegado`, "POST", { texto: t }); S.sucio = false; avisar("Guion listo."); abrir(p.id); }
    catch (e) { avisar(e.message, true); }
  };
  $("#gAgregar").onclick = () => { S.guion = S.guion || { titulo: p.titulo, escenas: [] }; S.guion.escenas.push({ tipo: "narracion", texto: "", visual: est?.visuales?.[0] || "" }); marcarSucio(); };
  if ($("#gVacio")) $("#gVacio").onclick = () => { S.guion = { titulo: p.titulo, escenas: [{ tipo: "gancho", texto: "", visual: "oscuridad" }] }; marcarSucio(); };
  if ($("#gGuardar")) $("#gGuardar").onclick = guardarGuion;
  for (const sel of document.querySelectorAll("[data-pop]")) sel.onchange = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { opciones: { [sel.dataset.pop]: sel.value } }); abrir(p.id, { mantener: true }); };
  for (const b of document.querySelectorAll("#vModo button")) b.onclick = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { conVoz: b.dataset.v === "si" }); abrir(p.id, { mantener: true }); };
  if ($("#vTodos")) $("#vTodos").onclick = async () => { const v = $("#vId").value.trim(); if (!v) return avisar("Pega primero el ID de la voz (ElevenLabs → Voices → ⋯ → Copy voice ID).", true); await api("/api/ajustes", "PUT", { vozPorEstilo: { [p.estilo]: v } }); avisar(`Listo: los videos de ${est?.nombre} usarán esa voz.`); };
  if ($("#vModelo")) api("/api/ajustes").then((a) => {
    if ($("#vId") && !$("#vId").value && a.vozPorEstilo?.[p.estilo]) $("#vId").placeholder = `Voz del estilo: ${a.vozPorEstilo[p.estilo]} (pon otra solo para este video)`;
    const actual = a.modeloPorEstilo?.[p.estilo] || a.modeloVoz || String(a.modeloVozEnv).replace(/^eleven_multilingual_v(3|4)$/, "eleven_v$1");
    $("#vModelo").innerHTML = Object.entries(a.modelosVoz).map(([k, n]) => `<option value="${h(k)}" ${k === actual ? "selected" : ""}>Voz: ${h(n)}</option>`).join("");
    $("#vModelo").onchange = async () => { await api("/api/ajustes", "PUT", { modeloPorEstilo: { [p.estilo]: $("#vModelo").value } }); avisar(`Modelo de voz guardado para ${est?.nombre || "este estilo"}. Dale "Rehacer voz" para oírlo.`); };
  });
  if ($("#rRevisar")) $("#rRevisar").onclick = () => api(`/api/proyectos/${p.id}/revisar`, "POST", {}).then(() => avisar("Revisando… sale en la barra de la fila.")).catch((e) => avisar(e.message, true));
  if ($("#iSacar")) $("#iSacar").onclick = () => api(`/api/proyectos/${p.id}/imagenes`, "POST", {}).then(() => avisar("Sacando imágenes… sale en la barra de la fila.")).catch((e) => avisar(e.message, true));
  if ($("#iTexto")) $("#iTexto").onclick = async () => { const t = await (await fetch(`/proyectos/${p.id}/imagenes/texto.txt?v=${Date.now()}`)).text(); try { await navigator.clipboard.writeText(t); avisar("Texto copiado."); } catch { prompt("Copia el texto:", t); } };
  for (const b of document.querySelectorAll("[data-copiaimg]")) b.onclick = async () => { const c = p.imagenesPost?.copy || {}; const t = `${c[b.dataset.copiaimg] || ""}${c.hashtags?.length ? "\n\n" + c.hashtags.join(" ") : ""}`; try { await navigator.clipboard.writeText(t); avisar("Copy copiado."); } catch { prompt("Copia el texto:", t); } };
  if ($("#mCrear")) $("#mCrear").onclick = () => api(`/api/proyectos/${p.id}/miniatura`, "POST", { ia: $("#mIA").checked }).then(() => avisar("Creando miniaturas… sale en la barra de la fila.")).catch((e) => avisar(e.message, true));
  for (const b of document.querySelectorAll("[data-musar]")) b.onclick = () => api(`/api/proyectos/${p.id}/miniatura`, "POST", { usar: b.dataset.musar }).then(() => { avisar(`Miniatura ${b.dataset.musar} elegida: ya está en la carpeta listos.`); abrir(p.id, { mantener: true }); }).catch((e) => avisar(e.message, true));
  if ($("#cCortar")) $("#cCortar").onclick = () => api(`/api/proyectos/${p.id}/capitulos`, "POST", { reels: $("#cCortarReels").checked }).then(() => avisar("Cortando por capítulos… sale en la barra de la fila.")).catch((e) => avisar(e.message, true));
  for (const b of document.querySelectorAll("[data-copiacap]")) b.onclick = async () => {
    const t = await (await fetch(`/proyectos/${p.id}/capitulos/${b.dataset.copiacap}?v=${Date.now()}`)).text();
    try { await navigator.clipboard.writeText(t); avisar("Texto copiado."); } catch { prompt("Copia el texto:", t); }
  };
  if ($("#vComparar")) {
    const pintar = (r) => {
      if (!r?.modelos?.length) return;
      $("#vComparacion").innerHTML = `<div class="nota"><b>Mismo texto con cada modelo</b> (${r.modelos[0].letras} letras). Un video de 30 min son unas 30 mil letras.
        ${r.modelos.map((x) => `<div style="margin-top:8px"><b>${h(x.nombre)}</b>${x.error ? ` · <span style="opacity:.7">${h(x.error)}</span>` : `<br><audio controls preload="none" src="${h(x.archivo)}?v=${Date.now()}" style="width:100%;max-width:380px"></audio><br>${h(x.costo)} · video de 30 min: ${h(x.video30)} · subtítulos ${h(x.tiempos)}`}</div>`).join("")}</div>`;
    };
    api("/api/voces/comparar").then(pintar).catch(() => {});
    $("#vComparar").onclick = async () => {
      const b = $("#vComparar"); b.disabled = true; b.textContent = "Generando…";
      try { pintar(await api("/api/voces/comparar", "POST", { vozId: $("#vId")?.value.trim() || p.vozId || "", estiloId: p.estilo })); avisar("Listo: dale play a cada una."); }
      catch (e) { avisar(e.message, true); }
      b.disabled = false; b.textContent = "Comparar modelos";
    };
  }
  if ($("#vId")) $("#vId").onchange = (e) => api(`/api/proyectos/${p.id}`, "PATCH", { vozId: e.target.value.trim() });
  if ($("#flowCopiar")) {
    $("#flowCopiar").onclick = () => navigator.clipboard.writeText($("#flowPrompt").value).then(() => avisar("Prompt copiado. Pégalo en Flow en formato 9:16."));
    $("#flowPrompt").onchange = (e) => api(`/api/proyectos/${p.id}`, "PATCH", { flowPrompt: e.target.value });
    $("#flowGenerar").onclick = () => { if (confirm("Esto gasta créditos de tu cuenta de Flow y usa automatización no oficial (bajo tu riesgo). ¿Seguir?")) api(`/api/proyectos/${p.id}/flow`, "POST", { prompt: $("#flowPrompt").value, maxCreditos: $("#flowMax").value }).catch((e) => avisar(e.message, true)); };
  }
  if ($("#fBuscar")) {
    $("#fOtro").onclick = () => api(`/api/proyectos/${p.id}/fondo`, "POST", { buscar: $("#fBuscar").value.trim() }).catch((e) => avisar(e.message, true));
    $("#fSubir").onclick = () => subir(p.id, "fondo", "video/*,image/*");
    $("#mSubir").onclick = () => subir(p.id, "musica", "audio/*");
    for (const b of document.querySelectorAll("[data-quitar]")) b.onclick = async () => { await api(`/api/proyectos/${p.id}/archivo?tipo=${b.dataset.quitar}`, "DELETE"); abrir(p.id, { mantener: true }); };
  }
  $("#vHacer").onclick = () => api(`/api/proyectos/${p.id}/voz`, "POST").catch((e) => avisar(e.message, true));
  eventoEnviarVPS(p);
  if (est?.preparar === "historia") eventosClips(p);
  if ($("#muGenerar")) eventosMusica(p, est);
  $("#rTodo").onclick = () => api(`/api/proyectos/${p.id}/todo`, "POST").catch((e) => avisar(e.message, true));
  $("#rHacer").onclick = () => api(`/api/proyectos/${p.id}/render`, "POST").catch((e) => avisar(e.message, true));
  if (p.tieneFinal) cargarCopys(p);
  for (const k of Object.keys(PASOS)) if (S.progreso[p.id]?.[k]) mostrarProgreso(k, S.progreso[p.id][k]);
  if (p.guion) montarVista();
}

// ---------- motion graphics ----------
const MARCA_LEVANIA = "Levania: rosa #C4837A, salvia #8FA58A, crema #F6EEE4, tinta #3D3230. Tipografías Cormorant Garamond (títulos) y Jost (texto). Logo en proyectos/<id>/motion/media si lo subo.";
function pintarMotion(p, est, ocupado) {
  const b = p.motion || {}, me = p.motionEstado || {}, cat = est.catalogo || [];
  const sel = b.estiloMotion || "";
  const familias = [...new Set(cat.map((c) => c.familia))];
  const cmd = "haz los pendientes";
  $("#main").innerHTML = `
    <div class="fila" style="justify-content:space-between">
      <div style="flex:1;min-width:260px"><input id="pTitulo" value="${h(p.titulo)}" style="font-size:20px;font-weight:700;background:none;border-color:transparent;padding-left:0"></div>
      <div class="seg" id="pFormato">${(est.formatos || ["9:16"]).map((k) => `<button data-v="${k}" class="${p.formato === k ? "on" : ""}">${k}</button>`).join("")}</div>
    </div>
    <p class="sub">${h(est.nombre)} · <span style="opacity:.7">${h(p.idea)}</span></p>
    ${panelInspiracion(p)}
    <div class="pasos">
      <section class="paso">${pasoCab(1, "guion", "Estilo y brief", `<button class="btn primario peq" id="mGuardar">Guardar brief</button>`)}
        <div class="cont">
          <label>Elige el estilo (pasa el mouse para verlo moverse)</label>
          ${familias.map((fa) => `<div class="estado" style="margin:12px 0 6px;text-transform:uppercase;letter-spacing:1px;font-size:11px">${h(fa)}</div>
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${cat.filter((c) => c.familia === fa).map((c) => `
              <div class="card estilo mot ${c.id === sel ? "sel" : ""}" data-mot="${h(c.id)}" style="padding:10px;${c.id === sel ? "border-color:var(--a);box-shadow:0 0 0 2px var(--a) inset" : ""}">
                <video src="/motion/galeria/videos/${h(c.id)}.mp4" poster="/motion/galeria/portadas/${h(c.id)}.jpg" muted loop playsinline preload="none" style="width:100%;border-radius:8px;max-height:130px;object-fit:cover;background:#000"></video>
                <h3 style="font-size:14px;margin:8px 0 4px;padding-right:0">${h(c.nombre)}</h3><p style="font-size:12.5px">${h(c.que)}</p>
              </div>`).join("")}</div>`).join("")}
          <div class="fila" style="align-items:flex-start;margin-top:14px">
            <div style="flex:1;min-width:260px">
              <label>¿Para qué es?</label>
              <select id="mPara">${["Reels / TikTok", "Anuncio", "Intro de YouTube", "Explicación de un dato", "Lanzamiento de producto", "Vinheta / marca"].map((o) => `<option ${b.para === o ? "selected" : ""}>${o}</option>`).join("")}</select>
              <div class="fila"><div><label>Segundos</label><input id="mSeg" type="number" min="4" max="90" value="${h(b.segundos || cat.find((c) => c.id === sel)?.seg || 12)}" style="width:110px"></div>
                <div><label>Loop</label><label style="display:flex;gap:6px;align-items:center;color:var(--t)"><input id="mLoop" type="checkbox" style="width:auto" ${b.loop ? "checked" : ""}> termina como empieza</label></div></div>
              <label>Medios</label>
              <select id="mMedios">${["ninguno, solo gráfico", "mis fotos o clips (los pongo en proyectos/" + p.id + "/motion/media)", "un clip de Google Flow (con aprobación)"].map((o) => `<option ${b.medios === o ? "selected" : ""}>${h(o)}</option>`).join("")}</select>
            </div>
            <div style="flex:1;min-width:260px">
              <label>Texto en pantalla (opcional; si no, Claude lo escribe del tema)</label>
              <textarea id="mTextos" placeholder="Las palabras exactas, una idea por línea">${h(b.textos || "")}</textarea>
              <label>Marca: colores, fuentes, logo <button class="mini" id="mLevania" style="margin-left:6px">Usar Levania</button></label>
              <textarea id="mMarca" placeholder="Vacío = las del estilo">${h(b.marca || "")}</textarea>
              <label>Narración · voz en off (una línea por escena; vacío = sin voz)</label>
              <textarea id="mNarracion" placeholder="Lo que dice la voz en cada escena">${h(b.narracion || "")}</textarea>
              ${b.narracion ? `<div class="fila" style="margin:4px 0 8px">${S.info.voz ? `<button class="btn peq" id="mVoz">${p.motionVoz ? "Rehacer la voz" : "Hacer la voz"}</button>` : `<span class="estado">Pon tu llave de ElevenLabs para la voz.</span>`}${p.motionVoz ? `<audio controls src="/proyectos/${h(p.id)}/voz.mp3?v=${Date.now()}" style="flex:1;min-width:180px"></audio><span class="estado">${p.motionVoz.duracion.toFixed(1)} s</span>` : ""}</div>
                <div class="estado">Haz la voz <b>antes</b> de que Claude Code construya: así anima cada escena al ritmo de lo que se dice.</div>` : ""}
              <label>Notas para Claude</label><textarea id="mNotas" style="min-height:44px">${h(b.notas || "")}</textarea>
            </div>
          </div>
        </div></section>

      <section class="paso">${pasoCab(2, "voz", "Construir con Claude Code")}
        <div class="cont">
          ${!me.brief ? `<div class="estado">Primero elige el estilo y guarda el brief.</div>` : `
          ${b.narracion?.trim() && !p.motionVoz ? `<p class="estado" style="margin-top:0;color:var(--am)"><b>Primero la voz:</b> dale "Hacer la voz" en el brief (arriba). Cuando esté, pídele a Claude Code los pendientes.</p>` : `<p class="estado" style="margin-top:0">${p.motionVoz ? "<b style='color:var(--ok)'>✓ La voz ya está.</b> " : ""}Ya puede construirse. Abre <b>Claude Code</b> en la carpeta de la fábrica en tu laptop y escríbele:</p>`}
          <div class="fila"><code style="background:var(--f);border:1px solid var(--b);padding:8px 12px;border-radius:8px">${h(cmd)}</code><button class="btn peq" id="mCopiar">Copiar</button></div>
          <p class="estado">Te va a enseñar tarjetas y fotogramas para aprobar antes de renderizar. ${me.construido ? "<b style='color:var(--ok)'>✓ Ya está construido.</b>" : "Todavía no está construido."}</p>
          ${me.frames?.length ? `<div class="fila">${me.frames.slice(0, 6).map((f) => `<img src="/${h(f)}" style="height:140px;border-radius:8px;border:1px solid var(--b)">`).join("")}</div>` : ""}`}
        </div></section>

      <section class="paso">${pasoCab(3, "render", "Video", `<button class="btn peq ${me.construido ? "primario" : ""}" id="rHacer" ${!me.construido || ocupado("render") ? "disabled" : ""}>${p.tieneFinal ? "Volver a renderizar" : "Renderizar"}</button>`)}
        <div class="cont">
          <div class="barra oculto" id="bar-render"><div></div></div>
          ${p.tieneFinal ? `<video controls src="/proyectos/${h(p.id)}/final.mp4?v=${Date.now()}" style="max-height:520px"></video>
            <div class="fila" style="margin:10px 0"><a class="btn peq" href="/proyectos/${h(p.id)}/final.mp4" download="${h(p.id)}.mp4">Descargar video</a><button class="btn peq" id="mMezclar" title="Le pone la voz y la música (tuya, de ElevenLabs o de tu biblioteca) sin volver a renderizar">Poner audio (voz + música)</button></div>`
          : `<div class="estado">Cuando Claude Code termine, renderiza aquí (o él mismo te lo deja listo).</div>`}
        </div></section>
      ${est?.musicaIA ? panelMusica(p, est) : ""}
      ${p.tieneFinal ? panelCopys() : ""}
    </div>`;

  for (const v of document.querySelectorAll(".mot video")) { const c = v.closest(".mot"); c.onmouseenter = () => v.play().catch(() => {}); c.onmouseleave = () => { v.pause(); }; }
  let elegido = sel;
  for (const c of document.querySelectorAll("[data-mot]")) c.onclick = () => {
    elegido = c.dataset.mot;
    for (const x of document.querySelectorAll("[data-mot]")) { const on = x.dataset.mot === elegido; x.style.borderColor = on ? "var(--a)" : ""; x.style.boxShadow = on ? "0 0 0 2px var(--a) inset" : ""; }
    const s = cat.find((x) => x.id === elegido); if (s && !b.segundos) $("#mSeg").value = Math.round(s.seg);
  };
  $("#mLevania").onclick = () => ($("#mMarca").value = MARCA_LEVANIA.replace("<id>", p.id));
  $("#mGuardar").onclick = async () => {
    if (!elegido) return avisar("Elige un estilo de la galería.", true);
    await api(`/api/proyectos/${p.id}/brief`, "PUT", { estiloMotion: elegido, formato: p.formato, para: $("#mPara").value, segundos: Number($("#mSeg").value),
      loop: $("#mLoop").checked, textos: $("#mTextos").value, narracion: $("#mNarracion").value, marca: $("#mMarca").value, medios: $("#mMedios").value, notas: $("#mNotas").value });
    avisar("Brief guardado."); S.proyectos = await api("/api/proyectos"); abrir(p.id, { mantener: true });
  };
  if ($("#mCopiar")) $("#mCopiar").onclick = () => navigator.clipboard.writeText(cmd).then(() => avisar("Copiado. Pégalo en Claude Code."));
  $("#rHacer").onclick = () => api(`/api/proyectos/${p.id}/render`, "POST").catch((e) => avisar(e.message, true));
  $("#pTitulo").onchange = async (e) => { await api(`/api/proyectos/${p.id}`, "PATCH", { titulo: e.target.value }); S.proyectos = await api("/api/proyectos"); pintarLista(); };
  for (const bt of document.querySelectorAll("#pFormato button")) bt.onclick = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { formato: bt.dataset.v }); abrir(p.id, { mantener: true }); };
  if (S.progreso[p.id]?.render) mostrarProgreso("render", S.progreso[p.id].render);
  if ($("#muGenerar")) eventosMusica(p, est);
  if (p.tieneFinal) cargarCopys(p);
  if ($("#mMezclar")) $("#mMezclar").onclick = () => api(`/api/proyectos/${p.id}/remezclar`, "POST").then(() => avisar("Mezclando el audio…")).catch((e) => avisar(e.message, true));
  if ($("#mVoz")) $("#mVoz").onclick = async () => { await $("#mGuardar")?.onclick?.(); api(`/api/proyectos/${p.id}/voz-motion`, "POST").then(() => avisar("Haciendo la voz…")).catch((e) => avisar(e.message, true)); };
}

// ---------- copy para publicar (GoHighLevel) ----------
const REDES_COPY = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"]];
function panelCopys() {
  return `<section class="paso"><div class="cab"><div class="num listo">✎</div><div><h2>Copy para publicar</h2><div class="estado" id="cpEstado">Para pegar en GoHighLevel (Social Planner): un texto por red</div></div>
      <div class="der"><button class="btn peq" id="cpIA" ${S.info.ia ? "" : "disabled title='Falta la llave de Gemini'"}>Mejorar con IA</button><button class="btn peq" id="cpGuardar">Guardar cambios</button><button class="mini" id="cpReset" title="Volver al texto armado con el guion">Restablecer</button></div></div>
    <div class="cont"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${REDES_COPY.map(([k, n]) => `<div><div class="fila" style="justify-content:space-between"><label>${n}</label><button class="mini" data-cpcopiar="${k}">Copiar</button></div><textarea id="cp-${k}" style="min-height:170px;font-size:13.5px"></textarea><div class="estado" id="cpn-${k}"></div></div>`).join("")}
      <div><div class="fila" style="justify-content:space-between"><label>YouTube Shorts · título</label><button class="mini" data-cpcopiar="yt-titulo">Copiar</button></div><input id="cp-yt-titulo">
        <div class="fila" style="justify-content:space-between;margin-top:6px"><label>YouTube · descripción</label><button class="mini" data-cpcopiar="yt-desc">Copiar</button></div><textarea id="cp-yt-desc" style="min-height:110px;font-size:13.5px"></textarea></div>
      <div style="grid-column:1/-1;border-top:1px dashed var(--b);padding-top:12px" id="ghlCaja"></div>
    </div></div></section>`;
}
async function cargarCopys(p) {
  if (!$("#cp-instagram")) return;
  const poner = (c) => {
    for (const [k] of REDES_COPY) $("#cp-" + k).value = c[k] || "";
    $("#cp-yt-titulo").value = c.youtube?.titulo || ""; $("#cp-yt-desc").value = c.youtube?.descripcion || "";
    $("#cpEstado").textContent = c.hecho === "ia" ? "Escrito con IA (revísalo antes de publicar)" : c.editado ? "Editado por ti" : "Armado con el guion: dale \"Mejorar con IA\" para uno por red";
    contar();
  };
  const contar = () => { const lim = { instagram: 2200, facebook: 63206, tiktok: 2200 }; for (const [k] of REDES_COPY) { const n = $("#cp-" + k).value.length; $("#cpn-" + k).textContent = `${n} caracteres${n > lim[k] ? " · demasiado largo" : ""}`; } };
  const leerForm = () => ({ ...Object.fromEntries(REDES_COPY.map(([k]) => [k, $("#cp-" + k).value])), youtube: { titulo: $("#cp-yt-titulo").value, descripcion: $("#cp-yt-desc").value } });
  poner(await api(`/api/proyectos/${p.id}/copys`));
  for (const [k] of REDES_COPY) $("#cp-" + k).oninput = contar;
  for (const b of document.querySelectorAll("[data-cpcopiar]")) b.onclick = () => navigator.clipboard.writeText($("#cp-" + b.dataset.cpcopiar).value).then(() => avisar("Copiado. Pégalo en GHL."));
  $("#cpGuardar").onclick = async () => { poner(await api(`/api/proyectos/${p.id}/copys`, "PUT", leerForm())); avisar("Copy guardado."); };
  $("#cpReset").onclick = async () => { if (confirm("¿Volver al texto armado con el guion? Se pierden tus cambios.")) poner(await api(`/api/proyectos/${p.id}/copys`, "DELETE")); };
  pintarGHL(p, leerForm, async () => { await api(`/api/proyectos/${p.id}/copys`, "PUT", leerForm()); });
  $("#cpIA").onclick = async () => { $("#cpIA").disabled = true; $("#cpIA").textContent = "Escribiendo…"; try { poner(await api(`/api/proyectos/${p.id}/copys`, "POST")); } catch (e) { avisar(e.message, true); } $("#cpIA").disabled = false; $("#cpIA").textContent = "Mejorar con IA"; };
}

async function pintarGHL(p, leerForm, guardarAntes, forzar = false) {
  const caja = $("#ghlCaja"); if (!caja) return;
  const prog = (p.ghl?.programados || []).slice(-6).reverse();
  const hechos = prog.length ? `<div class="estado" style="margin-top:6px">Ya programado: ${prog.map((x) => `${h(x.plataforma)} · ${new Date(x.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`).join(" | ")}</div>` : "";
  if (!S.info.ghl) { caja.innerHTML = `<b>Programar en GoHighLevel</b><div class="estado">Para programarlo desde aquí, pon <code>GHL_TOKEN</code> y <code>GHL_LOCATION_ID</code> en el .env (cómo sacarlos: .env.example) y reinicia la fábrica. Mientras, copia y pega cada texto en el Social Planner.</div>${hechos}`; return; }
  caja.innerHTML = `<b>Programar en GoHighLevel</b> <span class="estado" id="ghlEst">cargando tus cuentas…</span>${hechos}`;
  let cs; try { cs = await api("/api/ghl/cuentas" + (forzar ? "?forzar=1" : "")); } catch (e) { $("#ghlEst").textContent = e.message; return; }
  // marcas: cada cuenta pertenece a una marca. Por nombre: la que diga "monarca" es de Monarca; las demás, de Levania.
  // Se puede cambiar con "Asignar marcas" (queda guardado en este navegador).
  const MARCAS = { levania: "Levania", monarca: "Monarca" };
  const asignadas = JSON.parse(localStorage.getItem("ghlMarcaDe") || "{}");
  const marcaDe = (a) => asignadas[a.id] || (/monarca/i.test(a.nombre) ? "monarca" : "levania");
  const porDefecto = p.estilo === "reflexion-estatuas" || /monarca/i.test(`${p.canal || ""} ${p.nicho || ""}`) ? "monarca" : "levania";
  const manana = new Date(Date.now() + 864e5); manana.setHours(19, 0, 0, 0);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  caja.innerHTML = `<b>Programar en GoHighLevel</b> <span class="estado">un post por red, cada uno con su texto de arriba</span> <button class="mini" id="ghlRecargar" title="Vuelve a pedir a GHL las cuentas conectadas (si acabas de conectar una)">Actualizar cuentas</button>${hechos}
    <div class="fila" style="margin:8px 0;align-items:center"><label class="estado">Marca</label><select id="ghlMarca" style="width:auto">${Object.entries(MARCAS).map(([k, n]) => `<option value="${k}" ${k === porDefecto ? "selected" : ""}>${n}</option>`).join("")}</select>
      <button class="mini" id="ghlAsignar" title="Cambia a qué marca pertenece cada cuenta">Asignar marcas</button></div>
    <div class="fila" id="ghlLista" style="margin:8px 0;flex-wrap:wrap"></div>
    <div class="fila"><label class="estado">Cuándo</label><input type="datetime-local" id="ghlFecha" value="${local(manana)}" style="width:auto"><button class="btn primario peq" id="ghlIr" ${cs.length ? "" : "disabled"}>Programar en GHL</button></div>`;
  let asignando = false;
  const pintarLista = () => {
    const m = $("#ghlMarca").value, xs = asignando ? cs : cs.filter((a) => marcaDe(a) === m);
    $("#ghlLista").innerHTML = !cs.length ? `<span class="estado">No hay redes conectadas en el Social Planner de esa subcuenta.</span>`
      : asignando ? xs.map((a) => `<label class="estado" style="display:flex;gap:6px;align-items:center">${h(a.plataforma)} · ${h(a.nombre)} <select data-ghlm="${h(a.id)}" style="width:auto">${Object.entries(MARCAS).map(([k, n]) => `<option value="${k}" ${marcaDe(a) === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("") + `<button class="mini" id="ghlAsignarOk">Listo</button>`
      : xs.length ? xs.map((a) => `<label class="estado" style="display:flex;gap:6px;align-items:center;${a.caducada ? "opacity:.5" : ""}"><input type="checkbox" value="${h(a.id)}" data-ghlc style="width:auto" ${a.caducada ? "disabled title='Reconéctala en GHL'" : "checked"}>${h(a.plataforma)} · ${h(a.nombre)}</label>`).join("")
      : `<span class="estado">${MARCAS[m]} todavía no tiene redes conectadas en GHL (o asígnalas con «Asignar marcas»).</span>`;
    for (const sel of document.querySelectorAll("[data-ghlm]")) sel.onchange = () => { asignadas[sel.dataset.ghlm] = sel.value; localStorage.setItem("ghlMarcaDe", JSON.stringify(asignadas)); };
    if ($("#ghlAsignarOk")) $("#ghlAsignarOk").onclick = () => { asignando = false; pintarLista(); };
  };
  $("#ghlMarca").onchange = pintarLista;
  $("#ghlAsignar").onclick = () => { asignando = true; pintarLista(); };
  pintarLista();
  $("#ghlRecargar").onclick = () => pintarGHL(p, leerForm, guardarAntes, true);
  $("#ghlIr").onclick = async () => {
    const ids = [...document.querySelectorAll("[data-ghlc]:checked")].map((x) => x.value);
    if (!ids.length) return avisar("Elige al menos una red.", true);
    const f = new Date($("#ghlFecha").value);
    const redes = cs.filter((a) => ids.includes(a.id)).map((a) => `${a.plataforma} (${a.nombre})`).join(", ");
    if (!confirm(`Se programará este video de ${$("#ghlMarca").selectedOptions[0].text.toUpperCase()} en: ${redes}\nEl ${f.toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short" })}\ncon el texto de cada red tal como está arriba. ¿Seguir?`)) return;
    $("#ghlIr").disabled = true; $("#ghlIr").textContent = "Subiendo y programando…";
    try { await guardarAntes(); const r = await api(`/api/proyectos/${p.id}/ghl`, "POST", { cuentas: ids, fecha: f.toISOString() }); avisar(`Listo: programado en ${r.programados.map((x) => x.plataforma).join(", ")}. Revísalo en el Social Planner de GHL.`); abrir(p.id, { mantener: true }); }
    catch (e) { avisar(e.message, true); $("#ghlIr").disabled = false; $("#ghlIr").textContent = "Programar en GHL"; }
  };
}

// ---------- historia con Flow: un clip por escena ----------
const ORIGEN_CLIP = { banco: "del banco", pexels: "Pexels" };
function galeriaAnuncios(p) {
  const xs = p.exportadas || []; if (!xs.length) return "";
  const grupos = {}; for (const x of xs) { const m = x.match(/-(\d+x\d+)-v(\d+)\.jpg$/); (grupos[m ? m[1] : "?"] ||= []).push(x); }
  return `<div class="estado" style="margin-bottom:6px"><b>${xs.length} imágenes</b> (también en <b>listos</b>, con el texto del anuncio). Toca una para descargarla.</div>
    ${Object.entries(grupos).map(([g, l]) => `<div class="estado">${g.replace("x", ":")}</div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;margin-bottom:8px">${l.map((x) => `<a href="/proyectos/${h(p.id)}/anuncios/${h(x)}" download="${h(x)}"><img src="/proyectos/${h(p.id)}/anuncios/${h(x)}?v=${Date.now()}" loading="lazy" style="width:100%;border-radius:6px"></a>`).join("")}</div>`).join("")}`;
}
function panelAvatar(p) {
  const a = p.avatar || {};
  return `<div class="card" style="margin:8px 0;padding:12px">
    <b>Cambiar avatar</b> <span class="estado">— tu video conserva movimiento, cámara y audio; cambia la persona (y el fondo, si quieres).</span>
    <div class="estado" style="margin:6px 0">Usa solo videos tuyos, con licencia o hechos con IA, y un personaje ficticio o de alguien que te dio permiso.</div>
    <div class="fila" style="gap:8px;align-items:center">
      ${a.fuente ? `<video src="/proyectos/${h(p.id)}/avatar/${h(a.fuente)}" muted playsinline preload="metadata" style="height:110px;border-radius:6px;background:#000" onmouseenter="this.play()" onmouseleave="this.pause()"></video>` : ""}
      <button class="mini" id="avFuente">${a.fuente ? "Cambiar video" : "Subir tu video (3-30 s)"}</button>
      ${a.imagen ? `<span style="position:relative"><img src="/proyectos/${h(p.id)}/avatar/${h(a.imagen)}?v=${Date.now()}" style="height:110px;border-radius:6px"><button class="mini" id="avQuitar" style="position:absolute;top:-6px;right:-6px">×</button></span>` : ""}
      <button class="mini" id="avImagen">${a.imagen ? "Cambiar personaje" : "Subir foto del personaje"}</button>
    </div>
    ${a.imagen ? "" : `<label>O descríbelo y APIMart crea la foto</label><input id="avDesc" value="${h(a.descripcion)}" placeholder="Mamá mexicana de 35 años, cabello castaño en cola, blusa blanca, jeans">`}
    <label>Fondo nuevo (opcional; vacío = el mismo de tu video)</label><input id="avFondo" value="${h(a.fondo || "")}" placeholder="Cocina mexicana luminosa por la mañana, plantas y azulejos">
    <div class="fila" style="margin-top:8px;align-items:center">
      <select id="avMotor" style="width:auto"><option value="kling" ${p.opciones?.motorAvatar !== "seedance" ? "selected" : ""}>Kling Motion Control</option><option value="seedance" ${p.opciones?.motorAvatar === "seedance" ? "selected" : ""}>Seedance 2.5</option></select>
      <select id="avCalidad" style="width:auto"><option value="std">Estándar</option><option value="pro">Pro (mejor, más caro)</option></select>
      <button class="btn peq primario" id="avHacer" ${p.apimart && a.fuente ? "" : "disabled"}>${a.resultado ? "Volver a cambiar el avatar" : "Cambiar avatar"}</button>
    </div>
    ${a.resultado ? `<video controls src="/proyectos/${h(p.id)}/avatar/resultado.mp4?v=${Date.now()}" style="width:220px;margin-top:8px;border-radius:8px"></video>` : ""}
  </div>`;
}
function panelProductoAPIMart(p, faltan) {
  const fs_ = p.fotosProducto || [], op = p.opciones || {};
  if (op.plantilla === "avatar") return panelAvatar(p);
  if (op.generador === "flow") return `<div class="estado" style="margin:8px 0">Imágenes con <b>Google Flow</b> (botón de abajo; solo en la laptop con la skill). ${op.tipo === "video" && op.animar === "si" ? "Como es video con clips, Flow hace video por escena." : ""}</div>`;
  return `<div class="fila" style="margin:8px 0;align-items:center">
      <button class="btn peq primario" id="cAPI" ${p.apimart && faltan ? "" : "disabled"} title="${p.apimart ? "Genera con APIMart (Nano Banana 2) las imágenes que faltan, usando la foto del producto de referencia" : "Pon APIMART_API_KEY en el .env"}">Generar con APIMart las que faltan</button>
      <span class="estado">máx.</span><input id="cAPImax" type="number" value="8" min="1" max="20" style="width:70px">
      <button class="btn peq" id="cAPItodas" ${p.apimart ? "" : "disabled"} title="Vuelve a generar todas (gasta créditos)">Rehacer todas</button>
      ${op.tipo === "video" ? `<button class="btn peq" id="cAnimar" ${p.apimart ? "" : "disabled"} title="Convierte cada foto en un clip de 5 s con Seedance 2.5 (gasta más créditos que una imagen)">Animar las fotos (clips de video)</button>` : ""}
    </div>
    <div class="fila" style="margin:4px 0 10px;align-items:center;gap:8px"><span class="estado"><b>Foto del producto</b> (referencia para que salga igual):</span>
      ${fs_.map((f) => `<span style="position:relative"><img src="/proyectos/${h(p.id)}/producto/${h(f)}?v=1" style="height:64px;border-radius:6px"><button class="mini" data-pdel="${h(f)}" style="position:absolute;top:-6px;right:-6px">×</button></span>`).join("")}
      <button class="mini" id="cProd">Subir foto</button></div>`;
}
function panelRevision(p) {
  const r = p.revision, ic = { verde: "🟢", amarillo: "🟡", rojo: "🔴" };
  const nombres = { formato: "Formato", gancho: "Gancho (primeros 2 s)", brillo: "Brillo", volumen: "Volumen", cortes: "Negros / congelados" };
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="fila" style="align-items:center"><b>Revisar antes de publicar</b> ${r ? `<span>${ic[r.estado]}</span>` : ""}<button class="mini" id="rRevisar">${r ? "Volver a revisar" : "Revisar"}</button></div>
    ${r ? `<div style="margin-top:6px">${Object.keys(nombres).map((k) => r[k] ? `<div class="estado">${ic[r[k].estado]} <b>${nombres[k]}:</b> ${h(r[k].msg)}</div>` : "").join("")}</div>
    <div class="estado" style="margin-top:6px">📱 ${h(r.celular?.msg || "")}</div>
    <img src="/proyectos/${h(p.id)}/revision-celular.jpg?v=${Date.now()}" style="width:100%;max-width:820px;border-radius:8px;margin-top:6px">` : `<div class="estado">Mide el gancho, el brillo, el volumen y cómo se ve en el celular. Se hace solo al terminar cada video.</div>`}
  </div>`;
}
function panelImagenes(p) {
  const im = p.imagenesPost, fs_ = im?.archivos || [], base = `/proyectos/${h(p.id)}/imagenes/`;
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="fila" style="align-items:center"><button class="btn peq primario" id="iSacar">${fs_.length ? "Rehacer imágenes" : "Sacar imágenes para el feed"}</button>
      ${fs_.length ? `<button class="mini" id="iTexto">Copiar todo el texto</button>` : ""}</div>
    <div class="estado">Con las imágenes y frases de este video (sin gastar): la frase más fuerte como imagen suelta y un carrusel de una diapositiva por escena, en 4:5. También quedan en <b>listos/${h(p.id)}-imagenes</b>.</div>
    ${fs_.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-top:8px">${fs_.map((f) => `<a href="${base}${h(f)}" download="${h(p.id)}-${h(f)}"><img src="${base}${h(f)}?v=${Date.now()}" style="width:100%;border-radius:6px"><div class="estado">${f === "frase.jpg" ? "Imagen suelta" : h(f.replace(/\.jpg$/, ""))}</div>${(() => { const d = f === "frase.jpg" ? null : im.copy?.diapositivas?.[parseInt(f.replace(/\D/g, ""), 10) - 1]; return d?.significado ? `<div class="estado" style="font-size:12px;opacity:.85">${h(d.significado)}</div>` : ""; })()}</a>`).join("")}</div>` : ""}
    ${im?.copy?.suelta || im?.copy?.carrusel ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:10px">${[["suelta", "Copy de la imagen suelta"], ["carrusel", "Copy del carrusel"]].filter(([k]) => im.copy[k]).map(([k, t]) => `<div class="card" style="padding:10px"><div class="fila" style="align-items:center;justify-content:space-between"><b>${t}</b><button class="mini" data-copiaimg="${k}">Copiar</button></div><div class="estado" style="white-space:pre-wrap;margin-top:6px">${h(im.copy[k])}${im.copy.hashtags?.length ? "\n\n" + h(im.copy.hashtags.join(" ")) : ""}</div></div>`).join("")}</div>` : ""}
  </div>`;
}
function panelMiniaturas(p) {
  const m = p.miniaturas, ops = m?.opciones || [];
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="fila" style="align-items:center"><button class="btn peq primario" id="mCrear">${ops.length ? "Rehacer miniaturas" : "Crear miniaturas de YouTube"}</button>
      <label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="mIA" style="width:auto"> fondo nuevo con APIMart (gasta créditos)</label></div>
    <div class="estado">3 opciones de 1280×720 con texto grande, hechas con lo que funciona en las miniaturas del nicho. Por defecto usan las imágenes de tu video.</div>
    ${m?.sinEstudio ? `<div class="nota">Usé una receta base. Para afinarla con miniaturas reales del nicho: <code>node fabrica.js miniatura-estudiar</code> (o pídeselo a Claude Code).</div>` : ""}
    ${ops.length ? `<img src="/proyectos/${h(p.id)}/miniaturas/comparativa.jpg?v=${Date.now()}" style="width:100%;max-width:900px;border-radius:8px;margin-top:8px">
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:8px">${ops.map((o) => `<div class="card" style="padding:8px">
      <img src="/proyectos/${h(p.id)}/miniaturas/${h(o.archivo)}?v=${Date.now()}" style="width:100%;border-radius:6px">
      <div class="fila" style="margin-top:6px;align-items:center"><b>${h(o.letra)}</b><span class="estado">${h((o.lineas || []).join(" "))}</span></div>
      <div class="fila" style="margin-top:4px"><button class="mini" data-musar="${h(o.letra)}">${m.elegida === o.letra ? "✓ Elegida" : "Usar esta"}</button><a class="mini" href="/proyectos/${h(p.id)}/miniaturas/${h(o.archivo)}" download="${h(p.id)}-miniatura-${h(o.letra)}.jpg">Descargar</a></div></div>`).join("")}</div>` : ""}
  </div>`;
}
function panelCortes(p) {
  const cs = p.cortes || [], caps = cs.filter((c) => c.tipo === "capitulo"), reels = cs.filter((c) => c.tipo === "reel");
  const tarjeta = (c) => `<div class="card" style="padding:8px">
      <video controls preload="none" poster="/proyectos/${h(p.id)}/capitulos/${h(c.archivo.replace(/\.mp4$/, ".jpg"))}?v=${Date.now()}" src="/proyectos/${h(p.id)}/capitulos/${h(c.archivo)}" style="width:100%;max-height:${c.tipo === "reel" ? 300 : 180}px;background:#000;border-radius:8px"></video>
      <div class="estado" style="margin-top:4px"><b style="color:var(--t)">${c.tipo === "reel" ? "Reel" : "Capítulo"} ${c.n}</b> · ${h(c.titulo || "")} · ${Math.floor(c.segundos / 60)}:${String(c.segundos % 60).padStart(2, "0")}</div>
      <div class="fila" style="margin-top:4px"><a class="mini" href="/proyectos/${h(p.id)}/capitulos/${h(c.archivo)}" download="${h(p.id)}-${h(c.archivo)}">Descargar</a><button class="mini" data-copiacap="${h(c.archivo.replace(/\.mp4$/, ".txt"))}">Copiar texto</button></div></div>`;
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="fila"><button class="btn peq primario" id="cCortar">${cs.length ? "Volver a cortar" : "Cortar por capítulos"}</button>
      <label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cCortarReels" style="width:auto" checked> con un Reel vertical de cada capítulo</label></div>
    <div class="estado">Cada capítulo sale como video propio para Facebook (título al inicio y cierre suave) y, si quieres, un Reel de 35-60 s en 9:16.</div>
    ${caps.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:8px">${caps.map(tarjeta).join("")}</div>` : ""}
    ${reels.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-top:8px">${reels.map(tarjeta).join("")}</div>` : ""}
  </div>`;
}
const faltanImg = (p) => (p.clips || []).filter((x) => x.tipo !== "cierre" && !x.archivo && !x.misma).length;
function panelClips(p) {
  const aud = p.auditoria?.escenas || {}, malas = Object.entries(aud).filter(([, r]) => r.ok === false).map(([n]) => +n);
  const cs = p.clips || [], faltan = cs.filter((x) => (x.tipo !== "cierre" || estiloDe(p.estilo)?.clipsFlow === "imagen") && !x.archivo && !x.misma).length, est = estiloDe(p.estilo) || {}, img = est.clipsFlow === "imagen";
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="estado" id="est-fondo">Clips por escena: ${cs.filter((x) => x.archivo).length} listos${cs.some((x) => x.misma) ? ` · ${cs.filter((x) => x.misma).length} siguen con la imagen anterior` : ""} · ${faltan} sin ${img ? "imagen" : "clip"} (${est.banco ? "al hacer el video se llenan solas: banco de videos anteriores → Pexels → banco" : 'sin clip usa Pexels con "buscar" o un dibujo animado'})</div>
    <div class="barra oculto" id="bar-fondo"><div></div></div>
    ${est.anuncios ? panelProductoAPIMart(p, faltan) : ""}
    <div class="fila" style="margin:8px 0;${est.anuncios && p.opciones?.generador !== "flow" ? "display:none" : ""}">
      <button class="btn peq primario" id="cFlow" ${S.info.flow && faltan ? "" : "disabled"} title="${S.info.flow ? "Genera en Flow los que faltan" : "Flow solo funciona en la laptop con la skill instalada"}">Generar en Flow ${img ? "las imágenes" : "los"} que faltan</button>
      ${S.info.flowSkill && !img ? `<select id="cModelo" style="width:auto" title="Modelo de video de Flow (más caro = mejor)"></select>
        <label class="estado" style="display:flex;gap:6px;align-items:center" title="Primero hace una imagen de los personajes y el primer cuadro de cada escena con ella; luego anima. Gasta un poco más pero la familia sale igual en todas."><input type="checkbox" id="cCuadros" style="width:auto" checked> personajes iguales (imagen → video)</label>`
        : S.info.flowSkill ? "" : `<span class="estado">Tope de créditos por clip</span><input id="cMax" type="number" value="25" min="1" style="width:80px">`}
      ${S.info.ia && cs.some((x) => x.archivo) ? `<button class="btn peq" id="cAuditar" title="La IA mira cada clip (3 cuadros) contra el guion y los personajes y marca los que salieron mal. No gasta Flow.">Auditar escenas</button>` : ""}
      ${S.info.flowSkill && malas.length ? `<button class="btn peq primario" id="cRehacerMalas" title="Rehace en Flow solo las marcadas por el auditor, con su corrección">Rehacer las marcadas (${malas.length})</button>` : ""}
      ${S.info.flowSkill && img && est.animar ? `<button class="btn peq" id="cAnimar" title="Cuando ya estén las imágenes: elige ~1 de cada 3 (agua, vapor, pincel…; o las que marques con animar:true) y las anima en Flow, 8 s cada una">Animar las marcadas en Flow</button>` : ""}
      ${!S.info.flow && S.info.laptop ? `<button class="btn peq primario" id="cLaptop" ${faltan ? "" : "disabled"} title="La laptop (prendida, con la fábrica abierta y Tailscale) las hace en Flow y regresan solas">Generar en la laptop (Flow)</button>` : ""}
      ${!est.anuncios && S.info.apimart ? `<button class="btn peq" id="cAPIhist" ${faltan ? "" : "disabled"} title="Genera con APIMart (Nano Banana 2) las imágenes que faltan; cuesta unos centavos por imagen">Generar con APIMart</button>` : ""}
      ${S.info.flow || S.info.laptop ? "" : `<span class="estado">Flow solo está en la laptop: copia cada prompt, hazlo en Flow y súbelo aquí${S.info.apimart ? ", o usa APIMart" : ""}.</span>`}
      ${est.banco && S.info.espejo ? `<button class="btn peq" id="cEspejo" title="Manda al VPS las imágenes del banco y la música generada que aún no tenga">Enviar banco y música al VPS</button>` : ""}
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${cs.map((x) => `
      <div class="card" style="padding:10px">
        <div class="estado"><b style="color:var(--t)">Escena ${x.n}</b> · ${x.tipo === "cierre" && !img ? "cierre (sin clip)" : x.archivo ? `<span style="color:var(--ok)">✓ ${ORIGEN_CLIP[x.origen] || (img ? "imagen" : "clip")}</span>` : x.misma ? "<span class='estado'>misma imagen que la anterior</span>" : "<span style='color:var(--am)'>sin clip</span>"}</div>
        ${x.archivo && /\.(mp4|mov|webm|m4v)$/i.test(x.archivo) ? `<video src="/proyectos/${h(p.id)}/clips/${h(x.archivo)}" muted loop playsinline preload="metadata" style="width:100%;max-height:200px;border-radius:8px;background:#000;margin-top:6px" onmouseenter="this.play()" onmouseleave="this.pause()"></video>` : x.archivo ? `<img src="/proyectos/${h(p.id)}/clips/${h(x.archivo)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-top:6px">` : ""}
        ${aud[x.n]?.ok === false ? `<div class="estado" style="color:var(--err,#e5534b);font-size:12px;margin-top:4px">⚠ ${h(aud[x.n].problema)}</div>` : aud[x.n]?.ok === null ? `<div class="estado" style="font-size:12px">${h(aud[x.n].problema)}</div>` : p.auditoria && x.archivo ? `<div class="estado" style="font-size:12px;color:var(--ok)">✓ auditada</div>` : ""}
        ${x.buscar ? `<div class="estado" style="font-size:12px">buscar: ${h(x.buscar)}</div>` : ""}
        ${x.tipo !== "cierre" || img ? `<div class="fila" style="margin-top:6px"><button class="mini" data-csub="${x.n}">${x.archivo ? "Cambiar" : "Subir"}</button>${S.info.flowSkill && x.archivo && !x.misma && x.flowPrompt ? `<button class="mini" data-crehacer="${x.n}" title="Vuelve a generar esta escena en Flow, imagen y animación (puedes escribir qué corregir)">Rehacer en Flow</button>` : ""}${S.info.flowSkill && x.archivo && x.cuadro && x.flowPrompt ? `<button class="mini" data-creanimar="${x.n}" title="La imagen está bien: solo vuelve a animarla (1 video)">Reanimar</button>` : ""}${est.banco ? `<button class="mini" data-cbanco="${x.n}" title="Imágenes de videos anteriores de este estilo">Banco</button>` : ""}<button class="mini" data-cpex="${x.n}" ${S.info.pexels ? "" : "disabled title='Pon PEXELS_API_KEY en el .env (gratis en pexels.com/api)'"}>Pexels</button>${x.flowPrompt ? `<button class="mini" data-cprom="${x.n}">Copiar prompt</button>` : ""}${x.archivo ? `<button class="mini" data-cdel="${x.n}">Quitar</button>` : ""}</div>` : ""}
      </div>`).join("")}</div>
    <div id="cBancoCaja"></div>
  </div>`;
}
async function abrirBanco(p, n) {
  const caja = $("#cBancoCaja"), x = (p.clips || []).find((c) => c.n === n) || {};
  caja.innerHTML = `<div class="card" style="margin-top:12px"><div class="estado">Cargando banco…</div></div>`;
  const { lista } = await api(`/api/banco?estilo=${encodeURIComponent(p.estilo)}`);
  const quiero = String(`${x.buscar} ${x.flowPrompt}`).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const pts = (b) => (b.etiquetas || []).filter((w) => quiero.includes(w)).length;
  lista.sort((a, b) => pts(b) - pts(a));
  caja.innerHTML = `<div class="card" style="margin-top:12px">
    <div class="fila" style="justify-content:space-between"><b>Banco · escena ${n}</b><button class="mini" id="cBancoCerrar">Cerrar</button></div>
    ${lista.length ? `<p class="estado">${lista.length} imágenes de videos anteriores (primero las que más se parecen a "${h(x.buscar || "")}"). Toca una para usarla.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:420px;overflow:auto">${lista.map((b) => /\.(mp4|mov|webm|m4v)$/i.test(b.archivo)
      ? `<video src="/${h(b.ruta)}" muted preload="metadata" data-bsel="${h(b.archivo)}" title="${h(b.buscar || b.prompt)}" style="width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:6px;cursor:pointer;background:#000"></video>`
      : `<img src="/${h(b.ruta)}" loading="lazy" data-bsel="${h(b.archivo)}" title="${h(b.buscar || b.prompt)}" style="width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:6px;cursor:pointer">`).join("")}</div>`
    : `<p class="estado">El banco de este estilo está vacío. Se llena solo con las imágenes que generes con Flow (o subas) en cada video.</p>`}</div>`;
  $("#cBancoCerrar").onclick = () => (caja.innerHTML = "");
  for (const el of caja.querySelectorAll("[data-bsel]")) el.onclick = async () => { await api(`/api/proyectos/${p.id}/clip-banco`, "POST", { n, archivo: el.dataset.bsel }); avisar(`Escena ${n}: imagen del banco.`); abrir(p.id, { mantener: true }); };
  caja.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function eventoEnviarVPS(p) {
  if ($("#pSeg")) $("#pSeg").onchange = async (e) => { await api(`/api/proyectos/${p.id}`, "PATCH", { segundos: Number(e.target.value) || null }); avisar(e.target.value ? `El próximo guion se pide de ~${e.target.value} s.` : "Duración automática (corto/largo)."); };
  if ($("#pEnviarVPS")) $("#pEnviarVPS").onclick = async () => { const b = $("#pEnviarVPS"); b.disabled = true; avisar("Enviando al VPS…"); try { const r = await api("/api/banco/sincronizar", "POST", { id: p.id }); avisar(r.enviados ? `Listo: ${r.enviados} archivos enviados. Ya lo ves desde el celular.` : "El VPS ya tiene todo de este video."); } catch (e) { avisar(e.message, true); } b.disabled = false; };
}
function eventosClips(p) {
  if ($("#cLaptop")) $("#cLaptop").onclick = async () => {
    if (!confirm("La laptop va a generar en Flow las imágenes que faltan (gasta créditos de Flow). ¿Seguir?")) return;
    $("#cLaptop").disabled = true;
    try { await api(`/api/proyectos/${p.id}/flow-laptop`, "POST", {}); avisar("Listo, la laptop ya está generando. Cuando termine, las imágenes llegan solas: recarga en unos minutos."); }
    catch (e) { avisar(e.message, true); $("#cLaptop").disabled = false; }
  };
  if ($("#cAPIhist")) $("#cAPIhist").onclick = () => { const n = (p.clips || []).filter((x) => !x.archivo && !x.misma && (x.flowPrompt || x.buscar)).length; if (confirm(`Generar con APIMart ${n} imágenes (unos centavos cada una). ¿Seguir?`)) api(`/api/proyectos/${p.id}/apimart`, "POST", { max: Math.max(1, n) }).catch((e) => avisar(e.message, true)); };
  if ($("#cAPI")) $("#cAPI").onclick = () => api(`/api/proyectos/${p.id}/apimart`, "POST", { max: Number($("#cAPImax").value) || 8 }).catch((e) => avisar(e.message, true));
  if ($("#cAPItodas")) $("#cAPItodas").onclick = () => { if (confirm("Esto vuelve a generar TODAS las imágenes con APIMart (gasta créditos). ¿Seguir?")) api(`/api/proyectos/${p.id}/apimart`, "POST", { max: Number($("#cAPImax").value) || 8, todas: true }).catch((e) => avisar(e.message, true)); };
  if ($("#cProd")) $("#cProd").onclick = () => subir(p.id, "producto", "image/*");
  if ($("#cAuditar")) $("#cAuditar").onclick = () => api(`/api/proyectos/${p.id}/auditar`, "POST", {}).then(() => avisar("Auditando escenas… sale en la barra de clips.")).catch((e) => avisar(e.message, true));
  if ($("#cRehacerMalas")) $("#cRehacerMalas").onclick = () => { const aud = p.auditoria?.escenas || {}, ns = Object.keys(aud).filter((n) => aud[n].ok === false).map(Number); if (!confirm(`Rehacer en Flow ${ns.length} escena(s): ${ns.join(", ")}. Gasta créditos de Flow. ¿Seguir?`)) return; const notas = Object.fromEntries(ns.map((n) => [n, aud[n].correccion || ""])); api(`/api/proyectos/${p.id}/clips`, "POST", { escenas: ns, notas, conCuadros: $("#cCuadros") ? $("#cCuadros").checked : true }).then(() => avisar("Rehaciendo en Flow…")).catch((e) => avisar(e.message, true)); };
  for (const b of document.querySelectorAll("[data-creanimar]")) b.onclick = () => { const n = +b.dataset.creanimar; const nota = prompt(`Reanimar la escena ${n}: usa LA MISMA IMAGEN y solo cambia el movimiento (1 video de Flow).\nSi lo que está mal es la imagen (quién sale, el dibujo, la ropa, el lugar), cancela y usa «Rehacer en Flow».\n\nQué corregir del movimiento o de lo que dicen (opcional):`, ""); if (nota === null) return; api(`/api/proyectos/${p.id}/clips`, "POST", { escenas: [n], reanimar: true, notas: nota.trim() ? { [n]: nota.trim() } : {}, conCuadros: true }).then(() => avisar(`Reanimando la escena ${n}…`)).catch((e) => avisar(e.message, true)); };
  for (const b of document.querySelectorAll("[data-crehacer]")) b.onclick = () => { const n = +b.dataset.crehacer, sug = p.auditoria?.escenas?.[n]?.correccion || ""; const nota = prompt(`Rehacer la escena ${n} en Flow: imagen nueva + animación (gasta 2 créditos).\nQué corregir, en inglés o español (opcional; se suma al prompt):`, sug); if (nota === null) return; api(`/api/proyectos/${p.id}/clips`, "POST", { escenas: [n], notas: nota.trim() ? { [n]: nota.trim() } : {}, conCuadros: $("#cCuadros") ? $("#cCuadros").checked : true }).then(() => avisar(`Rehaciendo la escena ${n} en Flow…`)).catch((e) => avisar(e.message, true)); };
  if ($("#cAnimar")) $("#cAnimar").onclick = () => { if (confirm("Cada foto se convierte en un clip de video con Seedance 2.5 en APIMart (gasta créditos). ¿Seguir?")) api(`/api/proyectos/${p.id}/animar`, "POST", { max: Number($("#cAPImax")?.value) || 6 }).catch((e) => avisar(e.message, true)); };
  if ($("#avFuente")) $("#avFuente").onclick = () => subir(p.id, "avatar-fuente", "video/*");
  if ($("#avImagen")) $("#avImagen").onclick = () => subir(p.id, "avatar-imagen", "image/*");
  if ($("#avQuitar")) $("#avQuitar").onclick = async () => { await api(`/api/proyectos/${p.id}/archivo?tipo=avatar-imagen`, "DELETE"); abrir(p.id, { mantener: true }); };
  if ($("#avHacer")) $("#avHacer").onclick = () => { if (confirm("Esto manda tu video y el personaje a APIMart y gasta créditos de video. ¿Seguir?")) api(`/api/proyectos/${p.id}/avatar`, "POST", { motor: $("#avMotor").value, calidad: $("#avCalidad").value, descripcion: $("#avDesc")?.value, fondo: $("#avFondo")?.value }).catch((e) => avisar(e.message, true)); };
  for (const b of document.querySelectorAll("[data-pdel]")) b.onclick = async () => { await api(`/api/proyectos/${p.id}/archivo?tipo=producto&nombre=${encodeURIComponent(b.dataset.pdel)}`, "DELETE"); abrir(p.id, { mantener: true }); };
  if ($("#cEspejo")) $("#cEspejo").onclick = async () => { $("#cEspejo").disabled = true; avisar("Enviando al VPS…"); try { const r = await api("/api/banco/sincronizar", "POST"); avisar(r.enviados ? `Listo: ${r.enviados} archivos enviados al VPS.` : "El VPS ya tenía todo."); } catch (e) { avisar(e.message, true); } $("#cEspejo").disabled = false; };
  for (const b of document.querySelectorAll("[data-cbanco]")) b.onclick = () => abrirBanco(p, Number(b.dataset.cbanco));
  for (const b of document.querySelectorAll("[data-cpex]")) b.onclick = async () => {
    const x = (p.clips || []).find((c) => c.n == b.dataset.cpex) || {};
    const q = prompt("Buscar en Pexels (en inglés):", x.buscar || ""); if (!q?.trim()) return;
    b.disabled = true; b.textContent = "Buscando…";
    try { const r = await api(`/api/proyectos/${p.id}/clip-pexels`, "POST", { n: x.n, buscar: q.trim() }); avisar(`Escena ${x.n}: ${r.credito}`); abrir(p.id, { mantener: true }); }
    catch (e) { avisar(e.message, true); b.disabled = false; b.textContent = "Pexels"; }
  };
  if ($("#cModelo")) api("/api/ajustes").then((a) => { $("#cModelo").innerHTML = a.modelosFlowVideo.map((m) => `<option ${m === (a.flowVideo || "Veo 3.1 - Lite") ? "selected" : ""}>${h(m)}</option>`).join(""); $("#cModelo").onchange = () => api("/api/ajustes", "PUT", { flowVideo: $("#cModelo").value }); });
  if ($("#cAnimar")) $("#cAnimar").onclick = () => { if (faltanImg(p)) { if (!confirm(`Todavía faltan ${faltanImg(p)} imágenes. Conviene terminarlas antes. ¿Animar de todos modos las que ya tienen imagen?`)) return; } if (confirm("Esto gasta créditos de Flow (un video de 8 s por escena marcada; si no marcaste ninguna, la fábrica elige ~1 de cada 3). Solo pide las que aún no tienen animación. ¿Seguir?")) api(`/api/proyectos/${p.id}/animar-flow`, "POST", {}).then((r) => avisar(`Animando ${r.marcadas} escenas en Flow…`)).catch((e) => avisar(e.message, true)); };
  if ($("#cFlow")) $("#cFlow").onclick = () => { if (confirm("Esto gasta créditos de tu cuenta de Flow (un clip por escena que falte, más las imágenes si dejas 'personajes iguales') y usa automatización no oficial de la página de Flow. ¿Seguir?")) api(`/api/proyectos/${p.id}/clips`, "POST", { maxCreditos: $("#cMax")?.value, conCuadros: $("#cCuadros") ? $("#cCuadros").checked : true }).catch((e) => avisar(e.message, true)); };
  for (const b of document.querySelectorAll("[data-csub]")) b.onclick = () => subir(p.id, `clip&n=${b.dataset.csub}`, "video/*,image/*");
  for (const b of document.querySelectorAll("[data-cdel]")) b.onclick = async () => { await api(`/api/proyectos/${p.id}/archivo?tipo=clip&n=${b.dataset.cdel}`, "DELETE"); abrir(p.id, { mantener: true }); };
  for (const b of document.querySelectorAll("[data-cprom]")) b.onclick = () => { const g = S.guion || {}, e = g.escenas?.[b.dataset.cprom - 1] || {};
    const txt = [g.estiloVisual, g.personajes && `Characters (keep them identical in every shot): ${g.personajes}`, e.flowPrompt, "Vertical 9:16, cinematic, smooth camera, no text, no subtitles, no logos."].filter(Boolean).join(" ");
    navigator.clipboard.writeText(txt).then(() => avisar("Prompt copiado. En Flow: video 9:16.")); };
}

// ---------- de dónde salió la idea ----------
function panelInspiracion(p) {
  const i = p.inspiracion; if (!i) return "";
  const red = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "").split(".")[0] + x.pathname.replace(/\/$/, "").slice(0, 40); } catch { return u.slice(0, 50); } };
  return `<details class="card" style="margin:0 0 14px;padding:12px 16px" ${i.enlaces.length ? "" : "open"}>
    <summary style="cursor:pointer;font-weight:600">Inspiración ${i.enlaces.length ? `· ${i.enlaces.length} enlace${i.enlaces.length > 1 ? "s" : ""}` : "· <span style='color:var(--am)'>sin enlace directo</span>"}${i.llegada ? ` · <span class="estado">${h(i.llegada)}</span>` : ""}</summary>
    ${i.enlaces.length ? `<ul style="margin:8px 0;padding-left:18px">${i.enlaces.map((u) => `<li><a href="${h(u)}" target="_blank" rel="noopener" style="color:var(--t)">${h(red(u))}</a></li>`).join("")}</ul>`
      : `<p class="estado">Esta idea no trae una publicación concreta que la respalde (salió de los patrones${i.fuente ? " del informe de " + h(i.fuente) : ""}). Tómala como hipótesis, no como algo que ya probó ser viral.</p>`}
    ${i.porque ? `<p class="estado"><b>Por qué debería funcionar:</b> ${h(i.porque)}</p>` : ""}
    ${i.porQueEstilo ? `<p class="estado"><b>Por qué este estilo:</b> ${h(i.porQueEstilo)}</p>` : ""}
    ${i.adaptacion ? `<p class="estado"><b>Adaptación:</b> ${h(i.adaptacion)}</p>` : ""}
  </details>`;
}

// ---------- música a la medida (ElevenLabs Music) ----------
const MU = {
  animo: { tierno: "tender, loving", esperanzador: "hopeful, uplifting", calmado: "calm, peaceful", alegre: "joyful, playful", nostalgico: "nostalgic, bittersweet", inspirador: "inspiring, cinematic build", curioso: "curious, light", epico: "epic, grand", misterioso: "mysterious, suspenseful", oscuro: "dark, unsettling" },
  instrumentos: { piano: "warm felt piano", cuerdas: "soft strings", guitarra: "acoustic guitar", marimba: "marimba and plucks", pads: "ambient synth pads", percusion: "light percussion", ukulele: "ukulele and claps", cello: "solo cello", drones: "low drones and textures", cajita: "music box" },
  ritmo: { lento: "slow tempo around 65-75 bpm", medio: "medium tempo around 90-100 bpm", rapido: "upbeat tempo around 115-125 bpm" },
  energia: { baja: "low energy, minimal and spacious", media: "moderate energy", alta: "high energy, rising build" },
};
const NOMBRES_MU = { animo: "Ánimo", instrumentos: "Instrumentos", ritmo: "Ritmo", energia: "Energía" };
function promptDeParametros(par, tema, conVoz) {
  const inst = (par.instrumentos || []).map((k) => MU.instrumentos[k]).filter(Boolean).join(", ") || "piano and soft strings";
  return `${MU.animo[par.animo] || "warm"} instrumental background music: ${inst}, ${MU.ritmo[par.ritmo] || ""}, ${MU.energia[par.energia] || ""}. For a short vertical social media video${tema ? ` about "${tema}"` : ""}.${conVoz ? " Sits low in the mix under a spoken voice, no busy melodies." : " Carries the video on its own (no voice), with a gentle arc."}${par.extra ? " " + par.extra + "." : ""} Instrumental only, no vocals, no lyrics. Clean ending.`;
}
function panelMusica(p, est) {
  const par = { ...(est.musicaIA.parametros || {}), ...(p.musicaParametros || {}) };
  const tiene = p.archivos?.find((n) => n.startsWith("musica."));
  const esMot = est.tipo === "motion", dur = p.tiempos?.duracion ?? (esMot && p.tieneFinal ? p.motion?.segundos : null);
  const sel = (k) => `<div><label>${NOMBRES_MU[k]}</label><select data-mu="${k}">${Object.keys(MU[k]).map((v) => `<option value="${v}" ${par[k] === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1).replace("nostalgico", "nostálgico").replace("epico", "épico")}</option>`).join("")}</select></div>`;
  return `<section class="paso">${pasoCab(4, "musica", "Música a la medida (ElevenLabs)", `<button class="btn peq primario" id="muGenerar" ${!S.info.voz ? "disabled title='Pon ELEVENLABS_API_KEY en el .env'" : !dur ? `disabled title='${esMot ? "Primero renderiza el motion" : "Primero la voz"}: la música se hace del largo exacto'` : ""}>Generar e insertar</button>`)}
    <div class="cont">
      <div class="estado" id="est-musica">Ahora: ${tiene ? (p.musicaIA?.reusada ? "reutilizada de tu biblioteca" : p.musicaIA ? `a la medida (${p.musicaIA.segundos} s)` : "la que subiste") : "la de tu biblioteca musica/ (o el ambiente del estilo)"}</div>
      <div class="barra oculto" id="bar-musica"><div></div></div>
      <div id="muLibCaja" style="margin:10px 0"></div>
      ${tiene ? `<div class="fila" style="margin:8px 0"><audio controls src="/proyectos/${h(p.id)}/${h(tiene)}?v=${Date.now()}" style="flex:1"></audio><button class="mini" id="muQuitar">Quitar</button></div>` : ""}
      <div class="fila">${sel("animo")}${sel("ritmo")}${sel("energia")}</div>
      <label>Instrumentos</label>
      <div class="fila" id="muInst">${Object.keys(MU.instrumentos).map((k) => `<label class="estado" style="display:flex;gap:5px;align-items:center"><input type="checkbox" value="${k}" style="width:auto" ${(par.instrumentos || []).includes(k) ? "checked" : ""}>${{ cajita: "caja de música", percusion: "percusión" }[k] || k}</label>`).join("")}</div>
      <label>Algo más (opcional)</label><input id="muExtra" value="${h(par.extra || "")}" placeholder="p. ej. que termine en un acorde brillante, estilo lo-fi…">
      <label>Lo que se le pide a ElevenLabs (se arma solo con lo de arriba; puedes editarlo)</label>
      <textarea id="muPrompt" style="min-height:70px;font-size:13px"></textarea>
      <div class="fila" style="margin-top:6px">
        ${est.musicaIA.reusar ? `<label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="muReusar" style="width:auto" checked> si ya hay una de este mismo tema, reutilizarla (no gasta)</label>` : ""}
        <span class="estado">Se hace del largo exacto${dur ? ` (unos ${Math.ceil(dur)} s)` : ""} y luego ${esMot ? "se mezcla con el video" : "se vuelve a sacar el video con ella"}.</span>
      </div>
    </div></section>`;
}
// pistas de la biblioteca: las generadas del nicho, las del estilo y las generales (se ajustan solas al largo del video)
async function bibliotecaMusica(p) {
  const caja = $("#muLibCaja"); if (!caja) return;
  let o; try { o = await api(`/api/proyectos/${p.id}/musicas`); } catch { return; }
  if (!o.lista.length) { caja.innerHTML = `<p class="estado">Aún no hay pistas para reutilizar en ${h(o.nicho)}. Las que generes aquí se guardan solas y aparecen en los demás videos de este nicho.</p>`; return; }
  const sel = o.elegida || o.recomendada, grupo = { generada: "Generadas en " + o.nicho, estilo: "Del estilo", general: "Biblioteca general" };
  const op = (x) => `<option value="${h(x.ruta)}" ${x.ruta === sel ? "selected" : ""}>${x.ruta === o.recomendada ? "★ " : ""}${h(x.nombre)}${x.segundos ? ` · ${x.segundos} s` : ""}${x.ruta === o.recomendada ? " (recomendada)" : ""}</option>`;
  caja.innerHTML = `<label>Reutilizar una pista (sin gastar): ${o.elegida ? "la que tiene este video" : "★ la que recomienda la fábrica"} viene seleccionada</label>
    <div class="fila"><select id="muLib" style="flex:1;min-width:220px">${Object.keys(grupo).map((g) => { const l = o.lista.filter((x) => x.origen === g); return l.length ? `<optgroup label="${h(grupo[g])}">${l.map(op).join("")}</optgroup>` : ""; }).join("")}</select>
      <button class="btn peq primario" id="muUsar">Usar esta en el video</button></div>
    <audio id="muEscuchar" controls preload="none" style="width:100%;margin-top:6px"></audio>
    <p class="estado" style="font-size:12px">Se ajusta sola al video: si es más corta se repite, si es más larga se corta con fundido. ${!o.elegida && !p.archivos?.find((n) => n.startsWith("musica.")) ? "Si no eliges, el video sale con la recomendada." : ""}</p>`;
  const lib = $("#muLib"), oir = $("#muEscuchar");
  oir.src = "/" + encodeURI(lib.value);
  lib.onchange = () => { oir.src = "/" + encodeURI(lib.value); oir.play().catch(() => {}); };
  $("#muUsar").onclick = async () => {
    const hay = !!p.tiempos;
    await api(`/api/proyectos/${p.id}/musica-elegir`, "POST", { ruta: lib.value, rehacer: hay && p.tieneFinal });
    avisar(p.tieneFinal ? "Pista puesta. Volviendo a sacar el video con ella…" : "Pista puesta: el video saldrá con ella.");
    abrir(p.id, { mantener: true });
  };
}
function eventosMusica(p, est) {
  const leer = () => ({ ...Object.fromEntries([...document.querySelectorAll("[data-mu]")].map((x) => [x.dataset.mu, x.value])),
    instrumentos: [...document.querySelectorAll("#muInst input:checked")].map((x) => x.value), extra: $("#muExtra").value.trim() });
  let editado = false;
  const armar = () => { if (!editado) $("#muPrompt").value = promptDeParametros(leer(), p.tema || p.titulo, p.conVoz !== false); };
  for (const x of document.querySelectorAll("[data-mu], #muInst input, #muExtra")) x.oninput = x.onchange = armar;
  $("#muPrompt").oninput = () => (editado = true);
  armar();
  bibliotecaMusica(p);
  $("#muGenerar").onclick = async () => {
    const parametros = leer();
    await api(`/api/proyectos/${p.id}`, "PATCH", { musicaParametros: parametros });
    const reusar = $("#muReusar") ? $("#muReusar").checked && !editado : false;
    api(`/api/proyectos/${p.id}/musica`, "POST", { prompt: $("#muPrompt").value, reusar, insertar: true }).then(() => avisar("Componiendo la música… luego se vuelve a sacar el video.")).catch((e) => avisar(e.message, true));
  };
  if ($("#muQuitar")) $("#muQuitar").onclick = async () => { await api(`/api/proyectos/${p.id}/archivo?tipo=musica`, "DELETE"); if (est.tipo === "motion" && p.tieneFinal) await api(`/api/proyectos/${p.id}/remezclar`, "POST"); abrir(p.id, { mantener: true }); };
}

function panelFondo(p) {
  const f = p.fondo, propio = p.archivos?.find((n) => n.startsWith("fondo-propio.")), musica = p.archivos?.find((n) => n.startsWith("musica."));
  const sugerido = p.fondoBuscar || S.guion?.fondo?.buscar || "";
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--b)">
    <div class="estado" id="est-fondo">Fondo: ${f ? (f.tipo === "degradado" ? "degradado animado" : `${f.tipo === "video" ? "video" : "foto"}${f.credito ? " · " + h(f.credito) : propio ? " · el tuyo" : ""}`) : "se prepara junto con la voz"}</div>
    <div class="barra oculto" id="bar-fondo"><div></div></div>
    <div class="fila" style="margin-top:8px">
      ${propio ? `<span class="chip">Tu fondo: ${h(propio)}</span><button class="mini" data-quitar="fondo">Quitar</button>`
        : `<input id="fBuscar" value="${h(sugerido)}" placeholder="${S.info.pexels ? "Buscar en Pexels (en inglés): rain window night" : "Pon PEXELS_API_KEY en el .env para buscar clips"}" style="max-width:340px">
           <button class="btn peq" id="fOtro" ${p.tiempos ? "" : "disabled"}>${f && f.tipo !== "degradado" ? "Buscar otro" : "Buscar fondo"}</button>`}
      <button class="btn peq" id="fSubir">Subir mi fondo</button>
      ${musica ? `<span class="chip">Música: ${h(musica)}</span><button class="mini" data-quitar="musica">Quitar</button>` : `<button class="btn peq" id="mSubir">Subir música</button>`}
    </div>
    <label>Clip con Google Flow (9:16, cámara lenta)</label>
    <textarea id="flowPrompt" style="min-height:58px;font-size:13px" placeholder="Prompt en inglés para Flow/Veo">${h(p.flowPrompt || S.guion?.fondo?.flowPrompt || "")}</textarea>
    <div class="fila" style="margin-top:6px">
      <button class="btn peq" id="flowCopiar">Copiar prompt</button>
      <button class="btn peq" id="flowGenerar" ${S.info.flow ? "" : "disabled title='Abre Flow Studio (flow-mcp) para usar esto'"}>Generar en Flow</button>
      <span class="estado">Tope de créditos</span><input id="flowMax" type="number" value="25" min="1" style="width:80px">
      ${!S.info.flow ? `<span class="estado">Flow no está abierto: copia el prompt, hazlo en Flow y súbelo con "Subir mi fondo".</span>` : ""}
    </div>
    ${propio ? `<input id="fBuscar" type="hidden"><button id="fOtro" class="oculto"></button>` : ""}${musica ? `<button id="mSubir" class="oculto"></button>` : ""}
  </div>`;
}

function subir(id, tipo, aceptar) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = aceptar;
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    avisar(`Subiendo ${f.name}…`);
    const r = await fetch(`/api/proyectos/${id}/archivo?tipo=${tipo}`, { method: "POST", headers: { "x-nombre": encodeURIComponent(f.name) }, body: f });
    if (!r.ok) return avisar("No se pudo subir el archivo.", true);
    avisar("Archivo subido."); abrir(id, { mantener: true });
  };
  inp.click();
}

function marcarSucio() { S.sucio = true; pintarProyecto(); }

function pintarEscenas() {
  const cont = $("#escenas"); if (!cont) return;
  const est = estiloDe(S.actual.estilo) || {};
  const g = S.guion;
  if (!g) { cont.innerHTML = ""; return; }
  const opciones = (lista, v) => (lista || []).map((o) => `<option ${o === v ? "selected" : ""}>${h(o)}</option>`).join("") + (v && !(lista || []).includes(v) ? `<option selected>${h(v)}</option>` : "");
  cont.innerHTML = g.escenas.map((e, i) => `
    <div class="escena" data-i="${i}">
      <div class="n">${i + 1}</div>
      <select data-k="tipo" title="Tipo">${opciones(est.tipos, e.tipo)}</select>
      <select data-k="visual" title="Fondo" style="${est.visuales?.length ? "" : "visibility:hidden"}">${opciones(est.visuales, e.visual)}</select>
      <textarea data-k="texto" placeholder="Lo que dice la voz">${h(e.texto ?? e.voz ?? "")}</textarea>
      <div class="acc"><button class="mini" data-a="sube" title="Subir">↑</button><button class="mini" data-a="baja" title="Bajar">↓</button><button class="mini" data-a="borra" title="Quitar">✕</button></div>
      <div></div><div></div><div></div>
      <div class="extra">
        <select data-k="sfx" title="Efecto de sonido"><option value="">Sin efecto</option>${S.info.efectos.map((f) => `<option ${[].concat(e.sfx || [])[0] === f ? "selected" : ""}>${f}</option>`).join("")}</select>
        ${e.tipo === "dato" ? `<input data-k="cifra" placeholder="Cifra (37 %)" value="${h(e.cifra)}"><input data-k="fuente" placeholder="Fuente corta" value="${h(e.fuente)}">` : ""}
        ${["titulo", "regla"].includes(e.tipo) ? `<input data-k="etiqueta" placeholder="Etiqueta (${e.tipo === "regla" ? "REGLA" : "RELATO"})" value="${h(e.etiqueta)}">` : ""}
        ${["reloj", "telefono"].includes(e.visual) ? `<input data-k="hora" placeholder="Hora (3:00)" value="${h(e.hora)}">` : ""}
        ${e.visual === "imagen" ? `<input data-k="imagen" placeholder="img/archivo.jpg" value="${h(e.imagen)}">` : ""}
      </div>
      ${est.camposAvanzados ? `<div></div><div></div><div></div><textarea data-json="1" class="json" spellcheck="false" style="grid-column:4/5;font:12px/1.4 ui-monospace,monospace;min-height:54px" placeholder='{"mapa": {"enfocar": "MEX"}}'>${h(JSON.stringify(Object.fromEntries(est.camposAvanzados.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))) === "{}" ? "" : JSON.stringify(Object.fromEntries(est.camposAvanzados.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))))}</textarea>` : ""}
    </div>`).join("");
  for (const row of cont.querySelectorAll(".escena")) {
    const i = Number(row.dataset.i);
    for (const el of row.querySelectorAll("[data-k]")) {
      el.oninput = el.onchange = (ev) => {
        // escenas que solo traen "voz" (Estatuas, Historia): se edita y se guarda ahí mismo
        const k = el.dataset.k === "texto" && g.escenas[i].texto === undefined && g.escenas[i].voz !== undefined ? "voz" : el.dataset.k, v = el.value;
        // pegaste un guion completo (el JSON de Claude) dentro de una escena: se toma como el guion entero
        if (el.dataset.k === "texto" && /^\s*[{\[]/.test(v) && /escenas/.test(v)) {
          el.disabled = true;
          api(`/api/proyectos/${S.actual.id}/guion-pegado`, "POST", { texto: v })
            .then(() => { S.sucio = false; avisar("Pegaste un guion completo: lo tomé como el guion entero. Ahora dale Rehacer voz."); abrir(S.actual.id, { mantener: true }); })
            .catch((e) => { el.disabled = false; avisar(e.message, true); });
          return;
        }
        if (v === "" && k !== "texto" && k !== "voz") delete g.escenas[i][k]; else g.escenas[i][k] = v;
        if (!S.sucio) { S.sucio = true; const der = $(".paso .der"); if (der && !$("#gGuardar")) { der.insertAdjacentHTML("afterbegin", `<button class="btn primario peq" id="gGuardar">Guardar cambios</button>`); $("#gGuardar").onclick = guardarGuion; } }
        if (ev.type === "change" && ["tipo", "visual"].includes(k)) pintarEscenas();
      };
    }
    const js = row.querySelector("[data-json]");
    if (js) js.oninput = () => {
      try {
        const v = js.value.trim() ? JSON.parse(js.value) : {};
        for (const k of est.camposAvanzados) delete g.escenas[i][k];
        for (const k of est.camposAvanzados) if (v[k] !== undefined) g.escenas[i][k] = v[k];
        js.style.borderColor = "";
        if (!S.sucio) { S.sucio = true; const der = $(".paso .der"); if (der && !$("#gGuardar")) { der.insertAdjacentHTML("afterbegin", `<button class="btn primario peq" id="gGuardar">Guardar cambios</button>`); $("#gGuardar").onclick = guardarGuion; } }
      } catch { js.style.borderColor = "var(--a)"; }
    };
    for (const b of row.querySelectorAll("[data-a]")) b.onclick = () => {
      const a = b.dataset.a, es = g.escenas;
      if (a === "borra") es.splice(i, 1);
      if (a === "sube" && i > 0) [es[i - 1], es[i]] = [es[i], es[i - 1]];
      if (a === "baja" && i < es.length - 1) [es[i + 1], es[i]] = [es[i], es[i + 1]];
      marcarSucio();
    };
  }
}

async function guardarGuion() {
  S.guion.escenas = S.guion.escenas.filter((e) => (e.texto || e.voz || "").trim() || e.duracion);
  if (!S.guion.escenas.length) return avisar("El guion está vacío.", true);
  await api(`/api/proyectos/${S.actual.id}/guion`, "PUT", S.guion);
  S.sucio = false; avisar("Guion guardado."); S.proyectos = await api("/api/proyectos"); abrir(S.actual.id, { mantener: true });
}

// ---------- investigador ----------
const marcarAcento = (t) => h(t).replace(/\*([^*]+)\*/g, "<em style='color:var(--a)'>$1</em>");
const lista = (v) => String(v || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

async function investigador(archivo) {
  S.actual = null; S.vista = "inv"; parar(); pintarLista(); history.replaceState(null, "", "#investigador");
  const d = await api("/api/investigacion");
  const c = d.config, nq = `nicho=${encodeURIComponent(c.id)}`;
  const estilosBase = S.info.estilos.filter((e) => e.listo); // para elegir cuáles puede proponer este nicho
  const permitidos = c.estilos || [];
  archivo = archivo || d.lista[0]?.archivo;
  const inv = archivo ? await api(`/api/investigacion/${archivo}`) : null;
  $("#main").innerHTML = `
    <h1>Investigador de virales</h1>
    <div class="fila" style="margin:-4px 0 10px"><label style="margin:0">Nicho</label><select id="iNicho" style="width:auto;font-weight:600">${d.nichos.map((n) => `<option value="${h(n.id)}" ${n.id === c.id ? "selected" : ""}>${h(n.nombre)}</option>`).join("")}</select><button class="btn peq" id="iNuevoNicho" title="Otra marca o página con sus propias cuentas, público y estilos">+ Nuevo nicho</button></div>
    <p class="sub">Revisa lo que está funcionando en <b>${h(c.nombre)}</b> y te propone videos originales en sus estilos. Cada nicho tiene sus cuentas, hashtags, público, cierres y estilos.</p>
    ${!d.ia ? `<div class="nota">Sin IA conectada: pon <code>GEMINI_API_KEY</code> (gratis en aistudio.google.com) en el <code>.env</code>, o pídeselo a <b>Claude Code</b> en la carpeta de la fábrica: <code>investiga mi nicho y dame frases virales</code> (o <code>convierte los informes pendientes</code>). Recarga esta página al terminar.</div>` : `<div class="estado" style="margin-bottom:8px">Motor: ${h(d.motor)}</div>`}
    ${d.pendientes?.length ? `<div class="nota">Informes guardados sin convertir: ${d.pendientes.map(h).join(", ")}. ${d.ia ? "Se reintentan solos cada 15 minutos (Gemini a veces está saturado)." : "Dile a Claude Code: <code>convierte los informes pendientes</code>."}</div>` : ""}
    <details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600">Importar un informe (Gemini Deep Research, muse.ai…)</summary>
      <p class="estado">1) Copia el prompt y pégalo en Gemini con <b>Deep Research</b>. 2) Copia el informe que te dé y pégalo abajo. También puedes soltar archivos .md/.txt/.csv en <code>investigacion/entrada/</code> o mandarlos desde n8n.</p>
      <div class="fila"><button class="btn peq" id="iPrompt">Copiar prompt para Deep Research</button></div>
      <textarea id="iInforme" placeholder="Pega aquí el informe completo" style="min-height:120px;margin-top:10px"></textarea>
      <div class="fila" style="margin-top:8px"><input id="iFuente" value="gemini" style="max-width:200px" title="De dónde viene"><button class="btn primario peq" id="iImportar">Importar y proponer</button></div>
    </details>
    ${!d.apify ? `<div class="nota">Sin <code>APIFY_TOKEN</code> investiga con búsqueda web: sirve, pero <b>sin métricas reales</b> (vistas, guardados, compartidos). Con Apify mide de verdad lo viral en TikTok e Instagram.</div>` : ""}
    <details class="card" ${inv ? "" : "open"} style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600">Nicho ${h(c.nombre)}: público, referencias y estilos</summary>
      <div class="fila" style="align-items:flex-start">
        <div style="flex:1;min-width:260px"><label>Nombre</label><input id="iNombre" value="${h(c.nombre)}">
          <label>Audiencia</label><textarea id="iDesc">${h(c.descripcion)}</textarea>
          <label>Sobre la marca (qué sí y qué no)</label><textarea id="iMarca">${h(c.marca)}</textarea>
          <label>Cierres que autorizas (uno por línea, tal cual se dirán; vacío = sin "comenta X")</label>
          <textarea id="iCierres" placeholder="Comenta RUTINA y te mando gratis tu checklist">${h((c.cierres || []).join("\n"))}</textarea>
          <label>Cómo adaptar al público (va tal cual a la IA)</label><textarea id="iAdapta">${h(c.adaptacion || "")}</textarea>
          <label>Reglas de tono (qué sí y qué no)</label><textarea id="iReglas">${h(c.reglas || "")}</textarea>
          <label>Canal con que nacen los videos</label><input id="iCanal" value="${h(c.canal || "")}" placeholder="@tucanal"></div>
        <div style="flex:1;min-width:260px"><label>Cuentas de TikTok de referencia (una por línea)</label><textarea id="iTk" placeholder="@cuenta">${h(c.cuentasTiktok.join("\n"))}</textarea>
          <label>Cuentas de Instagram de referencia</label><textarea id="iIg" placeholder="@cuenta">${h(c.cuentasInstagram.join("\n"))}</textarea>
          <label>Hashtags (sin #, separados por coma)</label><input id="iHash" value="${h(c.hashtags.join(", "))}">
          <label>Búsquedas</label><input id="iBus" value="${h(c.busquedas.join(", "))}">
          <div class="fila"><div><label>Últimos días</label><input id="iDias" type="number" value="${c.dias}" style="width:100px"></div><div><label>Por hashtag</label><input id="iPor" type="number" value="${c.porFuente}" style="width:100px"></div><div><label>Propuestas</label><input id="iProp" type="number" value="${c.propuestas}" style="width:100px"></div></div></div>
      </div>
      <label style="margin-top:12px">Estilos que puede proponer (ninguno marcado = todos)</label>
      <div class="fila" style="gap:4px 14px">${[...estilosBase.filter((e) => e.tipo !== "motion"), { id: "motion", nombre: "Motion graphics" }].map((e) => `<label class="estado" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" data-iest="${h(e.id)}" style="width:auto" ${permitidos.includes(e.id) ? "checked" : ""}> ${h(e.nombre)}</label>`).join("")}</div>
      ${permitidos.filter((id) => estiloDe(id)?.opciones?.length).map((id) => `<div class="fila" style="margin-top:8px"><span class="estado">${h(estiloNombre(id))}:</span>${estiloDe(id).opciones.map((o) => `<select data-iop="${h(id)}|${h(o.clave)}" style="width:auto" title="${h(o.nombre)}">${Object.entries(o.valores).map(([k, v]) => `<option value="${h(k)}" ${(c.opciones?.[id]?.[o.clave] || Object.keys(o.valores)[0]) === k ? "selected" : ""}>${h(o.nombre)}: ${h(v)}</option>`).join("")}</select>`).join("")}</div>`).join("")}
      <label class="estado" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="iHistoria" style="width:auto" ${c.historia ? "checked" : ""}> Pedir al menos una historia con Flow por investigación</label>
      <div class="fila" style="margin-top:14px"><button class="btn" id="iGuardar">Guardar</button></div>
    </details>
    <div class="fila">${inv ? `<button class="btn" id="iRehacer" title="Vuelve a sacar las propuestas de esta misma investigación con los estilos y cierres de hoy (no gasta Apify)">Volver a proponer</button>` : ""}${inv ? `<button class="btn" id="iTodas" title="Crea un video por propuesta y los manda a hacer (voz + video) uno tras otro">Crear y hacer todas</button>` : ""}<button class="btn primario" id="iCorrer" ${!d.ia || d.trabajando ? "disabled" : ""} title="${d.ia ? "" : "Necesita GEMINI_API_KEY o ANTHROPIC_API_KEY"}">Investigar ahora</button>
      ${d.lista.length ? `<select id="iHist" style="width:auto">${d.lista.map((x) => `<option value="${h(x.archivo)}" ${x.archivo === archivo ? "selected" : ""}>${new Date(x.fecha).toLocaleString()} · ${x.propuestas} propuestas${x.modo === "web" ? " · sin métricas" : ` · ${x.analizadas} analizadas`}</option>`).join("")}</select>` : ""}
      ${S.info.flow ? `<label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="iFlow" style="width:auto" ${localStorage.getItem("invFlow") === "1" ? "checked" : ""}> Fondos con Google Flow (gasta créditos) · tope <input id="iFlowMax" type="number" min="1" value="${h(localStorage.getItem("invFlowMax") || "25")}" style="width:70px"></label>` : `<span class="estado" title="Abre Flow Studio (flow-mcp) para generar los fondos con Flow">Flow cerrado: los fondos salen de Pexels</span>`}
      ${S.info.voz ? `<label class="estado" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="iMusica" style="width:auto" ${localStorage.getItem("invMusica") === "1" ? "checked" : ""}> Música a la medida con ElevenLabs (gasta créditos; en frases reutiliza por tema)</label>` : ""}
      <span class="estado" id="est-investigar">${d.trabajando ? "Trabajando…" : ""}</span></div>
    <div class="barra ${d.trabajando ? "" : "oculto"}" id="bar-investigar"><div></div></div>
    ${inv ? `
      ${inv.errores?.length ? `<div class="nota">Avisos: ${inv.errores.map(h).join("<br>")}</div>` : ""}
      <div class="card" style="margin:16px 0"><h2>Lo que está funcionando</h2><ul style="margin:8px 0 0;padding-left:18px;color:var(--t2)">${(inv.patrones || []).map((x) => `<li>${h(x)}</li>`).join("")}</ul></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${inv.propuestas.map((p) => `
        <div class="card">
          <div class="estado">${esViral(p) ? `<b style="color:var(--ok)" title="Nace de una publicación que ya funcionó">● Viral</b>` : `<b style="color:var(--a)" title="No trae enlace a una publicación viral real: es solo una hipótesis">● Sin referencia viral</b>`} · <b style="color:var(--t)" title="${h(p.porQueEstilo || "")}">${h(nombreEstiloProp(p.estilo))}</b> · ${h(p.tema || "")}${p.origen === "en" ? ` · <span title="Tendencia en inglés">🇺🇸→🇲🇽</span>` : ""}${p.llegada ? ` · <b style="color:${p.llegada === "aún no llega" ? "var(--ok)" : p.llegada === "poco en español" ? "var(--am)" : "var(--t2)"}">${h(p.llegada)}</b>` : ""}</div>
          <div style="font-size:19px;line-height:1.35;margin:6px 0 8px;font-family:Georgia,serif">${marcarAcento(p.frase)}</div>
          ${p.autor ? `<div class="estado">— ${h(p.autor)}</div>` : ""}
          ${p.cierre ? `<div class="estado" style="margin-top:4px">Cierre: ${h(p.cierre)}</div>` : ""}
          <details style="margin-top:8px"><summary class="estado" style="cursor:pointer">Por qué y clip</summary>
            ${p.porQueEstilo ? `<p class="estado"><b>Por qué este estilo:</b> ${h(p.porQueEstilo)}</p>` : ""}
            ${p.idea ? `<p class="estado"><b>Idea:</b> ${h(p.idea)}</p>` : ""}
            <p class="estado">${h(p.porque || "")}</p>
            ${p.adaptacion ? `<p class="estado"><b>Adaptación:</b> ${h(p.adaptacion)}</p>` : ""}
            ${(p.inspiradaEn || []).length ? `<p class="estado">Inspirada en: ${p.inspiradaEn.map((u, i) => `<a href="${h(u)}" target="_blank" style="color:var(--t2)">[${i + 1}]</a>`).join(" ")}</p>` : ""}
            <pre class="subir" style="max-height:120px">${h(p.flowPrompt || "")}</pre>
          </details>
          <div class="fila" style="margin-top:10px"><button class="btn primario peq" data-hacer="${p.n}" title="Escribe el guion, hace la voz y renderiza el video completo">Crear y hacer 9:16</button><button class="btn peq" data-crear="${p.n}" title="Solo crea el proyecto para que lo revises antes">Solo crear</button><button class="btn peq" data-copiar="${p.n}">Copiar prompt Flow</button></div>
        </div>`).join("")}</div>
      ${inv.publicaciones?.length ? `<details class="card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Publicaciones analizadas (${inv.publicaciones.length})</summary>
        <div style="overflow:auto"><table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px">${inv.publicaciones.map((x, i) => `<tr style="border-bottom:1px solid var(--b)"><td>${i + 1}</td><td>${h(x.red)}</td><td><a href="${h(x.url)}" target="_blank" style="color:var(--t)">@${h(x.autor)}</a></td><td>${(x.vistas || 0).toLocaleString()} vistas</td><td>${x.rebase ? x.rebase + "× seguidores" : ""}</td><td>${(x.guardados || 0).toLocaleString()} guard.</td><td>${(x.compartidos || 0).toLocaleString()} comp.</td><td style="color:var(--t2)">${h((x.texto || "").slice(0, 80))}</td></tr>`).join("")}</table></div></details>` : ""}`
    : `<p class="estado" style="margin-top:14px">Todavía no hay investigaciones.</p>`}`;
  $("#iGuardar").onclick = async () => {
    const opciones = {}; for (const sel of document.querySelectorAll("[data-iop]")) { const [e, k] = sel.dataset.iop.split("|"); (opciones[e] ||= {})[k] = sel.value; }
    await api("/api/investigacion", "PUT", { id: c.id, nombre: $("#iNombre").value, descripcion: $("#iDesc").value, marca: $("#iMarca").value,
      adaptacion: $("#iAdapta").value, reglas: $("#iReglas").value, canal: $("#iCanal").value.trim(), historia: $("#iHistoria").checked,
      estilos: [...document.querySelectorAll("[data-iest]")].filter((x) => x.checked).map((x) => x.dataset.iest), opciones: { ...(c.opciones || {}), ...opciones }, cierres: $("#iCierres").value.split("\n").map((x) => x.trim()).filter(Boolean),
      cuentasTiktok: lista($("#iTk").value), cuentasInstagram: lista($("#iIg").value), hashtags: lista($("#iHash").value).map((x) => x.replace(/^#/, "")),
      busquedas: lista($("#iBus").value), dias: Number($("#iDias").value), porFuente: Number($("#iPor").value), propuestas: Number($("#iProp").value) });
    avisar("Nicho guardado.");
  };
  $("#iCorrer").onclick = async () => { if (S.info.apify && !confirm("Esto trae publicaciones con Apify y GASTA de tu saldo (tope de unos $1.5 USD por investigación; tu plan gratis da $5 al mes). ¿Seguir?")) return; await $("#iGuardar").onclick(); api("/api/investigacion", "POST", { nicho: c.id }).catch((e) => avisar(e.message, true)); };
  $("#iPrompt").onclick = async () => navigator.clipboard.writeText(await api(`/api/investigacion/prompt?${nq}`)).then(() => avisar("Prompt copiado. Pégalo en Gemini con Deep Research."));
  $("#iImportar").onclick = async () => {
    const texto = $("#iInforme").value.trim(); if (texto.length < 80) return avisar("Pega el informe completo.", true);
    $("#iImportar").disabled = true; avisar("Importando…");
    try { const r = await api("/api/investigacion/importar", "POST", { texto, nicho: c.id, fuente: $("#iFuente").value || "informe" }); avisar(r.pendiente ? "Guardado. Pídele a Claude Code que lo convierta." : "Recibido. Convirtiendo en propuestas… (aparecen aquí solas)"); investigador(); }
    catch (e) { avisar(e.message, true); $("#iImportar").disabled = false; }
  };
  const conFlow = () => { const c = $("#iFlow"); if (!c) return null; localStorage.setItem("invFlow", c.checked ? "1" : "0"); localStorage.setItem("invFlowMax", $("#iFlowMax").value); return c.checked ? { maxCreditos: Number($("#iFlowMax").value) || 25 } : null; };
  const conMusica = () => { const c = $("#iMusica"); if (!c) return false; localStorage.setItem("invMusica", c.checked ? "1" : "0"); return c.checked; };
  const hacerTodo = async (pid) => { const r = await api(`/api/proyectos/${pid}/todo`, "POST", { flow: conFlow(), musica: conMusica() }); return !r.motionPendiente; };
  if ($("#iTodas")) $("#iTodas").onclick = async () => {
    const f = conFlow();
    const virales = inv.propuestas.filter(esViral), sinRef = inv.propuestas.length - virales.length;
    if (!virales.length) return avisar("Ninguna propuesta trae una publicación viral real detrás. Investiga de nuevo (con Apify o un informe con enlaces) antes de hacer videos.", true);
    if (!confirm(`Se crearán ${virales.length} videos 9:16${sinRef ? ` (se saltan ${sinRef} sin referencia viral)` : ""}, cada uno en el estilo que el investigador eligió, y se harán completos uno tras otro.${f ? ` Los fondos se harán con Google Flow (gasta créditos, tope ${f.maxCreditos} por clip).` : " Los fondos salen de Pexels."} Los motion graphics quedan listos para que Claude Code los construya. ¿Seguir?`)) return;
    let ok = 0, motion = 0, sinGuion = 0; const fallos = [];
    for (const pr of virales) {
      try { const p = await api(`/api/investigacion/${archivo}/crear`, "POST", { n: pr.n, formato: "9:16", canal: c.canal || localStorage.getItem("canal") || "" }); if (p.guionPendiente) sinGuion++; else if (await hacerTodo(p.id)) ok++; else motion++; }
      catch (e) { fallos.push(`#${pr.n}: ${e.message}`); }
    }
    S.proyectos = await api("/api/proyectos"); pintarLista();
    avisar(`Quedaron en fila ${ok} de ${virales.length}. Míralos en la lista de la izquierda.${motion ? ` ${motion} motion graphics: la fábrica les hace la voz primero; cuando termine, dile a Claude Code "haz los pendientes".` : ""}${sinGuion ? ` ${sinGuion} quedaron creados sin guion (Gemini no respondió): dile a Claude Code "escribe los guiones pendientes".` : ""}${fallos.length ? " No se pudo: " + fallos.join(" | ") : ""}`, !!fallos.length);
  };
  if ($("#iRehacer")) $("#iRehacer").onclick = async () => { await $("#iGuardar").onclick(); api(`/api/investigacion/${archivo}/reproponer`, "POST").then(() => avisar("Volviendo a proponer… (aparecen aquí solas)")).catch((e) => avisar(e.message, true)); };
  if ($("#iHist")) $("#iHist").onchange = (e) => investigador(e.target.value);
  $("#iNicho").onchange = async (e) => { await api("/api/investigacion/activo", "PUT", { id: e.target.value }); investigador(); };
  $("#iNuevoNicho").onclick = async () => { const nombre = prompt("Nombre del nicho nuevo (p. ej. la página o marca):"); if (!nombre?.trim()) return; await api("/api/investigacion/nichos", "POST", { nombre }); avisar("Nicho creado: llénalo y dale Guardar."); investigador(); };
  for (const b of document.querySelectorAll("[data-copiar]")) b.onclick = () => navigator.clipboard.writeText(inv.propuestas.find((x) => x.n == b.dataset.copiar).flowPrompt || "").then(() => avisar("Prompt copiado."));
  for (const b of document.querySelectorAll("[data-crear],[data-hacer]")) b.onclick = async () => {
    const hacer = b.dataset.hacer != null; b.disabled = true; b.textContent = "Creando…";
    try {
      const p = await api(`/api/investigacion/${archivo}/crear`, "POST", { n: Number(b.dataset.crear ?? b.dataset.hacer), formato: "9:16", canal: c.canal || localStorage.getItem("canal") || "" });
      if (p.guionPendiente) avisar(`Creado sin guion (${p.aviso}). En Claude Code di: escribe el guion de ${p.id}`, true);
      else if (hacer && !(await hacerTodo(p.id))) avisar(`Brief listo. La fábrica está haciendo la voz; cuando termine (punto de voz en verde), dile a Claude Code: haz los pendientes`);
      S.proyectos = await api("/api/proyectos"); S.vista = null; abrir(p.id);
    } catch (e) { avisar(e.message, true); b.disabled = false; b.textContent = hacer ? "Crear y hacer 9:16" : "Solo crear"; }
  };
}

// ---------- vista previa en vivo ----------
function montarVista() {
  const p = S.actual, cont = $("#pantalla"); if (!cont) return;
  const [W, H] = ({ "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] })[p.formato] || [1080, 1920];
  const ancho = p.formato === "16:9" ? Math.min(560, cont.parentElement.clientWidth || 560) : p.formato === "1:1" || p.formato === "4:5" ? 380 : 300;
  const k = ancho / W;
  cont.style.width = ancho + "px"; cont.style.height = H * k + "px";
  cont.innerHTML = `<iframe src="/estilos/${p.estilo}/plantilla.html?p=${encodeURIComponent(p.id)}&f=${encodeURIComponent(p.formato)}&v=${Date.now()}" width="${W}" height="${H}" style="transform:scale(${k})"></iframe>`;
  const iframe = cont.querySelector("iframe"), audio = $("#vAudio");
  const R = (S.reproductor = { t: 0, jugando: false, raf: 0, ultimo: 0 });
  const dur = () => iframe.contentWindow?.__duracion || p.tiempos?.duracion || 1;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pintar = () => { const w = iframe.contentWindow; if (w?.__listo) w.__seek(R.t); $("#scrub").value = Math.round((R.t / dur()) * 1000); $("#reloj").textContent = `${fmt(R.t)} / ${fmt(dur())}`; };
  const bucle = (ahora) => {
    if (!R.jugando) return;
    if (audio && !audio.paused && p.tieneVoz && !p.tiempos?.prueba) R.t = audio.currentTime; else R.t += (ahora - (R.ultimo || ahora)) / 1000;
    R.ultimo = ahora;
    if (R.t >= dur()) { R.t = dur(); alternar(false); }
    pintar(); R.raf = requestAnimationFrame(bucle);
  };
  const alternar = (on = !R.jugando) => {
    R.jugando = on; $("#play").textContent = on ? "❚❚" : "▶"; R.ultimo = 0;
    if (audio) { if (on) { audio.currentTime = R.t; audio.play().catch(() => {}); } else audio.pause(); }
    if (on) R.raf = requestAnimationFrame(bucle);
  };
  R.parar = () => { R.jugando = false; cancelAnimationFrame(R.raf); audio?.pause(); };
  $("#play").onclick = () => alternar();
  $("#scrub").oninput = (e) => { R.t = (e.target.value / 1000) * dur(); if (audio) audio.currentTime = R.t; pintar(); };
  iframe.onload = () => { const espera = setInterval(() => { const w = iframe.contentWindow; if (!w || !iframe.isConnected) return clearInterval(espera); if (w.__listo || w.__error) { clearInterval(espera); R.t = Math.min(1, dur()); pintar(); } }, 100); };
}
function parar() { S.reproductor?.parar?.(); }

// ---------- progreso en vivo ----------
function mostrarProgreso(paso, ev) {
  const b = $(`#bar-${paso}`), e = $(`#est-${paso}`);
  if (!b || !e) return;
  const activo = ["trabajando", "en-fila"].includes(ev.estado);
  b.classList.toggle("oculto", !activo);
  if (ev.progreso != null) b.firstElementChild.style.width = `${Math.round(ev.progreso * 100)}%`;
  if (activo) e.textContent = ev.msg || "Trabajando…";
}

// barra fija: qué está haciendo la fábrica y botón para soltar lo trabado
async function barraCola() {
  let b = $("#barraCola");
  if (!b) { b = document.createElement("div"); b.id = "barraCola"; b.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:50;display:none;gap:10px;align-items:center;justify-content:space-between;background:#1b1b22;border:1px solid #44444f;border-radius:10px;padding:8px 12px;font-size:13px;box-shadow:0 4px 18px #0008"; document.body.appendChild(b); }
  try {
    const c = await api("/api/cola");
    if (!c.actual && !c.esperando.length) { b.style.display = "none"; return; }
    const N = { guion: "guion", voz: "voz", fondo: "imágenes", musica: "música", render: "render" };
    b.innerHTML = `<span>${c.actual ? `Haciendo: <b>${h(N[c.actual.paso] || c.actual.paso)}</b> de «${h(c.actual.id)}» · ${c.actual.minutos} min` : "Nada en marcha"}${c.esperando.length ? ` · ${c.esperando.length} en fila (${c.esperando.map((t) => h(N[t.paso] || t.paso)).join(", ")})` : ""}</span><button class="btn peq" id="cancelarCola">Cancelar todo</button>`;
    b.style.display = "flex";
    $("#cancelarCola").onclick = async () => {
      if (!confirm("¿Cancelar lo que se está haciendo y vaciar la fila? Lo ya generado se queda.")) return;
      const r = await api("/api/cola/cancelar", "POST");
      avisar(`Cancelado (${r.cancelados}). Ya puedes volver a darle.`); barraCola();
      S.proyectos = await api("/api/proyectos"); pintarLista(); if (S.actual) abrir(S.actual.id, { mantener: true });
    };
  } catch {}
}
setInterval(barraCola, 5000);

function escuchar() {
  const es = new EventSource("/api/eventos");
  es.onmessage = async (m) => {
    const ev = JSON.parse(m.data);
    if (ev.id === "_investigador") {
      if (S.vista === "inv") { mostrarProgreso("investigar", ev); if (ev.estado === "listo") { avisar(ev.msg); investigador(ev.resultado?.archivo); } if (ev.estado === "error") { avisar(ev.msg, true); investigador(); } }
      return;
    }
    (S.progreso[ev.id] ||= {})[ev.paso] = ev;
    if (S.actual?.id === ev.id) mostrarProgreso(ev.paso, ev);
    if (["listo", "error", "en-fila"].includes(ev.estado) || (ev.estado === "trabajando" && ev.progreso === 0)) {
      if (ev.estado === "listo") { delete S.progreso[ev.id][ev.paso]; avisar(`${PASOS[ev.paso]} listo.`); }
      if (ev.estado === "error") { delete S.progreso[ev.id][ev.paso]; avisar(ev.msg, true); }
      S.proyectos = await api("/api/proyectos"); pintarLista();
      if (S.actual?.id === ev.id && (ev.estado !== "trabajando" || !["listo"].includes(S.actual.estado[ev.paso]))) {
        if (ev.paso === "guion" && ev.estado === "listo") S.sucio = false;
        abrir(ev.id, { mantener: true });
      }
    }
  };
}

$("#btnNuevo").onclick = () => inicio();
$("#btnInv").onclick = () => investigador();
$(".logo").onclick = inicio; $(".logo").style.cursor = "pointer";
cargar().then(() => { escuchar(); const id = location.hash.slice(1); id === "investigador" ? investigador() : id && S.proyectos.some((p) => p.id === id) ? abrir(id) : inicio(); })
  .catch((e) => avisar("No pude conectar con la fábrica: " + e.message, true));
