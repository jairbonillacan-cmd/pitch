/**
 * PitchLab Complete Player Props, Goalkeeper Multi-Line/SGP & US Sports Engine (`v6.0` · `EXP_V59`) —
 * Motor TypeScript puro con paridad IEEE-754 `< 1e-12` frente a `run_exp_v59_props_v6_0.py`.
 *
 * Tres pilares unificados sin fugas temporales ni campos prohibidos (`stake`, `kelly`, `ev`, `tier`):
 *  1. `projectCoupledPlayerShotsMultiLineV6`:
 *     Cierra el hallazgo `D7` (`"empirical_bayes_nb_no_player_match_log_spline"`) acoplando la tasa
 *     individual Empirical-Bayes des-sesgada por exposición `(appearances, subIns, positionGroup)` y
 *     el multiplicador `sub_cover` de piernas frescas al volumen esperado del partido
 *     (`teamExpectedShots`, `teamExpectedSoT`), con splines baricéntricos monótonos Logit-PAVA
 *     multi-línea (`0.5+`, `1.5+`, `2.5+`, `3.5+`) que garantizan algebraicamente
 *     `P(Y >= 0.5) >= P(Y >= 1.5) >= P(Y >= 2.5) >= P(Y >= 3.5)`.
 *  2. `projectGoalkeeperSavesMultiLineV6` & `evaluateGoalkeeperSavesLinkedSgpV6`:
 *     Motor Binomial Negativa multi-línea de atajadas (`1.5+`, `2.5+`, `3.5+`, `4.5+`) para los
 *     `325` porteros activos y condicionamiento estructural SGP `(Atajadas >= k)` ×
 *     `(Clean Sheet / Under 2.5 / Victoria del Equipo)` descomponiendo exactamente
 *     `SoT_rival = Atajadas + Goles_Concedidos` + Dixon-Coles sobre `(G_propios, G_concedidos)`,
 *     respetando cotas exactas de Fréchet-Hoeffding.
 *  3. `normalizeUsPlayerGameLogColumnsV6` & `projectUsPlayerPropV6` / `evaluateUsPlayerProfilePropsV6`:
 *     Extractor normalizado multi-columna sin truncamiento de 5 columnas para `NBA`, `MLB`, `NHL` y `NFL`
 *     con bloqueo duro de lesionados (`availability === "out" / "Baja"` retorna vacío), guardia causal
 *     de minutos (`>= 18` min NBA, `>= 45` min fútbol) y proyección sobredispersa Empirical-Bayes.
 */

import { toUnitProbability, type LineupStatusV36, type UnitProbability } from "./hierarchical_props.js";
import { DEFAULT_LOGIT_EPS, clamp, logit, normalCdf, sigmoid } from "./math.js";

export const PROPS_V6_SCHEMA_VERSION = "props_v6_0_candidate_1.0.0" as const;

export const CANONICAL_SHOT_LINES_V6: readonly [0.5, 1.5, 2.5, 3.5] = Object.freeze([0.5, 1.5, 2.5, 3.5]);
export const CANONICAL_GK_SAVES_LINES_V6: readonly [1.5, 2.5, 3.5, 4.5] = Object.freeze([1.5, 2.5, 3.5, 4.5]);

export type CoupledShotMetricV6 = "shots" | "shots_on_target";
export type UsPropsSportV6 = "nba" | "mlb" | "nhl" | "nfl";
export type NormalizablePropsSportV6 = UsPropsSportV6 | "football";
export type GoalkeeperLinkedMatchOutcomeV6 =
  | "clean_sheet"
  | "under_2_5"
  | "team_win"
  | "over_2_5"
  | "team_win_or_draw";

export interface LogitSpaceMonotoneSplineSpecV6 {
  readonly eta_knots: readonly number[];
  readonly zeta_knots: readonly number[];
  readonly calibration_source?: string;
  readonly n_val_2018_2019?: number;
}

export interface CoupledShotPositionMetricSpecV6 {
  readonly prior_rate_per90: number;
  readonly prior_beta_90: number;
  readonly phi_dispersion: number;
  readonly fresh_legs_sub_multiplier: number;
}

export interface CoupledShotPositionSpecV6 {
  readonly mean_starter_minutes: number;
  readonly metrics: Readonly<Record<CoupledShotMetricV6, CoupledShotPositionMetricSpecV6>>;
}

export interface CoupledShotsConfigV6 {
  readonly calibration_source: string;
  readonly remediated_finding: string;
  readonly league_team_shots_anchor: number;
  readonly league_team_sot_anchor: number;
  readonly team_shots_exponent: number;
  readonly cross_quality_exponent: number;
  readonly team_sot_exponent: number;
  readonly cross_volume_exponent: number;
  readonly opp_defense_exponent: number;
  readonly min_guard_minutes_football: number;
  readonly canonical_lines: readonly number[];
  readonly positions: Readonly<Record<string, CoupledShotPositionSpecV6>>;
  readonly multi_line_logit_splines: Readonly<
    Record<CoupledShotMetricV6, Readonly<Record<string, LogitSpaceMonotoneSplineSpecV6>>>
  >;
}

export interface GoalkeeperSavesConfigV6 {
  readonly calibration_source: string;
  readonly prior_save_rate: number;
  readonly prior_shots_faced: number;
  readonly min_save_rate: number;
  readonly max_save_rate: number;
  readonly r_dispersion_sot: number;
  readonly dixon_coles_rho: number;
  readonly siege_own_goal_dampening?: number;
  readonly canonical_lines: readonly number[];
  readonly multi_line_logit_splines: Readonly<Record<string, LogitSpaceMonotoneSplineSpecV6>>;
}

export interface UsPropMetricSpecV6 {
  readonly family: "negbin" | "normal_overdispersed";
  readonly prior_mean: number;
  readonly prior_games: number;
  readonly canonical_line: number;
  readonly anchor_minutes?: number;
  readonly r_dispersion?: number;
  readonly min_sd?: number;
  readonly var_mean_ratio?: number;
  readonly cv_sd?: number;
}

export interface UsSportPropsConfigV6 {
  readonly min_guard_minutes: number;
  readonly roles: Readonly<Record<string, Readonly<Record<string, UsPropMetricSpecV6>>>>;
}

export interface PropsV6ModelArtifact {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly coupled_shots_v6: CoupledShotsConfigV6;
  readonly goalkeeper_saves_v6: GoalkeeperSavesConfigV6;
  readonly us_props_v6: Readonly<Record<UsPropsSportV6, UsSportPropsConfigV6>>;
}

const HARD_BLOCKED_AVAILABILITY_TOKENS: ReadonlySet<string> = new Set([
  "out",
  "baja",
  "injured",
  "lesionado",
  "suspended",
  "suspendido",
  "sancionado",
  "ir",
  "injured_reserve",
  "inactive",
  "inactivo",
  "il",
  "il-10",
  "il-15",
  "il-60",
]);

const DOUBTFUL_AVAILABILITY_TOKENS: ReadonlySet<string> = new Set([
  "doubtful",
  "doubt",
  "duda",
  "questionable",
  "cuestionable",
  "day-to-day",
  "dtd",
  "gtd",
]);

const STARTER_SUB_MIN_PRIORS_V6: Readonly<Record<string, readonly [number, number]>> = {
  GK: [89.6, 32.0],
  DF_CB: [87.5, 22.0],
  DF_FB: [86.2, 24.0],
  DEF: [86.8, 23.0],
  MF_DM: [84.2, 23.5],
  MF_CM: [82.4, 24.5],
  MF_AM: [80.3, 25.0],
  MID: [82.0, 24.5],
  FW_W: [79.2, 23.0],
  FW_CF: [80.8, 22.5],
  FWD: [80.0, 22.8],
};

const PASCAL_COMB_V6: readonly (readonly number[])[] = (() => {
  const table: number[][] = Array.from({ length: 43 }, () => new Array<number>(43).fill(0));
  for (let n = 0; n <= 42; n += 1) {
    table[n]![0] = 1;
    for (let k = 1; k <= n; k += 1) {
      table[n]![k] = (table[n - 1]![k - 1] ?? 0) + (table[n - 1]![k] ?? 0);
    }
  }
  return table;
})();

function cleanStatusTokenV6(raw?: string | null): string {
  if (!raw) return "";
  return String(raw)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .trim()
    .toLowerCase();
}

function roundFairDecimalV6(p: number): number {
  const pc = toUnitProbability(p);
  return Math.floor((1.0 / pc) * 10000.0 + 0.5) / 10000.0;
}

function lineKeyV6(line: number): string {
  if (Math.abs(line - 0.5) < 1e-9) return "0.5";
  if (Math.abs(line - 1.5) < 1e-9) return "1.5";
  if (Math.abs(line - 2.5) < 1e-9) return "2.5";
  if (Math.abs(line - 3.5) < 1e-9) return "3.5";
  if (Math.abs(line - 4.5) < 1e-9) return "4.5";
  return line.toFixed(1);
}

