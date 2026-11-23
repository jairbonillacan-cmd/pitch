/**
 * PitchLab Meridian v2.0 (`EXP_V33_intl_soccer`) — Motor de inferencia pura para Selecciones Nacionales
 * (con retrocompatibilidad íntegra para `PitchLab Meridian v1.0`).
 *
 * Características e invariantes (`MASTER.md` §0 y `CONTRACT_OUTLOOK.md`):
 *  1. Reutiliza sin modificar `src/domain/prediction/engine.ts` (`assertValidModel`, `predictWithFallback`)
 *     y `src/domain/prediction/outlook.ts` (`buildMatchOutlook`), manteniendo intactos todos los hashes
 *     SHA-256 congelados de `v3.1` y `v3.2`.
 *  2. Cero sesgo entrenamiento-inferencia (`49 / 49` features base en `v2.0` y `38 / 38` en `v1.0` = `100%`
 *     cobertura en vivo desde `intl_soccer_causal_state_v2.json`, `dataQuality.flag === "ok"`).
 *  3. Paridad IEEE-754 `< 1e-12` frente a `intl_geography.py`, `intl_causal_features.py`,
 *     `intl_free_data_v2.py` y `run_ablation_v2.py`.
 *  4. Puente causal Club -> Selección (`computeSquadClubAdjustment`) sujeto a `CONTRACT_XI_PUBLISHED`:
 *     exige `tsPublishedUtc <= tsDecisionUtc - 2.0 min < matchDateUtc`; en ausencia de timestamp auditable
 *     opera con multiplicador exacto `1.0` (cero ruido sintético).
 *  5. Salida pública `MatchOutlook` completa (`11` mercados + `topScorelines[3]` + `fairOdds`), cero campos
 *     de `stake`, `kelly`, `ev` o `tier`, y `market: null` en ausencia de cuota real fresca.
 */

import defaultGbmIntlV35Json from "../data/gbm_intl_soccer_v3_5_candidate.json";
import defaultIntlCalibrationV1Json from "../data/intl_outlook_calibration_v1.json";
import defaultIntlCalibrationJson from "../data/intl_outlook_calibration_v2.json";
import defaultIntlCalibrationV3Json from "../data/intl_outlook_calibration_v3.json";
import defaultIntlCausalStateV1Json from "../data/intl_soccer_causal_state.json";
import defaultIntlCausalStateJson from "../data/intl_soccer_causal_state_v2.json";
import defaultIntlCausalStateV3Json from "../data/intl_soccer_causal_state_v3.json";
import defaultIntlGoalsV35Json from "../data/model_intl_goals_v3_5_candidate.json";
import defaultIntlModelV1Json from "../data/model_intl_soccer_v1.json";
import defaultIntlModelJson from "../data/model_intl_soccer_v2.json";
import defaultIntlModelV3Json from "../data/model_intl_soccer_v3.json";

import {
  assertValidModel,
  GLOBAL_HDA_RATES,
  predictWithFallback,
} from "./engine";
import { evaluateCompactValidationRow, type GbmArtifact } from "./gbm";
import {
  predictHorizonTotalGoals,
  solveCoherentDixonColes3Param,
  solveDixonColes2ParamFrom1X2,
  type CoherentDixonColes3ParamResult,
  type HorizonGoalsModelArtifact,
} from "./horizon_goals";
import { buildDixonColesScoreMatrix, DEFAULT_MAX_GOALS } from "./markets_2way";
import { clamp, logit, sigmoid } from "./math";
import type { OddsSnapshotRow } from "./odds";
import {
  buildMatchOutlook,
  type MatchOutlook,
  type OutlookCalibrationArtifact,
  type OutlookMarketQuoteInput,
} from "./outlook";
import type { ModelArtifact, Prediction, SnapshotRow } from "./types";

export const MERIDIAN_MODEL_CODENAME = "PitchLab Meridian v2.0" as const;
export const MERIDIAN_V1_MODEL_CODENAME = "PitchLab Meridian v1.0" as const;
export const MERIDIAN_V3_MODEL_CODENAME = "PitchLab Meridian v3.0" as const;
export const EARTH_RADIUS_KM = 6371.0088;

export const INTL_DIV_LEVELS = Object.freeze([
  "INTL_CONT",
  "INTL_FRIENDLY",
  "INTL_NAT",
  "INTL_QUAL",
  "INTL_REG",
  "INTL_WC",
] as const);

export type IntlTournamentRegime = (typeof INTL_DIV_LEVELS)[number];

export type ConfederationCode = "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";

export const INTL_BASE_38_FEATURES = Object.freeze([
  "elo_diff_eff",
  "elo_diff_raw",
  "elo_prob_h_nodraw",
  "elo_closeness",
  "abs_elo_mismatch",
  "pi_home",
  "pi_away",
  "pi_diff",
  "pi_exp_gd",
  "att_strength_home",
  "def_strength_home",
  "att_strength_away",
  "def_strength_away",
  "dc_lam_home",
  "dc_lam_away",
  "dc_exp_total",
  "dc_exp_diff",
  "dc_prob_h",
  "dc_prob_d",
  "dc_logit_h",
  "dc_logit_d",
  "ewm_pts_res_diff_270d",
  "ewm_gd_res_diff_270d",
  "h_pts_r8",
  "a_pts_r8",
  "sos_elo_diff_r8",
  "comp_share_diff_r8",
  "draw_rate_sum_r10",
  "goal_env_sum_r10",
  "rest_diff_clamped",
  "window_match2_diff",
  "log_travel_km_diff",
  "inter_confed_flag",
  "effective_hfa",
  "is_neutral_pure",
  "altitude_diff_m",
  "surface_pressure_diff",
  "fed_club_elo_diff",
] as const);

export const INTL_V2_EXTRA_11_FEATURES = Object.freeze([
  "npg_elo_diff",
  "ewm_npgd_res_diff_270d",
  "ewm_lead_share_diff_270d",
  "unique_scorers_r10_diff",
  "tm_log_top23_val_diff",
  "tm_top5_share_diff",
  "tm_depth_ratio_diff",
  "tm_val_vs_elo_gap_diff",
  "tm_pool_cov_min",
  "fifa_sum_diff",
  "thermal_climate_adv",
] as const);

export const INTL_V2_49_FEATURES = Object.freeze([
  ...INTL_BASE_38_FEATURES,
  ...INTL_V2_EXTRA_11_FEATURES,
] as const);

export const INTL_V3_EXTRA_4_FEATURES = Object.freeze([
  "tm_elite_cup_90s_diff",
  "tm_match_fit_share_diff",
  "wb_log10_pop_diff",
  "wb_log10_gdp_pc_diff",
] as const);

export const INTL_V3_53_FEATURES = Object.freeze([
  ...INTL_V2_49_FEATURES,
  ...INTL_V3_EXTRA_4_FEATURES,
] as const);

export const ELO_HFA_POINTS = 58.0;
export const PI_C = 3.0;
export const EWM_HALF_LIFE_DAYS = 270.0;

export const REGIME_BASE_GOAL_MU: Readonly<Record<IntlTournamentRegime, number>> = Object.freeze({
  INTL_WC: 1.28,
  INTL_CONT: 1.24,
  INTL_QUAL: 1.38,
  INTL_NAT: 1.32,
  INTL_REG: 1.34,
  INTL_FRIENDLY: 1.31,
});

export const REGIME_DC_RHO: Readonly<Record<IntlTournamentRegime, number>> = Object.freeze({
  INTL_WC: -0.11,
  INTL_CONT: -0.12,
  INTL_QUAL: -0.09,
  INTL_NAT: -0.10,
  INTL_REG: -0.10,
  INTL_FRIENDLY: -0.07,
});

export interface SquadBridgeConfig {
  readonly min_delay_minutes: number;
  readonly starter_weight: number;
  readonly bench_weight: number;
  readonly minutes_cap_30d: number;
  readonly chemistry_max_elo_bonus: number;
  readonly elo_to_log_lambda_scale: number;
  readonly max_abs_log_lambda_shift: number;
}

export const DEFAULT_SQUAD_CLUB_BRIDGE_CONFIG: SquadBridgeConfig = Object.freeze({
  min_delay_minutes: 2.0,
  starter_weight: 1.5,
  bench_weight: 0.5,
  minutes_cap_30d: 360.0,
  chemistry_max_elo_bonus: 28.0,
  elo_to_log_lambda_scale: 0.34,
  max_abs_log_lambda_shift: 0.22,
});

export interface IntlFederationCausalState {
  readonly code: string;
  readonly confed: ConfederationCode | string;
  readonly elo: number;
  readonly pi_home: number;
  readonly pi_away: number;
  readonly att: number;
  readonly dfn: number;
  readonly ewm_pts_res: number;
  readonly ewm_gd_res: number;
  readonly last_date_iso: string | null;
  readonly last_lat: number;
  readonly last_lon: number;
  readonly base_lat: number;
  readonly base_lon: number;
  readonly base_elev_m: number;
  readonly fed_club_elo: number;
  readonly matches_played: number;
  readonly pts_r8_mean: number;
  readonly opp_elo_r8_mean: number;
  readonly comp_r8_mean: number;
  readonly draw_r10_mean: number;
  readonly tot_goals_r10_mean: number;
  readonly npg_elo?: number;
  readonly fifa_sum_pts?: number;
  readonly ewm_npgd_res?: number;
  readonly ewm_lead_res?: number;
  readonly unique_scorers_r10_mean?: number;
  readonly tm_log_top23_eur_m?: number;
  readonly tm_top5_share?: number;
  readonly tm_depth_ratio?: number;
  readonly tm_val_vs_elo_gap?: number;
  readonly tm_has_pool?: number;
  readonly tm_active_log_90s?: number;
  readonly tm_elite_cup_log_90s?: number;
  readonly tm_club_ga_per90?: number;
  readonly tm_match_fit_share?: number;
  readonly wb_log10_pop?: number;
  readonly wb_log10_gdp_pc?: number;
}

export interface IntlCausalStateArtifact {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly max_observed_match_date: string;
  readonly weights_trained_strictly_before: string;
  readonly n_federations: number;
  readonly n_features_base?: number;
  readonly regime_dc_rho?: Readonly<Record<string, number>>;
  readonly regime_base_goal_mu?: Readonly<Record<string, number>>;
  readonly teams: Readonly<Record<string, IntlFederationCausalState>>;
}

export interface SquadPlayerClubEntry {
  readonly playerId?: string;
  readonly clubElo: number;
  readonly recentClubMinutes30d?: number;
  readonly isStarter?: boolean;
  readonly clubCode?: string;
}

export interface IntlSquadCallupContext {
  readonly tsPublishedUtc: string;
  readonly homePlayers: readonly SquadPlayerClubEntry[];
  readonly awayPlayers: readonly SquadPlayerClubEntry[];
  readonly homeBaselineClubElo?: number | null;
  readonly awayBaselineClubElo?: number | null;
}

export interface SquadClubAdjustmentResult {
  readonly applied: boolean;
  readonly reason: string;
  readonly home_effective_club_elo: number;
  readonly away_effective_club_elo: number;
  readonly net_elo_delta: number;
  readonly log_lambda_shift: number;
  readonly lam_home_multiplier: number;
  readonly lam_away_multiplier: number;
}

export interface IntlVenueInput {
  readonly city?: string | null;
  readonly country?: string | null;
  readonly isNeutral?: boolean | null;
  readonly lat?: number | null;
  readonly lon?: number | null;
  readonly elevationM?: number | null;
}

export interface ResolvedIntlVenuePhysics {
  readonly venue_lat: number;
  readonly venue_lon: number;
  readonly venue_elev_m: number;
  readonly venue_pressure_hpa: number;
  readonly effective_hfa: number;
  readonly is_neutral_pure: number;
  readonly altitude_diff_m: number;
  readonly surface_pressure_diff: number;
  readonly altitude_shock_flag: number;
}

export interface SynthesizedIntlMatchRow {
  readonly homeCode: string;
  readonly awayCode: string;
  readonly regime: IntlTournamentRegime;
  readonly matchDateIso: string;
  readonly row: SnapshotRow;
  readonly onlineLamHome: number;
  readonly onlineLamAway: number;
  readonly rho: number;
  readonly venuePhysics: ResolvedIntlVenuePhysics;
  readonly homeState: IntlFederationCausalState;
  readonly awayState: IntlFederationCausalState;
}

