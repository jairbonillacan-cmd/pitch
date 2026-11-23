import fs from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  LeagueSnapshotSchema,
  LeagueSquadsFileSchema,
  asLeagueId,
  canonicalPlayerHref,
  cleanTeamRouteSlug,
  isKnockoutCupCompetition,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  parseStrictFiniteNumber,
  slugifyPlayerName,
  sportForLeague,
  type LeagueId,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlatformSport,
  type SquadPlayerEntry,
  type SquadPlayerStats,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  evaluateGoalkeeperSavesLinkedSgpV6,
  isDoubtfulAvailabilityV6,
  isHardBlockedAvailabilityV6,
  projectCoupledPlayerShotsMultiLineV6,
  projectGoalkeeperSavesMultiLineV6,
  type CoupledShotMetricV6,
  type GoalkeeperLinkedMatchOutcomeV6,
  type GoalkeeperSgpBookQuoteAuditV6,
  type UsPropsSportV6,
} from "@pitchlab/spacetime/v6";
import { resolvePersonPhotoUrl } from "@pitchlab/sports-assets";
import type {
  NbaPropStatCode,
  PropsLabPlayerPropItem,
  PropsLabRefereeSummary,
  PropsStreakExplorerItem,
} from "@pitchlab/ui/parlays";
import type { PropMetricSeries } from "@pitchlab/ui/prop-streak-card";
import type { PlayerPropItem } from "@pitchlab/ui/types";
import {
  checkStrictPlayerMinutesAndAvailabilityGuardV6,
  evaluateGuardedUsPlayerPropsV6,
  getPropsV6ModelArtifact,
  loadNbaGuardedPropsBridge,
  loadNbaInjuriesBridge,
  type GuardedUsPlayerPropProjectionV6,
  type NbaGuardedPlayerProp,
  type NbaRealInjuryBridgeItem,
} from "./player-live-stats";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";
import {
  LEAGUE_TO_V5_DIV,
  projectSoccerPlayerPropV5,
  resolveRefereePriorV5,
  type KnockoutLegTypeV5,
  type LineupStatusV36,
  type SoccerPositionCluster,
  type SoccerPropFamilyV4,
} from "./spacetime-v5";

export {
  checkStrictPlayerMinutesAndAvailabilityGuardV6,
  evaluateGuardedUsPlayerPropsV6,
  getPropsV6ModelArtifact,
  type GuardedUsPlayerPropProjectionV6,
};

export interface ExplorerStreakCard extends PropsStreakExplorerItem {
  readonly id: string;
  readonly sport: PlatformSport;
  readonly leagueLabel: string;
}

const FOOTBALL_MIN_MINUTES = 45;
const NBA_MIN_MINUTES_PER_GAME = 18;
export const PROPS_V6_SHARP_EV_CAP_PCT = 18;
export const PROPS_V6_SOFT_EV_CAP_PCT = 22;
const SHARP_BOOK_TOKENS = ["pinnacle", "betcris", "betonline"] as const;

const METRIC_PRIORITY: Record<PlatformSport, readonly string[]> = {
  football: ["Tiros a puerta", "Tiros", "Goles", "Asistencias", "Faltas", "Amarillas"],
  basketball: ["PTS", "REB", "AST", "3PM", "Puntos", "Rebotes", "Asistencias", "Triples"],
  "american-football": ["YDS", "CMP", "ATT", "TD", "CAR", "REC", "TGTS", "Yds", "Rec", "Car", "Cmp"],
  "ice-hockey": ["SOG", "G", "A", "PTS", "Tiros", "Puntos", "Goles"],
  baseball: ["SO", "IP", "H", "HR", "TB", "RBI", "BB", "ER", "K", "Hits", "Ponches"],
};

const NON_PROP_STAT_LABELS = new Set([
  "MIN",
  "MINS",
  "MINUTOS",
  "%TC",
  "%3P",
  "%TL",
  "%CMP",
  "FG%",
  "3P%",
  "FT%",
  "AVG",
  "OBP",
  "SLG",
  "OPS",
  "ERA",
  "WHIP",
]);

const NBA_STAT_LABEL_MAP: Readonly<Record<NbaPropStatCode, string>> = {
  PTS: "Puntos (PTS)",
  REB: "Rebotes (REB)",
  AST: "Asistencias (AST)",
  "3PM": "Triples (3PM)",
};

function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampRange(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

function teamSlugFromId(teamId: string): string {
  const clean = teamId.trim().toLowerCase();
  return clean.includes(".") ? clean.split(".").slice(1).join(".") : clean;
}

function parseNumericStat(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "--") return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    const mins = parseStrictFiniteNumber(parts[0]);
    const secs = parseStrictFiniteNumber(parts[1] ?? "0");
    if (mins !== null && mins >= 0) {
      return mins + (secs !== null && secs >= 0 ? secs / 60 : 0);
    }
    return null;
  }
  if (trimmed.includes("/")) {
    const first = parseStrictFiniteNumber(trimmed.split("/")[0]);
    return first !== null && first >= 0 ? first : null;
  }
  const n = parseStrictFiniteNumber(trimmed.replace(/%$/, ""));
  return n !== null && n >= 0 ? n : null;
}

function clampProb(p: number): number {
  return Math.round(Math.min(0.92, Math.max(0.08, p)) * 1000) / 1000;
}

function evaluateContinuousOverProb(mean: number, sd: number, line: number): {
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
} {
  const z = (line - mean) / Math.max(0.45, sd);
  const cdf = 1 / (1 + Math.exp(-1.702 * z));
  const pOver = clampProb(1 - cdf);
  const pUnder = clampProb(1 - pOver);
  return {
    pOver,
    pUnder,
    fairOverDecimal: Math.max(1.05, Math.round((1 / pOver) * 100) / 100),
    fairUnderDecimal: Math.max(1.05, Math.round((1 / pUnder) * 100) / 100),
  };
}

export function isSharpPropQuoteBookV6(bookLabel?: string | null): boolean {
  if (!bookLabel) return false;
  const norm = normKey(bookLabel);
  if (!norm) return false;
  return SHARP_BOOK_TOKENS.some((token) => norm.includes(token));
}

export interface GuardedPropMarketQuoteResultV6 {
  readonly marketDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly hasVerifiedMarketQuote: boolean;
}

export function evaluateGuardedPropMarketQuoteV6(params: {
  readonly pOver: number;
  readonly marketOverDecimal?: number | null;
  readonly marketBookLabel?: string | null;
  readonly allowFull: boolean;
}): GuardedPropMarketQuoteResultV6 {
  if (!params.allowFull) {
    return {
      marketDecimal: null,
      marketBookLabel: null,
      evPct: null,
      hasVerifiedMarketQuote: false,
    };
  }
  const rawBook = params.marketBookLabel?.trim() ?? "";
  const bookPermitted =
    rawBook.length > 0 && isSafePublicLabel(rawBook) && isPermittedMarketQuoteBook(rawBook);
  const dec = params.marketOverDecimal;
  const hasValidDec = typeof dec === "number" && Number.isFinite(dec) && dec > 1.01;
  if (!bookPermitted || !hasValidDec) {
    return {
      marketDecimal: null,
      marketBookLabel: null,
      evPct: null,
      hasVerifiedMarketQuote: false,
    };
  }
  const cap = isSharpPropQuoteBookV6(rawBook)
    ? PROPS_V6_SHARP_EV_CAP_PCT
    : PROPS_V6_SOFT_EV_CAP_PCT;
  const rawEvPct = round2((params.pOver * dec - 1) * 100);
  const safeEvPct = Number.isFinite(rawEvPct) && rawEvPct <= cap ? rawEvPct : null;
  return {
    marketDecimal: round2(dec),
    marketBookLabel: rawBook,
    evPct: safeEvPct,
    hasVerifiedMarketQuote: true,
  };
}

export function isGoalkeeperSavesLabel(statLabel: string, propId?: string): boolean {
  const combined = normKey(`${statLabel} ${propId ?? ""}`);
  return (
    combined.includes("atajada") ||
    combined.includes("player saves") ||
    /\bsaves?\b/.test(combined)
  );
}

export function resolveFootballTeamExpectedVolumeV6(params: {
  readonly teamProjectedGoals?: number | null;
  readonly teamExpectedShots?: number | null;
  readonly teamExpectedSoT?: number | null;
  readonly oppProjectedGoals?: number | null;
  readonly oppExpectedSoT?: number | null;
}): {
  readonly teamExpectedShots: number;
  readonly teamExpectedSoT: number;
  readonly oppExpectedSoT: number;
} {
  const cfg = getPropsV6ModelArtifact().coupled_shots_v6;
  const shotsAnchor = cfg.league_team_shots_anchor;
  const sotAnchor = cfg.league_team_sot_anchor;

  const teamGoals =
    typeof params.teamProjectedGoals === "number" &&
    Number.isFinite(params.teamProjectedGoals) &&
    params.teamProjectedGoals > 0
      ? params.teamProjectedGoals
      : 1.35;
  const teamGoalRatio = clampRange(teamGoals / 1.35, 0.55, 1.85);

  const teamExpectedShots =
    typeof params.teamExpectedShots === "number" &&
    Number.isFinite(params.teamExpectedShots) &&
    params.teamExpectedShots > 0
      ? clampRange(params.teamExpectedShots, 4.0, 26.0)
      : clampRange(shotsAnchor * Math.pow(teamGoalRatio, 0.68), 5.0, 24.0);

  const teamExpectedSoT =
    typeof params.teamExpectedSoT === "number" &&
    Number.isFinite(params.teamExpectedSoT) &&
    params.teamExpectedSoT > 0
      ? clampRange(params.teamExpectedSoT, 1.0, 12.5)
      : clampRange(sotAnchor * Math.pow(teamGoalRatio, 0.78), 1.5, 11.0);

  const oppGoals =
    typeof params.oppProjectedGoals === "number" &&
    Number.isFinite(params.oppProjectedGoals) &&
    params.oppProjectedGoals > 0
      ? params.oppProjectedGoals
      : 1.35;
  const oppGoalRatio = clampRange(oppGoals / 1.35, 0.55, 1.85);

  const oppExpectedSoT =
    typeof params.oppExpectedSoT === "number" &&
    Number.isFinite(params.oppExpectedSoT) &&
    params.oppExpectedSoT > 0
      ? clampRange(params.oppExpectedSoT, 1.0, 12.0)
      : clampRange(sotAnchor * Math.pow(oppGoalRatio, 0.78), 1.5, 11.0);

  return {
    teamExpectedShots,
    teamExpectedSoT,
    oppExpectedSoT,
  };
}

export function resolveSoccerPropFamilyV5(
  statLabel: string,
  propId?: string,
): SoccerPropFamilyV4 | null {
  const combined = normKey(`${statLabel} ${propId ?? ""}`);
  if (isGoalkeeperSavesLabel(statLabel, propId)) {
    return null;
  }
  if (
    combined.includes("anota o asiste") ||
    combined.includes("gol o asistencia") ||
    combined.includes("goal or assist") ||
    combined.includes("goals assists") ||
    combined.includes("g a")
  ) {
    return "goals_assists";
  }
  if (
    combined.includes("a puerta") ||
    combined.includes("al arco") ||
    combined.includes("shots on target") ||
    combined.includes("player sot") ||
    /\bsot\b/.test(combined)
  ) {
    return "shots_on_target";
  }
  if (
    combined.includes("tiros") ||
    combined.includes("remates") ||
    combined.includes("player shots") ||
    /\bshots?\b/.test(combined)
  ) {
    return "shots";
  }
  if (combined.includes("asistenc") || combined.includes("assist")) {
    return "assists";
  }
  if (
    combined.includes("amarill") ||
    combined.includes("tarjeta") ||
    combined.includes("yellow") ||
    combined.includes("booking")
  ) {
    return "yellow_cards";
  }
  if (
    combined.includes("anotador") ||
    combined.includes("goles") ||
    /\bgol\b/.test(combined) ||
    combined.includes("player goal") ||
    /\bgoals?\b/.test(combined)
  ) {
    return "goals";
  }
  return null;
}

export function resolveSoccerPositionClusterV5(
  positionGroup?: string | null,
  positionLabel?: string | null,
): SoccerPositionCluster {
  const group = normKey(positionGroup ?? "");
  const label = normKey(positionLabel ?? "");
  const text = `${group} ${label}`.trim();

  if (group === "gk" || /\b(?:gk|portero|arquero|goalkeeper)\b/.test(text)) {
    return "GK";
  }
  if (
    group === "def" ||
    /\b(?:def|defensa|defender|back|central|lateral|carrilero|cb|lb|rb|lwb|rwb|fb)\b/.test(text)
  ) {
    if (/\b(?:lateral|carrilero|fullback|wingback|lb|rb|lwb|rwb|fb)\b/.test(text)) {
      return "DF_FB";
    }
    return "DF_CB";
  }
  if (
    group === "fwd" ||
    /\b(?:fwd|delantero|atacante|forward|striker|extremo|winger|cf|st|lw|rw)\b/.test(text)
  ) {
    if (/\b(?:extremo|winger|wing|lw|rw|volante ofensivo)\b/.test(text)) {
      return "FW_W";
    }
    return "FW_CF";
  }
  if (/\b(?:pivote|contencion|defensivo|cdm|dm)\b/.test(text)) {
    return "MF_DM";
  }
  if (/\b(?:ofensivo|mediapunta|enganche|cam|am)\b/.test(text)) {
    return "MF_AM";
  }
  return "MF_CM";
}

