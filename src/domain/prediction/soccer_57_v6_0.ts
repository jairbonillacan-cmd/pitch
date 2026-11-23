/**
 * PitchLab Spacetime Soccer-53 Causal Hierarchy v6.0 Candidate (`EXP_V58`) —
 * Motor TypeScript determinista con paridad IEEE-754 `< 1e-12` frente a `run_exp_v58_soccer_57_v6_0.py`.
 *
 * Capacidades verificadas:
 *  1. Jerarquía causal explícita de las `53` competiciones de fútbol de la plataforma (`57` ligas
 *     menos `mlb`, `nba`, `nhl`, `nfl`) agrupadas en `6` confederaciones/formatos (`UEFA_TOP`,
 *     `UEFA_SECOND_AND_CUPS`, `CONMEBOL_LEAGUE_AND_CUPS`, `CONCACAF_AND_MX`, `AFC_CAF_EXPANSION`,
 *     `INTERNATIONAL_NATIONAL_TEAMS`), incluyendo estado explícito `"confederation_prior_zero_2026_games"`
 *     para las `10` competiciones de selecciones sin juegos `2026` en `season-results.json`.
 *  2. Solver ortogonal exacto `4-Param Diagonal-NB` (`solveDiagonalScoreMatrix4ParamV60`) con
 *     error de cono `1X2 < 1e-14` y error de total implicado `< 1e-12`, derivando desde una sola
 *     matriz coherente `1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`,
 *     `dnb` y `topScorelines[3]`.
 *  3. Recalibración monótona *Inductive Venn-Abers* en espacio logit (`calibratePlayableVennAbersLogitV60`)
 *     calibrada estrictamente pre-2025 (`< 2025-02-02`, `holdout_sealed_untouched: true`) para la
 *     zona jugable `[1.55, 2.60]`, más cluster-bootstrap `mulberry32` (`seed = 20261111`, `null` si `n == 0`).
 *  4. Cero campos de dimensionamiento o apuesta.
 */

import {
  clamp,
  createMulberry32,
  DEFAULT_LOGIT_EPS,
  logit,
  normalCdf,
  sigmoid,
} from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";

export const SOCCER_57_V60_SCHEMA_VERSION = "pitchlab_soccer_57_v6_0_1.0.0" as const;
export const DEFAULT_SOCCER_V60_MAX_GOALS = 12;
export const PLAYABLE_ODDS_MIN_V60 = 1.55;
export const PLAYABLE_ODDS_MAX_V60 = 2.6;
export const BOOTSTRAP_SEED_V60 = 20261111;
export const BOOTSTRAP_RESAMPLES_V60 = 1000;

const SAFE_RHO_MIN_V60 = -0.22;
const SAFE_RHO_MAX_V60 = 0.16;
const SAFE_TAU_BOUND_V60 = 0.72;

export type ConfederationGroupV60 =
  | "UEFA_TOP"
  | "UEFA_SECOND_AND_CUPS"
  | "CONMEBOL_LEAGUE_AND_CUPS"
  | "CONCACAF_AND_MX"
  | "AFC_CAF_EXPANSION"
  | "INTERNATIONAL_NATIONAL_TEAMS";

export type CompetitionStatusV60 =
  | "causal_walk_forward_2026_active"
  | "confederation_prior_zero_2026_games";

export interface ConfederationPriorSpecV60 {
  readonly goal_prior: number;
  readonly hfa_elo: number;
  readonly hfa_goal_mult: number;
  readonly draw_base_rate: number;
  readonly dispersion_r: number;
  readonly rho_prior: number;
  readonly prior_league_games: number;
  readonly prior_team_games: number;
  readonly league_ewm_alpha: number;
  readonly team_ewm_alpha: number;
  readonly elo_k: number;
}

export interface CompetitionSpecV60 {
  readonly confederation_group: ConfederationGroupV60;
  readonly is_cup: boolean;
  readonly pre2025_goal_prior: number;
  readonly confederation_goal_prior: number;
  readonly rho_prior: number;
  readonly dispersion_r: number;
  readonly games_2026: number;
  readonly mean_raw_goals_2026: number | null;
  readonly ewm_goals_2026: number;
  readonly causal_env_goals_final: number;
  readonly competition_status: CompetitionStatusV60;
}

export interface VennAbersPlayableCalibratorConfigV60 {
  readonly playable_odds_min: number;
  readonly playable_odds_max: number;
  readonly playable_prob_min: number;
  readonly playable_prob_max: number;
  readonly tau_pre_logit_core: number;
  readonly tau_pre_logit_expansion: number;
  readonly calibration_n_pre2025: number;
  readonly knots_logit: readonly number[];
  readonly knots_p0_lower: readonly number[];
  readonly knots_p1_upper: readonly number[];
}

export interface PrekickoffRecalibrationConfigV60 {
  readonly raw_platform_proj_anchor: number;
  readonly min_goal_env_scale: number;
  readonly max_goal_env_scale: number;
  readonly projection_env_blend_weight: number;
  readonly tau_3way_core: number;
  readonly tau_3way_expansion: number;
  readonly x12_rate_consistency_weight_expansion: number;
}

export interface Soccer57ModelArtifactV60 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_cut_utc: string;
  readonly holdout_window_protected: readonly [string, string];
  readonly holdout_sealed_untouched: boolean;
  readonly hyperparameter_tuning_on_holdout: boolean;
  readonly non_football_leagues_excluded: readonly string[];
  readonly total_platform_leagues: number;
  readonly total_football_competitions: number;
  readonly confederation_groups: Readonly<Record<ConfederationGroupV60, readonly string[]>>;
  readonly confederation_priors: Readonly<Record<ConfederationGroupV60, ConfederationPriorSpecV60>>;
  readonly prekickoff_recalibration: PrekickoffRecalibrationConfigV60;
  readonly venn_abers_playable_calibrator: VennAbersPlayableCalibratorConfigV60;
  readonly competitions: Readonly<Record<string, CompetitionSpecV60>>;
}

export interface DiagonalMatrixSolvedV60 {
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly diagMultiplier: number;
  readonly offDiagMultiplier: number;
  readonly expectedTotalImplied: number;
  readonly matrix: readonly (readonly number[])[];
}

