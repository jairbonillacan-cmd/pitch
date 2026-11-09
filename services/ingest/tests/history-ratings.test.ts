import { describe, expect, it } from "vitest";
import { buildHistoryRatings } from "../src/pipeline.js";
import { loadLeagueHistory, remapTeam } from "../src/prior-season.js";

describe("historial para la fuerza de largo plazo", () => {
  it("traduce los ids del corpus a los del producto", () => {
    expect(remapTeam("liga-mx.deportivo-guadalajara", "liga-mx")).toBe("liga-mx.chivas");
    expect(remapTeam("la-liga.athletic", "laliga")).toBe("laliga.athletic-club");
    expect(remapTeam("la-liga.real-madrid", "laliga")).toBe("laliga.real-madrid");
    expect(remapTeam("premier-league.bournemouth", "premier-league")).toBe("premier-league.afc-bournemouth");
  });

  it("carga el historial versionado ordenado y sin partidos posteriores al corte", () => {
    const rows = loadLeagueHistory("premier-league", "2020-01-01");
    expect(rows.length).toBeGreaterThan(3000);
    expect(rows.every((r) => r.date < "2020-01-01")).toBe(true);
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
  });

  it("no usa historial a partir del arranque de la temporada en curso", () => {
    const history = [
      { date: "2025-03-01", season: "2024-25", home: "x", away: "y", homeGoals: 3, awayGoals: 0 },
      // Partido de la temporada en curso que también viene en el corpus: se ignora.
      { date: "2025-08-20", season: "2025-26", home: "y", away: "x", homeGoals: 5, awayGoals: 0 },
    ];
    const withDup = buildHistoryRatings(history, [], "2025-08-15", "2025-26");
    const without = buildHistoryRatings(history.slice(0, 1), [], "2025-08-15", "2025-26");
    expect(withDup.snapshot()).toEqual(without.snapshot());
    expect(withDup.rating("x")).toBeGreaterThan(withDup.rating("y"));
  });
});
