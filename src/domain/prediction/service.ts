/**
 * A17 — Servicio de predicción de extremo a extremo (fútbol y NFL).
 *
 * Cierra el hueco entre las cuotas crudas y el motor: convierte las cuotas en
 * probabilidades de-vigadas (proporcional/power/Shin) y elige Motor B o Motor A
 * con el fallback ya existente. Funciones puras, sin I/O.
 */
import { devig, InvalidOddsError, type DevigMethod } from "./devig.js";
import {
  NFL_MODEL_ID,
  predictNFL,
  predictWithFallback,
} from "./engine.js";
import type {
  BaseRates,
  NFLModelArtifact,
  NFLSnapshotRow,
  ModelArtifact,
  Prediction,
  SnapshotRow,
} from "./types.js";

export interface FootballMatchRequest {
  sport: "football";
  row: SnapshotRow;
  model: ModelArtifact;
  /** Cuotas decimales 1X2. Si faltan o son inválidas, se usa Motor A. */
  odds?: readonly number[] | null;
  /** Método de de-vig; por defecto `power` (el mejor en la evaluación A07). */
  oddsMethod?: DevigMethod;
  baseRates?: BaseRates;
}

export interface NFLMatchRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact;
}

export type MatchPredictionRequest = FootballMatchRequest | NFLMatchRequest;

/**
 * Predice un partido.
 *
 * Fútbol:
 *   1. si hay cuotas válidas -> de-vig (método pedido) -> Motor B (`market_devig`);
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
  if (odds === undefined || odds === null) {
    return predictWithFallback(request.row, request.model, null, request.baseRates);
  }
  try {
    const marketProbs = devig(odds, method);
    const prediction = predictWithFallback(request.row, request.model, marketProbs, request.baseRates);
    return { ...prediction, marketMethod: method };
  } catch (error) {
    if (!(error instanceof InvalidOddsError)) throw error;
    const fallback = predictWithFallback(request.row, request.model, null, request.baseRates);
    return { ...fallback, dataQualityFlag: "fallback_motor_a" };
  }
}

/** Predice un lote. Determinista y sin estado compartido. */
export function predictMatchBatch(requests: readonly MatchPredictionRequest[]): Prediction[] {
  return requests.map((request) => predictMatch(request));
}

/** Identificador del motor NFL exportado (reexportado por comodidad del servicio). */
export { NFL_MODEL_ID };
