/**
 * PitchLab Tachyon v3.3 / v3.4 Candidate & Live-Complete (`EXP_V34` / `EXP_V36`) —
 * Motores de Fútbol de Clubes enriquecidos con fuentes abiertas (`StatsBomb P1-1` + `Transfermarkt CC0` Ola 1 y Ola 2).
 *
 * Invariantes de gobernanza (`MASTER.md` §0 y `CONTRACT_OUTLOOK.md`):
 *  1. `model_motor_a.json` (`Tachyon v3.0`), `engine.ts`, `outlook.ts`, `service.ts` y
 *     `production_segments_v3_1.json` permanecen 100% intactos (`status = "candidate"`, `production_activated = false`).
 *  2. Paridad numérica IEEE-754 `< 1e-12` frente a Python sobre los snapshots de `v3.3` (`120` base),
 *     `v3.4` (`127` base) y `v3.4 Live-Complete` (`52` base, `LL = 1.00794`, `ECE = 0.00470`).
 *  3. `synthesizeClubV34LiveCompleteRow` elimina el sesgo de cobertura viva (`38/113 -> 52/52 = 100.0%`, `flag = "ok"`).
 *  4. Salida `MatchOutlook` completa (`11` mercados + `topScorelines[3]`), `0` campos de `stake`/`kelly`/`ev`/`tier`.
 */

import defaultClubFreeOpenStateJson from "../data/club_free_open_state_v3_4.json";
import defaultClubV33ModelJson from "../data/model_club_v3_3_candidate.json";
import defaultClubV34ModelJson from "../data/model_club_v3_4_candidate.json";
import defaultClubV34LiveModelJson from "../data/model_club_v3_4_live_candidate.json";
import frozenMotorAJson from "../data/model_motor_a.json";
import defaultOutlookCalibrationJson from "../data/outlook_calibration_v3_2.json";

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
import type { OddsSnapshotRow } from "./odds";
import {
  buildMatchOutlook,
  type MatchOutlook,
  type OutlookCalibrationArtifact,
  type OutlookMarketQuoteInput,
} from "./outlook";
import type { ModelArtifact, Prediction, SnapshotRow } from "./types";

export const TACHYON_V33_CANDIDATE_CODENAME = "PitchLab Tachyon v3.3 Candidate" as const;
export const TACHYON_V34_CANDIDATE_CODENAME = "PitchLab Tachyon v3.4 Candidate" as const;
export const TACHYON_V34_LIVE_COMPLETE_CODENAME = "PitchLab Tachyon v3.4 Live-Complete" as const;
export const TACHYON_V30_BASE_FEATURE_COUNT = 113;
export const TACHYON_V34_LIVE_BASE_FEATURE_COUNT = 52;

/**
 * Pesos OLS no negativos calibrados empíricamente sobre `StatsBomb Open Data`
 * (`season_id = 27`, Big-5 Europa `2015/2016`, `< 2020` estricto sin fuga a `VAL`/`DEV`/`HOLDOUT`).
 */
export const STATSBOMB_P1_1_SHOT_XG_WEIGHTS = Object.freeze({
  home: Object.freeze({
    intercept: 0.0,
    w_sot: 0.23698,
    w_soff: 0.04696,
    w_corners: 0.00163,
  }),
  away: Object.freeze({
    intercept: 0.0,
    w_sot: 0.17822,
    w_soff: 0.0718,
    w_corners: 0.01403,
  }),
});

export interface ClubFreeOpenTeamState {
  readonly div: string;
  readonly team: string;
  readonly tm_club_id: number | null;
  readonly sb_xg_ewm8: number;
  readonly tm_has_val: number;
  readonly tm_raw_log_val: number;
  readonly tm_depth_ratio: number;
  readonly tm_new_mgr_flag: number;
  readonly tm_mgr_pae: number;
  readonly midweek_cup_load: number;
  readonly games_14d_allcomps: number;
  readonly has_realized_xi: number;
  readonly realized_xi_log_val: number;
  readonly injury_avail_ratio: number;
  readonly xi_ga90_allcomps: number;
  readonly net_transfer_val_120d: number;
  readonly inbound_fee_120d: number;
}