export function resolveSoccerKnockoutLegTypeV5(params: {
  readonly league: string;
  readonly round?: string | null;
  readonly stageName?: string | null;
  readonly previousLegGameId?: string | null;
}): KnockoutLegTypeV5 {
  const stageText = normKey([params.stageName ?? "", params.round ?? ""].filter(Boolean).join(" "));
  const hasLegMarker =
    stageText.includes("ida") ||
    stageText.includes("vuelta") ||
    stageText.includes("first leg") ||
    stageText.includes("second leg") ||
    stageText.includes("leg 1") ||
    stageText.includes("leg 2");

  if (
    params.league === "uefa-super-cup" ||
    (stageText.includes("final") &&
      !stageText.includes("semifinal") &&
      !stageText.includes("semi final") &&
      !stageText.includes("cuartos") &&
      !stageText.includes("octavos") &&
      !stageText.includes("quarter") &&
      !hasLegMarker)
  ) {
    return "single_final";
  }

  if (
    Boolean(params.previousLegGameId) ||
    stageText.includes("vuelta") ||
    stageText.includes("second leg") ||
    stageText.includes("2nd leg") ||
    stageText.includes("leg 2")
  ) {
    return "second_leg";
  }

  if (
    stageText.includes("ida") ||
    stageText.includes("first leg") ||
    stageText.includes("1st leg") ||
    stageText.includes("leg 1")
  ) {
    return "first_leg";
  }

  if (
    isKnockoutCupCompetition(params.league) ||
    /\b(?:liguilla|cuartos|semifinal|semi final|octavos|quarter|round of 16|eliminatoria|playoff|knockout|repechaje)\b/.test(
      stageText,
    )
  ) {
    return "first_leg";
  }

  return "none";
}

function seasonCountForSoccerFamily(
  stats: SquadPlayerStats,
  family: SoccerPropFamilyV4,
): number {
  if (family === "goals") return stats.goals;
  if (family === "assists") return stats.assists;
  if (family === "goals_assists") return stats.goals + stats.assists;
  if (family === "yellow_cards") return stats.yellowCards;
  if (family === "shots") return stats.shots;
  return stats.shotsOnTarget;
}

export interface FootballPropEvaluationInputV5 {
  readonly statLabel: string;
  readonly propId?: string;
  readonly line: number;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly league: string;
  readonly positionGroup?: string | null;
  readonly positionLabel?: string | null;
  readonly avgMinutes?: number | null;
  readonly sampleGames?: number | null;
  readonly playerStats?: SquadPlayerStats | null;
  readonly lineupStatus?: "confirmed" | "probable" | null;
  readonly availabilityStatus?: "available" | "doubtful";
  readonly refereeName?: string | null;
  readonly refereeAvgYellow?: number | null;
  readonly round?: string | null;
  readonly stageName?: string | null;
  readonly previousLegGameId?: string | null;
  readonly teamProjectedGoals?: number | null;
}

export interface FootballPropEvaluationResultV5 {
  readonly source: "spacetime_hierarchical_v5" | "continuous_fallback";
  readonly propFamily: SoccerPropFamilyV4 | null;
  readonly posCluster: SoccerPositionCluster;
  readonly lineupStatus: LineupStatusV36;
  readonly knockoutLegType: KnockoutLegTypeV5;
  readonly expectedMinutes: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pOverSubCover: number | null;
  readonly subCoverLift: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
}

export function evaluateFootballPropV5(
  input: FootballPropEvaluationInputV5,
): FootballPropEvaluationResultV5 {
  const rawAvgMinutes = input.avgMinutes;
  if (
    typeof rawAvgMinutes !== "number" ||
    !Number.isFinite(rawAvgMinutes) ||
    rawAvgMinutes < FOOTBALL_MIN_MINUTES
  ) {
    throw new RangeError(
      `evaluateFootballPropV5 requires explicit avgMinutes >= ${FOOTBALL_MIN_MINUTES}`,
    );
  }
  const minsPerGame = Math.min(92, rawAvgMinutes);
  const propFamily = resolveSoccerPropFamilyV5(input.statLabel, input.propId);
  const posCluster = resolveSoccerPositionClusterV5(input.positionGroup, input.positionLabel);
  const knockoutLegType = resolveSoccerKnockoutLegTypeV5({
    league: input.league,
    round: input.round,
    stageName: input.stageName,
    previousLegGameId: input.previousLegGameId,
  });

  const resolvedLineupStatus: LineupStatusV36 =
    input.availabilityStatus === "doubtful"
      ? "doubt"
      : input.lineupStatus === "confirmed"
        ? "confirmed_starter"
        : input.lineupStatus === "probable"
          ? "projected_starter"
          : minsPerGame < 55
            ? "bench"
            : "projected_starter";

  if (propFamily === null) {
    const fallback = evaluateContinuousOverProb(
      input.projectionMean,
      input.projectionSd,
      input.line,
    );
    return {
      source: "continuous_fallback",
      propFamily: null,
      posCluster,
      lineupStatus: resolvedLineupStatus,
      knockoutLegType,
      expectedMinutes: minsPerGame,
      pOver: fallback.pOver,
      pUnder: fallback.pUnder,
      pOverSubCover: null,
      subCoverLift: 0,
      fairOverDecimal: fallback.fairOverDecimal,
      fairUnderDecimal: fallback.fairUnderDecimal,
    };
  }

  let weightedSumY: number;
  let weightedExposure90: number;

  if (input.playerStats && input.playerStats.appearances > 0) {
    weightedExposure90 = Math.max(0.5, (input.playerStats.appearances * minsPerGame) / 90);
    weightedSumY = seasonCountForSoccerFamily(input.playerStats, propFamily);
  } else {
    const games = Math.max(1, input.sampleGames ?? 6);
    weightedExposure90 = Math.max(0.5, (games * minsPerGame) / 90);
    const ratePer90 = Math.max(0, input.projectionMean) * (90 / minsPerGame);
    weightedSumY = ratePer90 * weightedExposure90;
  }

  const teamGoalFactor =
    typeof input.teamProjectedGoals === "number" &&
    Number.isFinite(input.teamProjectedGoals) &&
    input.teamProjectedGoals > 0
      ? input.teamProjectedGoals / 1.35
      : 1.0;

  let refereeFactor = 1.0;
  if (propFamily === "yellow_cards") {
    const div = LEAGUE_TO_V5_DIV[input.league] ?? null;
    const refPrior = resolveRefereePriorV5(input.refereeName, div);
    if (refPrior) {
      refereeFactor = refPrior.cardsMultiplier;
    } else if (
      typeof input.refereeAvgYellow === "number" &&
      Number.isFinite(input.refereeAvgYellow) &&
      input.refereeAvgYellow > 0
    ) {
      refereeFactor = input.refereeAvgYellow / 4.1;
    }
  }

  const projected = projectSoccerPlayerPropV5({
    propFamily,
    posCluster,
    weightedSumY,
    weightedExposure90,
    expectedMinutesStarter:
      input.avgMinutes !== null && input.avgMinutes !== undefined ? minsPerGame : null,
    lineupStatus: resolvedLineupStatus,
    teamGoalFactor,
    oppDefFactor: 1.0,
    refereeFactor,
    line: input.line,
    knockoutLegType,
  });

  return {
    source: "spacetime_hierarchical_v5",
    propFamily,
    posCluster,
    lineupStatus: projected.lineupStatus,
    knockoutLegType,
    expectedMinutes: projected.expectedMinutes,
    pOver: projected.pOverCalibrated,
    pUnder: projected.pUnderCalibrated,
    pOverSubCover: projected.pOverSubCover,
    subCoverLift: projected.subCoverLift,
    fairOverDecimal: projected.fairOverDecimal,
    fairUnderDecimal: projected.fairUnderDecimal,
  };
}

export interface CoupledFootballShotsEvalInputV6 {
  readonly metric: CoupledShotMetricV6;
  readonly playerName: string;
  readonly positionGroup?: string | null;
  readonly positionLabel?: string | null;
  readonly seasonCount: number;
  readonly seasonShotsTotal?: number | null;
  readonly appearances: number;
  readonly subIns: number;
  readonly avgMinutes: number | null | undefined;
  readonly explicitTotalMinutes?: number | null;
  readonly teamExpectedShots?: number | null;
  readonly teamExpectedSoT?: number | null;
  readonly teamProjectedGoals?: number | null;
  readonly oppDefenseFactor?: number;
  readonly lineupStatus?: "confirmed" | "probable" | "bench" | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly contextWeight?: number;
  readonly allowFull: boolean;
  readonly marketQuotesByLine?: Readonly<
    Record<number, { readonly overDecimal?: number | null; readonly bookLabel?: string | null }>
  >;
}

export interface GuardedCoupledShotLineV6 {
  readonly line: number;
  readonly marketKey: "player_shots" | "player_sot";
  readonly marketLabel: string;
  readonly unitEs: "tiros" | "tiros a puerta";
  readonly selectionLabel: string;
  readonly isRedacted: boolean;
  readonly pOver: number | null;
  readonly pUnder: number | null;
  readonly pOverSubCover: number | null;
  readonly subCoverLift: number | null;
  readonly fairOverDecimal: number | null;
  readonly fairUnderDecimal: number | null;
  readonly marketOverDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly hasVerifiedMarketQuote: boolean;
}

export interface CoupledFootballShotsEvalResultV6 {
  readonly source: "spacetime_coupled_shots_v6";
  readonly metric: CoupledShotMetricV6;
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly isRedacted: boolean;
  readonly posCluster: SoccerPositionCluster;
  readonly lineupStatus: LineupStatusV36;
  readonly expectedMinutes: number;
  readonly muProjected: number | null;
  readonly matchCouplingMultiplier: number | null;
  readonly lines: readonly GuardedCoupledShotLineV6[];
}

export function evaluateCoupledFootballShotsV6(
  input: CoupledFootballShotsEvalInputV6,
): CoupledFootballShotsEvalResultV6 {
  const posCluster = resolveSoccerPositionClusterV5(input.positionGroup, input.positionLabel);
  if (!isSafePublicLabel(input.playerName)) {
    return {
      source: "spacetime_coupled_shots_v6",
      metric: input.metric,
      eligible: false,
      blockedByInjury: false,
      blockedByMinutesGuard: false,
      isRedacted: !input.allowFull,
      posCluster,
      lineupStatus: "projected_starter",
      expectedMinutes: 0,
      muProjected: null,
      matchCouplingMultiplier: null,
      lines: [],
    };
  }

  const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    avgMinutes: input.avgMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });
  if (!strictGuard.eligible || typeof input.avgMinutes !== "number") {
    return {
      source: "spacetime_coupled_shots_v6",
      metric: input.metric,
      eligible: false,
      blockedByInjury: strictGuard.blockedByInjury,
      blockedByMinutesGuard: strictGuard.blockedByMinutesGuard,
      isRedacted: !input.allowFull,
      posCluster,
      lineupStatus: "projected_starter",
      expectedMinutes: 0,
      muProjected: null,
      matchCouplingMultiplier: null,
      lines: [],
    };
  }

  const minsPerGame = Math.min(92, input.avgMinutes);
  const resolvedLineupStatus: LineupStatusV36 = isDoubtfulAvailabilityV6(
    input.availability,
    input.injuryStatus,
  )
    ? "doubt"
    : input.lineupStatus === "confirmed"
      ? "confirmed_starter"
      : input.lineupStatus === "probable"
        ? "projected_starter"
        : input.lineupStatus === "bench"
          ? "bench"
          : minsPerGame < 55
            ? "bench"
            : "projected_starter";

  const volume = resolveFootballTeamExpectedVolumeV6({
    teamProjectedGoals: input.teamProjectedGoals,
    teamExpectedShots: input.teamExpectedShots,
    teamExpectedSoT: input.teamExpectedSoT,
  });

  const projected = projectCoupledPlayerShotsMultiLineV6({
    metric: input.metric,
    positionGroup: posCluster,
    seasonCount: Math.max(0, input.seasonCount),
    seasonShotsTotal: input.seasonShotsTotal ?? null,
    appearances: Math.max(1, Math.trunc(input.appearances)),
    subIns: Math.max(0, Math.trunc(input.subIns)),
    teamExpectedShots: volume.teamExpectedShots,
    teamExpectedSoT: volume.teamExpectedSoT,
    oppDefenseFactor: input.oppDefenseFactor ?? 1.0,
    explicitMinutes: input.explicitTotalMinutes ?? null,
    expectedMinutesStarter: minsPerGame,
    lineupStatus: resolvedLineupStatus,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    contextWeight: input.contextWeight ?? 1.0,
    artifact: getPropsV6ModelArtifact(),
  });

  if (!projected.eligible || projected.lines.length === 0) {
    return {
      source: "spacetime_coupled_shots_v6",
      metric: input.metric,
      eligible: false,
      blockedByInjury: projected.blockedByInjury,
      blockedByMinutesGuard: projected.blockedByMinutesGuard,
      isRedacted: !input.allowFull,
      posCluster,
      lineupStatus: projected.lineupStatus,
      expectedMinutes: projected.expectedMinutes,
      muProjected: null,
      matchCouplingMultiplier: null,
      lines: [],
    };
  }

  const isShots = input.metric === "shots";
  const marketKey: "player_shots" | "player_sot" = isShots ? "player_shots" : "player_sot";
  const marketLabel = isShots ? "Tiros totales" : "Tiros a puerta";
  const unitEs: "tiros" | "tiros a puerta" = isShots ? "tiros" : "tiros a puerta";

  const lines: GuardedCoupledShotLineV6[] = projected.lines.map((ln) => {
    const selectionLabel = `Más de ${ln.line.toFixed(1)} ${unitEs}`;
    if (!input.allowFull) {
      return {
        line: ln.line,
        marketKey,
        marketLabel,
        unitEs,
        selectionLabel,
        isRedacted: true,
        pOver: null,
        pUnder: null,
        pOverSubCover: null,
        subCoverLift: null,
        fairOverDecimal: null,
        fairUnderDecimal: null,
        marketOverDecimal: null,
        marketBookLabel: null,
        evPct: null,
        hasVerifiedMarketQuote: false,
      };
    }
    const rawQuote = input.marketQuotesByLine?.[ln.line];
    const quote = evaluateGuardedPropMarketQuoteV6({
      pOver: ln.pOverCalibrated,
      marketOverDecimal: rawQuote?.overDecimal ?? null,
      marketBookLabel: rawQuote?.bookLabel ?? null,
      allowFull: true,
    });
    return {
      line: ln.line,
      marketKey,
      marketLabel,
      unitEs,
      selectionLabel,
      isRedacted: false,
      pOver: ln.pOverCalibrated,
      pUnder: ln.pUnderCalibrated,
      pOverSubCover: ln.pOverSubCover,
      subCoverLift: ln.subCoverLift,
      fairOverDecimal: ln.fairOverDecimal,
      fairUnderDecimal: ln.fairUnderDecimal,
      marketOverDecimal: quote.marketDecimal,
      marketBookLabel: quote.marketBookLabel,
      evPct: quote.evPct,
      hasVerifiedMarketQuote: quote.hasVerifiedMarketQuote,
    };
  });

  return {
    source: "spacetime_coupled_shots_v6",
    metric: input.metric,
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    isRedacted: !input.allowFull,
    posCluster,
    lineupStatus: projected.lineupStatus,
    expectedMinutes: projected.expectedMinutes,
    muProjected: input.allowFull ? projected.muProjected : null,
    matchCouplingMultiplier: input.allowFull ? projected.matchCouplingMultiplier : null,
    lines,
  };
}

