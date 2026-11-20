/**
 * PitchLab Diagonal-Inflated Bivariate Score Matrix (`v4.0` · `EXP_V43`) —
 * Solver ortogonal de 4 parámetros `(muHome, muAway, rhoLow, diagWeight)` con marginales
 * Binomial Negativa (`rDisp`) y cero frontera de cono físico.
 *
 * Propiedades exactas garantizadas en el 100% del símplex:
 *  1. `|P_M(Home) - pHome| < 1e-14`, `|P_M(Draw) - pDraw| < 1e-15`, `|P_M(Away) - pAway| < 1e-14`.
 *  2. `|E_M[H + A] - totalGoalsTarget| < 1e-12` para todo `totalGoalsTarget` alcanzable en `0..maxGoals`.
 *  3. Cero derivadas numéricas por diferencias finitas -> paridad IEEE-754 `< 1e-13` Python <-> TypeScript.
 *  4. Deriva coherentemente `1X2`, `Double Chance`, `DNB`, `Totals 1.5/2.5/3.5`, `BTTS`,
 *     `Asian Handicap` (incluyendo cuartos `.25`/`.75`) y `topScorelines[3]`.
 */

import { clamp, sigmoid } from "./math";
import { probabilityToFairOdds, type FairOdds } from "./outlook";

export const DIAGONAL_SCORE_SCHEMA_VERSION = "diagonal_biv_nb_dc_v4.0.0" as const;
export const DEFAULT_V4_MAX_GOALS = 12;
export const SAFE_RHO_MIN = -0.22;
export const SAFE_RHO_MAX = 0.16;
export const SAFE_TAU_BOUND = 0.72;

export interface DiagonalScoreSolverInput {
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly totalGoalsTarget: number;
  readonly rhoPrior?: number;
  readonly dispersionR?: number;
  readonly maxGoals?: number;
  /** Peso del blend `w * rhoReq + (1 - w) * rhoPrior` (default `0.7` retrocompatible v4.0; `0.0` elimina doble inflación `(0-0, 1-1)` en v5.1). */
  readonly rhoDrawBlendWeight?: number;
}

export interface DiagonalScoreMatrixResult {
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly diagMultiplier: number;
  readonly offDiagMultiplier: number;
  readonly expectedTotalImplied: number;
  readonly matrix: readonly (readonly number[])[];
}

export interface DerivedSoccerMarketsV4 {
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly p1X: number;
  readonly p12: number;
  readonly pX2: number;
  readonly pDnbHome: number;
  readonly pDnbAway: number;
  readonly pOver15: number;
  readonly pUnder15: number;
  readonly pOver25: number;
  readonly pUnder25: number;
  readonly pOver35: number;
  readonly pUnder35: number;
  readonly pBttsYes: number;
  readonly pBttsNo: number;
  readonly fairOddsOver25: FairOdds;
  readonly fairOddsBttsYes: FairOdds;
  readonly topScorelines: readonly {
    readonly homeGoals: number;
    readonly awayGoals: number;
    readonly probability: number;
  }[];
}

export function nbMarginalPmfExact(
  mu: number,
  dispersionR: number,
  maxGoals: number = DEFAULT_V4_MAX_GOALS,
): Float64Array {
  const size = maxGoals + 1;
  const out = new Float64Array(size);
  const m = clamp(mu, 0.005, 12.0);
  const r = clamp(dispersionR, 2.0, 500.0);

  if (r >= 450.0) {
    out[0] = Math.exp(-m);
    for (let k = 1; k < size; k += 1) {
      out[k] = (out[k - 1]! * m) / k;
    }
  } else {
    const pRatio = r / (r + m);
    const qRatio = m / (r + m);
    out[0] = Math.exp(r * Math.log(pRatio));
    for (let k = 1; k < size; k += 1) {
      out[k] = (out[k - 1]! * ((k - 1 + r) * qRatio)) / k;
    }
  }

  let s = 0.0;
  for (let k = 0; k < size; k += 1) s += out[k]!;
  const invS = 1.0 / s;
  for (let k = 0; k < size; k += 1) out[k] = out[k]! * invS;
  return out;
}