function selectNearestSplineSpecV6(
  splinesByLine: Readonly<Record<string, LogitSpaceMonotoneSplineSpecV6>>,
  line: number,
  canonicalLines: readonly number[],
): LogitSpaceMonotoneSplineSpecV6 {
  const direct = splinesByLine[lineKeyV6(line)];
  if (direct) return direct;
  let nearestLine = canonicalLines[0] ?? 0.5;
  let bestDist = Math.abs(nearestLine - line);
  for (let i = 1; i < canonicalLines.length; i += 1) {
    const cand = canonicalLines[i]!;
    const dist = Math.abs(cand - line);
    if (dist < bestDist) {
      bestDist = dist;
      nearestLine = cand;
    }
  }
  const resolved = splinesByLine[lineKeyV6(nearestLine)];
  if (!resolved) {
    throw new Error(`Missing spline specification for line ${String(line)}`);
  }
  return resolved;
}

// ============================================================================
// 1. Shared Eligibility, Exposure & Negative-Binomial / Spline Primitives (`V6`)
// ============================================================================

export function isHardBlockedAvailabilityV6(
  availability?: string | null,
  injuryStatus?: string | null,
): boolean {
  if (HARD_BLOCKED_AVAILABILITY_TOKENS.has(cleanStatusTokenV6(availability))) return true;
  if (HARD_BLOCKED_AVAILABILITY_TOKENS.has(cleanStatusTokenV6(injuryStatus))) return true;
  return false;
}

export function isDoubtfulAvailabilityV6(
  availability?: string | null,
  injuryStatus?: string | null,
): boolean {
  if (isHardBlockedAvailabilityV6(availability, injuryStatus)) return false;
  if (DOUBTFUL_AVAILABILITY_TOKENS.has(cleanStatusTokenV6(availability))) return true;
  if (DOUBTFUL_AVAILABILITY_TOKENS.has(cleanStatusTokenV6(injuryStatus))) return true;
  return false;
}

export interface PlayerGuardEvaluationV6 {
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly minRequiredMinutes: number;
}

export function checkPlayerMinutesAndAvailabilityGuardV6(params: {
  readonly sport: string;
  readonly prematchExpectedMinutes?: number | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
}): PlayerGuardEvaluationV6 {
  const sp = cleanStatusTokenV6(params.sport);
  const minReq = sp === "football" || sp === "soccer" ? 45.0 : sp === "nba" ? 18.0 : 0.0;
  if (isHardBlockedAvailabilityV6(params.availability, params.injuryStatus)) {
    return Object.freeze({
      eligible: false,
      blockedByInjury: true,
      blockedByMinutesGuard: false,
      minRequiredMinutes: minReq,
    });
  }
  if (
    minReq > 0.0 &&
    params.prematchExpectedMinutes !== null &&
    params.prematchExpectedMinutes !== undefined &&
    params.prematchExpectedMinutes < minReq
  ) {
    return Object.freeze({
      eligible: false,
      blockedByInjury: false,
      blockedByMinutesGuard: true,
      minRequiredMinutes: minReq,
    });
  }
  return Object.freeze({
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    minRequiredMinutes: minReq,
  });
}

export function estimateEffectiveExposure90V6(
  appearances: number,
  subIns: number,
  positionGroup: string,
  explicitMinutes?: number | null,
): number {
  if (
    explicitMinutes !== null &&
    explicitMinutes !== undefined &&
    Number.isFinite(explicitMinutes) &&
    explicitMinutes > 0.0
  ) {
    return Math.max(0.25, explicitMinutes / 90.0);
  }
  const apps = Math.max(0, Math.trunc(appearances));
  const subs = clamp(Math.trunc(subIns), 0, apps);
  const starts = apps - subs;
  const pair = STARTER_SUB_MIN_PRIORS_V6[positionGroup] ?? [82.0, 24.5];
  const totalMin = starts * pair[0] + subs * pair[1];
  return Math.max(0.25, totalMin / 90.0);
}

export function nbProbOverExactV6(
  mu: number,
  rDisp: number,
  line: number,
  maxK: number = 28,
): { readonly pOver: number; readonly pUnder: number; readonly pPush: number } {
  const muC = clamp(mu, 1e-4, 38.0);
  const rC = clamp(rDisp, 0.35, 250.0);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);

  const pmf = new Float64Array(maxK + 1);
  pmf[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    pmf[k] = (pmf[k - 1] ?? 0.0) * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += pmf[k] ?? 0.0;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) pmf[k] = (pmf[k] ?? 0.0) / s;
  }

  if (Math.abs(line - Math.round(line)) < 1e-9) {
    const kl = Math.round(line);
    const pPush = kl >= 0 && kl <= maxK ? (pmf[kl] ?? 0.0) : 0.0;
    const stop = Math.max(0, Math.min(kl, maxK + 1));
    let pUnder = 0.0;
    for (let k = 0; k < stop; k += 1) pUnder += pmf[k] ?? 0.0;
    const pOver = Math.max(0.0, 1.0 - pUnder - pPush);
    return { pOver, pUnder, pPush };
  }

  const kf = Math.floor(line);
  const stop = Math.max(0, Math.min(kf + 1, maxK + 1));
  let pUnder = 0.0;
  for (let k = 0; k < stop; k += 1) pUnder += pmf[k] ?? 0.0;
  const pOver = Math.max(0.0, 1.0 - pUnder);
  return { pOver, pUnder, pPush: 0.0 };
}

export function nbTailProbGeV6(kMin: number, mu: number, rDisp: number): number {
  if (kMin <= 0) return 0.999;
  const muC = clamp(mu, 0.005, 40.0);
  const rC = clamp(rDisp, 0.4, 250.0);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  let pmf = Math.exp(rC * Math.log(p0Ratio));
  let cdfLt = pmf;
  for (let k = 1; k < kMin; k += 1) {
    pmf = pmf * ((k - 1.0 + rC) / k) * qRatio;
    cdfLt += pmf;
  }
  return clamp(1.0 - cdfLt, 0.001, 0.999);
}

export function evaluateLogitSpaceMonotoneSplineV6(
  pRaw: number,
  spec: LogitSpaceMonotoneSplineSpecV6,
): UnitProbability {
  const etaRaw = logit(pRaw, DEFAULT_LOGIT_EPS);
  const ek = spec.eta_knots;
  const zk = spec.zeta_knots;
  const n = ek.length;
  if (n < 2 || zk.length !== n) {
    return toUnitProbability(pRaw);
  }

  const ek0 = ek[0]!;
  const ekLast = ek[n - 1]!;
  let zeta: number;

  if (etaRaw <= ek0) {
    const slopeLo = (zk[1]! - zk[0]!) / Math.max(ek[1]! - ek0, 1e-9);
    zeta = zk[0]! + slopeLo * (etaRaw - ek0);
  } else if (etaRaw >= ekLast) {
    const slopeHi = (zk[n - 1]! - zk[n - 2]!) / Math.max(ekLast - ek[n - 2]!, 1e-9);
    zeta = zk[n - 1]! + slopeHi * (etaRaw - ekLast);
  } else {
    let idx = 0;
    for (let i = 0; i < n - 1; i += 1) {
      if (etaRaw >= ek[i]! && etaRaw <= ek[i + 1]!) {
        idx = i;
        break;
      }
    }
    const span = Math.max(ek[idx + 1]! - ek[idx]!, 1e-12);
    const t = (etaRaw - ek[idx]!) / span;
    zeta = zk[idx]! + t * (zk[idx + 1]! - zk[idx]!);
  }

  return toUnitProbability(sigmoid(clamp(zeta, -12.0, 12.0)));
}

// ============================================================================
// 2. Pillar 1 — Match-Coupled Logit-PAVA Multi-Line `shots` & `shots_on_target`
// ============================================================================

export interface CoupledShotSingleLineOutlookV6 {
  readonly line: number;
  readonly pOverRaw: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly pOverSubCover: UnitProbability;
  readonly subCoverLift: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
  readonly fairOverSubCoverDecimal: number;
}

export interface CoupledPlayerShotsInputV6 {
  readonly metric: CoupledShotMetricV6;
  readonly positionGroup: string;
  readonly seasonCount: number;
  readonly seasonShotsTotal?: number | null;
  readonly appearances: number;
  readonly subIns: number;
  readonly teamExpectedShots: number;
  readonly teamExpectedSoT: number;
  readonly oppDefenseFactor?: number;
  readonly explicitMinutes?: number | null;
  readonly expectedMinutesStarter?: number | null;
  readonly lineupStatus?: LineupStatusV36;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly contextWeight?: number;
  readonly artifact: Pick<PropsV6ModelArtifact, "coupled_shots_v6">;
}

