import { describe, expect, it } from "vitest";
import {
  fitMultinomialLogistic,
  predictMultinomialLogistic,
  type LogisticSample,
} from "../src/football/logistic.js";

function synthetic(): LogisticSample[] {
  const samples: LogisticSample[] = [];
  // La señal `x` (positiva) predice victoria local; la negativa, visitante.
  for (let i = 0; i < 300; i++) {
    const signal = (i % 30) / 10 - 1.5; // -1.5 .. 1.4
    const outcome: 0 | 1 | 2 = signal > 0.6 ? 0 : signal < -0.6 ? 2 : 1;
    samples.push({ features: [signal, Math.abs(signal)], outcome });
  }
  return samples;
}

describe("regresión logística multinomial", () => {
  it("aprende una señal separable y devuelve probabilidades válidas", () => {
    const model = fitMultinomialLogistic(synthetic(), { iterations: 400, learningRate: 0.8 });
    const home = predictMultinomialLogistic(model, [1.2, 1.2]);
    const draw = predictMultinomialLogistic(model, [0, 0]);
    const away = predictMultinomialLogistic(model, [-1.2, 1.2]);

    expect(home[0] + home[1] + home[2]).toBeCloseTo(1, 9);
    expect(home[0]).toBeGreaterThan(home[2]);
    expect(away[2]).toBeGreaterThan(away[0]);
    expect(draw[1]).toBeGreaterThan(0.2);
    expect(model.trainingSamples).toBe(300);
    expect(model.logLoss).toBeLessThan(0.9);
  });

  it("es determinista", () => {
    const a = fitMultinomialLogistic(synthetic(), { iterations: 100 });
    const b = fitMultinomialLogistic(synthetic(), { iterations: 100 });
    expect(a.weights).toEqual(b.weights);
    expect(a.means).toEqual(b.means);
  });

  it("la penalización L2 reduce la magnitud de los pesos", () => {
    const low = fitMultinomialLogistic(synthetic(), { iterations: 150, l2: 1e-6 });
    const high = fitMultinomialLogistic(synthetic(), { iterations: 150, l2: 0.1 });
    const norm = (weights: number[][]): number =>
      Math.sqrt(weights.flat().reduce((sum, value) => sum + value * value, 0));
    expect(norm(high.weights)).toBeLessThan(norm(low.weights));
  });

  it("falla con una muestra vacía", () => {
    expect(() => fitMultinomialLogistic([])).toThrow(/al menos una muestra/);
  });
});