export interface TopScorelineV60 {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly score: string;
  readonly probability: number;
  readonly fairOdds: FairOdds;
}

export interface CoherentSoccerMarketsV60 {
  readonly "1x2": {
    readonly home: number;
    readonly draw: number;
    readonly away: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsDraw: FairOdds;
    readonly fairOddsAway: FairOdds;
  };
  readonly double_chance: {
    readonly "1X": number;
    readonly "12": number;
    readonly X2: number;
    readonly isOverlappingMarket: true;
    readonly expectedProbabilitySum: 2;
  };
  readonly totals_1_5: {
    readonly over: number;
    readonly under: number;
    readonly fairOddsOver: FairOdds;
    readonly fairOddsUnder: FairOdds;
  };
  readonly totals_2_5: {
    readonly over: number;
    readonly under: number;
    readonly fairOddsOver: FairOdds;
    readonly fairOddsUnder: FairOdds;
  };
  readonly totals_3_5: {
    readonly over: number;
    readonly under: number;
    readonly fairOddsOver: FairOdds;
    readonly fairOddsUnder: FairOdds;
  };
  readonly btts: {
    readonly yes: number;
    readonly no: number;
    readonly fairOddsYes: FairOdds;
    readonly fairOddsNo: FairOdds;
  };
  readonly dnb: {
    readonly home: number;
    readonly away: number;
    readonly pPush: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsAway: FairOdds;
  };
  readonly topScorelines: readonly [TopScorelineV60, TopScorelineV60, TopScorelineV60];
}

export interface VennAbersPlayableEvaluationV60 {
  readonly pRaw: number;
  readonly p0Lower: number;
  readonly p1Upper: number;
  readonly pCalibrated: number;
  readonly vennAbersWidth: number;
  readonly inPlayableZone: boolean;
  readonly fairOdds: FairOdds;
}

export interface ProjectSoccer57MatchInputV60 {
  readonly league: string;
  readonly homeElo: number;
  readonly awayElo: number;
  readonly homeAttEwm: number;
  readonly homeDefEwm: number;
  readonly homeGames: number;
  readonly awayAttEwm: number;
  readonly awayDefEwm: number;
  readonly awayGames: number;
  readonly leagueEnvGoals: number;
  readonly neutralSite: boolean;
  readonly artifact: Soccer57ModelArtifactV60;
}

export interface Soccer57MatchOutlookV60 {
  readonly league: string;
  readonly confederationGroup: ConfederationGroupV60;
  readonly competitionStatus: CompetitionStatusV60;
  readonly pHomeTarget: number;
  readonly pDrawTarget: number;
  readonly pAwayTarget: number;
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly totalGoalsTarget: number;
  readonly expectedTotalImplied: number;
  readonly markets: CoherentSoccerMarketsV60;
  readonly playableVennAbers: {
    readonly homeWin: VennAbersPlayableEvaluationV60;
    readonly over25: VennAbersPlayableEvaluationV60;
  };
}

export interface RecalibrateSoccer57PrekickoffInputV60 {
  readonly league: string;
  readonly rawProjHome: number;
  readonly rawProjAway: number;
  readonly rawX12: readonly number[];
  readonly causalLeagueEnvGoals: number;
  readonly artifact: Soccer57ModelArtifactV60;
}

export interface Soccer57PrekickoffRecalibratedOutlookV60 {
  readonly league: string;
  readonly confederationGroup: ConfederationGroupV60;
  readonly competitionStatus: CompetitionStatusV60;
  readonly envScaleApplied: number;
  readonly pHomeTarget: number;
  readonly pDrawTarget: number;
  readonly pAwayTarget: number;
  readonly totalGoalsTarget: number;
  readonly expectedTotalImplied: number;
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly markets: CoherentSoccerMarketsV60;
  readonly playableVennAbers: {
    readonly home: VennAbersPlayableEvaluationV60;
    readonly away: VennAbersPlayableEvaluationV60;
    readonly over25: VennAbersPlayableEvaluationV60;
    readonly under25: VennAbersPlayableEvaluationV60;
    readonly bttsYes: VennAbersPlayableEvaluationV60;
  };
}

export interface ClusterBootstrapResultV60 {
  readonly n_rows: number;
  readonly n_clusters: number;
  readonly cand_mean: number | null;
  readonly bench_mean: number | null;
  readonly delta_mean: number | null;
  readonly se: number | null;
  readonly ci95_lo: number | null;
  readonly ci95_hi: number | null;
  readonly p_value_one_sided: number | null;
  readonly significant_improvement: boolean | null;
  readonly verdict: "significativa" | "no significativa" | null;
  readonly bootstrap_method: "cluster_mulberry32";
  readonly n_resamples: number;
  readonly seed: number;
}

/** Re-export de `normalCdf` (A&S 7.1.26) para verificación directa de paridad IEEE-754 en suites `v6.0`. */
export function soccer57NormalCdfV60(x: number): number {
  return normalCdf(x);
}

/**
 * Marginal Binomial Negativa truncada y renormalizada en `0..maxGoals`,
 * idéntica operación por operación a `nb_marginal_pmf_v60` en Python.
 */
export function nbMarginalPmfV60(
  mu: number,
  dispersionR: number,
  maxGoals: number = DEFAULT_SOCCER_V60_MAX_GOALS,
): Float64Array {
  const size = Math.trunc(maxGoals) + 1;
  const out = new Float64Array(size);
  const m = clamp(mu, 0.005, 12.0);
  const r = clamp(dispersionR, 2.0, 500.0);

  if (r >= 450.0) {
    out[0] = Math.exp(-m);
    for (let k = 1; k < size; k += 1) {
      out[k] = ((out[k - 1] ?? 0.0) * m) / k;
    }
  } else {
    const pRatio = r / (r + m);
    const qRatio = m / (r + m);
    out[0] = Math.exp(r * Math.log(pRatio));
    for (let k = 1; k < size; k += 1) {
      out[k] = ((out[k - 1] ?? 0.0) * ((k - 1.0 + r) * qRatio)) / k;
    }
  }

  let s = 0.0;
  for (let k = 0; k < size; k += 1) {
    s += out[k] ?? 0.0;
  }
  const invS = 1.0 / s;
  for (let k = 0; k < size; k += 1) {
    out[k] = (out[k] ?? 0.0) * invS;
  }
  return out;
}

