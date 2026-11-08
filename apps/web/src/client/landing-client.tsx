"use client";

import React, { useState, useEffect, useRef } from "react";
import type { MatchAnalysis } from "@pitchlab/contracts";
import { formatPercent } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  FloatingNav,
  PublicFooter,
  PinPad,
  Icon,
  TeamBadge,
  LeagueBadge,
  PBar,
  ProbSplit,
  MarketTable,
  leadIndex,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export interface LandingLeagueSummary {
  id: "liga-mx" | "premier-league" | "nfl";
  name: string;
  season: string;
  roundLabel: string;
  mascot: string;
  gameCount: number;
  active: boolean;
}

export function LandingClient({
  featuredMatch,
  demoMatches,
  leagues,
  totalGames,
}: {
  featuredMatch: MatchAnalysis;
  demoMatches: readonly MatchAnalysis[];
  leagues: readonly LandingLeagueSummary[];
  totalGames: number;
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");
  const [selectedDemoIdx, setSelectedDemoIdx] = useState(0);
  const [calculatingDemo, setCalculatingDemo] = useState(false);
  const calcTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (calcTimerRef.current !== null) {
        window.clearTimeout(calcTimerRef.current);
      }
    };
  }, []);

  const handleSelectDemo = (idx: number) => {
    if (idx === selectedDemoIdx) return;
    if (calcTimerRef.current !== null) {
      window.clearTimeout(calcTimerRef.current);
    }
    setSelectedDemoIdx(idx);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      setCalculatingDemo(true);
      calcTimerRef.current = window.setTimeout(() => {
        setCalculatingDemo(false);
      }, 650);
    }
  };

  const currentDemo = demoMatches[selectedDemoIdx] ?? featuredMatch;
  const nfDemo = currentDemo.league === "nfl";
  const demoProj = currentDemo.projection ?? {
    home: nfDemo ? 24 : 1.6,
    away: nfDemo ? 21 : 1.2,
    total: nfDemo ? 45 : 2.8,
  };
  const demoGroups =
    currentDemo.marketGroups.length >= 3
      ? [currentDemo.marketGroups[0]!, currentDemo.marketGroups[2]!]
      : currentDemo.marketGroups;

  const heroRows =
    featuredMatch.marketGroups[0]?.rows ??
    featuredMatch.outcomes.map((o) => ({
      market: "h2h" as const,
      selection: o.key,
      label: o.label,
      p: o.probability,
      fairOdds: o.fairOdds?.decimal ?? 2,
    }));
  const heroLeadIdx = leadIndex(heroRows.map((r) => r.p));

  const totalsGroup = featuredMatch.marketGroups.find((g) =>
    g.group.toLowerCase().includes("goles") || g.group.toLowerCase().includes("total"),
  );
  const over25Row =
    totalsGroup?.rows.find((r) => r.label.includes("2.5")) ??
    totalsGroup?.rows[0] ??
    heroRows[heroLeadIdx];

  const m1 = demoMatches[0] ?? featuredMatch;
  const m2 = demoMatches[1] ?? featuredMatch;

  return (
    <>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="landing" />

      <main id="main">
        <section className="hero">
          <div className="bg fieldgrid" aria-hidden="true" />
          <svg
            className="traj"
            viewBox="0 0 600 500"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 470 C 160 420, 200 300, 300 260 S 470 210, 580 40"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="6 8"
            />
          </svg>
          <div className="wrap">
            <div>
              <span className="status tag tag-ok">
                <span className="dot" />
                Beta cerrada · acceso con código
              </span>
              <h1 className="h-display">
                Lee el juego
                <br />
                <span className="accent">con datos.</span>
              </h1>
              <p className="lead">
                Probabilidades para cada partido de Liga MX, Premier League y
                NFL, calculadas por nuestro propio modelo y actualizadas cada
                jornada.
              </p>
              <div className="ctas">
                <button
                  className="btn btn-primary"
                  type="button"
                  data-open-pin=""
                  onClick={openPin}
                >
                  <span>Entrar a la beta</span>
                  <Icon name="arrow" />
                </button>
                <a className="btn btn-ghost" href="#como">
                  Cómo funciona
                </a>
              </div>
              <div className="week">
                <span className="stack" id="stack" aria-hidden="true">
                  <LeagueBadge league="liga-mx" size={28} />
                  <LeagueBadge league="premier-league" size={28} />
                  <LeagueBadge league="nfl" size={28} />
                </span>
                <span className="small secondary">
                  <b
                    className="num"
                    id="nGames"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {totalGames}
                  </b>{" "}
                  partidos analizados esta semana
                </span>
              </div>
            </div>

            <div className="stage" aria-hidden="true">
              <div className="mascot">
                <img
                  src={getMascotPath("radar")}
                  alt=""
                  width={500}
                  height={500}
                />
              </div>

              <div className="panel float-chip" id="chip">
                <Icon name="probability" />
                <span className="secondary">
                  {over25Row?.label ?? "Más de 2.5"}
                </span>
                <b className="num">{formatPercent(over25Row?.p ?? 0.52, 1)}</b>
              </div>

              <div className="panel float-card" id="fcard">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <TeamBadge
                    league={featuredMatch.league}
                    slug={featuredMatch.home.slug}
                    size={22}
                  />
                  <b className="small">
                    {featuredMatch.home.name} vs {featuredMatch.away.name}
                  </b>
                  <span
                    className="tag tag-model"
                    style={{ marginLeft: "auto" }}
                  >
                    Beta cerrada
                  </span>
                </div>
                {heroRows.map((r, idx) => {
                  const isLead = idx === heroLeadIdx;
                  return (
                    <div key={r.selection} className="row">
                      <span>
                        {r.label}
                        {isLead ? <span className="fav">Favorito</span> : null}
                      </span>
                      <PBar p={r.p} lead={isLead} />
                      <b className={`pv ${isLead ? "lead-txt" : ""}`.trim()}>
                        {formatPercent(r.p, 1)}
                      </b>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="como">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">El problema</p>
              <h2 className="h1">Deja de decidir con capturas de grupo.</h2>
              <p>
                El «pick seguro» de alguien, una cuota sin hora y cinco pestañas
                abiertas. Así no se lee un partido.
              </p>
            </div>
            <div className="vs">
              <div>
                <p className="eyebrow label">Sin PitchLab</p>
                <div
                  className="panel chat"
                  aria-label="Ejemplo de chat de grupo"
                >
                  <div className="grp">
                    <span className="av">FC</span>
                    <div>
                      <b className="small">Grupo · Fut del sábado</b>
                      <div className="caption muted">43 mensajes sin leer</div>
                    </div>
                  </div>
                  <div className="bubble">
                    PICK SEGURO: América gana y más de 3.5 🔒
                    <small>Beto · 9:41</small>
                  </div>
                  <div className="bubble file">
                    <span className="tag">IMG</span>
                    captura_cuotas_FINAL2.jpg
                  </div>
                  <div className="bubble me">
                    ¿esa cuota de cuándo es?
                    <small>Tú · 9:52</small>
                  </div>
                  <div className="bubble">
                    de ayer creo 🤷
                    <small>Beto · 10:07</small>
                  </div>
                  <p className="q">Nadie sabe de dónde salió el número.</p>
                </div>
              </div>

              <div>
                <p className="eyebrow label">
                  Con PitchLab{" "}
                  <span className="tag tag-model">
                    <span className="dot" />
                    Beta cerrada
                  </span>
                </p>

                <div
                  className="picks"
                  id="picks"
                  role="group"
                  aria-label="Partidos de la jornada"
                >
                  {demoMatches.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      className="pick"
                      aria-pressed={idx === selectedDemoIdx}
                      onClick={() => handleSelectDemo(idx)}
                    >
                      <TeamBadge
                        league={m.league}
                        slug={m.home.slug}
                        size={24}
                      />
                      <span>
                        {m.home.code} vs {m.away.code}
                      </span>
                    </button>
                  ))}
                </div>

                <article
                  className="panel dcard"
                  id="dcard"
                  aria-live="polite"
                >
                  <div className="dmatch">
                    <div className="t">
                      <TeamBadge
                        league={currentDemo.league}
                        slug={currentDemo.home.slug}
                        size={40}
                      />
                      <span>{currentDemo.home.name}</span>
                    </div>
                    <div className="s">
                      <div className="caption muted">Proyección</div>
                      <div
                        className="numeric-hl"
                        style={{ fontSize: "1.75rem", lineHeight: "2rem" }}
                      >
                        {demoProj.home.toFixed(nfDemo ? 0 : 1)} –{" "}
                        {demoProj.away.toFixed(nfDemo ? 0 : 1)}
                      </div>
                    </div>
                    <div className="t away">
                      <span>{currentDemo.away.name}</span>
                      <TeamBadge
                        league={currentDemo.league}
                        slug={currentDemo.away.slug}
                        size={40}
                      />
                    </div>
                  </div>

                  {calculatingDemo && currentDemo.steps.length > 0 ? (
                    <ul className="calc-mini">
                      {currentDemo.steps.slice(0, 5).map((step, k) => (
                        <li
                          key={k}
                          style={{ animationDelay: `${k * 110}ms` }}
                        >
                          <Icon name="check" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <MarketTable
                        groups={demoGroups}
                        outcomes={currentDemo.outcomes}
                        maxRowsPerGroup={3}
                        style={{ marginTop: "var(--space-4)" }}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "var(--space-4)",
                        }}
                      >
                        <span className="tag tag-model">
                          Modelo PitchLab · en validación
                        </span>
                        <span className="fresh">
                          <span className="dot" />
                          Corte {currentDemo.updatedAt}
                        </span>
                      </div>
                    </>
                  )}
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">Un sábado cualquiera</p>
              <h2 className="h1">Así se usa PitchLab.</h2>
              <p>
                De la jornada al silbatazo final, con lo que ya está en la beta.
              </p>
            </div>
            <ol className="timeline" id="timeline">
              <li className="tl">
                <time>10:00</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Abres la jornada</b>
                  <p>Todos los partidos del día, ordenados por hora.</p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {featuredMatch.leagueLabel} · {featuredMatch.round}
                  </span>
                  <b>{totalGames} partidos · jornada activa</b>
                </div>
              </li>

              <li className="tl">
                <time>12:30</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Comparas dos partidos</b>
                  <p>
                    Quién llega como favorito, sin abrir otra pestaña.
                  </p>
                </div>
                <div className="panel mini">
                  {[m1, m2].map((g) => {
                    const isNf = g.league === "nfl";
                    const ps = isNf
                      ? [g.x12[0], g.x12[2]]
                      : [g.x12[0], g.x12[1], g.x12[2]];
                    const lbs = isNf
                      ? [g.home.name, g.away.name]
                      : [g.home.name, "Empate", g.away.name];
                    return (
                      <div key={g.id}>
                        <div
                          className="caption"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            {g.home.code} vs {g.away.code}
                          </span>
                          <span className="muted num">
                            {ps.map((p) => Math.round(p * 100)).join(" · ")}
                          </span>
                        </div>
                        <ProbSplit probabilities={ps} labels={lbs} />
                      </div>
                    );
                  })}
                </div>
              </li>

              <li className="tl">
                <time>17:55</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Revisas tu cuota</b>
                  <p>
                    Escribes la cuota de tu casa y ves la diferencia contra el
                    modelo.
                  </p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {over25Row?.label ?? "Más de 2.5"} · tu cuota 2.10
                  </span>
                  <span className="num">
                    Implica <b>{formatPercent(1 / 2.1, 1)}</b> · modelo{" "}
                    <b className="lead-txt">
                      {formatPercent(over25Row?.p ?? 0.52, 1)}
                    </b>
                  </span>
                </div>
              </li>

              <li className="tl">
                <time>20:10</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Termina el partido</b>
                  <p>
                    El análisis sigue como estaba antes del silbatazo. Nada se
                    edita.
                  </p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {featuredMatch.home.shortName} vs{" "}
                    {featuredMatch.away.shortName} · Corte íntegro
                  </span>
                  <span
                    className="tag tag-info"
                    style={{ justifySelf: "start" }}
                  >
                    <span className="dot" />
                    Publicado antes del partido
                  </span>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="block" id="ligas">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">Ligas</p>
              <h2 className="h1">Escoge tu liga.</h2>
              <p>
                Empezamos con tres. Más deportes cuando los números estén a la
                altura.
              </p>
            </div>
            <div className="leagues" id="leagues">
              {leagues.map((L) => (
                <a
                  key={L.id}
                  className="panel ltile"
                  href={L.active ? `/app/${L.id}` : "/login#beta"}
                >
                  <div className="top-row">
                    <LeagueBadge league={L.id} size={36} />
                    <div>
                      <div className="name">{L.name}</div>
                      <div className="caption muted">
                        {L.season} · {L.roundLabel}
                      </div>
                    </div>
                  </div>
                  <img
                    className="pic"
                    src={getMascotPath(L.mascot)}
                    alt=""
                    width={230}
                    height={230}
                    loading="lazy"
                  />
                  <div className="meta">
                    {L.active ? (
                      <span className="small secondary">
                        <b
                          className="num"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {L.gameCount}
                        </b>{" "}
                        partidos
                      </span>
                    ) : (
                      <span className="tag">Pronto</span>
                    )}
                    <span className="go" aria-hidden="true">
                      <Icon name="arrow" />
                    </span>
                  </div>
                </a>
              ))}

              <div className="soon">
                <div className="panel">
                  <img
                    src={getMascotPath("nhl")}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                  />
                  <LeagueBadge league="nhl" size={28} />
                  <span>NHL</span>
                  <span className="tag">Pronto</span>
                </div>
                <div className="panel">
                  <img
                    src={getMascotPath("mlb")}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                  />
                  <LeagueBadge league="mlb" size={28} />
                  <span>MLB</span>
                  <span className="tag">Pronto</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="modelo">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">El modelo</p>
              <h2 className="h1">Modelo propio. Números revisables.</h2>
              <p>
                Un modelo estadístico de PitchLab estima cada mercado con el
                rendimiento reciente de los equipos. Cada análisis se guarda
                antes del partido para medir qué tan bien le atina.
              </p>
            </div>
            <div className="model">
              <div className="panel">
                <div className="k">13</div>
                <p>mercados por partido de fútbol</p>
              </div>
              <div className="panel">
                <div className="k">0</div>
                <p>análisis editados después del partido</p>
              </div>
              <div className="panel">
                <div className="k">Pronto</div>
                <p>calibración pública por liga y temporada</p>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="reglas">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">Nuestro compromiso</p>
              <h2 className="h1">Claros desde el inicio.</h2>
            </div>
            <ul className="rules">
              <li>
                <b>Información para decidir</b>
                <span>
                  Te damos probabilidades y contexto. La decisión siempre es
                  tuya.
                </span>
              </li>
              <li>
                <b>No somos casa de apuestas</b>
                <span>No recibimos apuestas ni manejamos tu dinero.</span>
              </li>
              <li>
                <b>Historial íntegro</b>
                <span>
                  Cada análisis se publica antes del partido y queda tal cual.
                </span>
              </li>
              <li>
                <b>Solo mayores de 18</b>
                <span>Si apuestas, hazlo con moderación y por diversión.</span>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="panel closing">
              <div className="copy">
                <h2 className="h2">La jornada ya está calculada.</h2>
                <p
                  className="secondary"
                  style={{ margin: "var(--space-2) 0 var(--space-6)" }}
                >
                  Si tienes código de socio, entra ya.
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  data-open-pin=""
                  onClick={openPin}
                >
                  <span>Entrar a la beta</span>
                  <Icon name="arrow" />
                </button>
              </div>
              <div className="mascot">
                <img
                  src={getMascotPath("futbol")}
                  alt=""
                  width={240}
                  height={240}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter onOpenBetaPin={openPin} />
      <PinPad open={pinOpen} onClose={closePin} onSubmitPin={submitPin} />
    </>
  );
}