export interface PredictIntlMatchInput {
  readonly matchId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly tournament: string;
  readonly matchDateUtc: string;
  readonly tsDecisionUtc: string;
  readonly venue?: IntlVenueInput | null;
  readonly squadContext?: IntlSquadCallupContext | null;
  readonly marketQuotes?: readonly OutlookMarketQuoteInput[];
  readonly oddsSnapshots?: readonly OddsSnapshotRow[];
  readonly maxQuoteAgeMinutes?: number;
}

export interface IntlEngineArtifacts {
  readonly model?: ModelArtifact;
  readonly causalState?: IntlCausalStateArtifact;
  readonly calibration?: OutlookCalibrationArtifact;
  readonly squadBridgeConfig?: SquadBridgeConfig;
}

// ---------------------------------------------------------------------------
// Primitivas matemáticas exactas (espejo 1:1 de `intl_geography.py` / `intl_causal_features.py`)
// ---------------------------------------------------------------------------

const LOG_FACT_10: readonly number[] = Object.freeze([
  0.0,
  0.0,
  Math.log(2),
  Math.log(6),
  Math.log(24),
  Math.log(120),
  Math.log(720),
  Math.log(5040),
  Math.log(40320),
  Math.log(362880),
  Math.log(3628800),
]);

export function isaPressureHpa(elevM: number): number {
  const e = clamp(elevM, -50.0, 5500.0);
  return 1013.25 * Math.pow(1.0 - 2.25577e-5 * e, 5.25588);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180.0;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dphi = (lat2 - lat1) * toRad;
  const dlon = (lon2 - lon1) * toRad;
  const sinDphi = Math.sin(0.5 * dphi);
  const sinDlon = Math.sin(0.5 * dlon);
  const a = clamp(sinDphi * sinDphi + Math.cos(phi1) * Math.cos(phi2) * sinDlon * sinDlon, 0.0, 1.0);
  return 2.0 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function slugifyIntlName(raw: string): string {
  const ascii = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const STRICT_FINITE_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!STRICT_FINITE_NUMBER_RE.test(trimmed)) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateIsoToUtcDayNumber(dateIso: string): number {
  const s = String(dateIso).trim().slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) {
    throw new Error(`Fecha ISO inválida en intl_soccer: ${dateIso}`);
  }
  const y = parseFiniteNumber(parts[0]);
  const m = parseFiniteNumber(parts[1]);
  const d = parseFiniteNumber(parts[2]);
  if (
    y === null ||
    m === null ||
    d === null ||
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d)
  ) {
    throw new Error(`Fecha ISO inválida en intl_soccer: ${dateIso}`);
  }
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function piExpectedGd(rating: number): number {
  if (rating === 0.0) return 0.0;
  const mag = Math.pow(10.0, Math.abs(rating) / PI_C) - 1.0;
  return rating > 0.0 ? mag : -mag;
}

export function dixonColes1X2Exact(
  lamH: number,
  lamA: number,
  rho: number,
): { readonly pHome: number; readonly pDraw: number; readonly pAway: number } {
  const lh = clamp(lamH, 0.05, 10.0);
  const la = clamp(lamA, 0.05, 10.0);
  const r = clamp(rho, -0.99, 0.99);

  const pmfH = new Array<number>(11);
  const pmfA = new Array<number>(11);
  const logLh = Math.log(lh);
  const logLa = Math.log(la);
  for (let k = 0; k <= 10; k += 1) {
    const lf = LOG_FACT_10[k]!;
    pmfH[k] = Math.exp(k * logLh - lh - lf);
    pmfA[k] = Math.exp(k * logLa - la - lf);
  }

  let sum = 0.0;
  const mat: number[][] = new Array(11);
  for (let h = 0; h <= 10; h += 1) {
    const row = new Array<number>(11);
    const ph = pmfH[h]!;
    for (let a = 0; a <= 10; a += 1) {
      let cell = ph * pmfA[a]!;
      if (h === 0 && a === 0) cell *= Math.max(0.0, 1.0 - lh * la * r);
      else if (h === 1 && a === 0) cell *= Math.max(0.0, 1.0 + la * r);
      else if (h === 0 && a === 1) cell *= Math.max(0.0, 1.0 + lh * r);
      else if (h === 1 && a === 1) cell *= Math.max(0.0, 1.0 - r);
      row[a] = cell;
      sum += cell;
    }
    mat[h] = row;
  }

  if (sum <= 0.0 || !Number.isFinite(sum)) {
    return { pHome: 0.44, pDraw: 0.26, pAway: 0.30 };
  }

  let pH = 0.0;
  let pD = 0.0;
  let pA = 0.0;
  for (let h = 0; h <= 10; h += 1) {
    const row = mat[h]!;
    for (let a = 0; a <= 10; a += 1) {
      const p = row[a]! / sum;
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
  }
  const tot = pH + pD + pA;
  return { pHome: pH / tot, pDraw: pD / tot, pAway: pA / tot };
}

export function computeOnlineIntlLambdas(params: {
  readonly regime: IntlTournamentRegime;
  readonly eloDiffEff: number;
  readonly effHfa: number;
  readonly netAltitudeAdvM: number;
  readonly attH: number;
  readonly defH: number;
  readonly attA: number;
  readonly defA: number;
}): { readonly lamHome: number; readonly lamAway: number; readonly rho: number } {
  const muBase = REGIME_BASE_GOAL_MU[params.regime] ?? 1.31;
  const rho = REGIME_DC_RHO[params.regime] ?? -0.09;
  const eloScaled = params.eloDiffEff / 400.0;
  const posMismatch = Math.pow(Math.max(0.0, eloScaled), 1.3);
  const negMismatch = Math.pow(Math.max(0.0, -eloScaled), 1.3);
  const altTerm = 0.045 * (params.netAltitudeAdvM / 1000.0);

  const logLh =
    Math.log(muBase) +
    0.5 * (params.attH + params.defA) +
    0.44 * eloScaled +
    0.075 * params.effHfa +
    altTerm +
    0.055 * posMismatch;
  const logLa =
    Math.log(muBase) +
    0.5 * (params.attA + params.defH) -
    0.44 * eloScaled -
    0.075 * params.effHfa -
    altTerm +
    0.055 * negMismatch;

  return {
    lamHome: clamp(Math.exp(clamp(logLh, -2.6, 2.1)), 0.08, 7.5),
    lamAway: clamp(Math.exp(clamp(logLa, -2.6, 2.1)), 0.08, 7.5),
    rho,
  };
}

// ---------------------------------------------------------------------------
// Catálogo de alias, federaciones y sedes (idéntico a `intl_geography.py`)
// ---------------------------------------------------------------------------

interface FederationStaticEntry {
  readonly confed: ConfederationCode;
  readonly lat: number;
  readonly lon: number;
  readonly elevM: number;
  readonly name: string;
}

const CONFED_BASE_ELO: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 1575.0,
  CONMEBOL: 1615.0,
  CONCACAF: 1440.0,
  CAF: 1465.0,
  AFC: 1425.0,
  OFC: 1320.0,
});

const CONFED_DEFAULT_CLUB_ELO: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 1510.0,
  CONMEBOL: 1520.0,
  CONCACAF: 1410.0,
  CAF: 1425.0,
  AFC: 1400.0,
  OFC: 1310.0,
});

const CONFED_PRIOR_LOG_TOP23_EUR_M: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 3.85,
  CONMEBOL: 4.35,
  CONCACAF: 2.1,
  CAF: 2.75,
  AFC: 2.05,
  OFC: 0.85,
});

const CONFED_PRIOR_TOP5_SHARE: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 0.24,
  CONMEBOL: 0.3,
  CONCACAF: 0.07,
  CAF: 0.18,
  AFC: 0.06,
  OFC: 0.02,
});

const CONFED_PRIOR_LOG10_POP: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 7.05,
  CONMEBOL: 7.45,
  CONCACAF: 6.85,
  CAF: 7.3,
  AFC: 7.5,
  OFC: 5.8,
});

const CONFED_PRIOR_LOG10_GDP_PC: Readonly<Record<ConfederationCode, number>> = Object.freeze({
  UEFA: 4.42,
  CONMEBOL: 3.92,
  CONCACAF: 3.95,
  CAF: 3.32,
  AFC: 3.85,
  OFC: 3.7,
});

export function computeThermalClimateMismatch(params: {
  readonly homeBaseLat: number;
  readonly awayBaseLat: number;
  readonly venueLat: number;
  readonly venueElevM: number;
  readonly matchMonth: number;
}): number {
  const seasonalPhase = Math.cos((2.0 * Math.PI * (params.matchMonth - 7.0)) / 12.0);
  const estAmbientTempC = (latDeg: number, elevM: number): number => {
    const absLat = Math.min(70.0, Math.abs(latDeg));
    const tMeanSl = 28.0 - 0.36 * absLat;
    const hemiSign = latDeg >= 0.0 ? 1.0 : -1.0;
    const amp = 0.22 * absLat;
    const tSl = tMeanSl + hemiSign * amp * seasonalPhase;
    return tSl - 0.0065 * Math.max(0.0, elevM);
  };

  const tVenue = estAmbientTempC(params.venueLat, params.venueElevM);
  const tHomeHab = estAmbientTempC(params.homeBaseLat, 150.0);
  const tAwayHab = estAmbientTempC(params.awayBaseLat, 150.0);

  if (tVenue > 24.0) {
    const stressAway = Math.max(0.0, tVenue - Math.max(20.0, tAwayHab));
    const stressHome = Math.max(0.0, tVenue - Math.max(20.0, tHomeHab));
    return clamp((stressAway - stressHome) / 8.0, -1.5, 1.5);
  }
  if (tVenue < 6.0) {
    const stressAway = Math.max(0.0, Math.min(12.0, tAwayHab) - tVenue);
    const stressHome = Math.max(0.0, Math.min(12.0, tHomeHab) - tVenue);
    return clamp((stressAway - stressHome) / 10.0, -1.5, 1.5);
  }
  return 0.0;
}

