import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HISTORY_LEAGUES,
  auditLeague,
  getHistoryLeague,
  nflTeamKey,
  normalizeNflverseHistory,
  normalizeOpenFootballHistory,
  parseStage,
  scoreAvailableAt,
  slugifyTeamName,
  soccerTeamKey,
  teamKeyTokens,
} from "../src/index.js";
import type { HistoricalGame } from "../src/history/schema.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures/history");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

const premierLeague = HISTORY_LEAGUES["premier-league"];
const laLiga = HISTORY_LEAGUES["la-liga"];

function game(overrides: Partial<HistoricalGame> & Pick<HistoricalGame, "id" | "homeTeam" | "awayTeam">): HistoricalGame {
  return {
    sport: "soccer",
    league: "la-liga",
    season: "2024-25",
    period: 1,
    stage: null,
    phase: "regular",
    date: "2024-08-18",
    kickoff: "20:00",
    kickoffZone: null,
    homeScore: 1,
    awayScore: 0,
    neutralSite: false,
    source: "openfootball",
    sourceId: overrides.id,
    availableAt: "2024-08-19T23:59:59.000Z",
    ...overrides,
  };
}

describe("identidad de equipos del histórico", () => {
  it("normaliza sufijos y conectores de club sin perder el nombre propio", () => {
    expect(slugifyTeamName("Brighton & Hove Albion FC")).toBe("brighton-hove-albion");
    expect(slugifyTeamName("Liverpool FC")).toBe("liverpool");
    expect(slugifyTeamName("1. FC Union Berlin")).toBe("union-berlin");
    expect(slugifyTeamName("Atlético de Madrid")).toBe("atletico-madrid");
    expect(slugifyTeamName("Borussia Mönchengladbach")).toBe("borussia-monchengladbach");
    expect(slugifyTeamName("Paris Saint-Germain")).toBe("paris-saint-germain");
  });

  it("construye claves de fútbol con el prefijo de la liga y aplica alias explícitos", () => {
    expect(soccerTeamKey(premierLeague, "Arsenal FC")).toBe("premier-league.arsenal");
    expect(soccerTeamKey(laLiga, "Real Madrid CF")).toBe("la-liga.real-madrid");
    const aliased = {
      ...laLiga,
      teamAliases: { "Real Betis Balompié": "real-betis" },
    };
    expect(soccerTeamKey(aliased, "Real Betis Balompié")).toBe("la-liga.real-betis");
  });

  it("conserva la franquicia NFL aunque la ciudad cambie", () => {
    expect(nflTeamKey("STL")).toBe("nfl.los-angeles-rams");
    expect(nflTeamKey("LA")).toBe("nfl.los-angeles-rams");
    expect(nflTeamKey("OAK")).toBe("nfl.las-vegas-raiders");
    expect(nflTeamKey("LV")).toBe("nfl.las-vegas-raiders");
    expect(nflTeamKey("SD")).toBe("nfl.los-angeles-chargers");
    expect(nflTeamKey("LAC")).toBe("nfl.los-angeles-chargers");
    expect(nflTeamKey("KC")).toBe("nfl.kansas-city-chiefs");
    expect(() => nflTeamKey("ZZZ")).toThrow(/UnmappedTeamError/);
  });

  it("extrae tokens comparables de una clave", () => {
    expect(teamKeyTokens("la-liga.atletico-madrid")).toEqual(["atletico", "madrid"]);
  });
});

describe("normalización del histórico de fútbol (openfootball)", () => {
  const raw = JSON.parse(readFixture("openfootball-en-2010-11-sample.json"));

  it("conserva solo partidos jugados y deriva jornada, marcador y disponibilidad", () => {
    const result = normalizeOpenFootballHistory(raw, {
      league: premierLeague,
      season: "2010-11",
    });

    expect(result.games).toHaveLength(4);
    expect(result.skipped.withoutScore).toBe(1);
    expect(result.seasonLabel).toBe("English Premier League 2010/11");

    const first = result.games[0]!;
    expect(first.id).toBe("premier-league:2010-11:tottenham-hotspur:manchester-city");
    expect(first.homeTeam).toBe("premier-league.tottenham-hotspur");
    expect(first.awayTeam).toBe("premier-league.manchester-city");
    expect(first.period).toBe(1);
    expect(first.kickoff).toBe("12:45");
    expect(first.kickoffZone).toBeNull();
    expect(first.homeScore).toBe(0);
    expect(first.awayScore).toBe(0);
    expect(first.availableAt).toBe("2010-08-15T23:59:59.000Z");
    expect(first.sourceId).toBe("2010-11/en.1#0");
  });

  it("calcula availableAt como fin del día del partido más 24 h", () => {
    expect(scoreAvailableAt("2026-11-07")).toBe("2026-11-08T23:59:59.000Z");
  });

  it("separa Apertura y Clausura cuando la liga parte la temporada en dos torneos", () => {
    const ligaMx = HISTORY_LEAGUES["liga-mx"];
    const raw = {
      name: "Liga MX 2024/25",
      matches: [
        {
          round: "Apertura, Matchday 1",
          date: "2024-07-05",
          time: "19:00",
          team1: "Club Tijuana",
          team2: "Club América",
          score: { ft: [2, 1] },
        },
        {
          round: "Clausura, Matchday 1",
          date: "2025-01-10",
          time: "19:00",
          team1: "Club Tijuana",
          team2: "Club América",
          score: { ft: [0, 2] },
        },
        {
          round: "Apertura, Quarter-finals",
          date: "2024-11-27",
          team1: "Club Tijuana",
          team2: "Cruz Azul",
          score: { ft: [1, 0] },
        },
      ],
    };

    expect(parseStage("Apertura, Matchday 1")).toBe("Apertura");
    expect(parseStage("Matchday 1")).toBeNull();

    const result = normalizeOpenFootballHistory(raw, { league: ligaMx, season: "2024-25" });
    expect(result.games).toHaveLength(2);
    expect(result.skipped.withoutPeriod).toBe(1);
    expect(result.games[0]!.stage).toBe("Apertura");
    expect(result.games[0]!.id).toBe("liga-mx:2024-25:apertura:tijuana:america");
    expect(result.games[1]!.stage).toBe("Clausura");
    expect(result.games[1]!.id).toBe("liga-mx:2024-25:clausura:tijuana:america");

    const audit = auditLeague({ league: ligaMx, games: result.games });
    expect(audit.issues.some((issue) => issue.code === "duplicate_game_id")).toBe(false);
    expect(audit.issues.some((issue) => issue.code === "team_plays_twice_in_period")).toBe(false);
  });
});