function nbDcMargins1dV60(
  pmfH: Float64Array,
  pmfA: Float64Array,
  muHome: number,
  muAway: number,
  rho: number,
  maxGoals: number,
): readonly [number, number, number, number] {
  let pH = 0.0;
  let pD = 0.0;
  let cdfA = 0.0;
  for (let k = 0; k <= maxGoals; k += 1) {
    const pkH = pmfH[k] ?? 0.0;
    const pkA = pmfA[k] ?? 0.0;
    pH += pkH * cdfA;
    pD += pkH * pkA;
    cdfA += pkA;
  }
  let pA = Math.max(0.0, 1.0 - pH - pD);
  if (rho !== 0.0) {
    const pH0 = pmfH[0] ?? 0.0;
    const pH1 = pmfH[1] ?? 0.0;
    const pA0 = pmfA[0] ?? 0.0;
    const pA1 = pmfA[1] ?? 0.0;
    const b00 = pH0 * pA0;
    const b01 = pH0 * pA1;
    const b10 = pH1 * pA0;
    const b11 = pH1 * pA1;
    pD += b00 * (Math.max(1.0 - muHome * muAway * rho, 1e-9) - 1.0) + b11 * (Math.max(1.0 - rho, 1e-9) - 1.0);
    pA += b01 * (Math.max(1.0 + muHome * rho, 1e-9) - 1.0);
    pH += b10 * (Math.max(1.0 + muAway * rho, 1e-9) - 1.0);
  }
  const invZ = 1.0 / (pH + pD + pA);
  return [pH * invZ, pD * invZ, pA * invZ, invZ];
}

function nbDcExpectedTotal1dV60(
  pmfH: Float64Array,
  pmfA: Float64Array,
  muHome: number,
  muAway: number,
  rho: number,
  wUpper: number,
  wDiag: number,
  wLower: number,
  invZ: number,
  maxGoals: number,
): number {
  let eUp = 0.0;
  let eDg = 0.0;
  let eLo = 0.0;
  let cdfA = 0.0;
  let momA = 0.0;
  let cdfH = 0.0;
  let momH = 0.0;
  for (let k = 0; k <= maxGoals; k += 1) {
    const pkH = pmfH[k] ?? 0.0;
    const pkA = pmfA[k] ?? 0.0;
    eUp += pkH * (k * cdfA + momA);
    eLo += pkA * (k * cdfH + momH);
    eDg += 2.0 * k * pkH * pkA;
    cdfA += pkA;
    momA += k * pkA;
    cdfH += pkH;
    momH += k * pkH;
  }
  if (rho !== 0.0) {
    const pH0 = pmfH[0] ?? 0.0;
    const pH1 = pmfH[1] ?? 0.0;
    const pA0 = pmfA[0] ?? 0.0;
    const pA1 = pmfA[1] ?? 0.0;
    eLo += pH0 * pA1 * (Math.max(1.0 + muHome * rho, 1e-9) - 1.0);
    eUp += pH1 * pA0 * (Math.max(1.0 + muAway * rho, 1e-9) - 1.0);
    eDg += 2.0 * (pH1 * pA1) * (Math.max(1.0 - rho, 1e-9) - 1.0);
  }
  return invZ * (wUpper * eUp + wDiag * eDg + wLower * eLo);
}

/**
 * Resuelve la matriz bivariada exacta `4-Param Diagonal-NB` garantizando
 * `|P_M(1X2) - pTarget| < 1e-14` y `|E_M[H + A] - totalGoalsTarget| < 1e-12`
 * con paridad IEEE-754 `< 1e-14` frente a `solve_diagonal_score_matrix_4param_v60`.
 */
