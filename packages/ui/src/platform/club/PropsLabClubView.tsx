"use client";

import React, { useMemo, useState } from "react";
import { sportForLeague, type PlatformSport } from "@pitchlab/contracts";
import { TeamBadge, parseUserOdds } from "../../sports";
import { decimalToAmericanInt, formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  PlayerPropStreakCard,
  type PlayerPropStreakCardProps,
} from "../components/PlayerPropStreakCard";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import { SportEventIcon } from "../components/SportEventIcons";
import {
  buildPlayerPropsCatalog,
  evaluatePropLineProbability,
} from "../match-picks-engine";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { resolveMatchRefereeAnalytics } from "../referee-stats";
import type { MatchPick, PlayerPropItem } from "../types";
import {
  MIN_SAMPLE_GUARD_LABEL,
  NBA_STAT_CODE_ORDER,
  resolveNbaPropStatCode,
  resolvePlayerLineupSignal,
  type NbaStructuredStatCode,
} from "./team/props-context-helpers";

export type NbaPropStatCode = NbaStructuredStatCode;

export interface PropsStreakExplorerItem extends PlayerPropStreakCardProps {
  readonly id: string;
  readonly sport: string;
  readonly leagueLabel: string;
  readonly avgMinutes?: number | null;
  readonly minMinutesGuard?: boolean;
  readonly availabilityStatus?: "available" | "doubtful";
}

export interface PropsLabRefereeSummary {
  readonly name: string;
  readonly avgYellow: number | null;
  readonly avgFouls: number | null;
  readonly rigorLabel?: string | null;
}

export interface PropsLabPlayerPropItem extends PlayerPropItem {
  readonly sport?: PlatformSport;
  readonly statCode?: NbaPropStatCode | string | null;
  readonly avgMinutes?: number | null;
  readonly sampleGames?: number | null;
  readonly minMinutesGuard?: boolean;
  readonly lineupStatus?: "confirmed" | "probable" | null;
  readonly availabilityStatus?: "available" | "doubtful";
  readonly injuryNote?: string | null;
  readonly playerHref?: string | null;
  readonly hasVerifiedMarketQuote?: boolean;
  readonly refereeSummary?: PropsLabRefereeSummary | null;
}

export interface PropsLabClubViewProps {
  streakCards?: readonly PropsStreakExplorerItem[];
  playerProps?: readonly PropsLabPlayerPropItem[];
}

const INITIAL_STREAK_PAGE_SIZE = 8;
const INITIAL_CATALOG_PAGE_SIZE = 10;

const PROPS_SPORT_LABELS: Readonly<Record<string, string>> = {
  basketball: "NBA",
  football: "Fútbol",
  "american-football": "NFL",
  "ice-hockey": "NHL",
  baseball: "MLB",
};

const PROPS_SPORT_ORDER: readonly string[] = [
  "basketball",
  "football",
  "american-football",
  "ice-hockey",
  "baseball",
];

