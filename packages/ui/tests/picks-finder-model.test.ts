import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  ensurePickLabelWithUnit,
  evaluateAuditableQuotePricing,
  matchesMarketFamily,
  primaryFamilyOf,
  resolveLiveStatusPill,
  resolvePlayerPositionBucket,
  resolveSameBookDeVigProbForMarket,
  type LiveTrackedPickView,
} from "../src/platform/club/picks/picks-finder-model";
import type { MatchPick, PlatformGame, PlatformMarketRow } from "../src/platform/types";

function makePick(overrides: Partial<MatchPick> = {}): MatchPick {
  return {
    id: "g1__totals__over__2.5",
    gameId: "g1",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    matchLabel: "América vs Cruz Azul",
    kickoffLocal: "20:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "totales",
    categoryLabel: "Totales",
    risk: "medio",
    engineKey: "tachyon",
    engineName: "PitchLab Tachyon v3.0",
    marketGroup: "Totales",
    selectionKey: "over",
    market: "totals",
    line: 2.5,
    conflictGroup: "over_total",
    label: "Más de 2.5 goles",
    rationale: "Prueba unitaria",
    p: 0.62,
    fairDecimal: 1.61,
    fairAmerican: -164,
    marketDecimal: 1.75,
    marketAmerican: -133,
    edgePts: 4.9,
    confidenceScore: 76,
    suggestedUnits: 1,
    result: null,
    ...overrides,
  };
}

