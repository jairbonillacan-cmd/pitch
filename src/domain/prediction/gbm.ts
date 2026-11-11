/**
 * A28 (Ola 3 · Agente A7) — Inferencia determinista en TypeScript puro del modelo
 * `HistGradientBoostingClassifier` calibrado (`gbm_trees_v3_1.json`) y su ensamble con `Logit`.
 *
 * Reproduce bit a bit (`|p_python - p_ts| < 1e-6`, real `< 1e-14` en IEEE-754 float64) el recorrido
 * interno de `sklearn.ensemble._hist_gradient_boosting.predictor.TreePredictor`:
 *   1. Vector de diseño `[...features_base, ...div_onehot]` donde `null` / `NaN` se preservan
 *      como `NaN` para el enrutamiento nativo de faltantes (`missing_go_to_left`).
 *   2. En cada nodo interno:
 *      - Si el valor es `NaN`: ir a `missing_go_to_left ? left : right`.
 *      - Si el nodo es numérico (`is_categorical === 0`): ir a `val <= num_threshold ? left : right`.
 *      - Si el nodo es categórico (`is_categorical === 1`): verificar pertenencia de la categoría
 *        codificada `0..255` en `known_cat_bitset` (si existe; si es desconocida va por
 *        `missing_go_to_left`) y en `raw_left_cat_bitsets[bitset_idx]` (`uint32[8]`, 256 bits).
 *   3. Acumular `baseline_prediction[k] + sum_iter leaf_value[iter, k]` para `k ∈ {0, 1, 2}` (H, D, A)
 *      y aplicar `softmax3` estable.
 *   4. Calibración post-hoc de temperatura `T > 0`: `p_cal = softmax3(log(p_raw) / T)`.
 *   5. Mezcla causal con `Logit` (`w_logit * p_logit + w_gbm * p_gbm_cal` en espacio de probabilidad
 *      o `softmax3(w_logit * log(p_logit) + w_gbm * log(p_gbm_cal))` en espacio logit).
 *
 * Para garantizar latencia `< 0.1 ms` por partido, el artefacto JSON se compila perezosamente una
 * sola vez por referencia de objeto (`WeakMap`) en arreglos tipados planos contiguos (`Int32Array`,
 * `Uint8Array`, `Uint32Array`, `Float64Array`) sin asignaciones dinámicas durante el recorrido.
 */

import {
  assertValidModel,
  InvalidFeaturesError,
  PROBABILITY_SUM_TOLERANCE,
  predictMotorA,
  softmax3,
} from "./engine.js";
import type { ModelArtifact, Prediction, SnapshotRow } from "./types.js";

export const GBM_SCHEMA_VERSION = "gbm_trees_v3.1.0";
export const GBM_MODEL_ID = "motor_a_gbm_v3_1";
export const ENSEMBLE_LOGIT_GBM_MODEL_ID = "motor_a_ensemble_logit_gbm_v3_1";
export const TACHYON_GBM_MODEL_NAME = "PitchLab Tachyon GBM v3.1";
export const TACHYON_ENSEMBLE_MODEL_NAME = "PitchLab Tachyon Ensemble v3.1";

/**
 * Estado por defecto de activación del GBM en producción.
 * Regla no negociable A7: permanece en `false` a menos que el backtest walk-forward en
 * `walk_forward_dev` demuestre mejora cuyo IC 95% bootstrap NO cruce 0.
 */
export const DEFAULT_GBM_PRODUCTION_ACTIVATED = false;

const PROB_LOG_FLOOR = 1e-15;

export type GbmBlendSpace = "probability" | "logit";
export type GbmSignificanceLabel = "significativa" | "no significativa";

/** Error estructural cuando `gbm_trees_v3_1.json` incumple invariantes dimensionales o de árbol. */
export class GbmArtifactValidationError extends Error {
  readonly code = "invalid_gbm_artifact" as const;

  constructor(message: string) {
    super(`GbmArtifact inválido: ${message}`);
    this.name = "GbmArtifactValidationError";
  }
}

/** Arreglos planos por árbol exportados desde `TreePredictor.nodes` (`sklearn`). */
export interface GbmTreeNodeArrays {
  readonly iteration: number;
  readonly class_index: 0 | 1 | 2;
  readonly n_nodes: number;
  readonly is_leaf: readonly number[];
  readonly feature_idx: readonly number[];
  readonly num_threshold: readonly number[];
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly value: readonly number[];
  readonly missing_go_to_left: readonly number[];
  /** `0` = split numérico, `1` = split categórico mediante `bitset_idx`. Opcional si todo es `0`. */
  readonly is_categorical?: readonly number[];
  /** Índice de fila en `raw_left_cat_bitsets` cuando `is_categorical[node] === 1`. */
  readonly bitset_idx?: readonly number[];
  /** Matriz `[n_cat_splits][8]` de palabras `uint32` (máscara de 256 bits de categorías izquierdas). */
  readonly raw_left_cat_bitsets?: ReadonlyArray<readonly number[]>;
}

/** Metadatos de una columna categórica codificada para `bitset_idx`. */
export interface GbmCategoricalFeatureMeta {
  /** Índice de la columna en el vector de diseño de entrada `[...features_base, ...div_onehot]`. */
  readonly design_feature_idx: number;
  readonly feature_name: string;
  /** Mapa opcional de valor crudo (como string) a código entero `0..255` del `OrdinalEncoder`. */
  readonly category_to_code?: Readonly<Record<string, number>>;
  /** Bitset `uint32[8]` de categorías vistas en entrenamiento (`known_cat_bitsets`). */
  readonly known_cat_bitset?: readonly number[];
}

/** Parámetros exactos del modelo `Logit` compañero entrenado en la misma ventana causal pre-validación. */
export interface GbmLogitCompanion {
  readonly regularization_C: number;
  readonly n_features_base: number;
  /** Índices dentro de `features_base` del GBM que alimentan al `Logit` (por defecto `0..n_features_base-1`). */
  readonly base_feature_indices?: readonly number[];
  readonly imputer_statistics: readonly number[];
  readonly scaler_mean: readonly number[];
  readonly scaler_scale: readonly number[];
  readonly coef: ReadonlyArray<readonly number[]>;
  readonly intercept: readonly number[];
}

/** Calibración de temperatura `T` y pesos causales de mezcla con `Logit`. */
export interface GbmCalibrationConfig {
  readonly temperature: number;
  readonly blend_space: GbmBlendSpace;
  readonly w_logit: number;
  readonly w_gbm: number;
  readonly calibrated_on_window?: {
    readonly start_ts_utc: string;
    readonly end_ts_utc_exclusive: string;
    readonly n_matches: number;
  };
}

/** Artefacto serializado en `src/data/prediction/gbm_trees_v3_1.json`. */
export interface GbmArtifact {
  readonly schema_version: string;
  readonly type: "hist_gradient_boosting_multiclass";
  readonly codename: string;
  readonly version: string;
  readonly created_at: string;
  readonly seed: number;
  readonly production_activated: boolean;
  readonly activation_verdict?: {
    readonly activated: boolean;
    readonly significance: GbmSignificanceLabel;
    readonly criterion: string;
    readonly reason: string;
  };
  readonly n_classes: 3;
  readonly classes: readonly [0, 1, 2];
  readonly n_iter: number;
  readonly n_trees: number;
  readonly features: readonly string[];
  readonly n_features_base: number;
  readonly extra_base_features?: readonly string[];
  readonly div_levels: readonly string[];
  /** Mapeo opcional `tree_feature_idx -> design_col_idx` cuando `sklearn` reordena columnas categóricas al frente. */
  readonly tree_col_to_design_col?: readonly number[];
  readonly categorical_features?: readonly GbmCategoricalFeatureMeta[];
  readonly baseline_prediction: readonly [number, number, number];
  readonly calibration: GbmCalibrationConfig;
  readonly logit_companion?: GbmLogitCompanion;
  readonly training_window?: {
    readonly start_ts_utc: string;
    readonly end_ts_utc_exclusive: string;
    readonly holdout_cut_ts_utc: string;
    readonly holdout_touched: boolean;
    readonly n_matches_train: number;
  };
  readonly trees: readonly GbmTreeNodeArrays[];
}

