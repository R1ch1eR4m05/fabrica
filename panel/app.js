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
const PASOS = { guion: "Guion", voz: "Voz", render: "Video", fondo: "Fondo" };
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
    `<span class="chip ${S.info.ia ? "ok" : "am"}">${S.info.ia ? "Guion con IA ✓" : "Guion: Claude Code o a mano"}</span>`,
    `<span class="chip ${S.info.voz ? "ok" : "am"}">${S.info.voz ? "Voz ElevenLabs ✓" : "Voz de prueba (sin llave)"}</span>`,
    `<span class="chip ${S.info.pexels ? "ok" : ""}">${S.info.pexels ? "Pexels ✓" : "Sin Pexels"}</span>`,
    `<span class="chip ${S.info.apify ? "ok" : ""}">${S.info.apify ? "Apify ✓" : "Sin Apify"}</span>`,
    `<span class="chip ${S.info.flow ? "ok" : ""}" title="flow-mcp en ${location.hostname}:8787">${S.info.flow ? "Flow conectado ✓" : "Flow cerrado"}</span>`,
  ].join("");
  pintarLista();
}

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

// ---------- inicio: estilos ----------
function inicio() {
  S.actual = null; S.vista = null; parar(); pintarLista(); history.replaceState(null, "", "/");
  $("#main").innerHTML = `
    <h1>¿Qué video hacemos?</h1><p class="sub">Elige un estilo. Los que dicen "Pronto" los vamos agregando.</p>
    <div class="grid">${S.info.estilos.map((e) => `
      <div class="card estilo ${e.listo ? "" : "pronto"}" data-id="${h(e.id)}">
        <span class="badge">${e.listo ? "Listo" : "Pronto"}</span>
        <h3>${h(e.nombre)}</h3><p>${h(e.descripcion)}</p>
        <p style="margin-top:10px;font-size:12px">${(e.formatos || []).join(" · ")}</p>
      </div>`).join("")}</div>`;
  for (const el of document.querySelectorAll(".estilo:not(.pronto)")) el.onclick = () => nuevo(el.dataset.id);
}

