import {
  canonicalGameHref,
  containsForbiddenFd16Term,
  isLivePhaseActive,
  isLivePhaseTerminal,
  isSafePublicLabel,
  LIVE_PHASE_LABEL_ES,
  parseStrictFiniteNumber,
  type LiveMatchDetail,
  type LivePhase,
  type LivePlayerStatRow,
  type LiveScore,
  type LiveScoreboard,
  type LiveScoreboardEntry,
  type MatchLineupsProjection,
  type VerifiedGameLineupEntry,
} from "@pitchlab/contracts";
import {
  and,
  desc,
  eq,
  sealedPicks,
  type Db,
  type SealedParlayLegResult,
  type SealedParlayLegSpec,
} from "@pitchlab/db";
import type {
  PlatformDataset,
  PlatformGame,
  VerifiedMatchLineups,
} from "@pitchlab/ui/types";
import {
  findLiveCandidate,
  getLiveMatchDetail,
  getLiveScoreboard,
  type LiveDeps,
} from "./live";
import { buildServerRawPlatformDataset } from "./platform-data";

export const MAX_LIVE_TRACKED_PICKS = 40;

const EARLY_REGRESSION_MINUTES = 5;
const EPSILON = 1e-9;
const PREMATCH_LINEUP_WINDOW_MS = 75 * 60_000;
const DIACRITICS_RE = /[\u0300-\u036f]/g;
const NON_ALNUM_SPACE_RE = /[^a-z0-9\s]+/g;
const WHITESPACE_RE = /\s+/g;

export type LiveAsianPickState =
  | "won_full"
  | "won_half"
  | "push"
  | "lost_half"
  | "lost_full";

export type LivePickLineupAlert = "titular_en_banca" | null;
export type LivePickDirection = "over" | "under" | "handicap";
export type LivePickMilestoneKind =
  | "hit_locked"
  | "half_way"
  | "starter_on_bench"
  | "final_settled";

export interface AsianHandicapQuarterEvaluation {
  readonly state: LiveAsianPickState;
  readonly label: string;
  readonly payoutMultiplier: number;
}

export interface ResidualProjectionInput {
  readonly actualValue: number;
  readonly targetLine: number;
  readonly elapsedMinutes: number;
  readonly totalMinutes: number;
  readonly preMatchExpected?: number | null;
  readonly direction?: LivePickDirection;
}

export interface ResidualProjectionResult {
  readonly projectedFinal: number;
  readonly remainingNeeded: number;
  readonly remainingMinutes: number;
  readonly paceRatio: number;
}

export type LiveTrackerLineupPlayerEntry =
  | string
  | {
      readonly name: string;
      readonly number?: number | null;
      readonly position?: string | null;
    };

export interface LiveTrackerGenericLineups {
  readonly status?: "confirmed" | "predicted";
  readonly confirmed?: boolean;
  readonly homeStarters?: readonly LiveTrackerLineupPlayerEntry[];
  readonly awayStarters?: readonly LiveTrackerLineupPlayerEntry[];
  readonly homeBench?: readonly LiveTrackerLineupPlayerEntry[];
  readonly awayBench?: readonly LiveTrackerLineupPlayerEntry[];
  readonly starters?: readonly LiveTrackerLineupPlayerEntry[];
  readonly bench?: readonly LiveTrackerLineupPlayerEntry[];
  readonly substitutes?: readonly LiveTrackerLineupPlayerEntry[];
  readonly home?: {
    readonly starters?: readonly LiveTrackerLineupPlayerEntry[];
    readonly bench?: readonly LiveTrackerLineupPlayerEntry[];
    readonly substitutes?: readonly LiveTrackerLineupPlayerEntry[];
  };
  readonly away?: {
    readonly starters?: readonly LiveTrackerLineupPlayerEntry[];
    readonly bench?: readonly LiveTrackerLineupPlayerEntry[];
    readonly substitutes?: readonly LiveTrackerLineupPlayerEntry[];
  };
}

export type LiveTrackerLineupsInput =
  | VerifiedMatchLineups
  | VerifiedGameLineupEntry
  | MatchLineupsProjection
  | LiveTrackerGenericLineups
  | null
  | undefined;

export interface LiveTrackerPlayerStatLike extends Partial<LivePlayerStatRow> {
  readonly name?: string;
  readonly isStarter?: boolean | null;
  readonly starter?: boolean | null;
  readonly substitute?: boolean | null;
  readonly onBench?: boolean | null;
  readonly points?: number;
  readonly rebounds?: number;
  readonly threes?: number;
  readonly threePointersMade?: number;
}

export interface DetectStarterOnBenchInput {
  readonly playerName?: string | null;
  readonly lineups?: LiveTrackerLineupsInput;
  readonly playerStats?: readonly LiveTrackerPlayerStatLike[] | null;
  readonly matchMinute?: number | null;
  readonly teamSide?: "home" | "away" | null;
  readonly sport?: string | null;
}

export interface DetectStarterOnBenchResult {
  readonly alert: LivePickLineupAlert;
  readonly detail: string | null;
}

export interface LivePickMilestoneCandidate {
  readonly milestone: LivePickMilestoneKind;
  readonly valueKey: string;
}

export interface LiveTrackedPickLeg {
  readonly pickId: string;
  readonly gameId: string;
  readonly league: string | null;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly href: string;
  readonly phase: LivePhase;
  readonly clockLabel: string;
  readonly elapsedMinutes: number;
  readonly totalMinutes: number;
  readonly score: LiveScore | null;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: LivePickDirection;
  readonly projectedFinal: number;
  readonly remainingNeeded: number;
  readonly remainingMinutes: number;
  readonly paceRatio: number;
  readonly asianState: LiveAsianPickState | null;
  readonly asianLabel: string | null;
  readonly payoutMultiplier: number | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
  readonly hitLocked: boolean;
  readonly milestoneCandidates: readonly LivePickMilestoneCandidate[];
}

export interface LiveTrackedPickItem {
  readonly id: string;
  readonly pickId: string;
  readonly gameId: string;
  readonly pickKind: "single" | "parlay";
  readonly league: string | null;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly href: string;
  readonly phase: LivePhase;
  readonly clockLabel: string;
  readonly elapsedMinutes: number;
  readonly totalMinutes: number;
  readonly score: LiveScore | null;
  readonly units: number;
  readonly userDecimal: number;
  readonly fairDecimal: number;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: LivePickDirection;
  readonly projectedFinal: number;
  readonly remainingNeeded: number;
  readonly remainingMinutes: number;
  readonly paceRatio: number;
  readonly asianState: LiveAsianPickState | null;
  readonly asianLabel: string | null;
  readonly payoutMultiplier: number | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
  readonly hitLocked: boolean;
  readonly legs: readonly LiveTrackedPickLeg[];
  readonly milestoneCandidates: readonly LivePickMilestoneCandidate[];
}

export interface UserLiveTrackedPicksPayload {
  readonly generatedAt: string;
  readonly nextPollSeconds: number | null;
  readonly items: LiveTrackedPickItem[];
}

export interface LoadLiveTrackedPicksOptions {
  readonly limit?: number;
  readonly fullAccess?: boolean;
  readonly now?: Date;
  readonly liveDeps?: LiveDeps;
  readonly scoreboard?: LiveScoreboard;
  readonly matchDetails?:
    | ReadonlyMap<string, LiveMatchDetail>
    | Readonly<Record<string, LiveMatchDetail>>;
  readonly loadMatchDetail?: (gameId: string) => Promise<LiveMatchDetail | null>;
  readonly dataset?: PlatformDataset | null;
}

const ASIAN_STATE_LABELS: Readonly<Record<LiveAsianPickState, string>> = {
  won_full: "Ganada completa",
  won_half: "Media ganada",
  push: "Empate (reembolso)",
  lost_half: "Media perdida",
  lost_full: "Perdida completa",
};

function normalizeZero(value: number): number {
  return Object.is(value, -0) || value === 0 ? 0 : value;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return normalizeZero(Math.round(value * 100) / 100);
}

function clampBoundedLimit(raw: number | undefined, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return max;
  return Math.max(1, Math.min(max, Math.trunc(raw)));
}

function signWithTolerance(value: number): -1 | 0 | 1 {
  if (value > EPSILON) return 1;
  if (value < -EPSILON) return -1;
  return 0;
}

