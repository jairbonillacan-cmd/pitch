import React from "react";
import {
  asLeagueId,
  parseStrictFiniteNumber,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
} from "@pitchlab/contracts";
import {
  SofascoreCard,
  SofascoreKpiStrip,
  type SofascoreKpiItem,
} from "../../components/ui/primitives";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import {
  LazyCalibrationCurveChart as CalibrationCurveChart,
  LazyCalibrationHonestyLab as CalibrationHonestyLab,
} from "./LazyCalibrationIslands";
import { checkParlayCompatibility, computeParlaySummary } from "../parlay-engine";
import {
  CORTEX_SAMPLE_QUOTE,
  INITIAL_SOCIAL_POSTS,
  LANDING_FAQS,
  MEMBERSHIP_SPEC,
  PRECISION_BUCKETS,
  SPACETIME_ENGINES,
  SPACETIME_METRICS_HEADLINE,
  SPACETIME_VS_TIPSTER_ROWS,
  TIPSTER_CREATORS,
} from "../spacetime-catalog";
import {
  buildGoalModel,
  buildPointsModel,
  derivedMarketProbability,
} from "../spacetime-markets";
import type {
  MatchPick,
  PickConflictGroup,
  PlatformGame,
  PlatformLeagueSummary,
} from "../types";
import {
  HeroMatchDemoIsland,
  PricingCardIsland,
  SpeiTransferPricingIsland,
  UltraPassCardStageIsland,
} from "./LandingClientIslands";
import {
  ClosingCtaSection,
  PublicSiteShell,
  type PublicNavPath,
} from "./PublicSiteShell";
import { ResultadosEditorialBoard } from "./VerificationSurface";

export { ClosingCtaSection, MEMBERSHIP_SPEC, PublicSiteShell };
export type { PublicNavPath };

export interface LandingHeroLeagueCard {
  league: LeagueId;
  leagueShort: string;
  leagueLabel: string;
  roundLabel: string;
  whenLabel: string;
  home: { slug: string; name: string; note: string };
  away: { slug: string; name: string; note: string };
  splitProbabilities: readonly number[];
  splitLabels: readonly string[];
  mostProbable: {
    label: string;
    p: number;
    fairAmerican: string;
    fairDecimal: string;
  };
  otherMarkets: ReadonlyArray<{
    label: string;
    p: number;
    fairAmerican: string;
  }>;
}

export interface LandingFinishedResultItem {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  metaLabel: string;
  scoreLabel: string;
  home: { slug: string; name: string };
  away: { slug: string; name: string };
  pickLabel: string;
  p: number;
  fairAmerican: string;
  hit: boolean;
  kickoffUtc?: string;
  score?: { home: number; away: number };
}

export interface LandingParlayDemoData {
  isExample: boolean;
  legs: ReadonlyArray<{
    league: LeagueId;
    teamSlug: string;
    teamName: string;
    label: string;
    matchLabel: string;
    p: number;
  }>;
  blockedLeg: {
    label: string;
    conflictWithLabel: string;
  };
  combinedProbability: number;
  fairAmerican: string;
  note: string;
}

export interface LandingFeaturedCommunityPick {
  league: LeagueId;
  teamSlug: string;
  teamName: string;
  pickLabel: string;
  matchLabel: string;
  p: number;
  fairAmerican: string;
}

const LEAGUE_PRIORITY_ORDER: readonly LeagueId[] = [
  asLeagueId("liga-mx"),
  asLeagueId("nfl"),
  asLeagueId("premier-league"),
  asLeagueId("laliga"),
  asLeagueId("bundesliga"),
  asLeagueId("serie-a"),
  asLeagueId("ligue-1"),
  asLeagueId("nba"),
  asLeagueId("nhl"),
  asLeagueId("ncaaf"),
  asLeagueId("mlb"),
];

const LEAGUE_SHORT_NAMES: Readonly<Record<string, string>> = {
  "liga-mx": "Liga MX",
  nfl: "NFL",
  "premier-league": "Premier",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nba: "NBA",
  nhl: "NHL",
  ncaaf: "NCAAF",
  mlb: "MLB",
};

function formatPctEs(p: number): string {
  return `${(p * 100).toFixed(1)} %`;
}

export function formatFairDecimalFromProb(p: number): string {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  return (1 / clamped).toFixed(2);
}

export function formatFairAmericanFromProb(p: number): string {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  if (clamped >= 0.5) {
    const val = Math.max(100, Math.round((clamped / (1 - clamped)) * 100));
    return `\u2212${val}`;
  }
  const val = Math.max(100, Math.round(((1 - clamped) / clamped) * 100));
  return `+${val}`;
}

function formatSignedAmericanInt(american: number): string {
  const rounded = Math.round(american);
  if (rounded < 0) {
    return `\u2212${Math.abs(rounded)}`;
  }
  return `+${rounded}`;
}

function formatTypographicMinus(label: string): string {
  return label
    .replace(/^-(\d)/, "\u2212$1")
    .replace(/(\s)-(\d)/g, "$1\u2212$2");
}

function teamDisplayName(team: { name: string; shortName: string }): string {
  return team.shortName || team.name;
}

function buildWhenLabel(game: PlatformGame): string {
  const ko = (game.kickoffLocal || "").trim();
  const day = (game.dayLabel || "").trim();
  if (!ko) return day;
  if (!day) return ko;
  if (ko.toLowerCase().includes(day.toLowerCase()) || ko.includes("·")) {
    return ko;
  }
  return `${day} · ${ko}`;
}

function buildRoundLabel(game: PlatformGame, summary?: PlatformLeagueSummary): string {
  const leagueTitle = summary?.label || game.leagueLabel;
  const round = (game.round || summary?.roundLabel || "").trim();
  if (!round) return leagueTitle;
  if (round.toLowerCase().includes(leagueTitle.toLowerCase())) {
    return round;
  }
  return `${leagueTitle} · ${round}`;
}

function buildTeamNote(
  game: PlatformGame,
  side: "home" | "away",
): string {
  const team = side === "home" ? game.home : game.away;
  if (team.record && team.record.trim().length > 0) {
    return team.record.trim();
  }
  if (!game.projection) {
    return side === "home" ? "Local" : "Visitante";
  }
  const unit = sportScoringUnit(game.sport);
  const projVal = side === "home" ? game.projection.home : game.projection.away;
  return `${side === "home" ? "Local" : "Visitante"} · proy. ${projVal.toFixed(1)} ${unit.short}`;
}

function readableMarketLabel(row: { group: string; market: string; label: string; selection: string }): string {
  const label = row.label.trim();
  if (/^(sí|si|no)$/i.test(label)) return `${row.group}: ${label}`;
  if (row.market === "totals" && /^(más|menos)( de [\d.]+)?$/i.test(label)) {
    const line = /[\d.]+/.exec(row.selection)?.[0] ?? /[\d.]+/.exec(row.group)?.[0];
    const base = /de [\d.]+/.test(label) ? label : `${label} de ${line ?? ""}`.trim();
    return `${base} ${/punto|total \d/i.test(row.group) ? "puntos" : "goles"}`;
  }
  return label;
}

function deriveOtherMarketsForGame(
  game: PlatformGame,
  mostProbableLabel: string,
): Array<{ label: string; p: number; fairAmerican: string }> {
  const homeName = teamDisplayName(game.home);
  const awayName = teamDisplayName(game.away);

  if (game.markets && game.markets.length > 0) {
    const filtered = game.markets.filter(
      (row) =>
        row.market !== "h2h" &&
        row.label !== mostProbableLabel &&
        row.p >= 0.18 &&
        row.p <= 0.94,
    );
    const bestByMarket = new Map<string, (typeof filtered)[number]>();
    for (const row of filtered) {
      const current = bestByMarket.get(row.market);
      if (!current || row.p > current.p) bestByMarket.set(row.market, row);
    }
    const chosen = Array.from(bestByMarket.values())
      .slice(0, 3)
      .map((row) => ({
        label: formatTypographicMinus(readableMarketLabel(row)),
        p: row.p,
        fairAmerican: formatFairAmericanFromProb(row.p),
      }));
    if (chosen.length >= 3) return chosen;
  }

  if (!game.x12 || !game.projection) {
    return [];
  }

  const [pHome, pDraw, pAway] = game.x12;
  const fallbackRows: Array<{ label: string; p: number }> = [];
  const hasDraw = sportHasDraw(game.sport);

  if (!hasDraw) {
    const isPointsSport = sportScoringUnit(game.sport).short === "pts";
    const margin = game.projection.home - game.projection.away;
    const pointsModel = isPointsSport
      ? buildPointsModel(game.projection.total, margin, pHome)
      : buildGoalModel(game.projection.total, margin);
    if (pointsModel) {
      const spreadHalf = Math.round(Math.abs(margin)) + 0.5;
      const favIsHome = pHome >= pAway;
      const dogSpreadP = derivedMarketProbability(
        pointsModel,
        "spreads",
        favIsHome ? "away" : "home",
        spreadHalf,
      );
      if (dogSpreadP !== null) {
        fallbackRows.push({
          label: `${favIsHome ? awayName : homeName} +${spreadHalf}`,
          p: dogSpreadP,
        });
      }
      const totalHalf = Math.floor(game.projection.total) + 0.5;
      const overP = derivedMarketProbability(pointsModel, "totals", "over", totalHalf);
      if (overP !== null) {
        const useOver = overP >= 0.5;
        fallbackRows.push({
          label: `${useOver ? "Más" : "Menos"} de ${totalHalf} ${isPointsSport ? "puntos" : "goles"}`,
          p: useOver ? overP : 1 - overP,
        });
      }
      const favTeamHalf =
        Math.floor(favIsHome ? game.projection.home : game.projection.away) + 0.5;
      const teamOverP = derivedMarketProbability(
        pointsModel,
        "team_totals",
        favIsHome ? "home_over" : "away_over",
        favTeamHalf,
      );
      if (teamOverP !== null) {
        fallbackRows.push({
          label: `${favIsHome ? homeName : awayName} más de ${favTeamHalf} ${isPointsSport ? "pts" : "goles"}`,
          p: teamOverP,
        });
      }
    }
    const dogP = Math.min(pHome, pAway);
    const dogName = pHome < pAway ? homeName : awayName;
    if (fallbackRows.length < 3 && dogP > 0.02) {
      fallbackRows.push({ label: `${dogName} gana`, p: dogP });
    }
  } else {
    const favIsHome = pHome >= pAway;
    const dcFavP = Math.min(0.97, (favIsHome ? pHome : pAway) + pDraw);
    fallbackRows.push({
      label: `${favIsHome ? homeName : awayName} o empate`,
      p: dcFavP,
    });

    const goalModel = buildGoalModel(
      game.projection.total,
      game.projection.home - game.projection.away,
    );
    if (goalModel) {
      const over15 = derivedMarketProbability(goalModel, "totals", "over_1.5", 1.5);
      if (over15 !== null) {
        fallbackRows.push({ label: "Más de 1.5 goles", p: over15 });
      }
      const over25 = derivedMarketProbability(goalModel, "totals", "over_2.5", 2.5);
      if (over25 !== null) {
        fallbackRows.push({ label: "Más de 2.5 goles", p: over25 });
      }
      const bttsYes = derivedMarketProbability(goalModel, "btts", "yes", undefined);
      if (bttsYes !== null && fallbackRows.length < 3) {
        fallbackRows.push({ label: "Ambos anotan", p: bttsYes });
      }
    } else {
      const eitherWins = Math.min(0.97, pHome + pAway);
      fallbackRows.push({ label: `${homeName} o ${awayName}`, p: eitherWins });
      const dcOther = Math.min(0.97, (favIsHome ? pAway : pHome) + pDraw);
      fallbackRows.push({
        label: `${favIsHome ? awayName : homeName} o empate`,
        p: dcOther,
      });
    }
  }

  return fallbackRows
    .filter((row) => row.label !== mostProbableLabel && row.p > 0.02 && row.p < 0.99)
    .slice(0, 3)
    .map((row) => ({
      label: formatTypographicMinus(row.label),
      p: row.p,
      fairAmerican: formatFairAmericanFromProb(row.p),
    }));
}

