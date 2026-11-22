import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  computePickPricing,
  scoreRecommendedCatalogPick,
  selectPicksOfTheDay,
  type CatalogPickItem,
  type EvidenceWindowStat,
} from "../src/platform/picks-catalog/index";

const FIXED_CAPTURED_AT = "2026-11-22T12:00:00Z";
const FORBIDDEN_COPY_RE =
  /confianza|datos\s+completos|datos\s+parciales|scoutpicks|sofascore|bzzoiro|poisson|dixon/i;

function makeWindow(
  window: EvidenceWindowStat["window"],
  label: string,
  hits: number,
  sample: number,
): EvidenceWindowStat {
  const ratePct = sample > 0 ? Math.round((hits / sample) * 100) : 0;
  const tone = ratePct >= 65 ? "high" : ratePct >= 45 ? "mid" : "low";
  return {
    window,
    label,
    hits,
    sample,
    pushes: 0,
    ratePct,
    meanValue: null,
    tone,
  };
}

function makeCatalogPick(params: {
  readonly id: string;
  readonly gameId: string;
  readonly p: number;
  readonly marketDecimal?: number | null;
  readonly companionMarketDecimals?: readonly number[];
  readonly gameStatus?: "NS" | "FT" | "LIVE";
  readonly settlement?: "hit" | "miss" | "push" | "pending";
  readonly isRedacted?: boolean;
  readonly windows?: readonly EvidenceWindowStat[];
  readonly label?: string;
  readonly selectionKey?: string;
  readonly recommendationScore?: number;
}): CatalogPickItem {
  const windows = params.windows ?? [];
  const avgObservedRatePct =
    windows.length > 0
      ? Math.round(windows.reduce((acc, w) => acc + w.ratePct, 0) / windows.length)
      : null;

  const pricing = params.isRedacted
    ? {
        p: 0,
        fairOdds: 0,
        fairAmerican: 0,
        marketDecimal: null,
        marketAmerican: null,
        marketBookLabel: null,
        marketCapturedAtUtc: null,
        deVigMarketProb: null,
        deVigMethod: "none" as const,
        overroundPct: null,
        evPct: null,
        edgePts: null,
        noVigEdgePts: null,
        valueLabel: null,
        hasPositiveValue: false,
      }
    : computePickPricing({
        calibratedProb: params.p,
        marketDecimal: params.marketDecimal ?? null,
        companionMarketDecimals: params.companionMarketDecimals,
        companionIndex: 0,
        marketBookLabel: params.marketDecimal ? "Pinnacle" : null,
        marketCapturedAtUtc: params.marketDecimal ? FIXED_CAPTURED_AT : null,
      });

  return {
    id: params.id,
    gameId: params.gameId,
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    matchLabel: "Liverpool vs Arsenal",
    kickoffUtc: "2026-11-22T18:00:00Z",
    kickoffLocal: "12:00",
    gameStatus: params.gameStatus ?? "NS",
    family: "totals",
    familyLabel: "Total de goles",
    category: "goles_totales",
    axis: "goals_total",
    selectionKey: params.selectionKey ?? "over_2.5",
    label: params.label ?? "Más de 2.5 goles",
    line: 2.5,
    direction: "over",
    pricing,
    evidence: {
      windows,
      xgSignal: null,
      refereeSignal: null,
      bullets: windows.map((w) => ({
        label: `${w.label} (${w.hits}/${w.sample})`,
        ratePct: w.ratePct,
        tone: w.tone,
      })),
      avgObservedRatePct,
    },
    settlement: params.settlement ?? "pending",
    engineName: "PitchLab Spacetime v5.1",
    isPrimaryModelPick: false,
    isDerived: false,
    conflictGroup: "over_total",
    isRedacted: params.isRedacted ?? false,
    ...(params.recommendationScore !== undefined
      ? { recommendationScore: params.recommendationScore }
      : {}),
  };
}

