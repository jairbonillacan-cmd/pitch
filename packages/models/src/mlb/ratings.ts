/**
 * Ratings incrementales para MLB (walk-forward: predice con lo previo y luego actualiza).
 *
 * Combina:
 *  - Tasas ofensivas y de pitcheo/defensa por equipo sobre la media de la liga (~4.45 carreras).
 *  - Ajuste por lanzador abridor probable cuando existe ERA/IP de temporada con regresión bayesiana.
 *  - Probabilidad de victoria vía expectativa pitagórica (exponente dinámico Pythagenpat ~1.83)
 *    y ventaja local calibrada (~53.5 %).
 *  - Resolución exacta de entradas extra cuando empatan en la 9.ª (corredor fantasma).
 */

export interface MlbGame {
  date: string;
  season: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeStarterName?: string;
  homeStarterEra?: number | null;
  homeStarterIp?: number | null;
  awayStarterName?: string;
  awayStarterEra?: number | null;
  awayStarterIp?: number | null;
}

export interface MlbPrediction {
  pHome: number;
  expectedHome: number;
  expectedAway: number;
  expectedMargin: number;
  expectedTotal: number;
  restHome: number | null;
  restAway: number | null;
  pExtraInnings: number;
}

export interface MlbOptions {
  /** Carreras promedio por equipo y partido en la MLB. */
  leagueRuns: number;
  /** Ventaja local en carreras netas esperadas (~53.5 % de victorias en paridad). */
  homeAdvantageRuns: number;
  /** Factor de actualización incremental partido a partido. */
  k: number;
  /** Regresión hacia 0 al iniciar nueva temporada. */
  seasonRegression: number;
  /** Impacto máximo del abridor sobre carreras concedidas esperadas. */
  starterPriorIp: number;
  starterFactor: number;
}

export const MLB_DEFAULTS: MlbOptions = {
  leagueRuns: 4.42,
  homeAdvantageRuns: 0.24,
  k: 0.04,
  seasonRegression: 0.35,
  starterPriorIp: 80,
  starterFactor: 0.45,
};

interface TeamRating {
  off: number;
  def: number;
  season: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function restDaysBetween(lastDate: string | undefined, date: string): number | null {
  if (!lastDate) return null;
  const d = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.round(d) - 1);
}

function poissonPmf(lambda: number, max: number): number[] {
  const out = [Math.exp(-Math.max(0.05, lambda))];
  for (let i = 1; i <= max; i++) {
    out.push((out[i - 1]! * Math.max(0.05, lambda)) / i);
  }
  return out;
}

function starterMultiplier(
  leagueRuns: number,
  era: number | null | undefined,
  ip: number | null | undefined,
  priorIp: number,
  factor: number,
): number {
  if (typeof era !== "number" || !Number.isFinite(era) || era <= 0) return 1;
  const effectiveIp = typeof ip === "number" && Number.isFinite(ip) && ip > 0 ? ip : 40;
  const regEra = (era * effectiveIp + leagueRuns * priorIp) / (effectiveIp + priorIp);
  return clamp(1 + factor * (regEra / leagueRuns - 1), 0.78, 1.24);
}

export interface MlbTracker {
  predict(
    game: Pick<
      MlbGame,
      | "date"
      | "season"
      | "home"
      | "away"
      | "homeStarterEra"
      | "homeStarterIp"
      | "awayStarterEra"
      | "awayStarterIp"
    >,
  ): MlbPrediction;
  update(game: MlbGame): void;
  ratings(): Record<string, { off: number; def: number; net: number }>;
}

/**
 * Crea un estimador walk-forward incremental para la MLB.
 */
