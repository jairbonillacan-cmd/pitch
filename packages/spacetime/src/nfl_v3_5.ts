/**
 * PitchLab Minkowski v3.5 Ensemble & Totals v3.5 (`EXP_V39`) —
 * Motor candidato de NFL en TypeScript puro con elevación hiperbólica exacta de `HistGradientBoosting`
 * binario (`[+0.5*raw, b_tie, -0.5*raw]` en `gbm.ts`), regresor `Ridge` causal de puntos totales
 * (`model_nfl_totals_v3_5_candidate.json`) y síntesis viva sobre `nfl_causal_state_v3_5.json`.
 *
 * Invariantes (`MASTER.md` §0 y `CONTRACT_OUTLOOK.md`):
 *  - `model_nfl.json`, `engine.ts`, `outlook.ts` y `service.ts` permanecen 100% intactos.
 *  - `status = "candidate"`, `production_activated = false`.
 *  - Paridad IEEE-754 `< 1e-12` frente a Python sobre `nfl_v3_5_snapshot.json` (`120` juegos).
 */

import defaultGbmNflV35Json from "../data/gbm_nfl_v3_5_candidate.json";
import defaultTotalsNflV35Json from "../data/model_nfl_totals_v3_5_candidate.json";
import defaultNflStateV35Json from "../data/nfl_causal_state_v3_5.json";
import defaultOutlookCalibrationJson from "../data/outlook_calibration_v3_2.json";

import { evaluateCompactValidationRow, type GbmArtifact } from "./gbm";
import { clamp, logit, normalCdf } from "./math";
import type { OddsSnapshotRow } from "./odds";
import {
  buildMatchOutlook,
  DEFAULT_NFL_SIGMA_MARGIN,
  probabilityToFairOdds,
  type FairOdds,
  type MatchOutlook,
  type OutlookCalibrationArtifact,
  type OutlookMarketQuoteInput,
} from "./outlook";

export const MINKOWSKI_V35_CODENAME = "PitchLab Minkowski v3.5 Ensemble" as const;
export const MINKOWSKI_TOTALS_V35_CODENAME = "PitchLab Minkowski Totals v3.5" as const;

const NFL_TEAM_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
  JAC: "JAX",
  LA: "LAR",
  OAK: "LV",
  LVR: "LV",
  SD: "LAC",
  SL: "LAR",
  STL: "LAR",
  WSH: "WAS",
});

export interface NFLTotalsV35Artifact {
  readonly schema_version: string;
  readonly sport: "nfl";
  readonly type: "ridge_linear_expected_total";
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly alpha: number;
  readonly sigma_total: number;
  readonly min_total_points: number;
  readonly max_total_points: number;
  readonly n_features: number;
  readonly features: readonly string[];
  readonly imputer_statistics: readonly number[];
  readonly scaler_mean: readonly number[];
  readonly scaler_scale: readonly number[];
  readonly coef: readonly number[];
  readonly intercept: number;
}

export interface NFLFranchiseBaseState {
  readonly elo: number;
  readonly elo_fast: number;
  readonly qb_elo: number;
  readonly qb_starts: number;
  readonly last_qb_id: string;
  readonly coach_elo: number;
  readonly last_coach: string;
  readonly f5_adj_margin: number;
  readonly f10_adj_margin: number;
  readonly ewm_adj_margin: number;
  readonly ewm_off: number;
  readonly ewm_def: number;
  readonly sos_elo: number;
  readonly pyth_win: number;
  readonly is_indoor_home: number;
  readonly elevation_m: number;
  readonly division: string;
  readonly eff_hfa?: number;
}

export interface NFLFranchiseEpaState {
  readonly off_dropback_epa_pp: number;
  readonly def_dropback_epa_pp: number;
  readonly off_dropback_epa_wp_pp: number;
  readonly def_dropback_epa_wp_pp: number;
  readonly off_rush_epa_pp: number;
  readonly def_rush_epa_pp: number;
  readonly off_ed_success_rate: number;
  readonly def_ed_success_rate: number;
  readonly off_success_rate: number;
  readonly def_success_rate: number;
  readonly off_pressure_proxy_rate: number;
  readonly def_pressure_proxy_rate: number;
  readonly off_sack_rate: number;
  readonly def_sack_rate: number;
  readonly team_cpoe: number;
  readonly last_qb_epa_per_db: number;
  readonly last_qb_cpoe: number;
}

