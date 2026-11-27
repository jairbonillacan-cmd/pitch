"use client";

import React, { Suspense, lazy, useCallback, useId, useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  canonicalPlayerHref,
  canonicalTeamHref,
  getLeagueCapability,
  isLiveCapableLeague,
  isLivePhaseActive,
  isSafePublicLabel,
  parseStrictFiniteNumber,
  sportHasDraw,
  sportScoringUnit,
  type HeadToHeadView,
  type LiveIncident,
  type LiveMatchDetail,
  type LiveScoreboardEntry,
  type LiveTeamStats,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked, isPreGameIntelUnlocked } from "../../access-guard";
import {
  AtomicFormStrip,
  AtomicStatComparisonBar,
  LivePickProgressBar,
  parseAtomicForm,
  type AtomicLineupPlayer,
  type AtomicShotItem,
  type LiveAsianPickState,
} from "../../atomic";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { SportEventIcon } from "../../components/SportEventIcons";
import { useClientJsonSwr, useMediaQuery, useSafeEffect } from "../../hooks";
import { LiveScoreTelemetry } from "../../live/LiveScoreTelemetry";
import { useLiveMatch } from "../../live/live-store";
import { sanitizeInternalHref, setActiveSharedTransition } from "../../navigation-helpers";
import {
  isConservativeChalkPick,
  partitionPlayableAndConservative,
  scorePlayablePick,
} from "../../pick-quality-ranker";
import {
  catalogEvidenceToWindowItems,
  catalogPickItemToMatchPick,
  type CatalogPickItem,
  type GamePreviewPayload,
  type PickSettlementStatus,
} from "../../picks-catalog";
import {
  useOptionalPlatformActions,
  useOptionalPlatformCore,
  useWatchlistGameIds,
} from "../../platform-provider";
import type {
  ConfirmedLineupPlayer,
  MatchEnfrentamientosData,
  MatchInjuryItem,
  MatchPick,
  PlatformGame,
} from "../../types";
import {
  EvidenceWindowPills,
  extractEvidenceWindows,
  type EvidenceWindowItem,
} from "../picks/EvidenceWindowPills";
import type { LeagueStandingsSplitsData } from "../StandingsBracketsSection";
import { longDayLabel } from "./home-model";
import { formatGameKickoffTime, formatLiveChipPhase } from "./home-view-helpers";

const LazyMomentumChart = lazy(() =>
  import("../../live/live-charts").then((m) => ({ default: m.MomentumChart })),
);
const LazyAtomicShotmapPitch = lazy(() =>
  import("../../atomic/AtomicShotmapPitch").then((m) => ({ default: m.AtomicShotmapPitch })),
);
const LazyAtomicLineupPitch = lazy(() =>
  import("../../atomic/AtomicLineupPitch").then((m) => ({ default: m.AtomicLineupPitch })),
);
const LazyMatchPlayerPicksBoard = lazy(() =>
  import("../match/MatchPlayerPicksBoard").then((m) => ({ default: m.MatchPlayerPicksBoard })),
);
const LazyMatchLineupsPanel = lazy(() =>
  import("../match/MatchLineupsPanel").then((m) => ({ default: m.MatchLineupsPanel })),
);
const LazyMatchEnfrentamientosPanel = lazy(() =>
  import("../match/MatchEnfrentamientosPanel").then((m) => ({
    default: m.MatchEnfrentamientosPanel,
  })),
);
const LazyStandingsBracketsSection = lazy(() =>
  import("../StandingsBracketsSection").then((m) => ({ default: m.StandingsBracketsSection })),
);
const LazyMatchInjuriesPanel = lazy(() =>
  import("../match/MatchInjuriesPanel").then((m) => ({ default: m.MatchInjuriesPanel })),
);

