/**
 * PitchLab Unified Candidate Lab Facade (`v3.5` + `v3.6`) —
 * Punto de entrada unificado para los motores candidatos cuantitativos de `prediction-lab`
 * sin alterar `src/domain/prediction/service.ts` ni los artefactos congelados `v3.1`/`v3.2`.
 *
 * Motores expuestos (`status = "candidate"`, `production_activated = false`):
 *  1. `Club Tachyon v3.5 Live-Ensemble` + `Horizon-Goals v3.5` (`EXP_V37`)
 *  2. `Selecciones Meridian v3.5 Ensemble` + `Horizon-Goals v3.5` (`EXP_V38`)
 *  3. `NFL Minkowski v3.5 Ensemble` + `Totals v3.5` (`EXP_V39`)
 *  4. `Soccer Micro-Markets v3.6` (`EXP_V40`: Córners NB acoplado + Tarjetas EB arbitral + 1H/2H DC)
 *  5. `Hierarchical Props v3.6` (`EXP_V41`: Poisson-Gamma -> NB + mezcla de exposición + Sub-Cover + Knockout)
 *  6. `Multi-Sport v3.6` (`EXP_V42`: MLB F5/Manfred/Openers, NHL Empty-Net/OT, NBA Impact Injuries/GTD)
 */

import defaultClubStateV35Json from "../data/club_free_open_state_v3_5.json";
import defaultGbmClubV35Json from "../data/gbm_club_v3_5_live_candidate.json";
import defaultClubGoalsV35Json from "../data/model_club_goals_v3_5_candidate.json";

import {
  buildClubV35CompleteOutlook,
  evaluateClubV35CompactRow,
  getDefaultClubOutlookCalibration,
  synthesizeClubV35LiveVectors,
  type BuildClubV33OutlookInput,
  type ClubFreeOpenStateV35Artifact,
} from "./club_v3_3";
import type { GbmArtifact } from "./gbm";
import type { CoherentDixonColes3ParamResult, HorizonGoalsModelArtifact } from "./horizon_goals";
import type { MatchOutlook, OutlookCalibrationArtifact } from "./outlook";

export const TACHYON_CLUB_V35_CODENAME = "PitchLab Tachyon v3.5 Live-Ensemble" as const;
export const TACHYON_GOALS_V35_CODENAME = "PitchLab Horizon-Goals v3.5" as const;

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

function isClubFreeOpenStateV35Artifact(value: unknown): value is ClubFreeOpenStateV35Artifact {
  return (
    isJsonRecord(value) &&
    typeof value.schema_version === "string" &&
    typeof value.n_active_clubs === "number" &&
    Array.isArray(value.live_base_38_features) &&
    Array.isArray(value.free_open_14_features) &&
    Array.isArray(value.v3_5_extra_6_features) &&
    Array.isArray(value.horizon_goals_13_features) &&
    isJsonRecord(value.div_ewm_log_val) &&
    isJsonRecord(value.div_ewm_xi_val) &&
    isJsonRecord(value.clubs)
  );
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

function parseClubFreeOpenStateV35Artifact(
  raw: unknown,
  label: string,
): ClubFreeOpenStateV35Artifact {
  if (!isClubFreeOpenStateV35Artifact(raw)) {
    throw new Error(`Invalid ClubFreeOpenStateV35Artifact JSON: ${label}`);
  }
  return raw;
}

const DEFAULT_CLUB_V35_GBM_ARTIFACT = parseGbmArtifact(
  defaultGbmClubV35Json,
  "gbm_club_v3_5_live_candidate.json",
);
const DEFAULT_CLUB_HORIZON_GOALS_V35_ARTIFACT = parseHorizonGoalsModelArtifact(
  defaultClubGoalsV35Json,
  "model_club_goals_v3_5_candidate.json",
);
const DEFAULT_CLUB_FREE_OPEN_STATE_V35_ARTIFACT = parseClubFreeOpenStateV35Artifact(
  defaultClubStateV35Json,
  "club_free_open_state_v3_5.json",
);

export function getDefaultClubV35GbmArtifact(): GbmArtifact {
  return DEFAULT_CLUB_V35_GBM_ARTIFACT;
}

export function getDefaultClubHorizonGoalsV35Artifact(): HorizonGoalsModelArtifact {
  return DEFAULT_CLUB_HORIZON_GOALS_V35_ARTIFACT;
}

export function getDefaultClubFreeOpenStateV35Artifact(): ClubFreeOpenStateV35Artifact {
  return DEFAULT_CLUB_FREE_OPEN_STATE_V35_ARTIFACT;
}

export function buildDefaultClubV35Outlook(
  input: BuildClubV33OutlookInput & {
    readonly hDivChange?: number;
    readonly aDivChange?: number;
    readonly seasonProgress?: number;
  },
  overrides?: {
    readonly gbm?: GbmArtifact;
    readonly goals?: HorizonGoalsModelArtifact;
    readonly clubStateV35?: ClubFreeOpenStateV35Artifact;
    readonly calibration?: OutlookCalibrationArtifact;
  },
): {
  readonly outlook: MatchOutlook;
  readonly ensembleProbs: readonly [number, number, number];
  readonly dc3Param: CoherentDixonColes3ParamResult;
  readonly coverageRatio: number;
} {
  return buildClubV35CompleteOutlook(input, {
    gbm: overrides?.gbm ?? getDefaultClubV35GbmArtifact(),
    goals: overrides?.goals ?? getDefaultClubHorizonGoalsV35Artifact(),
    clubStateV35: overrides?.clubStateV35 ?? getDefaultClubFreeOpenStateV35Artifact(),
    calibration: overrides?.calibration ?? getDefaultClubOutlookCalibration(),
  });
}

export {
  buildClubV35CompleteOutlook,
  evaluateClubV35CompactRow,
  synthesizeClubV35LiveVectors,
  type ClubFreeOpenStateV35Artifact,
};

export {
  buildMeridianV35MatchOutlook,
  evaluateMeridianV35CompactRow,
  extractIntlHorizonGoalsFeaturesFromV2,
  getDefaultIntlHorizonGoalsV35Artifact,
  getDefaultIntlV35GbmArtifact,
  MERIDIAN_V35_CODENAME,
} from "./intl_soccer";

export {
  buildNflV35CandidateOutlook,
  canonicalNflFranchise,
  computeNflTotalsOverUnderProbsV35,
  evaluateMinkowskiV35CompactRow,
  getDefaultNflCausalStateV35Artifact,
  getDefaultNflTotalsV35Artifact,
  getDefaultNflV35GbmArtifact,
  MINKOWSKI_TOTALS_V35_CODENAME,
  MINKOWSKI_V35_CODENAME,
  predictMinkowskiExpectedTotalV35,
  synthesizeNflV35LiveVectors,
  type BuildNflV35OutlookInput,
  type NFLCausalStateV35Artifact,
  type NFLTotalsV35Artifact,
  type SynthesizeNflV35LiveInput,
} from "./nfl_v3_5";

export * from "./soccer_micro_markets";
export * from "./hierarchical_props";
export * from "./multisport_v3_6";
