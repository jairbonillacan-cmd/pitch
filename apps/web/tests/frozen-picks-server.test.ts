import { beforeEach, describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import type { MatchPick, PlatformGame } from "@pitchlab/ui/platform";
import {
  clearServerFrozenPicksCacheForTests,
  resolveServerFrozenMainPick,
} from "../src/server/frozen-picks";

function makePick(overrides: Partial<MatchPick> = {}): MatchPick {
  return {
    id: "mx-qro-mty__pick-1",
    gameId: "mx-2026-j16-queretaro-monterrey-401876988",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    matchLabel: "Querétaro vs Monterrey",
    kickoffLocal: "17:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "principal",
    categoryLabel: "Doble oportunidad",
    risk: "conservador",
    engineKey: "tachyon",
    engineName: "PitchLab Tachyon",
    marketGroup: "Doble oportunidad",
    selectionKey: "1x",
    conflictGroup: "home_side",
    label: "Querétaro o empate",
    rationale: "Frecuencia histórica favorable.",
    p: 0.654,
    fairDecimal: 1.53,
    fairAmerican: -189,
    marketDecimal: null,
    marketAmerican: null,
    edgePts: null,
    confidenceScore: 66,
    suggestedUnits: 1,
    ...overrides,
  };
}

function makeServerGame(
  overrides: Partial<Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks">> = {},
): Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks"> {
  return {
    id: "mx-2026-j16-queretaro-monterrey-401876988",
    kickoffUtc: "2026-11-14T23:00:00Z",
    status: "NS",
    picks: [makePick()],
    ...overrides,
  };
}

describe("resolveServerFrozenMainPick: congelado en servidor", () => {
  beforeEach(() => {
    clearServerFrozenPicksCacheForTests();
  });

  it("no congela antes de T - 60 min y sella de forma inmutable al llegar al límite", async () => {
    const initial = makeServerGame();

    const before = await resolveServerFrozenMainPick(
      initial,
      new Date("2026-11-14T21:59:59Z"),
    );
    expect(before).toBeNull();

    const atBoundary = await resolveServerFrozenMainPick(
      initial,
      new Date("2026-11-14T22:00:00Z"),
    );
    expect(atBoundary).not.toBeNull();
    expect(atBoundary?.label).toBe("Querétaro o empate");
    expect(atBoundary?.p).toBeCloseTo(0.654, 5);
    expect(atBoundary?.freezeAtUtc).toBe("2026-11-14T22:00:00.000Z");

    // Recálculo posterior del motor: el servidor mantiene intacto el pick congelado
    const recalculated = makeServerGame({
      picks: [
        makePick({
          id: "mx-qro-mty__pick-recalc",
          label: "Monterrey gana",
          p: 0.54,
          fairDecimal: 1.85,
          fairAmerican: -118,
        }),
      ],
    });
    const afterRecalc = await resolveServerFrozenMainPick(
      recalculated,
      new Date("2026-11-14T22:45:00Z"),
    );
    expect(afterRecalc?.pickId).toBe("mx-qro-mty__pick-1");
    expect(afterRecalc?.label).toBe("Querétaro o empate");
    expect(afterRecalc?.p).toBeCloseTo(0.654, 5);
  });
});
