/**
 * A17 / v2 — Servicio de predicción de extremo a extremo (fútbol y NFL).
 *
 * Cierra el hueco entre las cuotas crudas y el motor: convierte las cuotas en
 * probabilidades de-vigadas (proporcional/power/Shin), elige Motor B, Motor C (híbrido)
 * o Motor A con el fallback ya existente, y calcula métricas de ejecución de valor
 * (divergencia modelo-mercado, edge esperado, filtro anti-Winner's Curse y Quarter-Kelly).
 * Funciones puras, sin I/O.
 */
import { devig, InvalidOddsError, type DevigMethod } from "./devig.js";
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
  evaluateValueExecution,
  predictMotorA,
  predictNFL,
  predictWithFallback,
  type ValueExecutionOptions,
} from "./engine.js";
import type {
  BaseRates,
  NFLModelArtifact,
  NFLSnapshotRow,
  ModelArtifact,
  Prediction,
  PredictionMode,
  SnapshotRow,
} from "./types.js";

export interface FootballMatchRequest {
  sport: "football";
  row: SnapshotRow;
  model: ModelArtifact;
  /** Cuotas decimales 1X2 de referencia. Si faltan o son inválidas, se usa Motor A. */
  odds?: readonly number[] | null;
  /** Mejores cuotas disponibles (Line Shopping, ej. [MaxH, MaxD, MaxA]) para ejecución de valor. */
  bestOdds?: readonly number[] | null;
  /** Método de de-vig; por defecto `power` (el mejor en la evaluación A07). */
  oddsMethod?: DevigMethod;
  /** Modo de inferencia: `market_only` (por defecto), `hybrid` (Motor C) o `motor_a_only`. */
  mode?: PredictionMode;
  /** Peso del mercado en modo `hybrid` (por defecto 0.85). */
  hybridAlpha?: number;
  /** Opciones para el cálculo de edge, filtro de incertidumbre y Kelly fraccional. */
  valueOptions?: ValueExecutionOptions;
  baseRates?: BaseRates;
}

export interface NFLMatchRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact;
}

export type MatchPredictionRequest = FootballMatchRequest | NFLMatchRequest;

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

/**
 * Predice un partido.
 *
 * Fútbol:
 *   1. si hay cuotas válidas -> de-vig (método pedido) -> Motor B (`market_devig`) o Motor C (`hybrid`);
 *   2. si no hay cuotas -> Motor A;
 *   3. si hay cuotas pero son inválidas/implausibles -> Motor A con
 *      `dataQualityFlag="fallback_motor_a"` (se conserva el aviso de que el mercado falló).
 *
 * NFL: usa el motor NFL; las cuotas no se usan (el mercado NFL se evaluó aparte).
 */
export function predictMatch(request: MatchPredictionRequest): Prediction {
  if (request.sport === "nfl") {
    return predictNFL(request.row, request.model);
  }
  const method: DevigMethod = request.oddsMethod ?? "power";
  const odds = request.odds;
  const fallbackOptions = {
    mode: request.mode,
    hybridAlpha: request.hybridAlpha,
  };
  if (odds === undefined || odds === null) {
    return predictWithFallback(
      request.row,
      request.model,
      null,
      request.baseRates,
      fallbackOptions,
    );
  }
  try {
    const marketProbs = devig(odds, method);
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

    try {
      const motorA = predictMotorA(request.row, request.model);
      const pMod: readonly [number, number, number] = [
        motorA.pHome,
        motorA.pDraw,
        motorA.pAway,
      ];
      const alpha = request.hybridAlpha ?? DEFAULT_HYBRID_ALPHA;
      const pEval: readonly [number, number, number] =
        request.mode === "hybrid"
          ? [prediction.pHome, prediction.pDraw, prediction.pAway]
          : request.mode === "motor_a_only"
            ? pMod
            : blendLogLinear3(pMkt, pMod, alpha);
      const valueMetrics = evaluateValueExecution(
        pEval,
        pMkt,
        pMod,
        execOdds,
        request.valueOptions,
      );
      return {
        ...prediction,
        marketMethod: method,
        ...valueMetrics,
      };
    } catch (innerError) {
      if (!(innerError instanceof InvalidFeaturesError)) throw innerError;
      return { ...prediction, marketMethod: method };
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
    return { ...fallback, dataQualityFlag: "fallback_motor_a" };
  }
}

/** Predice un lote. Determinista y sin estado compartido. */
export function predictMatchBatch(requests: readonly MatchPredictionRequest[]): Prediction[] {
  return requests.map((request) => predictMatch(request));
}

/** Identificadores y nombres en clave de motores exportados (reexportados por comodidad del servicio). */
export {
  GEODESIC_MODEL_NAME,
  HORIZON_MODEL_NAME,
  HYBRID_MODEL_ID,
  MINKOWSKI_MODEL_NAME,
  NFL_MODEL_ID,
  SINGULARITY_MODEL_NAME,
  TACHYON_MODEL_NAME,
};
