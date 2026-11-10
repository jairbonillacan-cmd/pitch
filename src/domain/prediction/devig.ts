/**
 * A17 / A26 — Eliminación del margen (de-vig) adaptativa, corrección de sesgo recreativo MX,
 * tilt institucional de Sharp Money (`PitchLab Singularity v3.0`) y Gate Anti-RLM (`PitchLab Geodesic v2.0`).
 *
 * Métodos implementados con paridad numérica exacta (`|Δ| < 1e-12`) respecto al laboratorio Python
 * (`models/b/market_microstructure_v3.py` y `features/build_market_features.py`):
 *   - proporcional: p_i = q_i / Σq, con q_i = 1/o_i
 *   - power:        p_i = q_i^α, α resuelto para Σp = 1
 *   - Shin (1993):  p_i = (sqrt(z² + 4(1−z)q_i²/Q) − z) / (2(1−z)), z resuelto para Σp = 1
 *   - adaptive:     mezcla suave Hermite C¹ entre Power y Shin gobernada por el overround r = Σ(1/o_i) − 1
 *                   (régimen sharp Pinnacle ~3.22% -> régimen recreativo Caliente.mx ~6.62%+)
 *
 * Todas las funciones son puras, deterministas y no dependen de terceros.
 */

/** Error de cuotas inválidas o implausibles. */
export class InvalidOddsError extends Error {
  readonly code = "invalid_odds" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidOddsError";
  }
}

/** Rango de overround aceptado (regla de plausibilidad del snapshot A13). */
export const MIN_OVERROUND = 0.9;
export const MAX_OVERROUND = 1.2;

/** Anclas empíricas de microestructura calibradas sobre `market_microstructure.json` (22,412 registros). */
export const SHARP_OVERROUND_ANCHOR = 0.0322;
export const RECREATIONAL_OVERROUND_ANCHOR = 0.0662;
export const EXTREME_SOFT_OVERROUND_ANCHOR = 0.118;
export const MIN_ADAPTIVE_SHIN_WEIGHT = 0.12;
export const RECREATIONAL_SHIN_WEIGHT = 0.85;
export const MAX_ADAPTIVE_SHIN_WEIGHT = 0.96;

/** Parámetros estructurales de `Singularity v3.0` y `Geodesic v2.0`. */
export const LIGAMX_RECREATIONAL_OVERROUND_THRESHOLD = 0.05;
export const BASE_MX_LOGIT_SHADE = 0.095;
export const DEFAULT_SINGULARITY_ALPHA_SHARP = 0.85;
export const DEFAULT_SINGULARITY_ALPHA_SOFT = 0.72;
export const SHARP_DIVERGENCE_LOGIT_GAIN = 0.085;
export const RLM_DIRECTIONAL_LOGIT_TILT = 0.055;
export const MAX_ABS_SHARP_LOGIT_TILT = 0.14;
export const GEODESIC_DEFAULT_KELLY_SCALE = 0.25;
export const GEODESIC_DEFAULT_MIN_EV = 0.02;
export const GEODESIC_DEFAULT_MAX_EV = 0.15;
export const GEODESIC_DEFAULT_MAX_DISAGREEMENT = 0.12;
export const GEODESIC_DEFAULT_MAX_STAKE = 0.1;
export const GEODESIC_ADVERSE_SHARP_VETO_PCT = -12.0;
export const GEODESIC_CONFIRM_SHARP_PCT = 10.0;

/** Representación en objeto de cuotas decimales 1X2. */
export interface DecimalOdds1X2Object {
  readonly oddsHome: number;
  readonly oddsDraw: number;
  readonly oddsAway: number;
}

/** Cuotas decimales 1X2 aceptadas como tupla/array `[H, D, A]` u objeto `{ oddsHome, oddsDraw, oddsAway }`. */
export type DecimalOdds1X2 =
  | readonly [number, number, number]
  | readonly number[]
  | DecimalOdds1X2Object;

/** Probabilidades implícitas 1X2 sobre el simplex (`pHome + pDraw + pAway = 1`). */
export interface ImpliedProbs1X2 {
  pHome: number;
  pDraw: number;
  pAway: number;
  overround?: number;
  wShin?: number;
}

/** Salida enriquecida del de-vig adaptativo 1X2. */
export interface AdaptiveImpliedProbs1X2 extends ImpliedProbs1X2 {
  pHome: number;
  pDraw: number;
  pAway: number;
  overround: number;
  wShin: number;
}

/** Probabilidades implícitas 2-way (`NFL`, `NHL`, `MLB`, `NBA`, `NCAAF`). */
export interface ImpliedProbs2Way {
  pHome: number;
  pAway: number;
  overround: number;
}

/** Opciones de calibración del de-vig adaptativo Power/Shin. */
export interface AdaptiveDevigOptions {
  sharpOverround?: number;
  recreationalOverround?: number;
  extremeOverround?: number;
  minShinWeight?: number;
  recreationalShinWeight?: number;
  maxShinWeight?: number;
  tolerance?: number;
}

export type DevigMethod = "proportional" | "power" | "shin" | "adaptive";

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function smoothstep01(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
}

function validateOdds(odds: readonly number[]): void {
  if (!Array.isArray(odds) || odds.length !== 3) {
    throw new InvalidOddsError("se esperan exactamente 3 cuotas (local/empate/visitante)");
  }
  for (let i = 0; i < 3; i += 1) {
    const o = odds[i];
    if (o === undefined || !Number.isFinite(o) || o <= 1) {
      throw new InvalidOddsError(`cuota inválida en el índice ${i}: ${String(o)}`);
    }
  }
  // `overround()` devuelve el margen (Σq − 1); la regla de plausibilidad es sobre Σq.
  const sumImplied = overround(odds) + 1;
  if (sumImplied < MIN_OVERROUND || sumImplied > MAX_OVERROUND) {
    throw new InvalidOddsError(
      `Σ(1/cuota) implausible (${sumImplied.toFixed(4)}); se acepta [${MIN_OVERROUND}, ${MAX_OVERROUND}]`,
    );
  }
}

