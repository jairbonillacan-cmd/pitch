/**
 * A17 / A26 / v3.2 (B2 `b2-gate`) — Servicio unificado de predicción con compuerta de producción
 * y honestidad estricta de mercado (`PitchLab Spacetime Suite v3.2`).
 *
 * Garantías estructurales v3.2:
 *   1. Carga `production_segments_v3_1.json` (congelado) y `blend_weights_v3_1.json`: con cualquier
 *      segmento apagado (`production_enabled: false`), jamás emite `expectedEdge`, `kellyFraction`
 *      ni `geodesicV2` con stake/EV activo, etiquetando `valueStatus: "disabled_segment"`.
 *   2. Cero cuotas sintéticas: sin cuota decimal real válida acompañada de origen (`book`) y
 *      timestamp ISO de captura (`ts_captured` / `tsCaptured`), jamás reconstruye precios decimales
 *      y marca `market: null` y `valueStatus: "no_market"`.
 *   3. Ancla de Smarkets corregida: cuando solo existe probabilidad de intercambio Smarkets, el
 *      vector `marketProbs` se ancla realmente en Smarkets y nunca recicla `sportsProbs` como mercado.
 *   4. Única implementación de Dixon-Coles delegando en `buildDixonColesScoreMatrix` (`markets_2way.ts`)
 *      y primitivas numéricas compartidas desde `math.ts`.
 *   5. Medición explícita de imputación (`featureCoverage: { present, total, ratio }`) con
 *      `dataQualityFlag: "low_coverage"` cuando `ratio < 0.50`.
 *   6. Constantes y heurísticas externalizadas a `src/data/prediction/service_constants_v3_2.json`.
 */
import blendWeightsV31Json from "../../data/prediction/blend_weights_v3_1.json";
import productionSegmentsV31Json from "../../data/prediction/production_segments_v3_1.json";
import serviceConstantsV32Json from "../../data/prediction/service_constants_v3_2.json";

import {
  isPlausibleMarketOverround,
  normalizeArtifactMarketKey,
  resolveBlendSegment,
  type BlendWeightsArtifact,
  type CoreDevigMethod,
} from "./blend.js";
import {
  InvalidOddsError,
  applySingularitySharpTilt2Way,
  applySingularitySharpTilt3Way,
  debiaseRecreationalLigaMx,
  devig,
  devig2Way,
  devigAdaptive1X2,
  evaluateGeodesicV2ValueGate,
  overround,
  type DevigMethod,
  type GeodesicV2GateInput,
  type GeodesicV2GateResult,
  type LigaMxDebiasParams,
  type RlmSignalSide,
  type SingularityTilt3WayInput,
} from "./devig.js";
import {
  DEFAULT_HYBRID_ALPHA,
  GEODESIC_MODEL_NAME,
  HORIZON_MODEL_NAME,
  HYBRID_MODEL_ID,
  InvalidFeaturesError,
  MINKOWSKI_MODEL_NAME,
  NFL_MODEL_ID,
  SINGULARITY_MODEL_NAME,
  TACHYON_MODEL_NAME,
  blendLogLinear3,
  computeLineupAvailabilityDelta,
  evaluateValueExecution,
  predictMotorA,
  predictMotorAWithAvailability,
  predictNFL,
  predictWithFallback,
  type ValueExecutionOptions,
} from "./engine.js";
import {
  DEFAULT_DC_RHO,
  DEFAULT_MAX_GOALS,
  buildDixonColesScoreMatrix,
} from "./markets_2way.js";
import { clamp, logit } from "./math.js";
import {
  MULTISPORT_CODENAMES,
  predictMultiSport,
  type MultiSportDriver,
  type MultiSportLeague,
  type MultiSportMatchupInput,
  type MultiSportModelArtifact,
  type MultiSportPrediction,
  type SportEngineConfig,
} from "./multisport.js";
import {
  applyMinkowskiV3LiveContext,
  type NFLLiveArtifactConfig,
  type NFLLiveContextInput,
} from "./nfl_live.js";
import type {
  BaseRates,
  DataQualityFlag,
  FeatureCoverage,
  MarketQuoteSourceMeta,
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotRow,
  Prediction,
  PredictionMode,
  SnapshotRow,
  Sport,
  TeamAvailabilityContext,
  ValueStatus,
} from "./types.js";

// ===========================================================================
// 0. Artefactos congelados v3.1 y constantes versionadas v3.2
// ===========================================================================

export interface ProductionSegmentGateEntry {
  readonly league: string;
  readonly market: string;
  readonly sport?: string;
  readonly production_enabled: boolean;
  readonly disabled_reason: string | null;
  readonly w_effective_a4?: number;
  readonly best_devig_method_a4?: string;
}

export interface ProductionSegmentsArtifact {
  readonly schema_version: string;
  readonly segments: Readonly<Record<string, ProductionSegmentGateEntry>>;
}

export interface ServiceConstantEntry<T> {
  readonly value: T;
  readonly origin: string;
  readonly validation_status: string;
}

export interface PopularLigaMxClubEntry {
  readonly canonical_name: string;
  readonly tokens: readonly string[];
  readonly public_bias_weight: number;
}

export interface ServiceConstantsArtifact {
  readonly schema_version: string;
  readonly generated_at_utc: string;
  readonly description: string;
  readonly constants: {
    readonly elo_default_rating: ServiceConstantEntry<number>;
    readonly elo_home_field_advantage: ServiceConstantEntry<number>;
    readonly elo_scale_divisor: ServiceConstantEntry<number>;
    readonly elo_closeness_sigma: ServiceConstantEntry<number>;
    readonly season_progress_default: ServiceConstantEntry<number>;
    readonly rlm_sharp_money_divergence_pct: ServiceConstantEntry<{
      readonly home_min_pct: number;
      readonly away_max_pct: number;
      readonly abs_threshold_pct: number;
    }>;
    readonly nfl_expected_margin: ServiceConstantEntry<{
      readonly std_points: number;
      readonly logit_scale_factor: number;
    }>;
    readonly nfl_outdoor_wind_threshold_mph: ServiceConstantEntry<number>;
    readonly altitude_physics: ServiceConstantEntry<{
      readonly driver_logit_per_1000m: number;
      readonly high_altitude_min_m: number;
      readonly shock_diff_min_m: number;
      readonly default_stadium_elevation_m: number;
    }>;
    readonly dixon_coles_live_synthesis: ServiceConstantEntry<{
      readonly rho: number;
      readonly max_goals: number;
      readonly home_xg_multiplier: number;
      readonly away_xg_multiplier: number;
    }>;
    readonly smarkets_anchor_base_alpha: ServiceConstantEntry<number>;
    readonly feature_coverage_gate: ServiceConstantEntry<{
      readonly low_coverage_threshold: number;
    }>;
    readonly liga_mx_popular_clubs: ServiceConstantEntry<{
      readonly clubs: readonly PopularLigaMxClubEntry[];
      readonly non_popular_exclusions: readonly string[];
    }>;
  };
}

export interface ResolvedSegmentGate {
  readonly segmentKey: string;
  readonly segmentFound: boolean;
  readonly productionEnabled: boolean;
  readonly disabledReason: string | null;
  readonly blendWeightEffective: number;
  readonly bestDevigMethod: CoreDevigMethod;
  readonly modelPicksEnabledDev: boolean;
}

export const DEFAULT_PRODUCTION_SEGMENTS_V3_1 = Object.freeze(
  productionSegmentsV31Json as unknown as ProductionSegmentsArtifact,
);

export const DEFAULT_BLEND_WEIGHTS_V3_1 = Object.freeze(
  blendWeightsV31Json as unknown as BlendWeightsArtifact,
);

export const SERVICE_CONSTANTS_V3_2 = Object.freeze(
  serviceConstantsV32Json as unknown as ServiceConstantsArtifact,
);

const SOCCER_LEAGUE_TO_DIV: Readonly<Record<string, string>> = {
  "liga-mx": "MEX",
  ligamx: "MEX",
  "liga mx": "MEX",
  epl: "E0",
  laliga: "SP1",
  "la-liga": "SP1",
  bundesliga: "D1",
  "serie-a": "I1",
  "ligue-1": "F1",
};

const NON_BOOK_PLACEHOLDER_SOURCES: ReadonlySet<string> = new Set([
  "",
  "none",
  "null",
  "unknown",
  "synthetic",
  "sports_only",
  "action_network_splits",
]);

function canonicalizeGateLeagueCode(leagueOrDiv: string): string {
  const raw = String(leagueOrDiv ?? "").trim();
  if (!raw) return "UNKNOWN";
  const lower = raw.toLowerCase();
  const mappedSoccer = SOCCER_LEAGUE_TO_DIV[lower];
  if (mappedSoccer) return mappedSoccer;
  if (lower === "nfl") return "NFL";
  return raw.toUpperCase();
}

/**
 * Resuelve el estado de la compuerta de producción (`production_segments_v3_1.json`)
 * y de mezcla/de-vig (`blend_weights_v3_1.json`) para un par `league × market`.
 * Cualquier segmento ausente o con `production_enabled !== true` queda estrictamente apagado.
 */
export function resolveProductionSegmentGate(
  leagueOrDiv: string,
  market: string,
  productionSegments?: ProductionSegmentsArtifact | null,
  blendWeights?: BlendWeightsArtifact | null,
): ResolvedSegmentGate {
  const prodArtifact = productionSegments ?? DEFAULT_PRODUCTION_SEGMENTS_V3_1;
  const blendArtifact = blendWeights ?? DEFAULT_BLEND_WEIGHTS_V3_1;
  const canonLeague = canonicalizeGateLeagueCode(leagueOrDiv);
  const normMarket = normalizeArtifactMarketKey(market);
  const exactKey = `${canonLeague}::${normMarket}`;

  const prodEntry = prodArtifact.segments[exactKey];
  const blendResolved = resolveBlendSegment(blendArtifact, canonLeague, normMarket);

  const segmentFound = prodEntry !== undefined;
  const productionEnabled = prodEntry?.production_enabled === true;
  const disabledReason = productionEnabled
    ? null
    : (prodEntry?.disabled_reason ?? "segment_not_in_production_segments_v3_1");

  return {
    segmentKey: exactKey,
    segmentFound,
    productionEnabled,
    disabledReason,
    blendWeightEffective: blendResolved.entry.w_effective,
    bestDevigMethod: blendResolved.entry.best_devig_method,
    modelPicksEnabledDev: blendResolved.entry.model_picks_enabled,
  };
}

/**
 * Valida que una cuota de mercado sea real, fresca y auditable:
 *   1. Vector de cuotas decimales finito `> 1.0` de aridad exacta (`2` o `3`) con overround plausible.
 *   2. Origen real identificable (`book` explícito o casa real en `marketSources`).
 *   3. Timestamp ISO-8601 válido de captura (`tsCaptured`).
 * Si falta cualquiera de los tres requisitos, devuelve `null` (prohibido fabricar cuotas sintéticas).
 */
