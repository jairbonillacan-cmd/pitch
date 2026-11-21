"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import {
  parseStrictFiniteNumber,
  sportForLeague,
  type PlatformSport,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { TeamBadge } from "../../sports";
import { decimalToAmericanInt, formatOddsValue } from "../access-guard";
import { PropBetLabChart, type PropBetLabPoint } from "../atomic";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  PlayerPropStreakCard,
  type PlayerPropStreakCardProps,
} from "../components/PlayerPropStreakCard";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
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
import { PersonAvatar } from "./team/PersonAvatar";
import {
  FOOTBALL_MIN_MINUTES_GUARD,
  MIN_SAMPLE_GUARD_LABEL,
  NBA_MIN_MINUTES_PER_GAME,
  NBA_STAT_CODE_ORDER,
  normalizePlayerMatchName,
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
  readonly photoKey?: string | null;
}

export interface PropsRivalDefenseContext {
  readonly opponentName: string;
  readonly defenseRank: number;
  readonly leagueSize: number;
  readonly ebLabel: string;
}

export interface PropsLabClubViewProps {
  streakCards?: readonly PropsStreakExplorerItem[];
  playerProps?: readonly PropsLabPlayerPropItem[];
  rivalDefenseByLeagueTeam?: Readonly<Record<string, PropsRivalDefenseContext>>;
}

type LineupDisplayState = "confirmed" | "probable" | "unknown";
type PropsWorkspaceTab = "proyecciones" | "rachas";

interface EnrichedPropEntry {
  readonly prop: PropsLabPlayerPropItem;
  readonly sport: PlatformSport;
  readonly statCode: NbaPropStatCode | string | null;
  readonly lineupState: LineupDisplayState;
  readonly lineupLabel: string;
  readonly isDoubtful: boolean;
  readonly refereeSummary: PropsLabRefereeSummary | null;
  readonly minMinutesMet: boolean;
  readonly guardLabel: string;
  readonly photoKey: string | null;
  readonly opponentSlug: string | null;
  readonly opponentShortName: string | null;
  readonly unitLabel: string;
}

const INITIAL_STREAK_PAGE_SIZE = 6;
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

function parseManualBookOdds(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return null;
  const parsed = parseStrictFiniteNumber(cleaned);
  if (parsed === null) return null;
  if (/^[+-]/.test(cleaned) && Math.abs(parsed) >= 100) {
    return parsed > 0 ? 1 + parsed / 100 : 1 + 100 / Math.abs(parsed);
  }
  if (parsed > 1.01 && parsed <= 1000) {
    return parsed;
  }
  return null;
}

function clampLine(value: number, minLine: number, maxLine: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(maxLine, Math.max(minLine, rounded));
}

function resolvePropUnitLabel(statLabel: string, statCode: string | null): string {
  if (statCode === "PTS") return "pts";
  if (statCode === "REB") return "reb";
  if (statCode === "AST") return "ast";
  if (statCode === "3PM") return "3pm";
  const lower = statLabel.toLowerCase();
  if (lower.includes("puerta") || lower.includes("arco")) return "tiros";
  if (lower.includes("tiro") || lower.includes("remate")) return "tiros";
  if (lower.includes("gol")) return "goles";
  if (lower.includes("asistencia")) return "asist.";
  if (lower.includes("amarilla") || lower.includes("tarjeta")) return "tarj.";
  if (lower.includes("falta")) return "faltas";
  if (lower.includes("atajada")) return "ataj.";
  return statLabel.slice(0, 10).toLowerCase();
}

function evaluateMinMinutesEligibility(
  prop: PropsLabPlayerPropItem,
  sport: PlatformSport,
): boolean {
  if (prop.minMinutesGuard === false) return false;
  if (sport === "football") {
    if (prop.avgMinutes != null) {
      return (
        prop.avgMinutes >= FOOTBALL_MIN_MINUTES_GUARD &&
        (prop.sampleGames == null || prop.sampleGames >= 3)
      );
    }
    return prop.minMinutesGuard === true;
  }
  if (sport === "basketball") {
    if (prop.avgMinutes != null) {
      return (
        prop.avgMinutes >= NBA_MIN_MINUTES_PER_GAME &&
        (prop.sampleGames == null || prop.sampleGames >= 3)
      );
    }
    return prop.minMinutesGuard === true;
  }
  return prop.minMinutesGuard !== false;
}

function resolveLineupPresentation(
  status: LineupDisplayState,
  sport: PlatformSport,
): string {
  if (status === "confirmed") {
    return sport === "football" ? "XI confirmado" : "Titular confirmado";
  }
  if (status === "probable") {
    return sport === "football" ? "XI probable" : "Titular probable";
  }
  return "Por confirmar";
}

function findMatchingStreakCard(
  streakIndex: ReadonlyMap<string, PropsStreakExplorerItem>,
  prop: PropsLabPlayerPropItem,
): PropsStreakExplorerItem | null {
  const key = `${prop.league}|${prop.teamSlug.trim().toLowerCase()}|${normalizePlayerMatchName(prop.player)}`;
  return streakIndex.get(key) ?? null;
}

