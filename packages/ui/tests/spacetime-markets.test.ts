import { describe, expect, it } from "vitest";
import {
  buildGoalModel,
  buildPointsModel,
  derivedMarketProbability,
  normalCdf,
} from "../src/platform/spacetime-markets";

describe("mercados derivados de Spacetime v3.0", () => {
  it("fútbol: la matriz de marcadores suma 1 y los mercados son coherentes", () => {
    const model = buildGoalModel(2.6, 0.4)!;
    expect(model.lambdaHome).toBeCloseTo(1.5);
    expect(model.lambdaAway).toBeCloseTo(1.1);
    const total = model.matrix.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);

    const over = derivedMarketProbability(model, "totals", "over_2.5", 2.5)!;
    const under = derivedMarketProbability(model, "totals", "under_2.5", 2.5)!;
    expect(over + under).toBeCloseTo(1, 10);
    expect(derivedMarketProbability(model, "totals", "over_1.5", 1.5)!).toBeGreaterThan(over);

    const yes = derivedMarketProbability(model, "btts", "yes", undefined)!;
    expect(yes + derivedMarketProbability(model, "btts", "no", undefined)!).toBeCloseTo(1, 10);
    expect(yes).toBeGreaterThan(0.4);
    expect(yes).toBeLessThan(0.7);

    const homeOver = derivedMarketProbability(model, "team_totals", "home_over", 1.5)!;
    const awayOver = derivedMarketProbability(model, "team_totals", "away_over", 1.5)!;
    expect(homeOver).toBeGreaterThan(awayOver);
    expect(derivedMarketProbability(model, "correct_score", "1-1", undefined)).toBe(model.matrix[1]![1]);
  });

  it("fútbol: rechaza goles esperados imposibles", () => {
    expect(buildGoalModel(1, 2)).toBeNull();
    expect(buildGoalModel(12, 0)).toBeNull();
  });

  it("NFL: la línea 0 reproduce la probabilidad de victoria del motor", () => {
    const model = buildPointsModel(45, 3.5, 0.6)!;
    const coverAtZero = derivedMarketProbability(model, "spreads", "home", 0)!;
    expect(coverAtZero).toBeCloseTo(0.6, 2);
    const homeMinus7 = derivedMarketProbability(model, "spreads", "home_-7.5", -7.5)!;
    const awayPlus7 = derivedMarketProbability(model, "spreads", "away_7.5", 7.5)!;
    expect(homeMinus7 + awayPlus7).toBeCloseTo(1, 10);
    expect(homeMinus7).toBeLessThan(coverAtZero);
    const over = derivedMarketProbability(model, "totals", "over", 45.5)!;
    expect(over).toBeCloseTo(1 - normalCdf(0.5 / 13.5), 6);
  });
});
