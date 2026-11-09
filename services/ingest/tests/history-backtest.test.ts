import { describe, expect, it } from "vitest";
import {
  americanToImplied,
  groupIntoPeriods,
  noVigPair,
} from "../src/index.js";
import type { HistoricalGame } from "../src/history/schema.js";

function game(overrides: Partial<HistoricalGame> & Pick<HistoricalGame, "id" | "date">): HistoricalGame {
  return {
    sport: "soccer",
    league: "premier-league",
    season: "2024-25",
    period: 1,
    stage: null,
    phase: "regular",
    kickoff: null,
    kickoffZone: null,
    homeTeam: "premier-league.arsenal",
    awayTeam: "premier-league.chelsea",
    homeScore: 1,
    awayScore: 0,
    neutralSite: false,
    source: "openfootball",
    sourceId: overrides.id,
    availableAt: "2024-08-19T23:59:59.000Z",
    ...overrides,
  };
}

describe("conversión de cuotas para el benchmark", () => {
  it("convierte cuotas americanas a probabilidad implícita", () => {
    expect(americanToImplied(-110)).toBeCloseTo(110 / 210, 10);
    expect(americanToImplied(100)).toBeCloseTo(0.5, 10);
    expect(americanToImplied(-200)).toBeCloseTo(2 / 3, 10);
    expect(americanToImplied(0)).toBeNull();
    expect(americanToImplied(Number.NaN)).toBeNull();
  });

  it("quita el vig normalizando el par", () => {
    const pair = noVigPair(0.55, 0.5)!;
    expect(pair.home).toBeCloseTo(0.55 / 1.05, 10);
    expect(pair.away).toBeCloseTo(0.5 / 1.05, 10);
    expect(pair.home + pair.away).toBeCloseTo(1, 10);
    expect(noVigPair(null, 0.5)).toBeNull();
    expect(noVigPair(0, 0)).toBeNull();
  });
});

describe("agrupación en jornadas del benchmark", () => {
  it("agrupa por temporada, torneo y jornada, y ordena por fecha", () => {
    const games = [
      game({ id: "b", date: "2024-08-25", period: 2 }),
      game({ id: "a", date: "2024-08-18", period: 1 }),
      game({
        id: "d",
        date: "2024-08-18",
        period: 1,
        homeTeam: "premier-league.liverpool",
        awayTeam: "premier-league.everton",
      }),
      game({
        id: "c",
        date: "2024-08-19",
        period: 1,
        stage: "Apertura",
        league: "liga-mx",
        homeTeam: "liga-mx.tijuana",
        awayTeam: "liga-mx.america",
      }),
    ];

    const blocks = groupIntoPeriods(games);
    expect(blocks.map((block) => block.key)).toEqual([
      "2024-25||1",
      "2024-25|Apertura|1",
      "2024-25||2",
    ]);
    expect(blocks[0]!.games).toHaveLength(2);
    expect(blocks[0]!.date).toBe("2024-08-18");
    expect(blocks[2]!.games[0]!.id).toBe("b");
  });

  it("mantiene separadas las jornadas de Apertura y Clausura con el mismo número", () => {
    const apertura = game({
      id: "ap",
      date: "2024-07-05",
      period: 1,
      stage: "Apertura",
      league: "liga-mx",
      homeTeam: "liga-mx.tijuana",
      awayTeam: "liga-mx.america",
    });
    const clausura = game({
      id: "cl",
      date: "2025-01-10",
      period: 1,
      stage: "Clausura",
      league: "liga-mx",
      homeTeam: "liga-mx.tijuana",
      awayTeam: "liga-mx.america",
    });

    const blocks = groupIntoPeriods([apertura, clausura]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.key)).toEqual(["2024-25|Apertura|1", "2024-25|Clausura|1"]);
  });
});