export interface CoupledPlayerShotsMultiLineOutlookV6 {
  readonly metric: CoupledShotMetricV6;
  readonly positionGroup: string;
  readonly lineupStatus: LineupStatusV36;
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly ebRatePer90: number;
  readonly naivePerAppearanceRate: number;
  readonly freshLegsSubRatePer90: number;
  readonly effectiveExposure90: number;
  readonly expectedMinutes: number;
  readonly matchCouplingMultiplier: number;
  readonly muProjected: number;
  readonly rEffective: number;
  readonly calibrationSource: string;
  readonly lines: readonly CoupledShotSingleLineOutlookV6[];
}

export function projectCoupledPlayerShotsMultiLineV6(
  input: CoupledPlayerShotsInputV6,
): CoupledPlayerShotsMultiLineOutlookV6 {
  const shCfg = input.artifact.coupled_shots_v6;
  const posKey = input.positionGroup in shCfg.positions ? input.positionGroup : "MID";
  const posSpec = shCfg.positions[posKey]!;
  const metricSpec = posSpec.metrics[input.metric];

  const mStDefault = posSpec.mean_starter_minutes;
  const mSt = clamp(
    input.expectedMinutesStarter !== null && input.expectedMinutesStarter !== undefined
      ? input.expectedMinutesStarter
      : mStDefault,
    20.0,
    92.0,
  );

  let effStatus: LineupStatusV36 = input.lineupStatus ?? "projected_starter";
  if (
    isDoubtfulAvailabilityV6(input.availability, input.injuryStatus) &&
    (effStatus === "confirmed_starter" || effStatus === "projected_starter")
  ) {
    effStatus = "doubt";
  }

  let regimes: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  if (effStatus === "confirmed_starter") {
    regimes = [
      [0.74, Math.min(92.0, mSt + 5.0) / 90.0],
      [0.22, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.04, 24.0 / 90.0],
    ];
  } else if (effStatus === "doubt") {
    regimes = [
      [0.42, mSt / 90.0],
      [0.28, 52.0 / 90.0],
      [0.3, 22.0 / 90.0],
    ];
  } else if (effStatus === "bench") {
    regimes = [
      [0.1, 70.0 / 90.0],
      [0.25, 32.0 / 90.0],
      [0.65, 16.0 / 90.0],
    ];
  } else {
    regimes = [
      [0.68, Math.min(91.0, mSt + 3.0) / 90.0],
      [0.24, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.08, 22.0 / 90.0],
    ];
  }

  let expectedMinutes = 0.0;
  for (const [piC, eC] of regimes) {
    expectedMinutes += piC * (eC * 90.0);
  }
  if (
    input.expectedMinutesStarter !== null &&
    input.expectedMinutesStarter !== undefined &&
    input.expectedMinutesStarter < 45.0
  ) {
    expectedMinutes = input.expectedMinutesStarter;
  }

  const guard = checkPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    prematchExpectedMinutes: expectedMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });

  const eff90 = estimateEffectiveExposure90V6(
    input.appearances,
    input.subIns,
    posKey,
    input.explicitMinutes,
  );
  const ctxW = clamp(input.contextWeight ?? 1.0, 0.1, 1.0);

  const priorRate = metricSpec.prior_rate_per90;
  const priorBeta = metricSpec.prior_beta_90;
  const phiDisp = metricSpec.phi_dispersion;
  const subMult = metricSpec.fresh_legs_sub_multiplier;

  const alpha0 = priorRate * priorBeta;
  const alphaPost = alpha0 + Math.max(0.0, input.seasonCount) * ctxW;
  const betaPost = priorBeta + eff90 * ctxW;
  let ebRatePer90 = alphaPost / Math.max(betaPost, 1e-6);

  if (
    input.metric === "shots_on_target" &&
    input.seasonShotsTotal !== null &&
    input.seasonShotsTotal !== undefined &&
    input.seasonShotsTotal >= 0.0
  ) {
    const shMs = posSpec.metrics.shots;
    const shRate90 =
      (shMs.prior_rate_per90 * shMs.prior_beta_90 + Math.max(0.0, input.seasonShotsTotal) * ctxW) /
      Math.max(shMs.prior_beta_90 + eff90 * ctxW, 1e-6);
    ebRatePer90 = Math.min(ebRatePer90, 0.92 * shRate90);
  }

  const shotsAnchor = shCfg.league_team_shots_anchor;
  const sotAnchor = shCfg.league_team_sot_anchor;
  const tmShotsC = clamp(input.teamExpectedShots, 4.0, 26.0);
  const tmSoTC = clamp(input.teamExpectedSoT, 1.0, 12.5);
  const oppC = clamp(input.oppDefenseFactor ?? 1.0, 0.6, 1.55);

  let couplingMult: number;
  if (input.metric === "shots") {
    const volRatio = clamp(tmShotsC / shotsAnchor, 0.5, 1.85);
    const qualRatio = clamp(
      tmSoTC / Math.max(tmShotsC, 1.0) / (sotAnchor / shotsAnchor),
      0.75,
      1.3,
    );
    couplingMult =
      Math.pow(volRatio, shCfg.team_shots_exponent) *
      Math.pow(qualRatio, shCfg.cross_quality_exponent) *
      Math.pow(oppC, shCfg.opp_defense_exponent);
  } else {
    const sotRatio = clamp(tmSoTC / sotAnchor, 0.45, 1.95);
    const volRatio = clamp(tmShotsC / shotsAnchor, 0.5, 1.85);
    couplingMult =
      Math.pow(sotRatio, shCfg.team_sot_exponent) *
      Math.pow(volRatio, shCfg.cross_volume_exponent) *
      Math.pow(oppC, shCfg.opp_defense_exponent);
  }

  const invR = 1.0 / Math.max(alphaPost, 0.25) + 1.0 / Math.max(phiDisp, 0.5);
  const rEffective = clamp(1.0 / invR, 0.45, 150.0);
  const rep90 = subMult * priorRate;
  const muProjected = ebRatePer90 * (expectedMinutes / 90.0) * couplingMult;

  if (!guard.eligible) {
    return Object.freeze({
      metric: input.metric,
      positionGroup: posKey,
      lineupStatus: effStatus,
      eligible: false,
      blockedByInjury: guard.blockedByInjury,
      blockedByMinutesGuard: guard.blockedByMinutesGuard,
      ebRatePer90,
      naivePerAppearanceRate: input.seasonCount / Math.max(1, Math.trunc(input.appearances)),
      freshLegsSubRatePer90: rep90,
      effectiveExposure90: eff90,
      expectedMinutes,
      matchCouplingMultiplier: couplingMult,
      muProjected: 0.0,
      rEffective,
      calibrationSource: shCfg.calibration_source,
      lines: Object.freeze([]),
    });
  }

  const splinesForMetric = shCfg.multi_line_logit_splines[input.metric];
  const rawList: number[] = [];
  const calUnproj: number[] = [];
  const subUnproj: number[] = [];

  for (const ln of CANONICAL_SHOT_LINES_V6) {
    let pOverRaw = 0.0;
    let pSubRaw = 0.0;
    for (const [piC, eC] of regimes) {
      const muC = ebRatePer90 * eC * couplingMult;
      pOverRaw += piC * nbProbOverExactV6(muC, rEffective, ln, 28).pOver;

      const remE = Math.max(0.0, 1.0 - eC);
      const muSubC = (ebRatePer90 * eC + rep90 * remE) * couplingMult;
      pSubRaw += piC * nbProbOverExactV6(muSubC, rEffective, ln, 28).pOver;
    }

    const spSpec = selectNearestSplineSpecV6(splinesForMetric, ln, CANONICAL_SHOT_LINES_V6);
    const pCalM = evaluateLogitSpaceMonotoneSplineV6(pOverRaw, spSpec);
    const pSubM = Math.max(pCalM, evaluateLogitSpaceMonotoneSplineV6(pSubRaw, spSpec));
    rawList.push(pOverRaw);
    calUnproj.push(pCalM);
    subUnproj.push(pSubM);
  }

  const calProj: UnitProbability[] = [];
  const subProj: UnitProbability[] = [];
  for (let mIdx = 0; mIdx < CANONICAL_SHOT_LINES_V6.length; mIdx += 1) {
    const cu = calUnproj[mIdx]!;
    const su = subUnproj[mIdx]!;
    if (mIdx === 0) {
      const pc = toUnitProbability(cu);
      const ps = toUnitProbability(Math.max(pc, su));
      calProj.push(pc);
      subProj.push(ps);
    } else {
      const prevC = calProj[mIdx - 1]!;
      const prevS = subProj[mIdx - 1]!;
      const pc = toUnitProbability(Math.min(prevC, cu));
      const ps = toUnitProbability(clamp(su, pc, prevS));
      calProj.push(pc);
      subProj.push(ps);
    }
  }

  const linesOut: CoupledShotSingleLineOutlookV6[] = CANONICAL_SHOT_LINES_V6.map((ln, mIdx) => {
    const pc = calProj[mIdx]!;
    const pu = toUnitProbability(1.0 - pc);
    const ps = subProj[mIdx]!;
    return Object.freeze({
      line: ln,
      pOverRaw: rawList[mIdx]!,
      pOverCalibrated: pc,
      pUnderCalibrated: pu,
      pOverSubCover: ps,
      subCoverLift: ps - pc,
      fairOverDecimal: roundFairDecimalV6(pc),
      fairUnderDecimal: roundFairDecimalV6(pu),
      fairOverSubCoverDecimal: roundFairDecimalV6(ps),
    });
  });

  return Object.freeze({
    metric: input.metric,
    positionGroup: posKey,
    lineupStatus: effStatus,
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    ebRatePer90,
    naivePerAppearanceRate: input.seasonCount / Math.max(1, Math.trunc(input.appearances)),
    freshLegsSubRatePer90: rep90,
    effectiveExposure90: eff90,
    expectedMinutes,
    matchCouplingMultiplier: couplingMult,
    muProjected,
    rEffective,
    calibrationSource: shCfg.calibration_source,
    lines: Object.freeze(linesOut),
  });
}