function buildBetLabPointsForEntry(
  entry: EnrichedPropEntry,
  matchedStreak: PropsStreakExplorerItem | null,
): readonly PropBetLabPoint[] {
  const defaultMin =
    entry.prop.avgMinutes != null && Number.isFinite(entry.prop.avgMinutes)
      ? Math.round(entry.prop.avgMinutes)
      : entry.sport === "basketball"
        ? 30
        : 78;

  if (matchedStreak && matchedStreak.series.length > 0) {
    const statCodeLower = entry.statCode ? String(entry.statCode).toLowerCase() : "";
    const statNorm = normalizePlayerMatchName(entry.prop.statLabel);
    const matchedSeries =
      matchedStreak.series.find((s) => {
        const sKey = s.key.toLowerCase();
        const sLbl = normalizePlayerMatchName(s.label);
        if (statCodeLower && (sKey === statCodeLower || sLbl === statCodeLower)) return true;
        return statNorm.includes(sLbl) || sLbl.includes(statNorm);
      }) ?? null;

    if (matchedSeries && matchedSeries.points.length > 0) {
      return matchedSeries.points.map((pt, idx) => ({
        id: `${entry.prop.id}-s-${idx}`,
        label: pt.label,
        opponent: pt.opponent ?? pt.label,
        date: pt.date,
        value: pt.value,
        minutes:
          pt.minutes != null && Number.isFinite(pt.minutes) ? Math.round(pt.minutes) : defaultMin,
        xg: pt.xg != null && Number.isFinite(pt.xg) ? pt.xg : null,
        isHome: pt.isHome,
      }));
    }
  }

  if (entry.prop.last10.length > 0) {
    const chronological = entry.prop.last10.slice().reverse();
    const fallbackOpp = entry.opponentShortName ?? entry.prop.matchLabel;
    return chronological.map((value, idx) => ({
      id: `${entry.prop.id}-l-${idx}`,
      label: `J${idx + 1}`,
      opponent: fallbackOpp,
      value,
      minutes: defaultMin,
      xg: null,
    }));
  }

  return [];
}

