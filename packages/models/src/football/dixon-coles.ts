/**
 * Modelo de fútbol v2 — Dixon-Coles con parámetros estimados.
 *
 * Diferencias con el Baseline 0 (`@pitchlab/engines-reference`):
 *  - Ataque y defensa se estiman por máxima verosimilitud (IPF) en vez de ser goles brutos.
 *  - El ajuste es por rival: cada gol se pondera por la calidad del contrario.
 *  - Decaimiento temporal exponencial (ξ) sobre los partidos.
 *  - Ventaja de local (H) y dependencia de marcadores bajos (ρ) estimadas de los datos.
 *  - Incertidumbre por información de Fisher y simulación determinista.
 *
 * Todo el cálculo es determinista: mismos datos → mismos números.
 */
import { clamp, gaussian, makeRng, mean, poissonPmf, quantileSorted } from "../math.js";
import { coherentScore } from "../picks.js";

export interface FootballMatchRow {
  date: string; // ISO (yyyy-mm-dd)
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /**
   * Peso relativo opcional (0..1). Se multiplica por el decaimiento temporal.
   * Sirve para incorporar la temporada anterior con menos influencia que la actual.
   */
  weight?: number;
}

export interface DixonColesOptions {
  /** Decaimiento temporal por día (Dixon-Coles clásico ≈ 0.0019). */
  xi?: number;
  /** Pseudo-partidos de contracción hacia la media (regularización). */
  priorMatches?: number;
  maxIterations?: number;
  tolerance?: number;
  /** Fecha de corte; por defecto, el partido más reciente. */
  referenceDate?: string;
  /** Prior de la ventaja de local (multiplicador). */
  priorHomeAdvantage?: number;
  /** Rejilla máxima de goles para probabilidades. */
  gridSize?: number;
  /** Callback de diagnóstico por iteración (usado en pruebas). */
  onIteration?: (info: { iteration: number; delta: number; baseRate: number; homeAdvantage: number }) => void;
}

export interface DixonColesModel {
  attack: Record<string, number>;
  defense: Record<string, number>;
  /** Multiplicador de localía sobre los goles esperados del local. */
  homeAdvantage: number;
  /** Goles por equipo por partido (nivel de la liga). */
  baseRate: number;
  /** Dependencia de marcadores bajos. */
  rho: number;
  matches: number;
  weightedMatches: number;
  xi: number;
  converged: boolean;
  iterations: number;
  /** Última variación máxima de parámetros (diagnóstico de convergencia). */
  lastDelta: number;
  /** Error estándar de log(ataque) por equipo (información de Fisher). */
  seLogAttack: Record<string, number>;
  seLogDefense: Record<string, number>;
  seLogHomeAdvantage: number;
  gridSize: number;
}

const EPS = 1e-9;

