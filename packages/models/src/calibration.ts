/**
 * Calibración por temperatura.
 *
 * Un solo parámetro `T` corrige la confianza del modelo:
 *   p' ∝ p^(1/T)   (normalizado)
 * T > 1 suaviza probabilidades (modelo subconfiado), T < 1 las agudiza.
 *
 * Se ajusta minimizando log-loss sobre predicciones **pasadas** y se aplica a las futuras.
 * No cambia el orden de los favoritos, solo la confianza anunciada.
 */

/** Reajusta un vector de probabilidades con temperatura T. */
export function applyTemperature(probs: readonly number[], temperature: number): number[] {
  const t = Math.max(0.05, temperature);
  const powered = probs.map((p) => Math.pow(Math.max(p, 1e-12), 1 / t));
  const sum = powered.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return probs.map(() => 1 / probs.length);
  return powered.map((value) => value / sum);
}

export interface CalibrationSample {
  probs: readonly number[];
  outcome: number;
}

/** Log-loss medio de un conjunto de muestras, opcionalmente con temperatura. */
export function meanLogLoss(samples: readonly CalibrationSample[], temperature = 1): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (const sample of samples) {
    const probs = temperature === 1 ? sample.probs : applyTemperature(sample.probs, temperature);
    total += -Math.log(Math.max(probs[sample.outcome] ?? 1e-12, 1e-12));
  }
  return total / samples.length;
}

/** Error de calibración esperado (10 bins) sobre la clase elegida. */
export function expectedCalibrationError(
  samples: readonly CalibrationSample[],
  temperature = 1,
  bins = 10,
): number {
  if (samples.length === 0) return 0;
  const buckets = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, hits: 0 }));

  for (const sample of samples) {
    const probs = temperature === 1 ? sample.probs : applyTemperature(sample.probs, temperature);
    let best = 0;
    for (let i = 1; i < probs.length; i++) {
      if ((probs[i] ?? 0) > (probs[best] ?? 0)) best = i;
    }
    const p = probs[best] ?? 0;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    const bucket = buckets[idx]!;
    bucket.n += 1;
    bucket.sumP += p;
    if (best === sample.outcome) bucket.hits += 1;
  }

  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.n === 0) continue;
    ece += (bucket.n / samples.length) * Math.abs(bucket.hits / bucket.n - bucket.sumP / bucket.n);
  }
  return ece;
}

export interface TemperatureFit {
  temperature: number;
  logLossBefore: number;
  logLossAfter: number;
  eceBefore: number;
  eceAfter: number;
  samples: number;
}

/**
 * Busca T en una rejilla. `minSamples` evita calibrar con muestras ridículas.
 */
export function fitTemperature(
  samples: readonly CalibrationSample[],
  options: { grid?: readonly number[]; minSamples?: number } = {},
): TemperatureFit {
  const grid =
    options.grid ??
    Array.from({ length: 53 }, (_, i) => 0.6 + i * 0.05); // 0.60 .. 3.20
  const minSamples = options.minSamples ?? 50;

  const before = meanLogLoss(samples);
  const eceBefore = expectedCalibrationError(samples);

  if (samples.length < minSamples) {
    return {
      temperature: 1,
      logLossBefore: before,
      logLossAfter: before,
      eceBefore,
      eceAfter: eceBefore,
      samples: samples.length,
    };
  }

  let bestT = 1;
  let bestLoss = before;
  for (const t of grid) {
    const loss = meanLogLoss(samples, t);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestT = t;
    }
  }

  return {
    temperature: Math.round(bestT * 100) / 100,
    logLossBefore: before,
    logLossAfter: bestLoss,
    eceBefore,
    eceAfter: expectedCalibrationError(samples, bestT),
    samples: samples.length,
  };
}
