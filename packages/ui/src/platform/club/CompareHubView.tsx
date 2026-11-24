"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import {
  LEAGUE_REGIONS,
  type LeagueId,
  type LeagueRegionKey,
  type PlatformSport,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../sports";
import { AtomicFormStrip, AtomicStatComparisonBar } from "../atomic";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { PlSelect } from "../components/PlSelect";
import { shareH2hStoryCard } from "../components/share-story-card";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useClientJsonSwr } from "../hooks";
import { usePlatformActions } from "../platform-provider";
import { PersonAvatar } from "./team/PersonAvatar";

export type CompareMode = "equipos" | "jugadores";

export interface CompareMetricRow {
  id: string;
  label: string;
  valueA: string;
  valueB: string;
  numA: number | null;
  numB: number | null;
  lowerIsBetter?: boolean;
  rankA?: number | null;
  rankB?: number | null;
  pct?: boolean;
  digits?: number;
}

export interface CompareTeamOption {
  slug: string;
  name: string;
  shortName: string;
  rank: number | null;
}

export interface CompareLeagueCatalog {
  league: LeagueId;
  label: string;
  region?: LeagueRegionKey;
  sport: PlatformSport;
  teams: CompareTeamOption[];
}

export interface CompareTeamCard {
  slug: string;
  name: string;
  shortName: string;
  code: string;
  rank: number | null;
  recordLabel: string;
  pointsLabel: string;
  streak: Array<"G" | "E" | "P">;
  coachName: string | null;
  coachPhotoKey: string | null;
  href: string;
}

export interface CompareH2HMatchRow {
  id: string;
  dateLabel: string;
  round: string | null;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  winner: "A" | "B" | "draw";
  gameHref: string | null;
}

export interface TeamComparisonPayload {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  teamA: CompareTeamCard;
  teamB: CompareTeamCard;
  metrics: CompareMetricRow[];
  h2hSummary: {
    played: number;
    winsA: number;
    draws: number;
    winsB: number;
  };
  h2hMatches: CompareH2HMatchRow[];
}

export interface CompareAttackDefenseMetric {
  readonly key: string;
  readonly category: "attack" | "defense";
  readonly label: string;
  readonly valueA: number | null;
  readonly valueB: number | null;
  readonly leagueAverage: number | null;
  readonly rankA: number | null;
  readonly rankB: number | null;
  readonly leagueSize: number;
  readonly lowerIsBetter: boolean;
  readonly digits: number;
  readonly pct: boolean;
}

export interface CompareAttackDefensePayload {
  readonly league: LeagueId;
  readonly leagueLabel: string;
  readonly leagueSize: number;
  readonly teamASlug: string;
  readonly teamBSlug: string;
  readonly teamAAttackRank: number;
  readonly teamADefenseRank: number;
  readonly teamAOverallRank: number;
  readonly teamBAttackRank: number;
  readonly teamBDefenseRank: number;
  readonly teamBOverallRank: number;
  readonly attackMetrics: readonly CompareAttackDefenseMetric[];
  readonly defenseMetrics: readonly CompareAttackDefenseMetric[];
}

export interface ComparePlayerOption {
  ref: string;
  name: string;
  shortName: string;
  teamSlug: string;
  teamName: string;
  positionLabel: string;
  jersey: string | null;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
}

export interface ComparePlayerCard {
  ref: string;
  name: string;
  shortName: string;
  teamSlug: string;
  teamName: string;
  positionLabel: string;
  jersey: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  nationality: string | null;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
  href: string;
}

export interface PlayerComparisonPayload {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  playerA: ComparePlayerCard;
  playerB: ComparePlayerCard;
  metrics: CompareMetricRow[];
}

export interface CompareHubViewProps {
  initialMode: CompareMode;
  initialLeague: LeagueId;
  catalog: readonly CompareLeagueCatalog[];
  initialTeamComparison: TeamComparisonPayload | null;
  initialPlayerOptions: readonly ComparePlayerOption[];
  initialPlayerComparison: PlayerComparisonPayload | null;
  initialAttackDefense?: CompareAttackDefensePayload | null;
  disableLiveFetch?: boolean;
}

interface TeamCompareApiResponse {
  readonly teamComparison?: TeamComparisonPayload | null;
  readonly attackDefense?: CompareAttackDefensePayload | null;
}

interface PlayerCompareApiResponse {
  readonly playerOptions?: readonly ComparePlayerOption[];
  readonly playerComparison?: PlayerComparisonPayload | null;
}

function swapTeamComparison(payload: TeamComparisonPayload): TeamComparisonPayload {
  return {
    ...payload,
    teamA: payload.teamB,
    teamB: payload.teamA,
    metrics: payload.metrics.map((row) => ({
      ...row,
      valueA: row.valueB,
      valueB: row.valueA,
      numA: row.numB,
      numB: row.numA,
      rankA: row.rankB,
      rankB: row.rankA,
    })),
    h2hSummary: {
      played: payload.h2hSummary.played,
      winsA: payload.h2hSummary.winsB,
      draws: payload.h2hSummary.draws,
      winsB: payload.h2hSummary.winsA,
    },
    h2hMatches: payload.h2hMatches.map((match) => ({
      ...match,
      winner: match.winner === "A" ? "B" : match.winner === "B" ? "A" : "draw",
    })),
  };
}

