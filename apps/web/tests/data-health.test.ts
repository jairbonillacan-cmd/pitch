import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/admin/data-health/route";
import { loadServerDataHealthReport } from "../src/server/data-health";
import { loadLeagueSnapshotEnvelope } from "../src/server/snapshots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Salud de datos en servidor y bajas nominales en snapshots", () => {
  it("carga el reporte de Salud de datos con los 2 workflows, las 7 ligas y alineaciones apagadas", () => {
    const report = loadServerDataHealthReport();
    expect(report.schemaVersion).toBe(1);
    expect(report.workflows.map((w) => w.workflowId)).toEqual([
      "odds-refresh",
      "pre-mvp-snapshot",
    ]);
    expect(report.leagues).toHaveLength(9);

    const nfl = report.leagues.find((l) => l.league === "nfl");
    expect(nfl).toBeDefined();
    expect(nfl?.cells.bajas.sourceLabel).toContain("nflverse");
    expect(nfl?.cells.bajas.recordsCount).toBeGreaterThan(0);

    const nba = report.leagues.find((l) => l.league === "nba");
    const nhl = report.leagues.find((l) => l.league === "nhl");
    expect(nba?.cells.calendario.recordsCount).toBeGreaterThan(0);
    expect(nhl?.cells.calendario.recordsCount).toBeGreaterThan(0);
    expect(nba?.cells.bajas.status).toBe("pending_source");
    expect(nba?.cells.bajas.sourceLabel).toContain("latest.json");
    expect(nba?.cells.momios.status).toBe("pending_source");
    expect(nhl?.cells.bajas.status).toBe("pending_source");
    expect(nhl?.cells.momios.status).toBe("pending_source");

    for (const lg of report.leagues) {
      expect(lg.cells.alineaciones.status).toBe("disabled");
      expect(lg.cells.alineaciones.maxHours).toBeNull();
    }
  });

  it("protege GET /api/admin/data-health con 403 en producción sin admin y responde 200 en modo desarrollo/revisión", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PITCHLAB_PREVIEW_TOOLS", "");

    const denied = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(denied.status).toBe(403);

    vi.stubEnv("NODE_ENV", "development");
    const allowed = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { leagues: unknown[]; workflows: unknown[] };
    expect(body.workflows).toHaveLength(2);
    expect(body.leagues).toHaveLength(9);
  });

  it("adjunta bajas nominales de data/snapshots/nfl/injuries.json a los partidos de NFL", () => {
    const nflEnvelope = loadLeagueSnapshotEnvelope("nfl");
    expect(nflEnvelope.state).toBe("ready");
    const withInjuries = (nflEnvelope.data?.games ?? []).filter(
      (g) => (g.injuries?.home.length ?? 0) + (g.injuries?.away.length ?? 0) > 0,
    );
    expect(withInjuries.length).toBeGreaterThan(0);
  });
});