export function validateRealMarketQuote(params: {
  readonly odds?: readonly number[] | null;
  readonly expectedArity: 2 | 3;
  readonly oddsBook?: string | null;
  readonly marketSources?: readonly string[] | null;
  readonly tsCaptured?: string | null;
}): MarketQuoteSourceMeta | null {
  const { odds, expectedArity, oddsBook, marketSources, tsCaptured } = params;
  if (!Array.isArray(odds) || odds.length !== expectedArity) {
    return null;
  }
  if (!isPlausibleMarketOverround(odds)) {
    return null;
  }

  if (typeof tsCaptured !== "string" || tsCaptured.trim().length === 0) {
    return null;
  }
  const cleanTs = tsCaptured.trim();
  const parsedTs = Date.parse(cleanTs);
  if (!Number.isFinite(parsedTs)) {
    return null;
  }

  let resolvedBook = "";
  if (typeof oddsBook === "string" && oddsBook.trim().length > 0) {
    const candidate = oddsBook.trim();
    if (!NON_BOOK_PLACEHOLDER_SOURCES.has(candidate.toLowerCase())) {
      resolvedBook = candidate;
    }
  }
  if (!resolvedBook && Array.isArray(marketSources)) {
    for (const src of marketSources) {
      if (typeof src !== "string") continue;
      const trimmed = src.trim();
      if (trimmed.length > 0 && !NON_BOOK_PLACEHOLDER_SOURCES.has(trimmed.toLowerCase())) {
        resolvedBook = trimmed;
        break;
      }
    }
  }
  if (!resolvedBook) {
    return null;
  }

  let ov: number;
  try {
    ov = overround(odds);
  } catch {
    return null;
  }

  return Object.freeze({
    book: resolvedBook,
    tsCaptured: cleanTs,
    odds: Object.freeze([...odds]),
    overround: ov,
  });
}

/**
 * Calcula la cobertura de features reales no imputadas (`present / total`) sobre un vector de entrada.
 */
export function computeFeatureCoverage(
  features: readonly (number | null | undefined)[],
  expectedTotal?: number,
): FeatureCoverage {
  const total = expectedTotal !== undefined && expectedTotal > 0 ? expectedTotal : features.length;
  if (total <= 0) {
    return Object.freeze({ present: 0, total: 0, ratio: 0 });
  }
  const limit = Math.min(features.length, total);
  let present = 0;
  for (let i = 0; i < limit; i += 1) {
    const v = features[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      present += 1;
    }
  }
  return Object.freeze({
    present,
    total,
    ratio: present / total,
  });
}

function resolveCoverageQualityFlag(
  baseFlag: DataQualityFlag,
  coverage: FeatureCoverage,
  lowCoverageThreshold: number,
): DataQualityFlag {
  if (baseFlag !== "ok") {
    return baseFlag;
  }
  if (coverage.total > 0 && coverage.ratio < lowCoverageThreshold) {
    return "low_coverage";
  }
  return "ok";
}

/**
 * Evalúa el peso de arrastre público recreativo `[0, 1]` de clubes populares de Liga MX
 * leyendo el catálogo externalizado en `service_constants_v3_2.json`.
 */
export function getPopularLigaMxClubWeight(
  teamName: string | null | undefined,
  constants: ServiceConstantsArtifact = SERVICE_CONSTANTS_V3_2,
): number {
  if (!teamName || typeof teamName !== "string") return 0;
  const normalized = ` ${slugToken(teamName)} `;
  if (normalized.trim().length === 0) return 0;

  const catalog = constants.constants.liga_mx_popular_clubs.value;
  for (const excl of catalog.non_popular_exclusions) {
    const exclToken = ` ${slugToken(excl)} `;
    if (exclToken.trim().length > 0 && normalized.includes(exclToken)) {
      return 0;
    }
  }

  for (const club of catalog.clubs) {
    for (const rawTok of club.tokens) {
      const tok = ` ${slugToken(rawTok)} `;
      if (tok.trim().length > 0 && normalized.includes(tok)) {
        return club.public_bias_weight;
      }
    }
  }
  return 0;
}

/**
 * Deriva probabilidades 1X2 (`[pHome, pDraw, pAway]`) desde la única implementación
 * canónica de matriz de marcadores Dixon-Coles (`markets_2way.ts::buildDixonColesScoreMatrix`).
 */
export function deriveDixonColes1X2Probs(
  lamHome: number,
  lamAway: number,
  rho: number = DEFAULT_DC_RHO,
  maxGoals: number = DEFAULT_MAX_GOALS,
): readonly [number, number, number] {
  const matrix = buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals);
  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;
  for (let hg = 0; hg < matrix.length; hg += 1) {
    const row = matrix[hg]!;
    for (let ag = 0; ag < row.length; ag += 1) {
      const p = row[ag]!;
      if (hg > ag) pHome += p;
      else if (hg === ag) pDraw += p;
      else pAway += p;
    }
  }
  const tot = pHome + pDraw + pAway;
  if (!(tot > 0.0) || !Number.isFinite(tot)) {
    return [0.44, 0.26, 0.3];
  }
  return [pHome / tot, pDraw / tot, pAway / tot];
}

function buildSmarkets3WayAnchorProbs(
  smarketsHome: number,
  sportsProbs: { readonly pHome: number; readonly pDraw: number; readonly pAway: number },
  smarketsDraw?: number | null,
  smarketsAway?: number | null,
): readonly [number, number, number] {
  if (
    smarketsDraw !== undefined &&
    smarketsDraw !== null &&
    smarketsAway !== undefined &&
    smarketsAway !== null &&
    Number.isFinite(smarketsDraw) &&
    Number.isFinite(smarketsAway) &&
    smarketsDraw > 0 &&
    smarketsAway > 0
  ) {
    const e0 = clamp(smarketsHome, 0.01, 0.98);
    const s = e0 + smarketsDraw + smarketsAway;
    if (s > 0 && Number.isFinite(s)) {
      return [e0 / s, smarketsDraw / s, smarketsAway / s];
    }
  }

  const e0 = clamp(smarketsHome, 0.01, 0.98);
  const remExch = 1.0 - e0;
  const nonHomeModel = sportsProbs.pDraw + sportsProbs.pAway;
  if (nonHomeModel > 1e-12 && Number.isFinite(nonHomeModel)) {
    return [
      e0,
      remExch * (sportsProbs.pDraw / nonHomeModel),
      remExch * (sportsProbs.pAway / nonHomeModel),
    ];
  }
  return [e0, 0.5 * remExch, 0.5 * remExch];
}

// ===========================================================================
// 1. Peticiones individuales (`predictMatch` / `predictMatchBatch`)
// ===========================================================================

export interface FootballMatchRequest {
  sport: "football";
  row: SnapshotRow;
  model: ModelArtifact;
  /** Cuotas decimales 1X2 de referencia. Si faltan o son inválidas, se usa Motor A. */
  odds?: readonly number[] | null;
  /** Mejores cuotas disponibles (Line Shopping, ej. [MaxH, MaxD, MaxA]) para ejecución de valor. */
  bestOdds?: readonly number[] | null;
  /** Casa de origen de `odds` / `bestOdds` (obligatoria junto con `tsCaptured` para emitir valor en v3.2). */
  oddsBook?: string | null;
  /** Timestamp ISO-8601 de captura de la cuota real (obligatorio para emitir valor en v3.2). */
  tsCaptured?: string | null;
  /** Método de de-vig; por defecto `power` (acepta también `"adaptive"` en v3.0). */
  oddsMethod?: DevigMethod;
  /** Modo de inferencia: `market_only` (por defecto), `hybrid` (Motor C) o `motor_a_only`. */
  mode?: PredictionMode;
  /** Peso del mercado en modo `hybrid` (por defecto 0.85). */
  hybridAlpha?: number;
  /** Opciones para el cálculo de edge, filtro de incertidumbre y Kelly fraccional. */
  valueOptions?: ValueExecutionOptions;
  baseRates?: BaseRates;
  /** Prior prospectivo de disponibilidad (`Transfermarkt` + `RotoWire`) para inferencia en vivo v3.0. */
  availabilityContext?:
    | number
    | {
        homeTeamCtx?: TeamAvailabilityContext | null;
        awayTeamCtx?: TeamAvailabilityContext | null;
      }
    | null;
  /** Parámetros opcionales de corrección de sesgo recreativo MX (`Caliente.mx` / Liga MX). */
  ligaMxDebias?: LigaMxDebiasParams | null;
  /** Señales institucionales opcionales (`Smarkets` + `Action Network` Sharp/RLM) para `Singularity v3.0`. */
  singularitySharpInput?: Omit<SingularityTilt3WayInput, "modelProbs" | "marketProbs"> | null;
  /** Evaluación opcional del Gate Anti-RLM `PitchLab Geodesic v2.0`. */
  geodesicV2Options?: Partial<Omit<GeodesicV2GateInput, "probs" | "odds" | "marketProbs">> | null;
  /** Sobrescritura opcional de artefactos de compuerta para tests unitarios. */
  productionSegments?: ProductionSegmentsArtifact | null;
  blendWeights?: BlendWeightsArtifact | null;
}

export interface NFLMatchRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact & NFLLiveArtifactConfig;
  /** Contexto prospectivo opcional `Minkowski v3.0` (EPA SumerSports, lesiones QB/Ourlads, árbitros, clima). */
  liveContext?: NFLLiveContextInput | null;
  odds?: readonly number[] | null;
  oddsBook?: string | null;
  tsCaptured?: string | null;
  productionSegments?: ProductionSegmentsArtifact | null;
  blendWeights?: BlendWeightsArtifact | null;
}

export interface MultiSportMatchRequest {
  sport: MultiSportLeague;
  matchup: MultiSportMatchupInput;
  model: MultiSportModelArtifact;
  odds?: readonly number[] | null;
  oddsBook?: string | null;
  tsCaptured?: string | null;
  productionSegments?: ProductionSegmentsArtifact | null;
  blendWeights?: BlendWeightsArtifact | null;
}

export type MatchPredictionRequest =
  | FootballMatchRequest
  | NFLMatchRequest
  | MultiSportMatchRequest;

function isValidExecutionOdds(
  odds: readonly number[] | null | undefined,
): odds is readonly [number, number, number] {
  if (!Array.isArray(odds) || odds.length !== 3) {
    return false;
  }
  return (
    Number.isFinite(odds[0]) &&
    odds[0]! > 1 &&
    Number.isFinite(odds[1]) &&
    odds[1]! > 1 &&
    Number.isFinite(odds[2]) &&
    odds[2]! > 1
  );
}

