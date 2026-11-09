/**
 * A17 — Eliminación del margen (de-vig) en TypeScript.
 *
 * Métodos implementados, con la misma definición que el laboratorio Python
 * (`features/build_market_features.py`):
 *   - proporcional: p_i = q_i / Σq, con q_i = 1/o_i
 *   - power:        p_i = q_i^α, α resuelto para Σp = 1
 *   - Shin (1993):  p_i = (sqrt(z² + 4(1−z)q_i²/Q) − z) / (2(1−z)), z resuelto para Σp = 1
 *
 * Todas las funciones son puras y no dependen de terceros.
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

/**
 * De-vig Shin (1993). z se busca en [0, 0.5] por bisección; si no converge,
 * lanza `InvalidOddsError` (no devuelve probabilidades inventadas).
 */
export function devigShin(odds: readonly number[], tolerance = 1e-12): number[] {
  validateOdds(odds);
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

export type DevigMethod = "proportional" | "power" | "shin";

/** Aplica el método pedido (por defecto power). */
export function devig(odds: readonly number[], method: DevigMethod = "power"): number[] {
  if (method === "proportional") return devigProportional(odds);
  if (method === "power") return devigPower(odds);
  if (method === "shin") return devigShin(odds);
  throw new InvalidOddsError(`método de de-vig desconocido: ${String(method)}`);
}