function swapPlayerComparison(payload: PlayerComparisonPayload): PlayerComparisonPayload {
  return {
    ...payload,
    playerA: payload.playerB,
    playerB: payload.playerA,
    metrics: payload.metrics.map((row) => ({
      ...row,
      valueA: row.valueB,
      valueB: row.valueA,
      numA: row.numB,
      numB: row.numA,
      rankA: row.rankB,
      rankB: row.rankA,
    })),
  };
}

function swapAttackDefense(payload: CompareAttackDefensePayload): CompareAttackDefensePayload {
  const flipMetric = (metric: CompareAttackDefenseMetric): CompareAttackDefenseMetric => ({
    ...metric,
    valueA: metric.valueB,
    valueB: metric.valueA,
    rankA: metric.rankB,
    rankB: metric.rankA,
  });
  return {
    ...payload,
    teamASlug: payload.teamBSlug,
    teamBSlug: payload.teamASlug,
    teamAAttackRank: payload.teamBAttackRank,
    teamADefenseRank: payload.teamBDefenseRank,
    teamAOverallRank: payload.teamBOverallRank,
    teamBAttackRank: payload.teamAAttackRank,
    teamBDefenseRank: payload.teamADefenseRank,
    teamBOverallRank: payload.teamAOverallRank,
    attackMetrics: payload.attackMetrics.map(flipMetric),
    defenseMetrics: payload.defenseMetrics.map(flipMetric),
  };
}

