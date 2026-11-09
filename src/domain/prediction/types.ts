/**
 * Contrato de inferencia del Prediction Lab (A10).
 *
 * El artefacto `model_motor_a.json` lo genera el pipeline Python
 * (`research/prediction-lab/pipeline/export_model.py`) y se copia sin editar a
 * `src/data/prediction/`. TypeScript no reentrena ni recalcula features: solo aplica
 * imputer + scaler + softmax sobre el vector de diseño ya construido por Python.
 */

/** Marca de calidad de una predicción. */
export type DataQualityFlag = "ok" | "fallback_motor_a" | "invalid_features";

/** Salida pública del motor. `pHome + pDraw + pAway = 1` (tolerancia 1e-9). */
export interface Prediction {
  pHome: number;
  pDraw: number;
  pAway: number;
  modelId: string;
  modelVersion: string;
  generatedAt: string;
  dataQualityFlag: DataQualityFlag;
}

/** Metadatos de entrenamiento incluidos en el artefacto. */
export interface ModelMetadata {
  trained_on: string;
  n_matches: number;
  seasons: readonly string[];
  target: string;
  train_log_loss: number;
  notes: string;
}

/**
 * Forma exacta de `model_motor_a.json` (v1.0.0).
 *
 * Invariantes que valida `engine.ts`:
 *   features.length = n_features_base + div_levels.length = 77
 *   coef.length = intercept.length = classes.length = 3
 *   cada coef[k].length = imputer.statistics.length = scaler.mean.length =
 *   scaler.scale.length = features.length
 */
export interface ModelArtifact {
  type: string;
  version: string;
  created_at: string;
  seed: number;
  features: readonly string[];
  n_features_base: number;
  div_levels: readonly string[];
  imputer: {
    strategy: string;
    statistics: readonly number[];
  };
  scaler: {
    mean: readonly number[];
    scale: readonly number[];
  };
  coef: ReadonlyArray<readonly number[]>;
  intercept: readonly number[];
  classes: readonly number[];
  metadata: ModelMetadata;
  dataset_sha256?: string;
}

/**
 * Una fila de `features_snapshot.json`.
 *
 * `features` tiene las 54 features base (puede contener `null`; Python lo serializa
 * desde `pd.isna`). `div_onehot` tiene 23 valores 0/1 en el mismo orden que
 * `div_levels`. El vector de diseño completo es `[...features, ...div_onehot]`.
 */
export interface SnapshotRow {
  div?: string;
  season?: string;
  match_date?: string;
  features: readonly (number | null)[];
  div_onehot: readonly number[];
  /** Solo existe en el snapshot de paridad; no se usa para predecir. */
  probs_python?: readonly number[];
}

/** Forma de `features_snapshot.json`: `rows` es un mapa match_id -> fila. */
export interface SnapshotFile {
  generated_at: string;
  n: number;
  rows: Record<string, SnapshotRow>;
}

/** Frecuencias base H/D/A para el camino `invalid_features`. */
export interface BaseRates {
  pHome: number;
  pDraw: number;
  pAway: number;
}
