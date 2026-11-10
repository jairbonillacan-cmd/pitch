/**
 * Motor A / Motor B / Motor C (Híbrido) — inferencia determinista del artefacto `model_motor_a.json`.
 *
 * Pipeline exacto que reproduce Python (sklearn):
 *   1. vector de diseño = [79 features base, 23 dummies de división]
 *   2. imputer: `null`/`NaN` -> mediana de entrenamiento (`imputer.statistics[i]`)
 *   3. scaler: `(x - mean[i]) / scale[i]`, con `scale[i] === 0 -> 1`
 *   4. logits[k] = coef[k] · x + intercept[k]
 *   5. softmax estable: `exp(l[k] - max(l)) / sum(exp(...))`
 *
 * Sin dependencias externas, sin I/O y sin mutar entradas: todo son funciones puras.
 */
import type {
  BaseRates,
  LineupAvailabilityDeltaResult,
  NFLModelArtifact,
  NFLSnapshotRow,
  Prediction,
  PredictionMode,
  PredictionRequest,
  ProspectiveAvailabilityPriorConfig,
  ModelArtifact,
  SnapshotRow,
  TeamAvailabilityContext,
} from "./types.js";

/** Identificador fijo del motor deportivo puro (PitchLab Tachyon). */
export const MOTOR_A_MODEL_ID = "motor_a_logistic_v1";
export const TACHYON_MODEL_NAME = "PitchLab Tachyon v3.0";
/** Identificador del camino geodésico de mercado (Motor B / de-vig). */
export const MARKET_MODEL_ID = "market_devig";
export const MARKET_MODEL_VERSION = "market_devig_v2";
export const GEODESIC_MODEL_NAME = "PitchLab Geodesic v2.0";
/** Identificador del motor híbrido log-lineal (PitchLab Singularity = Mercado + Tachyon). */
export const HYBRID_MODEL_ID = "pitchlab_singularity_v3";
export const SINGULARITY_MODEL_NAME = "PitchLab Singularity v3.0";
/** Identificador del prior global usado cuando las features son irrecuperables (PitchLab Horizon). */
export const BASE_RATES_MODEL_ID = "base_rates_v1";
export const HORIZON_MODEL_NAME = "PitchLab Horizon v1.0";

/** Peso por defecto del mercado en el pool log-lineal híbrido. */
export const DEFAULT_HYBRID_ALPHA = 0.85;
/** Umbral máximo de discrepancia |pModel - pMarket| para el filtro anti-Winner's Curse. */
export const MAX_MODEL_MARKET_DISAGREEMENT = 0.12;
/** Edge máximo plausible antes de sospechar información asimétrica no capturada. */
export const MAX_PLAUSIBLE_EDGE = 0.12;
/** Edge mínimo requerido para activar una apuesta de valor. */
export const DEFAULT_MIN_EDGE = 0.02;
/** Escala de Kelly fraccional por defecto (Quarter-Kelly). */
export const DEFAULT_KELLY_SCALE = 0.25;

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
 * pública (coste O(102)) para que un JSON corrupto falle con un mensaje claro y no
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

/**
 * Pool log-lineal entre probabilidades de mercado y del modelo deportivo (Motor C):
 *   log p_i ∝ alpha * log(pMarket_i) + (1 - alpha) * log(pModel_i)
 */
export function blendLogLinear3(
  pMarket: readonly [number, number, number],
  pModel: readonly [number, number, number],
  alpha: number = DEFAULT_HYBRID_ALPHA,
): readonly [number, number, number] {
  const w = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : DEFAULT_HYBRID_ALPHA;
  const clip = (p: number): number => Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const logits: [number, number, number] = [
    w * Math.log(clip(pMarket[0])) + (1 - w) * Math.log(clip(pModel[0])),
    w * Math.log(clip(pMarket[1])) + (1 - w) * Math.log(clip(pModel[1])),
    w * Math.log(clip(pMarket[2])) + (1 - w) * Math.log(clip(pModel[2])),
  ];
  return softmax3(logits);
}

export interface ValueExecutionOptions {
  minEdge?: number;
  maxEdge?: number;
  maxDisagreement?: number;
  kellyScale?: number;
  maxKellyStake?: number;
}

export interface ValueExecutionMetrics {
  modelMarketDivergence: readonly [number, number, number];
  expectedEdge: readonly [number, number, number];
  kellyFraction: readonly [number, number, number];
  uncertaintyGatePassed: boolean;
}

