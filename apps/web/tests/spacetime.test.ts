import { afterEach, describe, expect, it } from "vitest";
import { bookLabelWithDate, isMarketFresh, maxOddsAgeHours } from "../src/server/spacetime";

describe("vigencia de momios de Spacetime v3.0", () => {
  afterEach(() => {
    delete process.env.PITCHLAB_MAX_ODDS_AGE_HOURS;
  });

  it("acepta momios de menos de 72 h y rechaza los viejos o sin fecha", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(maxOddsAgeHours()).toBe(72);
    expect(isMarketFresh("2026-11-09T18:46:52Z", now)).toBe(true);
    expect(isMarketFresh("2026-11-07T11:00:00Z", now)).toBe(false);
    expect(isMarketFresh(null, now)).toBe(false);
    expect(isMarketFresh("no es fecha", now)).toBe(false);
  });

  it("respeta PITCHLAB_MAX_ODDS_AGE_HOURS", () => {
    process.env.PITCHLAB_MAX_ODDS_AGE_HOURS = "6";
    const now = Date.parse("2026-11-11T12:00:00Z");
    expect(isMarketFresh("2026-11-11T05:00:00Z", now)).toBe(false);
    expect(isMarketFresh("2026-11-11T07:00:00Z", now)).toBe(true);
  });

  it("muestra la casa con el día del corte en hora de México", () => {
    expect(bookLabelWithDate("Caliente", "2026-11-09T18:46:52Z")).toBe("Caliente · 9 nov");
    expect(bookLabelWithDate("Caliente", null)).toBe("Caliente");
  });
});