export function fitDixonColes(
  matches: readonly FootballMatchRow[],
  options: DixonColesOptions = {},
): DixonColesModel {
  const xi = options.xi ?? 0.0019;
  const priorMatches = options.priorMatches ?? 4;
  const maxIterations = options.maxIterations ?? 400;
  const tolerance = options.tolerance ?? 1e-6;
  const priorHome = options.priorHomeAdvantage ?? 1.15;
  const gridSize = options.gridSize ?? 11;

  const valid = matches.filter(
    (m) =>
      Number.isFinite(m.homeGoals) &&
      Number.isFinite(m.awayGoals) &&
      m.homeGoals >= 0 &&
      m.awayGoals >= 0,
  );

  const teams = [...new Set(valid.flatMap((m) => [m.home, m.away]))].sort();

  if (valid.length === 0 || teams.length === 0) {
    return {
      attack: {},
      defense: {},
      homeAdvantage: priorHome,
      baseRate: 1.4,
      rho: 0,
      matches: 0,
      weightedMatches: 0,
      xi,
      converged: true,
      iterations: 0,
      lastDelta: 0,
      seLogAttack: {},
      seLogDefense: {},
      seLogHomeAdvantage: 1,
      gridSize,
    };
  }

  const referenceMs = options.referenceDate
    ? Date.parse(options.referenceDate)
    : Math.max(...valid.map((m) => Date.parse(m.date)));

  const rows = valid.map((m) => {
    const ms = Date.parse(m.date);
    const days = Number.isFinite(ms) ? Math.max(0, (referenceMs - ms) / 86_400_000) : 0;
    const extra = m.weight ?? 1;
    return { ...m, weight: Math.exp(-xi * days) * Math.max(0, extra) };
  });

  const weightSum = rows.reduce((s, r) => s + r.weight, 0);
  const observedGoals = rows.reduce((s, r) => s + r.weight * (r.homeGoals + r.awayGoals), 0);
  let baseRate = observedGoals / (weightSum * 2);

  const attack: Record<string, number> = {};
  const defense: Record<string, number> = {};
  for (const t of teams) {
    attack[t] = 1;
    defense[t] = 1;
  }
  let homeAdvantage = priorHome;

  const k = Math.max(0, priorMatches);
  let converged = false;
  let iterations = 0;
  let lastDelta = Number.POSITIVE_INFINITY;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;

    // 1) Estado de referencia para medir convergencia en la parametrización canónica.
    const prevAttack: Record<string, number> = { ...attack };
    const prevDefense: Record<string, number> = { ...defense };
    const prevHome = homeAdvantage;
    const previousBase = baseRate;
    let totalIndex = 0;
    for (const r of rows) {
      totalIndex +=
        r.weight *
        (attack[r.home]! * defense[r.away]! * homeAdvantage + attack[r.away]! * defense[r.home]!);
    }
    baseRate = totalIndex > 0 ? observedGoals / totalIndex : baseRate;
    const mu = Math.max(baseRate, 1e-6);

    const attackNum: Record<string, number> = {};
    const attackDen: Record<string, number> = {};
    const defenseNum: Record<string, number> = {};
    const defenseDen: Record<string, number> = {};
    for (const t of teams) {
      attackNum[t] = 0;
      attackDen[t] = 0;
      defenseNum[t] = 0;
      defenseDen[t] = 0;
    }

    let homeGoalsWeighted = 0;
    let homeExpectation = 0;

    for (const r of rows) {
      const w = r.weight;
      attackNum[r.home]! += (w * r.homeGoals) / mu;
      attackNum[r.away]! += (w * r.awayGoals) / mu;
      defenseNum[r.home]! += (w * r.awayGoals) / mu;
      defenseNum[r.away]! += (w * r.homeGoals) / mu;

      attackDen[r.home]! += w * defense[r.away]! * homeAdvantage;
      attackDen[r.away]! += w * defense[r.home]!;
      defenseDen[r.home]! += w * attack[r.away]!;
      defenseDen[r.away]! += w * attack[r.home]!;

      homeGoalsWeighted += w * r.homeGoals;
      homeExpectation += w * attack[r.home]! * defense[r.away]!;
    }

    let maxDelta = 0;
    for (const t of teams) {
      // Actualización IPF pura y contracción posterior hacia 1 con peso k/(exposición+k).
      const exposureAttack = attackDen[t]!;
      const exposureDefense = defenseDen[t]!;
      const rawAttack = attackNum[t]! / Math.max(exposureAttack, EPS);
      const rawDefense = defenseNum[t]! / Math.max(exposureDefense, EPS);
      attack[t] = (exposureAttack * rawAttack + k) / (exposureAttack + k);
      defense[t] = (exposureDefense * rawDefense + k) / (exposureDefense + k);
    }

    const rawHome = homeGoalsWeighted / Math.max(mu * homeExpectation, EPS);
    const nextHome =
      (homeExpectation * rawHome + k * priorHome) / Math.max(homeExpectation + k, EPS);
    homeAdvantage = nextHome;

    // 3) Identificación estable: media geométrica 1 y nivel absorbido por baseRate.
    const gmAttack = Math.exp(mean(teams.map((t) => Math.log(Math.max(attack[t]!, EPS)))));
    const gmDefense = Math.exp(mean(teams.map((t) => Math.log(Math.max(defense[t]!, EPS)))));
    for (const t of teams) {
      attack[t] = attack[t]! / gmAttack;
      defense[t] = defense[t]! / gmDefense;
    }
    baseRate = baseRate * gmAttack * gmDefense;

    // Convergencia medida sobre la parametrización canónica (gm = 1), no sobre el paso interno.
    for (const t of teams) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(Math.log(Math.max(attack[t]!, EPS) / Math.max(prevAttack[t]!, EPS))),
        Math.abs(Math.log(Math.max(defense[t]!, EPS) / Math.max(prevDefense[t]!, EPS))),
      );
    }
    maxDelta = Math.max(
      maxDelta,
      Math.abs(Math.log(Math.max(homeAdvantage, EPS) / Math.max(prevHome, EPS))),
      Math.abs(Math.log(Math.max(baseRate, EPS) / Math.max(previousBase, EPS))),
    );
    lastDelta = maxDelta;
    options.onIteration?.({ iteration: iter, delta: maxDelta, baseRate, homeAdvantage });

    if (maxDelta < tolerance) {
      converged = true;
      break;
    }
  }

  const lambdaHome = (h: string, a: string) =>
    Math.max(EPS, baseRate * attack[h]! * defense[a]! * homeAdvantage);
  const lambdaAway = (h: string, a: string) =>
    Math.max(EPS, baseRate * attack[a]! * defense[h]!);

  const rho = estimateRho(rows, lambdaHome, lambdaAway, gridSize);

  // Información de Fisher para log(ataque), log(defensa) y log(localía).
  const seLogAttack: Record<string, number> = {};
  const seLogDefense: Record<string, number> = {};
  const exposureAttack: Record<string, number> = {};
  const exposureDefense: Record<string, number> = {};
  let homeInfo = k;
  for (const t of teams) {
    exposureAttack[t] = k;
    exposureDefense[t] = k;
  }
  for (const r of rows) {
    exposureAttack[r.home]! += r.weight * defense[r.away]! * homeAdvantage;
    exposureAttack[r.away]! += r.weight * defense[r.home]!;
    exposureDefense[r.home]! += r.weight * attack[r.away]!;
    exposureDefense[r.away]! += r.weight * attack[r.home]!;
    homeInfo += r.weight * attack[r.home]! * defense[r.away]!;
  }
  for (const t of teams) {
    seLogAttack[t] = 1 / Math.sqrt(Math.max(baseRate * attack[t]! * exposureAttack[t]!, EPS));
    seLogDefense[t] = 1 / Math.sqrt(Math.max(baseRate * defense[t]! * exposureDefense[t]!, EPS));
  }
  const seLogHomeAdvantage = 1 / Math.sqrt(Math.max(baseRate * homeAdvantage * homeInfo, EPS));

  return {
    attack,
    defense,
    homeAdvantage,
    baseRate,
    rho,
    matches: valid.length,
    weightedMatches: weightSum,
    xi,
    converged,
    iterations,
    lastDelta,
    seLogAttack,
    seLogDefense,
    seLogHomeAdvantage,
    gridSize,
  };
}