export interface NFLFranchiseV35ExtraState {
  readonly off_clip: number;
  readonly def_clip: number;
  readonly net_luck: number;
  readonly opp_adj_net: number;
  readonly off_ed: number;
  readonly def_ed: number;
  readonly off_pass: number;
  readonly def_pass: number;
  readonly off_sack: number;
  readonly def_sack: number;
  readonly fast_epa_mom: number;
  readonly pace_plays: number;
  readonly pts_total: number;
}

export interface NFLCausalStateV35Artifact {
  readonly schema_version: string;
  readonly as_of_cutoff_iso: string;
  readonly holdout_sealed_untouched: boolean;
  readonly max_dev_gameday: string;
  readonly n_franchises: number;
  readonly selected_features: readonly string[];
  readonly totals_features: readonly string[];
  readonly franchise_base_state: Readonly<Record<string, NFLFranchiseBaseState>>;
  readonly franchise_epa_state: Readonly<Record<string, NFLFranchiseEpaState>>;
  readonly franchise_v35_state: Readonly<Record<string, NFLFranchiseV35ExtraState>>;
}

export function canonicalNflFranchise(teamAbbr: string): string {
  const clean = String(teamAbbr ?? "").trim().toUpperCase();
  return NFL_TEAM_ALIASES[clean] ?? clean;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function isNflTotalsV35Artifact(value: unknown): value is NFLTotalsV35Artifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    value.sport === "nfl" &&
    value.type === "ridge_linear_expected_total" &&
    typeof value.n_features === "number" &&
    Array.isArray(value.features) &&
    Array.isArray(value.coef) &&
    typeof value.intercept === "number"
  );
}

function isNflCausalStateV35Artifact(value: unknown): value is NFLCausalStateV35Artifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.n_franchises === "number" &&
    Array.isArray(value.selected_features) &&
    Array.isArray(value.totals_features) &&
    isJsonRecord(value.franchise_base_state) &&
    isJsonRecord(value.franchise_epa_state) &&
    isJsonRecord(value.franchise_v35_state)
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

function parseGbmArtifact(raw: unknown, label: string): GbmArtifact {
  if (!isGbmArtifact(raw)) {
    throw new Error(`Invalid GbmArtifact JSON: ${label}`);
  }
  return raw;
}

function parseNflTotalsV35Artifact(raw: unknown, label: string): NFLTotalsV35Artifact {
  if (!isNflTotalsV35Artifact(raw)) {
    throw new Error(`Invalid NFLTotalsV35Artifact JSON: ${label}`);
  }
  return raw;
}

function parseNflCausalStateV35Artifact(raw: unknown, label: string): NFLCausalStateV35Artifact {
  if (!isNflCausalStateV35Artifact(raw)) {
    throw new Error(`Invalid NFLCausalStateV35Artifact JSON: ${label}`);
  }
  return raw;
}

function parseOutlookCalibrationArtifact(raw: unknown, label: string): OutlookCalibrationArtifact {
  if (!isOutlookCalibrationArtifact(raw)) {
    throw new Error(`Invalid OutlookCalibrationArtifact JSON: ${label}`);
  }
  return raw;
}

const DEFAULT_NFL_V35_GBM_ARTIFACT = parseGbmArtifact(
  defaultGbmNflV35Json,
  "gbm_nfl_v3_5_candidate.json",
);
const DEFAULT_NFL_TOTALS_V35_ARTIFACT = parseNflTotalsV35Artifact(
  defaultTotalsNflV35Json,
  "model_nfl_totals_v3_5_candidate.json",
);
const DEFAULT_NFL_CAUSAL_STATE_V35_ARTIFACT = parseNflCausalStateV35Artifact(
  defaultNflStateV35Json,
  "nfl_causal_state_v3_5.json",
);
const DEFAULT_NFL_OUTLOOK_CALIBRATION_ARTIFACT = parseOutlookCalibrationArtifact(
  defaultOutlookCalibrationJson,
  "outlook_calibration_v3_2.json",
);

export function getDefaultNflV35GbmArtifact(): GbmArtifact {
  return DEFAULT_NFL_V35_GBM_ARTIFACT;
}

export function getDefaultNflTotalsV35Artifact(): NFLTotalsV35Artifact {
  return DEFAULT_NFL_TOTALS_V35_ARTIFACT;
}

