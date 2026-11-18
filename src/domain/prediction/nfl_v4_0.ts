/**
 * PitchLab Minkowski v4.0 (`EXP_V45`) —
 * Motor candidato de NFL en TypeScript puro con:
 *  1. PMF Discreta de Números Clave (`±3, ±6, ±7, ±10, ±14`) por inclinación exponencial exacta
 *     resuelta mediante bisección 1D de 56 pasos (`< 1e-14` conservación 1X2 y masa exacta de `push`).
 *  2. Totales desacoplados: volatilidad física real del juego (`sigma_game_physical ≈ 13.5`) vs
 *     contracción Bayesiana posterior hacia línea de mercado (`mu_post = w_m * T_model + (1 - w_m) * L_mkt`).
 *  3. Motor empírico de NFL Player Props validado sobre `pbp_pruned_2012..2024.parquet` (`< 2025-02-02`)
 *     con Reasignación de Volumen por Baja (`Vacancy Carry Redistribution`).
 */

import { clamp, normalCdf } from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";
import { computeNegativeBinomialPmfExact } from "./soccer_micro_markets.js";

export const NFL_V4_SCHEMA_VERSION = "nfl_minkowski_v4.0.0" as const;

export interface NflKeyNumbersModelArtifactV4 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly max_abs_margin: number;
  readonly positive_margin_kernel_1_to_45: readonly number[];
  readonly totals_calibration: {
    readonly sigma_game_physical: number;
    readonly market_posterior_w_model: number;
    readonly sigma_market_posterior: number;
  };
}

export interface NflPropMarketSpecV4 {
  readonly canonical_line: number;
  readonly max_k: number;
  readonly dispersion_r: number;
  readonly feature_names: readonly string[];
  readonly coef: readonly number[];
  readonly intercept: number;
}

export interface NflPlayerPropsModelArtifactV4 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly markets: Readonly<Record<"pass_attempts" | "completions" | "rush_attempts", NflPropMarketSpecV4>>;
}

export interface NflSpreadProjectionV4 {
  readonly spreadHome: number;
  readonly pHomeCover: number;
  readonly pAwayCover: number;
  readonly pPush: number;
  readonly pHomeCoverNoPush: number;
  readonly pAwayCoverNoPush: number;
  readonly fairOddsHomeCover: FairOdds;
  readonly fairOddsAwayCover: FairOdds;
}

export interface NflTotalLineProjectionV4 {
  readonly totalLine: number;
  readonly expectedTotalUsed: number;
  readonly sigmaUsed: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly pOverNoPush: number;
  readonly pUnderNoPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
}

export interface NflKeyNumberMarginSolutionV4 {
  readonly theta: number;
  readonly expectedMargin: number;
  readonly maxAbsMargin: number;
  readonly pmf: Float64Array;
}

/**
 * Resuelve por bisección monótona 1D de 56 pasos el parámetro `theta` de inclinación exponencial
 * sobre el kernel empírico de márgenes NFL `|M| = 1..45`, preservando `(pHome, pTie, pAway)` a `< 1e-14`.
 */
export function solveNflKeyNumberMarginPmfExact(params: {
  readonly pHome: number;
  readonly pTie: number;
  readonly pAway: number;
  readonly artifact: NflKeyNumbersModelArtifactV4;
}): NflKeyNumberMarginSolutionV4 {
  const maxM = params.artifact.max_abs_margin;
  const kernel = params.artifact.positive_margin_kernel_1_to_45;

  let ph = Math.max(params.pHome, 1e-9);
  let pt = Math.max(params.pTie, 1e-9);
  let pa = Math.max(params.pAway, 1e-9);
  const s3 = ph + pt + pa;
  ph /= s3;
  pt /= s3;
  pa /= s3;

  const nonTie = ph + pa;
  const targetCond = clamp(ph / Math.max(nonTie, 1e-12), 1e-6, 1.0 - 1e-6);

  let lo = -0.65;
  let hi = 0.65;
  for (let it = 0; it < 56; it += 1) {
    const mid = 0.5 * (lo + hi);
    let posS = 0.0;
    let negS = 0.0;
    for (let idx = 0; idx < maxM; idx += 1) {
      const m = idx + 1;
      const km = kernel[idx]!;
      posS += km * Math.exp(mid * m);
      negS += km * Math.exp(-mid * m);
    }
    const ratio = posS / Math.max(posS + negS, 1e-30);
    if (ratio < targetCond) lo = mid;
    else hi = mid;
  }

  const theta = 0.5 * (lo + hi);
  const pmf = new Float64Array(2 * maxM + 1);
  const center = maxM;
  pmf[center] = pt;

  let posS = 0.0;
  let negS = 0.0;
  for (let idx = 0; idx < maxM; idx += 1) {
    const m = idx + 1;
    const km = kernel[idx]!;
    posS += km * Math.exp(theta * m);
    negS += km * Math.exp(-theta * m);
  }

  const invDen = nonTie / Math.max(posS + negS, 1e-30);
  let expectedMargin = 0.0;
  for (let idx = 0; idx < maxM; idx += 1) {
    const mInt = idx + 1;
    const km = kernel[idx]!;
    const pPos = km * Math.exp(theta * mInt) * invDen;
    const pNeg = km * Math.exp(-theta * mInt) * invDen;
    pmf[center + mInt] = pPos;
    pmf[center - mInt] = pNeg;
    expectedMargin += mInt * (pPos - pNeg);
  }

  return {
    theta,
    expectedMargin,
    maxAbsMargin: maxM,
    pmf,
  };
}