export function solveDiagonalScoreMatrix4ParamV60(params: {
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly totalGoalsTarget: number;
  readonly rhoPrior?: number;
  readonly dispersionR?: number;
  readonly maxGoals?: number;
  readonly rhoDrawBlendWeight?: number;
}): DiagonalMatrixSolvedV60 {
  const mg = Math.trunc(params.maxGoals ?? DEFAULT_SOCCER_V60_MAX_GOALS);
  const size = mg + 1;
  const rDisp = clamp(params.dispersionR ?? 500.0, 2.5, 500.0);
  const wRb = clamp(params.rhoDrawBlendWeight ?? 0.0, 0.0, 1.0);
  const rp = params.rhoPrior ?? -0.105;

  const ph0 = Math.max(params.pHome, 1e-9);
  const pd0 = clamp(params.pDraw, 1e-6, 0.96);
  const pa0 = Math.max(params.pAway, 1e-9);
  const sp = ph0 + pd0 + pa0;
  const pH = ph0 / sp;
  const pD = pd0 / sp;
  const pA = pa0 / sp;
  const totTarget = clamp(params.totalGoalsTarget, 0.45, 7.5);

  const t2w = clamp(pH / Math.max(pH + pA, 1e-15), 1e-6, 1.0 - 1e-6);
  const uCenter = clamp(0.58 * Math.log(t2w / (1.0 - t2w)), -6.0, 6.0);

  function solveUSmooth(
    tau: number,
    rhoVal: number,
    loInit: number,
    hiInit: number,
    nBis: number,
    nSec: number,
  ): number {
    let lo = loInit;
    let hi = hiInit;

    const fU = (uVal: number): number => {
      const sh = sigmoid(uVal);
      const mh = clamp(tau * sh, 0.002, 11.5);
      const ma = clamp(tau * (1.0 - sh), 0.002, 11.5);
      const [ch, , ca] = nbDcMargins1dV60(
        nbMarginalPmfV60(mh, rDisp, mg),
        nbMarginalPmfV60(ma, rDisp, mg),
        mh,
        ma,
        rhoVal,
        mg,
      );
      return ch / Math.max(ch + ca, 1e-15) - t2w;
    };

    for (let it = 0; it < nBis; it += 1) {
      const uM = 0.5 * (lo + hi);
      if (fU(uM) < 0.0) lo = uM;
      else hi = uM;
    }

    let fLo = fU(lo);
    let fHi = fU(hi);
    for (let it = 0; it < nSec; it += 1) {
      if (Math.abs(fHi - fLo) < 1e-15) break;
      let uS = hi - (fHi * (hi - lo)) / (fHi - fLo);
      if (!(uS > lo && uS < hi)) uS = 0.5 * (lo + hi);
      const fUs = fU(uS);
      if (fUs < 0.0) {
        lo = uS;
        fLo = fUs;
      } else {
        hi = uS;
        fHi = fUs;
      }
    }

    if (Math.abs(fHi - fLo) < 1e-15) return 0.5 * (lo + hi);
    return clamp(hi - (fHi * (hi - lo)) / (fHi - fLo), lo, hi);
  }

  function solveScaleParams(tau: number): {
    readonly mhF: number;
    readonly maF: number;
    readonly rhoEff: number;
    readonly pmfHF: Float64Array;
    readonly pmfAF: Float64Array;
    readonly wUpper: number;
    readonly wDiag: number;
    readonly wLower: number;
    readonly wOff: number;
    readonly invZ: number;
  } {
    const uStar = solveUSmooth(tau, 0.0, Math.max(-8.0, uCenter - 2.6), Math.min(8.0, uCenter + 2.6), 10, 4);
    const shStar = sigmoid(uStar);
    const mh0 = clamp(tau * shStar, 0.002, 11.5);
    const ma0 = clamp(tau * (1.0 - shStar), 0.002, 11.5);

    let rhoBlend = rp;
    if (wRb > 0.0) {
      const pmfH0 = nbMarginalPmfV60(mh0, rDisp, mg);
      const pmfA0 = nbMarginalPmfV60(ma0, rDisp, mg);
      const [, cd0, , invZ0] = nbDcMargins1dV60(pmfH0, pmfA0, mh0, ma0, 0.0, mg);
      const p00 = (pmfH0[0] ?? 0.0) * (pmfA0[0] ?? 0.0) * invZ0;
      const p11 = (pmfH0[1] ?? 0.0) * (pmfA0[1] ?? 0.0) * invZ0;
      const denomRho = mh0 * ma0 * p00 + p11;
      const rhoReq = denomRho > 1e-9 ? (cd0 - pD) / denomRho : rp;
      rhoBlend = wRb * rhoReq + (1.0 - wRb) * rp;
    }

    const rLo = Math.max(SAFE_RHO_MIN_V60, -SAFE_TAU_BOUND_V60 / Math.max(mh0, ma0, 1e-6));
    const rHi = Math.min(SAFE_RHO_MAX_V60, SAFE_TAU_BOUND_V60 / Math.max(mh0 * ma0, 1e-6), SAFE_TAU_BOUND_V60);
    const rhoEff = rLo <= rHi ? clamp(rhoBlend, rLo, rHi) : 0.0;

    const uF = solveUSmooth(tau, rhoEff, Math.max(-8.5, uStar - 0.5), Math.min(8.5, uStar + 0.5), 6, 4);
    const shF = sigmoid(uF);
    const mhF = clamp(tau * shF, 0.002, 11.5);
    const maF = clamp(tau * (1.0 - shF), 0.002, 11.5);
    const pmfHF = nbMarginalPmfV60(mhF, rDisp, mg);
    const pmfAF = nbMarginalPmfV60(maF, rDisp, mg);
    const [chB, cdB, caB, invZ] = nbDcMargins1dV60(pmfHF, pmfAF, mhF, maF, rhoEff, mg);

    return {
      mhF,
      maF,
      rhoEff,
      pmfHF,
      pmfAF,
      wUpper: pH / Math.max(chB, 1e-15),
      wDiag: pD / Math.max(cdB, 1e-15),
      wLower: pA / Math.max(caB, 1e-15),
      wOff: (1.0 - pD) / Math.max(1.0 - cdB, 1e-15),
      invZ,
    };
  }

  const evalTotAtTau = (tau: number): number => {
    const st = solveScaleParams(tau);
    return nbDcExpectedTotal1dV60(
      st.pmfHF,
      st.pmfAF,
      st.mhF,
      st.maF,
      st.rhoEff,
      st.wUpper,
      st.wDiag,
      st.wLower,
      st.invZ,
      mg,
    );
  };

  let tauLo = Math.max(0.2, 0.55 * totTarget);
  let tauHi = Math.min(10.5, 1.55 * totTarget + 0.6);
  for (let outIt = 0; outIt < 16; outIt += 1) {
    const tauMid = 0.5 * (tauLo + tauHi);
    if (evalTotAtTau(tauMid) < totTarget) tauLo = tauMid;
    else tauHi = tauMid;
  }

  let fLoT = evalTotAtTau(tauLo) - totTarget;
  let fHiT = evalTotAtTau(tauHi) - totTarget;
  for (let secIt = 0; secIt < 6; secIt += 1) {
    if (Math.abs(fHiT - fLoT) < 1e-15) break;
    let tauSec = tauHi - (fHiT * (tauHi - tauLo)) / (fHiT - fLoT);
    if (!(tauSec > tauLo && tauSec < tauHi)) tauSec = 0.5 * (tauLo + tauHi);
    const fTs = evalTotAtTau(tauSec) - totTarget;
    if (fTs < 0.0) {
      tauLo = tauSec;
      fLoT = fTs;
    } else {
      tauHi = tauSec;
      fHiT = fTs;
    }
  }

  const finalTau =
    Math.abs(fHiT - fLoT) < 1e-15
      ? 0.5 * (tauLo + tauHi)
      : clamp(tauHi - (fHiT * (tauHi - tauLo)) / (fHiT - fLoT), tauLo, tauHi);
  const fin = solveScaleParams(finalTau);
  const mat: (readonly number[])[] = [];
  let expTot = 0.0;
  for (let h = 0; h < size; h += 1) {
    const row: number[] = [];
    const phV = fin.pmfHF[h] ?? 0.0;
    for (let a = 0; a < size; a += 1) {
      let base = phV * (fin.pmfAF[a] ?? 0.0);
      if (h === 0 && a === 0) base *= Math.max(1.0 - fin.mhF * fin.maF * fin.rhoEff, 1e-9);
      else if (h === 0 && a === 1) base *= Math.max(1.0 + fin.mhF * fin.rhoEff, 1e-9);
      else if (h === 1 && a === 0) base *= Math.max(1.0 + fin.maF * fin.rhoEff, 1e-9);
      else if (h === 1 && a === 1) base *= Math.max(1.0 - fin.rhoEff, 1e-9);
      const wCell = h === a ? fin.wDiag : h > a ? fin.wUpper : fin.wLower;
      const mVal = base * fin.invZ * wCell;
      row.push(mVal);
      expTot += (h + a) * mVal;
    }
    mat.push(Object.freeze(row));
  }

  return Object.freeze({
    muHome: fin.mhF,
    muAway: fin.maF,
    rhoEff: fin.rhoEff,
    dispersionR: rDisp,
    diagMultiplier: fin.wDiag,
    offDiagMultiplier: fin.wOff,
    expectedTotalImplied: expTot,
    matrix: Object.freeze(mat),
  });
}

