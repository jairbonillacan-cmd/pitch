/**
 * PitchLab Horizon-Goals v3.5 (`EXP_V37` / `EXP_V38`) —
 * Motor causal de goles esperados (`Poisson` `log`-link) y Solver Coherente Dixon-Coles de 3 parámetros
 * `(lamHome, lamAway, rho)` para Fútbol de Clubes y Selecciones Nacionales.
 *
 * Propiedad matemática clave:
 *  En la matriz Dixon-Coles `DC(lamHome, lamAway, rho)` (`0..maxGoals`), mientras las 4 celdas
 *  `{0,1}x{0,1}` permanezcan dentro del cono físico (`tau(x,y) > 0`):
 *    1. `P_DC(H > A) - P_DC(H < A)` es 100% independiente de `rho`.
 *    2. `P_DC(Over 2.5)` y `P_DC(Over 3.5)` son 100% independientes de `rho`.
 *    3. `P_DC(Draw) = P_Pois(Draw) - (2 * lamHome * lamAway * exp(-lamHome - lamAway) / Z_Pois) * rho`.
 *
 *  Esto permite alimentar `buildMatchOutlook({ football: { lamHome, lamAway, rho } })` sin modificar
 *  una sola línea de `outlook.ts`, preservando exactamente las probabilidades `(pHome, pDraw, pAway)`
 *  del ensamble `1X2` (`< 1e-9`) mientras `lamHome + lamAway` reproduce el total de goles esperado `T_hat`
 *  del regresor `Poisson` en `Totals 1.5/2.5/3.5`, `BTTS`, `AH ±1.0` y `topScorelines[3]`.
 *
 * Paridad numérica IEEE-754 `< 1e-12` frente a `horizon_dc_solver.py`.
 */

import { buildDixonColesScoreMatrix, DEFAULT_MAX_GOALS } from "./markets_2way.js";
import { clamp, sigmoid } from "./math.js";

export const HORIZON_GOALS_SCHEMA_VERSION = "horizon_goals_v3.5.0" as const;
export const RHO_ABS_MIN = -0.32;
export const RHO_ABS_MAX = 0.22;
export const TAU_SAFETY_BOUND = 0.88;

export interface HorizonGoalsModelArtifact {
  readonly schema_version: string;
  readonly type: "poisson_log_link_3param_dc";
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly seed: number;
  readonly alpha: number;
  readonly w_total_poisson: number;
  readonly rho_shrinkage: number;
  readonly default_rho: number;
  readonly min_total_goals: number;
  readonly max_total_goals: number;
  readonly max_goals_grid: number;
  readonly features: readonly string[];
  readonly n_features_base: number;
  readonly base_features: readonly string[];
  readonly source_v2_feature_indices?: readonly number[];
  readonly div_levels: readonly string[];
  readonly div_rho_map: Readonly<Record<string, number>>;
  readonly imputer_statistics: readonly number[];
  readonly scaler_mean: readonly number[];
  readonly scaler_scale: readonly number[];
  readonly coef: readonly number[];
  readonly intercept: number;
}

export interface CoherentDixonColes3ParamResult {
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rhoEff: number;
  readonly totalGoalsImplied: number;
}

/**
 * Evalúa el regresor `Poisson` (`log` link) serializado:
 * `exp(clamp(intercept + coef @ ((impute(x) - mean) / scale), log(min_total), log(max_total)))`.
 * Espejo exacto `< 1e-13` de `horizon_dc_solver.py::predict_poisson_log_link_exact`.
 */
export function predictHorizonTotalGoals(
  baseFeatures: readonly (number | null)[],
  divOnehot: readonly number[],
  artifact: HorizonGoalsModelArtifact,
): number {
  const nBase = artifact.n_features_base;
  const nDiv = artifact.div_levels.length;
  const nTot = nBase + nDiv;
  if (baseFeatures.length !== nBase) {
    throw new Error(
      `HorizonGoals: se esperaban ${nBase} features base, recibido ${baseFeatures.length}`,
    );
  }
  if (divOnehot.length !== nDiv) {
    throw new Error(
      `HorizonGoals: se esperaban ${nDiv} dummies div_onehot, recibido ${divOnehot.length}`,
    );
  }
  if (
    artifact.imputer_statistics.length !== nTot ||
    artifact.scaler_mean.length !== nTot ||
    artifact.scaler_scale.length !== nTot ||
    artifact.coef.length !== nTot
  ) {
    throw new Error(`HorizonGoals: dimensiones internas inválidas (${nTot})`);
  }

  let eta = artifact.intercept;
  for (let i = 0; i < nTot; i += 1) {
    const raw = i < nBase ? baseFeatures[i] : divOnehot[i - nBase];
    const x =
      typeof raw === "number" && Number.isFinite(raw) ? raw : artifact.imputer_statistics[i]!;
    const sc = artifact.scaler_scale[i]!;
    const safeScale = sc === 0.0 ? 1.0 : sc;
    const z = (x - artifact.scaler_mean[i]!) / safeScale;
    eta += artifact.coef[i]! * z;
  }

  const minTot = artifact.min_total_goals > 0 ? artifact.min_total_goals : 0.45;
  const maxTot = artifact.max_total_goals > minTot ? artifact.max_total_goals : 7.5;
  const clampedEta = clamp(eta, Math.log(minTot), Math.log(maxTot));
  return Math.exp(clampedEta);
}

