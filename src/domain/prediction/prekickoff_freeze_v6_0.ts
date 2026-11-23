/**
 * PitchLab v6.0 Candidate (`EXP_V61`) —
 * Global Referee Disciplinary Registry, Deterministic Pre-Kickoff Freeze Contract
 * (`sealPreKickoffOutlookV6` & `auditPreKickoffCausalityV6`) & Prospective Power De-Vig
 * Quotes Evaluator (`evaluateProspectiveQuotesPowerDevigV6`).
 *
 * Invariants:
 *  - Pure deterministic TypeScript (`0` Node/external runtime dependencies).
 *  - IEEE-754 `< 1e-12` numerical parity and bit-exact `SHA-256` canonical digests with
 *    `research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/run_exp_v61_officials_freeze_v6_0.py`.
 *  - Strict pre-kickoff causality (`inputsAsOfUtc <= kickoffUtc`), marking `"post_kickoff_contaminated"`
 *    on late regenerations and preserving sealed forecasts across `scheduled -> LIVE -> FT`.
 *  - Zero forbidden betting fields (`stake`, `kelly`, `kellyFraction`, `ev`, `expectedEdge`, `tier`).
 */

import { float64ToCanonicalHex, sha256Hex } from "./ledger.js";
import { clamp, createMulberry32, logit, normalCdf, sigmoid } from "./math.js";

export { clamp, createMulberry32, float64ToCanonicalHex, logit, normalCdf, sha256Hex, sigmoid };

export const SCHEMA_VERSION_OFFICIALS_FREEZE_V6 =
  "pitchlab_officials_freeze_v6_0_candidate_1.0.0" as const;
export const SCHEMA_VERSION_PREKICKOFF_SEAL_V6 = "prekickoff_seal_v6.0.0" as const;
export const GENESIS_PREKICKOFF_SEAL_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

export const DEFAULT_V6_BOOTSTRAP_SEED = 20261111;
export const DEFAULT_V6_BOOTSTRAP_RESAMPLES = 1000;
export const DEFAULT_BOOKING_POINTS_GAMMA_RED_V6 = 0.168;
export const DEFAULT_BOOKING_POINTS_LINES_V6: readonly number[] = [35.5, 45.5, 55.5];
export const DEFAULT_R_DISPERSION_YELLOW_V6 = 80.0;
export const DEFAULT_R_DISPERSION_RED_V6 = 25.0;
export const DEFAULT_MAX_YELLOW_TOTAL_V6 = 24;
export const DEFAULT_MAX_RED_TOTAL_V6 = 8;

export type OfficialPriorProvenanceV6 =
  | "empirical_tm_verified"
  | "confederation_hierarchical_prior"
  | "non_soccer_umpire_neutral";

export type LifecycleStatusV6 = "scheduled" | "LIVE" | "FT";

export type IncomingCausalityStatusV6 =
  | "strict_pre_kickoff"
  | "post_kickoff_contaminated"
  | "missing_analysis"
  | "missing_timestamps";

export type SealCausalityStatusV6 =
  | "strict_pre_kickoff_sealed"
  | "post_kickoff_contaminated"
  | "unsealed_missing_forecast"
  | "missing_timestamps";

export type SealActionV6 =
  | "sealed_new_pre_kickoff"
  | "preserved_existing_seal"
  | "refreshed_pre_kickoff_seal"
  | "rejected_contaminated_preserved_seal"
  | "rejected_contaminated_sealed_from_causal_backfill"
  | "rejected_post_kickoff_contaminated"
  | "preserved_seal_on_missing_upstream"
  | "recovered_ft_from_causal_walkforward"
  | "unsealed_no_valid_inputs"
  | "rejected_missing_kickoff";

export type SealOriginV6 = "live_snapshot_prekickoff" | "causal_walkforward_backfill";

export interface CompetitionDisciplinaryPriorV6 {
  readonly league: string;
  readonly confederation_group: string;
  readonly confederation: string;
  readonly v51_div_code: string | null;
  readonly equivalent_prior_games: number;
  readonly kappa_comp: number;
  readonly yellow_rate_prior: number;
  readonly red_card_rate_prior: number;
  readonly fouls_rate_prior: number;
  readonly cards_per_foul_mult: number;
  readonly booking_points_expected: number;
  readonly gamma_red: number;
}

export interface V51OfficialEntryV6 {
  readonly last_div: string;
  readonly games_yellow: number;
  readonly games_red: number;
  readonly yellow_mult: number;
  readonly red_mult: number;
  readonly fouls_mult: number;
  readonly cpf_mult: number;
}

export interface OfficialsFreezeModelArtifactV6 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_window_protected: readonly [string, string];
  readonly holdout_sealed_untouched: boolean;
  readonly booking_points_gamma_red: number;
  readonly booking_points_lines: readonly number[];
  readonly r_dispersion_yellow: number;
  readonly r_dispersion_red: number;
  readonly confederation_priors: Readonly<Record<string, Record<string, unknown>>>;
  readonly competition_priors: Readonly<Record<string, CompetitionDisciplinaryPriorV6>>;
  readonly alias_to_v5_1_key: Readonly<Record<string, string>>;
  readonly v5_1_officials: Readonly<Record<string, V51OfficialEntryV6>>;
}

export interface NormalizedRefereeNameV6 {
  readonly normalizedFull: string;
  readonly canonicalKey: string;
  readonly legacyDotlessKey: string;
  readonly firstInitial: string;
  readonly tokens: readonly string[];
}

export interface BookingPointsLineProjectionV6 {
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly pOverConditionalNoPush: number;
}

export interface ConditionalBookingPointsResultV6 {
  readonly formula: "10_per_yellow_plus_25_per_red";
  readonly gammaRed: number;
  readonly expectedBookingPoints: number;
  readonly pRedCardOver05: number;
  readonly expectedYellowsGivenNoRed: number;
  readonly expectedYellowsGivenRedCard: number;
  readonly lines: Readonly<Record<string, BookingPointsLineProjectionV6>>;
}

export interface ResolvedOfficialPriorV6 {
  readonly league: string;
  readonly sport: string;
  readonly refereeRaw: string | null;
  readonly canonicalKey: string;
  readonly matchedV51Key: string | null;
  readonly confederation: string;
  readonly provenance: OfficialPriorProvenanceV6;
  readonly historicalGames: number;
  readonly yellowMult: number;
  readonly redMult: number;
  readonly foulsMult: number;
  readonly cardsPerFoulMult: number;
  readonly yellowRatePrior: number | null;
  readonly redCardRatePrior: number | null;
  readonly foulsRatePrior: number | null;
  readonly gammaRed: number;
  readonly bookingPointsExpected: number | null;
  readonly pRedCardOver05: number | null;
  readonly pBookingPointsOver355: number | null;
  readonly pBookingPointsOver455: number | null;
  readonly pBookingPointsOver555: number | null;
}

export interface PreKickoffAnalysisPayloadV6 {
  readonly inputsAsOfUtc: string;
  readonly probabilities: Readonly<Record<string, number | null>>;
  readonly projection: Readonly<Record<string, number | null>>;
}

export interface SealedPreKickoffRecordV6 {
  readonly schemaVersion: typeof SCHEMA_VERSION_PREKICKOFF_SEAL_V6;
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly kickoffEpochMs: number;
  readonly inputsAsOfUtc: string;
  readonly inputsAsOfEpochMs: number;
  readonly leadTimeSeconds: number;
  readonly sealOrigin: SealOriginV6;
  readonly prevSealSha256: string;
  readonly sealSha256: string;
  readonly probabilities: Readonly<Record<string, number | null>>;
  readonly projection: Readonly<Record<string, number | null>>;
}

export interface SealPreKickoffInputV6 {
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly status: string;
  readonly incomingAnalysis?: PreKickoffAnalysisPayloadV6 | null;
  readonly existingSealedRecord?: SealedPreKickoffRecordV6 | null;
  readonly causalBackfillAnalysis?: PreKickoffAnalysisPayloadV6 | null;
  readonly allowPreKickoffRefresh?: boolean;
}

export interface SealPreKickoffOutcomeV6 {
  readonly matchId: string;
  readonly lifecycleStatus: LifecycleStatusV6;
  readonly hasForecast: boolean;
  readonly causalityStatus: SealCausalityStatusV6;
  readonly incomingCausalityStatus: IncomingCausalityStatusV6;
  readonly sealAction: SealActionV6;
  readonly incomingContaminatedRejected: boolean;
  readonly sealedRecord: SealedPreKickoffRecordV6 | null;
}

export interface SnapshotCausalityObservationV6 {
  readonly snapshotFile?: string;
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly status: string;
  readonly incomingAnalysis?: PreKickoffAnalysisPayloadV6 | null;
  readonly causalBackfillAnalysis?: PreKickoffAnalysisPayloadV6 | null;
}

export interface PreKickoffCausalityAuditReportV6 {
  readonly totalObservationsAudited: number;
  readonly uniqueMatchesTracked: number;
  readonly sealedMatchesCount: number;
  readonly rawStrictPreKickoffCount: number;
  readonly rawPostKickoffContaminatedCount: number;
  readonly rawPostKickoffFtCount: number;
  readonly rawPostKickoffScheduledCount: number;
  readonly rawMissingAnalysisOnFtCount: number;
  readonly rescuedFromPriorSealCount: number;
  readonly recoveredFromCausalBackfillCount: number;
  readonly rejectedUnrecoverableContaminatedCount: number;
  readonly finalMatchesTotal: number;
  readonly finalMatchesWithSealedForecast: number;
  readonly contaminatedAcceptedIntoLedgerCount: number;
  readonly ledgerSha256: string;
  readonly outcomesByMatchKey: Readonly<Record<string, SealPreKickoffOutcomeV6>>;
}

export interface ClusterBootstrapMeanSummaryV6 {
  readonly n_rows: number;
  readonly n_clusters: number;
  readonly mean: number | null;
  readonly se: number | null;
  readonly ci95_lo: number | null;
  readonly ci95_hi: number | null;
  readonly bootstrap_method: "cluster_mulberry32";
  readonly n_resamples: number;
  readonly seed: number;
}

export interface ClusterBootstrapDiffSummaryV6 {
  readonly n_rows: number;
  readonly n_clusters: number;
  readonly cand_mean: number | null;
  readonly bench_mean: number | null;
  readonly delta_mean: number | null;
  readonly se: number | null;
  readonly ci95_lo: number | null;
  readonly ci95_hi: number | null;
  readonly p_value_one_sided: number | null;
  readonly significant_improvement: boolean;
  readonly significance_label: "significativa" | "no significativa";
  readonly bootstrap_method: "cluster_mulberry32";
  readonly n_resamples: number;
  readonly seed: number;
}