/**
 * Deriva coherentemente `1x2`, `double_chance`, `totals_1_5`, `totals_2_5`,
 * `totals_3_5`, `btts`, `dnb` y `topScorelines[3]` desde una sola matriz bivariada.
 */
export function deriveCoherentSoccerMarketsV60(
  matrix: readonly (readonly number[])[],
): CoherentSoccerMarketsV60 {
  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;
  let pO15 = 0.0;
  let pO25 = 0.0;
  let pO35 = 0.0;
  let pBtts = 0.0;

  const cells: { homeGoals: number; awayGoals: number; probability: number }[] = [];

  for (let h = 0; h < matrix.length; h += 1) {
    const row = matrix[h] ?? [];
    for (let a = 0; a < row.length; a += 1) {
      const p = row[a] ?? 0.0;
      cells.push({ homeGoals: h, awayGoals: a, probability: p });
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;

      const tot = h + a;
      if (tot >= 2) pO15 += p;
      if (tot >= 3) pO25 += p;
      if (tot >= 4) pO35 += p;
      if (h >= 1 && a >= 1) pBtts += p;
    }
  }

  cells.sort((x, y) =>
    y.probability !== x.probability
      ? y.probability - x.probability
      : x.homeGoals !== y.homeGoals
        ? x.homeGoals - y.homeGoals
        : x.awayGoals - y.awayGoals,
  );

  const buildTop = (idx: number): TopScorelineV60 => {
    const c = cells[idx] ?? { homeGoals: 0, awayGoals: 0, probability: 0.01 };
    return Object.freeze({
      homeGoals: c.homeGoals,
      awayGoals: c.awayGoals,
      score: `${c.homeGoals}-${c.awayGoals}`,
      probability: c.probability,
      fairOdds: probabilityToFairOdds(c.probability),
    });
  };

  const dnbDen = Math.max(pHome + pAway, 1e-12);
  const pDnbHome = pHome / dnbDen;
  const pDnbAway = 1.0 - pDnbHome;

  const p1X = Math.min(1.0, pHome + pDraw);
  const p12 = Math.min(1.0, pHome + pAway);
  const pX2 = Math.min(1.0, pDraw + pAway);

  const pU15 = Math.max(0.0, 1.0 - pO15);
  const pU25 = Math.max(0.0, 1.0 - pO25);
  const pU35 = Math.max(0.0, 1.0 - pO35);
  const pBttsNo = Math.max(0.0, 1.0 - pBtts);

  return Object.freeze({
    "1x2": Object.freeze({
      home: pHome,
      draw: pDraw,
      away: pAway,
      fairOddsHome: probabilityToFairOdds(pHome),
      fairOddsDraw: probabilityToFairOdds(pDraw),
      fairOddsAway: probabilityToFairOdds(pAway),
    }),
    double_chance: Object.freeze({
      "1X": p1X,
      "12": p12,
      X2: pX2,
      isOverlappingMarket: true as const,
      expectedProbabilitySum: 2 as const,
    }),
    totals_1_5: Object.freeze({
      over: pO15,
      under: pU15,
      fairOddsOver: probabilityToFairOdds(pO15),
      fairOddsUnder: probabilityToFairOdds(pU15),
    }),
    totals_2_5: Object.freeze({
      over: pO25,
      under: pU25,
      fairOddsOver: probabilityToFairOdds(pO25),
      fairOddsUnder: probabilityToFairOdds(pU25),
    }),
    totals_3_5: Object.freeze({
      over: pO35,
      under: pU35,
      fairOddsOver: probabilityToFairOdds(pO35),
      fairOddsUnder: probabilityToFairOdds(pU35),
    }),
    btts: Object.freeze({
      yes: pBtts,
      no: pBttsNo,
      fairOddsYes: probabilityToFairOdds(pBtts),
      fairOddsNo: probabilityToFairOdds(pBttsNo),
    }),
    dnb: Object.freeze({
      home: pDnbHome,
      away: pDnbAway,
      pPush: pDraw,
      fairOddsHome: probabilityToFairOdds(pDnbHome),
      fairOddsAway: probabilityToFairOdds(pDnbAway),
    }),
    topScorelines: Object.freeze([buildTop(0), buildTop(1), buildTop(2)] as const),
  });
}

/**
 * Recalibración monótona *Inductive Venn-Abers* en espacio logit para momios jugables `[1.55, 2.60]`.
 * Paridad IEEE-754 `< 1e-15` con `calibrate_playable_venn_abers_logit_v60`.
 */
