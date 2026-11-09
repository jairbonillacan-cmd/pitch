import { describe, expect, it } from "vitest";
import { fitPlatt } from "../src/index.js";

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

describe("calibración Platt", () => {
  it("recupera una pendiente e intercepto conocidos", () => {
    // Datos generados con p = sigmoid(0.5 * logit(q) + 0.2) y ruido determinista.
    const rows: Array<{ p: number; y: number }> = [];
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 4000; i += 1) {
      const q = 0.05 + 0.9 * random();
      const trueProbability = sigmoid(0.5 * Math.log(q / (1 - q)) + 0.2);
      rows.push({ p: q, y: random() < trueProbability ? 1 : 0 });
    }
    const { a, b } = fitPlatt(rows);
    expect(a).toBeGreaterThan(0.35);
    expect(a).toBeLessThan(0.65);
    expect(b).toBeGreaterThan(0.1);
    expect(b).toBeLessThan(0.3);
  });

  it("encoge un modelo que no aporta información", () => {
    // p del modelo independiente del resultado: la pendiente debe quedar cerca de 0.
    let seed = 11;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const rows = Array.from({ length: 4000 }, () => ({
      p: 0.05 + 0.9 * random(),
      y: random() < 0.5 ? 1 : 0,
    }));
    const { a, b } = fitPlatt(rows);
    expect(Math.abs(a)).toBeLessThan(0.15);
    expect(Math.abs(b)).toBeLessThan(0.15);
  });

  it("con datos separables no explota", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      p: 0.1 + 0.8 * (index / 99),
      y: index > 50 ? 1 : 0,
    }));
    const { a, b } = fitPlatt(rows);
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
  });
});
