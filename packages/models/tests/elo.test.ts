import { describe, expect, it } from "vitest";
import {
  createEloTracker,
  eloExpectedScore,
  goalDifferenceMultiplier,
} from "../src/football/elo.js";

function match(overrides: Partial<Parameters<ReturnType<typeof createEloTracker>["update"]>[0]> = {}) {
  return {
    date: "2025-08-15",
    season: "2025-26",
    home: "a",
    away: "b",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

describe("Elo — utilidades", () => {
  it("la expectativa es 0.5 con diferencia cero y monótona", () => {
    expect(eloExpectedScore(0)).toBeCloseTo(0.5, 10);
    expect(eloExpectedScore(200)).toBeGreaterThan(0.7);
    expect(eloExpectedScore(-200)).toBeLessThan(0.3);
  });

  it("el multiplicador de goleada crece con la diferencia", () => {
    expect(goalDifferenceMultiplier(0)).toBe(1);
    expect(goalDifferenceMultiplier(1)).toBe(1);
    expect(goalDifferenceMultiplier(2)).toBe(1.5);
    expect(goalDifferenceMultiplier(4)).toBeGreaterThan(goalDifferenceMultiplier(3));
  });
});

describe("Elo — tracker", () => {
  it("predice probabilidades válidas y con ventaja de local", () => {
    const elo = createEloTracker();
    const prediction = elo.predict("a", "b");
    expect(prediction.home + prediction.draw + prediction.away).toBeCloseTo(1, 10);
    expect(prediction.home).toBeGreaterThan(prediction.away);
    expect(prediction.draw).toBeGreaterThan(0.1);
    expect(prediction.draw).toBeLessThan(0.35);
  });

  it("actualiza de forma zero-sum y premia ganar", () => {
    const elo = createEloTracker();
    const before = elo.rating("a");
    elo.update(match({ homeGoals: 3, awayGoals: 0 }));
    expect(elo.rating("a")).toBeGreaterThan(before);
    expect(elo.rating("a") + elo.rating("b")).toBeCloseTo(3000, 6);
  });

  it("una goleada mueve más la rating que un 1-0", () => {
    const close = createEloTracker();
    close.update(match({ homeGoals: 1, awayGoals: 0 }));
    const thrash = createEloTracker();
    thrash.update(match({ homeGoals: 5, awayGoals: 0 }));
    expect(thrash.rating("a")).toBeGreaterThan(close.rating("a"));
  });

  it("un empate favorece al más débil", () => {
    const elo = createEloTracker();
    elo.update(match({ homeGoals: 4, awayGoals: 0 }));
    const strongBefore = elo.rating("a");
    const weakBefore = elo.rating("b");
    elo.update(match({ date: "2025-08-22", homeGoals: 0, awayGoals: 0 }));
    expect(elo.rating("a")).toBeLessThan(strongBefore);
    expect(elo.rating("b")).toBeGreaterThan(weakBefore);
  });

  it("regresa a la media al cambiar de temporada y es idempotente", () => {
    const elo = createEloTracker({ seasonRegression: 0.25 });
    elo.update(match({ season: "2024-25", homeGoals: 3, awayGoals: 0 }));
    const afterSeason = elo.rating("a");
    expect(afterSeason).toBeGreaterThan(1500);

    elo.beginSeason("2025-26");
    const regressed = elo.rating("a");
    expect(regressed).toBeLessThan(afterSeason);
    expect(regressed).toBeCloseTo(afterSeason + (1500 - afterSeason) * 0.25, 6);

    elo.beginSeason("2025-26");
    expect(elo.rating("a")).toBeCloseTo(regressed, 10);
  });

  it("respeta la ventaja de local configurada", () => {
    const neutral = createEloTracker({ homeAdvantage: 0 });
    const home = createEloTracker({ homeAdvantage: 100 });
    expect(home.predict("a", "b").home).toBeGreaterThan(neutral.predict("a", "b").home);
  });
});