function makeGame(): PlatformGame {
  return {
    id: "g1",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 14",
    dayId: "2026-11-22",
    dayLabel: "Hoy",
    kickoffUtc: "2026-11-23T02:00:00Z",
    kickoffLocal: "20:00",
    venue: "Estadio Ciudad de los Deportes",
    status: "NS",
    home: {
      slug: "america",
      name: "Club América",
      shortName: "América",
      code: "AME",
      record: "9G-2E-2P",
    },
    away: {
      slug: "cruz-azul",
      name: "Cruz Azul",
      shortName: "Cruz Azul",
      code: "CAZ",
      record: "8G-3E-2P",
    },
    x12: [0.46, 0.27, 0.27],
    projection: { home: 1.6, away: 1.1, total: 2.7 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "Partido de ritmo alto.",
      tacticalKeys: [],
      lineupStatusLabel: "XI proyectado",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Hoy 12:00",
    spacetime: null,
  };
}

describe("picks-finder-model contracts", () => {
  it("ensurePickLabelWithUnit añade unidades solo cuando faltan en Over/Under", () => {
    expect(ensurePickLabelWithUnit("Más de 9.5", "corners_total", "football")).toBe(
      "Más de 9.5 córners",
    );
    expect(ensurePickLabelWithUnit("Más de 8.5", "shots_on_target", "football")).toBe(
      "Más de 8.5 tiros a puerta",
    );
    expect(ensurePickLabelWithUnit("Menos de 4.5", "cards_total", "football")).toBe(
      "Menos de 4.5 tarjetas",
    );
    expect(
      ensurePickLabelWithUnit("Más de 24.5", "nba_player_props", "basketball", "Puntos + Rebotes"),
    ).toBe("Más de 24.5 puntos + rebotes");
    expect(ensurePickLabelWithUnit("Más de 2.5 goles", "totals", "football")).toBe(
      "Más de 2.5 goles",
    );
  });

  it("resolveSameBookDeVigProbForMarket exige cuotas de la misma casa y misma línea", () => {
    const markets: PlatformMarketRow[] = [
      {
        group: "Totales",
        market: "totals",
        selection: "over",
        label: "Más de 2.5 goles",
        line: 2.5,
        p: 0.56,
        fairDecimal: 1.79,
        fairAmerican: -127,
        openDecimal: null,
        currentDecimal: 1.9,
        bookQuotes: [
          {
            book: "pinnacle",
            bookLabel: "Pinnacle",
            decimal: 1.9,
            capturedAtUtc: "2026-11-22T18:00:00Z",
          },
        ],
        edgePts: null,
      },
      {
        group: "Totales",
        market: "totals",
        selection: "under",
        label: "Menos de 2.5 goles",
        line: 2.5,
        p: 0.44,
        fairDecimal: 2.27,
        fairAmerican: 127,
        openDecimal: null,
        currentDecimal: 1.95,
        bookQuotes: [
          {
            book: "pinnacle",
            bookLabel: "Pinnacle",
            decimal: 1.95,
            capturedAtUtc: "2026-11-22T18:00:00Z",
          },
          {
            book: "bet365",
            bookLabel: "Bet365",
            decimal: 2.0,
            capturedAtUtc: "2026-11-22T18:00:00Z",
          },
        ],
        edgePts: null,
      },
      {
        group: "Totales",
        market: "totals",
        selection: "under",
        label: "Menos de 3.5 goles",
        line: 3.5,
        p: 0.65,
        fairDecimal: 1.54,
        fairAmerican: -185,
        openDecimal: null,
        currentDecimal: 1.45,
        bookQuotes: [
          {
            book: "bet365",
            bookLabel: "Bet365",
            decimal: 1.45,
            capturedAtUtc: "2026-11-22T18:00:00Z",
          },
        ],
        edgePts: null,
      },
    ];

    const sameBookProb = resolveSameBookDeVigProbForMarket(
      markets,
      "totals",
      "over",
      2.5,
      "pinnacle",
    );
    expect(sameBookProb).not.toBeNull();
    expect(sameBookProb!).toBeCloseTo((1 / 1.9) / (1 / 1.9 + 1 / 1.95), 3);

    expect(
      resolveSameBookDeVigProbForMarket(markets, "totals", "over", 2.5, "bet365"),
    ).toBeNull();
    expect(
      resolveSameBookDeVigProbForMarket(markets, "totals", "over", 3.5, "pinnacle"),
    ).toBeNull();
  });

  it("evaluateAuditableQuotePricing respeta topes sharp/soft y divergencia máxima 12%", () => {
    const validSharp = evaluateAuditableQuotePricing({
      p: 0.56,
      houseDecimal: 1.95,
      bookId: "pinnacle",
      bookLabel: "Pinnacle",
      deVigProb: 0.52,
    });
    expect(validSharp.isAnomalous).toBe(false);
    expect(validSharp.valuePct).toBeCloseTo(9.2, 1);
    expect(validSharp.edgePts).toBeCloseTo(4.7, 1);

    const sharpOverCap = evaluateAuditableQuotePricing({
      p: 0.62,
      houseDecimal: 1.95,
      bookId: "pinnacle",
      bookLabel: "Pinnacle",
      deVigProb: 0.52,
    });
    expect(sharpOverCap.isAnomalous).toBe(true);
    expect(sharpOverCap.valuePct).toBeNull();

    const softWithin22 = evaluateAuditableQuotePricing({
      p: 0.6,
      houseDecimal: 2.0,
      bookId: "bet365",
      bookLabel: "Bet365",
      deVigProb: 0.5,
    });
    expect(softWithin22.isAnomalous).toBe(false);
    expect(softWithin22.valuePct).toBeCloseTo(20, 1);

    const divergesOver12 = evaluateAuditableQuotePricing({
      p: 0.65,
      houseDecimal: 1.7,
      bookId: "bet365",
      bookLabel: "Bet365",
      deVigProb: 0.51,
    });
    expect(divergesOver12.isAnomalous).toBe(true);
    expect(divergesOver12.valuePct).toBeNull();
  });

  it("matchesMarketFamily y resolvePlayerPositionBucket clasifican familias y posiciones", () => {
    const game = makeGame();
    const cornersPick = makePick({
      market: "corners_team",
      marketGroup: "Córners de equipo",
      label: "América Más de 4.5 córners",
      conflictGroup: "independent",
    });
    const resolved = primaryFamilyOf(cornersPick, game);
    expect(resolved).toBe("conteos");
    expect(matchesMarketFamily(cornersPick, game, "conteos", resolved, "corners_team")).toBe(
      true,
    );
    expect(matchesMarketFamily(cornersPick, game, "corners_team", resolved, "corners_team")).toBe(
      true,
    );
    expect(matchesMarketFamily(cornersPick, game, "corners_total", resolved, "corners_team")).toBe(
      false,
    );

    expect(resolvePlayerPositionBucket("ST", "football")).toBe("fwd");
    expect(resolvePlayerPositionBucket("CAM", "football")).toBe("mid");
    expect(resolvePlayerPositionBucket("GK", "football")).toBe("def_gk");
    expect(resolvePlayerPositionBucket("PG", "basketball")).toBe("guard");
    expect(resolvePlayerPositionBucket("PF", "basketball")).toBe("frontcourt");
  });

  it("resolveLiveStatusPill evalúa estados en vivo para Over, Under y Asian Handicap", () => {
    const baseTracked: LiveTrackedPickView = {
      id: "t1",
      pickId: "p1",
      gameId: "g1",
      pickKind: "single",
      leagueLabel: "Liga MX",
      matchLabel: "América vs Cruz Azul",
      pickLabel: "Más de 2.5 goles",
      href: "/app/liga-mx",
      clockLabel: "64'",
      actualValue: 2,
      targetLine: 2.5,
      unitLabel: "goles",
      direction: "over",
      projectedFinal: 2.8,
      asianState: null,
      starterAlert: null,
      starterAlertDetail: null,
      hitLocked: false,
      legs: [],
    };

    expect(resolveLiveStatusPill({ tracked: baseTracked, direction: "over" })).toEqual({
      label: "Falta 1",
      tone: "brand",
    });
    expect(
      resolveLiveStatusPill({
        tracked: { ...baseTracked, hitLocked: true, actualValue: 3 },
        direction: "over",
      }),
    ).toEqual({ label: "Ya cumplido", tone: "pos" });
    expect(
      resolveLiveStatusPill({
        tracked: { ...baseTracked, direction: "under", actualValue: 3 },
        direction: "under",
      }),
    ).toEqual({ label: "Fallado", tone: "neg" });
    expect(
      resolveLiveStatusPill({
        tracked: { ...baseTracked, asianState: "lost_half", direction: "handicap" },
        direction: "handicap",
      }),
    ).toEqual({ label: "En riesgo", tone: "warn" });
  });
});
