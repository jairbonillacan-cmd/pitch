/**
 * Métricas publicables del modelo (evaluación retro walk-forward).
 *
 * Fuente: `Reportes/modelos/backtest-v2.json` (regenerable con `pnpm backtest`).
 * Se copian aquí para que el build no dependa de la carpeta de reportes.
 *
 * Regla editorial (PREDICTION_ARCHITECTURE.md §2): esto es evaluación retro,
 * **no** un track record. La referencia "ingenua" usa las frecuencias de la liga
 * en la ventana de entrenamiento y sirve para demostrar que el modelo aporta.
 * ECE = error de calibración esperado sobre la clase elegida (menor es mejor).
 */

export const MODEL_EVALUATION = {
  generatedAt: "2026-11-09",
  window: "2 temporadas (2025-26 y 2026-27), walk-forward por jornada/semana",
  rows: [
    {
      league: "Premier League",
      n: 327,
      logLoss: 1.022,
      brier: 0.613,
      accuracy: 0.492,
      ece: 0.049,
      naiveLogLoss: 1.074,
      naiveBrier: 0.649,
      naiveAccuracy: 0.45,
      naiveEce: 0.048,
    },
    {
      league: "NFL",
      n: 310,
      logLoss: 0.645,
      brier: 0.455,
      accuracy: 0.645,
      ece: 0.05,
      naiveLogLoss: 0.7,
      naiveBrier: 0.507,
      naiveAccuracy: 0.484,
      naiveEce: 0.058,
    },
  ],
  status: "en validación",
} as const;

/**
 * Fútbol: v2 frente a v2 con memoria larga (mezcla 50/50 del 1X2).
 * Fuente: `Reportes/modelos/backtest-blend.json` (`pnpm --filter @pitchlab/ingest backtest:blend`),
 * temporadas de prueba, peso fijado antes de la prueba.
 */
export const BLEND_EVALUATION = {
  n: 5529,
  window: "2023-24 a 2026-27, walk-forward semanal",
  before: { logLoss: 0.9797, accuracy: 0.538, ece: 0.007 },
  after: { logLoss: 0.9754, accuracy: 0.541, ece: 0.009 },
} as const;

export function formatMetric(value: number, digits = 3): string {
  return value.toFixed(digits).replace(".", ",");
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)} %`;
}
