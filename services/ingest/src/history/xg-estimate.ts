/**
 * Estimación de xG a partir de tiros y tiros a puerta.
 *
 * Cuando no hay xG del proveedor (Liga MX, temporadas sin Understat) se puede aproximar
 * con una regresión lineal ajustada sobre **18,692 partidos** de las cinco grandes que
 * tienen xG y estadísticas de tiro a la vez (R² ≈ 0.51 en cada lado).
 *
 * Coeficientes (xG = intercepto + β_shots·tiros + β_sot·tiros a puerta):
 *   local:  0.01047 + 0.05521·tiros + 0.16496·SOT
 *   visita: -0.01954 + 0.05718·tiros + 0.15558·SOT
 *
 * Es una aproximación: no sustituye al xG real y se marca como `estimated-from-shots`.
 */
export interface ShotStats {
  shotsHome: number | null;
  shotsAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
}

const HOME_COEFFICIENTS = { intercept: 0.01046533, shots: 0.05521442, sot: 0.16495583 } as const;
const AWAY_COEFFICIENTS = { intercept: -0.0195371, shots: 0.05718339, sot: 0.15557654 } as const;

export function estimateXgFromShots(stats: ShotStats): { home: number; away: number } | null {
  const { shotsHome, shotsAway, shotsOnTargetHome, shotsOnTargetAway } = stats;
  if (
    shotsHome === null ||
    shotsAway === null ||
    shotsOnTargetHome === null ||
    shotsOnTargetAway === null
  ) {
    return null;
  }
  const home = Math.max(
    0,
    HOME_COEFFICIENTS.intercept +
      HOME_COEFFICIENTS.shots * shotsHome +
      HOME_COEFFICIENTS.sot * shotsOnTargetHome,
  );
  const away = Math.max(
    0,
    AWAY_COEFFICIENTS.intercept +
      AWAY_COEFFICIENTS.shots * shotsAway +
      AWAY_COEFFICIENTS.sot * shotsOnTargetAway,
  );
  return { home, away };
}
