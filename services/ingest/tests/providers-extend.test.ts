import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadExtendedGames } from "../src/history-backtest.js";
import type { HistoricalGame } from "../src/history/schema.js";
import type { BzzoiroMatchRow } from "../src/providers/bzzoiro.js";
import { buildLigaMxExtension, ligaMxSeason, mexicoCityDateTime } from "../src/providers/extend-corpus.js";

function row(over: Partial<BzzoiroMatchRow> & { id: number; kickoffUtc: string }): BzzoiroMatchRow {
  return {
    source: "bzzoiro",
    league: "liga-mx",
    providerMatchId: over.id,
    providerLeagueId: 19,
    providerSeasonId: 1,
    status: "finished",
    stage: "regular-season",
    round: 3,
    home: { providerTeamId: 310, name: "Querétaro FC", slug: "queretaro", coachId: null },
    away: { providerTeamId: 318, name: "Club León", slug: "leon", coachId: null },
    score: { home: 1, away: 0, htHome: 0, htAway: 0 },
    wentBeyond90: false,
    context: {
      refereeId: null,
      venueId: null,
      neutral: false,
      derby: false,
      travelKm: null,
      temperatureC: null,
      windSpeed: null,
      weatherCode: null,
    },
    stats: null,
    lineups: null,
    ...over,
  } as BzzoiroMatchRow;
}

describe("extensión research-only de Liga MX", () => {
  it("convierte la hora UTC a fecha local de Ciudad de México", () => {
    expect(mexicoCityDateTime("2025-08-10T02:05:00Z")).toEqual({ date: "2025-08-09", time: "20:05" });
  });

  it("Apertura jul–dic y Clausura ene–may caen en la misma temporada", () => {
    expect(ligaMxSeason({ providerLeagueId: 19, kickoffUtc: "2025-08-10T02:00:00Z" })).toEqual({
      season: "2025-26",
      tournament: "Apertura",
    });
    expect(ligaMxSeason({ providerLeagueId: 20, kickoffUtc: "2026-02-01T02:00:00Z" })).toEqual({
      season: "2025-26",
      tournament: "Clausura",
    });
    expect(ligaMxSeason({ providerLeagueId: 7, kickoffUtc: "2026-02-01T02:00:00Z" })).toBeNull();
  });

  it("usa el mapa de equipos del corpus, numera la liguilla y no duplica lo emparejado", () => {
    const rows = [
      row({ id: 1, kickoffUtc: "2025-08-10T02:00:00Z" }),
      row({ id: 2, kickoffUtc: "2025-08-17T02:00:00Z" }),
      row({ id: 3, kickoffUtc: "2025-12-04T02:00:00Z", stage: "semifinals", round: 1 }),
      row({ id: 4, kickoffUtc: "2025-11-27T02:00:00Z", stage: "quarterfinals", round: 1 }),
      row({ id: 5, kickoffUtc: "2025-11-30T02:00:00Z", stage: "quarterfinals", round: 1 }),
      row({ id: 6, kickoffUtc: "2025-09-01T02:00:00Z", status: "postponed" }),
    ];
    const games = buildLigaMxExtension(rows, {
      teamMap: new Map([
        [310, "liga-mx.gallos-blancos"],
        [318, "liga-mx.leon"],
      ]),
      linked: new Set([2]),
      corpusIds: new Set(),
    });
    expect(games.map((g) => g.sourceId)).toEqual(["bzzoiro:1", "bzzoiro:4", "bzzoiro:5", "bzzoiro:3"]);
    expect(games[0]).toMatchObject({
      id: "liga-mx:2025-26:apertura:gallos-blancos:leon",
      season: "2025-26",
      stage: "Apertura",
      phase: "regular",
      period: 3,
      date: "2025-08-09",
      homeTeam: "liga-mx.gallos-blancos",
      usage: "research-only",
    });
    const quarters = games.filter((g) => g.stage === "Apertura Playoffs" && g.period === 1);
    expect(quarters).toHaveLength(2);
    expect(new Set(quarters.map((g) => g.id)).size).toBe(2);
    expect(games.at(-1)).toMatchObject({ phase: "postseason", period: 2 });
  });

  it("el backtest las carga sin repetir ids del corpus", () => {
    const dir = mkdtempSync(join(tmpdir(), "pl-ext-"));
    try {
      const games = buildLigaMxExtension([row({ id: 1, kickoffUtc: "2025-08-10T02:00:00Z" })], {
        teamMap: new Map(),
        linked: new Set(),
        corpusIds: new Set(),
      });
      mkdirSync(join(dir, "data", "history", "research", "extended"), { recursive: true });
      writeFileSync(
        join(dir, "data", "history", "research", "extended", "liga-mx.jsonl"),
        games.map((g) => JSON.stringify(g)).join("\n") + "\n",
      );
      expect(loadExtendedGames(dir, "liga-mx", [])).toHaveLength(1);
      const corpus = [{ id: games[0]!.id } as HistoricalGame];
      expect(loadExtendedGames(dir, "liga-mx", corpus)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