export function projectNflSpreadFromMarginPmfExact(
  sol: NflKeyNumberMarginSolutionV4,
  spreadHome: number,
): NflSpreadProjectionV4 {
  const center = sol.maxAbsMargin;
  let pHomeCover = 0.0;
  let pAwayCover = 0.0;
  let pPush = 0.0;

  for (let idx = 0; idx < sol.pmf.length; idx += 1) {
    const p = sol.pmf[idx]!;
    if (p <= 0.0) continue;
    const val = idx - center + spreadHome;
    if (Math.abs(val) < 1e-9) pPush += p;
    else if (val > 0.0) pHomeCover += p;
    else pAwayCover += p;
  }

  const act = pHomeCover + pAwayCover;
  const phNoPush = act > 1e-12 ? clamp(pHomeCover / act, 0.001, 0.999) : 0.5;
  const paNoPush = 1.0 - phNoPush;

  return Object.freeze({
    spreadHome,
    pHomeCover,
    pAwayCover,
    pPush,
    pHomeCoverNoPush: phNoPush,
    pAwayCoverNoPush: paNoPush,
    fairOddsHomeCover: probabilityToFairOdds(phNoPush),
    fairOddsAwayCover: probabilityToFairOdds(paNoPush),
  });
}

export function computeNflNormalTotalProbExact(
  totalLine: number,
  expectedTotal: number,
  sigma: number,
): NflTotalLineProjectionV4 {
  const sg = Math.max(sigma, 1.0);
  let pOver: number;
  let pUnder: number;
  let pPush: number;

  if (Math.abs(totalLine - Math.round(totalLine)) < 1e-9) {
    const thr = Math.round(totalLine);
    pOver = 1.0 - normalCdf((thr + 0.5 - expectedTotal) / sg);
    pUnder = normalCdf((thr - 0.5 - expectedTotal) / sg);
    pPush = Math.max(0.0, 1.0 - pOver - pUnder);
  } else {
    pOver = clamp(normalCdf((expectedTotal - totalLine) / sg), 1e-9, 1.0 - 1e-9);
    pUnder = 1.0 - pOver;
    pPush = 0.0;
  }

  const act = pOver + pUnder;
  const poNoPush = act > 1e-12 ? clamp(pOver / act, 0.001, 0.999) : 0.5;
  const puNoPush = 1.0 - poNoPush;

  return Object.freeze({
    totalLine,
    expectedTotalUsed: expectedTotal,
    sigmaUsed: sg,
    pOver,
    pUnder,
    pPush,
    pOverNoPush: poNoPush,
    pUnderNoPush: puNoPush,
    fairOddsOver: probabilityToFairOdds(poNoPush),
    fairOddsUnder: probabilityToFairOdds(puNoPush),
  });
}

export function projectNflTotalsOutlookV4(params: {
  readonly modelExpectedTotal: number;
  readonly artifact: NflKeyNumbersModelArtifactV4;
  readonly objectiveLines?: readonly number[];
  readonly marketTotalLine?: number | null;
}): {
  readonly modelExpectedTotal: number;
  readonly objectiveProjections: readonly NflTotalLineProjectionV4[];
  readonly marketPosteriorProjection: NflTotalLineProjectionV4 | null;
} {
  const cal = params.artifact.totals_calibration;
  const lines = params.objectiveLines ?? [40.5, 43.5, 44.5, 47.5];
  const objectiveProjections = lines.map((ln) =>
    computeNflNormalTotalProbExact(ln, params.modelExpectedTotal, cal.sigma_game_physical),
  );

  let marketPosteriorProjection: NflTotalLineProjectionV4 | null = null;
  if (typeof params.marketTotalLine === "number" && Number.isFinite(params.marketTotalLine)) {
    const wm = cal.market_posterior_w_model;
    const muPost = wm * params.modelExpectedTotal + (1.0 - wm) * params.marketTotalLine;
    marketPosteriorProjection = computeNflNormalTotalProbExact(
      params.marketTotalLine,
      muPost,
      cal.sigma_market_posterior,
    );
  }

  return Object.freeze({
    modelExpectedTotal: params.modelExpectedTotal,
    objectiveProjections: Object.freeze(objectiveProjections),
    marketPosteriorProjection,
  });
}