function pickPreferredHeroGame(
  league: LeagueId,
  leagueGames: readonly PlatformGame[],
): PlatformGame | undefined {
  const withForecast = leagueGames.filter(
    (game) => game.hasForecast !== false && game.x12 !== null && game.projection !== null,
  );
  if (withForecast.length === 0) return undefined;
  const upcoming = withForecast.filter((game) => game.status !== "FT");
  const pool = upcoming.length > 0 ? upcoming : withForecast;

  if (league === "liga-mx") {
    const qroMty = pool.find(
      (g) =>
        (g.home.slug.includes("queretaro") || g.home.name.includes("Querétaro")) &&
        (g.away.slug.includes("monterrey") || g.away.name.includes("Monterrey")),
    );
    if (qroMty) return qroMty;
  }

  if (league === "nfl") {
    const nygWas = pool.find(
      (g) =>
        (g.home.slug.includes("giants") || g.home.name.includes("Giants")) &&
        (g.away.slug.includes("commanders") ||
          g.away.slug.includes("washington") ||
          g.away.name.includes("Washington")),
    );
    if (nygWas) return nygWas;
  }

  return pool[0];
}

export function buildHeroLeagueCards(
  games: readonly PlatformGame[],
  leagues?: readonly PlatformLeagueSummary[],
): LandingHeroLeagueCard[] {
  const summaryByLeague = new Map<LeagueId, PlatformLeagueSummary>();
  for (const lg of leagues ?? []) {
    summaryByLeague.set(lg.league, lg);
  }

  const presentLeagues = new Set<LeagueId>(games.map((g) => g.league));
  const orderedLeagues: LeagueId[] = [
    ...LEAGUE_PRIORITY_ORDER.filter((lg) => presentLeagues.has(lg)),
    ...Array.from(presentLeagues).filter((lg) => !LEAGUE_PRIORITY_ORDER.includes(lg)),
  ];

  const cards: LandingHeroLeagueCard[] = [];

  for (const league of orderedLeagues) {
    const leagueGames = games.filter((g) => g.league === league);
    const chosen = pickPreferredHeroGame(league, leagueGames);
    if (!chosen || !chosen.x12) continue;

    const summary = summaryByLeague.get(league);
    const homeName = teamDisplayName(chosen.home);
    const awayName = teamDisplayName(chosen.away);
    const hasDraw = sportHasDraw(chosen.sport);

    const [rawHome, rawDraw, rawAway] = chosen.x12;
    const splitProbabilities = !hasDraw
      ? [rawHome, rawAway]
      : [rawHome, rawDraw, rawAway];
    const splitLabels = !hasDraw
      ? [homeName, awayName]
      : [homeName, "Empate", awayName];

    const h2hCandidates = !hasDraw
      ? [
          { label: `${homeName} gana`, p: rawHome },
          { label: `${awayName} gana`, p: rawAway },
        ]
      : [
          { label: `${homeName} gana`, p: rawHome },
          { label: "Empate", p: rawDraw },
          { label: `${awayName} gana`, p: rawAway },
        ];

    const best = h2hCandidates.reduce(
      (acc, cur) => (cur.p > acc.p ? cur : acc),
      h2hCandidates[0]!,
    );

    cards.push({
      league,
      leagueShort: LEAGUE_SHORT_NAMES[league] ?? summary?.label ?? chosen.leagueLabel,
      leagueLabel: summary?.label ?? chosen.leagueLabel,
      roundLabel: buildRoundLabel(chosen, summary),
      whenLabel: buildWhenLabel(chosen),
      home: {
        slug: chosen.home.slug,
        name: homeName,
        note: buildTeamNote(chosen, "home"),
      },
      away: {
        slug: chosen.away.slug,
        name: awayName,
        note: buildTeamNote(chosen, "away"),
      },
      splitProbabilities,
      splitLabels,
      mostProbable: {
        label: best.label,
        p: best.p,
        fairAmerican: formatFairAmericanFromProb(best.p),
        fairDecimal: formatFairDecimalFromProb(best.p),
      },
      otherMarkets: deriveOtherMarketsForGame(chosen, best.label),
    });
  }

  return cards;
}

export function buildFinishedResultItems(
  finishedGames: readonly PlatformGame[],
  limit?: number,
): LandingFinishedResultItem[] {
  const completed = finishedGames
    .filter(
      (game) =>
        game.status === "FT" &&
        game.score !== undefined &&
        game.picks.length > 0 &&
        (game.picks[0]?.result === "hit" || game.picks[0]?.result === "miss"),
    )
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.kickoffUtc);
      const tb = Date.parse(b.kickoffUtc);
      if (Number.isFinite(ta) && Number.isFinite(tb) && tb !== ta) {
        return tb - ta;
      }
      return 0;
    });

  const items: LandingFinishedResultItem[] = completed.map((game) => {
    const fpk = game.picks[0]!;
    const homeName = teamDisplayName(game.home);
    const awayName = teamDisplayName(game.away);
    const score = game.score!;

    return {
      id: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      metaLabel: `${game.leagueLabel} · ${game.dayLabel}`,
      scoreLabel: `${homeName} ${score.home}\u2013${score.away} ${awayName}`,
      home: { slug: game.home.slug, name: homeName },
      away: { slug: game.away.slug, name: awayName },
      pickLabel: formatTypographicMinus(fpk.label),
      p: fpk.p,
      fairAmerican: formatFairAmericanFromProb(fpk.p),
      hit: fpk.result === "hit",
      kickoffUtc: game.kickoffUtc,
      score: { home: score.home, away: score.away },
    };
  });

  return typeof limit === "number" ? items.slice(0, limit) : items;
}

function buildOpposingSyntheticPick(
  game: PlatformGame,
  referenceLeg: MatchPick,
): MatchPick {
  const homeName = teamDisplayName(game.home);
  const awayName = teamDisplayName(game.away);
  const pHome = game.x12?.[0] ?? 0.5;
  const pAway = game.x12?.[2] ?? 0.5;
  let conflictGroup: PickConflictGroup = "home_side";
  let label = `${homeName} gana`;
  let p = pHome;

  switch (referenceLeg.conflictGroup) {
    case "away_side":
      conflictGroup = "home_side";
      label = `${homeName} gana`;
      p = pHome;
      break;
    case "home_side":
      conflictGroup = "away_side";
      label = `${awayName} gana`;
      p = pAway;
      break;
    case "draw_side":
      conflictGroup = pHome >= pAway ? "home_side" : "away_side";
      label =
        conflictGroup === "home_side" ? `${homeName} gana` : `${awayName} gana`;
      p = conflictGroup === "home_side" ? pHome : pAway;
      break;
    case "over_total":
      conflictGroup = "under_total";
      label = referenceLeg.label.replace(/^Más/i, "Menos");
      p = Math.max(0.05, 1 - referenceLeg.p);
      break;
    case "under_total":
      conflictGroup = "over_total";
      label = referenceLeg.label.replace(/^Menos/i, "Más");
      p = Math.max(0.05, 1 - referenceLeg.p);
      break;
    case "btts_yes":
      conflictGroup = "btts_no";
      label = "Ambos anotan: No";
      p = Math.max(0.05, 1 - referenceLeg.p);
      break;
    case "btts_no":
      conflictGroup = "btts_yes";
      label = "Ambos anotan: Sí";
      p = Math.max(0.05, 1 - referenceLeg.p);
      break;
    case "independent":
      conflictGroup = "away_side";
      label = `${awayName} gana`;
      p = pAway;
      break;
  }

  return {
    ...referenceLeg,
    id: `${game.id}-opposing-demo`,
    conflictGroup,
    label,
    p,
    fairDecimal: parseStrictFiniteNumber(formatFairDecimalFromProb(p)) ?? 2,
    isRedacted: false,
  };
}