export interface ClubFreeOpenStateArtifact {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly weights_trained_strictly_before: string;
  readonly max_observed_match_date: string;
  readonly n_active_clubs: number;
  readonly live_base_38_features: readonly string[];
  readonly free_open_14_features: readonly string[];
  readonly div_ewm_log_val: Readonly<Record<string, number>>;
  readonly div_ewm_xi_val: Readonly<Record<string, number>>;
  readonly clubs: Readonly<Record<string, ClubFreeOpenTeamState>>;
}

export interface ClubFreeOpenSignalsInput {
  readonly prev_reds_diff?: number | null;
  readonly rc_clean_gd_ewm8_diff?: number | null;
  readonly ht_gd_ewm8_diff?: number | null;
  readonly ht_lead_r10_diff?: number | null;
  readonly disc_cards_ewm10_diff?: number | null;
  readonly ref_home_bias_prior?: number | null;
  readonly ref_draw_bias_prior?: number | null;
  readonly sb_xg_diff_ewm8?: number | null;
  readonly tm_rel_log_val_diff?: number | null;
  readonly tm_depth_ratio_diff?: number | null;
  readonly tm_val_vs_elo_gap_diff?: number | null;
  readonly tm_promoted_val_boost_diff?: number | null;
  readonly tm_new_mgr_diff?: number | null;
  readonly tm_mgr_pae_diff?: number | null;
  readonly tm_midweek_cup_adv?: number | null;
  readonly tm_games_14d_adv?: number | null;
  readonly tm_realized_xi_val_diff?: number | null;
  readonly tm_injury_avail_ratio_diff?: number | null;
  readonly tm_xi_ga90_allcomps_diff?: number | null;
  readonly tm_net_transfer_val_120d_diff?: number | null;
  readonly tm_inbound_fee_120d_diff?: number | null;
}

export interface BuildClubV33OutlookInput {
  readonly matchId: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly tsDecisionUtc: string;
  readonly kickoffUtc?: string | null;
  readonly row: SnapshotRow;
  readonly rho?: number;
  readonly marketQuotes?: readonly OutlookMarketQuoteInput[];
  readonly oddsSnapshots?: readonly OddsSnapshotRow[];
  readonly maxQuoteAgeMinutes?: number;
}

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

function isClubFreeOpenStateArtifact(value: unknown): value is ClubFreeOpenStateArtifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.n_active_clubs === "number" &&
    Array.isArray(value.live_base_38_features) &&
    Array.isArray(value.free_open_14_features) &&
    isJsonRecord(value.div_ewm_log_val) &&
    isJsonRecord(value.div_ewm_xi_val) &&
    isJsonRecord(value.clubs)
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

function parseModelArtifact(raw: unknown, label: string): ModelArtifact {
  if (!isModelArtifact(raw)) {
    throw new Error(`Invalid ModelArtifact JSON: ${label}`);
  }
  return raw;
}

function parseClubFreeOpenStateArtifact(raw: unknown, label: string): ClubFreeOpenStateArtifact {
  if (!isClubFreeOpenStateArtifact(raw)) {
    throw new Error(`Invalid ClubFreeOpenStateArtifact JSON: ${label}`);
  }
  return raw;
}

function parseOutlookCalibrationArtifact(raw: unknown, label: string): OutlookCalibrationArtifact {
  if (!isOutlookCalibrationArtifact(raw)) {
    throw new Error(`Invalid OutlookCalibrationArtifact JSON: ${label}`);
  }
  return raw;
}

const DEFAULT_CLUB_V33_CANDIDATE_MODEL = parseModelArtifact(
  defaultClubV33ModelJson,
  "model_club_v3_3_candidate.json",
);
const DEFAULT_CLUB_V34_CANDIDATE_MODEL = parseModelArtifact(
  defaultClubV34ModelJson,
  "model_club_v3_4_candidate.json",
);
const DEFAULT_CLUB_V34_LIVE_COMPLETE_MODEL = parseModelArtifact(
  defaultClubV34LiveModelJson,
  "model_club_v3_4_live_candidate.json",
);
const DEFAULT_CLUB_FREE_OPEN_STATE_ARTIFACT = parseClubFreeOpenStateArtifact(
  defaultClubFreeOpenStateJson,
  "club_free_open_state_v3_4.json",
);
const DEFAULT_CLUB_OUTLOOK_CALIBRATION = parseOutlookCalibrationArtifact(
  defaultOutlookCalibrationJson,
  "outlook_calibration_v3_2.json",
);

