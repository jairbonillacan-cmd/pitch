import { describe, expect, it } from "vitest";
import { estimateXgFromShots } from "../src/index.js";

describe("xG estimado por tiros", () => {
  it("estima xG de local y visita con los coeficientes ajustados", () => {
    const estimate = estimateXgFromShots({
      shotsHome: 10,
      shotsAway: 8,
      shotsOnTargetHome: 4,
      shotsOnTargetAway: 3,
    })!;
    expect(estimate.home).toBeCloseTo(1.2224, 3);
    expect(estimate.away).toBeCloseTo(0.9047, 3);
  });

  it("devuelve null si falta alguna estadística", () => {
    expect(
      estimateXgFromShots({
        shotsHome: null,
        shotsAway: 8,
        shotsOnTargetHome: 4,
        shotsOnTargetAway: 3,
      }),
    ).toBeNull();
    expect(
      estimateXgFromShots({
        shotsHome: 10,
        shotsAway: 8,
        shotsOnTargetHome: 4,
        shotsOnTargetAway: null,
      }),
    ).toBeNull();
  });

  it("nunca devuelve xG negativo", () => {
    const estimate = estimateXgFromShots({
      shotsHome: 0,
      shotsAway: 0,
      shotsOnTargetHome: 0,
      shotsOnTargetAway: 0,
    })!;
    expect(estimate.home).toBeCloseTo(0.0105, 3);
    expect(estimate.away).toBe(0);
  });
});