// ---------- nuevo video ----------
function nuevo(estiloId) {
  parar();
  const listos = S.info.estilos.filter((e) => e.listo);
  const est = estiloDe(estiloId) || listos[0];
  const st = { formato: est.formatos?.[0] || "9:16", duracion: "corto" };
  $("#main").innerHTML = `
    <h1>Nuevo video</h1><p class="sub">Cuéntame la idea; el guion se escribe en el siguiente paso.</p>
    <div class="card" style="max-width:720px">
      <label>Estilo</label>
      <select id="nEstilo">${listos.map((e) => `<option value="${h(e.id)}" ${e.id === est.id ? "selected" : ""}>${h(e.nombre)}</option>`).join("")}</select>
      <label>Idea o tema</label>
      <textarea id="nIdea" placeholder="Ej.: Si escuchas que alguien te llama por tu nombre a las 3 de la mañana"></textarea>
      <div class="ideas" id="nIdeas"></div>
      <div class="fila" style="margin-top:6px">
        <div><label>Formato</label><div class="seg" id="nFormato">${Object.entries(S.info.formatos).map(([k, f]) => `<button data-v="${k}" title="${h(f.nombre)}">${k}</button>`).join("")}</div></div>
        <div><label>Duración</label><div class="seg" id="nDur"><button data-v="corto">Corto</button><button data-v="largo">Largo</button></div></div>
      </div>
      <div id="nExtra"></div>
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
  const ideas = () => { extra(); const e = estiloDe($("#nEstilo").value); $("#nIdeas").innerHTML = (e.ideas || []).map((i) => `<span class="idea">${h(i)}</span>`).join(""); for (const el of document.querySelectorAll(".idea")) el.onclick = () => ($("#nIdea").value = el.textContent); };
  const seg = (sel, k) => { for (const b of document.querySelectorAll(`${sel} button`)) { b.classList.toggle("on", b.dataset.v === st[k]); b.onclick = () => { st[k] = b.dataset.v; seg(sel, k); }; } };
  seg("#nFormato", "formato"); seg("#nDur", "duracion"); ideas();
  $("#nEstilo").onchange = ideas;
  $("#nCancelar").onclick = inicio;
  $("#nCrear").onclick = async () => {
    const idea = $("#nIdea").value.trim();
    if (!idea) return avisar("Escribe la idea del video.", true);
    localStorage.setItem("canal", $("#nCanal").value.trim());
    const opciones = {}; for (const sel of document.querySelectorAll("[data-op]")) opciones[sel.dataset.op] = sel.value;
    const conVoz = !$("#nVoz") || $("#nVoz button.on").dataset.v === "si";
    const p = await api("/api/proyectos", "POST", { estilo: $("#nEstilo").value, idea, titulo: idea, conVoz, opciones, ...st });
    if ($("#nCanal").value.trim()) await api(`/api/proyectos/${p.id}`, "PATCH", { canal: $("#nCanal").value.trim() });
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
  $("#main").innerHTML = `
    <div class="fila" style="justify-content:space-between">
      <div style="flex:1;min-width:260px"><input id="pTitulo" value="${h(p.titulo)}" style="font-size:20px;font-weight:700;background:none;border-color:transparent;padding-left:0"></div>
      <div class="fila">
        ${(est?.opciones || []).map((o) => `<select data-pop="${h(o.clave)}" style="width:auto" title="${h(o.nombre)}">${Object.entries(o.valores).map(([k, v]) => `<option value="${h(k)}" ${(p.opciones?.[o.clave] || Object.keys(o.valores)[0]) === k ? "selected" : ""}>${h(v)}</option>`).join("")}</select>`).join("")}
        <div class="seg" id="pFormato">${(est?.formatos || ["9:16"]).map((k) => `<button data-v="${k}" class="${p.formato === k ? "on" : ""}">${k}</button>`).join("")}</div>
      </div>
    </div>
    <p class="sub">${h(est?.nombre)} · ${p.duracion === "largo" ? "Largo" : "Corto"} · <span style="opacity:.7">${h(p.idea)}</span></p>

    <div class="pasos">
      <section class="paso">${pasoCab(1, "guion", "Guion", `
        ${S.sucio ? `<button class="btn primario peq" id="gGuardar">Guardar cambios</button>` : ""}
        <button class="btn peq" id="gIA" ${ocupado("guion") || !S.info.ia ? "disabled" : ""}>${S.guion ? "Pedir cambios a la IA" : "Escribir con IA"}</button>`)}
        <div class="cont">
          ${S.info.ia ? `<textarea id="gCambios" placeholder="${S.guion ? "Ej.: haz el gancho más fuerte y agrega una regla sobre las ventanas" : "Indicaciones extra (opcional): tono, número de reglas, un dato que quieras usar…"}" style="min-height:44px"></textarea>`
            : `<div class="nota">Para escribirlo con IA desde aquí, pon tu <code>ANTHROPIC_API_KEY</code> en el archivo <code>.env</code>. O abre Claude Code en la carpeta de la fábrica y dile: <code>escribe el guion de ${h(p.id)}</code>. También puedes escribirlo tú abajo.</div>`}
          <div class="barra oculto" id="bar-guion"><div></div></div>
          <div id="escenas" style="margin-top:8px"></div>
          <div class="fila" style="margin-top:10px"><button class="mini" id="gAgregar">+ Agregar escena</button>${!S.guion ? `<button class="mini" id="gVacio">Empezar a mano</button>` : ""}</div>
          ${S.guion?.fuentes?.length ? `<label>Fuentes del guion</label><div class="estado">${S.guion.fuentes.map((f) => `· ${h(f.dato)} — <a href="${h(f.url)}" target="_blank" style="color:var(--t2)">${h(f.url)}</a>`).join("<br>")}</div>` : ""}
        </div></section>

      <section class="paso">${pasoCab(2, "voz", est?.fondo ? "Voz y fondo" : "Voz", `<button class="btn peq ${p.estado.voz !== "listo" && p.estado.guion === "listo" ? "primario" : ""}" id="vHacer" ${p.estado.guion !== "listo" || S.sucio || ocupado("voz") ? "disabled" : ""}>${p.tieneVoz ? "Rehacer voz" : "Generar voz"}</button>`)}
        <div class="cont">
          <div class="fila" style="margin-bottom:10px">
            ${est?.vozOpcional ? `<div class="seg" id="vModo"><button data-v="si" class="${p.conVoz !== false ? "on" : ""}">Con voz</button><button data-v="no" class="${p.conVoz === false ? "on" : ""}">Solo música</button></div>` : ""}
            ${p.conVoz !== false ? `<input id="vId" placeholder="ID de voz de ElevenLabs para este video (opcional)" value="${h(p.vozId || "")}" style="max-width:380px">` : ""}
          </div>
          ${p.conVoz !== false && !S.info.voz ? `<div class="nota">Sin llave de ElevenLabs se genera una <b>voz de prueba muda</b> con tiempos estimados, para ensayar el video. Pon <code>ELEVENLABS_API_KEY</code> y <code>ELEVENLABS_VOICE_ID</code> en el <code>.env</code> para la voz real.${est?.vozSugerida ? "<br>Voz sugerida: " + h(est.vozSugerida) : ""}</div>` : ""}
          <div class="barra oculto" id="bar-voz"><div></div></div>
          ${est?.fondo ? panelFondo(p) : ""}
          ${p.tieneVoz ? `<audio id="vAudio" controls src="/proyectos/${h(p.id)}/voz.mp3?v=${Date.now()}" style="width:100%"></audio><div class="estado">${p.tiempos ? `${p.tiempos.duracion.toFixed(1)} s${p.tiempos.sinVoz ? " · sin voz, solo música" : p.tiempos.prueba ? " · voz de prueba" : ""}` : ""}</div>` : `<div class="estado">Primero el guion.</div>`}
        </div></section>

      <section class="paso">${pasoCab(3, "render", "Vista previa y video", `<button class="btn peq" id="rTodo" title="Hace la voz y luego el video, sin esperar" ${p.estado.guion !== "listo" || S.sucio || ocupado("voz") || ocupado("render") ? "disabled" : ""}>Voz + video</button><button class="btn peq ${p.estado.voz === "listo" ? "primario" : ""}" id="rHacer" ${p.estado.voz !== "listo" || ocupado("render") || ocupado("fondo") ? "disabled" : ""}>${p.tieneFinal ? "Volver a sacar el video" : "Sacar el video"}</button>`)}
        <div class="cont">
          <div class="vista">
            <div>
              <div class="pantalla" id="pantalla"></div>
              <div class="controles"><button class="btn peq" id="play">▶</button><input type="range" id="scrub" min="0" max="1000" value="0" style="width:100%"><span class="estado" id="reloj" style="min-width:86px;text-align:right">0:00</span></div>
              <div class="estado">La vista previa es en vivo (sin música ni efectos). ${S.sucio ? "Guarda el guion para ver los cambios." : ""}</div>
            </div>
            <div>
              <div class="barra oculto" id="bar-render"><div></div></div>
              ${p.tieneFinal ? `
                <video controls src="/proyectos/${h(p.id)}/final.mp4?v=${Date.now()}"></video>
                <div class="fila" style="margin:10px 0"><a class="btn peq" href="/proyectos/${h(p.id)}/final.mp4" download="${h(p.id)}.mp4">Descargar video</a><a class="btn peq" href="/proyectos/${h(p.id)}/portada.jpg" download="${h(p.id)}.jpg">Portada</a><button class="btn peq" id="copiar">Copiar texto para subir</button></div>
                <pre class="subir" id="subir">…</pre>
                <div class="estado">También queda guardado en la carpeta <b>listos</b>.</div>`
              : `<div class="estado">Cuando tengas la voz, revisa la vista previa y pulsa "Sacar el video".</div>`}
            </div>
          </div>
        </div></section>
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
  $("#gAgregar").onclick = () => { S.guion = S.guion || { titulo: p.titulo, escenas: [] }; S.guion.escenas.push({ tipo: "narracion", texto: "", visual: est?.visuales?.[0] || "" }); marcarSucio(); };
  if ($("#gVacio")) $("#gVacio").onclick = () => { S.guion = { titulo: p.titulo, escenas: [{ tipo: "gancho", texto: "", visual: "oscuridad" }] }; marcarSucio(); };
  if ($("#gGuardar")) $("#gGuardar").onclick = guardarGuion;
  for (const sel of document.querySelectorAll("[data-pop]")) sel.onchange = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { opciones: { [sel.dataset.pop]: sel.value } }); abrir(p.id, { mantener: true }); };
  for (const b of document.querySelectorAll("#vModo button")) b.onclick = async () => { await api(`/api/proyectos/${p.id}`, "PATCH", { conVoz: b.dataset.v === "si" }); abrir(p.id, { mantener: true }); };
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
  $("#rTodo").onclick = () => api(`/api/proyectos/${p.id}/todo`, "POST").catch((e) => avisar(e.message, true));
  $("#rHacer").onclick = () => api(`/api/proyectos/${p.id}/render`, "POST").catch((e) => avisar(e.message, true));
  if ($("#copiar")) {
    api(`/api/proyectos/${p.id}/subir`).then((t) => ($("#subir").textContent = t));
    $("#copiar").onclick = () => navigator.clipboard.writeText($("#subir").textContent).then(() => avisar("Copiado."));
  }
  for (const k of Object.keys(PASOS)) if (S.progreso[p.id]?.[k]) mostrarProgreso(k, S.progreso[p.id][k]);
  if (p.guion) montarVista();
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
      <textarea data-k="texto" placeholder="Lo que dice la voz">${h(e.texto)}</textarea>
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
        const k = el.dataset.k, v = el.value;
        if (v === "" && k !== "texto") delete g.escenas[i][k]; else g.escenas[i][k] = v;
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
  S.guion.escenas = S.guion.escenas.filter((e) => (e.texto || "").trim() || e.duracion);
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
  const c = d.config;
  archivo = archivo || d.lista[0]?.archivo;
  const inv = archivo ? await api(`/api/investigacion/${archivo}`) : null;
  $("#main").innerHTML = `
    <h1>Investigador de virales</h1>
    <p class="sub">Revisa lo que está funcionando en tu nicho y te propone frases originales con su clip para Flow (9:16).</p>
    ${!d.ia ? `<div class="nota">Sin IA conectada: pon <code>GEMINI_API_KEY</code> (gratis en aistudio.google.com) en el <code>.env</code>, o pídeselo a <b>Claude Code</b> en la carpeta de la fábrica: <code>investiga mi nicho y dame frases virales</code> (o <code>convierte los informes pendientes</code>). Recarga esta página al terminar.</div>` : `<div class="estado" style="margin-bottom:8px">Motor: ${h(d.motor)}</div>`}
    ${d.pendientes?.length ? `<div class="nota">Informes guardados sin convertir: ${d.pendientes.map(h).join(", ")}. ${d.ia ? "Se reintentan solos cada 15 minutos (Gemini a veces está saturado)." : "Dile a Claude Code: <code>convierte los informes pendientes</code>."}</div>` : ""}
    <details class="card" style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600">Importar un informe (Gemini Deep Research, muse.ai…)</summary>
      <p class="estado">1) Copia el prompt y pégalo en Gemini con <b>Deep Research</b>. 2) Copia el informe que te dé y pégalo abajo. También puedes soltar archivos .md/.txt/.csv en <code>investigacion/entrada/</code> o mandarlos desde n8n.</p>
      <div class="fila"><button class="btn peq" id="iPrompt">Copiar prompt para Deep Research</button></div>
      <textarea id="iInforme" placeholder="Pega aquí el informe completo" style="min-height:120px;margin-top:10px"></textarea>
      <div class="fila" style="margin-top:8px"><input id="iFuente" value="gemini" style="max-width:200px" title="De dónde viene"><button class="btn primario peq" id="iImportar">Importar y proponer</button></div>
    </details>
    ${!d.apify ? `<div class="nota">Sin <code>APIFY_TOKEN</code> investiga con búsqueda web: sirve, pero <b>sin métricas reales</b> (vistas, guardados, compartidos). Con Apify mide de verdad lo viral en TikTok e Instagram.</div>` : ""}
    <details class="card" ${inv ? "" : "open"} style="margin-bottom:16px"><summary style="cursor:pointer;font-weight:600">Tu nicho y fuentes</summary>
      <div class="fila" style="align-items:flex-start">
        <div style="flex:1;min-width:260px"><label>Nombre</label><input id="iNombre" value="${h(c.nombre)}">
          <label>Audiencia</label><textarea id="iDesc">${h(c.descripcion)}</textarea>
          <label>Sobre la marca (qué sí y qué no)</label><textarea id="iMarca">${h(c.marca)}</textarea></div>
        <div style="flex:1;min-width:260px"><label>Cuentas de TikTok de referencia (una por línea)</label><textarea id="iTk" placeholder="@cuenta">${h(c.cuentasTiktok.join("\n"))}</textarea>
          <label>Cuentas de Instagram de referencia</label><textarea id="iIg" placeholder="@cuenta">${h(c.cuentasInstagram.join("\n"))}</textarea>
          <label>Hashtags (sin #, separados por coma)</label><input id="iHash" value="${h(c.hashtags.join(", "))}">
          <label>Búsquedas</label><input id="iBus" value="${h(c.busquedas.join(", "))}">
          <div class="fila"><div><label>Últimos días</label><input id="iDias" type="number" value="${c.dias}" style="width:100px"></div><div><label>Por fuente</label><input id="iPor" type="number" value="${c.porFuente}" style="width:100px"></div><div><label>Propuestas</label><input id="iProp" type="number" value="${c.propuestas}" style="width:100px"></div></div></div>
      </div>
      <div class="fila" style="margin-top:14px"><button class="btn" id="iGuardar">Guardar</button></div>
    </details>
    <div class="fila">${inv ? `<button class="btn" id="iTodas" title="Crea un video por propuesta y los manda a hacer (voz + video) uno tras otro">Crear y hacer todas</button>` : ""}<button class="btn primario" id="iCorrer" ${!d.ia || d.trabajando ? "disabled" : ""} title="${d.ia ? "" : "Necesita GEMINI_API_KEY o ANTHROPIC_API_KEY"}">Investigar ahora</button>
      ${d.lista.length ? `<select id="iHist" style="width:auto">${d.lista.map((x) => `<option value="${h(x.archivo)}" ${x.archivo === archivo ? "selected" : ""}>${new Date(x.fecha).toLocaleString()} · ${x.propuestas} propuestas${x.modo === "web" ? " · sin métricas" : ` · ${x.analizadas} analizadas`}</option>`).join("")}</select>` : ""}
      <span class="estado" id="est-investigar">${d.trabajando ? "Trabajando…" : ""}</span></div>
    <div class="barra ${d.trabajando ? "" : "oculto"}" id="bar-investigar"><div></div></div>
    ${inv ? `
      ${inv.errores?.length ? `<div class="nota">Avisos: ${inv.errores.map(h).join("<br>")}</div>` : ""}
      <div class="card" style="margin:16px 0"><h2>Lo que está funcionando</h2><ul style="margin:8px 0 0;padding-left:18px;color:var(--t2)">${(inv.patrones || []).map((x) => `<li>${h(x)}</li>`).join("")}</ul></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${inv.propuestas.map((p) => `
        <div class="card">
          <div class="estado">${h(p.tema || "")}${p.origen === "en" ? ` · <span title="Tendencia en inglés">🇺🇸→🇲🇽</span>` : ""}${p.llegada ? ` · <b style="color:${p.llegada === "aún no llega" ? "var(--ok)" : p.llegada === "poco en español" ? "var(--am)" : "var(--t2)"}">${h(p.llegada)}</b>` : ""}</div>
          <div style="font-size:19px;line-height:1.35;margin:6px 0 8px;font-family:Georgia,serif">${marcarAcento(p.frase)}</div>
          ${p.autor ? `<div class="estado">— ${h(p.autor)}</div>` : ""}
          ${p.cierre ? `<div class="estado" style="margin-top:4px">Cierre: ${h(p.cierre)}</div>` : ""}
          <details style="margin-top:8px"><summary class="estado" style="cursor:pointer">Por qué y clip</summary>
            <p class="estado">${h(p.porque || "")}</p>
            ${p.adaptacion ? `<p class="estado"><b>Adaptación:</b> ${h(p.adaptacion)}</p>` : ""}
            ${(p.inspiradaEn || []).length ? `<p class="estado">Inspirada en: ${p.inspiradaEn.map((u, i) => `<a href="${h(u)}" target="_blank" style="color:var(--t2)">[${i + 1}]</a>`).join(" ")}</p>` : ""}
            <pre class="subir" style="max-height:120px">${h(p.flowPrompt || "")}</pre>
          </details>
          <div class="fila" style="margin-top:10px"><button class="btn primario peq" data-crear="${p.n}">Crear video 9:16</button><button class="btn peq" data-copiar="${p.n}">Copiar prompt Flow</button></div>
        </div>`).join("")}</div>
      ${inv.publicaciones?.length ? `<details class="card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Publicaciones analizadas (${inv.publicaciones.length})</summary>
        <div style="overflow:auto"><table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px">${inv.publicaciones.map((x, i) => `<tr style="border-bottom:1px solid var(--b)"><td>${i + 1}</td><td>${h(x.red)}</td><td><a href="${h(x.url)}" target="_blank" style="color:var(--t)">@${h(x.autor)}</a></td><td>${(x.vistas || 0).toLocaleString()} vistas</td><td>${x.rebase ? x.rebase + "× seguidores" : ""}</td><td>${(x.guardados || 0).toLocaleString()} guard.</td><td>${(x.compartidos || 0).toLocaleString()} comp.</td><td style="color:var(--t2)">${h((x.texto || "").slice(0, 80))}</td></tr>`).join("")}</table></div></details>` : ""}`
    : `<p class="estado" style="margin-top:14px">Todavía no hay investigaciones.</p>`}`;
  $("#iGuardar").onclick = async () => {
    await api("/api/investigacion", "PUT", { nombre: $("#iNombre").value, descripcion: $("#iDesc").value, marca: $("#iMarca").value,
      cuentasTiktok: lista($("#iTk").value), cuentasInstagram: lista($("#iIg").value), hashtags: lista($("#iHash").value).map((x) => x.replace(/^#/, "")),
      busquedas: lista($("#iBus").value), dias: Number($("#iDias").value), porFuente: Number($("#iPor").value), propuestas: Number($("#iProp").value) });
    avisar("Nicho guardado.");
  };
  $("#iCorrer").onclick = async () => { await $("#iGuardar").onclick(); api("/api/investigacion", "POST").catch((e) => avisar(e.message, true)); };
  $("#iPrompt").onclick = async () => navigator.clipboard.writeText(await api("/api/investigacion/prompt")).then(() => avisar("Prompt copiado. Pégalo en Gemini con Deep Research."));
  $("#iImportar").onclick = async () => {
    const texto = $("#iInforme").value.trim(); if (texto.length < 80) return avisar("Pega el informe completo.", true);
    $("#iImportar").disabled = true; avisar("Importando…");
    try { const r = await api("/api/investigacion/importar", "POST", { texto, fuente: $("#iFuente").value || "informe" }); avisar(r.pendiente ? "Guardado. Pídele a Claude Code que lo convierta." : "Recibido. Convirtiendo en propuestas… (aparecen aquí solas)"); investigador(); }
    catch (e) { avisar(e.message, true); $("#iImportar").disabled = false; }
  };
  if ($("#iTodas")) $("#iTodas").onclick = async () => {
    if (!confirm(`Se crearán ${inv.propuestas.length} videos 9:16 y se harán uno tras otro. Los fondos de Flow los pones después en cada uno (o usa Pexels). ¿Seguir?`)) return;
    for (const pr of inv.propuestas) { const p = await api(`/api/investigacion/${archivo}/crear`, "POST", { n: pr.n, formato: "9:16", canal: localStorage.getItem("canal") || "" }); await api(`/api/proyectos/${p.id}/todo`, "POST"); }
    S.proyectos = await api("/api/proyectos"); pintarLista(); avisar("Listo: quedaron en fila. Míralos en la lista de la izquierda.");
  };
  if ($("#iHist")) $("#iHist").onchange = (e) => investigador(e.target.value);
  for (const b of document.querySelectorAll("[data-copiar]")) b.onclick = () => navigator.clipboard.writeText(inv.propuestas.find((x) => x.n == b.dataset.copiar).flowPrompt || "").then(() => avisar("Prompt copiado."));
  for (const b of document.querySelectorAll("[data-crear]")) b.onclick = async () => {
    const p = await api(`/api/investigacion/${archivo}/crear`, "POST", { n: Number(b.dataset.crear), formato: "9:16", canal: localStorage.getItem("canal") || "" });
    S.proyectos = await api("/api/proyectos"); S.vista = null; abrir(p.id);
  };
}

// ---------- vista previa en vivo ----------
function montarVista() {
  const p = S.actual, cont = $("#pantalla"); if (!cont) return;
  const [W, H] = p.formato === "16:9" ? [1920, 1080] : [1080, 1920];
  const ancho = p.formato === "16:9" ? Math.min(560, cont.parentElement.clientWidth || 560) : 300;
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

$("#btnNuevo").onclick = () => nuevo();
$("#btnInv").onclick = () => investigador();
$(".logo").onclick = inicio; $(".logo").style.cursor = "pointer";
cargar().then(() => { escuchar(); const id = location.hash.slice(1); id === "investigador" ? investigador() : id && S.proyectos.some((p) => p.id === id) ? abrir(id) : inicio(); })
  .catch((e) => avisar("No pude conectar con la fábrica: " + e.message, true));
