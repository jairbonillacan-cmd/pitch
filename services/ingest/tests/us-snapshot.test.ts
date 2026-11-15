import { describe, expect, it } from "vitest";
import { LeagueSnapshotSchema } from "@pitchlab/contracts";
import type { UsGameRow } from "../src/providers/bzzoiro-us.js";
import { buildUsLeagueSnapshot, usTeam } from "../src/us-snapshot.js";
import { validateLeagueSnapshotCandidate } from "../src/validation/snapshot-validator.js";

function row(
  sport: "nba" | "nhl",
  id: number,
  kickoffUtc: string,
  home: string,
  away: string,
  score: [number, number] | null,
  extra: Partial<UsGameRow> = {},
): UsGameRow {
  return {
    source: "bzzoiro",
    sport,
    season: "2026-27",
    providerMatchId: id,
    kickoffUtc,
    status: score ? "finished" : "scheduled",
    home: { providerTeamId: id * 2, name: home, shortName: home.split(" ").at(-1)! },
    away: { providerTeamId: id * 2 + 1, name: away, shortName: away.split(" ").at(-1)! },
    homeScore: score?.[0] ?? null,
    awayScore: score?.[1] ?? null,
    overtime: false,
    shootout: false,
    providerEloHome: null,
    providerEloAway: null,
    ...extra,
  };
}

const NOW = new Date("2026-11-14T18:00:00Z");

describe("equipos NBA/NHL", () => {
  it("NHL toma nombre y código del manifiesto de emblemas; NBA usa su abreviatura", () => {
    expect(usTeam("nhl", { providerTeamId: 1, name: "Anaheim Ducks", shortName: "Ducks" })).toMatchObject({
      id: "nhl.anaheim-ducks",
      code: "ANA",
    });
    expect(usTeam("nba", { providerTeamId: 1, name: "Boston Celtics", shortName: "Celtics" })).toMatchObject({
      id: "nba.boston-celtics",
      code: "BOS",
      league: "nba",
    });
  });
});

describe("snapshot NBA", () => {
  const rows = [
    row("nba", 1, "2026-11-01T00:00:00Z", "Boston Celtics", "Utah Jazz", [130, 100]),
    row("nba", 2, "2026-11-05T00:00:00Z", "Utah Jazz", "Boston Celtics", [95, 120]),
    row("nba", 3, "2026-11-14T00:30:00Z", "Boston Celtics", "Miami Heat", [110, 104]),
    row("nba", 4, "2026-11-15T00:00:00Z", "Boston Celtics", "Utah Jazz", null),
    row("nba", 5, "2026-12-20T00:00:00Z", "Utah Jazz", "Miami Heat", null),
  ];
  const snap = buildUsLeagueSnapshot({ sport: "nba", rows, now: NOW, previousSnapshot: null });

  it("muestra la ventana (ayer a +3 días) con id propio, resultado y análisis del próximo", () => {
    expect(snap.games.map((g) => g.id)).toEqual(["nba-2026-11-14-mia-bos", "nba-2026-11-15-uta-bos"]);
    expect(snap.games[0]).toMatchObject({ status: "final", result: { home: 110, away: 104 } });
    const a = snap.analyses["nba-2026-11-15-uta-bos"]!;
    expect(a.x12[1]).toBe(0);
    expect(a.x12[0]).toBeGreaterThan(0.5);
    expect(a.marketGroups.map((g) => g.group.split(" ")[0])).toEqual(["Ganador", "Spread", "Total", "Puntos"]);
    expect(snap.analyses["nba-2026-11-14-mia-bos"]).toBeUndefined();
  });

  it("pasa el esquema y el validador previo", () => {
    expect(() => LeagueSnapshotSchema.parse(snap)).not.toThrow();
    const v = validateLeagueSnapshotCandidate(snap, null, { nowMs: NOW.getTime() });
    expect(v.issues).toEqual([]);
    expect(snap.logoUrl).toBe("https://sports.bzzoiro.com/img/basketball/league/1/?bg=transparent");
    expect(snap.games[0]?.home.logoUrl).toMatch(
      /^https:\/\/sports\.bzzoiro\.com\/img\/basketball\/team\/\d+\/\?bg=transparent$/,
    );
  });

  it("conserva el análisis publicado antes del inicio", () => {
    const later = new Date("2026-11-14T20:00:00Z");
    const again = buildUsLeagueSnapshot({ sport: "nba", rows, now: later, previousSnapshot: snap });
    expect(again.analyses["nba-2026-11-15-uta-bos"]!.publishedAt).toBe(snap.analyses["nba-2026-11-15-uta-bos"]!.publishedAt);
  });
});

describe("snapshot NHL", () => {
  const rows = [
    row("nhl", 1, "2026-11-01T00:00:00Z", "Anaheim Ducks", "Boston Bruins", [3, 2], { overtime: true }),
    row("nhl", 2, "2026-11-15T01:00:00Z", "Boston Bruins", "Anaheim Ducks", null),
  ];
  const snap = buildUsLeagueSnapshot({ sport: "nhl", rows, now: NOW, previousSnapshot: null });

  it("puck line ±1.5 y ganador con tiempo extra; valida contra emblemas", () => {
    const a = snap.analyses[snap.games[0]!.id]!;
    expect(a.marketGroups[0]!.group).toBe("Ganador (incluye tiempo extra)");
    expect(Math.abs(a.marketGroups[1]!.rows[0]!.line!)).toBe(1.5);
    const sum = a.marketGroups[0]!.rows.reduce((s, r) => s + r.p, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(validateLeagueSnapshotCandidate(snap, null, { nowMs: NOW.getTime() }).issues).toEqual([]);
    expect(snap.logoUrl).toBeUndefined();
    expect(snap.games[0]?.home.logoUrl).toBeUndefined();
  });
});
