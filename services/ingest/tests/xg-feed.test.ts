import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EloMatch } from "@pitchlab/models";
import { buildHistoryRatings } from "../src/pipeline.js";
import { buildXgLookup, createXgLookup, loadXgLookup, XG_ELO_LEAGUES } from "../src/xg-feed.js";

function bzRow(id: number, kickoffUtc: string, home: number, away: number, xg: [number, number], estimated = false) {
  return {
    providerMatchId: id,
    kickoffUtc,
    home: { providerTeamId: home, name: "", slug: "" },
    away: { providerTeamId: away, name: "", slug: "" },
    stats: {
      home: { xg: xg[0], xgEstimated: estimated },
      away: { xg: xg[1], xgEstimated: estimated },
    },
  };
}

const TEAMS = {
  "10": { team: "premier-league.arsenal" },
  "20": { team: "premier-league.chelsea" },
};

describe("xG de Bzzoiro para el Elo de producción", () => {
  it("solo la Premier usa xG por ahora", () => {
    expect([...XG_ELO_LEAGUES]).toEqual(["premier-league"]);
    expect(loadXgLookup("liga-mx")).toBeNull();
  });

  it("busca por fecha ±1 día y equipos, y descarta xG estimado o equipos sin mapa", () => {
    const lookup = buildXgLookup(
      "premier-league",
      [
        bzRow(1, "2025-03-01T20:00:00Z", 10, 20, [2.1, 0.4]),
        bzRow(2, "2025-03-08T20:00:00Z", 20, 10, [1.0, 1.0], true),
        bzRow(3, "2025-03-15T20:00:00Z", 99, 10, [1.0, 1.0]),
      ] as never,
      TEAMS,
    );
    expect(lookup.size).toBe(1);
    expect(lookup.get("2025-03-01", "premier-league.arsenal", "premier-league.chelsea")).toEqual({
      homeXg: 2.1,
      awayXg: 0.4,
    });
    expect(lookup.get("2025-03-02", "premier-league.arsenal", "premier-league.chelsea")).not.toBeNull();
    expect(lookup.get("2025-03-04", "premier-league.arsenal", "premier-league.chelsea")).toBeNull();
    expect(lookup.get("2025-03-01", "premier-league.chelsea", "premier-league.arsenal")).toBeNull();
  });

  it("las ratings usan xG donde lo hay y goles donde no", () => {
    // Arsenal gana 1-0 dos veces con suerte, pero el xG dice que Chelsea fue mejor.
    const history: EloMatch[] = [
      { date: "2025-01-01", season: "2024-25", home: "premier-league.arsenal", away: "premier-league.chelsea", homeGoals: 1, awayGoals: 0 },
      { date: "2025-02-01", season: "2024-25", home: "premier-league.chelsea", away: "premier-league.arsenal", homeGoals: 0, awayGoals: 1 },
    ];
    const lookup = createXgLookup([
      { date: "2025-01-01", home: "premier-league.arsenal", away: "premier-league.chelsea", homeXg: 0.3, awayXg: 2.4 },
      { date: "2025-02-01", home: "premier-league.chelsea", away: "premier-league.arsenal", homeXg: 2.6, awayXg: 0.2 },
    ]);
    const goals = buildHistoryRatings(history, [], "2025-08-01", "2025-26");
    const xg = buildHistoryRatings(history, [], "2025-08-01", "2025-26", lookup);
    const pGoals = goals.predict("premier-league.arsenal", "premier-league.chelsea").home;
    const pXg = xg.predict("premier-league.arsenal", "premier-league.chelsea").home;
    expect(pGoals).toBeGreaterThan(pXg);
    // Sin búsqueda el resultado es idéntico al de antes.
    expect(buildHistoryRatings(history, [], "2025-08-01", "2025-26", null).predict("premier-league.arsenal", "premier-league.chelsea").home).toBe(pGoals);
  });

  describe("carga desde disco", () => {
    let dir = "";
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("devuelve null si faltan archivos y la búsqueda si existen", () => {
      dir = mkdtempSync(join(tmpdir(), "pl-xgfeed-"));
      expect(loadXgLookup("premier-league", dir)).toBeNull();
      mkdirSync(join(dir, "bzzoiro"), { recursive: true });
      mkdirSync(join(dir, "provider-ids"), { recursive: true });
      writeFileSync(join(dir, "bzzoiro", "premier-league.jsonl"), JSON.stringify(bzRow(1, "2025-03-01T20:00:00Z", 10, 20, [2.1, 0.4])) + "\n");
      writeFileSync(join(dir, "provider-ids", "premier-league.teams.json"), JSON.stringify({ bzzoiro: TEAMS }));
      expect(loadXgLookup("premier-league", dir)?.size).toBe(1);
    });
  });
});