/** Archivo compacto de paridad 100% fuera de muestra sobre el set de validación (`gbm_validation_parity.json`). */
export interface GbmValidationParityFile {
  readonly schema_version: string;
  readonly generated_at_utc: string;
  readonly holdout_cut_ts_utc: string;
  readonly holdout_touched: false;
  readonly validation_window: {
    readonly start_ts_utc: string;
    readonly end_ts_utc_exclusive: string;
    readonly n_matches: number;
    readonly coverage_pct: number;
  };
  readonly n: number;
  readonly n_features_base: number;
  readonly div_levels: readonly string[];
  readonly match_ids: readonly string[];
  readonly div_indices: readonly number[];
  readonly outcomes_y: readonly number[];
  readonly features_base: ReadonlyArray<readonly (number | null)[]>;
  readonly probs_gbm_raw_python: ReadonlyArray<readonly [number, number, number]>;
  readonly probs_gbm_calibrated_python: ReadonlyArray<readonly [number, number, number]>;
  readonly probs_logit_python: ReadonlyArray<readonly [number, number, number]>;
  readonly probs_ensemble_python: ReadonlyArray<readonly [number, number, number]>;
}

/** Fila de entrada aceptada por `gbm.ts` (compatible 100% con `SnapshotRow`). */
export interface GbmInputRow extends SnapshotRow {
  /** Features base adicionales opcionales cuando se pasa un `SnapshotRow` de 113 columnas a un GBM extendido. */
  readonly extra_features?: readonly (number | null)[];
  /** Categorías crudas opcionales por nombre de columna cuando el modelo usa variables categóricas string. */
  readonly raw_categories?: Readonly<Record<string, string | number | null>>;
}

export interface EnsemblePredictOptions {
  /** Modelo `Logit` explícito (`model_motor_a.json`) si no se pasa `logitProbs` ni se usa `logit_companion`. */
  readonly logitModel?: ModelArtifact;
  /** Probabilidades `[pHome, pDraw, pAway]` ya calculadas por `Logit`. */
  readonly logitProbs?: readonly [number, number, number];
  /**
   * Si `respectProductionGate` es `true`, devuelve `Logit` puro cuando
   * `artifact.production_activated === false`. Por defecto `false` en llamadas directas a
   * `predictLogitGbmEnsemble` y `true` en `predictMotorAWithOptionalGbm`.
   */
  readonly respectProductionGate?: boolean;
}

interface CompiledCatFeature {
  readonly designIdx: number;
  readonly featureName: string;
  readonly categoryToCode: Readonly<Record<string, number>> | null;
  readonly knownMask: Uint32Array | null;
}

interface CompiledLogitCompanion {
  readonly nLogitTotal: number;
  readonly nLogitBase: number;
  readonly isContiguousIdentity: boolean;
  readonly baseFeatureIndices: Int32Array;
  readonly imputerStats: Float64Array;
  readonly scalerMean: Float64Array;
  readonly scalerInvScale: Float64Array;
  readonly coef0: Float64Array;
  readonly coef1: Float64Array;
  readonly coef2: Float64Array;
  readonly intercept0: number;
  readonly intercept1: number;
  readonly intercept2: number;
}

interface CompiledGbmModel {
  readonly nFeaturesBase: number;
  readonly nExtraBase: number;
  readonly nDivLevels: number;
  readonly nDesignTotal: number;
  readonly nIter: number;
  readonly nTrees: number;
  readonly baseline0: number;
  readonly baseline1: number;
  readonly baseline2: number;
  readonly temperature: number;
  readonly invTemperature: number;
  readonly blendSpace: GbmBlendSpace;
  readonly wLogit: number;
  readonly wGbm: number;
  readonly treeOffsets: Int32Array;
  readonly isLeaf: Uint8Array;
  readonly isCategorical: Uint8Array;
  readonly missingGoToLeft: Uint8Array;
  /** Ya traducido a índice en `designBuf` (`tree_col_to_design_col[fIdx]`). */
  readonly designFeatureIdx: Int32Array;
  /** Índice global pre-desplazado del hijo izquierdo (`treeOffset + localLeft`). */
  readonly leftGlobal: Int32Array;
  /** Índice global pre-desplazado del hijo derecho (`treeOffset + localRight`). */
  readonly rightGlobal: Int32Array;
  /** Desplazamiento `bitset_idx * 8` en `rawLeftCatBitsets`, o `-1` si numérico. */
  readonly bitsetWordOffset: Int32Array;
  /** Desplazamiento `catMetaIdx * 8` en `knownCatBitsets`, o `-1` si no aplica. */
  readonly knownWordOffset: Int32Array;
  readonly numThreshold: Float64Array;
  readonly leafValue: Float64Array;
  readonly rawLeftCatBitsets: Uint32Array;
  readonly knownCatBitsets: Uint32Array;
  readonly catFeaturesByDesignIdx: ReadonlyMap<number, CompiledCatFeature>;
  readonly hasCategoricalFeatures: boolean;
  readonly logitCompanion: CompiledLogitCompanion | null;
  readonly scratchDesign: Float64Array;
  /** Buffer reutilizable de 12 floats: `[0..2]` logits árbol, `[3..5]` GBM cal, `[6..8]` Logit, `[9..11]` ensamble. */
  readonly scratchOut: Float64Array;
}

const COMPILED_CACHE = new WeakMap<GbmArtifact, CompiledGbmModel>();

function assertFiniteNumber(val: unknown, label: string): number {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new GbmArtifactValidationError(`${label} debe ser un número finito`);
  }
  return val;
}

function assertNonNegativeInt(val: unknown, label: string): number {
  if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
    throw new GbmArtifactValidationError(`${label} debe ser un entero >= 0`);
  }
  return val;
}

function assertSimplex3(probs: readonly [number, number, number], label: string): void {
  const p0 = probs[0];
  const p1 = probs[1];
  const p2 = probs[2];
  if (
    !Number.isFinite(p0) ||
    !Number.isFinite(p1) ||
    !Number.isFinite(p2) ||
    p0 < 0 ||
    p0 > 1 ||
    p1 < 0 ||
    p1 > 1 ||
    p2 < 0 ||
    p2 > 1
  ) {
    throw new Error(`${label}: probabilidades fuera de [0, 1]`);
  }
  const sum = p0 + p1 + p2;
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) {
    throw new Error(`${label}: la suma ${sum} excede 1 ± ${PROBABILITY_SUM_TOLERANCE}`);
  }
}

/** Verifica si el entero de categoría `catCode` (`0..255`) tiene su bit encendido en `words[offset .. offset+7]`. */
function isBitSet256(words: Uint32Array, wordOffset: number, catCode: number): boolean {
  if (catCode < 0 || catCode >= 256 || !Number.isInteger(catCode)) {
    return false;
  }
  const wordIdx = wordOffset + (catCode >>> 5);
  const bitIdx = catCode & 31;
  const word = words[wordIdx] ?? 0;
  return ((word >>> bitIdx) & 1) === 1;
}