// ============================================================================
// 3. Pillar 2 — Multi-Line `player_saves` + Linked Goalkeeper-Match SGP (`V6`)
// ============================================================================

export interface GoalkeeperSavesSingleLineV6 {
  readonly line: number;
  readonly pOverRaw: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
}

export interface GoalkeeperSavesMultiLineInputV6 {
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly oppExpectedSoT: number;
  readonly expectedMinutes?: number | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly artifact: Pick<PropsV6ModelArtifact, "goalkeeper_saves_v6">;
}

export interface GoalkeeperSavesMultiLineOutlookV6 {
  readonly eligible: boolean;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly ebSaveRate: number;
  readonly effectiveExposure90: number;
  readonly expectedMinutes: number;
  readonly oppExpectedSoT: number;
  readonly expectedSaves: number;
  readonly rDispersionSoT: number;
  readonly lines: readonly GoalkeeperSavesSingleLineV6[];
}

export function projectGoalkeeperSavesMultiLineV6(
  input: GoalkeeperSavesMultiLineInputV6,
): GoalkeeperSavesMultiLineOutlookV6 {
  const gkCfg = input.artifact.goalkeeper_saves_v6;
  const sv = Math.max(0, Math.trunc(input.saves));
  const sfRaw = Math.max(0, Math.trunc(input.shotsFaced));
  const gc = Math.max(0, Math.trunc(input.goalsConceded));
  const apps = Math.max(0, Math.trunc(input.appearances));
  const subs = clamp(Math.trunc(input.subIns), 0, apps);

  const effSf = sfRaw > 0 ? Math.max(sv, sfRaw) : sv + gc;
  const ebSaveRate = clamp(
    (sv + gkCfg.prior_shots_faced * gkCfg.prior_save_rate) / (effSf + gkCfg.prior_shots_faced),
    gkCfg.min_save_rate,
    gkCfg.max_save_rate,
  );

  const eff90 = estimateEffectiveExposure90V6(apps, subs, "GK");
  const avgMin = clamp((eff90 * 90.0) / Math.max(1, apps), 30.0, 90.0);
  let expMin = clamp(
    input.expectedMinutes !== null && input.expectedMinutes !== undefined
      ? input.expectedMinutes
      : avgMin,
    15.0,
    95.0,
  );
  if (
    isDoubtfulAvailabilityV6(input.availability, input.injuryStatus) &&
    (input.expectedMinutes === null || input.expectedMinutes === undefined)
  ) {
    expMin = clamp(0.78 * expMin, 15.0, 95.0);
  }

  const guard = checkPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    prematchExpectedMinutes: expMin,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });

  const oppSoTC = clamp(input.oppExpectedSoT, 1.0, 12.0);
  const rDisp = gkCfg.r_dispersion_sot;

  if (!guard.eligible) {
    return Object.freeze({
      eligible: false,
      blockedByInjury: guard.blockedByInjury,
      blockedByMinutesGuard: guard.blockedByMinutesGuard,
      ebSaveRate,
      effectiveExposure90: eff90,
      expectedMinutes: expMin,
      oppExpectedSoT: oppSoTC,
      expectedSaves: 0.0,
      rDispersionSoT: rDisp,
      lines: Object.freeze([]),
    });
  }

  const muSaves = oppSoTC * ebSaveRate * (expMin / 90.0);
  const splines = gkCfg.multi_line_logit_splines;
  const rawProbs: number[] = [];
  const calUnproj: number[] = [];

  for (const ln of CANONICAL_GK_SAVES_LINES_V6) {
    const kMin = Math.floor(ln + 1e-9) + 1;
    const pRaw = nbTailProbGeV6(kMin, muSaves, rDisp);
    const spSpec = selectNearestSplineSpecV6(splines, ln, CANONICAL_GK_SAVES_LINES_V6);
    const pCal = evaluateLogitSpaceMonotoneSplineV6(pRaw, spSpec);
    rawProbs.push(pRaw);
    calUnproj.push(pCal);
  }

  const calProj: UnitProbability[] = [];
  for (let idx = 0; idx < calUnproj.length; idx += 1) {
    const pu = calUnproj[idx]!;
    if (idx === 0) {
      calProj.push(toUnitProbability(pu));
    } else {
      calProj.push(toUnitProbability(Math.min(calProj[idx - 1]!, pu)));
    }
  }

  const linesOut: GoalkeeperSavesSingleLineV6[] = CANONICAL_GK_SAVES_LINES_V6.map((ln, idx) => {
    const pc = calProj[idx]!;
    const pu = toUnitProbability(1.0 - pc);
    return Object.freeze({
      line: ln,
      pOverRaw: rawProbs[idx]!,
      pOverCalibrated: pc,
      pUnderCalibrated: pu,
      fairOverDecimal: roundFairDecimalV6(pc),
      fairUnderDecimal: roundFairDecimalV6(pu),
    });
  });

  return Object.freeze({
    eligible: true,
    blockedByInjury: false,
    blockedByMinutesGuard: false,
    ebSaveRate,
    effectiveExposure90: eff90,
    expectedMinutes: expMin,
    oppExpectedSoT: oppSoTC,
    expectedSaves: muSaves,
    rDispersionSoT: rDisp,
    lines: Object.freeze(linesOut),
  });
}

export interface GoalkeeperSgpBookQuoteAuditV6 {
  readonly offeredCombinedDecimalOdds: number;
  readonly impliedBookProbability: UnitProbability;
  readonly fairCombinedDecimalOdds: number;
  readonly effectiveHoldPct: number;
  readonly taxFlag: "fair_or_low_vig" | "standard_sgp_vig" | "severe_sgp_tax";
}

export interface GoalkeeperSavesLinkedSgpInputV6 {
  readonly savesLine: number;
  readonly ebSaveRate: number;
  readonly oppExpectedSoT: number;
  readonly teamExpectedGoals: number;
  readonly opponentExpectedGoals: number;
  readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
  readonly expectedMinutes?: number | null;
  readonly rDispersionSoT?: number;
  readonly dixonColesRho?: number;
  readonly siegeOwnGoalDampening?: number;
  readonly offeredCombinedDecimalOdds?: number | null;
}

export interface GoalkeeperSavesLinkedSgpResultV6 {
  readonly savesLine: number;
  readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
  readonly expectedSaves: number;
  readonly effectiveRivalSoT: number;
  readonly pSavesOverMarginal: UnitProbability;
  readonly pMatchOutcomeMarginal: UnitProbability;
  readonly independentProbability: number;
  readonly jointProbability: UnitProbability;
  readonly frechetLowerBound: number;
  readonly frechetUpperBound: number;
  readonly structuralMultiplier: number;
  readonly correlationDirection: "positively_correlated" | "negatively_correlated" | "near_independent";
  readonly fairCombinedDecimal: number;
  readonly bookQuoteAudit: GoalkeeperSgpBookQuoteAuditV6 | null;
}