function HomeMatchSubpanelFallback({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div
      className="pl-skel-card rounded-2xl p-4 space-y-2.5"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="pl-skel-bar h-4 w-36 rounded-md" />
      <div className="pl-skel-bar h-24 rounded-xl" />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLeagueStandingsSplitsData(value: unknown): value is LeagueStandingsSplitsData {
  if (!isRecord(value)) return false;
  return (
    typeof value.league === "string" &&
    typeof value.leagueLabel === "string" &&
    typeof value.sport === "string" &&
    Array.isArray(value.total) &&
    Array.isArray(value.home) &&
    Array.isArray(value.away) &&
    Array.isArray(value.zones) &&
    value.total.length > 0
  );
}

function slugifyPlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatIncidentMinute(inc: LiveIncident): string {
  if (inc.minute === null) return "";
  return inc.addedTime && inc.addedTime > 0
    ? `${inc.minute}+${inc.addedTime}'`
    : `${inc.minute}'`;
}

function incidentLabelEs(inc: LiveIncident): string {
  if (inc.kind === "goal") return "Gol";
  if (inc.kind === "own_goal") return "Autogol";
  if (inc.kind === "penalty_goal") return "Gol de penal";
  if (inc.kind === "penalty_missed") return "Penal fallado";
  if (inc.kind === "yellow") return "Tarjeta amarilla";
  if (inc.kind === "second_yellow") return "Doble amarilla";
  if (inc.kind === "red") return "Tarjeta roja";
  if (inc.kind === "sub") return "Cambio";
  if (inc.kind === "var") return "Revisión VAR";
  return inc.note ?? "Periodo";
}

function settlementLabelEs(status: PickSettlementStatus | "hit" | "miss" | null | undefined): string | null {
  if (status === "hit") return "Acertado";
  if (status === "miss") return "Fallado";
  if (status === "push") return "Push";
  return null;
}

type DetailTabKey =
  | "picks"
  | "stats"
  | "enfrentamientos"
  | "lineups"
  | "standings"
  | "injuries"
  | "timeline";

interface DetailTabDef {
  readonly id: DetailTabKey;
  readonly label: string;
  readonly count?: number;
}

interface StatRowSpec {
  readonly key: string;
  readonly label: string;
  readonly homeValue: number;
  readonly awayValue: number;
  readonly pct?: boolean;
  readonly digits?: number;
  readonly lowerIsBetter?: boolean;
}

interface StatBlockSpec {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly StatRowSpec[];
}

interface DetailPickDisplayItem {
  readonly id: string;
  readonly pick: MatchPick;
  readonly categoryLabel: string;
  readonly fairDecimal: number;
  readonly marketDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly market?: string | null;
  readonly label?: string | null;
  readonly decimal?: number | null;
  readonly settlement: PickSettlementStatus | "hit" | "miss" | null;
  readonly windows: readonly EvidenceWindowItem[];
  readonly bullets: readonly { readonly label: string; readonly ratePct: number | null; readonly tone: string }[];
  readonly isPrimary: boolean;
  readonly isRedacted: boolean;
  readonly fromCatalog: boolean;
}

interface ComputedLiveBar {
  readonly pickLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal: number | null;
  readonly asianState: LiveAsianPickState | null;
}

function computeAsianState(teamMargin: number, handicapLine: number): LiveAsianPickState {
  const adjusted = Math.round((teamMargin + handicapLine) * 100) / 100;
  if (adjusted >= 0.5) return "won_full";
  if (adjusted > 0 && adjusted < 0.5) return "won_half";
  if (adjusted === 0) return "push";
  if (adjusted < 0 && adjusted > -0.5) return "lost_half";
  return "lost_full";
}

function buildLiveProgressForPick(params: {
  readonly pick: MatchPick;
  readonly game: PlatformGame;
  readonly score: { readonly home: number; readonly away: number };
  readonly stats: { readonly home: LiveTeamStats; readonly away: LiveTeamStats } | null;
  readonly minute: number | null;
}): ComputedLiveBar | null {
  const { pick, game, score, stats, minute } = params;
  const lower = pick.label.toLowerCase();
  const isFootball = game.sport === "football";
  const scoreUnit = sportScoringUnit(game.sport).short;
  const scaleFactor =
    isFootball && minute !== null && Number.isFinite(minute) && minute >= 8 && minute <= 88
      ? 90 / minute
      : null;

  const isOver = lower.includes("más de") || lower.startsWith("más ") || lower.includes("over ");
  const isUnder = lower.includes("menos de") || lower.startsWith("menos ") || lower.includes("under ");
  if (isOver || isUnder) {
    const numMatch = /(\d+(?:\.\d+)?)/.exec(lower);
    const parsedLine =
      typeof pick.line === "number" && Number.isFinite(pick.line)
        ? pick.line
        : numMatch?.[1]
          ? parseStrictFiniteNumber(numMatch[1])
          : null;
    if (parsedLine !== null && parsedLine > 0) {
      let actual: number | null = null;
      let unitLabel = scoreUnit;
      if (lower.includes("córner") || lower.includes("corner") || lower.includes("esquina")) {
        if (stats && stats.home.corners !== null && stats.away.corners !== null) {
          actual = stats.home.corners + stats.away.corners;
          unitLabel = "córners";
        }
      } else if (lower.includes("tarjeta") || lower.includes("amarilla") || lower.includes("card")) {
        if (stats && stats.home.yellowCards !== null && stats.away.yellowCards !== null) {
          actual = stats.home.yellowCards + stats.away.yellowCards;
          unitLabel = "tarjetas";
        }
      } else if (lower.includes("puerta") || lower.includes("arco")) {
        if (stats && stats.home.shotsOnTarget !== null && stats.away.shotsOnTarget !== null) {
          actual = stats.home.shotsOnTarget + stats.away.shotsOnTarget;
          unitLabel = "tiros a puerta";
        }
      } else if (lower.includes("tiro") || lower.includes("disparo")) {
        if (stats && stats.home.shots !== null && stats.away.shots !== null) {
          actual = stats.home.shots + stats.away.shots;
          unitLabel = "tiros";
        }
      } else {
        actual = score.home + score.away;
        unitLabel = scoreUnit;
      }

      if (actual !== null) {
        const projectedFinal =
          scaleFactor !== null && actual > 0
            ? Math.round(actual * scaleFactor * 10) / 10
            : null;
        return {
          pickLabel: pick.label,
          actualValue: actual,
          targetLine: parsedLine,
          unitLabel,
          direction: isOver ? "over" : "under",
          projectedFinal,
          asianState: null,
        };
      }
    }
  }

  const hcpMatch = /([+-]\d+(?:\.(?:0|25|5|75))?)\b/.exec(pick.label);
  if (hcpMatch?.[1]) {
    const hcpLine = parseStrictFiniteNumber(hcpMatch[1]);
    if (hcpLine !== null) {
      const picksAway =
        lower.includes(game.away.shortName.toLowerCase()) ||
        lower.includes("visit");
      const margin = picksAway ? score.away - score.home : score.home - score.away;
      return {
        pickLabel: pick.label,
        actualValue: margin,
        targetLine: hcpLine,
        unitLabel: isFootball ? "goles" : scoreUnit,
        direction: "handicap",
        projectedFinal: null,
        asianState: computeAsianState(margin, hcpLine),
      };
    }
  }

  if (lower.includes("ambos anotan")) {
    const wantsYes = !lower.includes("no");
    const scoredTeams = (score.home > 0 ? 1 : 0) + (score.away > 0 ? 1 : 0);
    return {
      pickLabel: pick.label,
      actualValue: scoredTeams,
      targetLine: 1.5,
      unitLabel: "equipos",
      direction: wantsYes ? "over" : "under",
      projectedFinal: null,
      asianState: null,
    };
  }

  const selLower = pick.selectionKey.toLowerCase();
  const isDoubleChance =
    selLower.includes("1x") ||
    selLower.includes("x2") ||
    selLower.includes("home_draw") ||
    selLower.includes("away_draw") ||
    selLower.includes("double_chance") ||
    lower.includes("o empate") ||
    lower.includes("doble oportunidad");

  if (isDoubleChance) {
    if (selLower.includes("12") && !selLower.includes("1x") && !selLower.includes("x2")) {
      return null;
    }
    const picksAwayDc =
      selLower.includes("x2") ||
      selLower.includes("away_draw") ||
      (lower.includes(game.away.shortName.toLowerCase()) &&
        !lower.includes(game.home.shortName.toLowerCase()));
    const margin = picksAwayDc ? score.away - score.home : score.home - score.away;
    return {
      pickLabel: pick.label,
      actualValue: margin,
      targetLine: 0.5,
      unitLabel: isFootball ? "goles" : scoreUnit,
      direction: "handicap",
      projectedFinal: null,
      asianState: computeAsianState(margin, 0.5),
    };
  }

  if (
    selLower === "draw" ||
    selLower.endsWith(":draw") ||
    selLower.endsWith("_draw") ||
    lower === "empate" ||
    lower.startsWith("empate ")
  ) {
    return null;
  }

  const picksAway =
    selLower.includes("away") ||
    (lower.includes(game.away.shortName.toLowerCase()) && !lower.includes(game.home.shortName.toLowerCase()));
  const margin = picksAway ? score.away - score.home : score.home - score.away;
  return {
    pickLabel: pick.label,
    actualValue: margin,
    targetLine: 0,
    unitLabel: isFootball ? "goles" : scoreUnit,
    direction: "handicap",
    projectedFinal: null,
    asianState: computeAsianState(margin, 0),
  };
}

function buildStatBlocks(params: {
  readonly game: PlatformGame;
  readonly preview: GamePreviewPayload | null;
  readonly liveStats: { readonly home: LiveTeamStats; readonly away: LiveTeamStats } | null;
  readonly unlocked: boolean;
}): readonly StatBlockSpec[] {
  const { game, preview, liveStats, unlocked } = params;
  const blocks: StatBlockSpec[] = [];

  if (liveStats) {
    const shotsRows: StatRowSpec[] = [];
    if (liveStats.home.shots !== null && liveStats.away.shots !== null) {
      shotsRows.push({
        key: "shots",
        label: "Tiros totales",
        homeValue: liveStats.home.shots,
        awayValue: liveStats.away.shots,
      });
    }
    if (liveStats.home.shotsOnTarget !== null && liveStats.away.shotsOnTarget !== null) {
      shotsRows.push({
        key: "sot",
        label: "Tiros a puerta",
        homeValue: liveStats.home.shotsOnTarget,
        awayValue: liveStats.away.shotsOnTarget,
      });
    }
    if (liveStats.home.bigChances !== null && liveStats.away.bigChances !== null) {
      shotsRows.push({
        key: "bigChances",
        label: "Grandes ocasiones",
        homeValue: liveStats.home.bigChances,
        awayValue: liveStats.away.bigChances,
      });
    }
    if (unlocked && liveStats.home.xg !== null && liveStats.away.xg !== null) {
      shotsRows.push({
        key: "xg",
        label: "Goles esperados (xG)",
        homeValue: liveStats.home.xg,
        awayValue: liveStats.away.xg,
        digits: 2,
      });
    }
    if (shotsRows.length > 0) {
      blocks.push({ id: "shots", title: "Tiros y peligro", rows: shotsRows });
    }

    const attackRows: StatRowSpec[] = [];
    if (liveStats.home.possessionPct !== null && liveStats.away.possessionPct !== null) {
      attackRows.push({
        key: "possession",
        label: "Posesión",
        homeValue: liveStats.home.possessionPct,
        awayValue: liveStats.away.possessionPct,
        pct: true,
      });
    }
    if (
      liveStats.home.passAccuracyPct != null &&
      liveStats.away.passAccuracyPct != null
    ) {
      attackRows.push({
        key: "passAcc",
        label: "Precisión de pase",
        homeValue: liveStats.home.passAccuracyPct,
        awayValue: liveStats.away.passAccuracyPct,
        pct: true,
      });
    }
    if (liveStats.home.touchesInBox != null && liveStats.away.touchesInBox != null) {
      attackRows.push({
        key: "boxTouches",
        label: "Toques en el área",
        homeValue: liveStats.home.touchesInBox,
        awayValue: liveStats.away.touchesInBox,
      });
    }
    if (liveStats.home.offsides !== null && liveStats.away.offsides !== null) {
      attackRows.push({
        key: "offsides",
        label: "Fueras de juego",
        homeValue: liveStats.home.offsides,
        awayValue: liveStats.away.offsides,
      });
    }
    if (attackRows.length > 0) {
      blocks.push({ id: "attack", title: "Ataque y control", rows: attackRows });
    }

    const disciplineRows: StatRowSpec[] = [];
    if (liveStats.home.corners !== null && liveStats.away.corners !== null) {
      disciplineRows.push({
        key: "corners",
        label: "Córners",
        homeValue: liveStats.home.corners,
        awayValue: liveStats.away.corners,
      });
    }
    if (liveStats.home.fouls !== null && liveStats.away.fouls !== null) {
      disciplineRows.push({
        key: "fouls",
        label: "Faltas",
        homeValue: liveStats.home.fouls,
        awayValue: liveStats.away.fouls,
        lowerIsBetter: true,
      });
    }
    if (liveStats.home.yellowCards !== null && liveStats.away.yellowCards !== null) {
      disciplineRows.push({
        key: "yellow",
        label: "Tarjetas amarillas",
        homeValue: liveStats.home.yellowCards,
        awayValue: liveStats.away.yellowCards,
        lowerIsBetter: true,
      });
    }
    if (
      liveStats.home.redCards !== null &&
      liveStats.away.redCards !== null &&
      (liveStats.home.redCards > 0 || liveStats.away.redCards > 0)
    ) {
      disciplineRows.push({
        key: "red",
        label: "Tarjetas rojas",
        homeValue: liveStats.home.redCards,
        awayValue: liveStats.away.redCards,
        lowerIsBetter: true,
      });
    }
    if (disciplineRows.length > 0) {
      blocks.push({ id: "discipline", title: "Balón parado y disciplina", rows: disciplineRows });
    }

    return blocks;
  }

  if (!unlocked) {
    return [];
  }

  const micro = preview?.detail?.v5?.microCounts ?? null;
  const projection = preview?.game.projection ?? game.projection;
  const unit = sportScoringUnit(game.sport);
  const isFootball = game.sport === "football";

  const offenseRows: StatRowSpec[] = [];
  if (unlocked && projection) {
    offenseRows.push({
      key: "proj-score",
      label: isFootball ? "Goles esperados (xG)" : `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} proyectados`,
      homeValue: projection.home,
      awayValue: projection.away,
      digits: unit.decimals,
    });
  }
  if (isFootball && micro?.shots) {
    offenseRows.push({
      key: "proj-shots",
      label: "Tiros proyectados",
      homeValue: micro.shots.home,
      awayValue: micro.shots.away,
      digits: 1,
    });
  }
  if (isFootball && micro?.shotsOnTarget) {
    offenseRows.push({
      key: "proj-sot",
      label: "Tiros a puerta proyectados",
      homeValue: micro.shotsOnTarget.home,
      awayValue: micro.shotsOnTarget.away,
      digits: 1,
    });
  }
  if (offenseRows.length > 0) {
    blocks.push({
      id: "offense",
      title: isFootball ? "Proyección ofensiva" : "Proyección del encuentro",
      rows: offenseRows,
    });
  }

  if (isFootball) {
    const countRows: StatRowSpec[] = [];
    const corners = micro?.corners ?? game.counts?.corners;
    const fouls = micro?.fouls ?? game.counts?.fouls;
    const yellows = micro?.yellowCards ?? game.counts?.yellow;
    if (corners) {
      countRows.push({
        key: "proj-corners",
        label: "Córners esperados",
        homeValue: corners.home,
        awayValue: corners.away,
        digits: 1,
      });
    }
    if (fouls) {
      countRows.push({
        key: "proj-fouls",
        label: "Faltas esperadas",
        homeValue: fouls.home,
        awayValue: fouls.away,
        digits: 1,
        lowerIsBetter: true,
      });
    }
    if (yellows) {
      countRows.push({
        key: "proj-yellows",
        label: "Amarillas esperadas",
        homeValue: yellows.home,
        awayValue: yellows.away,
        digits: 1,
        lowerIsBetter: true,
      });
    }
    if (countRows.length > 0) {
      blocks.push({
        id: "counts",
        title: "Córners, faltas y tarjetas",
        rows: countRows,
      });
    }
  }

  return blocks;
}

function mapLineupPlayers(
  players: readonly ConfirmedLineupPlayer[],
  league: string,
  teamSlug: string,
): readonly AtomicLineupPlayer[] {
  return players.map((player) => {
    const playerSlug = slugifyPlayerName(player.name);
    return {
      name: player.name,
      number: player.number ?? null,
      position: player.position ?? null,
      playerHref: playerSlug ? canonicalPlayerHref(league, teamSlug, playerSlug) : null,
    };
  });
}

function buildDisplayPicks(params: {
  readonly game: PlatformGame;
  readonly preview: GamePreviewPayload | null;
  readonly viewerRole: "visitor" | "member" | "tipster" | "admin";
  readonly hasFullAccess: boolean;
}): readonly DetailPickDisplayItem[] {
  const { game, preview, viewerRole, hasFullAccess } = params;
  const catalogPicks = preview?.detail?.picksCatalog?.picks ?? null;
  const v5 = preview?.detail?.v5 ?? null;

  if (catalogPicks && catalogPicks.length > 0) {
    const filtered: CatalogPickItem[] = catalogPicks.filter(
      (item) => item.isPrimaryModelPick || item.isRecommendedByModel !== false || game.status === "FT",
    );
    const pool = filtered.length > 0 ? filtered : catalogPicks;
    const sorted = [...pool].sort((a, b) => {
      const aPrimaryPlayable =
        a.isPrimaryModelPick &&
        !isConservativeChalkPick(
          a.family,
          a.label,
          a.pricing.marketDecimal ?? a.pricing.fairOdds,
          a.pricing.evPct,
        );
      const bPrimaryPlayable =
        b.isPrimaryModelPick &&
        !isConservativeChalkPick(
          b.family,
          b.label,
          b.pricing.marketDecimal ?? b.pricing.fairOdds,
          b.pricing.evPct,
        );
      if (aPrimaryPlayable !== bPrimaryPlayable) {
        return aPrimaryPlayable ? -1 : 1;
      }
      const bScore = scorePlayablePick({
        market: b.family,
        label: b.label,
        p: b.pricing.p,
        decimal: b.pricing.marketDecimal ?? b.pricing.fairOdds,
        evPct: b.pricing.evPct,
      });
      const aScore = scorePlayablePick({
        market: a.family,
        label: a.label,
        p: a.pricing.p,
        decimal: a.pricing.marketDecimal ?? a.pricing.fairOdds,
        evPct: a.pricing.evPct,
      });
      if (Math.abs(bScore - aScore) > 0.01) return bScore - aScore;
      return b.pricing.p - a.pricing.p;
    });

    return sorted.slice(0, 8).map((item, idx): DetailPickDisplayItem => {
      const matchPick = catalogPickItemToMatchPick(item, game, idx);
      const unlocked =
        !item.isRedacted &&
        (hasFullAccess || Boolean(matchPick.isDailyOpenPromo || matchPick.isTipsterWeeklyOpen)) &&
        isPickUnlocked(matchPick, game.status, viewerRole);
      return {
        id: item.id,
        pick: matchPick,
        categoryLabel: item.familyLabel,
        fairDecimal: item.pricing.fairOdds,
        marketDecimal: item.pricing.marketDecimal,
        marketBookLabel: item.pricing.marketBookLabel,
        evPct: item.pricing.evPct,
        market: item.family,
        label: item.label,
        decimal: item.pricing.marketDecimal ?? item.pricing.fairOdds,
        settlement: item.settlement,
        windows: unlocked ? catalogEvidenceToWindowItems(item.evidence, item.sport) : [],
        bullets: unlocked ? item.evidence.bullets.slice(0, 3) : [],
        isPrimary: idx === 0,
        isRedacted: !unlocked,
        fromCatalog: true,
      };
    });
  }

  const rankedFallback = [...game.picks].sort((a, b) => {
    const aEv =
      a.marketDecimal && a.marketDecimal > 1
        ? Math.round((a.p * a.marketDecimal - 1) * 1000) / 10
        : null;
    const bEv =
      b.marketDecimal && b.marketDecimal > 1
        ? Math.round((b.p * b.marketDecimal - 1) * 1000) / 10
        : null;
    return (
      scorePlayablePick({
        market: a.market,
        label: a.label,
        p: a.p,
        decimal: a.marketDecimal ?? a.fairDecimal,
        evPct: aEv,
      }) *
        -1 +
      scorePlayablePick({
        market: b.market,
        label: b.label,
        p: b.p,
        decimal: b.marketDecimal ?? b.fairDecimal,
        evPct: bEv,
      })
    );
  });

  return rankedFallback.slice(0, 8).map((pick, idx): DetailPickDisplayItem => {
    const unlocked =
      (hasFullAccess || Boolean(pick.isDailyOpenPromo || pick.isTipsterWeeklyOpen)) &&
      isPickUnlocked(pick, game.status, viewerRole);
    const evPct =
      unlocked && pick.marketDecimal && pick.marketDecimal > 1
        ? Math.round((pick.p * pick.marketDecimal - 1) * 1000) / 10
        : null;
    const windows = unlocked
      ? extractEvidenceWindows({ game, pick, v5 })
      : [];
    return {
      id: pick.id,
      pick,
      categoryLabel: pick.categoryLabel,
      fairDecimal: pick.fairDecimal,
      marketDecimal: pick.marketDecimal,
      marketBookLabel: pick.marketBookLabel ?? null,
      evPct,
      market: pick.market ?? pick.categoryLabel,
      label: pick.label,
      decimal: pick.marketDecimal ?? pick.fairDecimal,
      settlement: pick.result ?? null,
      windows,
      bullets: [],
      isPrimary: idx === 0,
      isRedacted: !unlocked,
      fromCatalog: false,
    };
  });
}

export interface HomeMatchDetailPanelProps {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly previewOverride?: GamePreviewPayload | null;
  readonly liveDetailOverride?: LiveMatchDetail | null;
  readonly isWatched?: boolean;
  readonly onToggleWatchlist?: (gameId: string) => void;
  readonly parlayPickIds?: ReadonlySet<string>;
  readonly onToggleParlay?: (pick: MatchPick) => void;
  readonly onSealPick?: (pick: MatchPick) => void;
  readonly homeFormFallback?: readonly string[] | null;
  readonly awayFormFallback?: readonly string[] | null;
}

export function HomeMatchDetailPanel({
  game,
  liveEntry,
  previewOverride,
  liveDetailOverride,
  isWatched,
  onToggleWatchlist,
  parlayPickIds,
  onToggleParlay,
  onSealPick,
  homeFormFallback,
  awayFormFallback,
}: HomeMatchDetailPanelProps): React.JSX.Element {
  const platformCore = useOptionalPlatformCore();
  const platformActions = useOptionalPlatformActions();
  const watchlistIds = useWatchlistGameIds();
  const uid = useId().replace(/:/g, "");
  const tabButtonRefs = useRef<Partial<Record<DetailTabKey, HTMLButtonElement | null>>>({});

  const viewerRole: "visitor" | "member" | "tipster" | "admin" =
    platformCore?.viewerRole ??
    (previewOverride?.fullAccess === true ? "member" : "visitor");
  const oddsFormat = platformCore?.oddsFormat ?? "decimal";
  const userTimezone = platformCore?.userTimezone ?? "America/Mexico_City";
  const hasAccountSession = platformCore?.hasAccountSession ?? false;
  const upgradeHref = platformCore?.upgradeHref ?? "/precio";
  const isDesktopViewport = useMediaQuery("(min-width: 1024px)", false);

  const [sealedIds, setSealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [localParlayIds, setLocalParlayIds] = useState<ReadonlySet<string>>(() => new Set());
  const [localWatched, setLocalWatched] = useState<boolean>(false);
  const [errorForKey, setErrorForKey] = useState<{
    readonly key: string;
    readonly message: string;
  } | null>(null);
  const sawLoadingKeyRef = useRef<string | null>(null);
  const [tabSelection, setTabSelection] = useState<{
    readonly gameId: string;
    readonly tab: DetailTabKey;
  }>(() => ({
    gameId: game.id,
    tab: "picks",
  }));
  const [picksModeSelection, setPicksModeSelection] = useState<{
    readonly gameId: string;
    readonly mode: "equipo" | "jugadores";
  }>(() => ({
    gameId: game.id,
    mode: "equipo",
  }));
  const activePicksMode: "equipo" | "jugadores" =
    picksModeSelection.gameId === game.id ? picksModeSelection.mode : "equipo";

  const previewCacheKey = `preview:${viewerRole}:${hasAccountSession ? "1" : "0"}:${game.id}`;
  const shouldFetchPreview = previewOverride === undefined && isDesktopViewport;
  const previewUrl = shouldFetchPreview
    ? `/api/games/${encodeURIComponent(game.id)}/preview`
    : null;
  const {
    data: fetchedPreview,
    loading: fetchingPreview,
    error: rawPreviewError,
    reload: reloadPreview,
  } = useClientJsonSwr<GamePreviewPayload>(previewUrl, {
    enabled: shouldFetchPreview,
    cacheKey: previewCacheKey,
    staleTimeMs: 30_000,
    ttlMs: 180_000,
  });

  useSafeEffect(() => {
    if (fetchingPreview) {
      sawLoadingKeyRef.current = previewCacheKey;
      setErrorForKey((prev) => (prev ? null : prev));
      return;
    }
    if (rawPreviewError && sawLoadingKeyRef.current === previewCacheKey) {
      setErrorForKey({ key: previewCacheKey, message: rawPreviewError });
      return;
    }
    if (!rawPreviewError) {
      setErrorForKey((prev) => (prev && prev.key === previewCacheKey ? null : prev));
    }
  }, [fetchingPreview, previewCacheKey, rawPreviewError]);

  const previewError =
    errorForKey && errorForKey.key === previewCacheKey ? errorForKey.message : null;
  const handleRetryPreview = useCallback(() => {
    setErrorForKey(null);
    reloadPreview();
  }, [reloadPreview]);

  const preview: GamePreviewPayload | null =
    previewOverride !== undefined
      ? previewOverride
      : fetchedPreview && fetchedPreview.gameId === game.id
        ? fetchedPreview
        : null;
  const isPreviewLoading = shouldFetchPreview && preview === null && !previewError;

  const live =
    (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) ||
    String(game.status) === "LIVE" ||
    preview?.game.status === "LIVE";
  const isFinished =
    !live &&
    (game.status === "FT" || liveEntry?.phase === "final" || preview?.game.status === "FT");

  const liveDetailSnap = useLiveMatch(
    game.id,
    live && isLiveCapableLeague(game.league) && liveDetailOverride === undefined,
  );
  const liveDetail: LiveMatchDetail | null =
    liveDetailOverride !== undefined ? liveDetailOverride : live ? liveDetailSnap.data : null;

  const hasFullAccess =
    isFinished || (preview !== null ? preview.fullAccess : viewerRole !== "visitor");
  const intelUnlocked =
    isFinished ||
    (preview !== null
      ? preview.fullAccess && isPreGameIntelUnlocked(game, viewerRole)
      : isPreGameIntelUnlocked(game, viewerRole));
  const previewRedacted = preview !== null && !preview.fullAccess && !isFinished;

  const activeScore =
    liveDetail?.entry.score ??
    liveEntry?.score ??
    preview?.game.score ??
    game.score ??
    null;
  const activeProjection = previewRedacted
    ? null
    : (preview?.game.projection ?? (intelUnlocked ? game.projection : null));
  const activeX12: readonly [number, number, number] | null = previewRedacted
    ? [0, 0, 0]
    : preview && (preview.game.x12[0] > 0 || preview.game.x12[2] > 0)
      ? preview.game.x12
      : intelUnlocked
        ? game.x12
        : [0, 0, 0];
  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const fullHref = sanitizeInternalHref(preview?.game.canonicalHref) ?? canonicalGameHref(game.league, game);
  const homeHref = canonicalTeamHref(game.league, game.home.slug);
  const awayHref = canonicalTeamHref(game.league, game.away.slug);
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const kickoffTime = formatGameKickoffTime(game, userTimezone);
  const clockLabel = live
    ? formatLiveChipPhase(liveDetail?.entry ?? liveEntry)
    : isFinished
      ? "Finalizado"
      : kickoffTime;

  const watched =
    isWatched !== undefined
      ? isWatched
      : platformActions
        ? watchlistIds.includes(game.id)
        : localWatched;

  const effectiveParlayIds = parlayPickIds ?? localParlayIds;

  const navigateSafe = useCallback(
    (href: string) => {
      const safe = sanitizeInternalHref(href);
      if (!safe) return;
      if (platformActions) {
        platformActions.navigateTo(safe);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(safe);
      }
    },
    [platformActions],
  );

  const prefetchSafe = useCallback(
    (href: string) => {
      const safe = sanitizeInternalHref(href);
      if (safe && platformActions) {
        platformActions.prefetchRoute(safe);
      }
    },
    [platformActions],
  );

  const handleToggleWatch = useCallback(() => {
    if (onToggleWatchlist) {
      onToggleWatchlist(game.id);
      return;
    }
    if (platformActions) {
      platformActions.toggleWatchlistGame(game.id);
      return;
    }
    setLocalWatched((prev) => !prev);
  }, [game.id, onToggleWatchlist, platformActions]);

  const handleParlayClick = useCallback(
    (pick: MatchPick) => {
      if (onToggleParlay) {
        onToggleParlay(pick);
        return;
      }
      if (platformActions) {
        if (effectiveParlayIds.has(pick.id)) {
          platformActions.removePickFromParlay(pick.id);
        } else {
          platformActions.addPickToParlay(pick);
        }
        return;
      }
      setLocalParlayIds((prev) => {
        const next = new Set(prev);
        if (next.has(pick.id)) next.delete(pick.id);
        else next.add(pick.id);
        return next;
      });
    },
    [effectiveParlayIds, onToggleParlay, platformActions],
  );

  const handleSealClick = useCallback(
    (pick: MatchPick) => {
      if (onSealPick) {
        onSealPick(pick);
      } else if (platformActions) {
        platformActions.sealPickToJournal(
          pick,
          1,
          pick.marketDecimal ?? pick.fairDecimal,
        );
      }
      setSealedIds((prev) => {
        const next = new Set(prev);
        next.add(pick.id);
        return next;
      });
    },
    [onSealPick, platformActions],
  );

  const homeForm = useMemo(() => {
    const candidate = preview?.game.home.form.length
      ? preview.game.home.form
      : homeFormFallback;
    if (!candidate) return null;
    return parseAtomicForm(candidate, { sport: game.sport, max: 5 }).length > 0 ? candidate : null;
  }, [game.sport, homeFormFallback, preview?.game.home.form]);

  const awayForm = useMemo(() => {
    const candidate = preview?.game.away.form.length
      ? preview.game.away.form
      : awayFormFallback;
    if (!candidate) return null;
    return parseAtomicForm(candidate, { sport: game.sport, max: 5 }).length > 0 ? candidate : null;
  }, [awayFormFallback, game.sport, preview?.game.away.form]);

  const goalScorers = useMemo(() => {
    const incidents = liveDetail?.incidents ?? [];
    const goals = incidents.filter(
      (inc) =>
        (inc.kind === "goal" || inc.kind === "penalty_goal" || inc.kind === "own_goal") &&
        inc.side !== null &&
        Boolean(inc.player),
    );
    return {
      home: goals.filter((inc) => inc.side === "home"),
      away: goals.filter((inc) => inc.side === "away"),
    };
  }, [liveDetail?.incidents]);

  const displayPicks = useMemo(
    () => buildDisplayPicks({ game, preview, viewerRole, hasFullAccess }),
    [game, hasFullAccess, preview, viewerRole],
  );
  const partitionedDisplayPicks = useMemo(
    () =>
      partitionPlayableAndConservative(displayPicks, {
        preserveAll: game.status === "FT",
      }),
    [displayPicks, game.status],
  );

  const liveProgressBars = useMemo<readonly ComputedLiveBar[]>(() => {
    if (!live || !activeScore) return [];
    const bars: ComputedLiveBar[] = [];
    for (const item of displayPicks.slice(0, 2)) {
      if (item.isRedacted) continue;
      const bar = buildLiveProgressForPick({
        pick: item.pick,
        game,
        score: activeScore,
        stats: liveDetail?.stats ?? null,
        minute: liveDetail?.entry.minute ?? liveEntry?.minute ?? null,
      });
      if (bar) bars.push(bar);
    }
    return bars;
  }, [activeScore, displayPicks, game, live, liveDetail?.entry.minute, liveDetail?.stats, liveEntry?.minute]);

  const statBlocks = useMemo(
    () =>
      buildStatBlocks({
        game,
        preview,
        liveStats: liveDetail?.stats ?? null,
        unlocked: intelUnlocked,
      }),
    [game, intelUnlocked, liveDetail?.stats, preview],
  );

  const specialHighlights = useMemo(() => {
    if (!intelUnlocked) return [];
    const out: Array<{ readonly label: string; readonly value: string; readonly sub?: string }> = [];
    const v5 = preview?.detail?.v5;
    if (v5?.multisportSpecials?.highlights) {
      for (const h of v5.multisportSpecials.highlights) {
        out.push(h);
      }
    }
    if (v5?.nflSpecials) {
      out.push({
        label: "Margen esperado",
        value: `${v5.nflSpecials.expectedMargin >= 0 ? "+" : ""}${v5.nflSpecials.expectedMargin.toFixed(1)} pts`,
      });
      out.push({
        label: "Probabilidad tiempo extra",
        value: `${(v5.nflSpecials.pOvertime * 100).toFixed(1)} %`,
      });
    }
    const factors = preview?.detail?.factors.length ? preview.detail.factors : game.factors;
    if (out.length === 0 && statBlocks.length === 0 && intelUnlocked) {
      for (const f of factors.slice(0, 6)) {
        out.push({ label: f.label, value: f.value, sub: f.sub });
      }
    }
    return out;
  }, [game.factors, intelUnlocked, preview?.detail?.factors, preview?.detail?.v5, statBlocks.length]);

  const timelineEvents = useMemo(
    () =>
      (liveDetail?.incidents ?? [])
        .filter((inc) => inc.kind !== "period" || Boolean(inc.note))
        .slice()
        .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0) || b.order - a.order),
    [liveDetail?.incidents],
  );

  const momentumPoints = liveDetail?.momentum ?? [];

  const shotItems = useMemo<readonly AtomicShotItem[]>(() => {
    if (!liveDetail?.shots || liveDetail.shots.length === 0) return [];
    return liveDetail.shots.map((shot, idx) => ({
      id: `${game.id}-shot-${idx}`,
      minute: shot.minute,
      addedTime: shot.addedTime ?? null,
      side: shot.side,
      outcome: shot.outcome,
      xg: shot.xg,
      x: shot.x,
      y: shot.y,
      player: shot.player ?? null,
    }));
  }, [game.id, liveDetail?.shots]);

  const activeLineups = game.preGame.confirmedLineups ?? game.preGame.probableLineups ?? null;
  const hasRealFootballLineups =
    game.sport === "football" &&
    Boolean(
      activeLineups &&
        (activeLineups.homeStarters.length > 0 || activeLineups.awayStarters.length > 0),
    );

  const homeLineupPlayers = useMemo(
    () =>
      hasRealFootballLineups && activeLineups
        ? mapLineupPlayers(activeLineups.homeStarters, game.league, game.home.slug)
        : [],
    [activeLineups, game.home.slug, game.league, hasRealFootballLineups],
  );
  const awayLineupPlayers = useMemo(
    () =>
      hasRealFootballLineups && activeLineups
        ? mapLineupPlayers(activeLineups.awayStarters, game.league, game.away.slug)
        : [],
    [activeLineups, game.away.slug, game.league, hasRealFootballLineups],
  );

  const h2hRows = useMemo<readonly HeadToHeadView[]>(() => {
    if (preview?.detail?.headToHead && preview.detail.headToHead.length > 0) {
      return preview.detail.headToHead;
    }
    return game.headToHead;
  }, [game.headToHead, preview?.detail?.headToHead]);

  const capability = getLeagueCapability(game.league);
  const parsedStandings = useMemo<LeagueStandingsSplitsData | null>(() => {
    if (capability && !capability.hasStandingsTable) return null;
    return isLeagueStandingsSplitsData(preview?.standings) ? preview.standings : null;
  }, [capability, preview?.standings]);

  const enrichedLineups = preview?.detail?.enrichedLineups ?? null;
  const playerPicksList = preview?.detail?.playerPicks ?? [];
  const resolvedEnfrentamientos = useMemo<MatchEnfrentamientosData>(() => {
    if (preview?.detail?.enfrentamientos) {
      return preview.detail.enfrentamientos;
    }
    const homeNeedle = (game.home.shortName || game.home.name).toLowerCase();
    return {
      rankings: null,
      h2h: h2hRows.map((row, idx) => {
        const isHome =
          row.home.toLowerCase().includes(homeNeedle) ||
          homeNeedle.includes(row.home.toLowerCase());
        const focusGoals = isHome ? row.homeGoals : row.awayGoals;
        const oppGoals = isHome ? row.awayGoals : row.homeGoals;
        return {
          id: `md-h2h-${game.id}-${idx}`,
          dateIso: row.date,
          competitionLabel: game.leagueLabel,
          isSameCompetition: true,
          homeTeam: row.home,
          awayTeam: row.away,
          homeSlug: game.home.slug,
          awaySlug: game.away.slug,
          homeScore: row.homeGoals,
          awayScore: row.awayGoals,
          isHomeForFocus: isHome,
          resultForFocus:
            focusGoals > oppGoals ? "W" : focusGoals < oppGoals ? "L" : "D",
        };
      }),
      homeRecent: [],
      awayRecent: [],
    };
  }, [game.away.slug, game.home.name, game.home.shortName, game.home.slug, game.id, game.leagueLabel, h2hRows, preview?.detail?.enfrentamientos]);

  const injuriesList = useMemo<readonly MatchInjuryItem[]>(() => {
    const raw =
      preview?.detail?.injuries && preview.detail.injuries.length > 0
        ? preview.detail.injuries
        : preview?.injuries && preview.injuries.length > 0
          ? preview.injuries
          : null;
    if (raw) {
      return raw.filter((item) => isSafePublicLabel(item.player));
    }
    return game.preGame.absences
      .filter((item) => item.status !== "Confirmado XI" && isSafePublicLabel(item.player))
      .map((item) => ({
        teamSide: item.teamSide,
        player: item.player,
        position: item.role || null,
        status: item.status,
        detail: item.injuryType ?? item.impactNote ?? null,
        expectedReturn: item.returnDate ?? null,
      }));
  }, [game.preGame.absences, preview?.detail?.injuries, preview?.injuries]);

  const hasEnfrentamientosTab =
    resolvedEnfrentamientos.h2h.length > 0 ||
    resolvedEnfrentamientos.rankings !== null ||
    resolvedEnfrentamientos.homeRecent.length > 0 ||
    resolvedEnfrentamientos.awayRecent.length > 0;
  const hasLineupsTab = enrichedLineups !== null || hasRealFootballLineups;
  const hasInjuriesTab = injuriesList.length > 0 || game.sport === "football";

  const availableTabs = useMemo<readonly DetailTabDef[]>(() => {
    const tabs: DetailTabDef[] = [
      {
        id: "picks",
        label: "Picks",
        count:
          displayPicks.length + playerPicksList.length > 0
            ? displayPicks.length + playerPicksList.length
            : undefined,
      },
    ];
    if (statBlocks.length > 0 || specialHighlights.length > 0) {
      tabs.push({ id: "stats", label: "Estadísticas" });
    }
    if (hasEnfrentamientosTab) {
      tabs.push({ id: "enfrentamientos", label: "Enfrentamientos" });
    }
    if (hasLineupsTab) {
      tabs.push({ id: "lineups", label: "Alineaciones" });
    }
    if (parsedStandings !== null) {
      tabs.push({ id: "standings", label: "Clasificación" });
    }
    if (hasInjuriesTab) {
      tabs.push({
        id: "injuries",
        label: "Lesiones",
        count: injuriesList.length > 0 ? injuriesList.length : undefined,
      });
    }
    if (timelineEvents.length > 0 || momentumPoints.length > 0 || shotItems.length > 0) {
      tabs.push({
        id: "timeline",
        label: "Cronología",
        count: timelineEvents.length > 0 ? timelineEvents.length : undefined,
      });
    }
    return tabs;
  }, [
    displayPicks.length,
    hasEnfrentamientosTab,
    hasInjuriesTab,
    hasLineupsTab,
    injuriesList.length,
    momentumPoints.length,
    parsedStandings,
    playerPicksList.length,
    shotItems.length,
    specialHighlights.length,
    statBlocks.length,
    timelineEvents.length,
  ]);

  const requestedTab: DetailTabKey = tabSelection.gameId === game.id ? tabSelection.tab : "picks";
  const activeTab: DetailTabKey = availableTabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : "picks";

  const selectTab = useCallback(
    (nextTab: DetailTabKey, focusButton = false) => {
      setTabSelection({ gameId: game.id, tab: nextTab });
      const btn = tabButtonRefs.current[nextTab];
      if (btn) {
        if (focusButton) btn.focus();
        if (typeof btn.scrollIntoView === "function") {
          btn.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
    },
    [game.id],
  );

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentId: DetailTabKey) => {
    const idx = availableTabs.findIndex((t) => t.id === currentId);
    if (idx < 0) return;
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % availableTabs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + availableTabs.length) % availableTabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = availableTabs.length - 1;
    if (nextIdx >= 0 && availableTabs[nextIdx]) {
      e.preventDefault();
      selectTab(availableTabs[nextIdx]!.id, true);
    }
  };

  const venueName = preview?.game.venueName ?? (game.venue || null);
  const refereeName =
    preview?.game.refereeName ??
    game.referee ??
    game.preGame.matchContext?.referee ??
    null;
  const refereeSlug = preview?.game.refereeSlug ?? null;
  const refereeHref =
    refereeSlug && isSafePublicLabel(refereeSlug)
      ? `/app/${encodeURIComponent(game.league)}/r/${encodeURIComponent(refereeSlug)}`
      : null;

  const activeTabId = `${uid}-tab-${activeTab}`;

  return (
    <section
      aria-label={`Detalle de ${matchLabel}`}
      className="pl-home-md-panel glass-card glass-ring"
      data-home-detail-panel={game.id}
    >
      <header className="pl-home-md-hero">
        <div className="pl-home-md-hero-top">
          <div className="pl-home-md-hero-league">
            <LeagueBadge
              league={game.league}
              label={game.leagueLabel}
              logoUrl={game.leagueLogoUrl}
              size={20}
            />
            <span className="pl-home-md-hero-league-name truncate">{game.leagueLabel}</span>
            {game.round ? (
              <span className="pl-home-md-hero-round truncate">· {game.round}</span>
            ) : null}
          </div>

          <div className="pl-home-md-hero-top-right">
            <span className="pl-home-md-hero-date num">
              {longDayLabel(game.dayId)} · {kickoffTime}
            </span>
            <button
              type="button"
              className={`pl-home-md-star-btn ${watched ? "is-fav" : ""}`.trim()}
              aria-pressed={watched}
              aria-label={
                watched ? `Quitar ${matchLabel} de favoritos` : `Seguir ${matchLabel}`
              }
              title={watched ? "Siguiendo partido" : "Seguir partido"}
              onClick={handleToggleWatch}
            >
              <MaestroIcon name="star" size={14} />
            </button>
          </div>
        </div>

        <div className="pl-home-md-scoreboard">
          <div className="pl-home-md-side">
            <a
              href={homeHref}
              onPointerEnter={() => prefetchSafe(homeHref)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                navigateSafe(homeHref);
              }}
              className="pl-home-md-side-link no-underline"
            >
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={40}
              />
              <strong className="pl-home-md-side-name">{game.home.name}</strong>
            </a>
            <div className="pl-home-md-form-slot" aria-hidden={!homeForm ? true : undefined}>
              {homeForm ? (
                <AtomicFormStrip
                  form={homeForm}
                  sport={game.sport}
                  max={5}
                  size="xs"
                  teamName={game.home.shortName || game.home.name}
                  emptyFallback={null}
                />
              ) : null}
            </div>
          </div>

          <div className="pl-home-md-center-score num">
            {live || isFinished ? (
              <>
                <strong className={`pl-home-md-score-big ${live ? "is-live" : ""}`.trim()}>
                  {activeScore ? `${activeScore.home} – ${activeScore.away}` : "—"}
                </strong>
                <span className={`pl-home-md-score-state ${live ? "is-live" : ""}`.trim()}>
                  {live ? (
                    <>
                      <span className="pl-home-live-dot" aria-hidden="true" />
                      <span>{clockLabel}</span>
                    </>
                  ) : (
                    "Finalizado"
                  )}
                </span>
                {live && liveDetail ? (
                  <LiveScoreTelemetry
                    stats={liveDetail.stats}
                    shotmapSummary={liveDetail.shotmapSummary}
                    compact
                  />
                ) : null}
              </>
            ) : (
              <>
                <strong className="pl-home-md-score-big num">{kickoffTime}</strong>
                <span className="pl-home-md-score-state">Inicio</span>
                {intelUnlocked && activeProjection ? (
                  <span className="pl-home-md-hero-exp num" data-home-md-expected="">
                    {unit.plural === "puntos" ? "Puntos" : "Goles"} esperados:{" "}
                    {activeProjection.home.toFixed(unit.decimals)} –{" "}
                    {activeProjection.away.toFixed(unit.decimals)} (Total{" "}
                    {(activeProjection.home + activeProjection.away).toFixed(unit.decimals)})
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="pl-home-md-side">
            <a
              href={awayHref}
              onPointerEnter={() => prefetchSafe(awayHref)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                navigateSafe(awayHref);
              }}
              className="pl-home-md-side-link no-underline"
            >
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={40}
              />
              <strong className="pl-home-md-side-name">{game.away.name}</strong>
            </a>
            <div className="pl-home-md-form-slot" aria-hidden={!awayForm ? true : undefined}>
              {awayForm ? (
                <AtomicFormStrip
                  form={awayForm}
                  sport={game.sport}
                  max={5}
                  size="xs"
                  teamName={game.away.shortName || game.away.name}
                  emptyFallback={null}
                />
              ) : null}
            </div>
          </div>
        </div>

        {goalScorers.home.length > 0 || goalScorers.away.length > 0 ? (
          <div className="pl-home-md-scorers num" aria-label="Anotadores del partido">
            <ul className="pl-home-md-scorer-col is-home">
              {goalScorers.home.map((inc, idx) => (
                <li key={`hg-${inc.order}-${idx}`}>
                  <span>{inc.player}</span>
                  <strong>
                    {formatIncidentMinute(inc)}
                    {inc.kind === "own_goal" ? " (AG)" : inc.kind === "penalty_goal" ? " (P)" : ""}
                  </strong>
                </li>
              ))}
            </ul>
            <span className="pl-home-md-scorer-ico" aria-hidden="true">
              <SportEventIcon kind="goal" size={14} />
            </span>
            <ul className="pl-home-md-scorer-col is-away">
              {goalScorers.away.map((inc, idx) => (
                <li key={`ag-${inc.order}-${idx}`}>
                  <span>{inc.player}</span>
                  <strong>
                    {formatIncidentMinute(inc)}
                    {inc.kind === "own_goal" ? " (AG)" : inc.kind === "penalty_goal" ? " (P)" : ""}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="pl-home-md-meta-strip">
          {venueName ? (
            <span className="pl-home-md-meta-item">
              <MaestroIcon name="stadium" size={13} />
              <span className="truncate">{venueName}</span>
            </span>
          ) : null}
          {refereeName ? (
            refereeHref ? (
              <a
                href={refereeHref}
                onPointerEnter={() => prefetchSafe(refereeHref)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateSafe(refereeHref);
                }}
                className="pl-home-md-meta-item pl-home-md-ref-link no-underline"
              >
                <MaestroIcon name="whistle" size={13} />
                <span className="truncate">{refereeName}</span>
              </a>
            ) : (
              <span className="pl-home-md-meta-item">
                <MaestroIcon name="whistle" size={13} />
                <span className="truncate">{refereeName}</span>
              </span>
            )
          ) : (
            <span className="pl-home-md-meta-item" data-home-md-referee-pending="">
              <MaestroIcon name="whistle" size={13} />
              <span>{isFinished ? "Árbitro no reportado" : "Árbitro por confirmar"}</span>
            </span>
          )}
        </div>

        <div className="pl-home-md-cta-row">
          <a
            href={fullHref}
            data-home-detail-full-cta=""
            onPointerEnter={() => prefetchSafe(fullHref)}
            onFocus={() => prefetchSafe(fullHref)}
            onTouchStart={() => prefetchSafe(fullHref)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setActiveSharedTransition(e.currentTarget.closest("section"), "pl-match-hero");
              navigateSafe(fullHref);
            }}
            className="pl-home-md-full-cta no-underline"
          >
            <span>Ver partido completo</span>
            <MaestroIcon name="arrowRight" size={14} />
          </a>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Secciones del partido"
        className="pl-home-md-tabs"
        data-home-detail-tabs=""
        {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        {availableTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabButtonRefs.current[tab.id] = el;
              }}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-home-detail-tab={tab.id}
              className={`pl-home-md-tab ${selected ? "is-active" : ""}`.trim()}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              {...(selected
                ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                : {})}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? (
                <span className="pl-home-md-tab-count num">{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="pl-home-md-tabpanel"
        data-home-detail-tabpanel={activeTab}
      >
        {previewError && !isPreviewLoading ? (
          <div className="pl-home-md-error" role="alert">
            <span>{previewError}</span>
            <button
              type="button"
              className="pl-home-md-retry-btn"
              onClick={handleRetryPreview}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {activeTab === "picks" ? (
          <div className="pl-home-md-picks-pane">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="pl-mdp-switcher"
                role="group"
                aria-label="Tipo de picks en detalle"
                data-home-md-picks-switcher=""
              >
                <button
                  type="button"
                  className={`pl-mdp-switcher-btn ${activePicksMode === "equipo" ? "is-active" : ""}`.trim()}
                  aria-pressed={activePicksMode === "equipo"}
                  data-home-md-picks-mode="equipo"
                  onClick={() => setPicksModeSelection({ gameId: game.id, mode: "equipo" })}
                >
                  <span>Equipo</span>
                  {displayPicks.length > 0 ? <span className="num">{displayPicks.length}</span> : null}
                </button>
                <button
                  type="button"
                  className={`pl-mdp-switcher-btn ${activePicksMode === "jugadores" ? "is-active" : ""}`.trim()}
                  aria-pressed={activePicksMode === "jugadores"}
                  data-home-md-picks-mode="jugadores"
                  onClick={() => setPicksModeSelection({ gameId: game.id, mode: "jugadores" })}
                >
                  <span>Jugadores</span>
                  {playerPicksList.length > 0 ? (
                    <span className="num">{playerPicksList.length}</span>
                  ) : null}
                </button>
              </div>
            </div>

            {activePicksMode === "jugadores" ? (
              <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando picks de jugadores" />}>
                <LazyMatchPlayerPicksBoard
                  compact
                  picks={playerPicksList}
                  allowFull={hasFullAccess}
                  homeLabel={game.home.shortName || game.home.name}
                  awayLabel={game.away.shortName || game.away.name}
                  oddsFormat={oddsFormat}
                  upgradeHref={upgradeHref}
                  hasAccountSession={hasAccountSession}
                  parlayPickIds={effectiveParlayIds}
                  sealedPickIds={sealedIds}
                  onToggleParlay={handleParlayClick}
                  onSealPick={handleSealClick}
                  onNavigate={navigateSafe}
                  onPrefetch={prefetchSafe}
                />
              </Suspense>
            ) : (
              <>
                {intelUnlocked && activeX12 && (activeX12[0] > 0 || activeX12[2] > 0) ? (
              <div className="pl-home-md-x12-strip num" aria-label="Probabilidades y momios justos 1X2">
                <div className="pl-home-md-x12-cell">
                  <span className="pl-home-md-x12-key">1 · {game.home.shortName}</span>
                  <strong>{(activeX12[0] * 100).toFixed(1)} %</strong>
                  <small>
                    Momio justo {formatOddsValue(1 / Math.max(activeX12[0], 0.01), oddsFormat)}
                  </small>
                </div>
                {hasDraw ? (
                  <div className="pl-home-md-x12-cell">
                    <span className="pl-home-md-x12-key">X · Empate</span>
                    <strong>{(activeX12[1] * 100).toFixed(1)} %</strong>
                    <small>
                      Momio justo {formatOddsValue(1 / Math.max(activeX12[1], 0.01), oddsFormat)}
                    </small>
                  </div>
                ) : null}
                <div className="pl-home-md-x12-cell">
                  <span className="pl-home-md-x12-key">2 · {game.away.shortName}</span>
                  <strong>{(activeX12[2] * 100).toFixed(1)} %</strong>
                  <small>
                    Momio justo {formatOddsValue(1 / Math.max(activeX12[2], 0.01), oddsFormat)}
                  </small>
                </div>
              </div>
            ) : null}

            {live && liveProgressBars.length > 0 ? (
              <div className="pl-home-md-live-bars" data-home-detail-live-progress="">
                {liveProgressBars.map((bar) => (
                  <LivePickProgressBar
                    key={bar.pickLabel}
                    pickLabel={bar.pickLabel}
                    matchLabel={`${game.home.shortName} vs ${game.away.shortName}`}
                    clockLabel={clockLabel}
                    actualValue={bar.actualValue}
                    targetLine={bar.targetLine}
                    unitLabel={bar.unitLabel}
                    direction={bar.direction}
                    projectedFinal={bar.projectedFinal}
                    asianState={bar.asianState}
                    compact
                  />
                ))}
              </div>
            ) : null}

            {displayPicks.length > 0 ? (() => {
              const renderPickCard = (item: DetailPickDisplayItem) => {
                if (item.isRedacted) {
                  return (
                    <article
                      key={item.id}
                      className="pl-home-md-pick-card is-locked"
                      data-detail-pick-locked=""
                    >
                      <div className="pl-home-md-pick-head">
                        <span className="pl-home-md-pick-cat">{item.categoryLabel}</span>
                        <MaestroIcon name="lock" size={13} />
                      </div>
                      <p className="pl-home-md-lock-copy">
                        Pronóstico calibrado, momio justo y evidencia histórica disponibles con Pase PitchLab Ultra.
                      </p>
                      <a
                        href={upgradeHref}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateSafe(upgradeHref);
                        }}
                        className="pl-btn-accent text-xs min-h-10 px-3 inline-flex items-center gap-1.5 no-underline self-start"
                      >
                        <MaestroIcon name="unlock" size={12} />
                        <span>{hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}</span>
                      </a>
                    </article>
                  );
                }

                const inParlay = effectiveParlayIds.has(item.pick.id);
                const isSealed = sealedIds.has(item.pick.id);
                const settledLabel = settlementLabelEs(item.settlement);
                const labHref = `/app/picks?lab=${encodeURIComponent(item.pick.id)}`;

                return (
                  <article
                    key={item.id}
                    className={`pl-home-md-pick-card ${item.isPrimary ? "is-primary" : ""}`.trim()}
                    data-detail-pick={item.pick.id}
                  >
                    <div className="pl-home-md-pick-head">
                      <div className="pl-home-md-pick-title-wrap">
                        <span className="pl-home-md-pick-cat">{item.categoryLabel}</span>
                        <strong className="pl-home-md-pick-title">{item.pick.label}</strong>
                      </div>
                      <div className="pl-home-md-pick-prob-wrap num">
                        <strong className="pl-home-md-pick-prob">
                          {(item.pick.p * 100).toFixed(1)} %
                        </strong>
                        {settledLabel ? (
                          <span className={`pl-home-md-settled-pill is-${item.settlement}`.trim()}>
                            {settledLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="pl-home-md-pick-pricing num">
                      <span className="pl-home-md-price-chip">
                        <span>Momio justo</span>
                        <strong>{formatOddsValue(item.fairDecimal, oddsFormat)}</strong>
                      </span>
                      {item.marketDecimal ? (
                        <span className="pl-home-md-price-chip is-book">
                          <span>{item.marketBookLabel ?? "Casa"}</span>
                          <strong>{formatOddsValue(item.marketDecimal, oddsFormat)}</strong>
                        </span>
                      ) : null}
                      {item.evPct !== null && item.evPct > 0 ? (
                        <span className="pl-home-md-ev-badge">
                          EV +{item.evPct.toFixed(1)} %
                        </span>
                      ) : null}
                    </div>

                    {item.windows.length > 0 ? (
                      <EvidenceWindowPills
                        windows={item.windows.slice(0, 5)}
                        size="sm"
                      />
                    ) : null}

                    {item.bullets.length > 0 ? (
                      <ul className="pl-home-md-ev-bullets">
                        {item.bullets.map((bullet, bIdx) => (
                          <li key={`${item.id}-b-${bIdx}`}>
                            <span>{bullet.label}</span>
                            {bullet.ratePct !== null ? (
                              <strong className={`pl-home-md-ev-rate is-${bullet.tone} num`}>
                                {bullet.ratePct} %
                              </strong>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {(!isFinished && !live) || item.fromCatalog ? (
                      <div className="pl-home-md-pick-actions">
                        {!isFinished && !live ? (
                          <>
                            <button
                              type="button"
                              className={`pl-home-parlay-btn is-sm ${inParlay ? "is-on" : ""}`.trim()}
                              aria-pressed={inParlay}
                              onClick={() => handleParlayClick(item.pick)}
                            >
                              <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
                              <span>{inParlay ? "En parlay" : "Parlay"}</span>
                            </button>
                            <button
                              type="button"
                              className={`pl-home-md-action-btn ${isSealed ? "is-done" : ""}`.trim()}
                              disabled={isSealed}
                              onClick={() => handleSealClick(item.pick)}
                            >
                              <MaestroIcon name={isSealed ? "check" : "add-to-record"} size={13} />
                              <span>{isSealed ? "Sellado" : "Sellar"}</span>
                            </button>
                          </>
                        ) : null}
                        {item.fromCatalog ? (
                          <a
                            href={labHref}
                            onPointerEnter={() => prefetchSafe(labHref)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                              e.preventDefault();
                              navigateSafe(labHref);
                            }}
                            className="pl-home-md-lab-link no-underline"
                          >
                            <span>Abrir en Bet Lab</span>
                            <MaestroIcon name="arrowRight" size={12} />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              };
              return (
                <div key={displayPicks[0]?.fromCatalog ? "catalog" : "base"} className="space-y-2.5">
                  <div className="pl-home-md-picks-list">
                    {partitionedDisplayPicks.playable.map(renderPickCard)}
                  </div>
                  {partitionedDisplayPicks.conservative.length > 0 ? (
                    <details
                      className="pl-home-md-conservative-details"
                      data-home-md-conservative-picks=""
                      open={game.status === "FT" || undefined}
                    >
                      <summary className="pl-home-md-conservative-summary">
                        <span>Conservadores / para combinar</span>
                        <span className="pl-pill text-[11px] num">
                          {partitionedDisplayPicks.conservative.length}
                        </span>
                      </summary>
                      <div className="pl-home-md-conservative-list">
                        {partitionedDisplayPicks.conservative.map(renderPickCard)}
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })() : !isPreviewLoading ? (
              <p className="pl-home-md-empty">
                Aún no hay selecciones publicadas para este partido.
              </p>
            ) : null}

            {isPreviewLoading ? (
              <div
                className="pl-home-md-skeleton"
                role="status"
                aria-busy="true"
                aria-label="Cargando análisis ampliado"
              >
                <span className="pl-home-md-skel-bar" />
                <span className="pl-home-md-skel-bar is-short" />
              </div>
            ) : null}
              </>
            )}
          </div>
        ) : null}

        {activeTab === "stats" ? (
          <div className="pl-home-md-stats-pane">
            {statBlocks.length > 0 ? (
              <div className="pl-home-md-stats-grid">
                {statBlocks.map((block) => (
                  <section
                    key={block.id}
                    aria-label={block.title}
                    className="pl-home-md-stat-card"
                  >
                    <h3 className="pl-home-md-block-title">{block.title}</h3>
                    <div className="pl-home-md-stat-list">
                      {block.rows.map((row) => (
                        <AtomicStatComparisonBar
                          key={row.key}
                          label={row.label}
                          homeValue={row.homeValue}
                          awayValue={row.awayValue}
                          homeLabel={game.home.shortName}
                          awayLabel={game.away.shortName}
                          pct={row.pct}
                          digits={row.digits}
                          lowerIsBetter={row.lowerIsBetter}
                          variant="compact"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            {specialHighlights.length > 0 ? (
              <section aria-label="Indicadores del encuentro" className="pl-home-md-stat-card">
                <h3 className="pl-home-md-block-title">Indicadores clave</h3>
                <dl className="pl-home-md-highlights">
                  {specialHighlights.map((item, idx) => (
                    <div key={`${item.label}-${idx}`} className="pl-home-md-highlight-row">
                      <dt>{item.label}</dt>
                      <dd className="num">
                        <strong>{item.value}</strong>
                        {item.sub ? <small>{item.sub}</small> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === "timeline" ? (
          <div className="pl-home-md-timeline-pane">
            {momentumPoints.length > 0 ? (
              <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando gráfica de momento" />}>
                <LazyMomentumChart
                  momentum={momentumPoints}
                  goals={[...goalScorers.home, ...goalScorers.away]}
                  homeLabel={game.home.shortName}
                  awayLabel={game.away.shortName}
                  liveMinute={liveDetail?.entry.minute ?? liveEntry?.minute ?? null}
                />
              </Suspense>
            ) : null}

            {shotItems.length > 0 ? (
              <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando mapa de tiros" />}>
                <LazyAtomicShotmapPitch
                  shots={shotItems}
                  homeLabel={game.home.shortName}
                  awayLabel={game.away.shortName}
                />
              </Suspense>
            ) : null}

            {timelineEvents.length > 0 ? (
              <ol className="pl-home-md-events" role="list">
                {timelineEvents.map((inc, idx) => (
                  <li
                    key={`ev-${inc.order}-${idx}`}
                    className={`pl-home-md-event-row is-${inc.side ?? "neutral"}`.trim()}
                  >
                    <span className="pl-home-md-event-min num">
                      {formatIncidentMinute(inc) || "·"}
                    </span>
                    <SportEventIcon kind={inc.kind} size={15} />
                    <div className="pl-home-md-event-copy">
                      <strong>{inc.player ?? incidentLabelEs(inc)}</strong>
                      <span>
                        {inc.player ? incidentLabelEs(inc) : ""}
                        {inc.secondary ? ` · ${inc.secondary}` : ""}
                        {inc.note && inc.player ? ` · ${inc.note}` : ""}
                      </span>
                    </div>
                    {inc.score ? (
                      <span className="pl-home-md-event-score num">
                        {inc.score.home}–{inc.score.away}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {activeTab === "lineups" ? (
          enrichedLineups ? (
            <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando alineaciones" />}>
              <LazyMatchLineupsPanel
                compact
                lineups={enrichedLineups}
                incidents={liveDetail?.incidents}
                onNavigate={navigateSafe}
                onPrefetch={prefetchSafe}
              />
            </Suspense>
          ) : hasRealFootballLineups && activeLineups ? (
            <div className="pl-home-md-lineups-pane">
              <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando esquema táctico" />}>
                <LazyAtomicLineupPitch
                  homeName={game.home.shortName || game.home.name}
                  awayName={game.away.shortName || game.away.name}
                  homeFormation={activeLineups.homeFormation ?? null}
                  awayFormation={activeLineups.awayFormation ?? null}
                  homeStarters={homeLineupPlayers}
                  awayStarters={awayLineupPlayers}
                  status={
                    activeLineups.status === "confirmed" || activeLineups.confirmed
                      ? "confirmed"
                      : "probable"
                  }
                  incidents={liveDetail?.incidents}
                />
              </Suspense>
            </div>
          ) : null
        ) : null}

        {activeTab === "enfrentamientos" ? (
          <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando enfrentamientos" />}>
            <LazyMatchEnfrentamientosPanel
              compact
              enfrentamientos={resolvedEnfrentamientos}
              league={game.league}
              homeName={game.home.shortName || game.home.name}
              homeSlug={game.home.slug}
              homeLogoUrl={game.home.logoUrl}
              awayName={game.away.shortName || game.away.name}
              awaySlug={game.away.slug}
              awayLogoUrl={game.away.logoUrl}
            />
          </Suspense>
        ) : null}

        {activeTab === "standings" && parsedStandings ? (
          <div className="pl-home-md-standings-pane">
            <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando clasificación" />}>
              <LazyStandingsBracketsSection
                league={game.league}
                standings={parsedStandings}
                highlightTeamSlug={game.home.slug}
                compact
                onNavigate={navigateSafe}
              />
            </Suspense>
          </div>
        ) : null}

        {activeTab === "injuries" ? (
          <Suspense fallback={<HomeMatchSubpanelFallback label="Cargando parte médico" />}>
            <LazyMatchInjuriesPanel
              injuries={injuriesList}
              league={game.league}
              homeName={game.home.name}
              homeSlug={game.home.slug}
              homeLogoUrl={game.home.logoUrl}
              awayName={game.away.name}
              awaySlug={game.away.slug}
              awayLogoUrl={game.away.logoUrl}
              onNavigate={navigateSafe}
              onPrefetch={prefetchSafe}
            />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