describe("Ola 6 · scoreRecommendedCatalogPick y selectPicksOfTheDay", () => {
  it("marca cuotas triviales < 1.25 como trivial_odds con isRecommended=false aunque tengan 5/5 histórico", () => {
    const hotWindows = [
      makeWindow("L5", "Últimos 5", 5, 5),
      makeWindow("L10", "Últimos 10", 10, 10),
      makeWindow("L20", "Últimos 20", 19, 20),
    ];

    const trivialWithMarket = makeCatalogPick({
      id: "pick-trivial-market",
      gameId: "g-trivial-1",
      p: 0.88,
      marketDecimal: 1.15,
      companionMarketDecimals: [1.15, 5.4],
      windows: hotWindows,
    });
    const trivialFairOnly = makeCatalogPick({
      id: "pick-trivial-fair",
      gameId: "g-trivial-2",
      p: 0.86,
      marketDecimal: null,
      windows: hotWindows,
    });
    const trivialEdgeBoundary = makeCatalogPick({
      id: "pick-trivial-122",
      gameId: "g-trivial-3",
      p: 0.85,
      marketDecimal: 1.22,
      companionMarketDecimals: [1.22, 4.4],
      windows: hotWindows,
    });

    for (const pick of [trivialWithMarket, trivialFairOnly, trivialEdgeBoundary]) {
      const scored = scoreRecommendedCatalogPick(pick);
      expect(scored.tier).toBe("trivial_odds");
      expect(scored.isRecommended).toBe(false);
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(100);
    }
  });

  it("prioriza valor real Spacetime (EV+ > 0 en 1.55–2.40) sobre hit-rate ingenuo 5/5 sin ventaja real", () => {
    const spacetimeValuePick = makeCatalogPick({
      id: "pick-spacetime-ev-plus",
      gameId: "g-ev-1",
      p: 0.61,
      marketDecimal: 1.85,
      companionMarketDecimals: [1.85, 1.95],
      windows: [
        makeWindow("L5", "Últimos 5", 4, 5),
        makeWindow("L10", "Últimos 10", 7, 10),
        makeWindow("L20", "Últimos 20", 14, 20),
      ],
    });

    const naiveFiveOfFivePick = makeCatalogPick({
      id: "pick-naive-5-of-5",
      gameId: "g-ev-2",
      p: 0.43,
      marketDecimal: 1.85,
      companionMarketDecimals: [1.85, 1.95],
      windows: [
        makeWindow("L5", "Últimos 5", 5, 5),
        makeWindow("L10", "Últimos 10", 9, 10),
        makeWindow("L20", "Últimos 20", 17, 20),
        makeWindow("home_away", "Local", 9, 10),
      ],
    });

    expect(spacetimeValuePick.pricing.hasPositiveValue).toBe(true);
    expect(spacetimeValuePick.pricing.evPct).toBeGreaterThan(0);
    expect(naiveFiveOfFivePick.pricing.hasPositiveValue).toBe(false);
    expect(naiveFiveOfFivePick.pricing.evPct).toBeLessThan(0);

    const valueScore = scoreRecommendedCatalogPick(spacetimeValuePick);
    const naiveScore = scoreRecommendedCatalogPick(naiveFiveOfFivePick);

    expect(valueScore.isRecommended).toBe(true);
    expect(valueScore.tier).not.toBe("trivial_odds");
    expect(["top_pick", "recommended", "value"]).toContain(valueScore.tier);
    expect(valueScore.score).toBeGreaterThan(naiveScore.score);
    expect(valueScore.score).toBeGreaterThanOrEqual(0);
    expect(valueScore.score).toBeLessThanOrEqual(100);
    expect(valueScore.convergenceCount).toBe(3);

    expect(valueScore.valueThresholdLabel).not.toBeNull();
    expect(valueScore.valueThresholdLabel!).toMatch(/valor/i);
    expect(valueScore.valueThresholdLabel!).toMatch(/\d+\.\d{2}/);
    expect(valueScore.valueThresholdLabel!).not.toMatch(FORBIDDEN_COPY_RE);
  });

  it("calcula convergenceCount por ventanas alineadas >= 65% y rechaza picks redactados", () => {
    const noAligned = makeCatalogPick({
      id: "pick-conv-0",
      gameId: "g-conv-0",
      p: 0.58,
      marketDecimal: 1.9,
      companionMarketDecimals: [1.9, 1.9],
      windows: [
        makeWindow("L5", "Últimos 5", 2, 5),
        makeWindow("L10", "Últimos 10", 5, 10),
        makeWindow("L20", "Últimos 20", 11, 20),
      ],
    });
    const twoAligned = makeCatalogPick({
      id: "pick-conv-2",
      gameId: "g-conv-2",
      p: 0.58,
      marketDecimal: 1.9,
      companionMarketDecimals: [1.9, 1.9],
      windows: [
        makeWindow("L5", "Últimos 5", 4, 5),
        makeWindow("L10", "Últimos 10", 7, 10),
        makeWindow("L20", "Últimos 20", 11, 20),
        makeWindow("home_away", "Local", 6, 10),
      ],
    });
    const fourAligned = makeCatalogPick({
      id: "pick-conv-4",
      gameId: "g-conv-4",
      p: 0.58,
      marketDecimal: 1.9,
      companionMarketDecimals: [1.9, 1.9],
      windows: [
        makeWindow("L5", "Últimos 5", 4, 5),
        makeWindow("L10", "Últimos 10", 7, 10),
        makeWindow("L20", "Últimos 20", 15, 20),
        makeWindow("home_away", "Local", 7, 10),
        makeWindow("h2h", "H2H", 2, 4),
      ],
    });

    const s0 = scoreRecommendedCatalogPick(noAligned);
    const s2 = scoreRecommendedCatalogPick(twoAligned);
    const s4 = scoreRecommendedCatalogPick(fourAligned);

    expect(s0.convergenceCount).toBe(0);
    expect(s2.convergenceCount).toBe(2);
    expect(s4.convergenceCount).toBe(4);
    expect(s4.score).toBeGreaterThanOrEqual(s2.score);
    expect(s2.score).toBeGreaterThanOrEqual(s0.score);

    expect(scoreRecommendedCatalogPick(fourAligned)).toEqual(s4);

    const redacted = makeCatalogPick({
      id: "pick-redacted",
      gameId: "g-redacted",
      p: 0,
      isRedacted: true,
    });
    const redactedScore = scoreRecommendedCatalogPick(redacted);
    expect(redactedScore.isRecommended).toBe(false);
    expect(redactedScore.valueThresholdLabel).toBeNull();
  });

  it("selectPicksOfTheDay elige máx. 1 por partido en 1.45–2.80, excluye FT/isRedacted/<1.25 y es determinista", () => {
    const strongWindows = [
      makeWindow("L5", "Últimos 5", 4, 5),
      makeWindow("L10", "Últimos 10", 7, 10),
      makeWindow("L20", "Últimos 20", 14, 20),
    ];

    const g1Best = makeCatalogPick({
      id: "g1-best",
      gameId: "game-1",
      p: 0.62,
      marketDecimal: 1.88,
      companionMarketDecimals: [1.88, 1.92],
      windows: strongWindows,
    });
    const g1Second = makeCatalogPick({
      id: "g1-second",
      gameId: "game-1",
      p: 0.54,
      marketDecimal: 1.95,
      companionMarketDecimals: [1.95, 1.85],
      windows: strongWindows.slice(0, 1),
    });
    const g1Trivial = makeCatalogPick({
      id: "g1-trivial",
      gameId: "game-1",
      p: 0.89,
      marketDecimal: 1.14,
      companionMarketDecimals: [1.14, 6.0],
      windows: strongWindows,
    });
    const g2Playable = makeCatalogPick({
      id: "g2-playable",
      gameId: "game-2",
      p: 0.53,
      marketDecimal: 2.15,
      companionMarketDecimals: [2.15, 1.72],
      windows: strongWindows,
    });
    const g3LivePlayable = makeCatalogPick({
      id: "g3-live",
      gameId: "game-3",
      gameStatus: "LIVE",
      p: 0.64,
      marketDecimal: 1.72,
      companionMarketDecimals: [1.72, 2.12],
      windows: strongWindows,
    });
    const g4Fourth = makeCatalogPick({
      id: "g4-fourth",
      gameId: "game-4",
      p: 0.48,
      marketDecimal: 2.35,
      companionMarketDecimals: [2.35, 1.62],
      windows: strongWindows.slice(0, 2),
    });
    const g5FinishedFt = makeCatalogPick({
      id: "g5-ft",
      gameId: "game-5",
      gameStatus: "FT",
      settlement: "hit",
      p: 0.68,
      marketDecimal: 2.0,
      companionMarketDecimals: [2.0, 1.82],
      windows: strongWindows,
      recommendationScore: 99,
    });
    const g6Redacted = makeCatalogPick({
      id: "g6-redacted",
      gameId: "game-6",
      p: 0,
      isRedacted: true,
      recommendationScore: 99,
    });
    const g7TooShort = makeCatalogPick({
      id: "g7-short-135",
      gameId: "game-7",
      p: 0.76,
      marketDecimal: 1.35,
      companionMarketDecimals: [1.35, 3.2],
      windows: strongWindows,
    });
    const g8TooLong = makeCatalogPick({
      id: "g8-long-420",
      gameId: "game-8",
      p: 0.32,
      marketDecimal: 4.2,
      companionMarketDecimals: [4.2, 1.25],
      windows: strongWindows,
    });

    const pool: readonly CatalogPickItem[] = [
      g1Second,
      g5FinishedFt,
      g6Redacted,
      g1Trivial,
      g7TooShort,
      g8TooLong,
      g4Fourth,
      g2Playable,
      g1Best,
      g3LivePlayable,
    ];

    const top3 = selectPicksOfTheDay(pool, 3);
    expect(top3.length).toBeGreaterThanOrEqual(1);
    expect(top3.length).toBeLessThanOrEqual(3);

    const top1 = selectPicksOfTheDay(pool, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0]!.id).toBe(top3[0]!.id);

    const gameIds = top3.map((p) => p.gameId);
    expect(new Set(gameIds).size).toBe(top3.length);

    for (const pick of top3) {
      expect(pick.gameStatus).not.toBe("FT");
      expect(pick.isRedacted).not.toBe(true);
      const effectiveOdds = pick.pricing.marketDecimal ?? pick.pricing.fairOdds;
      expect(effectiveOdds).toBeGreaterThanOrEqual(1.45);
      expect(effectiveOdds).toBeLessThanOrEqual(2.8);
      expect(effectiveOdds).toBeGreaterThanOrEqual(1.25);
    }

    const pickedIds = top3.map((p) => p.id);
    expect(pickedIds).not.toContain("g1-second");
    expect(pickedIds).not.toContain("g1-trivial");
    expect(pickedIds).not.toContain("g5-ft");
    expect(pickedIds).not.toContain("g6-redacted");
    expect(pickedIds).not.toContain("g7-short-135");
    expect(pickedIds).not.toContain("g8-long-420");
    expect(pickedIds).toContain("g1-best");

    const top3ReversedInput = selectPicksOfTheDay(pool.slice().reverse(), 3);
    expect(top3ReversedInput.map((p) => p.id)).toEqual(pickedIds);

    const onlyExcluded = selectPicksOfTheDay(
      [g1Trivial, g5FinishedFt, g6Redacted, g7TooShort, g8TooLong],
      3,
    );
    expect(onlyExcluded).toEqual([]);
  });
});