function evaluationFromMultiplier(payoutMultiplier: number): AsianHandicapQuarterEvaluation {
  if (payoutMultiplier >= 0.75) {
    return { state: "won_full", label: ASIAN_STATE_LABELS.won_full, payoutMultiplier: 1 };
  }
  if (payoutMultiplier >= 0.25) {
    return { state: "won_half", label: ASIAN_STATE_LABELS.won_half, payoutMultiplier: 0.5 };
  }
  if (payoutMultiplier <= -0.75) {
    return { state: "lost_full", label: ASIAN_STATE_LABELS.lost_full, payoutMultiplier: -1 };
  }
  if (payoutMultiplier <= -0.25) {
    return { state: "lost_half", label: ASIAN_STATE_LABELS.lost_half, payoutMultiplier: -0.5 };
  }
  return { state: "push", label: ASIAN_STATE_LABELS.push, payoutMultiplier: 0 };
}

export function evaluateAsianHandicapQuarterState(
  teamMargin: number,
  line: number,
): AsianHandicapQuarterEvaluation {
  if (!Number.isFinite(teamMargin) || !Number.isFinite(line)) {
    return evaluationFromMultiplier(0);
  }
  const quarters = Math.round(line * 4);
  const isQuarterMultiple = Math.abs(line * 4 - quarters) < 1e-6;
  if (isQuarterMultiple && Math.abs(quarters % 2) === 1) {
    const lowHalfLine = (quarters - 1) / 4;
    const highHalfLine = (quarters + 1) / 4;
    const lowOutcome = signWithTolerance(teamMargin + lowHalfLine);
    const highOutcome = signWithTolerance(teamMargin + highHalfLine);
    return evaluationFromMultiplier((lowOutcome + highOutcome) / 2);
  }
  const effectiveLine = isQuarterMultiple ? quarters / 4 : line;
  return evaluationFromMultiplier(signWithTolerance(teamMargin + effectiveLine));
}

export function computeResidualProjection(
  input: ResidualProjectionInput,
): ResidualProjectionResult {
  const totalMinutes =
    typeof input.totalMinutes === "number" &&
    Number.isFinite(input.totalMinutes) &&
    input.totalMinutes > 0
      ? input.totalMinutes
      : 90;
  const actualValue =
    typeof input.actualValue === "number" && Number.isFinite(input.actualValue)
      ? input.actualValue
      : 0;
  const targetLine =
    typeof input.targetLine === "number" && Number.isFinite(input.targetLine)
      ? input.targetLine
      : 0;
  const rawElapsed =
    typeof input.elapsedMinutes === "number" && Number.isFinite(input.elapsedMinutes)
      ? input.elapsedMinutes
      : 0;
  const elapsedMinutes = Math.max(0, Math.min(totalMinutes, rawElapsed));
  const remainingMinutes = round2(Math.max(0, totalMinutes - elapsedMinutes));
  const remainingNeeded =
    input.direction === "handicap"
      ? round2(Math.max(0, -targetLine - actualValue))
      : input.direction === "under"
        ? round2(Math.max(0, actualValue - targetLine))
        : round2(Math.max(0, targetLine - actualValue));

  const fallbackPrior = targetLine > 0 ? targetLine : Math.max(0, actualValue);
  const priorTotal =
    typeof input.preMatchExpected === "number" && Number.isFinite(input.preMatchExpected)
      ? input.preMatchExpected
      : fallbackPrior;

  const priorWeightMinutes = Math.max(20, totalMinutes * 0.5);
  const earlyFactor =
    elapsedMinutes < EARLY_REGRESSION_MINUTES
      ? elapsedMinutes / EARLY_REGRESSION_MINUTES
      : 1;
  const priorNumerator = priorTotal * (priorWeightMinutes / totalMinutes);
  const weightedObservedValue = actualValue * earlyFactor;
  const weightedObservedMinutes = elapsedMinutes * earlyFactor;
  const denominator = priorWeightMinutes + weightedObservedMinutes;
  const residualRate =
    denominator > EPSILON ? (priorNumerator + weightedObservedValue) / denominator : 0;

  const rawProjectedFinal =
    remainingMinutes <= EPSILON
      ? actualValue
      : actualValue + residualRate * remainingMinutes;
  const projectedFinal = round2(rawProjectedFinal);

  let rawPaceRatio = 0;
  if (input.direction === "handicap") {
    const projectedCoverMargin = projectedFinal + targetLine;
    const scale = Math.max(1, Math.abs(targetLine));
    rawPaceRatio = Math.max(0, 1 + projectedCoverMargin / scale);
  } else if (targetLine > EPSILON) {
    rawPaceRatio = projectedFinal / targetLine;
  } else if (priorTotal > EPSILON) {
    rawPaceRatio = projectedFinal / priorTotal;
  } else if (projectedFinal >= targetLine) {
    rawPaceRatio = 1;
  }

  return {
    projectedFinal,
    remainingNeeded,
    remainingMinutes,
    paceRatio: round2(rawPaceRatio),
  };
}

function normalizePlayerToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(NON_ALNUM_SPACE_RE, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

function splitNameTokens(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length > 0);
}

function normalizeGenerationalSuffix(token: string): "jr" | "sr" | "ii" | "iii" | "iv" | null {
  if (token === "jr" || token === "junior") return "jr";
  if (token === "sr" || token === "senior") return "sr";
  if (token === "ii") return "ii";
  if (token === "iii") return "iii";
  if (token === "iv") return "iv";
  return null;
}

function isGenerationalSuffix(token: string): boolean {
  return normalizeGenerationalSuffix(token) !== null;
}

function extractGenerationalSuffix(tokens: readonly string[]): "jr" | "sr" | "ii" | "iii" | "iv" | null {
  if (tokens.length <= 1) return null;
  const last = tokens[tokens.length - 1];
  return last ? normalizeGenerationalSuffix(last) : null;
}

function hasConflictingGenerationalSuffix(
  rawTokensA: readonly string[],
  rawTokensB: readonly string[],
): boolean {
  const suffixA = extractGenerationalSuffix(rawTokensA);
  const suffixB = extractGenerationalSuffix(rawTokensB);
  return suffixA !== null && suffixB !== null && suffixA !== suffixB;
}

function stripGenerationalSuffixes(tokens: readonly string[]): string[] {
  const result = [...tokens];
  while (result.length > 1 && isGenerationalSuffix(result[result.length - 1]!)) {
    result.pop();
  }
  return result;
}

function playersMatchExact(queryName: string, candidateName: string): boolean {
  const normA = normalizePlayerToken(queryName);
  const normB = normalizePlayerToken(candidateName);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const rawTokensA = splitNameTokens(normA);
  const rawTokensB = splitNameTokens(normB);
  if (hasConflictingGenerationalSuffix(rawTokensA, rawTokensB)) return false;
  const coreA = stripGenerationalSuffixes(rawTokensA).join(" ");
  const coreB = stripGenerationalSuffixes(rawTokensB).join(" ");
  return coreA.length > 0 && coreA === coreB;
}