export function getDefaultClubV33CandidateModel(): ModelArtifact {
  return DEFAULT_CLUB_V33_CANDIDATE_MODEL;
}

export function getDefaultClubV34CandidateModel(): ModelArtifact {
  return DEFAULT_CLUB_V34_CANDIDATE_MODEL;
}

export function getDefaultClubV34LiveCompleteModel(): ModelArtifact {
  return DEFAULT_CLUB_V34_LIVE_COMPLETE_MODEL;
}

export function getDefaultClubFreeOpenStateArtifact(): ClubFreeOpenStateArtifact {
  return DEFAULT_CLUB_FREE_OPEN_STATE_ARTIFACT;
}

export function getDefaultClubOutlookCalibration(): OutlookCalibrationArtifact {
  return DEFAULT_CLUB_OUTLOOK_CALIBRATION;
}

/**
 * Estima el `statsbomb_xg` de un partido histórico a partir de conteos gratuitos de caja
 * (`shots`, `shotsOnTarget`, `corners`), usando la calibración `P1-1` (`R^2 = 0.529` Home / `0.485` Away).
 */
export function computeStatsBombCalibratedMatchXg(params: {
  readonly isHome: boolean;
  readonly shots: number;
  readonly shotsOnTarget: number;
  readonly corners?: number | null;
}): number {
  const w = params.isHome
    ? STATSBOMB_P1_1_SHOT_XG_WEIGHTS.home
    : STATSBOMB_P1_1_SHOT_XG_WEIGHTS.away;
  const sot = Math.max(0.0, params.shotsOnTarget);
  const soff = Math.max(0.0, params.shots - sot);
  const defaultCorners = params.isHome ? 4.8 : 4.0;
  const cor =
    params.corners !== undefined && params.corners !== null && Number.isFinite(params.corners)
      ? Math.max(0.0, params.corners)
      : defaultCorners;
  return w.intercept + w.w_sot * sot + w.w_soff * soff + w.w_corners * cor;
}

/**
 * Calcula las `14` features abiertas de `Tachyon v3.4` (`StatsBomb P1-1` + `Transfermarkt CC0` Ola 1 y Ola 2)
 * desde `club_free_open_state_v3_4.json` con paridad `< 1e-12` frente a Python.
 */
