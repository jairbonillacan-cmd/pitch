"use client";

import React, { useMemo, useState } from "react";
import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports.js";
import {
  formatOddsValue,
  getSessionWatermark,
  isPickUnlocked,
  isPreGameIntelUnlocked,
  pickReferenceDecimal,
} from "../access-guard.js";
import {
  CrestPedestal,
  GlassActionRow,
  LensGlowOrbs,
  MaestroIcon,
  ExampleBadge,
  NoticeCard,
  RoleSwitcherPill,
} from "../components/MaestroPrimitives.js";
import {
  AtmosphereStage,
  PublicFooterV4,
  PublicHeaderV4,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  SPACETIME_METRICS_HEADLINE,
  TIPSTAR_CREATORS,
} from "../spacetime-catalog.js";
import type { MatchPick, PlatformGame } from "../types.js";
import {
  PlansAndReferralsSection,
  TechPrecisionSection,
} from "./TechAndPricingSurfaces.js";

const PREFERRED_LEAGUE_ORDER: readonly LeagueId[] = [
  asLeagueId("liga-mx"),
  asLeagueId("nfl"),
  asLeagueId("premier-league"),
  asLeagueId("laliga"),
  asLeagueId("serie-a"),
];

function shortLeagueLabel(league: string, fallback: string): string {
  switch (league) {
    case "liga-mx":
      return "Liga MX";
    case "nfl":
      return "NFL";
    case "premier-league":
      return "Premier";
    case "laliga":
      return "LaLiga";
    case "serie-a":
      return "Serie A";
    case "bundesliga":
      return "Bundesliga";
    case "ligue-1":
      return "Ligue 1";
    default:
      return fallback;
  }
}

function riskPillMeta(risk: MatchPick["risk"]): {
  label: string;
  className: string;
} {
  if (risk === "conservador") {
    return { label: "Escudo Conservador", className: "pl-pill pl-pill--success" };
  }
  if (risk === "arriesgado") {
    return { label: "Alto Valor", className: "pl-pill pl-pill--warning" };
  }
  return { label: "Balanceado", className: "pl-pill pl-pill--brand" };
}

