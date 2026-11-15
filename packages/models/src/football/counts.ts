/**
 * Conteos por equipo en fútbol: tiros de esquina, faltas y tarjetas amarillas.
 *
 * Modelo log-lineal incremental (walk-forward: se predice con lo previo y después se actualiza):
 *
 *   E[local]     = μ_local     · exp(gen_local + con_visita)
 *   E[visitante] = μ_visitante · exp(gen_visita + con_local)
 *
 * `gen` es lo que el equipo genera (córners a favor, faltas cometidas, amarillas recibidas) y `con`
 * lo que le concede al rival. μ es la media de la liga por lado, que se mueve despacio (EWMA).
 * Entre temporadas las ratings regresan hacia 0. La dispersión se estima aparte (método de
 * momentos) y alimenta una binomial negativa; con dispersión ≤ 0 se usa Poisson.
 *
 * Nunca inventa números: si un equipo aún no tiene partidos con el dato, la predicción lo dice
 * (`homeGames`/`awayGames`) y quien la use decide si la muestra alcanza.
 */
export interface CountGame {
  date: string;
  season: string;
  home: string;
  away: string;
  homeCount: number;
  awayCount: number;
}

export interface CountOptions {
  /** Paso de actualización sobre el error relativo. */
  k: number;
  /** Fracción hacia 0 al empezar temporada. */
  seasonRegression: number;
  /** Peso de cada partido en la media de liga. */
  meanAlpha: number;
  /** Media inicial por lado mientras no hay partidos. */
  initialHome: number;
  initialAway: number;
}

export type CountStat = "corners" | "fouls" | "yellow";

/**
 * Parámetros elegidos por `backtest:counts` con las temporadas europeas 2010-11…2017-18
 * (`Reportes/modelos/BACKTEST-CORNERS-FOULS.json`).
 */
export const COUNT_DEFAULTS: Readonly<Record<CountStat, CountOptions>> = {
  corners: { k: 0.02, seasonRegression: 0.35, meanAlpha: 0.005, initialHome: 5.83, initialAway: 4.55 },
  fouls: { k: 0.05, seasonRegression: 0.35, meanAlpha: 0.005, initialHome: 14.42, initialAway: 14.99 },
  yellow: { k: 0.02, seasonRegression: 0.5, meanAlpha: 0.01, initialHome: 1.7, initialAway: 2.09 },
};

/** Tamaño de la binomial negativa por lado (mismo backtest); `Infinity` = Poisson. */
export const COUNT_DISPERSION: Readonly<Record<CountStat, number>> = {
  corners: 13,
  fouls: 151,
  yellow: Number.POSITIVE_INFINITY,
};

export interface CountPrediction {
  home: number;
  away: number;
  total: number;
  /** Partidos con el dato que ya vio el motor de cada equipo (todas las temporadas). */
  homeGames: number;
  awayGames: number;
}