export function projectNflPlayerPropV4(params: {
  readonly market: "pass_attempts" | "completions" | "rush_attempts";
  readonly features4: readonly [number, number, number, number];
  readonly line?: number;
  readonly artifact: NflPlayerPropsModelArtifactV4;
}): {
  readonly market: "pass_attempts" | "completions" | "rush_attempts";
  readonly line: number;
  readonly expectedMean: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly pOverNoPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
} {
  const spec = params.artifact.markets[params.market];
  let eta = spec.intercept;
  for (let i = 0; i < 4; i += 1) {
    eta += spec.coef[i]! * params.features4[i]!;
  }
  const expectedMean = clamp(Math.exp(eta), 1.0, 50.0);
  const pmf = computeNegativeBinomialPmfExact(expectedMean, spec.dispersion_r, spec.max_k);
  const ln = params.line ?? spec.canonical_line;

  const isInt = Math.abs(ln - Math.round(ln)) < 1e-9;
  let pOver: number;
  let pUnder: number;
  let pPush = 0.0;
  if (isInt) {
    const kLine = Math.round(ln);
    pPush = kLine >= 0 && kLine < pmf.length ? pmf[kLine]! : 0.0;
    let sumU = 0.0;
    const lim = Math.max(0, Math.min(kLine, pmf.length));
    for (let k = 0; k < lim; k += 1) sumU += pmf[k]!;
    pUnder = sumU;
    pOver = Math.max(0.0, 1.0 - pUnder - pPush);
  } else {
    const kFloor = Math.floor(ln);
    let sumU = 0.0;
    const lim = Math.max(0, Math.min(kFloor + 1, pmf.length));
    for (let k = 0; k < lim; k += 1) sumU += pmf[k]!;
    pUnder = sumU;
    pOver = Math.max(0.0, 1.0 - pUnder);
  }

  const act = pOver + pUnder;
  const poNoPush = act > 1e-12 ? clamp(pOver / act, 0.001, 0.999) : 0.5;

  return Object.freeze({
    market: params.market,
    line: ln,
    expectedMean,
    pOver,
    pUnder,
    pPush,
    pOverNoPush: poNoPush,
    fairOddsOver: probabilityToFairOdds(poNoPush),
    fairOddsUnder: probabilityToFairOdds(1.0 - poNoPush),
  });
}

// ============================================================================
// PitchLab Minkowski v5.0 (`EXP_V52`: Drift-Free Discrete Key-Total PMF, Real ATS, Overtime & Sacks/QB-Rush Props)
// ============================================================================

export const NFL_V5_SCHEMA_VERSION = "nfl_minkowski_v5.0.0" as const;

export type NflPropMarketKeyV5 =
  | "pass_attempts"
  | "completions"
  | "rush_attempts"
  | "qb_sacks_taken"
  | "qb_rush_attempts";

export interface NflModelArtifactV5 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly max_abs_margin: number;
  readonly positive_margin_kernel_1_to_45: readonly number[];
  readonly discrete_totals_v5: {
    readonly max_total_points: number;
    readonly base_kernel_0_to_95: readonly number[];
    readonly quad_concentration: number;
    readonly market_posterior_w_model: number;
    readonly latest_league_scoring_env: number;
  };
  readonly overtime_calibration: {
    readonly feature_names: readonly string[];
    readonly coef: readonly number[];
    readonly intercept: number;
  };
  readonly prop_markets: Readonly<Record<NflPropMarketKeyV5, NflPropMarketSpecV4>>;
}

export interface NflDiscreteTotalSolutionV5 {
  readonly theta: number;
  readonly expectedTotalImplied: number;
  readonly pmf: Float64Array;
}

