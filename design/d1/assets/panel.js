/* PitchLab · D1 · panel: liga → partidos → análisis en modal con traza de cálculo.
   La traza muestra los valores reales del cálculo (no es decorativa). Se puede saltar
   y se omite con prefers-reduced-motion. Estado en la URL: #liga/partido. */
(function () {
  const { icon, LEAGUES, T, G, analyze, pct, fair, dayKey, hour, badge, leagueBadge, mascot, parseOdds, reveal, growBars, reduced, UPDATED } = PL;
  const $ = (s, r = document) => r.querySelector(s);
  const state = { league: "liga-mx", game: null, day: "all", market: null, odds: "" };
  const seen = new Set(); // partidos ya calculados en esta sesión → traza corta

  function readHash() {
    const [l, g] = location.hash.replace("#", "").split("/");
    if (l && LEAGUES.some((x) => x.id === l && x.status !== "soon")) state.league = l;
    state.game = g || null;
  }
  const writeHash = () => history.replaceState(null, "", `#${state.league}${state.game ? "/" + state.game : ""}`);
  const L = () => LEAGUES.find((l) => l.id === state.league);
  const games = () => G[state.league].slice().sort((a, b) => a.t.localeCompare(b.t));

  // ---------- Vista de liga ----------
  function renderSwitch() {
    $("#lswitch").innerHTML = LEAGUES.map((l) => `<button class="lchip" data-league="${l.id}" ${l.status === "soon" ? "disabled" : ""} ${l.id === state.league ? 'aria-current="page"' : ""}>${leagueBadge(l, 26)}${l.short}${l.status === "soon" ? '<span class="tag">Pronto</span>' : ""}</button>`).join("");
  }
  function renderHead() {
    const l = L();
    $("#lhead").innerHTML = `
      ${leagueBadge(l, 56)}
      <div>
        <h1 class="h1">${l.name}</h1>
        <div class="meta"><span class="secondary">${l.season} · ${l.period}</span><span class="fresh"><span class="dot"></span>Actualizado ${UPDATED} · ${l.source}</span><span class="tag tag-demo"><span class="dot"></span>Datos de ejemplo</span>${l.status === "beta" ? '<span class="tag tag-info">Beta</span>' : ""}</div>
      </div>
      <div class="pic mascot" aria-hidden="true"><img src="${mascot(l.mascot)}" alt="" width="170" height="170"></div>`;
  }
  function renderDays() {
    const gs = games(), days = [...new Set(gs.map((g) => g.t.slice(0, 10)))];
    if (state.day !== "all" && !days.includes(state.day)) state.day = "all";
    $("#days").innerHTML = `<button class="chip" data-day="all" aria-pressed="${state.day === "all"}">Toda la ${state.league === "nfl" ? "semana" : "jornada"} <span class="count">${gs.length}</span></button>` +
      days.map((d) => `<button class="chip" data-day="${d}" aria-pressed="${state.day === d}">${dayKey(d + "T12:00")} <span class="count">${gs.filter((g) => g.t.startsWith(d)).length}</span></button>`).join("");
  }
  function renderGames() {
    const gs = games().filter((g) => state.day === "all" || g.t.startsWith(state.day)), tm = T[state.league], draw = state.league !== "nfl";
    const groups = {}; gs.forEach((g) => (groups[g.t.slice(0, 10)] ||= []).push(g));
    let n = 0;
    $("#games").innerHTML = Object.entries(groups).map(([d, list]) => `
      <section class="day" aria-labelledby="d-${d}"><h2 id="d-${d}">${dayKey(d + "T12:00")}</h2>
      <ul class="cards">${list.map((g) => {
        const a = analyze(state.league, g), [ph, pd, pa] = a.x12, H = tm[g.h], A = tm[g.a], nf = state.league === "nfl";
        return `<li class="reveal" style="--d:${(n++) * 60}ms"><button class="panel gcard ${g.fin ? "final" : ""}" data-game="${g.id}" aria-haspopup="dialog" aria-label="Analizar ${H[0]} contra ${A[0]}, ${g.fin ? "finalizado" : hour(g.t)}">
          <span class="top"><span class="when">${g.fin ? "Final" : hour(g.t)}</span><span>${g.v}</span></span>
          <span class="tm">${badge(state.league, g.h, 32)}<span>${H[0]}</span><span class="p">${g.fin ? g.fin[0] : pct(ph)}</span></span>
          <span class="tm">${badge(state.league, g.a, 32)}<span>${A[0]}</span><span class="p">${g.fin ? g.fin[1] : pct(pa)}</span></span>
          <span class="split3" aria-hidden="true"><span class="h" style="flex:${ph}"></span>${draw ? `<span class="d" style="flex:${pd}"></span>` : ""}<span class="a" style="flex:${pa}"></span></span>
          <span class="foot"><span>${draw ? `Empate ${pct(pd)} · ` : ""}Proy. ${a.proj.h.toFixed(nf ? 0 : 1)}–${a.proj.a.toFixed(nf ? 0 : 1)}</span><span class="open">Analizar ${icon("arrow")}</span></span>
        </button></li>`; }).join("")}</ul></section>`).join("") ||
      `<div class="empty"><img src="${mascot("radar")}" alt="" width="160" height="160"><p>No hay partidos este día.</p><button class="btn btn-secondary" data-day="all">Ver toda la jornada</button></div>`;
    reveal($("#games"));
  }

  // ---------- Modal ----------
  const dlg = () => $("#dlg");
  let runId = 0, lastTrigger = null;

  function openModal(trigger) {
    lastTrigger = trigger || lastTrigger;
    const d = dlg();
    if (!d.open) { d.showModal(); requestAnimationFrame(() => d.classList.add("show")); }
    const g = G[state.league].find((x) => x.id === state.game);
    if (!g) return;
    const key = state.league + g.id;
    if (reduced() || g.fin) { seen.add(key); renderResult(g); return; }
    runCalc(g, seen.has(key) ? 70 : 230).then((ok) => { if (ok) { seen.add(key); renderResult(g); } });
  }
  function closeModal() {
    const d = dlg();
    if (!d.open) return;
    runId++;
    d.classList.remove("show");
    setTimeout(() => { d.close(); state.game = null; writeHash(); lastTrigger?.focus(); }, reduced() ? 0 : 200);
  }

  function bar(g) {
    const l = L(), tm = T[state.league];
    return `<div class="modal-bar">${leagueBadge(l, 24)}<div><p class="eyebrow">${l.name} · ${l.period}</p><p class="caption muted" style="margin:0">${g.fin ? "Finalizado" : hour(g.t)} · ${g.v}</p></div>
      <button class="btn btn-ghost btn-icon close" data-close aria-label="Cerrar análisis">${icon("close")}</button></div>`;
  }

  function runCalc(g, ms) {
    const id = ++runId, a = analyze(state.league, g), tm = T[state.league], H = tm[g.h], A = tm[g.a];
    $("#dlg-win").innerHTML = bar(g) + `
      <div class="calc" role="status" aria-live="polite">
        <div class="mascot" aria-hidden="true"><img src="${mascot("radar")}" alt="" width="220" height="220"></div>
        <div>
          <h2 class="h3" id="dlg-title">Calculando ${H[0]} vs ${A[0]}</h2>
          <div class="progress" aria-hidden="true"><span id="prog"></span></div>
          <ol class="steps" id="steps"></ol>
          <div class="sk" aria-hidden="true"><div class="skeleton" style="width:92%"></div><div class="skeleton" style="width:78%"></div><div class="skeleton" style="width:85%"></div></div>
          <div class="skip-row"><span class="caption muted">Modelo de referencia · en validación</span><button class="btn btn-ghost" data-skip>Saltar ${icon("arrow")}</button></div>
        </div>
      </div>`;
    $("#dlg-win").focus();
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (id !== runId) return resolve(false);
        const ol = $("#steps");
        ol.querySelectorAll("li:not(.done)").forEach((li) => { li.classList.add("done"); li.querySelector(".st").innerHTML = icon("check"); });
        if (i < a.steps.length) {
          ol.insertAdjacentHTML("beforeend", `<li><span class="st"><span class="spin"></span></span><span>${a.steps[i]}</span></li>`);
          $("#prog").style.width = `${((i + 1) / a.steps.length) * 100}%`;
          i++; setTimeout(tick, ms);
        } else setTimeout(() => resolve(id === runId), ms * 1.2);
      };
      tick();
      dlg().addEventListener("click", function skip(e) { if (e.target.closest("[data-skip]")) { dlg().removeEventListener("click", skip); if (id === runId) { runId++; resolve(true); } } });
    });
  }

  function renderResult(g) {
    const l = L(), tm = T[state.league], H = tm[g.h], A = tm[g.a], a = analyze(state.league, g), nf = state.league === "nfl", draw = !nf;
    const flat = a.markets.flatMap((m) => m.rows.map(([n, p]) => ({ g: m.g, n, p })));
    if (!state.market || !flat.some((r) => r.g + r.n === state.market)) state.market = flat[0].g + flat[0].n;
    const [ph, pd, pa] = a.x12;
    $("#dlg-win").innerHTML = bar(g) + `
      <div class="result">
        <h2 class="sr-only" id="dlg-title">Análisis de ${H[0]} contra ${A[0]}</h2>
        <div class="match">
          <div class="mteam">${badge(state.league, g.h, 56)}<div><div class="n">${H[0]}</div><div class="c">LOCAL</div></div></div>
          <div class="mscore">
            <div class="caption muted">${g.fin ? "Final" : "Proyección"}</div>
            <div class="numeric-hl">${g.fin ? `${g.fin[0]} – ${g.fin[1]}` : `${a.proj.h.toFixed(nf ? 0 : 1)} – ${a.proj.a.toFixed(nf ? 0 : 1)}`}</div>
            <div class="split3 split-big" aria-hidden="true"><span class="h" style="flex:${ph}"></span>${draw ? `<span class="d" style="flex:${pd}"></span>` : ""}<span class="a" style="flex:${pa}"></span></div>
            ${g.fin ? `<div class="caption muted" style="margin-top:6px">Proyección previa ${a.proj.h.toFixed(1)}–${a.proj.a.toFixed(1)}</div>` : ""}
          </div>
          <div class="mteam away">${badge(state.league, g.a, 56)}<div><div class="n">${A[0]}</div><div class="c">VISITANTE</div></div></div>
        </div>
        ${g.fin ? `<div style="padding:var(--space-4) var(--space-8) 0"><span class="tag tag-info"><span class="dot"></span>Análisis publicado antes del partido · sin cambios</span></div>` : ""}
        <div class="rbody">
          <table class="mtable">
            <caption class="sr-only">Probabilidades por mercado. Elige una fila para compararla con tu cuota.</caption>
            <thead><tr><th>Mercado</th><th><span class="sr-only">Barra</span></th><th class="r">Prob.</th><th class="r">Cuota justa</th></tr></thead>
            ${a.markets.map((m) => `<tbody><tr class="group"><td colspan="4">${m.g}</td></tr>${m.rows.map(([n, p]) => `<tr class="mrow" tabindex="0" role="button" aria-pressed="${state.market === m.g + n}" data-market="${m.g + n}"><td>${n}</td><td class="bar"><div class="pbar grow" style="--w:${(p * 100).toFixed(1)}%"><span></span></div></td><td class="r num" data-count="${p}">0 %</td><td class="r num secondary">${fair(p)}</td></tr>`).join("")}</tbody>`).join("")}
          </table>
          <div class="side-col">
            ${a.likely ? `<div class="panel likely"><span class="small secondary">Marcador más probable</span><span><b class="num" style="font-size:1.25rem">${a.likely[0]}–${a.likely[1]}</b> <span class="caption muted">${pct(a.likely[2])}</span></span></div>` : ""}
            <div class="panel compare" id="compare"></div>
            <div class="factors"><p class="eyebrow">Factores del modelo</p><dl>${a.factors.map(([k, v, s]) => `<dt>${k}</dt><dd>${v}<small>${s}</small></dd>`).join("")}</dl></div>
          </div>
        </div>
        <div class="mfoot"><span class="tag tag-model">Modelo de referencia · en validación</span><span>Datos: ${l.source} · ${UPDATED}</span><span>No garantiza resultados.</span><a href="landing.html#como">Cómo funciona</a></div>
      </div>`;
    growBars($("#dlg-win"));
    renderCompare(flat);
    $("#dlg-win").focus();
  }
  function renderCompare(flat) {
    const r = flat.find((x) => x.g + x.n === state.market), d = parseOdds(state.odds), imp = d ? 1 / d : null;
    $("#compare").innerHTML = `
      <label for="odds-in">Compara con tu cuota · <span class="secondary">${r.n}</span></label>
      <div class="row"><input id="odds-in" inputmode="decimal" placeholder="2.10 o +110" value="${state.odds}" aria-describedby="odds-help"><span id="odds-help" class="caption muted">Decimal o americana. No se guarda.</span></div>
      <div class="out" aria-live="polite">
        <div><span class="caption muted">Modelo</span><b>${pct(r.p)}</b></div>
        <div><span class="caption muted">Tu cuota implica</span><b>${imp ? pct(imp) : "—"}</b></div>
        <div><span class="caption muted">Diferencia</span><b>${imp ? ((r.p - imp) >= 0 ? "+" : "") + ((r.p - imp) * 100).toFixed(1) + " pp" : "—"}</b></div>
      </div>`;
    $("#odds-in").addEventListener("input", (e) => { state.odds = e.target.value; const pos = e.target.selectionStart; renderCompare(flat); const i = $("#odds-in"); i.focus(); i.setSelectionRange(pos, pos); });
  }

  // ---------- Eventos ----------
  function renderAll() { renderSwitch(); renderHead(); renderDays(); renderGames(); }
  document.addEventListener("click", (e) => {
    const lb = e.target.closest("[data-league]");
    if (lb && !lb.disabled) { state.league = lb.dataset.league; state.game = null; state.day = "all"; writeHash(); renderAll(); return; }
    const d = e.target.closest("[data-day]");
    if (d) { state.day = d.dataset.day; renderDays(); renderGames(); return; }
    const gb = e.target.closest("[data-game]");
    if (gb) { state.game = gb.dataset.game; state.market = null; state.odds = ""; writeHash(); openModal(gb); return; }
    const m = e.target.closest("[data-market]");
    if (m) { state.market = m.dataset.market; const flat = analyze(state.league, G[state.league].find((x) => x.id === state.game)).markets.flatMap((mm) => mm.rows.map(([n, p]) => ({ g: mm.g, n, p }))); dlg().querySelectorAll(".mrow").forEach((r) => r.setAttribute("aria-pressed", r === m)); renderCompare(flat); return; }
    if (e.target.closest("[data-close]")) { closeModal(); return; }
    if (e.target.classList.contains("modal-frame")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-market]")) { e.preventDefault(); e.target.click(); }
  });
  dlg().addEventListener("cancel", (e) => { e.preventDefault(); closeModal(); });
  window.addEventListener("hashchange", () => { readHash(); renderAll(); if (state.game) openModal(); });

  readHash();
  renderAll();
  if (state.game) openModal();
})();