function validateOdds2Way(oddsHome: number, oddsAway: number): readonly [number, number] {
  if (!Number.isFinite(oddsHome) || oddsHome <= 1) {
    throw new InvalidOddsError(`cuota local 2-way inválida: ${String(oddsHome)}`);
  }
  if (!Number.isFinite(oddsAway) || oddsAway <= 1) {
    throw new InvalidOddsError(`cuota visitante 2-way inválida: ${String(oddsAway)}`);
  }
  const pair: readonly [number, number] = [oddsHome, oddsAway];
  const sumImplied = overround(pair) + 1;
  if (sumImplied < MIN_OVERROUND || sumImplied > MAX_OVERROUND) {
    throw new InvalidOddsError(
      `Σ(1/cuota) 2-way implausible (${sumImplied.toFixed(4)}); se acepta [${MIN_OVERROUND}, ${MAX_OVERROUND}]`,
    );
  }
  return pair;
}

function normalizeOdds1X2Input(odds: DecimalOdds1X2): readonly [number, number, number] {
  if (Array.isArray(odds)) {
    validateOdds(odds);
    return [odds[0]!, odds[1]!, odds[2]!];
  }
  if (odds !== null && typeof odds === "object" && "oddsHome" in odds) {
    const oObj = odds as DecimalOdds1X2Object;
    const arr = [oObj.oddsHome, oObj.oddsDraw, oObj.oddsAway];
    validateOdds(arr);
    return [arr[0]!, arr[1]!, arr[2]!];
  }
  throw new InvalidOddsError("formato de cuotas 1X2 inválido");
}

function solvePowerCore(odds: readonly number[], tolerance = 1e-12): number[] {
  const q = odds.map((o) => 1 / o);
  let lo = 1e-6;
  let hi = 5;
  let alpha = 1;
  for (let iter = 0; iter < 200; iter += 1) {
    alpha = (lo + hi) / 2;
    const sum = q.reduce((acc, v) => acc + Math.pow(v, alpha), 0);
    if (Math.abs(sum - 1) <= tolerance) break;
    if (sum > 1) lo = alpha;
    else hi = alpha;
  }
  const p = q.map((v) => Math.pow(v, alpha));
  const sum = p.reduce((a, b) => a + b, 0);
  return p.map((v) => v / sum);
}

function solveShinCore(odds: readonly number[], tolerance = 1e-12): number[] {
  const q = odds.map((o) => 1 / o);
  const Q = q.reduce((a, b) => a + b, 0);

  const probsFor = (z: number): number[] =>
    q.map((qi) => {
      const inside = z * z + (4 * (1 - z) * qi * qi) / Q;
      return (Math.sqrt(Math.max(inside, 0)) - z) / (2 * (1 - z));
    });

  let lo = 0;
  let hi = 0.5;
  let z = 0;
  for (let iter = 0; iter < 200; iter += 1) {
    z = (lo + hi) / 2;
    const sum = probsFor(z).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) <= tolerance) break;
    if (sum > 1) lo = z;
    else hi = z;
  }
  const p = probsFor(z);
  const sum = p.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new InvalidOddsError("Shin no convergió a probabilidades válidas");
  }
  return p.map((v) => v / sum);
}

/** Σ(1/o_i) − 1. */
export function overround(odds: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < odds.length; i += 1) {
    const o = odds[i];
    if (o === undefined || !Number.isFinite(o) || o <= 0) {
      throw new InvalidOddsError(`cuota no positiva en el índice ${i}`);
    }
    sum += 1 / o;
  }
  return sum - 1;
}

/** Probabilidades brutas normalizadas (sin eliminar el margen). */
export function impliedProbabilities(odds: readonly number[]): number[] {
  validateOdds(odds);
  const q = odds.map((o) => 1 / o);
  const sum = q.reduce((a, b) => a + b, 0);
  return q.map((v) => v / sum);
}

/** De-vig proporcional (normalización simple). */
export function devigProportional(odds: readonly number[]): number[] {
  return impliedProbabilities(odds);
}

/**
 * De-vig power: resuelve α con bisección monótona en [1e-6, 5].
 * `Σ q_i^α` es decreciente en α, así que la bisección converge siempre.
 */
export function devigPower(odds: readonly number[], tolerance = 1e-12): number[] {
  validateOdds(odds);
  return solvePowerCore(odds, tolerance);
}

/**
 * De-vig Shin (1993). z se busca en [0, 0.5] por bisección; si no converge,
 * lanza `InvalidOddsError` (no devuelve probabilidades inventadas).
 */
export function devigShin(odds: readonly number[], tolerance = 1e-12): number[] {
  validateOdds(odds);
  return solveShinCore(odds, tolerance);
}

/**
 * Calcula el peso dinámico `w_shin ∈ [0, 1]` gobernado por el overround `r`:
 *   - `r <= 0.0322` (régimen institucional Pinnacle/Smarkets): `w_shin = 0.12` (domina Power).
 *   - `0.0322 < r < 0.0662`: interpolación Hermite suave hasta `w_shin = 0.85` (mínimo global RMSE vs Pinnacle).
 *   - `r >= 0.0662` (régimen recreativo Caliente.mx / Soft Books): escala suavemente de `0.85` a `0.96`.
 */
export function computeAdaptiveShinWeight(
  overroundValue: number,
  options?: AdaptiveDevigOptions,
): number {
  const rSharp = options?.sharpOverround ?? SHARP_OVERROUND_ANCHOR;
  const rRec = options?.recreationalOverround ?? RECREATIONAL_OVERROUND_ANCHOR;
  const rExt = options?.extremeOverround ?? EXTREME_SOFT_OVERROUND_ANCHOR;
  const wMin = clamp(options?.minShinWeight ?? MIN_ADAPTIVE_SHIN_WEIGHT, 0, 1);
  const wRec = clamp(options?.recreationalShinWeight ?? RECREATIONAL_SHIN_WEIGHT, wMin, 1);
  const wMax = clamp(options?.maxShinWeight ?? MAX_ADAPTIVE_SHIN_WEIGHT, wRec, 1);

  if (!Number.isFinite(overroundValue) || overroundValue <= rSharp) {
    return wMin;
  }
  if (overroundValue < rRec) {
    const span = Math.max(1e-9, rRec - rSharp);
    const s = smoothstep01((overroundValue - rSharp) / span);
    return wMin + (wRec - wMin) * s;
  }
  const spanExt = Math.max(1e-9, rExt - rRec);
  const sExt = smoothstep01((overroundValue - rRec) / spanExt);
  return wRec + (wMax - wRec) * sExt;
}

