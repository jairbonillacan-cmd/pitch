/**
 * Utilidades matemáticas puras y deterministas compartidas por los motores de predicción (`v3.2`).
 *
 * Centraliza las primitivas IEEE-754 (`clamp`, `logit`, `sigmoid`, `normalCdf`, `createMulberry32`)
 * manteniendo paridad numérica exacta (`|Δ| < 1e-12`) con los módulos Python de `services/models/`
 * y `research/prediction-lab/models/`.
 */

/** Epsilon simétrico por defecto para recorte de probabilidades en transformación `logit`. */
export const DEFAULT_LOGIT_EPS = 1e-6;

/** Recorta `value` al intervalo cerrado `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Transformación logit con recorte simétrico en `[eps, 1 - eps]` (`eps = 1e-6` por defecto). */
export function logit(p: number, eps: number = DEFAULT_LOGIT_EPS): number {
  const pc = clamp(p, eps, 1.0 - eps);
  return Math.log(pc / (1.0 - pc));
}

/** Función logística `σ(x) = 1 / (1 + exp(-x))` protegida contra desbordamiento en extremos. */
export function sigmoid(x: number): number {
  if (x < -709.0) return 0.0;
  if (x > 709.0) return 1.0;
  return 1.0 / (1.0 + Math.exp(-x));
}

/**
 * Función de distribución acumulada normal estándar `Φ(x)` (Abramowitz & Stegun 7.1.26,
 * error máximo `< 1.5e-7`, paridad IEEE-754 con `train_multisport.py`).
 */
export function normalCdf(x: number): number {
  const sign = x < 0.0 ? -1.0 : 1.0;
  const z = Math.abs(x) * 0.7071067811865475;
  const t = 1.0 / (1.0 + 0.3275911 * z);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t;
  const erfVal = sign * (1.0 - poly * Math.exp(-(z * z)));
  return 0.5 * (1.0 + erfVal);
}

/**
 * Generador pseudoaleatorio determinista de 32 bits (`mulberry32`) con distribución uniforme en `[0, 1)`.
 * Paridad bit a bit exacta con `_mulberry32_uniforms` en `services/models/clv_report.py`.
 */
export function createMulberry32(seed: number): () => number {
  let s = (seed | 0) || 0x12345678;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