function inferFootballDiv(row: SnapshotRow, model: ModelArtifact): string {
  if (typeof row.div === "string" && row.div.trim().length > 0) {
    return row.div.trim();
  }
  const hotIdx = row.div_onehot.findIndex((x) => x === 1);
  if (hotIdx >= 0 && hotIdx < model.div_levels.length) {
    return model.div_levels[hotIdx]!;
  }
  return "E0";
}

function computeMultiSportFeatureCoverage(
  sport: MultiSportLeague,
  matchup: MultiSportMatchupInput,
  model: MultiSportModelArtifact,
): FeatureCoverage {
  const cfg: SportEngineConfig = model.sports[sport];
  const resolveFound = (name: string | null | undefined): boolean => {
    const raw = String(name ?? "").trim();
    if (!raw) return false;
    if (raw in cfg.teams) return true;
    const up = raw.toUpperCase();
    if (up in cfg.teams) return true;
    const sl = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (sl in cfg.teams) return true;
    const mapped = cfg.aliases?.[sl];
    return Boolean(mapped && mapped in cfg.teams);
  };

  const featList =
    cfg.feature_order ??
    cfg.off_feature_order ??
    cfg.win_feature_order ??
    [];
  const perTeamCount = Math.max(1, featList.length);
  const total = perTeamCount * 2;
  const homePresent = resolveFound(matchup.homeTeam ?? matchup.home_team) ? perTeamCount : 0;
  const awayPresent = resolveFound(matchup.awayTeam ?? matchup.away_team) ? perTeamCount : 0;
  const present = homePresent + awayPresent;
  return Object.freeze({
    present,
    total,
    ratio: present / total,
  });
}

/**
 * Predice un partido en cualquiera de los 6 deportes (`football`, `nfl`, `nhl`, `mlb`, `nba`, `ncaaf`)
 * aplicando la compuerta de segmentos `v3.1` y la política de honestidad de mercado `v3.2`.
 */
export function predictMatch(request: MatchPredictionRequest): Prediction & {
  lineupAvailabilityDelta?: number;
  expectedTotalPoints?: number;
  expectedMargin?: number;
  geodesicV2?: GeodesicV2GateResult;
} {
  const lowCovThreshold =
    SERVICE_CONSTANTS_V3_2.constants.feature_coverage_gate.value.low_coverage_threshold;

  if (request.sport === "nfl") {
    const baseNfl = predictNFL(request.row, request.model);
    const featureCoverage = computeFeatureCoverage(
      request.row.features,
      request.model.n_features,
    );
    const dataQualityFlag = resolveCoverageQualityFlag(
      baseNfl.dataQualityFlag,
      featureCoverage,
      lowCovThreshold,
    );
    const gate = resolveProductionSegmentGate(
      "NFL",
      "moneyline",
      request.productionSegments,
      request.blendWeights,
    );
    const realQuote = validateRealMarketQuote({
      odds: request.odds,
      expectedArity: 2,
      oddsBook: request.oddsBook,
      tsCaptured: request.tsCaptured,
    });
    const valueStatus: ValueStatus =
      realQuote === null
        ? "no_market"
        : gate.productionEnabled
          ? "active"
          : "disabled_segment";

    if (!request.liveContext) {
      return {
        ...baseNfl,
        dataQualityFlag,
        featureCoverage,
        valueStatus,
        market: realQuote,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
      };
    }
    const liveNfl = applyMinkowskiV3LiveContext(baseNfl, request.liveContext, request.model);
    return {
      ...baseNfl,
      pHome: liveNfl.pHome,
      pDraw: liveNfl.pDraw,
      pAway: liveNfl.pAway,
      modelName: MINKOWSKI_MODEL_NAME,
      expectedTotalPoints: liveNfl.expectedTotalPoints,
      dataQualityFlag,
      featureCoverage,
      valueStatus,
      market: realQuote,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
    };
  }

  if (request.sport !== "football") {
    const ms = predictMultiSport(request.sport, request.matchup, request.model);
    const featureCoverage = computeMultiSportFeatureCoverage(
      request.sport,
      request.matchup,
      request.model,
    );
    const dataQualityFlag = resolveCoverageQualityFlag("ok", featureCoverage, lowCovThreshold);
    const gate = resolveProductionSegmentGate(
      request.sport,
      "moneyline",
      request.productionSegments,
      request.blendWeights,
    );
    const realQuote = validateRealMarketQuote({
      odds: request.odds,
      expectedArity: 2,
      oddsBook: request.oddsBook,
      tsCaptured: request.tsCaptured,
    });
    const valueStatus: ValueStatus =
      realQuote === null
        ? "no_market"
        : gate.productionEnabled
          ? "active"
          : "disabled_segment";

    const expectedTotal =
      ms.sport === "nhl"
        ? ms.expectedTotalGoals
        : ms.sport === "mlb"
          ? ms.expectedTotalRuns
          : ms.expectedTotalPoints;
    const expectedMargin =
      ms.sport === "nhl"
        ? ms.expectedGoalsHome - ms.expectedGoalsAway
        : ms.sport === "mlb"
          ? ms.expectedRunMargin
          : ms.expectedMargin;
    return {
      pHome: ms.pHome,
      pDraw: 0,
      pAway: ms.pAway,
      modelId: `multisport_${ms.sport}_v3`,
      modelName: ms.modelId,
      modelVersion: request.model.version,
      generatedAt: request.model.created_at,
      dataQualityFlag,
      sport: ms.sport,
      expectedTotalPoints: expectedTotal,
      expectedMargin,
      featureCoverage,
      valueStatus,
      market: realQuote,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
    };
  }

  const featureCoverage = computeFeatureCoverage(
    request.row.features,
    request.model.n_features_base,
  );
  const div = inferFootballDiv(request.row, request.model);
  const gate = resolveProductionSegmentGate(
    div,
    "1x2",
    request.productionSegments,
    request.blendWeights,
  );

  const method: DevigMethod = request.oddsMethod ?? "power";
  const odds = request.odds;
  const fallbackOptions = {
    mode: request.mode,
    hybridAlpha: request.hybridAlpha,
  };

  const hasAvailability =
    request.availabilityContext !== undefined && request.availabilityContext !== null;

  if (odds === undefined || odds === null) {
    if (hasAvailability) {
      try {
        const availPred = predictMotorAWithAvailability(
          request.row,
          request.model,
          request.availabilityContext!,
        );
        return {
          ...availPred,
          dataQualityFlag: resolveCoverageQualityFlag(
            availPred.dataQualityFlag,
            featureCoverage,
            lowCovThreshold,
          ),
          featureCoverage,
          valueStatus: "no_market",
          market: null,
          segmentKey: gate.segmentKey,
          segmentEnabled: gate.productionEnabled,
        };
      } catch (err) {
        if (!(err instanceof InvalidFeaturesError)) throw err;
      }
    }
    const basePred = predictWithFallback(
      request.row,
      request.model,
      null,
      request.baseRates,
      fallbackOptions,
    );
    return {
      ...basePred,
      dataQualityFlag: resolveCoverageQualityFlag(
        basePred.dataQualityFlag,
        featureCoverage,
        lowCovThreshold,
      ),
      featureCoverage,
      valueStatus: "no_market",
      market: null,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
    };
  }

  try {
    let marketProbs = devig(odds, method);
    if (request.ligaMxDebias) {
      const deb = debiaseRecreationalLigaMx(
        [marketProbs[0]!, marketProbs[1]!, marketProbs[2]!],
        request.ligaMxDebias,
      );
      marketProbs = [deb.pHome, deb.pDraw, deb.pAway];
    }

    const prediction = predictWithFallback(
      request.row,
      request.model,
      marketProbs,
      request.baseRates,
      fallbackOptions,
    );
    const pMkt: readonly [number, number, number] = [
      marketProbs[0]!,
      marketProbs[1]!,
      marketProbs[2]!,
    ];
    const execOdds: readonly [number, number, number] = isValidExecutionOdds(request.bestOdds)
      ? request.bestOdds
      : [odds[0]!, odds[1]!, odds[2]!];

    const realQuote = validateRealMarketQuote({
      odds: execOdds,
      expectedArity: 3,
      oddsBook: request.oddsBook ?? request.ligaMxDebias?.bookmaker ?? null,
      tsCaptured: request.tsCaptured,
    });
    const valueStatus: ValueStatus =
      realQuote === null
        ? "no_market"
        : gate.productionEnabled
          ? "active"
          : "disabled_segment";

    try {
      const motorARes = hasAvailability
        ? predictMotorAWithAvailability(request.row, request.model, request.availabilityContext!)
        : { ...predictMotorA(request.row, request.model), lineupAvailabilityDelta: undefined };

      const pMod: readonly [number, number, number] = [
        motorARes.pHome,
        motorARes.pDraw,
        motorARes.pAway,
      ];
      const alpha = request.hybridAlpha ?? DEFAULT_HYBRID_ALPHA;

      let pEval: readonly [number, number, number];
      let finalPred = prediction;

      if (request.singularitySharpInput) {
        const tilted = applySingularitySharpTilt3Way({
          modelProbs: pMod,
          marketProbs: pMkt,
          baseMarketAlpha: request.hybridAlpha,
          ...request.singularitySharpInput,
        });
        pEval = [tilted.pHome, tilted.pDraw, tilted.pAway];
        if (request.mode === "hybrid") {
          finalPred = {
            ...prediction,
            pHome: tilted.pHome,
            pDraw: tilted.pDraw,
            pAway: tilted.pAway,
            hybridAlpha: tilted.effectiveMarketAlpha,
          };
        }
      } else if (hasAvailability && request.mode === "hybrid") {
        pEval = blendLogLinear3(pMkt, pMod, alpha);
        finalPred = {
          ...prediction,
          pHome: pEval[0],
          pDraw: pEval[1],
          pAway: pEval[2],
        };
      } else if (hasAvailability && request.mode === "motor_a_only") {
        pEval = pMod;
        finalPred = {
          ...prediction,
          pHome: pMod[0],
          pDraw: pMod[1],
          pAway: pMod[2],
        };
      } else {
        pEval =
          request.mode === "hybrid"
            ? [prediction.pHome, prediction.pDraw, prediction.pAway]
            : request.mode === "motor_a_only"
              ? pMod
              : blendLogLinear3(pMkt, pMod, alpha);
      }

      const modelMarketDivergence: readonly [number, number, number] = [
        pMod[0] - pMkt[0],
        pMod[1] - pMkt[1],
        pMod[2] - pMkt[2],
      ];

      // Reglas Rectoras #3, #4 y #5: solo se emiten expectedEdge, kellyFraction y geodesicV2
      // cuando existe cuota real con origen + tsCaptured Y el segmento tiene production_enabled: true.
      if (valueStatus !== "active") {
        return {
          ...finalPred,
          dataQualityFlag: resolveCoverageQualityFlag(
            finalPred.dataQualityFlag,
            featureCoverage,
            lowCovThreshold,
          ),
          marketMethod: method,
          modelMarketDivergence,
          featureCoverage,
          valueStatus,
          market: realQuote,
          segmentKey: gate.segmentKey,
          segmentEnabled: gate.productionEnabled,
          ...(motorARes.lineupAvailabilityDelta !== undefined
            ? { lineupAvailabilityDelta: motorARes.lineupAvailabilityDelta }
            : {}),
        };
      }

      const valueMetrics = evaluateValueExecution(
        pEval,
        pMkt,
        pMod,
        execOdds,
        request.valueOptions,
      );
      const geodesicV2 = request.geodesicV2Options
        ? evaluateGeodesicV2ValueGate({
            probs: pEval,
            odds: execOdds,
            marketProbs: pMkt,
            ...request.geodesicV2Options,
          })
        : undefined;

      return {
        ...finalPred,
        dataQualityFlag: resolveCoverageQualityFlag(
          finalPred.dataQualityFlag,
          featureCoverage,
          lowCovThreshold,
        ),
        marketMethod: method,
        ...valueMetrics,
        featureCoverage,
        valueStatus: "active",
        market: realQuote,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
        ...(motorARes.lineupAvailabilityDelta !== undefined
          ? { lineupAvailabilityDelta: motorARes.lineupAvailabilityDelta }
          : {}),
        ...(geodesicV2 !== undefined ? { geodesicV2 } : {}),
      };
    } catch (innerError) {
      if (!(innerError instanceof InvalidFeaturesError)) throw innerError;
      return {
        ...prediction,
        marketMethod: method,
        featureCoverage,
        valueStatus,
        market: realQuote,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
      };
    }
  } catch (error) {
    if (!(error instanceof InvalidOddsError)) throw error;
    const fallback = predictWithFallback(
      request.row,
      request.model,
      null,
      request.baseRates,
      fallbackOptions,
    );
    return {
      ...fallback,
      dataQualityFlag: "fallback_motor_a",
      featureCoverage,
      valueStatus: "no_market",
      market: null,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
    };
  }
}

