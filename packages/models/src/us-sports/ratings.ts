/**
 * Ratings incrementales para NBA y NHL (walk-forward: se predice con lo previo y luego se actualiza).
 *
 * Lo mejor de los dos lados:
 *  - De PitchLab: ratings de ataque/defensa con regresión entre temporadas, probabilidades
 *    calibradas (Normal en NBA, Poisson en NHL) y validación walk-forward.
 *  - De Astra: ajuste explícito por descanso y back-to-back (en NBA ellos lo tienen y el motor
 *    v3.0 de PitchLab no) y separación del tiempo extra en NHL.
 *  - Corrige a Astra: en NHL el gol del tiempo extra o de penales NO entra a las tasas de goles
 *    de tiempo regular (Astra lo mezclaba), y el empate al final de la regulación se resuelve
 *    aparte con una probabilidad de tiempo extra.
 */
import { normalCdf } from "../math.js";

export interface UsGame {
  date: string; // AAAA-MM-DD (UTC)
  season: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** NHL: definido en tiempo extra o penales (el marcador final incluye el gol decisivo). */
  overtime?: boolean;
  shootout?: boolean;
}

export interface UsPrediction {
  pHome: number;
  expectedHome: number;
  expectedAway: number;
  expectedMargin: number;
  expectedTotal: number;
  restHome: number | null;
  restAway: number | null;
}

/** Días de descanso: 0 = jugó ayer (back-to-back). `null` si es su primer partido. */
export function restDays(lastDate: string | undefined, date: string): number | null {
  if (!lastDate) return null;
  const d = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.round(d) - 1);
}

interface Rating {
  off: number;
  def: number;
  season: string;
}

// ---------------------------------------------------------------- NBA

export interface NbaOptions {
  /** Puntos por equipo en un partido promedio. */
  leaguePoints: number;
  homeAdvantage: number;
  /** Paso de actualización (fracción del error de margen). */
  k: number;
  /** Fracción hacia 0 al empezar temporada. */
  seasonRegression: number;
  sigmaMargin: number;
  /** Puntos que pierde un equipo en back-to-back. */
  backToBack: number;
  /** Puntos que gana con 2+ días de descanso. */
  wellRested: number;
  /** Puntos extra de local en altitud (Denver, Utah). */
  altitudeBonus: number;
  altitudeTeams: readonly string[];
}

export const NBA_DEFAULTS: NbaOptions = {
  leaguePoints: 114,
  homeAdvantage: 2.4,
  k: 0.06,
  seasonRegression: 0.35,
  sigmaMargin: 11.8,
  backToBack: 1.6,
  wellRested: 0.4,
  altitudeBonus: 1.2,
  altitudeTeams: ["Denver Nuggets", "Utah Jazz"],
};

export interface NbaTracker {
  predict(game: Pick<UsGame, "date" | "season" | "home" | "away">): UsPrediction;
  update(game: UsGame): void;
  ratings(): Record<string, { off: number; def: number; net: number }>;
}

export function createNbaTracker(options: Partial<NbaOptions> = {}): NbaTracker {
  const o = { ...NBA_DEFAULTS, ...options };
  const ratings = new Map<string, Rating>();
  const last = new Map<string, string>();
  const altitude = new Set(o.altitudeTeams);

  const get = (team: string, season: string): Rating => {
    let r = ratings.get(team);
    if (!r) {
      r = { off: 0, def: 0, season };
      ratings.set(team, r);
    } else if (r.season !== season) {
      r.off *= 1 - o.seasonRegression;
      r.def *= 1 - o.seasonRegression;
      r.season = season;
    }
    return r;
  };
  const restAdj = (rest: number | null): number =>
    rest === null ? 0 : rest === 0 ? -o.backToBack : rest >= 2 ? o.wellRested : 0;

  const predict: NbaTracker["predict"] = (game) => {
    const h = get(game.home, game.season);
    const a = get(game.away, game.season);
    const restHome = restDays(last.get(game.home), game.date);
    const restAway = restDays(last.get(game.away), game.date);
    const hca = o.homeAdvantage + (altitude.has(game.home) ? o.altitudeBonus : 0);
    const adj = restAdj(restHome) - restAdj(restAway);
    const expectedHome = o.leaguePoints + h.off - a.def + hca / 2 + adj / 2;
    const expectedAway = o.leaguePoints + a.off - h.def - hca / 2 - adj / 2;
    const expectedMargin = expectedHome - expectedAway;
    return {
      pHome: Math.min(1 - 1e-6, Math.max(1e-6, normalCdf(expectedMargin / o.sigmaMargin))),
      expectedHome,
      expectedAway,
      expectedMargin,
      expectedTotal: expectedHome + expectedAway,
      restHome,
      restAway,
    };
  };

  return {
    predict,
    update(game) {
      const p = predict(game);
      const h = get(game.home, game.season);
      const a = get(game.away, game.season);
      const errHome = game.homeScore - p.expectedHome;
      const errAway = game.awayScore - p.expectedAway;
      h.off += o.k * errHome;
      a.def -= o.k * errHome;
      a.off += o.k * errAway;
      h.def -= o.k * errAway;
      last.set(game.home, game.date);
      last.set(game.away, game.date);
    },
    ratings() {
      return Object.fromEntries(
        [...ratings].map(([t, r]) => [t, { off: r.off, def: r.def, net: r.off + r.def }]),
      );
    },
  };
}