const FEDERATION_STATIC_FALLBACK: Readonly<Record<string, FederationStaticEntry>> = Object.freeze({
  ARG: { confed: "CONMEBOL", lat: -34.5453, lon: -58.4498, elevM: 25.0, name: "Argentina" },
  BOL: { confed: "CONMEBOL", lat: -16.4955, lon: -68.1336, elevM: 3640.0, name: "Bolivia" },
  BRA: { confed: "CONMEBOL", lat: -23.5453, lon: -46.4742, elevM: 760.0, name: "Brazil" },
  CHI: { confed: "CONMEBOL", lat: -33.4645, lon: -70.6106, elevM: 570.0, name: "Chile" },
  COL: { confed: "CONMEBOL", lat: 10.9231, lon: -74.8069, elevM: 18.0, name: "Colombia" },
  ECU: { confed: "CONMEBOL", lat: -0.1774, lon: -78.4766, elevM: 2850.0, name: "Ecuador" },
  PAR: { confed: "CONMEBOL", lat: -25.2923, lon: -57.6574, elevM: 43.0, name: "Paraguay" },
  PER: { confed: "CONMEBOL", lat: -12.0673, lon: -77.0337, elevM: 154.0, name: "Peru" },
  URU: { confed: "CONMEBOL", lat: -34.8945, lon: -56.1528, elevM: 43.0, name: "Uruguay" },
  VEN: { confed: "CONMEBOL", lat: 9.7456, lon: -63.1832, elevM: 65.0, name: "Venezuela" },
  MEX: { confed: "CONCACAF", lat: 19.3029, lon: -99.1505, elevM: 2240.0, name: "Mexico" },
  USA: { confed: "CONCACAF", lat: 39.9689, lon: -83.0171, elevM: 240.0, name: "United States" },
  CAN: { confed: "CONCACAF", lat: 43.6332, lon: -79.4186, elevM: 76.0, name: "Canada" },
  CRC: { confed: "CONCACAF", lat: 9.9366, lon: -84.1077, elevM: 1172.0, name: "Costa Rica" },
  PAN: { confed: "CONCACAF", lat: 9.0336, lon: -79.4694, elevM: 30.0, name: "Panama" },
  JAM: { confed: "CONCACAF", lat: 18.0019, lon: -76.772, elevM: 45.0, name: "Jamaica" },
  HON: { confed: "CONCACAF", lat: 15.4922, lon: -88.0195, elevM: 83.0, name: "Honduras" },
  SLV: { confed: "CONCACAF", lat: 13.6929, lon: -89.2182, elevM: 658.0, name: "El Salvador" },
  GTM: { confed: "CONCACAF", lat: 14.6258, lon: -90.5106, elevM: 1500.0, name: "Guatemala" },
  ENG: { confed: "UEFA", lat: 51.556, lon: -0.2795, elevM: 35.0, name: "England" },
  FRA: { confed: "UEFA", lat: 48.9245, lon: 2.3602, elevM: 38.0, name: "France" },
  ESP: { confed: "UEFA", lat: 40.4168, lon: -3.7038, elevM: 657.0, name: "Spain" },
  GER: { confed: "UEFA", lat: 52.5147, lon: 13.2395, elevM: 55.0, name: "Germany" },
  ITA: { confed: "UEFA", lat: 41.9341, lon: 12.4547, elevM: 21.0, name: "Italy" },
  POR: { confed: "UEFA", lat: 38.7527, lon: -9.1847, elevM: 70.0, name: "Portugal" },
  NED: { confed: "UEFA", lat: 52.3144, lon: 4.9419, elevM: 2.0, name: "Netherlands" },
  BEL: { confed: "UEFA", lat: 50.8957, lon: 4.3341, elevM: 60.0, name: "Belgium" },
  CRO: { confed: "UEFA", lat: 45.8186, lon: 16.0181, elevM: 122.0, name: "Croatia" },
  SUI: { confed: "UEFA", lat: 46.9631, lon: 7.4648, elevM: 540.0, name: "Switzerland" },
  DEN: { confed: "UEFA", lat: 55.7028, lon: 12.5722, elevM: 14.0, name: "Denmark" },
  MAR: { confed: "CAF", lat: 33.9598, lon: -6.8891, elevM: 75.0, name: "Morocco" },
  SEN: { confed: "CAF", lat: 14.7336, lon: -17.2005, elevM: 25.0, name: "Senegal" },
  EGY: { confed: "CAF", lat: 30.0691, lon: 31.3123, elevM: 40.0, name: "Egypt" },
  NGA: { confed: "CAF", lat: 9.0378, lon: 7.4533, elevM: 460.0, name: "Nigeria" },
  RSA: { confed: "CAF", lat: -26.2349, lon: 27.9826, elevM: 1753.0, name: "South Africa" },
  JPN: { confed: "AFC", lat: 35.8869, lon: 139.7175, elevM: 25.0, name: "Japan" },
  KOR: { confed: "AFC", lat: 37.5683, lon: 126.8972, elevM: 38.0, name: "South Korea" },
  IRN: { confed: "AFC", lat: 35.7244, lon: 51.2756, elevM: 1190.0, name: "Iran" },
  AUS: { confed: "AFC", lat: -33.8471, lon: 151.0634, elevM: 15.0, name: "Australia" },
  KSA: { confed: "AFC", lat: 24.7878, lon: 46.8392, elevM: 612.0, name: "Saudi Arabia" },
  QAT: { confed: "AFC", lat: 25.2636, lon: 51.4483, elevM: 15.0, name: "Qatar" },
  NZL: { confed: "OFC", lat: -36.8749, lon: 174.7447, elevM: 25.0, name: "New Zealand" },
});

const TEAM_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  argentina: "ARG",
  bolivia: "BOL",
  brazil: "BRA",
  brasil: "BRA",
  chile: "CHI",
  chl: "CHI",
  colombia: "COL",
  ecuador: "ECU",
  paraguay: "PAR",
  pry: "PAR",
  peru: "PER",
  uruguay: "URU",
  ury: "URU",
  venezuela: "VEN",
  mexico: "MEX",
  "united states": "USA",
  "estados unidos": "USA",
  "ee uu": "USA",
  usmnt: "USA",
  canada: "CAN",
  "costa rica": "CRC",
  cri: "CRC",
  panama: "PAN",
  jamaica: "JAM",
  honduras: "HON",
  hnd: "HON",
  "el salvador": "SLV",
  esa: "SLV",
  guatemala: "GTM",
  gua: "GTM",
  haiti: "HTI",
  curacao: "CUW",
  curazao: "CUW",
  "trinidad and tobago": "TRI",
  "trinidad y tobago": "TRI",
  england: "ENG",
  inglaterra: "ENG",
  france: "FRA",
  francia: "FRA",
  spain: "ESP",
  espana: "ESP",
  germany: "GER",
  alemania: "GER",
  deu: "GER",
  "west germany": "GER",
  italy: "ITA",
  italia: "ITA",
  portugal: "POR",
  netherlands: "NED",
  "paises bajos": "NED",
  holanda: "NED",
  holland: "NED",
  nld: "NED",
  belgium: "BEL",
  belgica: "BEL",
  croatia: "CRO",
  croacia: "CRO",
  hrv: "CRO",
  switzerland: "SUI",
  suiza: "SUI",
  che: "SUI",
  denmark: "DEN",
  dinamarca: "DEN",
  dnk: "DEN",
  austria: "AUT",
  poland: "POL",
  polonia: "POL",
  sweden: "SWE",
  suecia: "SWE",
  ukraine: "UKR",
  ucrania: "UKR",
  serbia: "SRB",
  yugoslavia: "SRB",
  turkey: "TUR",
  turquia: "TUR",
  turkiye: "TUR",
  czechia: "CZE",
  "czech republic": "CZE",
  chequia: "CZE",
  hungary: "HUN",
  hungria: "HUN",
  scotland: "SCO",
  escocia: "SCO",
  wales: "WAL",
  gales: "WAL",
  norway: "NOR",
  noruega: "NOR",
  romania: "ROU",
  rumania: "ROU",
  slovakia: "SVK",
  eslovaquia: "SVK",
  greece: "GRE",
  grecia: "GRE",
  grc: "GRE",
  slovenia: "SVN",
  eslovenia: "SVN",
  "republic of ireland": "IRL",
  irlanda: "IRL",
  russia: "RUS",
  morocco: "MAR",
  marruecos: "MAR",
  senegal: "SEN",
  egypt: "EGY",
  egipto: "EGY",
  "ivory coast": "CIV",
  "cote d ivoire": "CIV",
  "costa de marfil": "CIV",
  nigeria: "NGA",
  tunisia: "TUN",
  tunez: "TUN",
  algeria: "ALG",
  argelia: "ALG",
  dza: "ALG",
  cameroon: "CMR",
  camerun: "CMR",
  "south africa": "RSA",
  sudafrica: "RSA",
  zaf: "RSA",
  ghana: "GHA",
  "dr congo": "COD",
  "rd congo": "COD",
  mali: "MLI",
  japan: "JPN",
  japon: "JPN",
  "south korea": "KOR",
  "korea republic": "KOR",
  "corea del sur": "KOR",
  iran: "IRN",
  "ir iran": "IRN",
  australia: "AUS",
  qatar: "QAT",
  "saudi arabia": "KSA",
  "arabia saudita": "KSA",
  sau: "KSA",
  uzbekistan: "UZB",
  iraq: "IRQ",
  "china pr": "CHN",
  china: "CHN",
  "new zealand": "NZL",
  "nueva zelanda": "NZL",
});

interface CityVenueOverride {
  readonly lat: number;
  readonly lon: number;
  readonly elevM: number;
  readonly country: string;
  readonly diasporaCodes: readonly string[];
}

