/**
 * Motor A — inferencia determinista del artefacto `model_motor_a.json`.
 *
 * Pipeline exacto que reproduce Python (sklearn):
 *   1. vector de diseño = [54 features base, 23 dummies de división]
 *   2. imputer: `null`/`NaN` -> mediana de entrenamiento (`imputer.statistics[i]`)
 *   3. scaler: `(x - mean[i]) / scale[i]`, con `scale[i] === 0 -> 1`
 *   4. logits[k] = coef[k] · x + intercept[k]
 *   5. softmax estable: `exp(l[k] - max(l)) / sum(exp(...))`
 *
 * Sin dependencias externas, sin I/O y sin mutar entradas: todo son funciones puras.
 */
import type {
  BaseRates,
  ModelArtifact,
  Prediction,
  SnapshotRow,
} from "./types.js";

/** Identificador fijo del motor aprobado (A06/A09). */
export const MOTOR_A_MODEL_ID = "motor_a_logistic_v1";
/** Identificador del camino de mercado (Motor B / de-vig). */
export const MARKET_MODEL_ID = "market_devig";
export const MARKET_MODEL_VERSION = "market_devig_v1";
/** Identificador del prior global usado cuando las features son irrecuperables. */
export const BASE_RATES_MODEL_ID = "base_rates_v1";

/** Tolerancia contractual del simplex (suma de probabilidades). */
export const PROBABILITY_SUM_TOLERANCE = 1e-9;
/** Tolerancia para aceptar un vector de cuotas de mercado como suma ≈ 1. */
export const MARKET_SUM_TOLERANCE = 1e-6;

/**
 * Frecuencias globales H/D/A del fútbol (prior de respaldo). No se usan para
 * predecir partidos normales: solo cuando el vector de features es irrecuperable.
 * Se normalizan al usarse, de modo que la salida siempre suma 1.
 */
export const GLOBAL_HDA_RATES: BaseRates = Object.freeze({
  pHome: 0.44,
  pDraw: 0.26,
  pAway: 0.3,
});

/** Error controlado para filas con features ausentes, corruptas o no finitas. */
export class InvalidFeaturesError extends Error {
  readonly code = "invalid_features" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidFeaturesError";
  }
}

function invalidModel(detail: string): never {
  throw new Error(`ModelArtifact inválido: ${detail}`);
}

function assertFiniteArray(values: readonly number[], label: string): void {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === undefined || !Number.isFinite(value)) {
      invalidModel(`${label}[${i}] no es finito`);
    }
  }
}

/**
 * Valida las invariantes dimensionales del artefacto. Se ejecuta en cada llamada
 * pública (coste O(77)) para que un JSON corrupto falle con un mensaje claro y no
 * con `undefined` propagándose por el cálculo.
 */
export function assertValidModel(model: ModelArtifact): void {
  if (model === null || typeof model !== "object") {
    invalidModel("el artefacto no es un objeto");
  }
  const features = model.features;
  if (!Array.isArray(features) || features.length === 0) {
    invalidModel("`features` está vacío o no es un array");
  }
  const n = features.length;
  const nBase = model.n_features_base;
  if (!Number.isInteger(nBase) || nBase < 0) {
    invalidModel("`n_features_base` no es un entero >= 0");
  }
  if (!Array.isArray(model.div_levels)) {
    invalidModel("`div_levels` no es un array");
  }
  if (nBase + model.div_levels.length !== n) {
    invalidModel(
      `n_features_base (${nBase}) + div_levels (${model.div_levels.length}) !== features (${n})`,
    );
  }
  if (!Array.isArray(model.coef) || model.coef.length !== 3) {
    invalidModel("`coef` debe tener 3 filas (H/D/A)");
  }
  if (!Array.isArray(model.intercept) || model.intercept.length !== 3) {
    invalidModel("`intercept` debe tener 3 valores (H/D/A)");
  }
  if (!Array.isArray(model.classes) || model.classes.length !== 3) {
    invalidModel("`classes` debe tener 3 valores");
  }
  for (let k = 0; k < 3; k += 1) {
    const row = model.coef[k];
    if (row === undefined || !Array.isArray(row) || row.length !== n) {
      invalidModel(`coef[${k}] debe tener ${n} columnas`);
    }
    assertFiniteArray(row, `coef[${k}]`);
  }
  assertFiniteArray(model.intercept, "intercept");

  if (!model.imputer || !Array.isArray(model.imputer.statistics)) {
    invalidModel("`imputer.statistics` no es un array");
  }
  if (model.imputer.statistics.length !== n) {
    invalidModel(
      `imputer.statistics tiene ${model.imputer.statistics.length} valores; se esperaban ${n}`,
    );
  }
  if (!model.scaler || !Array.isArray(model.scaler.mean) || !Array.isArray(model.scaler.scale)) {
    invalidModel("`scaler.mean`/`scaler.scale` no son arrays");
  }
  if (model.scaler.mean.length !== n || model.scaler.scale.length !== n) {
    invalidModel(`scaler.mean/scale deben tener ${n} valores`);
  }
  // La media debe ser finita; la escala puede ser 0 (se sustituye por 1).
  assertFiniteArray(model.scaler.mean, "scaler.mean");
  assertFiniteArray(model.scaler.scale, "scaler.scale");

  if (typeof model.version !== "string" || model.version.length === 0) {
    invalidModel("`version` debe ser un string no vacío");
  }
  if (typeof model.created_at !== "string" || model.created_at.length === 0) {
    invalidModel("`created_at` debe ser un string no vacío");
  }
}