export interface GoalkeeperSavesEvalInputV6 {
  readonly playerName: string;
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly avgMinutes: number | null | undefined;
  readonly oppExpectedSoT?: number | null;
  readonly oppProjectedGoals?: number | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly allowFull: boolean;
  readonly marketQuotesByLine?: Readonly<
    Record<number, { readonly overDecimal?: number | null; readonly bookLabel?: string | null }>
  >;
}

export interface GuardedGoalkeeperSavesLineV6 {
  readonly line: number;
  readonly marketKey: "player_saves";
  readonly marketLabel: "Atajadas";
  readonly unitEs: "atajadas";
  readonly selectionLabel: string;
  readonly isRedacted: boolean;
  readonly pOver: number | null;
  readonly pUnder: number | null;
  readonly fairOverDecimal: number | null;
  readonly fairUnderDecimal: number | null;
  readonly marketOverDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly hasVerifiedMarketQuote: boolean;
}

export interface GoalkeeperSavesEvalResultV6 {
  readonly source: "spacetime_goalkeeper_saves_v6";
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly isRedacted: boolean;
  readonly expectedMinutes: number;
  readonly expectedSaves: number | null;
  readonly ebSaveRate: number | null;
  readonly oppExpectedSoT: number | null;
  readonly lines: readonly GuardedGoalkeeperSavesLineV6[];
}

export function evaluateGoalkeeperSavesV6(
  input: GoalkeeperSavesEvalInputV6,
): GoalkeeperSavesEvalResultV6 {
  if (!isSafePublicLabel(input.playerName)) {
    return {
      source: "spacetime_goalkeeper_saves_v6",
      eligible: false,
      blockedByInjury: false,
      blockedByMinutesGuard: false,
      isRedacted: !input.allowFull,
      expectedMinutes: 0,
      expectedSaves: null,
      ebSaveRate: null,
      oppExpectedSoT: null,
      lines: [],
    };
  }

  const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    avgMinutes: input.avgMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });
  if (!strictGuard.eligible || typeof input.avgMinutes !== "number") {
    return {
      source: "spacetime_goalkeeper_saves_v6",
      eligible: false,
      blockedByInjury: strictGuard.blockedByInjury,
      blockedByMinutesGuard: strictGuard.blockedByMinutesGuard,
      isRedacted: !input.allowFull,
      expectedMinutes: 0,
      expectedSaves: null,
      ebSaveRate: null,
      oppExpectedSoT: null,
      lines: [],
    };
  }

  const volume = resolveFootballTeamExpectedVolumeV6({
    oppProjectedGoals: input.oppProjectedGoals,
    oppExpectedSoT: input.oppExpectedSoT,
  });

  const projected = projectGoalkeeperSavesMultiLineV6({
    saves: Math.max(0, Math.trunc(input.saves)),
    shotsFaced: Math.max(0, Math.trunc(input.shotsFaced)),
    goalsConceded: Math.max(0, Math.trunc(input.goalsConceded)),
    appearances: Math.max(1, Math.trunc(input.appearances)),
    subIns: Math.max(0, Math.trunc(input.subIns)),
    oppExpectedSoT: volume.oppExpectedSoT,
    expectedMinutes: Math.min(95, input.avgMinutes),
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    artifact: getPropsV6ModelArtifact(),
  });

  if (!projected.eligible || projected.lines.length === 0) {
    return {
      source: "spacetime_goalkeeper_saves_v6",
      eligible: false,
      blockedByInjury: projected.blockedByInjury,
      blockedByMinutesGuard: projected.blockedByMinutesGuard,
      isRedacted: !input.allowFull,
      expectedMinutes: projected.expectedMinutes,
      expectedSaves: null,
      ebSaveRate: null,
      oppExpectedSoT: null,
      lines: [],
    };
  }

  const lines: GuardedGoalkeeperSavesLineV6[] = projected.lines.map((ln) => {
    const selectionLabel = `Más de ${ln.line.toFixed(1)} atajadas`;
    if (!input.allowFull) {
      return {
        line: ln.line,
        marketKey: "player_saves",
        marketLabel: "Atajadas",
        unitEs: "atajadas",
        selectionLabel,
        isRedacted: true,
        pOver: null,
        pUnder: null,
        fairOverDecimal: null,
        fairUnderDecimal: null,
        marketOverDecimal: null,
        marketBookLabel: null,
        evPct: null,
        hasVerifiedMarketQuote: false,
      };
    }
    const rawQuote = input.marketQuotesByLine?.[ln.line];
    const quote = evaluateGuardedPropMarketQuoteV6({
      pOver: ln.pOverCalibrated,
      marketOverDecimal: rawQuote?.overDecimal ?? null,
      marketBookLabel: rawQuote?.bookLabel ?? null,
      allowFull: true,
    });
    return {
      line: ln.line,
      marketKey: "player_saves",
      marketLabel: "Atajadas",
      unitEs: "atajadas",
      selectionLabel,
      isRedacted: false,
      pOver: ln.pOverCalibrated,
      pUnder: ln.pUnderCalibrated,
      fairOverDecimal: ln.fairOverDecimal,
      fairUnderDecimal: ln.fairUnderDecimal,
      marketOverDecimal: quote.marketDecimal,
      marketBookLabel: quote.marketBookLabel,
      evPct: quote.evPct,
      hasVerifiedMarketQuote: quote.hasVerifiedMarketQuote,
    };
  });

  return {
    source: "spacetime_goalkeeper_saves_v6",
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    isRedacted: !input.allowFull,
    expectedMinutes: projected.expectedMinutes,
    expectedSaves: input.allowFull ? projected.expectedSaves : null,
    ebSaveRate: input.allowFull ? projected.ebSaveRate : null,
    oppExpectedSoT: input.allowFull ? projected.oppExpectedSoT : null,
    lines,
  };
}

const GK_SGP_OUTCOME_LABEL_ES: Readonly<Record<GoalkeeperLinkedMatchOutcomeV6, string>> = {
  clean_sheet: "Portería a cero",
  under_2_5: "Menos de 2.5 goles",
  team_win: "Victoria de su equipo",
  over_2_5: "Más de 2.5 goles",
  team_win_or_draw: "Gana o empata",
};

export interface GoalkeeperSavesSgpEvalInputV6 {
  readonly playerName: string;
  readonly savesLine: number;
  readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly avgMinutes: number | null | undefined;
  readonly oppExpectedSoT?: number | null;
  readonly teamExpectedGoals: number;
  readonly opponentExpectedGoals: number;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly offeredCombinedDecimalOdds?: number | null;
  readonly offeredBookLabel?: string | null;
  readonly allowFull: boolean;
}

export interface GoalkeeperSavesSgpEvalResultV6 {
  readonly source: "spacetime_goalkeeper_sgp_v6";
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly isRedacted: boolean;
  readonly savesLine: number;
  readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
  readonly comboLabelEs: string;
  readonly expectedSaves: number | null;
  readonly pSavesOverMarginal: number | null;
  readonly pMatchOutcomeMarginal: number | null;
  readonly independentProbability: number | null;
  readonly jointProbability: number | null;
  readonly probabilityLowerBound: number | null;
  readonly probabilityUpperBound: number | null;
  readonly structuralMultiplier: number | null;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent"
    | null;
  readonly fairCombinedDecimal: number | null;
  readonly offeredCombinedDecimal: number | null;
  readonly offeredBookLabel: string | null;
  readonly evPct: number | null;
  readonly bookQuoteAudit: GoalkeeperSgpBookQuoteAuditV6 | null;
}

export function evaluateGoalkeeperSavesSgpComboV6(
  input: GoalkeeperSavesSgpEvalInputV6,
): GoalkeeperSavesSgpEvalResultV6 {
  const safePlayer = isSafePublicLabel(input.playerName) ? input.playerName.trim() : "";
  const outcomeLabel = GK_SGP_OUTCOME_LABEL_ES[input.matchOutcome];
  const comboLabelEs = safePlayer
    ? `${safePlayer} · Más de ${input.savesLine.toFixed(1)} atajadas + ${outcomeLabel}`
    : `Más de ${input.savesLine.toFixed(1)} atajadas + ${outcomeLabel}`;

  const emptyResult = (blockedByInjury: boolean, blockedByMinutesGuard: boolean): GoalkeeperSavesSgpEvalResultV6 => ({
    source: "spacetime_goalkeeper_sgp_v6",
    eligible: false,
    blockedByInjury,
    blockedByMinutesGuard,
    isRedacted: !input.allowFull,
    savesLine: input.savesLine,
    matchOutcome: input.matchOutcome,
    comboLabelEs,
    expectedSaves: null,
    pSavesOverMarginal: null,
    pMatchOutcomeMarginal: null,
    independentProbability: null,
    jointProbability: null,
    probabilityLowerBound: null,
    probabilityUpperBound: null,
    structuralMultiplier: null,
    correlationDirection: null,
    fairCombinedDecimal: null,
    offeredCombinedDecimal: null,
    offeredBookLabel: null,
    evPct: null,
    bookQuoteAudit: null,
  });

  if (!safePlayer) {
    return emptyResult(false, false);
  }

  const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    avgMinutes: input.avgMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });
  if (!strictGuard.eligible || typeof input.avgMinutes !== "number") {
    return emptyResult(strictGuard.blockedByInjury, strictGuard.blockedByMinutesGuard);
  }

  const artifact = getPropsV6ModelArtifact();
  const volume = resolveFootballTeamExpectedVolumeV6({
    oppProjectedGoals: input.opponentExpectedGoals,
    oppExpectedSoT: input.oppExpectedSoT,
  });

  const baseSaves = projectGoalkeeperSavesMultiLineV6({
    saves: Math.max(0, Math.trunc(input.saves)),
    shotsFaced: Math.max(0, Math.trunc(input.shotsFaced)),
    goalsConceded: Math.max(0, Math.trunc(input.goalsConceded)),
    appearances: Math.max(1, Math.trunc(input.appearances)),
    subIns: Math.max(0, Math.trunc(input.subIns)),
    oppExpectedSoT: volume.oppExpectedSoT,
    expectedMinutes: Math.min(95, input.avgMinutes),
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    artifact,
  });

  if (!baseSaves.eligible) {
    return emptyResult(baseSaves.blockedByInjury, baseSaves.blockedByMinutesGuard);
  }

  if (!input.allowFull) {
    return {
      source: "spacetime_goalkeeper_sgp_v6",
      eligible: true,
      blockedByInjury: false,
      blockedByMinutesGuard: false,
      isRedacted: true,
      savesLine: input.savesLine,
      matchOutcome: input.matchOutcome,
      comboLabelEs,
      expectedSaves: null,
      pSavesOverMarginal: null,
      pMatchOutcomeMarginal: null,
      independentProbability: null,
      jointProbability: null,
      probabilityLowerBound: null,
      probabilityUpperBound: null,
      structuralMultiplier: null,
      correlationDirection: null,
      fairCombinedDecimal: null,
      offeredCombinedDecimal: null,
      offeredBookLabel: null,
      evPct: null,
      bookQuoteAudit: null,
    };
  }

  const rawBook = input.offeredBookLabel?.trim() ?? "";
  const hasBookLabel = rawBook.length > 0;
  const bookPermitted =
    hasBookLabel && isSafePublicLabel(rawBook) && isPermittedMarketQuoteBook(rawBook);
  const rawOfferedDec = input.offeredCombinedDecimalOdds;
  const hasValidOfferedDec =
    bookPermitted &&
    typeof rawOfferedDec === "number" &&
    Number.isFinite(rawOfferedDec) &&
    rawOfferedDec > 1.01;

  const sgp = evaluateGoalkeeperSavesLinkedSgpV6({
    savesLine: input.savesLine,
    ebSaveRate: baseSaves.ebSaveRate,
    oppExpectedSoT: baseSaves.oppExpectedSoT,
    teamExpectedGoals: input.teamExpectedGoals,
    opponentExpectedGoals: input.opponentExpectedGoals,
    matchOutcome: input.matchOutcome,
    expectedMinutes: baseSaves.expectedMinutes,
    rDispersionSoT: artifact.goalkeeper_saves_v6.r_dispersion_sot,
    dixonColesRho: artifact.goalkeeper_saves_v6.dixon_coles_rho,
    siegeOwnGoalDampening: artifact.goalkeeper_saves_v6.siege_own_goal_dampening ?? 0.0,
    offeredCombinedDecimalOdds: hasValidOfferedDec ? rawOfferedDec : null,
  });

  const cap = isSharpPropQuoteBookV6(hasBookLabel ? rawBook : null)
    ? PROPS_V6_SHARP_EV_CAP_PCT
    : PROPS_V6_SOFT_EV_CAP_PCT;
  const rawEvPct = hasValidOfferedDec
    ? round2((sgp.jointProbability * rawOfferedDec - 1) * 100)
    : null;
  const safeEvPct =
    rawEvPct !== null && Number.isFinite(rawEvPct) && rawEvPct <= cap ? rawEvPct : null;

  return {
    source: "spacetime_goalkeeper_sgp_v6",
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    isRedacted: false,
    savesLine: sgp.savesLine,
    matchOutcome: sgp.matchOutcome,
    comboLabelEs,
    expectedSaves: sgp.expectedSaves,
    pSavesOverMarginal: sgp.pSavesOverMarginal,
    pMatchOutcomeMarginal: sgp.pMatchOutcomeMarginal,
    independentProbability: sgp.independentProbability,
    jointProbability: sgp.jointProbability,
    probabilityLowerBound: sgp.frechetLowerBound,
    probabilityUpperBound: sgp.frechetUpperBound,
    structuralMultiplier: sgp.structuralMultiplier,
    correlationDirection: sgp.correlationDirection,
    fairCombinedDecimal: sgp.fairCombinedDecimal,
    offeredCombinedDecimal: hasValidOfferedDec ? round2(rawOfferedDec) : null,
    offeredBookLabel: hasValidOfferedDec && hasBookLabel ? rawBook : null,
    evPct: safeEvPct,
    bookQuoteAudit: sgp.bookQuoteAudit,
  };
}