const CITY_VENUE_OVERRIDES: Readonly<Record<string, CityVenueOverride>> = Object.freeze({
  "el alto": { lat: -16.5047, lon: -68.1633, elevM: 4150.0, country: "BOL", diasporaCodes: [] },
  "la paz": { lat: -16.4955, lon: -68.1336, elevM: 3640.0, country: "BOL", diasporaCodes: [] },
  cochabamba: { lat: -17.3895, lon: -66.1568, elevM: 2558.0, country: "BOL", diasporaCodes: [] },
  sucre: { lat: -19.0196, lon: -65.2619, elevM: 2810.0, country: "BOL", diasporaCodes: [] },
  "santa cruz": { lat: -17.7833, lon: -63.1821, elevM: 416.0, country: "BOL", diasporaCodes: [] },
  quito: { lat: -0.1774, lon: -78.4766, elevM: 2850.0, country: "ECU", diasporaCodes: [] },
  guayaquil: { lat: -2.1894, lon: -79.8891, elevM: 4.0, country: "ECU", diasporaCodes: [] },
  cuenca: { lat: -2.9001, lon: -79.0059, elevM: 2560.0, country: "ECU", diasporaCodes: [] },
  bogota: { lat: 4.6459, lon: -74.0775, elevM: 2640.0, country: "COL", diasporaCodes: [] },
  barranquilla: { lat: 10.9231, lon: -74.8069, elevM: 18.0, country: "COL", diasporaCodes: [] },
  medellin: { lat: 6.2569, lon: -75.5902, elevM: 1495.0, country: "COL", diasporaCodes: [] },
  cali: { lat: 3.4299, lon: -76.5446, elevM: 1018.0, country: "COL", diasporaCodes: [] },
  cusco: { lat: -13.532, lon: -71.9675, elevM: 3399.0, country: "PER", diasporaCodes: [] },
  arequipa: { lat: -16.409, lon: -71.5375, elevM: 2335.0, country: "PER", diasporaCodes: [] },
  lima: { lat: -12.0673, lon: -77.0337, elevM: 154.0, country: "PER", diasporaCodes: [] },
  "buenos aires": { lat: -34.5453, lon: -58.4498, elevM: 25.0, country: "ARG", diasporaCodes: [] },
  cordoba: { lat: -31.369, lon: -64.2462, elevM: 415.0, country: "ARG", diasporaCodes: [] },
  mendoza: { lat: -32.8895, lon: -68.88, elevM: 765.0, country: "ARG", diasporaCodes: [] },
  "santiago del estero": { lat: -27.7664, lon: -64.2736, elevM: 182.0, country: "ARG", diasporaCodes: [] },
  montevideo: { lat: -34.8945, lon: -56.1528, elevM: 43.0, country: "URU", diasporaCodes: [] },
  asuncion: { lat: -25.2923, lon: -57.6574, elevM: 43.0, country: "PAR", diasporaCodes: [] },
  santiago: { lat: -33.4645, lon: -70.6106, elevM: 570.0, country: "CHI", diasporaCodes: [] },
  "sao paulo": { lat: -23.5453, lon: -46.4742, elevM: 760.0, country: "BRA", diasporaCodes: [] },
  "rio de janeiro": { lat: -22.9121, lon: -43.2302, elevM: 12.0, country: "BRA", diasporaCodes: [] },
  "belo horizonte": { lat: -19.8659, lon: -43.9711, elevM: 850.0, country: "BRA", diasporaCodes: [] },
  brasilia: { lat: -15.7835, lon: -47.8992, elevM: 1172.0, country: "BRA", diasporaCodes: [] },
  curitiba: { lat: -25.4483, lon: -49.2769, elevM: 935.0, country: "BRA", diasporaCodes: [] },
  salvador: { lat: -12.9788, lon: -38.5044, elevM: 25.0, country: "BRA", diasporaCodes: [] },
  maturin: { lat: 9.7456, lon: -63.1832, elevM: 65.0, country: "VEN", diasporaCodes: [] },
  caracas: { lat: 10.491, lon: -66.8906, elevM: 900.0, country: "VEN", diasporaCodes: [] },
  merida: { lat: 8.5586, lon: -71.2156, elevM: 1630.0, country: "VEN", diasporaCodes: [] },
  "mexico city": { lat: 19.3029, lon: -99.1505, elevM: 2240.0, country: "MEX", diasporaCodes: [] },
  "ciudad de mexico": { lat: 19.3029, lon: -99.1505, elevM: 2240.0, country: "MEX", diasporaCodes: [] },
  toluca: { lat: 19.2869, lon: -99.6672, elevM: 2660.0, country: "MEX", diasporaCodes: [] },
  puebla: { lat: 19.0772, lon: -98.1644, elevM: 2135.0, country: "MEX", diasporaCodes: [] },
  guadalajara: { lat: 20.6819, lon: -103.4628, elevM: 1566.0, country: "MEX", diasporaCodes: [] },
  zapopan: { lat: 20.6819, lon: -103.4628, elevM: 1566.0, country: "MEX", diasporaCodes: [] },
  monterrey: { lat: 25.6691, lon: -100.2444, elevM: 540.0, country: "MEX", diasporaCodes: [] },
  guadalupe: { lat: 25.6691, lon: -100.2444, elevM: 540.0, country: "MEX", diasporaCodes: [] },
  torreon: { lat: 25.6053, lon: -103.405, elevM: 1120.0, country: "MEX", diasporaCodes: [] },
  queretaro: { lat: 20.5778, lon: -100.3664, elevM: 1820.0, country: "MEX", diasporaCodes: [] },
  "san jose": { lat: 9.9366, lon: -84.1077, elevM: 1172.0, country: "CRC", diasporaCodes: [] },
  "san pedro sula": { lat: 15.4922, lon: -88.0195, elevM: 83.0, country: "HON", diasporaCodes: [] },
  tegucigalpa: { lat: 14.0978, lon: -87.2044, elevM: 990.0, country: "HON", diasporaCodes: [] },
  "guatemala city": { lat: 14.6258, lon: -90.5106, elevM: 1500.0, country: "GTM", diasporaCodes: [] },
  "san salvador": { lat: 13.6929, lon: -89.2182, elevM: 658.0, country: "SLV", diasporaCodes: [] },
  arlington: { lat: 32.7473, lon: -97.0945, elevM: 184.0, country: "USA", diasporaCodes: ["MEX", "SLV", "HON"] },
  dallas: { lat: 32.7791, lon: -96.7603, elevM: 131.0, country: "USA", diasporaCodes: ["MEX", "SLV", "HON"] },
  frisco: { lat: 33.1544, lon: -96.8353, elevM: 200.0, country: "USA", diasporaCodes: ["MEX"] },
  houston: { lat: 29.6847, lon: -95.4107, elevM: 15.0, country: "USA", diasporaCodes: ["MEX", "HON", "SLV", "COL"] },
  "san antonio": { lat: 29.4169, lon: -98.4789, elevM: 198.0, country: "USA", diasporaCodes: ["MEX"] },
  austin: { lat: 30.3877, lon: -97.7198, elevM: 165.0, country: "USA", diasporaCodes: ["MEX"] },
  pasadena: { lat: 34.1613, lon: -118.1676, elevM: 263.0, country: "USA", diasporaCodes: ["MEX", "SLV", "GTM"] },
  "los angeles": { lat: 34.0141, lon: -118.2879, elevM: 55.0, country: "USA", diasporaCodes: ["MEX", "SLV", "GTM"] },
  inglewood: { lat: 33.9535, lon: -118.339, elevM: 40.0, country: "USA", diasporaCodes: ["MEX", "SLV", "GTM"] },
  carson: { lat: 33.8644, lon: -118.2611, elevM: 20.0, country: "USA", diasporaCodes: ["MEX"] },
  "san diego": { lat: 32.7844, lon: -117.1228, elevM: 20.0, country: "USA", diasporaCodes: ["MEX"] },
  "santa clara": { lat: 37.4033, lon: -121.9694, elevM: 14.0, country: "USA", diasporaCodes: ["MEX"] },
  glendale: { lat: 33.5276, lon: -112.2626, elevM: 348.0, country: "USA", diasporaCodes: ["MEX"] },
  phoenix: { lat: 33.4455, lon: -112.0667, elevM: 331.0, country: "USA", diasporaCodes: ["MEX"] },
  "las vegas": { lat: 36.0909, lon: -115.1833, elevM: 610.0, country: "USA", diasporaCodes: ["MEX"] },
  paradise: { lat: 36.0909, lon: -115.1833, elevM: 610.0, country: "USA", diasporaCodes: ["MEX"] },
  chicago: { lat: 41.8623, lon: -87.6167, elevM: 180.0, country: "USA", diasporaCodes: ["MEX", "POL"] },
  denver: { lat: 39.7439, lon: -105.0201, elevM: 1609.0, country: "USA", diasporaCodes: ["MEX"] },
  "commerce city": { lat: 39.8056, lon: -104.8919, elevM: 1575.0, country: "USA", diasporaCodes: ["MEX"] },
  charlotte: { lat: 35.2258, lon: -80.8528, elevM: 229.0, country: "USA", diasporaCodes: ["MEX", "COL"] },
  atlanta: { lat: 33.7553, lon: -84.4006, elevM: 320.0, country: "USA", diasporaCodes: ["MEX", "COL"] },
  miami: { lat: 25.958, lon: -80.2389, elevM: 3.0, country: "USA", diasporaCodes: ["COL", "ARG", "VEN", "PER", "BRA"] },
  "miami gardens": { lat: 25.958, lon: -80.2389, elevM: 3.0, country: "USA", diasporaCodes: ["COL", "ARG", "VEN", "PER", "BRA"] },
  "fort lauderdale": { lat: 26.1931, lon: -80.1611, elevM: 3.0, country: "USA", diasporaCodes: ["COL", "ARG", "VEN"] },
  orlando: { lat: 28.5392, lon: -81.4028, elevM: 30.0, country: "USA", diasporaCodes: ["COL", "BRA", "PUR"] },
  "east rutherford": { lat: 40.8128, lon: -74.0742, elevM: 3.0, country: "USA", diasporaCodes: ["COL", "ECU", "ARG", "MEX", "ITA"] },
  harrison: { lat: 40.7369, lon: -74.1503, elevM: 8.0, country: "USA", diasporaCodes: ["COL", "ECU"] },
  philadelphia: { lat: 39.9008, lon: -75.1675, elevM: 12.0, country: "USA", diasporaCodes: ["MEX", "COL"] },
  "kansas city": { lat: 39.0489, lon: -94.4839, elevM: 260.0, country: "USA", diasporaCodes: [] },
  seattle: { lat: 47.5952, lon: -122.3316, elevM: 5.0, country: "USA", diasporaCodes: [] },
  foxborough: { lat: 42.0909, lon: -71.2643, elevM: 80.0, country: "USA", diasporaCodes: ["BRA", "POR"] },
  toronto: { lat: 43.6332, lon: -79.4186, elevM: 76.0, country: "CAN", diasporaCodes: [] },
  vancouver: { lat: 49.2768, lon: -123.112, elevM: 10.0, country: "CAN", diasporaCodes: [] },
  edmonton: { lat: 53.5597, lon: -113.4761, elevM: 671.0, country: "CAN", diasporaCodes: [] },
  london: { lat: 51.556, lon: -0.2795, elevM: 35.0, country: "ENG", diasporaCodes: [] },
  paris: { lat: 48.8414, lon: 2.253, elevM: 35.0, country: "FRA", diasporaCodes: ["MAR", "ALG", "POR"] },
  "saint denis": { lat: 48.9245, lon: 2.3602, elevM: 38.0, country: "FRA", diasporaCodes: ["MAR", "ALG", "POR"] },
  berlin: { lat: 52.5147, lon: 13.2395, elevM: 55.0, country: "GER", diasporaCodes: ["TUR"] },
  munich: { lat: 48.2188, lon: 11.6247, elevM: 519.0, country: "GER", diasporaCodes: ["TUR", "CRO"] },
  dortmund: { lat: 51.4926, lon: 7.4519, elevM: 86.0, country: "GER", diasporaCodes: ["TUR"] },
  madrid: { lat: 40.4531, lon: -3.6883, elevM: 688.0, country: "ESP", diasporaCodes: ["COL", "ECU", "MAR", "ARG"] },
  seville: { lat: 37.4172, lon: -6.0044, elevM: 12.0, country: "ESP", diasporaCodes: [] },
  barcelona: { lat: 41.3809, lon: 2.1228, elevM: 45.0, country: "ESP", diasporaCodes: ["MAR", "ARG"] },
  johannesburg: { lat: -26.2349, lon: 27.9826, elevM: 1753.0, country: "RSA", diasporaCodes: [] },
  pretoria: { lat: -25.7533, lon: 28.2231, elevM: 1339.0, country: "RSA", diasporaCodes: [] },
  "cape town": { lat: -33.9036, lon: 18.4111, elevM: 15.0, country: "RSA", diasporaCodes: [] },
  durban: { lat: -29.8289, lon: 31.0303, elevM: 10.0, country: "RSA", diasporaCodes: [] },
  nairobi: { lat: -1.2297, lon: 36.8906, elevM: 1795.0, country: "KEN", diasporaCodes: [] },
  "addis ababa": { lat: 9.0133, lon: 38.7567, elevM: 2355.0, country: "ETH", diasporaCodes: [] },
  doha: { lat: 25.2636, lon: 51.4483, elevM: 15.0, country: "QAT", diasporaCodes: [] },
  "al rayyan": { lat: 25.2636, lon: 51.4483, elevM: 25.0, country: "QAT", diasporaCodes: [] },
  lusail: { lat: 25.4208, lon: 51.4904, elevM: 10.0, country: "QAT", diasporaCodes: [] },
  riyadh: { lat: 24.7878, lon: 46.8392, elevM: 612.0, country: "KSA", diasporaCodes: [] },
  jeddah: { lat: 21.7625, lon: 39.1636, elevM: 15.0, country: "KSA", diasporaCodes: [] },
  tehran: { lat: 35.7244, lon: 51.2756, elevM: 1190.0, country: "IRN", diasporaCodes: [] },
  tokyo: { lat: 35.6779, lon: 139.7145, elevM: 30.0, country: "JPN", diasporaCodes: [] },
  saitama: { lat: 35.9031, lon: 139.7175, elevM: 20.0, country: "JPN", diasporaCodes: [] },
  seoul: { lat: 37.5683, lon: 126.8972, elevM: 38.0, country: "KOR", diasporaCodes: [] },
  sydney: { lat: -33.8471, lon: 151.0634, elevM: 15.0, country: "AUS", diasporaCodes: [] },
});

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModelArtifact(value: unknown): value is ModelArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.type === "string" &&
    typeof value.version === "string" &&
    typeof value.n_features_base === "number" &&
    Array.isArray(value.features) &&
    Array.isArray(value.div_levels) &&
    Array.isArray(value.coef) &&
    Array.isArray(value.intercept) &&
    Array.isArray(value.classes) &&
    isJsonRecord(value.imputer) &&
    isJsonRecord(value.scaler)
  );
}

function isIntlCausalStateArtifact(value: unknown): value is IntlCausalStateArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.n_federations === "number" &&
    isJsonRecord(value.teams)
  );
}

function isOutlookCalibrationArtifact(value: unknown): value is OutlookCalibrationArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.eval_split === "string" &&
    typeof value.holdout_cut_utc === "string" &&
    typeof value.holdout_sealed_untouched === "boolean" &&
    typeof value.bootstrap_samples === "number" &&
    typeof value.max_sharp_age_minutes === "number" &&
    isJsonRecord(value.segments)
  );
}

function isGbmArtifact(value: unknown): value is GbmArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    value.type === "hist_gradient_boosting_multiclass" &&
    typeof value.n_features_base === "number" &&
    Array.isArray(value.features) &&
    Array.isArray(value.div_levels) &&
    Array.isArray(value.trees)
  );
}

function isHorizonGoalsModelArtifact(value: unknown): value is HorizonGoalsModelArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    value.type === "poisson_log_link_3param_dc" &&
    typeof value.n_features_base === "number" &&
    Array.isArray(value.features) &&
    Array.isArray(value.div_levels) &&
    Array.isArray(value.coef) &&
    typeof value.intercept === "number"
  );
}

function parseModelArtifact(raw: unknown, label: string): ModelArtifact {
  if (!isModelArtifact(raw)) {
    throw new Error(`Invalid ModelArtifact JSON: ${label}`);
  }
  return raw;
}

function parseIntlCausalStateArtifact(raw: unknown, label: string): IntlCausalStateArtifact {
  if (!isIntlCausalStateArtifact(raw)) {
    throw new Error(`Invalid IntlCausalStateArtifact JSON: ${label}`);
  }
  return raw;
}

