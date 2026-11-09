/**
 * Elo para fútbol de clubes.
 *
 * Es el candidato 1 del plan (`PREDICTION_ARCHITECTURE.md` §4): barato, interpretable y
 * fuerte frente al mercado cuando se alimenta con muchas temporadas. Aquí se implementa
 * como un *tracker* incremental: se predice un partido con las ratings previas y después
 * se actualizan, así el backtest walk-forward no puede filtrar el futuro.
 *
 * Detalles:
 *  - Ventaja de local en puntos Elo (no modifica la rating).
 *  - Multiplicador por diferencia de goles (World Football Elo): un 3-0 mueve más que un 1-0.
 *  - Regresión a la media al empezar cada temporada (los equipos cambian de plantilla).
 *  - Probabilidad de empate decreciente con la diferencia de ratings.
 */

export interface EloOptions {
  initialRating?: number;
  kFactor?: number;
  /** Puntos Elo de ventaja de local (≈ 60-70 en fútbol). */
  homeAdvantage?: number;
  /** Fracción de la distancia a la media que se corrige al cambiar de temporada. */
  seasonRegression?: number;
  marginOfVictory?: boolean;
  /** Probabilidad de empate con ratings iguales. */
  drawBase?: number;
  /** Cuánto baja el empate por punto Elo de diferencia. */
  drawSlope?: number;
  minDraw?: number;
}

export interface EloMatch {
  date: string;
  season: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

export interface EloPrediction {
  home: number;
  draw: number;
  away: number;
  ratingHome: number;
  ratingAway: number;
  /** Puntos esperados del local (victoria = 1, empate = 0.5). */
  expectedHome: number;
}

export interface EloTracker {
  rating(team: string): number;
  predict(home: string, away: string): EloPrediction;
  /** Aplica la regresión de temporada a todos los equipos (idempotente por temporada). */
  beginSeason(season: string): void;
  update(match: EloMatch): void;
  snapshot(): Record<string, number>;
}

const DEFAULTS: Required<EloOptions> = {
  initialRating: 1500,
  // Elegidos con validación temporal en Premier League (2010-11…2018-19) y evaluados
  // en 2019-20…2026-27: K=15, localía 65, regresión 0.10, empate 0.30 − 0.0005·|Δ|.
  kFactor: 15,
  homeAdvantage: 65,
  seasonRegression: 0.1,
  marginOfVictory: true,
  drawBase: 0.3,
  drawSlope: 0.0005,
  minDraw: 0.12,
};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Puntos esperados del local; `diff` ya incluye la ventaja de local. */
export function eloExpectedScore(diff: number): number {
  return 1 / (1 + 10 ** (-diff / 400));
}

/** Multiplicador por diferencia de goles (1, 1.5 y (11+d)/8). */
export function goalDifferenceMultiplier(goalDifference: number): number {
  const diff = Math.abs(goalDifference);
  if (diff <= 1) return 1;
  if (diff === 2) return 1.5;
  return (11 + diff) / 8;
}

export function createEloTracker(options: EloOptions = {}): EloTracker {
  const config = { ...DEFAULTS, ...options };
  const ratings = new Map<string, number>();
  const appliedSeason = new Map<string, string>();

  const ratingOf = (team: string): number => ratings.get(team) ?? config.initialRating;

  return {
    rating(team: string): number {
      return ratingOf(team);
    },

    predict(home: string, away: string): EloPrediction {
      const ratingHome = ratingOf(home);
      const ratingAway = ratingOf(away);
      const diff = ratingHome + config.homeAdvantage - ratingAway;
      const expectedHome = eloExpectedScore(diff);
      const draw = clamp(
        config.drawBase - config.drawSlope * Math.abs(diff),
        config.minDraw,
        config.drawBase,
      );
      const homeWin = clamp(expectedHome - draw / 2, 0.001, 1 - draw - 0.001);
      const awayWin = 1 - draw - homeWin;
      return { home: homeWin, draw, away: awayWin, ratingHome, ratingAway, expectedHome };
    },

    beginSeason(season: string): void {
      for (const [team, rating] of ratings) {
        if (appliedSeason.get(team) === season) continue;
        // Solo se regresa a la media si el equipo ya tenía historial previo.
        const regressed = rating + (config.initialRating - rating) * config.seasonRegression;
        ratings.set(team, regressed);
        appliedSeason.set(team, season);
      }
    },

    update(match: EloMatch): void {
      const home = match.home;
      const away = match.away;
      appliedSeason.set(home, match.season);
      appliedSeason.set(away, match.season);

      const ratingHome = ratingOf(home);
      const ratingAway = ratingOf(away);
      const expectedHome = eloExpectedScore(
        ratingHome + config.homeAdvantage - ratingAway,
      );
      const actualHome =
        match.homeGoals > match.awayGoals ? 1 : match.homeGoals === match.awayGoals ? 0.5 : 0;
      const multiplier = config.marginOfVictory
        ? goalDifferenceMultiplier(match.homeGoals - match.awayGoals)
        : 1;
      const delta = config.kFactor * multiplier * (actualHome - expectedHome);
      ratings.set(home, ratingHome + delta);
      ratings.set(away, ratingAway - delta);
    },

    snapshot(): Record<string, number> {
      return Object.fromEntries([...ratings.entries()].sort(([a], [b]) => a.localeCompare(b)));
    },
  };
}
