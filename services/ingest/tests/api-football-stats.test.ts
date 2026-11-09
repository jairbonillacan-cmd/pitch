import { describe, expect, it } from "vitest";
import {
  apiFootballGameId,
  parseStatistics,
} from "../src/index.js";

const home = {
  team: { id: 10, name: "Club America" },
  statistics: [
    { type: "expected_goals", value: null },
    { type: "Total Shots", value: 14 },
    { type: "Shots on Goal", value: 6 },
    { type: "Corner Kicks", value: 7 },
    { type: "Ball Possession", value: "58%" },
    { type: "Yellow Cards", value: 2 },
    { type: "Red Cards", value: 0 },
  ],
};

const away = {
  team: { id: 20, name: "Tigres UANL" },
  statistics: [
    { type: "expected_goals", value: null },
    { type: "Total Shots", value: "9" },
    { type: "Shots on Goal", value: 3 },
    { type: "Corner Kicks", value: 4 },
    { type: "Ball Possession", value: "42%" },
    { type: "Yellow Cards", value: 1 },
    { type: "Red Cards", value: null },
  ],
};

describe("API-Football — estadísticas de Liga MX", () => {
  it("convierte la respuesta de estadísticas en un registro comparable", () => {
    const record = parseStatistics([home, away], {
      id: "liga-mx:2024-25:apertura:america:uanl-tigres",
      date: "2024-08-16",
      season: "2024-25",
      homeTeamId: 10,
      awayTeamId: 20,
    });
    expect(record).not.toBeNull();
    expect(record!.homeXg).toBeNull();
    expect(record!.shotsHome).toBe(14);
    expect(record!.shotsAway).toBe(9);
    expect(record!.shotsOnTargetHome).toBe(6);
    expect(record!.cornersHome).toBe(7);
    expect(record!.possessionHome).toBe(58);
    expect(record!.possessionAway).toBe(42);
    expect(record!.redAway).toBeNull();
    expect(record!.source).toBe("api-football");
  });

  it("devuelve null si faltan los equipos del fixture", () => {
    expect(
      parseStatistics([home], {
        id: "x",
        date: "2024-08-16",
        season: "2024-25",
        homeTeamId: 10,
        awayTeamId: 99,
      }),
    ).toBeNull();
  });

  it("construye el id canónico desde la ronda y los slugs", () => {
    expect(
      apiFootballGameId({
        leagueId: "liga-mx",
        season: 2024,
        round: "Apertura - 1",
        homeSlug: "america",
        awaySlug: "uanl-tigres",
      }),
    ).toBe("liga-mx:2024-25:apertura:america:uanl-tigres");
    expect(
      apiFootballGameId({
        leagueId: "liga-mx",
        season: 2024,
        round: "Clausura - Final",
        homeSlug: "america",
        awaySlug: "monterrey",
      }),
    ).toBe("liga-mx:2024-25:clausura-playoffs:america:monterrey");
    expect(
      apiFootballGameId({
        leagueId: "liga-mx",
        season: 2024,
        round: "Ronda rara",
        homeSlug: "a",
        awaySlug: "b",
      }),
    ).toBeNull();
  });
});
