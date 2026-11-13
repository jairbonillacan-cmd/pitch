/**
 * Contrato de inferencia del Prediction Lab (A10 / v2).
 *
 * El artefacto `model_motor_a.json` lo genera el pipeline Python
 * (`research/prediction-lab/pipeline/export_model.py`) y se copia sin editar a
 * `src/data/prediction/`. TypeScript no reentrena ni recalcula features: solo aplica
 * imputer + scaler + softmax sobre el vector de diseño ya construido por Python.
 */

/** Marca de calidad de una predicción. */
export type DataQualityFlag = "ok" | "fallback_motor_a" | "invalid_features" | "low_coverage";

/** Estado de la compuerta de valor y cuota real (`v3.2`). */
export type ValueStatus = "no_market" | "disabled_segment" | "active";

/** Cobertura de features reales (no imputadas) sobre el vector esperado del motor (`v3.2`). */
export interface FeatureCoverage {
  readonly present: number;
  readonly total: number;
  readonly ratio: number;
}

/** Metadatos auditables de una cuota real fresca con origen y timestamp de captura (`v3.2`). */
export interface MarketQuoteSourceMeta {
  readonly book: string;
  readonly tsCaptured: string;
  readonly odds: readonly number[];
  readonly overround: number;
}

/** Deporte del contrato (6 deportes / 11 ligas en Spacetime Suite v3.0). */
export type Sport = "football" | "nfl" | "nhl" | "mlb" | "nba" | "ncaaf";

/** Modo de combinación entre mercado y Motor A en fútbol. */
export type PredictionMode = "market_only" | "hybrid" | "motor_a_only";

/** Salida pública del motor. `pHome + pDraw + pAway = 1` (tolerancia 1e-9). */
export interface Prediction {
  pHome: number;
  /** Empate en fútbol; en NFL, empate (T). */
  pDraw: number;
  pAway: number;
  modelId: string;
  /** Nombre en clave de la familia espacio-temporal de modelos (ej. "PitchLab Tachyon v2.0"). */
  modelName: string;
  modelVersion: string;
  generatedAt: string;
  dataQualityFlag: DataQualityFlag;
  sport: Sport;
  /** Método de de-vig aplicado cuando la predicción viene del mercado (A17). */
  marketMethod?: string;
  /** Divergencia (pModel - pMarket) para [H, D, A] cuando ambos están disponibles. */
  modelMarketDivergence?: readonly [number, number, number];
  /** Edge esperado (pEval * cuota - 1) para [H, D, A] cuando hay cuotas válidas. */
  expectedEdge?: readonly [number, number, number];
  /** Fracción de Kelly recomendada (Quarter-Kelly con filtro de incertidumbre) para [H, D, A]. */
  kellyFraction?: readonly [number, number, number];
  /** Indica si la discrepancia modelo-mercado pasa el filtro anti-Winner's Curse. */
  uncertaintyGatePassed?: boolean;
  /** Peso alpha del mercado cuando se usa el modo `hybrid`. */
  hybridAlpha?: number;
  /** Cobertura de features reales frente a imputación (`v3.2`). */
  featureCoverage?: FeatureCoverage;
  /** Estado de honestidad de mercado y compuerta de producción (`v3.2`). */
  valueStatus?: ValueStatus;
  /** Cuota real verificada con origen y `tsCaptured`, o `null` cuando no existe mercado válido (`v3.2`). */
  market?: MarketQuoteSourceMeta | null;
  /** Clave canónica `"league::market"` evaluada en `production_segments_v3_1.json` (`v3.2`). */
  segmentKey?: string;
  /** Si el segmento tiene `production_enabled: true` en `production_segments_v3_1.json` (`v3.2`). */
  segmentEnabled?: boolean;
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
 * Forma exacta de `model_motor_a.json` (v2.0.0).
 *
 * Invariantes que valida `engine.ts`:
 *   features.length = n_features_base + div_levels.length = 102 (79 + 23)
 *   coef.length = intercept.length = classes.length = 3
 *   cada coef[k].length = imputer.statistics.length = scaler.mean.length =
 *   scaler.scale.length = features.length
 */
export interface ProspectiveAvailabilityPriorConfig {
  enabled: boolean;
  schema_version?: string;
  clip_abs: number;
  weights: {
    missing_market_value_diff: number;
    shrunk_log_squad_value_ratio: number;
    effective_absences_diff: number;
  };
  bounds: {
    missing_market_value_ratio_max: number;
    log_squad_value_ratio_clip: number;
    max_effective_absences_per_team: number;
    effective_absences_diff_clip: number;
  };
  absence_weights: {
    rotowire_injured_out: number;
    transfermarkt_injured_with_rotowire: number;
    transfermarkt_injured_without_rotowire: number;
    suspended_players: number;
  };
  logit_shift?: {
    home_multiplier: number;
    draw_multiplier: number;
    away_multiplier: number;
    description?: string;
  };
}

export interface TeamAvailabilityContext {
  missing_market_value_ratio?: number | null;
  value_ratio_vs_league_median?: number | null;
  rotowire_injured_out_count?: number | null;
  injured_players_count?: number | null;
  suspended_players_count?: number | null;
}

export interface LineupAvailabilityDeltaResult {
  lineup_availability_delta: number;
  missing_value_term: number;
  squad_value_term: number;
  starter_absence_term: number;
  home_missing_market_value_ratio: number;
  away_missing_market_value_ratio: number;
  home_effective_absences: number;
  away_effective_absences: number;
}

export interface ModelArtifact {
  type: string;
  codename?: string;
  version: string;
  created_at: string;
  seed: number;
  regularization_C?: number;
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
  prospective_availability_prior?: ProspectiveAvailabilityPriorConfig;
  metadata: ModelMetadata;
  dataset_sha256?: string;
}

/**
 * Una fila de `features_snapshot.json`.
 *
 * `features` tiene las features base (puede contener `null`; Python lo serializa
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
// NFL (ciclo 3 / v2)
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
 * Forma de `model_nfl.json` (A14 / v2).
 *
 * Invariantes: `features.length === n_features === scaler.mean.length ===
 * scaler.scale.length === coef[k].length`; `coef.length === intercept.length === 3`;
 * `classes` es `[0, 1, 2]` y se mapea 0=H (local), 1=T (empate), 2=A (visitante).
 */
export interface NFLModelArtifact {
  sport: "nfl";
  type: string;
  codename?: string;
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

/** Una fila de `nfl_snapshot.json` (34 features con QB Elo, sin dummies de división). */
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
  mode?: PredictionMode;
  hybridAlpha?: number;
}

/** Petición de inferencia NFL. */
export interface NFLPredictionRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact;
}

export type PredictionRequest = FootballPredictionRequest | NFLPredictionRequest;