interface TeamCount {
  gen: number;
  con: number;
  season: string;
  games: number;
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function createCountTracker(options: Partial<CountOptions> = {}) {
  const o: CountOptions = { ...COUNT_DEFAULTS.corners, ...options };
  const teams = new Map<string, TeamCount>();
  let muHome = o.initialHome;
  let muAway = o.initialAway;

  const team = (id: string, season: string): TeamCount => {
    let t = teams.get(id);
    if (!t) {
      t = { gen: 0, con: 0, season, games: 0 };
      teams.set(id, t);
    } else if (t.season !== season) {
      t.gen *= 1 - o.seasonRegression;
      t.con *= 1 - o.seasonRegression;
      t.season = season;
    }
    return t;
  };

  function expected(home: TeamCount, away: TeamCount): { home: number; away: number } {
    return {
      home: muHome * Math.exp(clip(home.gen + away.con, -1.2, 1.2)),
      away: muAway * Math.exp(clip(away.gen + home.con, -1.2, 1.2)),
    };
  }

  return {
    predict(game: Pick<CountGame, "home" | "away" | "season">): CountPrediction {
      const h = team(game.home, game.season);
      const a = team(game.away, game.season);
      const e = expected(h, a);
      return { home: e.home, away: e.away, total: e.home + e.away, homeGames: h.games, awayGames: a.games };
    },
    update(game: CountGame): void {
      const h = team(game.home, game.season);
      const a = team(game.away, game.season);
      const e = expected(h, a);
      // Error relativo (gradiente de la log-verosimilitud de Poisson en escala log), acotado para
      // que un partido raro (expulsión, prórroga de 10 minutos) no mueva de más.
      const errHome = clip((game.homeCount - e.home) / e.home, -1, 1.5);
      const errAway = clip((game.awayCount - e.away) / e.away, -1, 1.5);
      h.gen += o.k * errHome;
      a.con += o.k * errHome;
      a.gen += o.k * errAway;
      h.con += o.k * errAway;
      h.games++;
      a.games++;
      muHome += o.meanAlpha * (game.homeCount - muHome);
      muAway += o.meanAlpha * (game.awayCount - muAway);
    },
    leagueMeans(): { home: number; away: number } {
      return { home: muHome, away: muAway };
    },
  };
}

export type CountTracker = ReturnType<typeof createCountTracker>;

/**
 * Tamaño `r` de la binomial negativa por método de momentos: Var = m + m²/r.
 * `Infinity` (Poisson) si no hay sobredispersión.
 */
export function estimateDispersion(rows: ReadonlyArray<{ expected: number; observed: number }>): number {
  let num = 0;
  let den = 0;
  for (const { expected: m, observed: y } of rows) {
    num += m * m;
    den += (y - m) * (y - m) - m;
  }
  if (rows.length < 50 || den <= 0) return Number.POSITIVE_INFINITY;
  return num / den;
}

/** Función de masa de la binomial negativa (media `mean`, tamaño `size`); Poisson si `size` es infinito. */
export function negBinomialPmf(mean: number, size: number, max: number): number[] {
  const m = Math.max(1e-9, mean);
  const out: number[] = [];
  if (!Number.isFinite(size)) {
    out.push(Math.exp(-m));
    for (let k = 1; k <= max; k++) out.push((out[k - 1]! * m) / k);
    return out;
  }
  const q = m / (size + m);
  out.push(Math.pow(size / (size + m), size));
  for (let k = 1; k <= max; k++) out.push((out[k - 1]! * (k - 1 + size) * q) / k);
  return out;
}

/** Tamaño de la suma de dos conteos independientes con el mismo `size` (aproximación por momentos). */
export function sumDispersion(meanA: number, meanB: number, size: number): number {
  if (!Number.isFinite(size)) return size;
  const m = meanA + meanB;
  const extra = (meanA * meanA + meanB * meanB) / size;
  return extra > 0 ? (m * m) / extra : Number.POSITIVE_INFINITY;
}

/** P(X > line) para una línea con .5. */
export function overProbability(mean: number, size: number, line: number): number {
  const max = Math.max(60, Math.ceil(mean * 4));
  const pmf = negBinomialPmf(mean, size, max);
  let under = 0;
  for (let k = 0; k <= Math.floor(line); k++) under += pmf[k]!;
  return Math.min(1 - 1e-4, Math.max(1e-4, 1 - under));
}

/** Línea .5 más cercana a la mediana (la que más se acerca a 50/50). */
export function balancedLine(mean: number, size: number): number {
  const max = Math.max(60, Math.ceil(mean * 4));
  const pmf = negBinomialPmf(mean, size, max);
  let acc = 0;
  for (let k = 0; k <= max; k++) {
    acc += pmf[k]!;
    if (acc >= 0.5) {
      // Entre k−0.5 y k+0.5, la que deja la probabilidad más cerca de 0.5.
      const below = acc - pmf[k]!;
      return Math.abs(0.5 - below) < Math.abs(acc - 0.5) && k > 0 ? k - 0.5 : k + 0.5;
    }
  }
  return Math.round(mean) + 0.5;
}

/** Log-verosimilitud del conteo observado. */
export function countLogLik(mean: number, size: number, observed: number): number {
  const pmf = negBinomialPmf(mean, size, Math.max(observed, 1));
  return Math.log(Math.max(1e-12, pmf[observed]!));
}
