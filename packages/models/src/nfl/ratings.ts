/**
 * Modelo NFL v2 — ratings de ofensiva/defensiva ajustados por rival.
 *
 * Diferencias con el Baseline 0 (`@pitchlab/engines-reference`):
 *  - Los ratings se estiman resolviendo un sistema de mínimos cuadrados regularizado (ridge)
 *    sobre los marcadores, no con puntos brutos por partido.
 *  - El ajuste es por rival y por calendario (fuerza de calendario emergente).
 *  - La localía y la desviación de margen/total se estiman de los residuales.
 *  - Permite arrastrar la temporada anterior con peso reducido.
 */
import { normalCdf, sampleSd } from "../math.js";

export interface NflMatchRow {
  date?: string;
  week?: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

export interface NflRatingsOptions {
  /** Penalización ridge sobre ofensiva/defensiva (en partidos equivalentes). */
  ridge?: number;
  maxIterations?: number;
  tolerance?: number;
  /** Filas de la temporada anterior (se ponderan con `priorWeight`). */
  priorRows?: readonly NflMatchRow[];
  priorWeight?: number;
}

export interface NflRatingsModel {
  offense: Record<string, number>;
  defense: Record<string, number>;
  /** Puntos esperados por equipo contra una defensa promedio en campo neutral. */
  intercept: number;
  /** Mitad de la ventaja de local (el total del local es `intercept + homeHalf`). */
  homeHalf: number;
  sigmaMargin: number;
  sigmaTotal: number;
  games: number;
  weightedGames: number;
  ridge: number;
  iterations: number;
  converged: boolean;
}

interface WeightedGame {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  weight: number;
  current: boolean;
}

export function fitNflRatings(
  rows: readonly NflMatchRow[],
  options: NflRatingsOptions = {},
): NflRatingsModel {
  const ridge = options.ridge ?? 8;
  const maxIterations = options.maxIterations ?? 500;
  const tolerance = options.tolerance ?? 1e-9;
  const priorWeight = options.priorWeight ?? 0.25;

  const games: WeightedGame[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.homeScore) || !Number.isFinite(r.awayScore)) continue;
    games.push({ ...r, weight: 1, current: true });
  }
  for (const r of options.priorRows ?? []) {
    if (!Number.isFinite(r.homeScore) || !Number.isFinite(r.awayScore)) continue;
    games.push({ ...r, weight: priorWeight, current: false });
  }

  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort();

  if (games.length === 0 || teams.length === 0) {
    return {
      offense: {},
      defense: {},
      intercept: 23,
      homeHalf: 1,
      sigmaMargin: 13.4,
      sigmaTotal: 13.3,
      games: 0,
      weightedGames: 0,
      ridge,
      iterations: 0,
      converged: true,
    };
  }

  const offense: Record<string, number> = {};
  const defense: Record<string, number> = {};
  for (const t of teams) {
    offense[t] = 0;
    defense[t] = 0;
  }

  const weightSum = games.reduce((s, g) => s + g.weight, 0);
  let intercept =
    games.reduce((s, g) => s + g.weight * (g.homeScore + g.awayScore), 0) / (2 * weightSum);
  let homeHalf =
    games.reduce((s, g) => s + g.weight * (g.homeScore - g.awayScore), 0) / (2 * weightSum);

  const gamesByTeam = new Map<string, WeightedGame[]>();
  for (const t of teams) gamesByTeam.set(t, []);
  for (const g of games) {
    gamesByTeam.get(g.home)!.push(g);
    gamesByTeam.get(g.away)!.push(g);
  }

  let converged = false;
  let iterations = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    let maxDelta = 0;

    for (const t of teams) {
      let offNum = 0;
      let offDen = ridge;
      let defNum = 0;
      let defDen = ridge;

      for (const g of gamesByTeam.get(t)!) {
        const w = g.weight;
        offDen += w;
        defDen += w;
        if (g.home === t) {
          offNum += w * (g.homeScore - intercept - homeHalf + defense[g.away]!);
          defNum += w * (intercept - homeHalf + offense[g.away]! - g.awayScore);
        } else {
          offNum += w * (g.awayScore - intercept + homeHalf + defense[g.home]!);
          defNum += w * (intercept + homeHalf + offense[g.home]! - g.homeScore);
        }
      }

      const nextOff = offNum / Math.max(offDen, 1e-9);
      const nextDef = defNum / Math.max(defDen, 1e-9);
      maxDelta = Math.max(maxDelta, Math.abs(nextOff - offense[t]!), Math.abs(nextDef - defense[t]!));
      offense[t] = nextOff;
      defense[t] = nextDef;
    }

    let interceptNum = 0;
    let halfNum = 0;
    for (const g of games) {
      interceptNum +=
        g.weight *
        (g.homeScore + g.awayScore - (offense[g.home]! - defense[g.away]!) - (offense[g.away]! - defense[g.home]!));
      halfNum +=
        g.weight *
        (g.homeScore - g.awayScore - (offense[g.home]! - defense[g.away]!) + (offense[g.away]! - defense[g.home]!));
    }
    const nextIntercept = interceptNum / (2 * weightSum);
    // Prior de localía: con pocas semanas el estimador libre puede dar valores negativos.
    // Se contrae hacia 1.5 puntos totales (0.75 por lado) con el peso de ~40 partidos.
    const homePriorTotal = 1.5;
    const homePriorWeight = 40;
    const nextHalf =
      (halfNum + homePriorWeight * (homePriorTotal / 2)) / (2 * weightSum + homePriorWeight);
    maxDelta = Math.max(
      maxDelta,
      Math.abs(nextIntercept - intercept),
      Math.abs(nextHalf - homeHalf),
    );
    intercept = nextIntercept;
    homeHalf = nextHalf;

    // Sin centrado: el ridge ya identifica el modelo (ofensiva + defensiva comparten un
    // grado de libertad). Restar medias distintas a ofensiva y defensiva desplazaba las
    // predicciones en cada iteración y hacía divergir el solver con muestras grandes.

    if (maxDelta < tolerance) {
      converged = true;
      break;
    }
  }

  const marginResiduals: number[] = [];
  const totalResiduals: number[] = [];
  for (const g of games) {
    if (!g.current) continue;
    const predictedMargin =
      2 * homeHalf +
      (offense[g.home]! - defense[g.away]!) -
      (offense[g.away]! - defense[g.home]!);
    const predictedTotal =
      2 * intercept +
      (offense[g.home]! - defense[g.away]!) +
      (offense[g.away]! - defense[g.home]!);
    marginResiduals.push(g.homeScore - g.awayScore - predictedMargin);
    totalResiduals.push(g.homeScore + g.awayScore - predictedTotal);
  }

  const currentGames = games.filter((g) => g.current).length;

  return {
    offense,
    defense,
    intercept,
    homeHalf,
    sigmaMargin: Math.max(10, sampleSd(marginResiduals) || 13.4),
    sigmaTotal: Math.max(10, sampleSd(totalResiduals) || 13.3),
    games: currentGames,
    weightedGames: weightSum,
    ridge,
    iterations,
    converged,
  };
}