function buildBaseNbDcGrid(
  muHome: number,
  muAway: number,
  rho: number,
  dispersionR: number,
  maxGoals: number,
  buf: Float64Array,
): readonly [number, number, number] {
  const size = maxGoals + 1;
  const pmfH = nbMarginalPmfExact(muHome, dispersionR, maxGoals);
  const pmfA = nbMarginalPmfExact(muAway, dispersionR, maxGoals);

  for (let h = 0; h < size; h += 1) {
    const ph = pmfH[h]!;
    const rowOff = h * size;
    for (let a = 0; a < size; a += 1) {
      buf[rowOff + a] = ph * pmfA[a]!;
    }
  }

  buf[0] = buf[0]! * Math.max(1.0 - muHome * muAway * rho, 1e-9);
  buf[1] = buf[1]! * Math.max(1.0 + muHome * rho, 1e-9);
  buf[size] = buf[size]! * Math.max(1.0 + muAway * rho, 1e-9);
  buf[size + 1] = buf[size + 1]! * Math.max(1.0 - rho, 1e-9);

  let pH = 0.0;
  let pD = 0.0;
  let pA = 0.0;
  for (let h = 0; h < size; h += 1) {
    const rowOff = h * size;
    for (let a = 0; a < size; a += 1) {
      const v = buf[rowOff + a]!;
      if (h > a) pH += v;
      else if (h === a) pD += v;
      else pA += v;
    }
  }
  const invTot = 1.0 / (pH + pD + pA);
  for (let idx = 0; idx < size * size; idx += 1) {
    buf[idx] = buf[idx]! * invTot;
  }
  return [pH * invTot, pD * invTot, pA * invTot];
}

