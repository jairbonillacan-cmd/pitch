import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveClubRoute } from "../src/server/club-route-guard";
import {
  buildCompareLeagueCatalog,
  listComparePlayersForLeague,
  loadPlayerComparison,
  loadTeamComparison,
} from "../src/server/compare";
import { searchPlayersDirectory } from "../src/server/player-search";
import { resolveSnapshotsRoot } from "../src/server/snapshots";

describe("Búsqueda de jugadores, comparador H2H y paridad US/MLB en disco", () => {
  it("searchPlayersDirectory encuentra jugadores reales de MLB, NBA y fútbol", () => {
    const ohtani = searchPlayersDirectory("Ohtani", { limit: 6 });
    expect(ohtani.length).toBeGreaterThan(0);
    expect(ohtani[0]!.league).toBe("mlb");
    expect(ohtani[0]!.href).toMatch(/^\/app\/mlb\/t\/[^/]+\/p\/.+$/);

    const henry = searchPlayersDirectory("Henry Martin", { limit: 6 });
    expect(henry.length).toBeGreaterThan(0);
  });

  it("buildCompareLeagueCatalog incluye ligas activas en ventana de 30 días (y nuevas competencias) y compara equipos H2H", () => {
    const catalog = buildCompareLeagueCatalog();
    const leagues = catalog.map((c) => c.league);
    expect(leagues).toContain("liga-mx");
    expect(leagues).toContain("champions-league");
    expect(leagues).toContain("mls");
    expect(leagues).toContain("nba");
    expect(leagues).toContain("nhl");

    const cmp = loadTeamComparison("liga-mx", "america", "chivas", { fullAccess: true });
    expect(cmp).not.toBeNull();
    expect(cmp?.teamA.slug).toBe("america");
    expect(cmp?.teamB.slug).toBe("chivas");
    expect(cmp?.metrics.length).toBeGreaterThanOrEqual(4);
  });

  it("loadPlayerComparison compara jugadores MLB reales con métricas de temporada", async () => {
    const prevOffline = process.env.PITCHLAB_OFFLINE;
    process.env.PITCHLAB_OFFLINE = "1";
    try {
      const players = listComparePlayersForLeague("mlb");
      expect(players.length).toBeGreaterThan(20);
      const cmp = await loadPlayerComparison("mlb", players[0]!.ref, players[1]!.ref, {
        fullAccess: true,
      });
      expect(cmp).not.toBeNull();
      expect(cmp?.metrics.length).toBeGreaterThan(0);
    } finally {
      process.env.PITCHLAB_OFFLINE = prevOffline;
    }
  });

  it("verifica paridad de season-results.json, Últimas 5 y bajas en NBA, NHL y MLB + retratos entrenadores", () => {
    const root = resolveSnapshotsRoot();
    for (const lg of ["nba", "nhl", "mlb"] as const) {
      expect(fs.existsSync(path.join(root, lg, "season-results.json"))).toBe(true);
      expect(fs.existsSync(path.join(root, lg, "injuries.json"))).toBe(true);

      const latest = JSON.parse(fs.readFileSync(path.join(root, lg, "latest.json"), "utf8")) as {
        standings?: Array<{ form?: string[] }>;
      };
      expect(latest.standings?.length ?? 0).toBeGreaterThanOrEqual(30);
      const withForm = (latest.standings ?? []).filter((r) => (r.form?.length ?? 0) === 5);
      expect(withForm.length).toBe(latest.standings?.length);

      const injuries = JSON.parse(
        fs.readFileSync(path.join(root, lg, "injuries.json"), "utf8"),
      ) as { entries?: unknown[] };
      expect(injuries.entries?.length ?? 0).toBeGreaterThan(20);

      const squads = JSON.parse(fs.readFileSync(path.join(root, lg, "squads.json"), "utf8")) as {
        teams: Array<{ coach?: { photoKey?: string | null } | null }>;
      };
      const coachesWithPhoto = squads.teams.filter((t) => Boolean(t.coach?.photoKey)).length;
      expect(coachesWithPhoto).toBeGreaterThanOrEqual(25);
    }
  });

  it("club-route-guard autoriza /app/comparar y redirige /app/h2h", () => {
    const ok = resolveClubRoute("/app/comparar", {
      isLeague: () => false,
      gameExists: () => false,
    });
    expect(ok).toEqual({ kind: "ok", pathname: "/app/comparar" });

    const redir = resolveClubRoute("/app/h2h?liga=mlb", {
      isLeague: () => false,
      gameExists: () => false,
    });
    expect(redir).toEqual({ kind: "redirect", to: "/app/comparar?liga=mlb" });
  });
});