export interface FootballPropEvaluationInputV6 extends FootballPropEvaluationInputV5 {
  readonly playerName?: string;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly teamExpectedShots?: number | null;
  readonly teamExpectedSoT?: number | null;
  readonly oppProjectedGoals?: number | null;
  readonly oppExpectedSoT?: number | null;
  readonly oppDefenseFactor?: number;
  readonly allowFull?: boolean;
}

export interface FootballPropEvaluationResultV6 {
  readonly source:
    | "spacetime_coupled_shots_v6"
    | "spacetime_goalkeeper_saves_v6"
    | "spacetime_hierarchical_v5"
    | "continuous_fallback";
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly isRedacted: boolean;
  readonly propFamily: SoccerPropFamilyV4 | "player_saves" | null;
  readonly posCluster: SoccerPositionCluster;
  readonly expectedMinutes: number;
  readonly pOver: number | null;
  readonly pUnder: number | null;
  readonly pOverSubCover: number | null;
  readonly fairOverDecimal: number | null;
  readonly fairUnderDecimal: number | null;
  readonly coupledShots?: CoupledFootballShotsEvalResultV6 | null;
  readonly goalkeeperSaves?: GoalkeeperSavesEvalResultV6 | null;
}

function selectNearestLineEntry<T extends { readonly line: number }>(
  lines: readonly T[],
  targetLine: number,
): T | null {
  if (lines.length === 0) return null;
  let best = lines[0]!;
  let bestDist = Math.abs(best.line - targetLine);
  for (let i = 1; i < lines.length; i += 1) {
    const cand = lines[i]!;
    const dist = Math.abs(cand.line - targetLine);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
}

export function evaluateFootballPropV6(
  input: FootballPropEvaluationInputV6,
): FootballPropEvaluationResultV6 {
  const allowFull = input.allowFull ?? false;
  const posCluster = resolveSoccerPositionClusterV5(input.positionGroup, input.positionLabel);
  const effectiveAvailability = input.availability ?? input.availabilityStatus ?? null;
  const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    avgMinutes: input.avgMinutes,
    availability: effectiveAvailability,
    injuryStatus: input.injuryStatus,
  });

  if (!strictGuard.eligible || typeof input.avgMinutes !== "number") {
    return {
      source: "spacetime_hierarchical_v5",
      eligible: false,
      blockedByInjury: strictGuard.blockedByInjury,
      blockedByMinutesGuard: strictGuard.blockedByMinutesGuard,
      isRedacted: !allowFull,
      propFamily: null,
      posCluster,
      expectedMinutes: 0,
      pOver: null,
      pUnder: null,
      pOverSubCover: null,
      fairOverDecimal: null,
      fairUnderDecimal: null,
    };
  }

  const playerName =
    input.playerName && isSafePublicLabel(input.playerName) ? input.playerName : "Jugador";

  if (isGoalkeeperSavesLabel(input.statLabel, input.propId)) {
    const apps = Math.max(1, input.playerStats?.appearances ?? input.sampleGames ?? 6);
    const saves =
      input.playerStats && input.playerStats.appearances > 0
        ? input.playerStats.saves
        : Math.max(0, Math.round(input.projectionMean * apps));
    const gkRes = evaluateGoalkeeperSavesV6({
      playerName,
      saves,
      shotsFaced: input.playerStats?.shotsFaced ?? 0,
      goalsConceded: input.playerStats?.goalsConceded ?? Math.max(1, Math.round(apps * 1.1)),
      appearances: apps,
      subIns: input.playerStats?.subIns ?? 0,
      avgMinutes: input.avgMinutes,
      oppExpectedSoT: input.oppExpectedSoT,
      oppProjectedGoals: input.oppProjectedGoals,
      availability: effectiveAvailability,
      injuryStatus: input.injuryStatus,
      allowFull,
    });
    const matchedLine = selectNearestLineEntry(gkRes.lines, input.line);
    return {
      source: "spacetime_goalkeeper_saves_v6",
      eligible: gkRes.eligible && matchedLine !== null,
      blockedByInjury: gkRes.blockedByInjury,
      blockedByMinutesGuard: gkRes.blockedByMinutesGuard,
      isRedacted: !allowFull,
      propFamily: "player_saves",
      posCluster,
      expectedMinutes: gkRes.expectedMinutes,
      pOver: matchedLine?.pOver ?? null,
      pUnder: matchedLine?.pUnder ?? null,
      pOverSubCover: null,
      fairOverDecimal: matchedLine?.fairOverDecimal ?? null,
      fairUnderDecimal: matchedLine?.fairUnderDecimal ?? null,
      goalkeeperSaves: gkRes,
    };
  }

  const family = resolveSoccerPropFamilyV5(input.statLabel, input.propId);
  if (family === "shots" || family === "shots_on_target") {
    const apps = Math.max(1, input.playerStats?.appearances ?? input.sampleGames ?? 6);
    const seasonCount =
      input.playerStats && input.playerStats.appearances > 0
        ? family === "shots"
          ? input.playerStats.shots
          : input.playerStats.shotsOnTarget
        : Math.max(0, input.projectionMean * apps);
    const coupledRes = evaluateCoupledFootballShotsV6({
      metric: family,
      playerName,
      positionGroup: input.positionGroup,
      positionLabel: input.positionLabel,
      seasonCount,
      seasonShotsTotal: input.playerStats?.shots ?? null,
      appearances: apps,
      subIns: input.playerStats?.subIns ?? 0,
      avgMinutes: input.avgMinutes,
      teamExpectedShots: input.teamExpectedShots,
      teamExpectedSoT: input.teamExpectedSoT,
      teamProjectedGoals: input.teamProjectedGoals,
      oppDefenseFactor: input.oppDefenseFactor,
      lineupStatus: input.lineupStatus,
      availability: effectiveAvailability,
      injuryStatus: input.injuryStatus,
      allowFull,
    });
    const matchedLine = selectNearestLineEntry(coupledRes.lines, input.line);
    return {
      source: "spacetime_coupled_shots_v6",
      eligible: coupledRes.eligible && matchedLine !== null,
      blockedByInjury: coupledRes.blockedByInjury,
      blockedByMinutesGuard: coupledRes.blockedByMinutesGuard,
      isRedacted: !allowFull,
      propFamily: family,
      posCluster,
      expectedMinutes: coupledRes.expectedMinutes,
      pOver: matchedLine?.pOver ?? null,
      pUnder: matchedLine?.pUnder ?? null,
      pOverSubCover: matchedLine?.pOverSubCover ?? null,
      fairOverDecimal: matchedLine?.fairOverDecimal ?? null,
      fairUnderDecimal: matchedLine?.fairUnderDecimal ?? null,
      coupledShots: coupledRes,
    };
  }

  const v5 = evaluateFootballPropV5({
    ...input,
    availabilityStatus: isDoubtfulAvailabilityV6(effectiveAvailability, input.injuryStatus)
      ? "doubtful"
      : "available",
  });
  return {
    source: v5.source,
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    isRedacted: !allowFull,
    propFamily: v5.propFamily,
    posCluster: v5.posCluster,
    expectedMinutes: v5.expectedMinutes,
    pOver: allowFull ? v5.pOver : null,
    pUnder: allowFull ? v5.pUnder : null,
    pOverSubCover: allowFull ? v5.pOverSubCover : null,
    fairOverDecimal: allowFull ? v5.fairOverDecimal : null,
    fairUnderDecimal: allowFull ? v5.fairUnderDecimal : null,
  };
}

function selectPlayableCanonicalLine<
  T extends { readonly line: number; readonly pOver: number | null; readonly fairOverDecimal: number | null },
>(lines: readonly T[]): T | null {
  const valid = lines.filter(
    (l): l is T & { readonly pOver: number; readonly fairOverDecimal: number } =>
      typeof l.pOver === "number" &&
      Number.isFinite(l.pOver) &&
      typeof l.fairOverDecimal === "number" &&
      Number.isFinite(l.fairOverDecimal),
  );
  if (valid.length === 0) return null;
  const inPlayable = valid.filter(
    (l) => l.fairOverDecimal >= 1.55 && l.fairOverDecimal <= 2.6,
  );
  const pool = inPlayable.length > 0 ? inPlayable : valid;
  let best = pool[0]!;
  let bestScore = Math.abs(best.pOver - 0.56);
  for (let i = 1; i < pool.length; i += 1) {
    const cand = pool[i]!;
    const dist = Math.abs(cand.pOver - 0.56);
    if (dist < bestScore) {
      bestScore = dist;
      best = cand;
    }
  }
  return best;
}

export function extractStrictAvgMinutesFromSquadPlayer(
  player: SquadPlayerEntry,
  sport: PlatformSport,
): number | null {
  const logs = player.recentGames ?? [];
  const logMins = logs
    .map((g) => {
      const hit = g.stats.find((s) => {
        const lbl = s.label.trim().toUpperCase();
        return lbl === "MIN" || lbl === "MINS" || lbl === "MINUTOS";
      });
      return hit ? parseNumericStat(hit.value) : null;
    })
    .filter((v): v is number => v !== null && v >= 0);

  if (logMins.length > 0) {
    return round1(logMins.reduce((a, b) => a + b, 0) / logMins.length);
  }

  const seasonMinMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return (
      k === "min" ||
      k === "minutes" ||
      k === "minutos" ||
      k === "min_per_game" ||
      k === "mpg" ||
      l === "MIN" ||
      l === "MINUTOS" ||
      l === "MPG"
    );
  });
  const seasonGpMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return k === "gp" || l === "JJ" || l === "PJ";
  });
  const seasonGp =
    (seasonGpMetric ? parseNumericStat(seasonGpMetric.value) : null) ??
    player.stats.appearances;

  return normalizeSeasonMinutesPerGame(sport, seasonMinMetric, seasonGp, null);
}

function platformSportToUsPropsSport(sport: PlatformSport): UsPropsSportV6 | null {
  if (sport === "basketball") return "nba";
  if (sport === "baseball") return "mlb";
  if (sport === "ice-hockey") return "nhl";
  if (sport === "american-football") return "nfl";
  return null;
}

export interface DeriveMatchPlayerPropsV6Input {
  readonly gameId: string;
  readonly league: string;
  readonly sport: PlatformSport;
  readonly homeTeamName: string;
  readonly homeTeamSlug: string;
  readonly awayTeamName: string;
  readonly awayTeamSlug: string;
  readonly homeSquad: TeamSquadEntry | null;
  readonly awaySquad: TeamSquadEntry | null;
  readonly homeProjectedGoals?: number | null;
  readonly awayProjectedGoals?: number | null;
  readonly homeExpectedShots?: number | null;
  readonly awayExpectedShots?: number | null;
  readonly homeExpectedSoT?: number | null;
  readonly awayExpectedSoT?: number | null;
  readonly confirmedHomeStarters?: readonly string[];
  readonly confirmedAwayStarters?: readonly string[];
  readonly injuryStatusByTeamPlayer?: ReadonlyMap<string, string>;
  readonly allowFull: boolean;
}

export interface DerivedMatchPlayerPropV6 {
  readonly id: string;
  readonly sport: PlatformSport;
  readonly league: string;
  readonly playerName: string;
  readonly playerSlug: string;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly teamSlug: string;
  readonly positionLabel: string | null;
  readonly photoKey: string | null;
  readonly fallbackPhotoKey: string | null;
  readonly marketKey: string;
  readonly marketLabel: string;
  readonly unitEs: string;
  readonly direction: "over";
  readonly selectionLabel: string;
  readonly line: number;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
  readonly avgMinutes: number | null;
  readonly sampleGames: number;
  readonly lineupStatus: "confirmed" | "probable" | null;
  readonly availabilityStatus: "available" | "doubtful";
  readonly engineName: "PitchLab Spacetime v6.0";
  readonly source:
    | "spacetime_coupled_shots_v6"
    | "spacetime_goalkeeper_saves_v6"
    | "spacetime_us_props_v6";
  readonly rationaleEs: string;
  readonly recentValues: readonly number[];
  readonly allCanonicalLines?: readonly {
    readonly line: number;
    readonly pOver: number;
    readonly fairOverDecimal: number;
    readonly selectionLabel: string;
  }[];
}