function compileLogitCompanion(
  comp: GbmLogitCompanion,
  nFeaturesBaseGbm: number,
  nDivLevels: number,
): CompiledLogitCompanion {
  const nLogitBase = assertNonNegativeInt(comp.n_features_base, "logit_companion.n_features_base");
  const nLogitTotal = nLogitBase + nDivLevels;
  const baseIndices = new Int32Array(nLogitBase);
  if (comp.base_feature_indices !== undefined) {
    if (!Array.isArray(comp.base_feature_indices) || comp.base_feature_indices.length !== nLogitBase) {
      throw new GbmArtifactValidationError(
        "logit_companion.base_feature_indices debe coincidir con logit_companion.n_features_base",
      );
    }
    for (let i = 0; i < nLogitBase; i += 1) {
      const idx = assertNonNegativeInt(
        comp.base_feature_indices[i],
        `logit_companion.base_feature_indices[${i}]`,
      );
      if (idx >= nFeaturesBaseGbm) {
        throw new GbmArtifactValidationError(
          `logit_companion.base_feature_indices[${i}] (${idx}) >= n_features_base (${nFeaturesBaseGbm})`,
        );
      }
      baseIndices[i] = idx;
    }
  } else {
    if (nLogitBase > nFeaturesBaseGbm) {
      throw new GbmArtifactValidationError(
        `logit_companion.n_features_base (${nLogitBase}) > n_features_base (${nFeaturesBaseGbm})`,
      );
    }
    for (let i = 0; i < nLogitBase; i += 1) {
      baseIndices[i] = i;
    }
  }

  if (
    !Array.isArray(comp.imputer_statistics) ||
    comp.imputer_statistics.length !== nLogitTotal ||
    !Array.isArray(comp.scaler_mean) ||
    comp.scaler_mean.length !== nLogitTotal ||
    !Array.isArray(comp.scaler_scale) ||
    comp.scaler_scale.length !== nLogitTotal
  ) {
    throw new GbmArtifactValidationError(
      `logit_companion imputer/scaler deben tener longitud ${nLogitTotal}`,
    );
  }
  if (
    !Array.isArray(comp.coef) ||
    comp.coef.length !== 3 ||
    !Array.isArray(comp.intercept) ||
    comp.intercept.length !== 3
  ) {
    throw new GbmArtifactValidationError("logit_companion coef/intercept deben tener 3 clases");
  }

  const imputerStats = new Float64Array(nLogitTotal);
  const scalerMean = new Float64Array(nLogitTotal);
  const scalerInvScale = new Float64Array(nLogitTotal);
  for (let i = 0; i < nLogitTotal; i += 1) {
    imputerStats[i] = assertFiniteNumber(
      comp.imputer_statistics[i],
      `logit_companion.imputer_statistics[${i}]`,
    );
    scalerMean[i] = assertFiniteNumber(comp.scaler_mean[i], `logit_companion.scaler_mean[${i}]`);
    const sc = assertFiniteNumber(comp.scaler_scale[i], `logit_companion.scaler_scale[${i}]`);
    scalerInvScale[i] = sc === 0 ? 1 : 1 / sc;
  }

  const coefs = [
    new Float64Array(nLogitTotal),
    new Float64Array(nLogitTotal),
    new Float64Array(nLogitTotal),
  ] as const;
  for (let k = 0; k < 3; k += 1) {
    const row = comp.coef[k];
    if (!Array.isArray(row) || row.length !== nLogitTotal) {
      throw new GbmArtifactValidationError(
        `logit_companion.coef[${k}] debe tener ${nLogitTotal} columnas`,
      );
    }
    const target = coefs[k]!;
    for (let j = 0; j < nLogitTotal; j += 1) {
      target[j] = assertFiniteNumber(row[j], `logit_companion.coef[${k}][${j}]`);
    }
  }

  let isContiguousIdentity = nLogitBase === nFeaturesBaseGbm;
  if (isContiguousIdentity) {
    for (let i = 0; i < nLogitBase; i += 1) {
      if (baseIndices[i] !== i) {
        isContiguousIdentity = false;
        break;
      }
    }
  }

  return {
    nLogitTotal,
    nLogitBase,
    isContiguousIdentity,
    baseFeatureIndices: baseIndices,
    imputerStats,
    scalerMean,
    scalerInvScale,
    coef0: coefs[0],
    coef1: coefs[1],
    coef2: coefs[2],
    intercept0: assertFiniteNumber(comp.intercept[0], "logit_companion.intercept[0]"),
    intercept1: assertFiniteNumber(comp.intercept[1], "logit_companion.intercept[1]"),
    intercept2: assertFiniteNumber(comp.intercept[2], "logit_companion.intercept[2]"),
  };
}

/**
 * Valida todas las invariantes estructurales y numéricas de `GbmArtifact` y devuelve su
 * representación compilada en arreglos tipados planos.
 */