interface WeightedRow extends FootballMatchRow {
  weight: number;
}

/** ρ por máxima verosimilitud ponderada sobre una rejilla. */
export function estimateRho(
  rows: readonly WeightedRow[],
  lambdaHome: (h: string, a: string) => number,
  lambdaAway: (h: string, a: string) => number,
  gridSize: number,
  grid: readonly number[] = Array.from({ length: 51 }, (_, i) => -0.2 + i * 0.005),
): number {
  if (rows.length === 0) return 0;

  const cached = rows.map((r) => ({
    row: r,
    lh: lambdaHome(r.home, r.away),
    la: lambdaAway(r.home, r.away),
    matrix: poissonPmf(Math.min(lambdaHome(r.home, r.away), 8), gridSize),
    matrixAway: poissonPmf(Math.min(lambdaAway(r.home, r.away), 8), gridSize),
  }));

  let bestRho = 0;
  let bestLl = -Infinity;

  for (const rho of grid) {
    let ll = 0;
    for (const c of cached) {
      const { row } = c;
      let total = 0;
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          total += c.matrix[i]! * c.matrixAway[j]! * tau(i, j, c.lh, c.la, rho);
        }
      }
      if (total <= 0) continue;
      // Los goles observados pueden venir como xG (valores continuos): para la rejilla
      // de ρ se redondean al marcador entero más cercano.
      const hi = Math.min(Math.round(row.homeGoals), gridSize - 1);
      const ai = Math.min(Math.round(row.awayGoals), gridSize - 1);
      const p =
        (c.matrix[hi]! * c.matrixAway[ai]! * tau(hi, ai, c.lh, c.la, rho)) / total;
      ll += row.weight * Math.log(Math.max(p, 1e-12));
    }
    if (ll > bestLl) {
      bestLl = ll;
      bestRho = rho;
    }
  }

  return Math.round(bestRho * 1000) / 1000;
}

