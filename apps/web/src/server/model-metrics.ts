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

/**
 * Picks por perfil y confianza (fútbol, 6 ligas, temporadas de prueba 2023-24 a 2026-27).
 * Fuente: `Reportes/modelos/BACKTEST-BLEND.md`. Un perfil está calibrado si su acierto
 * real se parece a la probabilidad media anunciada.
 */
export const PICK_EVALUATION = {
  window: "2023-24 a 2026-27, 6 ligas de fútbol, walk-forward semanal",
  profiles: [
    { profile: "Conservadora", range: "70 % o más", n: 5529, meanP: 0.837, hitRate: 0.824, fairOdds: 1.2 },
    { profile: "Intermedia", range: "52 % a 70 %", n: 5516, meanP: 0.659, hitRate: 0.652, fairOdds: 1.52 },
    { profile: "Arriesgada", range: "30 % a 52 %, cuota ≥ 1.9", n: 5505, meanP: 0.48, hitRate: 0.49, fairOdds: 2.09 },
  ],
  confidence: [
    { level: "Alta", share: 0.395, favoriteAccuracy: 0.643 },
    { level: "Media", share: 0.38, favoriteAccuracy: 0.481 },
    { level: "Baja", share: 0.225, favoriteAccuracy: 0.462 },
  ],
} as const;

export function formatMetric(value: number, digits = 3): string {
  return value.toFixed(digits).replace(".", ",");
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)} %`;
}
