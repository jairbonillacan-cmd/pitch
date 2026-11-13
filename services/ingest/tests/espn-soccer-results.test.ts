import { describe, expect, it } from "vitest";
import { mergeFootballDataIntoSeason } from "../src/adapters/football-data-merge.js";
import { espnEventsToFootballData, type EspnSoccerEvent } from "../src/adapters/espn-soccer-results.js";
import { normalizeOpenFootballPremierLeague } from "../src/adapters/openfootball.js";

/** Temporada mínima: jornada 11 ya jugada (sin marcadores en openfootball) y jornada 12 por jugar. */
const RAW = {
  name: "English Premier League 2026/27",
  matches: [
    { round: "Matchday 11", date: "2026-11-08", time: "15:00", team1: "Brighton & Hove Albion FC", team2: "Brentford FC" },
    { round: "Matchday 11", date: "2026-11-08", time: "15:00", team1: "Crystal Palace FC", team2: "Liverpool FC" },
    { round: "Matchday 12", date: "2026-11-21", time: "15:00", team1: "Liverpool FC", team2: "Brighton & Hove Albion FC" },
    { round: "Matchday 12", date: "2026-11-21", time: "17:30", team1: "Brentford FC", team2: "Crystal Palace FC" },
  ],
};

const ev = (id: string, date: string, status: string, home: [string, string], away: [string, string]): EspnSoccerEvent => ({
  id,
  date,
  status: { type: { name: status } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: home[1], team: { displayName: home[0] } },
        { homeAway: "away", score: away[1], team: { displayName: away[0] } },
      ],
    },
  ],
});

describe("jornadas europeas sin congelarse (P0-02)", () => {
  it("sin marcadores, la jornada activa es la siguiente cuando la anterior ya pasó hace más de 36 h", () => {
    const season = normalizeOpenFootballPremierLeague(RAW, { referenceDate: "2026-11-13" });
    expect(season.activeMatchday).toBe(12);
    // Antes del partido, la jornada 11 todavía es la activa.
    expect(normalizeOpenFootballPremierLeague(RAW, { referenceDate: "2026-11-08" }).activeMatchday).toBe(11);
  });

  it("ESPN completa marcadores de la jornada pasada y la jornada activa avanza", () => {
    const season = normalizeOpenFootballPremierLeague(RAW, { referenceDate: "2026-11-13", targetMatchday: 11 });
    const fd = espnEventsToFootballData(
      [
        ev("1", "2026-11-08T14:00Z", "STATUS_FULL_TIME", ["Brighton & Hove Albion", "2"], ["Brentford", "0"]),
        ev("2", "2026-11-08T14:00Z", "STATUS_FULL_TIME", ["Crystal Palace", "1"], ["Liverpool", "3"]),
        ev("3", "2026-11-21T15:00Z", "STATUS_SCHEDULED", ["Liverpool", "0"], ["Brighton & Hove Albion", "0"]),
        ev("9", "2026-11-08T14:00Z", "STATUS_FULL_TIME", ["Club que no existe", "1"], ["Otro", "1"]),
      ],
      season,
    );
    expect(fd.matches).toHaveLength(3);
    const merged = mergeFootballDataIntoSeason(season, fd, { referenceDate: "2026-11-13" });
    const md11 = merged.season.allGames.filter((g) => g.week === 11);
    expect(md11.every((g) => g.status === "final")).toBe(true);
    expect(md11.find((g) => g.home.name.includes("Crystal"))?.result).toMatchObject({ home: 1, away: 3 });
    expect(merged.season.activeMatchday).toBe(12);
    // Un partido programado no trae marcador inventado.
    expect(merged.season.allGames.find((g) => g.week === 12 && g.home.name.includes("Liverpool"))?.result).toBeUndefined();
  });
});