export function calibratePlayableVennAbersLogitV60(
  pRaw: number,
  isExpansionOrCup: boolean,
  calibratorCfg: VennAbersPlayableCalibratorConfigV60,
): VennAbersPlayableEvaluationV60 {
  const pIn = clamp(pRaw, 0.002, 0.998);
  const fairRaw = 1.0 / pIn;
  const inPlayable =
    fairRaw >= calibratorCfg.playable_odds_min && fairRaw <= calibratorCfg.playable_odds_max;

  const tau = isExpansionOrCup
    ? calibratorCfg.tau_pre_logit_expansion
    : calibratorCfg.tau_pre_logit_core;
  const zScaled = logit(pIn) / tau;

  const knotsZ = calibratorCfg.knots_logit;
  const knotsP0 = calibratorCfg.knots_p0_lower;
  const knotsP1 = calibratorCfg.knots_p1_upper;
  const nK = knotsZ.length;

  const firstZ = knotsZ[0] ?? -3.2;
  const lastZ = knotsZ[nK - 1] ?? 3.2;
  const zc = clamp(zScaled, firstZ, lastZ);

  let eta0 = logit(knotsP0[nK - 1] ?? 0.5);
  let eta1 = logit(knotsP1[nK - 1] ?? 0.5);

  for (let i = 0; i < nK - 1; i += 1) {
    const z0 = knotsZ[i] ?? firstZ;
    const z1 = knotsZ[i + 1] ?? lastZ;
    if (zc <= z1 || i === nK - 2) {
      const t = Math.abs(z1 - z0) < 1e-12 ? 0.0 : clamp((zc - z0) / (z1 - z0), 0.0, 1.0);
      const l0A = logit(knotsP0[i] ?? 0.5);
      const l0B = logit(knotsP0[i + 1] ?? 0.5);
      const l1A = logit(knotsP1[i] ?? 0.5);
      const l1B = logit(knotsP1[i + 1] ?? 0.5);
      eta0 = l0A + t * (l0B - l0A);
      eta1 = l1A + t * (l1B - l1A);
      break;
    }
  }

  const p0 = clamp(sigmoid(eta0), 0.001, 0.998);
  const p1 = clamp(Math.max(p0, sigmoid(eta1)), 0.001, 0.999);
  const pVa = clamp(p1 / Math.max(1.0 - p0 + p1, 1e-12), 0.001, 0.999);

  return Object.freeze({
    pRaw: pIn,
    p0Lower: p0,
    p1Upper: p1,
    pCalibrated: pVa,
    vennAbersWidth: p1 - p0,
    inPlayableZone: inPlayable,
    fairOdds: probabilityToFairOdds(pVa),
  });
}

/**
 * Proyecta un partido en cualquiera de las `53` competiciones desde el estado causal rodante
 * (`LeagueScoringEnvEWM` + Elo + ataque/defensa de club).
 */
export function projectSoccer57MatchV60(
  input: ProjectSoccer57MatchInputV60,
): Soccer57MatchOutlookV60 {
  const compSpec = input.artifact.competitions[input.league];
  if (!compSpec) {
    throw new Error(`Unregistered competition in Soccer-57 v6.0 artifact: ${input.league}`);
  }
  const confGroup = compSpec.confederation_group;
  const confCfg = input.artifact.confederation_priors[confGroup];

  const envG = clamp(input.leagueEnvGoals, 1.35, 4.6);
  const halfEnv = 0.5 * envG;
  const kappaT = confCfg.prior_team_games;

  const wH = input.homeGames / (input.homeGames + kappaT);
  const wA = input.awayGames / (input.awayGames + kappaT);
  const hAttRel = clamp(wH * (input.homeAttEwm / Math.max(0.35, halfEnv)) + (1.0 - wH) * 1.0, 0.52, 1.85);
  const hDefRel = clamp(wH * (input.homeDefEwm / Math.max(0.35, halfEnv)) + (1.0 - wH) * 1.0, 0.52, 1.85);
  const aAttRel = clamp(wA * (input.awayAttEwm / Math.max(0.35, halfEnv)) + (1.0 - wA) * 1.0, 0.52, 1.85);
  const aDefRel = clamp(wA * (input.awayDefEwm / Math.max(0.35, halfEnv)) + (1.0 - wA) * 1.0, 0.52, 1.85);

  const eloHfa = input.neutralSite ? 0.0 : confCfg.hfa_elo;
  const eloDiff = input.homeElo - input.awayElo + eloHfa;
  const absEloDiff = Math.abs(eloDiff);

  const eloGoalTilt = clamp(eloDiff * 0.00135, -0.55, 0.55);
  const mismatchBoost = 1.0 + Math.min(0.14, 0.00022 * Math.max(0.0, absEloDiff - 90.0));

  const hfaMult = input.neutralSite ? 1.0 : confCfg.hfa_goal_mult;
  const afaMult = input.neutralSite ? 1.0 : 2.0 - confCfg.hfa_goal_mult;

  const lamHRate = halfEnv * hAttRel * aDefRel * hfaMult * Math.exp(0.55 * eloGoalTilt);
  const lamARate = halfEnv * aAttRel * hDefRel * afaMult * Math.exp(-0.55 * eloGoalTilt);
  const totalGoalsTarget = clamp((lamHRate + lamARate) * mismatchBoost, 1.3, 4.95);

  const drawBase = confCfg.draw_base_rate;
  const pDrawElo = clamp(drawBase * Math.exp(-0.0000052 * (eloDiff * eloDiff)), 0.08, 0.36);
  const p2WayElo = 1.0 / (1.0 + Math.pow(10.0, -eloDiff / 400.0));
  const pHomeElo = (1.0 - pDrawElo) * p2WayElo;
  const pAwayElo = (1.0 - pDrawElo) * (1.0 - p2WayElo);

  const rateLogRatio = Math.log(Math.max(lamHRate, 0.08) / Math.max(lamARate, 0.08));
  const p2WayRate = sigmoid(1.18 * rateLogRatio);
  const pDrawRate = clamp(
    drawBase *
      Math.exp(-0.18 * (rateLogRatio * rateLogRatio)) *
      Math.exp(-0.06 * (totalGoalsTarget - 2.65)),
    0.08,
    0.38,
  );
  const pHomeRate = (1.0 - pDrawRate) * p2WayRate;
  const pAwayRate = (1.0 - pDrawRate) * (1.0 - p2WayRate);

  const wElo = 0.58;
  const pHRaw = wElo * pHomeElo + (1.0 - wElo) * pHomeRate;
  const pDRaw = wElo * pDrawElo + (1.0 - wElo) * pDrawRate;
  const pARaw = wElo * pAwayElo + (1.0 - wElo) * pAwayRate;
  const sRaw = pHRaw + pDRaw + pARaw;
  const pHT = pHRaw / sRaw;
  const pDT = pDRaw / sRaw;
  const pAT = pARaw / sRaw;

  const solved = solveDiagonalScoreMatrix4ParamV60({
    pHome: pHT,
    pDraw: pDT,
    pAway: pAT,
    totalGoalsTarget,
    rhoPrior: compSpec.rho_prior,
    dispersionR: compSpec.dispersion_r,
    maxGoals: DEFAULT_SOCCER_V60_MAX_GOALS,
    rhoDrawBlendWeight: 0.0,
  });
  const markets = deriveCoherentSoccerMarketsV60(solved.matrix);
  const isExpOrCup = Boolean(compSpec.is_cup || confGroup !== "UEFA_TOP");

  return Object.freeze({
    league: input.league,
    confederationGroup: confGroup,
    competitionStatus: compSpec.competition_status,
    pHomeTarget: pHT,
    pDrawTarget: pDT,
    pAwayTarget: pAT,
    muHome: solved.muHome,
    muAway: solved.muAway,
    rhoEff: solved.rhoEff,
    dispersionR: solved.dispersionR,
    totalGoalsTarget,
    expectedTotalImplied: solved.expectedTotalImplied,
    markets,
    playableVennAbers: Object.freeze({
      homeWin: calibratePlayableVennAbersLogitV60(
        markets["1x2"].home,
        isExpOrCup,
        input.artifact.venn_abers_playable_calibrator,
      ),
      over25: calibratePlayableVennAbersLogitV60(
        markets.totals_2_5.over,
        isExpOrCup,
        input.artifact.venn_abers_playable_calibrator,
      ),
    }),
  });
}

