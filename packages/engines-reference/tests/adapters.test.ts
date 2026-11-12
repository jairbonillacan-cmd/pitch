import { describe, expect, it } from "vitest";
import {
  GameAnalysisSchema,
  asGameId,
  asLeagueId,
  asSeasonId,
  asTeamId,
  type GameDTO,
} from "@pitchlab/contracts";
import { analyzeFootballGame, analyzeNflGame } from "../src/index.js";

describe("@pitchlab/engines-reference adapters", () => {
  it("analyzeFootballGame produce un GameAnalysis válido con 13 mercados y sin términos prohibidos (FD-16)", () => {
    const game: GameDTO = {
      id: asGameId("pl-2026-md10-ars-che"),
      league: asLeagueId("premier-league"),
      season: asSeasonId("premier-league-2026-27"),
      round: "Jornada 10",
      startTime: "2026-11-07T15:00:00Z",
      status: "scheduled",
      home: {
        id: asTeamId("premier-league.arsenal"),
        league: asLeagueId("premier-league"),
        name: "Arsenal",
        shortName: "Arsenal",
        code: "ARS",
      },
      away: {
        id: asTeamId("premier-league.chelsea"),
        league: asLeagueId("premier-league"),
        name: "Chelsea",
        shortName: "Chelsea",
        code: "CHE",
      },
      venue: "Emirates Stadium",
      neutralSite: false,
    };

    const analysis = analyzeFootballGame({
      league: "premier-league",
      leagueName: "Premier League",
      game,
      teams: [
        {
          teamId: "premier-league.arsenal",
          name: "Arsenal",
          shortName: "Arsenal",
          code: "ARS",
          goalsFor: 12,
          goalsAgainst: 4,
          gamesPlayed: 5,
        },
        {
          teamId: "premier-league.chelsea",
          name: "Chelsea",
          shortName: "Chelsea",
          code: "CHE",
          goalsFor: 8,
          goalsAgainst: 6,
          gamesPlayed: 5,
        },
      ],
      inputsAsOf: "2026-11-08T12:00:00Z",
      publishedAt: "2026-11-08T12:00:00Z",
      source: "openfootball",
    });

    const parsed = GameAnalysisSchema.parse(analysis);
    expect(parsed.probabilities).toHaveLength(13);
    expect(parsed.steps).toHaveLength(6);
    expect(parsed.mostLikelyScore).toBeDefined();
    expect(parsed.x12[0] + parsed.x12[1] + parsed.x12[2]).toBeCloseTo(1, 2);

    const textBlob = JSON.stringify({
      label: parsed.model.label,
      steps: parsed.steps,
      factors: parsed.factors,
    }).toLowerCase();
    for (const forbidden of [
      "poisson",
      "dixon-coles",
      "pitágoras",
      "pitagoras",
      "log5",
      "baseline",
      "openfootball",
      "nflverse",
      "api-football",
    ]) {
      expect(textBlob).not.toContain(forbidden);
    }
    expect(textBlob).not.toMatch(/\belo\b/i);
  });

  it("analyzeNflGame produce un GameAnalysis válido con 6 mercados y respeta FD-16", () => {
    const game: GameDTO = {
      id: asGameId("nfl-2026-w9-hou-lac"),
      league: asLeagueId("nfl"),
      season: asSeasonId("nfl-2026"),
      week: 9,
      round: "Semana 9",
      startTime: "2026-11-08T21:05:00Z",
      status: "scheduled",
      home: {
        id: asTeamId("nfl.los-angeles-chargers"),
        league: asLeagueId("nfl"),
        name: "Los Angeles Chargers",
        shortName: "LA Chargers",
        code: "LAC",
      },
      away: {
        id: asTeamId("nfl.houston-texans"),
        league: asLeagueId("nfl"),
        name: "Houston Texans",
        shortName: "Houston",
        code: "HOU",
      },
      venue: "SoFi Stadium",
      neutralSite: false,
    };

    const analysis = analyzeNflGame({
      game,
      teams: [
        {
          teamId: "nfl.los-angeles-chargers",
          name: "Los Angeles Chargers",
          shortName: "LA Chargers",
          code: "LAC",
          pointsFor: 192,
          pointsAgainst: 148,
          gamesPlayed: 8,
        },
        {
          teamId: "nfl.houston-texans",
          name: "Houston Texans",
          shortName: "Houston",
          code: "HOU",
          pointsFor: 180,
          pointsAgainst: 168,
          gamesPlayed: 8,
        },
      ],
      inputsAsOf: "2026-11-08T12:00:00Z",
      publishedAt: "2026-11-08T12:00:00Z",
      source: "nflverse",
    });

    const parsed = GameAnalysisSchema.parse(analysis);
    expect(parsed.probabilities).toHaveLength(6);
    expect(parsed.steps).toHaveLength(6);
    expect(parsed.x12[0] + parsed.x12[2]).toBeCloseTo(1, 5);
  });
});