export function PropsLabClubView({
  streakCards = [],
  playerProps,
}: PropsLabClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, hasAccountSession, upgradeHref, oddsFormat } = usePlatformCore();
  const { sealPickToJournal, navigateTo } = usePlatformActions();
  const journal = useJournalEntries();
  const effectivePlayerProps = (playerProps ?? dataset.playerProps) as
    | readonly PropsLabPlayerPropItem[]
    | undefined;
  const rawCatalog = useMemo(
    () => buildPlayerPropsCatalog(dataset.games, effectivePlayerProps) as PropsLabPlayerPropItem[],
    [dataset.games, effectivePlayerProps],
  );
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});
  const [propOddsInputs, setPropOddsInputs] = useState<Record<string, string>>(
    {},
  );
  const [activeSport, setActiveSport] = useState<string>("all");
  const [nbaStatFilter, setNbaStatFilter] = useState<NbaPropStatCode | "all">("all");
  const [onlyMinMinutesGuard, setOnlyMinMinutesGuard] = useState<boolean>(false);
  const [onlyLineupSignal, setOnlyLineupSignal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [streakVisibleCount, setStreakVisibleCount] = useState<number>(INITIAL_STREAK_PAGE_SIZE);
  const [catalogVisibleCount, setCatalogVisibleCount] = useState<number>(INITIAL_CATALOG_PAGE_SIZE);

  const gamesById = useMemo(() => {
    const map = new Map<string, (typeof dataset.games)[number]>();
    for (const g of dataset.games) {
      map.set(g.id, g);
    }
    return map;
  }, [dataset.games]);

  const enrichedCatalog = useMemo(() => {
    return rawCatalog
      .map((prop) => {
        const sport: PlatformSport = prop.sport ?? sportForLeague(prop.league);
        const statCode =
          prop.statCode ?? (sport === "basketball" ? resolveNbaPropStatCode(prop.statLabel) : null);
        const lineupSignal = resolvePlayerLineupSignal(dataset.games, {
          league: prop.league,
          teamSlug: prop.teamSlug,
          playerName: prop.player,
          gameId: prop.gameId,
          sport,
          explicitStatus: prop.lineupStatus ?? null,
        });
        if (lineupSignal?.status === "ruled_out") return null;

        let refereeSummary: PropsLabRefereeSummary | null = prop.refereeSummary ?? null;
        if (!refereeSummary && sport === "football") {
          const matchedGame = gamesById.get(prop.gameId);
          if (matchedGame) {
            const refAnalytics = resolveMatchRefereeAnalytics(matchedGame, dataset.games);
            if (
              refAnalytics &&
              (refAnalytics.avgYellow !== null || refAnalytics.avgFouls !== null)
            ) {
              refereeSummary = {
                name: refAnalytics.name,
                avgYellow: refAnalytics.avgYellow,
                avgFouls: refAnalytics.avgFouls,
                rigorLabel: refAnalytics.rigorLabel,
              };
            }
          }
        }

        const minMinutesMet =
          prop.minMinutesGuard === true ||
          (prop.minMinutesGuard !== false &&
            (sport === "basketball"
              ? (prop.avgMinutes == null || prop.avgMinutes >= 18) &&
                (prop.sampleGames == null || prop.sampleGames >= 3)
              : true));

        return {
          prop,
          sport,
          statCode,
          lineupSignal,
          refereeSummary,
          minMinutesMet,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [dataset.games, gamesById, rawCatalog]);

  const availableSports = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of enrichedCatalog) {
      counts.set(item.sport, (counts.get(item.sport) ?? 0) + 1);
    }
    for (const card of streakCards) {
      if (!counts.has(card.sport)) {
        counts.set(card.sport, 0);
      }
    }
    const keys = Array.from(counts.keys()).sort((a, b) => {
      const ia = PROPS_SPORT_ORDER.indexOf(a);
      const ib = PROPS_SPORT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map((id) => ({
      id,
      label: PROPS_SPORT_LABELS[id] ?? id,
      propCount: counts.get(id) ?? 0,
      streakCount: streakCards.filter((c) => c.sport === id).length,
    }));
  }, [enrichedCatalog, streakCards]);

  const nbaStatCounts = useMemo(() => {
    const counts: Record<NbaPropStatCode, number> = { PTS: 0, REB: 0, AST: 0, "3PM": 0 };
    for (const item of enrichedCatalog) {
      if (item.sport !== "basketball") continue;
      if (
        item.statCode === "PTS" ||
        item.statCode === "REB" ||
        item.statCode === "AST" ||
        item.statCode === "3PM"
      ) {
        counts[item.statCode] += 1;
      }
    }
    return counts;
  }, [enrichedCatalog]);

  const totalNbaProps =
    nbaStatCounts.PTS + nbaStatCounts.REB + nbaStatCounts.AST + nbaStatCounts["3PM"];

  const hasAnyLineupSignal = useMemo(
    () =>
      enrichedCatalog.some(
        (item) =>
          item.lineupSignal?.status === "confirmed" || item.lineupSignal?.status === "probable",
      ),
    [enrichedCatalog],
  );

  const hasAnyMinGuardDiff = useMemo(
    () =>
      enrichedCatalog.some((item) => item.minMinutesMet) ||
      streakCards.some((c) => c.minMinutesGuard),
    [enrichedCatalog, streakCards],
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedCatalog.filter((item) => {
      if (activeSport !== "all" && item.sport !== activeSport) return false;
      if (nbaStatFilter !== "all") {
        if (item.sport !== "basketball" || item.statCode !== nbaStatFilter) return false;
      }
      if (onlyMinMinutesGuard && !item.minMinutesMet) return false;
      if (
        onlyLineupSignal &&
        item.lineupSignal?.status !== "confirmed" &&
        item.lineupSignal?.status !== "probable"
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.prop.player.toLowerCase().includes(q) ||
        item.prop.teamName.toLowerCase().includes(q) ||
        item.prop.leagueLabel.toLowerCase().includes(q) ||
        item.prop.statLabel.toLowerCase().includes(q) ||
        (item.statCode ? item.statCode.toLowerCase().includes(q) : false)
      );
    });
  }, [
    activeSport,
    enrichedCatalog,
    nbaStatFilter,
    onlyLineupSignal,
    onlyMinMinutesGuard,
    searchQuery,
  ]);

  const filteredStreaks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return streakCards.filter((card) => {
      if (activeSport !== "all" && card.sport !== activeSport) return false;
      if (onlyMinMinutesGuard && card.minMinutesGuard === false) return false;
      if (!q) return true;
      return (
        card.playerName.toLowerCase().includes(q) ||
        card.teamName.toLowerCase().includes(q) ||
        card.leagueLabel.toLowerCase().includes(q)
      );
    });
  }, [activeSport, onlyMinMinutesGuard, searchQuery, streakCards]);

  const handleSealProp = (
    prop: PropsLabPlayerPropItem,
    activeLine: number,
    pOver: number,
    fairOverDecimal: number,
    userDecimal: number,
  ) => {
    const propPickId = `${prop.id}-over-${activeLine.toFixed(1)}`;
    const syntheticPropPick: MatchPick = {
      id: propPickId,
      gameId: prop.gameId,
      league: prop.league,
      leagueLabel: prop.leagueLabel,
      matchLabel: prop.matchLabel,
      kickoffLocal: prop.kickoffLocal,
      gameStatus: "NS",
      slotIndex: 99,
      category: "valor",
      categoryLabel: `Player Prop · ${prop.statLabel}`,
      risk: pOver >= 0.66 ? "conservador" : pOver >= 0.52 ? "medio" : "arriesgado",
      engineKey: prop.league === "nfl" ? "minkowski" : "tachyon",
      engineName: prop.engineName,
      marketGroup: "Player Props",
      selectionKey: `over_${activeLine.toFixed(1)}`,
      conflictGroup: "independent",
      label: `${prop.player} · Más de ${activeLine.toFixed(1)} ${prop.statLabel}`,
      rationale: prop.contextNote,
      p: pOver,
      fairDecimal: fairOverDecimal,
      fairAmerican: decimalToAmericanInt(fairOverDecimal),
      marketDecimal: userDecimal,
      marketAmerican: decimalToAmericanInt(userDecimal),
      edgePts: (pOver - 1 / userDecimal) * 100,
      confidenceScore: Math.round(Math.min(94, Math.max(55, pOver * 100 + 8))),
      suggestedUnits: 1.0,
    };

    sealPickToJournal(
      syntheticPropPick,
      1.0,
      userDecimal,
      `Props de jugadores · Media proyectada ${prop.projectionMean.toFixed(1)}`,
    );
  };

  return (
    <AtmosphereStage activePath="/app/props">
      <ClubWorkspaceShell activePath="/app/props">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <span className="pl-pill pl-pill--brand pl-pill--wrap inline-flex items-center gap-1.5">
              <MaestroIcon name="sliders" size={12} />
              <span>Líneas alternativas · Spacetime</span>
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Tendencias y props de jugadores
            </h1>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Props NBA (PTS, REB, AST, 3PM) y fútbol ligados a proyección Spacetime, momio justo y guardia de muestra mínima.
            </p>
          </div>

          {viewerRole !== "visitor" && (enrichedCatalog.length > 0 || streakCards.length > 0) ? (
            <div className="flex flex-wrap items-center gap-1.5 num shrink-0">
              {enrichedCatalog.length > 0 ? (
                <span className="pl-pill text-xs font-semibold">
                  {enrichedCatalog.length} props activos
                </span>
              ) : null}
              {totalNbaProps > 0 ? (
                <span className="pl-pill pl-pill--info text-xs font-semibold">
                  NBA {totalNbaProps}
                </span>
              ) : null}
              {hasAnyMinGuardDiff ? (
                <span className="pl-pill pl-pill--success text-xs font-semibold">
                  {MIN_SAMPLE_GUARD_LABEL}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {viewerRole === "visitor" ? (
          <div
            className="glass-card glass-ring rounded-2xl p-6 space-y-3"
            data-cero-fuga-lock="props-lab"
          >
            <h2 className="m-0 text-xl font-extrabold inline-flex items-center gap-2">
              <MaestroIcon name="lock" size={18} style={{ color: "var(--pl-brand)" }} />
              <span>Props de jugadores para Pase PitchLab Ultra</span>
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              {hasAccountSession
                ? "Activa tu Pase PitchLab Ultra para explorar proyecciones individuales calibradas de NBA, fútbol y ligas principales."
                : "Activa tus 7 días gratis para explorar proyecciones individuales calibradas de NBA, fútbol y ligas principales."}
            </p>
            <a
              href={upgradeHref}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(upgradeHref);
              }}
              className="pl-btn-primary text-xs min-h-11 sm:min-h-9 px-4 inline-flex items-center gap-1.5 no-underline"
            >
              <span>{hasAccountSession ? "Activar Pase Ultra" : "Activar prueba gratis"}</span>
              <MaestroIcon name="arrowRight" size={13} />
            </a>
          </div>
        ) : enrichedCatalog.length === 0 && streakCards.length === 0 ? (
          <div className="glass-card glass-ring rounded-2xl p-6 space-y-2" data-props-empty="">
            <h2 className="m-0 text-xl font-extrabold">Props de jugadores: próximamente</h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Spacetime Suite v5.1 todavía no proyecta estadísticas individuales para este filtro. Cuando el motor
              de jugadores publique líneas validadas, aquí verás proyección y ventaja contra tu casa.
            </p>
          </div>
        ) : (
          <>
            <section
              className="glass-card glass-ring rounded-2xl p-4 space-y-3"
              aria-label="Filtrar props y tendencias de jugadores"
              data-props-filter-bar=""
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div
                  className="flex flex-wrap items-center gap-1.5 min-w-0"
                  role="group"
                  aria-label="Filtrar por deporte"
                >
                  <button
                    type="button"
                    className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 num"
                    aria-pressed={activeSport === "all"}
                    onClick={() => {
                      setActiveSport("all");
                      setNbaStatFilter("all");
                      setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                      setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                    }}
                  >
                    Todos ({enrichedCatalog.length + streakCards.length})
                  </button>
                  {availableSports.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 num"
                      aria-pressed={activeSport === sp.id}
                      onClick={() => {
                        setActiveSport(sp.id);
                        if (sp.id !== "basketball") setNbaStatFilter("all");
                        setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                        setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                      }}
                    >
                      {sp.label} ({sp.propCount > 0 ? sp.propCount : sp.streakCount})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
                  <input
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoCorrect="off"
                    spellCheck={false}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                      setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                    }}
                    placeholder="Buscar jugador, equipo o liga…"
                    aria-label="Buscar jugador, equipo o liga en props"
                    className="glass-input text-base sm:text-xs min-h-11 sm:min-h-9 px-3 rounded-xl w-full sm:w-64"
                  />
                </div>
              </div>

              {totalNbaProps > 0 || hasAnyMinGuardDiff || hasAnyLineupSignal ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 hairline-t">
                  {totalNbaProps > 0 && (activeSport === "all" || activeSport === "basketball") ? (
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      role="group"
                      aria-label="Filtrar mercado NBA"
                      data-nba-stat-filter=""
                    >
                      <span
                        className="text-[11px] font-bold uppercase tracking-wide pr-1"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        NBA:
                      </span>
                      <button
                        type="button"
                        className="seg-btn text-xs min-h-11 sm:min-h-9 px-2.5 num"
                        aria-pressed={nbaStatFilter === "all"}
                        onClick={() => {
                          setNbaStatFilter("all");
                          setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                        }}
                      >
                        Todos
                      </button>
                      {NBA_STAT_CODE_ORDER.map((code) => {
                        const count = nbaStatCounts[code];
                        if (count === 0) return null;
                        return (
                          <button
                            key={code}
                            type="button"
                            className="seg-btn text-xs min-h-11 sm:min-h-9 px-2.5 num font-bold"
                            aria-pressed={nbaStatFilter === code}
                            onClick={() => {
                              setActiveSport("basketball");
                              setNbaStatFilter(code);
                              setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                            }}
                          >
                            {code} ({count})
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span />
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasAnyMinGuardDiff ? (
                      <button
                        type="button"
                        className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 font-semibold"
                        aria-pressed={onlyMinMinutesGuard}
                        data-props-min-minutes-toggle=""
                        onClick={() => {
                          setOnlyMinMinutesGuard((v) => !v);
                          setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                        }}
                      >
                        {MIN_SAMPLE_GUARD_LABEL}
                      </button>
                    ) : null}

                    {hasAnyLineupSignal ? (
                      <button
                        type="button"
                        className="seg-btn text-xs min-h-11 sm:min-h-9 px-3 font-semibold"
                        aria-pressed={onlyLineupSignal}
                        data-props-lineup-toggle=""
                        onClick={() => {
                          setOnlyLineupSignal((v) => !v);
                          setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                        }}
                      >
                        Titular confirmado / probable
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

            {enrichedCatalog.length > 0 ? (
              <section className="space-y-4" aria-label="Props calibrados por partido">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-base sm:text-lg font-extrabold">
                    Proyecciones individuales calibradas
                  </h2>
                  <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                    {filteredCatalog.length}{" "}
                    {filteredCatalog.length === 1 ? "prop disponible" : "props disponibles"}
                  </span>
                </div>

                {filteredCatalog.length === 0 ? (
                  <div className="glass-card glass-ring rounded-2xl p-5 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    No hay proyecciones individuales que coincidan con este filtro. Prueba quitando algún criterio o cambiando de deporte.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {filteredCatalog.slice(0, catalogVisibleCount).map((entry) => {
                        const { prop, statCode, lineupSignal, refereeSummary, minMinutesMet } = entry;
                        const offset = lineOffsets[prop.id] ?? 0;
                        const activeLine = Math.min(
                          prop.maxLine,
                          Math.max(prop.minLine, prop.baseLine + offset * prop.step),
                        );
                        const evalRes = evaluatePropLineProbability(
                          prop.projectionMean,
                          prop.projectionSd,
                          activeLine,
                        );
                        const l10Hits = prop.last10.filter((v) => v > activeLine).length;
                        const l5Sample = prop.last10.slice(-5);
                        const l5Hits = l5Sample.filter((v) => v > activeLine).length;
                        const maxVal = Math.max(...prop.last10, activeLine * 1.2, 1);

                        const rawOddsText = propOddsInputs[prop.id] ?? "";
                        const parsedCustomDec = rawOddsText.trim()
                          ? parseUserOdds(rawOddsText)
                          : null;
                        const hasUserOdds = Boolean(parsedCustomDec && parsedCustomDec > 1.01);
                        const hasComparableMarketOdds =
                          hasUserOdds || prop.hasVerifiedMarketQuote === true;
                        const activeBookOverDec =
                          hasUserOdds && parsedCustomDec
                            ? parsedCustomDec
                            : prop.hasVerifiedMarketQuote
                              ? prop.marketOverDecimal
                              : evalRes.fairOverDecimal;
                        const liveEdgePts = (evalRes.pOver - 1 / activeBookOverDec) * 100;

                        const propPickId = `${prop.id}-over-${activeLine.toFixed(1)}`;
                        const alreadySealed = journal.some((j) => j.pickId === propPickId);
                        const isDoubtful =
                          prop.availabilityStatus === "doubtful" ||
                          lineupSignal?.status === "doubtful";

                        return (
                          <article
                            key={prop.id}
                            className="glass-card glass-ring rounded-2xl p-5 space-y-4"
                            data-prop-card={prop.id}
                          >
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <span
                                    className="inline-flex items-center justify-center rounded-xl size-10 shrink-0"
                                    style={{
                                      background: "var(--pl-surface)",
                                      border: "1px solid var(--pl-border)",
                                    }}
                                  >
                                    <TeamBadge
                                      league={prop.league}
                                      slug={prop.teamSlug}
                                      name={prop.teamName}
                                      size={28}
                                    />
                                  </span>
                                  <div className="min-w-0">
                                    <span
                                      className="text-xs font-bold block truncate num"
                                      style={{ color: "var(--pl-brand)" }}
                                    >
                                      {prop.leagueLabel} · {prop.matchLabel}
                                      {prop.kickoffLocal ? ` · ${prop.kickoffLocal}` : ""}
                                    </span>
                                    <h3 className="m-0 text-base sm:text-lg font-extrabold truncate">
                                      {prop.playerHref ? (
                                        <a
                                          href={prop.playerHref}
                                          onClick={(e) => {
                                            if (
                                              e.metaKey ||
                                              e.ctrlKey ||
                                              e.shiftKey ||
                                              e.altKey ||
                                              e.button !== 0
                                            ) {
                                              return;
                                            }
                                            e.preventDefault();
                                            navigateTo(prop.playerHref!);
                                          }}
                                          className="pl-team-link"
                                        >
                                          {prop.player}
                                        </a>
                                      ) : (
                                        prop.player
                                      )}{" "}
                                      · {prop.statLabel}
                                    </h3>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  {statCode ? (
                                    <span className="pl-pill pl-pill--info text-[11px] font-extrabold num">
                                      {statCode}
                                    </span>
                                  ) : null}
                                  <span className="pl-pill text-[11px]">{prop.position}</span>
                                </div>
                              </div>

                              {minMinutesMet || lineupSignal || isDoubtful ? (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] num">
                                  {minMinutesMet ? (
                                    <span
                                      className="pl-pill pl-pill--success font-semibold"
                                      data-prop-sample-guard="met"
                                    >
                                      {MIN_SAMPLE_GUARD_LABEL}
                                      {prop.avgMinutes != null
                                        ? ` · ${prop.avgMinutes.toFixed(1)} min/p`
                                        : ""}
                                    </span>
                                  ) : null}
                                  {lineupSignal &&
                                  (lineupSignal.status === "confirmed" ||
                                    lineupSignal.status === "probable") ? (
                                    <span
                                      className={`pl-pill font-semibold ${
                                        lineupSignal.status === "confirmed"
                                          ? "pl-pill--success"
                                          : "pl-pill--info"
                                      }`}
                                      data-prop-lineup-signal={lineupSignal.status}
                                    >
                                      {lineupSignal.label}
                                    </span>
                                  ) : null}
                                  {isDoubtful ? (
                                    <span className="pl-pill pl-pill--warning font-semibold">
                                      En duda
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="pl-parlay-surface-tile rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <span
                                    className="block text-xs"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    Línea evaluada ({prop.engineName})
                                  </span>
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <strong
                                      className="num text-xl font-extrabold"
                                      data-prop-line={prop.id}
                                    >
                                      {activeLine.toFixed(1)}
                                    </strong>
                                    <span
                                      className="text-xs num font-bold"
                                      style={{ color: "var(--pl-success)" }}
                                    >
                                      Proy. Spacetime: {prop.projectionMean.toFixed(1)}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={offset === 0}
                                    onClick={() =>
                                      setLineOffsets((prev) => ({
                                        ...prev,
                                        [prop.id]: 0,
                                      }))
                                    }
                                    className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-2.5 num"
                                  >
                                    Base ({prop.baseLine.toFixed(1)})
                                  </button>

                                  <div
                                    className="sl-stepper"
                                    role="group"
                                    aria-label={`Ajustar línea de ${prop.player}`}
                                  >
                                    <button
                                      type="button"
                                      className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                                      aria-label={`Bajar línea de ${prop.player}`}
                                      onClick={() =>
                                        setLineOffsets((prev) => ({
                                          ...prev,
                                          [prop.id]: (prev[prop.id] ?? 0) - 1,
                                        }))
                                      }
                                    >
                                      −
                                    </button>
                                    <span className="num">Línea</span>
                                    <button
                                      type="button"
                                      className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                                      aria-label={`Subir línea de ${prop.player}`}
                                      onClick={() =>
                                        setLineOffsets((prev) => ({
                                          ...prev,
                                          [prop.id]: (prev[prop.id] ?? 0) + 1,
                                        }))
                                      }
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {prop.last10.length > 0 ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs num">
                                    <span style={{ color: "var(--pl-text-muted)" }}>
                                      Últimos {prop.last10.length} juegos vs línea {activeLine.toFixed(1)}
                                    </span>
                                    <strong>
                                      {l5Sample.length > 0 ? `L${l5Sample.length}: ${l5Hits}/${l5Sample.length} · ` : ""}
                                      L{prop.last10.length}: {l10Hits}/{prop.last10.length}
                                    </strong>
                                  </div>
                                  <div
                                    className="grid gap-1.5 items-end h-20 pt-2"
                                    style={{
                                      gridTemplateColumns: `repeat(${Math.max(1, prop.last10.length)}, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {prop.last10.map((val, idx) => {
                                      const hit = val > activeLine;
                                      const pct = Math.max(
                                        16,
                                        Math.round((val / maxVal) * 100),
                                      );
                                      return (
                                        <div
                                          key={idx}
                                          className="flex flex-col items-center gap-1 h-full justify-end"
                                        >
                                          <div
                                            className="w-full rounded-t-md transition-[background-color]"
                                            style={{
                                              height: `${pct}%`,
                                              background: hit
                                                ? "var(--pl-success)"
                                                : "var(--pl-surface-hover)",
                                            }}
                                          />
                                          <span
                                            className="text-[10px] num"
                                            style={{ color: "var(--pl-text-muted)" }}
                                          >
                                            {val}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="rounded-xl px-3 py-2 text-xs num flex items-center justify-between gap-2"
                                  style={{
                                    background: "var(--pl-surface-soft)",
                                    border: "1px solid var(--pl-border-subtle)",
                                    color: "var(--pl-text-muted)",
                                  }}
                                >
                                  <span>Distribución Spacetime por aparición</span>
                                  <strong style={{ color: "var(--pl-text)" }}>
                                    {prop.projectionMean.toFixed(2)} ± {prop.projectionSd.toFixed(2)}
                                  </strong>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2.5 text-xs num">
                                <div
                                  className="rounded-xl p-3"
                                  style={{ background: "var(--pl-surface)" }}
                                >
                                  <span
                                    className="block"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    Más de {activeLine.toFixed(1)}
                                  </span>
                                  <strong
                                    className="text-sm sm:text-base font-extrabold"
                                    style={{ color: "var(--pl-brand)" }}
                                  >
                                    {(evalRes.pOver * 100).toFixed(1)} % · Justo{" "}
                                    {formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}
                                  </strong>
                                </div>
                                <div
                                  className="rounded-xl p-3"
                                  style={{ background: "var(--pl-surface)" }}
                                >
                                  <span
                                    className="block"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    Menos de {activeLine.toFixed(1)}
                                  </span>
                                  <strong className="text-sm sm:text-base font-extrabold">
                                    {(evalRes.pUnder * 100).toFixed(1)} % · Justo{" "}
                                    {formatOddsValue(evalRes.fairUnderDecimal, oddsFormat)}
                                  </strong>
                                </div>
                              </div>

                              {refereeSummary ? (
                                <div
                                  className="rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs num"
                                  style={{
                                    background: "var(--pl-surface)",
                                    border: "1px solid var(--pl-row-rule)",
                                  }}
                                  data-prop-referee-context=""
                                >
                                  <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold">
                                    <MaestroIcon name="whistle" size={12} />
                                    <span className="truncate">{refereeSummary.name}</span>
                                  </span>
                                  <span
                                    className="inline-flex flex-wrap items-center gap-2"
                                    style={{ color: "var(--pl-text-secondary)" }}
                                  >
                                    {refereeSummary.avgYellow !== null ? (
                                      <span className="inline-flex items-center gap-1">
                                        <SportEventIcon kind="yellow" size={11} />
                                        <span>{refereeSummary.avgYellow.toFixed(1)} amar./p</span>
                                      </span>
                                    ) : null}
                                    {refereeSummary.avgFouls !== null ? (
                                      <span>{refereeSummary.avgFouls.toFixed(1)} faltas/p</span>
                                    ) : null}
                                    {refereeSummary.rigorLabel ? (
                                      <span className="pl-pill text-[10px] font-bold">
                                        {refereeSummary.rigorLabel}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              ) : null}

                              <div
                                className="rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                                style={{ background: "var(--pl-surface)" }}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <label
                                    htmlFor={`prop-odds-${prop.id}`}
                                    className="font-bold inline-flex items-center gap-1"
                                  >
                                    <MaestroIcon
                                      name="activity"
                                      size={13}
                                      style={{ color: "var(--pl-brand)" }}
                                    />
                                    <span>Tu momio Over:</span>
                                  </label>
                                  <input
                                    id={`prop-odds-${prop.id}`}
                                    type="text"
                                    inputMode="decimal"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={rawOddsText}
                                    onChange={(e) =>
                                      setPropOddsInputs((prev) => ({
                                        ...prev,
                                        [prop.id]: e.target.value,
                                      }))
                                    }
                                    placeholder={formatOddsValue(
                                      evalRes.fairOverDecimal,
                                      oddsFormat,
                                    )}
                                    className="glass-input px-2.5 py-1 text-base sm:text-xs font-bold num min-h-11 sm:min-h-9 w-28"
                                  />
                                </div>

                                {hasComparableMarketOdds ? (
                                  <span
                                    className={`pl-pill num ${
                                      liveEdgePts >= 0
                                        ? "pl-pill--success"
                                        : "pl-pill--warning"
                                    }`}
                                  >
                                    Ventaja:{" "}
                                    {liveEdgePts >= 0
                                      ? `+${liveEdgePts.toFixed(1)}`
                                      : liveEdgePts.toFixed(1)}{" "}
                                    pts
                                  </span>
                                ) : (
                                  <span className="pl-pill num">
                                    Momio justo {formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}
                                  </span>
                                )}
                              </div>

                              <p
                                className="m-0 text-xs leading-relaxed"
                                style={{ color: "var(--pl-text-secondary)" }}
                              >
                                {prop.contextNote}
                                {prop.injuryNote ? ` · Nota médica: ${prop.injuryNote}` : ""}
                              </p>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 hairline-t">
                                <span
                                  className="text-xs num"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  1.00u ·{" "}
                                  {hasComparableMarketOdds
                                    ? `Casa ${formatOddsValue(activeBookOverDec, oddsFormat)}`
                                    : `Justo ${formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}`}
                                </span>
                                <button
                                  type="button"
                                  className="pl-btn-primary text-xs min-h-11 sm:min-h-9 px-3.5 inline-flex items-center gap-1.5"
                                  onClick={() =>
                                    handleSealProp(
                                      prop,
                                      activeLine,
                                      evalRes.pOver,
                                      evalRes.fairOverDecimal,
                                      activeBookOverDec,
                                    )
                                  }
                                >
                                  <MaestroIcon
                                    name={alreadySealed ? "check" : "ticket"}
                                    size={13}
                                  />
                                  <span>
                                    {alreadySealed
                                      ? "Prop sellado en Bitácora"
                                      : "Sellar Prop en mi Bitácora"}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {filteredCatalog.length > catalogVisibleCount ? (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          className="pl-btn-glass min-h-11 sm:min-h-9 px-5 text-xs font-bold num"
                          onClick={() =>
                            setCatalogVisibleCount((c) => c + INITIAL_CATALOG_PAGE_SIZE)
                          }
                        >
                          Mostrar más props ({filteredCatalog.length - catalogVisibleCount} restantes)
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}

            {streakCards.length > 0 ? (
              <section className="space-y-4" aria-label="Tendencias de jugadores contra línea">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="m-0 text-base sm:text-lg font-extrabold">
                      Rachas verificadas contra línea deslizable
                    </h2>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Últimos 5, 10 o 20 juegos reales con probabilidad ajustada y momio justo calibrado.
                    </p>
                  </div>
                  <span className="pl-pill text-xs num">
                    {filteredStreaks.length} jugadores
                  </span>
                </div>

                {filteredStreaks.length > 0 ? (
                  <>
                    <div className="pl-props-grid">
                      {filteredStreaks.slice(0, streakVisibleCount).map((card) => (
                        <PlayerPropStreakCard
                          key={card.id}
                          {...card}
                          oddsFormat={oddsFormat}
                          onNavigate={navigateTo}
                        />
                      ))}
                    </div>
                    {filteredStreaks.length > streakVisibleCount ? (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          className="pl-btn-glass min-h-11 sm:min-h-9 px-5 text-xs font-bold num"
                          onClick={() =>
                            setStreakVisibleCount((c) => c + INITIAL_STREAK_PAGE_SIZE)
                          }
                        >
                          Mostrar más tendencias ({filteredStreaks.length - streakVisibleCount} restantes)
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Ningún jugador en tendencias coincide con el filtro actual.
                  </p>
                )}
              </section>
            ) : null}
          </>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
