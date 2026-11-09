/**
 * Métricas publicables del modelo (evaluación retro walk-forward).
 *
 * Fuente: `Reportes/modelos/backtest-v2.json` (regenerable con `pnpm backtest`).
 * Se copian aquí para que el build no dependa de la carpeta de reportes.
 *
 * Regla editorial (PREDICTION_ARCHITECTURE.md §2): esto es evaluación retro,
 * **no** un track record. La referencia "ingenua" usa las frecuencias de la liga
 * en la ventana de entrenamiento y sirve para demostrar que el modelo aporta.
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
      naiveLogLoss: 1.074,
      naiveBrier: 0.649,
      naiveAccuracy: 0.45,
    },
    {
      league: "NFL",
      n: 310,
      logLoss: 0.647,
      brier: 0.457,
      accuracy: 0.639,
      naiveLogLoss: 0.7,
      naiveBrier: 0.507,
      naiveAccuracy: 0.484,
    },
  ],
  status: "en validación",
} as const;

export function formatMetric(value: number, digits = 3): string {
  return value.toFixed(digits).replace(".", ",");
}
