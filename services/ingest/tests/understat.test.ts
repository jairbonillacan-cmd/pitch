import { describe, expect, it } from "vitest";
import {
  getHistoryLeague,
  normalizeUnderstatMatches,
  parseUnderstatLeagueHtml,
  understatSeasonLabel,
} from "../src/index.js";

function escapeForUnderstat(json: string): string {
  return json
    .split("")
    .map((character) =>
      /[A-Za-z0-9]/.test(character)
        ? character
        : `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )
    .join("");
}

function htmlWith(matches: unknown[]): string {
  const escaped = escapeForUnderstat(JSON.stringify(matches));
  return `<!doctype html><html><script>var datesData = JSON.parse('${escaped}');</script></html>`;
}

const sample = [
  {
    id: "1",
    isResult: true,
    datetime: "2024-08-16 19:00:00",
    h: { title: "Manchester United" },
    a: { title: "Fulham" },
    goals: { h: "1", a: "0" },
    xG: { h: "2.04", a: "0.42" },
  },
  {
    id: "2",
    isResult: true,
    datetime: "2024-08-17 14:00:00",
    h: { title: "Ipswich" },
    a: { title: "Liverpool" },
    goals: { h: "0", a: "2" },
    xG: { h: "0.55", a: "1.9" },
  },
  {
    id: "3",
    isResult: false,
    datetime: "2024-08-18 14:00:00",
    h: { title: "Arsenal" },
    a: { title: "Chelsea" },
    goals: { h: "0", a: "0" },
    xG: { h: "0", a: "0" },
  },
  {
    id: "4",
    isResult: true,
    datetime: "2024-08-19 14:00:00",
    h: { title: "Everton" },
    a: { title: "Brighton" },
    goals: { h: "1", a: "1" },
    xG: { h: null, a: null },
  },
];

describe("Understat — parseo y normalización", () => {
  it("decodifica datesData y conserva solo partidos terminados con xG", () => {
    const matches = parseUnderstatLeagueHtml(htmlWith(sample))!;
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      understatId: "1",
      homeTitle: "Manchester United",
      awayTitle: "Fulham",
      homeGoals: 1,
      awayGoals: 0,
      homeXg: 2.04,
      awayXg: 0.42,
    });
    expect(matches[1]!.awayTitle).toBe("Liverpool");
  });

  it("devuelve null si la página no trae datesData", () => {
    expect(parseUnderstatLeagueHtml("<html>We will come back soon</html>")).toBeNull();
  });

  it("convierte el año inicial en temporada de dos años", () => {
    expect(understatSeasonLabel(2014)).toBe("2014-15");
    expect(understatSeasonLabel(2025)).toBe("2025-26");
  });

  it("normaliza ids con los slugs del corpus y reporta nombres sin alias", () => {
    const matches = parseUnderstatLeagueHtml(htmlWith(sample))!;
    const result = normalizeUnderstatMatches(matches, {
      league: getHistoryLeague("premier-league"),
      year: 2024,
      snapshot: "20250717152222",
    });

    expect(result.games[0]!.id).toBe("premier-league:2024-25:manchester-united:fulham");
    expect(result.games[0]!.homeTeam).toBe("premier-league.manchester-united");
    expect(result.games[0]!.season).toBe("2024-25");
    expect(result.games[0]!.date).toBe("2024-08-16");
    expect(result.games[0]!.source).toBe("understat");
    expect(result.games[1]!.id).toBe("premier-league:2024-25:ipswich-town:liverpool");
    expect(result.unmatchedNames).toEqual([]);
  });

  it("usa slug derivado para equipos desconocidos", () => {
    const odd = [
      {
        id: "9",
        isResult: true,
        datetime: "2024-08-20 14:00:00",
        h: { title: "Equipo Inventado" },
        a: { title: "Arsenal" },
        goals: { h: "1", a: "1" },
        xG: { h: "1.1", a: "1.2" },
      },
    ];
    const result = normalizeUnderstatMatches(parseUnderstatLeagueHtml(htmlWith(odd))!, {
      league: getHistoryLeague("premier-league"),
      year: 2024,
      snapshot: "x",
    });
    expect(result.games[0]!.id).toBe("premier-league:2024-25:equipo-inventado:arsenal");
    expect(result.unmatchedNames).toEqual(["Equipo Inventado"]);
  });
});