export function evaluateGoalkeeperSavesLinkedSgpV6(
  params: GoalkeeperSavesLinkedSgpInputV6,
): GoalkeeperSavesLinkedSgpResultV6 {
  const kMin = Math.max(1, Math.floor(params.savesLine + 1e-9) + 1);
  const expMin = clamp(
    params.expectedMinutes !== null && params.expectedMinutes !== undefined
      ? params.expectedMinutes
      : 90.0,
    15.0,
    95.0,
  );
  const expFrac = expMin / 90.0;
  const qSavePrior = clamp(params.ebSaveRate, 0.48, 0.9);
  const oppSoTC = clamp(params.oppExpectedSoT, 1.0, 12.0);

  const muSaves = clamp(oppSoTC * qSavePrior * expFrac, 0.05, 18.0);
  const lamOwn = clamp(params.teamExpectedGoals, 0.08, 7.5);
  const lamOpp = clamp(params.opponentExpectedGoals, 0.08, 7.5);
  const rSoT = clamp(params.rDispersionSoT ?? 7.5, 0.8, 150.0);
  const kappaSiege = clamp(params.siegeOwnGoalDampening ?? 0.028, 0.0, 0.12);

  const maxSaves = 26;
  const maxGoals = 12;
  const maxS = maxSaves + maxGoals;

  const muSoTEff = muSaves + lamOpp;
  const qSaveEff = clamp(muSaves / Math.max(muSoTEff, 1e-9), 0.05, 0.96);
  const oneMinusQ = 1.0 - qSaveEff;

  const p0Ratio = rSoT / (rSoT + muSoTEff);
  const qsRatio = muSoTEff / (rSoT + muSoTEff);
  const pmfS = new Float64Array(maxS + 1);
  pmfS[0] = Math.exp(rSoT * Math.log(p0Ratio));
  for (let s = 1; s <= maxS; s += 1) {
    pmfS[s] = (pmfS[s - 1] ?? 0.0) * ((s - 1.0 + rSoT) / s) * qsRatio;
  }

  const powQ = new Float64Array(maxSaves + 1);
  powQ[0] = 1.0;
  for (let sv = 1; sv <= maxSaves; sv += 1) {
    powQ[sv] = (powQ[sv - 1] ?? 1.0) * qSaveEff;
  }

  const pow1mQ = new Float64Array(maxGoals + 1);
  pow1mQ[0] = 1.0;
  for (let go = 1; go <= maxGoals; go += 1) {
    pow1mQ[go] = (pow1mQ[go - 1] ?? 1.0) * oneMinusQ;
  }

  let totalZ = 0.0;
  let massSaves = 0.0;
  let massMatch = 0.0;
  let massJoint = 0.0;

  const pmfOwn = new Float64Array(maxGoals + 1);
  const suffixOwn = new Float64Array(maxGoals + 2);

  for (let s = 0; s <= maxS; s += 1) {
    const psVal = pmfS[s] ?? 0.0;
    const lamOwnS = clamp(lamOwn * Math.exp(-kappaSiege * (s - muSoTEff)), 0.05, 8.5);
    pmfOwn[0] = Math.exp(-lamOwnS);
    for (let gt = 1; gt <= maxGoals; gt += 1) {
      pmfOwn[gt] = ((pmfOwn[gt - 1] ?? 0.0) * lamOwnS) / gt;
    }

    suffixOwn[maxGoals + 1] = 0.0;
    for (let gt = maxGoals; gt >= 0; gt -= 1) {
      suffixOwn[gt] = (suffixOwn[gt + 1] ?? 0.0) + (pmfOwn[gt] ?? 0.0);
    }
    const sumOwn = suffixOwn[0] ?? 0.0;

    const rhoMin = Math.max(-1.0 / Math.max(lamOwnS * lamOpp, 1e-6) + 0.05, -0.35);
    const rhoMax = Math.min(
      1.0 / Math.max(lamOwnS, 1e-6) - 0.05,
      1.0 / Math.max(lamOpp, 1e-6) - 0.05,
      0.35,
    );
    const rc = clamp(params.dixonColesRho ?? -0.105, rhoMin, rhoMax);

    const goLo = Math.max(0, s - maxSaves);
    const goHi = Math.min(s, maxGoals);
    const combRow = PASCAL_COMB_V6[s];

    for (let go = goLo; go <= goHi; go += 1) {
      const sv = s - go;
      const cVal = combRow?.[go] ?? 0;
      const pr = psVal * cVal * (powQ[sv] ?? 0.0) * (pow1mQ[go] ?? 0.0);

      let accAll: number;
      let accM: number;

      if (go === 0) {
        const w0 = (pmfOwn[0] ?? 0.0) * Math.max(0.0, 1.0 - lamOwnS * lamOpp * rc);
        const w1 = (pmfOwn[1] ?? 0.0) * Math.max(0.0, 1.0 + lamOpp * rc);
        const wGe2 = suffixOwn[2] ?? 0.0;
        accAll = w0 + w1 + wGe2;
        if (params.matchOutcome === "clean_sheet" || params.matchOutcome === "team_win_or_draw") {
          accM = accAll;
        } else if (params.matchOutcome === "under_2_5") {
          accM = w0 + w1 + (pmfOwn[2] ?? 0.0);
        } else if (params.matchOutcome === "team_win") {
          accM = w1 + wGe2;
        } else {
          accM = suffixOwn[3] ?? 0.0;
        }
      } else if (go === 1) {
        const w0 = (pmfOwn[0] ?? 0.0) * Math.max(0.0, 1.0 + lamOwnS * rc);
        const w1 = (pmfOwn[1] ?? 0.0) * Math.max(0.0, 1.0 - rc);
        const wGe2 = suffixOwn[2] ?? 0.0;
        accAll = w0 + w1 + wGe2;
        if (params.matchOutcome === "clean_sheet") {
          accM = 0.0;
        } else if (params.matchOutcome === "under_2_5") {
          accM = w0 + w1;
        } else if (params.matchOutcome === "team_win" || params.matchOutcome === "over_2_5") {
          accM = wGe2;
        } else {
          accM = w1 + wGe2;
        }
      } else {
        accAll = sumOwn;
        if (params.matchOutcome === "clean_sheet") {
          accM = 0.0;
        } else if (params.matchOutcome === "under_2_5") {
          accM = go === 2 ? (pmfOwn[0] ?? 0.0) : 0.0;
        } else if (params.matchOutcome === "team_win") {
          accM = suffixOwn[go + 1] ?? 0.0;
        } else if (params.matchOutcome === "over_2_5") {
          accM = go === 2 ? (suffixOwn[1] ?? 0.0) : sumOwn;
        } else {
          accM = suffixOwn[go] ?? 0.0;
        }
      }

      const cellAll = pr * accAll;
      const cellM = pr * accM;
      totalZ += cellAll;
      massMatch += cellM;
      if (sv >= kMin) {
        massSaves += cellAll;
        massJoint += cellM;
      }
    }
  }

  const invZ = 1.0 / Math.max(totalZ, 1e-15);
  const pSavesMarg = toUnitProbability(massSaves * invZ);
  const pMatchMarg = toUnitProbability(massMatch * invZ);

  const frechetLo = Math.max(0.0, pSavesMarg + pMatchMarg - 1.0);
  const frechetHi = Math.min(pSavesMarg, pMatchMarg);
  const jointRaw = massJoint * invZ;
  const jointProb = toUnitProbability(clamp(jointRaw, Math.max(0.001, frechetLo), frechetHi));

  const indepProb = pSavesMarg * pMatchMarg;
  const mult = jointProb / Math.max(indepProb, 1e-9);
  const corrDir: GoalkeeperSavesLinkedSgpResultV6["correlationDirection"] =
    mult > 1.03
      ? "positively_correlated"
      : mult < 0.97
        ? "negatively_correlated"
        : "near_independent";

  let audit: GoalkeeperSgpBookQuoteAuditV6 | null = null;
  if (
    params.offeredCombinedDecimalOdds !== null &&
    params.offeredCombinedDecimalOdds !== undefined
  ) {
    const oddsDec = params.offeredCombinedDecimalOdds;
    if (!Number.isFinite(oddsDec) || oddsDec <= 1.0) {
      throw new RangeError(`Invalid offered decimal odds: ${String(oddsDec)}`);
    }
    const holdPct = Math.max(0.0, (1.0 - oddsDec * jointProb) * 100.0);
    const taxFlag: GoalkeeperSgpBookQuoteAuditV6["taxFlag"] =
      holdPct >= 20.0
        ? "severe_sgp_tax"
        : holdPct >= 8.0
          ? "standard_sgp_vig"
          : "fair_or_low_vig";
    audit = Object.freeze({
      offeredCombinedDecimalOdds: oddsDec,
      impliedBookProbability: toUnitProbability(1.0 / oddsDec),
      fairCombinedDecimalOdds: 1.0 / jointProb,
      effectiveHoldPct: holdPct,
      taxFlag,
    });
  }

  return Object.freeze({
    savesLine: params.savesLine,
    matchOutcome: params.matchOutcome,
    expectedSaves: muSaves,
    effectiveRivalSoT: muSoTEff,
    pSavesOverMarginal: pSavesMarg,
    pMatchOutcomeMarginal: pMatchMarg,
    independentProbability: indepProb,
    jointProbability: jointProb,
    frechetLowerBound: frechetLo,
    frechetUpperBound: frechetHi,
    structuralMultiplier: mult,
    correlationDirection: corrDir,
    fairCombinedDecimal: roundFairDecimalV6(jointProb),
    bookQuoteAudit: audit,
  });
}