function resolveBaseFeature(
  raw: number | null | undefined,
  statistic: number | undefined,
  index: number,
): number {
  if (raw === undefined) {
    throw new InvalidFeaturesError(`features[${index}] está ausente`);
  }
  if (raw === null || Number.isNaN(raw)) {
    if (statistic === undefined || !Number.isFinite(statistic)) {
      throw new InvalidFeaturesError(
        `features[${index}] es nulo/NaN y no hay estadística de imputación finita`,
      );
    }
    return statistic;
  }
  if (!Number.isFinite(raw)) {
    throw new InvalidFeaturesError(`features[${index}] no es finito (${String(raw)})`);
  }
  return raw;
}

function resolveDummy(raw: number | null | undefined, index: number): number {
  if (raw === undefined || raw === null || !Number.isFinite(raw)) {
    throw new InvalidFeaturesError(`div_onehot[${index}] no es un número finito`);
  }
  return raw;
}

/**
 * Reconstruye el vector de diseño en el orden exacto del artefacto
 * (`features` + `div_onehot`), imputa y estandariza.
 */
function buildStandardizedDesign(row: SnapshotRow, model: ModelArtifact): number[] {
  if (row === null || typeof row !== "object") {
    throw new InvalidFeaturesError("la fila no es un objeto");
  }
  const base = row.features;
  if (!Array.isArray(base)) {
    throw new InvalidFeaturesError("`features` no es un array");
  }
  if (base.length !== model.n_features_base) {
    throw new InvalidFeaturesError(
      `features tiene ${base.length} valores; se esperaban ${model.n_features_base}`,
    );
  }
  const dummies = row.div_onehot;
  if (!Array.isArray(dummies)) {
    throw new InvalidFeaturesError("`div_onehot` no es un array");
  }
  if (dummies.length !== model.div_levels.length) {
    throw new InvalidFeaturesError(
      `div_onehot tiene ${dummies.length} valores; se esperaban ${model.div_levels.length}`,
    );
  }

  const n = model.features.length;
  const design = new Array<number>(n);

  for (let i = 0; i < model.n_features_base; i += 1) {
    design[i] = resolveBaseFeature(base[i], model.imputer.statistics[i], i);
  }
  for (let j = 0; j < model.div_levels.length; j += 1) {
    design[model.n_features_base + j] = resolveDummy(dummies[j], j);
  }

  for (let i = 0; i < n; i += 1) {
    const value = design[i];
    const mean = model.scaler.mean[i];
    const scale = model.scaler.scale[i];
    if (value === undefined || mean === undefined || scale === undefined) {
      invalidModel(`vector de diseño incompleto en la columna ${i}`);
    }
    const denominator = scale === 0 ? 1 : scale;
    const standardized = (value - mean) / denominator;
    if (!Number.isFinite(standardized)) {
      throw new InvalidFeaturesError(`la columna ${i} no se puede estandarizar`);
    }
    design[i] = standardized;
  }

  return design;
}

function dot(coef: readonly number[], x: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < coef.length; i += 1) {
    sum += coef[i]! * x[i]!;
  }
  return sum;
}

function assertSimplex(probs: readonly number[], label: string): void {
  let sum = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const p = probs[i];
    if (p === undefined || !Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`${label}: probabilidad inválida en el índice ${i}: ${String(p)}`);
    }
    sum += p;
  }
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) {
    throw new Error(
      `${label}: la suma ${sum} está fuera de 1 ± ${PROBABILITY_SUM_TOLERANCE}`,
    );
  }
}

/** Softmax numéricamente estable para 3 clases (resta el máximo). */
export function softmax3(logits: readonly number[]): readonly [number, number, number] {
  if (logits.length !== 3) {
    throw new Error(`softmax3 espera 3 logits; recibió ${logits.length}`);
  }
  const l0 = logits[0];
  const l1 = logits[1];
  const l2 = logits[2];
  if (
    l0 === undefined ||
    l1 === undefined ||
    l2 === undefined ||
    !Number.isFinite(l0) ||
    !Number.isFinite(l1) ||
    !Number.isFinite(l2)
  ) {
    throw new Error("softmax3 recibió logits no finitos");
  }
  const max = Math.max(l0, l1, l2);
  const e0 = Math.exp(l0 - max);
  const e1 = Math.exp(l1 - max);
  const e2 = Math.exp(l2 - max);
  const sum = e0 + e1 + e2;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    throw new Error("softmax3 produjo una suma no finita");
  }
  const probs = [e0 / sum, e1 / sum, e2 / sum] as const;
  assertSimplex(probs, "softmax3");
  return probs;
}