export function getDefaultNflCausalStateV35Artifact(): NFLCausalStateV35Artifact {
  return DEFAULT_NFL_CAUSAL_STATE_V35_ARTIFACT;
}

/**
 * Evalúa `PitchLab Minkowski Totals v3.5` (`Ridge` sobre 12 features estandarizadas).
 * Paridad `< 1e-13` frente a `run_nfl_v3_5_engines.py`.
 */
export function predictMinkowskiExpectedTotalV35(
  totalsFeatures: readonly (number | null)[],
  artifact: NFLTotalsV35Artifact = getDefaultNflTotalsV35Artifact(),
): number {
  if (totalsFeatures.length !== artifact.n_features) {
    throw new Error(
      `NFLTotalsV35: se esperaban ${artifact.n_features} features, recibido ${totalsFeatures.length}`,
    );
  }
  let acc = artifact.intercept;
  for (let i = 0; i < artifact.n_features; i += 1) {
    const raw = totalsFeatures[i];
    const x =
      typeof raw === "number" && Number.isFinite(raw) ? raw : artifact.imputer_statistics[i]!;
    const sc = artifact.scaler_scale[i]!;
    const safeScale = sc === 0.0 ? 1.0 : sc;
    acc += artifact.coef[i]! * ((x - artifact.scaler_mean[i]!) / safeScale);
  }
  return clamp(acc, artifact.min_total_points, artifact.max_total_points);
}

/**
 * Calcula `P(Over | no push)` y `P(Under | no push)` con corrección exacta de continuidad en líneas enteras.
 * Espejo exacto de `_compute_normal_totals_probs_vec` en Python.
 */
export function computeNflTotalsOverUnderProbsV35(params: {
  readonly totalLine: number;
  readonly expectedTotal: number;
  readonly sigmaTotal?: number;
}): {
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
} {
  const sigma = params.sigmaTotal ?? getDefaultNflTotalsV35Artifact().sigma_total;
  const tl = params.totalLine;
  const et = params.expectedTotal;
  const isInt = Math.abs(tl - Math.round(tl)) < 1e-9;

  if (isInt) {
    const thr = Math.round(tl);
    const pOvRaw = 1.0 - normalCdf((thr + 0.5 - et) / sigma);
    const pUnRaw = normalCdf((thr - 0.5 - et) / sigma);
    const pPush = Math.max(0.0, 1.0 - pOvRaw - pUnRaw);
    const act = pOvRaw + pUnRaw;
    const pOver = act > 1e-12 ? clamp(pOvRaw / act, 1e-9, 1.0 - 1e-9) : 0.5;
    const pUnder = 1.0 - pOver;
    return Object.freeze({
      pOver,
      pUnder,
      pPush,
      fairOddsOver: probabilityToFairOdds(clamp(pOver, 0.001, 0.999)),
      fairOddsUnder: probabilityToFairOdds(clamp(pUnder, 0.001, 0.999)),
    });
  }

  const pOver = clamp(normalCdf((et - tl) / sigma), 1e-9, 1.0 - 1e-9);
  const pUnder = 1.0 - pOver;
  return Object.freeze({
    pOver,
    pUnder,
    pPush: 0.0,
    fairOddsOver: probabilityToFairOdds(clamp(pOver, 0.001, 0.999)),
    fairOddsUnder: probabilityToFairOdds(clamp(pUnder, 0.001, 0.999)),
  });
}