/**
 * Construye por inclinación exponencial exacta (52 pasos de bisección 1D) la PMF discreta de puntos totales NFL
 * `P(Total = k)` en `k = 0..95`, preservando los picos empíricos reales en totales clave
 * (`33, 37, 40, 41, 43, 44, 47, 48, 51, 54`), clavando `E[Total] == expectedTotal` (`< 1e-12`)
 * y otorgando masa exacta de `push` en líneas enteras (`41.0, 44.0, 47.0`).
 */
export function solveNflDiscreteKeyTotalPmfExactV5(params: {
  readonly expectedTotal: number;
  readonly artifact: NflModelArtifactV5;
}): NflDiscreteTotalSolutionV5 {
  const spec = params.artifact.discrete_totals_v5;
  const maxK = spec.max_total_points;
  const baseK = spec.base_kernel_0_to_95;
  const cQuad = spec.quad_concentration;
  const target = clamp(params.expectedTotal, 26.0, 68.0);

  const logBase = new Float64Array(maxK + 1);
  for (let k = 0; k <= maxK; k += 1) {
    const diff = k - target;
    logBase[k] = Math.log(Math.max(baseK[k]!, 1e-15)) - cQuad * diff * diff;
  }

  let lo = -0.45;
  let hi = 0.45;
  for (let it = 0; it < 52; it += 1) {
    const mid = 0.5 * (lo + hi);
    let maxLp = -1e30;
    for (let k = 0; k <= maxK; k += 1) {
      const lp = logBase[k]! + mid * k;
      if (lp > maxLp) maxLp = lp;
    }
    let sumW = 0.0;
    let sumKW = 0.0;
    for (let k = 0; k <= maxK; k += 1) {
      const w = Math.exp(logBase[k]! + mid * k - maxLp);
      sumW += w;
      sumKW += k * w;
    }
    const meanMid = sumKW / Math.max(sumW, 1e-30);
    if (meanMid < target) lo = mid;
    else hi = mid;
  }

  const theta = 0.5 * (lo + hi);
  let maxLp = -1e30;
  for (let k = 0; k <= maxK; k += 1) {
    const lp = logBase[k]! + theta * k;
    if (lp > maxLp) maxLp = lp;
  }
  const pmf = new Float64Array(maxK + 1);
  let sumW = 0.0;
  for (let k = 0; k <= maxK; k += 1) {
    const w = Math.exp(logBase[k]! + theta * k - maxLp);
    pmf[k] = w;
    sumW += w;
  }
  const invS = 1.0 / Math.max(sumW, 1e-30);
  let impMean = 0.0;
  for (let k = 0; k <= maxK; k += 1) {
    pmf[k] = pmf[k]! * invS;
    impMean += k * pmf[k]!;
  }

  return {
    theta,
    expectedTotalImplied: impMean,
    pmf,
  };
}

export function projectNflDiscreteKeyTotalPmfV5(params: {
  readonly modelExpectedTotal: number;
  readonly artifact: NflModelArtifactV5;
  readonly objectiveLines?: readonly number[];
  readonly marketTotalLine?: number | null;
}): {
  readonly modelExpectedTotal: number;
  readonly objectiveProjections: readonly NflTotalLineProjectionV4[];
  readonly marketPosteriorProjection: NflTotalLineProjectionV4 | null;
} {
  const sol = solveNflDiscreteKeyTotalPmfExactV5({
    expectedTotal: params.modelExpectedTotal,
    artifact: params.artifact,
  });
  const evalLineFromDiscretePmf = (
    pmf: Float64Array,
    line: number,
    expUsed: number,
  ): NflTotalLineProjectionV4 => {
    let pOver = 0.0;
    let pUnder = 0.0;
    let pPush = 0.0;
    for (let k = 0; k < pmf.length; k += 1) {
      const p = pmf[k]!;
      if (p <= 0.0) continue;
      if (Math.abs(k - line) < 1e-9) pPush += p;
      else if (k > line) pOver += p;
      else pUnder += p;
    }
    const act = pOver + pUnder;
    const poNp = act > 1e-12 ? clamp(pOver / act, 0.001, 0.999) : 0.5;
    const puNp = 1.0 - poNp;
    return Object.freeze({
      totalLine: line,
      expectedTotalUsed: expUsed,
      sigmaUsed: 13.4,
      pOver,
      pUnder,
      pPush,
      pOverNoPush: poNp,
      pUnderNoPush: puNp,
      fairOddsOver: probabilityToFairOdds(poNp),
      fairOddsUnder: probabilityToFairOdds(puNp),
    });
  };

  const lines = params.objectiveLines ?? [37.5, 40.5, 41.0, 43.5, 44.0, 44.5, 47.0, 47.5, 51.0];
  const objProj = lines.map((ln) => evalLineFromDiscretePmf(sol.pmf, ln, sol.expectedTotalImplied));

  let mktPost: NflTotalLineProjectionV4 | null = null;
  if (typeof params.marketTotalLine === "number" && Number.isFinite(params.marketTotalLine)) {
    const wm = params.artifact.discrete_totals_v5.market_posterior_w_model;
    const muPost = wm * params.modelExpectedTotal + (1.0 - wm) * params.marketTotalLine;
    const solPost = solveNflDiscreteKeyTotalPmfExactV5({
      expectedTotal: muPost,
      artifact: params.artifact,
    });
    mktPost = evalLineFromDiscretePmf(solPost.pmf, params.marketTotalLine, solPost.expectedTotalImplied);
  }

  return Object.freeze({
    modelExpectedTotal: sol.expectedTotalImplied,
    objectiveProjections: Object.freeze(objProj),
    marketPosteriorProjection: mktPost,
  });
}

