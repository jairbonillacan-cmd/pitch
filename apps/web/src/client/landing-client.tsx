"use client";

import React, { useState } from "react";
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
  ProbSplit,
  MarketTable,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export interface LandingLeagueSummary {
  id: "liga-mx" | "premier-league" | "laliga" | "nfl";
  name: string;
  season: string;
  roundLabel: string;
  mascot: string;
  gameCount: number;
  active: boolean;
}

export function LandingClient({
  demoMatches,
  leagues,
}: {
  demoMatches: readonly [MatchAnalysis, ...MatchAnalysis[]];
  leagues: readonly LandingLeagueSummary[];
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");
  const [selectedDemoIdx, setSelectedDemoIdx] = useState(0);
  const [firstDemo] = demoMatches;
  const currentDemo = demoMatches[selectedDemoIdx] ?? firstDemo;
  const demoMarketGroups = currentDemo.marketGroups ?? [];
  const demoGroups =
    demoMarketGroups.length >= 3
      ? [demoMarketGroups[0]!, demoMarketGroups[2]!]
      : demoMarketGroups;
  const decimals = currentDemo.sport === "american-football" ? 0 : 1;
  const activeLeagues = leagues.filter((league) => league.active);
  const leagueNames = new Intl.ListFormat("es-MX").format(
    activeLeagues.map((league) => league.name),
  );
  const totalGames = activeLeagues.reduce(
    (sum, league) => sum + league.gameCount,
    0,
  );
  const featuredLeague = activeLeagues.find(
    (league) => league.id === firstDemo.league,
  );
  const exampleMarket = firstDemo.marketGroups
    ?.flatMap((group) => group.rows)
    .find((row) => row.label.includes("2.5"));
  const exampleLabel = exampleMarket?.label ?? firstDemo.outcomes[0]?.label;
  const exampleProbability = exampleMarket?.p ?? firstDemo.outcomes[0]?.probability;

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
                {leagueNames
                  ? `Consulta probabilidades para ${leagueNames} y compáralas con tus cuotas.`
                  : "Explora las probabilidades de un partido y aprende a compararlas con tus cuotas."}
              </p>
              <div className="ctas">
                <a className="btn btn-primary" href="#demo">
                  Probar un partido <Icon name="arrow" />
                </a>
                <a className="btn btn-ghost" href="#como">
                  Cómo funciona
                </a>
              </div>
              {totalGames > 0 && (
                <div className="week">
                  <span className="stack" aria-hidden="true">
                    {activeLeagues.map((league) => (
                      <LeagueBadge key={league.id} league={league.id} size={28} />
                    ))}
                  </span>
                  <span className="small secondary">
                    <b className="num">{totalGames}</b>{" "}
                    {totalGames === 1 ? "partido" : "partidos"} en {leagueNames}
                  </span>
                </div>
              )}
            </div>

            <section id="demo" tabIndex={-1} aria-labelledby="demo-title">
              <header className="demo-head">
                <div>
                  <p className="eyebrow">Demo sin código</p>
                  <h2 className="h3" id="demo-title">
                    Análisis de partido
                  </h2>
                </div>
                <img
                  className="demo-mascot"
                  src={getMascotPath("radar")}
                  alt=""
                  width={72}
                  height={72}
                />
              </header>
              {demoMatches.length > 1 && (
                <div
                  className="picks"
                  id="picks"
                  role="group"
                  aria-label="Elige un partido"
                >
                  {demoMatches.map((match, idx) => (
                    <button
                      key={match.id}
                      type="button"
                      className="pick"
                      aria-label={`${match.home.name} vs ${match.away.name}`}
                      aria-controls="dcard"
                      aria-pressed={idx === selectedDemoIdx}
                      onClick={() => setSelectedDemoIdx(idx)}
                    >
                      <TeamBadge league={match.league} slug={match.home.slug} size={24} />
                      <span>
                        {match.home.code ?? match.home.shortName} vs{" "}
                        {match.away.code ?? match.away.shortName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <article className="panel dcard" id="dcard" aria-live="polite">
                <div className="dmatch">
                  <div className="t">
                    <TeamBadge
                      league={currentDemo.league}
                      slug={currentDemo.home.slug}
                      size={36}
                    />
                    <span>{currentDemo.home.name}</span>
                  </div>
                  <div className="s">
                    {currentDemo.projection ? (
                      <>
                        <div className="caption muted">Proyección</div>
                        <div className="numeric-hl">
                          {currentDemo.projection.home.toFixed(decimals)} –{" "}
                          {currentDemo.projection.away.toFixed(decimals)}
                        </div>
                      </>
                    ) : (
                      <span className="caption muted">vs</span>
                    )}
                  </div>
                  <div className="t away">
                    <span>{currentDemo.away.name}</span>
                    <TeamBadge
                      league={currentDemo.league}
                      slug={currentDemo.away.slug}
                      size={36}
                    />
                  </div>
                </div>
                <MarketTable
                  groups={demoGroups}
                  outcomes={currentDemo.outcomes}
                  maxRowsPerGroup={3}
                />
                <p className="caption secondary demo-note">
                  <b>Cuota justa</b> · Cuota equivalente a la probabilidad del modelo.
                </p>
                <div className="demo-dates caption secondary">
                  {currentDemo.publicationLabel ? (
                    <>
                      <span>
                        <b>Publicación registrada</b> {currentDemo.publicationLabel} CDMX
                      </span>
                      {currentDemo.updatedAt && (
                        <span>
                          <b>Datos de la liga actualizados</b> {currentDemo.updatedAt} CDMX
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Ejemplo ilustrativo</span>
                  )}
                </div>
              </article>
            </section>
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
            <ol className="timeline" id="timeline">
              <li className="tl">
                <time>10:00</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Abres la jornada</b>
                  <p>Todos los partidos del día, ordenados por hora.</p>
                </div>
                <div className="panel mini">
                  {featuredLeague ? (
                    <>
                      <span className="caption muted">
                        {featuredLeague.name} · {featuredLeague.roundLabel}
                      </span>
                      <b>
                        {featuredLeague.gameCount}{" "}
                        {featuredLeague.gameCount === 1 ? "partido" : "partidos"}
                      </b>
                    </>
                  ) : (
                    <span className="caption muted">Jornadas de la beta</span>
                  )}
                </div>
              </li>

              <li className="tl">
                <time>12:30</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Comparas probabilidades</b>
                  <p>Ves quién llega como favorito en cada encuentro.</p>
                </div>
                <div className="panel mini">
                  {demoMatches.slice(0, 2).map((g) => {
                    const ps = g.outcomes.map((outcome) => outcome.probability);
                    const lbs = g.outcomes.map((outcome) => outcome.label);
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
                            {g.home.code ?? g.home.shortName} vs{" "}
                            {g.away.code ?? g.away.shortName}
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
                    {exampleLabel} · tu cuota 2.10
                  </span>
                  <span className="num">
                    Implica <b>{formatPercent(1 / 2.1, 1)}</b> · modelo{" "}
                    <b className="lead-txt">
                      {exampleProbability === undefined
                        ? "—"
                        : formatPercent(exampleProbability, 1)}
                    </b>
                  </span>
                </div>
              </li>

              <li className="tl">
                <time>20:10</time>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Vuelves al análisis</b>
                  <p>
                    Revisas la fecha de publicación registrada y la última
                    actualización de los datos de la liga.
                  </p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {firstDemo.home.shortName} vs {firstDemo.away.shortName}
                  </span>
                  <b>
                    {firstDemo.publicationLabel
                      ? `Publicación registrada · ${firstDemo.publicationLabel} CDMX`
                      : "Ejemplo ilustrativo"}
                  </b>
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
                {leagueNames
                  ? `${leagueNames} en la beta privada.`
                  : "Las ligas aparecerán aquí cuando estén disponibles en la beta."}
              </p>
            </div>
            <div className="leagues" id="leagues">
              {leagues.map((league) => {
                const Tile = league.active ? "a" : "div";
                return (
                  <Tile
                    key={league.id}
                    className="panel ltile"
                    href={league.active ? `/app/${league.id}` : undefined}
                  >
                    <div className="top-row">
                      <LeagueBadge league={league.id} size={36} />
                      <div>
                        <div className="name">{league.name}</div>
                        <div className="caption muted">{league.season}</div>
                        {league.active && (
                          <div className="caption muted">
                            {league.roundLabel} · {league.gameCount}{" "}
                            {league.gameCount === 1 ? "partido" : "partidos"}
                          </div>
                        )}
                      </div>
                    </div>
                    <img
                      className="pic"
                      src={getMascotPath(league.mascot)}
                      alt=""
                      width={230}
                      height={230}
                      loading="lazy"
                    />
                    <div className="meta">
                      {league.active ? (
                        <>
                          <span className="tag">Requiere código</span>
                          <span className="go" aria-hidden="true">
                            <Icon name="arrow" />
                          </span>
                        </>
                      ) : (
                        <span className="tag">Próximamente</span>
                      )}
                    </div>
                  </Tile>
                );
              })}

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
                rendimiento reciente de los equipos. Puedes consultar cuándo se
                publicó el análisis y cuándo se actualizaron los datos de la liga.
              </p>
            </div>
            <div className="model">
              <div className="panel">
                <div className="k">13</div>
                <p>mercados por partido de fútbol</p>
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
                <b>Fechas visibles</b>
                <span>
                  Mostramos por separado la fecha del análisis y la actualización de los datos.
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
                  <span>Entrar con código</span>
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