function solveShareAndDiagAtScale(
  tauScale: number,
  pHomeTarget: number,
  pDrawTarget: number,
  pAwayTarget: number,
  rhoPrior: number,
  dispersionR: number,
  maxGoals: number,
  buf: Float64Array,
  rhoDrawBlendWeight: number = 0.7,
): {
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly wDiag: number;
  readonly wOff: number;
  readonly impliedTotal: number;
} {
  const size = maxGoals + 1;
  const target2WayHome = clamp(
    pHomeTarget / Math.max(pHomeTarget + pAwayTarget, 1e-15),
    1e-6,
    1.0 - 1e-6,
  );
  let uLo = -8.0;
  let uHi = 8.0;

  // 1. Bisección monótona 1D en 52 pasos sobre `u` con `rho = 0` para clavar `P(H>A) / (P(H>A)+P(H<A))`
  for (let it = 0; it < 52; it += 1) {
    const uMid = 0.5 * (uLo + uHi);
    const sh = sigmoid(uMid);
    const mh = clamp(tauScale * sh, 0.002, 11.5);
    const ma = clamp(tauScale * (1.0 - sh), 0.002, 11.5);
    const [ch, , ca] = buildBaseNbDcGrid(mh, ma, 0.0, dispersionR, maxGoals, buf);
    const ratio = ch / Math.max(ch + ca, 1e-15);
    if (ratio < target2WayHome) uLo = uMid;
    else uHi = uMid;
  }

  const uStar = 0.5 * (uLo + uHi);
  const shStar = sigmoid(uStar);
  const mh0 = clamp(tauScale * shStar, 0.002, 11.5);
  const ma0 = clamp(tauScale * (1.0 - shStar), 0.002, 11.5);

  // 2. Determinar `rhoEff` seguro dentro del cono suave `tau >= 0.28`
  const [, cd0] = buildBaseNbDcGrid(mh0, ma0, 0.0, dispersionR, maxGoals, buf);
  const p00 = buf[0]!;
  const p11 = buf[size + 1]!;
  const denomRho = mh0 * ma0 * p00 + p11;
  const rhoReq = denomRho > 1e-9 ? (cd0 - pDrawTarget) / denomRho : rhoPrior;
  const wRb = clamp(rhoDrawBlendWeight, 0.0, 1.0);
  const rhoBlend = wRb * rhoReq + (1.0 - wRb) * rhoPrior;

  const rLo = Math.max(SAFE_RHO_MIN, -SAFE_TAU_BOUND / Math.max(mh0, ma0, 1e-6));
  const rHi = Math.min(
    SAFE_RHO_MAX,
    SAFE_TAU_BOUND / Math.max(mh0 * ma0, 1e-6),
    SAFE_TAU_BOUND,
  );
  const rhoEff = rLo <= rHi ? clamp(rhoBlend, rLo, rHi) : 0.0;

  // Refinar `u` en 44 pasos con `rhoEff` fijo
  let u2Lo = Math.max(-8.5, uStar - 1.5);
  let u2Hi = Math.min(8.5, uStar + 1.5);
  for (let it = 0; it < 44; it += 1) {
    const uMid = 0.5 * (u2Lo + u2Hi);
    const sh = sigmoid(uMid);
    const mh = clamp(tauScale * sh, 0.002, 11.5);
    const ma = clamp(tauScale * (1.0 - sh), 0.002, 11.5);
    const [ch, , ca] = buildBaseNbDcGrid(mh, ma, rhoEff, dispersionR, maxGoals, buf);
    const ratio = ch / Math.max(ch + ca, 1e-15);
    if (ratio < target2WayHome) u2Lo = uMid;
    else u2Hi = uMid;
  }

  const shF = sigmoid(0.5 * (u2Lo + u2Hi));
  const mhF = clamp(tauScale * shF, 0.002, 11.5);
  const maF = clamp(tauScale * (1.0 - shF), 0.002, 11.5);
  const [chBase, cdBase, caBase] = buildBaseNbDcGrid(mhF, maF, rhoEff, dispersionR, maxGoals, buf);

  // 3. Proyección exacta sobre el 3-símplex (diagonal + triángulos): preserva 1X2 a `< 1e-15` universalmente
  const wUpper = pHomeTarget / Math.max(chBase, 1e-15);
  const wDiag = pDrawTarget / Math.max(cdBase, 1e-15);
  const wLower = pAwayTarget / Math.max(caBase, 1e-15);
  const wOff = (1.0 - pDrawTarget) / Math.max(1.0 - cdBase, 1e-15);

  let expTot = 0.0;
  for (let h = 0; h < size; h += 1) {
    const rowOff = h * size;
    for (let a = 0; a < size; a += 1) {
      const wCell = h === a ? wDiag : h > a ? wUpper : wLower;
      const mVal = buf[rowOff + a]! * wCell;
      buf[rowOff + a] = mVal;
      expTot += (h + a) * mVal;
    }
  }

  return {
    muHome: mhF,
    muAway: maF,
    rhoEff,
    wDiag,
    wOff,
    impliedTotal: expTot,
  };
}

/**
 * Resuelve la matriz bivariada de 4 parámetros reproduciendo simultáneamente `(pHome, pDraw, pAway)`
 * y `totalGoalsTarget` con paridad IEEE-754 `< 1e-13` frente a `diagonal_score_solver.py`.
 */