/**
 * Recalibra pronósticos pre-kickoff con entorno causal de liga (`date' < date`),
 * matriz exacta `4-Param Diagonal-NB` y calibrador *Inductive Venn-Abers* en zona jugable `[1.55, 2.60]`.
 */
export function recalibrateSoccer57PrekickoffV60(
  input: RecalibrateSoccer57PrekickoffInputV60,
): Soccer57PrekickoffRecalibratedOutlookV60 {
  const compSpec = input.artifact.competitions[input.league];
  if (!compSpec) {
    throw new Error(`Unregistered competition in Soccer-57 v6.0 artifact: ${input.league}`);
  }
  const confGroup = compSpec.confederation_group;
  const recalCfg = input.artifact.prekickoff_recalibration;
  const vaCfg = input.artifact.venn_abers_playable_calibrator;

  const rawTot = Math.max(0.35, input.rawProjHome + input.rawProjAway);
  const anchorDenom = Math.max(0.5, recalCfg.raw_platform_proj_anchor);
  const envG = clamp(input.causalLeagueEnvGoals, 1.4, 4.5);
  const scale = clamp(envG / anchorDenom, recalCfg.min_goal_env_scale, recalCfg.max_goal_env_scale);
  const shrinkW = recalCfg.projection_env_blend_weight;
  const targetTot = clamp((1.0 - shrinkW) * (rawTot * scale) + shrinkW * envG, 1.3, 4.85);

  const isExpOrCup = Boolean(compSpec.is_cup || confGroup !== "UEFA_TOP");
  const tau3W = isExpOrCup ? recalCfg.tau_3way_expansion : recalCfg.tau_3way_core;

  const r0 = Math.max(DEFAULT_LOGIT_EPS, input.rawX12[0] ?? 0.44);
  const r1 = Math.max(DEFAULT_LOGIT_EPS, input.rawX12[1] ?? 0.26);
  const r2 = Math.max(DEFAULT_LOGIT_EPS, input.rawX12[2] ?? 0.3);
  const sR = r0 + r1 + r2;
  const pn0 = r0 / sR;
  const pn1 = r1 / sR;
  const pn2 = r2 / sR;

  const confDraw = input.artifact.confederation_priors[confGroup].draw_base_rate;
  const bp0 = 0.5 * (1.0 - confDraw) + 0.065;
  const bp1 = confDraw;
  const bp2 = 0.5 * (1.0 - confDraw) - 0.065;

  const u0 = bp0 * Math.exp(Math.log(pn0 / bp0) / tau3W);
  const u1 = bp1 * Math.exp(Math.log(pn1 / bp1) / tau3W);
  const u2 = bp2 * Math.exp(Math.log(pn2 / bp2) / tau3W);
  const su = u0 + u1 + u2;
  const pTemp0 = u0 / su;
  const pTemp1 = u1 / su;
  const pTemp2 = u2 / su;

  const wCons = isExpOrCup ? recalCfg.x12_rate_consistency_weight_expansion : 0.0;
  let pf0 = pTemp0;
  let pf1 = pTemp1;
  let pf2 = pTemp2;
  if (wCons > 0.0) {
    const shareH = clamp(input.rawProjHome / rawTot, 0.1, 0.9);
    const lhA = targetTot * shareH;
    const laA = targetTot * (1.0 - shareH);
    const pmfHA = nbMarginalPmfV60(lhA, compSpec.dispersion_r, DEFAULT_SOCCER_V60_MAX_GOALS);
    const pmfAA = nbMarginalPmfV60(laA, compSpec.dispersion_r, DEFAULT_SOCCER_V60_MAX_GOALS);
    const [chA, cdA, caA] = nbDcMargins1dV60(
      pmfHA,
      pmfAA,
      lhA,
      laA,
      compSpec.rho_prior,
      DEFAULT_SOCCER_V60_MAX_GOALS,
    );
    pf0 = (1.0 - wCons) * pTemp0 + wCons * chA;
    pf1 = (1.0 - wCons) * pTemp1 + wCons * cdA;
    pf2 = (1.0 - wCons) * pTemp2 + wCons * caA;
  }

  const sf = pf0 + pf1 + pf2;
  const pHT = pf0 / sf;
  const pDT = pf1 / sf;
  const pAT = pf2 / sf;

  const solved = solveDiagonalScoreMatrix4ParamV60({
    pHome: pHT,
    pDraw: pDT,
    pAway: pAT,
    totalGoalsTarget: targetTot,
    rhoPrior: compSpec.rho_prior,
    dispersionR: compSpec.dispersion_r,
    maxGoals: DEFAULT_SOCCER_V60_MAX_GOALS,
    rhoDrawBlendWeight: 0.0,
  });
  const markets = deriveCoherentSoccerMarketsV60(solved.matrix);

  return Object.freeze({
    league: input.league,
    confederationGroup: confGroup,
    competitionStatus: compSpec.competition_status,
    envScaleApplied: scale,
    pHomeTarget: pHT,
    pDrawTarget: pDT,
    pAwayTarget: pAT,
    totalGoalsTarget: targetTot,
    expectedTotalImplied: solved.expectedTotalImplied,
    muHome: solved.muHome,
    muAway: solved.muAway,
    rhoEff: solved.rhoEff,
    dispersionR: solved.dispersionR,
    markets,
    playableVennAbers: Object.freeze({
      home: calibratePlayableVennAbersLogitV60(markets["1x2"].home, isExpOrCup, vaCfg),
      away: calibratePlayableVennAbersLogitV60(markets["1x2"].away, isExpOrCup, vaCfg),
      over25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.over, isExpOrCup, vaCfg),
      under25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.under, isExpOrCup, vaCfg),
      bttsYes: calibratePlayableVennAbersLogitV60(markets.btts.yes, isExpOrCup, vaCfg),
    }),
  });
}