export interface NflPrediction {
  homePoints: number;
  awayPoints: number;
  total: number;
  margin: number;
  pHome: number;
  pAway: number;
  spread: { line: number; home: number; away: number };
  totals: { line: number; over: number; under: number };
  intervals: { margin: [number, number]; total: [number, number] };
}

export function predictNfl(
  model: NflRatingsModel,
  home: string,
  away: string,
  options: { neutralSite?: boolean } = {},
): NflPrediction {
  const homeHalf = options.neutralSite ? 0 : model.homeHalf;
  const offH = model.offense[home] ?? 0;
  const defH = model.defense[home] ?? 0;
  const offA = model.offense[away] ?? 0;
  const defA = model.defense[away] ?? 0;

  const homePoints = model.intercept + homeHalf + offH - defA;
  const awayPoints = model.intercept - homeHalf + offA - defH;
  const margin = homePoints - awayPoints;
  const total = homePoints + awayPoints;

  const sigmaMargin = Math.max(1, model.sigmaMargin);
  const sigmaTotal = Math.max(1, model.sigmaTotal);

  const pHome = normalCdf(margin / sigmaMargin);
  const line = Math.max(1.5, Math.floor(Math.abs(margin)) + 0.5);
  const homeLine = margin >= 0 ? -line : line;
  const homeCover = normalCdf((margin + homeLine) / sigmaMargin);
  const totalLine = Math.floor(total) + 0.5;
  const overP = 1 - normalCdf((totalLine - total) / sigmaTotal);

  return {
    homePoints,
    awayPoints,
    total,
    margin,
    pHome,
    pAway: 1 - pHome,
    spread: {
      line: homeLine,
      home: homeCover,
      away: 1 - homeCover,
    },
    totals: {
      line: totalLine,
      over: overP,
      under: 1 - overP,
    },
    intervals: {
      margin: [margin - 1.645 * sigmaMargin, margin + 1.645 * sigmaMargin],
      total: [total - 1.645 * sigmaTotal, total + 1.645 * sigmaTotal],
    },
  };
}
