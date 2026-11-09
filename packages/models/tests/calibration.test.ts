import { describe, expect, it } from "vitest";
import {
  applyTemperature,
  expectedCalibrationError,
  fitTemperature,
  meanLogLoss,
  type CalibrationSample,
} from "../src/index.js";

function synthetic(overconfident: boolean): CalibrationSample[] {
  // El modelo siempre anuncia 90% al resultado 0. Acierta el 60% (sobreconfiado) o el 90%.
  const samples: CalibrationSample[] = [];
  for (let i = 0; i < 200; i++) {
    const hit = overconfident ? i % 10 < 6 : i % 10 < 9;
    samples.push({ probs: [0.9, 0.1], outcome: hit ? 0 : 1 });
  }
  return samples;
}

describe("calibración por temperatura", () => {
  it("aplica temperatura y conserva la suma 1", () => {
    const p = applyTemperature([0.6, 0.3, 0.1], 2);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    // T > 1 suaviza: la probabilidad alta baja y la baja sube.
    expect(p[0]).toBeLessThan(0.6);
    expect(p[2]).toBeGreaterThan(0.1);
    expect(p[0]).toBeGreaterThan(p[1]);
  });

  it("T=1 no cambia las probabilidades", () => {
    const p = applyTemperature([0.6, 0.3, 0.1], 1);
    expect(p[0]).toBeCloseTo(0.6, 9);
    expect(p[1]).toBeCloseTo(0.3, 9);
  });

  it("detecta sobreconfianza y sugiere T > 1", () => {
    const samples = synthetic(true);
    const fit = fitTemperature(samples);
    expect(fit.temperature).toBeGreaterThan(1);
    expect(fit.logLossAfter).toBeLessThan(fit.logLossBefore);
    expect(fit.eceAfter).toBeLessThan(fit.eceBefore);
  });

  it("no toca la confianza cuando el modelo ya está calibrado", () => {
    const samples = synthetic(false);
    const fit = fitTemperature(samples);
    expect(fit.temperature).toBeCloseTo(1, 1);
    expect(meanLogLoss(samples, fit.temperature)).toBeLessThanOrEqual(fit.logLossBefore + 1e-9);
  });

  it("ECE es cero con probabilidades perfectas", () => {
    const samples: CalibrationSample[] = [
      { probs: [1, 0], outcome: 0 },
      { probs: [0, 1], outcome: 1 },
    ];
    expect(expectedCalibrationError(samples)).toBeCloseTo(0, 9);
  });

  it("no calibra con muestras insuficientes", () => {
    const fit = fitTemperature([{ probs: [0.9, 0.1], outcome: 0 }], { minSamples: 50 });
    expect(fit.temperature).toBe(1);
  });
});