/** Factor de dependencia de Dixon-Coles para marcadores bajos. */
export function tau(i: number, j: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (i === 0 && j === 0) return Math.max(EPS, 1 - lambdaHome * lambdaAway * rho);
  if (i === 0 && j === 1) return Math.max(EPS, 1 + lambdaHome * rho);
  if (i === 1 && j === 0) return Math.max(EPS, 1 + lambdaAway * rho);
  if (i === 1 && j === 1) return Math.max(EPS, 1 - rho);
  return 1;
}

export interface FootballPrediction {
  lambdaHome: number;
  lambdaAway: number;
  total: number;
  probabilities: { home: number; draw: number; away: number };
  doubleChance: { homeOrDraw: number; drawOrAway: number; homeOrAway: number };
  totals: Array<{ line: number; over: number; under: number }>;
  btts: { yes: number; no: number };
  teamTotals: {
    home: { line: number; over: number; under: number };
    away: { line: number; over: number; under: number };
  };
  topScores: Array<{ home: number; away: number; p: number }>;
  mostLikelyScore: { home: number; away: number; p: number };
  /** Marcador más probable dentro del resultado y del lado de 2.5 favoritos. */
  projectedScore: { home: number; away: number; p: number };
  /** 1X2 del modelo de temporada antes de mezclar con la memoria larga. */
  seasonProbabilities: { home: number; draw: number; away: number };
  intervals: {
    homeWin: [number, number];
    total: [number, number];
  };
}

const TOTAL_LINES = [1.5, 2.5, 3.5] as const;

/** Probabilidades 1X2 externas (p. ej. Elo) para mezclar con las del modelo. */
export interface OutcomeBlend {
  home: number;
  draw: number;
  away: number;
  /** Peso de la fuente externa (0 = solo el modelo, 1 = solo la externa). */
  weight: number;
}

/**
 * Reescala las tres regiones de la matriz (local gana, empate, visita gana) para que
 * sumen el 1X2 objetivo. Dentro de cada región se conserva la forma de la matriz, así
 * que totales, ambos anotan, hándicap y marcadores siguen siendo coherentes con el 1X2.
 */
export function rescaleMatrixToOutcome(
  matrix: number[][],
  target: { home: number; draw: number; away: number },
): number[][] {
  const size = matrix.length;
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const p = matrix[i]![j]!;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  const fh = home > 0 ? target.home / home : 1;
  const fd = draw > 0 ? target.draw / draw : 1;
  const fa = away > 0 ? target.away / away : 1;
  return matrix.map((row, i) =>
    row.map((p, j) => p * (i > j ? fh : i === j ? fd : fa)),
  );
}

/**
 * Marcador coherente a partir de una proyección ya publicada (goles esperados y 1X2).
 * Se usa para análisis anteriores a esta función: reconstruye la rejilla con los goles
 * esperados, la ajusta al 1X2 publicado y elige el marcador dentro de lo favorito.
 */
