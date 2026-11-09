"use client";

import React, { useEffect, useRef, useState } from "react";
import type { LeagueId, MatchAnalysis } from "@pitchlab/contracts";
import { formatPercent } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  Badge,
  Button,
  FloatingNav,
  PublicFooter,
  PinPad,
  Icon,
  TeamBadge,
  LeagueBadge,
  ProbSplit,
  MarketTable,
  ToggleGroup,
  ToggleGroupItem,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export interface LandingLeagueSummary {
  id: LeagueId;
  name: string;
  season: string;
  roundLabel: string;
  mascot: string;
  gameCount: number;
  active: boolean;
  /** Líder actual de la tabla, si la liga publica posiciones. */
  leader?: string;
}

export type LandingMatch = Pick<
  MatchAnalysis,
  "id" | "league" | "sport" | "home" | "away" | "projection" | "outcomes" |
  "marketGroups" | "publicationLabel" | "updatedAt"
>;

export function LandingClient({
  demoMatches,
  leagues,
}: {
  demoMatches: readonly [LandingMatch, ...LandingMatch[]];
  leagues: readonly LandingLeagueSummary[];
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");
  const [selectedDemoIdx, setSelectedDemoIdx] = useState(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mainRef.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (!isIntersecting) continue;
          target.setAttribute("data-revealed", "");
          observer.unobserve(target);
        }
      },
      { rootMargin: "0px 0px -32px 0px" },
    );

    for (const section of mainRef.current.querySelectorAll("[data-landing-reveal]")) {
      observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  const [firstDemo] = demoMatches;
  const currentDemo = demoMatches[selectedDemoIdx] ?? firstDemo;
  const demoMarketGroups = currentDemo.marketGroups ?? [];
  const demoGroups =
    demoMarketGroups.length >= 3
      ? [demoMarketGroups[0]!, demoMarketGroups[2]!]
      : demoMarketGroups;
  const decimals = currentDemo.sport === "american-football" ? 0 : 1;
  const activeLeagues = leagues.filter((league) => league.active);
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

      <main id="main" className="landing-main" ref={mainRef}>
        <div className="landing-strip">
          <span>Beta privada</span>
          <span className="landing-strip-diamond" aria-hidden="true" />
          <span>Acceso con código</span>
        </div>
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
          <div className="wrap hero-stage">
            <div className="hero-copy">
              <h1 className="h-display">
                Probabilidades
                <br />
                <span className="accent">deportivas</span>
              </h1>
              <p className="lead">Consulta un partido y compara sus probabilidades con tus cuotas.</p>
              <div className="ctas">
                <Button
                  appearance="d1"
                  size="lg"
                  shape="pill"
                  render={<a href="#demo" role="link" />}
                  nativeButton={false}
                >
                  Ver un partido{" "}
                  <span data-icon="arrow">
                    <Icon name="arrow" className="icon size-5" />
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  appearance="d1"
                  size="lg"
                  shape="pill"
                  render={<a href="#como" role="link" />}
                  nativeButton={false}
                >
                  Cómo funciona
                </Button>
              </div>
              {activeLeagues.length > 0 && (
                <div className="week">
                  <span className="stack" aria-hidden="true">
                    {activeLeagues.map((league) => (
                      <LeagueBadge key={league.id} league={league.id} size={28} />
                    ))}
                  </span>
                </div>
              )}
              <p className="hero-proof">
                <a href="#modelos">
                  <strong>Modelos propios</strong> · Más de 69 mil partidos en el historial
                </a>
              </p>
            </div>

            {demoMatches.slice(0, 2).map((match, idx) => (
              <div
                key={match.id}
                className={idx === 0 ? "hero-preview hero-preview-left" : "hero-preview hero-preview-right"}
                aria-hidden="true"
              >
                <div className="hero-preview-card panel">
                  <header>
                    <LeagueBadge league={match.league} size={24} />
                    <span className="caption secondary">Radar de partido</span>
                    <span className="hero-preview-signal" />
                  </header>
                  <div className="hero-preview-match">
                    <div>
                      <TeamBadge league={match.league} slug={match.home.slug} size={40} />
                      <b>{match.home.code ?? match.home.shortName}</b>
                    </div>
                    <span className="caption muted">vs</span>
                    <div>
                      <TeamBadge league={match.league} slug={match.away.slug} size={40} />
                      <b>{match.away.code ?? match.away.shortName}</b>
                    </div>
                  </div>
                  <ProbSplit outcomes={match.outcomes} />
                  <div className="hero-preview-metrics">
                    {match.outcomes.map((outcome) => (
                      <span key={outcome.key}>
                        <small className="muted">{outcome.label}</small>
                        <b className="num">{formatPercent(outcome.probability, 1)}</b>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="demo" className="demo-band" tabIndex={-1} aria-labelledby="demo-title">
          <div className="wrap demo-band-grid">
            <header className="demo-head" data-landing-reveal>
              <div>
                <h2 className="h1" id="demo-title">Análisis de partido</h2>
              </div>
              <img
                className="demo-mascot"
                src={getMascotPath("radar")}
                alt=""
                width={144}
                height={144}
              />
            </header>
            <div className="demo-stage" data-landing-reveal>
              {demoMatches.length > 1 && (
                <ToggleGroup
                  className="picks w-full flex-wrap items-stretch"
                  id="picks"
                  aria-label="Elige un partido"
                  value={[String(selectedDemoIdx)]}
                  onValueChange={([next]) => {
                    if (next !== undefined) setSelectedDemoIdx(Number(next));
                  }}
                >
                  {demoMatches.map((match, idx) => (
                    <ToggleGroupItem
                      key={match.id}
                      type="button"
                      variant="match"
                      value={String(idx)}
                      className="pick max-[600px]:flex-1 max-[600px]:px-2 max-[600px]:[&>.badge]:hidden"
                      aria-label={`${match.home.name} vs ${match.away.name}`}
                      aria-controls="dcard"
                    >
                      <TeamBadge league={match.league} slug={match.home.slug} size={24} />
                      <span>
                        {match.home.code ?? match.home.shortName} vs{" "}
                        {match.away.code ?? match.away.shortName}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              <article className="panel dcard" id="dcard" aria-live="polite">
                <div className="demo-result" key={currentDemo.id}>
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
                    <b>Cuota justa</b> · Cuota equivalente a la probabilidad.
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
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="block model-section" id="modelos" aria-labelledby="modelos-title">
          <div className="wrap">
            <div className="model-stage">
              <div className="model-field fieldgrid" aria-hidden="true" />
              <div className="model-copy" data-landing-reveal>
                <h2 className="h1" id="modelos-title">Modelos propios</h2>
                <p>
                  Calculamos probabilidades antes de cada partido. Al comparar las
                  estimaciones con los resultados, sabemos qué ajustes mejoran el modelo.
                </p>
                <ul className="model-research">
                  <li>
                    <Icon name="trend" />
                    <div>
                      <strong>Machine learning</strong>
                      <span>Entrenamos modelos con partidos históricos y los ponemos a prueba con partidos posteriores.</span>
                    </div>
                  </li>
                  <li>
                    <Icon name="radar" />
                    <div>
                      <strong>IA para el análisis</strong>
                      <span>Desarrollamos un asistente que explica las probabilidades y las compara con tus cuotas.</span>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="model-stat" data-landing-reveal>
                <svg
                  className="model-stat-art"
                  viewBox="0 0 560 340"
                  preserveAspectRatio="xMidYMid slice"
                  fill="none"
                  aria-hidden="true"
                >
                  <defs>
                    <radialGradient id="model-art-aura">
                      <stop stopColor="currentColor" stopOpacity=".34" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </radialGradient>
                    <pattern id="model-art-grid" width="22" height="22" patternUnits="userSpaceOnUse">
                      <path d="M22 0H0V22" stroke="currentColor" opacity=".17" />
                    </pattern>
                    <linearGradient id="model-art-track" x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox">
                      <stop stopColor="currentColor" stopOpacity=".05" />
                      <stop offset=".58" stopColor="currentColor" stopOpacity=".85" />
                      <stop offset="1" stopColor="currentColor" stopOpacity=".25" />
                    </linearGradient>
                  </defs>
                  <path d="M0 0h560v340H0z" fill="url(#model-art-grid)" />
                  <ellipse cx="397" cy="146" rx="205" ry="172" fill="url(#model-art-aura)" />
                  <g stroke="currentColor">
                    <circle cx="397" cy="146" r="62" opacity=".22" />
                    <circle cx="397" cy="146" r="102" opacity=".24" />
                    <circle cx="397" cy="146" r="147" strokeDasharray="2 8" opacity=".5" />
                    <circle cx="397" cy="146" r="172" opacity=".14" />
                    <path d="M226 146h323M397 6v288" strokeDasharray="3 7" opacity=".25" />
                  </g>
                  <g transform="translate(397 146) rotate(-21) skewX(-21)" stroke="currentColor" opacity=".62">
                    <rect x="-114" y="-66" width="228" height="132" rx="5" fill="currentColor" fillOpacity=".06" />
                    <path d="M0-66V66M-114-31h34v62h-34m228-62H80v62h34M-114-14h14v28h-14m228-28h-14v28h14" />
                    <circle r="21" />
                    <circle r="2" fill="currentColor" />
                  </g>
                  <path
                    className="model-art-track"
                    d="M86 249c61 27 168 10 255-29 92-41 164-108 170-145 6-38-83-34-161 5"
                    pathLength={1}
                    stroke="url(#model-art-track)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <g fill="currentColor" opacity=".86">
                    <circle cx="341" cy="220" r="4" />
                    <circle cx="511" cy="75" r="5" />
                    <circle cx="397" cy="146" r="3" />
                    <circle cx="459" cy="227" r="2.5" />
                  </g>
                </svg>
                <dl>
                  <dt>Partidos en el historial de investigación</dt>
                  <dd className="num">+69 mil</dd>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="como">
          <div className="wrap">
            <div className="shead" data-landing-reveal>
              <h2 className="h1">Cómo funciona</h2>
            </div>
            <ol className="timeline" id="timeline">
              <li className="tl" data-landing-reveal>
                <span className="step-number" aria-hidden="true">01</span>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Abre la jornada</b>
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

              <li className="tl" data-landing-reveal>
                <span className="step-number" aria-hidden="true">02</span>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Consulta probabilidades</b>
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

              <li className="tl" data-landing-reveal>
                <span className="step-number" aria-hidden="true">03</span>
                <span className="rail" aria-hidden="true" />
                <div>
                  <b>Compara tu cuota</b>
                  <p>Introduce tu cuota para comparar las probabilidades.</p>
                </div>
                <div className="panel mini">
                  <span className="caption muted">
                    {exampleLabel} · tu cuota 2.10
                  </span>
                  <span className="num">
                    Implica <b>{formatPercent(1 / 2.1, 1)}</b> · PitchLab{" "}
                    <b className="lead-txt">
                      {exampleProbability === undefined
                        ? "—"
                        : formatPercent(exampleProbability, 1)}
                    </b>
                  </span>
                </div>
              </li>

            </ol>
          </div>
        </section>

        <section className="block" id="ligas">
          <div className="wrap">
            <div className="shead" data-landing-reveal>
              <h2 className="h1">Ligas</h2>
            </div>
            <div className="leagues" id="leagues">
              {leagues.map((league) => {
                const Tile = league.active ? "a" : "div";
                return (
                  <Tile
                    key={league.id}
                    className="panel ltile"
                    data-landing-reveal
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
                        {league.leader ? (
                          <div className="caption muted">Líder · {league.leader}</div>
                        ) : null}
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
                          <Badge variant="pill">Requiere código</Badge>
                          <span className="go" aria-hidden="true">
                            <Icon name="arrow" />
                          </span>
                        </>
                      ) : (
                        <Badge variant="pill">Próximamente</Badge>
                      )}
                    </div>
                  </Tile>
                );
              })}

              <div className="soon" data-landing-reveal>
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
                  <Badge variant="pill" className="ml-auto">Pronto</Badge>
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
                  <Badge variant="pill" className="ml-auto">Pronto</Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="panel closing" data-landing-reveal>
              <div className="copy">
                <h2 className="h2">Acceso a la beta</h2>
                <Button
                  appearance="d1"
                  shape="pill"
                  className="bg-background text-foreground hover:bg-card"
                  type="button"
                  data-open-pin=""
                  onClick={openPin}
                >
                  <span>Entrar con código</span>
                  <span data-icon="arrow">
                    <Icon name="arrow" className="icon size-5" />
                  </span>
                </Button>
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