function getOrCompileGbm(artifact: GbmArtifact): CompiledGbmModel {
  if (artifact === null || typeof artifact !== "object") {
    throw new GbmArtifactValidationError("el artefacto no es un objeto");
  }
  const cached = COMPILED_CACHE.get(artifact);
  if (cached !== undefined) {
    return cached;
  }

  if (artifact.type !== "hist_gradient_boosting_multiclass") {
    throw new GbmArtifactValidationError(
      `type inesperado "${String(artifact.type)}" (se esperaba "hist_gradient_boosting_multiclass")`,
    );
  }
  if (typeof artifact.version !== "string" || artifact.version.length === 0) {
    throw new GbmArtifactValidationError("version debe ser un string no vacío");
  }
  if (typeof artifact.created_at !== "string" || artifact.created_at.length === 0) {
    throw new GbmArtifactValidationError("created_at debe ser un string no vacío");
  }
  if (typeof artifact.production_activated !== "boolean") {
    throw new GbmArtifactValidationError("production_activated debe ser booleano");
  }
  if (artifact.n_classes !== 3 || !Array.isArray(artifact.classes) || artifact.classes.length !== 3) {
    throw new GbmArtifactValidationError("n_classes/classes deben representar 3 clases [0, 1, 2]");
  }

  const nFeaturesBase = assertNonNegativeInt(artifact.n_features_base, "n_features_base");
  if (!Array.isArray(artifact.div_levels)) {
    throw new GbmArtifactValidationError("div_levels debe ser un array");
  }
  const nDivLevels = artifact.div_levels.length;
  const nDesignTotal = nFeaturesBase + nDivLevels;
  if (!Array.isArray(artifact.features) || artifact.features.length !== nDesignTotal || nDesignTotal === 0) {
    throw new GbmArtifactValidationError(
      `features (${Array.isArray(artifact.features) ? artifact.features.length : -1}) debe coincidir con n_features_base + div_levels (${nDesignTotal})`,
    );
  }
  const nExtraBase = Array.isArray(artifact.extra_base_features)
    ? artifact.extra_base_features.length
    : 0;

  const nIter = assertNonNegativeInt(artifact.n_iter, "n_iter");
  const nTrees = assertNonNegativeInt(artifact.n_trees, "n_trees");
  if (nIter === 0 || nTrees !== nIter * 3) {
    throw new GbmArtifactValidationError(
      `n_trees (${nTrees}) debe ser igual a n_iter * 3 (${nIter * 3}) y > 0`,
    );
  }
  if (!Array.isArray(artifact.trees) || artifact.trees.length !== nTrees) {
    throw new GbmArtifactValidationError(`trees debe contener exactamente ${nTrees} árboles`);
  }

  if (!Array.isArray(artifact.baseline_prediction) || artifact.baseline_prediction.length !== 3) {
    throw new GbmArtifactValidationError("baseline_prediction debe tener 3 valores finitos");
  }
  const baseline0 = assertFiniteNumber(artifact.baseline_prediction[0], "baseline_prediction[0]");
  const baseline1 = assertFiniteNumber(artifact.baseline_prediction[1], "baseline_prediction[1]");
  const baseline2 = assertFiniteNumber(artifact.baseline_prediction[2], "baseline_prediction[2]");

  const cal = artifact.calibration;
  if (cal === null || typeof cal !== "object") {
    throw new GbmArtifactValidationError("calibration ausente");
  }
  const temperature = assertFiniteNumber(cal.temperature, "calibration.temperature");
  if (!(temperature > 0)) {
    throw new GbmArtifactValidationError("calibration.temperature debe ser > 0");
  }
  if (cal.blend_space !== "probability" && cal.blend_space !== "logit") {
    throw new GbmArtifactValidationError(
      `calibration.blend_space inválido: "${String(cal.blend_space)}"`,
    );
  }
  const wLogit = assertFiniteNumber(cal.w_logit, "calibration.w_logit");
  const wGbm = assertFiniteNumber(cal.w_gbm, "calibration.w_gbm");
  if (wLogit < 0 || wGbm < 0 || Math.abs(wLogit + wGbm - 1) > 1e-6) {
    throw new GbmArtifactValidationError(
      `pesos calibration (w_logit=${wLogit}, w_gbm=${wGbm}) deben ser >= 0 y sumar 1`,
    );
  }

  const colMap = new Int32Array(nDesignTotal);
  if (artifact.tree_col_to_design_col !== undefined) {
    if (
      !Array.isArray(artifact.tree_col_to_design_col) ||
      artifact.tree_col_to_design_col.length !== nDesignTotal
    ) {
      throw new GbmArtifactValidationError(
        `tree_col_to_design_col debe tener ${nDesignTotal} elementos`,
      );
    }
    for (let i = 0; i < nDesignTotal; i += 1) {
      const mapped = assertNonNegativeInt(
        artifact.tree_col_to_design_col[i],
        `tree_col_to_design_col[${i}]`,
      );
      if (mapped >= nDesignTotal) {
        throw new GbmArtifactValidationError(
          `tree_col_to_design_col[${i}] (${mapped}) fuera de [0, ${nDesignTotal})`,
        );
      }
      colMap[i] = mapped;
    }
  } else {
    for (let i = 0; i < nDesignTotal; i += 1) {
      colMap[i] = i;
    }
  }

  // Metadatos categóricos opcionales (`known_cat_bitsets` + mapeo de categorías)
  const catMetaList = artifact.categorical_features ?? [];
  const catMap = new Map<number, CompiledCatFeature>();
  const knownOffsetByDesignCol = new Int32Array(nDesignTotal);
  knownOffsetByDesignCol.fill(-1);
  const knownWordsList: number[] = [];

  for (let c = 0; c < catMetaList.length; c += 1) {
    const meta = catMetaList[c];
    if (!meta || typeof meta !== "object") {
      throw new GbmArtifactValidationError(`categorical_features[${c}] inválido`);
    }
    const dIdx = assertNonNegativeInt(
      meta.design_feature_idx,
      `categorical_features[${c}].design_feature_idx`,
    );
    if (dIdx >= nDesignTotal) {
      throw new GbmArtifactValidationError(
        `categorical_features[${c}].design_feature_idx (${dIdx}) >= ${nDesignTotal}`,
      );
    }
    let knownMask: Uint32Array | null = null;
    if (meta.known_cat_bitset !== undefined) {
      if (!Array.isArray(meta.known_cat_bitset) || meta.known_cat_bitset.length !== 8) {
        throw new GbmArtifactValidationError(
          `categorical_features[${c}].known_cat_bitset debe tener 8 uint32`,
        );
      }
      knownOffsetByDesignCol[dIdx] = knownWordsList.length;
      knownMask = new Uint32Array(8);
      for (let w = 0; w < 8; w += 1) {
        const word = assertNonNegativeInt(
          meta.known_cat_bitset[w],
          `categorical_features[${c}].known_cat_bitset[${w}]`,
        );
        knownMask[w] = word >>> 0;
        knownWordsList.push(word >>> 0);
      }
    }
    catMap.set(dIdx, {
      designIdx: dIdx,
      featureName: meta.feature_name,
      categoryToCode: meta.category_to_code ?? null,
      knownMask,
    });
  }

  let totalNodes = 0;
  let totalBitsets = 0;
  for (let t = 0; t < nTrees; t += 1) {
    const tree = artifact.trees[t];
    if (!tree || typeof tree !== "object") {
      throw new GbmArtifactValidationError(`trees[${t}] no es un objeto`);
    }
    const expectedIter = Math.floor(t / 3);
    const expectedCls = t % 3;
    if (tree.iteration !== expectedIter || tree.class_index !== expectedCls) {
      throw new GbmArtifactValidationError(
        `trees[${t}] desordenado: recibido (iter=${tree.iteration}, cls=${tree.class_index}), esperado (${expectedIter}, ${expectedCls})`,
      );
    }
    const nn = assertNonNegativeInt(tree.n_nodes, `trees[${t}].n_nodes`);
    if (nn === 0) {
      throw new GbmArtifactValidationError(`trees[${t}].n_nodes debe ser >= 1`);
    }
    if (
      !Array.isArray(tree.is_leaf) ||
      tree.is_leaf.length !== nn ||
      !Array.isArray(tree.feature_idx) ||
      tree.feature_idx.length !== nn ||
      !Array.isArray(tree.num_threshold) ||
      tree.num_threshold.length !== nn ||
      !Array.isArray(tree.left) ||
      tree.left.length !== nn ||
      !Array.isArray(tree.right) ||
      tree.right.length !== nn ||
      !Array.isArray(tree.value) ||
      tree.value.length !== nn ||
      !Array.isArray(tree.missing_go_to_left) ||
      tree.missing_go_to_left.length !== nn
    ) {
      throw new GbmArtifactValidationError(
        `trees[${t}] tiene arreglos con longitud distinta de n_nodes (${nn})`,
      );
    }
    if (tree.raw_left_cat_bitsets !== undefined) {
      if (!Array.isArray(tree.raw_left_cat_bitsets)) {
        throw new GbmArtifactValidationError(`trees[${t}].raw_left_cat_bitsets debe ser un array`);
      }
      totalBitsets += tree.raw_left_cat_bitsets.length;
    }
    totalNodes += nn;
  }

  const treeOffsets = new Int32Array(nTrees + 1);
  const isLeaf = new Uint8Array(totalNodes);
  const isCategorical = new Uint8Array(totalNodes);
  const missingGoToLeft = new Uint8Array(totalNodes);
  const designFeatureIdx = new Int32Array(totalNodes);
  const leftGlobal = new Int32Array(totalNodes);
  const rightGlobal = new Int32Array(totalNodes);
  const bitsetWordOffset = new Int32Array(totalNodes);
  const knownWordOffset = new Int32Array(totalNodes);
  const numThreshold = new Float64Array(totalNodes);
  const leafValue = new Float64Array(totalNodes);
  const rawLeftCatBitsets = new Uint32Array(totalBitsets * 8);

  bitsetWordOffset.fill(-1);
  knownWordOffset.fill(-1);

  let cursor = 0;
  let bitsetCursor = 0;
  let anyCatSplit = catMap.size > 0;

  for (let t = 0; t < nTrees; t += 1) {
    const tree = artifact.trees[t]!;
    const nn = tree.n_nodes;
    treeOffsets[t] = cursor;

    const treeBitsets = tree.raw_left_cat_bitsets;
    const treeBitsetBase = bitsetCursor;
    const nTreeBitsets = treeBitsets ? treeBitsets.length : 0;
    if (treeBitsets) {
      for (let b = 0; b < nTreeBitsets; b += 1) {
        const rowWords = treeBitsets[b];
        if (!Array.isArray(rowWords) || rowWords.length !== 8) {
          throw new GbmArtifactValidationError(
            `trees[${t}].raw_left_cat_bitsets[${b}] debe tener 8 uint32`,
          );
        }
        const baseW = (treeBitsetBase + b) * 8;
        for (let w = 0; w < 8; w += 1) {
          const valW = assertNonNegativeInt(
            rowWords[w],
            `trees[${t}].raw_left_cat_bitsets[${b}][${w}]`,
          );
          rawLeftCatBitsets[baseW + w] = valW >>> 0;
        }
      }
      bitsetCursor += nTreeBitsets;
    }

    const catArr = tree.is_categorical;
    const bitIdxArr = tree.bitset_idx;
    if (catArr !== undefined && (!Array.isArray(catArr) || catArr.length !== nn)) {
      throw new GbmArtifactValidationError(`trees[${t}].is_categorical debe tener longitud ${nn}`);
    }
    if (bitIdxArr !== undefined && (!Array.isArray(bitIdxArr) || bitIdxArr.length !== nn)) {
      throw new GbmArtifactValidationError(`trees[${t}].bitset_idx debe tener longitud ${nn}`);
    }

    for (let i = 0; i < nn; i += 1) {
      const gIdx = cursor + i;
      const leafFlag = tree.is_leaf[i];
      if (leafFlag !== 0 && leafFlag !== 1) {
        throw new GbmArtifactValidationError(`trees[${t}].is_leaf[${i}] debe ser 0 o 1`);
      }
      isLeaf[gIdx] = leafFlag;
      leafValue[gIdx] = assertFiniteNumber(tree.value[i], `trees[${t}].value[${i}]`);

      if (leafFlag === 1) {
        designFeatureIdx[gIdx] = -1;
        leftGlobal[gIdx] = gIdx;
        rightGlobal[gIdx] = gIdx;
        numThreshold[gIdx] = 0;
        missingGoToLeft[gIdx] = 0;
        isCategorical[gIdx] = 0;
      } else {
        const rawFIdx = assertNonNegativeInt(tree.feature_idx[i], `trees[${t}].feature_idx[${i}]`);
        if (rawFIdx >= nDesignTotal) {
          throw new GbmArtifactValidationError(
            `trees[${t}].feature_idx[${i}] (${rawFIdx}) >= ${nDesignTotal}`,
          );
        }
        const mappedDesignIdx = colMap[rawFIdx]!;
        designFeatureIdx[gIdx] = mappedDesignIdx;

        const lChild = assertNonNegativeInt(tree.left[i], `trees[${t}].left[${i}]`);
        const rChild = assertNonNegativeInt(tree.right[i], `trees[${t}].right[${i}]`);
        if (lChild <= i || lChild >= nn || rChild <= i || rChild >= nn) {
          throw new GbmArtifactValidationError(
            `trees[${t}] nodo ${i} tiene hijos inválidos/cíclicos (left=${lChild}, right=${rChild}, n_nodes=${nn})`,
          );
        }
        leftGlobal[gIdx] = cursor + lChild;
        rightGlobal[gIdx] = cursor + rChild;

        const mLeft = tree.missing_go_to_left[i];
        if (mLeft !== 0 && mLeft !== 1) {
          throw new GbmArtifactValidationError(
            `trees[${t}].missing_go_to_left[${i}] debe ser 0 o 1`,
          );
        }
        missingGoToLeft[gIdx] = mLeft;

        const catFlag = catArr ? catArr[i]! : 0;
        if (catFlag !== 0 && catFlag !== 1) {
          throw new GbmArtifactValidationError(`trees[${t}].is_categorical[${i}] debe ser 0 o 1`);
        }
        isCategorical[gIdx] = catFlag;

        if (catFlag === 1) {
          anyCatSplit = true;
          const bIdx = bitIdxArr
            ? assertNonNegativeInt(bitIdxArr[i], `trees[${t}].bitset_idx[${i}]`)
            : -1;
          if (bIdx < 0 || bIdx >= nTreeBitsets) {
            throw new GbmArtifactValidationError(
              `trees[${t}] nodo categórico ${i} tiene bitset_idx=${bIdx} fuera de [0, ${nTreeBitsets})`,
            );
          }
          bitsetWordOffset[gIdx] = (treeBitsetBase + bIdx) * 8;
          knownWordOffset[gIdx] = knownOffsetByDesignCol[mappedDesignIdx]!;
          numThreshold[gIdx] = 0;
        } else {
          numThreshold[gIdx] = assertFiniteNumber(
            tree.num_threshold[i],
            `trees[${t}].num_threshold[${i}]`,
          );
        }
      }
    }
    cursor += nn;
  }
  treeOffsets[nTrees] = cursor;

  const compiledCompanion =
    artifact.logit_companion !== undefined
      ? compileLogitCompanion(artifact.logit_companion, nFeaturesBase, nDivLevels)
      : null;

  const compiled: CompiledGbmModel = {
    nFeaturesBase,
    nExtraBase,
    nDivLevels,
    nDesignTotal,
    nIter,
    nTrees,
    baseline0,
    baseline1,
    baseline2,
    temperature,
    invTemperature: 1 / temperature,
    blendSpace: cal.blend_space,
    wLogit,
    wGbm,
    treeOffsets,
    isLeaf,
    isCategorical,
    missingGoToLeft,
    designFeatureIdx,
    leftGlobal,
    rightGlobal,
    bitsetWordOffset,
    knownWordOffset,
    numThreshold,
    leafValue,
    rawLeftCatBitsets,
    knownCatBitsets: new Uint32Array(knownWordsList),
    catFeaturesByDesignIdx: catMap,
    hasCategoricalFeatures: anyCatSplit,
    logitCompanion: compiledCompanion,
    scratchDesign: new Float64Array(nDesignTotal),
    scratchOut: new Float64Array(12),
  };

  COMPILED_CACHE.set(artifact, compiled);
  return compiled;
}