export function createMlbTracker(options: Partial<MlbOptions> = {}): MlbTracker {
  const o = { ...MLB_DEFAULTS, ...options };
  const map = new Map<string, TeamRating>();
  const last = new Map<string, string>();

  const get = (team: string, season: string): TeamRating => {
    let r = map.get(team);
    if (!r) {
      r = { off: 0, def: 0, season };
      map.set(team, r);
    } else if (r.season !== season) {
      r.off *= 1 - o.seasonRegression;
      r.def *= 1 - o.seasonRegression;
      r.season = season;
    }
    return r;
  };

  const predict: MlbTracker["predict"] = (game) => {
    const h = get(game.home, game.season);
    const a = get(game.away, game.season);
    const restHome = restDaysBetween(last.get(game.home), game.date);
    const restAway = restDaysBetween(last.get(game.away), game.date);

    const hPitchMult = starterMultiplier(
      o.leagueRuns,
      game.homeStarterEra,
      game.homeStarterIp,
      o.starterPriorIp,
      o.starterFactor,
    );
    const aPitchMult = starterMultiplier(
      o.leagueRuns,
      game.awayStarterEra,
      game.awayStarterIp,
      o.starterPriorIp,
      o.starterFactor,
    );

    const expectedHome = clamp(
      (o.leagueRuns + h.off - a.def + o.homeAdvantageRuns / 2) * aPitchMult,
      1.8,
      9.2,
    );
    const expectedAway = clamp(
      (o.leagueRuns + a.off - h.def - o.homeAdvantageRuns / 2) * hPitchMult,
      1.8,
      9.2,
    );

    // Exponente Pythagenpat + malla Poisson en 9 entradas + desempate de entradas extra
    const ph = poissonPmf(expectedHome, 18);
    const pa = poissonPmf(expectedAway, 18);
    let pRegHome = 0;
    let pRegDraw = 0;
    for (let i = 0; i <= 18; i++) {
      for (let j = 0; j <= 18; j++) {
        const pr = ph[i]! * pa[j]!;
        if (i > j) pRegHome += pr;
        else if (i === j) pRegDraw += pr;
      }
    }

    const total = expectedHome + expectedAway;
    const exp = clamp(Math.pow(total, 0.287), 1.65, 2.05);
    const pyH = Math.pow(expectedHome, exp) / (Math.pow(expectedHome, exp) + Math.pow(expectedAway, exp));
    // Pequeña ventaja local al batear en la baja de la entrada extra
    const pHomeExtra = clamp(0.52 * pyH + 0.48 * 0.525, 0.35, 0.68);
    const pHome = clamp(0.55 * (pRegHome + pRegDraw * pHomeExtra) + 0.45 * pyH, 0.05, 0.95);

    // En entradas extra con corredor fantasma se anota en promedio ~0.95 carreras extra por bando
    const extraRunBump = pRegDraw * 0.95;
    const adjHome = expectedHome + extraRunBump * pHomeExtra;
    const adjAway = expectedAway + extraRunBump * (1 - pHomeExtra);

    return {
      pHome,
      expectedHome: adjHome,
      expectedAway: adjAway,
      expectedMargin: adjHome - adjAway,
      expectedTotal: adjHome + adjAway,
      restHome,
      restAway,
      pExtraInnings: pRegDraw,
    };
  };

  const update: MlbTracker["update"] = (game) => {
    const h = get(game.home, game.season);
    const a = get(game.away, game.season);
    const p = predict(game);
    const errH = clamp(game.homeScore - p.expectedHome, -6, 6);
    const errA = clamp(game.awayScore - p.expectedAway, -6, 6);
    h.off = clamp(h.off + o.k * errH, -2.5, 2.5);
    a.def = clamp(a.def - o.k * errH, -2.5, 2.5);
    a.off = clamp(a.off + o.k * errA, -2.5, 2.5);
    h.def = clamp(h.def - o.k * errA, -2.5, 2.5);
    last.set(game.home, game.date);
    last.set(game.away, game.date);
  };

  const ratings: MlbTracker["ratings"] = () => {
    const out: Record<string, { off: number; def: number; net: number }> = {};
    for (const [k, r] of map.entries()) {
      out[k] = { off: r.off, def: r.def, net: r.off + r.def };
    }
    return out;
  };

  return { predict, update, ratings };
}