// ============================================================================
// 4. Pillar 3 — Multi-Column Normalized US Game-Log Extractor & Props Engine
// ============================================================================

export interface RawPlayerStatColumnV6 {
  readonly key?: string | null;
  readonly label?: string | null;
  readonly value: string | number | null;
}

export interface NormalizeUsGameLogInputV6 {
  readonly sport: NormalizablePropsSportV6 | "soccer";
  readonly columns: readonly RawPlayerStatColumnV6[];
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly enforceMinutesGuard?: boolean;
}

export interface NormalizedUsGameLogResultV6 {
  readonly sport: NormalizablePropsSportV6;
  readonly blockedByInjury: boolean;
  readonly blockedByMinutesGuard: boolean;
  readonly eligibleForProjection: boolean;
  readonly rawColumnCount: number;
  readonly extractedCount: number;
  readonly metrics: Readonly<Record<string, number>>;
}

const CLOCK_RE_V6 = /^(\d+):(\d{1,2})$/;
const MADE_ATT_RE_V6 = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/;
const BASEBALL_IP_RE_V6 = /^(\d+)\.([12])$/;

function parseNumericOrClockV6(
  raw: string | number | null | undefined,
  isBaseballIp: boolean,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (isBaseballIp) {
      const sRepr = raw.toFixed(1);
      if (Math.abs(raw - Number(sRepr)) < 1e-9) {
        const mIp = BASEBALL_IP_RE_V6.exec(sRepr);
        if (mIp) {
          return Number(mIp[1]!) + Number(mIp[2]!) / 3.0;
        }
      }
    }
    return raw;
  }

  const s = String(raw).trim();
  if (!s || s === "-" || s === "--" || s === "N/A" || s === "DNP") return null;

  if (isBaseballIp) {
    const mIp = BASEBALL_IP_RE_V6.exec(s);
    if (mIp) {
      return Number(mIp[1]!) + Number(mIp[2]!) / 3.0;
    }
  }

  const mClk = CLOCK_RE_V6.exec(s);
  if (mClk) {
    return Number(mClk[1]!) + Number(mClk[2]!) / 60.0;
  }

  const sClean = s.replace(/%+$/, "").replace(/,/g, "");
  const val = Number(sClean);
  return Number.isFinite(val) ? val : null;
}

function parseMadeAttemptedV6(raw: string | number | null | undefined): readonly [number, number] | null {
  if (typeof raw !== "string") return null;
  const m = MADE_ATT_RE_V6.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]!), Number(m[2]!)];
}

