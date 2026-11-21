import fs from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  LeagueSnapshotSchema,
  LeagueSquadsFileSchema,
  asLeagueId,
  canonicalPlayerHref,
  isKnockoutCupCompetition,
  parseStrictFiniteNumber,
  slugifyPlayerName,
  sportForLeague,
  type LeagueId,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlatformSport,
  type SquadPlayerStats,
} from "@pitchlab/contracts";
import type {
  NbaPropStatCode,
  PropsLabPlayerPropItem,
  PropsLabRefereeSummary,
  PropsStreakExplorerItem,
} from "@pitchlab/ui/parlays";
import type { PropMetricSeries } from "@pitchlab/ui/prop-streak-card";
import type { PlayerPropItem } from "@pitchlab/ui/types";
import {
  loadNbaGuardedPropsBridge,
  loadNbaInjuriesBridge,
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

export interface ExplorerStreakCard extends PropsStreakExplorerItem {
  readonly id: string;
  readonly sport: PlatformSport;
  readonly leagueLabel: string;
}

const FOOTBALL_MIN_MINUTES = 45;
const NBA_MIN_MINUTES_PER_GAME = 18;

const METRIC_PRIORITY: Record<PlatformSport, readonly string[]> = {
  football: ["Tiros a puerta", "Tiros", "Goles", "Asistencias", "Faltas", "Amarillas"],
  basketball: ["PTS", "REB", "AST", "3PM", "Puntos", "Rebotes", "Asistencias", "Triples"],
  "american-football": ["Yds", "Rec", "TD", "Car", "Cmp", "Pass Yds", "Rush Yds", "Rec Yds"],
  "ice-hockey": ["SOG", "PTS", "G", "A", "Tiros", "Puntos", "Goles"],
  baseball: ["H", "TB", "K", "R", "RBI", "HR", "Hits", "Ponches"],
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

export function resolveSoccerPropFamilyV5(
  statLabel: string,
  propId?: string,
): SoccerPropFamilyV4 | null {
  const combined = normKey(`${statLabel} ${propId ?? ""}`);
  if (
    combined.includes("atajada") ||
    combined.includes("player saves") ||
    /\bsaves?\b/.test(combined)
  ) {
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
          : input.avgMinutes !== null && input.avgMinutes !== undefined && input.avgMinutes < 55
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
      expectedMinutes: input.avgMinutes ?? 90,
      pOver: fallback.pOver,
      pUnder: fallback.pUnder,
      pOverSubCover: null,
      subCoverLift: 0,
      fairOverDecimal: fallback.fairOverDecimal,
      fairUnderDecimal: fallback.fairUnderDecimal,
    };
  }

  const minsPerGame = Math.max(FOOTBALL_MIN_MINUTES, Math.min(92, input.avgMinutes ?? 78));
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

  if (!isExplicitPerGame && seasonGp > 1) {
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
              label: `J${idx + 1}`,
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

    for (const team of squads.teams) {
      for (const player of team.players) {
        if (player.availability === "injured" || player.availability === "suspended") {
          continue;
        }
        const nbaInj =
          lg === "nba"
            ? nbaInjuryByKey.get(`${team.teamSlug.toLowerCase()}|${normKey(player.name)}`)
            : undefined;
        if (nbaInj?.status === "Baja") continue;

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
        ].slice(0, 4);

        const series: PropMetricSeries[] = [];
        for (const lbl of orderedLabels) {
          const pts = logs
            .slice()
            .reverse()
            .map((g) => {
              if (sport === "football") {
                const minHit = g.stats.find((s) => {
                  const u = s.label.trim().toUpperCase();
                  return u === "MIN" || u === "MINS" || u === "MINUTOS";
                });
                const minVal = minHit ? parseNumericStat(minHit.value) : null;
                if (minVal === null || minVal < FOOTBALL_MIN_MINUTES) return null;
              }
              const hit = g.stats.find((s) => s.label === lbl);
              const val = hit ? parseNumericStat(hit.value) : null;
              if (val === null) return null;
              return {
                label: (g.opponentAbbr ?? g.opponent).slice(0, 8),
                opponent: g.opponent,
                date: g.dateIso,
                value: val,
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
          photoKey: player.photoKey,
          positionLabel: player.positionLabel,
          series,
          playerHref: canonicalPlayerHref(leagueId, team.teamSlug, player.slug),
          avgMinutes: minutesMeta.avgMinutes,
          minMinutesGuard: minutesMeta.minMinutesGuard,
          availabilityStatus:
            player.availability === "doubtful" || nbaInj?.status === "Duda"
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
      engineName: "Tachyon NBA Lab",
      marketOverDecimal: bp.fairOverDecimal,
      marketUnderDecimal: bp.fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      last10: bp.last10.slice(0, 10),
      contextNote: `Proyección Spacetime NBA con muestra de ${bp.sampleGames} juegos${minNote} frente a ${matchInfo.opponentShort}.`,
      avgMinutes: bp.avgMinutes,
      sampleGames: bp.sampleGames,
      minMinutesGuard: true,
      availabilityStatus: bp.availabilityStatus,
      injuryNote: bp.injuryNote ?? null,
      playerHref: canonicalPlayerHref(nbaLeagueId, bp.teamSlug, pSlug),
    });
  }

  if (nbaSquads && upcomingNbaGames.length > 0) {
    const statDefs: ReadonlyArray<{
      code: NbaPropStatCode;
      keys: readonly string[];
      minVal: number;
      sdFactor: number;
      minSd: number;
    }> = [
      { code: "PTS", keys: ["pts", "puntos"], minVal: 12, sdFactor: 0.28, minSd: 3.4 },
      { code: "REB", keys: ["reb", "rebotes"], minVal: 4.5, sdFactor: 0.34, minSd: 1.5 },
      { code: "AST", keys: ["ast", "asistencias"], minVal: 3.5, sdFactor: 0.36, minSd: 1.3 },
      { code: "3PM", keys: ["3pm", "tpm", "triples"], minVal: 1.5, sdFactor: 0.45, minSd: 0.9 },
    ];

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
        if (!teamEntry) continue;

        const rankedPlayers = teamEntry.players
          .filter((p) => {
            if (p.availability === "injured" || p.availability === "suspended") return false;
            const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(p.name)}`);
            if (inj?.status === "Baja") return false;
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
          const minutesMeta = extractPlayerMinutesMeta(player, "basketball");
          const inj = nbaInjuryByKey.get(`${side.slug}|${normKey(player.name)}`);
          const availabilityStatus: "available" | "doubtful" =
            player.availability === "doubtful" || inj?.status === "Duda"
              ? "doubtful"
              : "available";

          for (const def of statDefs) {
            const metricHit = player.seasonMetrics?.find(
              (m) =>
                def.keys.includes(m.key.trim().toLowerCase()) ||
                def.keys.includes(m.label.trim().toLowerCase()),
            );
            const rawMean = metricHit ? parseNumericStat(metricHit.value) : null;
            if (rawMean === null || rawMean < def.minVal) continue;

            const id = `nba-prop:${game.id}:${teamEntry.teamSlug}:${player.slug}:${def.code.toLowerCase()}`;
            if (seenIds.has(id)) continue;

            const logVals = (player.recentGames ?? [])
              .map((g) => {
                const hit = g.stats.find((s) =>
                  def.keys.includes(s.label.trim().toLowerCase()),
                );
                return hit ? parseNumericStat(hit.value) : null;
              })
              .filter((v): v is number => v !== null);

            let mean = Math.round(rawMean * 100) / 100;
            let sd = Math.max(def.minSd, Math.round(rawMean * def.sdFactor * 100) / 100);
            if (logVals.length >= 3) {
              const logAvg = logVals.reduce((a, b) => a + b, 0) / logVals.length;
              mean = Math.round((rawMean * 0.65 + logAvg * 0.35) * 100) / 100;
              const variance =
                logVals.reduce((acc, v) => acc + (v - logAvg) ** 2, 0) / logVals.length;
              sd = Math.max(def.minSd, Math.round(Math.sqrt(variance) * 100) / 100);
            }

            const isPts = def.code === "PTS";
            const baseLine = isPts
              ? Math.max(4.5, Math.floor(mean) - 0.5)
              : mean >= 4
                ? Math.max(0.5, Math.floor(mean) - 0.5)
                : Math.max(0.5, Math.floor(mean) + 0.5);
            const ev = evaluateContinuousOverProb(mean, sd, baseLine);
            const step = isPts ? 1 : 0.5;
            const span = isPts ? 5 : 2.5;
            const minNote =
              minutesMeta.avgMinutes !== null
                ? ` · ${minutesMeta.avgMinutes.toFixed(1)} min/p`
                : "";

            seenIds.add(id);
            out.push({
              id,
              league: nbaLeagueId,
              leagueLabel: nbaLeagueLabel,
              sport: "basketball",
              gameId: game.id,
              matchLabel,
              kickoffLocal,
              player: player.name,
              teamSlug: teamEntry.teamSlug,
              teamName: teamEntry.teamName,
              position: player.positionLabel || "NBA",
              statLabel: NBA_STAT_LABEL_MAP[def.code],
              statCode: def.code,
              baseLine,
              step,
              minLine: Math.max(0.5, round1(baseLine - span)),
              maxLine: round1(baseLine + span),
              projectionMean: mean,
              projectionSd: sd,
              engineName: "Tachyon NBA Lab",
              marketOverDecimal: ev.fairOverDecimal,
              marketUnderDecimal: ev.fairUnderDecimal,
              hasVerifiedMarketQuote: false,
              last10: logVals.slice(0, 10),
              contextNote: `Promedio verificado ${rawMean.toFixed(1)} ${def.code} en ${minutesMeta.sampleGames} JJ${minNote} frente a ${side.opponent}.`,
              avgMinutes: minutesMeta.avgMinutes,
              sampleGames: minutesMeta.sampleGames,
              minMinutesGuard: true,
              availabilityStatus,
              injuryNote: inj?.detail ?? player.injuryDetail ?? null,
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

  const squadsByLeague = new Map<string, LeagueSquadsFile | null>();
  const snapshotByLeague = new Map<string, LeagueSnapshot | null>();

  for (const rawProp of options.baseProps ?? []) {
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

    const teamEntry = squads?.teams.find(
      (t) => t.teamSlug.toLowerCase() === rawProp.teamSlug.toLowerCase(),
    );
    const matchedPlayer = teamEntry?.players.find(
      (p) => normKey(p.name) === normKey(rawProp.player),
    );
    if (
      matchedPlayer &&
      (matchedPlayer.availability === "injured" || matchedPlayer.availability === "suspended")
    ) {
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
    const availabilityStatus: "available" | "doubtful" =
      matchedPlayer?.availability === "doubtful" ? "doubtful" : "available";

    let fairOverDecimal: number;
    let fairUnderDecimal: number;

    if (sport === "football") {
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

      const footballEv = evaluateFootballPropV5({
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
        refereeName: snapGame?.referee ?? matchCtx?.referee ?? refereeSummary?.name ?? null,
        refereeAvgYellow: refereeSummary?.avgYellow ?? null,
        round: snapGame?.round ?? null,
        stageName: matchCtx?.stageName ?? snapGame?.phase ?? null,
        previousLegGameId: matchCtx?.previousLegGameId ?? null,
        teamProjectedGoals,
      });
      fairOverDecimal = footballEv.fairOverDecimal;
      fairUnderDecimal = footballEv.fairUnderDecimal;
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
      marketOverDecimal: fairOverDecimal,
      marketUnderDecimal: fairUnderDecimal,
      hasVerifiedMarketQuote: false,
      avgMinutes: minutesMeta.avgMinutes,
      sampleGames: minutesMeta.sampleGames > 0 ? minutesMeta.sampleGames : null,
      minMinutesGuard: minutesMeta.minMinutesGuard,
      lineupStatus,
      availabilityStatus,
      injuryNote: matchedPlayer?.injuryDetail ?? null,
      playerHref: matchedPlayer
        ? canonicalPlayerHref(rawProp.league, rawProp.teamSlug, matchedPlayer.slug)
        : null,
      refereeSummary,
    });

    if (out.length >= maxItems) break;
  }

  return out.slice(0, maxItems);
}
