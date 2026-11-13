import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESPN_LIGA_MX_SCOREBOARD,
  fetchEspnLigaMxSeason,
  normalizeEspnLigaMx,
  resolveSafeEspnCachePath,
  type EspnLigaMxEvent,
} from "../src/adapters/espn-liga-mx-schedule.js";

function ev(
  id: string,
  date: string,
  home: string,
  away: string,
  score?: [number, number],
): EspnLigaMxEvent {
  return {
    id,
    date,
    status: { type: { name: score ? "STATUS_FULL_TIME" : "STATUS_SCHEDULED", completed: Boolean(score) } },
    competitions: [
      {
        venue: { fullName: "Estadio de prueba" },
        competitors: [
          { homeAway: "home", score: score ? String(score[0]) : "0", team: { displayName: home } },
          { homeAway: "away", score: score ? String(score[1]) : "0", team: { displayName: away } },
        ],
      },
    ],
  };
}

describe("Liga MX desde ESPN", () => {
  const events = [
    ev("1", "2026-11-01T01:00Z", "Santos", "Toluca", [1, 2]),
    ev("2", "2026-11-01T03:00Z", "América", "Guadalajara", [0, 0]),
    ev("3", "2026-11-08T01:00Z", "Toluca", "América", [3, 1]),
    ev("4", "2026-11-14T23:00Z", "Guadalajara", "Santos"),
  ];

  it("usa partidos reales de la temporada actual, sin inventar estados", () => {
    const norm = normalizeEspnLigaMx({ seasonYear: 2026, events }, { referenceDate: "2026-11-10" });
    expect(norm.seasonLabel).toBe("Apertura 2026");
    expect(norm.allGames).toHaveLength(4);
    expect(norm.allGames[0]!.status).toBe("final");
    expect(norm.allGames[0]!.result).toMatchObject({ home: 1, away: 2, source: "espn" });
    expect(norm.allGames[3]!.status).toBe("scheduled");
    expect(norm.allGames[3]!.result).toBeUndefined();
    // La jornada es el número de partido de cada equipo.
    expect(norm.allGames[2]!.week).toBe(2);
    // Ventana activa: lo jugado hace pocos días y lo que viene.
    expect(norm.activeRoundGames.map((g) => g.startTime)).toEqual([
      "2026-11-08T01:00Z",
      "2026-11-14T23:00Z",
    ]);
    expect(norm.allGames.every((g) => g.startTime.startsWith("2026"))).toBe(true);
  });

  it("calcula tasas de goles solo con partidos jugados antes del corte", () => {
    const norm = normalizeEspnLigaMx({ seasonYear: 2026, events }, { referenceDate: "2026-11-05" });
    const toluca = norm.teamRateInputs.find((t) => t.teamId === "liga-mx.toluca")!;
    expect(toluca).toMatchObject({ goalsFor: 2, goalsAgainst: 1, gamesPlayed: 1 });
  });

  it("descarga cada fecha del calendario hasta el horizonte", async () => {
    const urls: string[] = [];
    const fetchJson = async (url: string) => {
      urls.push(url);
      if (url === ESPN_LIGA_MX_SCOREBOARD) {
        return {
          leagues: [
            {
              season: { year: 2026, displayName: "2026-27" },
              calendar: ["2026-11-01T07:00Z", "2026-11-14T08:00Z", "2026-12-30T08:00Z"],
            },
          ],
          events: [],
        };
      }
      if (url.endsWith("dates=20261101")) return { events: [events[0], events[1]] };
      if (url.endsWith("dates=20261114")) return { events: [events[3]] };
      return { events: [] };
    };
    const season = await fetchEspnLigaMxSeason({
      cacheDir: mkdtempSync(join(tmpdir(), "espn-mx-")),
      referenceDate: "2026-11-10",
      fetchJson,
    });
    expect(season.seasonYear).toBe(2026);
    expect(season.events.map((e) => e.id)).toEqual(["1", "2", "4"]);
    // La fecha del 30 de diciembre queda fuera del horizonte de 21 días.
    expect(urls.some((u) => u.endsWith("dates=20261230"))).toBe(false);
  });

  it("SEC-13: rechaza escape de directorio en rutas de caché y descarta entradas de calendario o IDs no numéricos", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "espn-mx-sec-"));
    expect(() => resolveSafeEspnCachePath(cacheDir, "../../fuera.json")).toThrow();
    expect(() => resolveSafeEspnCachePath(cacheDir, "../escape/20261101.json")).toThrow();

    const urls: string[] = [];
    const season = await fetchEspnLigaMxSeason({
      cacheDir,
      referenceDate: "2026-11-10",
      fetchJson: async (url) => {
        urls.push(url);
        if (url === ESPN_LIGA_MX_SCOREBOARD) {
          return {
            leagues: [
              {
                season: { year: 2026, displayName: "2026-27" },
                calendar: ["../../etc/passwd", "2026-11-01T07:00Z"],
              },
            ],
            events: [],
          };
        }
        return {
          events: [
            ev("../malicioso", "2026-11-01T01:00Z", "Santos", "Toluca", [1, 2]),
            ev("401", "2026-11-01T03:00Z", "América", "Guadalajara", [2, 0]),
          ],
        };
      },
    });
    expect(urls).toEqual([ESPN_LIGA_MX_SCOREBOARD, `${ESPN_LIGA_MX_SCOREBOARD}?dates=20261101`]);
    expect(season.events.map((e) => e.id)).toEqual(["401"]);
  });
});
