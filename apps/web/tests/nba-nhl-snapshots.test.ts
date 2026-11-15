import { describe, expect, it } from "vitest";
import { buildServerRawPlatformDataset, loadGameSummary } from "../src/server/platform-data";
import { loadLeagueSnapshotEnvelope } from "../src/server/snapshots";

describe("Snapshots reales de NBA y NHL en servidor Next.js", () => {
  it("carga sobres reales para nba y nhl conservando factores de prórroga y estados vacíos", () => {
    const nba = loadLeagueSnapshotEnvelope("nba");
    const nhl = loadLeagueSnapshotEnvelope("nhl");

    expect(nba.state).toBe("ready");
    expect(nhl.state).toBe("ready");
    expect(nba.data?.sport).toBe("basketball");
    expect(nhl.data?.sport).toBe("ice-hockey");

    const nbaScheduled = nba.data!.games.filter((g) => g.status !== "FT" && g.hasForecast !== false);
    const nhlScheduled = nhl.data!.games.filter((g) => g.status !== "FT" && g.hasForecast !== false);
    expect(nbaScheduled.length).toBeGreaterThan(0);
    expect(nhlScheduled.length).toBeGreaterThan(0);

    // `matchContext` en snapshots.ts debe dejar pasar «Tiempo extra» en NHL.
    expect(
      nhlScheduled.some((g) =>
        g.factors.some(
          (f) => /tiempo extra/i.test(f.label) && /penales/i.test(f.sub ?? ""),
        ),
      ),
    ).toBe(true);

    // Ningún partido de NBA/NHL sin análisis inventa proyección ni x12.
    for (const empty of [...nba.data!.games, ...nhl.data!.games].filter((g) => g.hasForecast === false)) {
      expect(empty.x12).toBeUndefined();
      expect(empty.projection).toBeUndefined();
      expect(empty.confidence).toBeUndefined();
      expect(empty.marketGroups).toEqual([]);
    }
  });

  it("expone NBA y NHL en buildServerRawPlatformDataset y carga resumen individual de partido finalizado", async () => {
    const dataset = buildServerRawPlatformDataset();
    const ids = dataset.leagues.map((l) => l.league);
    expect(ids).toContain("nba");
    expect(ids).toContain("nhl");

    const nbaGames = dataset.games.filter((g) => g.league === "nba");
    const nhlGames = dataset.games.filter((g) => g.league === "nhl");
    expect(nbaGames.length).toBeGreaterThan(0);
    expect(nhlGames.length).toBeGreaterThan(0);
    expect(nbaGames.every((g) => g.sport === "basketball")).toBe(true);
    expect(nhlGames.every((g) => g.sport === "ice-hockey")).toBe(true);

    const nbaScheduledEnv = loadLeagueSnapshotEnvelope("nba").data!.games.find(
      (g) => g.status !== "FT" && g.hasForecast !== false,
    )!;
    const nhlScheduledEnv = loadLeagueSnapshotEnvelope("nhl").data!.games.find(
      (g) => g.status !== "FT" && g.hasForecast !== false,
    )!;
    const nbaScheduledDs = dataset.games.find((g) => g.id === nbaScheduledEnv.id)!;
    const nhlScheduledDs = dataset.games.find((g) => g.id === nhlScheduledEnv.id)!;

    expect(nbaScheduledDs.x12?.[1]).toBe(0);
    expect((nbaScheduledDs.x12?.[0] ?? 0) + (nbaScheduledDs.x12?.[2] ?? 0)).toBeCloseTo(1, 3);
    expect(nbaScheduledDs.projection?.home).toBeCloseTo(nbaScheduledEnv.projection!.home, 2);
    expect(nbaScheduledDs.projection?.away).toBeCloseTo(nbaScheduledEnv.projection!.away, 2);
    expect(nbaScheduledDs.picks.every((p) => p.engineName === "Motor NBA")).toBe(true);

    expect(nhlScheduledDs.x12?.[1]).toBe(0);
    expect((nhlScheduledDs.x12?.[0] ?? 0) + (nhlScheduledDs.x12?.[2] ?? 0)).toBeCloseTo(1, 3);
    expect(nhlScheduledDs.projection?.home).toBeCloseTo(nhlScheduledEnv.projection!.home, 2);
    expect(nhlScheduledDs.projection?.away).toBeCloseTo(nhlScheduledEnv.projection!.away, 2);
    expect(nhlScheduledDs.picks.every((p) => p.engineName === "Motor NHL")).toBe(true);

    const nhlEnv = loadLeagueSnapshotEnvelope("nhl");
    const finalNhl = nhlEnv.data?.games.find((g) => g.status === "FT" && g.hasForecast === false);
    if (finalNhl) {
      const summary = await loadGameSummary(finalNhl.id);
      expect(summary).not.toBeNull();
      expect(summary!.hasForecast).toBe(false);
      expect(summary!.x12).toBeNull();
      expect(summary!.projection).toBeNull();
      expect(summary!.confidenceScore).toBeNull();
      expect(summary!.picks).toEqual([]);
    }
  });
});