function syncCompareQuery(params: {
  readonly mode: CompareMode;
  readonly league: string;
  readonly a: string;
  readonly b: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("modo", params.mode);
    if (params.league) url.searchParams.set("liga", params.league);
    if (params.a) url.searchParams.set("a", params.a);
    else url.searchParams.delete("a");
    if (params.b) url.searchParams.set("b", params.b);
    else url.searchParams.delete("b");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (err) {
    void err;
  }
}

function normalizeQuery(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function resolveRankPairForCoreMetric(
  metricId: string,
  attackDefense: CompareAttackDefensePayload | null,
): { readonly rankA: number | null; readonly rankB: number | null } {
  if (!attackDefense) return { rankA: null, rankB: null };
  const targetKey =
    metricId === "for-avg"
      ? "goals_for_pg"
      : metricId === "against-avg"
        ? "goals_against_pg"
        : metricId === "clean-sheets"
          ? "clean_sheets"
          : null;
  if (!targetKey) return { rankA: null, rankB: null };
  const allMetrics = [...attackDefense.attackMetrics, ...attackDefense.defenseMetrics];
  const matched = allMetrics.find((m) => m.key === targetKey);
  return {
    rankA: matched?.rankA ?? null,
    rankB: matched?.rankB ?? null,
  };
}

export function CompareHubView({
  initialMode,
  initialLeague,
  catalog,
  initialTeamComparison,
  initialPlayerOptions,
  initialPlayerComparison,
  initialAttackDefense = null,
  disableLiveFetch = false,
}: CompareHubViewProps): React.JSX.Element {
  const { navigateTo, prefetchRoute } = usePlatformActions();
  const idBase = useId();
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [league, setLeague] = useState<LeagueId>(initialLeague);
  const [playerSearch, setPlayerSearch] = useState<string>("");

  const activeCatalog = catalog.find((c) => c.league === league) ?? catalog[0];

  const [teamASlug, setTeamASlug] = useState<string>(
    initialTeamComparison?.teamA.slug ?? activeCatalog?.teams[0]?.slug ?? "",
  );
  const [teamBSlug, setTeamBSlug] = useState<string>(
    initialTeamComparison?.teamB.slug ?? activeCatalog?.teams[1]?.slug ?? "",
  );

  const [playerARef, setPlayerARef] = useState<string>(
    initialPlayerComparison?.playerA.ref ?? initialPlayerOptions[0]?.ref ?? "",
  );
  const [playerBRef, setPlayerBRef] = useState<string>(
    initialPlayerComparison?.playerB.ref ?? initialPlayerOptions[1]?.ref ?? "",
  );

  const matchesInitialTeam =
    initialTeamComparison !== null &&
    initialTeamComparison.league === league &&
    initialTeamComparison.teamA.slug === teamASlug &&
    initialTeamComparison.teamB.slug === teamBSlug;

  const matchesSwappedInitialTeam =
    initialTeamComparison !== null &&
    initialTeamComparison.league === league &&
    initialTeamComparison.teamA.slug === teamBSlug &&
    initialTeamComparison.teamB.slug === teamASlug;

  const teamFetchUrl = useMemo(() => {
    if (disableLiveFetch || mode !== "equipos") return null;
    if (!league || !teamASlug || !teamBSlug || teamASlug === teamBSlug) return null;
    if (matchesInitialTeam || matchesSwappedInitialTeam) return null;
    return `/api/compare?modo=equipos&liga=${encodeURIComponent(league)}&a=${encodeURIComponent(teamASlug)}&b=${encodeURIComponent(teamBSlug)}`;
  }, [
    disableLiveFetch,
    league,
    matchesInitialTeam,
    matchesSwappedInitialTeam,
    mode,
    teamASlug,
    teamBSlug,
  ]);

  const teamQuery = useClientJsonSwr<TeamCompareApiResponse>(teamFetchUrl, {
    enabled: teamFetchUrl !== null,
    staleTimeMs: 30_000,
    ttlMs: 180_000,
  });

  const activeTeamComparison = useMemo<TeamComparisonPayload | null>(() => {
    if (!teamASlug || !teamBSlug || teamASlug === teamBSlug) return null;
    if (matchesInitialTeam) return initialTeamComparison;
    if (matchesSwappedInitialTeam && initialTeamComparison) {
      return swapTeamComparison(initialTeamComparison);
    }
    const fetched = teamQuery.data?.teamComparison ?? null;
    if (
      fetched &&
      fetched.league === league &&
      fetched.teamA.slug === teamASlug &&
      fetched.teamB.slug === teamBSlug
    ) {
      return fetched;
    }
    if (teamQuery.loading) {
      return fetched ?? initialTeamComparison;
    }
    return fetched;
  }, [
    initialTeamComparison,
    league,
    matchesInitialTeam,
    matchesSwappedInitialTeam,
    teamASlug,
    teamBSlug,
    teamQuery.data,
    teamQuery.loading,
  ]);

  const activeAttackDefense = useMemo<CompareAttackDefensePayload | null>(() => {
    if (!teamASlug || !teamBSlug || teamASlug === teamBSlug) return null;
    const resolveCandidate = (
      candidate: CompareAttackDefensePayload | null | undefined,
    ): CompareAttackDefensePayload | null => {
      if (!candidate || candidate.league !== league) return null;
      if (candidate.teamASlug === teamASlug && candidate.teamBSlug === teamBSlug) {
        return candidate;
      }
      if (candidate.teamASlug === teamBSlug && candidate.teamBSlug === teamASlug) {
        return swapAttackDefense(candidate);
      }
      return null;
    };
    return resolveCandidate(initialAttackDefense) ?? resolveCandidate(teamQuery.data?.attackDefense);
  }, [initialAttackDefense, league, teamASlug, teamBSlug, teamQuery.data]);

  const matchesInitialPlayer =
    initialPlayerComparison !== null &&
    initialPlayerComparison.league === league &&
    playerARef.length > 0 &&
    playerBRef.length > 0 &&
    initialPlayerComparison.playerA.ref === playerARef &&
    initialPlayerComparison.playerB.ref === playerBRef;

  const matchesSwappedInitialPlayer =
    initialPlayerComparison !== null &&
    initialPlayerComparison.league === league &&
    playerARef.length > 0 &&
    playerBRef.length > 0 &&
    initialPlayerComparison.playerA.ref === playerBRef &&
    initialPlayerComparison.playerB.ref === playerARef;

  const playerFetchUrl = useMemo(() => {
    if (disableLiveFetch || mode !== "jugadores" || !league) return null;
    if (
      (matchesInitialPlayer || matchesSwappedInitialPlayer) &&
      league === initialLeague &&
      initialPlayerOptions.length > 0
    ) {
      return null;
    }
    const qs = new URLSearchParams({ modo: "jugadores", liga: league });
    if (playerARef) qs.set("a", playerARef);
    if (playerBRef) qs.set("b", playerBRef);
    return `/api/compare?${qs.toString()}`;
  }, [
    disableLiveFetch,
    initialLeague,
    initialPlayerOptions.length,
    league,
    matchesInitialPlayer,
    matchesSwappedInitialPlayer,
    mode,
    playerARef,
    playerBRef,
  ]);

  const playerQuery = useClientJsonSwr<PlayerCompareApiResponse>(playerFetchUrl, {
    enabled: playerFetchUrl !== null,
    staleTimeMs: 30_000,
    ttlMs: 180_000,
  });

  const activePlayerOptions = useMemo<readonly ComparePlayerOption[]>(() => {
    if (
      playerQuery.data?.playerOptions &&
      (playerQuery.data.playerComparison?.league === league || league !== initialLeague)
    ) {
      return playerQuery.data.playerOptions;
    }
    if (league === initialLeague) {
      return initialPlayerOptions;
    }
    return playerQuery.data?.playerOptions ?? [];
  }, [initialLeague, initialPlayerOptions, league, playerQuery.data]);

  const activePlayerComparison = useMemo<PlayerComparisonPayload | null>(() => {
    if (matchesInitialPlayer) return initialPlayerComparison;
    if (matchesSwappedInitialPlayer && initialPlayerComparison) {
      return swapPlayerComparison(initialPlayerComparison);
    }
    const fetched = playerQuery.data?.playerComparison ?? null;
    if (fetched && fetched.league === league) return fetched;
    if (league === initialLeague && !playerFetchUrl) return initialPlayerComparison;
    return fetched;
  }, [
    initialLeague,
    initialPlayerComparison,
    league,
    matchesInitialPlayer,
    matchesSwappedInitialPlayer,
    playerFetchUrl,
    playerQuery.data,
  ]);

  const resolvedPlayerARef =
    playerARef || activePlayerComparison?.playerA.ref || activePlayerOptions[0]?.ref || "";
  const resolvedPlayerBRef =
    playerBRef ||
    activePlayerComparison?.playerB.ref ||
    activePlayerOptions.find((opt) => opt.ref !== resolvedPlayerARef)?.ref ||
    "";

  const filteredPlayerOptions = useMemo(() => {
    const q = normalizeQuery(playerSearch);
    if (!q) return activePlayerOptions;
    const matches = activePlayerOptions.filter(
      (p) =>
        normalizeQuery(p.name).includes(q) ||
        normalizeQuery(p.teamName).includes(q) ||
        normalizeQuery(p.positionLabel).includes(q),
    );
    const keepSelected = activePlayerOptions.filter(
      (p) =>
        (p.ref === resolvedPlayerARef || p.ref === resolvedPlayerBRef) &&
        !matches.some((m) => m.ref === p.ref),
    );
    return [...keepSelected, ...matches];
  }, [activePlayerOptions, playerSearch, resolvedPlayerARef, resolvedPlayerBRef]);

  const loading = mode === "equipos" ? teamQuery.loading : playerQuery.loading;
  const teamsForLeague = activeCatalog?.teams ?? [];

  const navigateOnPlainClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigateTo(href);
    },
    [navigateTo],
  );

  const handleModeChange = (nextId: string) => {
    const nextMode: CompareMode = nextId === "jugadores" ? "jugadores" : "equipos";
    setMode(nextMode);
    syncCompareQuery({
      mode: nextMode,
      league,
      a: nextMode === "equipos" ? teamASlug : resolvedPlayerARef,
      b: nextMode === "equipos" ? teamBSlug : resolvedPlayerBRef,
    });
  };

  const handleLeagueChange = (nextLeague: string) => {
    const found = catalog.find((c) => c.league === nextLeague);
    if (!found) return;
    const nextTeamA = found.teams[0]?.slug ?? "";
    const nextTeamB = found.teams[1]?.slug ?? found.teams[0]?.slug ?? "";
    setLeague(found.league);
    setTeamASlug(nextTeamA);
    setTeamBSlug(nextTeamB);
    setPlayerARef("");
    setPlayerBRef("");
    setPlayerSearch("");
    syncCompareQuery({
      mode,
      league: found.league,
      a: mode === "equipos" ? nextTeamA : "",
      b: mode === "equipos" ? nextTeamB : "",
    });
  };

  const handleTeamAChange = (nextSlug: string) => {
    setTeamASlug(nextSlug);
    syncCompareQuery({ mode: "equipos", league, a: nextSlug, b: teamBSlug });
  };

  const handleTeamBChange = (nextSlug: string) => {
    setTeamBSlug(nextSlug);
    syncCompareQuery({ mode: "equipos", league, a: teamASlug, b: nextSlug });
  };

  const handlePlayerAChange = (nextRef: string) => {
    setPlayerARef(nextRef);
    syncCompareQuery({ mode: "jugadores", league, a: nextRef, b: resolvedPlayerBRef });
  };

  const handlePlayerBChange = (nextRef: string) => {
    setPlayerBRef(nextRef);
    syncCompareQuery({ mode: "jugadores", league, a: resolvedPlayerARef, b: nextRef });
  };

  const handleSwap = () => {
    if (mode === "equipos") {
      setTeamASlug(teamBSlug);
      setTeamBSlug(teamASlug);
      syncCompareQuery({ mode: "equipos", league, a: teamBSlug, b: teamASlug });
      return;
    }
    setPlayerARef(resolvedPlayerBRef);
    setPlayerBRef(resolvedPlayerARef);
    syncCompareQuery({
      mode: "jugadores",
      league,
      a: resolvedPlayerBRef,
      b: resolvedPlayerARef,
    });
  };

  const modeTabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      { id: "equipos", label: "Equipos H2H" },
      { id: "jugadores", label: "Jugadores" },
    ],
    [],
  );

  const h2hColumns = useMemo<readonly SofascoreTableColumn<CompareH2HMatchRow>[]>(() => {
    const teamAName = activeTeamComparison?.teamA.shortName ?? "Equipo A";
    const teamBName = activeTeamComparison?.teamB.shortName ?? "Equipo B";
    return [
      {
        key: "date",
        header: "Fecha",
        sticky: true,
        render: (match) => (
          <div className="pl-mc-pick-meta num">
            <strong style={{ color: "var(--pl-text)" }}>{match.dateLabel}</strong>
            {match.round ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{match.round}</span>
              </>
            ) : null}
          </div>
        ),
      },
      {
        key: "home",
        header: "Local",
        render: (match) => <span>{match.homeName}</span>,
      },
      {
        key: "score",
        header: "Marcador",
        numeric: true,
        render: (match) => (
          <span className="pl-mc-h2h-score num">
            {match.homeScore} – {match.awayScore}
          </span>
        ),
      },
      {
        key: "away",
        header: "Visitante",
        render: (match) => <span>{match.awayName}</span>,
      },
      {
        key: "result",
        header: "Resultado",
        align: "end",
        render: (match) => {
          const outcomeLabel =
            match.winner === "A"
              ? `Ganó ${teamAName}`
              : match.winner === "B"
                ? `Ganó ${teamBName}`
                : "Empate";
          if (match.gameHref) {
            const href = match.gameHref;
            return (
              <a
                href={href}
                onPointerEnter={() => prefetchRoute(href)}
                onTouchStart={() => prefetchRoute(href)}
                onClick={(e) => navigateOnPlainClick(e, href)}
                className="pl-mc-h2h-link"
              >
                <span>{outcomeLabel}</span>
                <span aria-hidden="true">→</span>
              </a>
            );
          }
          return <span className="pl-mc-edge-note">{outcomeLabel}</span>;
        },
      },
    ];
  }, [activeTeamComparison, navigateOnPlainClick, prefetchRoute]);

  const canShare =
    mode === "equipos" ? activeTeamComparison !== null : activePlayerComparison !== null;

  return (
    <AtmosphereStage activePath="/app/comparar">
      <ClubWorkspaceShell activePath="/app/comparar">
        <div className="pl-mc-page" data-compare-hub="">
          <header className="pl-mc-hero">
            <div className="pl-mc-hero-copy">
              <h1 className="pl-mc-title">Comparador H2H</h1>
              <p className="pl-mc-subtitle">
                Contrasta equipos por liga con rangos de ataque y defensa, historial directo real o
                métricas acumuladas de jugadores.
              </p>
            </div>
            <div className="pl-mc-hero-actions">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Compartir comparativa H2H en formato 9:16"
                data-share-h2h-story=""
                disabled={!canShare}
                onClick={() => {
                  if (mode === "equipos" && activeTeamComparison) {
                    void shareH2hStoryCard({
                      leagueLabel: activeTeamComparison.leagueLabel,
                      leftTitle: activeTeamComparison.teamA.name,
                      rightTitle: activeTeamComparison.teamB.name,
                      headline:
                        activeTeamComparison.h2hSummary.played > 0
                          ? `H2H (${activeTeamComparison.h2hSummary.played}): ${activeTeamComparison.h2hSummary.winsA}G – ${activeTeamComparison.h2hSummary.draws}E – ${activeTeamComparison.h2hSummary.winsB}G`
                          : `Temporada ${activeTeamComparison.seasonLabel}`,
                      rows: activeTeamComparison.metrics.slice(0, 6).map((m) => ({
                        label: m.label,
                        leftValue: m.valueA,
                        rightValue: m.valueB,
                      })),
                    });
                  } else if (mode === "jugadores" && activePlayerComparison) {
                    void shareH2hStoryCard({
                      leagueLabel: activePlayerComparison.leagueLabel,
                      leftTitle: activePlayerComparison.playerA.name,
                      rightTitle: activePlayerComparison.playerB.name,
                      headline: `${activePlayerComparison.playerA.teamName} vs ${activePlayerComparison.playerB.teamName}`,
                      rows: activePlayerComparison.metrics.slice(0, 6).map((m) => ({
                        label: m.label,
                        leftValue: m.valueA,
                        rightValue: m.valueB,
                      })),
                    });
                  }
                }}
              >
                <MaestroIcon name="share" size={14} />
                <span className="num">9:16</span>
              </Button>

              <SofascoreTabs
                variant="segmented"
                ariaLabel="Modo de comparación"
                items={modeTabItems}
                value={mode}
                onChange={handleModeChange}
              />
            </div>
          </header>

          <SofascoreFilterBar
            className="pl-mc-cmp-filter-bar"
            searchValue={mode === "jugadores" ? playerSearch : undefined}
            onSearchChange={mode === "jugadores" ? setPlayerSearch : undefined}
            searchPlaceholder="Filtrar jugador, club o posición…"
            resultCount={
              mode === "jugadores" && playerSearch.trim().length > 0
                ? filteredPlayerOptions.length
                : undefined
            }
          >
            <div className="pl-mc-cmp-controls">
              <div className="pl-mc-field">
                <label htmlFor={`${idBase}-league`} className="pl-mc-field-label">
                  Liga / competencia
                </label>
                <PlSelect
                  id={`${idBase}-league`}
                  ariaLabel="Seleccionar liga para comparar"
                  variant="field"
                  size="md"
                  fullWidth
                  popoverWidth="trigger"
                  triggerClassName="pl-mc-select-trigger"
                  value={league}
                  onChange={handleLeagueChange}
                  options={catalog.map((c) => {
                    const reg = c.region
                      ? LEAGUE_REGIONS.find((r) => r.key === c.region)
                      : undefined;
                    return {
                      value: c.league,
                      label: reg && catalog.length > 10 ? `${c.label} · ${reg.shortLabel}` : c.label,
                    };
                  })}
                />
              </div>

              {mode === "equipos" ? (
                <>
                  <div className="pl-mc-field">
                    <label htmlFor={`${idBase}-team-a`} className="pl-mc-field-label">
                      Equipo A
                    </label>
                    <PlSelect
                      id={`${idBase}-team-a`}
                      ariaLabel="Seleccionar primer equipo"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="pl-mc-select-trigger"
                      value={teamASlug}
                      onChange={handleTeamAChange}
                      options={teamsForLeague.map((t) => ({
                        value: t.slug,
                        label: t.rank ? `#${t.rank} · ${t.name}` : t.name,
                      }))}
                    />
                  </div>
                  <div className="pl-mc-swap-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="pl-mc-swap-btn"
                      aria-label="Intercambiar lado A y lado B"
                      onClick={handleSwap}
                    >
                      <span aria-hidden="true">⇄</span>
                      <span className="pl-mc-swap-label">Intercambiar</span>
                    </Button>
                  </div>
                  <div className="pl-mc-field">
                    <label htmlFor={`${idBase}-team-b`} className="pl-mc-field-label">
                      Equipo B
                    </label>
                    <PlSelect
                      id={`${idBase}-team-b`}
                      ariaLabel="Seleccionar segundo equipo"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="pl-mc-select-trigger"
                      value={teamBSlug}
                      onChange={handleTeamBChange}
                      options={teamsForLeague.map((t) => ({
                        value: t.slug,
                        label: t.rank ? `#${t.rank} · ${t.name}` : t.name,
                      }))}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="pl-mc-field">
                    <label htmlFor={`${idBase}-player-a`} className="pl-mc-field-label">
                      Jugador A
                    </label>
                    <PlSelect
                      id={`${idBase}-player-a`}
                      ariaLabel="Seleccionar primer jugador"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="pl-mc-select-trigger"
                      value={resolvedPlayerARef}
                      onChange={handlePlayerAChange}
                      options={filteredPlayerOptions.map((p) => ({
                        value: p.ref,
                        label: `${p.name} · ${p.teamName} (${p.positionLabel})`,
                      }))}
                    />
                  </div>
                  <div className="pl-mc-swap-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="pl-mc-swap-btn"
                      aria-label="Intercambiar jugador A y jugador B"
                      onClick={handleSwap}
                    >
                      <span aria-hidden="true">⇄</span>
                      <span className="pl-mc-swap-label">Intercambiar</span>
                    </Button>
                  </div>
                  <div className="pl-mc-field">
                    <label htmlFor={`${idBase}-player-b`} className="pl-mc-field-label">
                      Jugador B
                    </label>
                    <PlSelect
                      id={`${idBase}-player-b`}
                      ariaLabel="Seleccionar segundo jugador"
                      variant="field"
                      size="md"
                      fullWidth
                      popoverWidth="trigger"
                      triggerClassName="pl-mc-select-trigger"
                      value={resolvedPlayerBRef}
                      onChange={handlePlayerBChange}
                      options={filteredPlayerOptions.map((p) => ({
                        value: p.ref,
                        label: `${p.name} · ${p.teamName} (${p.positionLabel})`,
                      }))}
                    />
                  </div>
                </>
              )}
            </div>
          </SofascoreFilterBar>

          {mode === "equipos" ? (
            <div role="tabpanel" aria-label="Comparativa de equipos H2H" className="pl-mc-page">
              {activeTeamComparison ? (
                <>
                  <SofascoreCard
                    title={`${activeTeamComparison.teamA.shortName} vs ${activeTeamComparison.teamB.shortName}`}
                    meta={`${activeTeamComparison.leagueLabel} · ${activeTeamComparison.seasonLabel}`}
                  >
                    <div className="pl-mc-card-stack">
                      <div className="pl-mc-duel-head">
                        {[
                          {
                            side: activeTeamComparison.teamA,
                            isB: false,
                            attackRank: activeAttackDefense?.teamAAttackRank ?? null,
                            defenseRank: activeAttackDefense?.teamADefenseRank ?? null,
                          },
                          {
                            side: activeTeamComparison.teamB,
                            isB: true,
                            attackRank: activeAttackDefense?.teamBAttackRank ?? null,
                            defenseRank: activeAttackDefense?.teamBDefenseRank ?? null,
                          },
                        ].map(({ side, isB, attackRank, defenseRank }) => (
                          <div
                            key={side.slug}
                            className={`pl-mc-side-panel ${isB ? "is-b" : "is-a"}`}
                          >
                            <a
                              href={side.href}
                              onPointerEnter={() => prefetchRoute(side.href)}
                              onTouchStart={() => prefetchRoute(side.href)}
                              onClick={(e) => navigateOnPlainClick(e, side.href)}
                              className="pl-mc-side-link"
                            >
                              <TeamBadge
                                league={activeTeamComparison.league}
                                slug={side.slug}
                                name={side.name}
                                size={44}
                              />
                              <div className="pl-mc-side-copy">
                                <strong className="pl-mc-side-name">{side.name}</strong>
                                <span className="pl-mc-side-sub num">
                                  {side.rank ? `#${side.rank} · ` : ""}
                                  {side.recordLabel} · {side.pointsLabel}
                                </span>
                              </div>
                            </a>
                            <div className="pl-mc-side-foot">
                              <AtomicFormStrip
                                form={side.streak}
                                sport={activeTeamComparison.sport}
                                teamName={side.name}
                                size="sm"
                                emptyFallback={null}
                              />
                              {attackRank !== null && defenseRank !== null ? (
                                <span className="pl-mc-rank-summary num">
                                  {`Atq ${attackRank}.º · Def ${defenseRank}.º`}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div
                        className="pl-mc-metrics-stack"
                        aria-busy={loading ? "true" : undefined}
                      >
                        {activeTeamComparison.metrics.map((row) => {
                          const inferredRanks = resolveRankPairForCoreMetric(
                            row.id,
                            activeAttackDefense,
                          );
                          const isPct =
                            row.pct ??
                            (row.valueA.includes("%") || row.valueB.includes("%"));
                          const isSigned =
                            (row.numA !== null && row.numA < 0) ||
                            (row.numB !== null && row.numB < 0);
                          return (
                            <div key={row.id} data-compare-metric={row.id}>
                              <AtomicStatComparisonBar
                                label={row.label}
                                homeValue={row.numA}
                                awayValue={row.numB}
                                homeLabel={activeTeamComparison.teamA.shortName}
                                awayLabel={activeTeamComparison.teamB.shortName}
                                homeDisplay={row.valueA}
                                awayDisplay={row.valueB}
                                pct={isPct}
                                signed={isSigned}
                                digits={row.digits}
                                lowerIsBetter={Boolean(row.lowerIsBetter)}
                                rankA={row.rankA ?? inferredRanks.rankA}
                                rankB={row.rankB ?? inferredRanks.rankB}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </SofascoreCard>

                  {activeAttackDefense &&
                  (activeAttackDefense.attackMetrics.length > 0 ||
                    activeAttackDefense.defenseMetrics.length > 0) ? (
                    <SofascoreCard
                      title="Ataque vs Defensa en la liga"
                      meta={`Puesto ordinal 1.º–${activeAttackDefense.leagueSize}.º`}
                    >
                      <div className="pl-mc-card-stack">
                        <div className="pl-mc-legend-row">
                          <div className="pl-mc-legend-teams">
                            <span className="pl-mc-legend-item">
                              <span className="pl-mc-legend-dot is-a" aria-hidden="true" />
                              <span>{activeTeamComparison.teamA.shortName}</span>
                            </span>
                            <span className="pl-mc-legend-item">
                              <span className="pl-mc-legend-dot is-b" aria-hidden="true" />
                              <span>{activeTeamComparison.teamB.shortName}</span>
                            </span>
                          </div>
                          <span className="num">
                            {activeAttackDefense.leagueLabel} · {activeAttackDefense.leagueSize} clubes
                          </span>
                        </div>

                        <div className="pl-mc-ad-grid">
                          {activeAttackDefense.attackMetrics.length > 0 ? (
                            <div className="pl-mc-ad-col">
                              <h3 className="pl-mc-ad-heading">Ataque</h3>
                              {activeAttackDefense.attackMetrics.map((metric) => (
                                <div key={metric.key} data-compare-metric={metric.key}>
                                  <AtomicStatComparisonBar
                                    label={metric.label}
                                    homeValue={metric.valueA}
                                    awayValue={metric.valueB}
                                    homeLabel={activeTeamComparison.teamA.shortName}
                                    awayLabel={activeTeamComparison.teamB.shortName}
                                    pct={metric.pct}
                                    digits={metric.digits}
                                    lowerIsBetter={metric.lowerIsBetter}
                                    rankA={metric.rankA}
                                    rankB={metric.rankB}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {activeAttackDefense.defenseMetrics.length > 0 ? (
                            <div className="pl-mc-ad-col">
                              <h3 className="pl-mc-ad-heading">Defensa</h3>
                              {activeAttackDefense.defenseMetrics.map((metric) => (
                                <div key={metric.key} data-compare-metric={metric.key}>
                                  <AtomicStatComparisonBar
                                    label={metric.label}
                                    homeValue={metric.valueA}
                                    awayValue={metric.valueB}
                                    homeLabel={activeTeamComparison.teamA.shortName}
                                    awayLabel={activeTeamComparison.teamB.shortName}
                                    pct={metric.pct}
                                    digits={metric.digits}
                                    lowerIsBetter={metric.lowerIsBetter}
                                    rankA={metric.rankA}
                                    rankB={metric.rankB}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </SofascoreCard>
                  ) : null}

                  <SofascoreCard
                    title="Historial directo (H2H)"
                    meta={
                      activeTeamComparison.h2hSummary.played > 0
                        ? `${activeTeamComparison.teamA.shortName} ${activeTeamComparison.h2hSummary.winsA} · E ${activeTeamComparison.h2hSummary.draws} · ${activeTeamComparison.teamB.shortName} ${activeTeamComparison.h2hSummary.winsB}`
                        : "Sin cruces recientes"
                    }
                  >
                    <div className="pl-mc-card-stack">
                      {activeTeamComparison.h2hSummary.played > 0 ? (
                        <div className="pl-mc-h2h-bar" aria-hidden="true">
                          {activeTeamComparison.h2hSummary.winsA > 0 ? (
                            <span
                              className="pl-mc-h2h-seg is-a"
                              style={{ flexGrow: activeTeamComparison.h2hSummary.winsA }}
                            />
                          ) : null}
                          {activeTeamComparison.h2hSummary.draws > 0 ? (
                            <span
                              className="pl-mc-h2h-seg is-draw"
                              style={{ flexGrow: activeTeamComparison.h2hSummary.draws }}
                            />
                          ) : null}
                          {activeTeamComparison.h2hSummary.winsB > 0 ? (
                            <span
                              className="pl-mc-h2h-seg is-b"
                              style={{ flexGrow: activeTeamComparison.h2hSummary.winsB }}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      <SofascoreTable
                        caption={`Historial directo entre ${activeTeamComparison.teamA.name} y ${activeTeamComparison.teamB.name}`}
                        columns={h2hColumns}
                        rows={activeTeamComparison.h2hMatches}
                        rowKey={(match) => match.id}
                        density="compact"
                        emptyState={
                          <SofascoreEmptyState
                            title="Sin enfrentamientos directos recientes"
                            description={`No hay cruces registrados en la ventana actual entre ${activeTeamComparison.teamA.shortName} y ${activeTeamComparison.teamB.shortName}.`}
                          />
                        }
                      />
                    </div>
                  </SofascoreCard>
                </>
              ) : (
                <SofascoreEmptyState
                  title="Elige dos equipos distintos"
                  description="Selecciona dos clubes de la misma competencia para generar el frente a frente y su historial directo."
                />
              )}
            </div>
          ) : (
            <div role="tabpanel" aria-label="Comparativa de jugadores" className="pl-mc-page">
              {activePlayerComparison ? (
                <SofascoreCard
                  title={`${activePlayerComparison.playerA.shortName} vs ${activePlayerComparison.playerB.shortName}`}
                  meta={`${activePlayerComparison.leagueLabel} · ${activePlayerComparison.seasonLabel}`}
                >
                  <div className="pl-mc-card-stack">
                    <div className="pl-mc-duel-head">
                      {[activePlayerComparison.playerA, activePlayerComparison.playerB].map(
                        (player, idx) => (
                          <div
                            key={player.ref}
                            className={`pl-mc-side-panel ${idx === 1 ? "is-b" : "is-a"}`}
                          >
                            <a
                              href={player.href}
                              onPointerEnter={() => prefetchRoute(player.href)}
                              onTouchStart={() => prefetchRoute(player.href)}
                              onClick={(e) => navigateOnPlainClick(e, player.href)}
                              className="pl-mc-side-link"
                            >
                              <PersonAvatar
                                photoKey={player.photoKey}
                                fallbackPhotoKey={player.fallbackPhotoKey}
                                role="player"
                                size={56}
                              />
                              <div className="pl-mc-side-copy">
                                <strong className="pl-mc-side-name">{player.name}</strong>
                                <span className="pl-mc-side-sub num">
                                  {player.teamName} · {player.positionLabel}
                                  {player.jersey ? ` · #${player.jersey}` : ""}
                                </span>
                                <span className="pl-mc-side-sub num">
                                  {[
                                    player.age ? `${player.age} años` : null,
                                    player.heightCm ? `${player.heightCm} cm` : null,
                                    player.weightKg ? `${player.weightKg} kg` : null,
                                    player.nationality ?? null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </div>
                            </a>
                          </div>
                        ),
                      )}
                    </div>

                    {activePlayerComparison.metrics.length > 0 ? (
                      <div
                        className="pl-mc-metrics-stack"
                        aria-busy={loading ? "true" : undefined}
                      >
                        {activePlayerComparison.metrics.map((row) => {
                          const isPct =
                            row.pct ??
                            (row.valueA.includes("%") || row.valueB.includes("%"));
                          const isSigned =
                            (row.numA !== null && row.numA < 0) ||
                            (row.numB !== null && row.numB < 0);
                          return (
                            <div key={row.id} data-compare-metric={row.id}>
                              <AtomicStatComparisonBar
                                label={row.label}
                                homeValue={row.numA}
                                awayValue={row.numB}
                                homeLabel={activePlayerComparison.playerA.shortName}
                                awayLabel={activePlayerComparison.playerB.shortName}
                                homeDisplay={row.valueA}
                                awayDisplay={row.valueB}
                                pct={isPct}
                                signed={isSigned}
                                digits={row.digits}
                                lowerIsBetter={Boolean(row.lowerIsBetter)}
                                rankA={row.rankA}
                                rankB={row.rankB}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <SofascoreEmptyState
                        title="Sin métricas acumuladas"
                        description="Aún no hay suficientes registros de temporada para comparar a ambos jugadores."
                      />
                    )}
                  </div>
                </SofascoreCard>
              ) : (
                <SofascoreEmptyState
                  title={loading ? "Cargando jugadores…" : "Elige dos jugadores"}
                  description={
                    loading
                      ? "Consultando las nóminas activas de la competencia seleccionada."
                      : "Selecciona dos jugadores de la liga para comparar sus métricas de temporada."
                  }
                />
              )}
            </div>
          )}

          {activeTeamComparison && mode === "equipos" ? (
            <div className="pl-mc-pick-meta">
              <LeagueBadge
                league={activeTeamComparison.league}
                label={activeTeamComparison.leagueLabel}
                size={16}
              />
              <span>
                {activeTeamComparison.leagueLabel} · {activeTeamComparison.seasonLabel}
              </span>
            </div>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
