import type { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@pitchlab/db";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { loadServerDataHealthReport } from "../src/server/data-health";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";
import { PRODUCT_LEAGUES, loadLeagueSnapshotEnvelope } from "../src/server/snapshots";

const sessionMocks = vi.hoisted(() => ({
  requireAdminOverride: null as
    | ((request: Request) => Promise<{ db: Db; userId: string; email: string } | { error: NextResponse }>)
    | null,
}));

vi.mock("../src/server/session-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/session-user")>();
  return {
    ...actual,
    requireAdmin: (request: Request) =>
      sessionMocks.requireAdminOverride
        ? sessionMocks.requireAdminOverride(request)
        : actual.requireAdmin(request),
  };
});

import { GET } from "../app/api/admin/data-health/route";

afterEach(() => {
  sessionMocks.requireAdminOverride = null;
  resetAuthForTests(undefined);
  resetRateLimitsForTests();
  setSessionDbForTests(null);
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
    expect(report.leagues).toHaveLength(PRODUCT_LEAGUES.length);

    const nfl = report.leagues.find((l) => l.league === "nfl");
    expect(nfl).toBeDefined();
    expect(nfl?.cells.bajas.sourceLabel).toContain("nflverse");
    expect(nfl?.cells.bajas.recordsCount).toBeGreaterThan(0);

    const nba = report.leagues.find((l) => l.league === "nba");
    const nhl = report.leagues.find((l) => l.league === "nhl");
    const mlb = report.leagues.find((l) => l.league === "mlb");
    expect(nba?.cells.calendario.recordsCount).toBeGreaterThan(0);
    expect(nhl?.cells.calendario.recordsCount).toBeGreaterThan(0);
    expect(mlb?.cells.calendario.recordsCount).toBeGreaterThan(0);
    expect(nba?.cells.bajas.recordsCount).toBeGreaterThan(0);
    expect(nhl?.cells.bajas.recordsCount).toBeGreaterThan(0);
    expect(mlb?.cells.bajas.recordsCount).toBeGreaterThan(0);
    expect(nba?.cells.momios.status).toBe("pending_source");
    expect(nhl?.cells.momios.status).toBe("pending_source");

    for (const lg of report.leagues) {
      expect(lg.cells.alineaciones.status).toBe("disabled");
      expect(lg.cells.alineaciones.maxHours).toBeNull();
    }
  });

  it("exige sesión admin verificada en GET /api/admin/data-health sin bypass en desarrollo ni producción", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PITCHLAB_PREVIEW_TOOLS", "");
    resetAuthForTests(undefined);

    const deniedProd = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(deniedProd.status).toBe(503);
    expect(deniedProd.headers.get("cache-control")).toBe("private, no-store");
    expect(deniedProd.headers.get("x-content-type-options")).toBe("nosniff");

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PITCHLAB_PREVIEW_TOOLS", "1");
    resetAuthForTests(undefined);

    const deniedDev = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(deniedDev.status).toBe(503);

    vi.stubEnv("PITCHLAB_ADMIN_EMAILS", "founder@pitchlab.mx");
    resetAuthForTests({
      api: { getSession: async () => null },
    } as unknown as PitchLabAuth);
    const unauthenticated = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(unauthenticated.status).toBe(401);

    resetAuthForTests({
      api: {
        getSession: async () => ({
          user: { id: "auth-socio-1", email: "socio@example.com", emailVerified: true },
        }),
      },
    } as unknown as PitchLabAuth);
    const nonAdmin = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(nonAdmin.status).toBe(403);

    resetAuthForTests({
      api: {
        getSession: async () => ({
          user: { id: "auth-admin-unverified", email: "founder@pitchlab.mx", emailVerified: false },
        }),
      },
    } as unknown as PitchLabAuth);
    const unverifiedAdmin = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(unverifiedAdmin.status).toBe(403);

    resetAuthForTests(undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("NODE_ENV", "test");
    sessionMocks.requireAdminOverride = async () => ({
      db: undefined as unknown as Db,
      userId: "admin-health-1",
      email: "founder@pitchlab.mx",
    });

    const allowed = await GET(new Request("http://127.0.0.1:3100/api/admin/data-health"));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    expect(allowed.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await allowed.json()) as { leagues: unknown[]; workflows: unknown[] };
    expect(body.workflows).toHaveLength(2);
    expect(body.leagues).toHaveLength(PRODUCT_LEAGUES.length);
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
