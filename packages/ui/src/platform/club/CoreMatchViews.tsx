"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  LeagueBadge,
  PBar,
  ProbSplit,
  TeamBadge,
  parseUserOdds,
} from "../../sports.js";
import {
  decimalToAmericanInt,
  formatEdgePts,
  formatOddsValue,
  getSessionWatermark,
  pickReferenceDecimal,
  isPickUnlocked,
  isPreGameIntelUnlocked,
} from "../access-guard.js";
import {
  CalendarSquare,
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  ExampleBadge,
  NoticeCard,
  StackedAvatars,
} from "../components/MaestroPrimitives.js";
import {
  MatchTicketCard,
  MultiPickRow,
} from "../components/MatchTicketCard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import type {
  MatchPick,
  PlatformGame,
  PlatformMarketRow,
  RiskBand,
} from "../types.js";

const MONTH_ABBR_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

function getCalendarTileParts(game: PlatformGame): {
  monthLabel: string;
  dayNumber: string;
} {
  const parsed = Date.parse(game.kickoffUtc);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const monthLabel = MONTH_ABBR_ES[dt.getUTCMonth()] ?? "MES";
    const dayNumber = String(dt.getUTCDate()).padStart(2, "0");
    return { monthLabel, dayNumber };
  }
  const digits = game.dayLabel.match(/\d{1,2}/);
  return {
    monthLabel: "HOY",
    dayNumber: digits ? digits[0].padStart(2, "0") : "01",
  };
}

function matchesMarketCategory(
  row: PlatformMarketRow,
  filter: "all" | "resultado" | "totales" | "btts_handicap" | "doble",
): boolean {
  if (filter === "all") return true;
  const g = row.group.toLowerCase();
  const m = row.market.toLowerCase();
  const l = row.label.toLowerCase();

  if (filter === "resultado") {
    return (
      g.includes("resultado") ||
      g.includes("ganador") ||
      g.includes("1x2") ||
      m === "h2h" ||
      m.includes("moneyline") ||
      m === "1x2"
    );
  }
  if (filter === "totales") {
    return (
      g.includes("total") ||
      g.includes("goles") ||
      g.includes("puntos") ||
      g.includes("equipo") ||
      m.includes("total") ||
      m.includes("ou") ||
      l.includes("más de") ||
      l.includes("menos de")
    );
  }
  if (filter === "btts_handicap") {
    return (
      g.includes("ambos") ||
      g.includes("hándicap") ||
      g.includes("handicap") ||
      g.includes("spread") ||
      g.includes("línea") ||
      m.includes("btts") ||
      m.includes("spread") ||
      m.includes("handicap") ||
      l.includes("ambos anotan")
    );
  }
  return (
    g.includes("doble") ||
    g.includes("empate") ||
    m.includes("double") ||
    m.includes("dnb") ||
    l.includes("o empate") ||
    l.includes("sin empate")
  );
}

