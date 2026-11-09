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

/** Deporte del contrato. El fútbol usa H/D/A; la NFL usa H/T/A (T = empate). */
export type Sport = "football" | "nfl";

/** Salida pública del motor. `pHome + pDraw + pAway = 1` (tolerancia 1e-9). */
export interface Prediction {
  pHome: number;
  /** Empate en fútbol; en NFL, empate (T). */
  pDraw: number;
  pAway: number;
  modelId: string;
  modelVersion: string;
  generatedAt: string;
  dataQualityFlag: DataQualityFlag;
  sport: Sport;
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


// ---------------------------------------------------------------------------
// NFL (ciclo 3)
// ---------------------------------------------------------------------------

/** Metadatos del artefacto NFL. */
export interface NFLModelMetadata {
  source: string;
  n_matches: number;
  seasons: readonly number[];
  train_log_loss: number;
  tie_rate: number;
  notes: string;
}

/**
 * Forma de `model_nfl.json` (A14).
 *
 * Invariantes: `features.length === n_features === scaler.mean.length ===
 * scaler.scale.length === coef[k].length`; `coef.length === intercept.length === 3`;
 * `classes` es `[0, 1, 2]` y se mapea 0=H (local), 1=T (empate), 2=A (visitante).
 */
export interface NFLModelArtifact {
  sport: "nfl";
  type: string;
  version: string;
  created_at: string;
  seed: number;
  features: readonly string[];
  n_features: number;
  scaler: {
    mean: readonly number[];
    scale: readonly number[];
  };
  coef: ReadonlyArray<readonly number[]>;
  intercept: readonly number[];
  classes: readonly number[];
  class_map?: Record<string, string>;
  metadata: NFLModelMetadata;
}

/** Una fila de `nfl_snapshot.json` (24 features, sin dummies de división). */
export interface NFLSnapshotRow {
  season?: number;
  week?: number;
  home_team?: string;
  away_team?: string;
  features: readonly (number | null)[];
  probs_python?: readonly number[];
}

/** Forma de `nfl_snapshot.json`. */
export interface NFLSnapshotFile {
  generated_at: string;
  n: number;
  rows: Record<string, NFLSnapshotRow>;
}

/** Petición de inferencia de fútbol. */
export interface FootballPredictionRequest {
  sport: "football";
  row: SnapshotRow;
  model: ModelArtifact;
  marketProbs?: readonly number[] | null;
  baseRates?: BaseRates;
}

/** Petición de inferencia NFL. */
export interface NFLPredictionRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact;
}

export type PredictionRequest = FootballPredictionRequest | NFLPredictionRequest;