/**
 * Calcula métricas de ejecución de apuestas de valor con filtro anti-Winner's Curse:
 *   - `modelMarketDivergence`: pModel - pMarket
 *   - `expectedEdge`: pEval * odds - 1
 *   - `uncertaintyGatePassed`: max(|pModel - pMarket|) <= maxDisagreement && max(expectedEdge) <= maxEdge
 *   - `kellyFraction`: Quarter-Kelly capado si pasa el gate y supera `minEdge`
 */
export function evaluateValueExecution(
  probsEval: readonly [number, number, number],
  pMarket: readonly [number, number, number],
  pModel: readonly [number, number, number],
  odds: readonly [number, number, number],
  options?: ValueExecutionOptions,
): ValueExecutionMetrics {
  const minEdge = options?.minEdge ?? DEFAULT_MIN_EDGE;
  const maxEdge = options?.maxEdge ?? MAX_PLAUSIBLE_EDGE;
  const maxDisagreement = options?.maxDisagreement ?? MAX_MODEL_MARKET_DISAGREEMENT;
  const kellyScale = options?.kellyScale ?? DEFAULT_KELLY_SCALE;
  const maxKellyStake = options?.maxKellyStake ?? 0.1;

  const divergence: readonly [number, number, number] = [
    pModel[0] - pMarket[0],
    pModel[1] - pMarket[1],
    pModel[2] - pMarket[2],
  ];
  const maxDisagreementObs = Math.max(
    Math.abs(divergence[0]),
    Math.abs(divergence[1]),
    Math.abs(divergence[2]),
  );

  const expectedEdge: readonly [number, number, number] = [
    probsEval[0] * odds[0] - 1,
    probsEval[1] * odds[1] - 1,
    probsEval[2] * odds[2] - 1,
  ];
  const maxPositiveEdge = Math.max(0, expectedEdge[0], expectedEdge[1], expectedEdge[2]);
  const uncertaintyGatePassed =
    maxDisagreementObs <= maxDisagreement && maxPositiveEdge <= maxEdge;

  const kellyFor = (edge: number, odd: number): number => {
    if (!uncertaintyGatePassed || edge < minEdge || !(odd > 1)) {
      return 0;
    }
    const rawKelly = edge / (odd - 1);
    return Math.min(maxKellyStake, Math.max(0, kellyScale * rawKelly));
  };

  const kellyFraction: readonly [number, number, number] = [
    kellyFor(expectedEdge[0], odds[0]),
    kellyFor(expectedEdge[1], odds[1]),
    kellyFor(expectedEdge[2], odds[2]),
  ];

  return {
    modelMarketDivergence: divergence,
    expectedEdge,
    kellyFraction,
    uncertaintyGatePassed,
  };
}

export const DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR: Readonly<ProspectiveAvailabilityPriorConfig> =
  Object.freeze({
    enabled: true,
    schema_version: "3.0.0",
    clip_abs: 0.35,
    weights: {
      missing_market_value_diff: 0.85,
      shrunk_log_squad_value_ratio: 0.06,
      effective_absences_diff: 0.025,
    },
    bounds: {
      missing_market_value_ratio_max: 0.6,
      log_squad_value_ratio_clip: 2.0,
      max_effective_absences_per_team: 8.0,
      effective_absences_diff_clip: 6.0,
    },
    absence_weights: {
      rotowire_injured_out: 0.65,
      transfermarkt_injured_with_rotowire: 0.35,
      transfermarkt_injured_without_rotowire: 0.55,
      suspended_players: 0.8,
    },
    logit_shift: {
      home_multiplier: 0.5,
      draw_multiplier: 0.0,
      away_multiplier: -0.5,
    },
  });

function safeNonNegFloat(
  ctx: TeamAvailabilityContext | null | undefined,
  key: keyof TeamAvailabilityContext,
  fallback = 0,
): number {
  if (!ctx) return fallback;
  const raw = ctx[key];
  if (raw === null || raw === undefined) return fallback;
  const val = Number(raw);
  if (!Number.isFinite(val)) return fallback;
  return Math.max(0, val);
}

