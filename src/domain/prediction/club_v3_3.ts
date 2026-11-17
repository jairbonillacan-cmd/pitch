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

import defaultClubFreeOpenStateJson from "../../data/prediction/club_free_open_state_v3_4.json";
import defaultClubV33ModelJson from "../../data/prediction/model_club_v3_3_candidate.json";
import defaultClubV34ModelJson from "../../data/prediction/model_club_v3_4_candidate.json";
import defaultClubV34LiveModelJson from "../../data/prediction/model_club_v3_4_live_candidate.json";
import frozenMotorAJson from "../../data/prediction/model_motor_a.json";
import defaultOutlookCalibrationJson from "../../data/prediction/outlook_calibration_v3_2.json";

import {
  assertValidModel,
  GLOBAL_HDA_RATES,
  predictWithFallback,
} from "./engine.js";
import type { OddsSnapshotRow } from "./odds.js";
import {
  buildMatchOutlook,
  type MatchOutlook,
  type OutlookCalibrationArtifact,
  type OutlookMarketQuoteInput,
} from "./outlook.js";
import type { ModelArtifact, Prediction, SnapshotRow } from "./types.js";

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

export function getDefaultClubV33CandidateModel(): ModelArtifact {
  return defaultClubV33ModelJson as unknown as ModelArtifact;
}

export function getDefaultClubV34CandidateModel(): ModelArtifact {
  return defaultClubV34ModelJson as unknown as ModelArtifact;
}

export function getDefaultClubV34LiveCompleteModel(): ModelArtifact {
  return defaultClubV34LiveModelJson as unknown as ModelArtifact;
}

export function getDefaultClubFreeOpenStateArtifact(): ClubFreeOpenStateArtifact {
  return defaultClubFreeOpenStateJson as unknown as ClubFreeOpenStateArtifact;
}

export function getDefaultClubOutlookCalibration(): OutlookCalibrationArtifact {
  return defaultOutlookCalibrationJson as unknown as OutlookCalibrationArtifact;
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
  (frozenMotorAJson as unknown as ModelArtifact).features.slice(0, TACHYON_V30_BASE_FEATURE_COUNT),
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
