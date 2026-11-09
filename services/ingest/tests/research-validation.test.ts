import { describe, expect, it } from "vitest";
import { validateResearchGames, type ResearchGame } from "../src/index.js";

function game(overrides: Partial<ResearchGame> = {}): ResearchGame {
  return {
    id: "premier-league:2024-25:arsenal:chelsea",
    league: "premier-league",
    season: "2024-25",
    date: "2024-08-16",
    homeTeam: "premier-league.arsenal",
    awayTeam: "premier-league.chelsea",
    homeScore: 2,
    awayScore: 1,
    odds: {
      source: "football-data.co.uk",
      bookmaker: "Pinnacle",
      timing: "closing",
      home: 2.1,
      draw: 3.4,
      away: 3.6,
      over25: 1.95,
      under25: 1.9,
      usage: "research-only",
    },
    stats: {
      shotsHome: 14,
      shotsAway: 9,
      shotsOnTargetHome: 6,
      shotsOnTargetAway: 3,
      cornersHome: 7,
      cornersAway: 4,
      yellowHome: 1,
      yellowAway: 2,
      redHome: null,
      redAway: null,
    },
    source: "football-data.co.uk",
    sourceUrl: "https://www.football-data.co.uk/mmz4281/2425/E0.csv",
    ...overrides,
  };
}

describe("research — invariantes del dataset", () => {
  it("acepta una fila válida", () => {
    expect(validateResearchGames([game()])).toEqual([]);
  });

  it("bloquea duplicados, fechas y marcadores irreales", () => {
    const issues = validateResearchGames([
      game(),
      game(),
      game({ id: "x", date: "16/08/2024" }),
      game({ id: "y", homeScore: 20 }),
    ]);
    const errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.reason);
    expect(errors).toContain("id duplicado");
    expect(errors).toContain("fecha inválida '16/08/2024'");
    expect(errors).toContain("marcador irreal 20-1");
  });

  it("detecta cuotas incoherentes", () => {
    const issues = validateResearchGames([
      game({ odds: { ...game().odds!, home: 1.0 } }),
      game({ id: "z", odds: { ...game().odds!, under25: null } }),
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual([
      "cuota home fuera de rango (1)",
      "cuota over/under incompleta",
    ]);
    expect(issues.map((issue) => issue.severity)).toEqual(["error", "warning"]);
  });

  it("marca tiros a puerta mayores que los tiros como aviso", () => {
    const issues = validateResearchGames([
      game({
        stats: { ...game().stats!, shotsOnTargetHome: 9, shotsHome: 4 },
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[0]!.reason).toContain("tiros a puerta > tiros");
  });
});