export function deriveMatchPlayerPropsV6(
  params: DeriveMatchPlayerPropsV6Input,
): readonly DerivedMatchPlayerPropV6[] {
  if (!params.allowFull) {
    return [];
  }

  const canonicalInjuryMap = new Map<string, string>();
  if (params.injuryStatusByTeamPlayer) {
    for (const [rawKey, status] of params.injuryStatusByTeamPlayer.entries()) {
      const sepIdx = rawKey.indexOf("|");
      if (sepIdx <= 0) continue;
      const rawTeamPart = rawKey.slice(0, sepIdx);
      const rawPlayerPart = rawKey.slice(sepIdx + 1);
      const pNorm = normKey(rawPlayerPart);
      if (!pNorm) continue;
      const canonTeam = cleanTeamRouteSlug(rawTeamPart);
      const lowerTeam = rawTeamPart.trim().toLowerCase();
      if (canonTeam) canonicalInjuryMap.set(`${canonTeam}|${pNorm}`, status);
      if (lowerTeam) canonicalInjuryMap.set(`${lowerTeam}|${pNorm}`, status);
    }
  }

  const out: DerivedMatchPlayerPropV6[] = [];
  const sides: ReadonlyArray<{
    readonly side: "home" | "away";
    readonly teamName: string;
    readonly teamSlug: string;
    readonly rawTeamSlug: string;
    readonly squad: TeamSquadEntry | null;
    readonly teamProjGoals: number | null;
    readonly oppProjGoals: number | null;
    readonly teamShots: number | null;
    readonly teamSoT: number | null;
    readonly oppSoT: number | null;
    readonly starters: ReadonlySet<string>;
  }> = [
    {
      side: "home",
      teamName: params.homeTeamName,
      teamSlug: params.homeSquad?.teamSlug ?? params.homeTeamSlug,
      rawTeamSlug: params.homeTeamSlug,
      squad: params.homeSquad,
      teamProjGoals: params.homeProjectedGoals ?? null,
      oppProjGoals: params.awayProjectedGoals ?? null,
      teamShots: params.homeExpectedShots ?? null,
      teamSoT: params.homeExpectedSoT ?? null,
      oppSoT: params.awayExpectedSoT ?? null,
      starters: new Set((params.confirmedHomeStarters ?? []).map((n) => normKey(n))),
    },
    {
      side: "away",
      teamName: params.awayTeamName,
      teamSlug: params.awaySquad?.teamSlug ?? params.awayTeamSlug,
      rawTeamSlug: params.awayTeamSlug,
      squad: params.awaySquad,
      teamProjGoals: params.awayProjectedGoals ?? null,
      oppProjGoals: params.homeProjectedGoals ?? null,
      teamShots: params.awayExpectedShots ?? null,
      teamSoT: params.awayExpectedSoT ?? null,
      oppSoT: params.homeExpectedSoT ?? null,
      starters: new Set((params.confirmedAwayStarters ?? []).map((n) => normKey(n))),
    },
  ];

  const usSport = platformSportToUsPropsSport(params.sport);

  for (const s of sides) {
    if (!s.squad || !isSafePublicLabel(s.teamName)) continue;
    const teamLookupSlugs = Array.from(
      new Set(
        [
          cleanTeamRouteSlug(s.teamSlug),
          s.teamSlug.trim().toLowerCase(),
          cleanTeamRouteSlug(s.rawTeamSlug),
          s.rawTeamSlug.trim().toLowerCase(),
          cleanTeamRouteSlug(s.squad.teamId),
        ].filter((v) => v.length > 0),
      ),
    );

    for (const player of s.squad.players) {
      if (!isSafePublicLabel(player.name)) continue;
      const pNorm = normKey(player.name);
      let reportedInjury: string | null = null;
      for (const slugCandidate of teamLookupSlugs) {
        const hit = canonicalInjuryMap.get(`${slugCandidate}|${pNorm}`);
        if (hit) {
          reportedInjury = hit;
          break;
        }
      }

      if (isHardBlockedAvailabilityV6(player.availability, reportedInjury)) {
        continue;
      }

      const availabilityStatus: "available" | "doubtful" = isDoubtfulAvailabilityV6(
        player.availability,
        reportedInjury,
      )
        ? "doubtful"
        : "available";
      const safePosition = isSafePublicLabel(player.positionLabel) ? player.positionLabel : null;

      if (params.sport === "football") {
        if (player.stats.appearances < 3) continue;
        const avgMinutes = extractStrictAvgMinutesFromSquadPlayer(player, "football");
        const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
          sport: "football",
          avgMinutes,
          availability: player.availability,
          injuryStatus: reportedInjury,
        });
        if (!guard.eligible || avgMinutes === null) continue;

        const isStarter = s.starters.size > 0 && s.starters.has(normKey(player.name));
        const lineupStatus: "confirmed" | "probable" | null = isStarter ? "confirmed" : "probable";

        if (player.positionGroup === "GK") {
          if (player.stats.saves < 3) continue;
          const gkEval = evaluateGoalkeeperSavesV6({
            playerName: player.name,
            saves: player.stats.saves,
            shotsFaced: player.stats.shotsFaced,
            goalsConceded: player.stats.goalsConceded,
            appearances: player.stats.appearances,
            subIns: player.stats.subIns,
            avgMinutes,
            oppExpectedSoT: s.oppSoT,
            oppProjectedGoals: s.oppProjGoals,
            availability: player.availability,
            injuryStatus: reportedInjury,
            allowFull: true,
          });
          const bestLine = selectPlayableCanonicalLine(gkEval.lines);
          if (
            gkEval.eligible &&
            bestLine &&
            bestLine.pOver !== null &&
            bestLine.pUnder !== null &&
            bestLine.fairOverDecimal !== null &&
            bestLine.fairUnderDecimal !== null &&
            gkEval.expectedSaves !== null
          ) {
            out.push({
              id: `${params.gameId}-v6-${player.slug}-saves-${bestLine.line}`,
              sport: "football",
              league: params.league,
              playerName: player.name,
              playerSlug: player.slug,
              teamSide: s.side,
              teamName: s.teamName,
              teamSlug: s.teamSlug,
              positionLabel: safePosition,
              photoKey: player.photoKey ?? null,
              fallbackPhotoKey: player.fallbackPhotoKey ?? null,
              marketKey: "player_saves",
              marketLabel: "Atajadas",
              unitEs: "atajadas",
              direction: "over",
              selectionLabel: bestLine.selectionLabel,
              line: bestLine.line,
              projectionMean: round2(gkEval.expectedSaves),
              projectionSd: round2(Math.max(0.85, Math.sqrt(Math.max(0.5, gkEval.expectedSaves)))),
              pOver: bestLine.pOver,
              pUnder: bestLine.pUnder,
              fairOverDecimal: bestLine.fairOverDecimal,
              fairUnderDecimal: bestLine.fairUnderDecimal,
              avgMinutes,
              sampleGames: player.stats.appearances,
              lineupStatus,
              availabilityStatus,
              engineName: "PitchLab Spacetime v6.0",
              source: "spacetime_goalkeeper_saves_v6",
              rationaleEs: `${player.stats.saves} atajadas en ${player.stats.appearances} PJ · proyección acoplada ${gkEval.expectedSaves.toFixed(2)} atajadas.`,
              recentValues: [],
              allCanonicalLines: gkEval.lines
                .filter(
                  (l): l is GuardedGoalkeeperSavesLineV6 & { pOver: number; fairOverDecimal: number } =>
                    l.pOver !== null && l.fairOverDecimal !== null,
                )
                .map((l) => ({
                  line: l.line,
                  pOver: l.pOver,
                  fairOverDecimal: l.fairOverDecimal,
                  selectionLabel: l.selectionLabel,
                })),
            });
          }
          continue;
        }

        const metricsToEval: ReadonlyArray<{
          readonly metric: CoupledShotMetricV6;
          readonly count: number;
          readonly minCount: number;
        }> = [
          { metric: "shots_on_target", count: player.stats.shotsOnTarget, minCount: 2 },
          { metric: "shots", count: player.stats.shots, minCount: 4 },
        ];

        for (const item of metricsToEval) {
          if (item.count < item.minCount) continue;
          const coupled = evaluateCoupledFootballShotsV6({
            metric: item.metric,
            playerName: player.name,
            positionGroup: player.positionGroup,
            positionLabel: player.positionLabel,
            seasonCount: item.count,
            seasonShotsTotal: player.stats.shots,
            appearances: player.stats.appearances,
            subIns: player.stats.subIns,
            avgMinutes,
            teamExpectedShots: s.teamShots,
            teamExpectedSoT: s.teamSoT,
            teamProjectedGoals: s.teamProjGoals,
            lineupStatus,
            availability: player.availability,
            injuryStatus: reportedInjury,
            allowFull: true,
          });
          const bestLine = selectPlayableCanonicalLine(coupled.lines);
          if (
            coupled.eligible &&
            bestLine &&
            bestLine.pOver !== null &&
            bestLine.pUnder !== null &&
            bestLine.fairOverDecimal !== null &&
            bestLine.fairUnderDecimal !== null &&
            coupled.muProjected !== null
          ) {
            out.push({
              id: `${params.gameId}-v6-${player.slug}-${bestLine.marketKey}-${bestLine.line}`,
              sport: "football",
              league: params.league,
              playerName: player.name,
              playerSlug: player.slug,
              teamSide: s.side,
              teamName: s.teamName,
              teamSlug: s.teamSlug,
              positionLabel: safePosition,
              photoKey: player.photoKey ?? null,
              fallbackPhotoKey: player.fallbackPhotoKey ?? null,
              marketKey: bestLine.marketKey,
              marketLabel: bestLine.marketLabel,
              unitEs: bestLine.unitEs,
              direction: "over",
              selectionLabel: bestLine.selectionLabel,
              line: bestLine.line,
              projectionMean: round2(coupled.muProjected),
              projectionSd: round2(Math.max(0.45, Math.sqrt(Math.max(0.3, coupled.muProjected)))),
              pOver: bestLine.pOver,
              pUnder: bestLine.pUnder,
              fairOverDecimal: bestLine.fairOverDecimal,
              fairUnderDecimal: bestLine.fairUnderDecimal,
              avgMinutes,
              sampleGames: player.stats.appearances,
              lineupStatus,
              availabilityStatus,
              engineName: "PitchLab Spacetime v6.0",
              source: "spacetime_coupled_shots_v6",
              rationaleEs: `${item.count} ${bestLine.unitEs} en ${player.stats.appearances} PJ · proyección acoplada ${coupled.muProjected.toFixed(2)} ${bestLine.unitEs}.`,
              recentValues: [],
              allCanonicalLines: coupled.lines
                .filter(
                  (l): l is GuardedCoupledShotLineV6 & { pOver: number; fairOverDecimal: number } =>
                    l.pOver !== null && l.fairOverDecimal !== null,
                )
                .map((l) => ({
                  line: l.line,
                  pOver: l.pOver,
                  fairOverDecimal: l.fairOverDecimal,
                  selectionLabel: l.selectionLabel,
                })),
            });
          }
        }
        continue;
      }

      if (usSport) {
        const seasonCols = (player.seasonMetrics ?? []).map((m) => ({
          key: m.key,
          label: m.label,
          value: m.value,
        }));
        const recentCols = (player.recentGames ?? []).map((rg) => ({
          stats: rg.stats.map((st) => ({ label: st.label, value: st.value })),
        }));
        if (seasonCols.length === 0 && recentCols.length === 0) continue;

        const usProps = evaluateGuardedUsPlayerPropsV6({
          sport: usSport,
          playerName: player.name,
          playerSlug: player.slug,
          teamSlug: s.teamSlug,
          teamName: s.teamName,
          positionLabel: player.positionLabel,
          availability: player.availability,
          injuryStatus: reportedInjury,
          injuryNote: player.injuryDetail ?? null,
          seasonMetrics: seasonCols,
          recentGames: recentCols,
        });

        for (const prop of usProps) {
          out.push({
            id: `${params.gameId}-v6-${usSport}-${player.slug}-${prop.metric.toLowerCase()}-${prop.line}`,
            sport: params.sport,
            league: params.league,
            playerName: prop.playerName,
            playerSlug: prop.playerSlug,
            teamSide: s.side,
            teamName: prop.teamName,
            teamSlug: prop.teamSlug,
            positionLabel: safePosition ?? prop.role,
            photoKey: player.photoKey ?? null,
            fallbackPhotoKey: player.fallbackPhotoKey ?? null,
            marketKey: `${usSport}_${prop.metric.toLowerCase()}`,
            marketLabel: prop.metricLabelEs,
            unitEs: prop.unitEs,
            direction: "over",
            selectionLabel: prop.selectionLabelOver,
            line: prop.line,
            projectionMean: round2(prop.muAdjusted),
            projectionSd: round2(prop.sdEffective),
            pOver: prop.pOver,
            pUnder: prop.pUnder,
            fairOverDecimal: prop.fairOverDecimal,
            fairUnderDecimal: prop.fairUnderDecimal,
            avgMinutes: prop.avgMinutes,
            sampleGames: prop.sampleGames,
            lineupStatus: null,
            availabilityStatus: prop.availabilityStatus,
            engineName: "PitchLab Spacetime v6.0",
            source: "spacetime_us_props_v6",
            rationaleEs: `Proyección ${prop.muAdjusted.toFixed(1)} ${prop.unitEs} en muestra de ${prop.sampleGames} JJ.`,
            recentValues: prop.recentValues,
          });
        }
      }
    }
  }

  return out;
}

function defaultLineFromValues(values: readonly number[]): {
  defaultLine: number;
  minLine: number;
  maxLine: number;
  step: number;
} {
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const maxVal = Math.max(...values, 1);
  if (maxVal >= 40) {
    const step = 5;
    const base = Math.max(4.5, Math.floor(avg / step) * step - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 25),
      maxLine: Math.ceil(maxVal / step) * step + 4.5,
      step,
    };
  }
  if (maxVal >= 12) {
    const step = 1;
    const base = Math.max(0.5, Math.floor(avg) - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 6),
      maxLine: Math.ceil(maxVal) + 2.5,
      step,
    };
  }
  const base = Math.max(0.5, Math.floor(avg) + 0.5);
  return {
    defaultLine: base,
    minLine: 0.5,
    maxLine: Math.max(3.5, Math.ceil(maxVal) + 0.5),
    step: 0.5,
  };
}

function formatKickoffMx(startTimeIso: string): string {
  try {
    const d = new Date(startTimeIso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    }).format(d);
  } catch (err) {
    void err;
    return "";
  }
}