/** Valida públicamente que un `GbmArtifact` cumpla todas las invariantes del contrato A7. */
export function validateGbmArtifact(artifact: GbmArtifact): void {
  getOrCompileGbm(artifact);
}

/** Indica si el GBM está activado para inferencia en producción según el artefacto o constante global. */
export function isGbmProductionActivated(artifact?: GbmArtifact | null): boolean {
  if (!artifact) {
    return DEFAULT_GBM_PRODUCTION_ACTIVATED;
  }
  return Boolean(artifact.production_activated);
}

function fillDesignBufferFromRow(row: GbmInputRow, compiled: CompiledGbmModel): Float64Array {
  if (row === null || typeof row !== "object") {
    throw new InvalidFeaturesError("la fila no es un objeto");
  }
  const base = row.features;
  if (!Array.isArray(base)) {
    throw new InvalidFeaturesError("`features` no es un array");
  }
  const dummies = row.div_onehot;
  if (!Array.isArray(dummies)) {
    throw new InvalidFeaturesError("`div_onehot` no es un array");
  }
  const nDiv = compiled.nDivLevels;
  if (dummies.length !== nDiv) {
    throw new InvalidFeaturesError(
      `div_onehot tiene ${dummies.length} valores; se esperaban ${nDiv}`,
    );
  }

  const buf = compiled.scratchDesign;
  const nBase = compiled.nFeaturesBase;

  // Camino rápido sin ramas adicionales para el formato estándar numérico de 136 columnas
  if (compiled.nExtraBase === 0 && !compiled.hasCategoricalFeatures) {
    if (base.length !== nBase) {
      throw new InvalidFeaturesError(
        `features tiene ${base.length} valores; se esperaban ${nBase}`,
      );
    }
    for (let i = 0; i < nBase; i += 1) {
      const raw = base[i];
      if (raw === null) {
        buf[i] = Number.NaN;
      } else if (typeof raw === "number") {
        if (raw !== raw) {
          buf[i] = Number.NaN;
        } else if (raw === Number.POSITIVE_INFINITY || raw === Number.NEGATIVE_INFINITY) {
          throw new InvalidFeaturesError(`features[${i}] no es finito (${String(raw)})`);
        } else {
          buf[i] = raw;
        }
      } else {
        throw new InvalidFeaturesError(`features[${i}] está ausente`);
      }
    }
    for (let j = 0; j < nDiv; j += 1) {
      const dVal = dummies[j];
      if (
        typeof dVal !== "number" ||
        dVal !== dVal ||
        dVal === Number.POSITIVE_INFINITY ||
        dVal === Number.NEGATIVE_INFINITY
      ) {
        throw new InvalidFeaturesError(`div_onehot[${j}] no es un número finito`);
      }
      buf[nBase + j] = dVal;
    }
    return buf;
  }

  const expectedCoreLen = nBase - compiled.nExtraBase;
  const hasFullBase = base.length === nBase;
  const hasCorePlusExtra = compiled.nExtraBase > 0 && base.length === expectedCoreLen;

  if (!hasFullBase && !hasCorePlusExtra) {
    throw new InvalidFeaturesError(
      `features tiene ${base.length} valores; se esperaban ${nBase}`,
    );
  }

  const copyLen = hasFullBase ? nBase : expectedCoreLen;
  for (let i = 0; i < copyLen; i += 1) {
    const raw = base[i];
    if (raw === undefined) {
      throw new InvalidFeaturesError(`features[${i}] está ausente`);
    }
    if (raw === null || Number.isNaN(raw)) {
      buf[i] = Number.NaN;
    } else if (!Number.isFinite(raw)) {
      throw new InvalidFeaturesError(`features[${i}] no es finito (${String(raw)})`);
    } else {
      buf[i] = raw;
    }
  }

  if (!hasFullBase) {
    const extra = row.extra_features;
    if (extra !== undefined && extra.length !== compiled.nExtraBase) {
      throw new InvalidFeaturesError(
        `extra_features tiene ${extra.length} valores; se esperaban ${compiled.nExtraBase}`,
      );
    }
    for (let e = 0; e < compiled.nExtraBase; e += 1) {
      const targetIdx = expectedCoreLen + e;
      const rawE = extra ? extra[e] : null;
      if (rawE === undefined || rawE === null || Number.isNaN(rawE)) {
        buf[targetIdx] = Number.NaN;
      } else if (!Number.isFinite(rawE)) {
        throw new InvalidFeaturesError(`extra_features[${e}] no es finito (${String(rawE)})`);
      } else {
        buf[targetIdx] = rawE;
      }
    }
  }

  for (let j = 0; j < nDiv; j += 1) {
    const dVal = dummies[j];
    if (dVal === undefined || dVal === null || !Number.isFinite(dVal)) {
      throw new InvalidFeaturesError(`div_onehot[${j}] no es un número finito`);
    }
    buf[nBase + j] = dVal;
  }

  // Codificación opcional de categorías crudas (`raw_categories`) cuando aplica
  if (compiled.hasCategoricalFeatures && row.raw_categories) {
    for (const [dIdx, catMeta] of compiled.catFeaturesByDesignIdx.entries()) {
      if (Object.prototype.hasOwnProperty.call(row.raw_categories, catMeta.featureName)) {
        const rawCat = row.raw_categories[catMeta.featureName];
        if (rawCat === null || rawCat === undefined || (typeof rawCat === "number" && Number.isNaN(rawCat))) {
          buf[dIdx] = Number.NaN;
        } else if (catMeta.categoryToCode !== null) {
          const mapped = catMeta.categoryToCode[String(rawCat)];
          // Categoría nunca vista -> código fuera de rango `-1` para que vaya por `missing_go_to_left`
          buf[dIdx] = mapped !== undefined ? mapped : -1;
        } else if (typeof rawCat === "number" && Number.isFinite(rawCat)) {
          buf[dIdx] = rawCat;
        } else {
          buf[dIdx] = -1;
        }
      }
    }
  }

  return buf;
}