export function PropsLabClubView({
  streakCards = [],
  playerProps,
  rivalDefenseByLeagueTeam,
}: PropsLabClubViewProps = {}): React.JSX.Element {
  const comparatorInputId = useId();
  const { dataset, viewerRole, hasAccountSession, upgradeHref, oddsFormat } = usePlatformCore();
  const { sealPickToJournal, navigateTo } = usePlatformActions();
  const journal = useJournalEntries();

  const rawCatalog = useMemo<readonly PropsLabPlayerPropItem[]>(() => {
    if (playerProps) {
      return [...playerProps];
    }
    return buildPlayerPropsCatalog(dataset.games, dataset.playerProps);
  }, [dataset.games, dataset.playerProps, playerProps]);

  const [customLines, setCustomLines] = useState<Readonly<Record<string, number>>>({});
  const [propOddsInputs, setPropOddsInputs] = useState<Readonly<Record<string, string>>>({});
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [requestedTab, setRequestedTab] = useState<PropsWorkspaceTab>("proyecciones");
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

  const streakByPlayerKey = useMemo(() => {
    const map = new Map<string, PropsStreakExplorerItem>();
    for (const card of streakCards) {
      const key = `${card.league}|${(card.teamSlug ?? "").trim().toLowerCase()}|${normalizePlayerMatchName(card.playerName)}`;
      if (!map.has(key)) {
        map.set(key, card);
      }
    }
    return map;
  }, [streakCards]);

  const enrichedCatalog = useMemo<readonly EnrichedPropEntry[]>(() => {
    const out: EnrichedPropEntry[] = [];
    for (const prop of rawCatalog) {
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
      if (lineupSignal?.status === "ruled_out") continue;

      const lineupState: LineupDisplayState =
        lineupSignal?.status === "confirmed"
          ? "confirmed"
          : lineupSignal?.status === "probable"
            ? "probable"
            : "unknown";

      const matchedGame = gamesById.get(prop.gameId) ?? null;
      let opponentSlug: string | null = null;
      let opponentShortName: string | null = null;
      if (matchedGame) {
        const teamLower = prop.teamSlug.trim().toLowerCase();
        if (matchedGame.home.slug.toLowerCase() === teamLower) {
          opponentSlug = matchedGame.away.slug.toLowerCase();
          opponentShortName = matchedGame.away.shortName;
        } else if (matchedGame.away.slug.toLowerCase() === teamLower) {
          opponentSlug = matchedGame.home.slug.toLowerCase();
          opponentShortName = matchedGame.home.shortName;
        }
      }

      let refereeSummary: PropsLabRefereeSummary | null = prop.refereeSummary ?? null;
      if (!refereeSummary && sport === "football" && matchedGame) {
        const refAnalytics = resolveMatchRefereeAnalytics(matchedGame, dataset.games);
        if (refAnalytics && (refAnalytics.avgYellow !== null || refAnalytics.avgFouls !== null)) {
          refereeSummary = {
            name: refAnalytics.name,
            avgYellow: refAnalytics.avgYellow,
            avgFouls: refAnalytics.avgFouls,
            rigorLabel: refAnalytics.rigorLabel,
          };
        }
      }

      const minMinutesMet = evaluateMinMinutesEligibility(prop, sport);
      const matchedStreak = findMatchingStreakCard(streakByPlayerKey, prop);
      const photoKey = prop.photoKey ?? matchedStreak?.photoKey ?? null;
      const isDoubtful =
        prop.availabilityStatus === "doubtful" || lineupSignal?.status === "doubtful";

      out.push({
        prop,
        sport,
        statCode,
        lineupState,
        lineupLabel: resolveLineupPresentation(lineupState, sport),
        isDoubtful,
        refereeSummary,
        minMinutesMet,
        guardLabel: sport === "basketball" ? "Muestra ≥ 18 min/p" : MIN_SAMPLE_GUARD_LABEL,
        photoKey,
        opponentSlug,
        opponentShortName,
        unitLabel: resolvePropUnitLabel(prop.statLabel, statCode ? String(statCode) : null),
      });
    }
    return out;
  }, [dataset.games, gamesById, rawCatalog, streakByPlayerKey]);

  const activeTab: PropsWorkspaceTab =
    enrichedCatalog.length === 0 && streakCards.length > 0
      ? "rachas"
      : streakCards.length === 0
        ? "proyecciones"
        : requestedTab;

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

  const lineupSignalCount = useMemo(
    () =>
      enrichedCatalog.filter(
        (item) => item.lineupState === "confirmed" || item.lineupState === "probable",
      ).length,
    [enrichedCatalog],
  );

  const minGuardCount = useMemo(
    () => enrichedCatalog.filter((item) => item.minMinutesMet).length,
    [enrichedCatalog],
  );

  const hasAnyLineupSignal = lineupSignalCount > 0;
  const hasAnyMinGuardDiff =
    minGuardCount > 0 || streakCards.some((card) => card.minMinutesGuard === true);

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
        item.lineupState !== "confirmed" &&
        item.lineupState !== "probable"
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.prop.player.toLowerCase().includes(q) ||
        item.prop.teamName.toLowerCase().includes(q) ||
        item.prop.leagueLabel.toLowerCase().includes(q) ||
        item.prop.statLabel.toLowerCase().includes(q) ||
        (item.statCode ? String(item.statCode).toLowerCase().includes(q) : false)
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

  const selectedEntry = useMemo<EnrichedPropEntry | null>(() => {
    if (filteredCatalog.length === 0) return null;
    if (selectedPropId) {
      const found = filteredCatalog.find((e) => e.prop.id === selectedPropId);
      if (found) return found;
    }
    return filteredCatalog[0] ?? null;
  }, [filteredCatalog, selectedPropId]);

  const visibleCatalog = useMemo(
    () => filteredCatalog.slice(0, catalogVisibleCount),
    [filteredCatalog, catalogVisibleCount],
  );

  const visibleStreaks = useMemo(
    () => filteredStreaks.slice(0, streakVisibleCount),
    [filteredStreaks, streakVisibleCount],
  );

  const sportTabItems = useMemo<SofascoreTabItem[]>(() => {
    const base: SofascoreTabItem[] = [
      { id: "all", label: "Todos", count: enrichedCatalog.length + streakCards.length },
    ];
    for (const sp of availableSports) {
      base.push({
        id: sp.id,
        label: sp.label,
        count: sp.propCount > 0 ? sp.propCount : sp.streakCount,
      });
    }
    return base;
  }, [availableSports, enrichedCatalog.length, streakCards.length]);

  const workspaceTabs = useMemo<SofascoreTabItem[]>(() => {
    const items: SofascoreTabItem[] = [];
    if (enrichedCatalog.length > 0) {
      items.push({
        id: "proyecciones",
        label: "Proyecciones y Bet Lab",
        count: filteredCatalog.length,
      });
    }
    if (streakCards.length > 0) {
      items.push({
        id: "rachas",
        label: "Rachas U5–U20",
        count: filteredStreaks.length,
      });
    }
    return items;
  }, [enrichedCatalog.length, filteredCatalog.length, filteredStreaks.length, streakCards.length]);

  const kpiItems = useMemo<SofascoreKpiItem[]>(() => {
    const items: SofascoreKpiItem[] = [
      {
        id: "props-active",
        label: "Props calibrados",
        value: String(enrichedCatalog.length),
        delta: totalNbaProps > 0 ? `NBA ${totalNbaProps}` : null,
        tone: "brand",
      },
      {
        id: "props-guard",
        label: "Guardia minutos",
        value: String(minGuardCount),
        delta: "≥45m / ≥18m",
        tone: "positive",
      },
      {
        id: "props-lineup",
        label: "Titularidad real",
        value: String(lineupSignalCount),
        delta: lineupSignalCount > 0 ? "confirm./prob." : "pendiente",
        tone: "default",
      },
      {
        id: "props-streaks",
        label: "Rachas U5–U20",
        value: String(streakCards.length),
        delta: "Beta(2,2)",
        tone: "default",
      },
    ];
    return items;
  }, [enrichedCatalog.length, lineupSignalCount, minGuardCount, streakCards.length, totalNbaProps]);

  const resetFilters = () => {
    setActiveSport("all");
    setNbaStatFilter("all");
    setOnlyMinMinutesGuard(false);
    setOnlyLineupSignal(false);
    setSearchQuery("");
    setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
    setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
  };

  const navigateOnPlainClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigateTo(href);
    },
    [navigateTo],
  );

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

  const tableColumns = useMemo<SofascoreTableColumn<EnrichedPropEntry>[]>(
    () => [
      {
        key: "player",
        header: "Jugador",
        sticky: true,
        render: (entry) => {
          const isSelected = selectedEntry?.prop.id === entry.prop.id;
          return (
            <div
              className="pl-pb-player-cell"
              data-prop-card={entry.prop.id}
              data-selected={isSelected ? "true" : undefined}
            >
              <PersonAvatar photoKey={entry.photoKey} size={30} />
              <div className="pl-pb-player-copy">
                {entry.prop.playerHref ? (
                  <a
                    href={entry.prop.playerHref}
                    onClick={(e) => navigateOnPlainClick(e, entry.prop.playerHref!)}
                    className="pl-pb-player-name"
                  >
                    {entry.prop.player}
                  </a>
                ) : (
                  <span className="pl-pb-player-name">{entry.prop.player}</span>
                )}
                <span className="pl-pb-player-sub">
                  <TeamBadge
                    league={entry.prop.league}
                    slug={entry.prop.teamSlug}
                    name={entry.prop.teamName}
                    size={14}
                  />
                  <span className="truncate">{entry.prop.matchLabel}</span>
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: "market",
        header: "Mercado",
        render: (entry) => (
          <div className="pl-pb-market-cell">
            <span className="pl-pb-market-top">
              {entry.statCode ? (
                <span className="pl-pb-code num">{entry.statCode}</span>
              ) : null}
              <span>{entry.prop.statLabel}</span>
            </span>
            <span
              className="pl-pb-market-sub num"
              data-prop-sample-guard={entry.minMinutesMet ? "met" : "short"}
            >
              <span>{entry.prop.position}</span>
              {entry.prop.avgMinutes != null ? (
                <span>· {entry.prop.avgMinutes.toFixed(0)}m/p</span>
              ) : null}
              <span data-prop-lineup-signal={entry.lineupState}>· {entry.lineupLabel}</span>
            </span>
          </div>
        ),
      },
      {
        key: "line",
        header: "Línea / Proy.",
        numeric: true,
        align: "end",
        render: (entry) => {
          const activeLine = clampLine(
            customLines[entry.prop.id] ?? entry.prop.baseLine,
            entry.prop.minLine,
            entry.prop.maxLine,
          );
          return (
            <div className="pl-pb-line-cell num">
              <strong className="pl-pb-line-main" data-prop-line={entry.prop.id}>
                +{activeLine.toFixed(1)}
              </strong>
              <span className="pl-pb-line-sub">Proy. {entry.prop.projectionMean.toFixed(1)}</span>
            </div>
          );
        },
      },
      {
        key: "value",
        header: "Valor PitchLab",
        numeric: true,
        align: "end",
        render: (entry) => {
          const activeLine = clampLine(
            customLines[entry.prop.id] ?? entry.prop.baseLine,
            entry.prop.minLine,
            entry.prop.maxLine,
          );
          const evalRes = evaluatePropLineProbability(
            entry.prop.projectionMean,
            entry.prop.projectionSd,
            activeLine,
          );
          const parsedBook = parseManualBookOdds(propOddsInputs[entry.prop.id] ?? "");
          const hasUserOdds = parsedBook !== null;
          const hasComparable = hasUserOdds || entry.prop.hasVerifiedMarketQuote === true;
          const activeBookDec =
            hasUserOdds && parsedBook !== null
              ? parsedBook
              : entry.prop.hasVerifiedMarketQuote
                ? entry.prop.marketOverDecimal
                : evalRes.fairOverDecimal;
          const evPct = hasComparable ? (evalRes.pOver * activeBookDec - 1) * 100 : null;

          return (
            <SofascoreValueCell
              probPct={evalRes.pOver * 100}
              fairLabel={formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}
              bestBookLabel={
                hasUserOdds ? "Tu casa" : entry.prop.hasVerifiedMarketQuote ? "Mercado" : null
              }
              bestOddsLabel={hasComparable ? formatOddsValue(activeBookDec, oddsFormat) : null}
              evPct={evPct}
            />
          );
        },
      },
      {
        key: "signal",
        header: "Señal",
        align: "end",
        render: (entry) => {
          const isSelected = selectedEntry?.prop.id === entry.prop.id;
          const activeLine = clampLine(
            customLines[entry.prop.id] ?? entry.prop.baseLine,
            entry.prop.minLine,
            entry.prop.maxLine,
          );
          const evalRes = evaluatePropLineProbability(
            entry.prop.projectionMean,
            entry.prop.projectionSd,
            activeLine,
          );
          const parsedBook = parseManualBookOdds(propOddsInputs[entry.prop.id] ?? "");
          const hasComparable = parsedBook !== null || entry.prop.hasVerifiedMarketQuote === true;
          const activeBookDec =
            parsedBook !== null
              ? parsedBook
              : entry.prop.hasVerifiedMarketQuote
                ? entry.prop.marketOverDecimal
                : evalRes.fairOverDecimal;
          const evPct = hasComparable ? (evalRes.pOver * activeBookDec - 1) * 100 : null;
          const l10Hits =
            entry.prop.last10.length > 0
              ? entry.prop.last10.filter((v) => v > activeLine).length
              : null;

          return (
            <div className="pl-pb-signal-cell num">
              {evPct !== null ? (
                <SofascoreSignalPair evPct={evPct} compact />
              ) : l10Hits !== null ? (
                <span className="pl-pb-hit-rate">
                  L{entry.prop.last10.length} {l10Hits}/{entry.prop.last10.length}
                </span>
              ) : (
                <span className="pl-pb-hit-rate">{entry.prop.leagueLabel}</span>
              )}
              {isSelected ? <span className="pl-pb-active-tag">En Bet Lab</span> : null}
            </div>
          );
        },
      },
    ],
    [customLines, navigateOnPlainClick, oddsFormat, propOddsInputs, selectedEntry?.prop.id],
  );

  const selectedBetLabData = useMemo(() => {
    if (!selectedEntry) return null;
    const { prop, sport, opponentSlug } = selectedEntry;
    const activeLine = clampLine(
      customLines[prop.id] ?? prop.baseLine,
      prop.minLine,
      prop.maxLine,
    );
    const evalRes = evaluatePropLineProbability(prop.projectionMean, prop.projectionSd, activeLine);
    const matchedStreak = findMatchingStreakCard(streakByPlayerKey, prop);
    const points = buildBetLabPointsForEntry(selectedEntry, matchedStreak);
    const rivalKey = opponentSlug ? `${prop.league}:${opponentSlug}` : null;
    const rivalDefense = rivalKey ? (rivalDefenseByLeagueTeam?.[rivalKey] ?? null) : null;

    const rawOddsText = propOddsInputs[prop.id] ?? "";
    const trimmedOdds = rawOddsText.trim();
    const parsedUserDec = parseManualBookOdds(rawOddsText);
    const hasInvalidOdds = trimmedOdds.length > 0 && parsedUserDec === null;
    const hasUserOdds = parsedUserDec !== null;
    const hasComparable = hasUserOdds || prop.hasVerifiedMarketQuote === true;
    const activeBookDec =
      hasUserOdds && parsedUserDec !== null
        ? parsedUserDec
        : prop.hasVerifiedMarketQuote
          ? prop.marketOverDecimal
          : evalRes.fairOverDecimal;
    const edgePts = (evalRes.pOver - 1 / activeBookDec) * 100;
    const evPct = (evalRes.pOver * activeBookDec - 1) * 100;
    const propPickId = `${prop.id}-over-${activeLine.toFixed(1)}`;
    const alreadySealed = journal.some((j) => j.pickId === propPickId);
    const chartSport: "football" | "basketball" = sport === "basketball" ? "basketball" : "football";

    return {
      entry: selectedEntry,
      activeLine,
      isAtBaseLine: Math.abs(activeLine - prop.baseLine) < 0.01,
      evalRes,
      points,
      rivalDefense,
      rawOddsText,
      hasInvalidOdds,
      hasUserOdds,
      hasComparable,
      activeBookDec,
      edgePts,
      evPct,
      alreadySealed,
      chartSport,
    };
  }, [
    customLines,
    journal,
    propOddsInputs,
    rivalDefenseByLeagueTeam,
    selectedEntry,
    streakByPlayerKey,
  ]);

  return (
    <AtmosphereStage activePath="/app/props">
      <ClubWorkspaceShell activePath="/app/props">
        <div className="pl-pb-page">
          <header className="pl-pb-head">
            <div className="pl-pb-head-copy">
              <span className="pl-pb-eyebrow">
                <MaestroIcon name="sliders" size={12} />
                <span>Bet Lab · Spacetime v5.1</span>
              </span>
              <h1 className="pl-pb-title">Tendencias y props de jugadores</h1>
              <p className="pl-pb-subtitle">
                Props NBA (PTS, REB, AST, 3PM) y fútbol anclados a proyección Spacetime, curva de
                minutos, momio justo y guardia mínima de participación.
              </p>
            </div>
          </header>

          {viewerRole === "visitor" ? (
            <SofascoreCard>
              <div className="pl-pb-lock-body" data-cero-fuga-lock="props-lab">
                <h2 className="pl-pb-lock-title">
                  <MaestroIcon name="lock" size={18} style={{ color: "var(--pl-brand)" }} />
                  <span>Props de jugadores para Pase PitchLab Ultra</span>
                </h2>
                <p className="pl-pb-lock-desc">
                  {hasAccountSession
                    ? "Activa tu Pase PitchLab Ultra para explorar proyecciones individuales calibradas de NBA, fútbol y ligas principales."
                    : "Activa tus 7 días gratis para explorar proyecciones individuales calibradas de NBA, fútbol y ligas principales."}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a
                      href={upgradeHref}
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
                        navigateTo(upgradeHref);
                      }}
                    />
                  }
                >
                  <span>{hasAccountSession ? "Activar Pase Ultra" : "Activar prueba gratis"}</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </Button>
              </div>
            </SofascoreCard>
          ) : enrichedCatalog.length === 0 && streakCards.length === 0 ? (
            <div data-props-empty="">
              <SofascoreCard>
                <SofascoreEmptyState
                  title="Props de jugadores: próximamente"
                  description="Spacetime Suite v5.1 todavía no proyecta estadísticas individuales para este corte. Cuando el motor publique líneas validadas, aquí verás proyección, curva de minutos y ventaja contra tu casa."
                />
              </SofascoreCard>
            </div>
          ) : (
            <>
              <SofascoreKpiStrip items={kpiItems} />

              {workspaceTabs.length > 1 ? (
                <SofascoreTabs
                  items={workspaceTabs}
                  value={activeTab}
                  onChange={(next) => {
                    if (next === "proyecciones" || next === "rachas") {
                      setRequestedTab(next);
                    }
                  }}
                  variant="underline"
                  ariaLabel="Vistas de Player Props"
                />
              ) : null}

              <div className="pl-pb-filter-stack" data-props-filter-bar="">
                <SofascoreFilterBar
                  searchValue={searchQuery}
                  onSearchChange={(next) => {
                    setSearchQuery(next);
                    setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                    setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                  }}
                  searchPlaceholder="Buscar jugador, equipo o liga…"
                  resultCount={
                    activeTab === "proyecciones" ? filteredCatalog.length : filteredStreaks.length
                  }
                >
                  <SofascoreTabs
                    items={sportTabItems}
                    value={activeSport}
                    onChange={(next) => {
                      setActiveSport(next);
                      if (next !== "basketball") setNbaStatFilter("all");
                      setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                      setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                    }}
                    variant="segmented"
                    ariaLabel="Filtrar por deporte"
                  />
                </SofascoreFilterBar>

                {totalNbaProps > 0 || hasAnyMinGuardDiff || hasAnyLineupSignal ? (
                  <div className="pl-pb-subfilters">
                    {totalNbaProps > 0 &&
                    (activeSport === "all" || activeSport === "basketball") ? (
                      <div
                        className="pl-pb-filter-group"
                        role="group"
                        aria-label="Filtrar mercado NBA"
                        data-nba-stat-filter=""
                      >
                        <span className="pl-pb-filter-label">NBA</span>
                        <Button
                          variant={nbaStatFilter === "all" ? "primary" : "secondary"}
                          size="sm"
                          aria-pressed={nbaStatFilter === "all"}
                          onClick={() => {
                            setNbaStatFilter("all");
                            setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                          }}
                        >
                          Todos
                        </Button>
                        {NBA_STAT_CODE_ORDER.map((code) => {
                          const count = nbaStatCounts[code];
                          if (count === 0) return null;
                          return (
                            <Button
                              key={code}
                              variant={nbaStatFilter === code ? "primary" : "secondary"}
                              size="sm"
                              aria-pressed={nbaStatFilter === code}
                              className="num"
                              onClick={() => {
                                setActiveSport("basketball");
                                setNbaStatFilter(code);
                                setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                              }}
                            >
                              {code} ({count})
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <span />
                    )}

                    <div className="pl-pb-filter-group">
                      {hasAnyMinGuardDiff ? (
                        <Button
                          variant={onlyMinMinutesGuard ? "primary" : "secondary"}
                          size="sm"
                          aria-pressed={onlyMinMinutesGuard}
                          data-props-min-minutes-toggle=""
                          onClick={() => {
                            setOnlyMinMinutesGuard((v) => !v);
                            setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                            setStreakVisibleCount(INITIAL_STREAK_PAGE_SIZE);
                          }}
                        >
                          {MIN_SAMPLE_GUARD_LABEL}
                        </Button>
                      ) : null}

                      {hasAnyLineupSignal ? (
                        <Button
                          variant={onlyLineupSignal ? "primary" : "secondary"}
                          size="sm"
                          aria-pressed={onlyLineupSignal}
                          data-props-lineup-toggle=""
                          onClick={() => {
                            setOnlyLineupSignal((v) => !v);
                            setCatalogVisibleCount(INITIAL_CATALOG_PAGE_SIZE);
                          }}
                        >
                          Titular confirmado / probable
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {activeTab === "proyecciones" && enrichedCatalog.length > 0 ? (
                <section aria-label="Props calibrados por partido">
                  {filteredCatalog.length === 0 ? (
                    <SofascoreEmptyState
                      title="Sin proyecciones para este filtro"
                      description="Prueba cambiando de deporte, quitando el filtro de titularidad o limpiando la búsqueda."
                      actionLabel="Limpiar filtros"
                      onAction={resetFilters}
                    />
                  ) : (
                    <div className="pl-pb-workspace">
                      <div className="pl-pb-table-col">
                        <SofascoreCard
                          title="Catálogo de proyecciones calibradas"
                          meta={`${visibleCatalog.length} de ${filteredCatalog.length}`}
                          density="compact"
                        >
                          <SofascoreTable
                            caption="Catálogo calibrado de player props con momio justo y señal"
                            columns={tableColumns}
                            rows={visibleCatalog}
                            rowKey={(entry) => entry.prop.id}
                            density="compact"
                            onRowClick={(entry) => setSelectedPropId(entry.prop.id)}
                          />
                        </SofascoreCard>

                        {filteredCatalog.length > catalogVisibleCount ? (
                          <div className="pl-pb-pagination">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="num"
                              onClick={() =>
                                setCatalogVisibleCount((c) => c + INITIAL_CATALOG_PAGE_SIZE)
                              }
                            >
                              Mostrar más props ({filteredCatalog.length - catalogVisibleCount}{" "}
                              restantes)
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {selectedBetLabData ? (
                        <aside className="pl-pb-lab-col" aria-label="Inspector Bet Lab">
                          <SofascoreCard
                            title="Bet Lab · Inspector de línea"
                            meta={selectedBetLabData.entry.prop.engineName}
                          >
                            <div className="pl-pb-lab-body">
                              <div className="pl-pb-lab-identity">
                                <div className="pl-pb-lab-person">
                                  <PersonAvatar
                                    photoKey={selectedBetLabData.entry.photoKey}
                                    size={44}
                                  />
                                  <div className="pl-pb-player-copy">
                                    <h2 className="pl-pb-lab-title">
                                      {selectedBetLabData.entry.prop.playerHref ? (
                                        <a
                                          href={selectedBetLabData.entry.prop.playerHref}
                                          onClick={(e) =>
                                            navigateOnPlainClick(
                                              e,
                                              selectedBetLabData.entry.prop.playerHref!,
                                            )
                                          }
                                          className="pl-pb-player-name"
                                        >
                                          {selectedBetLabData.entry.prop.player}
                                        </a>
                                      ) : (
                                        selectedBetLabData.entry.prop.player
                                      )}
                                    </h2>
                                    <div className="pl-pb-lab-sub num">
                                      <TeamBadge
                                        league={selectedBetLabData.entry.prop.league}
                                        slug={selectedBetLabData.entry.prop.teamSlug}
                                        name={selectedBetLabData.entry.prop.teamName}
                                        size={15}
                                      />
                                      <span>{selectedBetLabData.entry.prop.leagueLabel}</span>
                                      <span>· {selectedBetLabData.entry.prop.matchLabel}</span>
                                      {selectedBetLabData.entry.prop.kickoffLocal ? (
                                        <span>· {selectedBetLabData.entry.prop.kickoffLocal}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="pl-pb-lab-badges num">
                                  <span
                                    className={`pl-pb-status-pill is-${selectedBetLabData.entry.lineupState}`}
                                  >
                                    {selectedBetLabData.entry.lineupLabel}
                                  </span>
                                  {selectedBetLabData.entry.minMinutesMet ? (
                                    <span className="pl-pb-status-pill is-guard">
                                      {selectedBetLabData.entry.guardLabel}
                                      {selectedBetLabData.entry.prop.avgMinutes != null
                                        ? ` · ${selectedBetLabData.entry.prop.avgMinutes.toFixed(1)}m`
                                        : ""}
                                    </span>
                                  ) : null}
                                  {selectedBetLabData.entry.isDoubtful ? (
                                    <span className="pl-pb-status-pill is-doubtful">En duda</span>
                                  ) : null}
                                </div>
                              </div>

                              <PropBetLabChart
                                playerName={selectedBetLabData.entry.prop.player}
                                statLabel={selectedBetLabData.entry.prop.statLabel}
                                unitLabel={selectedBetLabData.entry.unitLabel}
                                sport={selectedBetLabData.chartSport}
                                line={selectedBetLabData.activeLine}
                                points={selectedBetLabData.points}
                                maxMinutes={selectedBetLabData.chartSport === "basketball" ? 48 : 90}
                                rivalDefenseRank={
                                  selectedBetLabData.rivalDefense?.defenseRank ?? null
                                }
                                rivalLeagueSize={
                                  selectedBetLabData.rivalDefense?.leagueSize ?? null
                                }
                                rivalEbLabel={selectedBetLabData.rivalDefense?.ebLabel ?? null}
                                calibratedProb={selectedBetLabData.evalRes.pOver}
                                fairDecimal={selectedBetLabData.evalRes.fairOverDecimal}
                                onLineChange={(nextLine) => {
                                  const clamped = clampLine(
                                    nextLine,
                                    selectedBetLabData.entry.prop.minLine,
                                    selectedBetLabData.entry.prop.maxLine,
                                  );
                                  setCustomLines((prev) => ({
                                    ...prev,
                                    [selectedBetLabData.entry.prop.id]: clamped,
                                  }));
                                }}
                              />

                              <div className="pl-pb-line-bar num">
                                <div className="pl-pb-line-readout">
                                  <span className="pl-pb-line-readout-label">
                                    Distribución Spacetime ({selectedBetLabData.entry.prop.statLabel})
                                  </span>
                                  <div className="pl-pb-line-readout-vals">
                                    <strong>{selectedBetLabData.activeLine.toFixed(1)}</strong>
                                    <span className="pl-pb-line-sub">
                                      Proy. {selectedBetLabData.entry.prop.projectionMean.toFixed(2)}{" "}
                                      ± {selectedBetLabData.entry.prop.projectionSd.toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className="pl-pb-line-controls"
                                  role="group"
                                  aria-label={`Ajustar línea de ${selectedBetLabData.entry.prop.player}`}
                                >
                                  <Button
                                    variant="secondary"
                                    size="icon-sm"
                                    aria-label={`Bajar línea de ${selectedBetLabData.entry.prop.player}`}
                                    disabled={
                                      selectedBetLabData.activeLine <=
                                      selectedBetLabData.entry.prop.minLine
                                    }
                                    onClick={() => {
                                      const next = clampLine(
                                        selectedBetLabData.activeLine -
                                          selectedBetLabData.entry.prop.step,
                                        selectedBetLabData.entry.prop.minLine,
                                        selectedBetLabData.entry.prop.maxLine,
                                      );
                                      setCustomLines((prev) => ({
                                        ...prev,
                                        [selectedBetLabData.entry.prop.id]: next,
                                      }));
                                    }}
                                  >
                                    −
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={selectedBetLabData.isAtBaseLine}
                                    className="num"
                                    onClick={() =>
                                      setCustomLines((prev) => ({
                                        ...prev,
                                        [selectedBetLabData.entry.prop.id]:
                                          selectedBetLabData.entry.prop.baseLine,
                                      }))
                                    }
                                  >
                                    Base ({selectedBetLabData.entry.prop.baseLine.toFixed(1)})
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="icon-sm"
                                    aria-label={`Subir línea de ${selectedBetLabData.entry.prop.player}`}
                                    disabled={
                                      selectedBetLabData.activeLine >=
                                      selectedBetLabData.entry.prop.maxLine
                                    }
                                    onClick={() => {
                                      const next = clampLine(
                                        selectedBetLabData.activeLine +
                                          selectedBetLabData.entry.prop.step,
                                        selectedBetLabData.entry.prop.minLine,
                                        selectedBetLabData.entry.prop.maxLine,
                                      );
                                      setCustomLines((prev) => ({
                                        ...prev,
                                        [selectedBetLabData.entry.prop.id]: next,
                                      }));
                                    }}
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>

                              <div className="pl-pb-ou-grid num">
                                <div className="pl-pb-ou-tile is-primary">
                                  <span className="pl-pb-ou-label">
                                    Más de {selectedBetLabData.activeLine.toFixed(1)}
                                  </span>
                                  <strong className="pl-pb-ou-val">
                                    {(selectedBetLabData.evalRes.pOver * 100).toFixed(1)} % · Justo{" "}
                                    {formatOddsValue(
                                      selectedBetLabData.evalRes.fairOverDecimal,
                                      oddsFormat,
                                    )}
                                  </strong>
                                </div>
                                <div className="pl-pb-ou-tile">
                                  <span className="pl-pb-ou-label">
                                    Menos de {selectedBetLabData.activeLine.toFixed(1)}
                                  </span>
                                  <strong className="pl-pb-ou-val">
                                    {(selectedBetLabData.evalRes.pUnder * 100).toFixed(1)} % ·
                                    Justo{" "}
                                    {formatOddsValue(
                                      selectedBetLabData.evalRes.fairUnderDecimal,
                                      oddsFormat,
                                    )}
                                  </strong>
                                </div>
                              </div>

                              {selectedBetLabData.entry.refereeSummary ? (
                                <div className="pl-pb-ref-bar num" data-prop-referee-context="">
                                  <span className="pl-pb-ref-name">
                                    <MaestroIcon name="whistle" size={13} />
                                    <span className="truncate">
                                      {selectedBetLabData.entry.refereeSummary.name}
                                    </span>
                                  </span>
                                  <span className="pl-pb-ref-metrics">
                                    {selectedBetLabData.entry.refereeSummary.avgYellow !== null ? (
                                      <span className="inline-flex items-center gap-1">
                                        <SportEventIcon kind="yellow" size={11} />
                                        <span>
                                          {selectedBetLabData.entry.refereeSummary.avgYellow.toFixed(
                                            1,
                                          )}{" "}
                                          amar./p
                                        </span>
                                      </span>
                                    ) : null}
                                    {selectedBetLabData.entry.refereeSummary.avgFouls !== null ? (
                                      <span>
                                        {selectedBetLabData.entry.refereeSummary.avgFouls.toFixed(
                                          1,
                                        )}{" "}
                                        faltas/p
                                      </span>
                                    ) : null}
                                    {selectedBetLabData.entry.refereeSummary.rigorLabel ? (
                                      <span className="pl-pb-status-pill">
                                        {selectedBetLabData.entry.refereeSummary.rigorLabel}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              ) : null}

                              <div className="pl-pb-comparator" data-prop-comparator="">
                                <div className="pl-pb-comparator-head">
                                  <label
                                    htmlFor={comparatorInputId}
                                    className="pl-pb-comparator-label"
                                  >
                                    <MaestroIcon
                                      name="activity"
                                      size={13}
                                      style={{ color: "var(--pl-brand)" }}
                                    />
                                    <span>Compara con tu casa</span>
                                  </label>
                                  <span className="pl-pb-line-readout-label num">
                                    Momio justo{" "}
                                    <strong>
                                      {formatOddsValue(
                                        selectedBetLabData.evalRes.fairOverDecimal,
                                        oddsFormat,
                                      )}
                                    </strong>
                                  </span>
                                </div>

                                <div className="pl-pb-comparator-input-row">
                                  <div className="pl-pb-comparator-field">
                                    <input
                                      id={comparatorInputId}
                                      type="text"
                                      inputMode="decimal"
                                      autoCorrect="off"
                                      spellCheck={false}
                                      value={selectedBetLabData.rawOddsText}
                                      onChange={(e) =>
                                        setPropOddsInputs((prev) => ({
                                          ...prev,
                                          [selectedBetLabData.entry.prop.id]: e.target.value,
                                        }))
                                      }
                                      placeholder={formatOddsValue(
                                        selectedBetLabData.evalRes.fairOverDecimal,
                                        oddsFormat,
                                      )}
                                      className="pl-pb-input num"
                                    />
                                  </div>

                                  {selectedBetLabData.hasComparable ? (
                                    <SofascoreSignalPair evPct={selectedBetLabData.evPct} />
                                  ) : null}
                                </div>

                                {selectedBetLabData.hasInvalidOdds ? (
                                  <p className="pl-pb-comparator-hint is-error" role="alert">
                                    Ingresa un momio decimal mayor a 1.01 (ej. 1.95) o americano
                                    (ej. -110 o +135).
                                  </p>
                                ) : selectedBetLabData.hasComparable ? (
                                  <div className="pl-pb-comparator-result num">
                                    <span>
                                      Tu casa:{" "}
                                      <strong>
                                        {formatOddsValue(
                                          selectedBetLabData.activeBookDec,
                                          oddsFormat,
                                        )}
                                      </strong>
                                    </span>
                                    <span>
                                      Ventaja:{" "}
                                      <strong>
                                        {selectedBetLabData.edgePts >= 0 ? "+" : ""}
                                        {selectedBetLabData.edgePts.toFixed(1)} pts
                                      </strong>
                                    </span>
                                  </div>
                                ) : (
                                  <p className="pl-pb-comparator-hint">
                                    Escribe el momio de tu casa (decimal o americano) para medir
                                    EV+ frente al momio justo PitchLab.
                                  </p>
                                )}
                              </div>

                              <p className="pl-pb-context-note">
                                {selectedBetLabData.entry.prop.contextNote}
                                {selectedBetLabData.entry.prop.injuryNote
                                  ? ` · Nota médica: ${selectedBetLabData.entry.prop.injuryNote}`
                                  : ""}
                              </p>

                              <div className="pl-pb-lab-foot num">
                                <span className="pl-pb-lab-stake">
                                  1.00u ·{" "}
                                  {selectedBetLabData.hasComparable
                                    ? `Casa ${formatOddsValue(selectedBetLabData.activeBookDec, oddsFormat)}`
                                    : `Justo ${formatOddsValue(selectedBetLabData.evalRes.fairOverDecimal, oddsFormat)}`}
                                </span>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() =>
                                    handleSealProp(
                                      selectedBetLabData.entry.prop,
                                      selectedBetLabData.activeLine,
                                      selectedBetLabData.evalRes.pOver,
                                      selectedBetLabData.evalRes.fairOverDecimal,
                                      selectedBetLabData.activeBookDec,
                                    )
                                  }
                                >
                                  <MaestroIcon
                                    name={selectedBetLabData.alreadySealed ? "check" : "ticket"}
                                    size={13}
                                  />
                                  <span>
                                    {selectedBetLabData.alreadySealed
                                      ? "Prop sellado en Bitácora"
                                      : "Sellar Prop en mi Bitácora"}
                                  </span>
                                </Button>
                              </div>
                            </div>
                          </SofascoreCard>
                        </aside>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}

              {activeTab === "rachas" && streakCards.length > 0 ? (
                <section
                  className="pl-pb-page"
                  aria-label="Tendencias de jugadores contra línea"
                >
                  {filteredStreaks.length > 0 ? (
                    <>
                      <div className="pl-pb-streak-grid">
                        {visibleStreaks.map((card) => (
                          <PlayerPropStreakCard
                            key={card.id}
                            {...card}
                            oddsFormat={oddsFormat}
                            onNavigate={navigateTo}
                          />
                        ))}
                      </div>
                      {filteredStreaks.length > streakVisibleCount ? (
                        <div className="pl-pb-pagination">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="num"
                            onClick={() =>
                              setStreakVisibleCount((c) => c + INITIAL_STREAK_PAGE_SIZE)
                            }
                          >
                            Mostrar más tendencias ({filteredStreaks.length - streakVisibleCount}{" "}
                            restantes)
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <SofascoreEmptyState
                      title="Sin rachas para este filtro"
                      description="Ningún jugador en tendencias coincide con los criterios activos."
                      actionLabel="Limpiar filtros"
                      onAction={resetFilters}
                    />
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