export function normalizeUsPlayerGameLogColumnsV6(
  input: NormalizeUsGameLogInputV6,
): NormalizedUsGameLogResultV6 {
  const spRaw = cleanStatusTokenV6(input.sport);
  const sp: NormalizablePropsSportV6 =
    spRaw === "soccer" || spRaw === "football"
      ? "football"
      : spRaw === "nba" || spRaw === "mlb" || spRaw === "nhl" || spRaw === "nfl"
        ? spRaw
        : (() => {
            throw new Error(`Unsupported sport in normalizeUsPlayerGameLogColumnsV6: ${String(input.sport)}`);
          })();

  const rawCount = input.columns.length;
  if (isHardBlockedAvailabilityV6(input.availability, input.injuryStatus)) {
    return Object.freeze({
      sport: sp,
      blockedByInjury: true,
      blockedByMinutesGuard: false,
      eligibleForProjection: false,
      rawColumnCount: rawCount,
      extractedCount: 0,
      metrics: Object.freeze({}),
    });
  }

  const metrics: Record<string, number> = {};
  const enforceGuard = input.enforceMinutesGuard ?? true;

  for (const col of input.columns) {
    const rawKey = String(col.key ?? "").trim().toLowerCase();
    const rawLbl = String(col.label ?? "").trim();
    const lblUp = rawLbl.toUpperCase();
    const valRaw = col.value;

    if (sp === "nba") {
      if (
        rawKey === "3pt" ||
        rawKey === "3pm-a" ||
        rawKey === "fg3" ||
        lblUp === "3PT" ||
        lblUp === "3PM-A" ||
        lblUp === "3P-A" ||
        lblUp === "T3"
      ) {
        const ma = parseMadeAttemptedV6(valRaw);
        if (ma !== null) {
          metrics["3PM"] = ma[0];
          metrics["3PA"] = ma[1];
          continue;
        }
      }
      if (rawKey === "fg" || rawKey === "tc" || lblUp === "FG" || lblUp === "FGM-A" || lblUp === "TC") {
        const ma = parseMadeAttemptedV6(valRaw);
        if (ma !== null) {
          metrics["FGM"] = ma[0];
          metrics["FGA"] = ma[1];
          continue;
        }
      }
      if (rawKey === "ft" || rawKey === "tl" || lblUp === "FT" || lblUp === "FTM-A" || lblUp === "TL") {
        const ma = parseMadeAttemptedV6(valRaw);
        if (ma !== null) {
          metrics["FTM"] = ma[0];
          metrics["FTA"] = ma[1];
          continue;
        }
      }

      const num = parseNumericOrClockV6(valRaw, false);
      if (num === null) continue;

      if (rawKey === "min" || rawKey === "mp" || rawKey === "mins" || lblUp === "MIN" || lblUp === "MINS" || lblUp === "MP") {
        metrics["MIN"] = num;
      } else if (rawKey === "pts" || rawKey === "points" || lblUp === "PTS" || lblUp === "PUNTOS") {
        metrics["PTS"] = num;
      } else if (rawKey === "reb" || rawKey === "trb" || rawKey === "rebs" || lblUp === "REB" || lblUp === "REBS" || lblUp === "TRB" || lblUp === "TOT") {
        metrics["REB"] = num;
      } else if (rawKey === "ast" || rawKey === "asts" || lblUp === "AST" || lblUp === "ASTS" || lblUp === "ASIST") {
        metrics["AST"] = num;
      } else if (
        rawKey === "3pm" ||
        rawKey === "fg3m" ||
        rawKey === "3ptm" ||
        rawKey === "tpm" ||
        lblUp === "3PM" ||
        lblUp === "3PTM" ||
        lblUp === "FG3M" ||
        ((lblUp === "3P" || lblUp === "3PT") && !rawLbl.includes("%"))
      ) {
        metrics["3PM"] = num;
      } else if (rawKey === "3pa" || rawKey === "fg3a" || lblUp === "3PA" || lblUp === "FG3A") {
        metrics["3PA"] = num;
      } else if (rawKey === "fg_" || rawKey === "fg_pct" || rawKey === "fgp" || lblUp === "%TC" || lblUp === "FG%" || lblUp === "%FG") {
        metrics["FG_PCT"] = num;
      } else if (rawKey === "fg3_" || rawKey === "3p_" || rawKey === "fg3_pct" || lblUp === "%3P" || lblUp === "3P%" || lblUp === "3PT%") {
        metrics["FG3_PCT"] = num;
      } else if (rawKey === "ft_" || rawKey === "ft_pct" || lblUp === "%TL" || lblUp === "FT%" || lblUp === "%FT") {
        metrics["FT_PCT"] = num;
      } else if (rawKey === "stl" || lblUp === "STL" || lblUp === "ROB") {
        metrics["STL"] = num;
      } else if (rawKey === "blk" || lblUp === "BLK" || lblUp === "TAP") {
        metrics["BLK"] = num;
      } else if (rawKey === "tov" || rawKey === "to" || lblUp === "TO" || lblUp === "TOV" || lblUp === "PER") {
        metrics["TOV"] = num;
      } else if (rawKey === "gp" || lblUp === "GP" || lblUp === "JJ") {
        metrics["GP"] = num;
      }
    } else if (sp === "mlb") {
      const isIp = rawKey === "ip" || rawKey === "innings" || lblUp === "IP" || lblUp === "EL" || lblUp === "INNINGS";
      const num = parseNumericOrClockV6(valRaw, isIp);
      if (num === null) continue;

      if (isIp) {
        metrics["IP"] = num;
      } else if (rawKey === "so" || rawKey === "k" || rawKey === "strikeouts" || lblUp === "SO" || lblUp === "K" || lblUp === "PONCHES") {
        metrics["SO"] = num;
      } else if (rawKey === "h" || rawKey === "hits" || lblUp === "H" || lblUp === "HITS" || lblUp === "IMP") {
        metrics["H"] = num;
      } else if (rawKey === "er" || rawKey === "earned_runs" || lblUp === "ER" || lblUp === "CL") {
        metrics["ER"] = num;
      } else if (rawKey === "bb" || rawKey === "walks" || lblUp === "BB" || lblUp === "WALKS") {
        metrics["BB"] = num;
      } else if (rawKey === "hr" || rawKey === "home_runs" || lblUp === "HR" || lblUp === "JONRONES") {
        metrics["HR"] = num;
      } else if (rawKey === "tb" || rawKey === "total_bases" || lblUp === "TB" || lblUp === "BT" || lblUp === "TOTAL_BASES") {
        metrics["TB"] = num;
      } else if (rawKey === "rbi" || rawKey === "rbis" || lblUp === "RBI" || lblUp === "CI") {
        metrics["RBI"] = num;
      } else if (rawKey === "gs" || lblUp === "GS" || lblUp === "JI") {
        metrics["GS"] = num;
      } else if (rawKey === "cg" || lblUp === "CG" || lblUp === "JC") {
        metrics["CG"] = num;
      } else if (rawKey === "sho" || lblUp === "SHO") {
        metrics["SHO"] = num;
      } else if (rawKey === "ab" || lblUp === "AB" || lblUp === "VB") {
        metrics["AB"] = num;
      } else if (rawKey === "r" || rawKey === "runs" || lblUp === "R" || lblUp === "C") {
        metrics["R"] = num;
      } else if (rawKey === "gp" || lblUp === "GP" || lblUp === "JJ") {
        metrics["GP"] = num;
      }
    } else if (sp === "nhl") {
      const num = parseNumericOrClockV6(valRaw, false);
      if (num === null) continue;

      if (rawKey === "sog" || rawKey === "s" || rawKey === "shots" || lblUp === "SOG" || lblUp === "S" || lblUp === "TIROS" || lblUp === "SHOTS") {
        metrics["SOG"] = num;
      } else if (rawKey === "g" || rawKey === "goals" || lblUp === "G" || lblUp === "GOLES") {
        metrics["G"] = num;
      } else if (rawKey === "a" || rawKey === "assists" || lblUp === "A" || lblUp === "ASIST") {
        metrics["A"] = num;
      } else if (rawKey === "pts" || rawKey === "points" || lblUp === "PTS" || lblUp === "P") {
        metrics["PTS"] = num;
      } else if (rawKey === "toi" || rawKey === "time_on_ice" || rawKey === "min" || lblUp === "TOI" || lblUp === "MIN" || lblUp === "HIELO") {
        metrics["TOI"] = num;
      } else if (rawKey === "_" || rawKey === "plus_minus" || lblUp === "+/-") {
        metrics["PLUS_MINUS"] = num;
      } else if (rawKey === "pim" || lblUp === "PIM" || lblUp === "MP") {
        metrics["PIM"] = num;
      } else if (rawKey === "sv" || rawKey === "saves" || lblUp === "SV" || lblUp === "ATAJ") {
        metrics["SV"] = num;
      } else if (rawKey === "ga" || rawKey === "goals_against" || lblUp === "GA" || lblUp === "GC") {
        metrics["GA"] = num;
      } else if (rawKey === "gp" || lblUp === "GP" || lblUp === "JJ") {
        metrics["GP"] = num;
      }
    } else if (sp === "nfl") {
      if (rawKey === "cmp_att" || rawKey === "c/att" || lblUp === "C/ATT" || lblUp === "CMP-ATT") {
        const ma = parseMadeAttemptedV6(valRaw);
        if (ma !== null) {
          metrics["CMP"] = ma[0];
          metrics["ATT"] = ma[1];
          continue;
        }
      }
      const num = parseNumericOrClockV6(valRaw, false);
      if (num === null) continue;

      if (rawKey === "cmp" || rawKey === "completions" || lblUp === "CMP" || lblUp === "COMP") {
        metrics["CMP"] = num;
      } else if (rawKey === "att" || rawKey === "pass_att" || lblUp === "ATT" || lblUp === "INT.") {
        metrics["ATT"] = num;
      } else if (rawKey === "yds" || rawKey === "yards" || lblUp === "YDS" || lblUp === "YARDAS") {
        metrics["YDS"] = num;
      } else if (rawKey === "td" || rawKey === "tds" || lblUp === "TD" || lblUp === "TDS") {
        metrics["TD"] = num;
      } else if (rawKey === "rec" || rawKey === "receptions" || lblUp === "REC" || lblUp === "RECEP") {
        metrics["REC"] = num;
      } else if (rawKey === "tgts" || rawKey === "tgt" || rawKey === "targets" || lblUp === "TGTS" || lblUp === "TGT" || lblUp === "TARGETS") {
        metrics["TGTS"] = num;
      } else if (rawKey === "car" || rawKey === "rush_att" || rawKey === "acar" || lblUp === "CAR" || lblUp === "ACAR") {
        metrics["CAR"] = num;
      } else if (rawKey === "int" || rawKey === "interceptions" || lblUp === "INT") {
        metrics["INT"] = num;
      } else if (rawKey === "cmp_" || rawKey === "cmp_pct" || lblUp === "%CMP" || lblUp === "CMP%") {
        metrics["CMP_PCT"] = num;
      } else if (rawKey === "avg" || lblUp === "AVG" || lblUp === "PROM") {
        metrics["AVG"] = num;
      } else if (rawKey === "lng" || lblUp === "LNG" || lblUp === "LARGO") {
        metrics["LNG"] = num;
      } else if (rawKey === "gp" || lblUp === "GP" || lblUp === "JJ") {
        metrics["GP"] = num;
      }
    } else if (sp === "football") {
      const num = parseNumericOrClockV6(valRaw, false);
      if (num === null) continue;
      if (rawKey === "min" || rawKey === "minutes" || lblUp === "MIN" || lblUp === "MINS") {
        metrics["MIN"] = num;
      } else if (rawKey === "sh" || rawKey === "shots" || lblUp === "SH" || lblUp === "SHOTS" || lblUp === "TIROS") {
        metrics["SH"] = num;
      } else if (rawKey === "sot" || rawKey === "shotsontarget" || lblUp === "SOT" || lblUp === "AP" || lblUp === "TIROS A PUERTA") {
        metrics["SOT"] = num;
      } else if (rawKey === "g" || rawKey === "goals" || lblUp === "G" || lblUp === "GLS" || lblUp === "GOLES") {
        metrics["G"] = num;
      } else if (rawKey === "a" || rawKey === "assists" || lblUp === "A" || lblUp === "AST" || lblUp === "ASIST") {
        metrics["A"] = num;
      } else if (rawKey === "sv" || rawKey === "saves" || lblUp === "SV" || lblUp === "SAVES" || lblUp === "ATAJ") {
        metrics["SV"] = num;
      }
    }
  }

  let blockedMin = false;
  if (enforceGuard) {
    const minVal = metrics["MIN"];
    if (sp === "nba" && minVal !== undefined && minVal < 18.0) {
      blockedMin = true;
    } else if (sp === "football" && minVal !== undefined && minVal < 45.0) {
      blockedMin = true;
    }
  }

  const extractedCount = Object.keys(metrics).length;
  return Object.freeze({
    sport: sp,
    blockedByInjury: false,
    blockedByMinutesGuard: blockedMin,
    eligibleForProjection: !blockedMin && extractedCount > 0,
    rawColumnCount: rawCount,
    extractedCount,
    metrics: Object.freeze(metrics),
  });
}

function resolveUsRoleV6(sport: UsPropsSportV6, positionLabel?: string | null): string {
  const pos = String(positionLabel ?? "").trim().toUpperCase();
  if (sport === "nba") {
    if (pos === "C") return "C";
    if (pos === "F" || pos === "PF" || pos === "SF") return "F";
    return "G";
  }
  if (sport === "mlb") {
    if (pos === "SP") return "SP";
    if (pos === "RP" || pos === "CP" || pos === "P") return "RP";
    return "BAT";
  }
  if (sport === "nhl") {
    if (pos === "G") return "G";
    if (pos === "D") return "D";
    return "FWD";
  }
  if (pos === "QB") return "QB";
  if (pos === "RB" || pos === "FB") return "RB";
  if (pos === "TE") return "TE";
  return "WR";
}

export interface UsPlayerPropInputV6 {
  readonly sport: UsPropsSportV6;
  readonly positionLabel?: string | null;
  readonly metric: string;
  readonly sampleSum: number;
  readonly sampleGames: number;
  readonly line?: number | null;
  readonly prematchMinutes?: number | null;
  readonly sampleVariance?: number | null;
  readonly oppFactor?: number;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly artifact: Pick<PropsV6ModelArtifact, "us_props_v6">;
}

export interface UsPlayerPropOutlookV6 {
  readonly sport: UsPropsSportV6;
  readonly role: string;
  readonly metric: string;
  readonly distributionFamily: "negbin" | "normal_overdispersed";
  readonly line: number;
  readonly muAdjusted: number;
  readonly sdEffective: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly pPush: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
}

