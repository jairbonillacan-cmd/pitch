/**
 * Regresión logística multinomial (softmax) para apilar modelos.
 *
 * Es el paso de "regresión" del plan antes de un GBM: barato, determinista y suficiente
 * para aprender a combinar Dixon-Coles, Elo y features de contexto (descanso, forma,
 * tiros a puerta) sin sobreajustar con muestras pequeñas.
 *
 * Se estandarizan las features con la media y desviación del conjunto de entrenamiento;
 * el modelo guarda esos parámetros para predecir con la misma escala.
 */

export interface LogisticSample {
  features: readonly number[];
  /** 0 local, 1 empate, 2 visitante. */
  outcome: 0 | 1 | 2;
}

export interface MultinomialLogisticOptions {
  classes?: 3;
  /** Penalización L2 sobre los pesos (sin el sesgo). */
  l2?: number;
  iterations?: number;
  learningRate?: number;
}

export interface MultinomialLogisticModel {
  /** Una fila por clase; la última columna es el sesgo. */
  weights: number[][];
  means: number[];
  sds: number[];
  iterations: number;
  trainingSamples: number;
  logLoss: number;
}

const EPS = 1e-12;

function standardize(features: readonly number[], means: readonly number[], sds: readonly number[]): number[] {
  return features.map((value, index) => {
    const mean = means[index] ?? 0;
    const sd = sds[index] ?? 1;
    return sd > 0 ? (value - mean) / sd : 0;
  });
}

function softmax(scores: readonly number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  return exps.map((value) => value / (sum > 0 ? sum : 1));
}

function logLossOf(
  weights: readonly number[][],
  samples: readonly { x: number[]; outcome: 0 | 1 | 2 }[],
): number {
  let loss = 0;
  for (const sample of samples) {
    const scores = weights.map((row) => {
      let acc = row[row.length - 1] ?? 0;
      for (let j = 0; j < sample.x.length; j++) acc += (row[j] ?? 0) * sample.x[j]!;
      return acc;
    });
    const probabilities = softmax(scores);
    loss += -Math.log(Math.max(probabilities[sample.outcome]!, EPS));
  }
  return loss / Math.max(1, samples.length);
}

export function fitMultinomialLogistic(
  samples: readonly LogisticSample[],
  options: MultinomialLogisticOptions = {},
): MultinomialLogisticModel {
  if (samples.length === 0) {
    throw new Error("fitMultinomialLogistic necesita al menos una muestra.");
  }
  const classes = 3;
  const l2 = options.l2 ?? 1e-4;
  const iterations = options.iterations ?? 200;
  const learningRate = options.learningRate ?? 0.5;
  const dimension = samples[0]!.features.length;

  const means = new Array<number>(dimension).fill(0);
  for (const sample of samples) {
    for (let j = 0; j < dimension; j++) means[j]! += sample.features[j] ?? 0;
  }
  for (let j = 0; j < dimension; j++) means[j]! /= samples.length;

  const sds = new Array<number>(dimension).fill(0);
  for (const sample of samples) {
    for (let j = 0; j < dimension; j++) {
      const diff = (sample.features[j] ?? 0) - means[j]!;
      sds[j]! += diff * diff;
    }
  }
  for (let j = 0; j < dimension; j++) {
    sds[j] = Math.sqrt(sds[j]! / Math.max(1, samples.length - 1)) || 1;
  }

  const prepared = samples.map((sample) => ({
    x: [...standardize(sample.features, means, sds), 1],
    outcome: sample.outcome,
  }));

  const weights: number[][] = Array.from({ length: classes }, () =>
    new Array<number>(dimension + 1).fill(0),
  );

  for (let iteration = 0; iteration < iterations; iteration++) {
    const gradients = Array.from({ length: classes }, () =>
      new Array<number>(dimension + 1).fill(0),
    );
    for (const sample of prepared) {
      const scores = weights.map((row) => row.reduce((acc, weight, j) => acc + weight * sample.x[j]!, 0));
      const probabilities = softmax(scores);
      for (let c = 0; c < classes; c++) {
        const error = probabilities[c]! - (c === sample.outcome ? 1 : 0);
        for (let j = 0; j < sample.x.length; j++) {
          gradients[c]![j]! += error * sample.x[j]!;
        }
      }
    }
    for (let c = 0; c < classes; c++) {
      for (let j = 0; j < dimension + 1; j++) {
        const penalty = j === dimension ? 0 : l2 * weights[c]![j]!;
        weights[c]![j]! -= learningRate * (gradients[c]![j]! / prepared.length + penalty);
      }
    }
  }

  return {
    weights,
    means,
    sds,
    iterations,
    trainingSamples: samples.length,
    logLoss: logLossOf(weights, prepared),
  };
}

export function predictMultinomialLogistic(
  model: MultinomialLogisticModel,
  features: readonly number[],
): [number, number, number] {
  const x = [...standardize(features, model.means, model.sds), 1];
  const scores = model.weights.map((row) => row.reduce((acc, weight, j) => acc + weight * x[j]!, 0));
  const probabilities = softmax(scores);
  return [probabilities[0]!, probabilities[1]!, probabilities[2]!];
}