function teamEffectiveAbsences(
  ctx: TeamAvailabilityContext | null | undefined,
  cfg: ProspectiveAvailabilityPriorConfig,
): number {
  if (!ctx) return 0;
  const aw = cfg.absence_weights;
  const maxAbs = cfg.bounds.max_effective_absences_per_team;
  const rwRaw = ctx.rotowire_injured_out_count;
  const hasRw = rwRaw !== null && rwRaw !== undefined && Number.isFinite(Number(rwRaw)) && Number(rwRaw) > 0;
  const rwOut = safeNonNegFloat(ctx, "rotowire_injured_out_count", 0);
  const tmInj = safeNonNegFloat(ctx, "injured_players_count", 0);
  const susp = safeNonNegFloat(ctx, "suspended_players_count", 0);

  let eff = hasRw
    ? aw.rotowire_injured_out * rwOut + aw.transfermarkt_injured_with_rotowire * tmInj
    : aw.transfermarkt_injured_without_rotowire * tmInj;
  eff += aw.suspended_players * susp;
  return Math.min(maxAbs, Math.max(0, eff));
}

function teamSquadValueRatio(ctx: TeamAvailabilityContext | null | undefined): number {
  if (!ctx) return 1.0;
  const vr = ctx.value_ratio_vs_league_median;
  if (vr !== null && vr !== undefined) {
    const val = Number(vr);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return 1.0;
}

/**
 * Espejo 1:1 de `fixture_features.py::compute_lineup_availability_delta` (paridad IEEE-754 `< 1e-12`).
 * Prior bayesiano prospectivo en log-odds para inferencia live (`[-0.35, +0.35]`),
 * jamás inyectado en el entrenamiento histórico `2000–2025`.
 */
export function computeLineupAvailabilityDelta(
  homeTeamCtx?: TeamAvailabilityContext | null,
  awayTeamCtx?: TeamAvailabilityContext | null,
  config?: ProspectiveAvailabilityPriorConfig | null,
): LineupAvailabilityDeltaResult {
  const cfg = config ?? DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR;
  if (!cfg.enabled || (!homeTeamCtx && !awayTeamCtx)) {
    return {
      lineup_availability_delta: 0,
      missing_value_term: 0,
      squad_value_term: 0,
      starter_absence_term: 0,
      home_missing_market_value_ratio: 0,
      away_missing_market_value_ratio: 0,
      home_effective_absences: 0,
      away_effective_absences: 0,
    };
  }
  const { bounds, weights, clip_abs: clipAbs } = cfg;
  const hMiss = Math.min(
    bounds.missing_market_value_ratio_max,
    safeNonNegFloat(homeTeamCtx, "missing_market_value_ratio", 0),
  );
  const aMiss = Math.min(
    bounds.missing_market_value_ratio_max,
    safeNonNegFloat(awayTeamCtx, "missing_market_value_ratio", 0),
  );
  const missingTerm = weights.missing_market_value_diff * (aMiss - hMiss);

  const hVr = teamSquadValueRatio(homeTeamCtx);
  const aVr = teamSquadValueRatio(awayTeamCtx);
  const logVr =
    !homeTeamCtx || !awayTeamCtx
      ? 0
      : Math.max(
          -bounds.log_squad_value_ratio_clip,
          Math.min(bounds.log_squad_value_ratio_clip, Math.log(hVr / aVr)),
        );
  const squadTerm = weights.shrunk_log_squad_value_ratio * logVr;

  const hAbs = teamEffectiveAbsences(homeTeamCtx, cfg);
  const aAbs = teamEffectiveAbsences(awayTeamCtx, cfg);
  const absDiff = Math.max(
    -bounds.effective_absences_diff_clip,
    Math.min(bounds.effective_absences_diff_clip, aAbs - hAbs),
  );
  const absenceTerm = weights.effective_absences_diff * absDiff;

  const rawDelta = missingTerm + squadTerm + absenceTerm;
  const delta = Math.max(-clipAbs, Math.min(clipAbs, rawDelta));
  return {
    lineup_availability_delta: delta,
    missing_value_term: missingTerm,
    squad_value_term: squadTerm,
    starter_absence_term: absenceTerm,
    home_missing_market_value_ratio: hMiss,
    away_missing_market_value_ratio: aMiss,
    home_effective_absences: hAbs,
    away_effective_absences: aAbs,
  };
}

/** Aplica `lineupAvailabilityDelta` en espacio logit sobre un vector 1X2 válido. */
export function applyAvailabilityDeltaToProbs(
  probs: readonly [number, number, number],
  availabilityDelta: number,
  priorConfig?: ProspectiveAvailabilityPriorConfig | null,
): readonly [number, number, number] {
  if (!Number.isFinite(availabilityDelta) || availabilityDelta === 0) {
    return probs;
  }
  const ls = priorConfig?.logit_shift ?? DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR.logit_shift!;
  const clip = (p: number): number => Math.min(Math.max(p, 1e-15), 1 - 1e-15);
  return softmax3([
    Math.log(clip(probs[0])) + ls.home_multiplier * availabilityDelta,
    Math.log(clip(probs[1])) + ls.draw_multiplier * availabilityDelta,
    Math.log(clip(probs[2])) + ls.away_multiplier * availabilityDelta,
  ]);
}

function computeMotorALogitsUnchecked(row: SnapshotRow, model: ModelArtifact): [number, number, number] {
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
  return [logits[0]!, logits[1]!, logits[2]!];
}

/** Predicción Motor A sin validar el modelo (uso interno, modelo ya validado). */
function predictMotorAUnchecked(
  row: SnapshotRow,
  model: ModelArtifact,
  availabilityDelta = 0,
): Prediction {
  const baseLogits = computeMotorALogitsUnchecked(row, model);
  const ls =
    model.prospective_availability_prior?.logit_shift ??
    DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR.logit_shift!;
  const adjLogits =
    Number.isFinite(availabilityDelta) && availabilityDelta !== 0
      ? ([
          baseLogits[0] + ls.home_multiplier * availabilityDelta,
          baseLogits[1] + ls.draw_multiplier * availabilityDelta,
          baseLogits[2] + ls.away_multiplier * availabilityDelta,
        ] as const)
      : baseLogits;
  const [pHome, pDraw, pAway] = softmax3(adjLogits);
  return {
    pHome,
    pDraw,
    pAway,
    modelId: MOTOR_A_MODEL_ID,
    modelName: model.codename ?? TACHYON_MODEL_NAME,
    modelVersion: model.version,
    // Determinista: la marca temporal es la del artefacto, no el reloj del proceso.
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
    sport: "football",
  };
}

/**
 * Predice con Motor A (`PitchLab Tachyon v3.0`). Lanza `InvalidFeaturesError` si la fila es irrecuperable
 * (longitud incorrecta, `Infinity`, o `null` sin mediana finita).
 */
export function predictMotorA(row: SnapshotRow, model: ModelArtifact): Prediction {
  assertValidModel(model);
  return predictMotorAUnchecked(row, model, 0);
}

/**
 * Predice con Motor A (`PitchLab Tachyon v3.0`) aplicando el prior bayesiano prospectivo
 * `lineupAvailabilityDelta` directamente sobre los logits pre-softmax (`|Δ| < 1e-12` vs Python).
 */
export function predictMotorAWithAvailability(
  row: SnapshotRow,
  model: ModelArtifact,
  availability:
    | number
    | {
        homeTeamCtx?: TeamAvailabilityContext | null;
        awayTeamCtx?: TeamAvailabilityContext | null;
      },
): Prediction & { lineupAvailabilityDelta: number } {
  assertValidModel(model);
  const delta =
    typeof availability === "number"
      ? availability
      : computeLineupAvailabilityDelta(
          availability.homeTeamCtx,
          availability.awayTeamCtx,
          model.prospective_availability_prior,
        ).lineup_availability_delta;
  const base = predictMotorAUnchecked(row, model, delta);
  return { ...base, lineupAvailabilityDelta: delta };
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

function normalizeMarketVector(
  marketProbs: readonly [number, number, number],
): readonly [number, number, number] {
  const sum = marketProbs[0] + marketProbs[1] + marketProbs[2];
  const probs = [
    marketProbs[0] / sum,
    marketProbs[1] / sum,
    marketProbs[2] / sum,
  ] as const;
  assertSimplex(probs, "market_devig");
  return probs;
}

function marketPrediction(
  marketProbs: readonly [number, number, number],
  model: ModelArtifact,
): Prediction {
  const probs = normalizeMarketVector(marketProbs);
  return {
    pHome: probs[0],
    pDraw: probs[1],
    pAway: probs[2],
    modelId: MARKET_MODEL_ID,
    modelName: GEODESIC_MODEL_NAME,
    modelVersion: MARKET_MODEL_VERSION,
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
    sport: "football",
  };
}

function hybridPredictionUnchecked(
  row: SnapshotRow,
  model: ModelArtifact,
  marketProbs: readonly [number, number, number],
  alpha: number = DEFAULT_HYBRID_ALPHA,
): Prediction {
  const pMarket = normalizeMarketVector(marketProbs);
  const motorA = predictMotorAUnchecked(row, model);
  const pModel: readonly [number, number, number] = [
    motorA.pHome,
    motorA.pDraw,
    motorA.pAway,
  ];
  const w = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : DEFAULT_HYBRID_ALPHA;
  const pHybrid = blendLogLinear3(pMarket, pModel, w);
  const divergence: readonly [number, number, number] = [
    pModel[0] - pMarket[0],
    pModel[1] - pMarket[1],
    pModel[2] - pMarket[2],
  ];
  const maxDisagreement = Math.max(
    Math.abs(divergence[0]),
    Math.abs(divergence[1]),
    Math.abs(divergence[2]),
  );
  return {
    pHome: pHybrid[0],
    pDraw: pHybrid[1],
    pAway: pHybrid[2],
    modelId: HYBRID_MODEL_ID,
    modelName: SINGULARITY_MODEL_NAME,
    modelVersion: model.version,
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
    sport: "football",
    modelMarketDivergence: divergence,
    uncertaintyGatePassed: maxDisagreement <= MAX_MODEL_MARKET_DISAGREEMENT,
    hybridAlpha: w,
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

export interface FallbackOptions {
  mode?: PredictionMode;
  hybridAlpha?: number;
}

/**
 * Orquestador de inferencia:
 *   1. Si `marketProbs` es válido (y `mode !== "motor_a_only"`):
 *      - `mode === "hybrid"` -> Motor C (`motor_c_hybrid_v2`, pool log-lineal de mercado + Motor A).
 *      - por defecto (`"market_only"`) -> Motor B (`market_devig`, flag `ok`).
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
  options?: FallbackOptions,
): Prediction {
  assertValidModel(model);
  const mode: PredictionMode = options?.mode ?? "market_only";

  if (mode !== "motor_a_only" && isValidMarketProbs(marketProbs)) {
    if (mode === "hybrid") {
      try {
        return hybridPredictionUnchecked(row, model, marketProbs, options?.hybridAlpha);
      } catch (error) {
        if (!(error instanceof InvalidFeaturesError)) {
          throw error;
        }
        return marketPrediction(marketProbs, model);
      }
    }
    return marketPrediction(marketProbs, model);
  }

  const marketSupplied =
    mode !== "motor_a_only" && marketProbs !== undefined && marketProbs !== null;
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
      modelName: HORIZON_MODEL_NAME,
      modelVersion: model.version,
      generatedAt: model.created_at,
      dataQualityFlag: "invalid_features",
      sport: "football",
    };
  }
}


// ---------------------------------------------------------------------------
// NFL (ciclo 3, A14)
// ---------------------------------------------------------------------------

/** Identificador del motor NFL exportado por `pipeline/export_model_nfl.py` (PitchLab Minkowski). */
export const NFL_MODEL_ID = "nfl_logistic_v1";
export const MINKOWSKI_MODEL_NAME = "PitchLab Minkowski v3.0";

/**
 * Valida el artefacto NFL. A diferencia del de fútbol no hay dummies de división:
 * el número de features es exactamente `n_features`.
 */
export function assertValidNFLModel(model: NFLModelArtifact): void {
  if (model === null || typeof model !== "object") {
    invalidModel("el artefacto NFL no es un objeto");
  }
  if (model.sport !== "nfl") {
    invalidModel(`sport esperado "nfl"; recibido ${String(model.sport)}`);
  }
  const features = model.features;
  if (!Array.isArray(features) || features.length === 0) {
    invalidModel("`features` NFL vacío o no es un array");
  }
  const n = features.length;
  if (model.n_features !== n) {
    invalidModel(`n_features (${String(model.n_features)}) !== features (${n})`);
  }
  if (!Array.isArray(model.coef) || model.coef.length !== 3) {
    invalidModel("`coef` NFL debe tener 3 filas (H/T/A)");
  }
  if (!Array.isArray(model.intercept) || model.intercept.length !== 3) {
    invalidModel("`intercept` NFL debe tener 3 valores");
  }
  if (!Array.isArray(model.classes) || model.classes.length !== 3) {
    invalidModel("`classes` NFL debe tener 3 valores");
  }
  for (const cls of [0, 1, 2]) {
    if (!model.classes.includes(cls)) {
      invalidModel(`classes NFL no contiene la clase ${cls}`);
    }
  }
  for (let k = 0; k < 3; k += 1) {
    const row = model.coef[k];
    if (row === undefined || !Array.isArray(row) || row.length !== n) {
      invalidModel(`coef[${k}] NFL debe tener ${n} columnas`);
    }
    assertFiniteArray(row, `coef_nfl[${k}]`);
  }
  assertFiniteArray(model.intercept, "intercept_nfl");
  if (!model.scaler || !Array.isArray(model.scaler.mean) || !Array.isArray(model.scaler.scale)) {
    invalidModel("`scaler` NFL incompleto");
  }
  if (model.scaler.mean.length !== n || model.scaler.scale.length !== n) {
    invalidModel(`scaler NFL debe tener ${n} valores`);
  }
  assertFiniteArray(model.scaler.mean, "scaler.mean_nfl");
  assertFiniteArray(model.scaler.scale, "scaler.scale_nfl");
  if (typeof model.version !== "string" || model.version.length === 0) {
    invalidModel("`version` NFL vacío");
  }
  if (typeof model.created_at !== "string" || model.created_at.length === 0) {
    invalidModel("`created_at` NFL vacío");
  }
}

/**
 * Diseño NFL estandarizado. `null` se imputa con la media de entrenamiento
 * (equivalente a 0 tras estandarizar), que es el mismo criterio que usaría
 * scikit-learn si se imputara con `SimpleImputer(strategy="mean")`.
 */
function buildNFLStandardizedDesign(row: NFLSnapshotRow, model: NFLModelArtifact): number[] {
  if (row === null || typeof row !== "object") {
    throw new InvalidFeaturesError("la fila NFL no es un objeto");
  }
  const base = row.features;
  if (!Array.isArray(base)) {
    throw new InvalidFeaturesError("`features` NFL no es un array");
  }
  if (base.length !== model.n_features) {
    throw new InvalidFeaturesError(
      `features NFL tiene ${base.length} valores; se esperaban ${model.n_features}`,
    );
  }
  const design = new Array<number>(model.n_features);
  for (let i = 0; i < model.n_features; i += 1) {
    const mean = model.scaler.mean[i];
    const scale = model.scaler.scale[i];
    if (mean === undefined || scale === undefined) {
      invalidModel(`escalador NFL incompleto en la columna ${i}`);
    }
    let value = base[i];
    if (value === undefined || value === null) {
      value = mean;
    }
    if (!Number.isFinite(value)) {
      throw new InvalidFeaturesError(`features NFL[${i}] no es finito (${String(value)})`);
    }
    const denominator = scale === 0 ? 1 : scale;
    const standardized = (value - mean) / denominator;
    if (!Number.isFinite(standardized)) {
      throw new InvalidFeaturesError(`la columna NFL ${i} no se puede estandarizar`);
    }
    design[i] = standardized;
  }
  return design;
}

/**
 * Predicción NFL. `classes` se mapea 0=H (local), 1=T (empate), 2=A (visitante);
 * se reordena si el artefacto serializó otro orden.
 */
export function predictNFL(row: NFLSnapshotRow, model: NFLModelArtifact): Prediction {
  assertValidNFLModel(model);
  const design = buildNFLStandardizedDesign(row, model);
  const logits = new Array<number>(3);
  for (let k = 0; k < 3; k += 1) {
    const coef = model.coef[k];
    const intercept = model.intercept[k];
    if (coef === undefined || intercept === undefined) {
      invalidModel(`coef/intercept NFL incompletos para la clase ${k}`);
    }
    logits[k] = dot(coef, design) + intercept;
  }
  const probs = softmax3(logits);
  const iH = model.classes.indexOf(0);
  const iT = model.classes.indexOf(1);
  const iA = model.classes.indexOf(2);
  if (iH < 0 || iT < 0 || iA < 0) {
    invalidModel("classes NFL no contiene 0/1/2");
  }
  return {
    pHome: probs[iH]!,
    pDraw: probs[iT]!,
    pAway: probs[iA]!,
    modelId: NFL_MODEL_ID,
    modelName: model.codename ?? MINKOWSKI_MODEL_NAME,
    modelVersion: model.version,
    generatedAt: model.created_at,
    dataQualityFlag: "ok",
    sport: "nfl",
  };
}

/** Despacha la petición al motor del deporte correspondiente. */
export function predictForSport(request: PredictionRequest): Prediction {
  if (request.sport === "nfl") {
    return predictNFL(request.row, request.model);
  }
  return predictWithFallback(
    request.row,
    request.model,
    request.marketProbs,
    request.baseRates ?? GLOBAL_HDA_RATES,
    { mode: request.mode, hybridAlpha: request.hybridAlpha },
  );
}