export function evaluateMinkowskiV35CompactRow(
  features: readonly (number | null)[],
  totalsFeatures: readonly (number | null)[],
  gbmArtifact: GbmArtifact = getDefaultNflV35GbmArtifact(),
  totalsArtifact: NFLTotalsV35Artifact = getDefaultNflTotalsV35Artifact(),
): {
  readonly logitProbs: readonly [number, number, number];
  readonly gbmRawProbs: readonly [number, number, number];
  readonly gbmCalProbs: readonly [number, number, number];
  readonly ensembleProbs: readonly [number, number, number];
  readonly pHome2Way: number;
  readonly pAway2Way: number;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
} {
  const divIdx = gbmArtifact.div_levels.length > 0 ? 0 : -1;
  const ev = evaluateCompactValidationRow(features, divIdx, gbmArtifact);
  const ph = ev.ensemble[0];
  const pd = ev.ensemble[1];
  const pa = ev.ensemble[2];
  const twoSum = Math.max(ph + pa, 1e-12);
  const pHome2Way = clamp(ph / twoSum, 1e-6, 1.0 - 1e-6);
  const pAway2Way = 1.0 - pHome2Way;
  // Inversión suave de margen consistente con `DEFAULT_NFL_SIGMA_MARGIN`
  const expectedMargin = clamp(
    0.61 * DEFAULT_NFL_SIGMA_MARGIN * logit(pHome2Way, 1e-6),
    -28.0,
    28.0,
  );
  const expectedTotal = predictMinkowskiExpectedTotalV35(totalsFeatures, totalsArtifact);

  return Object.freeze({
    logitProbs: ev.logit,
    gbmRawProbs: ev.gbmRaw,
    gbmCalProbs: ev.gbmCalibrated,
    ensembleProbs: [ph, pd, pa] as const,
    pHome2Way,
    pAway2Way,
    expectedMargin,
    expectedTotal,
  });
}

export interface SynthesizeNflV35LiveInput {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly neutralSite?: boolean;
  readonly isIndoor?: boolean | null;
  readonly windMph?: number | null;
  readonly tempF?: number | null;
  readonly restDiff?: number | null;
  readonly includeIncumbentQbCoach?: boolean;
  readonly stateArtifact?: NFLCausalStateV35Artifact;
}