/**
 * De-vig adaptativo 1X2: combina dinámicamente `devigPower` y `devigShin` según el overround medido.
 */
export function devigAdaptive1X2(
  odds: DecimalOdds1X2,
  options?: AdaptiveDevigOptions,
): AdaptiveImpliedProbs1X2 {
  const tuple = normalizeOdds1X2Input(odds);
  const tol = options?.tolerance ?? 1e-12;
  const r = overround(tuple);
  const wShin = computeAdaptiveShinWeight(r, options);
  const pPow = solvePowerCore(tuple, tol);
  const pShi = solveShinCore(tuple, tol);

  const raw0 = (1 - wShin) * pPow[0]! + wShin * pShi[0]!;
  const raw1 = (1 - wShin) * pPow[1]! + wShin * pShi[1]!;
  const raw2 = (1 - wShin) * pPow[2]! + wShin * pShi[2]!;
  const sum = raw0 + raw1 + raw2;

  return {
    pHome: raw0 / sum,
    pDraw: raw1 / sum,
    pAway: raw2 / sum,
    overround: r,
    wShin,
  };
}

/** Aplica el método 1X2 pedido (por defecto power). */
export function devig(odds: readonly number[], method: DevigMethod = "power"): number[] {
  if (method === "proportional") return devigProportional(odds);
  if (method === "power") return devigPower(odds);
  if (method === "shin") return devigShin(odds);
  if (method === "adaptive") {
    const res = devigAdaptive1X2(odds);
    return [res.pHome, res.pDraw, res.pAway];
  }
  throw new InvalidOddsError(`método de de-vig desconocido: ${String(method)}`);
}

/**
 * Desvigorización 2-way (`proportional`, `power`, `shin`, `adaptive`) para deportes sin empate
 * de mercado primario (`NFL`, `NHL`, `MLB`, `NBA`, `NCAAF`).
 */
export function devig2Way(
  oddsHome: number,
  oddsAway: number,
  method: DevigMethod = "adaptive",
  options?: AdaptiveDevigOptions,
): ImpliedProbs2Way {
  const pair = validateOdds2Way(oddsHome, oddsAway);
  const r = overround(pair);
  const tol = options?.tolerance ?? 1e-12;

  if (method === "proportional") {
    const q0 = 1 / pair[0];
    const q1 = 1 / pair[1];
    const sum = q0 + q1;
    return { pHome: q0 / sum, pAway: q1 / sum, overround: r };
  }
  if (method === "power") {
    const p = solvePowerCore(pair, tol);
    return { pHome: p[0]!, pAway: p[1]!, overround: r };
  }
  if (method === "shin") {
    const p = solveShinCore(pair, tol);
    return { pHome: p[0]!, pAway: p[1]!, overround: r };
  }
  if (method === "adaptive") {
    const wShin = computeAdaptiveShinWeight(r, options);
    const pPow = solvePowerCore(pair, tol);
    const pShi = solveShinCore(pair, tol);
    const raw0 = (1 - wShin) * pPow[0]! + wShin * pShi[0]!;
    const raw1 = (1 - wShin) * pPow[1]! + wShin * pShi[1]!;
    const sum = raw0 + raw1;
    return { pHome: raw0 / sum, pAway: raw1 / sum, overround: r };
  }
  throw new InvalidOddsError(`método de de-vig 2-way desconocido: ${String(method)}`);
}

// ---------------------------------------------------------------------------
// Sesgo Recreativo Local MX (`Caliente.mx` / Soft Books en Liga MX)
// ---------------------------------------------------------------------------

export interface LigaMxDebiasParams {
  homeTeam: string;
  awayTeam: string;
  overround: number;
  bookmaker?: string;
}

export interface LigaMxDebiasResult extends ImpliedProbs1X2 {
  pHome: number;
  pDraw: number;
  pAway: number;
  biasDetected: boolean;
  biasedSide: "home" | "away" | "none";
  logitAdjustment: number;
}