function parseOutlookCalibrationArtifact(raw: unknown, label: string): OutlookCalibrationArtifact {
  if (!isOutlookCalibrationArtifact(raw)) {
    throw new Error(`Invalid OutlookCalibrationArtifact JSON: ${label}`);
  }
  return raw;
}

function parseGbmArtifact(raw: unknown, label: string): GbmArtifact {
  if (!isGbmArtifact(raw)) {
    throw new Error(`Invalid GbmArtifact JSON: ${label}`);
  }
  return raw;
}

function parseHorizonGoalsModelArtifact(raw: unknown, label: string): HorizonGoalsModelArtifact {
  if (!isHorizonGoalsModelArtifact(raw)) {
    throw new Error(`Invalid HorizonGoalsModelArtifact JSON: ${label}`);
  }
  return raw;
}

const DEFAULT_INTL_MODEL_ARTIFACT = parseModelArtifact(
  defaultIntlModelJson,
  "model_intl_soccer_v2.json",
);
const DEFAULT_INTL_CAUSAL_STATE_ARTIFACT = parseIntlCausalStateArtifact(
  defaultIntlCausalStateJson,
  "intl_soccer_causal_state_v2.json",
);
const DEFAULT_INTL_CALIBRATION_ARTIFACT = parseOutlookCalibrationArtifact(
  defaultIntlCalibrationJson,
  "intl_outlook_calibration_v2.json",
);
const MERIDIAN_V1_MODEL_ARTIFACT = parseModelArtifact(
  defaultIntlModelV1Json,
  "model_intl_soccer_v1.json",
);
const MERIDIAN_V1_CAUSAL_STATE_ARTIFACT = parseIntlCausalStateArtifact(
  defaultIntlCausalStateV1Json,
  "intl_soccer_causal_state.json",
);
const MERIDIAN_V1_CALIBRATION_ARTIFACT = parseOutlookCalibrationArtifact(
  defaultIntlCalibrationV1Json,
  "intl_outlook_calibration_v1.json",
);
const MERIDIAN_V3_MODEL_ARTIFACT = parseModelArtifact(
  defaultIntlModelV3Json,
  "model_intl_soccer_v3.json",
);
const MERIDIAN_V3_CAUSAL_STATE_ARTIFACT = parseIntlCausalStateArtifact(
  defaultIntlCausalStateV3Json,
  "intl_soccer_causal_state_v3.json",
);
const MERIDIAN_V3_CALIBRATION_ARTIFACT = parseOutlookCalibrationArtifact(
  defaultIntlCalibrationV3Json,
  "intl_outlook_calibration_v3.json",
);
const DEFAULT_INTL_V35_GBM_ARTIFACT = parseGbmArtifact(
  defaultGbmIntlV35Json,
  "gbm_intl_soccer_v3_5_candidate.json",
);
const DEFAULT_INTL_HORIZON_GOALS_V35_ARTIFACT = parseHorizonGoalsModelArtifact(
  defaultIntlGoalsV35Json,
  "model_intl_goals_v3_5_candidate.json",
);

export function getDefaultIntlModelArtifact(): ModelArtifact {
  return DEFAULT_INTL_MODEL_ARTIFACT;
}

export function getDefaultIntlCausalStateArtifact(): IntlCausalStateArtifact {
  return DEFAULT_INTL_CAUSAL_STATE_ARTIFACT;
}

export function getDefaultIntlCalibrationArtifact(): OutlookCalibrationArtifact {
  return DEFAULT_INTL_CALIBRATION_ARTIFACT;
}

export function getMeridianV1ModelArtifact(): ModelArtifact {
  return MERIDIAN_V1_MODEL_ARTIFACT;
}

export function getMeridianV1CausalStateArtifact(): IntlCausalStateArtifact {
  return MERIDIAN_V1_CAUSAL_STATE_ARTIFACT;
}

export function getMeridianV1CalibrationArtifact(): OutlookCalibrationArtifact {
  return MERIDIAN_V1_CALIBRATION_ARTIFACT;
}

export function getMeridianV1Artifacts(): IntlEngineArtifacts {
  return Object.freeze({
    model: getMeridianV1ModelArtifact(),
    causalState: getMeridianV1CausalStateArtifact(),
    calibration: getMeridianV1CalibrationArtifact(),
  });
}

export function getMeridianV3ModelArtifact(): ModelArtifact {
  return MERIDIAN_V3_MODEL_ARTIFACT;
}

export function getMeridianV3CausalStateArtifact(): IntlCausalStateArtifact {
  return MERIDIAN_V3_CAUSAL_STATE_ARTIFACT;
}

export function getMeridianV3CalibrationArtifact(): OutlookCalibrationArtifact {
  return MERIDIAN_V3_CALIBRATION_ARTIFACT;
}

export function getMeridianV3Artifacts(): IntlEngineArtifacts {
  return Object.freeze({
    model: getMeridianV3ModelArtifact(),
    causalState: getMeridianV3CausalStateArtifact(),
    calibration: getMeridianV3CalibrationArtifact(),
  });
}

export function resolveNationalTeamCode(
  rawTeam: string,
  causalState?: IntlCausalStateArtifact,
): string {
  const slug = slugifyIntlName(rawTeam);
  if (slug.length === 0) return "UNK";

  const upper = slug.toUpperCase();
  if (causalState !== undefined && causalState.teams[upper] !== undefined) {
    return upper;
  }
  if (FEDERATION_STATIC_FALLBACK[upper] !== undefined) {
    return upper;
  }
  const alias = TEAM_ALIASES[slug];
  if (alias !== undefined) {
    return alias;
  }
  const token = String(rawTeam).replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (token.length >= 3) return token.slice(0, 3);
  return token.length > 0 ? token.padEnd(3, "X") : "UNK";
}

export function resolveIntlTournamentRegime(rawTournament: string): IntlTournamentRegime {
  const trimmedUpper = String(rawTournament ?? "").trim().toUpperCase();
  if ((INTL_DIV_LEVELS as readonly string[]).includes(trimmedUpper)) {
    return trimmedUpper as IntlTournamentRegime;
  }
  const s = slugifyIntlName(rawTournament);
  if (s.length === 0) return "INTL_FRIENDLY";
  if (
    s.includes("qualification") ||
    s.includes("qualifiers") ||
    s.includes("qualifier") ||
    s.includes("eliminatoria") ||
    s.includes("preliminary")
  ) {
    return "INTL_QUAL";
  }
  if (s.includes("nations league")) {
    return "INTL_NAT";
  }
  if (s === "fifa world cup" || s === "world cup" || s === "mundial" || s === "intl wc") {
    return "INTL_WC";
  }
  const contTokens = [
    "copa america",
    "uefa euro",
    "european championship",
    "african cup of nations",
    "africa cup of nations",
    "afcon",
    "afc asian cup",
    "asian cup",
    "gold cup",
    "concacaf championship",
    "oceania nations cup",
    "ofc nations cup",
    "confederations cup",
    "finalissima",
    "conmebol uefa cup of champions",
  ];
  for (const tok of contTokens) {
    if (s.includes(tok)) return "INTL_CONT";
  }
  const friendlyTokens = [
    "friendly",
    "amistoso",
    "kirin",
    "tournoi de france",
    "china cup",
    "fifa series",
    "king s cup",
    "kings cup",
    "cyprus tournament",
    "algarve",
    "four nations",
    "lunar new year",
    "merdeka",
  ];
  for (const tok of friendlyTokens) {
    if (s.includes(tok)) return "INTL_FRIENDLY";
  }
  return "INTL_REG";
}

function resolveStateForCode(
  code: string,
  causalState: IntlCausalStateArtifact,
): IntlFederationCausalState {
  const found = causalState.teams[code];
  if (found !== undefined) return found;
  const fallback = FEDERATION_STATIC_FALLBACK[code];
  const confed: ConfederationCode = fallback?.confed ?? "OFC";
  const baseElo = CONFED_BASE_ELO[confed];
  const priorLogVal = clamp(
    CONFED_PRIOR_LOG_TOP23_EUR_M[confed] + (baseElo - 1500.0) / 135.0,
    0.2,
    7.2,
  );
  return Object.freeze({
    code,
    confed,
    elo: baseElo,
    pi_home: 0.0,
    pi_away: 0.0,
    att: 0.0,
    dfn: 0.0,
    ewm_pts_res: 0.0,
    ewm_gd_res: 0.0,
    last_date_iso: null,
    last_lat: fallback?.lat ?? 0.0,
    last_lon: fallback?.lon ?? 0.0,
    base_lat: fallback?.lat ?? 0.0,
    base_lon: fallback?.lon ?? 0.0,
    base_elev_m: fallback?.elevM ?? 50.0,
    fed_club_elo: CONFED_DEFAULT_CLUB_ELO[confed],
    matches_played: 0,
    pts_r8_mean: 1.35,
    opp_elo_r8_mean: baseElo,
    comp_r8_mean: 0.65,
    draw_r10_mean: 0.24,
    tot_goals_r10_mean: 2.55,
    npg_elo: baseElo,
    fifa_sum_pts: baseElo,
    ewm_npgd_res: 0.0,
    ewm_lead_res: 0.0,
    unique_scorers_r10_mean: 1.15,
    tm_log_top23_eur_m: priorLogVal,
    tm_top5_share: CONFED_PRIOR_TOP5_SHARE[confed],
    tm_depth_ratio: 0.28,
    tm_val_vs_elo_gap: 0.0,
    tm_has_pool: 0.0,
  });
}

export function resolveIntlVenuePhysics(params: {
  readonly homeState: IntlFederationCausalState;
  readonly awayState: IntlFederationCausalState;
  readonly venue?: IntlVenueInput | null;
  readonly causalState?: IntlCausalStateArtifact;
}): ResolvedIntlVenuePhysics {
  const { homeState, awayState, venue, causalState } = params;
  const citySlug = slugifyIntlName(venue?.city ?? "");
  let countryCode =
    venue?.country && String(venue.country).trim().length > 0
      ? resolveNationalTeamCode(String(venue.country), causalState)
      : "";

  let vLat: number;
  let vLon: number;
  let vElev: number;
  let diasporaCodes: readonly string[] = [];

  const cityOverride = CITY_VENUE_OVERRIDES[citySlug];
  const isNeutralFlag = venue?.isNeutral ?? null;

  if (cityOverride !== undefined) {
    vLat = cityOverride.lat;
    vLon = cityOverride.lon;
    vElev = cityOverride.elevM;
    diasporaCodes = cityOverride.diasporaCodes;
    if (countryCode.length === 0 || countryCode === "UNK") {
      countryCode = cityOverride.country;
    }
  } else if (
    countryCode.length > 0 &&
    countryCode !== "UNK" &&
    (causalState?.teams[countryCode] !== undefined || FEDERATION_STATIC_FALLBACK[countryCode] !== undefined)
  ) {
    const cSt =
      causalState !== undefined
        ? resolveStateForCode(countryCode, causalState)
        : undefined;
    const fSt = FEDERATION_STATIC_FALLBACK[countryCode];
    vLat = cSt?.base_lat ?? fSt?.lat ?? 0.0;
    vLon = cSt?.base_lon ?? fSt?.lon ?? 0.0;
    vElev = cSt?.base_elev_m ?? fSt?.elevM ?? 50.0;
  } else if (isNeutralFlag === true) {
    vLat = 0.5 * (homeState.base_lat + awayState.base_lat);
    vLon = 0.5 * (homeState.base_lon + awayState.base_lon);
    vElev = 100.0;
  } else {
    vLat = homeState.base_lat;
    vLon = homeState.base_lon;
    vElev = homeState.base_elev_m;
    countryCode = homeState.code;
  }

  if (venue?.lat !== undefined && venue.lat !== null && Number.isFinite(venue.lat)) {
    vLat = venue.lat;
  }
  if (venue?.lon !== undefined && venue.lon !== null && Number.isFinite(venue.lon)) {
    vLon = venue.lon;
  }
  if (venue?.elevationM !== undefined && venue.elevationM !== null && Number.isFinite(venue.elevationM)) {
    vElev = venue.elevationM;
  }

  if (diasporaCodes.length === 0 && countryCode === "USA") {
    diasporaCodes = ["MEX"];
  }

  const hCode = homeState.code;
  const aCode = awayState.code;
  let effHfa: number;
  let neutralPure: number;

  if (countryCode === hCode && countryCode !== aCode && !(isNeutralFlag === true && countryCode !== hCode)) {
    effHfa = 1.0;
    neutralPure = 0.0;
  } else if (countryCode === aCode && countryCode !== hCode) {
    effHfa = -1.0;
    neutralPure = 0.0;
  } else if (isNeutralFlag === false && (countryCode.length === 0 || countryCode === hCode)) {
    effHfa = 1.0;
    neutralPure = 0.0;
  } else {
    const hDiasp = diasporaCodes.includes(hCode);
    const aDiasp = diasporaCodes.includes(aCode);
    if (hDiasp && !aDiasp) {
      effHfa = hCode === "MEX" ? 0.35 : 0.22;
      neutralPure = 0.0;
    } else if (aDiasp && !hDiasp) {
      effHfa = aCode === "MEX" ? -0.35 : -0.22;
      neutralPure = 0.0;
    } else {
      effHfa = 0.0;
      neutralPure = 1.0;
    }
  }

  const awayUnacclimatedM = Math.max(0.0, vElev - awayState.base_elev_m);
  const homeUnacclimatedM = Math.max(0.0, vElev - homeState.base_elev_m);
  const netAltitudeAdvM = awayUnacclimatedM - homeUnacclimatedM;

  const pVenue = isaPressureHpa(vElev);
  const awayPDrop = Math.max(0.0, isaPressureHpa(awayState.base_elev_m) - pVenue);
  const homePDrop = Math.max(0.0, isaPressureHpa(homeState.base_elev_m) - pVenue);
  const netPressureAdvHpa = awayPDrop - homePDrop;

  let shockFlag = 0.0;
  if (vElev >= 2000.0 && netAltitudeAdvM >= 1400.0) shockFlag = 1.0;
  else if (vElev >= 2000.0 && netAltitudeAdvM <= -1400.0) shockFlag = -1.0;

  return Object.freeze({
    venue_lat: vLat,
    venue_lon: vLon,
    venue_elev_m: vElev,
    venue_pressure_hpa: pVenue,
    effective_hfa: effHfa,
    is_neutral_pure: neutralPure,
    altitude_diff_m: netAltitudeAdvM,
    surface_pressure_diff: netPressureAdvHpa,
    altitude_shock_flag: shockFlag,
  });
}