/** Predice un lote. Determinista y sin estado compartido. */
export function predictMatchBatch(requests: readonly MatchPredictionRequest[]): Prediction[] {
  return requests.map((request) => predictMatch(request));
}

// ===========================================================================
// 2. Puente `< 1 ms` sobre Feature Store v2.0 (`242` Matchups / `11` Ligas)
// ===========================================================================

export interface TeamMasterFeatureRecord {
  team_id: string;
  team_name: string;
  league: string;
  sport: string;
  total_market_value_eur?: number | null;
  avg_player_value_eur?: number | null;
  log_squad_value?: number | null;
  value_ratio_vs_league_median?: number | null;
  roster_players_count?: number | null;
  top_player_market_value_eur?: number | null;
  injured_players_count?: number | null;
  suspended_players_count?: number | null;
  missing_market_value_eur?: number | null;
  missing_market_value_ratio?: number | null;
  rotowire_injured_out_count?: number | null;
  probable_starters_count?: number | null;
  xg_for?: number | null;
  xg_against?: number | null;
  npxg_for?: number | null;
  npxg_against?: number | null;
  xpts?: number | null;
  xg_overperformance?: number | null;
  xpts_overperformance?: number | null;
  ppda_avg?: number | null;
  deep_completions?: number | null;
  statiskicks_xp?: number | null;
  club_elo_rating?: number | null;
  nfl_off_epa_per_play?: number | null;
  nfl_def_epa_per_play?: number | null;
  nfl_off_success_pct?: number | null;
  nfl_def_success_pct?: number | null;
  nhl_xg_pct?: number | null;
  nhl_corsi_for_pct?: number | null;
  nhl_fenwick_for_pct?: number | null;
  nhl_high_danger_xg_for?: number | null;
  nhl_pythag_215?: number | null;
  mlb_ops_plus?: number | null;
  mlb_woba_est?: number | null;
  mlb_fip?: number | null;
  mlb_era?: number | null;
  mlb_whip?: number | null;
  mlb_pythag_183?: number | null;
  nba_ortg?: number | null;
  nba_drtg?: number | null;
  nba_net_rtg?: number | null;
  nba_pace?: number | null;
  nba_srs?: number | null;
  nba_efg_pct?: number | null;
  nba_opp_efg_pct?: number | null;
  nba_pythag_1391?: number | null;
  ncaaf_srs?: number | null;
  ncaaf_sos?: number | null;
  ncaaf_espn_fpi?: number | null;
  ncaaf_off_ypp?: number | null;
  ncaaf_def_ypp?: number | null;
  ncaaf_pythag_237?: number | null;
  stadium_name?: string | null;
  stadium_elevation_m?: number | null;
  surface_pressure_hpa?: number | null;
  high_altitude_flag?: boolean | null;
  roof_type?: string | null;
  max_wind_speed_mph_7d?: number | null;
  max_wind_gusts_mph_7d?: number | null;
  total_precipitation_mm_7d?: number | null;
  as_of_utc?: string | null;
}

export interface LiveMatchupEdgeRecord {
  matchup_id: string;
  sport: string;
  league: string;
  kickoff_utc?: string | null;
  home_team: string;
  away_team: string;
  market_sources?: readonly string[] | null;
  p_home_novig?: number | null;
  p_draw_novig?: number | null;
  p_away_novig?: number | null;
  market_overround?: number | null;
  smarkets_exchange_mid_prob_home?: number | null;
  smarkets_exchange_mid_prob_draw?: number | null;
  smarkets_exchange_mid_prob_away?: number | null;
  sharp_money_divergence?: number | null;
  reverse_line_movement_side?: RlmSignalSide;
  odds?: readonly number[] | null;
  odds_book?: string | null;
  ts_captured?: string | null;
  value_ratio_diff?: number | null;
  missing_value_ratio_diff?: number | null;
  xg_diff?: number | null;
  epa_diff?: number | null;
  net_rtg_diff?: number | null;
  fip_ops_diff?: number | null;
  fpi_srs_diff?: number | null;
  altitude_diff_m?: number | null;
  home_stadium_name?: string | null;
  home_stadium_elevation_m?: number | null;
  home_surface_pressure_hpa?: number | null;
  home_high_altitude_flag?: boolean | null;
  home_max_wind_speed_mph_7d?: number | null;
  as_of_utc?: string | null;
}

export interface LiveInferenceArtifacts {
  footballModel: ModelArtifact;
  nflModel: NFLModelArtifact & NFLLiveArtifactConfig;
  multisportModel: MultiSportModelArtifact;
  precomputedFootballRows?: Readonly<Record<string, SnapshotRow>>;
  precomputedNflRows?: Readonly<Record<string, NFLSnapshotRow>>;
  productionSegments?: ProductionSegmentsArtifact | null;
  blendWeights?: BlendWeightsArtifact | null;
  serviceConstants?: ServiceConstantsArtifact | null;
}

export interface TeamMasterIndex {
  byLeagueSlug: Map<string, TeamMasterFeatureRecord>;
  bySportSlug: Map<string, TeamMasterFeatureRecord>;
  nflSlugToAbbr: Map<string, string>;
}

export interface LiveKeyDriver {
  factor: string;
  label: string;
  impactLogit: number;
}

export interface LiveMatchupPrediction {
  matchupId: string;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketType: "2way" | "3way";
  sportsModelName: string;
  activeModelName: string;
  activeEngine: "singularity_v3" | "smarkets_anchor_v3" | "sports_only";
  sportsProbs: {
    pHome: number;
    pDraw: number;
    pAway: number;
  };
  marketProbsAdaptive: {
    pHome: number;
    pDraw: number;
    pAway: number;
    overround: number;
    ligaMxBiasAdjusted: boolean;
  } | null;
  finalProbs: {
    pHome: number;
    pDraw: number;
    pAway: number;
  };
  expectedTotal: number | null;
  expectedMargin: number | null;
  lineupAvailabilityDelta: number | null;
  sharpLogitTilt: number;
  effectiveMarketAlpha: number | null;
  geodesicV2: GeodesicV2GateResult | null;
  drivers: readonly LiveKeyDriver[];
  /** Campos aditivos v3.2: cobertura de imputación, compuerta de segmento y honestidad de cuota. */
  dataQualityFlag: DataQualityFlag;
  featureCoverage: FeatureCoverage;
  valueStatus: ValueStatus;
  market: MarketQuoteSourceMeta | null;
  segmentKey: string;
  segmentEnabled: boolean;
  blendWeightEffective: number;
  blendDevigMethod: CoreDevigMethod;
}

export interface LiveEdgeMatrixBatchResult {
  count: number;
  countsByLeague: Record<string, number>;
  executableBetsCount: number;
  vetoedByRlmCount: number;
  institutionallyConfirmedCount: number;
  predictions: LiveMatchupPrediction[];
}

function slugToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function finiteOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined || typeof v === "boolean") return fallback;
  const f = Number(v);
  return Number.isFinite(f) ? f : fallback;
}

function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  const f = Number(v);
  return Number.isFinite(f) ? f : null;
}

function barometricPressureHpa(elevM: number): number {
  const h = Math.max(0.0, elevM);
  return 1013.25 * Math.pow(1.0 - 2.25577e-5 * h, 5.25588);
}

export function buildTeamMasterIndex(
  teamMaster:
    | readonly TeamMasterFeatureRecord[]
    | { readonly records: readonly TeamMasterFeatureRecord[] },
  nflModel?: (NFLModelArtifact & NFLLiveArtifactConfig) | null,
): TeamMasterIndex {
  const rows = Array.isArray(teamMaster)
    ? teamMaster
    : (teamMaster as { readonly records: readonly TeamMasterFeatureRecord[] }).records;
  const byLeagueSlug = new Map<string, TeamMasterFeatureRecord>();
  const bySportSlug = new Map<string, TeamMasterFeatureRecord>();

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    const lg = String(r.league ?? "").trim().toLowerCase();
    const sp = String(r.sport ?? "").trim().toLowerCase();
    const sName = slugToken(r.team_name);
    const sId = slugToken(r.team_id);
    if (sName) {
      byLeagueSlug.set(`${lg}::${sName}`, r);
      bySportSlug.set(`${sp}::${sName}`, r);
    }
    if (sId) {
      byLeagueSlug.set(`${lg}::${sId}`, r);
      bySportSlug.set(`${sp}::${sId}`, r);
    }
  }

  const nflSlugToAbbr = new Map<string, string>();
  const tlc = (
    nflModel as {
      live_v3?: { team_live_context?: Record<string, { team_name?: string }> };
    } | null
  )?.live_v3?.team_live_context;
  if (tlc) {
    for (const [abbr, info] of Object.entries(tlc)) {
      nflSlugToAbbr.set(slugToken(abbr), abbr);
      if (info?.team_name) {
        nflSlugToAbbr.set(slugToken(info.team_name), abbr);
      }
    }
  }

  return { byLeagueSlug, bySportSlug, nflSlugToAbbr };
}