export function LandingSurface(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    month1NoCardMode,
    parlayLegs,
    addPickToParlay,
    removePickFromParlay,
    openComposer,
    setAuraFromGame,
    navigateTo,
    pushToast,
  } = usePlatform();

  const defaultPromoGame = useMemo<PlatformGame | undefined>(() => {
    const withPromo = dataset.games.find(
      (g) => g.status !== "FT" && g.picks.some((p) => p.isDailyOpenPromo),
    );
    if (withPromo) return withPromo;
    const anyPromo = dataset.games.find((g) => g.picks.some((p) => p.isDailyOpenPromo));
    if (anyPromo) return anyPromo;
    return dataset.games.find((g) => g.status !== "FT") ?? dataset.games[0];
  }, [dataset.games]);

  const topLeagues = useMemo(() => {
    const byId = new Map(dataset.leagues.map((l) => [l.league, l]));
    const ordered: typeof dataset.leagues = [];

    for (const lid of PREFERRED_LEAGUE_ORDER) {
      const found = byId.get(lid);
      if (found) ordered.push(found);
    }
    for (const lg of dataset.leagues) {
      if (!ordered.some((x) => x.league === lg.league)) {
        ordered.push(lg);
      }
    }

    const top5 = ordered.slice(0, 5);
    if (
      defaultPromoGame &&
      !top5.some((x) => x.league === defaultPromoGame.league)
    ) {
      const promoLg = byId.get(defaultPromoGame.league);
      if (promoLg && top5.length > 0) {
        top5[top5.length - 1] = promoLg;
      }
    }
    return top5;
  }, [dataset.leagues, defaultPromoGame]);

  const [selectedLeague, setSelectedLeague] = useState<LeagueId>(
    () => defaultPromoGame?.league ?? topLeagues[0]?.league ?? asLeagueId("liga-mx"),
  );
  const [selectedGameId, setSelectedGameId] = useState<string>(
    () => defaultPromoGame?.id ?? "",
  );
  const [selectedPickId, setSelectedPickId] = useState<string>("");
  const [userOddsInput, setUserOddsInput] = useState<string>("2.05");

  const heroGamePool = useMemo(() => {
    const upcomingInLeague = dataset.games.filter(
      (g) => g.league === selectedLeague && g.status !== "FT",
    );
    const allInLeague = dataset.games.filter((g) => g.league === selectedLeague);
    const base = upcomingInLeague.length > 0 ? upcomingInLeague : allInLeague;

    const sorted = base.slice().sort((a, b) => {
      const aOpen = a.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      const bOpen = b.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      return bOpen - aOpen;
    });

    if (sorted.length >= 2) {
      return sorted.slice(0, 4);
    }

    const extras = dataset.games.filter(
      (g) => g.status !== "FT" && !sorted.some((x) => x.id === g.id),
    );
    return [...sorted, ...extras].slice(0, 4);
  }, [dataset.games, selectedLeague]);

  const activeGame = useMemo(() => {
    return (
      heroGamePool.find((g) => g.id === selectedGameId) ??
      heroGamePool[0] ??
      defaultPromoGame
    );
  }, [heroGamePool, selectedGameId, defaultPromoGame]);

  const displayedPicks = useMemo(
    () => (activeGame ? activeGame.picks.slice(0, 4) : []),
    [activeGame],
  );

  const unlockedCount = useMemo(() => {
    if (!activeGame) return 0;
    return activeGame.picks.filter((pk) =>
      isPickUnlocked(pk, activeGame.status, viewerRole),
    ).length;
  }, [activeGame, viewerRole]);

  const activeUnlockedPick = useMemo(() => {
    if (!activeGame) return undefined;
    const explicit = displayedPicks.find(
      (pk) => pk.id === selectedPickId && isPickUnlocked(pk, activeGame.status, viewerRole),
    );
    if (explicit) return explicit;
    return activeGame.picks.find((pk) =>
      isPickUnlocked(pk, activeGame.status, viewerRole),
    );
  }, [activeGame, displayedPicks, selectedPickId, viewerRole]);

  const parsedUserOdds = useMemo(() => {
    const raw = userOddsInput.trim().replace(",", ".");
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return activeUnlockedPick?.marketDecimal ?? 2.05;
    }
    if (/^[+-]/.test(raw) && Math.abs(num) >= 100) {
      return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
    }
    return num > 1.01 ? num : activeUnlockedPick?.marketDecimal ?? 2.05;
  }, [userOddsInput, activeUnlockedPick]);

  const liveEdgePts = activeUnlockedPick
    ? Math.round((activeUnlockedPick.p - 1 / parsedUserOdds) * 1000) / 10
    : 0;
  const isPositiveEdge = liveEdgePts > 0.2;

  const homeColor = activeGame
    ? (getTeamColors(activeGame.league, activeGame.home.slug)?.[0] ?? "var(--pl-orb-violet)")
    : "var(--pl-orb-violet)";
  const awayColor = activeGame
    ? (getTeamColors(activeGame.league, activeGame.away.slug)?.[0] ?? "var(--pl-orb-sky)")
    : "var(--pl-orb-sky)";

  const projectionUnlocked = activeGame
    ? isPreGameIntelUnlocked(activeGame, viewerRole)
    : false;

  const settledAuditGames = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status === "FT" && g.score !== undefined && g.picks.length > 0)
        .slice(0, 4),
    [dataset.games],
  );

  const sofiaCreator = TIPSTAR_CREATORS[0]!;
  const tipstarWeeklyGame = useMemo(
    () =>
      dataset.games.find((g) => g.picks.some((p) => p.isTipstarWeeklyOpen)) ??
      dataset.games.find((g) => g.status !== "FT") ??
      dataset.games[0],
    [dataset.games],
  );
  const tipstarWeeklyPick = useMemo(() => {
    if (!tipstarWeeklyGame) return undefined;
    return (
      tipstarWeeklyGame.picks.find((p) => p.isTipstarWeeklyOpen) ??
      tipstarWeeklyGame.picks[0]
    );
  }, [tipstarWeeklyGame]);

  const handleSelectLeague = (league: LeagueId) => {
    setSelectedLeague(league);
    const nextUpcoming = dataset.games.filter(
      (g) => g.league === league && g.status !== "FT",
    );
    const nextPool =
      nextUpcoming.length > 0
        ? nextUpcoming
        : dataset.games.filter((g) => g.league === league);
    const nextSorted = nextPool.slice().sort((a, b) => {
      const aOpen = a.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      const bOpen = b.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      return bOpen - aOpen;
    });
    const firstGame = nextSorted[0];
    if (firstGame) {
      setSelectedGameId(firstGame.id);
      setSelectedPickId("");
      setAuraFromGame(firstGame);
    }
  };

  const handleSelectGame = (game: PlatformGame) => {
    setSelectedGameId(game.id);
    setSelectedPickId("");
    setAuraFromGame(game);
  };

  const watermarkText = getSessionWatermark(viewerRole);

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/" />

      <main
        id="main"
        className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-14"
      >
        {/* ==================== TOP LAUNCH & ROLE BAR ==================== */}
        <div className="glass-ring glass-card rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="pl-pill pl-pill--success">
              <MaestroIcon name="sparkles" size={12} />
              <span>
                {month1NoCardMode
                  ? "MES 1 LANZAMIENTO · PRUEBA SIN TARJETA"
                  : "PASE TOTAL PITCHLAB"}
              </span>
            </span>
            <span style={{ color: "var(--pl-text-secondary)" }}>
              {viewerRole === "visitor" ? (
                <>
                  <strong>Visitante sin pago</strong> — viendo 1 pick promo (cero fuga del
                  resto de la jornada)
                </>
              ) : (
                <>
                  <strong>{watermarkText}</strong> — {activeGame?.picks.length ?? 5} picks
                  desbloqueados
                </>
              )}
            </span>
          </div>

          <RoleSwitcherPill compact />
        </div>

        {/* ==================== HERO PRINCIPAL (6 + 6) ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Columna izquierda: Identidad editorial + CTAs + Blindaje Cero Fuga */}
          <div className="lg:col-span-6 flex flex-col items-start gap-5 lg:pt-1">
            <GlassActionRow
              href="#motores"
              onClick={() => {
                if (typeof document !== "undefined") {
                  document.getElementById("motores")?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              leading={
                <MaestroIcon
                  name="cpu"
                  size={16}
                  style={{ color: "var(--pl-brand)" }}
                />
              }
              title={
                <span>
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    Spacetime Suite v3.0 ·{" "}
                  </span>
                  <strong>+358k partidos · DS + ML + IA</strong>
                </span>
              }
              className="sm:w-auto"
            />

            <h1 className="m-0 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.04]">
              El súper-tipster cuantitativo.
              <br />
              <span style={{ color: "var(--pl-brand)" }}>
                Multi-picks y parlays con IA.
              </span>
            </h1>

            <p
              className="m-0 text-base leading-relaxed"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              Nuestros motores propietarios (<strong>Tachyon v3.0</strong>,{" "}
              <strong>Singularity v3.0</strong>, <strong>Minkowski v3.0</strong> y{" "}
              <strong>Cortex IA</strong>) validados en{" "}
              <strong className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</strong>{" "}
              partidos radiografían cada juego, liberan{" "}
              <strong>hasta 5 picks por encuentro</strong> y arman parlays inteligentes sin
              contradicciones.
            </p>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary !min-h-[46px] !px-6 text-sm flex-1 sm:flex-initial"
              >
                <span>
                  {month1NoCardMode
                    ? "Probar gratis sin tarjeta"
                    : `Activar Pase Total · $${MEMBERSHIP_SPEC.monthlyMxn}`}
                </span>
                <MaestroIcon name="arrowRight" size={16} />
              </a>

              <a
                href="/app/parlays"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/parlays");
                }}
                className="pl-btn-glass glass-ring !min-h-[46px] !px-5 text-sm flex-1 sm:flex-initial"
              >
                <MaestroIcon name="layers" size={16} />
                <span>Armador de Parlays</span>
              </a>
            </div>

            <NoticeCard
              icon="shield"
              badgeText="Blindaje"
              title="Suscripción Cero Fuga"
              tone="brand"
            >
              Pase Total ${MEMBERSHIP_SPEC.monthlyMxn} MXN/mes · 4–5 picks/juego · Comunidad
              exclusiva socios · Referidos doble vía +15d.
            </NoticeCard>

            {activeGame ? (
              <GlassActionRow
                href={`/app/${activeGame.league}/games/${activeGame.id}`}
                onClick={() =>
                  navigateTo(`/app/${activeGame.league}/games/${activeGame.id}`)
                }
                leading={
                  <MaestroIcon
                    name="activity"
                    size={18}
                    style={{ color: "var(--pl-brand)" }}
                  />
                }
                title={`Abrir radiografía completa y los ${activeGame.picks.length} picks de ${activeGame.home.shortName} vs ${activeGame.away.shortName}`}
              />
            ) : null}
          </div>

          {/* Columna derecha: Boleto interactivo multi-liga con candado Cero-Fuga */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="space-y-2">
              {/* 5-League .seg-well Switcher */}
              <div
                className="seg-well glass-ring w-full overflow-x-auto"
                role="group"
                aria-label="Seleccionar liga destacada"
              >
                {topLeagues.map((lg) => {
                  const active = selectedLeague === lg.league;
                  return (
                    <button
                      key={lg.league}
                      type="button"
                      className="seg-btn shrink-0 text-xs"
                      aria-pressed={active}
                      onClick={() => handleSelectLeague(lg.league)}
                    >
                      <LeagueBadge league={lg.league} label={lg.label} size={15} />
                      <span>{shortLeagueLabel(lg.league, lg.label)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Crest-to-crest compact match chips */}
              <div
                className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
                role="tablist"
                aria-label="Seleccionar partido de muestra"
              >
                {heroGamePool.map((item) => {
                  const selected = activeGame?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      data-hero-game-chip={item.id}
                      onClick={() => handleSelectGame(item)}
                      className="glass-ring px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer border-0"
                      style={{
                        background: selected
                          ? "var(--pl-surface-active)"
                          : "var(--pl-surface)",
                        color: selected
                          ? "var(--pl-text)"
                          : "var(--pl-text-secondary)",
                      }}
                    >
                      <TeamBadge
                        league={item.league}
                        slug={item.home.slug}
                        name={item.home.name}
                        size={16}
                      />
                      <span className="num">
                        {item.home.code || item.home.shortName.slice(0, 3).toUpperCase()}
                      </span>
                      <span aria-hidden="true">–</span>
                      <span className="num">
                        {item.away.code || item.away.shortName.slice(0, 3).toUpperCase()}
                      </span>
                      <TeamBadge
                        league={item.league}
                        slug={item.away.slug}
                        name={item.away.name}
                        size={16}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tarjeta estelar del partido */}
            {activeGame ? (
              <div className="glass-lens glass-ring glass-ring--featured relative w-full overflow-hidden rounded-2xl p-5 sm:p-6 space-y-4">
                <LensGlowOrbs primaryColor={homeColor} secondaryColor={awayColor} />

                <div className="relative z-10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                        <LeagueBadge
                          league={activeGame.league}
                          label={activeGame.leagueLabel}
                          size={18}
                        />
                        <span>{activeGame.leagueLabel}</span>
                      </span>
                      <span className="pl-pill pl-pill--success num">
                        Confianza {activeGame.confidenceScore} %
                      </span>
                      <span className="pl-pill pl-pill--brand">
                        <MaestroIcon name="cpu" size={12} />
                        <span>
                          {activeGame.sport === "american-football"
                            ? "Minkowski v3.0"
                            : "Tachyon v3.0"}
                        </span>
                      </span>
                    </div>

                    <span
                      className="text-xs font-semibold num"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {activeGame.dayLabel} · {activeGame.kickoffLocal}
                    </span>
                  </div>

                  {/* Marcador de 3 columnas con CrestPedestal y Proyección Suite v2.1 */}
                  <div className="grid grid-cols-3 items-center gap-3 py-1">
                    <div className="flex flex-col sm:flex-row items-center gap-2.5 text-center sm:text-left">
                      <CrestPedestal glowColor={homeColor} size="md">
                        <TeamBadge
                          league={activeGame.league}
                          slug={activeGame.home.slug}
                          name={activeGame.home.name}
                          size={34}
                        />
                      </CrestPedestal>
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm sm:text-base leading-tight truncate">
                          {activeGame.home.shortName}
                        </div>
                        <div
                          className="num text-xs mt-0.5"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {activeGame.home.record}
                        </div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="num text-2xl sm:text-3xl font-extrabold tracking-tight">
                        {projectionUnlocked
                          ? `${activeGame.projection.home.toFixed(1)} – ${activeGame.projection.away.toFixed(1)}`
                          : "🔒 – 🔒"}
                      </div>
                      <div
                        className="text-[11px] font-semibold mt-0.5"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        Proyección Suite v2.1
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 text-center sm:text-right">
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm sm:text-base leading-tight truncate">
                          {activeGame.away.shortName}
                        </div>
                        <div
                          className="num text-xs mt-0.5"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {activeGame.away.record}
                        </div>
                      </div>
                      <CrestPedestal glowColor={awayColor} size="md">
                        <TeamBadge
                          league={activeGame.league}
                          slug={activeGame.away.slug}
                          name={activeGame.away.name}
                          size={34}
                        />
                      </CrestPedestal>
                    </div>
                  </div>

                  {/* ProbSplit + etiquetas numéricas */}
                  <div className="space-y-1.5">
                    <ProbSplit
                      probabilities={
                        activeGame.sport === "american-football"
                          ? [activeGame.x12[0], activeGame.x12[2]]
                          : activeGame.x12
                      }
                      labels={
                        activeGame.sport === "american-football"
                          ? [activeGame.home.shortName, activeGame.away.shortName]
                          : [activeGame.home.shortName, "Empate", activeGame.away.shortName]
                      }
                    />
                    <div
                      className="flex justify-between text-xs num"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      <span>
                        {activeGame.home.shortName}{" "}
                        <strong style={{ color: "var(--pl-text)" }}>
                          {(activeGame.x12[0] * 100).toFixed(1)} %
                        </strong>
                      </span>
                      {activeGame.sport !== "american-football" ? (
                        <span>
                          Empate{" "}
                          <strong style={{ color: "var(--pl-text)" }}>
                            {(activeGame.x12[1] * 100).toFixed(1)} %
                          </strong>
                        </span>
                      ) : null}
                      <span>
                        {activeGame.away.shortName}{" "}
                        <strong style={{ color: "var(--pl-text)" }}>
                          {(activeGame.x12[2] * 100).toFixed(1)} %
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ==================== 4 PICK SLOTS + GEODESIC CALCULATOR ==================== */}
            {activeGame ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-base font-bold tracking-tight num">
                    Picks detectados en este partido ({unlockedCount}/{activeGame.picks.length}{" "}
                    visibles)
                  </h2>
                  <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {viewerRole !== "visitor"
                      ? "Pase Total activo"
                      : "1 Pick Abierto · Resto con Pase Total"}
                  </span>
                </div>

                {displayedPicks.map((pk) => {
                  const unlocked = isPickUnlocked(pk, activeGame.status, viewerRole);
                  const riskMeta = riskPillMeta(pk.risk);

                  if (!unlocked) {
                    return (
                      <div
                        key={pk.id}
                        className="glass-ring glass-card rounded-xl p-4 space-y-2.5"
                        data-locked-pick=""
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span
                            className="font-bold inline-flex items-center gap-1.5"
                            style={{ color: "var(--pl-brand)" }}
                          >
                            <MaestroIcon name="lock" size={13} />
                            <span>
                              {pk.categoryLabel} · {pk.engineName}
                            </span>
                          </span>
                          <span className={riskMeta.className}>{riskMeta.label}</span>
                        </div>

                        <div className="ticket-perf" />

                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <div
                              className="locked-redact font-extrabold text-sm"
                              aria-hidden="true"
                            >
                              SELECCIÓN RESERVADA PASE TOTAL
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: "var(--pl-text-muted)" }}
                            >
                              Ventaja positiva detectada · Desbloquea con Pase Total
                            </div>
                          </div>

                          <a
                            href="/signup"
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo("/signup");
                            }}
                            className="pl-btn-glass glass-ring !min-h-[30px] !px-3 !text-xs shrink-0"
                          >
                            Desbloquear
                          </a>
                        </div>
                      </div>
                    );
                  }

                  const isSelected = activeUnlockedPick?.id === pk.id;
                  const inParlay = parlayLegs.some((l) => l.pick.id === pk.id);

                  return (
                    <div
                      key={pk.id}
                      className="glass-ring glass-card relative w-full overflow-hidden rounded-xl p-4 space-y-2.5"
                      style={
                        isSelected
                          ? {
                              boxShadow:
                                "0 0 0 1px var(--pl-brand), var(--pl-card-shadow)",
                            }
                          : undefined
                      }
                      data-unlocked-pick={pk.id}
                    >
                      {viewerRole !== "visitor" ? (
                        <span className="pl-watermark num" aria-hidden="true">
                          {watermarkText}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedPickId(pk.id);
                          setUserOddsInput(pickReferenceDecimal(pk).toFixed(2));
                        }}
                        className="w-full text-left bg-transparent border-0 p-0 cursor-pointer flex flex-wrap items-center justify-between gap-2"
                        style={{ color: "var(--pl-text)" }}
                      >
                        <span className="flex flex-wrap items-center gap-2 min-w-0">
                          {pk.isDailyOpenPromo ? (
                            <span className="pl-pill pl-pill--success">
                              <MaestroIcon name="sparkles" size={11} />
                              <span>Pick Abierto del Día</span>
                            </span>
                          ) : null}
                          <strong className="font-extrabold text-sm uppercase tracking-wide">
                            {pk.label}
                          </strong>
                        </span>
                        <span className={riskMeta.className}>{riskMeta.label}</span>
                      </button>

                      <div className="ticket-perf" />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-baseline gap-1.5 num text-xs">
                          <span
                            className="text-lg font-extrabold"
                            style={{ color: "var(--pl-brand)" }}
                          >
                            {(pk.p * 100).toFixed(1)} %
                          </span>
                          <span style={{ color: "var(--pl-text-muted)" }}>
                            · Justa{" "}
                            <strong style={{ color: "var(--pl-text)" }}>
                              {formatOddsValue(pk.fairDecimal, oddsFormat)}
                            </strong>{" "}
                            · {pk.engineName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 relative z-10">
                          <button
                            type="button"
                            onClick={() => {
                              if (inParlay) {
                                removePickFromParlay(pk.id);
                                pushToast("Selección retirada del Parlay.", "default");
                              } else {
                                addPickToParlay(pk);
                              }
                            }}
                            className="pl-btn-glass glass-ring !min-h-[30px] !px-2.5 !text-xs"
                            style={
                              inParlay ? { color: "var(--pl-success)" } : undefined
                            }
                          >
                            <MaestroIcon name={inParlay ? "check" : "plus"} size={12} />
                            <span>{inParlay ? "En Parlay" : "Parlay"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openComposer(pk)}
                            className="pl-btn-primary !min-h-[30px] !px-3 !text-xs"
                          >
                            Sellar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Calculadora de momio en vivo Geodesic v2.0 */}
                {activeUnlockedPick ? (
                  <div
                    className="glass-ring glass-card rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                    data-odds-comparator=""
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="landing-user-odds"
                        className="text-xs font-semibold"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        Tu momio para{" "}
                        <strong style={{ color: "var(--pl-text)" }}>
                          {activeUnlockedPick.label}
                        </strong>
                        :
                      </label>
                      <input
                        id="landing-user-odds"
                        data-hero-momio-input=""
                        type="text"
                        inputMode="decimal"
                        value={userOddsInput}
                        onChange={(e) => setUserOddsInput(e.target.value)}
                        className="glass-input rounded-lg px-2.5 py-1 w-24 text-sm font-extrabold num text-center"
                      />
                    </div>

                    <span
                      className={
                        isPositiveEdge
                          ? "pl-pill pl-pill--success num"
                          : "pl-pill pl-pill--warning num"
                      }
                    >
                      Geodesic v2.0:{" "}
                      {liveEdgePts >= 0 ? `+${liveEdgePts.toFixed(1)}` : liveEdgePts.toFixed(1)}{" "}
                      % ({liveEdgePts >= 0 ? `+${liveEdgePts.toFixed(1)}` : liveEdgePts.toFixed(1)}{" "}
                      pts {isPositiveEdge ? "ventaja real" : "bajo justa"})
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {/* ==================== SPACETIME SUITE v2.1 (#motores) ==================== */}
        <TechPrecisionSection />

        {/* ==================== PICK SEMANAL TIPSTAR (@sofia_nfl) + LIQUIDACIONES FT ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Izquierda (5 cols): Boleto semanal de @sofia_nfl */}
          <div className="lg:col-span-5 glass-ring glass-lens glass-ring--featured relative overflow-hidden rounded-2xl p-5 sm:p-6 space-y-4">
            <LensGlowOrbs
              primaryColor="var(--pl-orb-violet)"
              secondaryColor="var(--pl-orb-emerald)"
              subtle
            />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="pl-pill pl-pill--success">
                  <MaestroIcon name="unlock" size={13} />
                  <span>Pick Gratis de la Semana · Tipstar Oficial</span>
                </span>
                {sofiaCreator.isExample ? <ExampleBadge /> : null}
                <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  1 / semana
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-sm font-extrabold shrink-0 avatar-ring"
                  style={{
                    background: sofiaCreator.avatarGradVar,
                    color: "var(--pl-on-solid)",
                  }}
                >
                  {sofiaCreator.avatarInitials}
                </span>
                <div>
                  <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                    <span>
                      {sofiaCreator.name} (@{sofiaCreator.handle})
                    </span>
                    <span className="pl-pill pl-pill--brand">Tipstar</span>
                  </div>
                  <div
                    className="num text-xs font-semibold"
                    style={{ color: "var(--pl-success)" }}
                  >
                    {sofiaCreator.verifiedUnits} verificadas · CLV {sofiaCreator.clvAvg}
                  </div>
                </div>
              </div>

              {tipstarWeeklyGame && tipstarWeeklyPick ? (
                <div
                  className="glass-ring rounded-xl p-4 space-y-2.5"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <div
                    className="text-xs flex flex-wrap items-center justify-between gap-1"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <span>
                      {tipstarWeeklyGame.leagueLabel} · {tipstarWeeklyPick.matchLabel}
                    </span>
                    <span>{tipstarWeeklyPick.engineName}</span>
                  </div>
                  <div className="font-extrabold text-base uppercase tracking-wide">
                    {tipstarWeeklyPick.label}
                  </div>
                  <div className="ticket-perf" />
                  <div className="flex flex-wrap items-center justify-between gap-2 num text-xs">
                    <span>
                      Probabilidad{" "}
                      <strong style={{ color: "var(--pl-brand)" }}>
                        {(tipstarWeeklyPick.p * 100).toFixed(1)} %
                      </strong>{" "}
                      · Justa{" "}
                      <strong>
                        {formatOddsValue(tipstarWeeklyPick.fairDecimal, oddsFormat)}
                      </strong>
                    </span>
                    <span
                      className="font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                    >
                      {tipstarWeeklyPick.marketDecimal === null ? "Momio justo " : "Momio "}
                      {formatOddsValue(pickReferenceDecimal(tipstarWeeklyPick), oddsFormat)}
                    </span>
                  </div>
                </div>
              ) : null}

              <div
                className="glass-ring rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2"
                style={{ background: "var(--pl-compare-surface)" }}
              >
                <div className="text-xs space-y-0.5">
                  <div className="font-extrabold" style={{ color: "var(--pl-brand)" }}>
                    CÓDIGO: {sofiaCreator.promoCode} ({sofiaCreator.freeDays} días gratis)
                  </div>
                  <div style={{ color: "var(--pl-text-secondary)" }}>
                    {sofiaCreator.freeDays} días de Pase Total gratis{" "}
                    {month1NoCardMode ? "sin tarjeta" : ""}
                  </div>
                </div>
                <a
                  href={`/signup?code=${sofiaCreator.promoCode}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(`/signup?code=${sofiaCreator.promoCode}`);
                  }}
                  className="pl-btn-primary !min-h-[34px] !px-3.5 !text-xs"
                >
                  Canjear {sofiaCreator.promoCode}
                </a>
              </div>

              <GlassActionRow
                href="/p/sofia-sem"
                onClick={() => navigateTo("/p/sofia-sem")}
                leading={
                  <MaestroIcon
                    name="ticket"
                    size={16}
                    style={{ color: "var(--pl-brand)" }}
                  />
                }
                title="Abrir boleto público /p/sofia-sem"
              />
            </div>
          </div>

          {/* Derecha (7 cols): Resultados recientes liquidados FT */}
          <div className="lg:col-span-7 glass-ring glass-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="m-0 text-lg font-bold tracking-tight">
                  Resultados recientes liquidados (Públicos y auditados)
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Mostramos ganados y perdidos reales congelados al silbatazo. Cero fuga de
                  picks futuros.
                </p>
              </div>

              <a
                href="/app/historial"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/app/historial");
                }}
                className="pl-btn-glass glass-ring !min-h-[32px] !px-3 !text-xs"
              >
                <span>Ver historial completo</span>
                <MaestroIcon name="chevronRight" size={14} />
              </a>
            </div>

            <div className="space-y-3">
              {settledAuditGames.map((fg) => {
                const fpk = fg.picks[0]!;
                const isHit = fpk.result !== "miss";

                return (
                  <div
                    key={fg.id}
                    className="glass-ring rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div className="space-y-1 min-w-0">
                      <div
                        className="text-xs flex flex-wrap items-center gap-2 num"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        <LeagueBadge league={fg.league} label={fg.leagueLabel} size={16} />
                        <span>
                          {fg.home.shortName}{" "}
                          <strong style={{ color: "var(--pl-text)" }}>
                            {fg.score?.home ?? 0}–{fg.score?.away ?? 0}
                          </strong>{" "}
                          {fg.away.shortName}
                        </span>
                        <span>·</span>
                        <span>{fg.dayLabel}</span>
                      </div>
                      <div className="font-bold text-sm uppercase truncate">
                        {fpk.label}{" "}
                        <span
                          className="text-xs font-normal normal-case"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          · {fpk.engineName}
                        </span>
                      </div>
                    </div>

                    <div className="text-right num text-xs space-y-1">
                      <div>
                        <span
                          className={
                            isHit
                              ? "pl-pill pl-pill--success"
                              : "pl-pill pl-pill--warning"
                          }
                        >
                          {isHit ? "CUMPLIDO" : "NO CUMPLIDO"}
                        </span>
                      </div>
                      <div style={{ color: "var(--pl-text-muted)" }}>
                        {(fpk.p * 100).toFixed(1)} % · Justa{" "}
                        {formatOddsValue(fpk.fairDecimal, oddsFormat)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ==================== PASE TOTAL + REFERIDOS + TIPSTAR PORTAL ==================== */}
        <PlansAndReferralsSection />
      </main>

      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