function readSquadsFile(root: string, league: string): LeagueSquadsFile | null {
  const squadsPath = path.join(root, league, "squads.json");
  if (!fs.existsSync(squadsPath)) return null;
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(squadsPath, "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

export interface LeagueInjuryLookupEntry {
  readonly status: string;
  readonly detail: string | null;
}

const leagueInjuriesCache = new Map<
  string,
  { readonly mtimeMs: number; readonly map: ReadonlyMap<string, LeagueInjuryLookupEntry> }
>();

function safeOptionalPublicLabel(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || !isSafePublicLabel(trimmed)) return null;
  return trimmed;
}

export function readLeagueInjuriesMap(
  root: string,
  league: string,
): ReadonlyMap<string, LeagueInjuryLookupEntry> {
  const injPath = path.join(root, league, "injuries.json");
  if (!fs.existsSync(injPath)) {
    return new Map<string, LeagueInjuryLookupEntry>();
  }
  try {
    const mtimeMs = fs.statSync(injPath).mtimeMs;
    const cached = leagueInjuriesCache.get(injPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.map;
    }
    const raw = JSON.parse(fs.readFileSync(injPath, "utf8")) as {
      entries?: Array<{
        teamId?: string;
        player?: string;
        status?: string;
        detail?: string;
      }>;
    };
    const map = new Map<string, LeagueInjuryLookupEntry>();
    for (const entry of raw.entries ?? []) {
      const playerName = entry?.player?.trim();
      const teamId = entry?.teamId?.trim();
      const status = entry?.status?.trim();
      if (!playerName || !teamId || !status) continue;
      const pNorm = normKey(playerName);
      if (!pNorm) continue;
      const record: LeagueInjuryLookupEntry = {
        status,
        detail: safeOptionalPublicLabel(entry.detail),
      };
      const canonTeam = cleanTeamRouteSlug(teamId);
      const rawTeam = teamSlugFromId(teamId);
      if (canonTeam) map.set(`${canonTeam}|${pNorm}`, record);
      if (rawTeam) map.set(`${rawTeam}|${pNorm}`, record);
    }
    leagueInjuriesCache.set(injPath, { mtimeMs, map });
    return map;
  } catch (err) {
    void err;
    return new Map<string, LeagueInjuryLookupEntry>();
  }
}

function lookupLeagueInjury(
  injMap: ReadonlyMap<string, LeagueInjuryLookupEntry>,
  teamSlugs: readonly (string | null | undefined)[],
  playerName: string,
): LeagueInjuryLookupEntry | undefined {
  if (injMap.size === 0) return undefined;
  const pNorm = normKey(playerName);
  if (!pNorm) return undefined;
  for (const rawTeam of teamSlugs) {
    if (!rawTeam) continue;
    const canon = cleanTeamRouteSlug(rawTeam);
    if (canon) {
      const hit = injMap.get(`${canon}|${pNorm}`);
      if (hit) return hit;
    }
    const lower = teamSlugFromId(rawTeam);
    if (lower) {
      const hit = injMap.get(`${lower}|${pNorm}`);
      if (hit) return hit;
    }
  }
  return undefined;
}

function readSnapshotFile(root: string, league: string): LeagueSnapshot | null {
  const snapPath = path.join(root, league, "latest.json");
  if (!fs.existsSync(snapPath)) return null;
  try {
    const parsed = LeagueSnapshotSchema.safeParse(
      JSON.parse(fs.readFileSync(snapPath, "utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch (err) {
    void err;
    return null;
  }
}

function mapBridgeStatKeyToCode(statKey: NbaGuardedPlayerProp["statKey"]): NbaPropStatCode | null {
  if (statKey === "pts") return "PTS";
  if (statKey === "reb") return "REB";
  if (statKey === "ast") return "AST";
  if (statKey === "tpm") return "3PM";
  return null;
}

function normalizeSeasonMinutesPerGame(
  sport: PlatformSport,
  seasonMinMetric: { readonly key: string; readonly label: string; readonly value: string } | undefined,
  seasonGp: number,
  avgFromLogs: number | null,
): number | null {
  if (!seasonMinMetric) return null;
  const raw = parseNumericStat(seasonMinMetric.value);
  if (raw === null) return null;

  const k = seasonMinMetric.key.trim().toLowerCase();
  const l = seasonMinMetric.label.trim().toUpperCase();
  const isExplicitPerGame =
    k.includes("per_game") ||
    k.includes("avg") ||
    k === "mpg" ||
    l.includes("/P") ||
    l.includes("MPG");
  const isExplicitTotal = k.includes("total") || l.includes("TOTAL");

  if (sport === "basketball") {
    if (
      !isExplicitPerGame &&
      seasonGp > 1 &&
      (isExplicitTotal ||
        raw > 48 ||
        (avgFromLogs !== null && avgFromLogs > 0 && raw / avgFromLogs >= Math.max(2, seasonGp * 0.6)))
    ) {
      return round1(raw / seasonGp);
    }
    return round1(raw);
  }

  if (!isExplicitPerGame && seasonGp > 1 && (isExplicitTotal || raw > 110)) {
    return round1(raw / seasonGp);
  }
  return round1(raw);
}

function extractPlayerMinutesMeta(
  player: LeagueSquadsFile["teams"][number]["players"][number],
  sport: PlatformSport,
): { avgMinutes: number | null; minMinutesGuard: boolean; sampleGames: number } {
  const logs = player.recentGames ?? [];
  const logMins = logs
    .map((g) => {
      const hit = g.stats.find((s) => {
        const lbl = s.label.trim().toUpperCase();
        return lbl === "MIN" || lbl === "MINS" || lbl === "MINUTOS";
      });
      return hit ? parseNumericStat(hit.value) : null;
    })
    .filter((v): v is number => v !== null);

  const seasonMinMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return k === "min" || l === "MIN" || k === "min_per_game" || k === "mpg";
  });
  const seasonGpMetric = player.seasonMetrics?.find((m) => {
    const k = m.key.trim().toLowerCase();
    const l = m.label.trim().toUpperCase();
    return k === "gp" || l === "JJ" || l === "PJ";
  });

  const seasonGp =
    (seasonGpMetric ? parseNumericStat(seasonGpMetric.value) : null) ??
    player.stats.appearances;
  const avgFromLogs =
    logMins.length > 0
      ? round1(logMins.reduce((a, b) => a + b, 0) / logMins.length)
      : null;
  const seasonMinPerGame = normalizeSeasonMinutesPerGame(
    sport,
    seasonMinMetric,
    seasonGp,
    avgFromLogs,
  );

  if (sport === "basketball") {
    const avgMinutes = logMins.length >= 3 ? avgFromLogs : (seasonMinPerGame ?? avgFromLogs);
    const sampleGames = Math.max(logMins.length, Math.round(seasonGp));
    const qualifiedLogs = logMins.filter((m) => m >= NBA_MIN_MINUTES_PER_GAME).length;
    const totalSampleMin =
      logMins.length > 0
        ? logMins.reduce((a, b) => a + b, 0)
        : avgMinutes !== null && sampleGames > 0
          ? avgMinutes * sampleGames
          : 0;
    const minMinutesGuard =
      avgMinutes !== null &&
      avgMinutes >= NBA_MIN_MINUTES_PER_GAME &&
      sampleGames >= 3 &&
      totalSampleMin >= FOOTBALL_MIN_MINUTES &&
      (logMins.length < 3 || qualifiedLogs >= 3);
    return { avgMinutes, minMinutesGuard, sampleGames };
  }

  const avgMinutes = avgFromLogs ?? seasonMinPerGame;
  if (logMins.length > 0) {
    const qualifiedCount = logMins.filter((m) => m >= FOOTBALL_MIN_MINUTES).length;
    const minMinutesGuard =
      qualifiedCount >= 3 &&
      avgFromLogs !== null &&
      avgFromLogs >= FOOTBALL_MIN_MINUTES;
    return { avgMinutes: avgFromLogs, minMinutesGuard, sampleGames: qualifiedCount };
  }

  if (seasonMinPerGame !== null) {
    const sampleGames = Math.max(0, Math.round(seasonGp));
    const minMinutesGuard =
      seasonMinPerGame >= FOOTBALL_MIN_MINUTES && sampleGames >= 3;
    return { avgMinutes: seasonMinPerGame, minMinutesGuard, sampleGames };
  }

  const apps = player.stats.appearances;
  if (sport === "football") {
    return { avgMinutes: null, minMinutesGuard: false, sampleGames: apps };
  }

  const starts = Math.max(0, apps - player.stats.subIns);
  const starterRatio = apps > 0 ? starts / apps : 0;
  const minMinutesGuard = apps >= 3 && (starts >= 3 || starterRatio >= 0.5);
  return { avgMinutes, minMinutesGuard, sampleGames: apps };
}

function classifyRigorFromAvgYellow(avgYellow: number | null | undefined): string | null {
  if (avgYellow == null || !Number.isFinite(avgYellow)) return null;
  if (avgYellow >= 4.6) return "Estricto";
  if (avgYellow <= 3.6) return "Permisivo";
  return "Promedio";
}

function findLineupStatusInSnapshot(
  snapshot: LeagueSnapshot | null,
  gameId: string,
  teamSlug: string,
  playerName: string,
): "confirmed" | "probable" | null {
  if (!snapshot) return null;
  const game = snapshot.games.find((g) => g.id === gameId);
  const lineups = snapshot.analyses[gameId]?.lineups;
  if (!game || !lineups) return null;

  const targetTeam = teamSlug.trim().toLowerCase();
  const isHome = teamSlugFromId(game.home.id) === targetTeam;
  const isAway = teamSlugFromId(game.away.id) === targetTeam;
  if (!isHome && !isAway) return null;

  const starters = isHome ? lineups.home.starters : lineups.away.starters;
  const pKey = normKey(playerName);
  const pLast = pKey.split(" ").pop() ?? "";
  const matched = starters.some((s) => {
    const sKey = normKey(s.name);
    if (!sKey) return false;
    if (sKey === pKey) return true;
    const sLast = sKey.split(" ").pop() ?? "";
    return pLast.length >= 5 && pLast === sLast;
  });
  if (!matched) return null;
  return lineups.status === "confirmed" ? "confirmed" : "probable";
}

function extractRefereeSummaryFromSnapshot(
  snapshot: LeagueSnapshot | null,
  gameId: string,
): PropsLabRefereeSummary | null {
  if (!snapshot) return null;
  const game = snapshot.games.find((g) => g.id === gameId);
  const ctx = snapshot.analyses[gameId]?.matchContext;
  const refName = (game?.referee ?? ctx?.referee ?? "").trim();
  if (!refName) return null;
  const stats = ctx?.refereeStats;
  const avgYellow = stats?.avgYellow ?? null;
  const avgFouls = stats?.avgFouls ?? null;
  if (avgYellow === null && avgFouls === null) return null;
  return {
    name: refName,
    avgYellow,
    avgFouls,
    rigorLabel: classifyRigorFromAvgYellow(avgYellow),
  };
}

let cachedExplorer: { at: number; items: ExplorerStreakCard[] } | null = null;
const EXPLORER_TTL_MS = 10 * 60_000;

export function loadPlayerPropStreakCards(maxCards = 36): ExplorerStreakCard[] {
  const now = Date.now();
  if (cachedExplorer && now - cachedExplorer.at < EXPLORER_TTL_MS) {
    return cachedExplorer.items.slice(0, maxCards);
  }

  const root = resolveSnapshotsRoot();
  const cards: ExplorerStreakCard[] = [];
  const seenCardIds = new Set<string>();

  const nbaInjuries = loadNbaInjuriesBridge();
  const nbaInjuryByKey = new Map<string, NbaRealInjuryBridgeItem>();
  for (const inj of nbaInjuries) {
    nbaInjuryByKey.set(`${inj.teamSlug}|${normKey(inj.player)}`, inj);
  }

  const nbaBridgeProps = loadNbaGuardedPropsBridge({ injuries: nbaInjuries });
  if (nbaBridgeProps.length > 0) {
    const grouped = new Map<
      string,
      {
        player: string;
        teamSlug: string;
        teamName: string;
        position: string;
        avgMinutes: number | null;
        availabilityStatus: "available" | "doubtful";
        series: PropMetricSeries[];
      }
    >();

    for (const bp of nbaBridgeProps) {
      if (!isSafePublicLabel(bp.player) || !isSafePublicLabel(bp.teamName)) continue;
      const code = mapBridgeStatKeyToCode(bp.statKey);
      if (!code || bp.last10.length < 3) continue;
      const gKey = `${bp.teamSlug}|${normKey(bp.player)}`;
      const bucket = grouped.get(gKey) ?? {
        player: bp.player,
        teamSlug: bp.teamSlug,
        teamName: bp.teamName,
        position: bp.position,
        avgMinutes: bp.avgMinutes,
        availabilityStatus: bp.availabilityStatus,
        series: [],
      };
      if (!bucket.series.some((s) => s.key === code.toLowerCase())) {
        const bounds = defaultLineFromValues(bp.last10);
        bucket.series.push({
          key: code.toLowerCase(),
          label: code,
          unit: code.toLowerCase(),
          defaultLine: bp.baseLine,
          minLine: bounds.minLine,
          maxLine: bounds.maxLine,
          step: code === "PTS" ? 1 : 0.5,
          points: bp.last10
            .slice()
            .reverse()
            .map((value, idx) => ({
              label: `#${idx + 1}`,
              value,
            })),
        });
      }
      grouped.set(gKey, bucket);
    }

    const nbaLeagueId: LeagueId = asLeagueId("nba");
    let nbaBridgeCount = 0;
    for (const item of grouped.values()) {
      if (item.series.length === 0) continue;
      const playerSlug = slugifyPlayerName(item.player);
      const id = `nba:${item.teamSlug}:${playerSlug}`;
      if (seenCardIds.has(id)) continue;
      seenCardIds.add(id);
      cards.push({
        id,
        sport: "basketball",
        league: nbaLeagueId,
        leagueLabel: COMPETITION_BY_ID["nba"]?.label ?? "NBA",
        playerName: item.player,
        teamName: item.teamName,
        teamSlug: item.teamSlug,
        positionLabel: item.position,
        series: item.series.slice(0, 4),
        playerHref: canonicalPlayerHref(nbaLeagueId, item.teamSlug, playerSlug),
        avgMinutes: item.avgMinutes,
        minMinutesGuard: true,
        availabilityStatus: item.availabilityStatus,
      });
      nbaBridgeCount += 1;
      if (nbaBridgeCount >= 8) break;
    }
  }

  const prioritizedLeagues: readonly ProductLeague[] = [
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "liga-mx",
    "premier-league",
    "laliga",
    "champions-league",
    "mls",
    ...PRODUCT_LEAGUES,
  ];
  const seenLeagues = new Set<string>();

  for (const lg of prioritizedLeagues) {
    if (seenLeagues.has(lg)) continue;
    seenLeagues.add(lg);
    const squads = readSquadsFile(root, lg);
    if (!squads) continue;

    let perLeagueCount = 0;
    const leagueId: LeagueId = asLeagueId(lg);
    const sport = sportForLeague(lg);
    const leagueLabel = COMPETITION_BY_ID[lg]?.label ?? lg;
    const prefLabels = METRIC_PRIORITY[sport] ?? [];

    const leagueInjMap = readLeagueInjuriesMap(root, lg);

    for (const team of squads.teams) {
      if (!isSafePublicLabel(team.teamName)) continue;
      for (const player of team.players) {
        if (!isSafePublicLabel(player.name)) continue;
        const leagueInj = lookupLeagueInjury(
          leagueInjMap,
          [team.teamSlug, team.teamId],
          player.name,
        );
        const nbaInj =
          lg === "nba"
            ? nbaInjuryByKey.get(`${team.teamSlug.toLowerCase()}|${normKey(player.name)}`)
            : undefined;
        const reportedStatus = nbaInj?.status ?? leagueInj?.status ?? null;
        if (
          isHardBlockedAvailabilityV6(player.availability, reportedStatus) ||
          isHardBlockedAvailabilityV6(null, leagueInj?.status)
        ) {
          continue;
        }

        const logs = player.recentGames;
        if (!logs || logs.length < 3) continue;

        const minutesMeta = extractPlayerMinutesMeta(player, sport);
        if ((sport === "football" || sport === "basketball") && !minutesMeta.minMinutesGuard) {
          continue;
        }

        const id = `${lg}:${team.teamSlug}:${player.slug}`;
        if (seenCardIds.has(id)) continue;

        const allLabels = Array.from(
          new Set(logs.flatMap((g) => g.stats.map((s) => s.label))),
        );
        const countingLabels = allLabels.filter(
          (lbl) => !NON_PROP_STAT_LABELS.has(lbl.trim().toUpperCase()),
        );
        const statLabels = countingLabels.length > 0 ? countingLabels : allLabels;
        const orderedLabels = [
          ...prefLabels.filter((lbl) => statLabels.includes(lbl)),
          ...statLabels.filter((lbl) => !prefLabels.includes(lbl)),
        ].slice(0, 6);

        const series: PropMetricSeries[] = [];
        for (const lbl of orderedLabels) {
          const pts = logs
            .slice()
            .reverse()
            .map((g) => {
              const minHit = g.stats.find((s) => {
                const u = s.label.trim().toUpperCase();
                return u === "MIN" || u === "MINS" || u === "MINUTOS";
              });
              const minVal = minHit ? parseNumericStat(minHit.value) : null;
              if (sport === "football" && (minVal === null || minVal < FOOTBALL_MIN_MINUTES)) {
                return null;
              }
              if (sport === "basketball" && (minVal === null || minVal < NBA_MIN_MINUTES_PER_GAME)) {
                return null;
              }
              const hit = g.stats.find((s) => s.label === lbl);
              const val = hit ? parseNumericStat(hit.value) : null;
              if (val === null) return null;
              const xgHit =
                sport === "football"
                  ? g.stats.find((s) => s.label.trim().toUpperCase() === "XG")
                  : undefined;
              const xgVal = xgHit ? parseNumericStat(xgHit.value) : null;
              return {
                label: (g.opponentAbbr ?? g.opponent).slice(0, 8),
                opponent: g.opponent,
                date: g.dateIso,
                value: val,
                ...(minVal !== null ? { minutes: Math.round(minVal) } : {}),
                ...(xgVal !== null ? { xg: xgVal } : {}),
                ...(g.isHome === true || g.isHome === false ? { isHome: g.isHome } : {}),
              };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);

          if (pts.length < 3) continue;
          const values = pts.map((p) => p.value);
          if (Math.max(...values) <= 0) continue;
          const bounds = defaultLineFromValues(values);
          series.push({
            key: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            label: lbl,
            unit: lbl.toLowerCase(),
            defaultLine: bounds.defaultLine,
            minLine: bounds.minLine,
            maxLine: bounds.maxLine,
            step: bounds.step,
            points: pts,
          });
        }

        if (series.length === 0) continue;
        seenCardIds.add(id);

        cards.push({
          id,
          sport,
          league: leagueId,
          leagueLabel,
          playerName: player.name,
          teamName: team.teamName,
          teamSlug: team.teamSlug,
          photoKey: player.photoKey && resolvePersonPhotoUrl(player.photoKey) ? player.photoKey : null,
          positionLabel: player.positionLabel,
          series,
          playerHref: canonicalPlayerHref(leagueId, team.teamSlug, player.slug),
          avgMinutes: minutesMeta.avgMinutes,
          minMinutesGuard: minutesMeta.minMinutesGuard,
          availabilityStatus: isDoubtfulAvailabilityV6(player.availability, reportedStatus)
            ? "doubtful"
            : "available",
        });
        perLeagueCount += 1;
        if (perLeagueCount >= 6) break;
      }
      if (perLeagueCount >= 6) break;
    }

    if (cards.length >= 48) break;
  }

  cachedExplorer = { at: now, items: cards };
  return cards.slice(0, maxCards);
}

function lineStepAndSpanForUsMetric(
  sport: UsPropsSportV6,
  metric: string,
): { readonly step: number; readonly span: number } {
  if (sport === "nfl" && metric === "YDS") return { step: 5, span: 25 };
  if (sport === "nfl" && (metric === "ATT" || metric === "CMP" || metric === "CAR")) {
    return { step: 1, span: 5 };
  }
  if (sport === "nba" && metric === "PTS") return { step: 1, span: 5 };
  return { step: 0.5, span: 2.5 };
}

export function loadStructuredPlayerProps(options: {
  fullAccess: boolean;
  baseProps?: readonly PlayerPropItem[];
  maxItems?: number;
}): PropsLabPlayerPropItem[] {
  if (!options.fullAccess) {
    return [];
  }

  const maxItems = options.maxItems ?? 120;
  const root = resolveSnapshotsRoot();
  const out: PropsLabPlayerPropItem[] = [];
  const seenIds = new Set<string>();

  const nbaLeagueId: LeagueId = asLeagueId("nba");
  const nbaLeagueLabel = COMPETITION_BY_ID["nba"]?.label ?? "NBA";
  const nbaSnapshot = readSnapshotFile(root, "nba");
  const nbaSquads = readSquadsFile(root, "nba");
  const nbaInjuries = loadNbaInjuriesBridge();
  const nbaInjuryByKey = new Map<string, NbaRealInjuryBridgeItem>();
  for (const inj of nbaInjuries) {
    nbaInjuryByKey.set(`${inj.teamSlug}|${normKey(inj.player)}`, inj);
  }

  const upcomingNbaGames = (nbaSnapshot?.games ?? []).filter(
    (g) => g.status === "scheduled" || g.status === "in_progress",
  );
  const upcomingNbaByTeam = new Map<
    string,
    { gameId: string; matchLabel: string; kickoffLocal: string; opponentShort: string }
  >();
  for (const g of upcomingNbaGames) {
    const hSlug = teamSlugFromId(g.home.id);
    const aSlug = teamSlugFromId(g.away.id);
    const matchLabel = `${g.away.shortName} @ ${g.home.shortName}`;
    const kickoffLocal = formatKickoffMx(g.startTime);
    if (!upcomingNbaByTeam.has(hSlug)) {
      upcomingNbaByTeam.set(hSlug, {
        gameId: g.id,
        matchLabel,
        kickoffLocal,
        opponentShort: g.away.shortName,
      });
    }
    if (!upcomingNbaByTeam.has(aSlug)) {
      upcomingNbaByTeam.set(aSlug, {
        gameId: g.id,
        matchLabel,
        kickoffLocal,
        opponentShort: g.home.shortName,
      });
    }
  }

  const nbaPlayerSlugByKey = new Map<string, string>();
  if (nbaSquads) {
    for (const team of nbaSquads.teams) {
      for (const p of team.players) {
        nbaPlayerSlugByKey.set(`${team.teamSlug.toLowerCase()}|${normKey(p.name)}`, p.slug);
      }
    }
  }

  const guardedNbaBridge = loadNbaGuardedPropsBridge({ injuries: nbaInjuries });
  for (const bp of guardedNbaBridge) {
    if (!isSafePublicLabel(bp.player) || !isSafePublicLabel(bp.teamName)) continue;
    const code = mapBridgeStatKeyToCode(bp.statKey);
    if (!code) continue;
    const matchInfo = upcomingNbaByTeam.get(bp.teamSlug.toLowerCase());
    if (!matchInfo) continue;

    const pSlug =
      nbaPlayerSlugByKey.get(`${bp.teamSlug.toLowerCase()}|${normKey(bp.player)}`) ??
      slugifyPlayerName(bp.player);
    const id = `nba-prop:${matchInfo.gameId}:${bp.teamSlug}:${pSlug}:${code.toLowerCase()}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const isPts = code === "PTS";
    const step = isPts ? 1 : 0.5;
    const span = isPts ? 5 : 2.5;
    const minNote = bp.avgMinutes !== null ? ` · ${bp.avgMinutes.toFixed(1)} min/p` : "";

    out.push({
      id,
      league: nbaLeagueId,
      leagueLabel: nbaLeagueLabel,
      sport: "basketball",
      gameId: matchInfo.gameId,
      matchLabel: matchInfo.matchLabel,
      kickoffLocal: matchInfo.kickoffLocal,
      player: bp.player,
      teamSlug: bp.teamSlug,
      teamName: bp.teamName,
      position: bp.position || "NBA",
      statLabel: NBA_STAT_LABEL_MAP[code],
      statCode: code,
      baseLine: bp.baseLine,
      step,
      minLine: Math.max(0.5, round1(bp.baseLine - span)),
      maxLine: round1(bp.baseLine + span),
      projectionMean: bp.projectionMean,
      projectionSd: Math.max(0.6, bp.projectionSd),
      engineName: "Spacetime Props v6.0",
      marketOverDecimal: bp.fairOverDecimal,
      marketUnderDecimal: bp.fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      last10: bp.last10.slice(0, 10),
      contextNote: `Proyección Spacetime NBA con muestra de ${bp.sampleGames} juegos${minNote} frente a ${matchInfo.opponentShort}.`,
      avgMinutes: bp.avgMinutes,
      sampleGames: bp.sampleGames,
      minMinutesGuard: true,
      availabilityStatus: bp.availabilityStatus,
      injuryNote: safeOptionalPublicLabel(bp.injuryNote),
      playerHref: canonicalPlayerHref(nbaLeagueId, bp.teamSlug, pSlug),
    });
  }

  if (nbaSquads && upcomingNbaGames.length > 0) {
    let nbaDerivedCount = 0;
    for (const game of upcomingNbaGames.slice(0, 14)) {
      const sides = [
        { slug: teamSlugFromId(game.home.id), opponent: game.away.shortName },
        { slug: teamSlugFromId(game.away.id), opponent: game.home.shortName },
      ];
      const matchLabel = `${game.away.shortName} @ ${game.home.shortName}`;
      const kickoffLocal = formatKickoffMx(game.startTime);

      for (const side of sides) {
        const teamEntry = nbaSquads.teams.find(
          (t) => t.teamSlug.toLowerCase() === side.slug,
        );
        if (!teamEntry || !isSafePublicLabel(teamEntry.teamName)) continue;

        const rankedPlayers = teamEntry.players
          .filter((p) => {
            if (!isSafePublicLabel(p.name)) return false;
            const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(p.name)}`);
            if (isHardBlockedAvailabilityV6(p.availability, inj?.status)) return false;
            const meta = extractPlayerMinutesMeta(p, "basketball");
            return meta.minMinutesGuard;
          })
          .sort((a, b) => {
            const aPts =
              parseNumericStat(
                a.seasonMetrics?.find((m) => m.key === "pts" || m.label === "PTS")?.value ?? "",
              ) ?? 0;
            const bPts =
              parseNumericStat(
                b.seasonMetrics?.find((m) => m.key === "pts" || m.label === "PTS")?.value ?? "",
              ) ?? 0;
            return bPts - aPts;
          })
          .slice(0, 2);

        for (const player of rankedPlayers) {
          const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(player.name)}`);
          const v6Props = evaluateGuardedUsPlayerPropsV6({
            sport: "nba",
            playerName: player.name,
            playerSlug: player.slug,
            teamSlug: teamEntry.teamSlug,
            teamName: teamEntry.teamName,
            positionLabel: player.positionLabel,
            availability: player.availability,
            injuryStatus: inj?.status ?? null,
            injuryNote: safeOptionalPublicLabel(inj?.detail ?? player.injuryDetail),
            seasonMetrics: (player.seasonMetrics ?? []).map((m) => ({
              key: m.key,
              label: m.label,
              value: m.value,
            })),
            recentGames: (player.recentGames ?? []).map((rg) => ({
              stats: rg.stats.map((st) => ({ label: st.label, value: st.value })),
            })),
          });

          for (const prop of v6Props) {
            const id = `nba-prop:${game.id}:${teamEntry.teamSlug}:${player.slug}:${prop.metric.toLowerCase()}`;
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            const { step, span } = lineStepAndSpanForUsMetric("nba", prop.metric);
            const minNote =
              prop.avgMinutes !== null ? ` · ${prop.avgMinutes.toFixed(1)} min/p` : "";

            out.push({
              id,
              league: nbaLeagueId,
              leagueLabel: nbaLeagueLabel,
              sport: "basketball",
              gameId: game.id,
              matchLabel,
              kickoffLocal,
              player: prop.playerName,
              teamSlug: teamEntry.teamSlug,
              teamName: teamEntry.teamName,
              position: player.positionLabel || prop.role,
              statLabel: prop.metricLabelEs,
              statCode: prop.metric,
              baseLine: prop.line,
              step,
              minLine: Math.max(0.5, round1(prop.line - span)),
              maxLine: round1(prop.line + span),
              projectionMean: round2(prop.muAdjusted),
              projectionSd: round2(Math.max(0.6, prop.sdEffective)),
              engineName: "Spacetime Props v6.0",
              marketOverDecimal: prop.fairOverDecimal,
              marketUnderDecimal: prop.fairUnderDecimal,
              hasVerifiedMarketQuote: false,
              last10: [...prop.recentValues],
              contextNote: `Proyección Spacetime v6.0 (${prop.muAdjusted.toFixed(1)} ${prop.unitEs}) en ${prop.sampleGames} JJ${minNote} frente a ${side.opponent}.`,
              avgMinutes: prop.avgMinutes,
              sampleGames: prop.sampleGames,
              minMinutesGuard: true,
              availabilityStatus: prop.availabilityStatus,
              injuryNote: prop.injuryNote,
              playerHref: canonicalPlayerHref(nbaLeagueId, teamEntry.teamSlug, player.slug),
            });
            nbaDerivedCount += 1;
            if (nbaDerivedCount >= 44) break;
          }
          if (nbaDerivedCount >= 44) break;
        }
        if (nbaDerivedCount >= 44) break;
      }
      if (nbaDerivedCount >= 44) break;
    }
  }

  const extraUsLeagues: ReadonlyArray<{
    readonly league: "mlb" | "nhl" | "nfl";
    readonly sport: PlatformSport;
    readonly maxPerLeague: number;
  }> = [
    { league: "mlb", sport: "baseball", maxPerLeague: 18 },
    { league: "nhl", sport: "ice-hockey", maxPerLeague: 18 },
    { league: "nfl", sport: "american-football", maxPerLeague: 18 },
  ];

  for (const cfg of extraUsLeagues) {
    if (out.length >= maxItems) break;
    const squads = readSquadsFile(root, cfg.league);
    const snapshot = readSnapshotFile(root, cfg.league);
    if (!squads || !snapshot) continue;

    const upcomingGames = snapshot.games
      .filter((g) => g.status === "scheduled" || g.status === "in_progress")
      .slice(0, 10);
    if (upcomingGames.length === 0) continue;

    const leagueInjMap = readLeagueInjuriesMap(root, cfg.league);
    const leagueId = asLeagueId(cfg.league);
    const leagueLabel = COMPETITION_BY_ID[cfg.league]?.label ?? cfg.league.toUpperCase();
    let leagueAdded = 0;

    for (const game of upcomingGames) {
      const sides = [
        { slug: teamSlugFromId(game.home.id), rawId: game.home.id, opponent: game.away.shortName },
        { slug: teamSlugFromId(game.away.id), rawId: game.away.id, opponent: game.home.shortName },
      ];
      const matchLabel = `${game.away.shortName} @ ${game.home.shortName}`;
      const kickoffLocal = formatKickoffMx(game.startTime);

      for (const side of sides) {
        const teamEntry = squads.teams.find(
          (t) =>
            t.teamSlug.toLowerCase() === side.slug ||
            cleanTeamRouteSlug(t.teamSlug) === cleanTeamRouteSlug(side.slug),
        );
        if (!teamEntry || !isSafePublicLabel(teamEntry.teamName)) continue;

        for (const player of teamEntry.players.slice(0, 6)) {
          if (!isSafePublicLabel(player.name)) continue;
          const leagueInj = lookupLeagueInjury(
            leagueInjMap,
            [teamEntry.teamSlug, teamEntry.teamId, side.slug, side.rawId],
            player.name,
          );
          if (isHardBlockedAvailabilityV6(player.availability, leagueInj?.status)) continue;

          const v6Props = evaluateGuardedUsPlayerPropsV6({
            sport: cfg.league,
            playerName: player.name,
            playerSlug: player.slug,
            teamSlug: teamEntry.teamSlug,
            teamName: teamEntry.teamName,
            positionLabel: player.positionLabel,
            availability: player.availability,
            injuryStatus: leagueInj?.status ?? null,
            injuryNote: safeOptionalPublicLabel(leagueInj?.detail ?? player.injuryDetail),
            seasonMetrics: (player.seasonMetrics ?? []).map((m) => ({
              key: m.key,
              label: m.label,
              value: m.value,
            })),
            recentGames: (player.recentGames ?? []).map((rg) => ({
              stats: rg.stats.map((st) => ({ label: st.label, value: st.value })),
            })),
          });

          for (const prop of v6Props.slice(0, 2)) {
            const id = `${cfg.league}-prop:${game.id}:${teamEntry.teamSlug}:${player.slug}:${prop.metric.toLowerCase()}`;
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            const { step, span } = lineStepAndSpanForUsMetric(cfg.league, prop.metric);
            out.push({
              id,
              league: leagueId,
              leagueLabel,
              sport: cfg.sport,
              gameId: game.id,
              matchLabel,
              kickoffLocal,
              player: prop.playerName,
              teamSlug: teamEntry.teamSlug,
              teamName: teamEntry.teamName,
              position: player.positionLabel || prop.role,
              statLabel: prop.metricLabelEs,
              statCode: prop.metric,
              baseLine: prop.line,
              step,
              minLine: Math.max(0.5, round1(prop.line - span)),
              maxLine: round1(prop.line + span),
              projectionMean: round2(prop.muAdjusted),
              projectionSd: round2(Math.max(0.5, prop.sdEffective)),
              engineName: "Spacetime Props v6.0",
              marketOverDecimal: prop.fairOverDecimal,
              marketUnderDecimal: prop.fairUnderDecimal,
              hasVerifiedMarketQuote: false,
              last10: [...prop.recentValues],
              contextNote: `Proyección Spacetime v6.0 (${prop.muAdjusted.toFixed(1)} ${prop.unitEs}) en ${prop.sampleGames} JJ frente a ${side.opponent}.`,
              avgMinutes: prop.avgMinutes,
              sampleGames: prop.sampleGames,
              minMinutesGuard: true,
              availabilityStatus: prop.availabilityStatus,
              injuryNote: prop.injuryNote,
              playerHref: canonicalPlayerHref(leagueId, teamEntry.teamSlug, player.slug),
            });
            leagueAdded += 1;
            if (leagueAdded >= cfg.maxPerLeague || out.length >= maxItems) break;
          }
          if (leagueAdded >= cfg.maxPerLeague || out.length >= maxItems) break;
        }
        if (leagueAdded >= cfg.maxPerLeague || out.length >= maxItems) break;
      }
      if (leagueAdded >= cfg.maxPerLeague || out.length >= maxItems) break;
    }
  }

  const squadsByLeague = new Map<string, LeagueSquadsFile | null>();
  const snapshotByLeague = new Map<string, LeagueSnapshot | null>();
  const injuriesByLeague = new Map<string, ReadonlyMap<string, LeagueInjuryLookupEntry>>();

  for (const rawProp of options.baseProps ?? []) {
    if (!isSafePublicLabel(rawProp.player) || !isSafePublicLabel(rawProp.statLabel)) continue;
    const sport = sportForLeague(String(rawProp.league));
    if (sport === "basketball") {
      continue;
    }
    if (seenIds.has(rawProp.id)) continue;

    const lgKey = String(rawProp.league);
    let squads = squadsByLeague.get(lgKey);
    if (squads === undefined) {
      squads = readSquadsFile(root, lgKey);
      squadsByLeague.set(lgKey, squads);
    }
    let snapshot = snapshotByLeague.get(lgKey);
    if (snapshot === undefined) {
      snapshot = readSnapshotFile(root, lgKey);
      snapshotByLeague.set(lgKey, snapshot);
    }
    let leagueInjMap = injuriesByLeague.get(lgKey);
    if (leagueInjMap === undefined) {
      leagueInjMap = readLeagueInjuriesMap(root, lgKey);
      injuriesByLeague.set(lgKey, leagueInjMap);
    }

    const teamEntry = squads?.teams.find(
      (t) =>
        t.teamSlug.toLowerCase() === rawProp.teamSlug.toLowerCase() ||
        cleanTeamRouteSlug(t.teamSlug) === cleanTeamRouteSlug(rawProp.teamSlug),
    );
    const matchedPlayer = teamEntry?.players.find(
      (p) => normKey(p.name) === normKey(rawProp.player),
    );
    const leagueInj = lookupLeagueInjury(
      leagueInjMap,
      [rawProp.teamSlug, teamEntry?.teamSlug, teamEntry?.teamId],
      matchedPlayer?.name ?? rawProp.player,
    );
    if (isHardBlockedAvailabilityV6(matchedPlayer?.availability, leagueInj?.status)) {
      continue;
    }

    const minutesMeta = matchedPlayer
      ? extractPlayerMinutesMeta(matchedPlayer, sport)
      : { avgMinutes: null, minMinutesGuard: false, sampleGames: 0 };
    if (!minutesMeta.minMinutesGuard) {
      continue;
    }

    const lineupStatus = findLineupStatusInSnapshot(
      snapshot,
      rawProp.gameId,
      rawProp.teamSlug,
      rawProp.player,
    );
    const refereeSummary =
      sport === "football"
        ? extractRefereeSummaryFromSnapshot(snapshot, rawProp.gameId)
        : null;
    const availabilityStatus: "available" | "doubtful" = isDoubtfulAvailabilityV6(
      matchedPlayer?.availability,
      leagueInj?.status,
    )
      ? "doubtful"
      : "available";

    let fairOverDecimal: number;
    let fairUnderDecimal: number;
    let resolvedEngineName = rawProp.engineName;

    if (sport === "football") {
      if (minutesMeta.avgMinutes === null || minutesMeta.avgMinutes < FOOTBALL_MIN_MINUTES) {
        continue;
      }
      const snapGame = snapshot?.games.find((g) => g.id === rawProp.gameId) ?? null;
      const snapAnalysis = snapshot?.analyses[rawProp.gameId] ?? null;
      const matchCtx = snapAnalysis?.matchContext ?? null;
      const targetTeam = rawProp.teamSlug.trim().toLowerCase();
      const isHome = snapGame ? teamSlugFromId(snapGame.home.id) === targetTeam : false;
      const isAway = snapGame ? teamSlugFromId(snapGame.away.id) === targetTeam : false;
      const teamProjectedGoals =
        snapAnalysis?.projection && (isHome || isAway)
          ? isHome
            ? snapAnalysis.projection.home
            : snapAnalysis.projection.away
          : null;
      const oppProjectedGoals =
        snapAnalysis?.projection && (isHome || isAway)
          ? isHome
            ? snapAnalysis.projection.away
            : snapAnalysis.projection.home
          : null;

      const footballEv = evaluateFootballPropV6({
        playerName: rawProp.player,
        statLabel: rawProp.statLabel,
        propId: rawProp.id,
        line: rawProp.baseLine,
        projectionMean: rawProp.projectionMean,
        projectionSd: rawProp.projectionSd,
        league: lgKey,
        positionGroup: matchedPlayer?.positionGroup ?? rawProp.position,
        positionLabel: matchedPlayer?.positionLabel ?? rawProp.position,
        avgMinutes: minutesMeta.avgMinutes,
        sampleGames: minutesMeta.sampleGames,
        playerStats: matchedPlayer?.stats ?? null,
        lineupStatus,
        availabilityStatus,
        availability: matchedPlayer?.availability ?? availabilityStatus,
        injuryStatus: leagueInj?.status ?? null,
        refereeName: snapGame?.referee ?? matchCtx?.referee ?? refereeSummary?.name ?? null,
        refereeAvgYellow: refereeSummary?.avgYellow ?? null,
        round: snapGame?.round ?? null,
        stageName: matchCtx?.stageName ?? snapGame?.phase ?? null,
        previousLegGameId: matchCtx?.previousLegGameId ?? null,
        teamProjectedGoals,
        oppProjectedGoals,
        allowFull: true,
      });
      if (
        !footballEv.eligible ||
        footballEv.fairOverDecimal === null ||
        footballEv.fairUnderDecimal === null
      ) {
        continue;
      }
      fairOverDecimal = footballEv.fairOverDecimal;
      fairUnderDecimal = footballEv.fairUnderDecimal;
      if (
        footballEv.source === "spacetime_coupled_shots_v6" ||
        footballEv.source === "spacetime_goalkeeper_saves_v6"
      ) {
        resolvedEngineName = "Spacetime Props v6.0";
      }
    } else {
      const ev = evaluateContinuousOverProb(
        rawProp.projectionMean,
        rawProp.projectionSd,
        rawProp.baseLine,
      );
      fairOverDecimal = ev.fairOverDecimal;
      fairUnderDecimal = ev.fairUnderDecimal;
    }

    seenIds.add(rawProp.id);
    out.push({
      ...rawProp,
      sport,
      engineName: resolvedEngineName,
      marketOverDecimal: fairOverDecimal,
      marketUnderDecimal: fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      avgMinutes: minutesMeta.avgMinutes,
      sampleGames: minutesMeta.sampleGames > 0 ? minutesMeta.sampleGames : null,
      minMinutesGuard: minutesMeta.minMinutesGuard,
      lineupStatus,
      availabilityStatus,
      injuryNote: safeOptionalPublicLabel(leagueInj?.detail ?? matchedPlayer?.injuryDetail),
      playerHref: matchedPlayer
        ? canonicalPlayerHref(rawProp.league, rawProp.teamSlug, matchedPlayer.slug)
        : null,
      refereeSummary,
    });

    if (out.length >= maxItems) break;
  }

  return out.slice(0, maxItems);
}

export { CANONICAL_GK_SAVES_LINES_V6, CANONICAL_SHOT_LINES_V6 };