function playersMatch(queryName: string, candidateName: string): boolean {
  const normA = normalizePlayerToken(queryName);
  const normB = normalizePlayerToken(candidateName);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const rawTokensA = splitNameTokens(normA);
  const rawTokensB = splitNameTokens(normB);
  if (hasConflictingGenerationalSuffix(rawTokensA, rawTokensB)) return false;

  const tokensA = stripGenerationalSuffixes(rawTokensA);
  const tokensB = stripGenerationalSuffixes(rawTokensB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  if (tokensA.join(" ") === tokensB.join(" ")) return true;

  if (tokensA.length === 1) {
    const single = tokensA[0]!;
    return single.length >= 4 && tokensB.length >= 2 && tokensB[tokensB.length - 1] === single;
  }
  if (tokensB.length === 1) {
    const single = tokensB[0]!;
    return single.length >= 4 && tokensA.length >= 2 && tokensA[tokensA.length - 1] === single;
  }

  const firstA = tokensA[0]!;
  const firstB = tokensB[0]!;
  const lastA = tokensA[tokensA.length - 1]!;
  const lastB = tokensB[tokensB.length - 1]!;

  if (lastA === lastB && lastA.length >= 3) {
    if (firstA === firstB) return true;
    if (firstA.length === 1 && firstB.startsWith(firstA)) return true;
    if (firstB.length === 1 && firstA.startsWith(firstB)) return true;
  }

  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;
  if (
    shorter.length >= 2 &&
    longer.length === shorter.length + 1 &&
    shorter[0]!.length >= 3 &&
    shorter[shorter.length - 1]!.length >= 3 &&
    shorter.every((token, idx) => longer[idx] === token)
  ) {
    return true;
  }

  return false;
}

function extractPlayerNames(entries: readonly LiveTrackerLineupPlayerEntry[] | undefined): string[] {
  if (!entries || entries.length === 0) return [];
  const names: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) names.push(trimmed);
    } else if (entry && typeof entry.name === "string") {
      const trimmed = entry.name.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

function sanitizeDisplayText(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(WHITESPACE_RE, " ").trim();
  if (!cleaned) return fallback;
  if (!isSafePublicLabel(cleaned) || containsForbiddenFd16Term(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function detectStarterOnBench(
  input: DetectStarterOnBenchInput,
): DetectStarterOnBenchResult {
  const rawName = typeof input.playerName === "string" ? input.playerName.trim() : "";
  if (!rawName) {
    return { alert: null, detail: null };
  }
  const safePlayerName = sanitizeDisplayText(rawName, "El jugador");
  const isBasketball = input.sport === "basketball";
  const minStartersPerTeam = isBasketball ? 5 : 11;
  const starterUnitLabel = isBasketball ? "quinteto titular confirmado" : "XI titular confirmado";
  const teamSide = input.teamSide === "home" || input.teamSide === "away" ? input.teamSide : null;

  const lineups = input.lineups;
  if (lineups && typeof lineups === "object") {
    const generic: LiveTrackerGenericLineups = lineups;
    const isPredicted = generic.status === "predicted" || generic.confirmed === false;
    if (isPredicted) {
      return { alert: null, detail: null };
    }
    const homeStarters = [
      ...extractPlayerNames(generic.homeStarters),
      ...extractPlayerNames(generic.home?.starters),
    ];
    const awayStarters = [
      ...extractPlayerNames(generic.awayStarters),
      ...extractPlayerNames(generic.away?.starters),
    ];
    const sharedStarters = extractPlayerNames(generic.starters);
    const homeBench = [
      ...extractPlayerNames(generic.homeBench),
      ...extractPlayerNames(generic.home?.bench),
      ...extractPlayerNames(generic.home?.substitutes),
    ];
    const awayBench = [
      ...extractPlayerNames(generic.awayBench),
      ...extractPlayerNames(generic.away?.bench),
      ...extractPlayerNames(generic.away?.substitutes),
    ];
    const sharedBench = [
      ...extractPlayerNames(generic.bench),
      ...extractPlayerNames(generic.substitutes),
    ];

    const starters =
      teamSide === "home"
        ? [...homeStarters, ...sharedStarters]
        : teamSide === "away"
          ? [...awayStarters, ...sharedStarters]
          : [...homeStarters, ...awayStarters, ...sharedStarters];
    const bench =
      teamSide === "home"
        ? [...homeBench, ...sharedBench]
        : teamSide === "away"
          ? [...awayBench, ...sharedBench]
          : [...homeBench, ...awayBench, ...sharedBench];

    if (starters.some((candidate) => playersMatchExact(rawName, candidate))) {
      return { alert: null, detail: null };
    }

    if (bench.some((candidate) => playersMatchExact(rawName, candidate))) {
      return {
        alert: "titular_en_banca",
        detail: `${safePlayerName} figura en la banca del ${starterUnitLabel}.`,
      };
    }

    if (starters.some((candidate) => playersMatch(rawName, candidate))) {
      return { alert: null, detail: null };
    }

    if (bench.some((candidate) => playersMatch(rawName, candidate))) {
      return {
        alert: "titular_en_banca",
        detail: `${safePlayerName} figura en la banca del ${starterUnitLabel}.`,
      };
    }

    const hasCompleteStarters =
      teamSide === "home"
        ? homeStarters.length >= minStartersPerTeam || sharedStarters.length >= minStartersPerTeam
        : teamSide === "away"
          ? awayStarters.length >= minStartersPerTeam || sharedStarters.length >= minStartersPerTeam
          : (homeStarters.length >= minStartersPerTeam &&
              awayStarters.length >= minStartersPerTeam) ||
            (homeStarters.length >= minStartersPerTeam && awayStarters.length === 0) ||
            (awayStarters.length >= minStartersPerTeam && homeStarters.length === 0) ||
            sharedStarters.length >= minStartersPerTeam;

    if (hasCompleteStarters) {
      return {
        alert: "titular_en_banca",
        detail: `${safePlayerName} no figura en el ${starterUnitLabel}.`,
      };
    }
  }

  const allStats = input.playerStats ?? [];
  const stats =
    teamSide !== null
      ? allStats.filter((row) => !row.side || row.side === teamSide)
      : allStats;
  if (stats.length > 0) {
    const matched =
      stats.find((row) => {
        const candidate = row.player ?? row.name ?? "";
        return candidate.length > 0 && playersMatchExact(rawName, candidate);
      }) ??
      stats.find((row) => {
        const candidate = row.player ?? row.name ?? "";
        return candidate.length > 0 && playersMatch(rawName, candidate);
      });
    if (matched) {
      if (
        matched.isStarter === false ||
        matched.starter === false ||
        matched.substitute === true ||
        matched.onBench === true
      ) {
        return {
          alert: "titular_en_banca",
          detail: `${safePlayerName} figura como suplente en la hoja en vivo.`,
        };
      }
      if (
        typeof matched.minutes === "number" &&
        Number.isFinite(matched.minutes) &&
        matched.minutes === 0 &&
        (input.matchMinute === undefined || input.matchMinute === null || input.matchMinute >= 1)
      ) {
        return {
          alert: "titular_en_banca",
          detail: `${safePlayerName} registra 0 min disputados; figura en banca.`,
        };
      }
      if (matched.isStarter === true || matched.starter === true) {
        return { alert: null, detail: null };
      }
    } else {
      const activePlayers = stats.filter(
        (row) => typeof row.minutes === "number" && Number.isFinite(row.minutes) && row.minutes > 0,
      );
      if (activePlayers.length >= minStartersPerTeam) {
        return {
          alert: "titular_en_banca",
          detail: `${safePlayerName} no registra participación en el ${starterUnitLabel} en vivo.`,
        };
      }
    }
  }

  return { alert: null, detail: null };
}

function parseNumericDecimalString(raw: string | number | null | undefined, fallback: number): number {
  const parsed = parseStrictFiniteNumber(raw);
  return parsed !== null ? parsed : fallback;
}

function totalMinutesForLeagueOrSport(league: string | null, sport?: string | null): number {
  if (sport === "basketball" || league === "nba") return 48;
  if (sport === "ice-hockey" || league === "nhl") return 60;
  if (sport === "american-football" || league === "nfl") return 60;
  return 90;
}

function resolveClockAndElapsed(
  entry: LiveScoreboardEntry | null,
  totalMinutes: number,
): { phase: LivePhase; elapsedMinutes: number; clockLabel: string } {
  if (!entry) {
    return {
      phase: "scheduled",
      elapsedMinutes: 0,
      clockLabel: LIVE_PHASE_LABEL_ES.scheduled,
    };
  }
  const phase = entry.phase;
  if (phase === "scheduled") {
    return { phase, elapsedMinutes: 0, clockLabel: LIVE_PHASE_LABEL_ES.scheduled };
  }
  if (phase === "halftime") {
    return { phase, elapsedMinutes: totalMinutes / 2, clockLabel: "MT" };
  }
  if (phase === "final") {
    return { phase, elapsedMinutes: totalMinutes, clockLabel: LIVE_PHASE_LABEL_ES.final };
  }
  if (phase === "penalties") {
    return { phase, elapsedMinutes: totalMinutes, clockLabel: LIVE_PHASE_LABEL_ES.penalties };
  }
  if (phase === "postponed" || phase === "cancelled" || phase === "unknown") {
    return { phase, elapsedMinutes: 0, clockLabel: LIVE_PHASE_LABEL_ES[phase] };
  }

  let minute = 0;
  if (typeof entry.minute === "number" && Number.isFinite(entry.minute) && entry.minute >= 0) {
    minute = entry.minute;
  } else if (entry.clock) {
    const digitsMatch = /(\d+)/.exec(entry.clock);
    if (digitsMatch?.[1]) {
      const parsedMinute = Number.parseInt(digitsMatch[1], 10);
      if (Number.isFinite(parsedMinute)) {
        minute = parsedMinute;
      }
    }
  }
  const clamped = Math.max(0, Math.min(totalMinutes, minute));
  const cleanClock = entry.clock?.trim();
  const clockLabel = cleanClock
    ? cleanClock.includes("'") || totalMinutes !== 90
      ? cleanClock
      : `${cleanClock}'`
    : totalMinutes === 90
      ? `${clamped}'`
      : `${clamped}m`;

  return {
    phase,
    elapsedMinutes: clamped,
    clockLabel: sanitizeDisplayText(clockLabel, LIVE_PHASE_LABEL_ES.live),
  };
}

type PropStatKind =
  | "goals"
  | "assists"
  | "shots"
  | "shots_on_target"
  | "tackles"
  | "saves"
  | "points"
  | "rebounds"
  | "threes";

interface ParsedPickSpec {
  readonly category:
    | "totals"
    | "asian_handicap"
    | "team_totals"
    | "btts"
    | "h2h"
    | "dnb"
    | "double_chance"
    | "corners"
    | "cards"
    | "shots"
    | "shots_on_target"
    | "player_prop";
  readonly side: "home" | "away" | "draw" | "total";
  readonly direction: LivePickDirection;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly playerName: string | null;
  readonly propStat: PropStatKind | null;
  readonly useAsianEvaluation: boolean;
}

function isQuarterOrIntegerLine(line: number): boolean {
  const quarters = Math.round(line * 4);
  if (Math.abs(line * 4 - quarters) >= 1e-6) return false;
  const mod4 = Math.abs(quarters % 4);
  return mod4 === 0 || mod4 === 1 || mod4 === 3;
}

function inferPropStatKind(text: string): PropStatKind {
  const lowered = normalizePlayerToken(text);
  if (
    lowered.includes("tiros a puerta") ||
    lowered.includes("tiros al arco") ||
    lowered.includes("shots on target") ||
    lowered.includes("sot")
  ) {
    return "shots_on_target";
  }
  if (lowered.includes("tiros") || lowered.includes("remates") || lowered.includes("shots")) {
    return "shots";
  }
  if (lowered.includes("asist") || lowered.includes("assist")) {
    return "assists";
  }
  if (lowered.includes("atajad") || lowered.includes("save")) {
    return "saves";
  }
  if (lowered.includes("entrad") || lowered.includes("tackle")) {
    return "tackles";
  }
  if (lowered.includes("rebot") || lowered.includes("rebound")) {
    return "rebounds";
  }
  if (lowered.includes("triple") || lowered.includes("three") || lowered.includes("3pm")) {
    return "threes";
  }
  if (lowered.includes("punto") || lowered.includes("point")) {
    return "points";
  }
  return "goals";
}

function unitLabelForPropStat(stat: PropStatKind): string {
  switch (stat) {
    case "shots_on_target":
      return "tiros a puerta";
    case "shots":
      return "tiros";
    case "assists":
      return "asistencias";
    case "saves":
      return "atajadas";
    case "tackles":
      return "entradas";
    case "points":
      return "puntos";
    case "rebounds":
      return "rebotes";
    case "threes":
      return "triples";
    default:
      return "goles";
  }
}

function extractStructuredPropPlayer(
  market: string,
  selection: string,
  pickLabel: string,
): string | null {
  const selMatch = /^(?:player|prop):([^:]+):/i.exec(selection.trim());
  if (selMatch?.[1]) {
    const cleaned = selMatch[1].replace(/[_-]+/g, " ").trim();
    if (cleaned.length >= 2) return cleaned;
  }

  const label = pickLabel.trim();
  const separatorSplit = label.split(/\s*(?:·|—|\|| - )\s*/);
  if (separatorSplit.length >= 2) {
    const candidate = separatorSplit[0]?.trim() ?? "";
    if (candidate.length >= 2 && !/^(?:m[aá]s|menos|over|under|ambos|empate|total)/i.test(candidate)) {
      return candidate;
    }
  }

  const goalOfMatch = /^gol de\s+(.+?)(?:\s*\(|$)/i.exec(label);
  if (goalOfMatch?.[1]) {
    return goalOfMatch[1].trim();
  }

  const beforeStatMatch =
    /^([A-Za-zÀ-ÿ.'\-\s]{3,48}?)\s+(?:m[aá]s de|menos de|over|under|\d+\+|anota\b)/i.exec(label);
  if (beforeStatMatch?.[1]) {
    const candidate = beforeStatMatch[1].trim();
    if (!/^(?:local|visita|total|partido)$/i.test(candidate)) {
      return candidate;
    }
  }

  if (market.includes("player") || market.includes("goalscorer") || market.includes("prop")) {
    const fallback = label.split(/\s+(?:\d|over|under|m[aá]s|menos)/i)[0]?.trim() ?? "";
    return fallback.length >= 2 ? fallback : null;
  }

  return null;
}

function extractLineFromText(text: string): number | null {
  const signedMatch = /([+-]\d+(?:\.\d+)?)/.exec(text);
  if (signedMatch?.[1]) {
    const parsed = parseStrictFiniteNumber(signedMatch[1]);
    if (parsed !== null) return parsed;
  }
  const plusMatch = /(\d+)\+/.exec(text);
  if (plusMatch?.[1]) {
    const parsed = parseStrictFiniteNumber(plusMatch[1]);
    if (parsed !== null) return Math.max(0.5, parsed - 0.5);
  }
  const plainMatch =
    /(?:over|under|m[aá]s de|menos de)\s*[_-]?\s*(\d+(?:\.\d+)?)|[_-](\d+(?:\.\d+)?)$/i.exec(
      text,
    );
  const plainDigits = plainMatch?.[1] ?? plainMatch?.[2];
  if (plainDigits) {
    return parseStrictFiniteNumber(plainDigits);
  }
  return null;
}

function looksLikePlayerPropLabel(label: string): boolean {
  const norm = normalizePlayerToken(label);
  const hasPlayerStatCue =
    norm.includes("tiros a puerta") ||
    norm.includes("tiros al arco") ||
    norm.includes("asistencia") ||
    norm.includes("atajada") ||
    norm.includes("entrada") ||
    norm.includes("rebote") ||
    norm.includes("triple") ||
    norm.includes("anota") ||
    norm.startsWith("gol de ");
  if (!hasPlayerStatCue) return false;
  return extractStructuredPropPlayer("player_prop", "", label) !== null;
}

function parsePickSpec(input: {
  market: string | null | undefined;
  selection: string | null | undefined;
  line: number | null | undefined;
  pickLabel: string;
  sport?: string | null;
}): ParsedPickSpec {
  const market = (input.market ?? "").trim().toLowerCase();
  const selection = (input.selection ?? "").trim().toLowerCase();
  const labelNorm = normalizePlayerToken(input.pickLabel);
  const explicitLine =
    typeof input.line === "number" && Number.isFinite(input.line) ? input.line : null;
  const parsedLine =
    explicitLine ?? extractLineFromText(selection) ?? extractLineFromText(input.pickLabel);

  const isUnder =
    selection.includes("under") ||
    labelNorm.includes("menos de") ||
    labelNorm.includes("under");
  const direction: LivePickDirection = isUnder ? "under" : "over";

  const isPlayerMarket =
    market.startsWith("player_") ||
    market.startsWith("prop_") ||
    market === "player_prop" ||
    market === "anytime_goalscorer" ||
    market === "first_goalscorer" ||
    selection.startsWith("player:") ||
    selection.startsWith("prop:") ||
    (!market && looksLikePlayerPropLabel(input.pickLabel));

  if (isPlayerMarket) {
    const propStat = inferPropStatKind(`${market} ${selection} ${input.pickLabel}`);
    const targetLine = parsedLine ?? 0.5;
    return {
      category: "player_prop",
      side: "total",
      direction,
      targetLine,
      unitLabel: unitLabelForPropStat(propStat),
      playerName: extractStructuredPropPlayer(market, selection, input.pickLabel),
      propStat,
      useAsianEvaluation: false,
    };
  }

  if (
    market === "spread" ||
    market === "spreads" ||
    market === "handicap" ||
    market === "asian_handicap" ||
    market === "puck_line" ||
    market === "run_line"
  ) {
    const side = selection.startsWith("away") ? "away" : "home";
    return {
      category: "asian_handicap",
      side,
      direction: "handicap",
      targetLine: parsedLine ?? 0,
      unitLabel: "margen",
      playerName: null,
      propStat: null,
      useAsianEvaluation: true,
    };
  }

  if (market.includes("corner") || labelNorm.includes("corner")) {
    const side = selection.startsWith("home")
      ? "home"
      : selection.startsWith("away")
        ? "away"
        : "total";
    const targetLine = parsedLine ?? 8.5;
    return {
      category: "corners",
      side,
      direction,
      targetLine,
      unitLabel: "córners",
      playerName: null,
      propStat: null,
      useAsianEvaluation: isQuarterOrIntegerLine(targetLine),
    };
  }

  if (market.includes("card") || labelNorm.includes("tarjeta")) {
    const side = selection.startsWith("home")
      ? "home"
      : selection.startsWith("away")
        ? "away"
        : "total";
    const targetLine = parsedLine ?? 3.5;
    return {
      category: "cards",
      side,
      direction,
      targetLine,
      unitLabel: "tarjetas",
      playerName: null,
      propStat: null,
      useAsianEvaluation: isQuarterOrIntegerLine(targetLine),
    };
  }

  if (market === "shots_on_target" || market === "sot") {
    const side = selection.startsWith("home")
      ? "home"
      : selection.startsWith("away")
        ? "away"
        : "total";
    return {
      category: "shots_on_target",
      side,
      direction,
      targetLine: parsedLine ?? 7.5,
      unitLabel: "tiros a puerta",
      playerName: null,
      propStat: null,
      useAsianEvaluation: false,
    };
  }

  if (market === "shots" || market === "total_shots") {
    const side = selection.startsWith("home")
      ? "home"
      : selection.startsWith("away")
        ? "away"
        : "total";
    return {
      category: "shots",
      side,
      direction,
      targetLine: parsedLine ?? 22.5,
      unitLabel: "tiros",
      playerName: null,
      propStat: null,
      useAsianEvaluation: false,
    };
  }

  if (market === "team_totals") {
    const side = selection.startsWith("away") ? "away" : "home";
    const targetLine = parsedLine ?? 1.5;
    return {
      category: "team_totals",
      side,
      direction,
      targetLine,
      unitLabel: input.sport === "basketball" ? "puntos" : "goles",
      playerName: null,
      propStat: null,
      useAsianEvaluation: isQuarterOrIntegerLine(targetLine),
    };
  }

  if (market === "btts" || labelNorm.includes("ambos anotan")) {
    const isNo = selection === "no" || /\bno\b/.test(labelNorm);
    return {
      category: "btts",
      side: "total",
      direction: isNo ? "under" : "over",
      targetLine: 2,
      unitLabel: "equipos",
      playerName: null,
      propStat: null,
      useAsianEvaluation: false,
    };
  }

  if (market === "dnb" || market === "draw_no_bet") {
    const side = selection.startsWith("away") ? "away" : "home";
    return {
      category: "dnb",
      side,
      direction: "handicap",
      targetLine: 0,
      unitLabel: "margen",
      playerName: null,
      propStat: null,
      useAsianEvaluation: true,
    };
  }

  if (market === "double_chance") {
    const side = selection === "x2" ? "away" : selection === "12" ? "total" : "home";
    return {
      category: "double_chance",
      side,
      direction: "handicap",
      targetLine: 0.5,
      unitLabel: "margen",
      playerName: null,
      propStat: null,
      useAsianEvaluation: false,
    };
  }

  if (market === "h2h" || market === "1x2" || market === "moneyline") {
    const side =
      selection === "away" ? "away" : selection === "draw" ? "draw" : "home";
    return {
      category: "h2h",
      side,
      direction: side === "draw" ? "over" : "handicap",
      targetLine: side === "draw" ? 1 : -0.5,
      unitLabel: side === "draw" ? "empate" : "margen",
      playerName: null,
      propStat: null,
      useAsianEvaluation: false,
    };
  }

  const targetLine = parsedLine ?? 2.5;
  const sportUnit =
    input.sport === "basketball"
      ? "puntos"
      : input.sport === "baseball"
        ? "carreras"
        : "goles";

  return {
    category: "totals",
    side: "total",
    direction,
    targetLine,
    unitLabel: sportUnit,
    playerName: null,
    propStat: null,
    useAsianEvaluation: isQuarterOrIntegerLine(targetLine),
  };
}

function readPlayerStatValue(
  playerName: string | null,
  statKind: PropStatKind | null,
  detail: LiveMatchDetail | null,
): number {
  if (!playerName || !detail) return 0;
  const statsRow: LiveTrackerPlayerStatLike | undefined = (detail.playerStats ?? []).find(
    (row) => playersMatch(playerName, row.player),
  );
  if (statsRow) {
    switch (statKind) {
      case "assists":
        return statsRow.assists ?? 0;
      case "shots":
        return statsRow.shots ?? 0;
      case "shots_on_target":
        return statsRow.shotsOnTarget ?? 0;
      case "tackles":
        return statsRow.tackles ?? 0;
      case "saves":
        return statsRow.saves ?? 0;
      case "points":
        return statsRow.points ?? 0;
      case "rebounds":
        return statsRow.rebounds ?? 0;
      case "threes":
        return statsRow.threes ?? statsRow.threePointersMade ?? 0;
      case "goals":
        return statsRow.goals ?? 0;
      default:
        return statsRow.goals ?? 0;
    }
  }
  if (statKind === "goals") {
    return detail.incidents.filter(
      (incident) =>
        (incident.kind === "goal" || incident.kind === "penalty_goal") &&
        typeof incident.player === "string" &&
        playersMatch(playerName, incident.player),
    ).length;
  }
  return 0;
}

function readTeamCountStat(
  detail: LiveMatchDetail | null,
  side: "home" | "away" | "draw" | "total",
  kind: "corners" | "cards" | "shots" | "shots_on_target",
): number {
  if (!detail) return 0;
  const stats = detail.stats;
  if (stats) {
    const homeVal =
      kind === "corners"
        ? stats.home.corners ?? 0
        : kind === "cards"
          ? (stats.home.yellowCards ?? 0) + (stats.home.redCards ?? 0)
          : kind === "shots"
            ? stats.home.shots ?? 0
            : stats.home.shotsOnTarget ?? 0;
    const awayVal =
      kind === "corners"
        ? stats.away.corners ?? 0
        : kind === "cards"
          ? (stats.away.yellowCards ?? 0) + (stats.away.redCards ?? 0)
          : kind === "shots"
            ? stats.away.shots ?? 0
            : stats.away.shotsOnTarget ?? 0;
    if (side === "home") return homeVal;
    if (side === "away") return awayVal;
    return homeVal + awayVal;
  }
  if (kind === "cards") {
    return detail.incidents.filter((incident) => {
      if (
        incident.kind !== "yellow" &&
        incident.kind !== "second_yellow" &&
        incident.kind !== "red"
      ) {
        return false;
      }
      if (side === "home") return incident.side === "home";
      if (side === "away") return incident.side === "away";
      return true;
    }).length;
  }
  if (kind === "shots" && detail.shotmapSummary) {
    if (side === "home") return detail.shotmapSummary.shotsHome;
    if (side === "away") return detail.shotmapSummary.shotsAway;
    return detail.shotmapSummary.shotsHome + detail.shotmapSummary.shotsAway;
  }
  return 0;
}

function resolveCanonicalHref(
  gameId: string,
  entry: LiveScoreboardEntry | null,
  game: PlatformGame | null,
): string {
  if (game) {
    return canonicalGameHref(game.league, game);
  }
  const cand = findLiveCandidate(gameId);
  if (cand) {
    return canonicalGameHref(cand.league, {
      id: cand.gameId,
      home: { name: cand.homeName },
      away: { name: cand.awayName },
    });
  }
  if (entry) {
    return `/app/${encodeURIComponent(entry.league)}`;
  }
  return "/app/historial";
}

function buildMilestoneCandidates(input: {
  phase: LivePhase;
  direction: LivePickDirection;
  actualValue: number;
  targetLine: number;
  hitLocked: boolean;
  asianState: LiveAsianPickState | null;
  starterAlert: LivePickLineupAlert;
}): LivePickMilestoneCandidate[] {
  const candidates: LivePickMilestoneCandidate[] = [];
  if (input.starterAlert === "titular_en_banca") {
    candidates.push({ milestone: "starter_on_bench", valueKey: "bench" });
  }
  if (input.phase === "final") {
    const outcomeTag = input.asianState ?? (input.hitLocked ? "hit" : "miss");
    candidates.push({
      milestone: "final_settled",
      valueKey: `final:${input.actualValue}:${outcomeTag}`,
    });
    return candidates;
  }
  if (isLivePhaseActive(input.phase)) {
    if (input.hitLocked) {
      candidates.push({
        milestone: "hit_locked",
        valueKey: `locked:${input.targetLine}`,
      });
    } else if (
      input.direction === "over" &&
      input.targetLine > EPSILON &&
      input.actualValue > 0 &&
      input.actualValue >= input.targetLine * 0.5
    ) {
      candidates.push({
        milestone: "half_way",
        valueKey: `50pct:${input.targetLine}`,
      });
    } else if (
      input.phase === "halftime" &&
      (input.asianState === "won_full" ||
        input.asianState === "won_half" ||
        (input.direction === "under" && input.actualValue < input.targetLine))
    ) {
      candidates.push({
        milestone: "half_way",
        valueKey: `ht:${input.targetLine}`,
      });
    }
  }
  return candidates;
}

function evaluateLiveLeg(input: {
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  market: string | null | undefined;
  selection: string | null | undefined;
  line: number | null | undefined;
  entry: LiveScoreboardEntry | null;
  detail: LiveMatchDetail | null;
  game: PlatformGame | null;
  fullAccess: boolean;
  settledResult?: SealedParlayLegResult | null;
}): LiveTrackedPickLeg {
  const league = input.entry?.league ?? (input.game ? String(input.game.league) : null);
  const totalMinutes = totalMinutesForLeagueOrSport(league, input.game?.sport ?? null);
  const clockState = input.settledResult
    ? {
        phase: "final" as LivePhase,
        elapsedMinutes: totalMinutes,
        clockLabel: LIVE_PHASE_LABEL_ES.final,
      }
    : resolveClockAndElapsed(input.entry, totalMinutes);

  const score: LiveScore | null = input.settledResult
    ? { home: input.settledResult.homeScore, away: input.settledResult.awayScore }
    : input.entry?.score ?? input.game?.score ?? null;
  const homeScore = score?.home ?? 0;
  const awayScore = score?.away ?? 0;

  const spec = parsePickSpec({
    market: input.market,
    selection: input.selection,
    line: input.line,
    pickLabel: input.pickLabel,
    sport: input.game?.sport ?? null,
  });

  let actualValue = 0;
  if (spec.category === "totals") {
    actualValue = homeScore + awayScore;
  } else if (spec.category === "team_totals") {
    actualValue = spec.side === "away" ? awayScore : homeScore;
  } else if (spec.category === "asian_handicap" || spec.category === "dnb") {
    actualValue = spec.side === "away" ? awayScore - homeScore : homeScore - awayScore;
  } else if (spec.category === "h2h") {
    actualValue =
      spec.side === "draw"
        ? homeScore === awayScore
          ? 1
          : 0
        : spec.side === "away"
          ? awayScore - homeScore
          : homeScore - awayScore;
  } else if (spec.category === "double_chance") {
    actualValue =
      spec.side === "away"
        ? awayScore - homeScore
        : spec.side === "home"
          ? homeScore - awayScore
          : Math.abs(homeScore - awayScore);
  } else if (spec.category === "btts") {
    actualValue = (homeScore > 0 ? 1 : 0) + (awayScore > 0 ? 1 : 0);
  } else if (
    spec.category === "corners" ||
    spec.category === "cards" ||
    spec.category === "shots" ||
    spec.category === "shots_on_target"
  ) {
    actualValue = readTeamCountStat(input.detail, spec.side, spec.category);
  } else if (spec.category === "player_prop") {
    actualValue = readPlayerStatValue(spec.playerName, spec.propStat, input.detail);
  }

  let asianEval: AsianHandicapQuarterEvaluation | null = null;
  if (spec.useAsianEvaluation) {
    if (spec.category === "asian_handicap" || spec.category === "dnb") {
      asianEval = evaluateAsianHandicapQuarterState(actualValue, spec.targetLine);
    } else if (spec.direction === "over") {
      asianEval = evaluateAsianHandicapQuarterState(actualValue, -spec.targetLine);
    } else if (spec.direction === "under") {
      asianEval = evaluateAsianHandicapQuarterState(-actualValue, spec.targetLine);
    }
  }

  const rawExpectedMargin = input.fullAccess ? (input.game?.spacetime?.expectedMargin ?? 0) : 0;
  const orientedExpectedMargin =
    spec.side === "away" ? -rawExpectedMargin : rawExpectedMargin;
  const preMatchExpected =
    spec.category === "totals"
      ? ((input.fullAccess ? input.game?.spacetime?.expectedTotal : null) ?? spec.targetLine)
      : spec.category === "asian_handicap" ||
          spec.category === "dnb" ||
          (spec.category === "h2h" && spec.side !== "draw")
        ? orientedExpectedMargin
        : spec.targetLine;

  const projection = computeResidualProjection({
    actualValue,
    targetLine: spec.targetLine,
    elapsedMinutes: clockState.elapsedMinutes,
    totalMinutes,
    preMatchExpected,
    direction: spec.direction,
  });

  const lineups = input.game?.preGame?.confirmedLineups ?? null;
  const benchCheck =
    spec.playerName !== null
      ? detectStarterOnBench({
          playerName: spec.playerName,
          lineups,
          playerStats: input.detail?.playerStats ?? null,
          matchMinute: clockState.elapsedMinutes,
          teamSide: spec.side === "home" || spec.side === "away" ? spec.side : null,
          sport: input.game?.sport ?? (league === "nba" ? "basketball" : null),
        })
      : { alert: null, detail: null };

  const isMonotonicOver =
    spec.direction === "over" &&
    (spec.category === "totals" ||
      spec.category === "team_totals" ||
      spec.category === "corners" ||
      spec.category === "cards" ||
      spec.category === "shots" ||
      spec.category === "shots_on_target" ||
      spec.category === "player_prop");

  let hitLocked = false;
  if (input.settledResult) {
    hitLocked = input.settledResult.status === "won";
  } else if (spec.category === "btts" && spec.direction === "over") {
    hitLocked = actualValue >= 2;
  } else if (isMonotonicOver) {
    hitLocked = asianEval
      ? asianEval.state === "won_full" ||
        (clockState.phase === "final" && asianEval.state === "won_half")
      : actualValue > spec.targetLine;
  } else if (clockState.phase === "final") {
    if (asianEval) {
      hitLocked = asianEval.state === "won_full" || asianEval.state === "won_half";
    } else if (spec.direction === "under") {
      hitLocked = actualValue < spec.targetLine;
    } else if (spec.category === "h2h" && spec.side === "draw") {
      hitLocked = homeScore === awayScore;
    } else if (spec.category === "double_chance") {
      hitLocked = spec.side === "total" ? homeScore !== awayScore : actualValue >= 0;
    } else if (spec.category === "h2h") {
      hitLocked = actualValue > 0;
    } else {
      hitLocked = actualValue > spec.targetLine;
    }
  }

  const milestoneCandidates = buildMilestoneCandidates({
    phase: clockState.phase,
    direction: spec.direction,
    actualValue,
    targetLine: spec.targetLine,
    hitLocked,
    asianState: asianEval?.state ?? null,
    starterAlert: benchCheck.alert,
  });

  return {
    pickId: input.pickId,
    gameId: input.gameId,
    league,
    leagueLabel: sanitizeDisplayText(input.leagueLabel, "Liga"),
    matchLabel: sanitizeDisplayText(input.matchLabel, "Partido"),
    pickLabel: sanitizeDisplayText(input.pickLabel, "Selección"),
    href: resolveCanonicalHref(input.gameId, input.entry, input.game),
    phase: clockState.phase,
    clockLabel: clockState.clockLabel,
    elapsedMinutes: clockState.elapsedMinutes,
    totalMinutes,
    score,
    actualValue: round2(actualValue),
    targetLine: round2(spec.targetLine),
    unitLabel: spec.unitLabel,
    direction: spec.direction,
    projectedFinal: projection.projectedFinal,
    remainingNeeded: projection.remainingNeeded,
    remainingMinutes: projection.remainingMinutes,
    paceRatio: projection.paceRatio,
    asianState: asianEval?.state ?? null,
    asianLabel: asianEval?.label ?? null,
    payoutMultiplier: asianEval?.payoutMultiplier ?? null,
    starterAlert: benchCheck.alert,
    starterAlertDetail: benchCheck.detail,
    hitLocked,
    milestoneCandidates,
  };
}

function isReadonlyDetailMap(
  source: ReadonlyMap<string, LiveMatchDetail> | Readonly<Record<string, LiveMatchDetail>>,
): source is ReadonlyMap<string, LiveMatchDetail> {
  return source instanceof Map;
}

function getDetailFromMap(
  source: LoadLiveTrackedPicksOptions["matchDetails"],
  gameId: string,
): LiveMatchDetail | null {
  if (!source) return null;
  if (isReadonlyDetailMap(source)) {
    return source.get(gameId) ?? null;
  }
  return source[gameId] ?? null;
}

function safeLoadDataset(override: PlatformDataset | null | undefined): PlatformDataset | null {
  if (override !== undefined) return override;
  try {
    return buildServerRawPlatformDataset();
  } catch (err) {
    void err;
    return null;
  }
}

function shouldLoadLiveDetail(
  entry: LiveScoreboardEntry | null,
  kickoffAt: Date,
  nowMs: number,
): boolean {
  if (entry) {
    if (isLivePhaseActive(entry.phase) || entry.phase === "final") {
      return true;
    }
  }
  const delta = kickoffAt.getTime() - nowMs;
  return delta <= PREMATCH_LINEUP_WINDOW_MS && delta >= -4 * 3_600_000;
}

function computeTrackerNextPollSeconds(
  entries: readonly LiveScoreboardEntry[],
  scoreboardPoll: number | null,
  nowMs: number,
): number | null {
  if (entries.length === 0) return null;
  if (entries.some((entry) => entry.phase === "live" || entry.phase === "penalties")) {
    return scoreboardPoll !== null ? Math.max(10, Math.min(20, scoreboardPoll)) : 15;
  }
  if (entries.some((entry) => entry.phase === "halftime")) {
    return scoreboardPoll !== null ? Math.max(15, Math.min(30, scoreboardPoll)) : 30;
  }
  const nearKickoff = entries.some((entry) => {
    if (entry.phase !== "scheduled") return false;
    const kickoffMs = Date.parse(entry.kickoffUtc);
    if (!Number.isFinite(kickoffMs)) return false;
    const delta = kickoffMs - nowMs;
    return delta <= 15 * 60_000 && delta >= -3 * 3_600_000;
  });
  if (nearKickoff) {
    return scoreboardPoll !== null ? Math.max(20, Math.min(60, scoreboardPoll)) : 60;
  }
  if (entries.every((entry) => isLivePhaseTerminal(entry.phase))) {
    return null;
  }
  return scoreboardPoll;
}

function isLegProjectedHit(leg: LiveTrackedPickLeg): boolean {
  if (leg.hitLocked) return true;
  if (leg.phase === "final") {
    return leg.asianState === "won_full" || leg.asianState === "won_half";
  }
  if (leg.direction === "under") {
    return leg.projectedFinal < leg.targetLine;
  }
  if (leg.direction === "handicap") {
    return leg.projectedFinal + leg.targetLine > 0;
  }
  return leg.paceRatio >= 1;
}

export async function loadUserLiveTrackedPicks(
  db: Db,
  userId: string,
  opts: LoadLiveTrackedPicksOptions = {},
): Promise<UserLiveTrackedPicksPayload> {
  const now = opts.now ?? new Date();
  const limit = clampBoundedLimit(opts.limit, MAX_LIVE_TRACKED_PICKS);
  const fullAccess = opts.fullAccess !== false;

  const pendingRows = await db
    .select({
      id: sealedPicks.id,
      pickId: sealedPicks.pickId,
      gameId: sealedPicks.gameId,
      leagueLabel: sealedPicks.leagueLabel,
      matchLabel: sealedPicks.matchLabel,
      pickLabel: sealedPicks.pickLabel,
      pickKind: sealedPicks.pickKind,
      pickMarket: sealedPicks.pickMarket,
      pickSelection: sealedPicks.pickSelection,
      pickLine: sealedPicks.pickLine,
      parlayLegs: sealedPicks.parlayLegs,
      parlayLegResults: sealedPicks.parlayLegResults,
      units: sealedPicks.units,
      userDecimal: sealedPicks.userDecimal,
      fairDecimal: sealedPicks.fairDecimal,
      kickoffAt: sealedPicks.kickoffAt,
    })
    .from(sealedPicks)
    .where(and(eq(sealedPicks.userId, userId), eq(sealedPicks.status, "pending")))
    .orderBy(desc(sealedPicks.kickoffAt), desc(sealedPicks.id))
    .limit(limit);

  if (pendingRows.length === 0) {
    return {
      generatedAt: now.toISOString(),
      nextPollSeconds: null,
      items: [],
    };
  }

  let scoreboard: LiveScoreboard;
  if (opts.scoreboard) {
    scoreboard = opts.scoreboard;
  } else {
    try {
      scoreboard = await getLiveScoreboard(opts.liveDeps);
    } catch (err) {
      void err;
      scoreboard = {
        generatedAt: now.toISOString(),
        sourceFetchedAt: null,
        active: false,
        nextPollSeconds: null,
        notice: null,
        entries: [],
      };
    }
  }

  const entryByGameId = new Map<string, LiveScoreboardEntry>(
    scoreboard.entries.map((entry) => [entry.gameId, entry]),
  );

  const dataset = safeLoadDataset(opts.dataset);
  const gameById = new Map<string, PlatformGame>(
    (dataset?.games ?? []).map((game) => [game.id, game]),
  );

  const detailGameIds = new Map<string, Date>();
  for (const row of pendingRows) {
    if (row.pickKind === "parlay" && Array.isArray(row.parlayLegs) && row.parlayLegs.length > 0) {
      for (const leg of row.parlayLegs) {
        if (!leg?.gameId) continue;
        const parsedKickoff = Date.parse(leg.kickoffAt);
        detailGameIds.set(
          leg.gameId,
          Number.isFinite(parsedKickoff) ? new Date(parsedKickoff) : row.kickoffAt,
        );
      }
    } else {
      detailGameIds.set(row.gameId, row.kickoffAt);
    }
  }

  const detailsByGameId = new Map<string, LiveMatchDetail>();
  const detailLookups: Promise<void>[] = [];
  for (const [gameId, kickoffAt] of detailGameIds.entries()) {
    const provided = getDetailFromMap(opts.matchDetails, gameId);
    if (provided) {
      detailsByGameId.set(gameId, provided);
      continue;
    }
    const entry = entryByGameId.get(gameId) ?? null;
    if (!shouldLoadLiveDetail(entry, kickoffAt, now.getTime())) {
      continue;
    }
    const loader =
      opts.loadMatchDetail ??
      ((id: string) => getLiveMatchDetail(id, opts.liveDeps));
    detailLookups.push(
      loader(gameId)
        .then((detail) => {
          if (detail) {
            detailsByGameId.set(gameId, detail);
          }
        })
        .catch((err) => {
          void err;
        }),
    );
  }
  if (detailLookups.length > 0) {
    await Promise.all(detailLookups);
  }

  const trackedEntries: LiveScoreboardEntry[] = [];
  const items: LiveTrackedPickItem[] = [];

  for (const row of pendingRows) {
    const units = parseNumericDecimalString(row.units, 1);
    const userDecimal = parseNumericDecimalString(row.userDecimal, 1.01);
    const fairDecimal = parseNumericDecimalString(row.fairDecimal, 1.01);

    if (row.pickKind === "parlay" && Array.isArray(row.parlayLegs) && row.parlayLegs.length > 0) {
      const specs: readonly SealedParlayLegSpec[] = row.parlayLegs;
      const settledByPickId = new Map<string, SealedParlayLegResult>(
        (row.parlayLegResults ?? []).map((res) => [res.pickId, res]),
      );

      const evaluatedLegs: LiveTrackedPickLeg[] = specs.map((leg) => {
        const legEntry = entryByGameId.get(leg.gameId) ?? null;
        if (legEntry) trackedEntries.push(legEntry);
        const rawLegDetail = detailsByGameId.get(leg.gameId) ?? null;
        const safeLegDetail =
          rawLegDetail && !fullAccess ? { ...rawLegDetail, inPlayWinProb: null } : rawLegDetail;
        return evaluateLiveLeg({
          pickId: leg.pickId,
          gameId: leg.gameId,
          leagueLabel: leg.leagueLabel,
          matchLabel: leg.matchLabel,
          pickLabel: leg.pickLabel,
          market: leg.market,
          selection: leg.selection,
          line: leg.line ?? null,
          entry: legEntry,
          detail: safeLegDetail,
          game: gameById.get(leg.gameId) ?? null,
          fullAccess,
          settledResult: settledByPickId.get(leg.pickId) ?? null,
        });
      });

      const totalLegs = evaluatedLegs.length;
      const hitLegs = evaluatedLegs.filter((leg) => leg.hitLocked).length;
      const projectedHitLegs = evaluatedLegs.filter(isLegProjectedHit).length;
      const activeLegsCount = evaluatedLegs.filter((leg) => isLivePhaseActive(leg.phase)).length;
      const allFinal = evaluatedLegs.every((leg) => leg.phase === "final");
      const anyLostFullFinal = evaluatedLegs.some(
        (leg) =>
          leg.phase === "final" &&
          !leg.hitLocked &&
          leg.asianState !== "push" &&
          leg.asianState !== "won_half" &&
          leg.asianState !== "lost_half",
      );
      const anyLostHalfFinal = evaluatedLegs.some(
        (leg) => leg.phase === "final" && leg.asianState === "lost_half",
      );
      const anyWonHalfFinal = evaluatedLegs.some(
        (leg) => leg.phase === "final" && leg.asianState === "won_half",
      );
      const allPushFinal =
        allFinal &&
        totalLegs > 0 &&
        evaluatedLegs.every((leg) => leg.asianState === "push");
      const allNonLosingFinal =
        allFinal &&
        totalLegs > 0 &&
        evaluatedLegs.every((leg) => leg.hitLocked || leg.asianState === "push");
      const benchLeg = evaluatedLegs.find((leg) => leg.starterAlert !== null) ?? null;
      const primaryLeg = evaluatedLegs[0]!;
      const parlayPhase: LivePhase =
        activeLegsCount > 0 ? "live" : allFinal ? "final" : primaryLeg.phase;
      const parlayAsianState: LiveAsianPickState | null = anyLostFullFinal
        ? "lost_full"
        : anyLostHalfFinal
          ? "lost_half"
          : allPushFinal
            ? "push"
            : allNonLosingFinal && anyWonHalfFinal
              ? "won_half"
              : allNonLosingFinal && hitLegs > 0
                ? "won_full"
                : null;
      const parlayHitLocked = hitLegs === totalLegs && totalLegs > 0;
      const parlayClock =
        activeLegsCount > 0
          ? `${activeLegsCount} en vivo · ${hitLegs}/${totalLegs}`
          : `${hitLegs}/${totalLegs} piernas`;

      const parlayMilestones = buildMilestoneCandidates({
        phase: parlayPhase,
        direction: "over",
        actualValue: hitLegs,
        targetLine: totalLegs,
        hitLocked: parlayHitLocked,
        asianState: parlayAsianState,
        starterAlert: benchLeg?.starterAlert ?? null,
      });

      items.push({
        id: row.id,
        pickId: row.pickId,
        gameId: row.gameId,
        pickKind: "parlay",
        league: primaryLeg.league,
        leagueLabel: sanitizeDisplayText(row.leagueLabel, "Combinada"),
        matchLabel: sanitizeDisplayText(row.matchLabel, `${totalLegs} selecciones`),
        pickLabel: sanitizeDisplayText(row.pickLabel, "Parlay"),
        href: primaryLeg.href,
        phase: parlayPhase,
        clockLabel: parlayClock,
        elapsedMinutes: Math.max(...evaluatedLegs.map((leg) => leg.elapsedMinutes)),
        totalMinutes: Math.max(...evaluatedLegs.map((leg) => leg.totalMinutes)),
        score: primaryLeg.score,
        units,
        userDecimal,
        fairDecimal,
        actualValue: hitLegs,
        targetLine: totalLegs,
        unitLabel: "piernas",
        direction: "over",
        projectedFinal: projectedHitLegs,
        remainingNeeded: Math.max(0, totalLegs - hitLegs),
        remainingMinutes: Math.max(...evaluatedLegs.map((leg) => leg.remainingMinutes)),
        paceRatio: totalLegs > 0 ? round2(projectedHitLegs / totalLegs) : 0,
        asianState: parlayAsianState,
        asianLabel: parlayAsianState ? ASIAN_STATE_LABELS[parlayAsianState] : null,
        payoutMultiplier:
          parlayAsianState === "won_full"
            ? 1
            : parlayAsianState === "won_half"
              ? 0.5
              : parlayAsianState === "push"
                ? 0
                : parlayAsianState === "lost_half"
                  ? -0.5
                  : parlayAsianState === "lost_full"
                    ? -1
                    : null,
        starterAlert: benchLeg?.starterAlert ?? null,
        starterAlertDetail: benchLeg?.starterAlertDetail ?? null,
        hitLocked: parlayHitLocked,
        legs: evaluatedLegs,
        milestoneCandidates: parlayMilestones,
      });
      continue;
    }

    const entry = entryByGameId.get(row.gameId) ?? null;
    if (entry) trackedEntries.push(entry);
    const rawDetail = detailsByGameId.get(row.gameId) ?? null;
    const safeDetail =
      rawDetail && !fullAccess ? { ...rawDetail, inPlayWinProb: null } : rawDetail;
    const evaluated = evaluateLiveLeg({
      pickId: row.pickId,
      gameId: row.gameId,
      leagueLabel: row.leagueLabel,
      matchLabel: row.matchLabel,
      pickLabel: row.pickLabel,
      market: row.pickMarket,
      selection: row.pickSelection,
      line: parseStrictFiniteNumber(row.pickLine),
      entry,
      detail: safeDetail,
      game: gameById.get(row.gameId) ?? null,
      fullAccess,
    });

    items.push({
      id: row.id,
      pickId: evaluated.pickId,
      gameId: evaluated.gameId,
      pickKind: "single",
      league: evaluated.league,
      leagueLabel: evaluated.leagueLabel,
      matchLabel: evaluated.matchLabel,
      pickLabel: evaluated.pickLabel,
      href: evaluated.href,
      phase: evaluated.phase,
      clockLabel: evaluated.clockLabel,
      elapsedMinutes: evaluated.elapsedMinutes,
      totalMinutes: evaluated.totalMinutes,
      score: evaluated.score,
      units,
      userDecimal,
      fairDecimal,
      actualValue: evaluated.actualValue,
      targetLine: evaluated.targetLine,
      unitLabel: evaluated.unitLabel,
      direction: evaluated.direction,
      projectedFinal: evaluated.projectedFinal,
      remainingNeeded: evaluated.remainingNeeded,
      remainingMinutes: evaluated.remainingMinutes,
      paceRatio: evaluated.paceRatio,
      asianState: evaluated.asianState,
      asianLabel: evaluated.asianLabel,
      payoutMultiplier: evaluated.payoutMultiplier,
      starterAlert: evaluated.starterAlert,
      starterAlertDetail: evaluated.starterAlertDetail,
      hitLocked: evaluated.hitLocked,
      legs: [evaluated],
      milestoneCandidates: evaluated.milestoneCandidates,
    });
  }

  return {
    generatedAt: now.toISOString(),
    nextPollSeconds: computeTrackerNextPollSeconds(
      trackedEntries,
      scoreboard.nextPollSeconds,
      now.getTime(),
    ),
    items,
  };
}