export function synthesizeNflV35LiveVectors(input: SynthesizeNflV35LiveInput): {
  readonly homeFranchise: string;
  readonly awayFranchise: string;
  readonly moneylineFeatures: readonly (number | null)[];
  readonly totalsFeatures: readonly (number | null)[];
  readonly coverageRatio: number;
} {
  const state = input.stateArtifact ?? getDefaultNflCausalStateV35Artifact();
  const hf = canonicalNflFranchise(input.homeTeam);
  const af = canonicalNflFranchise(input.awayTeam);
  const hb = state.franchise_base_state[hf];
  const ab = state.franchise_base_state[af];
  const he = state.franchise_epa_state[hf];
  const ae = state.franchise_epa_state[af];
  const hv = state.franchise_v35_state[hf];
  const av = state.franchise_v35_state[af];

  if (!hb || !ab || !he || !ae || !hv || !av) {
    throw new Error(`Franquicia NFL desconocida en estado v3.5: ${input.homeTeam} vs ${input.awayTeam}`);
  }

  const neut = input.neutralSite ? 1.0 : 0.0;
  const ind =
    input.isIndoor === undefined || input.isIndoor === null
      ? hb.is_indoor_home
      : input.isIndoor
        ? 1.0
        : 0.0;
  const hfa = neut > 0.5 ? 0.0 : (hb.eff_hfa ?? 48.0);
  const altBonus = neut > 0.5 ? 0.0 : (18.0 * Math.max(0.0, hb.elevation_m - ab.elevation_m)) / 1000.0;

  const eloDiff = hb.elo + hfa - ab.elo + altBonus;
  const eloFastDiff = hb.elo_fast + hfa - ab.elo_fast + altBonus;
  const eloMom = hb.elo_fast - ab.elo_fast - (hb.elo - ab.elo);
  const divGame = hb.division && hb.division === ab.division ? 1.0 : 0.0;
  const windVal = typeof input.windMph === "number" && Number.isFinite(input.windMph) ? input.windMph : 0.0;
  const windOutdoor = ind > 0.5 ? 0.0 : Math.max(0.0, windVal - 10.0);
  const coldOutdoor: number | null =
    ind > 0.5
      ? 0.0
      : typeof input.tempF === "number" && Number.isFinite(input.tempF)
        ? Math.max(0.0, 40.0 - input.tempF)
        : null;

  const useIncumbent = input.includeIncumbentQbCoach ?? true;
  const valH = hb.qb_elo - hb.elo;
  const valA = ab.qb_elo - ab.elo;
  const ceDiff = hb.coach_elo - ab.coach_elo;
  const compDiff = useIncumbent ? eloDiff + 0.38 * (valH - valA) + 0.12 * ceDiff : eloDiff;
  const pComp = 1.0 / (1.0 + Math.pow(10.0, -compDiff / 400.0));
  const compLogit = Math.log(Math.max(1e-6, pComp) / Math.max(1e-6, 1.0 - pComp));
  const eloClose = Math.exp(-Math.pow(compDiff / 135.0, 2));
  const qbEpaDiff = useIncumbent ? he.last_qb_epa_per_db - ae.last_qb_epa_per_db : null;

  const mapVals: Record<string, number | null> = {
    elo_diff: eloDiff,
    elo_fast_diff: eloFastDiff,
    elo_momentum_diff: eloMom,
    qb_elo_diff: useIncumbent ? hb.qb_elo + hfa - ab.qb_elo + altBonus : null,
    qb_val_over_team_home: useIncumbent ? valH : null,
    qb_val_over_team_away: useIncumbent ? valA : null,
    qb_change_home: null,
    qb_change_away: null,
    qb_starts_diff: useIncumbent ? Math.log1p(hb.qb_starts) - Math.log1p(ab.qb_starts) : null,
    coach_elo_diff: useIncumbent ? ceDiff : null,
    coach_change_home: null,
    coach_change_away: null,
    composite_elo_diff: compDiff,
    comp_elo_logit: compLogit,
    elo_closeness: eloClose,
    rest_diff:
      typeof input.restDiff === "number" && Number.isFinite(input.restDiff) ? input.restDiff : null,
    f5_adj_margin_diff: hb.f5_adj_margin - ab.f5_adj_margin,
    f10_adj_margin_diff: hb.f10_adj_margin - ab.f10_adj_margin,
    ewm_adj_margin_diff: hb.ewm_adj_margin - ab.ewm_adj_margin,
    ewm_off_diff: hb.ewm_off - ab.ewm_off,
    ewm_def_diff: hb.ewm_def - ab.ewm_def,
    sos_elo_diff: (hb.sos_elo - ab.sos_elo) / 100.0,
    pyth_win_diff: hb.pyth_win - ab.pyth_win,
    div_game: divGame,
    is_indoor: ind,
    neutral_site: neut,
    wind_outdoor: windOutdoor,
    cold_outdoor: coldOutdoor,
    prev_ot_diff: null,
    epa_dropback_off_diff: he.off_dropback_epa_pp - ae.off_dropback_epa_pp,
    epa_dropback_def_diff: ae.def_dropback_epa_pp - he.def_dropback_epa_pp,
    epa_dropback_wp_net_diff:
      he.off_dropback_epa_wp_pp -
      he.def_dropback_epa_wp_pp -
      (ae.off_dropback_epa_wp_pp - ae.def_dropback_epa_wp_pp),
    epa_rush_off_diff: he.off_rush_epa_pp - ae.off_rush_epa_pp,
    epa_rush_def_diff: ae.def_rush_epa_pp - he.def_rush_epa_pp,
    ed_success_off_diff: he.off_ed_success_rate - ae.off_ed_success_rate,
    ed_success_def_diff: ae.def_ed_success_rate - he.def_ed_success_rate,
    global_success_net_diff:
      he.off_success_rate - he.def_success_rate - (ae.off_success_rate - ae.def_success_rate),
    pressure_gen_def_diff: he.def_pressure_proxy_rate - ae.def_pressure_proxy_rate,
    pressure_allowed_off_diff: ae.off_pressure_proxy_rate - he.off_pressure_proxy_rate,
    qb_epa_per_db_diff: qbEpaDiff,
    qb_cpoe_diff: useIncumbent ? (he.last_qb_cpoe - ae.last_qb_cpoe) / 100.0 : null,
    // Extra 8 de v3.5
    clipped_epa_off_diff: hv.off_clip - av.off_clip,
    clipped_epa_def_diff: av.def_clip - hv.def_clip,
    turnover_luck_diff: hv.net_luck - av.net_luck,
    opp_adj_epa_net_diff: hv.opp_adj_net - av.opp_adj_net,
    ed_epa_off_diff: hv.off_ed - av.off_ed,
    ed_epa_def_diff: av.def_ed - hv.def_ed,
    sack_rate_net_diff: hv.def_sack - hv.off_sack - (av.def_sack - av.off_sack),
    fast_epa_mom_diff: hv.fast_epa_mom - av.fast_epa_mom,
  };

  const totalsMap: Record<string, number | null> = {
    ewm_pts_total_sum: 0.5 * (hv.pts_total + av.pts_total),
    pace_plays_sum: 0.5 * (hv.pace_plays + av.pace_plays),
    clipped_epa_sum: hv.off_clip + av.def_clip + (av.off_clip + hv.def_clip),
    pass_rate_sum: 0.5 * (hv.off_pass + av.def_pass + (av.off_pass + hv.def_pass)),
    qb_epa_sum: Math.abs(qbEpaDiff ?? 0.0),
    ewm_off_plus_def_sum: hb.ewm_off - ab.ewm_off - (hb.ewm_def - ab.ewm_def),
    abs_comp_elo_diff: Math.abs(compDiff) / 200.0,
    is_indoor: ind,
    wind_outdoor: windOutdoor,
    cold_outdoor: coldOutdoor,
    div_game: divGame,
    venue_elev_km: neut > 0.5 ? 0.1 : hb.elevation_m / 1000.0,
  };

  const moneylineFeatures = state.selected_features.map((nm) => mapVals[nm] ?? null);
  const totalsFeatures = state.totals_features.map((nm) => totalsMap[nm] ?? null);
  const validCount = moneylineFeatures.filter((v) => v !== null && Number.isFinite(v)).length;

  return Object.freeze({
    homeFranchise: hf,
    awayFranchise: af,
    moneylineFeatures: Object.freeze(moneylineFeatures),
    totalsFeatures: Object.freeze(totalsFeatures),
    coverageRatio: validCount / Math.max(1, moneylineFeatures.length),
  });
}

