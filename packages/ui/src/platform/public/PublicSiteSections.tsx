import React from "react";
import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
import { BrandLogo, Mascot } from "../../primitives";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
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
  PublicNavBarClient,
  ResultsFilterListIsland,
} from "./LandingClientIslands";

export type PublicNavPath =
  | "/"
  | "/como-funciona"
  | "/motores"
  | "/resultados"
  | "/parlays"
  | "/comunidad"
  | "/precio";

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
  asLeagueId("ncaaf"),
  asLeagueId("nhl"),
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
  ncaaf: "NCAAF",
  nhl: "NHL",
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
  const projVal = side === "home" ? game.projection.home : game.projection.away;
  if (game.sport === "american-football") {
    return `${side === "home" ? "Local" : "Visitante"} · proy. ${projVal.toFixed(1)} pts`;
  }
  return `${side === "home" ? "Local" : "Visitante"} · proy. ${projVal.toFixed(1)} goles`;
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
    const chosen: Array<{ label: string; p: number; fairAmerican: string }> = [];
    const seenMarkets = new Set<string>();

    for (const row of filtered) {
      const key = `${row.market}:${row.label}`;
      if (seenMarkets.has(key)) continue;
      if (chosen.some((item) => item.label === formatTypographicMinus(row.label))) continue;
      seenMarkets.add(key);
      chosen.push({
        label: formatTypographicMinus(row.label),
        p: row.p,
        fairAmerican: formatFairAmericanFromProb(row.p),
      });
      if (chosen.length >= 3) return chosen;
    }
  }

  const [pHome, pDraw, pAway] = game.x12;
  const fallbackRows: Array<{ label: string; p: number }> = [];

  if (game.sport === "american-football" || game.league === "nfl") {
    const margin = game.projection.home - game.projection.away;
    const pointsModel = buildPointsModel(game.projection.total, margin, pHome);
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
          label: `${useOver ? "Más" : "Menos"} de ${totalHalf} puntos`,
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
          label: `${favIsHome ? homeName : awayName} más de ${favTeamHalf} pts`,
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
  if (leagueGames.length === 0) return undefined;
  const upcoming = leagueGames.filter((game) => game.status !== "FT");
  const pool = upcoming.length > 0 ? upcoming : leagueGames;

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

/**
 * Construye las tarjetas interactivas del Hero y de `/como-funciona`.
 * Regla del fundador: «Lo más probable» es el resultado con mayor `p` del grupo `h2h`,
 * y su momio justo es `1 / p` en americano (con signo `−` tipográfico o `+`) y decimal.
 */
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
    if (!chosen) continue;

    const summary = summaryByLeague.get(league);
    const homeName = teamDisplayName(chosen.home);
    const awayName = teamDisplayName(chosen.away);
    const isNfl = chosen.sport === "american-football" || chosen.league === "nfl";

    const [rawHome, rawDraw, rawAway] = chosen.x12;
    const splitProbabilities = isNfl
      ? [rawHome, rawAway]
      : [rawHome, rawDraw, rawAway];
    const splitLabels = isNfl
      ? [homeName, awayName]
      : [homeName, "Empate", awayName];

    const h2hCandidates = isNfl
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

/**
 * Califica los partidos finalizados (`FT`) con su marcador final y su pick principal publicado.
 */
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
  let conflictGroup: PickConflictGroup = "home_side";
  let label = `${homeName} gana`;
  let p = game.x12[0];

  switch (referenceLeg.conflictGroup) {
    case "away_side":
      conflictGroup = "home_side";
      label = `${homeName} gana`;
      p = game.x12[0];
      break;
    case "home_side":
      conflictGroup = "away_side";
      label = `${awayName} gana`;
      p = game.x12[2];
      break;
    case "draw_side":
      conflictGroup = game.x12[0] >= game.x12[2] ? "home_side" : "away_side";
      label =
        conflictGroup === "home_side" ? `${homeName} gana` : `${awayName} gana`;
      p = conflictGroup === "home_side" ? game.x12[0] : game.x12[2];
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
      p = game.x12[2];
      break;
  }

  return {
    ...referenceLeg,
    id: `${game.id}-opposing-demo`,
    conflictGroup,
    label,
    p,
    fairDecimal: Number(formatFairDecimalFromProb(p)),
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
    engineName: "PitchLab Singularity v3.0",
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

/**
 * Construye la demostración del armador de parlays usando `checkParlayCompatibility` y
 * `computeParlaySummary` sobre un partido próximo real con 2 picks compatibles + 1 opuesto bloqueado.
 */
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
      const favTeam = game.x12[2] > game.x12[0] ? game.away : game.home;

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

/**
 * Selecciona el pick ligero de muestra para la publicación de Sofía Méndez en Comunidad.
 */
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
    games.find((g) => g.league === "nfl" && g.status !== "FT") ??
    games.find((g) => g.league === "nfl") ??
    games.find((g) => g.status !== "FT");

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

  return DEFAULT_FEATURED_COMMUNITY_PICK;
}

export function PublicSiteShell({
  activePath,
  children,
  hasSession = false,
}: {
  activePath?: PublicNavPath;
  hasSession?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="pl-stage pl-lp">
      <a className="skip-link" href="#main">
        Saltar al contenido principal
      </a>
      <PublicNavBarClient activePath={activePath} hasSession={hasSession} />
      <main id="main">{children}</main>
      <footer className="pl-lp-footer">
        <div className="pl-lp-wrap pl-lp-footer-inner">
          <div className="pl-lp-footer-brand">
            <BrandLogo variant="horizontal" width={113} height={22} alt="PitchLab" />
            <p className="pl-lp-footer-legal">
              Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.
            </p>
          </div>
          <nav aria-label="Pie" className="pl-lp-footer-nav">
            <a href="/blog">Blog</a>
            <a href="/legal/terminos">Términos</a>
            <a href="/legal/privacidad">Aviso de privacidad</a>
            <a href="/legal/juego-responsable">Juego responsable</a>
            <a href="/comunidad#tipsters">¿Eres tipster?</a>
            <a href="/legal/creditos">Créditos</a>
          </nav>
        </div>
      </footer>
    </div>
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
          <h2 className="pl-lp-h2">Tres números, en este orden.</h2>
          <p className="pl-lp-lede">
            Siempre igual en cada partido, para que lo leas en segundos.
          </p>
        </div>

        <ol className="pl-lp-steps">
          <li>
            <span className="pl-lp-step-idx num">01</span>
            <p className="pl-lp-step-fig pl-lp-step-fig--ok num">72.3 %</p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">La probabilidad</h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--pl-text-secondary)",
                  lineHeight: 1.5,
                  fontSize: 15,
                }}
              >
                Qué tan seguido pasaría ese resultado si el partido se jugara muchas veces, según el modelo.
              </p>
            </div>
          </li>

          <li>
            <span className="pl-lp-step-idx num">02</span>
            <p className="pl-lp-step-fig num">−261</p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">El momio justo</h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--pl-text-secondary)",
                  lineHeight: 1.5,
                  fontSize: 15,
                }}
              >
                Lo que debería pagar ese resultado sin el margen de la casa. Es la probabilidad escrita como momio.
              </p>
            </div>
          </li>

          <li>
            <span className="pl-lp-step-idx num">03</span>
            <p className="pl-lp-step-fig num">
              −200{" "}
              <span style={{ fontSize: "0.48em", color: "var(--pl-success)" }}>
                +5.6 pts
              </span>
            </p>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">Tu momio contra el justo</h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--pl-text-secondary)",
                  lineHeight: 1.5,
                  fontSize: 15,
                }}
              >
                Escribe el momio de tu casa y ves si paga más o menos que lo justo. La decisión y el monto son tuyos.
              </p>
            </div>
          </li>
        </ol>

        {variant === "teaser" ? (
          <a
            className="pl-lp-more"
            href="/como-funciona"
            style={{ alignSelf: "center" }}
          >
            Ver cómo funciona, paso a paso{" "}
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
  return (
    <section id="motores" className="pl-lp-section" style={{ overflow: "hidden" }}>
      <div className="pl-lp-atmo" aria-hidden="true">
        <div className="pl-lp-orb pl-lp-orb--engines" />
      </div>

      <div className="pl-lp-wrap pl-lp-stack">
        <div className="pl-lp-engines-head">
          <div className="pl-lp-section-head" style={{ maxWidth: 640 }}>
            <p className="pl-lp-eyebrow">Los motores</p>
            <h2 className="pl-lp-h2">
              {variant === "page"
                ? "Arquitectura y pruebas fuera de muestra."
                : "Cinco motores. Cada uno probado con partidos que no vio."}
            </h2>
            <p className="pl-lp-lede">
              Un tipster opina. Aquí cada pick sale de un motor que se probó contra el mercado antes de publicarse, y su prueba está a la vista.
            </p>
          </div>

          <dl className="pl-lp-kpis">
            <div>
              <dt>Partidos históricos en los motores</dt>
              <dd className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</dd>
            </div>
            <div>
              <dt>Variables por partido</dt>
              <dd className="num">{SPACETIME_METRICS_HEADLINE.variablesPerMatch}</dd>
            </div>
            <div>
              <dt>Datos posteriores al partido</dt>
              <dd>{SPACETIME_METRICS_HEADLINE.postMatchData}</dd>
            </div>
            {variant === "page" ? (
              <>
                <div>
                  <dt>Registros normalizados</dt>
                  <dd className="num">{SPACETIME_METRICS_HEADLINE.telemetryPoints}</dd>
                </div>
                <div>
                  <dt>Error de calibración</dt>
                  <dd className="num">{SPACETIME_METRICS_HEADLINE.calibrationError}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        <div className="pl-lp-card pl-lp-engines-card glass-card glass-ring">
          {SPACETIME_ENGINES.map((engine) => (
            <div key={engine.key} className="pl-lp-engine-row">
              <div className="pl-lp-engine-id">
                <span aria-hidden="true" className="pl-lp-engine-mono">
                  {engine.mono}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
                    {engine.shortName}{" "}
                    <span
                      className="num"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--pl-text-muted)",
                      }}
                    >
                      {engine.version}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 13,
                      color: "var(--pl-brand)",
                    }}
                  >
                    {engine.roleLabel}
                  </p>
                  {variant === "page" ? (
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 12,
                        color: "var(--pl-text-muted)",
                      }}
                    >
                      {engine.pillar} · {engine.domain}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="pl-lp-engine-reads">
                {engine.readsText}
                {variant === "page" ? ` ${engine.retrainCadence}` : ""}
              </p>

              <div className="pl-lp-engine-proof">
                <p
                  className="num"
                  style={{
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color:
                      engine.proofTone === "ok"
                        ? "var(--pl-success)"
                        : "var(--pl-text)",
                  }}
                >
                  {engine.proofFigure}
                </p>
                <p
                  className="num"
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "var(--pl-text-muted)",
                  }}
                >
                  {engine.proofContext}
                </p>
              </div>
            </div>
          ))}
          <p
            style={{
              margin: 0,
              padding: "16px 0",
              fontSize: 12,
              color: "var(--pl-text-muted)",
            }}
          >
            Cifras de la temporada de prueba, con partidos que los motores no usaron para aprender. El acierto pasado no garantiza resultados.
          </p>
        </div>

        <div className="pl-lp-engines-split">
          <div className="pl-lp-card pl-lp-table-card glass-card glass-ring">
            <div
              className="pl-lp-table-scroll"
              tabIndex={0}
              role="region"
              aria-labelledby="pl-lp-vs-caption"
            >
              <table className="pl-lp-vs-table">
                <caption id="pl-lp-vs-caption">
                  PitchLab contra un tipster típico
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Criterio</span>
                    </th>
                    <th scope="col">PitchLab</th>
                    <th scope="col">Tipster típico</th>
                  </tr>
                </thead>
                <tbody>
                  {SPACETIME_VS_TIPSTER_ROWS.map((row) => (
                    <tr key={row.criterion}>
                      <th scope="row">{row.criterion}</th>
                      <td>{row.pitchlab}</td>
                      <td>{row.tipster}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pl-lp-card pl-lp-cortex-card glass-card glass-ring">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
                Cortex IA lo explica en claro
              </p>
              <p
                style={{
                  margin: 0,
                  color: "var(--pl-text-secondary)",
                  lineHeight: 1.55,
                  fontSize: 15,
                }}
              >
                {CORTEX_SAMPLE_QUOTE}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--pl-text-muted)",
                }}
              >
                Solo usa números de los motores. Si falta un dato, lo dice.
              </p>
            </div>
            {variant === "teaser" ? (
              <a className="pl-lp-more" href="/motores">
                Conoce los motores{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CalibrationCard(): React.JSX.Element {
  return (
    <div
      className="pl-lp-card pl-lp-calib-card glass-card glass-ring"
      style={{ marginTop: 8 }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>
        Probabilidad anunciada contra resultado real
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "var(--pl-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Si decimos 70 %, esos picks deberían cumplirse cerca de 7 de cada 10 veces.
      </p>

      {PRECISION_BUCKETS.map((bucket) => (
        <div key={bucket.id} className="pl-lp-calib-row">
          <span style={{ color: "var(--pl-text-secondary)" }}>
            {bucket.shortLabel}
          </span>
          <div className="pl-lp-calib-bars">
            <div className="pl-lp-calib-bar" aria-hidden="true">
              <div
                className="pl-lp-calib-fill"
                style={{ width: `${Math.round(bucket.promisedMeanP * 100)}%` }}
              />
            </div>
            {bucket.actualHitRate !== null ? (
              <div className="pl-lp-calib-bar" aria-hidden="true">
                <div
                  className="pl-lp-calib-fill"
                  style={{
                    width: `${Math.round(bucket.actualHitRate * 100)}%`,
                    background: "var(--pl-success)",
                  }}
                />
              </div>
            ) : (
              <div className="pl-lp-calib-dashed" aria-hidden="true" />
            )}
          </div>
        </div>
      ))}

      <div className="pl-lp-calib-legend">
        <span className="pl-lp-row" style={{ gap: 6 }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 8,
              borderRadius: 3,
              background: "var(--pl-text-muted)",
            }}
          />
          Anunciado
        </span>
        <span className="pl-lp-row" style={{ gap: 6 }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 8,
              borderRadius: 3,
              border: "1px dashed var(--pl-border-strong)",
            }}
          />
          Real: se publica con los primeros picks auditados
        </span>
      </div>
    </div>
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
          <h2 className="pl-lp-h2">Lo que falló también se queda.</h2>
          <p className="pl-lp-lede">
            Cada pick se publica antes del partido y no se edita después. Aquí van los últimos, como quedaron.
          </p>
          {variant === "teaser" ? (
            <a
              className="pl-lp-more"
              href="/resultados"
              style={{ alignSelf: "flex-start" }}
            >
              Ver todos los resultados{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}

          <CalibrationCard />
        </div>

        <div className="pl-lp-card pl-lp-results-card glass-card glass-ring">
          {shown.length === 0 ? (
            <p className="pl-lp-fine" style={{ padding: "20px 0" }}>
              Los resultados se publican automáticamente al terminar cada encuentro.
            </p>
          ) : (
            <>
              {shown.map((item) => (
                <div key={item.id} className="pl-lp-result-row">
                  <div style={{ minWidth: 0 }}>
                    <p
                      className="num"
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "var(--pl-text-muted)",
                      }}
                    >
                      {item.metaLabel}
                    </p>
                    <p
                      className="num"
                      style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}
                    >
                      {item.scoreLabel}
                    </p>
                    <p
                      className="num"
                      style={{
                        margin: "4px 0 0",
                        fontSize: 14,
                        color: "var(--pl-text-secondary)",
                      }}
                    >
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
              <p
                className="num"
                style={{
                  margin: 0,
                  padding: "16px 0",
                  fontSize: 13,
                  color: "var(--pl-text-muted)",
                }}
              >
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
      <div className="pl-lp-row pl-lp-row--between">
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Tu parlay</p>
        <div className="pl-lp-row" style={{ gap: 8 }}>
          {parlayDemo.isExample ? (
            <span className="pl-lp-pill" data-example-badge="">
              Ejemplo
            </span>
          ) : null}
          <span className="pl-lp-pill">
            {parlayDemo.legs.length} selecciones
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
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
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{leg.label}</p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--pl-text-muted)",
                }}
              >
                {leg.matchLabel}
              </p>
            </div>
            <span className="num" style={{ fontWeight: 700 }}>
              {formatPctEs(leg.p)}
            </span>
          </div>
        ))}

        <div className="pl-lp-parlay-leg pl-lp-parlay-leg--blocked">
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              border: "1px solid var(--pl-border-strong)",
              color: "var(--pl-text-muted)",
            }}
          >
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
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                textDecoration: "line-through",
              }}
            >
              {parlayDemo.blockedLeg.label}
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: "var(--pl-text-secondary)",
              }}
            >
              Choca con «{parlayDemo.blockedLeg.conflictWithLabel}»
            </p>
          </div>
          <span style={{ fontSize: 12, color: "var(--pl-text-muted)" }}>
            Bloqueada
          </span>
        </div>
      </div>

      <div className="pl-lp-parlay-total">
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--pl-text-muted)",
            }}
          >
            Probabilidad combinada
          </p>
          <p
            className="num"
            style={{
              margin: "4px 0 0",
              fontSize: 32,
              fontWeight: 800,
              color: "var(--pl-success)",
            }}
          >
            {formatPctEs(parlayDemo.combinedProbability)}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--pl-text-muted)",
            }}
          >
            Momio justo
          </p>
          <p
            className="num"
            style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700 }}
          >
            {parlayDemo.fairAmerican}
          </p>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--pl-text-muted)" }}>
        {parlayDemo.note}
      </p>

      {showLink ? (
        <a className="pl-lp-more" href="/parlays">
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
      <div className="pl-lp-row pl-lp-row--between">
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>
          Comunidad de socios
        </p>
        <span className="pl-lp-pill" data-example-badge="">
          Ejemplo
        </span>
      </div>

      <article className="pl-lp-social-post">
        <span aria-hidden="true" className="pl-lp-social-avatar">
          {sofia.avatarInitials}
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{sofia.name}</strong>{" "}
            <span style={{ color: "var(--pl-text-muted)" }}>
              @{sofia.handle} · Tipster verificada
            </span>
          </p>
          <p
            style={{
              margin: 0,
              color: "var(--pl-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {commentText}
          </p>

          <div className="pl-lp-social-pick">
            <TeamBadge
              league={featuredPick.league}
              slug={featuredPick.teamSlug}
              name={featuredPick.teamName}
              size={32}
              decorative
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {featuredPick.pickLabel}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--pl-text-muted)",
                }}
              >
                {featuredPick.matchLabel}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                className="num"
                style={{
                  margin: 0,
                  fontWeight: 800,
                  color: "var(--pl-success)",
                }}
              >
                {formatPctEs(featuredPick.p)}
              </p>
              <p
                className="num"
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--pl-text-muted)",
                }}
              >
                justo {featuredPick.fairAmerican}
              </p>
            </div>
          </div>

          <p
            className="num"
            style={{ margin: 0, fontSize: 12, color: "var(--pl-text-muted)" }}
          >
            Publicado antes del partido · no se puede editar
          </p>
        </div>
      </article>

      <div
        style={{
          borderTop: "1px solid var(--pl-border)",
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 14,
          color: "var(--pl-text-secondary)",
        }}
      >
        <p className="pl-lp-row" style={{ margin: 0 }}>
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
            style={{ flex: "none", color: "var(--pl-success)" }}
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
          <span>Récord de cada tipster calculado por PitchLab, no por ellos.</span>
        </p>
        <p className="pl-lp-row" style={{ margin: 0 }}>
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
            style={{ flex: "none", color: "var(--pl-success)" }}
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
          <span>Sin spam: solo escriben socios con su pase activo.</span>
        </p>
        {showLink ? (
          <a className="pl-lp-more" href="/comunidad">
            Entrar a la comunidad{" "}
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
          <h2 className="pl-lp-h2">Arma parlays que tengan sentido.</h2>
          <p className="pl-lp-lede">
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
  return (
    <section
      id="precio"
      className={
        variant === "page" ? "pl-lp-section pl-lp-section--top" : "pl-lp-section"
      }
    >
      <div className="pl-lp-wrap pl-lp-pricing-grid">
        <div className="pl-lp-pricing-copy">
          <p className="pl-lp-eyebrow">Precio</p>
          {variant === "page" ? (
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Un solo pase. Todo incluido.
            </h1>
          ) : (
            <h2 className="pl-lp-h2">Un solo pase. Todo incluido.</h2>
          )}
          <p className="pl-lp-lede">
            Pase PitchLab Ultra: todos los partidos, todos los mercados, parlays y comunidad. IVA incluido y factura CFDI.
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "var(--pl-text-secondary)",
            }}
          >
            Invita a un amigo: cuando paga su primer mes, los dos suman{" "}
            {MEMBERSHIP_SPEC.referralBothRewardDays} días.
          </p>
          {variant === "teaser" ? (
            <a
              className="pl-lp-more"
              href="/precio"
              style={{ alignSelf: "flex-start" }}
            >
              Ver todo lo que incluye{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}
        </div>

        <PricingCardIsland hasSession={hasSession} />
      </div>
    </section>
  );
}

export function FaqSection(): React.JSX.Element {
  return (
    <section className="pl-lp-section" aria-labelledby="pl-lp-faq-heading">
      <div className="pl-lp-wrap pl-lp-wrap--narrow">
        <h2
          id="pl-lp-faq-heading"
          className="pl-lp-h2 pl-lp-h2--faq"
          style={{ marginBottom: 24 }}
        >
          Preguntas frecuentes
        </h2>
        {LANDING_FAQS.map((item) => (
          <details
            key={item.question}
            className="pl-lp-faq"
            open={item.defaultOpen || undefined}
          >
            <summary>
              <span>{item.question}</span>
              <span className="pl-lp-chev" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="pl-lp-faq-body">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ClosingCtaSection({ hasSession = false }: { hasSession?: boolean } = {}): React.JSX.Element {
  return (
    <section className="pl-lp-closing">
      <div className="pl-lp-wrap">
        <div className="pl-lp-card pl-lp-closing-card glass-card glass-ring">
          <div className="pl-lp-closing-copy">
            <h2 className="pl-lp-h2">Lee el juego con datos.</h2>
            <p className="pl-lp-lede">
              Abre la jornada, mira lo más probable y compáralo con tu momio.
            </p>
            <a
              className="pl-lp-btn pl-lp-btn-primary"
              href={hasSession ? "/app" : "/signup"}
              style={{ alignSelf: "flex-start" }}
            >
              Probar 7 días gratis{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          </div>

          <div className="pl-lp-radar-wrap" aria-hidden="true">
            <div className="pl-lp-radar-halo" />
            <Mascot
              edition="soccer"
              size={240}
              className="pl-lp-radar-float"
              lazy
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   6 Superficies completas de las rutas del menú público
   ========================================================================== */

export function ComoFuncionaPageSurface({
  heroCards,
  hasSession = false,
}: {
  heroCards: readonly LandingHeroLeagueCard[];
  hasSession?: boolean;
}): React.JSX.Element {
  return (
    <PublicSiteShell activePath="/como-funciona" hasSession={hasSession}>
      <section
        className="pl-lp-section pl-lp-section--top"
        style={{ overflow: "hidden" }}
      >
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
          <div className="pl-lp-orb pl-lp-orb--3" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 720 }}>
            <p className="pl-lp-eyebrow">Cómo funciona</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Tres números para leer cualquier partido.
            </h1>
            <p className="pl-lp-lede">
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
            <h2 className="pl-lp-h2">Pon el momio de tu casa frente al justo.</h2>
            <p className="pl-lp-lede">
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
              <h2 className="pl-lp-h2">Un partido real por cada liga activa.</h2>
              <p className="pl-lp-lede">
                La misma estructura aplica en fútbol y NFL: resultado más probable del partido, momio justo y mercados derivados.
              </p>
            </div>

            <div className="pl-lp-grid-2">
              {heroCards.map((card) => (
                <article
                  key={card.league}
                  className="pl-lp-card pl-lp-panel glass-card glass-ring"
                >
                  <div className="pl-lp-match-meta">
                    <span className="pl-lp-row" style={{ gap: 8 }}>
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
                    <div style={{ minWidth: 0 }}>
                      <p className="pl-lp-most-kicker">Lo más probable</p>
                      <p className="pl-lp-most-label">{card.mostProbable.label}</p>
                      <p className="pl-lp-most-sub num">
                        Momio justo{" "}
                        <strong style={{ color: "var(--pl-text)" }}>
                          {card.mostProbable.fairAmerican}
                        </strong>{" "}
                        · decimal {card.mostProbable.fairDecimal}
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

export function MotoresPageSurface({ hasSession = false }: { hasSession?: boolean } = {}): React.JSX.Element {
  return (
    <PublicSiteShell activePath="/motores" hasSession={hasSession}>
      <section
        className="pl-lp-section pl-lp-section--top"
        style={{ overflow: "hidden" }}
      >
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
          <div className="pl-lp-orb pl-lp-orb--2" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 740 }}>
            <p className="pl-lp-eyebrow">{SPACETIME_METRICS_HEADLINE.suiteName}</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Cinco motores. Cada uno probado con partidos que no vio.
            </h1>
            <p className="pl-lp-lede">
              Cada motor cumple una tarea distinta: medir fuerza deportiva pura, cruzarla con el mercado sin margen, filtrar ventaja real y explicarla en claro.
            </p>
            <div className="pl-lp-hero-ctas" style={{ marginTop: 8 }}>
              <a className="pl-lp-btn pl-lp-btn-primary" href={hasSession ? "/app" : "/signup"}>
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="pl-lp-btn pl-lp-btn-ghost" href="/resultados">
                Ver resultados publicados
              </a>
            </div>
          </div>
        </div>
      </section>

      <EnginesSection variant="page" />

      <section id="calibracion" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-pricing-grid">
          <div className="pl-lp-pricing-copy">
            <p className="pl-lp-eyebrow">Calibración</p>
            <h2 className="pl-lp-h2">
              La probabilidad anunciada se mide contra la realidad.
            </h2>
            <p className="pl-lp-lede">
              {SPACETIME_METRICS_HEADLINE.retrainSchedule}. En {SPACETIME_METRICS_HEADLINE.activeLeaguesCount} ligas activas publicamos de {SPACETIME_METRICS_HEADLINE.picksPerMatchRange} picks estructurados por partido.
            </p>
          </div>
          <div style={{ flex: "1 1 460px", minWidth: 0 }}>
            <CalibrationCard />
          </div>
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
  return (
    <PublicSiteShell activePath="/resultados" hasSession={hasSession}>
      <section
        className="pl-lp-section pl-lp-section--top"
        style={{ overflow: "hidden" }}
      >
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--2" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 720 }}>
            <p className="pl-lp-eyebrow">Historial íntegro</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Lo que falló también se queda.
            </h1>
            <p className="pl-lp-lede">
              Cada pick queda registrado antes del inicio del partido y se califica con el marcador oficial al terminar. Nada se borra ni se edita después.
            </p>
            <div className="pl-lp-hero-ctas" style={{ marginTop: 8 }}>
              <a className="pl-lp-btn pl-lp-btn-primary" href={hasSession ? "/app" : "/signup"}>
                Probar 7 días gratis{" "}
                <span className="pl-lp-arr" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <ResultsFilterListIsland results={results} />
          <CalibrationCard />
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
    <PublicSiteShell activePath="/parlays" hasSession={hasSession}>
      <section
        className="pl-lp-section pl-lp-section--top"
        style={{ overflow: "hidden" }}
      >
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
          <div className="pl-lp-orb pl-lp-orb--2" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 720 }}>
            <p className="pl-lp-eyebrow">Armador de parlays</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Arma parlays que tengan sentido.
            </h1>
            <p className="pl-lp-lede">
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
            <h2 className="pl-lp-h2">De 2 a 6 selecciones, sin contradicciones.</h2>
            <p className="pl-lp-lede">
              Cuando juntas dos mercados del mismo encuentro, sus probabilidades no son independientes. Geodesic v2.0 ajusta la probabilidad combinada y bloquea choques lógicos antes de armar tu boleto.
            </p>
          </div>
          <ParlayDemoCard parlayDemo={parlayDemo} showLink={false} />
        </div>
      </section>

      <section id="choques-logicos" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Protección lógica</p>
            <h2 className="pl-lp-h2">Choques que el armador bloquea en automático.</h2>
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
    <PublicSiteShell activePath="/comunidad" hasSession={hasSession}>
      <section
        className="pl-lp-section pl-lp-section--top"
        style={{ overflow: "hidden" }}
      >
        <div className="pl-lp-atmo" aria-hidden="true">
          <div className="pl-lp-orb pl-lp-orb--1" />
        </div>
        <div className="pl-lp-fieldgrid" aria-hidden="true" />
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head" style={{ maxWidth: 740 }}>
            <p className="pl-lp-eyebrow">Comunidad de socios</p>
            <h1 className="pl-lp-h1 pl-lp-h1--page">
              Récord calculado por PitchLab, nunca por quien publica.
            </h1>
            <p className="pl-lp-lede">
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
            <h2 className="pl-lp-h2">Conversación limpia, centrada en el partido.</h2>
            <p className="pl-lp-lede">
              Las publicaciones y perfiles de abajo son ejemplos demostrativos de cómo se ve el muro de socios dentro del club.
            </p>
          </div>

          <div className="pl-lp-panels">
            <CommunitySampleCard featuredPick={featuredPick} showLink={false} />

            <div className="pl-lp-card pl-lp-panel glass-card glass-ring">
              <div className="pl-lp-row pl-lp-row--between">
                <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>
                  Muro del club
                </p>
                <span className="pl-lp-pill" data-example-badge="">
                  Ejemplo
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {INITIAL_SOCIAL_POSTS.slice(0, 3).map((post) => (
                  <article
                    key={post.id}
                    style={{
                      borderTop: "1px solid var(--pl-border)",
                      paddingTop: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div className="pl-lp-row pl-lp-row--between">
                      <p style={{ margin: 0, fontSize: 14 }}>
                        <strong>{post.authorName}</strong>{" "}
                        <span style={{ color: "var(--pl-text-muted)" }}>
                          @{post.authorHandle} · {post.roleBadge}
                        </span>
                      </p>
                      <span className="pl-lp-pill" data-example-badge="">
                        Ejemplo
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        color: "var(--pl-text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      {post.body}
                    </p>
                    <p
                      className="num"
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "var(--pl-text-muted)",
                      }}
                    >
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
            <h2 className="pl-lp-h2">
              ¿Tienes comunidad deportiva? Audita tu récord con nosotros.
            </h2>
            <p className="pl-lp-lede">
              Los Tipsters Oficiales comparten 1 pick abierto por semana, regalan{" "}
              {promoFreeDays} días de prueba con su código y reciben {commissionPct} % de comisión recurrente por cada referido con pase activo.
            </p>
          </div>

          <div className="pl-lp-grid-3">
            {TIPSTER_CREATORS.map((creator) => (
              <article
                key={creator.handle}
                className="pl-lp-card pl-lp-panel glass-card glass-ring"
              >
                <div className="pl-lp-row pl-lp-row--between">
                  <div className="pl-lp-row" style={{ gap: 10 }}>
                    <span aria-hidden="true" className="pl-lp-social-avatar">
                      {creator.avatarInitials}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>
                        {creator.name}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "var(--pl-text-muted)",
                        }}
                      >
                        @{creator.handle}
                      </p>
                    </div>
                  </div>
                  <span className="pl-lp-pill" data-example-badge="">
                    Ejemplo
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "var(--pl-text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  {creator.specialty}
                </p>
                <p
                  className="num"
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--pl-text-muted)",
                  }}
                >
                  Unidades verificadas: <strong>{creator.verifiedUnits}</strong> · CLV{" "}
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

export function PrecioPageSurface({ hasSession = false }: { hasSession?: boolean } = {}): React.JSX.Element {
  return (
    <PublicSiteShell activePath="/precio" hasSession={hasSession}>
      <PricingSection variant="page" hasSession={hasSession} />

      <section id="referidos" className="pl-lp-section">
        <div className="pl-lp-wrap pl-lp-stack">
          <div className="pl-lp-section-head">
            <p className="pl-lp-eyebrow">Programa de referidos</p>
            <h2 className="pl-lp-h2">Invita a tus amigos y los dos suman días.</h2>
            <p className="pl-lp-lede">
              Cuando un amigo entra con tu código y paga su primer mes, los dos suman{" "}
              {MEMBERSHIP_SPEC.referralBothRewardDays} días en su pase.
            </p>
          </div>

          <ol className="pl-lp-steps">
            <li>
              <span className="pl-lp-step-idx num">01</span>
              <p className="pl-lp-step-fig num">7 días</p>
              <div className="pl-lp-step-body">
                <h3 className="pl-lp-h3">Tu invitado prueba y ahorra</h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--pl-text-secondary)",
                    lineHeight: 1.5,
                    fontSize: 15,
                  }}
                >
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
                <h3 className="pl-lp-h3">Los dos suman tiempo</h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--pl-text-secondary)",
                    lineHeight: 1.5,
                    fontSize: 15,
                  }}
                >
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
                <h3 className="pl-lp-h3">Nivel Embajador</h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--pl-text-secondary)",
                    lineHeight: 1.5,
                    fontSize: 15,
                  }}
                >
                  Al llegar a {MEMBERSHIP_SPEC.referralAmbassadorThreshold} amigos activos, sumas{" "}
                  {MEMBERSHIP_SPEC.referralAmbassadorBonusDays} días adicionales en tu cuenta.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="facturacion" className="pl-lp-section">
        <div className="pl-lp-wrap">
          <div className="pl-lp-card pl-lp-panel glass-card glass-ring">
            <p className="pl-lp-eyebrow">Facturación en México</p>
            <h2 className="pl-lp-h2">Precio transparente con factura CFDI.</h2>
            <p className="pl-lp-lede">{MEMBERSHIP_SPEC.cfdiNote}.</p>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                color: "var(--pl-text-secondary)",
                lineHeight: 1.55,
              }}
            >
              Prueba actual: {MEMBERSHIP_SPEC.trialMonth1Label}. Puedes cancelar en cualquier momento desde tu perfil antes de que termine el periodo de prueba.
            </p>
          </div>
        </div>
      </section>

      <FaqSection />
      <ClosingCtaSection hasSession={hasSession} />
    </PublicSiteShell>
  );
}