export function JornadaClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    favoriteLeagues,
    riskPreference,
    parlayLegs,
    addPickToParlay,
    generateAutoParlay,
    setAuraFromGame,
    navigateTo,
  } = usePlatform();

  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const upcomingGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
    [dataset.games],
  );
  const activePool = upcomingGames.length > 0 ? upcomingGames : dataset.games;

  const filteredGames = useMemo(() => {
    if (leagueFilter === "all") return activePool;
    if (leagueFilter === "favs") {
      const favSet = new Set(favoriteLeagues);
      const favMatches = activePool.filter((g) => favSet.has(g.league));
      return favMatches.length > 0 ? favMatches : activePool;
    }
    return activePool.filter((g) => g.league === leagueFilter);
  }, [activePool, leagueFilter, favoriteLeagues]);

  const spotlight = filteredGames[0] ?? dataset.games[0];
  const top3Entries = useMemo(
    () =>
      filteredGames
        .filter((g) => g.picks.length > 0)
        .slice(0, 3)
        .map((g) => ({ game: g, pick: g.picks[0]! })),
    [filteredGames],
  );

  const spotIsNfl =
    spotlight?.sport === "american-football" || spotlight?.league === "nfl";
  const spotIntelUnlocked = spotlight
    ? isPreGameIntelUnlocked(spotlight, viewerRole)
    : false;
  const spotHomeColor = spotlight
    ? (getTeamColors(spotlight.league, spotlight.home.slug)?.[0] ??
      "var(--pl-aura-default-home)")
    : "var(--pl-aura-default-home)";
  const spotAwayColor = spotlight
    ? (getTeamColors(spotlight.league, spotlight.away.slug)?.[0] ??
      "var(--pl-aura-default-away)")
    : "var(--pl-aura-default-away)";
  const spotCalendar = spotlight
    ? getCalendarTileParts(spotlight)
    : { monthLabel: "HOY", dayNumber: "01" };

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell activePath="/app">
        {/* Encabezado ejecutivo de Jornada */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand inline-flex items-center gap-1.5">
              <MaestroIcon name="sparkles" size={12} />
              <span>PitchLab Spacetime Suite v3.0 · Jornada Activa</span>
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Centro de Mando · Radiografías y Multi-Picks
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="pl-btn-accent text-xs inline-flex items-center gap-1.5"
              onClick={() => {
                generateAutoParlay({
                  leagues: favoriteLeagues,
                  risk: riskPreference,
                  legCount: 3,
                  allowSgp: false,
                });
                navigateTo("/app/parlays");
              }}
            >
              <MaestroIcon name="layers" size={13} />
              <span>Auto-Armar Parlay ({riskPreference})</span>
              <MaestroIcon name="arrowRight" size={13} />
            </button>
            <a
              href="/app/picks"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/picks");
              }}
              className="pl-btn-glass text-xs inline-flex items-center gap-1.5"
            >
              <span>Ver todos los picks (hasta 5/juego)</span>
              <MaestroIcon name="chevronRight" size={13} />
            </a>
          </div>
        </section>

        {/* Filtro rápido de competición */}
        <div
          className="seg-well"
          role="group"
          aria-label="Filtrar jornada por competición"
        >
          <button
            type="button"
            className="seg-btn"
            aria-pressed={leagueFilter === "all"}
            onClick={() => setLeagueFilter("all")}
          >
            Todas ({activePool.length})
          </button>
          <button
            type="button"
            className="seg-btn inline-flex items-center gap-1"
            aria-pressed={leagueFilter === "favs"}
            onClick={() => setLeagueFilter("favs")}
          >
            <MaestroIcon name="star" size={12} />
            <span>Mis Ligas</span>
          </button>
          {dataset.leagues.map((lg) => (
            <button
              key={lg.league}
              type="button"
              className="seg-btn"
              aria-pressed={leagueFilter === lg.league}
              onClick={() => setLeagueFilter(lg.league)}
            >
              <LeagueBadge league={lg.league} label={lg.label} size={15} />
              <span>{lg.label}</span>
              <span className="text-[11px] num opacity-75">
                {lg.upcomingCount || lg.totalGames}
              </span>
            </button>
          ))}
        </div>

        {/* Sección Spotlight Asimétrica 7 / 5 */}
        {spotlight ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Columna 7: Lente Estelar con Orbes de Club, Pedestales, Proyección y Cortex IA */}
            <section
              aria-label="Partido estelar de la jornada"
              className="lg:col-span-7 glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden flex flex-col justify-between"
              onMouseEnter={() => setAuraFromGame(spotlight)}
            >
              <LensGlowOrbs
                primaryColor={spotHomeColor}
                secondaryColor={spotAwayColor}
              />

              <div className="space-y-4 relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CalendarSquare
                      monthLabel={spotCalendar.monthLabel}
                      dayNumber={spotCalendar.dayNumber}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <LeagueBadge
                          league={spotlight.league}
                          label={spotlight.leagueLabel}
                          size={18}
                        />
                        <span
                          className="text-xs font-extrabold uppercase tracking-wider truncate"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          Estelar · {spotlight.leagueLabel}
                        </span>
                      </div>
                      <span
                        className="block text-xs truncate"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {spotlight.round} ·{" "}
                        {spotlight.status === "FT"
                          ? "Finalizado FT"
                          : spotlight.kickoffLocal}{" "}
                        · Conf. {spotlight.confidenceScore}/100
                      </span>
                    </div>
                  </div>

                  <a
                    href={`/app/${spotlight.league}/games/${spotlight.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setAuraFromGame(spotlight);
                      navigateTo(`/app/${spotlight.league}/games/${spotlight.id}`);
                    }}
                    className="pl-btn-primary text-xs min-h-9 px-3.5 inline-flex items-center gap-1.5"
                  >
                    <span>Estudio Completo ({spotlight.picks.length} picks)</span>
                    <MaestroIcon name="arrowRight" size={13} />
                  </a>
                </div>

                {/* Cruce principal con CrestPedestal y Marcador Proyectado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center py-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <CrestPedestal size="lg" glowColor={spotHomeColor}>
                      <TeamBadge
                        league={spotlight.league}
                        slug={spotlight.home.slug}
                        name={spotlight.home.name}
                        size={40}
                      />
                    </CrestPedestal>
                    <div className="min-w-0">
                      <h2 className="m-0 text-lg sm:text-xl font-extrabold truncate">
                        {spotlight.home.name}
                      </h2>
                      <span
                        className="text-xs block"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {spotlight.home.record}
                      </span>
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    {spotlight.status === "FT" && spotlight.score ? (
                      <strong className="num text-2xl font-extrabold block">
                        {spotlight.score.home} – {spotlight.score.away}
                      </strong>
                    ) : spotIntelUnlocked ? (
                      <>
                        <span
                          className="text-[11px] font-bold uppercase tracking-wider block"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Marcador Proyectado
                        </span>
                        <strong
                          className="num text-xl sm:text-2xl font-extrabold block"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          {spotlight.projection.home.toFixed(spotIsNfl ? 1 : 2)} –{" "}
                          {spotlight.projection.away.toFixed(spotIsNfl ? 1 : 2)}
                        </strong>
                        <span
                          className="text-xs num block"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Total esp. {spotlight.projection.total.toFixed(spotIsNfl ? 1 : 2)}
                        </span>
                      </>
                    ) : (
                      <span className="pl-pill inline-flex items-center gap-1.5">
                        <MaestroIcon name="lock" size={12} />
                        <span>Proyección reservada Pase Total</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:justify-end min-w-0">
                    <div className="sm:text-right min-w-0">
                      <h2 className="m-0 text-lg sm:text-xl font-extrabold truncate">
                        {spotlight.away.name}
                      </h2>
                      <span
                        className="text-xs block"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {spotlight.away.record}
                      </span>
                    </div>
                    <CrestPedestal size="lg" glowColor={spotAwayColor}>
                      <TeamBadge
                        league={spotlight.league}
                        slug={spotlight.away.slug}
                        name={spotlight.away.name}
                        size={40}
                      />
                    </CrestPedestal>
                  </div>
                </div>

                <ProbSplit
                  probabilities={
                    spotIsNfl
                      ? [spotlight.x12[0], spotlight.x12[2]]
                      : spotlight.x12
                  }
                  labels={
                    spotIsNfl
                      ? [spotlight.home.shortName, spotlight.away.shortName]
                      : [spotlight.home.shortName, "Empate", spotlight.away.shortName]
                  }
                />

                <NoticeCard
                  tone="cortex"
                  icon="cpu"
                  badgeText="PitchLab Cortex IA"
                  title="Síntesis Ejecutiva Pre-Partido"
                >
                  {spotlight.preGame.cortexSynthesis}
                </NoticeCard>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {spotlight.picks.slice(0, 2).map((pk) => (
                    <MultiPickRow
                      key={pk.id}
                      pick={pk}
                      gameStatus={spotlight.status}
                      compact
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Columna 5: Auto-Armador Rápido 1-Clic + Top 3 Picks Principales */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <section className="glass-lens glass-ring rounded-3xl p-5 space-y-3.5 relative overflow-hidden">
                <LensGlowOrbs subtle />
                <div className="relative z-10 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
                      <MaestroIcon name="layers" size={12} />
                      <span>Geodesic v2.0 · 1 Clic</span>
                    </span>
                    <a
                      href="/app/parlays"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo("/app/parlays");
                      }}
                      className="text-xs font-bold no-underline hover:underline inline-flex items-center gap-1"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      <span>Constructor SGP</span>
                      <MaestroIcon name="chevronRight" size={12} />
                    </a>
                  </div>

                  <div>
                    <h2 className="m-0 text-lg font-extrabold">
                      Auto-Armador Rápido de Parlay
                    </h2>
                    <p
                      className="m-0 mt-0.5 text-xs leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      Genera al instante una combinada óptima de 3 selecciones sin
                      mercados contradictorios según tu perfil:
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          risk: "conservador" as RiskBand,
                          title: "Conservador",
                          sub: "Escudos 72%+",
                          icon: "shield" as const,
                        },
                        {
                          risk: "medio" as RiskBand,
                          title: "Medio",
                          sub: "Picks 56–70%",
                          icon: "sparkles" as const,
                        },
                        {
                          risk: "arriesgado" as RiskBand,
                          title: "Arriesgado",
                          sub: "Valor +EV",
                          icon: "flame" as const,
                        },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.risk}
                        type="button"
                        onClick={() => {
                          generateAutoParlay({
                            leagues: favoriteLeagues,
                            risk: preset.risk,
                            legCount: 3,
                            allowSgp: false,
                          });
                          navigateTo("/app/parlays");
                        }}
                        className="pl-btn-glass rounded-2xl p-3 flex-col items-start gap-1 text-left cursor-pointer"
                      >
                        <MaestroIcon
                          name={preset.icon}
                          size={14}
                          style={{ color: "var(--pl-brand)" }}
                        />
                        <strong className="text-xs font-extrabold block">
                          {preset.title}
                        </strong>
                        <span
                          className="text-[11px] block"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {preset.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="glass-lens glass-ring rounded-3xl p-5 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="m-0 text-base font-extrabold">
                      Top 3 Picks Principales de la Jornada
                    </h2>
                    <a
                      href="/app/picks"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo("/app/picks");
                      }}
                      className="text-xs font-bold no-underline hover:underline inline-flex items-center gap-1"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      <span>Radar</span>
                      <MaestroIcon name="chevronRight" size={12} />
                    </a>
                  </div>

                  <div className="space-y-2">
                    {top3Entries.map(({ game, pick }) => {
                      const unlocked = isPickUnlocked(
                        pick,
                        game.status,
                        viewerRole,
                      );
                      const inParlay = parlayLegs.some(
                        (l) => l.pick.id === pick.id,
                      );
                      return (
                        <div
                          key={pick.id}
                          className="rounded-2xl p-3 flex items-center justify-between gap-2.5"
                          style={{ background: "var(--pl-surface)" }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <LeagueBadge
                              league={game.league}
                              label={game.leagueLabel}
                              size={20}
                            />
                            <div className="min-w-0">
                              <span
                                className="block text-[11px] truncate"
                                style={{ color: "var(--pl-text-muted)" }}
                              >
                                {game.home.shortName} vs {game.away.shortName} ·{" "}
                                {game.kickoffLocal}
                              </span>
                              {unlocked ? (
                                <strong className="block text-xs font-extrabold truncate">
                                  {pick.label}
                                </strong>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-xs font-bold"
                                  style={{ color: "var(--pl-brand)" }}
                                >
                                  <MaestroIcon name="lock" size={11} />
                                  <span>Pick Principal reservado</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {unlocked ? (
                            <div className="flex items-center gap-2 shrink-0 num">
                              <div className="text-right">
                                <strong
                                  className="block text-xs font-extrabold"
                                  style={{
                                    color:
                                      pick.edgePts !== null && pick.edgePts >= 0
                                        ? "var(--pl-success)"
                                        : "var(--pl-text-muted)",
                                  }}
                                >
                                  {formatEdgePts(pick.edgePts)}
                                </strong>
                                <span
                                  className="text-[11px]"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  {formatOddsValue(pickReferenceDecimal(pick), oddsFormat)}
                                  {pick.marketDecimal === null ? " justo" : ""}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
                                onClick={() => addPickToParlay(pick)}
                              >
                                <MaestroIcon
                                  name={inParlay ? "check" : "plus"}
                                  size={12}
                                />
                                <span>{inParlay ? "Listo" : "Parlay"}</span>
                              </button>
                            </div>
                          ) : (
                            <a
                              href="/signup"
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo("/signup");
                              }}
                              className="pl-btn-accent text-xs min-h-7 px-2.5 shrink-0"
                            >
                              7d gratis
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* Malla de 3 columnas de tarjetas de la jornada */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-extrabold">
              Cartelera de Partidos ({filteredGames.length})
            </h2>
            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Pasa el cursor sobre un partido para sincronizar la atmósfera del estadio
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredGames.slice(0, 12).map((g, idx) => (
              <MatchTicketCard key={g.id} game={g} featured={idx === 0} />
            ))}
          </div>
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MultiPicksClubView(): React.JSX.Element {
  const { dataset, navigateTo } = usePlatform();
  const [riskFilter, setRiskFilter] = useState<"all" | RiskBand>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [onlyHighConf, setOnlyHighConf] = useState<boolean>(false);
  const [userOddsRaw, setUserOddsRaw] = useState<string>("");

  const parsedUserDec = useMemo(
    () => (userOddsRaw.trim() ? parseUserOdds(userOddsRaw) : null),
    [userOddsRaw],
  );

  const upcomingGames = useMemo(() => {
    const up = dataset.games.filter((g) => g.status !== "FT");
    return up.length > 0 ? up : dataset.games;
  }, [dataset.games]);

  const visibleGames = useMemo(() => {
    return upcomingGames
      .filter((g) => leagueFilter === "all" || g.league === leagueFilter)
      .map((g) => ({
        game: g,
        picks: g.picks.filter(
          (p) =>
            (riskFilter === "all" || p.risk === riskFilter) &&
            (!onlyHighConf || p.p >= 0.62),
        ),
      }))
      .filter((entry) => entry.picks.length > 0);
  }, [upcomingGames, leagueFilter, riskFilter, onlyHighConf]);

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand inline-flex items-center gap-1.5">
            <MaestroIcon name="sparkles" size={12} />
            <span>Hasta 5 Picks por Partido · Spacetime Suite v3.0</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Explorador Multi-Picks del Día
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Cada encuentro ofrece hasta 5 ángulos calibrados: Pick Principal, Escudo Conservador,
            Línea de Totales, Lectura Táctica y Cuota Alta de Valor. Prueba el momio de tu casa en
            vivo para medir tu ventaja real.
          </p>
        </section>

        {/* Barra Geodesic v2.0 "Probar tu momio" en vivo */}
        <section
          aria-label="Calculadora en vivo Geodesic v2.0"
          className="glass-lens glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="picks-live-odds-input"
              className="text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <MaestroIcon
                name="activity"
                size={14}
                style={{ color: "var(--pl-brand)" }}
              />
              <span>Probar tu momio (Geodesic v2.0):</span>
            </label>
            <input
              id="picks-live-odds-input"
              type="text"
              value={userOddsRaw}
              onChange={(e) => setUserOddsRaw(e.target.value)}
              placeholder="Ej. -110 o 1.95"
              className="glass-input px-3 py-1.5 text-xs font-bold num w-36"
            />
            <div className="flex items-center gap-1">
              {["-110", "+105", "1.95"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUserOddsRaw(preset)}
                  className="pl-btn-glass text-[11px] min-h-7 px-2 num"
                >
                  {preset}
                </button>
              ))}
              {userOddsRaw ? (
                <button
                  type="button"
                  onClick={() => setUserOddsRaw("")}
                  className="pl-btn-glass text-[11px] min-h-7 px-2 inline-flex items-center gap-1"
                >
                  <MaestroIcon name="x" size={11} />
                  <span>Limpiar</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="text-xs num">
            {parsedUserDec ? (
              <span className="pl-pill pl-pill--success inline-flex items-center gap-1.5">
                <MaestroIcon name="check" size={12} />
                <span>
                  Decimal {parsedUserDec.toFixed(2)} · Implícita{" "}
                  {((1 / parsedUserDec) * 100).toFixed(1)} % activa
                </span>
              </span>
            ) : userOddsRaw.trim() ? (
              <span className="pl-pill pl-pill--warning">
                Ingresa formato americano (-110, +125) o decimal (1.95)
              </span>
            ) : (
              <span style={{ color: "var(--pl-text-muted)" }}>
                Escribe tu cuota para recalcular ventaja EV en todos los picks desbloqueados
              </span>
            )}
          </div>
        </section>

        {/* Controles de perfil, liga y probabilidad */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg-well" role="group" aria-label="Filtrar por perfil de riesgo">
            {(
              [
                { id: "all", label: "Todos los perfiles" },
                { id: "conservador", label: "Escudo Conservador" },
                { id: "medio", label: "Balanceado Medio" },
                { id: "arriesgado", label: "Cuota Alta · Valor" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="seg-btn"
                aria-pressed={riskFilter === opt.id}
                onClick={() => setRiskFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por liga"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="glass-input px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">Todas las ligas</option>
              {dataset.leagues.map((l) => (
                <option key={l.league} value={l.league}>
                  {l.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-pressed={onlyHighConf}
              onClick={() => setOnlyHighConf((v) => !v)}
              className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
            >
              {onlyHighConf ? <MaestroIcon name="check" size={12} /> : null}
              <span>Prob. ≥ 62 %</span>
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {visibleGames.slice(0, 10).map(({ game, picks }) => {
            const homeColor =
              getTeamColors(game.league, game.home.slug)?.[0] ??
              "var(--pl-aura-default-home)";
            const awayColor =
              getTeamColors(game.league, game.away.slug)?.[0] ??
              "var(--pl-aura-default-away)";

            return (
              <section
                key={game.id}
                className="glass-card glass-ring rounded-2xl p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CrestPedestal size="sm" glowColor={homeColor}>
                      <TeamBadge
                        league={game.league}
                        slug={game.home.slug}
                        name={game.home.name}
                        size={22}
                      />
                    </CrestPedestal>
                    <CrestPedestal size="sm" glowColor={awayColor}>
                      <TeamBadge
                        league={game.league}
                        slug={game.away.slug}
                        name={game.away.name}
                        size={22}
                      />
                    </CrestPedestal>
                    <div className="min-w-0">
                      <h2 className="m-0 text-base font-extrabold truncate">
                        {game.home.name} vs {game.away.name}
                      </h2>
                      <span
                        className="text-xs block truncate"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {game.leagueLabel} · {game.round} · {game.kickoffLocal}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="pl-pill num">{picks.length} selecciones</span>
                    <a
                      href={`/app/${game.league}/games/${game.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(`/app/${game.league}/games/${game.id}`);
                      }}
                      className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1"
                    >
                      <span>Estudio</span>
                      <MaestroIcon name="arrowRight" size={12} />
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {picks.map((pk) => (
                    <MultiPickRow
                      key={pk.id}
                      pick={pk}
                      gameStatus={game.status}
                      userDecimalOverride={parsedUserDec}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function LeagueHubClubView({
  leagueId,
}: {
  leagueId: LeagueId;
}): React.JSX.Element {
  const { dataset } = usePlatform();
  const [dayFilter, setDayFilter] = useState<string>("all");

  const leagueSummary =
    dataset.leagues.find((l) => l.league === leagueId) ?? dataset.leagues[0]!;
  const leagueGames = useMemo(
    () => dataset.games.filter((g) => g.league === leagueSummary.league),
    [dataset.games, leagueSummary.league],
  );

  const dayOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set("all", "Toda la jornada");
    for (const g of leagueGames) {
      if (!map.has(g.dayId)) {
        map.set(g.dayId, g.dayLabel);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [leagueGames]);

  const filteredGames = useMemo(
    () =>
      dayFilter === "all"
        ? leagueGames
        : leagueGames.filter((g) => g.dayId === dayFilter),
    [leagueGames, dayFilter],
  );

  const upcoming = filteredGames.filter((g) => g.status !== "FT");
  const finished = filteredGames.filter((g) => g.status === "FT");

  const hubPath = `/app/${leagueSummary.league}`;

  return (
    <AtmosphereStage activePath={hubPath}>
      <ClubWorkspaceShell activePath={hubPath}>
        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
          <LensGlowOrbs subtle />

          <div className="flex items-center gap-4 relative z-10">
            <CrestPedestal size="lg">
              <LeagueBadge
                league={leagueSummary.league}
                label={leagueSummary.label}
                size={40}
              />
            </CrestPedestal>
            <div>
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--pl-brand)" }}
              >
                {leagueSummary.season} · {leagueSummary.roundLabel}
              </span>
              <h1 id="panel-league-name" className="m-0 text-2xl sm:text-3xl font-extrabold">
                {leagueSummary.label}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs num relative z-10">
            <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
              <MaestroIcon name="calendar" size={12} />
              <span>{leagueSummary.upcomingCount} por jugar</span>
            </span>
            <span className="pl-pill pl-pill--success inline-flex items-center gap-1">
              <MaestroIcon name="check" size={12} />
              <span>{leagueSummary.finishedCount} auditados FT</span>
            </span>
          </div>
        </section>

        {/* Chips de filtro por día */}
        <div
          id="day-chips"
          className="seg-well"
          role="group"
          aria-label="Filtrar partidos por día"
        >
          {dayOptions.map((d) => (
            <button
              key={d.id}
              type="button"
              className="day-chip seg-btn"
              aria-pressed={dayFilter === d.id}
              onClick={() => setDayFilter(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {upcoming.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Próximos encuentros ({upcoming.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {upcoming.map((g, idx) => (
                <MatchTicketCard key={g.id} game={g} featured={idx === 0} />
              ))}
            </div>
          </section>
        ) : null}

        {finished.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Resultados cerrados FT ({finished.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {finished.map((g) => (
                <MatchTicketCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Tabla de posiciones real del snapshot */}
        {leagueSummary.standings.length > 0 ? (
          <section className="standings-block pl-deferred-section glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Tabla de Posiciones · {leagueSummary.label}
            </h2>
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label={`Tabla de posiciones de ${leagueSummary.label}`}
            >
              <table className="standings w-full text-left border-collapse text-sm">
                <thead>
                  <tr
                    className="hairline-b text-xs uppercase"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <th scope="col" className="py-2 pr-3">
                      Pos.
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Club
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      PJ
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      G
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      E
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      P
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      DG
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leagueSummary.standings.map((row, idx) => {
                    const slug = row.teamId.includes(".")
                      ? row.teamId.split(".")[1]!
                      : row.teamId;
                    const dg = row.goalsFor - row.goalsAgainst;
                    return (
                      <tr key={row.teamId} className="hairline-b">
                        <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2 font-semibold">
                            <TeamBadge
                              league={leagueSummary.league}
                              slug={slug}
                              name={row.name}
                              size={20}
                            />
                            <span>{row.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right num">{row.played}</td>
                        <td className="py-2.5 px-2 text-right num">{row.won}</td>
                        <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                        <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                        <td className="py-2.5 px-2 text-right num">
                          {dg > 0 ? `+${dg}` : dg}
                        </td>
                        <td className="py-2.5 pl-2 text-right num font-extrabold">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
}: {
  leagueId: LeagueId;
  gameId: string;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    watchlistGameIds,
    toggleWatchlistGame,
    setSelectedTipstarPickId,
    socialPosts,
    publishSocialPost,
    openComposer,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<
    "picks" | "mercados" | "contexto" | "dinero"
  >("picks");
  const [marketGroupFilter, setMarketGroupFilter] = useState<
    "all" | "resultado" | "totales" | "btts_handicap" | "doble"
  >("all");
  const [marketUserOddsRaw, setMarketUserOddsRaw] = useState<string>("");
  const [debateBody, setDebateBody] = useState<string>("");
  const [debateError, setDebateError] = useState<string>("");

  const game = useMemo(
    () =>
      dataset.games.find((g) => g.id === gameId) ??
      dataset.games.find((g) => g.league === leagueId) ??
      dataset.games[0]!,
    [dataset.games, gameId, leagueId],
  );

  const isNfl = game.sport === "american-football" || game.league === "nfl";
  const flow = game.preGame.moneyFlow;
  const isFinished = game.status === "FT" && game.score !== undefined;
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);
  const watermark = getSessionWatermark(viewerRole);
  const watched = watchlistGameIds.includes(game.id);

  const homePrimary =
    getTeamColors(game.league, game.home.slug)?.[0] ??
    "var(--pl-aura-default-home)";
  const awayPrimary =
    getTeamColors(game.league, game.away.slug)?.[0] ??
    "var(--pl-aura-default-away)";

  const studioPath = `/app/${game.league}/games/${game.id}`;
  const mainEngineName =
    game.picks[0]?.engineName ??
    (isNfl ? "PitchLab Minkowski v3.0" : "PitchLab Tachyon v3.0");

  const parsedMarketUserDec = useMemo(
    () => (marketUserOddsRaw.trim() ? parseUserOdds(marketUserOddsRaw) : null),
    [marketUserOddsRaw],
  );

  const filteredMarkets = useMemo(
    () => game.markets.filter((m) => matchesMarketCategory(m, marketGroupFilter)),
    [game.markets, marketGroupFilter],
  );

  const matchLabelShort = `${game.home.shortName} vs ${game.away.shortName}`;

  const matchDebateItems = useMemo(() => {
    const liveMatching = socialPosts
      .filter(
        (p) =>
          p.gameId === game.id ||
          p.matchLabel.toLowerCase().includes(game.home.shortName.toLowerCase()) ||
          p.matchLabel.toLowerCase().includes(game.away.shortName.toLowerCase()),
      )
      .map((p) => ({
        id: p.id,
        handle: `@${p.authorHandle}`,
        roleBadge: p.roleBadge,
        record: `${p.verifiedRecord} · ${p.clvBadge}`,
        createdAt: p.createdAt,
        body: p.body,
        isExample: Boolean(p.isExample),
      }));

    const seeded = [
      {
        id: `seed-${game.id}-1`,
        handle: "@sofia_nfl",
        roleBadge: "Tipstar Oficial",
        record: "+18.4u · CLV +4.2 %",
        createdAt: "Hace 18 min",
        isExample: true,
        body: `La proyección de ${mainEngineName} favorece claramente el ángulo principal en ${matchLabelShort}. Sellé 1.5u antes del inicio.`,
      },
      {
        id: `seed-${game.id}-2`,
        handle: "@carlos_quant",
        roleBadge: "Analista Verificado",
        record: "+14.9u · CLV +3.9 %",
        createdAt: "Hace 39 min",
        isExample: true,
        body: `Coincido con el Escudo Conservador para combinarlo en Parlay de 2 selecciones; Geodesic v2.0 sigue marcando valor limpio sobre la casa.`,
      },
    ];

    return [...liveMatching, ...seeded];
  }, [game.away.shortName, game.home.shortName, game.id, mainEngineName, matchLabelShort, socialPosts]);

  const handlePublishDebate = (e: React.FormEvent) => {
    e.preventDefault();
    setDebateError("");
    const res = publishSocialPost({
      leagueLabel: game.leagueLabel,
      matchLabel: matchLabelShort,
      pickBadge: game.picks[0]?.categoryLabel ?? "Lectura Socio",
      originType: "Spacetime Suite",
      body: debateBody,
    });
    if (!res.ok) {
      setDebateError(res.error ?? "No se pudo publicar tu comentario.");
      return;
    }
    setDebateBody("");
  };

  const handleSealMarketRow = (m: PlatformMarketRow, idx: number) => {
    const existingPick = game.picks.find((p) => p.label === m.label);
    if (existingPick) {
      openComposer(existingPick);
      return;
    }
    const effectiveBookDec =
      parsedMarketUserDec && parsedMarketUserDec > 1
        ? parsedMarketUserDec
        : m.currentDecimal;
    const edgeForSeal =
      effectiveBookDec === null ? null : Math.round((m.p - 1 / effectiveBookDec) * 1000) / 10;
    const syntheticPick: MatchPick = {
      id: `${game.id}-mkt-${idx}`,
      gameId: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      matchLabel: `${game.home.name} vs ${game.away.name}`,
      kickoffLocal: game.kickoffLocal,
      gameStatus: game.status,
      slotIndex: idx + 10,
      category: "valor",
      categoryLabel: m.group,
      risk: m.p >= 0.68 ? "conservador" : m.p >= 0.52 ? "medio" : "arriesgado",
      engineKey: "geodesic",
      engineName: "PitchLab Geodesic v2.0",
      marketGroup: m.group,
      selectionKey: m.selection,
      conflictGroup: "independent",
      label: m.label,
      rationale: `Línea directa de la matriz de mercados (${(m.p * 100).toFixed(1)} % de probabilidad real).`,
      p: m.p,
      fairDecimal: m.fairDecimal,
      fairAmerican: m.fairAmerican,
      marketDecimal: effectiveBookDec,
      marketAmerican: effectiveBookDec === null ? null : decimalToAmericanInt(effectiveBookDec),
      edgePts: edgeForSeal,
      confidenceScore: game.confidenceScore,
      suggestedUnits: 1.0,
    };
    openComposer(syntheticPick);
  };

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={`/app/${game.league}`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`/app/${game.league}`);
            }}
            className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
          >
            <MaestroIcon name="arrowLeft" size={13} />
            <span>Volver a {game.leagueLabel}</span>
          </a>

          <button
            type="button"
            className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
            onClick={() => toggleWatchlistGame(game.id)}
          >
            <MaestroIcon
              name="bell"
              size={13}
              style={{ color: watched ? "var(--pl-brand)" : undefined }}
            />
            <span>{watched ? "En vigilancia" : "Vigilar partido"}</span>
          </button>
        </div>

        {/* Cabecera Estelar de Radiografía del Partido */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-5 relative overflow-hidden"
          data-match-studio={game.id}
        >
          <LensGlowOrbs primaryColor={homePrimary} secondaryColor={awayPrimary} />

          <span className="pl-watermark num" aria-hidden="true">
            {watermark}
          </span>

          <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2">
              <LeagueBadge league={game.league} label={game.leagueLabel} size={22} />
              <span
                id="modal-league"
                className="text-xs font-bold uppercase tracking-wider"
              >
                {game.leagueLabel} · {game.round} · {game.venue}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="pl-pill inline-flex items-center gap-1 text-xs">
                <MaestroIcon name="cpu" size={12} />
                <span>{mainEngineName}</span>
              </span>
              <span className="pl-pill pl-pill--success num text-xs">
                Confianza {game.confidenceScore}/100
              </span>
              <span className="pl-pill pl-pill--brand num text-xs">
                {isFinished
                  ? "Finalizado FT"
                  : `${game.dayLabel} · ${game.kickoffLocal}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center relative z-10">
            <div className="flex items-center gap-3.5 min-w-0">
              <CrestPedestal size="lg" glowColor={homePrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  size={44}
                />
              </CrestPedestal>
              <div className="min-w-0">
                <h1 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  {game.home.name}
                </h1>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.record}
                </span>
              </div>
            </div>

            <div className="text-center space-y-1">
              {isFinished ? (
                <strong className="num text-3xl font-extrabold block">
                  {game.score?.home} – {game.score?.away}
                </strong>
              ) : intelUnlocked ? (
                <strong
                  className="num text-2xl font-extrabold block"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Proy. {game.projection.home.toFixed(isNfl ? 1 : 2)} –{" "}
                  {game.projection.away.toFixed(isNfl ? 1 : 2)}
                </strong>
              ) : (
                <span className="pl-pill inline-flex items-center gap-1.5">
                  <MaestroIcon name="lock" size={12} />
                  <span>Marcador proyectado Pase Total</span>
                </span>
              )}
              <span
                className="text-xs num block"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {intelUnlocked || isFinished
                  ? `Total esp. ${game.projection.total.toFixed(isNfl ? 1 : 2)} · ${game.picks.length} picks calibrados`
                  : "Activa 7d gratis para desbloquear proyección exacta"}
              </span>
            </div>

            <div className="flex items-center gap-3.5 md:justify-end min-w-0">
              <div className="md:text-right min-w-0">
                <h2 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  {game.away.name}
                </h2>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
              <CrestPedestal size="lg" glowColor={awayPrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  size={44}
                />
              </CrestPedestal>
            </div>
          </div>

          <div className="relative z-10">
            <ProbSplit
              probabilities={isNfl ? [game.x12[0], game.x12[2]] : game.x12}
              labels={
                isNfl
                  ? [game.home.shortName, game.away.shortName]
                  : [game.home.shortName, "Empate", game.away.shortName]
              }
            />
          </div>
        </section>

        {/* Fila Pre-Partido de 3 Columnas: Cortex IA · Alineaciones 60m · ¿Dónde está el dinero? */}
        <section
          aria-label="Inteligencia pre-partido en 3 ejes"
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          {/* 1) Síntesis Ejecutiva · Cortex IA */}
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold"
                  style={{ color: "var(--engine-cortex)" }}
                >
                  <MaestroIcon name="cpu" size={14} />
                  <span>Síntesis Ejecutiva · PitchLab Cortex IA</span>
                </span>
              </div>
              <p
                className="m-0 text-xs leading-relaxed"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                {game.preGame.cortexSynthesis}
              </p>
            </div>

            {intelUnlocked && game.preGame.tacticalKeys.length > 0 ? (
              <div className="pt-2 hairline-t flex flex-wrap gap-1.5">
                {game.preGame.tacticalKeys.slice(0, 2).map((k, idx) => (
                  <span key={idx} className="pl-pill text-[11px]">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 2) Alineaciones y Bajas 60m */}
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-extrabold">Alineaciones y bajas</h2>
              <span className="pl-pill pl-pill--info text-[10px]">
                {game.preGame.lineupStatusLabel}
              </span>
            </div>

            {intelUnlocked && game.preGame.absences.length > 0 ? (
              <div className="space-y-2">
                {game.preGame.absences.slice(0, 3).map((item, idx) => {
                  const pillTone =
                    item.status === "Confirmado XI"
                      ? "pl-pill pl-pill--success"
                      : item.status === "Baja"
                        ? "pl-pill pl-pill--danger"
                        : "pl-pill pl-pill--warning";
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-2.5 text-xs"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="truncate">{item.player}</span>
                        <span className={`${pillTone} text-[10px] shrink-0`}>
                          {item.status}
                        </span>
                      </div>
                      <p
                        className="m-0 mt-0.5 text-[11px]"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {item.impactNote}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Bajas reportadas y estado de alineaciones disponibles con Pase Total.
              </p>
            )}
          </div>

          {/* 3) ¿Dónde está el dinero? Quick Summary */}
          {!flow ? (
            <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5" data-no-market="">
              <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Este partido todavía no tiene momios verificados. Mostramos solo la probabilidad del modelo.
              </p>
            </div>
          ) : (
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
                <span className="pl-pill pl-pill--brand text-[10px] num">
                  {game.spacetime?.market?.bookLabel ?? "Mercado"}
                </span>
              </div>

              <div className="space-y-1.5 text-xs num">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    Flujo hacia {game.home.shortName}
                  </span>
                  <strong>
                    {flow.homeShare} % vs{" "}
                    {(game.x12[0] * 100).toFixed(0)} % modelo
                  </strong>
                </div>
                <PBar
                  p={flow.homeShare / 100}
                  lead={flow.homeShare >= 50}
                />

                <div className="flex items-center justify-between pt-1">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    Flujo hacia {game.away.shortName}
                  </span>
                  <strong>
                    {flow.awayShare} % vs{" "}
                    {(game.x12[2] * 100).toFixed(0)} % modelo
                  </strong>
                </div>
                <PBar
                  p={flow.awayShare / 100}
                  lead={flow.awayShare > 50}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 hairline-t text-xs">
              <span
                className="truncate"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                {flow.sharpNote}
              </span>
              <button
                type="button"
                className="pl-btn-glass text-[11px] min-h-7 px-2.5 shrink-0"
                onClick={() => setActiveTab("dinero")}
              >
                Detalle
              </button>
            </div>
          </div>
          )}
        </section>

        {/* Navegación interna del estudio */}
        <div className="seg-well" role="tablist" aria-label="Secciones de la radiografía">
          {(
            [
              { id: "picks", label: `Multi-Picks (${game.picks.length})` },
              { id: "mercados", label: `Mercados & Geodesic (${game.markets.length})` },
              { id: "contexto", label: "Contexto & H2H" },
              { id: "dinero", label: "¿Dónde está el dinero?" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-section-tab={t.id}
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className="seg-btn"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Pestaña 1: 2 Columnas Asimétricas (7: 5 Picks · 5: Debate de Suscriptores) */}
        {activeTab === "picks" ? (
          <section
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
            data-picks=""
          >
            <div className="lg:col-span-7 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-extrabold">
                  {game.picks.length} {game.picks.length === 1 ? "Ángulo Cuantitativo" : "Ángulos Cuantitativos"} de Este Partido
                </h2>
                {viewerRole === "tipstar" || viewerRole === "admin" ? (
                  <span
                    className="text-xs font-semibold inline-flex items-center gap-1"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="crown" size={13} />
                    <span>Elige cualquiera como tu Pick Abierto Semanal</span>
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {game.picks.map((pk) => (
                  <div key={pk.id} className="space-y-1.5">
                    <MultiPickRow pick={pk} gameStatus={game.status} />
                    {(viewerRole === "tipstar" || viewerRole === "admin") &&
                    game.status !== "FT" ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-7 px-2.5 inline-flex items-center gap-1"
                          onClick={() => {
                            setSelectedTipstarPickId(pk.id);
                            pushToast(
                              `«${pk.label}» asignado como tu Pick Abierto Semanal en Portal Tipstar.`,
                              "success",
                            );
                          }}
                        >
                          <MaestroIcon name="crown" size={12} />
                          <span>Usar como mi Pick Abierto Semanal</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Hilo en vivo: Debate de Suscriptores del Partido */}
            <aside
              aria-label="Debate de suscriptores del partido"
              className="lg:col-span-5 glass-lens glass-ring rounded-3xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span
                    className="text-[11px] font-extrabold uppercase tracking-wider block"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    Comunidad Verificada
                  </span>
                  <h2 className="m-0 text-lg font-extrabold">
                    Debate de Suscriptores
                  </h2>
                </div>
                <StackedAvatars
                  items={[
                    { initials: "SM", gradVar: "var(--avatar-grad-1)", label: "Sofía Méndez" },
                    { initials: "CV", gradVar: "var(--avatar-grad-2)", label: "Carlos Vega" },
                    { initials: "DA", gradVar: "var(--avatar-grad-3)", label: "Diego Aranda" },
                  ]}
                  extraCount={14}
                />
              </div>

              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {matchDebateItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl p-3 space-y-1.5 text-xs"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <strong className="font-extrabold">{item.handle}</strong>
                        {item.isExample ? <ExampleBadge /> : null}
                        <span className="pl-pill pl-pill--brand text-[10px]">
                          {item.roleBadge}
                        </span>
                      </div>
                      <span
                        className="text-[11px] num font-bold"
                        style={{ color: "var(--pl-success)" }}
                      >
                        {item.record}
                      </span>
                    </div>
                    <p
                      className="m-0 leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      {item.body}
                    </p>
                    <span
                      className="block text-[10px]"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {item.createdAt}
                    </span>
                  </article>
                ))}
              </div>

              <form onSubmit={handlePublishDebate} className="space-y-2 pt-2 hairline-t">
                <label
                  htmlFor="studio-debate-input"
                  className="text-xs font-bold block"
                >
                  Sumar lectura verificada ({matchLabelShort})
                </label>
                <textarea
                  id="studio-debate-input"
                  rows={2}
                  value={debateBody}
                  onChange={(e) => setDebateBody(e.target.value)}
                  placeholder="Comparte tu ángulo o momio sellado (enlaces externos bloqueados)..."
                  className="glass-input w-full p-2.5 text-xs resize-none"
                />
                {debateError ? (
                  <p
                    role="alert"
                    className="m-0 text-xs font-semibold"
                    style={{ color: "var(--pl-danger)" }}
                  >
                    {debateError}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] inline-flex items-center gap-1"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <MaestroIcon name="shield" size={12} />
                    <span>Filtro anti-spam activo</span>
                  </span>
                  <button
                    type="submit"
                    className="pl-btn-primary text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
                  >
                    <MaestroIcon name="users" size={12} />
                    <span>Publicar opinión</span>
                  </button>
                </div>
              </form>
            </aside>
          </section>
        ) : null}

        {/* Pestaña 2: Matriz de Mercados + Filtros + Calculadora Momio + Sellar */}
        {activeTab === "mercados" ? (
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  Matriz de Mercados · Momio Justo Sin Vig (Geodesic v2.0)
                </h2>
                <p
                  className="m-0 text-xs mt-0.5"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Filtra por familia de mercado, prueba tu cuota en vivo y sella cualquier línea en tu Bitácora.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="studio-market-odds-input"
                  className="text-xs font-bold"
                >
                  Probar momio:
                </label>
                <input
                  id="studio-market-odds-input"
                  type="text"
                  value={marketUserOddsRaw}
                  onChange={(e) => setMarketUserOddsRaw(e.target.value)}
                  placeholder="Ej. -110 o 2.05"
                  className="glass-input px-3 py-1.5 text-xs font-bold num w-36"
                />
                {marketUserOddsRaw ? (
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-8 px-2.5"
                    onClick={() => setMarketUserOddsRaw("")}
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>
            </div>

            {/* Píldoras de filtro por grupo de mercado */}
            <div
              className="seg-well"
              role="group"
              aria-label="Filtrar matriz por grupo de mercado"
            >
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "resultado", label: "Resultado" },
                  { id: "totales", label: "Totales" },
                  { id: "btts_handicap", label: "Ambos Anotan / Hándicap" },
                  { id: "doble", label: "Doble Oportunidad" },
                ] as const
              ).map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  className="seg-btn text-xs"
                  aria-pressed={marketGroupFilter === grp.id}
                  onClick={() => setMarketGroupFilter(grp.id)}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            {game.markets.length === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Activa Pase Total para inspeccionar los ~20 mercados calibrados de este partido.
              </p>
            ) : filteredMarkets.length === 0 ? (
              <div
                className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{ background: "var(--pl-surface)" }}
              >
                <span style={{ color: "var(--pl-text-secondary)" }}>
                  No hay líneas en este grupo para {game.leagueLabel}.
                </span>
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-8 px-3"
                  onClick={() => setMarketGroupFilter("all")}
                >
                  Ver todos los mercados
                </button>
              </div>
            ) : (
              <div
                className="pl-table-region"
                tabIndex={0}
                role="region"
                aria-label="Matriz completa de mercados y momios justos Geodesic"
              >
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr
                      className="hairline-b text-xs uppercase"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      <th scope="col" className="py-2 pr-3">
                        Grupo
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Selección
                      </th>
                      <th scope="col" className="py-2 px-3">
                        Probabilidad
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Justa
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        {parsedMarketUserDec ? "Tu Momio" : "Casa"}
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Ventaja
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkets.map((m, idx) => {
                      const activeBookDec =
                        parsedMarketUserDec && parsedMarketUserDec > 1
                          ? parsedMarketUserDec
                          : m.currentDecimal;
                      const activeEdgePts =
                        parsedMarketUserDec && parsedMarketUserDec > 1
                          ? (m.p - 1 / parsedMarketUserDec) * 100
                          : m.edgePts;

                      return (
                        <tr
                          key={`${m.market}-${m.selection}-${idx}`}
                          className="hairline-b"
                        >
                          <td
                            className="py-2.5 pr-3 text-xs font-semibold"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {m.group}
                          </td>
                          <td className="py-2.5 pr-3 font-bold">{m.label}</td>
                          <td className="py-2.5 px-3 w-44">
                            <div className="space-y-1">
                              <span className="text-xs num font-bold">
                                {(m.p * 100).toFixed(1)} %
                              </span>
                              <PBar p={m.p} lead={m.p >= 0.55} />
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right num font-semibold">
                            {formatOddsValue(m.fairDecimal, oddsFormat)}
                          </td>
                          <td className="py-2.5 px-2 text-right num font-bold">
                            {activeBookDec === null ? "—" : formatOddsValue(activeBookDec, oddsFormat)}
                          </td>
                          <td
                            className="py-2.5 px-2 text-right num font-extrabold"
                            style={{
                              color:
                                activeEdgePts !== null && activeEdgePts >= 0
                                  ? "var(--pl-success)"
                                  : "var(--pl-text-muted)",
                            }}
                          >
                            {formatEdgePts(activeEdgePts)}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              type="button"
                              className="pl-btn-glass text-xs min-h-7 px-2.5 inline-flex items-center gap-1"
                              onClick={() => handleSealMarketRow(m, idx)}
                            >
                              <MaestroIcon name="plus" size={11} />
                              <span>Sellar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* Pestaña 3: Contexto del partido y cruces directos */}
        {activeTab === "contexto" ? (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <h2 className="m-0 text-lg font-extrabold">Contexto del partido</h2>
              <div className="space-y-2">
                {game.factors.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl p-3 flex items-center justify-between gap-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div>
                      <strong className="block text-sm">{f.label}</strong>
                      {f.sub ? (
                        <span
                          className="text-xs"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {f.sub}
                        </span>
                      ) : null}
                    </div>
                    <strong className="num text-sm font-extrabold">{f.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <h2 className="m-0 text-lg font-extrabold">
                Historial directo y descanso
              </h2>
              {game.restDays ? (
                <div
                  className="rounded-xl p-3 flex items-center justify-between text-xs num"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span style={{ color: "var(--pl-text-secondary)" }}>
                    Días de recuperación previos
                  </span>
                  <strong>
                    {game.home.shortName}: {game.restDays.home ?? "–"}d ·{" "}
                    {game.away.shortName}: {game.restDays.away ?? "–"}d
                  </strong>
                </div>
              ) : null}
              {game.headToHead.length > 0 ? (
                <ul className="m-0 p-0 list-none space-y-2 text-sm">
                  {game.headToHead.map((h, i) => (
                    <li
                      key={i}
                      className="rounded-xl p-2.5 flex items-center justify-between"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {h.date}
                      </span>
                      <span className="font-semibold num">
                        {h.home} {h.homeGoals}–{h.awayGoals} {h.away}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Sin enfrentamientos recientes en la ventana actual; los motores ponderan fuerza
                  relativa de liga.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* Pestaña 4: ¿Dónde está el dinero? */}
        {activeTab === "dinero" && !flow ? (
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-2" data-market-pulse="">
            <h2 className="m-0 text-lg font-extrabold">¿Dónde está el dinero?</h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Sin momios verificados para este partido. Cuando la casa publique líneas, aquí verás el reparto del mercado frente al modelo.
            </p>
          </section>
        ) : null}
        {activeTab === "dinero" && flow ? (
          <section
            className="glass-card glass-ring rounded-2xl p-5 space-y-4"
            data-market-pulse=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  ¿Dónde está el dinero? · Liquidez y Sentimiento vs. Modelo
                </h2>
                <p
                  className="m-0 text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Comparativa limpia entre participación de volumen y probabilidad justa de Spacetime Suite
                </p>
              </div>
              <span className="pl-pill pl-pill--info">
                {game.spacetime?.market?.bookLabel ?? "Mercado"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 num">
              <div
                className="rounded-xl p-3.5 space-y-2"
                style={{ background: "var(--pl-surface)" }}
              >
                <span
                  className="block text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Flujo hacia {game.home.shortName}
                </span>
                <strong className="text-xl font-extrabold block">
                  {flow.homeShare} %
                </strong>
                <PBar
                  p={flow.homeShare / 100}
                  lead={flow.homeShare >= 50}
                />
                <span
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Modelo Spacetime: {(game.x12[0] * 100).toFixed(1)} %
                </span>
              </div>

              {flow.drawShare !== undefined ? (
                <div
                  className="rounded-xl p-3.5 space-y-2"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span
                    className="block text-xs"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    Flujo hacia Empate
                  </span>
                  <strong className="text-xl font-extrabold block">
                    {flow.drawShare} %
                  </strong>
                  <PBar p={flow.drawShare / 100} />
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    Modelo Spacetime: {(game.x12[1] * 100).toFixed(1)} %
                  </span>
                </div>
              ) : null}

              <div
                className="rounded-xl p-3.5 space-y-2"
                style={{ background: "var(--pl-surface)" }}
              >
                <span
                  className="block text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Flujo hacia {game.away.shortName}
                </span>
                <strong className="text-xl font-extrabold block">
                  {flow.awayShare} %
                </strong>
                <PBar
                  p={flow.awayShare / 100}
                  lead={flow.awayShare > 50}
                />
                <span
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Modelo Spacetime: {(game.x12[2] * 100).toFixed(1)} %
                </span>
              </div>
            </div>

            <NoticeCard
              tone="info"
              icon="activity"
              badgeText="Lectura Geodesic v2.0"
              title="Señal de Flujo Institucional"
            >
              {flow.sharpNote}
            </NoticeCard>
          </section>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