function lookupTeamMaster(
  index: TeamMasterIndex,
  sportRaw: string,
  leagueRaw: string,
  teamName: string,
): TeamMasterFeatureRecord | null {
  const s = slugToken(teamName);
  const lg = String(leagueRaw ?? "").trim().toLowerCase();
  const sp = String(sportRaw ?? "").trim().toLowerCase();
  return index.byLeagueSlug.get(`${lg}::${s}`) ?? index.bySportSlug.get(`${sp}::${s}`) ?? null;
}

/**
 * Construye determinísticamente una fila `SnapshotRow` (`113` base + `23` divisiones) para
 * `PitchLab Tachyon v3.0` directamente desde `team_master_features.json` + `live_matchups_edge_matrix.json`,
 * delegando Dixon-Coles en `markets_2way.ts::buildDixonColesScoreMatrix` y leyendo constantes desde
 * `service_constants_v3_2.json`.
 */
export function synthesizeFootballSnapshotRowFromMaster(
  div: string,
  homeMaster: TeamMasterFeatureRecord | null,
  awayMaster: TeamMasterFeatureRecord | null,
  matchup: LiveMatchupEdgeRecord,
  model: ModelArtifact,
  constants: ServiceConstantsArtifact = SERVICE_CONSTANTS_V3_2,
): { row: SnapshotRow; dcExpTotal: number; dcExpDiff: number } {
  const c = constants.constants;
  const eloDefault = c.elo_default_rating.value;
  const eloHfa = c.elo_home_field_advantage.value;
  const eloScale = c.elo_scale_divisor.value;
  const eloClosenessSigma = c.elo_closeness_sigma.value;
  const seasonProgress = c.season_progress_default.value;
  const dcCfg = c.dixon_coles_live_synthesis.value;
  const altCfg = c.altitude_physics.value;

  const ch = finiteOr(homeMaster?.club_elo_rating, eloDefault);
  const ca = finiteOr(awayMaster?.club_elo_rating, eloDefault);
  const eloDiffNoHfa = ch - ca;
  const eloDiff = ch + eloHfa - ca;
  const eloProbHomeNodraw = 1.0 / (1.0 + Math.pow(10.0, -eloDiff / eloScale));
  const eloLogitH = logit(eloProbHomeNodraw);
  const eloCloseness = Math.exp(-Math.pow(eloDiff / eloClosenessSigma, 2));
  const eloDiffXProgress = eloDiff * seasonProgress;

  const estGames = (m: TeamMasterFeatureRecord | null): number =>
    clamp(Math.round(finiteOr(m?.xpts, 20.0) / 1.38), 8.0, 38.0);

  const gh = estGames(homeMaster);
  const ga = estGames(awayMaster);

  const hXgfPg = finiteOr(homeMaster?.xg_for, 1.35 * gh) / gh;
  const hXgaPg = finiteOr(homeMaster?.xg_against, 1.25 * gh) / gh;
  const aXgfPg = finiteOr(awayMaster?.xg_for, 1.3 * ga) / ga;
  const aXgaPg = finiteOr(awayMaster?.xg_against, 1.3 * ga) / ga;

  const hXgdPg = hXgfPg - hXgaPg;
  const aXgdPg = aXgfPg - aXgaPg;
  const xgdDiff = hXgdPg - aXgdPg;

  const hXptsPg = finiteOr(homeMaster?.xpts, 1.38 * gh) / gh;
  const aXptsPg = finiteOr(awayMaster?.xpts, 1.38 * ga) / ga;
  const xptsDiff = hXptsPg - aXptsPg;

  const hXgOverPg = finiteOr(homeMaster?.xg_overperformance, 0.0) / gh;
  const aXgOverPg = finiteOr(awayMaster?.xg_overperformance, 0.0) / ga;
  const xgOverDiff = hXgOverPg - aXgOverPg;

  const hXptsOverPg = finiteOr(homeMaster?.xpts_overperformance, 0.0) / gh;
  const aXptsOverPg = finiteOr(awayMaster?.xpts_overperformance, 0.0) / ga;
  const ptsMinusXptsDiff = hXptsOverPg - aXptsOverPg;

  const xgEloDiff = eloDiffNoHfa + 120.0 * xgdDiff;
  const xgEloVsEloDiff = xgEloDiff - eloDiffNoHfa;

  const hPpda = finiteOrNull(homeMaster?.ppda_avg);
  const aPpda = finiteOrNull(awayMaster?.ppda_avg);
  const ppdaDiffR10 = hPpda !== null && aPpda !== null ? hPpda - aPpda : 0.0;

  const hDeep = finiteOrNull(homeMaster?.deep_completions);
  const aDeep = finiteOrNull(awayMaster?.deep_completions);
  const deepDiffR10 = hDeep !== null && aDeep !== null ? hDeep / gh - aDeep / ga : 0.0;

  const dcLamHome = clamp(
    dcCfg.home_xg_multiplier * Math.sqrt(Math.max(0.25, hXgfPg * aXgaPg)),
    0.35,
    3.8,
  );
  const dcLamAway = clamp(
    dcCfg.away_xg_multiplier * Math.sqrt(Math.max(0.25, aXgfPg * hXgaPg)),
    0.25,
    3.5,
  );
  const dcExpTotal = dcLamHome + dcLamAway;
  const dcExpDiff = dcLamHome - dcLamAway;
  const [dcProbH, dcProbD, dcProbA] = deriveDixonColes1X2Probs(
    dcLamHome,
    dcLamAway,
    dcCfg.rho,
    dcCfg.max_goals,
  );
  const dcLogitH = logit(dcProbH);
  const dcLogitD = logit(dcProbD);
  const dcLogitA = logit(dcProbA);
  const lowScoringTightMatch = eloCloseness / Math.max(1.5, dcExpTotal);

  const hElev = finiteOr(
    matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m,
    altCfg.default_stadium_elevation_m,
  );
  const aElev = finiteOr(
    awayMaster?.stadium_elevation_m,
    hElev - finiteOr(matchup.altitude_diff_m, 0.0),
  );
  const altDiffM = hElev - aElev;
  const altShockFlag =
    hElev >= altCfg.high_altitude_min_m && altDiffM >= altCfg.shock_diff_min_m ? 1.0 : 0.0;
  const hPress = finiteOr(
    matchup.home_surface_pressure_hpa ?? homeMaster?.surface_pressure_hpa,
    barometricPressureHpa(hElev),
  );
  const aPress = finiteOr(awayMaster?.surface_pressure_hpa, barometricPressureHpa(aElev));
  const surfPressDiff = hPress - aPress;

  const hasRealXg =
    finiteOrNull(homeMaster?.xg_for) !== null && finiteOrNull(awayMaster?.xg_for) !== null
      ? 1.0
      : 0.0;

  const populated: Record<string, number> = {
    elo_diff: eloDiff,
    elo_diff_no_hfa: eloDiffNoHfa,
    elo_prob_home_nodraw: eloProbHomeNodraw,
    elo_diff_x_progress: eloDiffXProgress,
    season_progress: seasonProgress,
    clubelo_diff: eloDiffNoHfa,
    att_strength_home: Math.log(Math.max(0.25, hXgfPg / 1.35)),
    def_strength_home: Math.log(Math.max(0.25, hXgaPg / 1.35)),
    att_strength_away: Math.log(Math.max(0.25, aXgfPg / 1.35)),
    def_strength_away: Math.log(Math.max(0.25, aXgaPg / 1.35)),
    dc_lam_home: dcLamHome,
    dc_lam_away: dcLamAway,
    dc_exp_total: dcExpTotal,
    dc_exp_diff: dcExpDiff,
    dc_prob_h: dcProbH,
    dc_prob_d: dcProbD,
    dc_prob_a: dcProbA,
    xgd_diff_r5: xgdDiff,
    xgd_diff_r10: xgdDiff,
    xgd_ewm5_diff: xgdDiff,
    xg_overperf_diff_r5: xgOverDiff,
    clinical_overperf_diff_r10: xgOverDiff,
    elo_closeness: eloCloseness,
    low_scoring_tight_match: lowScoringTightMatch,
    dc_logit_h: dcLogitH,
    dc_logit_d: dcLogitD,
    dc_logit_a: dcLogitA,
    elo_logit_h: eloLogitH,
    has_real_xg_history: hasRealXg,
    xg_elo_diff: xgEloDiff,
    xg_elo_vs_elo_diff: xgEloVsEloDiff,
    pts_minus_xpts_diff_r10: ptsMinusXptsDiff,
    xpts_diff_r10: xptsDiff,
    ppda_diff_r10: ppdaDiffR10,
    deep_completions_diff_r10: deepDiffR10,
    altitude_diff_m: altDiffM,
    altitude_shock_flag: altShockFlag,
    surface_pressure_diff: surfPressDiff,
  };

  const baseFeatures = new Array<number | null>(model.n_features_base);
  for (let i = 0; i < model.n_features_base; i += 1) {
    const fname = model.features[i]!;
    const v = populated[fname];
    baseFeatures[i] = v !== undefined && Number.isFinite(v) ? v : null;
  }

  const divOnehot = model.div_levels.map((d) => (d === div ? 1 : 0));
  return {
    row: {
      div,
      features: baseFeatures,
      div_onehot: divOnehot,
    },
    dcExpTotal,
    dcExpDiff,
  };
}

/**
 * Construye determinísticamente la fila base `NFLSnapshotRow` (`29` features) + `NFLLiveContextInput`
 * para `PitchLab Minkowski v3.0` sin doble conteo de EPA.
 */