function buildExampleParlayFallback(): LandingParlayDemoData {
  const ligaMxId = asLeagueId("liga-mx");
  const basePick: MatchPick = {
    id: "example-leg-1",
    gameId: "example-qro-mty",
    league: ligaMxId,
    leagueLabel: "Liga MX",
    matchLabel: "Querétaro vs Monterrey",
    kickoffLocal: "Sáb · 17:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "conservador",
    categoryLabel: "Doble oportunidad",
    risk: "conservador",
    engineKey: "singularity",
    engineName: "PitchLab Singularity",
    marketGroup: "double_chance",
    selectionKey: "x2",
    conflictGroup: "away_side",
    label: "Monterrey o empate",
    rationale: "Ejemplo demostrativo",
    p: 0.723,
    fairDecimal: 1.38,
    fairAmerican: -261,
    marketDecimal: null,
    marketAmerican: null,
    edgePts: null,
    confidenceScore: 72,
    suggestedUnits: 1,
  };
  const secondPick: MatchPick = {
    ...basePick,
    id: "example-leg-2",
    slotIndex: 1,
    category: "totales",
    categoryLabel: "Totales",
    marketGroup: "totals",
    selectionKey: "over_1.5",
    conflictGroup: "over_total",
    label: "Más de 1.5 goles",
    p: 0.804,
    fairDecimal: 1.24,
    fairAmerican: -410,
  };
  const opposingPick: MatchPick = {
    ...basePick,
    id: "example-leg-blocked",
    conflictGroup: "home_side",
    selectionKey: "home",
    label: "Querétaro gana",
    p: 0.277,
    fairDecimal: 3.61,
    fairAmerican: 261,
  };

  void checkParlayCompatibility([{ pick: basePick }], opposingPick, true);
  const summary = computeParlaySummary([{ pick: basePick }, { pick: secondPick }]);

  return {
    isExample: true,
    legs: [
      {
        league: ligaMxId,
        teamSlug: "monterrey",
        teamName: "Monterrey",
        label: basePick.label,
        matchLabel: basePick.matchLabel,
        p: basePick.p,
      },
      {
        league: ligaMxId,
        teamSlug: "monterrey",
        teamName: "Monterrey",
        label: secondPick.label,
        matchLabel: secondPick.matchLabel,
        p: secondPick.p,
      },
    ],
    blockedLeg: {
      label: opposingPick.label,
      conflictWithLabel: basePick.label,
    },
    combinedProbability: summary.combinedProbability,
    fairAmerican: formatSignedAmericanInt(summary.fairAmerican),
    note: "Las dos son del mismo partido: la probabilidad combinada tiene en cuenta que van juntas.",
  };
}

export function buildParlayDemoData(
  games: readonly PlatformGame[],
): LandingParlayDemoData {
  const upcoming = games.filter((game) => game.status !== "FT");
  if (upcoming.length === 0) {
    return buildExampleParlayFallback();
  }

  const prioritized = upcoming.slice().sort((a, b) => {
    const aQroMty =
      a.league === "liga-mx" &&
      a.home.slug.includes("queretaro") &&
      a.away.slug.includes("monterrey")
        ? 0
        : a.league === "liga-mx"
          ? 1
          : 2;
    const bQroMty =
      b.league === "liga-mx" &&
      b.home.slug.includes("queretaro") &&
      b.away.slug.includes("monterrey")
        ? 0
        : b.league === "liga-mx"
          ? 1
          : 2;
    return aQroMty - bQroMty;
  });

  for (const game of prioritized) {
    const unlocked = game.picks.filter(
      (pk) => !pk.isRedacted && pk.gameStatus !== "FT",
    );
    if (unlocked.length < 2) continue;

    for (let i = 0; i < unlocked.length; i += 1) {
      const legA = unlocked[i]!;
      if (legA.conflictGroup === "independent") continue;

      const legB = unlocked.find(
        (cand, idx) =>
          idx !== i &&
          cand.conflictGroup !== legA.conflictGroup &&
          checkParlayCompatibility([{ pick: legA }], cand, true).allowed,
      );
      if (!legB) continue;

      const existingConflict = unlocked.find(
        (cand) =>
          cand.id !== legA.id &&
          cand.id !== legB.id &&
          !checkParlayCompatibility([{ pick: legA }], cand, true).allowed,
      );
      const opposingCandidate =
        existingConflict ?? buildOpposingSyntheticPick(game, legA);
      const compatCheck = checkParlayCompatibility(
        [{ pick: legA }],
        opposingCandidate,
        true,
      );
      if (compatCheck.allowed) continue;

      const summary = computeParlaySummary([{ pick: legA }, { pick: legB }]);
      const homeName = teamDisplayName(game.home);
      const awayName = teamDisplayName(game.away);
      const matchLabel = `${homeName} vs ${awayName}`;
      const pHome = game.x12?.[0] ?? 0.5;
      const pAway = game.x12?.[2] ?? 0.5;
      const favTeam = pAway > pHome ? game.away : game.home;

      return {
        isExample: false,
        legs: [legA, legB].map((pk) => {
          const team =
            pk.conflictGroup === "away_side"
              ? game.away
              : pk.conflictGroup === "home_side"
                ? game.home
                : favTeam;
          return {
            league: game.league,
            teamSlug: team.slug,
            teamName: teamDisplayName(team),
            label: formatTypographicMinus(pk.label),
            matchLabel,
            p: pk.p,
          };
        }),
        blockedLeg: {
          label: formatTypographicMinus(opposingCandidate.label),
          conflictWithLabel: formatTypographicMinus(legA.label),
        },
        combinedProbability: summary.combinedProbability,
        fairAmerican: formatSignedAmericanInt(summary.fairAmerican),
        note: "Las dos son del mismo partido: la probabilidad combinada tiene en cuenta que van juntas.",
      };
    }
  }

  return buildExampleParlayFallback();
}

const DEFAULT_FEATURED_COMMUNITY_PICK: LandingFeaturedCommunityPick = {
  league: asLeagueId("nfl"),
  teamSlug: "washington-commanders",
  teamName: "Washington",
  pickLabel: "Washington +7.5",
  matchLabel: "NY Giants vs Washington · NFL",
  p: 0.639,
  fairAmerican: "\u2212177",
};

export function buildFeaturedCommunityPick(
  games: readonly PlatformGame[],
  tipsterWeeklyPickId?: string,
): LandingFeaturedCommunityPick {
  if (tipsterWeeklyPickId) {
    for (const game of games) {
      const weekly = game.picks.find(
        (pk) => pk.id === tipsterWeeklyPickId && !pk.isRedacted,
      );
      if (weekly) {
        const team =
          weekly.conflictGroup === "away_side" ? game.away : game.home;
        return {
          league: game.league,
          teamSlug: team.slug,
          teamName: teamDisplayName(team),
          pickLabel: formatTypographicMinus(weekly.label),
          matchLabel: `${teamDisplayName(game.home)} vs ${teamDisplayName(game.away)} · ${game.leagueLabel}`,
          p: weekly.p,
          fairAmerican: formatFairAmericanFromProb(weekly.p),
        };
      }
    }
  }

  const nflGame =
    games.find((g) => g.league === "nfl" && g.status !== "FT" && g.x12 !== null) ??
    games.find((g) => g.league === "nfl" && g.x12 !== null) ??
    games.find((g) => g.status !== "FT" && g.x12 !== null);

  if (nflGame) {
    const openPick = nflGame.picks.find((pk) => !pk.isRedacted);
    if (openPick) {
      const team =
        openPick.conflictGroup === "away_side" ? nflGame.away : nflGame.home;
      return {
        league: nflGame.league,
        teamSlug: team.slug,
        teamName: teamDisplayName(team),
        pickLabel: formatTypographicMinus(openPick.label),
        matchLabel: `${teamDisplayName(nflGame.home)} vs ${teamDisplayName(nflGame.away)} · ${nflGame.leagueLabel}`,
        p: openPick.p,
        fairAmerican: formatFairAmericanFromProb(openPick.p),
      };
    }

    if (nflGame.x12) {
      const favHome = nflGame.x12[0] >= nflGame.x12[2];
      const team = favHome ? nflGame.home : nflGame.away;
      const p = favHome ? nflGame.x12[0] : nflGame.x12[2];
      return {
        league: nflGame.league,
        teamSlug: team.slug,
        teamName: teamDisplayName(team),
        pickLabel: `${teamDisplayName(team)} gana`,
        matchLabel: `${teamDisplayName(nflGame.home)} vs ${teamDisplayName(nflGame.away)} · ${nflGame.leagueLabel}`,
        p,
        fairAmerican: formatFairAmericanFromProb(p),
      };
    }
  }

  return DEFAULT_FEATURED_COMMUNITY_PICK;
}