function poisson1X2Summary(
  lamHome: number,
  lamAway: number,
  maxGoals: number,
): readonly [number, number, number, number] {
  const size = maxGoals + 1;
  const pmfH = new Float64Array(size);
  const pmfA = new Float64Array(size);
  pmfH[0] = Math.exp(-lamHome);
  pmfA[0] = Math.exp(-lamAway);
  for (let k = 1; k < size; k += 1) {
    pmfH[k] = (pmfH[k - 1]! * lamHome) / k;
    pmfA[k] = (pmfA[k - 1]! * lamAway) / k;
  }

  let curH = 0.0;
  let curD = 0.0;
  let curA = 0.0;
  for (let h = 0; h < size; h += 1) {
    const ph = pmfH[h]!;
    for (let a = 0; a < size; a += 1) {
      const p = ph * pmfA[a]!;
      if (h > a) curH += p;
      else if (h === a) curD += p;
      else curA += p;
    }
  }
  const s = curH + curD + curA;
  return [curH / s, curD / s, curA / s, s];
}

/**
 * Espejo exacto `< 1e-12` de `horizon_dc_solver.py::solve_dc_2param_from_1x2`
 * (`outlook.ts::fitDixonColesLambdasFrom1X2`).
 */
export function solveDixonColes2ParamFrom1X2(
  probs1X2: { readonly pHome: number; readonly pDraw: number; readonly pAway: number },
  rho: number = -0.1,
  maxGoals: number = DEFAULT_MAX_GOALS,
): { readonly lamHome: number; readonly lamAway: number } {
  const ph0 = Math.max(probs1X2.pHome, 1e-6);
  const pd0 = Math.max(probs1X2.pDraw, 1e-6);
  const pa0 = Math.max(probs1X2.pAway, 1e-6);
  const norm = ph0 + pd0 + pa0;
  const ph = ph0 / norm;
  const pd = pd0 / norm;
  const pa = pa0 / norm;

  const initShare = clamp(ph / Math.max(ph + pa, 1e-6), 0.01, 0.99);
  let u = Math.log(initShare / (1.0 - initShare));
  let v = Math.log(2.55);
  const targetDiff = ph - pa;
  const targetDraw = pd;

  const evalRes = (uVal: number, vVal: number): readonly [number, number] => {
    const tot = Math.exp(vVal);
    const sh = sigmoid(uVal);
    const lh = clamp(tot * sh, 0.05, 10.0);
    const la = clamp(tot * (1.0 - sh), 0.05, 10.0);
    const mat = buildDixonColesScoreMatrix(lh, la, rho, maxGoals);
    let ch = 0.0;
    let cd = 0.0;
    let ca = 0.0;
    for (let h = 0; h < mat.length; h += 1) {
      const row = mat[h]!;
      for (let a = 0; a < row.length; a += 1) {
        const p = row[a]!;
        if (h > a) ch += p;
        else if (h === a) cd += p;
        else ca += p;
      }
    }
    return [ch - ca - targetDiff, cd - targetDraw];
  };

  const hStep = 1e-4;
  const vMin = Math.log(0.25);
  const vMax = Math.log(8.0);
  for (let iter = 0; iter < 24; iter += 1) {
    const [f1, f2] = evalRes(u, v);
    const norm0 = f1 * f1 + f2 * f2;
    if (norm0 < 1e-28) break;
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
      const uTry = clamp(u + step * du, -5.0, 5.0);
      const vTry = clamp(v + step * dv, vMin, vMax);
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

  const finalT = Math.exp(v);
  const finalS = sigmoid(u);
  return {
    lamHome: clamp(finalT * finalS, 0.05, 10.0),
    lamAway: clamp(finalT * (1.0 - finalS), 0.05, 10.0),
  };
}

/**
 * Resuelve `(lamHome, lamAway, rhoEff)` coherente simultáneamente con `(pHome, pDraw, pAway)`
 * y con `totalGoalsTarget`. Espejo operación-por-operación de `horizon_dc_solver.py::solve_coherent_dc_3param`.
 */
export function solveCoherentDixonColes3Param(params: {
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly totalGoalsTarget: number;
  readonly rhoPrior?: number;
  readonly rhoShrinkage?: number;
  readonly maxGoals?: number;
}): CoherentDixonColes3ParamResult {
  const maxGoals = params.maxGoals ?? DEFAULT_MAX_GOALS;
  const rhoPrior = params.rhoPrior ?? -0.11;
  const shrink = clamp(params.rhoShrinkage ?? 0.0, 0.0, 1.0);

  const ph0 = Math.max(params.pHome, 1e-6);
  const pd0 = Math.max(params.pDraw, 1e-6);
  const pa0 = Math.max(params.pAway, 1e-6);
  const normP = ph0 + pd0 + pa0;
  const ph = ph0 / normP;
  const pd = pd0 / normP;
  const pa = pa0 / normP;

  const targetDiff = ph - pa;
  const targetDraw = pd;
  const totT = clamp(params.totalGoalsTarget, 0.35, 7.5);

  // Etapa 1: Bisección monótona exacta en `u` con `T = totT` fijo (54 pasos -> precisión IEEE-754 ~3.8e-16)
  let uLo = -5.0;
  let uHi = 5.0;
  for (let i = 0; i < 54; i += 1) {
    const uMid = 0.5 * (uLo + uHi);
    const sh = clamp(sigmoid(uMid), 0.006, 0.994);
    const lh = clamp(totT * sh, 0.05, 10.0);
    const la = clamp(totT * (1.0 - sh), 0.05, 10.0);
    const [ch, , ca] = poisson1X2Summary(lh, la, maxGoals);
    if (ch - ca < targetDiff) uLo = uMid;
    else uHi = uMid;
  }

  let u = 0.5 * (uLo + uHi);
  const sh0 = clamp(sigmoid(u), 0.006, 0.994);
  const lh0 = clamp(totT * sh0, 0.05, 10.0);
  const la0 = clamp(totT * (1.0 - sh0), 0.05, 10.0);
  const [, cdPois, , sPois] = poisson1X2Summary(lh0, la0, maxGoals);

  const denomRho = (2.0 * lh0 * la0 * Math.exp(-(lh0 + la0))) / Math.max(sPois, 1e-12);
  const rhoReq = denomRho > 1e-9 ? (cdPois - targetDraw) / denomRho : rhoPrior;
  const rhoBlend = (1.0 - shrink) * rhoReq + shrink * rhoPrior;

  const rhoLo = Math.max(RHO_ABS_MIN, -TAU_SAFETY_BOUND / Math.max(lh0, la0, 1e-6));
  const rhoHi = Math.min(
    RHO_ABS_MAX,
    TAU_SAFETY_BOUND / Math.max(lh0 * la0, 1e-6),
    TAU_SAFETY_BOUND,
  );
  let rhoEff =
    rhoLo > rhoHi ? clamp(rhoPrior, RHO_ABS_MIN, RHO_ABS_MAX) : clamp(rhoBlend, rhoLo, rhoHi);

  const evalRes = (uVal: number, vVal: number, rVal: number): readonly [number, number] => {
    const tCur = Math.exp(vVal);
    const sCur = sigmoid(uVal);
    const lH = clamp(tCur * sCur, 0.05, 10.0);
    const lA = clamp(tCur * (1.0 - sCur), 0.05, 10.0);
    const mat = buildDixonColesScoreMatrix(lH, lA, rVal, maxGoals);
    let ch = 0.0;
    let cd = 0.0;
    let ca = 0.0;
    for (let h = 0; h < mat.length; h += 1) {
      const row = mat[h]!;
      for (let a = 0; a < row.length; a += 1) {
        const p = row[a]!;
        if (h > a) ch += p;
        else if (h === a) cd += p;
        else ca += p;
      }
    }
    return [ch - ca - targetDiff, cd - targetDraw];
  };

  let v = Math.log(totT);
  const [f1Init, f2Init] = evalRes(u, v, rhoEff);
  if (f1Init * f1Init + f2Init * f2Init <= 1e-28) {
    return Object.freeze({
      lamHome: lh0,
      lamAway: la0,
      rhoEff,
      totalGoalsImplied: lh0 + la0,
    });
  }

  // Etapa 2: Newton 2D amortiguado cuando `rhoEff` tocó la frontera física del cono `tau`
  const hStep = 1e-4;
  const vMin = Math.log(0.25);
  const vMax = Math.log(8.0);
  for (let iter = 0; iter < 20; iter += 1) {
    const [f1, f2] = evalRes(u, v, rhoEff);
    const norm0 = f1 * f1 + f2 * f2;
    if (norm0 < 1e-28) break;
    const [f1u, f2u] = evalRes(u + hStep, v, rhoEff);
    const [f1v, f2v] = evalRes(u, v + hStep, rhoEff);
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
      const uTry = clamp(u + step * du, -5.0, 5.0);
      const vTry = clamp(v + step * dv, vMin, vMax);
      const [r1, r2] = evalRes(uTry, vTry, rhoEff);
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

  const finalT = Math.exp(v);
  const finalS = sigmoid(u);
  const finalLh = clamp(finalT * finalS, 0.05, 10.0);
  const finalLa = clamp(finalT * (1.0 - finalS), 0.05, 10.0);
  const rLoF = Math.max(RHO_ABS_MIN, -TAU_SAFETY_BOUND / Math.max(finalLh, finalLa, 1e-6));
  const rHiF = Math.min(
    RHO_ABS_MAX,
    TAU_SAFETY_BOUND / Math.max(finalLh * finalLa, 1e-6),
    TAU_SAFETY_BOUND,
  );
  if (rLoF <= rHiF) {
    rhoEff = clamp(rhoEff, rLoF, rHiF);
  }

  return Object.freeze({
    lamHome: finalLh,
    lamAway: finalLa,
    rhoEff,
    totalGoalsImplied: finalLh + finalLa,
  });
}