export function synthesizeNflSnapshotRowFromMaster(
  homeAbbr: string,
  awayAbbr: string,
  homeMaster: TeamMasterFeatureRecord | null,
  awayMaster: TeamMasterFeatureRecord | null,
  matchup: LiveMatchupEdgeRecord,
  model: NFLModelArtifact & NFLLiveArtifactConfig,
  constants: ServiceConstantsArtifact = SERVICE_CONSTANTS_V3_2,
): { row: NFLSnapshotRow; liveContext: NFLLiveContextInput } {
  const c = constants.constants;
  const windThresholdMph = c.nfl_outdoor_wind_threshold_mph.value;
  const defaultElevM = c.altitude_physics.value.default_stadium_elevation_m;

  const tlcMap = (
    model as {
      live_v3?: {
        team_live_context?: Record<string, Record<string, unknown>>;
        stadium_physics?: Record<
          string,
          { roof_type?: string; is_dome?: boolean; stadium_elevation_m?: number }
        >;
      };
    }
  ).live_v3;
  const hTlc = homeAbbr ? tlcMap?.team_live_context?.[homeAbbr] : undefined;
  const aTlc = awayAbbr ? tlcMap?.team_live_context?.[awayAbbr] : undefined;
  const hStad = homeAbbr ? tlcMap?.stadium_physics?.[homeAbbr] : undefined;
  const aStad = awayAbbr ? tlcMap?.stadium_physics?.[awayAbbr] : undefined;

  const roofRaw = String(homeMaster?.roof_type ?? hStad?.roof_type ?? "open")
    .trim()
    .toLowerCase();
  const isIndoor =
    roofRaw === "dome" || roofRaw === "closed" || roofRaw === "indoor" || roofRaw === "retractable"
      ? 1.0
      : 0.0;

  const windMph = finiteOr(
    matchup.home_max_wind_speed_mph_7d ??
      homeMaster?.max_wind_speed_mph_7d ??
      hTlc?.max_wind_speed_mph_7d,
    0.0,
  );
  const precipMm = finiteOr(
    homeMaster?.total_precipitation_mm_7d ?? hTlc?.total_precipitation_mm_7d,
    0.0,
  );
  const windOutdoor = isIndoor > 0.5 ? 0.0 : Math.max(0.0, windMph - windThresholdMph);

  const populatedNfl: Record<string, number> = {
    is_indoor: isIndoor,
    neutral_site: 0.0,
    wind_outdoor: windOutdoor,
    cold_outdoor: 0.0,
  };

  const feats = new Array<number | null>(model.n_features);
  for (let i = 0; i < model.n_features; i += 1) {
    const fname = model.features[i]!;
    const v = populatedNfl[fname];
    feats[i] = v !== undefined && Number.isFinite(v) ? v : null;
  }

  const hElev = finiteOr(
    matchup.home_stadium_elevation_m ??
      homeMaster?.stadium_elevation_m ??
      hStad?.stadium_elevation_m,
    defaultElevM,
  );
  const aElev = finiteOr(
    awayMaster?.stadium_elevation_m ?? aStad?.stadium_elevation_m,
    hElev - finiteOr(matchup.altitude_diff_m, 0.0),
  );

  const liveContext: NFLLiveContextInput = {
    homeTeam: homeAbbr,
    awayTeam: awayAbbr,
    neutralSite: false,
    roofType: roofRaw,
    isDome: isIndoor > 0.5,
    stadiumElevationM: hElev,
    awayElevationM: aElev,
    windMph,
    precipitationMm: precipMm,
    homeOffEpaPerPlay: finiteOrNull(
      homeMaster?.nfl_off_epa_per_play ?? hTlc?.off_epa_per_play,
    ),
    homeDefEpaPerPlay: finiteOrNull(
      homeMaster?.nfl_def_epa_per_play ?? hTlc?.def_epa_per_play,
    ),
    awayOffEpaPerPlay: finiteOrNull(
      awayMaster?.nfl_off_epa_per_play ?? aTlc?.off_epa_per_play,
    ),
    awayDefEpaPerPlay: finiteOrNull(
      awayMaster?.nfl_def_epa_per_play ?? aTlc?.def_epa_per_play,
    ),
    homeOffSuccessPct: finiteOrNull(
      homeMaster?.nfl_off_success_pct ?? hTlc?.off_success_pct,
    ),
    homeDefSuccessPct: finiteOrNull(
      homeMaster?.nfl_def_success_pct ?? hTlc?.def_success_pct,
    ),
    awayOffSuccessPct: finiteOrNull(
      awayMaster?.nfl_off_success_pct ?? aTlc?.off_success_pct,
    ),
    awayDefSuccessPct: finiteOrNull(
      awayMaster?.nfl_def_success_pct ?? aTlc?.def_success_pct,
    ),
    homeQbInjured: finiteOr(hTlc?.qb_injured, 0.0),
    awayQbInjured: finiteOr(aTlc?.qb_injured, 0.0),
    homeInjuriesOutIr: finiteOr(
      hTlc?.injuries_out_ir ?? homeMaster?.injured_players_count,
      0.0,
    ),
    awayInjuriesOutIr: finiteOr(
      aTlc?.injuries_out_ir ?? awayMaster?.injured_players_count,
      0.0,
    ),
    homeInjuriesQuestionable: finiteOr(hTlc?.injuries_questionable, 0.0),
    awayInjuriesQuestionable: finiteOr(aTlc?.injuries_questionable, 0.0),
    homePenaltiesPerGame: finiteOrNull(hTlc?.penalties_per_game),
    awayPenaltiesPerGame: finiteOrNull(aTlc?.penalties_per_game),
  };

  return {
    row: {
      home_team: homeAbbr || matchup.home_team,
      away_team: awayAbbr || matchup.away_team,
      features: feats,
    },
    liveContext,
  };
}

function mapMultiSportDrivers(drivers: readonly MultiSportDriver[]): LiveKeyDriver[] {
  return drivers.map((d) => ({
    factor: d.factor,
    label: d.label,
    impactLogit: d.impactLogit,
  }));
}

function resolveRlmSideFromMatchup(
  matchup: LiveMatchupEdgeRecord,
  constants: ServiceConstantsArtifact,
): RlmSignalSide {
  if (
    matchup.reverse_line_movement_side === "home" ||
    matchup.reverse_line_movement_side === "away" ||
    matchup.reverse_line_movement_side === "none"
  ) {
    return matchup.reverse_line_movement_side;
  }
  const sharp = finiteOrNull(matchup.sharp_money_divergence);
  if (sharp === null) return "none";
  const rlmCfg = constants.constants.rlm_sharp_money_divergence_pct.value;
  if (sharp >= rlmCfg.home_min_pct) return "home";
  if (sharp <= rlmCfg.away_max_pct) return "away";
  return "none";
}

/**
 * Inferencia unificada `< 1 ms` de un enfrentamiento de `live_matchups_edge_matrix.json`
 * respetando la compuerta de segmentos `production_segments_v3_1.json` y prohibiendo cuotas sintéticas.
 */
