/**
 * Métricas de evaluación para el backtest walk-forward.
 * Todas son propias (sin dependencias) para que el reporte sea reproducible.
 */

export interface Outcome {
  /** Índice del resultado observado: 0 local, 1 empate, 2 visitante. */
  result1x2: 0 | 1 | 2;
  /** Goles o puntos del local y del visitante. */
  homeScore: number;
  awayScore: number;
}

export interface FootballPredictionRow {
  p1x2: [number, number, number];
  pOver25: number;
  pBtts: number;
}

export interface NflPredictionRow {
  pHome: number;
  pOver: number;
  /** Línea de total sobre la que se evalúa la probabilidad `pOver`. */
  totalLine: number;
}

export interface ModelMetrics {
  n: number;
  logLoss1x2: number;
  brier1x2: number;
  logLossOver: number;
  logLossBtts?: number;
  accuracy: number;
  /** Error de calibración esperado (ECE) sobre la clase elegida. */
  ece: number;
  reliability: Array<{
    bucket: [number, number];
    n: number;
    confidence: number;
    accuracy: number;
  }>;
}

interface CalibrationPair {
  p: number;
  hit: boolean;
}

/** ECE con 10 bins iguales sobre la probabilidad de la clase elegida. */
export function calibration(
  pairs: readonly CalibrationPair[],
  bins = 10,
): {
  ece: number;
  reliability: Array<{ bucket: [number, number]; n: number; confidence: number; accuracy: number }>;
} {
  const buckets = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const { p, hit } of pairs) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    const bucket = buckets[idx]!;
    bucket.n += 1;
    bucket.sumP += p;
    if (hit) bucket.hits += 1;
  }

  const total = pairs.length || 1;
  const reliability = buckets
    .map((bucket, i) => ({
      bucket: [i / bins, (i + 1) / bins] as [number, number],
      n: bucket.n,
      confidence: bucket.n > 0 ? bucket.sumP / bucket.n : 0,
      accuracy: bucket.n > 0 ? bucket.hits / bucket.n : 0,
    }))
    .filter((bucket) => bucket.n > 0);

  let ece = 0;
  for (const bucket of reliability) {
    ece += (bucket.n / total) * Math.abs(bucket.accuracy - bucket.confidence);
  }

  return { ece, reliability };
}

function safeLog(p: number): number {
  return -Math.log(Math.max(p, 1e-12));
}

export function evaluateFootball(
  rows: Array<{ prediction: FootballPredictionRow; outcome: Outcome }>,
): ModelMetrics {
  let log1 = 0;
  let brier = 0;
  let logOver = 0;
  let logBtts = 0;
  let hits = 0;
  const calib: CalibrationPair[] = [];

  for (const { prediction, outcome } of rows) {
    const p = prediction.p1x2;
    log1 += safeLog(p[outcome.result1x2] ?? 1e-12);
    let b = 0;
    for (let i = 0; i < 3; i++) {
      const y = i === outcome.result1x2 ? 1 : 0;
      const d = (p[i] ?? 0) - y;
      b += d * d;
    }
    brier += b;

    const isOver = outcome.homeScore + outcome.awayScore > 2.5;
    logOver += safeLog(isOver ? prediction.pOver25 : 1 - prediction.pOver25);
    const isBtts = outcome.homeScore > 0 && outcome.awayScore > 0;
    logBtts += safeLog(isBtts ? prediction.pBtts : 1 - prediction.pBtts);

    const best = p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2;
    if (best === outcome.result1x2) hits++;
    calib.push({ p: p[best] ?? 0, hit: best === outcome.result1x2 });
  }

  const n = rows.length || 1;
  const { ece, reliability } = calibration(calib);
  return {
    n: rows.length,
    logLoss1x2: log1 / n,
    brier1x2: brier / n,
    logLossOver: logOver / n,
    logLossBtts: logBtts / n,
    accuracy: hits / n,
    ece,
    reliability,
  };
}

export function evaluateNfl(
  rows: Array<{ prediction: NflPredictionRow; outcome: Outcome }>,
): ModelMetrics {
  let log1 = 0;
  let brier = 0;
  let logOver = 0;
  let hits = 0;
  const calib: CalibrationPair[] = [];

  for (const { prediction, outcome } of rows) {
    const homeWon = outcome.homeScore > outcome.awayScore;
    const p = homeWon ? prediction.pHome : 1 - prediction.pHome;
    log1 += safeLog(p);

    const pHome = prediction.pHome;
    const y = homeWon ? 1 : 0;
    brier += (pHome - y) * (pHome - y) + ((1 - pHome) - (1 - y)) * ((1 - pHome) - (1 - y));

    const isOver = outcome.homeScore + outcome.awayScore > prediction.totalLine;
    logOver += safeLog(isOver ? prediction.pOver : 1 - prediction.pOver);

    const best = pHome >= 0.5 ? 0 : 2;
    if ((best === 0 && homeWon) || (best === 2 && !homeWon)) hits++;
    calib.push({ p: Math.max(pHome, 1 - pHome), hit: best === 0 ? homeWon : !homeWon });
  }

  const n = rows.length || 1;
  const { ece, reliability } = calibration(calib);
  return {
    n: rows.length,
    logLoss1x2: log1 / n,
    brier1x2: brier / n,
    logLossOver: logOver / n,
    accuracy: hits / n,
    ece,
    reliability,
  };
}

/** Log-loss binario de una probabilidad y su resultado. */
export function binaryLogLoss(p: number, happened: boolean): number {
  return safeLog(happened ? p : 1 - p);
}

/** Agrega métricas con intervalo bootstrap pareado (95%). */
export function pairedBootstrap(
  a: number[],
  b: number[],
  iterations = 2000,
  seed = 12345,
): { meanDiff: number; lower: number; upper: number; wins: number } {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { meanDiff: 0, lower: 0, upper: 0, wins: 0 };

  const diffs = new Array<number>(n);
  let observed = 0;
  for (let i = 0; i < n; i++) {
    diffs[i] = b[i]! - a[i]!;
    observed += diffs[i]!;
  }
  observed /= n;

  let state = seed >>> 0;
  const rand = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const means = new Array<number>(iterations);
  for (let it = 0; it < iterations; it++) {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += diffs[Math.floor(rand() * n)]!;
    }
    means[it] = acc / n;
  }
  means.sort((x, y) => x - y);
  const lower = means[Math.floor(iterations * 0.025)]!;
  const upper = means[Math.floor(iterations * 0.975)]!;

  return {
    meanDiff: observed,
    lower,
    upper,
    wins: diffs.filter((d) => d > 0).length,
  };
}