/**
 * Sintetiza de forma determinista el vector causal pre-partido (`SnapshotRow` de `49` features base en `v2.0`
 * o `38` features base en `v1.0` + `6` one-hots) con paridad `< 1e-12` frente a Python.
 */
export function synthesizeIntlMatchSnapshotRow(params: {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly tournament: string;
  readonly matchDateUtc: string;
  readonly venue?: IntlVenueInput | null;
  readonly causalState?: IntlCausalStateArtifact;
  readonly nFeaturesBase?: 38 | 49 | 53;
}): SynthesizedIntlMatchRow {
  const stateArtifact = params.causalState ?? getDefaultIntlCausalStateArtifact();
  const hCode = resolveNationalTeamCode(params.homeTeam, stateArtifact);
  const aCode = resolveNationalTeamCode(params.awayTeam, stateArtifact);
  if (hCode === aCode) {
    throw new Error(`homeTeam y awayTeam resuelven a la misma selección (${hCode})`);
  }

  const regime = resolveIntlTournamentRegime(params.tournament);
  const stH = resolveStateForCode(hCode, stateArtifact);
  const stA = resolveStateForCode(aCode, stateArtifact);
  const matchDateIso = String(params.matchDateUtc).trim().slice(0, 10);
  const curDay = dateIsoToUtcDayNumber(matchDateIso);

  const venuePhysics = resolveIntlVenuePhysics({
    homeState: stH,
    awayState: stA,
    venue: params.venue,
    causalState: stateArtifact,
  });

  const effHfa = venuePhysics.effective_hfa;
  const isNeutralPure = venuePhysics.is_neutral_pure;
  const altDiffM = venuePhysics.altitude_diff_m;
  const surfPDiff = venuePhysics.surface_pressure_diff;
  const vLat = venuePhysics.venue_lat;
  const vLon = venuePhysics.venue_lon;

  const eloH = stH.elo;
  const eloA = stA.elo;
  const eloDiffRaw = eloH - eloA;
  const eloDiffEff = eloDiffRaw + ELO_HFA_POINTS * effHfa;
  const eloProbHNodraw = 1.0 / (1.0 + Math.pow(10.0, -eloDiffEff / 400.0));
  const eloCloseness = Math.exp(-Math.abs(eloDiffEff) / 220.0);
  const absEloMismatch = Math.abs(eloDiffEff) / 400.0;

  const wHomeCtx = 0.5 * (1.0 + effHfa);
  const piH = wHomeCtx * stH.pi_home + (1.0 - wHomeCtx) * stH.pi_away;
  const piA = (1.0 - wHomeCtx) * stA.pi_home + wHomeCtx * stA.pi_away;
  const piDiff = piH - piA;
  const piExpGdDiff = piExpectedGd(piH) - piExpectedGd(piA);

  const onlineDc = computeOnlineIntlLambdas({
    regime,
    eloDiffEff,
    effHfa,
    netAltitudeAdvM: altDiffM,
    attH: stH.att,
    defH: stH.dfn,
    attA: stA.att,
    defA: stA.dfn,
  });

  const dcExpTotal = onlineDc.lamHome + onlineDc.lamAway;
  const dcExpDiff = onlineDc.lamHome - onlineDc.lamAway;
  const dc1x2 = dixonColes1X2Exact(onlineDc.lamHome, onlineDc.lamAway, onlineDc.rho);
  const dcLogitH = logit(dc1x2.pHome, 1e-4);
  const dcLogitD = logit(dc1x2.pDraw, 1e-4);

  const resolveRestAndDecay = (st: IntlFederationCausalState) => {
    if (st.last_date_iso !== null && st.last_date_iso.trim().length >= 10) {
      const rawDays = Math.max(1.0, curDay - dateIsoToUtcDayNumber(st.last_date_iso));
      const decay = Math.pow(0.5, rawDays / EWM_HALF_LIFE_DAYS);
      const win2 = rawDays >= 2.0 && rawDays <= 6.0 ? 1.0 : 0.0;
      const origLat = rawDays <= 10.0 ? st.last_lat : st.base_lat;
      const origLon = rawDays <= 10.0 ? st.last_lon : st.base_lon;
      const travelKm = haversineKm(origLat, origLon, vLat, vLon);
      return {
        restClamped: clamp(rawDays, 2.0, 30.0),
        decay,
        win2,
        travelKm,
      };
    }
    return {
      restClamped: 30.0,
      decay: 0.0,
      win2: 0.0,
      travelKm: haversineKm(st.base_lat, st.base_lon, vLat, vLon),
    };
  };

  const rH = resolveRestAndDecay(stH);
  const rA = resolveRestAndDecay(stA);

  const ewmPtsResDiff = stH.ewm_pts_res * rH.decay - stA.ewm_pts_res * rA.decay;
  const ewmGdResDiff = stH.ewm_gd_res * rH.decay - stA.ewm_gd_res * rA.decay;

  const hPtsR8 = stH.pts_r8_mean;
  const aPtsR8 = stA.pts_r8_mean;
  const sosEloDiffR8 = (stH.opp_elo_r8_mean - stA.opp_elo_r8_mean) / 100.0;
  const compShareDiffR8 = stH.comp_r8_mean - stA.comp_r8_mean;
  const drawRateSumR10 = stH.draw_r10_mean + stA.draw_r10_mean;
  const goalEnvSumR10 = stH.tot_goals_r10_mean + stA.tot_goals_r10_mean;

  const restDiffClamped = rH.restClamped - rA.restClamped;
  const windowMatch2Diff = rH.win2 - rA.win2;
  const logTravelKmDiff = Math.log1p(Math.max(0.0, rA.travelKm)) - Math.log1p(Math.max(0.0, rH.travelKm));
  const interConfedFlag = stH.confed !== stA.confed ? 1.0 : 0.0;
  const fedClubEloDiff = (stH.fed_club_elo - stA.fed_club_elo) / 100.0;

  const base38: number[] = [
    eloDiffEff,
    eloDiffRaw,
    eloProbHNodraw,
    eloCloseness,
    absEloMismatch,
    piH,
    piA,
    piDiff,
    piExpGdDiff,
    stH.att,
    stH.dfn,
    stA.att,
    stA.dfn,
    onlineDc.lamHome,
    onlineDc.lamAway,
    dcExpTotal,
    dcExpDiff,
    dc1x2.pHome,
    dc1x2.pDraw,
    dcLogitH,
    dcLogitD,
    ewmPtsResDiff,
    ewmGdResDiff,
    hPtsR8,
    aPtsR8,
    sosEloDiffR8,
    compShareDiffR8,
    drawRateSumR10,
    goalEnvSumR10,
    restDiffClamped,
    windowMatch2Diff,
    logTravelKmDiff,
    interConfedFlag,
    effHfa,
    isNeutralPure,
    altDiffM,
    surfPDiff,
    fedClubEloDiff,
  ];

  const targetBaseLen =
    params.nFeaturesBase ??
    (stateArtifact.n_features_base === 53
      ? 53
      : stateArtifact.n_features_base === 49 || stH.npg_elo !== undefined
        ? 49
        : 38);

  if (targetBaseLen >= 49) {
    const npgEloH = stH.npg_elo ?? eloH;
    const npgEloA = stA.npg_elo ?? eloA;
    const npgEloDiff = npgEloH - npgEloA + ELO_HFA_POINTS * effHfa;
    const ewmNpgdResDiff = (stH.ewm_npgd_res ?? 0.0) * rH.decay - (stA.ewm_npgd_res ?? 0.0) * rA.decay;
    const ewmLeadShareDiff = (stH.ewm_lead_res ?? 0.0) * rH.decay - (stA.ewm_lead_res ?? 0.0) * rA.decay;
    const uniqueScorersDiff =
      (stH.unique_scorers_r10_mean ?? 1.15) - (stA.unique_scorers_r10_mean ?? 1.15);

    const confH = (stH.confed in CONFED_PRIOR_LOG_TOP23_EUR_M ? stH.confed : "OFC") as ConfederationCode;
    const confA = (stA.confed in CONFED_PRIOR_LOG_TOP23_EUR_M ? stA.confed : "OFC") as ConfederationCode;
    const defaultLogValH = clamp(CONFED_PRIOR_LOG_TOP23_EUR_M[confH] + (eloH - 1500.0) / 135.0, 0.2, 7.2);
    const defaultLogValA = clamp(CONFED_PRIOR_LOG_TOP23_EUR_M[confA] + (eloA - 1500.0) / 135.0, 0.2, 7.2);

    const tmLogValDiff =
      (stH.tm_log_top23_eur_m ?? defaultLogValH) - (stA.tm_log_top23_eur_m ?? defaultLogValA);
    const tmTop5Diff =
      (stH.tm_top5_share ?? CONFED_PRIOR_TOP5_SHARE[confH]) -
      (stA.tm_top5_share ?? CONFED_PRIOR_TOP5_SHARE[confA]);
    const tmDepthDiff = (stH.tm_depth_ratio ?? 0.28) - (stA.tm_depth_ratio ?? 0.28);
    const tmGapDiff = (stH.tm_val_vs_elo_gap ?? 0.0) - (stA.tm_val_vs_elo_gap ?? 0.0);
    const tmPoolCovMin = Math.min(stH.tm_has_pool ?? 0.0, stA.tm_has_pool ?? 0.0);

    const fifaSumDiff = ((stH.fifa_sum_pts ?? eloH) - (stA.fifa_sum_pts ?? eloA)) / 100.0;
    const matchMonth = parseFiniteNumber(matchDateIso.slice(5, 7)) ?? Number.NaN;
    const thermalClimateAdv = computeThermalClimateMismatch({
      homeBaseLat: stH.base_lat,
      awayBaseLat: stA.base_lat,
      venueLat: venuePhysics.venue_lat,
      venueElevM: venuePhysics.venue_elev_m,
      matchMonth,
    });

    base38.push(
      npgEloDiff,
      ewmNpgdResDiff,
      ewmLeadShareDiff,
      uniqueScorersDiff,
      tmLogValDiff,
      tmTop5Diff,
      tmDepthDiff,
      tmGapDiff,
      tmPoolCovMin,
      fifaSumDiff,
      thermalClimateAdv,
    );

    if (targetBaseLen === 53) {
      const tmEliteCupDiff =
        (stH.tm_elite_cup_log_90s ?? 0.0) - (stA.tm_elite_cup_log_90s ?? 0.0);
      const tmMatchFitDiff =
        (stH.tm_match_fit_share ?? 0.38 + (eloH - 1500.0) / 650.0) -
        (stA.tm_match_fit_share ?? 0.38 + (eloA - 1500.0) / 650.0);
      const wbPopDiff =
        (stH.wb_log10_pop ?? CONFED_PRIOR_LOG10_POP[confH]) -
        (stA.wb_log10_pop ?? CONFED_PRIOR_LOG10_POP[confA]);
      const wbGdpPcDiff =
        (stH.wb_log10_gdp_pc ?? CONFED_PRIOR_LOG10_GDP_PC[confH]) -
        (stA.wb_log10_gdp_pc ?? CONFED_PRIOR_LOG10_GDP_PC[confA]);

      base38.push(tmEliteCupDiff, tmMatchFitDiff, wbPopDiff, wbGdpPcDiff);
    }
  }

  const features: readonly number[] = Object.freeze(base38);

  const divOnehot: readonly number[] = Object.freeze(
    INTL_DIV_LEVELS.map((lvl) => (lvl === regime ? 1 : 0)),
  );

  const row: SnapshotRow = Object.freeze({
    div: regime,
    season: matchDateIso.slice(0, 4),
    match_date: matchDateIso,
    features,
    div_onehot: divOnehot,
  });

  return Object.freeze({
    homeCode: hCode,
    awayCode: aCode,
    regime,
    matchDateIso,
    row,
    onlineLamHome: onlineDc.lamHome,
    onlineLamAway: onlineDc.lamAway,
    rho: onlineDc.rho,
    venuePhysics,
    homeState: stH,
    awayState: stA,
  });
}