describe("normalización del histórico NFL (nflverse)", () => {
  const csv = readFixture("nflverse-games-sample.csv");

  it("mapea franquicias, separa playoffs y conserva cuotas como investigación", () => {
    const result = normalizeNflverseHistory(csv);

    expect(result.games).toHaveLength(7);
    const superBowl = result.games.find((row) => row.id === "nfl:2020_19_SB_KC_TB")!;
    expect(superBowl.phase).toBe("postseason");
    expect(superBowl.period).toBe(21);
    expect(superBowl.neutralSite).toBe(true);
    expect(superBowl.homeTeam).toBe("nfl.tampa-bay-buccaneers");
    expect(superBowl.awayTeam).toBe("nfl.kansas-city-chiefs");
    expect(superBowl.odds).toEqual({
      spread: 3,
      total: 56,
      moneylineHome: -105,
      moneylineAway: -115,
      usage: "research-only",
    });
    expect(superBowl.kickoffZone).toBe("America/New_York");

    const relocated = result.games.find((row) => row.id === "nfl:2015_10_STL_PIT")!;
    expect(relocated.awayTeam).toBe("nfl.los-angeles-rams");
    expect(relocated.awayScore).toBe(6);
  });

  it("puede excluir la postemporada", () => {
    const result = normalizeNflverseHistory(csv, { includePostseason: false });
    expect(result.games).toHaveLength(6);
    expect(result.games.every((row) => row.phase === "regular")).toBe(true);
  });

  it("filtra por rango de temporadas", () => {
    const result = normalizeNflverseHistory(csv, { fromSeason: 2019, toSeason: 2020 });
    expect(result.seasons).toEqual([2019, 2020]);
    expect(result.games).toHaveLength(3);
  });
});

describe("auditoría de calidad del histórico", () => {
  it("detecta identificadores duplicados y equipos que juegan dos veces en la misma jornada", () => {
    const duplicate = game({
      id: "la-liga:2024-25:real-madrid:barcelona",
      homeTeam: "la-liga.real-madrid",
      awayTeam: "la-liga.barcelona",
    });
    const twice = game({
      id: "la-liga:2024-25:real-madrid:sevilla",
      homeTeam: "la-liga.real-madrid",
      awayTeam: "la-liga.sevilla",
    });

    const audit = auditLeague({ league: laLiga, games: [duplicate, { ...duplicate }, twice] });

    expect(audit.issues.some((issue) => issue.code === "duplicate_game_id" && issue.severity === "error")).toBe(true);
    expect(audit.issues.some((issue) => issue.code === "team_plays_twice_in_period" && issue.severity === "error")).toBe(true);
  });

  it("señala posibles identidades duplicadas de un equipo y calcula tasas", () => {
    const a = game({
      id: "la-liga:2024-25:atletico-madrid:getafe",
      homeTeam: "la-liga.atletico-madrid",
      awayTeam: "la-liga.getafe",
      period: 1,
      homeScore: 2,
      awayScore: 1,
    });
    const b = game({
      id: "la-liga:2023-24:atletico-de-madrid:valencia",
      homeTeam: "la-liga.atletico-de-madrid",
      awayTeam: "la-liga.valencia",
      season: "2023-24",
      period: 2,
      date: "2023-08-25",
      homeScore: 0,
      awayScore: 0,
    });

    const audit = auditLeague({ league: laLiga, games: [a, b] });

    expect(audit.rows).toBe(2);
    expect(audit.teams).toBe(4);
    expect(audit.rates.homeWin).toBeCloseTo(0.5, 5);
    expect(audit.rates.draw).toBeCloseTo(0.5, 5);
    expect(audit.rates.awayWin).toBeCloseTo(0, 5);
    expect(audit.rates.avgTotalScore).toBeCloseTo(1.5, 5);
    expect(
      audit.issues.some(
        (issue) => issue.code === "possible_team_duplicates" && issue.severity === "warning",
      ),
    ).toBe(true);
    expect(audit.issues.find((issue) => issue.code === "possible_team_duplicates")?.sample).toContain(
      "la-liga.atletico-de-madrid ↔ la-liga.atletico-madrid",
    );
  });

  it("expone el catálogo de ligas con su fuente y licencia esperada", () => {
    expect(getHistoryLeague("nfl").source).toBe("nflverse");
    expect(getHistoryLeague("premier-league").openFootballCode).toBe("en.1");
    expect(() => getHistoryLeague("mlb")).toThrow(/desconocida/);
  });
});
