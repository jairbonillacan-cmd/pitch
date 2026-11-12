import { describe, expect, it } from "vitest";
import { validateXgGames, type XgGame } from "../src/index.js";

function game(overrides: Partial<XgGame> = {}): XgGame {
  return {
    id: "premier-league:2024-25:arsenal:chelsea",
    league: "premier-league",
    season: "2024-25",
    date: "2024-08-16",
    homeTeam: "premier-league.arsenal",
    awayTeam: "premier-league.chelsea",
    homeXg: 1.4,
    awayXg: 0.9,
    source: "understat",
    snapshot: "20250717152222",
    ...overrides,
  };
}

describe("xG — invariantes del dataset", () => {
  it("acepta una fila válida", () => {
    expect(validateXgGames([game()])).toEqual([]);
  });

  it("detecta ids duplicados", () => {
    const issues = validateXgGames([game(), game()]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.reason).toBe("id duplicado");
  });

  it("detecta xG negativo o fuera de rango", () => {
    const issues = validateXgGames([
      game({ id: "a", homeXg: -0.2 }),
      game({ id: "b", awayXg: 11 }),
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual([
      "xG fuera de rango (-0.2, 0.9)",
      "xG fuera de rango (1.4, 11)",
    ]);
  });

  it("detecta fecha, temporada y equipos inválidos", () => {
    const issues = validateXgGames([
      game({ id: "c", date: "16/08/2024" }),
      game({ id: "d", season: "2024" }),
      game({ id: "e", homeTeam: "" }),
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual([
      "fecha inválida '16/08/2024'",
      "temporada inválida '2024'",
      "equipos vacíos",
    ]);
  });
});