export function computeLiveClubFreeOpen14Vector(params: {
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly eloDiffNoHfa: number;
  readonly hDivChange?: number;
  readonly aDivChange?: number;
  readonly clubState?: ClubFreeOpenStateArtifact;
}): readonly number[] {
  const stateArt = params.clubState ?? getDefaultClubFreeOpenStateArtifact();
  const hk = `${params.div}::${params.homeTeam}`;
  const ak = `${params.div}::${params.awayTeam}`;
  const sh = stateArt.clubs[hk];
  const sa = stateArt.clubs[ak];

  const eh = 1525.0 + 0.5 * params.eloDiffNoHfa;
  const ea = 1525.0 - 0.5 * params.eloDiffNoHfa;
  const eloRelH = (eh - 1525.0) / 145.0;
  const eloRelA = (ea - 1525.0) / 145.0;

  const sbDiff = (sh?.sb_xg_ewm8 ?? 0.0) - (sa?.sb_xg_ewm8 ?? 0.0);

  const hasH = (sh?.tm_has_val ?? 0.0) > 0.0;
  const hasA = (sa?.tm_has_val ?? 0.0) > 0.0;
  const curDivMed = stateArt.div_ewm_log_val[params.div] ?? 3.8;

  let relH = 0.0;
  let relA = 0.0;
  let valDiff = 0.0;
  let depthDiff = 0.0;
  let gapDiff = 0.0;

  if (hasH && hasA && sh !== undefined && sa !== undefined) {
    relH = sh.tm_raw_log_val - curDivMed;
    relA = sa.tm_raw_log_val - curDivMed;
    valDiff = sh.tm_raw_log_val - sa.tm_raw_log_val;
    depthDiff = sh.tm_depth_ratio - sa.tm_depth_ratio;
    gapDiff = relH - eloRelH - (relA - eloRelA);
  } else if (hasH && !hasA && sh !== undefined) {
    relH = sh.tm_raw_log_val - curDivMed;
    const impA = -0.35 + 0.3 * eloRelA;
    relA = impA;
    valDiff = 0.65 * (relH - impA);
    depthDiff = 0.5 * (sh.tm_depth_ratio - 0.26);
    gapDiff = 0.65 * (relH - eloRelH);
  } else if (hasA && !hasH && sa !== undefined) {
    relA = sa.tm_raw_log_val - curDivMed;
    const impH = -0.35 + 0.3 * eloRelH;
    relH = impH;
    valDiff = 0.65 * (impH - relA);
    depthDiff = 0.5 * (0.26 - sa.tm_depth_ratio);
    gapDiff = -0.65 * (relA - eloRelA);
  }

  const hProm = params.hDivChange ?? 0.0;
  const aProm = params.aDivChange ?? 0.0;
  const promBoostDiff = hProm * relH - aProm * relA;
  const newMgrDiff = (sh?.tm_new_mgr_flag ?? 0.0) - (sa?.tm_new_mgr_flag ?? 0.0);
  const mgrPaeDiff = (sh?.tm_mgr_pae ?? 0.0) - (sa?.tm_mgr_pae ?? 0.0);

  const cupAdv = (sa?.midweek_cup_load ?? 0.0) - (sh?.midweek_cup_load ?? 0.0);
  const g14Adv = (sa?.games_14d_allcomps ?? 1.5) - (sh?.games_14d_allcomps ?? 1.5);

  const hx = (sh?.has_realized_xi ?? 0.0) > 0.0;
  const ax = (sa?.has_realized_xi ?? 0.0) > 0.0;
  const curXiMed = stateArt.div_ewm_xi_val[params.div] ?? 3.2;

  let xiValDiff = 0.0;
  let availDiff = 0.0;
  let ga90Diff = 0.0;

  if (hx && ax && sh !== undefined && sa !== undefined) {
    xiValDiff = sh.realized_xi_log_val - sa.realized_xi_log_val;
    availDiff = sh.injury_avail_ratio - sa.injury_avail_ratio;
    ga90Diff = sh.xi_ga90_allcomps - sa.xi_ga90_allcomps;
  } else if (hx && !ax && sh !== undefined) {
    xiValDiff = 0.55 * (sh.realized_xi_log_val - curXiMed - -0.3);
    availDiff = 0.55 * (sh.injury_avail_ratio - 0.85);
    ga90Diff = 0.55 * (sh.xi_ga90_allcomps - 2.1);
  } else if (ax && !hx && sa !== undefined) {
    xiValDiff = 0.55 * (-0.3 - (sa.realized_xi_log_val - curXiMed));
    availDiff = 0.55 * (0.85 - sa.injury_avail_ratio);
    ga90Diff = 0.55 * (2.1 - sa.xi_ga90_allcomps);
  }

  const netTrDiff = (sh?.net_transfer_val_120d ?? 0.0) - (sa?.net_transfer_val_120d ?? 0.0);
  const inFeeDiff = (sh?.inbound_fee_120d ?? 0.0) - (sa?.inbound_fee_120d ?? 0.0);

  return Object.freeze([
    sbDiff,
    valDiff,
    depthDiff,
    gapDiff,
    promBoostDiff,
    newMgrDiff,
    mgrPaeDiff,
    cupAdv,
    g14Adv,
    xiValDiff,
    availDiff,
    ga90Diff,
    netTrDiff,
    inFeeDiff,
  ]);
}

const MOTOR_A_BASE_NAMES: readonly string[] = Object.freeze(
  parseModelArtifact(frozenMotorAJson, "model_motor_a.json").features.slice(
    0,
    TACHYON_V30_BASE_FEATURE_COUNT,
  ),
);

/**
 * Construye el `SnapshotRow` completo de `52` features (`100%` cobertura viva, `flag = "ok"`) para
 * `PitchLab Tachyon v3.4 Live-Complete` a partir de un `SnapshotRow` vivo de `service.ts` (`113` cols)
 * o un vector `LIVE_38` directo.
 */
