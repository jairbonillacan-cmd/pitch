import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fdSeasonCode,
  fdSeasonUrl,
  getHistoryLeague,
  normalizeFdSeason,
  parseFdDate,
  selectOdds,
} from "../src/index.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures/history");

function fixture(): string {
  return readFileSync(resolve(FIXTURES, "football-data-co-uk-sample.csv"), "utf8");
}

describe("football-data.co.uk — identidad de temporada y fecha", () => {
  it("convierte temporadas al código del sitio", () => {
    expect(fdSeasonCode("2010-11")).toBe("1011");
    expect(fdSeasonCode("2024-25")).toBe("2425");
    expect(fdSeasonUrl("2024-25", "E0")).toBe(
      "https://www.football-data.co.uk/mmz4281/2425/E0.csv",
    );
    expect(() => fdSeasonCode("2024")).toThrow(/Temporada inválida/);
  });

  it("parsea fechas de 4 y 2 dígitos", () => {
    expect(parseFdDate("16/08/2024")).toBe("2024-08-16");
    expect(parseFdDate("1/9/24")).toBe("2024-09-01");
    expect(parseFdDate("31/12/95")).toBe("1995-12-31");
    expect(parseFdDate("2024-08-16")).toBeNull();
    expect(parseFdDate("45/13/2024")).toBeNull();
  });
});

describe("football-data.co.uk — selección de cuotas", () => {
  const row = {
    PSCH: "1.65",
    PSCD: "4.23",
    PSCA: "5.28",
    "PC>2.5": "1.61",
    "PC<2.5": "2.37",
    B365CH: "1.67",
    B365CD: "4.1",
    B365CA: "5",
    "B365C>2.5": "1.62",
    "B365C<2.5": "2.3",
    PSH: "1.63",
    PSD: "4.38",
    PSA: "5.3",
    "P>2.5": "1.58",
    "P<2.5": "2.45",
    B365H: "1.6",
    B365D: "4.2",
    B365A: "5.25",
    "B365>2.5": "1.53",
    "B365<2.5": "2.5",
  };

  it("prefiere cierre y Pinnacle sobre B365", () => {
    const odds = selectOdds(row)!;
    expect(odds.bookmaker).toBe("Pinnacle");
    expect(odds.timing).toBe("closing");
    expect(odds.home).toBe(1.65);
    expect(odds.draw).toBe(4.23);
    expect(odds.away).toBe(5.28);
    expect(odds.over25).toBe(1.61);
    expect(odds.under25).toBe(2.37);
    expect(odds.usage).toBe("research-only");
  });

  it("cae a pre-partido cuando no hay cuotas de cierre", () => {
    const odds = selectOdds({ PSH: "2", PSD: "3.2", PSA: "4" })!;
    expect(odds.timing).toBe("pre-match");
    expect(odds.bookmaker).toBe("Pinnacle");
    expect(odds.over25).toBeNull();
  });

  it("devuelve null si no hay un conjunto completo de 1X2", () => {
    expect(selectOdds({})).toBeNull();
    expect(selectOdds({ PSCH: "1.5", PSCD: "3.4" })).toBeNull();
  });
});

describe("football-data.co.uk — normalización de una temporada", () => {
  const result = normalizeFdSeason(fixture(), {
    league: getHistoryLeague("premier-league"),
    season: "2024-25",
  });

  it("normaliza ids, equipos, marcadores y estadísticas", () => {
    expect(result.games).toHaveLength(3);
    expect(result.skippedRows).toBe(1);
    expect(result.unmatchedNames).toEqual(["Inventado FC"]);

    const first = result.games[0]!;
    expect(first.id).toBe("premier-league:2024-25:manchester-united:fulham");
    expect(first.homeTeam).toBe("premier-league.manchester-united");
    expect(first.awayTeam).toBe("premier-league.fulham");
    expect(first.date).toBe("2024-08-16");
    expect(first.homeScore).toBe(1);
    expect(first.awayScore).toBe(0);
    expect(first.sourceUrl).toBe(
      "https://www.football-data.co.uk/mmz4281/2425/E0.csv",
    );
    expect(first.stats).toEqual({
      shotsHome: 14,
      shotsAway: 10,
      shotsOnTargetHome: 5,
      shotsOnTargetAway: 2,
      cornersHome: 7,
      cornersAway: 8,
      yellowHome: 2,
      yellowAway: 3,
      redHome: 0,
      redAway: 0,
    });
    expect(first.odds?.bookmaker).toBe("Pinnacle");
    expect(first.odds?.timing).toBe("closing");
  });

  it("cae a cuotas pre-partido y admite filas sin cuotas", () => {
    const ipswich = result.games.find((game) => game.id.includes("ipswich"))!;
    expect(ipswich.odds?.timing).toBe("pre-match");
    expect(ipswich.odds?.bookmaker).toBe("Pinnacle");

    const everton = result.games.find((game) => game.id.includes("everton"))!;
    expect(everton.odds).toBeNull();
    expect(everton.stats?.shotsHome).toBe(9);
  });

  it("deriva slugs para clubes antiguos cuando se permite (research)", () => {
    const research = normalizeFdSeason(fixture(), {
      league: getHistoryLeague("premier-league"),
      season: "1993-94",
      slugifyUnmapped: true,
    });
    expect(research.games).toHaveLength(4);
    expect(research.unmatchedNames).toEqual([]);
    expect(research.fallbackNames).toEqual(["Inventado FC"]);
    const invented = research.games.find((game) => game.id.includes("inventado"))!;
    expect(invented.homeTeam).toBe("premier-league.inventado");
  });
});