export function coherentScoreFromProjection(
  lambdaHome: number,
  lambdaAway: number,
  x12: readonly [number, number, number],
  rho = -0.05,
  size = 10,
): { home: number; away: number; p: number } {
  const matrix = scoreMatrix(lambdaHome, lambdaAway, rho, size);
  return coherentScore(rescaleMatrixToOutcome(matrix, { home: x12[0], draw: x12[1], away: x12[2] }));
}

function blendTarget(
  model: { home: number; draw: number; away: number },
  blend: OutcomeBlend,
): { home: number; draw: number; away: number } {
  const w = clamp(blend.weight, 0, 1);
  const raw = {
    home: (1 - w) * model.home + w * blend.home,
    draw: (1 - w) * model.draw + w * blend.draw,
    away: (1 - w) * model.away + w * blend.away,
  };
  const total = raw.home + raw.draw + raw.away;
  return { home: raw.home / total, draw: raw.draw / total, away: raw.away / total };
}

/**
 * Predice un partido con el modelo estimado.
 * La incertidumbre se propaga con 240 simulaciones deterministas de los parámetros.
 */
export function predictFootball(
  model: DixonColesModel,
  home: string,
  away: string,
  options: { simulations?: number; outcomeBlend?: OutcomeBlend } = {},
): FootballPrediction {
  const { gridSize } = model;
  const lambdaHome = baseLambdaHome(model, home, away);
  const lambdaAway = baseLambdaAway(model, home, away);

  const rawJoint = scoreMatrix(lambdaHome, lambdaAway, model.rho, gridSize);
  const rawOutcome = summarise(rawJoint, gridSize);
  const blend = options.outcomeBlend;
  const joint =
    blend && blend.weight > 0
      ? rescaleMatrixToOutcome(rawJoint, blendTarget(rawOutcome, blend))
      : rawJoint;
  const outcome = joint === rawJoint ? rawOutcome : summarise(joint, gridSize);
  // Desplazamiento del intervalo de victoria local para seguir al 1X2 mezclado.
  const homeShift = outcome.home - rawOutcome.home;

  const simulations = options.simulations ?? 240;
  const rng = makeRng(`${home}|${away}|${model.matches}|${model.baseRate.toFixed(4)}`);
  const homeDraws: number[] = [];
  const totalDraws: number[] = [];

  const seAttackHome = model.seLogAttack[home] ?? 0.2;
  const seAttackAway = model.seLogAttack[away] ?? 0.2;
  const seDefenseHome = model.seLogDefense[home] ?? 0.2;
  const seDefenseAway = model.seLogDefense[away] ?? 0.2;
  const seHome = model.seLogHomeAdvantage;

  for (let s = 0; s < simulations; s++) {
    const aH = model.attack[home]! * Math.exp(gaussian(rng) * seAttackHome);
    const aA = model.attack[away]! * Math.exp(gaussian(rng) * seAttackAway);
    const dH = model.defense[home]! * Math.exp(gaussian(rng) * seDefenseHome);
    const dA = model.defense[away]! * Math.exp(gaussian(rng) * seDefenseAway);
    const h = model.homeAdvantage * Math.exp(gaussian(rng) * seHome);

    const lh = clamp(model.baseRate * aH * dA * h, 0.05, 6);
    const la = clamp(model.baseRate * aA * dH, 0.05, 6);
    const m = scoreMatrix(lh, la, model.rho, gridSize);
    const o = summarise(m, gridSize);
    homeDraws.push(o.home);
    totalDraws.push(lh + la);
  }

  homeDraws.sort((a, b) => a - b);
  totalDraws.sort((a, b) => a - b);

  return {
    lambdaHome,
    lambdaAway,
    total: lambdaHome + lambdaAway,
    probabilities: { home: outcome.home, draw: outcome.draw, away: outcome.away },
    doubleChance: {
      homeOrDraw: outcome.home + outcome.draw,
      drawOrAway: outcome.draw + outcome.away,
      homeOrAway: outcome.home + outcome.away,
    },
    totals: TOTAL_LINES.map((line) => ({
      line,
      over: outcome.over(line),
      under: 1 - outcome.over(line),
    })),
    btts: { yes: outcome.btts, no: 1 - outcome.btts },
    teamTotals: {
      home: {
        line: 1.5,
        over: outcome.overHome(1.5),
        under: 1 - outcome.overHome(1.5),
      },
      away: {
        line: 1.5,
        over: outcome.overAway(1.5),
        under: 1 - outcome.overAway(1.5),
      },
    },
    topScores: outcome.topScores,
    mostLikelyScore: outcome.mostLikely,
    projectedScore: coherentScore(joint),
    seasonProbabilities: {
      home: rawOutcome.home,
      draw: rawOutcome.draw,
      away: rawOutcome.away,
    },
    intervals: {
      homeWin: [
        clamp(quantileSorted(homeDraws, 0.05) + homeShift, 0, 1),
        clamp(quantileSorted(homeDraws, 0.95) + homeShift, 0, 1),
      ],
      total: [
        quantileSorted(totalDraws, 0.05),
        quantileSorted(totalDraws, 0.95),
      ],
    },
  };
}

