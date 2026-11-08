"use client";

import React, { useState } from "react";
import type { MatchAnalysis } from "@pitchlab/contracts";
import {
  formatPercent,
  formatDecimal,
  formatAmerican,
  probabilityToFairOdds,
} from "@pitchlab/contracts";
import { getLeagueEmblemPath, getMascotPath } from "@pitchlab/sports-assets";
import {
  FloatingNav,
  PublicFooter,
  PinPad,
  Icon,
  TeamBadge,
  LeagueBadge,
  ProbSplit,
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

  const currentDemo = demoMatches[selectedDemoIdx] ?? featuredMatch;
  const maxOutcomeIdx = featuredMatch.outcomes.reduce(
    (best, o, idx) =>
      o.probability > (featuredMatch.outcomes[best]?.probability ?? 0) ? idx : best,
    0,
  );
  const topOutcome = featuredMatch.outcomes[maxOutcomeIdx];

  return (
    <>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav
        links={[
          { href: "#partidos", label: "Cómo funciona" },
          { href: "#ligas", label: "Ligas" },
          { href: "#metodo", label: "El modelo" },
          { href: "#reglas", label: "Compromiso" },
        ]}
        onOpenBetaPin={openPin}
        activeAuthRoute="landing"
      />

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
                Probabilidades para cada partido de Liga MX, Premier League y NFL,
                calculadas por nuestro propio modelo y actualizadas cada jornada.
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
                <a className="btn btn-ghost" href="#partidos">
                  Cómo funciona
                </a>
              </div>
              <div className="week">
                <span className="stack" aria-hidden="true">
                  <LeagueBadge league="liga-mx" size={22} />
                  <LeagueBadge league="premier-league" size={22} />
                  <LeagueBadge league="nfl" size={22} />
                </span>
                <span className="small secondary">
                  <b className="num" style={{ color: "var(--text-primary)" }}>
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

              <div className="panel float-chip">
                <Icon name="probability" />
                <span className="secondary">{topOutcome?.label ?? "Local"}</span>
                <b className="num">
                  {formatPercent(topOutcome?.probability ?? 0.5, 1)}
                </b>
              </div>

              <div className="panel float-card">
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
                    {featuredMatch.leagueLabel}
                  </span>
                </div>
                {featuredMatch.outcomes.map((o, idx) => (
                  <div key={o.key} className="row">
                    <span>
                      {o.label}
                      {idx === maxOutcomeIdx ? (
                        <span className="fav">Favorito</span>
                      ) : null}
                    </span>
                    <div className="prob-bar">
                      <span
                        className={`prob-seg ${idx === maxOutcomeIdx ? "home" : "draw"}`}
                        style={{
                          width: `${Math.round(o.probability * 100)}%`,
                        }}
                      />
                    </div>
                    <b
                      className={`num ${idx === maxOutcomeIdx ? "lead-txt" : ""}`}
                    >
                      {formatPercent(o.probability, 1)}
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="partidos">
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
                    PICK SEGURO: Local gana y más de 3.5
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
                    de ayer creo
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
                  role="group"
                  aria-label="Partidos de la jornada"
                >
                  {demoMatches.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      className="pick"
                      aria-pressed={idx === selectedDemoIdx}
                      onClick={() => setSelectedDemoIdx(idx)}
                    >
                      <TeamBadge
                        league={m.league}
                        slug={m.home.slug}
                        size={22}
                      />
                      <span>
                        {m.home.shortName} vs {m.away.shortName}
                      </span>
                    </button>
                  ))}
                </div>

                <article className="panel dcard" aria-live="polite">
                  <div className="dmatch">
                    <div className="t">
                      <TeamBadge
                        league={currentDemo.league}
                        slug={currentDemo.home.slug}
                        size={28}
                      />
                      <div>
                        <div>{currentDemo.home.name}</div>
                        <div className="caption muted">
                          {currentDemo.home.record}
                        </div>
                      </div>
                    </div>
                    <div className="s">
                      <div className="caption muted">
                        {currentDemo.leagueLabel}
                      </div>
                      <div className="num small">{currentDemo.round}</div>
                    </div>
                    <div className="t away">
                      <div>
                        <div>{currentDemo.away.name}</div>
                        <div className="caption muted">
                          {currentDemo.away.record}
                        </div>
                      </div>
                      <TeamBadge
                        league={currentDemo.league}
                        slug={currentDemo.away.slug}
                        size={28}
                      />
                    </div>
                  </div>

                  <ProbSplit outcomes={currentDemo.outcomes} />

                  <table className="market-table">
                    <thead>
                      <tr>
                        <th>Opción</th>
                        <th>Probabilidad</th>
                        <th>Momio justo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDemo.outcomes.map((o) => {
                        const fair =
                          o.fairOdds ?? probabilityToFairOdds(o.probability);
                        return (
                          <tr key={o.key}>
                            <td>
                              <strong>{o.label}</strong>
                            </td>
                            <td className="num">
                              {formatPercent(o.probability, 1)}
                            </td>
                            <td className="num">
                              {formatDecimal(fair.decimal)} (
                              {formatAmerican(fair.american)})
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span className="tag tag-model">
                      Modelo estadístico · {currentDemo.venue}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={openPin}
                    >
                      <span>Ver jornada completa</span>
                      <Icon name="arrow" />
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="como">
          <div className="wrap">
            <div className="shead">
              <p className="eyebrow">Un sábado cualquiera</p>
              <h2 className="h1">Así se usa PitchLab.</h2>
              <p>
                De la jornada al silbatazo final, con lo que ya está en la beta.
              </p>
            </div>
            <ol className="timeline">
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
                  <b>{totalGames} partidos analizados esta semana</b>
                </div>
              </li>
              <li className="tl">
                <time>12:30</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Comparas dos partidos</b>
                  <p>
                    Quién llega como favorito y su momio justo, sin abrir otra
                    pestaña.
                  </p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {featuredMatch.home.name} vs {featuredMatch.away.name}
                  </span>
                  <b className="num">
                    {featuredMatch.outcomes
                      .map((o) => `${o.label} ${formatPercent(o.probability, 0)}`)
                      .join(" · ")}
                  </b>
                </div>
              </li>
              <li className="tl">
                <time>17:55</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Revisas el momio justo</b>
                  <p>
                    Comparas la probabilidad implícita contra lo que estima el
                    modelo.
                  </p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    Momio justo sin margen de casa
                  </span>
                  <span className="num">
                    Favorito:{" "}
                    <b className="lead-txt">
                      {formatPercent(topOutcome?.probability ?? 0.5, 1)}
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
                    Traza íntegra pre-partido
                  </span>
                  <span
                    className="tag tag-info"
                    style={{ justifySelf: "start" }}
                  >
                    <span className="dot" />
                    Corte verificado antes del inicio
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
            <div className="leagues">
              {leagues.map((L) => (
                <a
                  key={L.id}
                  className="panel ltile"
                  href={L.active ? `/app/${L.id}` : "/login"}
                >
                  <div className="top-row">
                    <span
                      className="crest"
                      style={{ width: 42, height: 42 }}
                      aria-hidden="true"
                    >
                      <img
                        src={getLeagueEmblemPath(L.id)}
                        alt=""
                        width={30}
                        height={30}
                        loading="lazy"
                      />
                    </span>
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
                    width={220}
                    height={220}
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
                  <Icon name="hockey" />
                  <span>NHL</span>
                  <span className="tag">Pronto</span>
                </div>
                <div className="panel">
                  <Icon name="baseball" />
                  <span>MLB</span>
                  <span className="tag">Pronto</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="metodo">
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

        <section className="block">
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