export function synthesizeClubV34LiveCompleteRow(params: {
  readonly sourceRow: SnapshotRow;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly hDivChange?: number;
  readonly aDivChange?: number;
  readonly clubState?: ClubFreeOpenStateArtifact;
}): SnapshotRow {
  const stateArt = params.clubState ?? getDefaultClubFreeOpenStateArtifact();
  const liveNames = stateArt.live_base_38_features;

  let base38: (number | null)[];
  let eloDiffNoHfa = 0.0;

  if (params.sourceRow.features.length === TACHYON_V30_BASE_FEATURE_COUNT) {
    const idxByName = new Map<string, number>();
    MOTOR_A_BASE_NAMES.forEach((nm, idx) => idxByName.set(nm, idx));
    base38 = liveNames.map((nm) => {
      const i = idxByName.get(nm);
      return i !== undefined ? (params.sourceRow.features[i] ?? null) : null;
    });
    const iElo = idxByName.get("elo_diff_no_hfa");
    const rawElo = iElo !== undefined ? params.sourceRow.features[iElo] : 0.0;
    eloDiffNoHfa = typeof rawElo === "number" && Number.isFinite(rawElo) ? rawElo : 0.0;
  } else if (params.sourceRow.features.length === liveNames.length) {
    base38 = [...params.sourceRow.features];
    const iElo = liveNames.indexOf("elo_diff_no_hfa");
    const rawElo = iElo >= 0 ? params.sourceRow.features[iElo] : 0.0;
    eloDiffNoHfa = typeof rawElo === "number" && Number.isFinite(rawElo) ? rawElo : 0.0;
  } else {
    throw new Error(
      `sourceRow debe tener 113 o ${liveNames.length} features; recibido ${params.sourceRow.features.length}`,
    );
  }

  const free14 = computeLiveClubFreeOpen14Vector({
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    eloDiffNoHfa,
    hDivChange: params.hDivChange,
    aDivChange: params.aDivChange,
    clubState: stateArt,
  });

  return Object.freeze({
    ...params.sourceRow,
    div: params.div,
    features: Object.freeze([...base38, ...free14]),
  });
}

/**
 * Extiende un `SnapshotRow` base de `113` features (`Tachyon v3.0`) al esquema exacto de
 * `model_club_v3_3_candidate.json` (`120`) o `model_club_v3_4_candidate.json` (`127`).
 */
export function appendFreeOpenClubCandidateFeatures(params: {
  readonly baseRow113: SnapshotRow;
  readonly freeSignals?: ClubFreeOpenSignalsInput | null;
  readonly model?: ModelArtifact;
}): SnapshotRow {
  const model = params.model ?? getDefaultClubV33CandidateModel();
  if (params.baseRow113.features.length !== TACHYON_V30_BASE_FEATURE_COUNT) {
    throw new Error(
      `baseRow113 debe tener ${TACHYON_V30_BASE_FEATURE_COUNT} features base; recibido ${params.baseRow113.features.length}`,
    );
  }
  const extraNames = model.features.slice(TACHYON_V30_BASE_FEATURE_COUNT, model.n_features_base);
  const sigRecord = (params.freeSignals ?? {}) as Record<string, number | null | undefined>;
  const extraVals = extraNames.map((colName) => {
    const raw = sigRecord[colName];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  });

  return Object.freeze({
    ...params.baseRow113,
    features: Object.freeze([...params.baseRow113.features, ...extraVals]),
  });
}

export function predictClubV33Candidate1X2(
  row: SnapshotRow,
  model: ModelArtifact = getDefaultClubV33CandidateModel(),
): Prediction {
  assertValidModel(model);
  return predictWithFallback(row, model, null, GLOBAL_HDA_RATES, {
    mode: "motor_a_only",
  });
}