export function projectUsPlayerPropV6(input: UsPlayerPropInputV6): UsPlayerPropOutlookV6 | null {
  const guard = checkPlayerMinutesAndAvailabilityGuardV6({
    sport: input.sport,
    prematchExpectedMinutes: input.prematchMinutes,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
  });
  if (!guard.eligible) {
    return null;
  }

  const role = resolveUsRoleV6(input.sport, input.positionLabel);
  const sportRoles = input.artifact.us_props_v6[input.sport].roles;
  const fallbackKey = Object.keys(sportRoles)[0];
  const roleSpecs = sportRoles[role] ?? (fallbackKey ? sportRoles[fallbackKey] : undefined);
  const spec = roleSpecs?.[input.metric];
  if (!spec) {
    return null;
  }

  const g = Math.max(0.0, input.sampleGames);
  const sSum = Math.max(0.0, input.sampleSum);
  const ebMean = (sSum + spec.prior_games * spec.prior_mean) / Math.max(g + spec.prior_games, 1e-6);

  const anchorMin = spec.anchor_minutes ?? 0.0;
  const minScale =
    input.prematchMinutes !== null && input.prematchMinutes !== undefined && anchorMin > 0.0
      ? clamp(input.prematchMinutes / anchorMin, 0.55, 1.38)
      : 1.0;

  const doubtScale = isDoubtfulAvailabilityV6(input.availability, input.injuryStatus) ? 0.88 : 1.0;
  const oppMult = clamp(input.oppFactor ?? 1.0, 0.7, 1.35);
  const muAdj = Math.max(0.03, ebMean * minScale * doubtScale * oppMult);
  const targetLine =
    input.line !== null && input.line !== undefined ? input.line : spec.canonical_line;

  let pCal: UnitProbability;
  let pPush = 0.0;
  let sdEff: number;

  if (spec.family === "negbin") {
    const rPrior = spec.r_dispersion ?? 8.0;
    let rEff = rPrior;
    if (
      input.sampleVariance !== null &&
      input.sampleVariance !== undefined &&
      g >= 3.0 &&
      input.sampleVariance > muAdj * 1.05
    ) {
      const empR = (muAdj * muAdj) / Math.max(input.sampleVariance - muAdj, 0.15 * muAdj);
      const wEmp = clamp(g / (g + 10.0), 0.0, 0.65);
      rEff = clamp((1.0 - wEmp) * rPrior + wEmp * empR, 0.65, 120.0);
    }
    const nbRes = nbProbOverExactV6(muAdj, rEff, targetLine, 40);
    pPush = nbRes.pPush;
    const act = Math.max(1.0 - pPush, 1e-9);
    pCal = toUnitProbability(nbRes.pOver / act);
    sdEff = Math.sqrt(muAdj + (muAdj * muAdj) / Math.max(rEff, 0.5));
  } else {
    const minSd = spec.min_sd ?? 4.5;
    const vmr = spec.var_mean_ratio ?? 1.5;
    const cvSd = spec.cv_sd ?? 0.25;
    const priorVar = Math.max(minSd * minSd, vmr * muAdj + Math.pow(cvSd * muAdj, 2));
    let effVar = priorVar;
    if (
      input.sampleVariance !== null &&
      input.sampleVariance !== undefined &&
      g >= 3.0 &&
      input.sampleVariance > 0.0
    ) {
      const wEmp = clamp(g / (g + 8.0), 0.0, 0.6);
      effVar = Math.max(minSd * minSd * 0.64, (1.0 - wEmp) * priorVar + wEmp * input.sampleVariance);
    }
    sdEff = Math.sqrt(effVar);
    const isInt = Math.abs(targetLine - Math.round(targetLine)) < 1e-9;
    if (isInt) {
      const thr = Math.round(targetLine);
      const pOv = 1.0 - normalCdf((thr + 0.5 - muAdj) / sdEff);
      const pUn = normalCdf((thr - 0.5 - muAdj) / sdEff);
      pPush = Math.max(0.0, 1.0 - pOv - pUn);
      pCal = toUnitProbability(pOv / Math.max(pOv + pUn, 1e-9));
    } else {
      pPush = 0.0;
      pCal = toUnitProbability(1.0 - normalCdf((targetLine - muAdj) / sdEff));
    }
  }

  const pUnder = toUnitProbability(1.0 - pCal);
  return Object.freeze({
    sport: input.sport,
    role,
    metric: input.metric,
    distributionFamily: spec.family,
    line: targetLine,
    muAdjusted: muAdj,
    sdEffective: sdEff,
    pOverCalibrated: pCal,
    pUnderCalibrated: pUnder,
    pPush,
    fairOverDecimal: roundFairDecimalV6(pCal),
    fairUnderDecimal: roundFairDecimalV6(pUnder),
  });
}

export interface UsPlayerProfilePropsInputV6 {
  readonly sport: UsPropsSportV6;
  readonly positionLabel?: string | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly seasonMetrics: readonly RawPlayerStatColumnV6[];
  readonly recentGames: readonly { readonly stats?: readonly RawPlayerStatColumnV6[] }[];
  readonly oppFactor?: number;
  readonly artifact: Pick<PropsV6ModelArtifact, "us_props_v6">;
}

export function evaluateUsPlayerProfilePropsV6(
  input: UsPlayerProfilePropsInputV6,
): readonly UsPlayerPropOutlookV6[] {
  if (isHardBlockedAvailabilityV6(input.availability, input.injuryStatus)) {
    return Object.freeze([]);
  }

  const smMap = normalizeUsPlayerGameLogColumnsV6({
    sport: input.sport,
    columns: input.seasonMetrics,
    availability: input.availability,
    injuryStatus: input.injuryStatus,
    enforceMinutesGuard: false,
  }).metrics;

  const rgVals = new Map<string, number[]>();
  for (const g of input.recentGames) {
    const gMap = normalizeUsPlayerGameLogColumnsV6({
      sport: input.sport,
      columns: g.stats ?? [],
      availability: input.availability,
      injuryStatus: input.injuryStatus,
      enforceMinutesGuard: false,
    }).metrics;
    for (const [mk, mv] of Object.entries(gMap)) {
      let arr = rgVals.get(mk);
      if (!arr) {
        arr = [];
        rgVals.set(mk, arr);
      }
      arr.push(mv);
    }
  }

  let prematchMin: number | null = null;
  if (input.sport === "nba") {
    const rgMin = rgVals.get("MIN");
    if (rgMin && rgMin.length > 0) {
      prematchMin = rgMin.reduce((a, b) => a + b, 0.0) / rgMin.length;
    } else if (smMap["MIN"] !== undefined) {
      prematchMin = smMap["MIN"];
    }
    if (prematchMin !== null && prematchMin < 18.0) {
      return Object.freeze([]);
    }
  } else if (input.sport === "nhl") {
    const rgToi = rgVals.get("TOI");
    if (rgToi && rgToi.length > 0) {
      prematchMin = rgToi.reduce((a, b) => a + b, 0.0) / rgToi.length;
    }
  }

  const role = resolveUsRoleV6(input.sport, input.positionLabel);
  const roleSpecs = input.artifact.us_props_v6[input.sport].roles[role] ?? {};
  const seasonGp = smMap["GP"] ?? input.recentGames.length;

  const outlooks: UsPlayerPropOutlookV6[] = [];
  for (const mk of Object.keys(roleSpecs)) {
    const vals = rgVals.get(mk) ?? [];
    let sVar: number | null = null;
    if (vals.length >= 3) {
      const meanV = vals.reduce((a, b) => a + b, 0.0) / vals.length;
      sVar = vals.reduce((acc, v) => acc + (v - meanV) * (v - meanV), 0.0) / (vals.length - 1);
    }

    let sSum: number;
    let sGames: number;
    const smVal = smMap[mk];
    if (smVal !== undefined && seasonGp >= 1.0) {
      if (input.sport === "nba" && (mk === "PTS" || mk === "REB" || mk === "AST" || mk === "3PM")) {
        sSum = smVal * seasonGp;
        sGames = seasonGp;
      } else {
        sSum = smVal;
        sGames = Math.max(seasonGp, vals.length, 1.0);
      }
    } else if (vals.length >= 1) {
      sSum = vals.reduce((a, b) => a + b, 0.0);
      sGames = vals.length;
    } else {
      continue;
    }

    const proj = projectUsPlayerPropV6({
      sport: input.sport,
      positionLabel: input.positionLabel,
      metric: mk,
      sampleSum: sSum,
      sampleGames: sGames,
      line: null,
      prematchMinutes: prematchMin,
      sampleVariance: sVar,
      oppFactor: input.oppFactor ?? 1.0,
      availability: input.availability,
      injuryStatus: input.injuryStatus,
      artifact: input.artifact,
    });
    if (proj !== null) {
      outlooks.push(proj);
    }
  }

  return Object.freeze(outlooks);
}
