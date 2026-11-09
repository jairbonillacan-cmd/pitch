import { describe, expect, it } from "vitest";
import type { GameAnalysis, GameDTO } from "@pitchlab/contracts";
import { headToHead, keepVerifiedPicks, restDays, withPreKickoffPicksOnly } from "../src/pick-context.js";

const game = {
  id: "g1",
  startTime: "2026-11-10T20:00:00Z",
  status: "scheduled",
  home: { id: "liga-mx.chivas", shortName: "Chivas" },
  away: { id: "liga-mx.america", shortName: "América" },
} as unknown as GameDTO;

const analysis = {
  game: "g1",
  publishedAt: "2026-11-09T10:00:00Z",
  picks: [{ profile: "intermedia", market: "h2h", selection: "home", label: "Chivas gana", p: 0.55, fairOdds: 1.82 }],
  confidence: { score: 50, level: "media", reasons: [] },
} as unknown as GameAnalysis;

describe("picks solo antes del inicio", () => {
  it("conserva picks calculados antes del inicio y les pone hora", () => {
    const out = withPreKickoffPicksOnly(analysis, game, "2026-11-09T10:00:00Z");
    expect(out.picks).toHaveLength(1);
    expect(out.picksAt).toBe("2026-11-09T10:00:00Z");
  });

  it("retira picks si el análisis se genera con el partido empezado o terminado", () => {
    expect(withPreKickoffPicksOnly(analysis, game, "2026-11-10T20:30:00Z").picks).toBeUndefined();
    const final = { ...game, status: "final" } as GameDTO;
    expect(withPreKickoffPicksOnly(analysis, final, "2026-11-09T10:00:00Z").picks).toBeUndefined();
  });

  it("un análisis preservado sin constancia previa pierde sus picks", () => {
    expect(keepVerifiedPicks(analysis, game).picks).toBeUndefined();
    const ok = { ...analysis, picksAt: "2026-11-09T10:00:00Z" } as GameAnalysis;
    expect(keepVerifiedPicks(ok, game).picks).toHaveLength(1);
    const late = { ...analysis, picksAt: "2026-11-10T21:00:00Z" } as GameAnalysis;
    expect(keepVerifiedPicks(late, game).picks).toBeUndefined();
  });
});

describe("contexto previo", () => {
  const rows = [
    { date: "2025-03-01", home: "liga-mx.america", away: "liga-mx.chivas", homeGoals: 2, awayGoals: 1 },
    { date: "2026-11-02", home: "liga-mx.chivas", away: "liga-mx.toluca", homeGoals: 0, awayGoals: 0 },
    { date: "2026-11-11", home: "liga-mx.chivas", away: "liga-mx.america", homeGoals: 1, awayGoals: 1 },
  ];

  it("cara a cara: solo cruces anteriores al partido, del más reciente al más antiguo", () => {
    const h2h = headToHead(rows, game);
    expect(h2h).toHaveLength(1);
    expect(h2h[0]!.date).toBe("2025-03-01");
  });

  it("descanso en días y se omite si la brecha sugiere datos faltantes", () => {
    expect(restDays(rows, game)).toEqual({ home: 8 });
  });
});
