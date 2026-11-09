import { describe, expect, it } from "vitest";
import type { GameDTO } from "@pitchlab/contracts";
import { mergeFootballDataIntoSeason, nameSimilarity } from "../src/adapters/football-data-merge.js";
import type { NormalizedOpenFootballSeason } from "../src/adapters/openfootball.js";

const team = (id: string, name: string) =>
  ({ id, league: "bundesliga", name, shortName: name, code: name.slice(0, 3).toUpperCase() }) as GameDTO["home"];

const bayern = team("bundesliga.bayern-munchen", "Bayern München");
const koln = team("bundesliga.1-fc-koln", "1. FC Köln");
const leipzig = team("bundesliga.rb-leipzig", "RB Leipzig");
const union = team("bundesliga.union-berlin", "1. FC Union Berlin");

const game = (id: string, week: number, home: GameDTO["home"], away: GameDTO["home"]): GameDTO =>
  ({
    id,
    league: "bundesliga",
    season: "bundesliga-2026-27",
    week,
    round: `Jornada ${week}`,
    startTime: "2026-09-20T15:00:00",
    status: "scheduled",
    home,
    away,
    neutralSite: false,
  }) as unknown as GameDTO;

const season: NormalizedOpenFootballSeason = {
  seasonId: "bundesliga-2026-27",
  seasonLabel: "2026/27",
  activeMatchday: 1,
  periodLabel: "Jornada 1",
  allGames: [game("g1", 1, bayern, koln), game("g2", 1, union, leipzig), game("g3", 2, koln, union), game("g4", 2, leipzig, bayern)],
  activeRoundGames: [],
  teamRateInputs: [bayern, koln, leipzig, union].map((t) => ({
    teamId: t.id,
    name: t.name,
    shortName: t.shortName,
    code: t.code,
    goalsFor: 0,
    goalsAgainst: 0,
    gamesPlayed: 0,
  })),
};

const fd = {
  matches: [
    { id: 1, utcDate: "2026-11-06T19:30:00Z", status: "FINISHED", matchday: 1, homeTeam: { name: "FC Bayern München", shortName: "Bayern" }, awayTeam: { name: "1. FC Köln", shortName: "Köln" }, score: { fullTime: { home: 3, away: 1 } } },
    { id: 2, utcDate: "2026-11-07T14:30:00Z", status: "IN_PLAY", matchday: 1, homeTeam: { name: "1. FC Union Berlin", shortName: "Union Berlin" }, awayTeam: { name: "RB Leipzig", shortName: "RB Leipzig" }, score: { fullTime: { home: 0, away: 0 } } },
    { id: 3, utcDate: "2026-11-21T14:30:00Z", status: "TIMED", matchday: 2, homeTeam: { name: "1. FC Köln", shortName: "Köln" }, awayTeam: { name: "1. FC Union Berlin", shortName: "Union Berlin" }, score: { fullTime: { home: null, away: null } } },
    { id: 4, utcDate: "2026-11-22T16:30:00Z", status: "TIMED", matchday: 2, homeTeam: { name: "RB Leipzig", shortName: "RB Leipzig" }, awayTeam: { name: "FC Bayern München", shortName: "Bayern" }, score: { fullTime: { home: null, away: null } } },
  ],
};

describe("football-data.org sobre el calendario de openfootball", () => {
  it("empareja nombres con acentos, prefijos y siglas", () => {
    expect(nameSimilarity("Bayern München", "FC Bayern München")).toBe(1);
    expect(nameSimilarity("1. FC Köln", "1. FC Köln")).toBe(1);
    expect(nameSimilarity("RB Leipzig", "FC Bayern München")).toBe(0);
    expect(nameSimilarity("Deportivo de La Coruña", "RC Deportivo La Coruña")).toBe(1);
  });

  it("conserva los ids, toma resultado, estado y hora real, y recalcula la jornada activa", () => {
    const { season: merged, report } = mergeFootballDataIntoSeason(season, fd, {
      referenceDate: "2026-11-09",
      now: Date.parse("2026-11-09T10:00:00Z"),
    });
    expect(report).toEqual({ matched: 4, unmatched: 0, updatedResults: 1 });
    const g1 = merged.allGames.find((g) => g.id === "g1")!;
    expect(g1.status).toBe("final");
    expect(g1.result).toMatchObject({ home: 3, away: 1, source: "football-data" });
    expect(g1.startTime).toBe("2026-11-06T19:30:00Z");
    expect(merged.allGames.find((g) => g.id === "g2")!.status).toBe("in_progress");
    expect(merged.allGames.find((g) => g.id === "g2")!.result).toBeUndefined();
    // La jornada 1 tiene un partido en juego hace menos de 3 días: sigue activa.
    expect(merged.activeMatchday).toBe(1);
    const rates = Object.fromEntries(merged.teamRateInputs.map((t) => [t.teamId, t.gamesPlayed]));
    expect(rates["bundesliga.bayern-munchen"]).toBe(0);
  });

  it("avanza a la siguiente jornada cuando la actual ya terminó", () => {
    const done = {
      matches: fd.matches.map((m) => (m.id === 2 ? { ...m, status: "FINISHED", score: { fullTime: { home: 1, away: 2 } } } : m)),
    };
    const { season: merged } = mergeFootballDataIntoSeason(season, done, { referenceDate: "2026-11-09" });
    expect(merged.activeMatchday).toBe(2);
    expect(merged.activeRoundGames.map((g) => g.id)).toEqual(["g3", "g4"]);
    const rates = Object.fromEntries(merged.teamRateInputs.map((t) => [t.teamId, t]));
    expect(rates["bundesliga.bayern-munchen"]!.goalsFor).toBe(3);
    expect(rates["bundesliga.rb-leipzig"]!.gamesPlayed).toBe(1);
  });
});