export function buildClubV33CandidateOutlook(
  input: BuildClubV33OutlookInput,
  model: ModelArtifact = getDefaultClubV33CandidateModel(),
  calibration: OutlookCalibrationArtifact = getDefaultClubOutlookCalibration(),
): {
  readonly outlook: MatchOutlook;
  readonly prediction1X2: Prediction;
} {
  const prediction1X2 = predictClubV33Candidate1X2(input.row, model);
  const validCount = input.row.features.filter(
    (v) => v !== null && v !== undefined && Number.isFinite(v),
  ).length;
  const coverageRatio = validCount / Math.max(1, model.n_features_base);

  const outlook = buildMatchOutlook({
    matchId: input.matchId,
    sport: "football",
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    tsDecision: input.tsDecisionUtc,
    kickoffUtc: input.kickoffUtc ?? null,
    football: {
      modelProbs1X2: {
        pHome: prediction1X2.pHome,
        pDraw: prediction1X2.pDraw,
        pAway: prediction1X2.pAway,
      },
      rho: input.rho ?? -0.1,
      featureCoverageRatio: coverageRatio,
    },
    marketQuotes: input.marketQuotes,
    oddsSnapshots: input.oddsSnapshots,
    maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
    calibrationArtifact: calibration,
  });

  return Object.freeze({
    outlook,
    prediction1X2,
  });
}

// ============================================================================
// PitchLab Tachyon v3.5 Live-Ensemble + Horizon-Goals v3.5 (`EXP_V37`)
// ============================================================================

export const TACHYON_V35_LIVE_ENSEMBLE_CODENAME =
  "PitchLab Tachyon v3.5 Live-Ensemble" as const;

export interface ClubFreeOpenTeamStateV35 extends ClubFreeOpenTeamState {
  readonly sb_xg_for_ewm10: number;
  readonly sb_xg_against_ewm10: number;
  readonly goals_for_ewm12: number;
  readonly goals_against_ewm12: number;
  readonly btts_rate_ewm15: number;
  readonly corners_total_ewm10: number;
}

export interface ClubFreeOpenStateV35Artifact extends ClubFreeOpenStateArtifact {
  readonly v3_5_extra_6_features: readonly string[];
  readonly horizon_goals_13_features: readonly string[];
  readonly clubs: Readonly<Record<string, ClubFreeOpenTeamStateV35>>;
}

export function evaluateClubV35CompactRow(params: {
  readonly features: readonly (number | null)[];
  readonly goalsFeatures: readonly (number | null)[];
  readonly div: string;
  readonly gbmArtifact: GbmArtifact;
  readonly goalsArtifact: HorizonGoalsModelArtifact;
}): {
  readonly logitProbs: readonly [number, number, number];
  readonly gbmCalProbs: readonly [number, number, number];
  readonly ensembleProbs: readonly [number, number, number];
  readonly tPoisson: number;
  readonly dc3Param: CoherentDixonColes3ParamResult;
} {
  const divIdx = params.gbmArtifact.div_levels.indexOf(params.div);
  const ev = evaluateCompactValidationRow(params.features, divIdx, params.gbmArtifact);

  const divOnehot = params.goalsArtifact.div_levels.map((lvl) => (lvl === params.div ? 1.0 : 0.0));
  const tPoisson = predictHorizonTotalGoals(params.goalsFeatures, divOnehot, params.goalsArtifact);

  const twoParam = solveDixonColes2ParamFrom1X2(
    {
      pHome: ev.ensemble[0],
      pDraw: ev.ensemble[1],
      pAway: ev.ensemble[2],
    },
    -0.1,
    params.goalsArtifact.max_goals_grid,
  );
  const wTot = params.goalsArtifact.w_total_poisson;
  const targetTot = wTot * tPoisson + (1.0 - wTot) * (twoParam.lamHome + twoParam.lamAway);
  const rhoPrior =
    params.goalsArtifact.div_rho_map[params.div] ?? params.goalsArtifact.default_rho;

  const dc3Param = solveCoherentDixonColes3Param({
    pHome: ev.ensemble[0],
    pDraw: ev.ensemble[1],
    pAway: ev.ensemble[2],
    totalGoalsTarget: targetTot,
    rhoPrior,
    rhoShrinkage: params.goalsArtifact.rho_shrinkage,
    maxGoals: params.goalsArtifact.max_goals_grid,
  });

  return Object.freeze({
    logitProbs: ev.logit,
    gbmCalProbs: ev.gbmCalibrated,
    ensembleProbs: ev.ensemble,
    tPoisson,
    dc3Param,
  });
}

