import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEAGUE_CATALOG,
  asLeagueId,
  snapshotToMatchAnalyses,
  sportForLeague,
  sportHasDraw,
  sportScoringUnit,
  type LeagueSnapshot,
} from "../src/index";

function readSnapshot(league: "nba" | "nhl"): LeagueSnapshot {
  const file = path.resolve(__dirname, `../../../data/snapshots/${league}/latest.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as LeagueSnapshot;
}

describe("Fase 2 NBA y NHL en @pitchlab/contracts", () => {
  it("habilita nba y nhl en LEAGUE_CATALOG y expone metadatos por deporte", () => {
    const nba = LEAGUE_CATALOG.find((l) => l.id === "nba");
    const nhl = LEAGUE_CATALOG.find((l) => l.id === "nhl");

    expect(nba).toMatchObject({ enabled: true, name: "NBA", shortName: "NBA", sport: "basketball" });
    expect(nhl).toMatchObject({ enabled: true, name: "NHL", shortName: "NHL", sport: "hockey" });

    expect(sportForLeague("nba")).toBe("basketball");
    expect(sportForLeague("nhl")).toBe("ice-hockey");
    expect(sportHasDraw("basketball")).toBe(false);
    expect(sportHasDraw("ice-hockey")).toBe(false);
    expect(sportHasDraw("football")).toBe(true);
    expect(sportScoringUnit("basketball")).toEqual({
      singular: "punto",
      plural: "puntos",
      short: "pts",
      decimals: 1,
    });
    expect(sportScoringUnit("ice-hockey")).toEqual({
      singular: "gol",
      plural: "goles",
      short: "goles",
      decimals: 2,
    });
  });

  it("parsea los snapshots reales de nba y nhl sin inventar pronóstico ni confianza", () => {
    const nba = readSnapshot("nba");
    const nhl = readSnapshot("nhl");

    const { matches: nbaAnalyses } = snapshotToMatchAnalyses(nba);
    const { matches: nhlAnalyses } = snapshotToMatchAnalyses(nhl);

    expect(nbaAnalyses.length).toBe(nba.games.length);
    expect(nhlAnalyses.length).toBe(nhl.games.length);

    const nbaScheduled = nbaAnalyses.filter((m) => m.status !== "FT" && m.hasForecast !== false);
    expect(nbaScheduled.length).toBeGreaterThan(0);
    for (const m of nbaScheduled) {
      expect(m.sport).toBe("basketball");
      expect(m.x12?.[1]).toBe(0);
      expect(m.projection).toBeDefined();
      expect((m.marketGroups ?? []).some((g) => /ganador/i.test(g.group))).toBe(true);
      expect(m.outcomes.some((o) => o.key === "draw" || /empate/i.test(o.label))).toBe(false);
    }

    const nhlScheduled = nhlAnalyses.filter((m) => m.status !== "FT" && m.hasForecast !== false);
    expect(nhlScheduled.length).toBeGreaterThan(0);
    expect(
      nhlScheduled.some((m) => m.factors.some((f) => /tiempo extra/i.test(f.label))),
    ).toBe(true);
    for (const m of nhlScheduled) {
      expect(m.sport).toBe("ice-hockey");
      expect(m.x12?.[1]).toBe(0);
      expect(m.outcomes.some((o) => o.key === "draw" || /empate/i.test(o.label))).toBe(false);
    }

    // Finales o encuentros sin entrada en `analyses` nunca reciben mercados ni x12 sintéticos.
    for (const missing of [...nbaAnalyses, ...nhlAnalyses].filter((m) => m.hasForecast === false)) {
      expect(missing.x12).toBeUndefined();
      expect(missing.projection).toBeUndefined();
      expect(missing.confidence).toBeUndefined();
      expect(missing.marketGroups).toEqual([]);
      expect(missing.outcomes).toEqual([]);
    }
  });

  it("mantiene undefined confianza o pronóstico cuando un análisis sintético los omite", () => {
    const sample = readSnapshot("nba");
    const first = sample.games[0]!;
    const stripped: LeagueSnapshot = {
      ...sample,
      league: asLeagueId("nba"),
      games: [first],
      analyses: {},
    };

    const { matches } = snapshotToMatchAnalyses(stripped);
    const [parsed] = matches;
    expect(parsed).toBeDefined();
    expect(parsed!.hasForecast).toBe(false);
    expect(parsed!.x12).toBeUndefined();
    expect(parsed!.projection).toBeUndefined();
    expect(parsed!.confidence).toBeUndefined();
    expect(parsed!.marketGroups).toEqual([]);
  });
});
