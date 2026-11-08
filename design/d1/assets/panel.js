/* PitchLab · D1 · lógica del panel (prototipo). Estado en la URL (#liga/partido) como en ROUTE_MAP. */
(function () {
  const { icon, LEAGUES, SPORTS, T, G, analyze, pct, fair, dayKey, hour, badge, leagueBadge, parseOdds, UPDATED } = PL;
  const LAYOUT = document.body.dataset.layout; // "a" | "b"
  const $ = (s, r = document) => r.querySelector(s);
  const state = { league: "liga-mx", game: null, day: "all", market: null, odds: "" };

  // ----- URL -----
  function readHash() {
    const [l, g] = location.hash.replace("#", "").split("/");
    if (l && LEAGUES.some((x) => x.id === l && x.status !== "soon")) state.league = l;
    state.game = g || null;
  }
  function writeHash() { history.replaceState(null, "", `#${state.league}${state.game ? "/" + state.game : ""}`); }

  // ----- Sidebar y selector móvil -----
  function renderLeagues() {
    const bySport = {};
    LEAGUES.forEach((L) => (bySport[L.sport] ||= []).push(L));
    $("#side-list").innerHTML = Object.entries(bySport).map(([sp, ls]) => `
      <h2>${icon(sp === "football" ? "football" : sp, "icon")}${SPORTS[sp]}</h2>
      <ul>${ls.map((L) => `<li><button class="lg-btn" data-league="${L.id}" ${L.status === "soon" ? "disabled" : ""} ${L.id === state.league ? 'aria-current="page"' : ""}>
        ${leagueBadge(L, 24)}<span>${L.name}</span>${L.status === "soon" ? '<span class="tag">Pronto</span>' : L.status === "beta" ? '<span class="tag tag-info">Beta</span>' : ""}
      </button></li>`).join("")}</ul>`).join("");
    $("#mobile-leagues").innerHTML = LEAGUES.filter((L) => L.status !== "soon").map((L) => `
      <button class="chip" data-league="${L.id}" aria-pressed="${L.id === state.league}">${leagueBadge(L, 18)}${L.short}</button>`).join("");
  }

  // ----- Encabezado de liga -----
  function renderHead() {
    const L = LEAGUES.find((l) => l.id === state.league);
    $("#league-head").innerHTML = `
      ${leagueBadge(L, 48)}
      <div>
        <h1 class="h2">${L.name}</h1>
        <div class="meta"><span class="secondary small">${L.season} · ${L.period}</span>${L.status === "beta" ? '<span class="tag tag-info">Beta · datos de API-Football</span>' : ""}</div>
      </div>
      <div class="fresh-wrap" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span class="fresh"><span class="dot"></span>Actualizado ${UPDATED} · ${L.source}</span>
        <span class="tag tag-demo"><span class="dot"></span>Datos de ejemplo</span>
      </div>`;
  }

  // ----- Filtro por día -----
  function games() { return G[state.league].slice().sort((a, b) => a.t.localeCompare(b.t)); }
  function renderChips() {
    const gs = games(), days = [...new Set(gs.map((g) => g.t.slice(0, 10)))];
    if (!days.includes(state.day)) state.day = "all";
    $("#chips").innerHTML = `<button class="chip" data-day="all" aria-pressed="${state.day === "all"}">Toda la ${state.league === "nfl" ? "semana" : "jornada"} <span class="count">${gs.length}</span></button>` +
      days.map((d) => { const n = gs.filter((g) => g.t.startsWith(d)).length; return `<button class="chip" data-day="${d}" aria-pressed="${state.day === d}">${dayKey(d + "T12:00")} <span class="count">${n}</span></button>`; }).join("");
  }

  // ----- Partidos -----
  function renderGames() {
    const gs = games().filter((g) => state.day === "all" || g.t.startsWith(state.day));
    const groups = {};
    gs.forEach((g) => (groups[g.t.slice(0, 10)] ||= []).push(g));
    const tm = T[state.league];
    const draw = state.league !== "nfl";
    $("#games").innerHTML = Object.entries(groups).map(([d, list]) => `
      <section class="day" aria-labelledby="d-${d}">
        <h3 id="d-${d}">${dayKey(d + "T12:00")}</h3>
        ${LAYOUT === "a" ? `<ul class="games">${list.map((g) => {
          const a = analyze(state.league, g), [ph, pd, pa] = a.x12, H = tm[g.h], A = tm[g.a];
          return `<li><button class="game" data-game="${g.id}" ${g.id === state.game ? 'aria-current="true"' : ""} aria-label="${H[0]} contra ${A[0]}, ${hour(g.t)}">
            <span class="time">${g.fin ? "Final" : hour(g.t)}</span>
            <span class="teams">
              <span class="tm">${badge(state.league, g.h, 20)}<span>${H[0]}</span>${g.fin ? `<span class="res">${g.fin[0]}</span>` : ""}</span>
              <span class="tm">${badge(state.league, g.a, 20)}<span>${A[0]}</span>${g.fin ? `<span class="res">${g.fin[1]}</span>` : ""}</span>
            </span>
            <span class="x12" aria-hidden="true">
              <span class="split3"><span class="h" style="flex:${ph}"></span>${draw ? `<span class="d" style="flex:${pd}"></span>` : ""}<span class="a" style="flex:${pa}"></span></span>
              <span class="lbl"><span>${Math.round(ph * 100)}</span>${draw ? `<span>${Math.round(pd * 100)}</span>` : ""}<span>${Math.round(pa * 100)}</span></span>
            </span>
            <span class="proj">Proy. <b>${a.proj.h.toFixed(state.league === "nfl" ? 0 : 1)}–${a.proj.a.toFixed(state.league === "nfl" ? 0 : 1)}</b></span>
            <span class="chev">${icon("chevron")}</span>
          </button></li>`; }).join("")}</ul>`
        : `<ul class="cards">${list.map((g) => {
          const a = analyze(state.league, g), [ph, pd, pa] = a.x12, H = tm[g.h], A = tm[g.a];
          return `<li><button class="panel gcard" data-game="${g.id}" aria-label="${H[0]} contra ${A[0]}, ${hour(g.t)}">
            <span class="top"><span>${g.fin ? "Final" : hour(g.t)} · ${g.v}</span><span>Proy. ${a.proj.h.toFixed(state.league === "nfl" ? 0 : 1)}–${a.proj.a.toFixed(state.league === "nfl" ? 0 : 1)}</span></span>
            <span class="tm">${badge(state.league, g.h, 32)}<span>${H[0]}</span><span class="p">${g.fin ? g.fin[0] : pct(ph)}</span></span>
            <span class="tm">${badge(state.league, g.a, 32)}<span>${A[0]}</span><span class="p">${g.fin ? g.fin[1] : pct(pa)}</span></span>
            <span class="split3" aria-hidden="true"><span class="h" style="flex:${ph}"></span>${draw ? `<span class="d" style="flex:${pd}"></span>` : ""}<span class="a" style="flex:${pa}"></span></span>
            ${draw ? `<span class="caption muted">Empate ${pct(pd)}</span>` : ""}
          </button></li>`; }).join("")}</ul>`}
      </section>`).join("") || `<div class="empty">${icon("games", "icon-24")}<p>No hay partidos este día.</p><button class="btn btn-secondary" data-day="all">Ver toda la jornada</button></div>`;
  }

  // ----- Análisis -----
  function renderAnalysis() {
    const pane = $("#analysis");
    const g = G[state.league].find((x) => x.id === state.game);
    if (!g) {
      pane.innerHTML = `<div class="empty">${icon("probability", "icon-24")}<p><b>Elige un partido</b></p><p class="small muted">Verás probabilidades por mercado, cuota justa y los factores del modelo.</p></div>`;
      return;
    }
    const L = LEAGUES.find((l) => l.id === state.league), tm = T[state.league], H = tm[g.h], A = tm[g.a], a = analyze(state.league, g);
    const nfl = state.league === "nfl";
    const flat = a.markets.flatMap((m) => m.rows.map(([n, p]) => ({ g: m.g, n, p })));
    if (!state.market || !flat.some((r) => r.g + r.n === state.market)) state.market = flat[0].g + flat[0].n;
    pane.innerHTML = `
      <button class="btn btn-ghost sheet-close" data-close aria-label="Cerrar análisis">${icon("close")}</button>
      <div class="analysis" aria-live="polite">
        <div class="an-head">
          <div><p class="eyebrow">${L.name} · ${L.period}</p><p class="small secondary" style="margin:4px 0 0">${hour(g.t)} · ${g.v}</p></div>
        </div>
        <div class="an-match">
          <div class="an-team">${badge(state.league, g.h, 48)}<span class="n">${H[0]}</span><span class="c">LOCAL</span></div>
          <div class="an-score"><div class="caption muted">${g.fin ? "Final" : "Proyección"}</div><div class="numeric-hl">${g.fin ? `${g.fin[0]} – ${g.fin[1]}` : `${a.proj.h.toFixed(nfl ? 0 : 1)} – ${a.proj.a.toFixed(nfl ? 0 : 1)}`}</div>
            ${g.fin ? `<div class="caption muted">Proyección previa ${a.proj.h.toFixed(1)}–${a.proj.a.toFixed(1)}</div>` : `<div class="caption muted num">Total ${a.proj.total.toFixed(nfl ? 1 : 2)}</div>`}</div>
          <div class="an-team">${badge(state.league, g.a, 48)}<span class="n">${A[0]}</span><span class="c">VISITANTE</span></div>
        </div>
        ${g.fin ? `<p class="tag tag-info an-result"><span class="dot"></span>Análisis publicado antes del partido · sin cambios</p>` : ""}
        <table class="mtable" style="margin-top:var(--space-4)">
          <caption class="sr-only">Probabilidades por mercado. Selecciona una fila para comparar con tu cuota.</caption>
          <thead><tr><th>Mercado</th><th><span class="sr-only">Barra</span></th><th class="r">Prob.</th><th class="r">Cuota justa</th></tr></thead>
          ${a.markets.map((m) => `<tbody><tr class="group"><td colspan="4">${m.g}</td></tr>
            ${m.rows.map(([n, p]) => `<tr class="mrow" tabindex="0" role="button" aria-pressed="${state.market === m.g + n}" data-market="${m.g + n}"><td>${n}</td><td class="bar"><div class="pbar"><span style="width:${(p * 100).toFixed(1)}%"></span></div></td><td class="r num">${pct(p)}</td><td class="r num secondary">${fair(p)}</td></tr>`).join("")}</tbody>`).join("")}
        </table>
        <div class="panel compare" id="compare"></div>
        <div class="factors">
          <p class="eyebrow">Factores del modelo</p>
          <dl>${a.factors.map(([k, v, s]) => `<dt>${k}</dt><dd>${v}<small>${s}</small></dd>`).join("")}</dl>
        </div>
        <div class="an-foot">
          <span class="tag tag-model" style="justify-self:start">Modelo de referencia · en validación</span>
          <span>Datos: ${L.source} · actualizado ${UPDATED}. Análisis publicado el 7 nov 2026, 22:00.</span>
          <span>Estimación estadística, no garantiza resultados. <a href="landing.html#metodologia">Cómo calculamos</a></span>
        </div>
      </div>`;
    renderCompare(flat);
  }
  function renderCompare(flat) {
    const r = flat.find((x) => x.g + x.n === state.market);
    const box = $("#compare");
    const v = state.odds;
    box.innerHTML = `
      <label for="odds-in">Compara con tu cuota · <span class="secondary">${r.g}: ${r.n}</span></label>
      <div class="row"><input id="odds-in" inputmode="decimal" placeholder="2.10 o +110" value="${v}" aria-describedby="odds-help"><span id="odds-help" class="caption muted">Decimal o americana. No se guarda.</span></div>
      <div class="out" aria-live="polite">${(() => {
        const d = PL.parseOdds(v);
        const imp = d ? 1 / d : null;
        return `<div><span class="caption muted">Modelo</span><b>${pct(r.p)}</b></div>
          <div><span class="caption muted">Implícita en tu cuota</span><b>${imp ? pct(imp) : "—"}</b></div>
          <div><span class="caption muted">Diferencia</span><b>${imp ? ((r.p - imp) * 100 >= 0 ? "+" : "") + ((r.p - imp) * 100).toFixed(1) + " pp" : "—"}</b></div>`;
      })()}</div>`;
    $("#odds-in").addEventListener("input", (e) => { state.odds = e.target.value; const pos = e.target.selectionStart; renderCompare(flat); const i = $("#odds-in"); i.focus(); i.setSelectionRange(pos, pos); });
  }

  // ----- Abrir/cerrar en móvil o drawer -----
  const pane = () => $("#analysis");
  function isOverlay() { return LAYOUT === "b" || window.matchMedia("(max-width: 1199px)").matches; }
  let lastTrigger = null;
  function openPane() { if (!isOverlay()) return; pane().classList.add("open"); $("#scrim").classList.add("open"); pane().setAttribute("role", "dialog"); pane().setAttribute("aria-modal", "true"); pane().setAttribute("aria-label", "Análisis del partido"); setTimeout(() => $("[data-close]", pane())?.focus(), 50); }
  function closePane() { pane().classList.remove("open"); $("#scrim").classList.remove("open"); pane().removeAttribute("aria-modal"); if (isOverlay()) { state.game = LAYOUT === "b" ? null : state.game; } writeHash(); lastTrigger?.focus(); }

  function renderAll() { renderLeagues(); renderHead(); renderChips(); renderGames(); renderAnalysis(); }

  document.addEventListener("click", (e) => {
    const lb = e.target.closest("[data-league]");
    if (lb && !lb.disabled) { state.league = lb.dataset.league; state.game = null; state.day = "all"; state.market = null; writeHash(); renderAll(); closePane(); return; }
    const d = e.target.closest("[data-day]");
    if (d) { state.day = d.dataset.day; renderChips(); renderGames(); return; }
    const gb = e.target.closest("[data-game]");
    if (gb) { lastTrigger = gb; state.game = gb.dataset.game; state.market = null; writeHash(); renderGames(); renderAnalysis(); openPane(); return; }
    const m = e.target.closest("[data-market]");
    if (m) { state.market = m.dataset.market; renderAnalysis(); return; }
    if (e.target.closest("[data-close]") || e.target.id === "scrim") closePane();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pane().classList.contains("open")) closePane();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-market]")) { e.preventDefault(); e.target.click(); }
  });

  window.addEventListener("hashchange", () => { readHash(); renderAll(); });
  readHash();
  if (LAYOUT === "a" && !state.game && !window.matchMedia("(max-width: 1199px)").matches) state.game = G[state.league][0].id;
  renderAll();
  if (state.game && LAYOUT === "b") openPane();
})();
