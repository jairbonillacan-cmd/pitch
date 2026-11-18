/**
 * PitchLab Conformal Epistemic Uncertainty Engine (`v5.0` · `EXP_V56`) —
 * Cuantifica para cada probabilidad emitida un intervalo epistémico calibrado al `90%`
 * `[pLower90, pUpper90]` en espacio Logit (`0 < pLower90 < pPoint < pUpper90 < 1`),
 * integrando:
 *   1. Tamaño efectivo de muestra histórica (`effectiveSampleGames`),
 *   2. Divergencia epistémica entre familias de modelos (`|pLogit - pGbm|`),
 *   3. Shocks estructurales (`newCoachOrQb`, `seasonProgress`, `missingKeyStarters`),
 *   4. Factor de escala Split-Conformal (`conformalScale90`) calibrado fuera de muestra (`< 2025-02-02`).
 *
 * Cero campos de apuesta (`stake`, `kelly`, `ev`, `tier`).
 */

import { clamp, sigmoid } from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";

export const EPISTEMIC_CONFORMAL_SCHEMA_VERSION = "epistemic_conformal_v5.0.0" as const;
const Z_90_TWO_SIDED = 1.6448536269514722;

export type EpistemicConfidenceGrade =
  | "high_sample_stability"
  | "moderate_uncertainty"
  | "elevated_roster_or_early_season_variance";

export interface EpistemicProbabilityBandV5 {
  readonly pPoint: number;
  readonly pLower90: number;
  readonly pUpper90: number;
  readonly halfWidth90: number;
  readonly logitStdError: number;
  readonly conservativeFairOddsFromLower90: FairOdds;
  readonly confidenceGrade: EpistemicConfidenceGrade;
}

export interface EpistemicUncertaintyInputV5 {
  readonly pPoint: number;
  readonly effectiveSampleGames?: number;
  readonly pSubModelA?: number | null;
  readonly pSubModelB?: number | null;
  readonly seasonProgress?: number;
  readonly hasRecentCoachOrQbChange?: boolean;
  readonly missingKeyStarters?: number;
  readonly conformalScale90?: number;
}

/**
 * Calcula la banda epistémica conformal al 90% en espacio Logit garantizando
 * invariancia de soporte `0.001 <= pLower90 <= pPoint <= pUpper90 <= 0.999`.
 */
export function computeConformalEpistemicBandV5(
  input: EpistemicUncertaintyInputV5,
): EpistemicProbabilityBandV5 {
  const p = clamp(input.pPoint, 0.002, 0.998);
  const eta = Math.log(p / (1.0 - p));

  const nEff = clamp(input.effectiveSampleGames ?? 24.0, 2.0, 120.0);
  const fisherInfo = nEff * p * (1.0 - p) + 4.5;
  const sampleVar = 1.0 / fisherInfo;

  let ensembleVar = 0.0;
  if (
    typeof input.pSubModelA === "number" &&
    Number.isFinite(input.pSubModelA) &&
    typeof input.pSubModelB === "number" &&
    Number.isFinite(input.pSubModelB)
  ) {
    const pA = clamp(input.pSubModelA, 0.002, 0.998);
    const pB = clamp(input.pSubModelB, 0.002, 0.998);
    const dEta = Math.abs(Math.log(pA / (1.0 - pA)) - Math.log(pB / (1.0 - pB)));
    ensembleVar = 0.35 * dEta * dEta;
  }

  const sProg = clamp(input.seasonProgress ?? 0.55, 0.0, 1.0);
  const earlySeasonTerm = sProg < 0.25 ? 0.028 * ((0.25 - sProg) / 0.25) : 0.0;
  const changeTerm = input.hasRecentCoachOrQbChange ? 0.036 : 0.0;
  const missingCount = clamp(input.missingKeyStarters ?? 0, 0, 6);
  const missingTerm = 0.012 * missingCount;

  const confScale = clamp(input.conformalScale90 ?? 1.04, 0.65, 2.25);
  const sigmaEta =
    confScale * Math.sqrt(sampleVar + ensembleVar + earlySeasonTerm + changeTerm + missingTerm);

  const pLo = clamp(sigmoid(eta - Z_90_TWO_SIDED * sigmaEta), 0.001, p);
  const pHi = clamp(sigmoid(eta + Z_90_TWO_SIDED * sigmaEta), p, 0.999);
  const halfWidth = 0.5 * (pHi - pLo);

  const grade: EpistemicConfidenceGrade =
    halfWidth <= 0.055
      ? "high_sample_stability"
      : halfWidth <= 0.095
        ? "moderate_uncertainty"
        : "elevated_roster_or_early_season_variance";

  return Object.freeze({
    pPoint: p,
    pLower90: pLo,
    pUpper90: pHi,
    halfWidth90: halfWidth,
    logitStdError: sigmaEta,
    conservativeFairOddsFromLower90: probabilityToFairOdds(clamp(pLo, 0.001, 0.999)),
    confidenceGrade: grade,
  });
}

export interface MatchEpistemicSummaryV5 {
  readonly homeBand90: EpistemicProbabilityBandV5;
  readonly drawBand90: EpistemicProbabilityBandV5 | null;
  readonly awayBand90: EpistemicProbabilityBandV5;
  readonly overallConfidenceGrade: EpistemicConfidenceGrade;
}

export function buildMatchEpistemicSummaryV5(params: {
  readonly pHome: number;
  readonly pDraw: number | null;
  readonly pAway: number;
  readonly effectiveSampleGames?: number;
  readonly seasonProgress?: number;
  readonly hasRecentCoachOrQbChange?: boolean;
  readonly missingKeyStarters?: number;
  readonly conformalScale90?: number;
}): MatchEpistemicSummaryV5 {
  const homeBand = computeConformalEpistemicBandV5({
    pPoint: params.pHome,
    effectiveSampleGames: params.effectiveSampleGames,
    seasonProgress: params.seasonProgress,
    hasRecentCoachOrQbChange: params.hasRecentCoachOrQbChange,
    missingKeyStarters: params.missingKeyStarters,
    conformalScale90: params.conformalScale90,
  });
  const awayBand = computeConformalEpistemicBandV5({
    pPoint: params.pAway,
    effectiveSampleGames: params.effectiveSampleGames,
    seasonProgress: params.seasonProgress,
    hasRecentCoachOrQbChange: params.hasRecentCoachOrQbChange,
    missingKeyStarters: params.missingKeyStarters,
    conformalScale90: params.conformalScale90,
  });
  const drawBand =
    params.pDraw !== null
      ? computeConformalEpistemicBandV5({
          pPoint: params.pDraw,
          effectiveSampleGames: params.effectiveSampleGames,
          seasonProgress: params.seasonProgress,
          hasRecentCoachOrQbChange: params.hasRecentCoachOrQbChange,
          missingKeyStarters: params.missingKeyStarters,
          conformalScale90: params.conformalScale90,
        })
      : null;

  const maxHalf = Math.max(homeBand.halfWidth90, awayBand.halfWidth90);
  const overallGrade: EpistemicConfidenceGrade =
    maxHalf <= 0.055
      ? "high_sample_stability"
      : maxHalf <= 0.095
        ? "moderate_uncertainty"
        : "elevated_roster_or_early_season_variance";

  return Object.freeze({
    homeBand90: homeBand,
    drawBand90: drawBand,
    awayBand90: awayBand,
    overallConfidenceGrade: overallGrade,
  });
}