export function baseLambdaHome(model: DixonColesModel, home: string, away: string): number {
  return clamp(
    model.baseRate * (model.attack[home] ?? 1) * (model.defense[away] ?? 1) * model.homeAdvantage,
    0.05,
    6,
  );
}

export function baseLambdaAway(model: DixonColesModel, home: string, away: string): number {
  return clamp(
    model.baseRate * (model.attack[away] ?? 1) * (model.defense[home] ?? 1),
    0.05,
    6,
  );
}

/** Matriz de marcadores (normalizada) con ajuste de Dixon-Coles. */
export function scoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
  size: number,
): number[][] {
  const ph = poissonPmf(lambdaHome, size);
  const pa = poissonPmf(lambdaAway, size);
  const matrix: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  let total = 0;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const value = ph[i]! * pa[j]! * tau(i, j, lambdaHome, lambdaAway, rho);
      matrix[i]![j] = value;
      total += value;
    }
  }
  if (total > 0) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        matrix[i]![j] = matrix[i]![j]! / total;
      }
    }
  }
  return matrix;
}

function summarise(
  matrix: number[][],
  size: number,
): {
  home: number;
  draw: number;
  away: number;
  btts: number;
  over: (line: number) => number;
  overHome: (line: number) => number;
  overAway: (line: number) => number;
  mostLikely: { home: number; away: number; p: number };
  topScores: Array<{ home: number; away: number; p: number }>;
} {
  let home = 0;
  let draw = 0;
  let away = 0;
  let btts = 0;
  let best = { home: 0, away: 0, p: -1 };
  const totals = new Array<number>(2 * size).fill(0);
  const homeGoals = new Array<number>(size).fill(0);
  const awayGoals = new Array<number>(size).fill(0);
  const cells: Array<{ home: number; away: number; p: number }> = [];

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const p = matrix[i]![j]!;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i > 0 && j > 0) btts += p;
      if (p > best.p) best = { home: i, away: j, p };
      const idx = i + j;
      if (idx < totals.length) totals[idx]! += p;
      homeGoals[i]! += p;
      awayGoals[j]! += p;
      if (p > 0) cells.push({ home: i, away: j, p });
    }
  }

  const overFrom = (marginal: number[], line: number): number => {
    let acc = 0;
    for (let k = 0; k <= Math.floor(line); k++) acc += marginal[k] ?? 0;
    return 1 - acc;
  };

  cells.sort((a, b) => b.p - a.p);

  return {
    home,
    draw,
    away,
    btts,
    over: (line: number) => {
      let acc = 0;
      for (let k = 0; k <= Math.floor(line); k++) acc += totals[k] ?? 0;
      return 1 - acc;
    },
    overHome: (line: number) => overFrom(homeGoals, line),
    overAway: (line: number) => overFrom(awayGoals, line),
    mostLikely: best,
    topScores: cells.slice(0, 3),
  };
}