export interface QuoteTickInputV6 {
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_decimal: number;
  readonly ts_captured: string;
  readonly ts_event_start: string;
  readonly source?: string;
}

export interface EnginePreKickoffEventProbsV6 {
  readonly matchedSnapshotGameId?: string;
  readonly sealedFromSnapshot?: string;
  readonly v6Probs?: Readonly<Record<string, number>>;
  readonly rawPreKickoffProbs?: Readonly<Record<string, number>>;
}

export interface SettledScoreRecordV6 {
  readonly homeScore: number;
  readonly awayScore: number;
}

export interface PowerDevigSolutionV6 {
  readonly probsNoVig: readonly number[];
  readonly overround: number;
  readonly alphaExponent: number;
}

export interface EvaluatedQuoteMarketRowV6 {
  readonly eventId: string;
  readonly league: string;
  readonly book: string;
  readonly marketKey: string;
  readonly selections: readonly string[];
  readonly decimalOdds: readonly number[];
  readonly powerNoVigProbs: readonly number[];
  readonly modelV6Probs: readonly number[];
  readonly overround: number;
  readonly powerAlpha: number;
  readonly klDivergencePowerToModel: number;
  readonly madProbDispersion: number;
  readonly madRawPreKickoff: number;
  readonly settledWinnerIdx: number | null;
}

export interface SettledQuotesCalibrationV6 {
  readonly n_settled_events: number;
  readonly n_settled_markets: number;
  readonly logloss_v6: number | null;
  readonly logloss_power_novig: number | null;
  readonly delta_logloss_v6_minus_power: number | null;
  readonly ci95_lo: number | null;
  readonly ci95_hi: number | null;
  readonly brier_v6: number | null;
  readonly brier_power_novig: number | null;
  readonly delta_brier_v6_minus_power: number | null;
  readonly ece_v6: number | null;
  readonly ece_power_novig: number | null;
  readonly significant_improvement: boolean;
  readonly significance_label: "significativa" | "no significativa";
  readonly bootstrap_method: "cluster_mulberry32";
  readonly n_resamples: number;
  readonly seed: number;
}

export interface ProspectiveQuotesEvaluationReportV6 {
  readonly n_raw_ticks: number;
  readonly n_valid_prekickoff_ticks: number;
  readonly n_post_kickoff_discarded_ticks: number;
  readonly n_incomplete_or_invalid_ticks: number;
  readonly n_complete_markets: number;
  readonly n_unique_events: number;
  readonly devig_method: "power";
  readonly mean_overround: number | null;
  readonly mean_power_alpha: number | null;
  readonly prekickoff_dispersion_and_alignment: {
    readonly mad_prob_dispersion_v6: ClusterBootstrapMeanSummaryV6;
    readonly rmse_prob_dispersion_v6: number | null;
    readonly mean_signed_prob_diff_v6_minus_power: number | null;
    readonly cross_entropy_v6_vs_raw_prekickoff: ClusterBootstrapDiffSummaryV6;
    readonly kl_divergence_v6_vs_raw_prekickoff: ClusterBootstrapDiffSummaryV6;
    readonly brier_divergence_v6_vs_raw_prekickoff: ClusterBootstrapDiffSummaryV6;
    readonly mad_dispersion_v6_vs_raw_prekickoff: ClusterBootstrapDiffSummaryV6;
    readonly playable_zone_1_55_to_2_60_mad_v6_vs_raw: ClusterBootstrapDiffSummaryV6;
  };
  readonly settled_outcome_calibration: SettledQuotesCalibrationV6;
  readonly by_market: Readonly<
    Record<
      string,
      {
        readonly n_markets: number;
        readonly mean_kl_power_to_v6: number;
        readonly mean_mad_prob_dispersion: number;
        readonly mean_overround: number;
      }
    >
  >;
  readonly by_league: Readonly<
    Record<
      string,
      {
        readonly n_markets: number;
        readonly mean_kl_power_to_v6: number;
        readonly mean_mad_prob_dispersion: number;
        readonly mean_overround: number;
      }
    >
  >;
  readonly evaluated_markets: readonly EvaluatedQuoteMarketRowV6[];
}

// ============================================================================
// 1. Deterministic UTC Calendar & Cluster-Bootstrap Primitives
// ============================================================================

const ISO_UTC_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const HONORIFIC_REGEX = /^(?:dr|mr|mrs|ms|prof)\.?\s+/i;
const GEN_SUFFIX_REGEX = /\b(?:jr|sr|ii|iii|iv)\b/gi;
const NON_ALPHA_REGEX = /[^a-z\s]+/g;
const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const NON_ASCII_REGEX = /[^\x00-\x7f]/g;

const NON_SOCCER_US_LEAGUE_MAP: Readonly<Record<string, string>> = {
  mlb: "mlb",
  nba: "nba",
  nfl: "nfl",
  nhl: "nhl",
};

const LUSOPHONE_UEFA_LEAGUES: ReadonlySet<string> = new Set([
  "liga-portugal",
  "champions-league",
  "europa-league",
  "conference-league",
  "uefa-super-cup",
  "uefa-nations",
  "eurocopa",
]);

const HISPANIC_UEFA_LEAGUES: ReadonlySet<string> = new Set([
  "laliga",
  "segunda-espana",
  "copa-del-rey",
  "champions-league",
  "europa-league",
  "conference-league",
  "uefa-super-cup",
  "uefa-nations",
  "eurocopa",
]);

const TURKISH_UEFA_LEAGUES: ReadonlySet<string> = new Set([
  "super-lig",
  "champions-league",
  "europa-league",
  "conference-league",
  "uefa-super-cup",
  "uefa-nations",
  "eurocopa",
]);

const NOBILIARY_PARTICLES: ReadonlySet<string> = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "del",
  "la",
  "las",
  "los",
  "van",
  "von",
  "el",
  "al",
]);

function roundTo8(x: number): number {
  return Math.round(x * 1e8) / 1e8;
}

function roundTo6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function quantileLinearSortedPure(sortedVals: Float64Array | readonly number[], q: number): number {
  const n = sortedVals.length;
  if (n === 0) {
    throw new Error("quantileLinearSortedPure requires non-empty array");
  }
  if (n === 1) return sortedVals[0] ?? 0.0;
  const cq = clamp(q, 0.0, 1.0);
  const pos = cq * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const vLo = sortedVals[lo] ?? 0.0;
  const vHi = sortedVals[hi] ?? vLo;
  return vLo + frac * (vHi - vLo);
}

function isValidGregorianDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Parses an ISO-8601 date/timestamp string into exact UTC epoch milliseconds,
 * treating missing timezone offsets as UTC `Z` (`0` host-timezone dependence).
 */
