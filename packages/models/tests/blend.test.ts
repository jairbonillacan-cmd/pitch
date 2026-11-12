import { describe, expect, it } from "vitest";
import {
  fitDixonColes,
  predictFootball,
  rescaleMatrixToOutcome,
  scoreMatrix,
  type FootballMatchRow,
} from "../src/index.js";

function league(): FootballMatchRow[] {
  const teams = ["a", "b", "c", "d", "e", "f"];
  const rows: FootballMatchRow[] = [];
  let day = 1;
  for (let round = 0; round < 4; round++) {
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue;
        const h = (home.charCodeAt(0) + round) % 4;
        const a = (away.charCodeAt(0) + 2 * round) % 3;
        const date = new Date(Date.UTC(2025, 7, 1) + day++ * 86_400_000).toISOString().slice(0, 10);
        rows.push({ date, home, away, homeGoals: h, awayGoals: a });
      }
    }
  }
  return rows;
}

function regions(m: number[][]): [number, number, number] {
  let h = 0;
  let d = 0;
  let a = 0;
  m.forEach((row, i) => row.forEach((p, j) => (i > j ? (h += p) : i === j ? (d += p) : (a += p))));
  return [h, d, a];
}

describe("mezcla del 1X2 con fuerza histórica", () => {
  it("reescala cada región de la matriz al 1X2 objetivo y la matriz sigue sumando 1", () => {
    const m = scoreMatrix(1.6, 0.9, -0.05, 10);
    const out = rescaleMatrixToOutcome(m, { home: 0.4, draw: 0.3, away: 0.3 });
    const [h, d, a] = regions(out);
    expect(h).toBeCloseTo(0.4, 10);
    expect(d).toBeCloseTo(0.3, 10);
    expect(a).toBeCloseTo(0.3, 10);
    // Dentro de una región se conserva la forma: 2-0 vs 1-0 mantiene su proporción.
    expect(out[2]![0]! / out[1]![0]!).toBeCloseTo(m[2]![0]! / m[1]![0]!, 10);
  });

  it("peso 0 deja la predicción igual y peso 0.5 cae entre el modelo y la referencia", () => {
    const model = fitDixonColes(league(), { referenceDate: "2025-12-31" });
    const base = predictFootball(model, "a", "b", { simulations: 20 });
    const zero = predictFootball(model, "a", "b", {
      simulations: 20,
      outcomeBlend: { home: 0.1, draw: 0.2, away: 0.7, weight: 0 },
    });
    expect(zero.probabilities).toEqual(base.probabilities);

    const half = predictFootball(model, "a", "b", {
      simulations: 20,
      outcomeBlend: { home: 0.1, draw: 0.2, away: 0.7, weight: 0.5 },
    });
    expect(half.probabilities.away).toBeCloseTo((base.probabilities.away + 0.7) / 2, 10);
    const sum = half.probabilities.home + half.probabilities.draw + half.probabilities.away;
    expect(sum).toBeCloseTo(1, 10);
    // Los mercados derivados siguen siendo coherentes con el 1X2 mezclado.
    expect(half.doubleChance.drawOrAway).toBeCloseTo(half.probabilities.draw + half.probabilities.away, 10);
    expect(half.intervals.homeWin[0]).toBeLessThanOrEqual(half.intervals.homeWin[1]);
  });
});