// ---------------------------------------------------------------- NHL

export interface NhlOptions {
  /** Goles por equipo en tiempo regular de un partido promedio. */
  leagueGoals: number;
  /** Ventaja de local en log-tasa. */
  homeAdvantage: number;
  k: number;
  seasonRegression: number;
  /** Log-tasa que pierde un equipo en back-to-back. */
  backToBack: number;
  /** Peso de la diferencia de fuerza en el tiempo extra (0 = moneda al aire). */
  overtimeTilt: number;
  maxGoals: number;
}

export const NHL_DEFAULTS: NhlOptions = {
  leagueGoals: 2.9,
  homeAdvantage: 0.05,
  k: 0.04,
  seasonRegression: 0.3,
  backToBack: 0.06,
  overtimeTilt: 0.5,
  maxGoals: 12,
};

export interface NhlPrediction extends UsPrediction {
  pRegulationDraw: number;
  pHomeRegulation: number;
}

export interface NhlTracker {
  predict(game: Pick<UsGame, "date" | "season" | "home" | "away">): NhlPrediction;
  update(game: UsGame): void;
}

function poissonPmf(lambda: number, max: number): number[] {
  const out = [Math.exp(-lambda)];
  for (let g = 1; g <= max; g++) out.push((out[g - 1]! * lambda) / g);
  return out;
}

/** Goles de tiempo regular: si se definió en tiempo extra o penales se quita el gol decisivo. */
export function regulationScore(game: UsGame): { home: number; away: number } {
  if (!game.overtime && !game.shootout) return { home: game.homeScore, away: game.awayScore };
  return game.homeScore > game.awayScore
    ? { home: game.homeScore - 1, away: game.awayScore }
    : { home: game.homeScore, away: game.awayScore - 1 };
}

export function createNhlTracker(options: Partial<NhlOptions> = {}): NhlTracker {
  const o = { ...NHL_DEFAULTS, ...options };
  const ratings = new Map<string, Rating>();
  const last = new Map<string, string>();
  const base = Math.log(o.leagueGoals);

  const get = (team: string, season: string): Rating => {
    let r = ratings.get(team);
    if (!r) {
      r = { off: 0, def: 0, season };
      ratings.set(team, r);
    } else if (r.season !== season) {
      r.off *= 1 - o.seasonRegression;
      r.def *= 1 - o.seasonRegression;
      r.season = season;
    }
    return r;
  };

  const predict: NhlTracker["predict"] = (game) => {
    const h = get(game.home, game.season);
    const a = get(game.away, game.season);
    const restHome = restDays(last.get(game.home), game.date);
    const restAway = restDays(last.get(game.away), game.date);
    const b2b = (rest: number | null) => (rest === 0 ? o.backToBack : 0);
    const lh = Math.exp(base + o.homeAdvantage + h.off - a.def - b2b(restHome) + b2b(restAway) * 0.5);
    const la = Math.exp(base + a.off - h.def - b2b(restAway) + b2b(restHome) * 0.5);
    const ph = poissonPmf(lh, o.maxGoals);
    const pa = poissonPmf(la, o.maxGoals);
    let win = 0;
    let draw = 0;
    // La cola por encima de maxGoals es despreciable (< 1e-6 con tasas de NHL).
    for (let i = 0; i <= o.maxGoals; i++) {
      for (let j = 0; j <= o.maxGoals; j++) {
        const p = ph[i]! * pa[j]!;
        if (i > j) win += p;
        else if (i === j) draw += p;
      }
    }
    // Tiempo extra / penales: casi moneda al aire, inclinada levemente al más fuerte.
    const strength = Math.log(lh / la);
    const pOt = 1 / (1 + Math.exp(-o.overtimeTilt * strength));
    const pHome = win + draw * pOt;
    return {
      pHome: Math.min(1 - 1e-6, Math.max(1e-6, pHome)),
      pHomeRegulation: win,
      pRegulationDraw: draw,
      expectedHome: lh,
      expectedAway: la,
      expectedMargin: lh - la,
      expectedTotal: lh + la,
      restHome,
      restAway,
    };
  };

  return {
    predict,
    update(game) {
      const p = predict(game);
      const h = get(game.home, game.season);
      const a = get(game.away, game.season);
      const reg = regulationScore(game);
      // Gradiente de la log-verosimilitud de Poisson respecto a la log-tasa: (observado − esperado).
      const errHome = reg.home - p.expectedHome;
      const errAway = reg.away - p.expectedAway;
      h.off += o.k * errHome;
      a.def -= o.k * errHome;
      a.off += o.k * errAway;
      h.def -= o.k * errAway;
      last.set(game.home, game.date);
      last.set(game.away, game.date);
    },
  };
}