function parseUtcEpochSeconds(tsIso: string | null | undefined): number | null {
  if (typeof tsIso !== "string" || tsIso.trim().length === 0) return null;
  const ms = Date.parse(tsIso.trim());
  if (!Number.isFinite(ms)) return null;
  return ms / 1000.0;
}

/**
 * Calcula el ajuste táctico causal Club -> Selección cuando existe convocatoria o XI titular confirmado
 * (`tsPublishedUtc <= tsDecisionUtc - 2.0 min < kickoffUtc`). Paridad `< 1e-15` con Python.
 */
export function computeSquadClubAdjustment(params: {
  readonly squadContext?: IntlSquadCallupContext | null;
  readonly tsDecisionUtc: string;
  readonly kickoffUtc?: string | null;
  readonly homeBaselineClubElo: number;
  readonly awayBaselineClubElo: number;
  readonly config?: SquadBridgeConfig;
}): SquadClubAdjustmentResult {
  const cfg = params.config ?? DEFAULT_SQUAD_CLUB_BRIDGE_CONFIG;
  const baseH = params.homeBaselineClubElo;
  const baseA = params.awayBaselineClubElo;

  const makeNeutral = (reason: string): SquadClubAdjustmentResult =>
    Object.freeze({
      applied: false,
      reason,
      home_effective_club_elo: baseH,
      away_effective_club_elo: baseA,
      net_elo_delta: 0.0,
      log_lambda_shift: 0.0,
      lam_home_multiplier: 1.0,
      lam_away_multiplier: 1.0,
    });

  const ctx = params.squadContext;
  if (ctx === undefined || ctx === null) {
    return makeNeutral("missing_or_non_causal_timestamp");
  }

  const tsPub = parseUtcEpochSeconds(ctx.tsPublishedUtc);
  const tsDec = parseUtcEpochSeconds(params.tsDecisionUtc);
  if (tsPub === null || tsDec === null) {
    return makeNeutral("missing_or_non_causal_timestamp");
  }

  const minDelaySec = cfg.min_delay_minutes * 60.0;
  if (tsPub > tsDec - minDelaySec + 1e-6) {
    return makeNeutral("published_after_decision_cutoff");
  }

  if (params.kickoffUtc !== undefined && params.kickoffUtc !== null && params.kickoffUtc.trim().length > 0) {
    const tsKo = parseUtcEpochSeconds(params.kickoffUtc);
    if (tsKo !== null && (tsDec > tsKo + 1e-6 || tsPub > tsKo + 1e-6)) {
      return makeNeutral("post_kickoff_timestamp");
    }
  }

  if (ctx.homePlayers.length === 0 || ctx.awayPlayers.length === 0) {
    return makeNeutral("empty_squad_list");
  }

  const resolvedBaseH = ctx.homeBaselineClubElo ?? baseH;
  const resolvedBaseA = ctx.awayBaselineClubElo ?? baseA;

  const scoreSquad = (players: readonly SquadPlayerClubEntry[], fallbackElo: number): number => {
    let wSum = 0.0;
    let eloAcc = 0.0;
    const starterClubs: string[] = [];

    for (const p of players) {
      const cElo = Number.isFinite(p.clubElo) ? p.clubElo : fallbackElo;
      const mins = clamp(p.recentClubMinutes30d ?? 180.0, 0.0, cfg.minutes_cap_30d);
      const isStarter = p.isStarter ?? true;
      const roleW = isStarter ? cfg.starter_weight : cfg.bench_weight;
      const minFactor = 0.35 + 0.65 * (mins / cfg.minutes_cap_30d);
      const w = roleW * minFactor;
      wSum += w;
      eloAcc += w * cElo;
      const cc = (p.clubCode ?? "").trim().toUpperCase();
      if (isStarter && cc.length > 0) {
        starterClubs.push(cc);
      }
    }

    const meanElo = wSum > 1e-9 ? eloAcc / wSum : fallbackElo;
    const nC = starterClubs.length;
    let chemBonus = 0.0;
    if (nC >= 2) {
      let samePairs = 0;
      const totalPairs = Math.floor((nC * (nC - 1)) / 2);
      for (let i = 0; i < nC; i += 1) {
        for (let j = i + 1; j < nC; j += 1) {
          if (starterClubs[i] === starterClubs[j]) {
            samePairs += 1;
          }
        }
      }
      chemBonus = cfg.chemistry_max_elo_bonus * Math.min(1.0, (samePairs / Math.max(1, totalPairs)) * 4.0);
    }
    return meanElo + chemBonus;
  };

  const effH = scoreSquad(ctx.homePlayers, resolvedBaseH);
  const effA = scoreSquad(ctx.awayPlayers, resolvedBaseA);
  const netEloDelta = (effH - resolvedBaseH) - (effA - resolvedBaseA);

  const rawShift = (netEloDelta / 400.0) * cfg.elo_to_log_lambda_scale;
  const maxShift = cfg.max_abs_log_lambda_shift;
  const logShift = maxShift > 0 ? maxShift * Math.tanh(rawShift / maxShift) : 0.0;

  return Object.freeze({
    applied: true,
    reason: "ok",
    home_effective_club_elo: effH,
    away_effective_club_elo: effA,
    net_elo_delta: netEloDelta,
    log_lambda_shift: logShift,
    lam_home_multiplier: Math.exp(0.5 * logShift),
    lam_away_multiplier: Math.exp(-0.5 * logShift),
  });
}

function fitDcLambdasFrom1X2ForBridge(
  target: { readonly pHome: number; readonly pDraw: number; readonly pAway: number },
  rho: number,
  maxGoals: number = DEFAULT_MAX_GOALS,
): { readonly lamHome: number; readonly lamAway: number } {
  const sum = target.pHome + target.pDraw + target.pAway;
  const pH = clamp(target.pHome / sum, 0.02, 0.96);
  const pD = clamp(target.pDraw / sum, 0.02, 0.9);
  const pA = clamp(1.0 - pH - pD, 0.02, 0.96);

  const shareInit = clamp(pH / (pH + pA), 0.08, 0.92);
  let u = logit(shareInit, 1e-4);
  let v = Math.log(2.55);

  const targetDiff = pH - pA;
  const targetDraw = pD;

  const evalRes = (uVal: number, vVal: number): readonly [number, number] => {
    const tot = clamp(Math.exp(vVal), 0.25, 8.0);
    const sh = clamp(sigmoid(uVal), 0.04, 0.96);
    const lh = clamp(tot * sh, 0.05, 10.0);
    const la = clamp(tot * (1.0 - sh), 0.05, 10.0);
    const mat = buildDixonColesScoreMatrix(lh, la, rho, maxGoals);
    let curH = 0.0;
    let curD = 0.0;
    let curA = 0.0;
    for (let h = 0; h < mat.length; h += 1) {
      const r = mat[h]!;
      for (let a = 0; a < r.length; a += 1) {
        const p = r[a]!;
        if (h > a) curH += p;
        else if (h === a) curD += p;
        else curA += p;
      }
    }
    const s = curH + curD + curA;
    return [curH / s - curA / s - targetDiff, curD / s - targetDraw];
  };

  const hStep = 1e-4;
  for (let iter = 0; iter < 24; iter += 1) {
    const [f1, f2] = evalRes(u, v);
    const norm0 = f1 * f1 + f2 * f2;
    if (norm0 < 1e-20) break;
    const [f1u, f2u] = evalRes(u + hStep, v);
    const [f1v, f2v] = evalRes(u, v + hStep);
    const j11 = (f1u - f1) / hStep;
    const j21 = (f2u - f2) / hStep;
    const j12 = (f1v - f1) / hStep;
    const j22 = (f2v - f2) / hStep;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break;
    const du = -(j22 * f1 - j12 * f2) / det;
    const dv = -(-j21 * f1 + j11 * f2) / det;
    let step = 1.0;
    let improved = false;
    for (let ls = 0; ls < 8; ls += 1) {
      const uTry = clamp(u + step * du, -3.2, 3.2);
      const vTry = clamp(v + step * dv, Math.log(0.25), Math.log(8.0));
      const [r1, r2] = evalRes(uTry, vTry);
      if (r1 * r1 + r2 * r2 < norm0) {
        u = uTry;
        v = vTry;
        improved = true;
        break;
      }
      step *= 0.5;
    }
    if (!improved) break;
  }

  const finalTotal = clamp(Math.exp(v), 0.25, 8.0);
  const finalShare = clamp(sigmoid(u), 0.04, 0.96);
  return {
    lamHome: clamp(finalTotal * finalShare, 0.05, 10.0),
    lamAway: clamp(finalTotal * (1.0 - finalShare), 0.05, 10.0),
  };
}

/**
 * Ejecuta la inferencia 1X2 pura de `PitchLab Meridian v1.0` delegando en `engine.ts::predictWithFallback`.
 */
export function predictIntlSoccer1X2(
  row: SnapshotRow,
  model: ModelArtifact = getDefaultIntlModelArtifact(),
): Prediction {
  assertValidModel(model);
  return predictWithFallback(row, model, null, GLOBAL_HDA_RATES, {
    mode: "motor_a_only",
  });
}

/**
 * Construye el `MatchOutlook` público completo (`11` mercados + `topScorelines[3]` + `fairOdds`)
 * para cualquier enfrentamiento de selecciones nacionales, cumpliendo `CONTRACT_OUTLOOK.md` §1–§4.
 */