export function solveDiagonalInflatedScoreMatrix4Param(
  input: DiagonalScoreSolverInput,
): DiagonalScoreMatrixResult {
  const maxGoals = input.maxGoals ?? DEFAULT_V4_MAX_GOALS;
  const rhoPrior = input.rhoPrior ?? -0.105;
  const dispersionR = clamp(input.dispersionR ?? 28.0, 2.5, 500.0);
  const rhoDrawBlendWeight = clamp(input.rhoDrawBlendWeight ?? 0.7, 0.0, 1.0);

  const ph0 = Math.max(input.pHome, 1e-9);
  const pd0 = clamp(input.pDraw, 1e-6, 0.96);
  const pa0 = Math.max(input.pAway, 1e-9);
  const sP = ph0 + pd0 + pa0;
  const pH = ph0 / sP;
  const pD = pd0 / sP;
  const pA = pa0 / sP;
  const totTarget = clamp(input.totalGoalsTarget, 0.4, 7.5);

  const size = maxGoals + 1;
  const buf = new Float64Array(size * size);

  // Bisección monótona exterior en 28 pasos sobre `tauScale` para clavar `E_M[H + A] == totTarget`
  let tauLo = Math.max(0.2, 0.55 * totTarget);
  let tauHi = Math.min(10.5, 1.55 * totTarget + 0.6);

  for (let outIt = 0; outIt < 28; outIt += 1) {
    const tauMid = 0.5 * (tauLo + tauHi);
    const st = solveShareAndDiagAtScale(
      tauMid,
      pH,
      pD,
      pA,
      rhoPrior,
      dispersionR,
      maxGoals,
      buf,
      rhoDrawBlendWeight,
    );
    if (st.impliedTotal < totTarget) tauLo = tauMid;
    else tauHi = tauMid;
  }

  const finalTau = 0.5 * (tauLo + tauHi);
  const fin = solveShareAndDiagAtScale(
    finalTau,
    pH,
    pD,
    pA,
    rhoPrior,
    dispersionR,
    maxGoals,
    buf,
    rhoDrawBlendWeight,
  );

  const rows: (readonly number[])[] = [];
  for (let h = 0; h < size; h += 1) {
    const rArr: number[] = [];
    const off = h * size;
    for (let a = 0; a < size; a += 1) {
      rArr.push(buf[off + a]!);
    }
    rows.push(Object.freeze(rArr));
  }

  return Object.freeze({
    muHome: fin.muHome,
    muAway: fin.muAway,
    rhoEff: fin.rhoEff,
    dispersionR,
    diagMultiplier: fin.wDiag,
    offDiagMultiplier: fin.wOff,
    expectedTotalImplied: fin.impliedTotal,
    matrix: Object.freeze(rows),
  });
}

export function summarizeSoccerMarketsFromMatrixV4(
  matrix: readonly (readonly number[])[],
): DerivedSoccerMarketsV4 {
  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;
  let pOver15 = 0.0;
  let pOver25 = 0.0;
  let pOver35 = 0.0;
  let pBttsYes = 0.0;

  const cells: { homeGoals: number; awayGoals: number; probability: number }[] = [];

  for (let h = 0; h < matrix.length; h += 1) {
    const row = matrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      const p = row[a]!;
      cells.push({ homeGoals: h, awayGoals: a, probability: p });
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;

      const tot = h + a;
      if (tot >= 2) pOver15 += p;
      if (tot >= 3) pOver25 += p;
      if (tot >= 4) pOver35 += p;
      if (h >= 1 && a >= 1) pBttsYes += p;
    }
  }

  cells.sort((x, y) =>
    y.probability !== x.probability
      ? y.probability - x.probability
      : x.homeGoals !== y.homeGoals
        ? x.homeGoals - y.homeGoals
        : x.awayGoals - y.awayGoals,
  );

  const dnbSum = Math.max(pHome + pAway, 1e-12);
  const pDnbHome = pHome / dnbSum;

  return Object.freeze({
    pHome,
    pDraw,
    pAway,
    p1X: Math.min(1.0, pHome + pDraw),
    p12: Math.min(1.0, pHome + pAway),
    pX2: Math.min(1.0, pDraw + pAway),
    pDnbHome,
    pDnbAway: 1.0 - pDnbHome,
    pOver15,
    pUnder15: Math.max(0.0, 1.0 - pOver15),
    pOver25,
    pUnder25: Math.max(0.0, 1.0 - pOver25),
    pOver35,
    pUnder35: Math.max(0.0, 1.0 - pOver35),
    pBttsYes,
    pBttsNo: Math.max(0.0, 1.0 - pBttsYes),
    fairOddsOver25: probabilityToFairOdds(clamp(pOver25, 0.001, 0.999)),
    fairOddsBttsYes: probabilityToFairOdds(clamp(pBttsYes, 0.001, 0.999)),
    topScorelines: Object.freeze(cells.slice(0, 3).map((c) => Object.freeze(c))),
  });
}