export function synthesizeClubV35LiveVectors(params: {
  readonly sourceRow: SnapshotRow;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly hDivChange?: number;
  readonly aDivChange?: number;
  readonly seasonProgress?: number;
  readonly clubStateV35: ClubFreeOpenStateV35Artifact;
  readonly nFeaturesBase1X2: number;
}): {
  readonly features1X2: readonly (number | null)[];
  readonly goalsFeatures13: readonly number[];
  readonly coverageRatio: number;
} {
  const row52 = synthesizeClubV34LiveCompleteRow({
    sourceRow: params.sourceRow,
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    hDivChange: params.hDivChange,
    aDivChange: params.aDivChange,
    clubState: params.clubStateV35,
  });

  const liveNames = params.clubStateV35.live_base_38_features;
  const getLive38 = (nm: string, fb: number): number => {
    const idx = liveNames.indexOf(nm);
    if (idx < 0) return fb;
    const v = row52.features[idx];
    return typeof v === "number" && Number.isFinite(v) ? v : fb;
  };

  const eloDiff = getLive38("elo_diff_no_hfa", 0.0);
  const dcExpTotal = getLive38("dc_exp_total", 2.62);
  const eloClose = getLive38("elo_closeness", Math.exp(-Math.pow(eloDiff / 180.0, 2)));
  const lowScoringTight = getLive38("low_scoring_tight_match", 0.0);
  const sProg =
    params.seasonProgress !== undefined
      ? params.seasonProgress
      : getLive38("season_progress", 0.5);

  const hk = `${params.div}::${params.homeTeam}`;
  const ak = `${params.div}::${params.awayTeam}`;
  const sh = params.clubStateV35.clubs[hk];
  const sa = params.clubStateV35.clubs[ak];

  const sfH = sh?.sb_xg_for_ewm10 ?? 1.3;
  const saH = sh?.sb_xg_against_ewm10 ?? 1.25;
  const sfA = sa?.sb_xg_for_ewm10 ?? 1.25;
  const saA = sa?.sb_xg_against_ewm10 ?? 1.3;
  const gfH = sh?.goals_for_ewm12 ?? 1.32;
  const gaH = sh?.goals_against_ewm12 ?? 1.32;
  const gfA = sa?.goals_for_ewm12 ?? 1.32;
  const gaA = sa?.goals_against_ewm12 ?? 1.32;
  const btH = sh?.btts_rate_ewm15 ?? 0.51;
  const btA = sa?.btts_rate_ewm15 ?? 0.51;
  const coH = sh?.corners_total_ewm10 ?? 9.8;
  const coA = sa?.corners_total_ewm10 ?? 9.8;

  const sbAttDefDiff = 0.5 * (sfH - saA - (sfA - saH));
  const sbExpTot = 0.5 * (sfH + saA + (sfA + saH));
  const tempoSum = 0.5 * (gfH + gaH + (gfA + gaA));
  const bttsSum = 0.5 * (btH + btA);
  const corSum = 0.5 * (coH + coA);

  const free14Offset = 38;
  const readFeatureOr = (idx: number, fallback: number): number => {
    const v = row52.features[idx];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const valDiff = readFeatureOr(free14Offset + 1, 0.0);
  const promBoostDiff = readFeatureOr(free14Offset + 4, 0.0);
  const netTrDiff = readFeatureOr(free14Offset + 12, 0.0);

  const earlyW = Math.min(1.0, Math.max(0.0, 1.0 - sProg));
  const earlyTrShock = earlyW * netTrDiff;
  const earlyPromVal = earlyW * promBoostDiff;

  const depthH = sh && sh.tm_has_val > 0 ? sh.tm_depth_ratio : 0.26;
  const depthA = sa && sa.tm_has_val > 0 ? sa.tm_depth_ratio : 0.26;
  const thinH = Math.min(1.35, Math.max(0.5, 1.35 - depthH));
  const thinA = Math.min(1.35, Math.max(0.5, 1.35 - depthA));
  const cupThinAdv =
    (sa?.midweek_cup_load ?? 0.0) * thinA - (sh?.midweek_cup_load ?? 0.0) * thinH;
  const absEloMismatch = Math.abs(eloDiff) / 200.0;

  const curDivMed = params.clubStateV35.div_ewm_log_val[params.div] ?? 3.8;
  const relH = sh && sh.tm_has_val > 0 ? sh.tm_raw_log_val - curDivMed : 0.0;
  const relA = sa && sa.tm_has_val > 0 ? sa.tm_raw_log_val - curDivMed : 0.0;
  const tmValSum = relH + relA;
  const tmValAbs = Math.abs(valDiff);
  const xiGa90Sum =
    (sh && sh.has_realized_xi > 0 ? sh.xi_ga90_allcomps : 2.1) +
    (sa && sa.has_realized_xi > 0 ? sa.xi_ga90_allcomps : 2.1);
  const games14dSum = (sh?.games_14d_allcomps ?? 1.5) + (sa?.games_14d_allcomps ?? 1.5);

  const extra6 = [
    sbAttDefDiff,
    tempoSum,
    earlyTrShock,
    earlyPromVal,
    cupThinAdv,
    absEloMismatch,
  ];
  const features1X2 =
    params.nFeaturesBase1X2 === 58 ? [...row52.features, ...extra6] : [...row52.features];

  const goalsFeatures13 = [
    dcExpTotal,
    sbExpTot,
    tempoSum,
    bttsSum,
    corSum,
    tmValSum,
    tmValAbs,
    xiGa90Sum,
    absEloMismatch,
    eloClose,
    lowScoringTight,
    sProg,
    games14dSum,
  ];

  const validCount = features1X2.filter((v) => v !== null && Number.isFinite(v)).length;
  return Object.freeze({
    features1X2: Object.freeze(features1X2),
    goalsFeatures13: Object.freeze(goalsFeatures13),
    coverageRatio: validCount / Math.max(1, features1X2.length),
  });
}

export function buildClubV35CompleteOutlook(
  input: BuildClubV33OutlookInput & {
    readonly hDivChange?: number;
    readonly aDivChange?: number;
    readonly seasonProgress?: number;
  },
  artifacts: {
    readonly gbm: GbmArtifact;
    readonly goals: HorizonGoalsModelArtifact;
    readonly clubStateV35: ClubFreeOpenStateV35Artifact;
    readonly calibration?: OutlookCalibrationArtifact;
  },
): {
  readonly outlook: MatchOutlook;
  readonly ensembleProbs: readonly [number, number, number];
  readonly dc3Param: CoherentDixonColes3ParamResult;
  readonly coverageRatio: number;
} {
  const synth = synthesizeClubV35LiveVectors({
    sourceRow: input.row,
    div: input.row.div ?? input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    hDivChange: input.hDivChange,
    aDivChange: input.aDivChange,
    seasonProgress: input.seasonProgress,
    clubStateV35: artifacts.clubStateV35,
    nFeaturesBase1X2: artifacts.gbm.n_features_base,
  });

  const eval35 = evaluateClubV35CompactRow({
    features: synth.features1X2,
    goalsFeatures: synth.goalsFeatures13,
    div: input.row.div ?? input.league,
    gbmArtifact: artifacts.gbm,
    goalsArtifact: artifacts.goals,
  });

  const calArt = artifacts.calibration ?? getDefaultClubOutlookCalibration();
  const outlook = buildMatchOutlook({
    matchId: input.matchId,
    sport: "football",
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    tsDecision: input.tsDecisionUtc,
    kickoffUtc: input.kickoffUtc ?? null,
    football: {
      lamHome: eval35.dc3Param.lamHome,
      lamAway: eval35.dc3Param.lamAway,
      rho: eval35.dc3Param.rhoEff,
      featureCoverageRatio: synth.coverageRatio,
    },
    marketQuotes: input.marketQuotes,
    oddsSnapshots: input.oddsSnapshots,
    maxQuoteAgeMinutes: input.maxQuoteAgeMinutes,
    calibrationArtifact: calArt,
  });

  return Object.freeze({
    outlook,
    ensembleProbs: eval35.ensembleProbs,
    dc3Param: eval35.dc3Param,
    coverageRatio: synth.coverageRatio,
  });
}
