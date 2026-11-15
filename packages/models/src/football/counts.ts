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
  /** Nombre o identificador del árbitro; opcional (si falta o está desactivado, multiplicador = 1). */
  referee?: string | null;
}

export interface RefereeCountOptions {
  /** Si es `true`, aplica el multiplicador log-lineal del árbitro sobre la predicción. */
  enabled: boolean;
  /** Paso de actualización sobre el error relativo total del partido. */
  k: number;
  /** Fracción de regresión fuerte hacia 0 (multiplicador 1) al cambiar de temporada. */
  seasonRegression: number;
  /** Contracción bayesiana hacia 1: `peso = games / (games + shrinkageGames)`. */
  shrinkageGames: number;
  /** Mínimo de partidos dirigidos antes de activar el multiplicador (antes vale 1). */
  minGames: number;
  /** Cota simétrica en escala log para el efecto del árbitro. */
  maxLog: number;
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
  /** Multiplicador opcional del árbitro (desactivado por defecto si no mejora fuera de muestra). */
  referee?: Partial<RefereeCountOptions>;
}

export type CountStat = "corners" | "fouls" | "yellow";

/** Configuración base del multiplicador del árbitro (apagado hasta validar en backtest). */
export const REFEREE_COUNT_DEFAULTS: Readonly<RefereeCountOptions> = {
  enabled: false,
  k: 0.03,
  seasonRegression: 0.5,
  shrinkageGames: 40,
  minGames: 15,
  maxLog: 0.35,
};

/**
 * Parámetros elegidos por `backtest:counts` con las temporadas europeas 2010-11…2017-18
 * (`Reportes/modelos/BACKTEST-CORNERS-FOULS.json`).
 */
export const COUNT_DEFAULTS: Readonly<Record<CountStat, CountOptions>> = {
  corners: { k: 0.02, seasonRegression: 0.35, meanAlpha: 0.005, initialHome: 5.83, initialAway: 4.55 },
  fouls: {
    k: 0.05,
    seasonRegression: 0.35,
    meanAlpha: 0.005,
    initialHome: 14.42,
    initialAway: 14.99,
    referee: { enabled: true, k: 0.05, seasonRegression: 0.4, shrinkageGames: 30, minGames: 15, maxLog: 0.35 },
  },
  yellow: {
    k: 0.02,
    seasonRegression: 0.5,
    meanAlpha: 0.01,
    initialHome: 1.7,
    initialAway: 2.09,
    referee: { enabled: true, k: 0.03, seasonRegression: 0.4, shrinkageGames: 30, minGames: 15, maxLog: 0.35 },
  },
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
  /** Multiplicador log-lineal del árbitro aplicado (`1` si está apagado, falta o no cumple el mínimo). */
  refereeMultiplier: number;
  /** Partidos con el dato del árbitro que ya vio el motor (todas las temporadas). */
  refereeGames: number;
}

interface TeamCount {
  gen: number;
  con: number;
  season: string;
  games: number;
}

interface RefereeCount {
  bias: number;
  season: string;
  games: number;
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function normalizeRefereeKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return key.length > 0 ? key : null;
}

export function createCountTracker(options: Partial<CountOptions> = {}) {
  const o: CountOptions = { ...COUNT_DEFAULTS.corners, ...options };
  const refOpts: RefereeCountOptions = { ...REFEREE_COUNT_DEFAULTS, ...options.referee };
  const teams = new Map<string, TeamCount>();
  const referees = new Map<string, RefereeCount>();
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

  const referee = (rawName: string | null | undefined, season: string): RefereeCount | null => {
    if (!refOpts.enabled) return null;
    const id = normalizeRefereeKey(rawName);
    if (!id) return null;
    let ref = referees.get(id);
    if (!ref) {
      ref = { bias: 0, season, games: 0 };
      referees.set(id, ref);
    } else if (ref.season !== season) {
      ref.bias *= Math.max(0, 1 - refOpts.seasonRegression);
      ref.season = season;
    }
    return ref;
  };

  function teamExpected(home: TeamCount, away: TeamCount): { home: number; away: number } {
    return {
      home: muHome * Math.exp(clip(home.gen + away.con, -1.2, 1.2)),
      away: muAway * Math.exp(clip(away.gen + home.con, -1.2, 1.2)),
    };
  }

  function refereeLogEffect(ref: RefereeCount | null): number {
    if (!refOpts.enabled || !ref || ref.games < refOpts.minGames) return 0;
    const shrink = refOpts.shrinkageGames > 0 ? ref.games / (ref.games + refOpts.shrinkageGames) : 1;
    return clip(ref.bias * shrink, -refOpts.maxLog, refOpts.maxLog);
  }

  function expected(home: TeamCount, away: TeamCount, ref: RefereeCount | null): { home: number; away: number; mult: number } {
    const base = teamExpected(home, away);
    const mult = Math.exp(refereeLogEffect(ref));
    return { home: base.home * mult, away: base.away * mult, mult };
  }

  return {
    predict(game: Pick<CountGame, "home" | "away" | "season" | "referee">): CountPrediction {
      const h = team(game.home, game.season);
      const a = team(game.away, game.season);
      const ref = referee(game.referee, game.season);
      const e = expected(h, a, ref);
      return {
        home: e.home,
        away: e.away,
        total: e.home + e.away,
        homeGames: h.games,
        awayGames: a.games,
        refereeMultiplier: e.mult,
        refereeGames: ref?.games ?? 0,
      };
    },
    update(game: CountGame): void {
      const h = team(game.home, game.season);
      const a = team(game.away, game.season);
      const ref = referee(game.referee, game.season);
      const base = teamExpected(h, a);
      const mult = Math.exp(refereeLogEffect(ref));
      const e = { home: base.home * mult, away: base.away * mult };
      // Error relativo (gradiente de la log-verosimilitud de Poisson en escala log), acotado para
      // que un partido raro (expulsión, prórroga de 10 minutos) no mueva de más.
      const errHome = clip((game.homeCount - e.home) / e.home, -1, 1.5);
      const errAway = clip((game.awayCount - e.away) / e.away, -1, 1.5);
      if (ref) {
        // Se estima sobre el sesgo sin contraer para no compensar la contracción bayesiana `g/(g+S)`.
        const expectedUnshrunk = (base.home + base.away) * Math.exp(clip(ref.bias, -1.2, 1.2));
        const errRef = clip((game.homeCount + game.awayCount - expectedUnshrunk) / expectedUnshrunk, -1, 1.5);
        ref.bias = clip(ref.bias + refOpts.k * errRef, -1.2, 1.2);
        ref.games++;
      }
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
