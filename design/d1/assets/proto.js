/* PitchLab · D1 · datos de EJEMPLO, cálculo ilustrativo, tema y movimiento.
   Nada de esto es un dato real: los partidos, tasas y fechas son representativos.
   En la implementación los datos vienen de los snapshots (docs/product/PRE_MVP.md). */
(function () {
  const BRAND = "../../pitchlab-brand";
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Tema (oscuro por defecto según la marca; claro opcional) ----------
  const Theme = {
    get: () => document.documentElement.dataset.theme || "dark",
    set(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("pl-theme", t); } catch (e) {} document.querySelectorAll("[data-logo]").forEach((img) => { img.src = `${BRAND}/logos/pitchlab-${img.dataset.logo}-${t === "light" ? "light" : "dark"}.svg`; }); },
    toggle() { Theme.set(Theme.get() === "light" ? "dark" : "light"); },
  };

  // ---------- Iconos oficiales (pitchlab-brand/visuals/icons) + genéricos Lucide (ADR-016) ----------
  const P = {
    games: '<path d="M4 7H20V19H4ZM8 4V10M16 4V10M4 12H20"/>',
    info: '<path d="M12 3A9 9 0 1 1 11.99 3ZM12 11V17M12 7V8"/>',
    close: '<path d="M6 6L18 18M18 6L6 18"/>',
    trend: '<path d="M4 19V5M4 19H20M7 15L11 11L15 13L20 6"/>',
    panel: '<path d="M3 3H21V21H3ZM9 3V21"/>',
    soccer: '<circle cx="12" cy="12" r="8.5"/><path d="m12 8 3.8 2.8-1.5 4.5H9.7l-1.5-4.5L12 8Zm0 0V3.5m3.8 7.3 4.3-1.4m-5.8 5.9 2.6 3.7m-7.2-3.7L7.1 19m1.1-8.2L3.9 9.4"/>',
    football: '<path d="M4 20C1.4 11 10.8 1.4 20 4c2.6 9.1-6.9 18.6-16 16ZM5 12.3l6.7 6.7m.6-14 6.7 6.7M9 15l6-6m-4.9 2.1 2.8 2.8m-.8-4.8 2.8 2.8"/>',
    hockey: '<path d="m5.5 4.5 8.8 13h4.4a2 2 0 0 1 2 2v1h-7.2L3.6 5.8l1.9-1.3Z"/><rect x="4" y="17.5" width="4.5" height="3" rx="1.2"/>',
    baseball: '<circle cx="12" cy="12" r="8.5"/><path d="M6.6 5.4a10.7 10.7 0 0 1 0 13.2m10.8-13.2a10.7 10.7 0 0 0 0 13.2M6.8 9.1l2.8-.7m-2.4 6.5 2.5.7m7.5-6.5-2.8-.7m2.4 6.5-2.5.7"/>',
    model: '<path d="m12 3.5 8 4.4v8.2l-8 4.4-8-4.4V7.9l8-4.4ZM4 7.9l8 4.5 8-4.5m-8 4.5v8.1m-4-14.8 8 4.4"/>',
    probability: '<path d="M11 4a8 8 0 1 0 9 9h-9V4Zm3 0v6h6a8 8 0 0 0-6-6Z"/>',
    sources: '<path d="M6 4h9l3 3v13H6V4Zm9 0v4h3M9 11h6m-6 4h6"/>',
    compare: '<path d="M4 8h15m-3.5-3.5L19 8l-3.5 3.5M20 16H5m3.5-3.5L5 16l3.5 3.5"/>',
    competition: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4ZM7.5 6H4v2.5a3 3 0 0 0 3 3h1m8.5-5.5H20v2.5a3 3 0 0 1-3 3h-1M12 13.5v5M8.5 20h7"/>',
    simulation: '<circle cx="6" cy="12" r="2"/><circle cx="18" cy="5.5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M8 12h8m-8 0c4.5 0 3.5-6.5 8-6.5M8 12c4.5 0 3.5 6.5 8 6.5"/>',
    radar: '<path d="M7.5 9.5 4 4c-1.1 3.7-.8 7.1.8 9.4C5.5 17.4 8.1 20 12 20s6.5-2.6 7.2-6.6C20.8 11.1 21.1 7.7 20 4l-3.5 5.5A7.5 7.5 0 0 0 12 8a7.5 7.5 0 0 0-4.5 1.5Z"/><path d="m7.5 13 1.7.5m5.6 0 1.7-.5m-6.1 3.2c1.1 1 2.1 1 3.2 0"/>',
    shield: '<path d="M12 3.5 19 6v6c0 4.2-3 7-7 8.5C8 19 5 16.2 5 12V6l7-2.5Z"/>',
    // Lucide (genéricos)
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  };
  function icon(name, cls = "icon", label) {
    const a = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
    return `<svg class="${cls} ${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a}>${P[name]}</svg>`;
  }
  const themeButton = () => `<button class="btn btn-ghost btn-icon theme-btn" type="button" data-theme-toggle aria-label="Cambiar tema claro u oscuro">${icon("moon")}${icon("sun")}</button>`;

  // ---------- Ligas ----------
  const LEAGUES = [
    { id: "liga-mx", sport: "soccer", name: "Liga MX", short: "Liga MX", period: "Jornada 16", season: "Apertura 2026", country: "México", assets: "football/liga-mx-apertura-2026", mascot: "liga-mx", status: "beta" },
    { id: "premier-league", sport: "soccer", name: "Premier League", short: "Premier", period: "Jornada 11", season: "2026/27", country: "Inglaterra", assets: "football/premier-league-2026-27", mascot: "premier-league", status: "ok" },
    { id: "nfl", sport: "football", name: "NFL", short: "NFL", period: "Semana 10", season: "2026", country: "EE. UU.", assets: "american-football/nfl-2026", mascot: "nfl", status: "ok" },
    { id: "nhl", sport: "hockey", name: "NHL", short: "NHL", period: "", season: "2026-27", country: "EE. UU. y Canadá", assets: null, mascot: "nhl", status: "soon" },
    { id: "mlb", sport: "baseball", name: "MLB", short: "MLB", period: "", season: "2027", country: "EE. UU.", assets: null, mascot: "mlb", status: "soon" },
  ];
  const SPORTS = { soccer: "Fútbol", football: "Fútbol americano", hockey: "Hockey", baseball: "Béisbol" };
  const mascot = (id) => `${BRAND}/mascot/web/${id}.webp`;

  // ---------- Equipos (tasas de EJEMPLO: a favor / en contra por partido, partidos jugados) ----------
  const T = {
    "liga-mx": {
      queretaro: ["Querétaro", "QRO", 1.29, 1.50, 15], puebla: ["Puebla", "PUE", 1.17, 1.53, 15],
      leon: ["León", "LEO", 1.40, 1.13, 15], chivas: ["Chivas", "GDL", 1.47, 1.07, 15],
      america: ["América", "AME", 1.93, 0.93, 15], "cruz-azul": ["Cruz Azul", "CAZ", 1.80, 0.87, 15],
      toluca: ["Toluca", "TOL", 2.07, 1.00, 15], "tigres-uanl": ["Tigres", "TIG", 1.73, 0.93, 15],
      monterrey: ["Monterrey", "MTY", 1.67, 1.20, 15], "pumas-unam": ["Pumas", "PUM", 1.27, 1.33, 15],
      atlante: ["Atlante", "ATE", 1.00, 1.60, 15], atlas: ["Atlas", "ATS", 1.07, 1.53, 15],
    },
    "premier-league": {
      arsenal: ["Arsenal", "ARS", 2.10, 0.70, 10], liverpool: ["Liverpool", "LIV", 2.20, 1.00, 10],
      "manchester-city": ["Manchester City", "MCI", 2.00, 0.90, 10], chelsea: ["Chelsea", "CHE", 1.70, 1.10, 10],
      everton: ["Everton", "EVE", 1.10, 1.30, 10], "coventry-city": ["Coventry City", "COV", 1.00, 1.70, 10],
      "crystal-palace": ["Crystal Palace", "CRY", 1.30, 1.20, 10], "newcastle-united": ["Newcastle", "NEW", 1.60, 1.20, 10],
      "tottenham-hotspur": ["Tottenham", "TOT", 1.50, 1.40, 10], sunderland: ["Sunderland", "SUN", 1.00, 1.50, 10],
    },
    nfl: {
      "kansas-city-chiefs": ["Kansas City", "KC", 26.4, 19.1, 9], "buffalo-bills": ["Buffalo", "BUF", 27.8, 20.3, 9],
      "detroit-lions": ["Detroit", "DET", 28.9, 21.7, 9], "green-bay-packers": ["Green Bay", "GB", 23.6, 20.8, 9],
      "philadelphia-eagles": ["Philadelphia", "PHI", 25.2, 18.4, 9], "dallas-cowboys": ["Dallas", "DAL", 22.1, 25.6, 9],
      "san-francisco-49ers": ["San Francisco", "SF", 24.0, 21.3, 9], "los-angeles-rams": ["LA Rams", "LAR", 21.9, 22.4, 9],
    },
  };

  // ---------- Partidos de EJEMPLO ----------
  const G = {
    "liga-mx": [
      { id: "mx1", h: "queretaro", a: "puebla", t: "2026-11-08T18:00", v: "La Corregidora" },
      { id: "mx2", h: "leon", a: "chivas", t: "2026-11-08T20:10", v: "Estadio León" },
      { id: "mx3", h: "america", a: "atlante", t: "2026-11-07T19:00", v: "Ciudad de los Deportes" },
      { id: "mx4", h: "toluca", a: "pumas-unam", t: "2026-11-07T17:00", v: "Nemesio Díez" },
      { id: "mx5", h: "monterrey", a: "tigres-uanl", t: "2026-11-07T21:05", v: "Estadio BBVA" },
      { id: "mx6", h: "atlas", a: "cruz-azul", t: "2026-11-06T21:00", v: "Estadio Jalisco", fin: [1, 2] },
    ],
    "premier-league": [
      { id: "pl1", h: "crystal-palace", a: "liverpool", t: "2026-11-08T08:00", v: "Selhurst Park" },
      { id: "pl2", h: "everton", a: "coventry-city", t: "2026-11-08T08:00", v: "Hill Dickinson Stadium" },
      { id: "pl3", h: "arsenal", a: "chelsea", t: "2026-11-08T10:30", v: "Emirates Stadium" },
      { id: "pl4", h: "manchester-city", a: "newcastle-united", t: "2026-11-09T09:00", v: "Etihad Stadium" },
      { id: "pl5", h: "tottenham-hotspur", a: "sunderland", t: "2026-11-09T11:30", v: "Tottenham Hotspur Stadium" },
    ],
    nfl: [
      { id: "nf1", h: "kansas-city-chiefs", a: "buffalo-bills", t: "2026-11-08T15:25", v: "Arrowhead Stadium" },
      { id: "nf2", h: "detroit-lions", a: "green-bay-packers", t: "2026-11-08T12:00", v: "Ford Field" },
      { id: "nf3", h: "philadelphia-eagles", a: "dallas-cowboys", t: "2026-11-08T19:20", v: "Lincoln Financial Field" },
      { id: "nf4", h: "los-angeles-rams", a: "san-francisco-49ers", t: "2026-11-09T19:15", v: "SoFi Stadium" },
    ],
  };

  // ---------- Cálculo ilustrativo del prototipo (no es el modelo de producción) ----------
  const fact = (n) => (n < 2 ? 1 : n * fact(n - 1));
  const pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / fact(k);
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  function soccer(league, g) {
    const L = LEAGUES.find((l) => l.id === league), tm = T[league], H = tm[g.h], A = tm[g.a];
    const avg = 1.35, hfa = 1.12, k = 6, rho = -0.08, N = 10;
    const sh = (x, n) => (x * n + avg * k) / (n + k);
    const lh = (sh(H[2], H[4]) * sh(A[3], A[4]) / avg) * hfa;
    const la = (sh(A[2], A[4]) * sh(H[3], H[4]) / avg) / hfa;
    const M = []; let tot = 0;
    for (let i = 0; i <= N; i++) { M[i] = []; for (let j = 0; j <= N; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lh * la * rho; else if (i === 0 && j === 1) tau = 1 + lh * rho; else if (i === 1 && j === 0) tau = 1 + la * rho; else if (i === 1 && j === 1) tau = 1 - rho;
      M[i][j] = pois(i, lh) * pois(j, la) * tau; tot += M[i][j]; } }
    let ph = 0, pd = 0, pa = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0, best = [0, 0, 0];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = M[i][j] / tot;
      if (p > best[2]) best = [i, j, p];
      if (i > j) ph += p; else if (i === j) pd += p; else pa += p;
      if (i + j > 1.5) o15 += p; if (i + j > 2.5) o25 += p; if (i + j > 3.5) o35 += p; if (i > 0 && j > 0) btts += p;
    }
    const markets = [
      { g: "Resultado", rows: [[`${H[0]} gana`, ph], ["Empate", pd], [`${A[0]} gana`, pa]] },
      { g: "Doble oportunidad", rows: [[`${H[0]} o empate`, ph + pd], [`${A[0]} o empate`, pa + pd], ["Sin empate", ph + pa]] },
      { g: "Goles totales", rows: [["Más de 1.5", o15], ["Más de 2.5", o25], ["Menos de 2.5", 1 - o25], ["Más de 3.5", o35]] },
      { g: "Ambos anotan", rows: [["Sí", btts], ["No", 1 - btts]] },
    ];
    return {
      proj: { h: lh, a: la, total: lh + la }, x12: [ph, pd, pa], markets, likely: best,
      steps: [
        `Sincronizando ${L.name} · corte ${UPDATED}`,
        `Fuerza de ataque y defensa · ${H[1]} ${H[2].toFixed(2)} / ${H[3].toFixed(2)} · ${A[1]} ${A[2].toFixed(2)} / ${A[3].toFixed(2)}`,
        `Ajuste por localía y tamaño de muestra (${H[4]} partidos)`,
        `Proyección de goles ${lh.toFixed(2)} – ${la.toFixed(2)}`,
        `Evaluando ${(N + 1) * (N + 1)} marcadores posibles`,
        `${markets.reduce((s, m) => s + m.rows.length, 0)} mercados listos · marcador más probable ${best[0]}–${best[1]}`,
      ],
      factors: [
        ["Ataque local", `${H[2].toFixed(2)} goles/partido`, `${H[4]} partidos · ajustado a ${sh(H[2], H[4]).toFixed(2)}`],
        ["Defensa visitante", `${A[3].toFixed(2)} recibidos/partido`, `ajustado a ${sh(A[3], A[4]).toFixed(2)}`],
        ["Ataque visitante", `${A[2].toFixed(2)} goles/partido`, `ajustado a ${sh(A[2], A[4]).toFixed(2)}`],
        ["Defensa local", `${H[3].toFixed(2)} recibidos/partido`, `ajustado a ${sh(H[3], H[4]).toFixed(2)}`],
        ["Localía", "Incluida", "Ajuste del modelo PitchLab"],
        ["Muestra", `${H[4]} y ${A[4]} partidos`, "Temporada actual"],
      ],
    };
  }
  function nfl(g) {
    const L = LEAGUES.find((l) => l.id === "nfl"), tm = T.nfl, H = tm[g.h], A = tm[g.a], hfa = 1.8;
    const ph_ = (H[2] + A[3]) / 2 + hfa / 2, pa_ = (A[2] + H[3]) / 2 - hfa / 2;
    const margin = ph_ - pa_, total = ph_ + pa_;
    const pH = Phi(margin / 13.4);
    const line = -Math.round(margin * 2) / 2;
    const cover = Phi((margin + line) / 13.4);
    const tline = Math.round(total * 2) / 2 + 0.5;
    const over = 1 - Phi((tline - total) / 13.3);
    const markets = [
      { g: "Ganador", rows: [[`${H[0]} gana`, pH], [`${A[0]} gana`, 1 - pH]] },
      { g: `Spread ${H[1]} ${line > 0 ? "+" : ""}${line.toFixed(1)}`, rows: [[`${H[1]} cubre`, cover], [`${A[1]} cubre`, 1 - cover]] },
      { g: `Total ${tline.toFixed(1)}`, rows: [["Más", over], ["Menos", 1 - over]] },
    ];
    return {
      proj: { h: ph_, a: pa_, total, margin }, x12: [pH, 0, 1 - pH], markets,
      steps: [
        `Sincronizando NFL · corte ${UPDATED}`,
        `Ofensiva y defensa · ${H[1]} ${H[2].toFixed(1)} / ${H[3].toFixed(1)} · ${A[1]} ${A[2].toFixed(1)} / ${A[3].toFixed(1)}`,
        `Ajuste por localía y tamaño de muestra (${H[4]} partidos)`,
        `Proyección ${ph_.toFixed(1)} – ${pa_.toFixed(1)} · margen ${margin > 0 ? "+" : ""}${margin.toFixed(1)}`,
        `Simulando escenarios de margen y total`,
        `${markets.reduce((s, m) => s + m.rows.length, 0)} mercados listos`,
      ],
      factors: [
        ["Ofensiva local", `${H[2].toFixed(1)} pts/partido`, `${H[4]} partidos`],
        ["Defensa visitante", `${A[3].toFixed(1)} pts permitidos`, `${A[4]} partidos`],
        ["Ofensiva visitante", `${A[2].toFixed(1)} pts/partido`, `${A[4]} partidos`],
        ["Defensa local", `${H[3].toFixed(1)} pts permitidos`, `${H[4]} partidos`],
        ["Localía", "Incluida", "Ajuste del modelo PitchLab"],
        ["Muestra", `${H[4]} y ${A[4]} partidos`, "Temporada actual"],
      ],
    };
  }
  const analyze = (league, g) => (league === "nfl" ? nfl(g) : soccer(league, g));

  // ---------- Formato es-MX ----------
  const UPDATED = "8 nov 2026, 07:40";
  const pct = (p) => (p * 100).toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
  const fair = (p) => (p > 0 ? (1 / p).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
  const dayKey = (iso) => new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const hour = (iso) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

  // ---------- Emblemas ----------
  function badge(league, teamId, size = 24, decorative = true) {
    const L = LEAGUES.find((l) => l.id === league), t = T[league] && T[league][teamId], name = t ? t[0] : teamId;
    if (L && L.assets) return `<span class="badge" style="width:${size}px;height:${size}px"><img src="${BRAND}/${L.assets}/svg/${teamId}.svg" width="${size}" height="${size}" alt="${decorative ? "" : name}" decoding="async"></span>`;
    return `<span class="badge badge-fallback" style="width:${size}px;height:${size}px" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${name}"`}>${icon("shield")}</span>`;
  }
  function leagueBadge(L, size = 24) {
    if (L.assets) return `<span class="badge" style="width:${size}px;height:${size}px"><img src="${BRAND}/${L.assets}/svg/${L.id}.svg" width="${size}" height="${size}" alt="" decoding="async"></span>`;
    return `<span class="badge badge-fallback" style="width:${size}px;height:${size}px" aria-hidden="true">${icon(L.sport)}</span>`;
  }

  // ---------- Barras de probabilidad (estilo PitchLab: corte a 45° y favorito en Pulso) ----------
  const leadIndex = (ps) => ps.reduce((bi, p, i) => (p > ps[bi] ? i : bi), 0);
  const probBar = (p, lead, grow = true) => `<div class="pbar ${lead ? "lead" : ""} ${grow ? "grow" : ""}" style="--w:${(p * 100).toFixed(1)}%"><span></span></div>`;
  function split(ps, labels) {
    const li = leadIndex(ps);
    return `<div class="psplit" role="img" aria-label="${ps.map((p, i) => `${labels[i]} ${pct(p)}`).join(", ")}">${ps.map((p, i) => `<span class="${i === li ? "lead" : ""}" style="flex:${p}"></span>`).join("")}</div>`;
  }

  // ---------- Cuota del usuario ----------
  function parseOdds(s) {
    s = String(s).trim().replace(",", ".");
    if (!s) return null;
    const v = Number(s);
    if (!isFinite(v)) return null;
    if (/^[+-]/.test(s) && Math.abs(v) >= 100) return v > 0 ? 1 + v / 100 : 1 + 100 / Math.abs(v);
    return v > 1 ? v : null;
  }

  // ---------- Movimiento ----------
  function reveal(root = document) {
    const els = root.querySelectorAll(".reveal:not(.in)");
    if (reduced() || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }
  function countUp(el, to, fmt, ms = 650) {
    if (reduced()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function growBars(root) {
    root.querySelectorAll(".pbar.grow").forEach((b, i) => setTimeout(() => b.classList.remove("grow"), reduced() ? 0 : 40 + i * 25));
    root.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count), (v) => pct(v)));
  }

  // ---------- Arranque común ----------
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) Theme.toggle(); });
  document.addEventListener("DOMContentLoaded", () => {
    Theme.set(Theme.get());
    document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = icon(el.dataset.icon, el.dataset.cls || "icon")));
    document.querySelectorAll("[data-theme-slot]").forEach((el) => (el.outerHTML = themeButton()));
    reveal();
  });

  window.PL = { leadIndex, probBar, split, BRAND, reduced, Theme, icon, themeButton, LEAGUES, SPORTS, mascot, T, G, analyze, pct, fair, dayKey, hour, badge, leagueBadge, parseOdds, reveal, countUp, growBars, UPDATED };
})();
