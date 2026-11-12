import { describe, expect, it } from "vitest";
import {
  TeamIdSchema,
  LeagueIdSchema,
  parseOdds,
  implied,
  fairOdds,
  americanToDecimal,
  decimalToAmerican,
  noVigMultiplicative,
  formatPct,
  formatFairOdds,
  ok,
  isStale,
} from "../src/index";

describe("@pitchlab/contracts", () => {
  it("valida TeamId canónico <league>.<slug> y rechaza formatos inválidos", () => {
    expect(TeamIdSchema.parse("liga-mx.atlante")).toBe("liga-mx.atlante");
    expect(TeamIdSchema.parse("liga-mx.atlas")).toBe("liga-mx.atlas");
    expect(TeamIdSchema.parse("premier-league.arsenal")).toBe("premier-league.arsenal");
    expect(TeamIdSchema.parse("nfl.kansas-city-chiefs")).toBe("nfl.kansas-city-chiefs");
    expect(() => TeamIdSchema.parse("atlante")).toThrow();
    expect(() => TeamIdSchema.parse("unknown.team")).toThrow();
    expect(LeagueIdSchema.parse("nfl")).toBe("nfl");
  });

  it("parseOdds interpreta cuotas decimales y americanas y calcula probabilidad implícita", () => {
    expect(parseOdds("2.10")).toBeCloseTo(2.1, 5);
    expect(parseOdds("2,25")).toBeCloseTo(2.25, 5);
    expect(parseOdds("+120")).toBeCloseTo(2.2, 5);
    expect(parseOdds("-150")).toBeCloseTo(1 + 100 / 150, 5);
    expect(parseOdds("−200")).toBeCloseTo(1.5, 5);
    expect(parseOdds("0.95")).toBeNull();
    expect(parseOdds("+50")).toBeNull();
    expect(parseOdds("")).toBeNull();
    expect(parseOdds("abc")).toBeNull();

    const d = parseOdds("+120")!;
    expect(implied(d)).toBeCloseTo(1 / 2.2, 6);
    expect(fairOdds(0.5)).toBeCloseTo(2.0, 6);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 6);
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);

    const nv = noVigMultiplicative([1.91, 1.91]);
    expect(nv[0]).toBeCloseTo(0.5, 5);
    expect(nv[1]).toBeCloseTo(0.5, 5);
  });

  it("formatea porcentajes y cuotas en es-MX", () => {
    expect(formatPct(0.558)).toBe("55.8 %");
    expect(formatFairOdds(0.5)).toBe("2.00");
    expect(formatFairOdds(0)).toBe("—");
  });

  it("construye DataState y detecta expiración (stale)", () => {
    const state = ok(
      { test: 1 },
      {
        source: "pitchlab",
        observedAt: "2026-11-08T10:00:00Z",
        staleAfter: "2026-11-08T12:00:00Z",
      },
    );
    expect(state.status).toBe("success");
    expect(state.isDemo).toBe(false);
    expect(isStale(state, new Date("2026-11-08T11:00:00Z"))).toBe(false);
    expect(isStale(state, new Date("2026-11-08T13:00:00Z"))).toBe(true);
  });
});