export function projectNflOvertimeProbabilityV5(params: {
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly isIndoor?: boolean;
  readonly isTurf?: boolean;
  readonly artifact: NflModelArtifactV5;
}): {
  readonly pOvertime: number;
  readonly pRegulationFinish: number;
  readonly fairOddsOvertimeYes: FairOdds;
  readonly fairOddsOvertimeNo: FairOdds;
} {
  const ot = params.artifact.overtime_calibration;
  const x = [
    Math.exp(-Math.abs(params.expectedMargin) / 7.0),
    (params.expectedTotal - 44.0) / 10.0,
    params.isIndoor ? 1.0 : 0.0,
    params.isTurf ? 1.0 : 0.0,
  ];
  let eta = ot.intercept;
  for (let i = 0; i < ot.coef.length; i += 1) {
    eta += ot.coef[i]! * x[i]!;
  }
  const pOt = clamp(1.0 / (1.0 + Math.exp(-eta)), 0.005, 0.25);
  const pReg = 1.0 - pOt;
  return Object.freeze({
    pOvertime: pOt,
    pRegulationFinish: pReg,
    fairOddsOvertimeYes: probabilityToFairOdds(pOt),
    fairOddsOvertimeNo: probabilityToFairOdds(pReg),
  });
}

export function projectNflPlayerPropV5(params: {
  readonly market: NflPropMarketKeyV5;
  readonly features4: readonly [number, number, number, number];
  readonly line?: number;
  readonly artifact: NflModelArtifactV5;
}): {
  readonly market: NflPropMarketKeyV5;
  readonly line: number;
  readonly expectedMean: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly pOverNoPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
} {
  const spec = params.artifact.prop_markets[params.market];
  let eta = spec.intercept;
  for (let i = 0; i < 4; i += 1) {
    eta += spec.coef[i]! * params.features4[i]!;
  }
  const minMu = params.market === "qb_sacks_taken" || params.market === "qb_rush_attempts" ? 0.25 : 1.0;
  const expectedMean = clamp(Math.exp(eta), minMu, 50.0);
  const pmf = computeNegativeBinomialPmfExact(expectedMean, spec.dispersion_r, spec.max_k);
  const ln = params.line ?? spec.canonical_line;

  const isInt = Math.abs(ln - Math.round(ln)) < 1e-9;
  let pOver: number;
  let pUnder: number;
  let pPush = 0.0;
  if (isInt) {
    const kLine = Math.round(ln);
    pPush = kLine >= 0 && kLine < pmf.length ? pmf[kLine]! : 0.0;
    let sumU = 0.0;
    const lim = Math.max(0, Math.min(kLine, pmf.length));
    for (let k = 0; k < lim; k += 1) sumU += pmf[k]!;
    pUnder = sumU;
    pOver = Math.max(0.0, 1.0 - pUnder - pPush);
  } else {
    const kFloor = Math.floor(ln);
    let sumU = 0.0;
    const lim = Math.max(0, Math.min(kFloor + 1, pmf.length));
    for (let k = 0; k < lim; k += 1) sumU += pmf[k]!;
    pUnder = sumU;
    pOver = Math.max(0.0, 1.0 - pUnder);
  }

  const act = pOver + pUnder;
  const poNoPush = act > 1e-12 ? clamp(pOver / act, 0.001, 0.999) : 0.5;

  return Object.freeze({
    market: params.market,
    line: ln,
    expectedMean,
    pOver,
    pUnder,
    pPush,
    pOverNoPush: poNoPush,
    fairOddsOver: probabilityToFairOdds(poNoPush),
    fairOddsUnder: probabilityToFairOdds(1.0 - poNoPush),
  });
}