function fillDesignBufferCompact(
  baseFeatures: readonly (number | null)[],
  divIndex: number,
  compiled: CompiledGbmModel,
): Float64Array {
  const nBase = compiled.nFeaturesBase;
  const nDiv = compiled.nDivLevels;
  if (baseFeatures.length !== nBase) {
    throw new InvalidFeaturesError(
      `features_base tiene ${baseFeatures.length} valores; se esperaban ${nBase}`,
    );
  }
  if (!Number.isInteger(divIndex) || divIndex < -1 || divIndex >= nDiv) {
    throw new InvalidFeaturesError(`divIndex (${divIndex}) fuera de [-1, ${nDiv})`);
  }
  const buf = compiled.scratchDesign;
  for (let i = 0; i < nBase; i += 1) {
    const raw = baseFeatures[i];
    if (raw === null) {
      buf[i] = Number.NaN;
    } else if (typeof raw === "number") {
      if (raw !== raw) {
        buf[i] = Number.NaN;
      } else if (raw === Number.POSITIVE_INFINITY || raw === Number.NEGATIVE_INFINITY) {
        throw new InvalidFeaturesError(`features_base[${i}] no es finito`);
      } else {
        buf[i] = raw;
      }
    } else {
      throw new InvalidFeaturesError(`features_base[${i}] está ausente`);
    }
  }
  for (let j = 0; j < nDiv; j += 1) {
    buf[nBase + j] = 0;
  }
  if (divIndex >= 0) {
    buf[nBase + divIndex] = 1;
  }
  return buf;
}

/** Escribe `softmax3([z0, z1, z2])` en `out[offset .. offset+2]` sin ninguna asignación en heap. */
function softmaxFromLogitsInto(
  z0: number,
  z1: number,
  z2: number,
  out: Float64Array,
  offset: number,
): void {
  const m = z0 > z1 ? (z0 > z2 ? z0 : z2) : z1 > z2 ? z1 : z2;
  const e0 = Math.exp(z0 - m);
  const e1 = Math.exp(z1 - m);
  const e2 = Math.exp(z2 - m);
  const invSum = 1 / (e0 + e1 + e2);
  out[offset] = e0 * invSum;
  out[offset + 1] = e1 * invSum;
  out[offset + 2] = e2 * invSum;
}

/**
 * Calcula directamente `p_cal = softmax(log(max(softmax(z), 1e-15)) / T)` en `out[offset .. offset+2]`
 * sin crear tuplas efímeras ni invocar `Math.log` cuando `z_k - max(z) >= -33` (`p_raw[k] >= 4.6e-15`).
 */
function calibratedProbsFromLogitsInto(
  z0: number,
  z1: number,
  z2: number,
  compiled: CompiledGbmModel,
  out: Float64Array,
  offset: number,
): void {
  if (compiled.temperature === 1) {
    softmaxFromLogitsInto(z0, z1, z2, out, offset);
    return;
  }
  const m = z0 > z1 ? (z0 > z2 ? z0 : z2) : z1 > z2 ? z1 : z2;
  const d0 = z0 - m;
  const d1 = z1 - m;
  const d2 = z2 - m;
  const invT = compiled.invTemperature;
  // Si ninguna clase cae cerca del piso `1e-15` (`ln(1e-15) ≈ -34.54`), `softmax((z - m)/T)` es exacto
  if (d0 >= -33 && d1 >= -33 && d2 >= -33) {
    softmaxFromLogitsInto(d0 * invT, d1 * invT, d2 * invT, out, offset);
    return;
  }
  softmaxFromLogitsInto(z0, z1, z2, out, offset);
  const p0 = out[offset]!;
  const p1 = out[offset + 1]!;
  const p2 = out[offset + 2]!;
  softmaxFromLogitsInto(
    Math.log(p0 > PROB_LOG_FLOOR ? p0 : PROB_LOG_FLOOR) * invT,
    Math.log(p1 > PROB_LOG_FLOOR ? p1 : PROB_LOG_FLOOR) * invT,
    Math.log(p2 > PROB_LOG_FLOOR ? p2 : PROB_LOG_FLOOR) * invT,
    out,
    offset,
  );
}

/** Mezcla en sitio `out[lOff..lOff+2]` y `out[gOff..gOff+2]` dentro de `out[dstOff..dstOff+2]`. */
function blendScratchInto(
  out: Float64Array,
  lOff: number,
  gOff: number,
  dstOff: number,
  compiled: CompiledGbmModel,
): void {
  const wl = compiled.wLogit;
  const wg = compiled.wGbm;
  const pl0 = out[lOff]!;
  const pl1 = out[lOff + 1]!;
  const pl2 = out[lOff + 2]!;
  const pg0 = out[gOff]!;
  const pg1 = out[gOff + 1]!;
  const pg2 = out[gOff + 2]!;

  if (compiled.blendSpace === "logit") {
    softmaxFromLogitsInto(
      wl * Math.log(pl0 > PROB_LOG_FLOOR ? pl0 : PROB_LOG_FLOOR) +
        wg * Math.log(pg0 > PROB_LOG_FLOOR ? pg0 : PROB_LOG_FLOOR),
      wl * Math.log(pl1 > PROB_LOG_FLOOR ? pl1 : PROB_LOG_FLOOR) +
        wg * Math.log(pg1 > PROB_LOG_FLOOR ? pg1 : PROB_LOG_FLOOR),
      wl * Math.log(pl2 > PROB_LOG_FLOOR ? pl2 : PROB_LOG_FLOOR) +
        wg * Math.log(pg2 > PROB_LOG_FLOOR ? pg2 : PROB_LOG_FLOOR),
      out,
      dstOff,
    );
    return;
  }
  const r0 = wl * pl0 + wg * pg0;
  const r1 = wl * pl1 + wg * pg1;
  const r2 = wl * pl2 + wg * pg2;
  const invS = 1 / (r0 + r1 + r2);
  out[dstOff] = r0 * invS;
  out[dstOff + 1] = r1 * invS;
  out[dstOff + 2] = r2 * invS;
}

/**
 * Núcleo caliente de recorrido de todos los árboles en arreglos tipados planos.
 * Escribe `[logit0, logit1, logit2]` en `out[offset .. offset+2]` con cero asignaciones en heap.
 */