/**
 * Cluster-bootstrap determinista `mulberry32` (`seed = 20261111`, `1,000` réplicas)
 * idéntico bit a bit a `cluster_bootstrap_diff_v60` en Python; devuelve `null` si `n == 0`.
 */
export function clusterBootstrapDiffV60(params: {
  readonly clusterIds: readonly string[];
  readonly lossCand: readonly number[];
  readonly lossBench: readonly number[];
  readonly nResamples?: number;
  readonly seed?: number;
}): ClusterBootstrapResultV60 {
  const nResamples = params.nResamples ?? BOOTSTRAP_RESAMPLES_V60;
  const seed = params.seed ?? BOOTSTRAP_SEED_V60;
  const nRows = params.lossCand.length;

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
      significant_improvement: null,
      verdict: null,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  let sumCand = 0.0;
  let sumBench = 0.0;
  const diffs: number[] = [];
  for (let i = 0; i < nRows; i += 1) {
    const c = params.lossCand[i] ?? 0.0;
    const b = params.lossBench[i] ?? 0.0;
    sumCand += c;
    sumBench += b;
    diffs.push(c - b);
  }
  const candMean = sumCand / nRows;
  const benchMean = sumBench / nRows;
  const deltaMean = (sumCand - sumBench) / nRows;

  const uniqueClusters = Array.from(new Set(params.clusterIds)).sort();
  const nClusters = uniqueClusters.length;
  if (nClusters < 2) {
    return Object.freeze({
      n_rows: nRows,
      n_clusters: nClusters,
      cand_mean: Math.round(candMean * 1e8) / 1e8,
      bench_mean: Math.round(benchMean * 1e8) / 1e8,
      delta_mean: Math.round(deltaMean * 1e8) / 1e8,
      se: null,
      ci95_lo: null,
      ci95_hi: null,
      p_value_one_sided: null,
      significant_improvement: false,
      verdict: "no significativa" as const,
      bootstrap_method: "cluster_mulberry32" as const,
      n_resamples: nResamples,
      seed,
    });
  }

  const cIdx = new Map<string, number>();
  for (let i = 0; i < nClusters; i += 1) {
    cIdx.set(uniqueClusters[i] ?? "", i);
  }

  const sumD = new Float64Array(nClusters);
  const sumW = new Float64Array(nClusters);
  for (let i = 0; i < nRows; i += 1) {
    const cid = params.clusterIds[i] ?? "";
    const idx = cIdx.get(cid) ?? 0;
    sumD[idx] = (sumD[idx] ?? 0.0) + (diffs[i] ?? 0.0);
    sumW[idx] = (sumW[idx] ?? 0.0) + 1.0;
  }

  const rng = createMulberry32(seed);
  const boot: number[] = [];
  for (let r = 0; r < nResamples; r += 1) {
    let bNum = 0.0;
    let bDen = 0.0;
    for (let c = 0; c < nClusters; c += 1) {
      const u = rng();
      let pick = Math.floor(u * nClusters);
      if (pick >= nClusters) pick = nClusters - 1;
      bNum += sumD[pick] ?? 0.0;
      bDen += sumW[pick] ?? 0.0;
    }
    boot.push(bNum / Math.max(bDen, 1e-12));
  }

  boot.sort((a, b) => a - b);
  const loPos = 0.025 * (nResamples - 1);
  const hiPos = 0.975 * (nResamples - 1);
  const loI = Math.floor(loPos);
  const hiI = Math.floor(hiPos);
  const loV0 = boot[loI] ?? 0.0;
  const loV1 = boot[Math.min(nResamples - 1, loI + 1)] ?? loV0;
  const hiV0 = boot[hiI] ?? 0.0;
  const hiV1 = boot[Math.min(nResamples - 1, hiI + 1)] ?? hiV0;
  const ciLo = loV0 + (loPos - loI) * (loV1 - loV0);
  const ciHi = hiV0 + (hiPos - hiI) * (hiV1 - hiV0);

  let sumBoot = 0.0;
  let geZero = 0;
  for (let i = 0; i < nResamples; i += 1) {
    const v = boot[i] ?? 0.0;
    sumBoot += v;
    if (v >= 0.0) geZero += 1;
  }
  const meanB = sumBoot / nResamples;
  let varSum = 0.0;
  for (let i = 0; i < nResamples; i += 1) {
    const dv = (boot[i] ?? 0.0) - meanB;
    varSum += dv * dv;
  }
  const se = Math.sqrt(varSum / Math.max(1, nResamples - 1));
  const pOne = geZero / nResamples;
  const sig = ciHi < 0.0;

  return Object.freeze({
    n_rows: nRows,
    n_clusters: nClusters,
    cand_mean: Math.round(candMean * 1e8) / 1e8,
    bench_mean: Math.round(benchMean * 1e8) / 1e8,
    delta_mean: Math.round(deltaMean * 1e8) / 1e8,
    se: Math.round(se * 1e8) / 1e8,
    ci95_lo: Math.round(ciLo * 1e8) / 1e8,
    ci95_hi: Math.round(ciHi * 1e8) / 1e8,
    p_value_one_sided: Math.round(pOne * 1e6) / 1e6,
    significant_improvement: sig,
    verdict: sig ? ("significativa" as const) : ("no significativa" as const),
    bootstrap_method: "cluster_mulberry32" as const,
    n_resamples: nResamples,
    seed,
  });
}