export function parseIsoUtcEpochMs(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const m = ISO_UTC_REGEX.exec(s);
  if (!m) return null;

  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  const hour = Number.parseInt(m[4] ?? "0", 10);
  const minute = Number.parseInt(m[5] ?? "0", 10);
  const second = Number.parseInt(m[6] ?? "0", 10);
  const fracRaw = m[7] ?? "";
  const tzRaw = m[8] ?? "Z";

  if (
    !Number.isFinite(year) ||
    !isValidGregorianDate(year, month, day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const ms = fracRaw.length > 0 ? Number.parseInt((fracRaw + "000").slice(0, 3), 10) : 0;
  const baseMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);

  let offsetMs = 0;
  if (tzRaw !== "Z") {
    const sign = tzRaw.startsWith("+") ? 1 : -1;
    const digits = tzRaw.slice(1).replace(":", "");
    const tzH = Number.parseInt(digits.slice(0, 2), 10);
    const tzM = Number.parseInt(digits.slice(2, 4), 10);
    offsetMs = sign * ((tzH * 60 + tzM) * 60_000);
  }

  return baseMs - offsetMs;
}

/**
 * Formats integer UTC epoch milliseconds into canonical 24-character `YYYY-MM-DDTHH:MM:SS.mmmZ`.
 */
export function formatEpochMsUtc(epochMs: number): string {
  return new Date(Math.trunc(epochMs)).toISOString();
}

export function clusterBootstrapMeanPureV6(
  clusterIds: readonly string[],
  values: readonly number[],
  nResamples: number = DEFAULT_V6_BOOTSTRAP_RESAMPLES,
  seed: number = DEFAULT_V6_BOOTSTRAP_SEED,
): ClusterBootstrapMeanSummaryV6 {
  const nRows = values.length;
  if (nRows === 0) {
    return Object.freeze({
      n_rows: 0,
      n_clusters: 0,
      mean: null,
      se: null,
      ci95_lo: null,
      ci95_hi: null,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  let sumAll = 0.0;
  for (let i = 0; i < nRows; i += 1) sumAll += values[i] ?? 0.0;
  const ptMean = sumAll / nRows;

  const uniqueClusters = Array.from(new Set(clusterIds)).sort();
  const nClusters = uniqueClusters.length;
  if (nClusters < 2) {
    return Object.freeze({
      n_rows: nRows,
      n_clusters: nClusters,
      mean: roundTo8(ptMean),
      se: null,
      ci95_lo: null,
      ci95_hi: null,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  const cMap = new Map<string, number>();
  for (let i = 0; i < nClusters; i += 1) {
    cMap.set(uniqueClusters[i] ?? "", i);
  }
  const sumV = new Float64Array(nClusters);
  const sumW = new Float64Array(nClusters);
  for (let i = 0; i < nRows; i += 1) {
    const cid = clusterIds[i] ?? "";
    const idx = cMap.get(cid) ?? 0;
    sumV[idx] = (sumV[idx] ?? 0.0) + (values[i] ?? 0.0);
    sumW[idx] = (sumW[idx] ?? 0.0) + 1.0;
  }

  const rng = createMulberry32(seed);
  const boot = new Float64Array(nResamples);
  let bootSum = 0.0;

  for (let b = 0; b < nResamples; b += 1) {
    let bNum = 0.0;
    let bDen = 0.0;
    for (let c = 0; c < nClusters; c += 1) {
      const pick = Math.min(nClusters - 1, Math.floor(rng() * nClusters));
      bNum += sumV[pick] ?? 0.0;
      bDen += sumW[pick] ?? 0.0;
    }
    const bv = bNum / Math.max(bDen, 1e-12);
    boot[b] = bv;
    bootSum += bv;
  }

  const meanB = bootSum / nResamples;
  let sqVar = 0.0;
  for (let b = 0; b < nResamples; b += 1) {
    const d = (boot[b] ?? 0.0) - meanB;
    sqVar += d * d;
  }
  const se = Math.sqrt(sqVar / Math.max(1, nResamples - 1));
  boot.sort();

  return Object.freeze({
    n_rows: nRows,
    n_clusters: nClusters,
    mean: roundTo8(ptMean),
    se: roundTo8(se),
    ci95_lo: roundTo8(quantileLinearSortedPure(boot, 0.025)),
    ci95_hi: roundTo8(quantileLinearSortedPure(boot, 0.975)),
    bootstrap_method: "cluster_mulberry32" as const,
    n_resamples: nResamples,
    seed,
  });
}

export function clusterBootstrapDiffPureV6(
  clusterIds: readonly string[],
  lossCand: readonly number[],
  lossBench: readonly number[],
  nResamples: number = DEFAULT_V6_BOOTSTRAP_RESAMPLES,
  seed: number = DEFAULT_V6_BOOTSTRAP_SEED,
): ClusterBootstrapDiffSummaryV6 {
  const nRows = lossCand.length;
  if (nRows === 0) {
    return Object.freeze({
      n_rows: 0,
      n_clusters: 0,
      cand_mean: null,
      bench_mean: null,
      delta_mean: null,
      se: null,
      ci95_lo: null,
      ci95_hi: null,
      p_value_one_sided: null,
      significant_improvement: false,
      significance_label: "no significativa" as const,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  let sumC = 0.0;
  let sumB = 0.0;
  const diffs = new Float64Array(nRows);
  for (let i = 0; i < nRows; i += 1) {
    const c = lossCand[i] ?? 0.0;
    const b = lossBench[i] ?? 0.0;
    sumC += c;
    sumB += b;
    diffs[i] = c - b;
  }
  const candMean = sumC / nRows;
  const benchMean = sumB / nRows;
  const deltaMean = (sumC - sumB) / nRows;

  const uniqueClusters = Array.from(new Set(clusterIds)).sort();
  const nClusters = uniqueClusters.length;
  if (nClusters < 2) {
    return Object.freeze({
      n_rows: nRows,
      n_clusters: nClusters,
      cand_mean: roundTo8(candMean),
      bench_mean: roundTo8(benchMean),
      delta_mean: roundTo8(deltaMean),
      se: null,
      ci95_lo: null,
      ci95_hi: null,
      p_value_one_sided: null,
      significant_improvement: false,
      significance_label: "no significativa" as const,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  const cMap = new Map<string, number>();
  for (let i = 0; i < nClusters; i += 1) {
    cMap.set(uniqueClusters[i] ?? "", i);
  }
  const sumD = new Float64Array(nClusters);
  const sumW = new Float64Array(nClusters);
  for (let i = 0; i < nRows; i += 1) {
    const cid = clusterIds[i] ?? "";
    const idx = cMap.get(cid) ?? 0;
    sumD[idx] = (sumD[idx] ?? 0.0) + (diffs[i] ?? 0.0);
    sumW[idx] = (sumW[idx] ?? 0.0) + 1.0;
  }

  const rng = createMulberry32(seed);
  const boot = new Float64Array(nResamples);
  let bootSum = 0.0;
  let geZero = 0;

  for (let b = 0; b < nResamples; b += 1) {
    let bNum = 0.0;
    let bDen = 0.0;
    for (let c = 0; c < nClusters; c += 1) {
      const pick = Math.min(nClusters - 1, Math.floor(rng() * nClusters));
      bNum += sumD[pick] ?? 0.0;
      bDen += sumW[pick] ?? 0.0;
    }
    const bv = bNum / Math.max(bDen, 1e-12);
    boot[b] = bv;
    bootSum += bv;
    if (bv >= 0.0) geZero += 1;
  }

  const meanB = bootSum / nResamples;
  let sqVar = 0.0;
  for (let b = 0; b < nResamples; b += 1) {
    const d = (boot[b] ?? 0.0) - meanB;
    sqVar += d * d;
  }
  const se = Math.sqrt(sqVar / Math.max(1, nResamples - 1));
  boot.sort();

  const ciLo = quantileLinearSortedPure(boot, 0.025);
  const ciHi = quantileLinearSortedPure(boot, 0.975);
  const sigImp = ciHi < 0.0;
  const sigLbl: "significativa" | "no significativa" =
    ciHi < 0.0 || ciLo > 0.0 ? "significativa" : "no significativa";

  return Object.freeze({
    n_rows: nRows,
    n_clusters: nClusters,
    cand_mean: roundTo8(candMean),
    bench_mean: roundTo8(benchMean),
    delta_mean: roundTo8(deltaMean),
    se: roundTo8(se),
    ci95_lo: roundTo8(ciLo),
    ci95_hi: roundTo8(ciHi),
    p_value_one_sided: roundTo6(geZero / nResamples),
    significant_improvement: sigImp,
    significance_label: sigLbl,
    bootstrap_method: "cluster_mulberry32" as const,
    n_resamples: nResamples,
    seed,
  });
}

export function safeEceBinaryPureV6(
  yTrue: readonly number[],
  probs: readonly number[],
  nBins: number = 10,
): number | null {
  const n = yTrue.length;
  if (n === 0) return null;
  const binsN = new Int32Array(nBins);
  const binsP = new Float64Array(nBins);
  const binsY = new Float64Array(nBins);

  for (let i = 0; i < n; i += 1) {
    const pc = clamp(probs[i] ?? 0.0, 0.0, 1.0);
    const y = yTrue[i] ?? 0.0;
    const b = pc >= 1.0 ? nBins - 1 : Math.max(0, Math.min(nBins - 1, Math.floor(pc * nBins)));
    binsN[b] = (binsN[b] ?? 0) + 1;
    binsP[b] = (binsP[b] ?? 0.0) + pc;
    binsY[b] = (binsY[b] ?? 0.0) + y;
  }

  let ece = 0.0;
  for (let b = 0; b < nBins; b += 1) {
    const cnt = binsN[b] ?? 0;
    if (cnt > 0) {
      ece += (cnt / n) * Math.abs((binsP[b] ?? 0.0) / cnt - (binsY[b] ?? 0.0) / cnt);
    }
  }
  return roundTo8(ece);
}

// ============================================================================
// 2. Module 1 — Global Referee Registry & Hierarchical Disciplinary Priors v6.0
// ============================================================================

function transliterateLatinExtended(raw: string): string {
  return raw
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ß/g, "ss")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "o")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe");
}

export function normalizeRefereeNameV6(rawName?: string | null): NormalizedRefereeNameV6 {
  if (!rawName || typeof rawName !== "string") {
    return Object.freeze({
      normalizedFull: "",
      canonicalKey: "",
      legacyDotlessKey: "",
      firstInitial: "",
      tokens: Object.freeze([]),
    });
  }
  const trimmed = rawName.trim();
  const lowTrim = trimmed.toLowerCase();
  if (
    !trimmed ||
    lowTrim === "nan" ||
    lowTrim === "none" ||
    lowTrim === "null" ||
    lowTrim === "unknown" ||
    lowTrim === "tbd"
  ) {
    return Object.freeze({
      normalizedFull: "",
      canonicalKey: "",
      legacyDotlessKey: "",
      firstInitial: "",
      tokens: Object.freeze([]),
    });
  }

  let sMod = transliterateLatinExtended(trimmed)
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "");
  sMod = sMod
    .trim()
    .replace(HONORIFIC_REGEX, "")
    .toLowerCase()
    .replace(GEN_SUFFIX_REGEX, " ")
    .replace(NON_ALPHA_REGEX, " ");
  const toks = sMod.split(/\s+/).filter((t) => t.length > 0);

  let sLeg = trimmed
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .replace(NON_ASCII_REGEX, "");
  sLeg = sLeg
    .trim()
    .replace(HONORIFIC_REGEX, "")
    .toLowerCase()
    .replace(GEN_SUFFIX_REGEX, " ")
    .replace(NON_ALPHA_REGEX, " ");
  const legToks = sLeg.split(/\s+/).filter((t) => t.length > 0);

  const firstTok = toks[0];
  if (!firstTok) {
    return Object.freeze({
      normalizedFull: "",
      canonicalKey: "",
      legacyDotlessKey: "",
      firstInitial: "",
      tokens: Object.freeze([]),
    });
  }

  const firstInitial = firstTok.slice(0, 1);
  const canonKey =
    toks.length === 1 ? firstTok : `${firstInitial} ${toks.slice(1).join(" ")}`;

  const legFirst = legToks[0];
  const legKey = !legFirst
    ? ""
    : legToks.length === 1
      ? legFirst
      : `${legFirst.slice(0, 1)} ${legToks.slice(1).join(" ")}`;

  return Object.freeze({
    normalizedFull: toks.join(" "),
    canonicalKey: canonKey,
    legacyDotlessKey: legKey,
    firstInitial,
    tokens: Object.freeze(toks),
  });
}

export function computeNegativeBinomialPmfExactV6(
  mu: number,
  rDisp: number,
  maxK: number,
): Float64Array {
  const muC = clamp(mu, 0.005, 45.0);
  const rC = clamp(rDisp, 0.35, 250.0);
  const out = new Float64Array(maxK + 1);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  out[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = (out[k - 1] ?? 0.0) * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k] ?? 0.0;
  if (s > 0.0) {
    const invS = 1.0 / s;
    for (let k = 0; k <= maxK; k += 1) out[k] = (out[k] ?? 0.0) * invS;
  } else {
    out[0] = 1.0;
  }
  return out;
}

export function computeConditionalBookingPointsV6(params: {
  readonly yellowRatePrior: number;
  readonly redCardRatePrior: number;
  readonly gammaRed?: number;
  readonly rYellow?: number;
  readonly rRed?: number;
  readonly maxY?: number;
  readonly maxR?: number;
  readonly lines?: readonly number[];
}): ConditionalBookingPointsResultV6 {
  const muYIn = clamp(params.yellowRatePrior, 0.2, 12.0);
  const muRIn = clamp(params.redCardRatePrior, 0.01, 1.5);
  const gr = clamp(params.gammaRed ?? DEFAULT_BOOKING_POINTS_GAMMA_RED_V6, 0.0, 0.85);
  const rYellow = params.rYellow ?? DEFAULT_R_DISPERSION_YELLOW_V6;
  const rRed = params.rRed ?? DEFAULT_R_DISPERSION_RED_V6;
  const maxY = params.maxY ?? DEFAULT_MAX_YELLOW_TOTAL_V6;
  const maxR = params.maxR ?? DEFAULT_MAX_RED_TOTAL_V6;
  const lines = params.lines ?? DEFAULT_BOOKING_POINTS_LINES_V6;

  const pmfYMarg = computeNegativeBinomialPmfExactV6(muYIn, rYellow, maxY);
  const pmfRMarg = computeNegativeBinomialPmfExactV6(muRIn, rRed, maxR);
  const ny = pmfYMarg.length;
  const nr = pmfRMarg.length;

  let muY = 0.0;
  for (let y = 0; y < ny; y += 1) muY += y * (pmfYMarg[y] ?? 0.0);
  let varY = 0.0;
  for (let y = 0; y < ny; y += 1) {
    const d = y - muY;
    varY += d * d * (pmfYMarg[y] ?? 0.0);
  }
  let zNorm = 0.0;
  for (let r = 0; r < nr; r += 1) {
    zNorm += (pmfRMarg[r] ?? 0.0) * Math.exp(gr * r);
  }
  const invZ = zNorm > 1e-15 ? 1.0 / zNorm : 1.0;

  const muByR = new Float64Array(nr);
  let varBetween = 0.0;
  for (let r = 0; r < nr; r += 1) {
    const mr = muY * Math.exp(gr * r) * invZ;
    muByR[r] = mr;
    const d = mr - muY;
    varBetween += (pmfRMarg[r] ?? 0.0) * d * d;
  }
  const excessVar = Math.max(varY - muY - varBetween, 1e-6);
  const rCond = clamp((muY * muY + varBetween) / excessVar, 1.5, 250.0);

  const maxU5 = 2 * maxY + 5 * maxR;
  const pmfU5 = new Float64Array(maxU5 + 1);
  let totMass = 0.0;

  for (let r = 0; r < nr; r += 1) {
    const pr = pmfRMarg[r] ?? 0.0;
    if (pr <= 0.0) continue;
    const pmfYCond = computeNegativeBinomialPmfExactV6(muByR[r] ?? muY, rCond, maxY);
    for (let y = 0; y < ny; y += 1) {
      const py = pmfYCond[y] ?? 0.0;
      if (py <= 0.0) continue;
      const pJoint = pr * py;
      totMass += pJoint;
      const uIdx = 2 * y + 5 * r;
      pmfU5[uIdx] = (pmfU5[uIdx] ?? 0.0) + pJoint;
    }
  }

  const invM = totMass > 0.0 ? 1.0 / totMass : 1.0;
  let expBp = 0.0;
  for (let u = 0; u <= maxU5; u += 1) {
    const pu = (pmfU5[u] ?? 0.0) * invM;
    pmfU5[u] = pu;
    expBp += 5.0 * u * pu;
  }

  const pr0 = pmfRMarg[0] ?? 1.0;
  const pRedOver05 = clamp(1.0 - pr0, 0.001, 0.999);
  const pRPos = Math.max(1.0 - pr0, 1e-12);
  let sumRedPosMu = 0.0;
  for (let r = 1; r < nr; r += 1) {
    sumRedPosMu += (pmfRMarg[r] ?? 0.0) * (muByR[r] ?? muY);
  }

  const lineProbs: Record<string, BookingPointsLineProjectionV6> = {};
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i] ?? 45.5;
    let pOv = 0.0;
    let pUn = 0.0;
    let pPs = 0.0;
    for (let u = 0; u <= maxU5; u += 1) {
      const p = pmfU5[u] ?? 0.0;
      if (p <= 0.0) continue;
      const pts = 5.0 * u;
      if (Math.abs(pts - ln) < 1e-9) pPs += p;
      else if (pts > ln) pOv += p;
      else pUn += p;
    }
    const act = pOv + pUn;
    const poCond = act > 1e-12 ? clamp(pOv / act, 0.001, 0.999) : 0.5;
    lineProbs[ln.toFixed(1)] = Object.freeze({
      line: ln,
      pOver: pOv,
      pUnder: pUn,
      pPush: pPs,
      pOverConditionalNoPush: poCond,
    });
  }

  return Object.freeze({
    formula: "10_per_yellow_plus_25_per_red" as const,
    gammaRed: gr,
    expectedBookingPoints: expBp,
    pRedCardOver05: pRedOver05,
    expectedYellowsGivenNoRed: muByR[0] ?? muY,
    expectedYellowsGivenRedCard: sumRedPosMu / pRPos,
    lines: Object.freeze(lineProbs),
  });
}

function resolveV51KeyDynamic(
  rawName: string,
  league: string,
  v51Officials: Readonly<Record<string, V51OfficialEntryV6>>,
): string | null {
  const norm = normalizeRefereeNameV6(rawName);
  const canon = norm.canonicalKey;
  const legKey = norm.legacyDotlessKey;
  const toks = norm.tokens;
  if (!canon || toks.length === 0) return null;

  if (v51Officials[canon] !== undefined) return canon;

  if (legKey && v51Officials[legKey] !== undefined && TURKISH_UEFA_LEAGUES.has(league)) {
    if (v51Officials[legKey]?.last_div === "T1") return legKey;
  }
  if (TURKISH_UEFA_LEAGUES.has(league) && toks.length >= 2) {
    const lastTok = toks[toks.length - 1] ?? "";
    const lastNoI = lastTok.replace(/i/g, "");
    const midPart = toks.slice(1, -1);
    const candTr = `${norm.firstInitial} ${[...midPart, lastNoI].join(" ")}`.trim();
    if (v51Officials[candTr]?.last_div === "T1") return candTr;
  }

  if (toks.length >= 3) {
    const midToks = toks.slice(1, -1);
    if (midToks.every((t) => t.length === 1)) {
      const shortK = `${norm.firstInitial} ${toks[toks.length - 1] ?? ""}`;
      if (v51Officials[shortK] !== undefined) return shortK;
    }
  }

  if (HISPANIC_UEFA_LEAGUES.has(league) && toks.length >= 3) {
    const patSurname = toks[toks.length - 2] ?? "";
    const matSurname = toks[toks.length - 1] ?? "";
    const prefix = `${norm.firstInitial} `;
    const spCands: string[] = [];
    for (const vk of Object.keys(v51Officials)) {
      const vv = v51Officials[vk];
      if (!vv || vv.last_div !== "SP1" || !vk.startsWith(prefix)) continue;
      const vParts = vk.split(" ");
      if (
        vParts.length >= 4 &&
        vParts[vParts.length - 2] === patSurname &&
        vParts[vParts.length - 1] === matSurname
      ) {
        spCands.push(vk);
      }
    }
    if (spCands.length === 1) return spCands[0] ?? null;
  }

  if (LUSOPHONE_UEFA_LEAGUES.has(league) && toks.length >= 3) {
    const meaningful = toks.slice(1).filter((t) => !NOBILIARY_PARTICLES.has(t));
    if (meaningful.length > 0) {
      const lastSurname = meaningful[meaningful.length - 1] ?? "";
      if (meaningful.length >= 2) {
        const midK = `${norm.firstInitial} ${meaningful[0] ?? ""} ${lastSurname}`;
        if (v51Officials[midK]?.last_div === "P1") return midK;
      }
      const shortPt = `${norm.firstInitial} ${lastSurname}`;
      if (v51Officials[shortPt]?.last_div === "P1") return shortPt;
    }
  }

  return null;
}

export function resolveOfficialPriorV6(params: {
  readonly refereeName?: string | null;
  readonly league: string;
  readonly artifact: OfficialsFreezeModelArtifactV6;
}): ResolvedOfficialPriorV6 {
  const lg = params.league.trim().toLowerCase();
  const usSport = NON_SOCCER_US_LEAGUE_MAP[lg];
  if (usSport !== undefined) {
    const normUs = normalizeRefereeNameV6(params.refereeName);
    return Object.freeze({
      league: lg,
      sport: usSport,
      refereeRaw: params.refereeName ?? null,
      canonicalKey: normUs.canonicalKey || "unassigned",
      matchedV51Key: null,
      confederation: "US_MAJOR_PRO",
      provenance: "non_soccer_umpire_neutral" as const,
      historicalGames: 0,
      yellowMult: 1.0,
      redMult: 1.0,
      foulsMult: 1.0,
      cardsPerFoulMult: 1.0,
      yellowRatePrior: null,
      redCardRatePrior: null,
      foulsRatePrior: null,
      gammaRed: 0.0,
      bookingPointsExpected: null,
      pRedCardOver05: null,
      pBookingPointsOver355: null,
      pBookingPointsOver455: null,
      pBookingPointsOver555: null,
    });
  }

  const compPriors = params.artifact.competition_priors;
  const comp = compPriors[lg] ?? compPriors["amistosos"];
  if (!comp) {
    throw new Error(`Missing fallback competition prior in artifact for league=${lg}`);
  }

  const v51Map = params.artifact.v5_1_officials;
  const aliasMap = params.artifact.alias_to_v5_1_key;
  const norm = normalizeRefereeNameV6(params.refereeName);
  const canonKey = norm.canonicalKey;

  let matchedV51Key: string | null = null;
  if (canonKey) {
    const scopedAlias = aliasMap[`${lg}::${canonKey}`];
    if (scopedAlias !== undefined) {
      matchedV51Key = scopedAlias;
    } else if (v51Map[canonKey] !== undefined) {
      matchedV51Key = canonKey;
    } else {
      matchedV51Key = resolveV51KeyDynamic(params.refereeName ?? "", lg, v51Map);
    }
  }

  const baseYel = comp.yellow_rate_prior;
  const baseRed = comp.red_card_rate_prior;
  const baseFls = comp.fouls_rate_prior;
  const baseCpfMult = comp.cards_per_foul_mult;

  const v51Ent = matchedV51Key ? v51Map[matchedV51Key] : undefined;
  let yMult = 1.0;
  let rMult = 1.0;
  let fMult = 1.0;
  let yelPrior: number;
  let redPrior: number;
  let flsPrior: number;
  let cpfMult: number;
  let provenance: OfficialPriorProvenanceV6;
  let histGames = 0;

  if (v51Ent !== undefined) {
    yMult = v51Ent.yellow_mult;
    rMult = v51Ent.red_mult;
    fMult = v51Ent.fouls_mult;
    yelPrior = clamp(baseYel * yMult, 1.2, 8.5);
    redPrior = clamp(baseRed * rMult, 0.03, 0.85);
    flsPrior = clamp(baseFls * fMult, 12.0, 36.0);
    cpfMult = clamp(baseCpfMult * v51Ent.cpf_mult, 0.65, 1.55);
    provenance = "empirical_tm_verified";
    histGames = v51Ent.games_yellow;
  } else {
    yelPrior = clamp(baseYel, 1.2, 8.5);
    redPrior = clamp(baseRed, 0.03, 0.85);
    flsPrior = clamp(baseFls, 12.0, 36.0);
    cpfMult = clamp(baseCpfMult, 0.65, 1.55);
    provenance = "confederation_hierarchical_prior";
  }

  const bp = computeConditionalBookingPointsV6({
    yellowRatePrior: yelPrior,
    redCardRatePrior: redPrior,
    gammaRed: params.artifact.booking_points_gamma_red,
    rYellow: params.artifact.r_dispersion_yellow,
    rRed: params.artifact.r_dispersion_red,
    lines: params.artifact.booking_points_lines,
  });

  return Object.freeze({
    league: lg,
    sport: "football",
    refereeRaw: params.refereeName ?? null,
    canonicalKey: canonKey || "unassigned_competition_prior",
    matchedV51Key,
    confederation: comp.confederation,
    provenance,
    historicalGames: histGames,
    yellowMult: yMult,
    redMult: rMult,
    foulsMult: fMult,
    cardsPerFoulMult: cpfMult,
    yellowRatePrior: yelPrior,
    redCardRatePrior: redPrior,
    foulsRatePrior: flsPrior,
    gammaRed: bp.gammaRed,
    bookingPointsExpected: bp.expectedBookingPoints,
    pRedCardOver05: bp.pRedCardOver05,
    pBookingPointsOver355: bp.lines["35.5"]?.pOver ?? null,
    pBookingPointsOver455: bp.lines["45.5"]?.pOver ?? null,
    pBookingPointsOver555: bp.lines["55.5"]?.pOver ?? null,
  });
}

// ============================================================================
// 3. Module 2 — Deterministic Pre-Kickoff Freeze Contract (`sealPreKickoffOutlookV6`)
// ============================================================================

export function normalizeLifecycleStatusV6(rawStatus?: string | null): LifecycleStatusV6 {
  const st = (rawStatus ?? "").trim().toLowerCase();
  if (
    st === "scheduled" ||
    st === "ns" ||
    st === "not_started" ||
    st === "pre" ||
    st === "upcoming"
  ) {
    return "scheduled";
  }
  if (st === "in_progress" || st === "live" || st === "ht" || st === "1h" || st === "2h" || st === "ot") {
    return "LIVE";
  }
  if (
    st === "final" ||
    st === "ft" ||
    st === "finished" ||
    st === "aet" ||
    st === "pen" ||
    st === "completed"
  ) {
    return "FT";
  }
  return "scheduled";
}

function canonicalizeNumericMapForSeal(
  mapObj: Readonly<Record<string, number | null>>,
): Array<[string, string | null]> {
  const keys = Object.keys(mapObj).sort();
  const out: Array<[string, string | null]> = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i] ?? "";
    const v = mapObj[k];
    out.push([k, v === null || v === undefined ? null : float64ToCanonicalHex(v)]);
  }
  return out;
}

export function computeCanonicalSealSha256V6(params: {
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffEpochMs: number;
  readonly inputsAsOfEpochMs: number;
  readonly sealOrigin: SealOriginV6;
  readonly prevSealSha256: string;
  readonly probabilities: Readonly<Record<string, number | null>>;
  readonly projection: Readonly<Record<string, number | null>>;
}): string {
  const canonicalTuple = [
    SCHEMA_VERSION_PREKICKOFF_SEAL_V6,
    params.matchId,
    params.sport,
    params.league,
    params.homeTeam,
    params.awayTeam,
    String(Math.trunc(params.kickoffEpochMs)),
    String(Math.trunc(params.inputsAsOfEpochMs)),
    params.sealOrigin,
    params.prevSealSha256,
    canonicalizeNumericMapForSeal(params.probabilities),
    canonicalizeNumericMapForSeal(params.projection),
  ];
  return sha256Hex(JSON.stringify(canonicalTuple));
}

function createSealedRecordV6(params: {
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffEpochMs: number;
  readonly analysis: PreKickoffAnalysisPayloadV6;
  readonly sealOrigin: SealOriginV6;
  readonly prevSealSha256: string;
}): SealedPreKickoffRecordV6 {
  const iaoMs = parseIsoUtcEpochMs(params.analysis.inputsAsOfUtc);
  if (iaoMs === null || iaoMs > params.kickoffEpochMs) {
    throw new Error("Cannot create sealed record with missing or post-kickoff inputsAsOfUtc");
  }

  const probsClean: Record<string, number | null> = {};
  for (const k of Object.keys(params.analysis.probabilities).sort()) {
    const v = params.analysis.probabilities[k];
    probsClean[k] = v === null || v === undefined ? null : Number(v);
  }

  const projClean: Record<string, number | null> = {};
  for (const k of Object.keys(params.analysis.projection).sort()) {
    const v = params.analysis.projection[k];
    projClean[k] = v === null || v === undefined ? null : Number(v);
  }

  const sealSha256 = computeCanonicalSealSha256V6({
    matchId: params.matchId,
    sport: params.sport,
    league: params.league,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    kickoffEpochMs: params.kickoffEpochMs,
    inputsAsOfEpochMs: iaoMs,
    sealOrigin: params.sealOrigin,
    prevSealSha256: params.prevSealSha256,
    probabilities: probsClean,
    projection: projClean,
  });

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION_PREKICKOFF_SEAL_V6,
    matchId: params.matchId,
    sport: params.sport,
    league: params.league,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    kickoffUtc: formatEpochMsUtc(params.kickoffEpochMs),
    kickoffEpochMs: Math.trunc(params.kickoffEpochMs),
    inputsAsOfUtc: formatEpochMsUtc(iaoMs),
    inputsAsOfEpochMs: Math.trunc(iaoMs),
    leadTimeSeconds: (params.kickoffEpochMs - iaoMs) / 1000.0,
    sealOrigin: params.sealOrigin,
    prevSealSha256: params.prevSealSha256,
    sealSha256,
    probabilities: Object.freeze(probsClean),
    projection: Object.freeze(projClean),
  });
}

export function sealPreKickoffOutlookV6(input: SealPreKickoffInputV6): SealPreKickoffOutcomeV6 {
  const normStatus = normalizeLifecycleStatusV6(input.status);
  const koMs = parseIsoUtcEpochMs(input.kickoffUtc);
  if (koMs === null) {
    return Object.freeze({
      matchId: input.matchId,
      lifecycleStatus: normStatus,
      hasForecast: false,
      causalityStatus: "missing_timestamps" as const,
      incomingCausalityStatus: "missing_timestamps" as const,
      sealAction: "rejected_missing_kickoff" as const,
      incomingContaminatedRejected: false,
      sealedRecord: null,
    });
  }

  const incoming = input.incomingAnalysis ?? null;
  const existing = input.existingSealedRecord ?? null;
  const backfill = input.causalBackfillAnalysis ?? null;
  const allowRefresh = input.allowPreKickoffRefresh === true;

  const incIaoMs = incoming ? parseIsoUtcEpochMs(incoming.inputsAsOfUtc) : null;
  let incStatus: IncomingCausalityStatusV6;
  if (incoming === null) {
    incStatus = "missing_analysis";
  } else if (incIaoMs === null) {
    incStatus = "missing_timestamps";
  } else if (incIaoMs <= koMs) {
    incStatus = "strict_pre_kickoff";
  } else {
    incStatus = "post_kickoff_contaminated";
  }

  if (incStatus === "strict_pre_kickoff" && incoming !== null && incIaoMs !== null) {
    if (existing !== null) {
      if (normStatus === "scheduled" && allowRefresh && incIaoMs > existing.inputsAsOfEpochMs) {
        const refreshed = createSealedRecordV6({
          matchId: input.matchId,
          sport: input.sport,
          league: input.league,
          homeTeam: input.homeTeam,
          awayTeam: input.awayTeam,
          kickoffEpochMs: koMs,
          analysis: incoming,
          sealOrigin: "live_snapshot_prekickoff",
          prevSealSha256: existing.sealSha256,
        });
        return Object.freeze({
          matchId: input.matchId,
          lifecycleStatus: normStatus,
          hasForecast: true,
          causalityStatus: "strict_pre_kickoff_sealed" as const,
          incomingCausalityStatus: incStatus,
          sealAction: "refreshed_pre_kickoff_seal" as const,
          incomingContaminatedRejected: false,
          sealedRecord: refreshed,
        });
      }
      return Object.freeze({
        matchId: input.matchId,
        lifecycleStatus: normStatus,
        hasForecast: true,
        causalityStatus: "strict_pre_kickoff_sealed" as const,
        incomingCausalityStatus: incStatus,
        sealAction: "preserved_existing_seal" as const,
        incomingContaminatedRejected: false,
        sealedRecord: existing,
      });
    }

    const sealed = createSealedRecordV6({
      matchId: input.matchId,
      sport: input.sport,
      league: input.league,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      kickoffEpochMs: koMs,
      analysis: incoming,
      sealOrigin: "live_snapshot_prekickoff",
      prevSealSha256: GENESIS_PREKICKOFF_SEAL_HASH,
    });
    return Object.freeze({
      matchId: input.matchId,
      lifecycleStatus: normStatus,
      hasForecast: true,
      causalityStatus: "strict_pre_kickoff_sealed" as const,
      incomingCausalityStatus: incStatus,
      sealAction: "sealed_new_pre_kickoff" as const,
      incomingContaminatedRejected: false,
      sealedRecord: sealed,
    });
  }

  if (incStatus === "post_kickoff_contaminated") {
    if (existing !== null) {
      return Object.freeze({
        matchId: input.matchId,
        lifecycleStatus: normStatus,
        hasForecast: true,
        causalityStatus: "strict_pre_kickoff_sealed" as const,
        incomingCausalityStatus: "post_kickoff_contaminated" as const,
        sealAction: "rejected_contaminated_preserved_seal" as const,
        incomingContaminatedRejected: true,
        sealedRecord: existing,
      });
    }
    if (backfill !== null) {
      const bfMs = parseIsoUtcEpochMs(backfill.inputsAsOfUtc);
      if (bfMs !== null && bfMs <= koMs) {
        const sealedBf = createSealedRecordV6({
          matchId: input.matchId,
          sport: input.sport,
          league: input.league,
          homeTeam: input.homeTeam,
          awayTeam: input.awayTeam,
          kickoffEpochMs: koMs,
          analysis: backfill,
          sealOrigin: "causal_walkforward_backfill",
          prevSealSha256: GENESIS_PREKICKOFF_SEAL_HASH,
        });
        return Object.freeze({
          matchId: input.matchId,
          lifecycleStatus: normStatus,
          hasForecast: true,
          causalityStatus: "strict_pre_kickoff_sealed" as const,
          incomingCausalityStatus: "post_kickoff_contaminated" as const,
          sealAction: "rejected_contaminated_sealed_from_causal_backfill" as const,
          incomingContaminatedRejected: true,
          sealedRecord: sealedBf,
        });
      }
    }
    return Object.freeze({
      matchId: input.matchId,
      lifecycleStatus: normStatus,
      hasForecast: false,
      causalityStatus: "post_kickoff_contaminated" as const,
      incomingCausalityStatus: "post_kickoff_contaminated" as const,
      sealAction: "rejected_post_kickoff_contaminated" as const,
      incomingContaminatedRejected: true,
      sealedRecord: null,
    });
  }

  if (existing !== null) {
    return Object.freeze({
      matchId: input.matchId,
      lifecycleStatus: normStatus,
      hasForecast: true,
      causalityStatus: "strict_pre_kickoff_sealed" as const,
      incomingCausalityStatus: incStatus,
      sealAction: "preserved_seal_on_missing_upstream" as const,
      incomingContaminatedRejected: false,
      sealedRecord: existing,
    });
  }

  if (backfill !== null) {
    const bfMs = parseIsoUtcEpochMs(backfill.inputsAsOfUtc);
    if (bfMs !== null && bfMs <= koMs) {
      const sealedBf = createSealedRecordV6({
        matchId: input.matchId,
        sport: input.sport,
        league: input.league,
        homeTeam: input.homeTeam,
        awayTeam: input.awayTeam,
        kickoffEpochMs: koMs,
        analysis: backfill,
        sealOrigin: "causal_walkforward_backfill",
        prevSealSha256: GENESIS_PREKICKOFF_SEAL_HASH,
      });
      return Object.freeze({
        matchId: input.matchId,
        lifecycleStatus: normStatus,
        hasForecast: true,
        causalityStatus: "strict_pre_kickoff_sealed" as const,
        incomingCausalityStatus: incStatus,
        sealAction: "recovered_ft_from_causal_walkforward" as const,
        incomingContaminatedRejected: false,
        sealedRecord: sealedBf,
      });
    }
  }

  return Object.freeze({
    matchId: input.matchId,
    lifecycleStatus: normStatus,
    hasForecast: false,
    causalityStatus: "unsealed_missing_forecast" as const,
    incomingCausalityStatus: incStatus,
    sealAction: "unsealed_no_valid_inputs" as const,
    incomingContaminatedRejected: false,
    sealedRecord: null,
  });
}

export function auditPreKickoffCausalityV6(
  observations: readonly SnapshotCausalityObservationV6[],
  options?: { readonly allowPreKickoffRefresh?: boolean },
): PreKickoffCausalityAuditReportV6 {
  const allowRefresh = options?.allowPreKickoffRefresh === true;
  const sealedByKey = new Map<string, SealedPreKickoffRecordV6>();
  const latestOutcomeByKey: Record<string, SealPreKickoffOutcomeV6> = {};

  let rawStrictPre = 0;
  let rawPostKoContaminated = 0;
  let rawPostKoFt = 0;
  let rawPostKoScheduled = 0;
  let rawMissingOnFt = 0;
  let rescuedFromPriorSeal = 0;
  let recoveredFromCausalBackfill = 0;
  let rejectedUnrecoverableContaminated = 0;

  for (let i = 0; i < observations.length; i += 1) {
    const obs = observations[i];
    if (!obs) continue;
    const key = `${obs.league}::${obs.matchId}`;
    const existing = sealedByKey.get(key) ?? null;

    const res = sealPreKickoffOutlookV6({
      matchId: obs.matchId,
      sport: obs.sport,
      league: obs.league,
      homeTeam: obs.homeTeam,
      awayTeam: obs.awayTeam,
      kickoffUtc: obs.kickoffUtc,
      status: obs.status,
      incomingAnalysis: obs.incomingAnalysis ?? null,
      existingSealedRecord: existing,
      causalBackfillAnalysis: obs.causalBackfillAnalysis ?? null,
      allowPreKickoffRefresh: allowRefresh,
    });

    if (res.incomingCausalityStatus === "strict_pre_kickoff") {
      rawStrictPre += 1;
    } else if (res.incomingCausalityStatus === "post_kickoff_contaminated") {
      rawPostKoContaminated += 1;
      if (res.lifecycleStatus === "FT") rawPostKoFt += 1;
      else if (res.lifecycleStatus === "scheduled") rawPostKoScheduled += 1;
    } else if (res.incomingCausalityStatus === "missing_analysis" && res.lifecycleStatus === "FT") {
      rawMissingOnFt += 1;
    }

    if (
      res.sealAction === "rejected_contaminated_preserved_seal" ||
      res.sealAction === "preserved_seal_on_missing_upstream"
    ) {
      rescuedFromPriorSeal += 1;
    } else if (
      res.sealAction === "recovered_ft_from_causal_walkforward" ||
      res.sealAction === "rejected_contaminated_sealed_from_causal_backfill"
    ) {
      recoveredFromCausalBackfill += 1;
    } else if (res.sealAction === "rejected_post_kickoff_contaminated") {
      rejectedUnrecoverableContaminated += 1;
    }

    if (res.sealedRecord !== null) {
      sealedByKey.set(key, res.sealedRecord);
    }
    latestOutcomeByKey[key] = res;
  }

  const sortedSealedKeys = Array.from(sealedByKey.keys()).sort();
  const chainPairs: Array<[string, string]> = [];
  let contaminatedAccepted = 0;
  for (let i = 0; i < sortedSealedKeys.length; i += 1) {
    const k = sortedSealedKeys[i] ?? "";
    const rec = sealedByKey.get(k);
    if (!rec) continue;
    chainPairs.push([k, rec.sealSha256]);
    if (rec.inputsAsOfEpochMs > rec.kickoffEpochMs) {
      contaminatedAccepted += 1;
    }
  }
  const ledgerSha256 = sha256Hex(JSON.stringify(chainPairs));

  let ftTotal = 0;
  let ftWithForecast = 0;
  for (const k of Object.keys(latestOutcomeByKey)) {
    const r = latestOutcomeByKey[k];
    if (r && r.lifecycleStatus === "FT") {
      ftTotal += 1;
      if (r.hasForecast) ftWithForecast += 1;
    }
  }

  return Object.freeze({
    totalObservationsAudited: observations.length,
    uniqueMatchesTracked: Object.keys(latestOutcomeByKey).length,
    sealedMatchesCount: sealedByKey.size,
    rawStrictPreKickoffCount: rawStrictPre,
    rawPostKickoffContaminatedCount: rawPostKoContaminated,
    rawPostKickoffFtCount: rawPostKoFt,
    rawPostKickoffScheduledCount: rawPostKoScheduled,
    rawMissingAnalysisOnFtCount: rawMissingOnFt,
    rescuedFromPriorSealCount: rescuedFromPriorSeal,
    recoveredFromCausalBackfillCount: recoveredFromCausalBackfill,
    rejectedUnrecoverableContaminatedCount: rejectedUnrecoverableContaminated,
    finalMatchesTotal: ftTotal,
    finalMatchesWithSealedForecast: ftWithForecast,
    contaminatedAcceptedIntoLedgerCount: contaminatedAccepted,
    ledgerSha256,
    outcomesByMatchKey: Object.freeze(latestOutcomeByKey),
  });
}

// ============================================================================
// 4. Module 3 — Prospective Quotes Evaluator with Power De-Vig (`quotes_latest.json`)
// ============================================================================

export function solvePowerDevigExactV6(
  decimalOdds: readonly number[],
  tolerance: number = 1e-12,
): PowerDevigSolutionV6 {
  const k = decimalOdds.length;
  if (k !== 2 && k !== 3) {
    throw new Error(`Power De-Vig requires 2 or 3 selections; received ${k}`);
  }
  const q: number[] = [];
  let sumImplied = 0.0;
  for (let i = 0; i < k; i += 1) {
    const o = decimalOdds[i];
    if (o === undefined || !Number.isFinite(o) || o <= 1.0) {
      throw new Error(`Invalid decimal odds at index ${i}: ${String(o)}`);
    }
    const qi = 1.0 / o;
    q.push(qi);
    sumImplied += qi;
  }
  if (sumImplied < 0.9 || sumImplied > 1.25) {
    throw new Error(`Implausible sum of implied probs: ${sumImplied.toFixed(6)}`);
  }

  let lo = 1e-6;
  let hi = 5.0;
  let alpha = 1.0;
  for (let iter = 0; iter < 200; iter += 1) {
    alpha = 0.5 * (lo + hi);
    let sPow = 0.0;
    for (let i = 0; i < k; i += 1) {
      sPow += Math.pow(q[i] ?? 0.0, alpha);
    }
    if (Math.abs(sPow - 1.0) <= tolerance) break;
    if (sPow > 1.0) lo = alpha;
    else hi = alpha;
  }

  const pRaw: number[] = [];
  let sTot = 0.0;
  for (let i = 0; i < k; i += 1) {
    const pv = Math.pow(q[i] ?? 0.0, alpha);
    pRaw.push(pv);
    sTot += pv;
  }
  const probs = pRaw.map((v) => v / sTot);
  return Object.freeze({
    probsNoVig: Object.freeze(probs),
    overround: sumImplied - 1.0,
    alphaExponent: alpha,
  });
}

function canonicalMarketDescriptor(
  market: string,
  line: number | null,
): { readonly marketKey: string; readonly requiredSelections: readonly string[] } | null {
  const mk = market.trim().toLowerCase();
  if (mk === "1x2" || mk === "h2h" || mk === "match_odds") {
    return { marketKey: "1x2", requiredSelections: ["home", "draw", "away"] };
  }
  if (mk === "btts" || mk === "both_teams_to_score") {
    return { marketKey: "btts", requiredSelections: ["yes", "no"] };
  }
  if (mk === "totals" || mk === "ou" || mk === "over_under" || mk.startsWith("totals_")) {
    let lnVal: number;
    if (line !== null && line !== undefined && Number.isFinite(line)) {
      lnVal = line;
    } else {
      const suffix = mk.split("_").slice(1).join(".");
      lnVal = Number.parseFloat(suffix);
    }
    if (!Number.isFinite(lnVal)) return null;
    return { marketKey: `totals_${lnVal.toFixed(1)}`, requiredSelections: ["over", "under"] };
  }
  if (mk === "moneyline" || mk === "2way" || mk === "dnb") {
    return { marketKey: mk, requiredSelections: ["home", "away"] };
  }
  return null;
}

function extractModelSimplexForMarket(
  modelProbs: Readonly<Record<string, number>>,
  marketKey: string,
): readonly number[] | null {
  if (marketKey === "1x2") {
    const ph = modelProbs["pHome"];
    const pd = modelProbs["pDraw"];
    const pa = modelProbs["pAway"];
    if (ph === undefined || pd === undefined || pa === undefined) return null;
    const s = ph + pd + pa;
    return s > 0.0 ? [ph / s, pd / s, pa / s] : null;
  }
  if (marketKey === "btts") {
    const py = modelProbs["pBttsYes"];
    if (py === undefined) return null;
    const pyc = clamp(py, 1e-6, 1.0 - 1e-6);
    return [pyc, 1.0 - pyc];
  }
  if (marketKey.startsWith("totals_")) {
    const lnTag = marketKey.slice("totals_".length).replace(".", "");
    const po = modelProbs[`pOver${lnTag}`];
    if (po === undefined) return null;
    const poc = clamp(po, 1e-6, 1.0 - 1e-6);
    return [poc, 1.0 - poc];
  }
  if (marketKey === "moneyline" || marketKey === "2way" || marketKey === "dnb") {
    const ph = modelProbs["pHome"];
    const pa = modelProbs["pAway"];
    if (ph === undefined || pa === undefined) return null;
    const s = ph + pa;
    return s > 0.0 ? [ph / s, pa / s] : null;
  }
  return null;
}

function gradeCompleteMarketOutcomeIdx(
  marketKey: string,
  homeScore: number,
  awayScore: number,
): number | null {
  if (marketKey === "1x2") {
    if (homeScore > awayScore) return 0;
    if (homeScore === awayScore) return 1;
    return 2;
  }
  if (marketKey === "btts") {
    return homeScore > 0 && awayScore > 0 ? 0 : 1;
  }
  if (marketKey.startsWith("totals_")) {
    const ln = Number.parseFloat(marketKey.slice("totals_".length));
    const tot = homeScore + awayScore;
    if (Math.abs(tot - ln) < 1e-9) return null;
    return tot > ln ? 0 : 1;
  }
  if (marketKey === "moneyline" || marketKey === "2way" || marketKey === "dnb") {
    if (homeScore === awayScore) return null;
    return homeScore > awayScore ? 0 : 1;
  }
  return null;
}

export function evaluateProspectiveQuotesPowerDevigV6(params: {
  readonly ticks: readonly QuoteTickInputV6[];
  readonly enginePreKickoffByEvent: Readonly<
    Record<string, EnginePreKickoffEventProbsV6 | Readonly<Record<string, number>>>
  >;
  readonly settledScoresByEvent?: Readonly<Record<string, SettledScoreRecordV6>> | null;
  readonly nResamples?: number;
  readonly seed?: number;
}): ProspectiveQuotesEvaluationReportV6 {
  const nResamples = params.nResamples ?? DEFAULT_V6_BOOTSTRAP_RESAMPLES;
  const seed = params.seed ?? DEFAULT_V6_BOOTSTRAP_SEED;
  const scoresMap = params.settledScoresByEvent ?? {};
  const nRawTicks = params.ticks.length;

  let nPostKickoffDiscarded = 0;
  let nInvalidTicks = 0;

  interface GroupedTickEntry {
    readonly priceDecimal: number;
    readonly tsCapturedMs: number;
  }
  interface GroupMetaEntry {
    readonly eventId: string;
    readonly sport: string;
    readonly league: string;
    readonly book: string;
    readonly marketKey: string;
    readonly requiredSelections: readonly string[];
  }

  const grouped = new Map<string, Map<string, GroupedTickEntry>>();
  const groupMeta = new Map<string, GroupMetaEntry>();

  for (let i = 0; i < nRawTicks; i += 1) {
    const t = params.ticks[i];
    if (!t) continue;
    const eid = t.event_id.trim();
    const book = t.book.trim().toLowerCase();
    const sel = t.selection.trim().toLowerCase();
    const tCap = parseIsoUtcEpochMs(t.ts_captured);
    const tKo = parseIsoUtcEpochMs(t.ts_event_start);
    const priceRaw = t.price_decimal;

    if (
      !eid ||
      !book ||
      !sel ||
      tCap === null ||
      tKo === null ||
      !Number.isFinite(priceRaw) ||
      priceRaw <= 1.0
    ) {
      nInvalidTicks += 1;
      continue;
    }
    if (tCap >= tKo) {
      nPostKickoffDiscarded += 1;
      continue;
    }

    const desc = canonicalMarketDescriptor(t.market, t.line);
    if (desc === null || !desc.requiredSelections.includes(sel)) {
      nInvalidTicks += 1;
      continue;
    }

    const gKey = `${eid}\u0000${book}\u0000${desc.marketKey}`;
    let selMap = grouped.get(gKey);
    if (!selMap) {
      selMap = new Map<string, GroupedTickEntry>();
      grouped.set(gKey, selMap);
    }
    const prev = selMap.get(sel);
    if (prev === undefined || tCap >= prev.tsCapturedMs) {
      selMap.set(sel, { priceDecimal: priceRaw, tsCapturedMs: tCap });
      groupMeta.set(gKey, {
        eventId: eid,
        sport: t.sport || "football",
        league: t.league || "",
        book,
        marketKey: desc.marketKey,
        requiredSelections: desc.requiredSelections,
      });
    }
  }

  const sortedGroupKeys = Array.from(grouped.keys()).sort();
  let nValidPrekickoffTicks = 0;
  let nIncompleteDiscarded = 0;

  const evaluatedMarkets: EvaluatedQuoteMarketRowV6[] = [];
  const marketClusters: string[] = [];
  const ceV6List: number[] = [];
  const ceRawList: number[] = [];
  const klV6List: number[] = [];
  const klRawList: number[] = [];
  const bdV6List: number[] = [];
  const bdRawList: number[] = [];

  const selClusters: string[] = [];
  const absDiffV6List: number[] = [];
  const absDiffRawList: number[] = [];
  const sqDiffV6List: number[] = [];
  const signedDiffV6List: number[] = [];

  const playableClusters: string[] = [];
  const playableAbsDiffV6: number[] = [];
  const playableAbsDiffRaw: number[] = [];

  const overrounds: number[] = [];
  const alphas: number[] = [];

  const byMarketAcc = new Map<string, Array<[number, number, number]>>();
  const byLeagueAcc = new Map<string, Array<[number, number, number]>>();

  const settledClusters: string[] = [];
  const settledLlV6: number[] = [];
  const settledLlPow: number[] = [];
  const settledBrV6: number[] = [];
  const settledBrPow: number[] = [];
  const settledBinY: number[] = [];
  const settledBinPV6: number[] = [];
  const settledBinPPow: number[] = [];
  const settledEventsSeen = new Set<string>();

  for (let gIdx = 0; gIdx < sortedGroupKeys.length; gIdx += 1) {
    const gKey = sortedGroupKeys[gIdx] ?? "";
    const selMap = grouped.get(gKey);
    const meta = groupMeta.get(gKey);
    if (!selMap || !meta) continue;

    const reqSels = meta.requiredSelections;
    const oddsVec: number[] = [];
    let missingSel = false;
    for (let sIdx = 0; sIdx < reqSels.length; sIdx += 1) {
      const sEntry = selMap.get(reqSels[sIdx] ?? "");
      if (!sEntry) {
        missingSel = true;
        break;
      }
      oddsVec.push(sEntry.priceDecimal);
    }
    if (missingSel) {
      nIncompleteDiscarded += selMap.size;
      continue;
    }

    let pwr: PowerDevigSolutionV6;
    try {
      pwr = solvePowerDevigExactV6(oddsVec);
    } catch {
      nIncompleteDiscarded += selMap.size;
      continue;
    }

    nValidPrekickoffTicks += reqSels.length;
    const eid = meta.eventId;
    const mKey = meta.marketKey;
    const lg = meta.league;
    const probsPow = pwr.probsNoVig;
    overrounds.push(pwr.overround);
    alphas.push(pwr.alphaExponent);

    const engEntry = params.enginePreKickoffByEvent[eid];
    if (!engEntry) continue;

    let v6ProbsMap: Readonly<Record<string, number>>;
    let rawProbsMap: Readonly<Record<string, number>>;
    const maybeBundle = engEntry as EnginePreKickoffEventProbsV6;
    if (typeof maybeBundle.v6Probs === "object" && maybeBundle.v6Probs !== null) {
      v6ProbsMap = maybeBundle.v6Probs;
      rawProbsMap =
        typeof maybeBundle.rawPreKickoffProbs === "object" && maybeBundle.rawPreKickoffProbs !== null
          ? maybeBundle.rawPreKickoffProbs
          : maybeBundle.v6Probs;
    } else {
      v6ProbsMap = engEntry as Readonly<Record<string, number>>;
      rawProbsMap = v6ProbsMap;
    }

    const pV6 = extractModelSimplexForMarket(v6ProbsMap, mKey);
    if (pV6 === null) continue;
    const pRaw = extractModelSimplexForMarket(rawProbsMap, mKey) ?? pV6;

    const eps = 1e-15;
    let ceV6 = 0.0;
    let ceRaw = 0.0;
    let entPow = 0.0;
    let bdV6 = 0.0;
    let bdRaw = 0.0;
    let madSumV6 = 0.0;
    let madSumRaw = 0.0;

    for (let j = 0; j < probsPow.length; j += 1) {
      const pk = probsPow[j] ?? 0.0;
      const qm = pV6[j] ?? 0.0;
      const qr = pRaw[j] ?? 0.0;
      const oDec = oddsVec[j] ?? 2.0;

      ceV6 -= pk * Math.log(clamp(qm, eps, 1.0));
      ceRaw -= pk * Math.log(clamp(qr, eps, 1.0));
      entPow -= pk * Math.log(clamp(pk, eps, 1.0));
      bdV6 += (qm - pk) * (qm - pk);
      bdRaw += (qr - pk) * (qr - pk);

      const adV6 = Math.abs(qm - pk);
      const adRaw = Math.abs(qr - pk);
      madSumV6 += adV6;
      madSumRaw += adRaw;

      selClusters.push(eid);
      absDiffV6List.push(adV6);
      absDiffRawList.push(adRaw);
      sqDiffV6List.push((qm - pk) * (qm - pk));
      signedDiffV6List.push(qm - pk);

      if (oDec >= 1.55 && oDec <= 2.6) {
        playableClusters.push(eid);
        playableAbsDiffV6.push(adV6);
        playableAbsDiffRaw.push(adRaw);
      }
    }

    const klV6 = Math.max(0.0, ceV6 - entPow);
    const klRaw = Math.max(0.0, ceRaw - entPow);
    const madMktV6 = madSumV6 / probsPow.length;
    const madMktRaw = madSumRaw / probsPow.length;

    marketClusters.push(eid);
    ceV6List.push(ceV6);
    ceRawList.push(ceRaw);
    klV6List.push(klV6);
    klRawList.push(klRaw);
    bdV6List.push(bdV6);
    bdRawList.push(bdRaw);

    const mArr = byMarketAcc.get(mKey) ?? [];
    mArr.push([klV6, madMktV6, pwr.overround]);
    byMarketAcc.set(mKey, mArr);

    const lArr = byLeagueAcc.get(lg) ?? [];
    lArr.push([klV6, madMktV6, pwr.overround]);
    byLeagueAcc.set(lg, lArr);

    const sc = scoresMap[eid];
    let winIdx: number | null = null;
    if (sc !== undefined && Number.isInteger(sc.homeScore) && Number.isInteger(sc.awayScore)) {
      winIdx = gradeCompleteMarketOutcomeIdx(mKey, sc.homeScore, sc.awayScore);
      if (winIdx !== null) {
        settledEventsSeen.add(eid);
        settledClusters.push(eid);
        settledLlV6.push(-Math.log(clamp(pV6[winIdx] ?? eps, eps, 1.0)));
        settledLlPow.push(-Math.log(clamp(probsPow[winIdx] ?? eps, eps, 1.0)));

        let br6 = 0.0;
        let brP = 0.0;
        for (let j = 0; j < pV6.length; j += 1) {
          const yj = j === winIdx ? 1.0 : 0.0;
          const qj = pV6[j] ?? 0.0;
          const pj = probsPow[j] ?? 0.0;
          br6 += (yj - qj) * (yj - qj);
          brP += (yj - pj) * (yj - pj);
          settledBinY.push(j === winIdx ? 1 : 0);
          settledBinPV6.push(qj);
          settledBinPPow.push(pj);
        }
        settledBrV6.push(br6);
        settledBrPow.push(brP);
      }
    }

    evaluatedMarkets.push(
      Object.freeze({
        eventId: eid,
        league: lg,
        book: meta.book,
        marketKey: mKey,
        selections: Object.freeze([...reqSels]),
        decimalOdds: Object.freeze([...oddsVec]),
        powerNoVigProbs: Object.freeze(probsPow.map((x) => roundTo8(x))),
        modelV6Probs: Object.freeze(pV6.map((x) => roundTo8(x))),
        overround: roundTo8(pwr.overround),
        powerAlpha: roundTo8(pwr.alphaExponent),
        klDivergencePowerToModel: roundTo8(klV6),
        madProbDispersion: roundTo8(madMktV6),
        madRawPreKickoff: roundTo8(madMktRaw),
        settledWinnerIdx: winIdx,
      }),
    );
  }

  const ceDiffBoot = clusterBootstrapDiffPureV6(marketClusters, ceV6List, ceRawList, nResamples, seed);
  const klDiffBoot = clusterBootstrapDiffPureV6(marketClusters, klV6List, klRawList, nResamples, seed);
  const bdDiffBoot = clusterBootstrapDiffPureV6(marketClusters, bdV6List, bdRawList, nResamples, seed);
  const madBoot = clusterBootstrapMeanPureV6(selClusters, absDiffV6List, nResamples, seed);
  const madDiffBoot = clusterBootstrapDiffPureV6(selClusters, absDiffV6List, absDiffRawList, nResamples, seed);
  const playableMadDiffBoot = clusterBootstrapDiffPureV6(
    playableClusters,
    playableAbsDiffV6,
    playableAbsDiffRaw,
    nResamples,
    seed,
  );

  let sumSq = 0.0;
  for (let i = 0; i < sqDiffV6List.length; i += 1) sumSq += sqDiffV6List[i] ?? 0.0;
  const rmseDisp = sqDiffV6List.length > 0 ? roundTo8(Math.sqrt(sumSq / sqDiffV6List.length)) : null;

  let sumSigned = 0.0;
  for (let i = 0; i < signedDiffV6List.length; i += 1) sumSigned += signedDiffV6List[i] ?? 0.0;
  const meanSignedDiff = signedDiffV6List.length > 0 ? roundTo8(sumSigned / signedDiffV6List.length) : null;

  let sumOv = 0.0;
  for (let i = 0; i < overrounds.length; i += 1) sumOv += overrounds[i] ?? 0.0;
  const meanOverround = overrounds.length > 0 ? roundTo8(sumOv / overrounds.length) : null;

  let sumAlpha = 0.0;
  for (let i = 0; i < alphas.length; i += 1) sumAlpha += alphas[i] ?? 0.0;
  const meanAlpha = alphas.length > 0 ? roundTo8(sumAlpha / alphas.length) : null;

  const byMarketSummary: Record<
    string,
    {
      readonly n_markets: number;
      readonly mean_kl_power_to_v6: number;
      readonly mean_mad_prob_dispersion: number;
      readonly mean_overround: number;
    }
  > = {};
  for (const mkK of Array.from(byMarketAcc.keys()).sort()) {
    const rowsM = byMarketAcc.get(mkK) ?? [];
    const nM = rowsM.length;
    if (nM === 0) continue;
    let sKl = 0.0;
    let sMad = 0.0;
    let sOvr = 0.0;
    for (let i = 0; i < nM; i += 1) {
      const r = rowsM[i];
      if (!r) continue;
      sKl += r[0];
      sMad += r[1];
      sOvr += r[2];
    }
    byMarketSummary[mkK] = Object.freeze({
      n_markets: nM,
      mean_kl_power_to_v6: roundTo8(sKl / nM),
      mean_mad_prob_dispersion: roundTo8(sMad / nM),
      mean_overround: roundTo8(sOvr / nM),
    });
  }

  const byLeagueSummary: Record<
    string,
    {
      readonly n_markets: number;
      readonly mean_kl_power_to_v6: number;
      readonly mean_mad_prob_dispersion: number;
      readonly mean_overround: number;
    }
  > = {};
  for (const lgK of Array.from(byLeagueAcc.keys()).sort()) {
    const rowsL = byLeagueAcc.get(lgK) ?? [];
    const nL = rowsL.length;
    if (nL === 0) continue;
    let sKl = 0.0;
    let sMad = 0.0;
    let sOvr = 0.0;
    for (let i = 0; i < nL; i += 1) {
      const r = rowsL[i];
      if (!r) continue;
      sKl += r[0];
      sMad += r[1];
      sOvr += r[2];
    }
    byLeagueSummary[lgK] = Object.freeze({
      n_markets: nL,
      mean_kl_power_to_v6: roundTo8(sKl / nL),
      mean_mad_prob_dispersion: roundTo8(sMad / nL),
      mean_overround: roundTo8(sOvr / nL),
    });
  }

  const nSettledMkts = settledLlV6.length;
  let settledEval: SettledQuotesCalibrationV6;
  if (nSettledMkts === 0) {
    settledEval = Object.freeze({
      n_settled_events: 0,
      n_settled_markets: 0,
      logloss_v6: null,
      logloss_power_novig: null,
      delta_logloss_v6_minus_power: null,
      ci95_lo: null,
      ci95_hi: null,
      brier_v6: null,
      brier_power_novig: null,
      delta_brier_v6_minus_power: null,
      ece_v6: null,
      ece_power_novig: null,
      significant_improvement: false,
      significance_label: "no significativa" as const,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  } else {
    const llBoot = clusterBootstrapDiffPureV6(settledClusters, settledLlV6, settledLlPow, nResamples, seed);
    const brBoot = clusterBootstrapDiffPureV6(settledClusters, settledBrV6, settledBrPow, nResamples, seed);
    settledEval = Object.freeze({
      n_settled_events: settledEventsSeen.size,
      n_settled_markets: nSettledMkts,
      logloss_v6: llBoot.cand_mean,
      logloss_power_novig: llBoot.bench_mean,
      delta_logloss_v6_minus_power: llBoot.delta_mean,
      ci95_lo: llBoot.ci95_lo,
      ci95_hi: llBoot.ci95_hi,
      brier_v6: brBoot.cand_mean,
      brier_power_novig: brBoot.bench_mean,
      delta_brier_v6_minus_power: brBoot.delta_mean,
      ece_v6: safeEceBinaryPureV6(settledBinY, settledBinPV6),
      ece_power_novig: safeEceBinaryPureV6(settledBinY, settledBinPPow),
      significant_improvement: llBoot.significant_improvement,
      significance_label: llBoot.significance_label,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  const uniqueEventSet = new Set(evaluatedMarkets.map((m) => m.eventId));

  return Object.freeze({
    n_raw_ticks: nRawTicks,
    n_valid_prekickoff_ticks: nValidPrekickoffTicks,
    n_post_kickoff_discarded_ticks: nPostKickoffDiscarded,
    n_incomplete_or_invalid_ticks: nInvalidTicks + nIncompleteDiscarded,
    n_complete_markets: evaluatedMarkets.length,
    n_unique_events: uniqueEventSet.size,
    devig_method: "power" as const,
    mean_overround: meanOverround,
    mean_power_alpha: meanAlpha,
    prekickoff_dispersion_and_alignment: Object.freeze({
      mad_prob_dispersion_v6: madBoot,
      rmse_prob_dispersion_v6: rmseDisp,
      mean_signed_prob_diff_v6_minus_power: meanSignedDiff,
      cross_entropy_v6_vs_raw_prekickoff: ceDiffBoot,
      kl_divergence_v6_vs_raw_prekickoff: klDiffBoot,
      brier_divergence_v6_vs_raw_prekickoff: bdDiffBoot,
      mad_dispersion_v6_vs_raw_prekickoff: madDiffBoot,
      playable_zone_1_55_to_2_60_mad_v6_vs_raw: playableMadDiffBoot,
    }),
    settled_outcome_calibration: settledEval,
    by_market: Object.freeze(byMarketSummary),
    by_league: Object.freeze(byLeagueSummary),
    evaluated_markets: Object.freeze(evaluatedMarkets),
  });
}