export function predictLiveMatchup(
  matchup: LiveMatchupEdgeRecord,
  teamIndex: TeamMasterIndex,
  artifacts: LiveInferenceArtifacts,
): LiveMatchupPrediction {
  const constants = artifacts.serviceConstants ?? SERVICE_CONSTANTS_V3_2;
  const c = constants.constants;
  const lowCovThreshold = c.feature_coverage_gate.value.low_coverage_threshold;

  const league = String(matchup.league ?? "").trim().toLowerCase();
  const sportRaw = String(matchup.sport ?? "").trim().toLowerCase();

  const homeMaster = lookupTeamMaster(teamIndex, sportRaw, league, matchup.home_team);
  const awayMaster = lookupTeamMaster(teamIndex, sportRaw, league, matchup.away_team);

  const sharpDiv = finiteOrNull(matchup.sharp_money_divergence);
  const smarketsHome = finiteOrNull(matchup.smarkets_exchange_mid_prob_home);
  const smarketsDraw = finiteOrNull(matchup.smarkets_exchange_mid_prob_draw);
  const smarketsAway = finiteOrNull(matchup.smarkets_exchange_mid_prob_away);
  const rawOverround = finiteOr(matchup.market_overround, 0.045);
  const rlmSide = resolveRlmSideFromMatchup(matchup, constants);
  const primaryBook =
    matchup.odds_book ??
    (Array.isArray(matchup.market_sources) && matchup.market_sources.length > 0
      ? String(matchup.market_sources[0])
      : "");

  // -------------------------------------------------------------------------
  // Caso 1: Fútbol / Soccer (3-way: Liga MX + Top-5 Europa)
  // -------------------------------------------------------------------------
  if (sportRaw === "soccer" || sportRaw === "football_soccer" || league in SOCCER_LEAGUE_TO_DIV) {
    const div = SOCCER_LEAGUE_TO_DIV[league] ?? "E0";
    const gate = resolveProductionSegmentGate(
      div,
      "1x2",
      artifacts.productionSegments,
      artifacts.blendWeights,
    );
    const realQuote = validateRealMarketQuote({
      odds: matchup.odds,
      expectedArity: 3,
      oddsBook: matchup.odds_book,
      marketSources: matchup.market_sources,
      tsCaptured: matchup.ts_captured,
    });
    const valueStatus: ValueStatus =
      realQuote === null
        ? "no_market"
        : gate.productionEnabled
          ? "active"
          : "disabled_segment";

    const preRow = artifacts.precomputedFootballRows?.[matchup.matchup_id];
    const synth = synthesizeFootballSnapshotRowFromMaster(
      div,
      homeMaster,
      awayMaster,
      matchup,
      artifacts.footballModel,
      constants,
    );
    const activeRow = preRow ?? synth.row;
    const featureCoverage = computeFeatureCoverage(
      activeRow.features,
      artifacts.footballModel.n_features_base,
    );
    const dataQualityFlag = resolveCoverageQualityFlag("ok", featureCoverage, lowCovThreshold);

    const availDetail = computeLineupAvailabilityDelta(
      homeMaster,
      awayMaster,
      artifacts.footballModel.prospective_availability_prior,
    );
    const tachyon = predictMotorAWithAvailability(
      activeRow,
      artifacts.footballModel,
      availDetail.lineup_availability_delta,
    );
    const sportsProbs = {
      pHome: tachyon.pHome,
      pDraw: tachyon.pDraw,
      pAway: tachyon.pAway,
    };

    const eloDefault = c.elo_default_rating.value;
    const eloHfa = c.elo_home_field_advantage.value;
    const eloScale = c.elo_scale_divisor.value;
    const altCfg = c.altitude_physics.value;

    const drivers: LiveKeyDriver[] = [
      {
        factor: "clubelo_and_xg_elo",
        label: "ClubElo + Real xG-Elo Structural Differential",
        impactLogit:
          (finiteOr(homeMaster?.club_elo_rating, eloDefault) +
            eloHfa -
            finiteOr(awayMaster?.club_elo_rating, eloDefault)) /
          eloScale,
      },
      {
        factor: "lineup_availability_delta",
        label: "Transfermarkt + RotoWire Prospective Availability Prior",
        impactLogit: availDetail.lineup_availability_delta,
      },
      {
        factor: "stadium_altitude_physics",
        label: "Open-Meteo Stadium Elevation & Barometric Pressure",
        impactLogit:
          finiteOr(
            matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m,
            altCfg.default_stadium_elevation_m,
          ) >= altCfg.high_altitude_min_m
            ? altCfg.driver_logit_per_1000m *
              Math.max(0, finiteOr(matchup.altitude_diff_m, 0) / 1000)
            : 0,
      },
    ];

    const pHNovig = finiteOrNull(matchup.p_home_novig);
    const pDNovig = finiteOrNull(matchup.p_draw_novig);
    const pANovig = finiteOrNull(matchup.p_away_novig);
    const hasNovigTriplet =
      pHNovig !== null &&
      pDNovig !== null &&
      pANovig !== null &&
      pHNovig > 0 &&
      pDNovig > 0 &&
      pANovig > 0;

    if (realQuote !== null || hasNovigTriplet) {
      let mktProbs: readonly [number, number, number];
      let effectiveOverround: number;

      if (realQuote !== null) {
        const adaptive = devigAdaptive1X2([
          realQuote.odds[0]!,
          realQuote.odds[1]!,
          realQuote.odds[2]!,
        ]);
        mktProbs = [adaptive.pHome, adaptive.pDraw, adaptive.pAway];
        effectiveOverround = adaptive.overround;
      } else {
        const sumNovig = pHNovig! + pDNovig! + pANovig!;
        mktProbs = [pHNovig! / sumNovig, pDNovig! / sumNovig, pANovig! / sumNovig];
        effectiveOverround = rawOverround;
      }

      let mxBiasAdjusted = false;
      if (league === "liga-mx") {
        const homePopW = getPopularLigaMxClubWeight(matchup.home_team, constants);
        const awayPopW = getPopularLigaMxClubWeight(matchup.away_team, constants);
        if (Math.abs(homePopW - awayPopW) > 1e-9) {
          const deb = debiaseRecreationalLigaMx(mktProbs, {
            homeTeam: matchup.home_team,
            awayTeam: matchup.away_team,
            overround: effectiveOverround,
            bookmaker: primaryBook,
          });
          mktProbs = [deb.pHome, deb.pDraw, deb.pAway];
          mxBiasAdjusted = deb.biasDetected;
        }
      }

      const sing = applySingularitySharpTilt3Way({
        modelProbs: [sportsProbs.pHome, sportsProbs.pDraw, sportsProbs.pAway],
        marketProbs: mktProbs,
        marketOverround: effectiveOverround,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });

      const geodesic =
        valueStatus === "active" && realQuote !== null
          ? evaluateGeodesicV2ValueGate({
              probs: [sing.pHome, sing.pDraw, sing.pAway],
              odds: realQuote.odds,
              marketProbs: mktProbs,
              reverseLineMovementSide: rlmSide,
              sharpMoneyDivergenceHomePct: sharpDiv,
            })
          : null;

      return {
        matchupId: matchup.matchup_id,
        sport: "football",
        league,
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "3way",
        sportsModelName: TACHYON_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "singularity_v3",
        sportsProbs,
        marketProbsAdaptive: {
          pHome: mktProbs[0],
          pDraw: mktProbs[1],
          pAway: mktProbs[2],
          overround: effectiveOverround,
          ligaMxBiasAdjusted: mxBiasAdjusted,
        },
        finalProbs: {
          pHome: sing.pHome,
          pDraw: sing.pDraw,
          pAway: sing.pAway,
        },
        expectedTotal: synth.dcExpTotal,
        expectedMargin: synth.dcExpDiff,
        lineupAvailabilityDelta: availDetail.lineup_availability_delta,
        sharpLogitTilt: sing.sharpLogitTilt,
        effectiveMarketAlpha: sing.effectiveMarketAlpha,
        geodesicV2: geodesic,
        drivers,
        dataQualityFlag,
        featureCoverage,
        valueStatus,
        market: realQuote,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
        blendWeightEffective: gate.blendWeightEffective,
        blendDevigMethod: gate.bestDevigMethod,
      };
    }

    if (smarketsHome !== null && smarketsHome > 0.01 && smarketsHome < 0.98) {
      const smarketsAnchorProbs = buildSmarkets3WayAnchorProbs(
        smarketsHome,
        sportsProbs,
        smarketsDraw,
        smarketsAway,
      );
      const singExch = applySingularitySharpTilt3Way({
        modelProbs: [sportsProbs.pHome, sportsProbs.pDraw, sportsProbs.pAway],
        marketProbs: smarketsAnchorProbs,
        baseMarketAlpha: c.smarkets_anchor_base_alpha.value,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });
      return {
        matchupId: matchup.matchup_id,
        sport: "football",
        league,
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "3way",
        sportsModelName: TACHYON_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "smarkets_anchor_v3",
        sportsProbs,
        marketProbsAdaptive: null,
        finalProbs: {
          pHome: singExch.pHome,
          pDraw: singExch.pDraw,
          pAway: singExch.pAway,
        },
        expectedTotal: synth.dcExpTotal,
        expectedMargin: synth.dcExpDiff,
        lineupAvailabilityDelta: availDetail.lineup_availability_delta,
        sharpLogitTilt: singExch.sharpLogitTilt,
        effectiveMarketAlpha: singExch.effectiveMarketAlpha,
        geodesicV2: null,
        drivers,
        dataQualityFlag,
        featureCoverage,
        valueStatus: "no_market",
        market: null,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
        blendWeightEffective: gate.blendWeightEffective,
        blendDevigMethod: gate.bestDevigMethod,
      };
    }

    return {
      matchupId: matchup.matchup_id,
      sport: "football",
      league,
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "3way",
      sportsModelName: TACHYON_MODEL_NAME,
      activeModelName: TACHYON_MODEL_NAME,
      activeEngine: "sports_only",
      sportsProbs,
      marketProbsAdaptive: null,
      finalProbs: sportsProbs,
      expectedTotal: synth.dcExpTotal,
      expectedMargin: synth.dcExpDiff,
      lineupAvailabilityDelta: availDetail.lineup_availability_delta,
      sharpLogitTilt: 0,
      effectiveMarketAlpha: null,
      geodesicV2: null,
      drivers,
      dataQualityFlag,
      featureCoverage,
      valueStatus: "no_market",
      market: null,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
      blendWeightEffective: gate.blendWeightEffective,
      blendDevigMethod: gate.bestDevigMethod,
    };
  }

  // -------------------------------------------------------------------------
  // Caso 2: NFL (`PitchLab Minkowski v3.0` + 2-way Market Pool)
  // -------------------------------------------------------------------------
  if (league === "nfl") {
    const gate = resolveProductionSegmentGate(
      "NFL",
      "moneyline",
      artifacts.productionSegments,
      artifacts.blendWeights,
    );
    const realQuote = validateRealMarketQuote({
      odds: matchup.odds,
      expectedArity: 2,
      oddsBook: matchup.odds_book,
      marketSources: matchup.market_sources,
      tsCaptured: matchup.ts_captured,
    });
    const valueStatus: ValueStatus =
      realQuote === null
        ? "no_market"
        : gate.productionEnabled
          ? "active"
          : "disabled_segment";

    const homeAbbr = teamIndex.nflSlugToAbbr.get(slugToken(matchup.home_team)) ?? "";
    const awayAbbr = teamIndex.nflSlugToAbbr.get(slugToken(matchup.away_team)) ?? "";
    const synthNfl = synthesizeNflSnapshotRowFromMaster(
      homeAbbr,
      awayAbbr,
      homeMaster,
      awayMaster,
      matchup,
      artifacts.nflModel,
      constants,
    );
    const activeRow = artifacts.precomputedNflRows?.[matchup.matchup_id] ?? synthNfl.row;
    const featureCoverage = computeFeatureCoverage(
      activeRow.features,
      artifacts.nflModel.n_features,
    );
    const baseNfl = predictNFL(activeRow, artifacts.nflModel);
    const dataQualityFlag = resolveCoverageQualityFlag(
      baseNfl.dataQualityFlag,
      featureCoverage,
      lowCovThreshold,
    );
    const liveNfl = applyMinkowskiV3LiveContext(baseNfl, synthNfl.liveContext, artifacts.nflModel);

    const sportsSum2 = liveNfl.pHome + liveNfl.pAway;
    const sportsH2 = sportsSum2 > 0 ? liveNfl.pHome / sportsSum2 : 0.5;
    const sportsA2 = 1.0 - sportsH2;
    const nflMarginCfg = c.nfl_expected_margin.value;
    const expectedMarginNfl =
      nflMarginCfg.std_points * logit(sportsH2) * nflMarginCfg.logit_scale_factor;

    const drivers: LiveKeyDriver[] = liveNfl.delta.drivers.map((d) => ({
      factor: d.factor,
      label: d.label,
      impactLogit: d.impactLogit,
    }));

    const pHNovig = finiteOrNull(matchup.p_home_novig);
    const pANovig = finiteOrNull(matchup.p_away_novig);
    const hasNovigPair = pHNovig !== null && pANovig !== null && pHNovig > 0 && pANovig > 0;

    if (realQuote !== null || hasNovigPair) {
      let mktHome: number;
      let mktAway: number;
      let effectiveOverround: number;

      if (realQuote !== null) {
        const adaptive2 = devig2Way(realQuote.odds[0]!, realQuote.odds[1]!, "adaptive");
        mktHome = adaptive2.pHome;
        mktAway = adaptive2.pAway;
        effectiveOverround = adaptive2.overround;
      } else {
        const sumM2 = pHNovig! + pANovig!;
        mktHome = pHNovig! / sumM2;
        mktAway = pANovig! / sumM2;
        effectiveOverround = rawOverround;
      }

      const sing2 = applySingularitySharpTilt2Way({
        modelProbs: [sportsH2, sportsA2],
        marketProbs: [mktHome, mktAway],
        marketOverround: effectiveOverround,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });

      const geodesic2 =
        valueStatus === "active" && realQuote !== null
          ? evaluateGeodesicV2ValueGate({
              probs: [sing2.pHome, sing2.pAway],
              odds: realQuote.odds,
              marketProbs: [mktHome, mktAway],
              reverseLineMovementSide: rlmSide,
              sharpMoneyDivergenceHomePct: sharpDiv,
            })
          : null;

      return {
        matchupId: matchup.matchup_id,
        sport: "nfl",
        league: "nfl",
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "2way",
        sportsModelName: MINKOWSKI_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "singularity_v3",
        sportsProbs: {
          pHome: sportsH2,
          pDraw: 0,
          pAway: sportsA2,
        },
        marketProbsAdaptive: {
          pHome: mktHome,
          pDraw: 0,
          pAway: mktAway,
          overround: effectiveOverround,
          ligaMxBiasAdjusted: false,
        },
        finalProbs: {
          pHome: sing2.pHome,
          pDraw: 0,
          pAway: sing2.pAway,
        },
        expectedTotal: liveNfl.expectedTotalPoints,
        expectedMargin: expectedMarginNfl,
        lineupAvailabilityDelta: liveNfl.delta.injuryLogitDelta,
        sharpLogitTilt: sing2.sharpLogitTilt,
        effectiveMarketAlpha: sing2.effectiveMarketAlpha,
        geodesicV2: geodesic2,
        drivers,
        dataQualityFlag,
        featureCoverage,
        valueStatus,
        market: realQuote,
        segmentKey: gate.segmentKey,
        segmentEnabled: gate.productionEnabled,
        blendWeightEffective: gate.blendWeightEffective,
        blendDevigMethod: gate.bestDevigMethod,
      };
    }

    return {
      matchupId: matchup.matchup_id,
      sport: "nfl",
      league: "nfl",
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "2way",
      sportsModelName: MINKOWSKI_MODEL_NAME,
      activeModelName: MINKOWSKI_MODEL_NAME,
      activeEngine: "sports_only",
      sportsProbs: { pHome: sportsH2, pDraw: 0, pAway: sportsA2 },
      marketProbsAdaptive: null,
      finalProbs: { pHome: sportsH2, pDraw: 0, pAway: sportsA2 },
      expectedTotal: liveNfl.expectedTotalPoints,
      expectedMargin: expectedMarginNfl,
      lineupAvailabilityDelta: liveNfl.delta.injuryLogitDelta,
      sharpLogitTilt: 0,
      effectiveMarketAlpha: null,
      geodesicV2: null,
      drivers,
      dataQualityFlag,
      featureCoverage,
      valueStatus: "no_market",
      market: null,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
      blendWeightEffective: gate.blendWeightEffective,
      blendDevigMethod: gate.bestDevigMethod,
    };
  }

  // -------------------------------------------------------------------------
  // Caso 3: Multi-Deporte (`NHL`, `MLB`, `NBA`, `NCAAF`)
  // -------------------------------------------------------------------------
  const msSport: MultiSportLeague =
    league === "nhl" || league === "mlb" || league === "nba" || league === "ncaaf"
      ? league
      : sportRaw === "hockey"
        ? "nhl"
        : sportRaw === "baseball"
          ? "mlb"
          : sportRaw === "basketball"
            ? "nba"
            : "ncaaf";

  const gate = resolveProductionSegmentGate(
    msSport,
    "moneyline",
    artifacts.productionSegments,
    artifacts.blendWeights,
  );
  const realQuote = validateRealMarketQuote({
    odds: matchup.odds,
    expectedArity: 2,
    oddsBook: matchup.odds_book,
    marketSources: matchup.market_sources,
    tsCaptured: matchup.ts_captured,
  });
  const valueStatus: ValueStatus =
    realQuote === null
      ? "no_market"
      : gate.productionEnabled
        ? "active"
        : "disabled_segment";

  const roofType = String(homeMaster?.roof_type ?? "").trim().toLowerCase();
  const isDomeOpt =
    roofType === "dome" ||
    roofType === "closed" ||
    roofType === "indoor" ||
    roofType === "indoor_arena"
      ? true
      : roofType === "open"
        ? false
        : null;
  const roofOpenOpt =
    roofType === "open" || roofType === "retractable" ? true : isDomeOpt === true ? false : null;

  const msInput: MultiSportMatchupInput = {
    homeTeam: matchup.home_team,
    awayTeam: matchup.away_team,
    neutralSite: false,
    isDome: isDomeOpt,
    roofOpen: roofOpenOpt,
    stadiumElevationM: finiteOrNull(
      matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m,
    ),
    awayElevationM: finiteOrNull(awayMaster?.stadium_elevation_m),
    surfacePressureHpa: finiteOrNull(
      matchup.home_surface_pressure_hpa ?? homeMaster?.surface_pressure_hpa,
    ),
    windMph: finiteOrNull(matchup.home_max_wind_speed_mph_7d ?? homeMaster?.max_wind_speed_mph_7d),
    precipitationMm: finiteOrNull(homeMaster?.total_precipitation_mm_7d),
    homeInjuriesOut: finiteOrNull(homeMaster?.injured_players_count),
    awayInjuriesOut: finiteOrNull(awayMaster?.injured_players_count),
  };

  const msPred: MultiSportPrediction = predictMultiSport(
    msSport,
    msInput,
    artifacts.multisportModel,
  );
  const featureCoverage = computeMultiSportFeatureCoverage(
    msSport,
    msInput,
    artifacts.multisportModel,
  );
  const dataQualityFlag = resolveCoverageQualityFlag("ok", featureCoverage, lowCovThreshold);

  const sportsProbs2 = { pHome: msPred.pHome, pDraw: 0, pAway: msPred.pAway };
  const expectedTotal =
    msPred.sport === "nhl"
      ? msPred.expectedTotalGoals
      : msPred.sport === "mlb"
        ? msPred.expectedTotalRuns
        : msPred.expectedTotalPoints;
  const expectedMargin =
    msPred.sport === "nhl"
      ? msPred.expectedGoalsHome - msPred.expectedGoalsAway
      : msPred.sport === "mlb"
        ? msPred.expectedRunMargin
        : msPred.expectedMargin;

  const drivers = mapMultiSportDrivers(msPred.drivers);
  const pHNovig = finiteOrNull(matchup.p_home_novig);
  const pANovig = finiteOrNull(matchup.p_away_novig);
  const hasNovigPair = pHNovig !== null && pANovig !== null && pHNovig > 0 && pANovig > 0;

  if (realQuote !== null || hasNovigPair) {
    let mktHome: number;
    let mktAway: number;
    let effectiveOverround: number;

    if (realQuote !== null) {
      const adaptive2 = devig2Way(realQuote.odds[0]!, realQuote.odds[1]!, "adaptive");
      mktHome = adaptive2.pHome;
      mktAway = adaptive2.pAway;
      effectiveOverround = adaptive2.overround;
    } else {
      const sumM2 = pHNovig! + pANovig!;
      mktHome = pHNovig! / sumM2;
      mktAway = pANovig! / sumM2;
      effectiveOverround = rawOverround;
    }

    const sing2 = applySingularitySharpTilt2Way({
      modelProbs: [msPred.pHome, msPred.pAway],
      marketProbs: [mktHome, mktAway],
      marketOverround: effectiveOverround,
      smarketsExchangeMidProbHome: smarketsHome,
      sharpMoneyDivergenceHomePct: sharpDiv,
      reverseLineMovementSide: rlmSide,
    });

    const geodesic2 =
      valueStatus === "active" && realQuote !== null
        ? evaluateGeodesicV2ValueGate({
            probs: [sing2.pHome, sing2.pAway],
            odds: realQuote.odds,
            marketProbs: [mktHome, mktAway],
            reverseLineMovementSide: rlmSide,
            sharpMoneyDivergenceHomePct: sharpDiv,
          })
        : null;

    return {
      matchupId: matchup.matchup_id,
      sport: msSport,
      league,
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "2way",
      sportsModelName: msPred.modelId,
      activeModelName: SINGULARITY_MODEL_NAME,
      activeEngine: "singularity_v3",
      sportsProbs: sportsProbs2,
      marketProbsAdaptive: {
        pHome: mktHome,
        pDraw: 0,
        pAway: mktAway,
        overround: effectiveOverround,
        ligaMxBiasAdjusted: false,
      },
      finalProbs: {
        pHome: sing2.pHome,
        pDraw: 0,
        pAway: sing2.pAway,
      },
      expectedTotal,
      expectedMargin,
      lineupAvailabilityDelta: null,
      sharpLogitTilt: sing2.sharpLogitTilt,
      effectiveMarketAlpha: sing2.effectiveMarketAlpha,
      geodesicV2: geodesic2,
      drivers,
      dataQualityFlag,
      featureCoverage,
      valueStatus,
      market: realQuote,
      segmentKey: gate.segmentKey,
      segmentEnabled: gate.productionEnabled,
      blendWeightEffective: gate.blendWeightEffective,
      blendDevigMethod: gate.bestDevigMethod,
    };
  }

  return {
    matchupId: matchup.matchup_id,
    sport: msSport,
    league,
    homeTeam: matchup.home_team,
    awayTeam: matchup.away_team,
    marketType: "2way",
    sportsModelName: msPred.modelId,
    activeModelName: msPred.modelId,
    activeEngine: "sports_only",
    sportsProbs: sportsProbs2,
    marketProbsAdaptive: null,
    finalProbs: sportsProbs2,
    expectedTotal,
    expectedMargin,
    lineupAvailabilityDelta: null,
    sharpLogitTilt: 0,
    effectiveMarketAlpha: null,
    geodesicV2: null,
    drivers,
    dataQualityFlag,
    featureCoverage,
    valueStatus: "no_market",
    market: null,
    segmentKey: gate.segmentKey,
    segmentEnabled: gate.productionEnabled,
    blendWeightEffective: gate.blendWeightEffective,
    blendDevigMethod: gate.bestDevigMethod,
  };
}