export function buildIntlMatchOutlook(
  input: PredictIntlMatchInput,
  artifacts?: IntlEngineArtifacts,
): {
  readonly outlook: MatchOutlook;
  readonly synthesized: SynthesizedIntlMatchRow;
  readonly squadAdjustment: SquadClubAdjustmentResult;
  readonly basePrediction1X2: Prediction;
} {
  const model = artifacts?.model ?? getDefaultIntlModelArtifact();
  const causalState = artifacts?.causalState ?? getDefaultIntlCausalStateArtifact();
  const calibration = artifacts?.calibration ?? getDefaultIntlCalibrationArtifact();

  const synthesized = synthesizeIntlMatchSnapshotRow({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    tournament: input.tournament,
    matchDateUtc: input.matchDateUtc,
    venue: input.venue,
    causalState,
    nFeaturesBase: model.n_features_base === 38 ? 38 : model.n_features_base === 53 ? 53 : 49,
  });

  const basePrediction1X2 = predictIntlSoccer1X2(synthesized.row, model);
  const validFeatureCount = synthesized.row.features.filter(
    (v) => v !== null && v !== undefined && Number.isFinite(v),
  ).length;
  const coverageRatio = validFeatureCount / Math.max(1, model.n_features_base);

  const squadAdjustment = computeSquadClubAdjustment({
    squadContext: input.squadContext,
    tsDecisionUtc: input.tsDecisionUtc,
    kickoffUtc: input.matchDateUtc.length > 10 ? input.matchDateUtc : null,
    homeBaselineClubElo: synthesized.homeState.fed_club_elo,
    awayBaselineClubElo: synthesized.awayState.fed_club_elo,
    config: artifacts?.squadBridgeConfig,
  });

  const kickoffIso =
    input.matchDateUtc.trim().length > 10 ? input.matchDateUtc.trim() : null;

  if (squadAdjustment.applied) {
    const baseLambdas = fitDcLambdasFrom1X2ForBridge(
      {
        pHome: basePrediction1X2.pHome,
        pDraw: basePrediction1X2.pDraw,
        pAway: basePrediction1X2.pAway,
      },
      synthesized.rho,
    );
    const adjLamHome = clamp(baseLambdas.lamHome * squadAdjustment.lam_home_multiplier, 0.05, 10.0);
    const adjLamAway = clamp(baseLambdas.lamAway * squadAdjustment.lam_away_multiplier, 0.05, 10.0);

    const outlook = buildMatchOutlook({
      matchId: input.matchId,
      sport: "football",
      league: synthesized.regime,
      homeTeam: synthesized.homeCode,
      awayTeam: synthesized.awayCode,
      tsDecision: input.tsDecisionUtc,
      kickoffUtc: kickoffIso,
      football: {
        lamHome: adjLamHome,
        lamAway: adjLamAway,
        rho: synthesized.rho,
        featureCoverageRatio: coverageRatio,
      },
      marketQuotes: input.marketQuotes,
      oddsSnapshots: input.oddsSnapshots,
      maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
      calibrationArtifact: calibration,
    });

    return Object.freeze({
      outlook,
      synthesized,
      squadAdjustment,
      basePrediction1X2,
    });
  }

  const outlook = buildMatchOutlook({
    matchId: input.matchId,
    sport: "football",
    league: synthesized.regime,
    homeTeam: synthesized.homeCode,
    awayTeam: synthesized.awayCode,
    tsDecision: input.tsDecisionUtc,
    kickoffUtc: kickoffIso,
    football: {
      modelProbs1X2: {
        pHome: basePrediction1X2.pHome,
        pDraw: basePrediction1X2.pDraw,
        pAway: basePrediction1X2.pAway,
      },
      rho: synthesized.rho,
      featureCoverageRatio: coverageRatio,
    },
    marketQuotes: input.marketQuotes,
    oddsSnapshots: input.oddsSnapshots,
    maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
    calibrationArtifact: calibration,
  });

  return Object.freeze({
    outlook,
    synthesized,
    squadAdjustment,
    basePrediction1X2,
  });
}

// ============================================================================
// PitchLab Meridian v3.5 Ensemble + Horizon-Goals v3.5 (`EXP_V38`)
// ============================================================================

export const MERIDIAN_V35_CODENAME = "PitchLab Meridian v3.5 Ensemble" as const;

export function getDefaultIntlV35GbmArtifact(): GbmArtifact {
  return DEFAULT_INTL_V35_GBM_ARTIFACT;
}

export function getDefaultIntlHorizonGoalsV35Artifact(): HorizonGoalsModelArtifact {
  return DEFAULT_INTL_HORIZON_GOALS_V35_ARTIFACT;
}

/**
 * Extrae las `16` features base del regresor `Meridian Horizon-Goals v3.5` desde un vector `v2` (`49`+)
 * replicando `extract_intl_goals_features_from_v2_matrix` (`< 1e-13`).
 */
export function extractIntlHorizonGoalsFeaturesFromV2(
  v2Features: readonly (number | null)[],
  goalsArtifact: HorizonGoalsModelArtifact = getDefaultIntlHorizonGoalsV35Artifact(),
): readonly number[] {
  const srcIdx = goalsArtifact.source_v2_feature_indices ?? [];
  const srcVals = srcIdx.map((idx) => parseFiniteNumber(v2Features[idx]) ?? 0.0);
  const idxAbsMm = INTL_V2_49_FEATURES.indexOf("abs_elo_mismatch");
  const idxAttH = INTL_V2_49_FEATURES.indexOf("att_strength_home");
  const idxDefH = INTL_V2_49_FEATURES.indexOf("def_strength_home");
  const idxAttA = INTL_V2_49_FEATURES.indexOf("att_strength_away");
  const idxDefA = INTL_V2_49_FEATURES.indexOf("def_strength_away");

  const absMm = parseFiniteNumber(v2Features[idxAbsMm]) ?? 0.0;
  const attH = parseFiniteNumber(v2Features[idxAttH]) ?? 1.0;
  const defH = parseFiniteNumber(v2Features[idxDefH]) ?? 1.0;
  const attA = parseFiniteNumber(v2Features[idxAttA]) ?? 1.0;
  const defA = parseFiniteNumber(v2Features[idxDefA]) ?? 1.0;

  const mmSq = Math.min(absMm * absMm, 16.0);
  const attDefSum = attH + defA + (attA + defH);
  return Object.freeze([...srcVals, mmSq, attDefSum]);
}

export function evaluateMeridianV35CompactRow(params: {
  readonly features: readonly (number | null)[];
  readonly goalsFeatures: readonly (number | null)[];
  readonly div: string;
  readonly gbmArtifact?: GbmArtifact;
  readonly goalsArtifact?: HorizonGoalsModelArtifact;
}): {
  readonly ensembleProbs: readonly [number, number, number];
  readonly tPoisson: number;
  readonly dc3Param: CoherentDixonColes3ParamResult;
} {
  const gbmArt = params.gbmArtifact ?? getDefaultIntlV35GbmArtifact();
  const goalsArt = params.goalsArtifact ?? getDefaultIntlHorizonGoalsV35Artifact();

  const divIdx = gbmArt.div_levels.indexOf(params.div);
  const ev = evaluateCompactValidationRow(params.features, divIdx, gbmArt);
  const divOnehot = goalsArt.div_levels.map((lvl) => (lvl === params.div ? 1.0 : 0.0));
  const tPoisson = predictHorizonTotalGoals(params.goalsFeatures, divOnehot, goalsArt);

  const regimeKey = params.div as IntlTournamentRegime;
  const regRho2p = REGIME_DC_RHO[regimeKey] ?? -0.1;
  const twoParam = solveDixonColes2ParamFrom1X2(
    {
      pHome: ev.ensemble[0],
      pDraw: ev.ensemble[1],
      pAway: ev.ensemble[2],
    },
    regRho2p,
    goalsArt.max_goals_grid,
  );
  const wTot = goalsArt.w_total_poisson;
  const targetTot = wTot * tPoisson + (1.0 - wTot) * (twoParam.lamHome + twoParam.lamAway);
  const rhoPrior = goalsArt.div_rho_map[params.div] ?? goalsArt.default_rho;

  const dc3Param = solveCoherentDixonColes3Param({
    pHome: ev.ensemble[0],
    pDraw: ev.ensemble[1],
    pAway: ev.ensemble[2],
    totalGoalsTarget: targetTot,
    rhoPrior,
    rhoShrinkage: goalsArt.rho_shrinkage,
    maxGoals: goalsArt.max_goals_grid,
  });

  return Object.freeze({
    ensembleProbs: ev.ensemble,
    tPoisson,
    dc3Param,
  });
}

export function buildMeridianV35MatchOutlook(
  input: PredictIntlMatchInput,
  artifacts?: {
    readonly gbm?: GbmArtifact;
    readonly goals?: HorizonGoalsModelArtifact;
    readonly causalState?: IntlCausalStateArtifact;
    readonly calibration?: OutlookCalibrationArtifact;
    readonly squadBridgeConfig?: SquadBridgeConfig;
  },
): {
  readonly outlook: MatchOutlook;
  readonly synthesized: SynthesizedIntlMatchRow;
  readonly squadAdjustment: SquadClubAdjustmentResult;
  readonly ensembleProbs: readonly [number, number, number];
  readonly dc3Param: CoherentDixonColes3ParamResult;
} {
  const gbmArt = artifacts?.gbm ?? getDefaultIntlV35GbmArtifact();
  const goalsArt = artifacts?.goals ?? getDefaultIntlHorizonGoalsV35Artifact();
  const stateArt =
    artifacts?.causalState ??
    (gbmArt.n_features_base === 53
      ? getMeridianV3CausalStateArtifact()
      : getDefaultIntlCausalStateArtifact());
  const calArt =
    artifacts?.calibration ??
    (gbmArt.n_features_base === 53
      ? getMeridianV3CalibrationArtifact()
      : getDefaultIntlCalibrationArtifact());

  const nBase: 38 | 49 | 53 =
    gbmArt.n_features_base === 53 ? 53 : gbmArt.n_features_base === 38 ? 38 : 49;

  const synthesized = synthesizeIntlMatchSnapshotRow({
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    tournament: input.tournament,
    matchDateUtc: input.matchDateUtc,
    venue: input.venue,
    causalState: stateArt,
    nFeaturesBase: nBase,
  });

  const goalsFeatures = extractIntlHorizonGoalsFeaturesFromV2(
    synthesized.row.features.slice(0, 49),
    goalsArt,
  );
  const eval35 = evaluateMeridianV35CompactRow({
    features: synthesized.row.features,
    goalsFeatures,
    div: synthesized.regime,
    gbmArtifact: gbmArt,
    goalsArtifact: goalsArt,
  });

  const squadAdjustment = computeSquadClubAdjustment({
    squadContext: input.squadContext,
    tsDecisionUtc: input.tsDecisionUtc,
    kickoffUtc: input.matchDateUtc.length > 10 ? input.matchDateUtc : null,
    homeBaselineClubElo: synthesized.homeState.fed_club_elo,
    awayBaselineClubElo: synthesized.awayState.fed_club_elo,
    config: artifacts?.squadBridgeConfig,
  });

  const lamHomeEff = squadAdjustment.applied
    ? clamp(eval35.dc3Param.lamHome * squadAdjustment.lam_home_multiplier, 0.05, 10.0)
    : eval35.dc3Param.lamHome;
  const lamAwayEff = squadAdjustment.applied
    ? clamp(eval35.dc3Param.lamAway * squadAdjustment.lam_away_multiplier, 0.05, 10.0)
    : eval35.dc3Param.lamAway;

  const validCount = synthesized.row.features.filter(
    (v) => v !== null && v !== undefined && Number.isFinite(v),
  ).length;
  const coverageRatio = validCount / Math.max(1, gbmArt.n_features_base);
  const kickoffIso = input.matchDateUtc.trim().length > 10 ? input.matchDateUtc.trim() : null;

  const outlook = buildMatchOutlook({
    matchId: input.matchId,
    sport: "football",
    league: synthesized.regime,
    homeTeam: synthesized.homeCode,
    awayTeam: synthesized.awayCode,
    tsDecision: input.tsDecisionUtc,
    kickoffUtc: kickoffIso,
    football: {
      lamHome: lamHomeEff,
      lamAway: lamAwayEff,
      rho: eval35.dc3Param.rhoEff,
      featureCoverageRatio: coverageRatio,
    },
    marketQuotes: input.marketQuotes,
    oddsSnapshots: input.oddsSnapshots,
    maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
    calibrationArtifact: calArt,
  });

  return Object.freeze({
    outlook,
    synthesized,
    squadAdjustment,
    ensembleProbs: eval35.ensembleProbs,
    dc3Param: eval35.dc3Param,
  });
}