export function MultiAngleValidationSection({
  heroCards = [],
}: {
  heroCards?: readonly LandingHeroLeagueCard[];
} = {}): React.JSX.Element {
  const soccerCard =
    heroCards.find((card) => card.league === "liga-mx") ??
    heroCards.find((card) => card.league !== "nfl") ??
    heroCards[0];
  const secondaryCard =
    heroCards.find((card) => card.league === "nfl") ?? heroCards[1];

  const primaryMatchTitle = soccerCard
    ? `${soccerCard.home.name} vs ${soccerCard.away.name}`
    : "Querétaro vs Monterrey";
  const primaryPickLabel = soccerCard?.mostProbable.label ?? "Monterrey gana";
  const primaryProb = soccerCard ? formatPctEs(soccerCard.mostProbable.p) : "47.0 %";
  const primaryFair = soccerCard?.mostProbable.fairAmerican ?? "+113";
  const primaryLeague = soccerCard?.leagueShort ?? "Liga MX";

  const secondaryMatchTitle = secondaryCard
    ? `${secondaryCard.home.name} vs ${secondaryCard.away.name}`
    : "Chiefs vs Bills";
  const secondaryPickLabel = secondaryCard?.mostProbable.label ?? "Kansas City gana";
  const secondaryProb = secondaryCard ? formatPctEs(secondaryCard.mostProbable.p) : "58.2 %";
  const secondaryFair = secondaryCard?.mostProbable.fairAmerican ?? "−139";
  const secondaryLeague = secondaryCard?.leagueShort ?? "NFL";

  const angleMetrics = [
    { label: "Fuerza ofensiva y localía (Tachyon)", pct: 78, tone: "ok" as const },
    { label: "Forma reciente ajustada por rival (Singularity)", pct: 71, tone: "ok" as const },
    { label: "Descanso, altitud y calendario (Minkowski)", pct: 83, tone: "ok" as const },
    { label: "Cruce contra cierre del mercado (Geodesic)", pct: 64, tone: "brand" as const },
    { label: "Consenso final sin comisión (Cortex IA)", pct: 74, tone: "ok" as const },
  ];

  return (
    <section id="cinco-angulos" className="pl-lp-section pl-lp-angles-section">
      <div className="pl-lp-wrap pl-lp-stack">
        <div className="pl-lp-section-head pl-lp-section-head--center">
          <p className="pl-lp-eyebrow">Nosotros procesamos los datos por ti</p>
          <h2 className="pl-lp-h2 text-balance">
            Cada partido, puesto a prueba desde cinco ángulos.
          </h2>
          <p className="pl-lp-lede text-pretty">
            Antes de publicar una probabilidad, nuestros modelos cruzan fuerza estructural, forma reciente,
            descanso, movimiento del mercado y contexto en vivo.
          </p>
        </div>

        <div className="pl-lp-angles-stage">
          <div className="pl-lp-angle-callout pl-lp-angle-callout--tl">
            <span>5 motores probados fuera de muestra</span>
            <svg
              className="pl-lp-angle-arrow"
              width="52"
              height="36"
              viewBox="0 0 52 36"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 6C22 6 38 14 46 31"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeDasharray="4 4"
              />
              <path
                d="M40 28L46.5 32L49 24.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="pl-lp-angle-callout pl-lp-angle-callout--tr">
            <span>Momio justo sin margen de la casa</span>
            <svg
              className="pl-lp-angle-arrow pl-lp-angle-arrow--flip"
              width="52"
              height="36"
              viewBox="0 0 52 36"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 6C22 6 38 14 46 31"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeDasharray="4 4"
              />
              <path
                d="M40 28L46.5 32L49 24.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="pl-lp-angle-callout pl-lp-angle-callout--bl">
            <span>Compara por localía, forma y calendario</span>
            <svg
              className="pl-lp-angle-arrow"
              width="48"
              height="28"
              viewBox="0 0 48 28"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 22C20 22 34 16 44 5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeDasharray="4 4"
              />
              <path
                d="M36.5 5.5L44.5 4.5L43.5 12.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="pl-lp-angles-cards">
            <article className="pl-lp-card pl-lp-angle-card pl-lp-angle-card--primary glass-card glass-ring">
              <div className="pl-lp-angle-card-head">
                <div>
                  <p className="pl-lp-most-kicker">{primaryLeague} · Desglose multi-ángulo</p>
                  <h3 className="pl-lp-h3 text-balance">{primaryMatchTitle}</h3>
                </div>
                <span className="pl-lp-pill pl-lp-pill--brand num" data-example-badge="">Ejemplo</span>
              </div>

              <div className="pl-lp-angle-summary num">
                <div>
                  <span className="pl-lp-fine">Escenario principal</span>
                  <strong className="pl-lp-angle-pick">{primaryPickLabel}</strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong className="pl-lp-angle-prob">{primaryProb}</strong>
                  <span className="pl-lp-fine" style={{ display: "block" }}>
                    Justo {primaryFair}
                  </span>
                </div>
              </div>

              <div className="pl-lp-angle-bars">
                {angleMetrics.map((metric) => (
                  <div key={metric.label} className="pl-lp-angle-bar-row">
                    <div className="pl-lp-angle-bar-top">
                      <span>{metric.label}</span>
                      <span className="num">{metric.pct} %</span>
                    </div>
                    <div className="pl-lp-angle-track" aria-hidden="true">
                      <span
                        className={`pl-lp-angle-fill pl-lp-angle-fill--${metric.tone}`}
                        style={{ width: `${metric.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="pl-lp-card pl-lp-angle-card pl-lp-angle-card--secondary glass-card glass-ring">
              <div className="pl-lp-angle-card-head">
                <div>
                  <p className="pl-lp-most-kicker">{secondaryLeague} · Validación cruzada</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: 16 }}>
                    {secondaryMatchTitle}
                  </p>
                </div>
                <span className="pl-lp-status pl-lp-status--hit num">5 / 5 motores</span>
              </div>

              <div className="pl-lp-angle-summary pl-lp-angle-summary--compact num">
                <span>{secondaryPickLabel}</span>
                <strong>
                  {secondaryProb} · justo {secondaryFair}
                </strong>
              </div>

              <div className="pl-lp-angle-mini-chips num">
                <span className="pl-lp-pill">Eficiencia por jugada: +6.4 %</span>
                <span className="pl-lp-pill">Línea sin margen evaluada</span>
                <span className="pl-lp-pill">Cero datos posteriores</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection({
  variant = "teaser",
}: {
  variant?: "teaser" | "page";
}): React.JSX.Element {
  return (
    <section id="como-se-lee" className="pl-lp-section">
      <div className="pl-lp-wrap pl-lp-stack">
        <div className="pl-lp-section-head pl-lp-section-head--center">
          <p className="pl-lp-eyebrow">Cómo se lee</p>
          <h2 className="pl-lp-h2 text-balance">Tres números, en este orden.</h2>
          <p className="pl-lp-lede text-pretty">
            Siempre igual en cada partido, para que lo leas en segundos.
          </p>
        </div>

        <ol className="pl-lp-steps">
          <li>
            <span className="pl-lp-step-idx num">01</span>
            <p className="pl-lp-step-fig pl-lp-step-fig--ok num">72.3 %</p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-step-title text-balance">La probabilidad</h3>
              <p className="pl-lp-step-desc text-pretty">
                Qué tan seguido pasaría ese resultado si el partido se jugara muchas veces, según el modelo.
              </p>
            </div>
          </li>

          <li>
            <span className="pl-lp-step-idx num">02</span>
            <p className="pl-lp-step-fig num">−261</p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-step-title text-balance">El momio justo</h3>
              <p className="pl-lp-step-desc text-pretty">
                Lo que debería pagar ese resultado sin el margen de la casa. Es la probabilidad escrita como momio.
              </p>
            </div>
          </li>

          <li>
            <span className="pl-lp-step-idx num">03</span>
            <p className="pl-lp-step-fig num">
              −200{" "}
              <span className="pl-lp-step-delta">
                +5.6 pts
              </span>
            </p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-step-title text-balance">Tu momio contra el justo</h3>
              <p className="pl-lp-step-desc text-pretty">
                Escribe el momio de tu casa y ves si paga más o menos que lo justo. La decisión y el monto son tuyos.
              </p>
            </div>
          </li>
        </ol>

        {variant === "teaser" ? (
          <a
            className="pl-lp-more pl-lp-more--center"
            href="/#hoy"
          >
            Ir al comparador{" "}
            <span className="pl-lp-arr" aria-hidden="true">
              →
            </span>
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function EnginesSection({
  variant = "teaser",
}: {
  variant?: "teaser" | "page";
}): React.JSX.Element {
  const kpiItems: SofascoreKpiItem[] = [
    {
      id: "historical",
      label: "Partidos históricos en los motores",
      value: SPACETIME_METRICS_HEADLINE.historicalMatches,
      delta: `${SPACETIME_METRICS_HEADLINE.holdoutTestMatches} prueba`,
      tone: "brand",
    },
    {
      id: "vars",
      label: "Variables por partido",
      value: SPACETIME_METRICS_HEADLINE.variablesPerMatch,
      delta: `${SPACETIME_METRICS_HEADLINE.telemetryPoints} registros`,
    },
    {
      id: "leak",
      label: "Datos posteriores al partido",
      value: SPACETIME_METRICS_HEADLINE.postMatchData,
      delta: "Sin fuga temporal",
      tone: "positive",
    },
    {
      id: "calib",
      label: variant === "page" ? "Calibración · CLV" : "Error de calibración",
      value: SPACETIME_METRICS_HEADLINE.calibrationError,
      delta: `CLV ${SPACETIME_METRICS_HEADLINE.closingLineBeatPct}`,
      tone: "positive",
    },
  ];

  return (
    <section id="motores" className="pl-lp-section">
      <div className="pl-lp-wrap pl-ed-stack">
        <div className="pl-ed-head-row">
          <div className="pl-ed-head-copy">
            <p className="pl-ed-eyebrow">Los motores</p>
            <h2 className="pl-ed-h2">
              {variant === "page"
                ? "Arquitectura y pruebas fuera de muestra."
                : "Cinco motores. Cada uno probado con partidos que no vio."}
            </h2>
            <p className="pl-ed-subcopy">
              Un tipster opina. Aquí cada pick sale de cinco motores propios probados contra el
              mercado antes de publicarse, y su evidencia está a la vista.
            </p>
          </div>
          <span className="pl-ed-badge pl-ed-badge--ok">
            <span className="pl-ed-badge-dot" aria-hidden="true" />
            <span>Validación fuera de muestra · 2024–25</span>
          </span>
        </div>

        <SofascoreKpiStrip items={kpiItems} className="pl-ed-kpi-4" />

        <div className="pl-ed-table-stack">
          <SofascoreCard
            title="Cinco motores propietarios de PitchLab"
            meta={`${SPACETIME_ENGINES.length} modelos activos`}
          >
            <div
              className="pl-sf-table-wrap"
              tabIndex={0}
              role="region"
              aria-labelledby="pl-ed-engines-caption"
              data-pl-sf-table=""
            >
              <table className="pl-sf-table">
                <caption id="pl-ed-engines-caption" className="sr-only">
                  Arquitectura de los cinco motores Spacetime de PitchLab y su validación fuera de
                  muestra
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pl-sf-th is-sticky-col">
                      Motor
                    </th>
                    <th scope="col" className="pl-sf-th">
                      Qué analiza
                    </th>
                    <th scope="col" className="pl-sf-th is-end num">
                      Evidencia fuera de muestra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SPACETIME_ENGINES.map((engine) => (
                    <tr key={engine.key} className="pl-sf-tr">
                      <th scope="row" className="pl-sf-td is-sticky-col" data-label="Motor">
                        <div className="pl-ed-engine-cell">
                          <span aria-hidden="true" className="pl-ed-engine-mono num">
                            {engine.mono}
                          </span>
                          <div className="pl-ed-engine-meta">
                            <span className="pl-ed-engine-name">
                              {engine.shortName}{" "}
                              <span className="pl-ed-engine-sub num">{engine.version}</span>
                            </span>
                            <span className="pl-ed-engine-sub">{engine.roleLabel}</span>
                            {variant === "page" ? (
                              <span className="pl-ed-engine-sub num">
                                {engine.pillar} · {engine.domain}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </th>
                      <td className="pl-sf-td" data-label="Qué analiza">
                        <p className="pl-ed-engine-reads">{engine.readsText}</p>
                        {variant === "page" ? (
                          <p className="pl-ed-engine-cadence num">{engine.retrainCadence}</p>
                        ) : null}
                      </td>
                      <td className="pl-sf-td is-end num" data-label="Evidencia">
                        <div className="pl-ed-proof-cell">
                          <span
                            className={`pl-ed-proof-fig num${engine.proofTone === "ok" ? " is-ok" : ""}`}
                          >
                            {engine.proofFigure}
                          </span>
                          <span className="pl-ed-proof-ctx num">{engine.proofContext}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pl-ed-table-foot">
              <p className="pl-ed-muted">
                Cifras de la temporada de prueba, con partidos que los motores no usaron para
                aprender. El acierto pasado no garantiza resultados futuros.
              </p>
            </div>
          </SofascoreCard>
        </div>

        <div className="pl-ed-split">
          <div className="pl-ed-table-stack">
            <SofascoreCard title="PitchLab contra un tipster típico" meta="Comparativa directa">
              <div
                className="pl-sf-table-wrap"
                tabIndex={0}
                role="region"
                aria-labelledby="pl-lp-vs-caption"
                data-pl-sf-table=""
              >
                <table className="pl-sf-table">
                  <caption id="pl-lp-vs-caption" className="sr-only">
                    Comparativa entre PitchLab y un tipster típico
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="pl-sf-th is-sticky-col">
                        Criterio
                      </th>
                      <th scope="col" className="pl-sf-th">
                        PitchLab
                      </th>
                      <th scope="col" className="pl-sf-th">
                        Tipster típico
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SPACETIME_VS_TIPSTER_ROWS.map((row) => (
                      <tr key={row.criterion} className="pl-sf-tr">
                        <th scope="row" className="pl-sf-td is-sticky-col" data-label="Criterio">
                          {row.criterion}
                        </th>
                        <td className="pl-sf-td num" data-label="PitchLab">
                          <strong>{row.pitchlab}</strong>
                        </td>
                        <td className="pl-sf-td" data-label="Tipster típico">
                          <span className="pl-ed-muted">{row.tipster}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SofascoreCard>
          </div>

          <SofascoreCard title="Cortex IA lo explica en claro" meta="Cero datos inventados">
            <div className="pl-ed-stack">
              <blockquote className="pl-ed-quote">{CORTEX_SAMPLE_QUOTE}</blockquote>
              <p className="pl-ed-subcopy">
                Solo resume los números que entregan Tachyon, Singularity, Minkowski y Geodesic. Si
                falta un dato clave o una alineación, lo indica explícitamente.
              </p>
              <div className="pl-ed-actions">
                {variant === "teaser" ? (
                  <a className="pl-ed-link-btn" href="/motores">
                    Conoce los motores →
                  </a>
                ) : (
                  <>
                    <a className="pl-ed-link-btn" href="/resultados">
                      Ver resultados FT
                    </a>
                    <a className="pl-ed-link-btn" href="/verificacion">
                      Verificar huella SHA-256
                    </a>
                  </>
                )}
              </div>
            </div>
          </SofascoreCard>
        </div>
      </div>
    </section>
  );
}

function matchesPrecisionBucket(bucketId: string, p: number): boolean {
  switch (bucketId) {
    case "shield":
      return p >= 0.72;
    case "core":
      return p >= 0.6 && p < 0.72;
    case "balanced":
      return p >= 0.5 && p < 0.6;
    case "value":
      return p < 0.5;
    default:
      return false;
  }
}

export function CalibrationCard({
  results,
}: {
  results?: readonly LandingFinishedResultItem[];
} = {}): React.JSX.Element {
  const validResults = (results ?? []).filter(
    (item) => Number.isFinite(item.p) && item.p > 0 && item.p < 1,
  );

  const rows = PRECISION_BUCKETS.map((bucket) => {
    const bandItems =
      validResults.length > 0
        ? validResults.filter((item) => matchesPrecisionBucket(bucket.id, item.p))
        : [];
    if (bandItems.length > 0) {
      const meanP =
        bandItems.reduce((acc, item) => acc + item.p, 0) / bandItems.length;
      const hits = bandItems.filter((item) => item.hit).length;
      const actualRate = hits / bandItems.length;
      return {
        id: bucket.id,
        shortLabel: bucket.shortLabel,
        rangeLabel: bucket.rangeLabel,
        announcedPct: Math.round(meanP * 100),
        actualPct: Math.round(actualRate * 100),
        sampleCount: bandItems.length,
      };
    }

    return {
      id: bucket.id,
      shortLabel: bucket.shortLabel,
      rangeLabel: bucket.rangeLabel,
      announcedPct: Math.round(bucket.promisedMeanP * 100),
      actualPct:
        bucket.actualHitRate !== null ? Math.round(bucket.actualHitRate * 100) : null,
      sampleCount: bucket.auditedPicksCount,
    };
  });

  const hasObserved = rows.some((row) => row.actualPct !== null);
  const hasPending = rows.some((row) => row.actualPct === null);

  return (
    <SofascoreCard
      title="Probabilidad anunciada contra resultado real"
      meta={hasObserved ? `${validResults.length} picks FT` : "Bandas calibradas"}
    >
      <div className="pl-ed-stack">
        <p className="pl-ed-subcopy">
          Si decimos 70 %, esos picks deberían cumplirse cerca de 7 de cada 10 veces.
        </p>

        <div className="pl-ed-calib-bars">
          {rows.map((row) => (
            <div key={row.id} className="pl-ed-calib-row">
              <div className="pl-ed-calib-top">
                <span className="pl-ed-calib-name">{row.shortLabel}</span>
                <span className="pl-ed-calib-nums num">
                  {row.actualPct !== null && row.sampleCount !== null
                    ? `Anunciado ${row.announcedPct} % · Real ${row.actualPct} % (${row.sampleCount})`
                    : `Referencia ${row.announcedPct} % · Pendiente de muestra`}
                </span>
              </div>
              <div className="pl-ed-flat-track" aria-hidden="true">
                <span
                  className="pl-ed-flat-fill"
                  style={{ width: `${row.announcedPct}%` }}
                />
              </div>
              {row.actualPct !== null ? (
                <div className="pl-ed-flat-track" aria-hidden="true">
                  <span
                    className="pl-ed-flat-fill pl-ed-flat-fill--actual"
                    style={{ width: `${row.actualPct}%` }}
                  />
                </div>
              ) : (
                <div className="pl-ed-flat-pending" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        <div className="pl-ed-calib-legend">
          <span className="pl-ed-calib-key">
            <span aria-hidden="true" className="pl-ed-swatch" />
            <span>Anunciado</span>
          </span>
          {hasObserved ? (
            <span className="pl-ed-calib-key">
              <span aria-hidden="true" className="pl-ed-swatch pl-ed-swatch--ok" />
              <span>Real cumplido</span>
            </span>
          ) : null}
          {hasPending ? (
            <span className="pl-ed-calib-key">
              <span aria-hidden="true" className="pl-ed-swatch pl-ed-swatch--dashed" />
              <span>
                {hasObserved
                  ? "Sin muestra en esta banda"
                  : "Real: se publica con los primeros picks auditados"}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </SofascoreCard>
  );
}

export function IntegrityHistorySection({
  results,
  variant = "teaser",
}: {
  results: readonly LandingFinishedResultItem[];
  variant?: "teaser" | "page";
}): React.JSX.Element {
  const shown = results.slice(0, 4);
  const hitsCount = shown.filter((r) => r.hit).length;

  return (
    <section id="historial" className="pl-lp-section">
      <div className="pl-lp-wrap pl-lp-history-grid">
        <div className="pl-lp-history-copy">
          <p className="pl-lp-eyebrow">Historial íntegro</p>
          <h2 className="pl-lp-h2 text-balance">Lo que falló también se queda.</h2>
          <p className="pl-lp-lede text-pretty">
            Cada pick se publica antes del partido y no se edita después. Aquí van los últimos, como quedaron.
          </p>
          {variant === "teaser" ? (
            <a className="pl-lp-more" href="/resultados">
              Ver todos los resultados{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}

          <CalibrationCard results={results} />
        </div>

        <div className="pl-lp-card pl-lp-results-card glass-card glass-ring">
          {shown.length === 0 ? (
            <p className="pl-lp-results-empty text-pretty">
              Los resultados se publican automáticamente al terminar cada encuentro.
            </p>
          ) : (
            <>
              {shown.map((item) => (
                <div key={item.id} className="pl-lp-result-row">
                  <div className="pl-lp-result-main">
                    <p className="pl-lp-result-meta num">{item.metaLabel}</p>
                    <p className="pl-lp-result-score num">{item.scoreLabel}</p>
                    <p className="pl-lp-result-pick num">
                      {item.pickLabel} · {formatPctEs(item.p)} · justo{" "}
                      {item.fairAmerican}
                    </p>
                  </div>
                  <span
                    className={`pl-lp-status ${
                      item.hit ? "pl-lp-status--hit" : "pl-lp-status--miss"
                    }`}
                  >
                    {item.hit ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    )}
                    <span>{item.hit ? "Se cumplió" : "No se cumplió"}</span>
                  </span>
                </div>
              ))}
              <p className="pl-lp-results-foot num">
                Muestra real publicada antes del partido · {hitsCount} de {shown.length} cumplidos
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ParlayDemoCard({
  parlayDemo,
  showLink = true,
}: {
  parlayDemo: LandingParlayDemoData;
  showLink?: boolean;
}): React.JSX.Element {
  return (
    <div className="pl-lp-card pl-lp-panel glass-card glass-ring">
      <div className="pl-lp-card-head">
        <p className="pl-lp-card-title">Tu parlay</p>
        <div className="pl-lp-pill-group">
          {parlayDemo.isExample ? (
            <span className="pl-lp-pill" data-example-badge="">
              Ejemplo
            </span>
          ) : null}
          <span className="pl-lp-pill num">
            {parlayDemo.legs.length} selecciones
          </span>
        </div>
      </div>

      <div className="pl-lp-parlay-legs">
        {parlayDemo.legs.map((leg) => (
          <div
            key={`${leg.matchLabel}-${leg.label}`}
            className="pl-lp-parlay-leg"
          >
            <TeamBadge
              league={leg.league}
              slug={leg.teamSlug}
              name={leg.teamName}
              size={32}
              decorative
            />
            <div className="pl-lp-parlay-leg-copy">
              <p className="pl-lp-parlay-leg-title">{leg.label}</p>
              <p className="pl-lp-parlay-leg-sub">{leg.matchLabel}</p>
            </div>
            <span className="pl-lp-parlay-leg-pct num">
              {formatPctEs(leg.p)}
            </span>
          </div>
        ))}

        <div className="pl-lp-parlay-leg pl-lp-parlay-leg--blocked">
          <span aria-hidden="true" className="pl-lp-ban-circle">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6l12.8 12.8" />
            </svg>
          </span>
          <div className="pl-lp-parlay-leg-copy">
            <p className="pl-lp-parlay-leg-title pl-lp-strike">
              {parlayDemo.blockedLeg.label}
            </p>
            <p className="pl-lp-parlay-leg-conflict">
              Choca con «{parlayDemo.blockedLeg.conflictWithLabel}»
            </p>
          </div>
          <span className="pl-lp-parlay-blocked-tag">Bloqueada</span>
        </div>
      </div>

      <div className="pl-lp-parlay-total">
        <div>
          <p className="pl-lp-parlay-sum-label">Probabilidad combinada</p>
          <p className="pl-lp-parlay-sum-pct num">
            {formatPctEs(parlayDemo.combinedProbability)}
          </p>
        </div>
        <div className="pl-lp-parlay-sum-right">
          <p className="pl-lp-parlay-sum-label">Momio justo</p>
          <p className="pl-lp-parlay-sum-fair num">{parlayDemo.fairAmerican}</p>
        </div>
      </div>

      <p className="pl-lp-parlay-note text-pretty">{parlayDemo.note}</p>

      {showLink ? (
        <a className="pl-lp-more" href="/#que-obtienes">
          Así funciona el armador{" "}
          <span className="pl-lp-arr" aria-hidden="true">
            →
          </span>
        </a>
      ) : null}
    </div>
  );
}

function CommunitySampleCard({
  featuredPick = DEFAULT_FEATURED_COMMUNITY_PICK,
  showLink = true,
  id,
}: {
  featuredPick?: LandingFeaturedCommunityPick;
  showLink?: boolean;
  id?: string;
}): React.JSX.Element {
  const sofia = TIPSTER_CREATORS[0]!;
  const isWashingtonSample = featuredPick.matchLabel
    .toLowerCase()
    .includes("washington");
  const commentText = isWashingtonSample
    ? "Washington llega con la línea más amplia de la semana. El modelo le da margen para cubrir."
    : sofia.weeklyPickThesis;

  return (
    <div
      id={id}
      className="pl-lp-card pl-lp-panel glass-card glass-ring"
    >
      <div className="pl-lp-card-head">
        <p className="pl-lp-card-title">Comunidad de socios</p>
        <span className="pl-lp-pill" data-example-badge="">
          Ejemplo
        </span>
      </div>

      <article className="pl-lp-social-post">
        <span aria-hidden="true" className="pl-lp-social-avatar">
          {sofia.avatarInitials}
        </span>
        <div className="pl-lp-post-body">
          <p className="pl-lp-post-author">
            <strong>{sofia.name}</strong>{" "}
            <span>@{sofia.handle} · Tipster verificada</span>
          </p>
          <p className="pl-lp-post-text text-pretty">{commentText}</p>

          <div className="pl-lp-social-pick">
            <TeamBadge
              league={featuredPick.league}
              slug={featuredPick.teamSlug}
              name={featuredPick.teamName}
              size={32}
              decorative
            />
            <div className="pl-lp-post-pick-main">
              <p className="pl-lp-post-pick-label">{featuredPick.pickLabel}</p>
              <p className="pl-lp-post-pick-match">{featuredPick.matchLabel}</p>
            </div>
            <div className="pl-lp-post-pick-odds">
              <p className="pl-lp-post-pick-pct num">
                {formatPctEs(featuredPick.p)}
              </p>
              <p className="pl-lp-post-pick-fair num">
                justo {featuredPick.fairAmerican}
              </p>
            </div>
          </div>

          <p className="pl-lp-post-stamp num">
            Publicado antes del partido · no se puede editar
          </p>
        </div>
      </article>

      <div className="pl-lp-community-foot">
        <p className="pl-lp-check-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pl-lp-check-icon"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
          <span>Récord de cada tipster calculado por PitchLab, no por ellos.</span>
        </p>
        <p className="pl-lp-check-row">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pl-lp-check-icon"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
          <span>Sin spam: solo escriben socios con su pase activo.</span>
        </p>
        {showLink ? (
          <a className="pl-lp-more" href="/signup">
            Crear cuenta y abrir el tablero{" "}
            <span className="pl-lp-arr" aria-hidden="true">
              →
            </span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ParlaysAndCommunitySection({
  parlayDemo,
  featuredPick,
}: {
  parlayDemo: LandingParlayDemoData;
  featuredPick?: LandingFeaturedCommunityPick;
}): React.JSX.Element {
  return (
    <section id="parlays" className="pl-lp-section">
      <div className="pl-lp-wrap pl-lp-stack">
        <div className="pl-lp-section-head pl-lp-section-head--center">
          <p className="pl-lp-eyebrow">Más allá de un partido</p>
          <h2 className="pl-lp-h2 text-balance">Arma parlays que tengan sentido.</h2>
          <p className="pl-lp-lede text-pretty">
            Combina de 2 a 6 selecciones, también del mismo partido. Si dos se contradicen, no te deja juntarlas.
          </p>
        </div>

        <div className="pl-lp-panels">
          <ParlayDemoCard parlayDemo={parlayDemo} showLink />
          <CommunitySampleCard
            id="comunidad"
            featuredPick={featuredPick}
            showLink
          />
        </div>
      </div>
    </section>
  );
}

export function PricingSection({
  variant = "teaser",
  hasSession = false,
}: {
  variant?: "teaser" | "page";
  hasSession?: boolean;
}): React.JSX.Element {
  const isPage = variant === "page";
  return (
    <section
      id="precio"
      className={isPage ? "pl-lp-section pl-lp-section--top" : "pl-lp-section"}
    >
      {isPage ? (
        <div
          className="pl-lp-wrap pl-lp-pricing-grid"
          style={{ position: "relative", zIndex: 1 }}
        >
          <div className="pl-lp-pricing-copy">
            <p className="pl-lp-eyebrow">Precio</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page text-balance">
              Un solo pase. Todo incluido.
            </h1>
            <p className="pl-lp-lede text-pretty">
              Pase PitchLab Ultra: todos los partidos, todos los mercados, parlays y comunidad. IVA incluido y factura CFDI.
            </p>
            <UltraPassCardStageIsland />
          </div>

          <PricingCardIsland hasSession={hasSession} animated layout="single" />
        </div>
      ) : (
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head pl-lp-section-head--center">
            <p className="pl-lp-eyebrow">Precio</p>
            <h2 className="pl-lp-h2 text-balance">Elige tu plan.</h2>
            <p className="pl-lp-lede text-pretty">
              Un solo pase desbloquea las 7 ligas, los 5 motores y el armador de parlays. IVA incluido y factura CFDI.
            </p>
          </div>

          <PricingCardIsland hasSession={hasSession} layout="compare" />

          <div className="pl-lp-pricing-subfoot">
            <a className="pl-lp-more" href="/precio">
              Ver detalles completos del pase y pago SPEI{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

export function FaqSection({ variant }: { variant?: "landing" } = {}): React.JSX.Element {
  const landing = variant === "landing";
  const items = landing ? [
    ...LANDING_FAQS,
    {
      question: "¿Qué es el momio justo?",
      answer: "Es la cuota que corresponde a la probabilidad estimada por el modelo. Te sirve como referencia para comparar el momio de tu casa.",
      defaultOpen: false,
    },
  ] : LANDING_FAQS;
  return (
    <section id="faq" className="pl-clean-section pl-clean-faq" aria-labelledby="pl-lp-faq-heading">
      <div className="pl-lp-wrap pl-lp-wrap--narrow pl-lp-stack" style={{ gap: 28 }}>
        <div className="pl-lp-section-head pl-lp-section-head--center">
          <h2 id="pl-lp-faq-heading" className="pl-lp-h2 pl-lp-h2--faq text-balance">
            Preguntas frecuentes
          </h2>
        </div>

        <div className="pl-lp-faq-list">
          {items.map((item) => (
            <details
              key={item.question}
              name="pl-lp-faq"
              className="pl-lp-faq pl-lp-faq--card"
              open={item.defaultOpen || undefined}
            >
              <summary>
                <span>{item.question}</span>
                <svg className="pl-clean-chevron" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
                  <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <p className="pl-lp-faq-body text-pretty">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ComoFuncionaPageSurface({
  heroCards,
  hasSession = false,
}: {
  heroCards: readonly LandingHeroLeagueCard[];
  hasSession?: boolean;
}): React.JSX.Element {
  return (
    <PublicSiteShell hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 720 }}>
            <p className="pl-lp-eyebrow">Cómo funciona</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page text-balance">
              Tres números para leer cualquier partido.
            </h1>
            <p className="pl-lp-lede text-pretty">
              En cada encuentro ves qué resultado es más probable según los datos, cuál es su momio justo sin margen y cómo se compara con el momio de tu casa.
            </p>
            <div className="pl-lp-hero-ctas" style={{ marginTop: 8 }}>
              <a className="pl-lp-btn pl-lp-btn-primary" href={hasSession ? "/app" : "/signup"}>
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="pl-lp-btn pl-lp-btn-ghost" href="#comparador">
                Probar el comparador
              </a>
            </div>
          </div>
        </div>
      </section>

      <HowItWorksSection variant="page" />

      <section id="comparador" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-hero-grid">
          <div className="pl-lp-hero-copy">
            <p className="pl-lp-eyebrow">Comparador interactivo</p>
            <h2 className="pl-lp-h2 text-balance">Pon el momio de tu casa frente al justo.</h2>
            <p className="pl-lp-lede text-pretty">
              Acepta formato americano (−200, +150) o decimal (1.50). Al instante calculamos la probabilidad implícita y cuántos puntos paga de más o de menos.
            </p>
          </div>
          <HeroMatchDemoIsland
            cards={heroCards}
            inputId="tu-momio"
            containerId="comparador-card"
            maxLeagues={Math.max(4, heroCards.length)}
          />
        </div>
      </section>

      {heroCards.length > 0 ? (
        <section id="ejemplos-ligas" className="pl-lp-section">
          <div className="pl-lp-wrap pl-lp-stack">
            <div className="pl-lp-section-head">
              <p className="pl-lp-eyebrow">Ligas con datos reales</p>
              <h2 className="pl-lp-h2 text-balance">Un partido real por cada liga activa.</h2>
              <p className="pl-lp-lede text-pretty">
                La misma estructura aplica en fútbol y NFL: resultado más probable del partido, momio justo y mercados derivados.
              </p>
            </div>

            <div className="pl-lp-grid-2">
              {heroCards.map((card) => (
                <article
                  key={card.league}
                  className="pl-lp-card pl-lp-league-example glass-card glass-ring"
                >
                  <div className="pl-lp-match-meta">
                    <span className="pl-lp-inline-league">
                      <LeagueBadge league={card.league} size={18} />
                      <span>{card.roundLabel}</span>
                    </span>
                    <span className="num">{card.whenLabel}</span>
                  </div>

                  <div className="pl-lp-teams">
                    <div className="pl-lp-team">
                      <TeamBadge
                        league={card.league}
                        slug={card.home.slug}
                        name={card.home.name}
                        size={36}
                        decorative
                      />
                      <span className="pl-lp-team-name">{card.home.name}</span>
                    </div>
                    <span className="pl-lp-vs">vs</span>
                    <div className="pl-lp-team pl-lp-team--away">
                      <span className="pl-lp-team-name">{card.away.name}</span>
                      <TeamBadge
                        league={card.league}
                        slug={card.away.slug}
                        name={card.away.name}
                        size={36}
                        decorative
                      />
                    </div>
                  </div>

                  <div className="pl-lp-most-box">
                    <div className="pl-lp-most-copy">
                      <p className="pl-lp-most-kicker">Lo más probable</p>
                      <p className="pl-lp-most-label">{card.mostProbable.label}</p>
                      <p className="pl-lp-most-sub num">
                        Momio justo <strong>{card.mostProbable.fairAmerican}</strong> · decimal{" "}
                        {card.mostProbable.fairDecimal}
                      </p>
                    </div>
                    <p className="pl-lp-most-prob num">
                      {formatPctEs(card.mostProbable.p)}
                    </p>
                  </div>

                  <ProbSplit
                    probabilities={card.splitProbabilities}
                    labels={card.splitLabels}
                    showLabels
                  />
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

const PUBLIC_CALIBRATION_BANDS = [
  { minP: 0, maxP: 0.5 },
  { minP: 0.5, maxP: 0.6 },
  { minP: 0.6, maxP: 0.7 },
  { minP: 0.7, maxP: 0.8 },
  { minP: 0.8, maxP: 1.01 },
] as const;

function computePublicResultsSummary(
  results: readonly LandingFinishedResultItem[],
): {
  total: number;
  hits: number;
  hitRatePct: string | null;
  meanPredictedPct: string | null;
  brierScore: number | null;
  ece: number | null;
  uniqueLeagues: number;
} {
  const valid = results.filter((item) => Number.isFinite(item.p) && item.p > 0 && item.p < 1);
  const total = valid.length;
  const uniqueLeagues = new Set(results.map((item) => item.league)).size;
  if (total === 0) {
    return {
      total: results.length,
      hits: results.filter((item) => item.hit).length,
      hitRatePct: null,
      meanPredictedPct: null,
      brierScore: null,
      ece: null,
      uniqueLeagues,
    };
  }

  let hits = 0;
  let sumP = 0;
  let sumBrier = 0;
  for (const item of valid) {
    const y = item.hit ? 1 : 0;
    hits += y;
    sumP += item.p;
    sumBrier += (item.p - y) ** 2;
  }

  let weightedEce = 0;
  for (const band of PUBLIC_CALIBRATION_BANDS) {
    const inBand = valid.filter((item) => item.p >= band.minP && item.p < band.maxP);
    if (inBand.length === 0) continue;
    const bandHits = inBand.filter((item) => item.hit).length;
    const bandMean = inBand.reduce((acc, item) => acc + item.p, 0) / inBand.length;
    weightedEce += (inBand.length / total) * Math.abs(bandHits / inBand.length - bandMean);
  }

  return {
    total,
    hits,
    hitRatePct: ((hits / total) * 100).toFixed(1),
    meanPredictedPct: ((sumP / total) * 100).toFixed(1),
    brierScore: Math.round((sumBrier / total) * 1000) / 1000,
    ece: Math.round(weightedEce * 1000) / 1000,
    uniqueLeagues,
  };
}

export function MotoresPageSurface({
  hasSession = false,
}: {
  hasSession?: boolean;
} = {}): React.JSX.Element {
  return (
    <PublicSiteShell activePath="/motores" hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top">
        <div className="pl-lp-wrap pl-ed-page-head">
          <div className="pl-ed-head-copy">
            <p className="pl-ed-eyebrow">Motores Spacetime</p>
            <h1 className="pl-ed-title">
              Cinco motores. Cada uno probado con partidos que no vio.
            </h1>
            <p className="pl-ed-lede">
              Cada motor cumple una tarea distinta: medir fuerza deportiva pura, cruzarla con el
              mercado sin margen, filtrar ventaja real y explicarla en lenguaje claro.
            </p>
            <div className="pl-ed-actions">
              <a
                className="pl-ed-link-btn pl-ed-link-btn--primary"
                href={hasSession ? "/app" : "/signup"}
              >
                Probar 7 días gratis →
              </a>
              <a className="pl-ed-link-btn" href="/resultados">
                Ver resultados publicados
              </a>
              <a className="pl-ed-link-btn" href="/verificacion">
                Verificar recibo SHA-256
              </a>
            </div>
          </div>
        </div>
      </section>

      <EnginesSection variant="page" />

      <section id="calibracion" className="pl-lp-section">
        <div className="pl-lp-wrap pl-ed-split pl-ed-split--even">
          <div className="pl-ed-stack">
            <p className="pl-ed-eyebrow">Calibración</p>
            <h2 className="pl-ed-h2">La probabilidad anunciada se mide contra la realidad.</h2>
            <p className="pl-ed-lede">
              {SPACETIME_METRICS_HEADLINE.retrainSchedule}. En{" "}
              <span className="num">{SPACETIME_METRICS_HEADLINE.activeLeaguesCount}</span> ligas
              activas publicamos de{" "}
              <span className="num">{SPACETIME_METRICS_HEADLINE.picksPerMatchRange}</span> picks
              estructurados por partido.
            </p>
            <div className="pl-ed-actions">
              <a className="pl-ed-link-btn" href="/resultados">
                Explorar tabla pública FT
              </a>
              <a className="pl-ed-link-btn" href="/verificacion">
                Abrir verificador SHA-256
              </a>
            </div>
          </div>
          <CalibrationCard />
        </div>
      </section>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

export function ResultadosPageSurface({
  results,
  hasSession = false,
}: {
  results: readonly LandingFinishedResultItem[];
  hasSession?: boolean;
}): React.JSX.Element {
  const stats = computePublicResultsSummary(results);
  const kpiItems: SofascoreKpiItem[] = [
    {
      id: "settled",
      label: "Partidos FT auditados",
      value: String(stats.total),
      delta: `${stats.uniqueLeagues} ${stats.uniqueLeagues === 1 ? "liga" : "ligas"}`,
    },
    {
      id: "hit-rate",
      label: "Tasa cumplida",
      value: stats.hitRatePct !== null ? `${stats.hitRatePct} %` : "—",
      delta: stats.meanPredictedPct !== null ? `Est. ${stats.meanPredictedPct} %` : undefined,
      tone: "positive",
    },
    {
      id: "ece-brier",
      label: "ECE · Brier",
      value:
        stats.ece !== null
          ? `${(stats.ece * 100).toFixed(1)} pp`
          : SPACETIME_METRICS_HEADLINE.calibrationError,
      delta: stats.brierScore !== null ? `Brier ${stats.brierScore.toFixed(3)}` : "Prueba 2024–25",
    },
    {
      id: "clv",
      label: "CLV fuera de muestra",
      value: SPACETIME_METRICS_HEADLINE.closingLineBeatPct,
      delta: `${SPACETIME_METRICS_HEADLINE.holdoutTestMatches} partidos`,
      tone: "brand",
    },
  ];

  return (
    <PublicSiteShell activePath="/resultados" hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top">
        <div className="pl-lp-wrap pl-ed-stack">
          <div className="pl-ed-page-head">
            <div className="pl-ed-head-row">
              <div className="pl-ed-head-copy">
                <p className="pl-ed-eyebrow">Historial íntegro</p>
                <h1 className="pl-ed-title">Lo que falló también se queda.</h1>
                <p className="pl-ed-lede">
                  Cada pick queda registrado antes del inicio del partido y se califica con el
                  marcador oficial al terminar. Nada se borra ni se edita después.
                </p>
              </div>
              <div className="pl-ed-actions">
                <a className="pl-ed-link-btn pl-ed-link-btn--primary" href="/verificacion">
                  Verificar recibo SHA-256 →
                </a>
                <a className="pl-ed-link-btn" href="/motores">
                  Cómo calculamos
                </a>
              </div>
            </div>

            <SofascoreKpiStrip items={kpiItems} className="pl-ed-kpi-4" />
          </div>

          <ResultadosEditorialBoard results={results} />

          <div className="pl-ed-callout">
            <div className="pl-ed-callout-copy">
              <h2 className="pl-ed-h3">Auditoría criptográfica local (SHA-256)</h2>
              <p className="pl-ed-subcopy">
                Comprueba directamente en tu navegador que un recibo registrado antes del partido
                coincide con su huella SHA-256, sin enviar datos privados a ningún servidor.
              </p>
            </div>
            <a className="pl-ed-link-btn" href="/verificacion">
              Abrir verificador local →
            </a>
          </div>

          {results.length > 0 ? (
            <CalibrationCurveChart
              samples={results.map((r) => ({ p: r.p, hit: r.hit }))}
              title="Curva de calibración observada"
              subtitle="Comparación directa entre la probabilidad publicada antes del partido y el porcentaje real cumplido."
            />
          ) : null}

          <CalibrationHonestyLab settledCount={results.length} />
          <CalibrationCard results={results} />
        </div>
      </section>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

const PARLAY_CONFLICT_EXAMPLES: ReadonlyArray<{
  firstSelection: string;
  secondSelection: string;
  rule: string;
}> = [
  {
    firstSelection: "Local gana / Local o empate",
    secondSelection: "Visitante gana",
    rule: "Bloqueado: resultados de lado opuesto en el mismo partido",
  },
  {
    firstSelection: "Más de 2.5 goles",
    secondSelection: "Menos de 2.5 goles",
    rule: "Bloqueado: totales opuestos sobre el mismo marcador",
  },
  {
    firstSelection: "Ambos anotan: Sí",
    secondSelection: "Ambos anotan: No",
    rule: "Bloqueado: condiciones mutuamente excluyentes",
  },
  {
    firstSelection: "2 selecciones del mismo partido",
    secondSelection: "3.ª selección del mismo partido",
    rule: "Bloqueado: máximo 2 selecciones compatibles por partido (SGP)",
  },
];

export function ParlaysPageSurface({
  parlayDemo,
  hasSession = false,
}: {
  parlayDemo: LandingParlayDemoData;
  hasSession?: boolean;
}): React.JSX.Element {
  return (
    <PublicSiteShell hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 720 }}>
            <p className="pl-lp-eyebrow">Armador de parlays</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page text-balance">
              Arma parlays que tengan sentido.
            </h1>
            <p className="pl-lp-lede text-pretty">
              Combina de 2 a 6 selecciones entre distintas ligas o hasta 2 selecciones compatibles del mismo partido, con probabilidad conjunta ajustada por correlación.
            </p>
            <div className="pl-lp-hero-ctas" style={{ marginTop: 8 }}>
              <a className="pl-lp-btn pl-lp-btn-primary" href="/app/parlays">
                Abrir el armador{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-pricing-grid">
          <div className="pl-lp-pricing-copy">
            <p className="pl-lp-eyebrow">Correlación y reglas</p>
            <h2 className="pl-lp-h2 text-balance">De 2 a 6 selecciones, sin contradicciones.</h2>
            <p className="pl-lp-lede text-pretty">
              Cuando juntas dos mercados del mismo encuentro, sus probabilidades no son independientes. Geodesic ajusta la probabilidad combinada y bloquea choques lógicos antes de armar tu boleto.
            </p>
          </div>
          <ParlayDemoCard parlayDemo={parlayDemo} showLink={false} />
        </div>
      </section>

      <section id="choques-logicos" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Protección lógica</p>
            <h2 className="pl-lp-h2 text-balance">Choques que el armador bloquea en automático.</h2>
          </div>

          <div className="pl-lp-card pl-lp-table-card glass-card glass-ring">
            <div
              className="pl-lp-table-scroll"
              tabIndex={0}
              role="region"
              aria-labelledby="pl-lp-conflicts-caption"
            >
              <table className="pl-lp-vs-table">
                <caption id="pl-lp-conflicts-caption">
                  Reglas de compatibilidad en el mismo partido
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Selección en tu parlay</th>
                    <th scope="col">Selección que intentas sumar</th>
                    <th scope="col">Respuesta del motor</th>
                  </tr>
                </thead>
                <tbody>
                  {PARLAY_CONFLICT_EXAMPLES.map((row) => (
                    <tr key={row.firstSelection}>
                      <th scope="row">{row.firstSelection}</th>
                      <td>{row.secondSelection}</td>
                      <td>{row.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

export function ComunidadPageSurface({
  featuredPick,
  hasSession = false,
}: {
  featuredPick?: LandingFeaturedCommunityPick;
  hasSession?: boolean;
}): React.JSX.Element {
  const commissionPct = TIPSTER_CREATORS[0]?.commissionPct ?? 25;
  const promoFreeDays = TIPSTER_CREATORS[0]?.freeDays ?? 5;

  return (
    <PublicSiteShell hasSession={hasSession}>
      <section className="pl-lp-section pl-lp-section--top">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 740 }}>
            <p className="pl-lp-eyebrow">Comunidad de socios</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page text-balance">
              Récord calculado por PitchLab, nunca por quien publica.
            </h1>
            <p className="pl-lp-lede text-pretty">
              Solo escriben socios con su pase activo. Cada publicación queda registrada antes del partido y no acepta enlaces externos ni grupos de spam.
            </p>
            <div className="pl-lp-hero-ctas" style={{ marginTop: 8 }}>
              <a className="pl-lp-btn pl-lp-btn-primary" href={hasSession ? "/app" : "/signup"}>
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="pl-lp-btn pl-lp-btn-ghost" href="#tipsters">
                ¿Eres tipster?
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Vista previa de publicaciones</p>
            <h2 className="pl-lp-h2 text-balance">Conversación limpia, centrada en el partido.</h2>
            <p className="pl-lp-lede text-pretty">
              Las publicaciones y perfiles de abajo son ejemplos demostrativos de cómo se ve el muro de socios en PitchLab.
            </p>
          </div>

          <div className="pl-lp-panels">
            <CommunitySampleCard featuredPick={featuredPick} showLink={false} />

            <div className="pl-lp-card pl-lp-panel glass-card glass-ring">
              <div className="pl-lp-card-head">
                <p className="pl-lp-card-title">Muro de comunidad</p>
                <span className="pl-lp-pill" data-example-badge="">
                  Ejemplo
                </span>
              </div>
              <div className="pl-lp-feed-list">
                {INITIAL_SOCIAL_POSTS.slice(0, 3).map((post) => (
                  <article key={post.id} className="pl-lp-feed-item">
                    <div className="pl-lp-feed-item-head">
                      <p className="pl-lp-post-author">
                        <strong>{post.authorName}</strong>{" "}
                        <span>
                          @{post.authorHandle} · {post.roleBadge}
                        </span>
                      </p>
                      <span className="pl-lp-pill" data-example-badge="">
                        Ejemplo
                      </span>
                    </div>
                    <p className="pl-lp-post-text text-pretty">{post.body}</p>
                    <p className="pl-lp-post-stamp num">
                      {post.leagueLabel} · {post.pickBadge} · {post.verifiedRecord}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tipsters" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Programa Tipster Oficial</p>
            <h2 className="pl-lp-h2 text-balance">
              ¿Tienes comunidad deportiva? Audita tu récord con nosotros.
            </h2>
            <p className="pl-lp-lede text-pretty">
              Los Tipsters Oficiales comparten 1 pick abierto por semana, regalan{" "}
              <span className="num">{promoFreeDays}</span> días de prueba con su código y reciben{" "}
              <span className="num">{commissionPct} %</span> de comisión recurrente por cada referido con pase activo.
            </p>
          </div>

          <div className="pl-lp-grid-3">
            {TIPSTER_CREATORS.map((creator) => (
              <article
                key={creator.handle}
                className="pl-lp-card pl-lp-tipster-card glass-card glass-ring"
              >
                <div className="pl-lp-card-head">
                  <div className="pl-lp-tipster-id">
                    <span aria-hidden="true" className="pl-lp-social-avatar">
                      {creator.avatarInitials}
                    </span>
                    <div className="pl-lp-engine-titles">
                      <p className="pl-lp-engine-name">{creator.name}</p>
                      <p className="pl-lp-post-stamp">@{creator.handle}</p>
                    </div>
                  </div>
                  <span className="pl-lp-pill" data-example-badge="">
                    Ejemplo
                  </span>
                </div>
                <p className="pl-lp-post-text text-pretty">{creator.specialty}</p>
                <p className="pl-lp-post-stamp num">
                  Unidades verificadas: <strong>{creator.verifiedUnits}</strong> · Ventaja{" "}
                  {creator.clvAvg} · {creator.settledCount} picks calificados
                </p>
              </article>
            ))}
          </div>

          <div>
            <a className="pl-lp-btn pl-lp-btn-primary" href="/signup">
              Crear cuenta y solicitar perfil Tipster{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </section>

      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}

export interface PrecioTransferRequestSummary {
  id: string;
  planInterval: "monthly" | "annual";
  amountCentavosMxn: number;
  reportedAmountCentavosMxn: number | null;
  amountMismatch: boolean;
  referralDiscountApplied: boolean;
  referenceCode: string;
  originBank: string | null;
  receiptReference: string | null;
  payerName: string | null;
  transferDate: string | null;
  userNote: string | null;
  status: "pending_review" | "approved" | "rejected" | "canceled";
  rejectionReason: string | null;
  reviewedAtIso: string | null;
  couponExpiresAtIso: string | null;
  couponRedeemedAtIso: string | null;
  awaitingCouponRedemption: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PrecioTransferContext {
  paymentMode: "transfer" | "stripe";
  accountsEnabled: boolean;
  viewerState: "guest" | "incomplete_signup" | "member" | "beta_preview";
  memberHandle: string | null;
  speiReferenceCode: string | null;
  bank: {
    configured: boolean;
    bank: string | null;
    beneficiary: string | null;
    clabe: string | null;
    clabeMasked: string | null;
    instructions: string | null;
    supportEmail: string;
  } | null;
  quotes: {
    monthlyCentavos: number;
    annualCentavos: number;
    referralDiscountApplied: boolean;
  };
  activePending: PrecioTransferRequestSummary | null;
  latestApproved: PrecioTransferRequestSummary | null;
  latestRejected: PrecioTransferRequestSummary | null;
  activePass: boolean;
}

export function PrecioPageSurface({
  hasSession = false,
  transferContext,
}: {
  hasSession?: boolean;
  transferContext?: PrecioTransferContext;
} = {}): React.JSX.Element {
  const effectiveContext: PrecioTransferContext = transferContext ?? {
    paymentMode: "transfer",
    accountsEnabled: true,
    viewerState: "guest",
    memberHandle: null,
    speiReferenceCode: null,
    bank: null,
    quotes: {
      monthlyCentavos: MEMBERSHIP_SPEC.monthlyMxn * 100,
      annualCentavos: MEMBERSHIP_SPEC.annualMxn * 100,
      referralDiscountApplied: false,
    },
    activePending: null,
    latestApproved: null,
    latestRejected: null,
    activePass: false,
  };

  return (
    <PublicSiteShell activePath="/precio" hasSession={hasSession} className="pl-lp--precio">
      <PricingSection variant="page" hasSession={hasSession} />

      <SpeiTransferPricingIsland context={effectiveContext} />

      <section id="referidos" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Programa de referidos</p>
            <h2 className="pl-lp-h2 text-balance">Invita a tus amigos y los dos suman días.</h2>
            <p className="pl-lp-lede text-pretty">
              Cuando un amigo entra con tu código y paga su primer mes, los dos suman{" "}
              {MEMBERSHIP_SPEC.referralBothRewardDays} días en su pase.
            </p>
          </div>

          <ol className="pl-lp-steps">
            <li>
              <span className="pl-lp-step-idx num">01</span>
              <p className="pl-lp-step-fig num">7 días</p>
              <div className="pl-lp-step-body">
                <h3 className="pl-lp-step-title text-balance">Tu invitado prueba y ahorra</h3>
                <p className="pl-lp-step-desc text-pretty">
                  Recibe {MEMBERSHIP_SPEC.referralFriendBenefit}.
                </p>
              </div>
            </li>
            <li>
              <span className="pl-lp-step-idx num">02</span>
              <p className="pl-lp-step-fig pl-lp-step-fig--ok num">
                +{MEMBERSHIP_SPEC.referralBothRewardDays} días
              </p>
              <div className="pl-lp-step-body">
                <h3 className="pl-lp-step-title text-balance">Los dos suman tiempo</h3>
                <p className="pl-lp-step-desc text-pretty">
                  Al activar su primer mes pagado, los dos suman{" "}
                  {MEMBERSHIP_SPEC.referralBothRewardDays} días sin costo adicional.
                </p>
              </div>
            </li>
            <li>
              <span className="pl-lp-step-idx num">03</span>
              <p className="pl-lp-step-fig num">
                +{MEMBERSHIP_SPEC.referralAmbassadorBonusDays} días
              </p>
              <div className="pl-lp-step-body">
                <h3 className="pl-lp-step-title text-balance">Nivel Embajador</h3>
                <p className="pl-lp-step-desc text-pretty">
                  Al llegar a {MEMBERSHIP_SPEC.referralAmbassadorThreshold} amigos activos, sumas{" "}
                  {MEMBERSHIP_SPEC.referralAmbassadorBonusDays} días adicionales en tu cuenta.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <FaqSection />
      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}