function traverseForestInto(
  design: Float64Array,
  compiled: CompiledGbmModel,
  out: Float64Array,
  offset: number,
): void {
  const {
    nTrees,
    treeOffsets,
    isLeaf,
    isCategorical,
    missingGoToLeft,
    designFeatureIdx,
    leftGlobal,
    rightGlobal,
    bitsetWordOffset,
    knownWordOffset,
    numThreshold,
    leafValue,
    rawLeftCatBitsets,
    knownCatBitsets,
    hasCategoricalFeatures,
  } = compiled;

  let logit0 = compiled.baseline0;
  let logit1 = compiled.baseline1;
  let logit2 = compiled.baseline2;

  if (!hasCategoricalFeatures) {
    // Camino rápido puramente numérico (100% de árboles estándar con `div_onehot`)
    for (let t = 0; t < nTrees; t += 3) {
      let n0 = treeOffsets[t]!;
      while (isLeaf[n0] === 0) {
        const x0 = design[designFeatureIdx[n0]!]!;
        n0 =
          x0 !== x0
            ? missingGoToLeft[n0] !== 0
              ? leftGlobal[n0]!
              : rightGlobal[n0]!
            : x0 <= numThreshold[n0]!
              ? leftGlobal[n0]!
              : rightGlobal[n0]!;
      }
      logit0 += leafValue[n0]!;

      let n1 = treeOffsets[t + 1]!;
      while (isLeaf[n1] === 0) {
        const x1 = design[designFeatureIdx[n1]!]!;
        n1 =
          x1 !== x1
            ? missingGoToLeft[n1] !== 0
              ? leftGlobal[n1]!
              : rightGlobal[n1]!
            : x1 <= numThreshold[n1]!
              ? leftGlobal[n1]!
              : rightGlobal[n1]!;
      }
      logit1 += leafValue[n1]!;

      let n2 = treeOffsets[t + 2]!;
      while (isLeaf[n2] === 0) {
        const x2 = design[designFeatureIdx[n2]!]!;
        n2 =
          x2 !== x2
            ? missingGoToLeft[n2] !== 0
              ? leftGlobal[n2]!
              : rightGlobal[n2]!
            : x2 <= numThreshold[n2]!
              ? leftGlobal[n2]!
              : rightGlobal[n2]!;
      }
      logit2 += leafValue[n2]!;
    }
    out[offset] = logit0;
    out[offset + 1] = logit1;
    out[offset + 2] = logit2;
    return;
  }

  // Camino general mixto numérico + categórico (`bitset_idx` de 256 bits)
  for (let t = 0; t < nTrees; t += 1) {
    let node = treeOffsets[t]!;
    while (isLeaf[node] === 0) {
      const x = design[designFeatureIdx[node]!]!;
      if (x !== x) {
        node = missingGoToLeft[node] !== 0 ? leftGlobal[node]! : rightGlobal[node]!;
      } else if (isCategorical[node] === 0) {
        node = x <= numThreshold[node]! ? leftGlobal[node]! : rightGlobal[node]!;
      } else {
        const catCode = x;
        const kOff = knownWordOffset[node]!;
        const isKnown =
          Number.isInteger(catCode) &&
          catCode >= 0 &&
          catCode < 256 &&
          (kOff < 0 || isBitSet256(knownCatBitsets, kOff, catCode));
        if (!isKnown) {
          node = missingGoToLeft[node] !== 0 ? leftGlobal[node]! : rightGlobal[node]!;
        } else {
          const bOff = bitsetWordOffset[node]!;
          node = isBitSet256(rawLeftCatBitsets, bOff, catCode)
            ? leftGlobal[node]!
            : rightGlobal[node]!;
        }
      }
    }
    const cls = t % 3;
    const lv = leafValue[node]!;
    if (cls === 0) {
      logit0 += lv;
    } else if (cls === 1) {
      logit1 += lv;
    } else {
      logit2 += lv;
    }
  }
  out[offset] = logit0;
  out[offset + 1] = logit1;
  out[offset + 2] = logit2;
}

function predictCompanionLogitInto(
  gbmDesign: Float64Array,
  compiled: CompiledGbmModel,
  out: Float64Array,
  offset: number,
): void {
  const comp = compiled.logitCompanion;
  if (comp === null) {
    throw new GbmArtifactValidationError(
      "el artefacto GBM no incluye `logit_companion` y no se proporcionó `logitModel`/`logitProbs`",
    );
  }

  const {
    nLogitBase,
    nLogitTotal,
    isContiguousIdentity,
    baseFeatureIndices,
    imputerStats,
    scalerMean,
    scalerInvScale,
    coef0,
    coef1,
    coef2,
  } = comp;

  let z0 = comp.intercept0;
  let z1 = comp.intercept1;
  let z2 = comp.intercept2;

  if (isContiguousIdentity) {
    for (let i = 0; i < nLogitTotal; i += 1) {
      const raw = gbmDesign[i]!;
      const x = ((raw !== raw ? imputerStats[i]! : raw) - scalerMean[i]!) * scalerInvScale[i]!;
      z0 += coef0[i]! * x;
      z1 += coef1[i]! * x;
      z2 += coef2[i]! * x;
    }
  } else {
    for (let i = 0; i < nLogitBase; i += 1) {
      const raw = gbmDesign[baseFeatureIndices[i]!]!;
      const x = ((raw !== raw ? imputerStats[i]! : raw) - scalerMean[i]!) * scalerInvScale[i]!;
      z0 += coef0[i]! * x;
      z1 += coef1[i]! * x;
      z2 += coef2[i]! * x;
    }
    const gbmDivStart = compiled.nFeaturesBase;
    for (let j = 0; j < compiled.nDivLevels; j += 1) {
      const idx = nLogitBase + j;
      const rawDiv = gbmDesign[gbmDivStart + j]!;
      const x = (rawDiv - scalerMean[idx]!) * scalerInvScale[idx]!;
      z0 += coef0[idx]! * x;
      z1 += coef1[idx]! * x;
      z2 += coef2[idx]! * x;
    }
  }

  softmaxFromLogitsInto(z0, z1, z2, out, offset);
}

/**
 * Aplica escalado de temperatura `T > 0` sobre un vector de probabilidades 1X2:
 *   `p_cal = softmax3([log(max(p_0, 1e-15)) / T, ...])`
 * Nota matemática: como `p_raw = softmax3(raw_logits)`, cuando ningún `p_raw[k]` cae bajo `1e-15`,
 * `softmax3(log(p_raw) / T)` es idéntico a `softmax3(raw_logits / T)`.
 */
export function applyTemperature3(
  probs: readonly [number, number, number],
  temperature: number,
): readonly [number, number, number] {
  if (!Number.isFinite(temperature) || !(temperature > 0)) {
    throw new GbmArtifactValidationError(`temperature debe ser finito y > 0; recibido ${temperature}`);
  }
  if (temperature === 1) {
    assertSimplex3(probs, "applyTemperature3");
    return probs;
  }
  const invT = 1 / temperature;
  return softmax3([
    Math.log(Math.max(probs[0], PROB_LOG_FLOOR)) * invT,
    Math.log(Math.max(probs[1], PROB_LOG_FLOOR)) * invT,
    Math.log(Math.max(probs[2], PROB_LOG_FLOOR)) * invT,
  ]);
}

/**
 * Combina probabilidades `Logit` y `GBM calibrado` usando los pesos y espacio de mezcla
 * (`"probability"` convexo o `"logit"` log-lineal) calibrados sin fuga en Python.
 */
export function blendLogitAndGbm(
  pLogit: readonly [number, number, number],
  pGbmCalibrated: readonly [number, number, number],
  calibration: Pick<GbmCalibrationConfig, "blend_space" | "w_logit" | "w_gbm">,
): readonly [number, number, number] {
  const { blend_space: space, w_logit: wl, w_gbm: wg } = calibration;
  if (!Number.isFinite(wl) || !Number.isFinite(wg) || wl < 0 || wg < 0 || wl + wg <= 0) {
    throw new GbmArtifactValidationError("pesos de mezcla w_logit / w_gbm inválidos");
  }
  if (space === "logit") {
    return softmax3([
      wl * Math.log(Math.max(pLogit[0], PROB_LOG_FLOOR)) +
        wg * Math.log(Math.max(pGbmCalibrated[0], PROB_LOG_FLOOR)),
      wl * Math.log(Math.max(pLogit[1], PROB_LOG_FLOOR)) +
        wg * Math.log(Math.max(pGbmCalibrated[1], PROB_LOG_FLOOR)),
      wl * Math.log(Math.max(pLogit[2], PROB_LOG_FLOOR)) +
        wg * Math.log(Math.max(pGbmCalibrated[2], PROB_LOG_FLOOR)),
    ]);
  }
  const raw0 = wl * pLogit[0] + wg * pGbmCalibrated[0];
  const raw1 = wl * pLogit[1] + wg * pGbmCalibrated[1];
  const raw2 = wl * pLogit[2] + wg * pGbmCalibrated[2];
  const sum = raw0 + raw1 + raw2;
  const out: readonly [number, number, number] = [raw0 / sum, raw1 / sum, raw2 / sum];
  assertSimplex3(out, "blendLogitAndGbm");
  return out;
}