/** Predicción Motor A sin validar el modelo (uso interno, modelo ya validado). */
function predictMotorAUnchecked(row: SnapshotRow, model: ModelArtifact): Prediction {
  const design = buildStandardizedDesign(row, model);
  const logits = new Array<number>(3);
  for (let k = 0; k < 3; k += 1) {
    const coef = model.coef[k];
    const intercept = model.intercept[k];
    if (coef === undefined || intercept === undefined) {
      invalidModel(`coef/intercept incompletos para la clase ${k}`);
    }
    logits[k] = dot(coef, design) + intercept;
  }
  const [pHome, pDraw, pAway] = softmax3(logits);
  return {
    pHome,
    pDraw,
    pAway,
    modelId: MOTOR_A_MODEL_ID,
    modelVersion: model.version,
    // Determinista: la marca temporal es la del artefacto, no el reloj del proceso.
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
  };
}

/**
 * Predice con Motor A. Lanza `InvalidFeaturesError` si la fila es irrecuperable
 * (longitud incorrecta, `Infinity`, o `null` sin mediana finita).
 */
export function predictMotorA(row: SnapshotRow, model: ModelArtifact): Prediction {
  assertValidModel(model);
  return predictMotorAUnchecked(row, model);
}

/** `true` si el vector es de longitud 3, finito, en [0,1] y suma 1 ± 1e-6. */
export function isValidMarketProbs(
  value: readonly number[] | null | undefined,
): value is readonly [number, number, number] {
  if (value === null || value === undefined || value.length !== 3) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const p = value[i];
    if (p === undefined || !Number.isFinite(p) || p < 0 || p > 1) {
      return false;
    }
    sum += p;
  }
  return sum > 0 && Math.abs(sum - 1) <= MARKET_SUM_TOLERANCE;
}

function marketPrediction(
  marketProbs: readonly [number, number, number],
  model: ModelArtifact,
): Prediction {
  const sum = marketProbs[0] + marketProbs[1] + marketProbs[2];
  const probs = [
    marketProbs[0] / sum,
    marketProbs[1] / sum,
    marketProbs[2] / sum,
  ] as const;
  assertSimplex(probs, "market_devig");
  return {
    pHome: probs[0],
    pDraw: probs[1],
    pAway: probs[2],
    modelId: MARKET_MODEL_ID,
    modelVersion: MARKET_MODEL_VERSION,
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
  };
}

/** Normaliza H/D/A; si el prior es inválido usa `GLOBAL_HDA_RATES`. */
export function normalizeBaseRates(rates: BaseRates): BaseRates {
  if (rates === null || typeof rates !== "object") {
    return { ...GLOBAL_HDA_RATES };
  }
  const raw = [rates.pHome, rates.pDraw, rates.pAway];
  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i];
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      return { ...GLOBAL_HDA_RATES };
    }
  }
  const sum = raw[0]! + raw[1]! + raw[2]!;
  if (!(sum > 0) || !Number.isFinite(sum)) {
    return { ...GLOBAL_HDA_RATES };
  }
  return {
    pHome: raw[0]! / sum,
    pDraw: raw[1]! / sum,
    pAway: raw[2]! / sum,
  };
}

/**
 * Orquestador de inferencia:
 *   1. Si `marketProbs` es válido -> Motor B (`market_devig`, flag `ok`).
 *   2. Si no, Motor A. Si el mercado se pasó pero fue rechazado, flag
 *      `fallback_motor_a`; si no se pasó, Motor A es el camino primario (`ok`).
 *   3. Si las features son irrecuperables -> prior H/D/A normalizado y flag
 *      `invalid_features` (nunca lanza por datos de entrada).
 *
 * `baseRates` permite inyectar el prior global real del entrenamiento; por defecto
 * se usa 0.44/0.26/0.30.
 */
export function predictWithFallback(
  row: SnapshotRow,
  model: ModelArtifact,
  marketProbs?: readonly number[] | null,
  baseRates: BaseRates = GLOBAL_HDA_RATES,
): Prediction {
  assertValidModel(model);

  if (isValidMarketProbs(marketProbs)) {
    return marketPrediction(marketProbs, model);
  }

  const marketSupplied = marketProbs !== undefined && marketProbs !== null;
  try {
    const motorA = predictMotorAUnchecked(row, model);
    return marketSupplied ? { ...motorA, dataQualityFlag: "fallback_motor_a" } : motorA;
  } catch (error) {
    if (!(error instanceof InvalidFeaturesError)) {
      throw error;
    }
    const rates = normalizeBaseRates(baseRates);
    return {
      pHome: rates.pHome,
      pDraw: rates.pDraw,
      pAway: rates.pAway,
      modelId: BASE_RATES_MODEL_ID,
      modelVersion: model.version,
      generatedAt: model.created_at,
      dataQualityFlag: "invalid_features",
    };
  }
}