/**
 * Ejecuta inferencia en tiempo real sobre toda la matriz `live_matchups_edge_matrix.json`
 * (`242` enfrentamientos en `11` ligas) en `< 1 ms` promedio por enfrentamiento, cero I/O.
 */
export function predictLiveEdgeMatrix(
  edgeMatrix:
    | readonly LiveMatchupEdgeRecord[]
    | { readonly records: readonly LiveMatchupEdgeRecord[] },
  teamMaster:
    | readonly TeamMasterFeatureRecord[]
    | { readonly records: readonly TeamMasterFeatureRecord[] },
  artifacts: LiveInferenceArtifacts,
): LiveEdgeMatrixBatchResult {
  const rows = Array.isArray(edgeMatrix)
    ? edgeMatrix
    : (edgeMatrix as { readonly records: readonly LiveMatchupEdgeRecord[] }).records;
  const teamIndex = buildTeamMasterIndex(teamMaster, artifacts.nflModel);

  const countsByLeague: Record<string, number> = {};
  let executableBetsCount = 0;
  let vetoedByRlmCount = 0;
  let institutionallyConfirmedCount = 0;

  const predictions: LiveMatchupPrediction[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const rec = rows[i]!;
    const pred = predictLiveMatchup(rec, teamIndex, artifacts);
    predictions[i] = pred;
    countsByLeague[pred.league] = (countsByLeague[pred.league] ?? 0) + 1;
    if (pred.geodesicV2) {
      if (pred.geodesicV2.recommendedStake > 0) executableBetsCount += 1;
      if (pred.geodesicV2.vetoedByRlm) vetoedByRlmCount += 1;
      if (pred.geodesicV2.institutionalConfirmation) institutionallyConfirmedCount += 1;
    }
  }

  return {
    count: predictions.length,
    countsByLeague,
    executableBetsCount,
    vetoedByRlmCount,
    institutionallyConfirmedCount,
    predictions,
  };
}

/** Identificadores y nombres en clave de motores exportados (reexportados por comodidad del servicio). */
export {
  GEODESIC_MODEL_NAME,
  HORIZON_MODEL_NAME,
  HYBRID_MODEL_ID,
  MINKOWSKI_MODEL_NAME,
  MULTISPORT_CODENAMES,
  NFL_MODEL_ID,
  SINGULARITY_MODEL_NAME,
  TACHYON_MODEL_NAME,
};
