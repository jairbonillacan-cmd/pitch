import { describe, expect, it } from "vitest";
import {
  apiFootballSeasonLabel,
  getHistoryLeague,
  normalizeApiFootballHistory,
  parseApiRound,
} from "../src/index.js";

function fixture(overrides: {
  id: number;
  date: string;
  status: string;
  round: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
}) {
  return {
    fixture: { id: overrides.id, date: overrides.date, status: { short: overrides.status } },
    league: { id: 262, name: "Liga MX", season: 2022, round: overrides.round },
    teams: { home: { id: 1, name: overrides.home }, away: { id: 2, name: overrides.away } },
    goals: { home: overrides.homeGoals, away: overrides.awayGoals },
  };
}

describe("API-Football — temporada y rondas de Liga MX", () => {
  it("convierte el año inicial en temporada de dos años", () => {
    expect(apiFootballSeasonLabel(2022)).toBe("2022-23");
    expect(apiFootballSeasonLabel(1999)).toBe("1999-00");
    expect(apiFootballSeasonLabel(2026)).toBe("2026-27");
  });

  it("distingue jornada regular de liguilla", () => {
    expect(parseApiRound("Apertura - 12")).toEqual({
      stage: "Apertura",
      period: 12,
      phase: "regular",
    });
    expect(parseApiRound("Clausura - Final")).toEqual({
      stage: "Clausura Playoffs",
      period: 21,
      phase: "postseason",
    });
    expect(parseApiRound("Apertura - Reclasificacion")?.period).toBe(18);
    expect(parseApiRound("Clausura - Semi-finals")?.period).toBe(20);
    expect(parseApiRound("Apertura - Octavos")).toBeNull();
    expect(parseApiRound("Ronda rara")).toBeNull();
  });
});

describe("API-Football — normalización del histórico de Liga MX", () => {
  const payload = {
    response: [
      fixture({
        id: 1,
        date: "2022-07-02T02:05:00+00:00",
        status: "FT",
        round: "Apertura - 1",
        home: "Mazatlán",
        away: "Puebla",
        homeGoals: 2,
        awayGoals: 4,
      }),
      fixture({
        id: 2,
        date: "2022-11-20T02:00:00+00:00",
        status: "PEN",
        round: "Apertura - Final",
        home: "Club America",
        away: "Tigres UANL",
        homeGoals: 1,
        awayGoals: 1,
      }),
      fixture({
        id: 3,
        date: "2023-01-10T02:00:00+00:00",
        status: "NS",
        round: "Clausura - 1",
        home: "Atlas",
        away: "León",
        homeGoals: null,
        awayGoals: null,
      }),
      fixture({
        id: 4,
        date: "2023-01-11T02:00:00+00:00",
        status: "FT",
        round: "Clausura - Octavos",
        home: "Atlas",
        away: "León",
        homeGoals: 1,
        awayGoals: 0,
      }),
      fixture({
        id: 5,
        date: "2023-01-12T02:00:00+00:00",
        status: "FT",
        round: "Clausura - 2",
        home: "Equipo Inventado",
        away: "Puebla",
        homeGoals: 0,
        awayGoals: 0,
      }),
    ],
  };

  const result = normalizeApiFootballHistory(payload, {
    league: getHistoryLeague("liga-mx"),
    season: 2022,
  });

  it("conserva solo partidos jugados y con equipos mapeados", () => {
    expect(result.games).toHaveLength(2);
    expect(result.skipped.notFinished).toBe(1);
    expect(result.skipped.withoutRound).toBe(1);
    expect(result.unmatchedNames).toEqual(["Equipo Inventado"]);
  });

  it("genera ids con torneo y fase del corpus", () => {
    expect(result.games[0]!.id).toBe("liga-mx:2022-23:apertura:mazatlan:puebla");
    expect(result.games[0]!.stage).toBe("Apertura");
    expect(result.games[0]!.period).toBe(1);
    expect(result.games[0]!.phase).toBe("regular");
    expect(result.games[0]!.odds).toBeNull();
    expect(result.games[0]!.source).toBe("api-football");

    const final = result.games[1]!;
    expect(final.id).toBe("liga-mx:2022-23:apertura-playoffs:america:uanl-tigres");
    expect(final.phase).toBe("postseason");
    expect(final.homeTeam).toBe("liga-mx.america");
    expect(final.awayTeam).toBe("liga-mx.uanl-tigres");
  });
});
