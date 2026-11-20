import { describe, expect, it } from "vitest";
import { asGameId, asLeagueId, asSeasonId, asTeamId, GameAnalysisSchema } from "@pitchlab/contracts";
import { analyzeMlbGame, createMlbTracker } from "../src/index.js";

describe("Modelo MLB walk-forward", () => {
  it("actualiza ratings y genera análisis válido sin empates", () => {
    const tracker = createMlbTracker();
    tracker.update({
      date: "2026-09-25",
      season: "2026",
      home: "mlb.los-angeles-dodgers",
      away: "mlb.colorado-rockies",
      homeScore: 7,
      awayScore: 2,
    });
    tracker.update({
      date: "2026-09-26",
      season: "2026",
      home: "mlb.los-angeles-dodgers",
      away: "mlb.colorado-rockies",
      homeScore: 6,
      awayScore: 3,
    });

    const pred = tracker.predict({
      date: "2026-09-27",
      season: "2026",
      home: "mlb.los-angeles-dodgers",
      away: "mlb.colorado-rockies",
    });

    expect(pred.pHome).toBeGreaterThan(0.5);
    expect(pred.expectedHome).toBeGreaterThan(pred.expectedAway);

    const analysis = analyzeMlbGame({
      game: {
        id: asGameId("mlb-2026-09-27-col-lad"),
        league: asLeagueId("mlb"),
        season: asSeasonId("mlb-2026"),
        startTime: "2026-09-27T20:10:00Z",
        status: "scheduled",
        home: {
          id: asTeamId("mlb.los-angeles-dodgers"),
          league: asLeagueId("mlb"),
          name: "Los Angeles Dodgers",
          shortName: "Dodgers",
          code: "LAD",
        },
        away: {
          id: asTeamId("mlb.colorado-rockies"),
          league: asLeagueId("mlb"),
          name: "Colorado Rockies",
          shortName: "Rockies",
          code: "COL",
        },
        neutralSite: false,
      },
      prediction: pred,
      gamesSeen: 2,
      homeGamesPlayed: 2,
      awayGamesPlayed: 2,
      homeStarterName: "Yoshinobu Yamamoto",
      awayStarterName: "Kyle Freeland",
      inputsAsOf: "2026-09-27T18:00:00Z",
      publishedAt: "2026-09-27T18:00:00Z",
      source: "mlb_statsapi",
    });

    const parsed = GameAnalysisSchema.parse(analysis);
    expect(parsed.x12[1]).toBe(0);
    expect(parsed.x12[0] + parsed.x12[2]).toBeCloseTo(1, 5);
    expect(parsed.marketGroups.some((g) => g.group.includes("Run line"))).toBe(true);
    expect(parsed.picks?.some((p) => /empate/i.test(p.label))).toBe(false);
  });
});
