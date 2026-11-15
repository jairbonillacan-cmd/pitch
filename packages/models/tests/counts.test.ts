import { describe, expect, it } from "vitest";
import {
  COUNT_DEFAULTS,
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

  it("no modifica los defaults de córners y activa árbitro solo donde hubo mejora significativa", () => {
    expect(COUNT_DEFAULTS.corners).toEqual({
      k: 0.02,
      seasonRegression: 0.35,
      meanAlpha: 0.005,
      initialHome: 5.83,
      initialAway: 4.55,
    });
    expect(COUNT_DEFAULTS.corners.referee).toBeUndefined();
    expect(COUNT_DEFAULTS.fouls.referee?.enabled).toBe(true);
    expect(COUNT_DEFAULTS.yellow.referee?.enabled).toBe(true);
  });

  it("mantiene multiplicador 1 cuando la opción de árbitro está apagada o falta muestra", () => {
    const offTracker = createCountTracker({
      k: 0,
      meanAlpha: 0,
      initialHome: 10,
      initialAway: 10,
      referee: { enabled: false, k: 0.1, minGames: 2, shrinkageGames: 10, seasonRegression: 0.5 },
    });
    for (let i = 0; i < 15; i++) {
      offTracker.update({ date: "2025-01-01", season: "2025", home: "A", away: "B", homeCount: 16, awayCount: 16, referee: "Strict Ref" });
    }
    const offPred = offTracker.predict({ home: "A", away: "B", season: "2025", referee: "Strict Ref" });
    expect(offPred.refereeMultiplier).toBe(1);
    expect(offPred.total).toBeCloseTo(20, 6);

    const onTracker = createCountTracker({
      k: 0,
      meanAlpha: 0,
      initialHome: 10,
      initialAway: 10,
      referee: { enabled: true, k: 0.1, minGames: 5, shrinkageGames: 20, seasonRegression: 0.5 },
    });
    for (let i = 0; i < 4; i++) {
      onTracker.update({ date: "2025-01-01", season: "2025", home: "A", away: "B", homeCount: 18, awayCount: 18, referee: "Young Ref" });
    }
    const underMin = onTracker.predict({ home: "A", away: "B", season: "2025", referee: "Young Ref" });
    expect(underMin.refereeGames).toBe(4);
    expect(underMin.refereeMultiplier).toBe(1);

    onTracker.update({ date: "2025-01-02", season: "2025", home: "A", away: "B", homeCount: 18, awayCount: 18, referee: "Young Ref" });
    const atMin = onTracker.predict({ home: "A", away: "B", season: "2025", referee: "  young  ref " });
    expect(atMin.refereeGames).toBe(5);
    expect(atMin.refereeMultiplier).toBeGreaterThan(1);
    expect(atMin.total).toBeGreaterThan(20);

    const missingRef = onTracker.predict({ home: "A", away: "B", season: "2025" });
    expect(missingRef.refereeMultiplier).toBe(1);
    expect(missingRef.total).toBeCloseTo(20, 6);
  });

  it("contrae el multiplicador hacia 1 con muestra chica, al cambiar de temporada y respeta cotas", () => {
    const lowShrink = createCountTracker({
      k: 0,
      meanAlpha: 0,
      initialHome: 10,
      initialAway: 10,
      referee: { enabled: true, k: 0.08, minGames: 5, shrinkageGames: 5, seasonRegression: 0.6, maxLog: 0.35 },
    });
    const highShrink = createCountTracker({
      k: 0,
      meanAlpha: 0,
      initialHome: 10,
      initialAway: 10,
      referee: { enabled: true, k: 0.08, minGames: 5, shrinkageGames: 80, seasonRegression: 0.6, maxLog: 0.35 },
    });
    for (let i = 0; i < 10; i++) {
      const g = { date: "2025-01-01", season: "2025", home: "A", away: "B", homeCount: 15, awayCount: 15, referee: "M Oliver" };
      lowShrink.update(g);
      highShrink.update(g);
    }
    const pLow = lowShrink.predict({ home: "A", away: "B", season: "2025", referee: "M Oliver" });
    const pHigh = highShrink.predict({ home: "A", away: "B", season: "2025", referee: "M Oliver" });
    expect(pHigh.refereeMultiplier).toBeGreaterThan(1);
    expect(pHigh.refereeMultiplier).toBeLessThan(pLow.refereeMultiplier);

    const nextSeason = highShrink.predict({ home: "A", away: "B", season: "2026", referee: "M Oliver" });
    expect(Math.log(nextSeason.refereeMultiplier)).toBeCloseTo(Math.log(pHigh.refereeMultiplier) * 0.4, 6);

    for (let i = 0; i < 80; i++) {
      lowShrink.update({ date: "2025-02-01", season: "2025", home: "A", away: "B", homeCount: 30, awayCount: 30, referee: "Extreme Ref" });
    }
    const capped = lowShrink.predict({ home: "A", away: "B", season: "2025", referee: "Extreme Ref" });
    expect(capped.refereeMultiplier).toBeCloseTo(Math.exp(0.35), 6);
  });
});
