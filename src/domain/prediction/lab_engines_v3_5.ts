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

import defaultClubStateV35Json from "../../data/prediction/club_free_open_state_v3_5.json";
import defaultGbmClubV35Json from "../../data/prediction/gbm_club_v3_5_live_candidate.json";
import defaultClubGoalsV35Json from "../../data/prediction/model_club_goals_v3_5_candidate.json";

import {
  buildClubV35CompleteOutlook,
  evaluateClubV35CompactRow,
  getDefaultClubOutlookCalibration,
  synthesizeClubV35LiveVectors,
  type BuildClubV33OutlookInput,
  type ClubFreeOpenStateV35Artifact,
} from "./club_v3_3.js";
import type { GbmArtifact } from "./gbm.js";
import type { CoherentDixonColes3ParamResult, HorizonGoalsModelArtifact } from "./horizon_goals.js";
import type { MatchOutlook, OutlookCalibrationArtifact } from "./outlook.js";

export const TACHYON_CLUB_V35_CODENAME = "PitchLab Tachyon v3.5 Live-Ensemble" as const;
export const TACHYON_GOALS_V35_CODENAME = "PitchLab Horizon-Goals v3.5" as const;

export function getDefaultClubV35GbmArtifact(): GbmArtifact {
  return defaultGbmClubV35Json as unknown as GbmArtifact;
}

export function getDefaultClubHorizonGoalsV35Artifact(): HorizonGoalsModelArtifact {
  return defaultClubGoalsV35Json as unknown as HorizonGoalsModelArtifact;
}

export function getDefaultClubFreeOpenStateV35Artifact(): ClubFreeOpenStateV35Artifact {
  return defaultClubStateV35Json as unknown as ClubFreeOpenStateV35Artifact;
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
} from "./intl_soccer.js";

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
} from "./nfl_v3_5.js";

export * from "./soccer_micro_markets.js";
export * from "./hierarchical_props.js";
export * from "./multisport_v3_6.js";