/**
 * Devuelve las probabilidades crudas `[pHome, pDraw, pAway]` de `HistGradientBoostingClassifier.predict_proba`
 * antes del escalado de temperatura.
 */
export function predictGbmRawProbs(
  row: GbmInputRow,
  artifact: GbmArtifact,
): readonly [number, number, number] {
  const compiled = getOrCompileGbm(artifact);
  const design = fillDesignBufferFromRow(row, compiled);
  const out = compiled.scratchOut;
  traverseForestInto(design, compiled, out, 0);
  softmaxFromLogitsInto(out[0]!, out[1]!, out[2]!, out, 3);
  return [out[3]!, out[4]!, out[5]!];
}

/**
 * Devuelve las probabilidades calibradas `[pHome, pDraw, pAway]` del GBM tras aplicar la temperatura `T`.
 */
export function predictGbmCalibratedProbs(
  row: GbmInputRow,
  artifact: GbmArtifact,
): readonly [number, number, number] {
  const compiled = getOrCompileGbm(artifact);
  const design = fillDesignBufferFromRow(row, compiled);
  const out = compiled.scratchOut;
  traverseForestInto(design, compiled, out, 0);
  calibratedProbsFromLogitsInto(out[0]!, out[1]!, out[2]!, compiled, out, 3);
  return [out[3]!, out[4]!, out[5]!];
}

/**
 * Evalúa una fila compacta `(features_base, div_index)` sin construir un objeto `SnapshotRow` intermedio,
 * devolviendo simultáneamente `gbmRaw`, `gbmCalibrated`, `logit` y `ensemble`.
 * Útil para validación masiva de paridad e inferencia por lotes de latencia ultrabaja.
 */
export function evaluateCompactValidationRow(
  baseFeatures: readonly (number | null)[],
  divIndex: number,
  artifact: GbmArtifact,
): {
  readonly gbmRaw: readonly [number, number, number];
  readonly gbmCalibrated: readonly [number, number, number];
  readonly logit: readonly [number, number, number];
  readonly ensemble: readonly [number, number, number];
} {
  const compiled = getOrCompileGbm(artifact);
  const design = fillDesignBufferCompact(baseFeatures, divIndex, compiled);
  const out = compiled.scratchOut;
  traverseForestInto(design, compiled, out, 0);
  const z0 = out[0]!;
  const z1 = out[1]!;
  const z2 = out[2]!;
  softmaxFromLogitsInto(z0, z1, z2, out, 0);
  const gbmRaw: readonly [number, number, number] = [out[0]!, out[1]!, out[2]!];
  calibratedProbsFromLogitsInto(z0, z1, z2, compiled, out, 3);
  const gbmCalibrated: readonly [number, number, number] = [out[3]!, out[4]!, out[5]!];
  predictCompanionLogitInto(design, compiled, out, 6);
  const logit: readonly [number, number, number] = [out[6]!, out[7]!, out[8]!];
  blendScratchInto(out, 6, 3, 9, compiled);
  const ensemble: readonly [number, number, number] = [out[9]!, out[10]!, out[11]!];
  return { gbmRaw, gbmCalibrated, logit, ensemble };
}

/** Predicción estructurada `Prediction` del GBM calibrado individual (cero asignaciones intermedias). */
export function predictGbm(row: GbmInputRow, artifact: GbmArtifact): Prediction {
  const compiled = getOrCompileGbm(artifact);
  const design = fillDesignBufferFromRow(row, compiled);
  const out = compiled.scratchOut;
  traverseForestInto(design, compiled, out, 0);
  calibratedProbsFromLogitsInto(out[0]!, out[1]!, out[2]!, compiled, out, 3);
  return {
    pHome: out[3]!,
    pDraw: out[4]!,
    pAway: out[5]!,
    modelId: GBM_MODEL_ID,
    modelName: artifact.codename || TACHYON_GBM_MODEL_NAME,
    modelVersion: artifact.version,
    generatedAt: artifact.created_at,
    dataQualityFlag: "ok",
    sport: "football",
  };
}

/**
 * Predicción del ensamble `Logit + GBM calibrado` (cero asignaciones intermedias en el camino caliente).
 * Si `options.respectProductionGate === true` y `artifact.production_activated === false`,
 * retorna únicamente las probabilidades `Logit` sin mezclar el GBM.
 */
export function predictLogitGbmEnsemble(
  row: GbmInputRow,
  artifact: GbmArtifact,
  options?: EnsemblePredictOptions,
): Prediction {
  const compiled = getOrCompileGbm(artifact);
  const design = fillDesignBufferFromRow(row, compiled);
  const out = compiled.scratchOut;

  if (options === undefined) {
    predictCompanionLogitInto(design, compiled, out, 6);
    traverseForestInto(design, compiled, out, 0);
    calibratedProbsFromLogitsInto(out[0]!, out[1]!, out[2]!, compiled, out, 3);
    blendScratchInto(out, 6, 3, 9, compiled);
    return {
      pHome: out[9]!,
      pDraw: out[10]!,
      pAway: out[11]!,
      modelId: ENSEMBLE_LOGIT_GBM_MODEL_ID,
      modelName: TACHYON_ENSEMBLE_MODEL_NAME,
      modelVersion: artifact.version,
      generatedAt: artifact.created_at,
      dataQualityFlag: "ok",
      sport: "football",
    };
  }

  if (options.logitProbs !== undefined) {
    assertSimplex3(options.logitProbs, "options.logitProbs");
    out[6] = options.logitProbs[0];
    out[7] = options.logitProbs[1];
    out[8] = options.logitProbs[2];
  } else if (options.logitModel !== undefined) {
    assertValidModel(options.logitModel);
    const predL = predictMotorA(row, options.logitModel);
    out[6] = predL.pHome;
    out[7] = predL.pDraw;
    out[8] = predL.pAway;
  } else {
    predictCompanionLogitInto(design, compiled, out, 6);
  }

  if (options.respectProductionGate === true && !artifact.production_activated) {
    return {
      pHome: out[6]!,
      pDraw: out[7]!,
      pAway: out[8]!,
      modelId: options.logitModel ? "motor_a_logistic_v1" : ENSEMBLE_LOGIT_GBM_MODEL_ID,
      modelName: options.logitModel?.codename ?? artifact.codename ?? TACHYON_ENSEMBLE_MODEL_NAME,
      modelVersion: options.logitModel?.version ?? artifact.version,
      generatedAt: options.logitModel?.created_at ?? artifact.created_at,
      dataQualityFlag: "ok",
      sport: "football",
    };
  }

  traverseForestInto(design, compiled, out, 0);
  calibratedProbsFromLogitsInto(out[0]!, out[1]!, out[2]!, compiled, out, 3);
  blendScratchInto(out, 6, 3, 9, compiled);

  return {
    pHome: out[9]!,
    pDraw: out[10]!,
    pAway: out[11]!,
    modelId: ENSEMBLE_LOGIT_GBM_MODEL_ID,
    modelName: TACHYON_ENSEMBLE_MODEL_NAME,
    modelVersion: artifact.version,
    generatedAt: artifact.created_at,
    dataQualityFlag: "ok",
    sport: "football",
  };
}

/**
 * Puerta de producción opcional para Motor A:
 * solo mezcla `GBM calibrado` cuando `gbmArtifact` se proporciona Y `gbmArtifact.production_activated === true`
 * (o `forceEnable === true`). En caso contrario conserva el resultado exacto de `predictMotorA(row, logitModel)`.
 */
export function predictMotorAWithOptionalGbm(
  row: GbmInputRow,
  logitModel: ModelArtifact,
  gbmArtifact?: GbmArtifact | null,
  forceEnable = false,
): Prediction {
  const basePred = predictMotorA(row, logitModel);
  if (!gbmArtifact || (!forceEnable && !gbmArtifact.production_activated)) {
    return basePred;
  }
  return predictLogitGbmEnsemble(row, gbmArtifact, {
    logitProbs: [basePred.pHome, basePred.pDraw, basePred.pAway],
    respectProductionGate: !forceEnable,
  });
}