export interface BuildNflV35OutlookInput extends SynthesizeNflV35LiveInput {
  readonly matchId: string;
  readonly tsDecisionUtc: string;
  readonly kickoffUtc?: string | null;
  readonly spreadLine?: number | null;
  readonly totalLine?: number | null;
  readonly marketQuotes?: readonly OutlookMarketQuoteInput[];
  readonly oddsSnapshots?: readonly OddsSnapshotRow[];
  readonly maxQuoteAgeMinutes?: number;
}

export function buildNflV35CandidateOutlook(
  input: BuildNflV35OutlookInput,
  artifacts?: {
    readonly gbm?: GbmArtifact;
    readonly totals?: NFLTotalsV35Artifact;
    readonly state?: NFLCausalStateV35Artifact;
    readonly calibration?: OutlookCalibrationArtifact;
  },
): {
  readonly outlook: MatchOutlook;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly ensembleProbs: readonly [number, number, number];
  readonly coverageRatio: number;
} {
  const gbmArt = artifacts?.gbm ?? getDefaultNflV35GbmArtifact();
  const totArt = artifacts?.totals ?? getDefaultNflTotalsV35Artifact();
  const stateArt = artifacts?.state ?? getDefaultNflCausalStateV35Artifact();
  const calArt = artifacts?.calibration ?? DEFAULT_NFL_OUTLOOK_CALIBRATION_ARTIFACT;

  const synth = synthesizeNflV35LiveVectors({ ...input, stateArtifact: stateArt });
  const pred = evaluateMinkowskiV35CompactRow(
    synth.moneylineFeatures,
    synth.totalsFeatures,
    gbmArt,
    totArt,
  );

  const outlook = buildMatchOutlook({
    matchId: input.matchId,
    sport: "nfl",
    league: "NFL",
    homeTeam: synth.homeFranchise,
    awayTeam: synth.awayFranchise,
    tsDecision: input.tsDecisionUtc,
    kickoffUtc: input.kickoffUtc ?? null,
    nfl: {
      pHome: pred.ensembleProbs[0],
      pDraw: pred.ensembleProbs[1],
      pAway: pred.ensembleProbs[2],
      expectedMargin: pred.expectedMargin,
      expectedTotal: pred.expectedTotal,
      spreadLine: input.spreadLine ?? null,
      totalLine: input.totalLine ?? null,
      sigmaTotal: totArt.sigma_total,
      featureCoverageRatio: synth.coverageRatio,
    },
    marketQuotes: input.marketQuotes,
    oddsSnapshots: input.oddsSnapshots,
    maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
    calibrationArtifact: calArt,
  });

  return Object.freeze({
    outlook,
    expectedMargin: pred.expectedMargin,
    expectedTotal: pred.expectedTotal,
    ensembleProbs: pred.ensembleProbs,
    coverageRatio: synth.coverageRatio,
  });
}
