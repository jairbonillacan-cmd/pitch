import { describe, expect, it } from "vitest";
import {
  balancedLine,
  createCountTracker,
  estimateDispersion,
  negBinomialPmf,
  overProbability,
  sumDispersion,
} from "../src/football/counts.js";

describe("conteos por equipo", () => {
  it("aprende que un equipo genera más córners y que el rival los concede", () => {
    const t = createCountTracker({ k: 0.05, seasonRegression: 0.3, meanAlpha: 0.01, initialHome: 5, initialAway: 5 });
    for (let i = 0; i < 40; i++) {
      t.update({ date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`, season: "2025", home: "A", away: "B", homeCount: 9, awayCount: 3 });
      t.update({ date: "2025-02-01", season: "2025", home: "C", away: "D", homeCount: 5, awayCount: 5 });
    }
    const ab = t.predict({ home: "A", away: "B", season: "2025" });
    const cd = t.predict({ home: "C", away: "D", season: "2025" });
    expect(ab.home).toBeGreaterThan(cd.home);
    expect(ab.away).toBeLessThan(cd.away);
    expect(ab.homeGames).toBe(40);
  });

  it("regresa las ratings hacia 0 al cambiar de temporada", () => {
    const t = createCountTracker({ k: 0.05, seasonRegression: 1, meanAlpha: 0, initialHome: 5, initialAway: 5 });
    for (let i = 0; i < 30; i++) t.update({ date: "2025-01-01", season: "2025", home: "A", away: "B", homeCount: 10, awayCount: 2 });
    const next = t.predict({ home: "A", away: "B", season: "2026" });
    expect(next.home).toBeCloseTo(5, 6);
  });

  it("la binomial negativa suma 1 y se vuelve Poisson sin dispersión", () => {
    const nb = negBinomialPmf(10, 12, 80);
    expect(nb.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 6);
    const pois = negBinomialPmf(3, Number.POSITIVE_INFINITY, 40);
    expect(pois[0]).toBeCloseTo(Math.exp(-3), 10);
    expect(sumDispersion(5, 5, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("la línea equilibrada deja el más/menos cerca de 50/50", () => {
    const line = balancedLine(10.2, 25);
    expect(line % 1).toBe(0.5);
    expect(Math.abs(overProbability(10.2, 25, line) - 0.5)).toBeLessThan(0.1);
  });

  it("detecta sobredispersión y cae a Poisson si no la hay", () => {
    const over = Array.from({ length: 200 }, (_, i) => ({ expected: 5, observed: i % 2 ? 0 : 12 }));
    expect(Number.isFinite(estimateDispersion(over))).toBe(true);
    const flat = Array.from({ length: 200 }, () => ({ expected: 5, observed: 5 }));
    expect(estimateDispersion(flat)).toBe(Number.POSITIVE_INFINITY);
  });
});