function normalizeTeamToken(raw: string): string {
  const stripped = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((w|m|f|r|u\d+)\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${stripped} `;
}

const NON_POPULAR_MX_EXCLUSIONS = [
  " atlas ",
  " leones negros ",
  " udg ",
  " cali ",
  " mineiro ",
  " tijuana ",
  " xolos ",
  " juarez ",
  " pachuca ",
  " toluca ",
  " santos ",
  " necaxa ",
  " puebla ",
  " queretaro ",
  " san luis ",
  " mazatlan ",
  " atlante ",
];

/**
 * Devuelve el peso determinista de arrastre recreativo nacional `[0, 1]` para los 6 clubes
 * de mayor volumen público en México (`CF América`, `CD Guadalajara` / `Chivas`, `CD Cruz Azul`,
 * `Pumas UNAM`, `Tigres UANL`, `CF Monterrey`), evitando falsos positivos como `Atlas Guadalajara`
 * o `Tijuana Xolos de Caliente`.
 */
export function detectPopularLigaMxWeight(teamName: string): number {
  if (!teamName || typeof teamName !== "string") return 0;
  const tok = normalizeTeamToken(teamName);
  for (let i = 0; i < NON_POPULAR_MX_EXCLUSIONS.length; i += 1) {
    if (tok.includes(NON_POPULAR_MX_EXCLUSIONS[i]!)) {
      return 0;
    }
  }
  if (tok.includes(" america ") || tok.includes(" aguilas ") || tok.includes(" club america ")) {
    return 1.0;
  }
  if (tok.includes(" chivas ") || tok.includes(" guadalajara ")) {
    return 0.95;
  }
  if (tok.includes(" cruz azul ")) {
    return 0.8;
  }
  if (tok.includes(" pumas ") || tok.includes(" unam ") || tok.includes(" universidad nacional ")) {
    return 0.75;
  }
  if (tok.includes(" tigres ") || tok.includes(" uanl ")) {
    return 0.72;
  }
  if (tok.includes(" monterrey ") || tok.includes(" rayados ")) {
    return 0.72;
  }
  return 0;
}

const RECREATIONAL_BOOKMAKERS = new Set([
  "caliente_mx",
  "caliente",
  "caliente.mx",
  "codere_mx",
  "codere",
  "bet365_mx",
  "b365",
  "soft",
]);

function extractSimplex3(
  probs: ImpliedProbs1X2 | readonly [number, number, number] | readonly number[],
): readonly [number, number, number] {
  let p0: number | undefined;
  let p1: number | undefined;
  let p2: number | undefined;
  if (Array.isArray(probs)) {
    if (probs.length !== 3) {
      throw new InvalidOddsError(`se esperaban 3 probabilidades 1X2; recibido ${probs.length}`);
    }
    p0 = probs[0];
    p1 = probs[1];
    p2 = probs[2];
  } else if (probs !== null && typeof probs === "object") {
    const obj = probs as ImpliedProbs1X2;
    p0 = obj.pHome;
    p1 = obj.pDraw;
    p2 = obj.pAway;
  }
  if (
    p0 === undefined ||
    p1 === undefined ||
    p2 === undefined ||
    !Number.isFinite(p0) ||
    !Number.isFinite(p1) ||
    !Number.isFinite(p2) ||
    p0 < 0 ||
    p1 < 0 ||
    p2 < 0
  ) {
    throw new InvalidOddsError("probabilidades 1X2 inválidas o negativas");
  }
  const sum = p0 + p1 + p2;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    throw new InvalidOddsError("la suma de probabilidades 1X2 debe ser positiva");
  }
  return [p0 / sum, p1 / sum, p2 / sum];
}

function extractSimplex2(
  probs: { readonly pHome: number; readonly pAway: number } | readonly [number, number] | readonly number[],
): readonly [number, number] {
  let p0: number | undefined;
  let p1: number | undefined;
  if (Array.isArray(probs)) {
    if (probs.length !== 2) {
      throw new InvalidOddsError(`se esperaban 2 probabilidades 2-way; recibido ${probs.length}`);
    }
    p0 = probs[0];
    p1 = probs[1];
  } else if (probs !== null && typeof probs === "object") {
    const obj = probs as { readonly pHome: number; readonly pAway: number };
    p0 = obj.pHome;
    p1 = obj.pAway;
  }
  if (
    p0 === undefined ||
    p1 === undefined ||
    !Number.isFinite(p0) ||
    !Number.isFinite(p1) ||
    p0 < 0 ||
    p1 < 0
  ) {
    throw new InvalidOddsError("probabilidades 2-way inválidas o negativas");
  }
  const sum = p0 + p1;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    throw new InvalidOddsError("la suma de probabilidades 2-way debe ser positiva");
  }
  return [p0 / sum, p1 / sum];
}

function softmaxStable3(z0: number, z1: number, z2: number): readonly [number, number, number] {
  const m = Math.max(z0, z1, z2);
  const e0 = Math.exp(z0 - m);
  const e1 = Math.exp(z1 - m);
  const e2 = Math.exp(z2 - m);
  const sum = e0 + e1 + e2;
  return [e0 / sum, e1 / sum, e2 / sum];
}

function softmaxStable2(z0: number, z1: number): readonly [number, number] {
  const m = Math.max(z0, z1);
  const e0 = Math.exp(z0 - m);
  const e1 = Math.exp(z1 - m);
  const sum = e0 + e1;
  return [e0 / sum, e1 / sum];
}

/**
 * Detector y corrector determinista de sesgo público recreativo en clubes populares de Liga MX
 * cuando el mercado proviene de libro recreativo (`overround >= 0.050` o `bookmaker === "caliente_mx"`),
 * renormalizando estrictamente al simplex (`pHome + pDraw + pAway = 1`).
 */
export function debiaseRecreationalLigaMx(
  probs: ImpliedProbs1X2 | readonly [number, number, number],
  params: LigaMxDebiasParams,
): LigaMxDebiasResult {
  const [p0, p1, p2] = extractSimplex3(probs);
  const bookNorm = String(params.bookmaker ?? "").trim().toLowerCase();
  const isCaliente = bookNorm === "caliente_mx" || bookNorm === "caliente" || bookNorm === "caliente.mx";
  const isRecBook =
    RECREATIONAL_BOOKMAKERS.has(bookNorm) ||
    (Number.isFinite(params.overround) && params.overround >= LIGAMX_RECREATIONAL_OVERROUND_THRESHOLD);

  const wHome = detectPopularLigaMxWeight(params.homeTeam);
  const wAway = detectPopularLigaMxWeight(params.awayTeam);
  const deltaPop = wHome - wAway;

  if (!isRecBook || Math.abs(deltaPop) < 1e-9) {
    return {
      pHome: p0,
      pDraw: p1,
      pAway: p2,
      biasDetected: false,
      biasedSide: "none",
      logitAdjustment: 0,
    };
  }

  const rawOv = Number.isFinite(params.overround) ? params.overround : 0.05;
  const effOverround = Math.max(rawOv, isCaliente ? 0.06 : LIGAMX_RECREATIONAL_OVERROUND_THRESHOLD);
  const mFactor = clamp(
    (effOverround - SHARP_OVERROUND_ANCHOR) / (RECREATIONAL_OVERROUND_ANCHOR - SHARP_OVERROUND_ANCHOR),
    0.5,
    1.5,
  );
  const shiftMag = BASE_MX_LOGIT_SHADE * Math.abs(deltaPop) * mFactor;
  const clipProb = (p: number): number => clamp(p, 1e-12, 1 - 1e-12);

  let z0 = Math.log(clipProb(p0));
  let z1 = Math.log(clipProb(p1));
  let z2 = Math.log(clipProb(p2));
  let biasedSide: "home" | "away" = "home";
  let logitAdjustment = 0;

  if (deltaPop > 0) {
    biasedSide = "home";
    logitAdjustment = -shiftMag;
    z0 -= shiftMag;
    z1 += 0.45 * shiftMag;
    z2 += 0.55 * shiftMag;
  } else {
    biasedSide = "away";
    logitAdjustment = shiftMag;
    z0 += 0.55 * shiftMag;
    z1 += 0.45 * shiftMag;
    z2 -= shiftMag;
  }

  const [outH, outD, outA] = softmaxStable3(z0, z1, z2);
  return {
    pHome: outH,
    pDraw: outD,
    pAway: outA,
    biasDetected: true,
    biasedSide,
    logitAdjustment,
  };
}

// ---------------------------------------------------------------------------
// Canal de Dinero Profesional: `PitchLab Singularity v3.0` (Sharp Tilt & Exchange Anchor)
// ---------------------------------------------------------------------------

export type RlmSignalSide = "home" | "away" | "none" | null;

export interface SingularityTilt3WayInput {
  modelProbs: ImpliedProbs1X2 | readonly [number, number, number];
  marketProbs: ImpliedProbs1X2 | readonly [number, number, number];
  marketOverround?: number | null;
  smarketsExchangeMidProbHome?: number | null;
  smarketsSpreadBps?: number | null;
  sharpMoneyDivergenceHomePct?: number | null;
  reverseLineMovementSide?: RlmSignalSide;
  baseMarketAlpha?: number;
}

export interface SingularityTilt3WayResult extends ImpliedProbs1X2 {
  pHome: number;
  pDraw: number;
  pAway: number;
  effectiveMarketAlpha: number;
  exchangeWeight: number;
  sharpLogitTilt: number;
}

export interface SingularityTilt2WayInput {
  modelProbs: { readonly pHome: number; readonly pAway: number } | readonly [number, number];
  marketProbs: { readonly pHome: number; readonly pAway: number } | readonly [number, number];
  marketOverround?: number | null;
  smarketsExchangeMidProbHome?: number | null;
  smarketsSpreadBps?: number | null;
  sharpMoneyDivergenceHomePct?: number | null;
  reverseLineMovementSide?: RlmSignalSide;
  baseMarketAlpha?: number;
}

export interface SingularityTilt2WayResult {
  pHome: number;
  pAway: number;
  effectiveMarketAlpha: number;
  exchangeWeight: number;
  sharpLogitTilt: number;
}

function resolveEffectiveMarketAlpha(
  marketOverround?: number | null,
  baseMarketAlpha?: number,
): number {
  if (baseMarketAlpha !== undefined && Number.isFinite(baseMarketAlpha)) {
    return clamp(baseMarketAlpha, 0, 1);
  }
  if (marketOverround !== undefined && marketOverround !== null && Number.isFinite(marketOverround)) {
    const s = smoothstep01(
      (marketOverround - SHARP_OVERROUND_ANCHOR) /
        (RECREATIONAL_OVERROUND_ANCHOR - SHARP_OVERROUND_ANCHOR),
    );
    return (
      DEFAULT_SINGULARITY_ALPHA_SHARP -
      (DEFAULT_SINGULARITY_ALPHA_SHARP - DEFAULT_SINGULARITY_ALPHA_SOFT) * s
    );
  }
  return DEFAULT_SINGULARITY_ALPHA_SHARP;
}

function resolveExchangeWeight(
  midProbHome?: number | null,
  spreadBps?: number | null,
): number {
  if (
    midProbHome === undefined ||
    midProbHome === null ||
    !Number.isFinite(midProbHome) ||
    midProbHome <= 0.005 ||
    midProbHome >= 0.995
  ) {
    return 0;
  }
  const liq =
    spreadBps !== undefined && spreadBps !== null && Number.isFinite(spreadBps)
      ? clamp(1 - (spreadBps - 60) / 500, 0.15, 1)
      : 0.75;
  return 0.22 * liq;
}

function resolveSharpLogitTilt(
  sharpDivHomePct?: number | null,
  rlmSide?: RlmSignalSide,
): number {
  const div =
    sharpDivHomePct !== undefined && sharpDivHomePct !== null && Number.isFinite(sharpDivHomePct)
      ? sharpDivHomePct
      : 0;
  const rlmTerm =
    rlmSide === "home"
      ? RLM_DIRECTIONAL_LOGIT_TILT
      : rlmSide === "away"
        ? -RLM_DIRECTIONAL_LOGIT_TILT
        : 0;
  const raw = SHARP_DIVERGENCE_LOGIT_GAIN * Math.tanh(div / 20) + rlmTerm;
  return clamp(raw, -MAX_ABS_SHARP_LOGIT_TILT, MAX_ABS_SHARP_LOGIT_TILT);
}

/**
 * Pool log-lineal prospectivo `PitchLab Singularity v3.0` (mercados 3-way: Fútbol / Liga MX / Europa).
 * Combina probabilidades deportivas (`Tachyon v3.0`), mercado de-vigado adaptativo, ancla exchange
 * (`Smarkets` mid-prob) y tilt acotado de dinero profesional (`sharp_money_divergence` + `RLM`).
 */
export function applySingularitySharpTilt3Way(
  input: SingularityTilt3WayInput,
): SingularityTilt3WayResult {
  const [m0, m1, m2] = extractSimplex3(input.modelProbs);
  const [k0, k1, k2] = extractSimplex3(input.marketProbs);

  const alphaMkt = resolveEffectiveMarketAlpha(input.marketOverround, input.baseMarketAlpha);
  const wExch = resolveExchangeWeight(input.smarketsExchangeMidProbHome, input.smarketsSpreadBps);
  const sharpTilt = resolveSharpLogitTilt(
    input.sharpMoneyDivergenceHomePct,
    input.reverseLineMovementSide,
  );

  let e0 = k0;
  let e1 = k1;
  let e2 = k2;
  if (wExch > 0 && input.smarketsExchangeMidProbHome !== null && input.smarketsExchangeMidProbHome !== undefined) {
    e0 = clamp(input.smarketsExchangeMidProbHome, 0.01, 0.98);
    const remMkt = k1 + k2;
    const remExch = 1 - e0;
    if (remMkt > 1e-12) {
      e1 = remExch * (k1 / remMkt);
      e2 = remExch * (k2 / remMkt);
    } else {
      e1 = 0.5 * remExch;
      e2 = 0.5 * remExch;
    }
  }

  const clipP = (p: number): number => clamp(p, 1e-12, 1 - 1e-12);
  const prior0 = (1 - wExch) * Math.log(clipP(k0)) + wExch * Math.log(clipP(e0));
  const prior1 = (1 - wExch) * Math.log(clipP(k1)) + wExch * Math.log(clipP(e1));
  const prior2 = (1 - wExch) * Math.log(clipP(k2)) + wExch * Math.log(clipP(e2));

  const z0 = alphaMkt * prior0 + (1 - alphaMkt) * Math.log(clipP(m0)) + 0.5 * sharpTilt;
  const z1 = alphaMkt * prior1 + (1 - alphaMkt) * Math.log(clipP(m1));
  const z2 = alphaMkt * prior2 + (1 - alphaMkt) * Math.log(clipP(m2)) - 0.5 * sharpTilt;

  const [pHome, pDraw, pAway] = softmaxStable3(z0, z1, z2);
  return {
    pHome,
    pDraw,
    pAway,
    effectiveMarketAlpha: alphaMkt,
    exchangeWeight: wExch,
    sharpLogitTilt: sharpTilt,
  };
}

/**
 * Pool log-lineal prospectivo `PitchLab Singularity v3.0` (mercados 2-way: `NFL`, `NHL`, `MLB`, `NBA`, `NCAAF`).
 */
export function applySingularitySharpTilt2Way(
  input: SingularityTilt2WayInput,
): SingularityTilt2WayResult {
  const [m0, m1] = extractSimplex2(input.modelProbs);
  const [k0, k1] = extractSimplex2(input.marketProbs);

  const alphaMkt = resolveEffectiveMarketAlpha(input.marketOverround, input.baseMarketAlpha);
  const wExch = resolveExchangeWeight(input.smarketsExchangeMidProbHome, input.smarketsSpreadBps);
  const sharpTilt = resolveSharpLogitTilt(
    input.sharpMoneyDivergenceHomePct,
    input.reverseLineMovementSide,
  );

  let e0 = k0;
  let e1 = k1;
  if (wExch > 0 && input.smarketsExchangeMidProbHome !== null && input.smarketsExchangeMidProbHome !== undefined) {
    e0 = clamp(input.smarketsExchangeMidProbHome, 0.01, 0.99);
    e1 = 1 - e0;
  }

  const clipP = (p: number): number => clamp(p, 1e-12, 1 - 1e-12);
  const prior0 = (1 - wExch) * Math.log(clipP(k0)) + wExch * Math.log(clipP(e0));
  const prior1 = (1 - wExch) * Math.log(clipP(k1)) + wExch * Math.log(clipP(e1));

  const z0 = alphaMkt * prior0 + (1 - alphaMkt) * Math.log(clipP(m0)) + 0.5 * sharpTilt;
  const z1 = alphaMkt * prior1 + (1 - alphaMkt) * Math.log(clipP(m1)) - 0.5 * sharpTilt;

  const [pHome, pAway] = softmaxStable2(z0, z1);
  return {
    pHome,
    pAway,
    effectiveMarketAlpha: alphaMkt,
    exchangeWeight: wExch,
    sharpLogitTilt: sharpTilt,
  };
}

// ---------------------------------------------------------------------------
// Ejecución de Valor & Gate Anti-RLM Institucional (`PitchLab Geodesic v2.0`)
// ---------------------------------------------------------------------------

export type MarketSide = "home" | "draw" | "away";

export type GeodesicVetoReason =
  | "adverse_rlm"
  | "adverse_sharp_divergence"
  | "adverse_rlm_and_sharp_divergence"
  | null;

export interface GeodesicSideEvaluation {
  side: MarketSide;
  prob: number;
  decimalOdds: number;
  impliedProbRaw: number;
  /** Ventaja en probabilidad frente a la cuota ofrecida: `prob - 1 / decimalOdds`. */
  edge: number;
  /** Valor esperado por unidad apostada (ROI): `prob * decimalOdds - 1`. */
  ev: number;
  /** Quarter-Kelly (`0.25x` por defecto) teórico antes del veto institucional. */
  kellyFraction: number;
  /** Divergencia de dinero profesional (`% money - % tickets`) en pp sobre este lado. */
  sharpMoneyDivergenceOnSide: number;
  /** `true` si este lado es bloqueado por ir contra un RLM institucional o tener divergencia sharp <= -12.0 pp. */
  vetoedByRlm: boolean;
  vetoReason: GeodesicVetoReason;
  /** `true` cuando hay valor ejecutable y tanto el modelo como `sharp_divergence >= +10 pp` / RLM coinciden. */
  institutionalConfirmation: boolean;
  /** Stake final recomendado (`0` si fue vetado, no alcanza `minEv` o falla el gate de incertidumbre). */
  recommendedStake: number;
}

export interface GeodesicV2GateInput {
  /** Probabilidades evaluadas (`Singularity v3.0`, 2-way o 3-way). */
  probs:
    | ImpliedProbs1X2
    | { readonly pHome: number; readonly pAway: number }
    | readonly [number, number, number]
    | readonly [number, number]
    | readonly number[];
  /** Cuotas decimales de ejecución disponibles (2-way o 3-way, cada cuota > 1). */
  odds:
    | DecimalOdds1X2
    | { readonly oddsHome: number; readonly oddsAway: number }
    | readonly [number, number]
    | readonly number[];
  /** Probabilidades de mercado sin vig para el control anti-Winner's Curse (opcional; se infiere de `odds` si falta). */
  marketProbs?:
    | ImpliedProbs1X2
    | { readonly pHome: number; readonly pAway: number }
    | readonly [number, number, number]
    | readonly [number, number]
    | readonly number[]
    | null;
  /** Lado hacia el que apunta un `reverse_line_movement_signal` institucional activo. */
  reverseLineMovementSide?: RlmSignalSide;
  /** Divergencia `(% money - % tickets)` en puntos porcentuales en el lado local. */
  sharpMoneyDivergenceHomePct?: number | null;
  /** Divergencia `(% money - % tickets)` en puntos porcentuales en el empate (solo 3-way, opcional). */
  sharpMoneyDivergenceDrawPct?: number | null;
  /** Divergencia `(% money - % tickets)` en puntos porcentuales en el visitante (si falta, `-sharpMoneyDivergenceHomePct`). */
  sharpMoneyDivergenceAwayPct?: number | null;
  kellyScale?: number;
  minEv?: number;
  maxEv?: number;
  maxDisagreement?: number;
  maxStake?: number;
  adverseSharpThresholdPct?: number;
  confirmSharpThresholdPct?: number;
}

export interface GeodesicV2GateResult {
  marketType: "2way" | "3way";
  outcomes: readonly GeodesicSideEvaluation[];
  bestBet: GeodesicSideEvaluation | null;
  topRawValueSide: MarketSide | null;
  vetoedByRlm: boolean;
  institutionalConfirmation: boolean;
  recommendedStake: number;
  edge: number;
  ev: number;
  kellyFraction: number;
  uncertaintyGatePassed: boolean;
}

function parseGateProbsAndOdds(input: GeodesicV2GateInput): {
  is3Way: boolean;
  probs: readonly number[];
  odds: readonly number[];
  mktProbs: readonly number[];
} {
  let probsArr: readonly number[];
  if (Array.isArray(input.probs)) {
    if (input.probs.length === 3) {
      probsArr = extractSimplex3(input.probs);
    } else if (input.probs.length === 2) {
      probsArr = extractSimplex2(input.probs);
    } else {
      throw new InvalidOddsError(`Geodesic v2 espera 2 o 3 probabilidades; recibido ${input.probs.length}`);
    }
  } else if (input.probs !== null && typeof input.probs === "object" && "pDraw" in input.probs && input.probs.pDraw !== undefined) {
    probsArr = extractSimplex3(input.probs as ImpliedProbs1X2);
  } else if (input.probs !== null && typeof input.probs === "object" && "pHome" in input.probs && "pAway" in input.probs) {
    probsArr = extractSimplex2(input.probs as { readonly pHome: number; readonly pAway: number });
  } else {
    throw new InvalidOddsError("formato de probabilidades inválido en Geodesic v2");
  }

  const is3Way = probsArr.length === 3;
  let oddsArr: number[];
  if (Array.isArray(input.odds)) {
    oddsArr = [...input.odds];
  } else if (input.odds !== null && typeof input.odds === "object") {
    if (is3Way && "oddsDraw" in input.odds) {
      const o3 = input.odds as DecimalOdds1X2Object;
      oddsArr = [o3.oddsHome, o3.oddsDraw, o3.oddsAway];
    } else if (!is3Way && "oddsHome" in input.odds && "oddsAway" in input.odds) {
      const o2 = input.odds as { readonly oddsHome: number; readonly oddsAway: number };
      oddsArr = [o2.oddsHome, o2.oddsAway];
    } else {
      throw new InvalidOddsError("dimensiones incompatibles entre probabilidades y cuotas en Geodesic v2");
    }
  } else {
    throw new InvalidOddsError("formato de cuotas inválido en Geodesic v2");
  }

  if (oddsArr.length !== probsArr.length) {
    throw new InvalidOddsError(
      `dimensiones incompatibles en Geodesic v2: probs=${probsArr.length}, odds=${oddsArr.length}`,
    );
  }
  for (let i = 0; i < oddsArr.length; i += 1) {
    const o = oddsArr[i];
    if (o === undefined || !Number.isFinite(o) || o <= 1) {
      throw new InvalidOddsError(`cuota de ejecución inválida en el índice ${i}: ${String(o)}`);
    }
  }

  let mktArr: readonly number[];
  if (input.marketProbs !== undefined && input.marketProbs !== null) {
    mktArr = is3Way
      ? extractSimplex3(input.marketProbs as ImpliedProbs1X2 | readonly number[])
      : extractSimplex2(input.marketProbs as { readonly pHome: number; readonly pAway: number } | readonly number[]);
  } else {
    const sumImp = oddsArr.reduce((acc, o) => acc + 1 / o, 0);
    if (sumImp >= MIN_OVERROUND && sumImp <= MAX_OVERROUND) {
      if (is3Way) {
        const ad = devigAdaptive1X2([oddsArr[0]!, oddsArr[1]!, oddsArr[2]!]);
        mktArr = [ad.pHome, ad.pDraw, ad.pAway];
      } else {
        const ad2 = devig2Way(oddsArr[0]!, oddsArr[1]!, "adaptive");
        mktArr = [ad2.pHome, ad2.pAway];
      }
    } else {
      mktArr = oddsArr.map((o) => 1 / o / sumImp);
    }
  }

  return { is3Way, probs: probsArr, odds: oddsArr, mktProbs: mktArr };
}

/**
 * Selector de ejecución de valor **`PitchLab Geodesic v2.0`** (3-way y 2-way) con Quarter-Kelly (`0.25x`),
 * control anti-Winner's Curse y **Gate Anti-RLM Institucional**:
 *   - Bloquea (`vetoedByRlm: true`, `recommendedStake: 0`) cualquier apuesta cuyo lado vaya en contra
 *     de un `reverse_line_movement_signal` activo o enfrente `sharpMoneyDivergenceOnSide <= -12.0` pp.
 *   - Otorga `institutionalConfirmation: true` cuando el lado tiene valor ejecutable y converge con
 *     `sharp_money_divergence >= +10.0` pp o RLM a favor.
 */
export function evaluateGeodesicV2ValueGate(input: GeodesicV2GateInput): GeodesicV2GateResult {
  const { is3Way, probs, odds, mktProbs } = parseGateProbsAndOdds(input);

  const kellyScale = input.kellyScale ?? GEODESIC_DEFAULT_KELLY_SCALE;
  const minEv = input.minEv ?? GEODESIC_DEFAULT_MIN_EV;
  const maxEv = input.maxEv ?? GEODESIC_DEFAULT_MAX_EV;
  const maxDisagreement = input.maxDisagreement ?? GEODESIC_DEFAULT_MAX_DISAGREEMENT;
  const maxStake = input.maxStake ?? GEODESIC_DEFAULT_MAX_STAKE;
  const adverseSharpThr = input.adverseSharpThresholdPct ?? GEODESIC_ADVERSE_SHARP_VETO_PCT;
  const confirmSharpThr = input.confirmSharpThresholdPct ?? GEODESIC_CONFIRM_SHARP_PCT;

  const rlmSide: RlmSignalSide = input.reverseLineMovementSide ?? "none";
  const divHome =
    input.sharpMoneyDivergenceHomePct !== undefined &&
    input.sharpMoneyDivergenceHomePct !== null &&
    Number.isFinite(input.sharpMoneyDivergenceHomePct)
      ? input.sharpMoneyDivergenceHomePct
      : 0;
  const divAway =
    input.sharpMoneyDivergenceAwayPct !== undefined &&
    input.sharpMoneyDivergenceAwayPct !== null &&
    Number.isFinite(input.sharpMoneyDivergenceAwayPct)
      ? input.sharpMoneyDivergenceAwayPct
      : -divHome;
  const divDraw =
    input.sharpMoneyDivergenceDrawPct !== undefined &&
    input.sharpMoneyDivergenceDrawPct !== null &&
    Number.isFinite(input.sharpMoneyDivergenceDrawPct)
      ? input.sharpMoneyDivergenceDrawPct
      : 0;

  let maxObsDisagreement = 0;
  let maxPositiveEv = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const d = Math.abs(probs[i]! - mktProbs[i]!);
    if (d > maxObsDisagreement) maxObsDisagreement = d;
    const evI = probs[i]! * odds[i]! - 1;
    if (evI > maxPositiveEv) maxPositiveEv = evI;
  }
  const uncertaintyGatePassed = maxObsDisagreement <= maxDisagreement && maxPositiveEv <= maxEv;

  const sides: readonly MarketSide[] = is3Way ? ["home", "draw", "away"] : ["home", "away"];
  const sideDivs: readonly number[] = is3Way ? [divHome, divDraw, divAway] : [divHome, divAway];

  const outcomes: GeodesicSideEvaluation[] = sides.map((side, idx) => {
    const p = probs[idx]!;
    const odd = odds[idx]!;
    const impRaw = 1 / odd;
    const edge = p - impRaw;
    const ev = p * odd - 1;
    const rawKelly = ev > 0 && odd > 1 ? ev / (odd - 1) : 0;
    const kellyFraction =
      ev > 0 && odd > 1 ? Math.min(maxStake, Math.max(0, kellyScale * rawKelly)) : 0;

    const sharpOnSide = sideDivs[idx]!;
    const adverseRlm =
      (side === "home" && rlmSide === "away") || (side === "away" && rlmSide === "home");
    const alignedRlm =
      (side === "home" && rlmSide === "home") || (side === "away" && rlmSide === "away");
    const adverseSharp = sharpOnSide <= adverseSharpThr;

    const vetoedByRlm = adverseRlm || adverseSharp;
    const vetoReason: GeodesicVetoReason =
      adverseRlm && adverseSharp
        ? "adverse_rlm_and_sharp_divergence"
        : adverseRlm
          ? "adverse_rlm"
          : adverseSharp
            ? "adverse_sharp_divergence"
            : null;

    const hasActionableEdge = ev >= minEv && uncertaintyGatePassed;
    const institutionalConfirmation =
      hasActionableEdge && !vetoedByRlm && (alignedRlm || sharpOnSide >= confirmSharpThr);
    const recommendedStake = hasActionableEdge && !vetoedByRlm ? kellyFraction : 0;

    return {
      side,
      prob: p,
      decimalOdds: odd,
      impliedProbRaw: impRaw,
      edge,
      ev,
      kellyFraction,
      sharpMoneyDivergenceOnSide: sharpOnSide,
      vetoedByRlm,
      vetoReason,
      institutionalConfirmation,
      recommendedStake,
    };
  });

  // Lado con mayor EV bruto y mejor lado ejecutable tras Gate Anti-RLM
  let topRaw: GeodesicSideEvaluation | null = null;
  let bestBet: GeodesicSideEvaluation | null = null;
  for (let i = 0; i < outcomes.length; i += 1) {
    const item = outcomes[i]!;
    if (topRaw === null || item.ev > topRaw.ev) {
      topRaw = item;
    }
    if (item.recommendedStake > 0 && (bestBet === null || item.ev > bestBet.ev)) {
      bestBet = item;
    }
  }

  const topRawHadValue = topRaw !== null && topRaw.ev >= minEv && uncertaintyGatePassed;
  const summaryTarget = bestBet ?? topRaw;

  return {
    marketType: is3Way ? "3way" : "2way",
    outcomes,
    bestBet,
    topRawValueSide: topRaw !== null && topRaw.ev > 0 ? topRaw.side : null,
    vetoedByRlm: bestBet === null && topRaw !== null ? (topRawHadValue ? topRaw.vetoedByRlm : outcomes.some((o) => o.vetoedByRlm && o.ev > 0)) : false,
    institutionalConfirmation: bestBet !== null ? bestBet.institutionalConfirmation : false,
    recommendedStake: bestBet !== null ? bestBet.recommendedStake : 0,
    edge: summaryTarget !== null ? summaryTarget.edge : 0,
    ev: summaryTarget !== null ? summaryTarget.ev : 0,
    kellyFraction: summaryTarget !== null ? summaryTarget.kellyFraction : 0,
    uncertaintyGatePassed,
  };
}
