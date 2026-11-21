import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, type Db } from "@pitchlab/db";
import {
  dbLiveStore,
  getLiveMatchDetail,
  getLiveScoreboard,
  liveCacheControl,
  memoryLiveStore,
  parseRateLimitRemaining,
  type LiveDeps,
  type LiveFetch,
} from "../src/server/live";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { resetRateLimitsForTests } from "../src/server/request-security";
import type { ViewerAccess } from "../src/server/viewer-access";
import { GET as alertsGET } from "../app/api/live/alerts/route";
import { GET as scoreboardGET } from "../app/api/live/scoreboard/route";
import { GET as gameGET } from "../app/api/live/games/[gameId]/route";
import { GET as searchPlayersGET } from "../app/api/search/players/route";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

const ACCESS_NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_BETA: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const FIX = join(import.meta.dirname, "..", "..", "..", "services", "ingest", "tests", "fixtures", "bzzoiro-live");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(FIX, name), "utf8"));

const QRO_MTY = "mx-2026-j16-queretaro-monterrey-401876988";
const candidate = {
  gameId: QRO_MTY,
  league: "liga-mx",
  kickoffUtc: "2026-11-14T23:00:00.000Z",
  homeName: "Querétaro",
  awayName: "Rayados de Monterrey",
};

function fakeProvider(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const routes: Record<string, unknown> = {
    "/events/live/": fixture("live.json"),
    "/events/602407/incidents/": fixture("incidents.json"),
    "/events/602407/stats/": fixture("stats.json"),
    ...overrides,
  };
  const fetch: LiveFetch = async (path) => {
    calls.push(path);
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (key === undefined) return { status: 404, body: null, remaining: 5000 };
    return { status: 200, body: routes[key], remaining: 5000 };
  };
  return { calls, fetch };
}

function deps(at: string, fetch: LiveFetch | null, extra: Partial<LiveDeps> = {}): LiveDeps {
  let clock = Date.parse(at);
  return {
    store: memoryLiveStore(),
    fetch,
    budget: { dailyMax: 2500, reserve: 300 },
    now: () => new Date(clock),
    candidates: () => [candidate],
    ...extra,
    ...({ advance: (ms: number) => (clock += ms) } as object),
  } as LiveDeps;
}

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.getViewerAccess.mockReset();
  resetAuthForTests();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

describe("marcador del día (un solo lector)", () => {
  it("no consulta al proveedor si ningún partido puede estar en juego y le dice al navegador que no pregunte", async () => {
    const p = fakeProvider();
    const board = await getLiveScoreboard(deps("2026-11-14T18:00:00Z", p.fetch));
    expect(p.calls).toEqual([]);
    expect(board.entries[0]).toMatchObject({ gameId: QRO_MTY, phase: "scheduled" });
    expect(board.nextPollSeconds).toBeNull();
    expect(board.active).toBe(false);
  });

  it("en juego: una sola petición sirve a muchos navegadores mientras la caché está fresca", async () => {
    const p = fakeProvider();
    const d = deps("2026-11-14T23:34:00Z", p.fetch);
    const first = await getLiveScoreboard(d);
    await getLiveScoreboard(d);
    await getLiveScoreboard(d);
    expect(p.calls).toEqual(["/events/live/"]);
    expect(first.entries[0]).toMatchObject({ phase: "live", clock: "34", score: { home: 0, away: 1 } });
    expect(first.nextPollSeconds).toBe(15);
    expect(JSON.stringify(first)).not.toContain("602407");
  });

  it("vuelve a leer al vencer la caché (20 s)", async () => {
    const p = fakeProvider();
    const d = deps("2026-11-14T23:34:00Z", p.fetch) as LiveDeps & { advance: (ms: number) => void };
    await getLiveScoreboard(d);
    d.advance(21_000);
    await getLiveScoreboard(d);
    expect(p.calls).toEqual(["/events/live/", "/events/live/"]);
  });

  it("respeta la reserva de la ingesta y sirve lo último conocido con aviso", async () => {
    const calls: string[] = [];
    const fetch: LiveFetch = async (path) => {
      calls.push(path);
      return { status: 200, body: fixture("live.json"), remaining: 250 };
    };
    const d = deps("2026-11-14T23:34:00Z", fetch) as LiveDeps & { advance: (ms: number) => void };
    const first = await getLiveScoreboard(d);
    expect(first.entries[0]?.phase).toBe("live");
    d.advance(21_000);
    const second = await getLiveScoreboard(d);
    expect(calls).toHaveLength(1);
    expect(second.entries[0]?.phase).toBe("live");
    expect(second.notice).toMatch(/cuidar la cuota/);
  });

  it("si el proveedor falla, no rompe la página", async () => {
    const fetch: LiveFetch = async () => {
      throw new Error("timeout");
    };
    const board = await getLiveScoreboard(deps("2026-11-14T23:34:00Z", fetch));
    expect(board.entries[0]?.phase).toBe("scheduled");
    expect(board.notice).toMatch(/no respondió/);
  });
});

describe("ficha en vivo", () => {
  it("antes del partido no gasta peticiones", async () => {
    const p = fakeProvider();
    const detail = await getLiveMatchDetail(QRO_MTY, deps("2026-11-14T20:00:00Z", p.fetch));
    expect(p.calls).toEqual([]);
    expect(detail?.entry.phase).toBe("scheduled");
  });

  it("en juego trae incidentes, estadísticas, xG y momentum con nuestro id", async () => {
    const p = fakeProvider();
    const detail = await getLiveMatchDetail(QRO_MTY, deps("2026-11-14T23:34:00Z", p.fetch));
    expect(detail?.entry).toMatchObject({ phase: "live", score: { home: 0, away: 1 } });
    expect(detail?.incidents.some((i) => i.kind === "goal")).toBe(true);
    expect(detail?.stats?.home.possessionPct).toBe(61);
    expect(detail?.momentum.length).toBeGreaterThan(80);
    expect(detail?.xgTimeline.at(-1)?.home).toBeCloseTo(1.815);
    expect(detail?.nextPollSeconds).toBe(20);
    expect(detail?.attribution).toMatch(/Bzzoiro/);
    expect(p.calls.sort()).toEqual(["/events/602407/incidents/", "/events/602407/stats/", "/events/live/"]);
  });

  it("partido de otro día: enlaza por la lista de la liga una vez y guarda el final una semana", async () => {
    const finished = { ...(fixture("events-liga-mx.json") as { results: Record<string, unknown>[] }) };
    const ev = { ...finished.results[0]!, status: "finished", home_score: 1, away_score: 2, home_score_ht: 0, away_score_ht: 1 };
    const p = fakeProvider({
      "/events/?league_id=19": { results: [ev] },
      "/events/?league_id=20": { results: [] },
      "/events/602407/": ev,
    });
    const d = deps("2026-11-15T12:00:00Z", p.fetch);
    const detail = await getLiveMatchDetail(QRO_MTY, d);
    expect(detail?.entry).toMatchObject({ phase: "final", score: { home: 1, away: 2 } });
    expect(detail?.nextPollSeconds).toBeNull();
    const firstCalls = p.calls.length;
    await getLiveMatchDetail(QRO_MTY, d);
    expect(p.calls.length).toBe(firstCalls);
  });

  it("en modo ilimitado (`BZZOIRO_UNLIMITED`) omite topes de cuota y carga narración incremental, player-stats y TV MX", async () => {
    const commentaryCalls: string[] = [];
    let pollCycle = 0;
    const baseCommentary = [
      { id: 10, minute: 12, text: "Disparo cruzado de Canales.", is_home: false, is_important: false },
    ];
    const extraCommentary = [
      { id: 10, minute: 12, text: "Disparo cruzado de Canales.", is_home: false, is_important: false },
      { id: 11, minute: 38, text: "¡Gol de Monterrey tras tiro de esquina!", is_home: false, is_important: true },
    ];
    const p = fakeProvider({
      "/events/602407/stats/": {
        ...(fixture("stats.json") as Record<string, unknown>),
        stats: {
          ...((fixture("stats.json") as { stats?: Record<string, Record<string, unknown>> }).stats ?? {}),
          home: {
            ...((fixture("stats.json") as { stats?: { home?: Record<string, unknown> } }).stats?.home ?? {}),
            goals_prevented: 0.42,
            touches_in_penalty_area: 19,
            accurate_passes_pct: 80,
          },
          away: {
            ...((fixture("stats.json") as { stats?: { away?: Record<string, unknown> } }).stats?.away ?? {}),
            goals_prevented: -0.15,
            touches_in_penalty_area: 14,
            accurate_passes_pct: 84,
          },
        },
      },
      "/events/602407/player-stats/": [
        {
          player: { name: "Sergio Canales" },
          team: "away",
          position: "AM",
          minutes_played: 38,
          rating: 8.1,
          goals: 1,
          assists: 0,
          total_shots: 3,
          shots_on_target: 2,
          xg: 0.48,
        },
      ],
      "/events/602407/broadcasts/": {
        results: [{ channel: "Caliente TV" }, { channel: "TUDN" }],
      },
    });
    const richFetch: LiveFetch = async (path) => {
      if (path.startsWith("/events/602407/commentary/")) {
        commentaryCalls.push(path);
        pollCycle += 1;
        return {
          status: 200,
          body: { results: pollCycle === 1 ? baseCommentary : extraCommentary },
          remaining: 10,
        };
      }
      const res = await p.fetch(path);
      return { ...res, remaining: 10 };
    };
    const d = deps("2026-11-14T23:34:00Z", richFetch, {
      budget: { dailyMax: 0, reserve: 0, unlimited: true },
      includeRich: true,
    }) as LiveDeps & { advance: (ms: number) => void };

    const first = await getLiveMatchDetail(QRO_MTY, d);
    expect(first?.stats?.home.goalsPrevented).toBeCloseTo(0.42);
    expect(first?.stats?.home.touchesInBox).toBe(19);
    expect(first?.stats?.home.passAccuracyPct).toBe(80);
    expect(first?.commentary?.map((c) => c.id)).toEqual(["10"]);
    expect(first?.playerStats?.[0]).toMatchObject({ player: "Sergio Canales", side: "away", goals: 1 });
    expect(first?.broadcastsMx).toEqual(["Caliente TV", "TUDN"]);

    d.advance(31_000);
    const second = await getLiveMatchDetail(QRO_MTY, d);
    expect(commentaryCalls).toHaveLength(2);
    expect(commentaryCalls[1]).toContain("?since=");
    expect(second?.commentary?.map((c) => c.id)).toEqual(["10", "11"]);
  });

  it("anónimo sin sesión recibe 401 con private, no-store", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const res = await gameGET(new Request("http://localhost/api/live/games/no-existe"), {
      params: Promise.resolve({ gameId: "no-existe" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("partido desconocido con sesión: 404 privado", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const res = await gameGET(new Request("http://localhost/api/live/games/no-existe"), {
      params: Promise.resolve({ gameId: "no-existe" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("id con caracteres raros con sesión: 400 privado", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const res = await gameGET(new Request("http://localhost/api/live/games/x"), {
      params: Promise.resolve({ gameId: "x;drop" }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("caché compartida en Neon (dos instancias)", () => {
  let db: Db;
  beforeEach(async () => {
    const client = new PGlite();
    await applyMigrations((sql) => client.exec(sql));
    db = drizzle(client) as unknown as Db;
  }, 120_000);

  it("la segunda instancia lee lo que trajo la primera, no spamea goles en frío y sí registra un gol real posterior", async () => {
    const p = fakeProvider();
    const store = dbLiveStore(db);
    const a = deps("2026-11-14T23:34:00Z", p.fetch, { store });
    const b = deps("2026-11-14T23:34:05Z", p.fetch, { store });
    await getLiveScoreboard(a);
    const fromB = await getLiveScoreboard(b);
    expect(p.calls).toEqual(["/events/live/"]);
    expect(fromB.entries[0]?.score).toEqual({ home: 0, away: 1 });
    const coldRows = (await db.execute(
      "SELECT kind, home_score, away_score FROM live_match_events ORDER BY kind" as never,
    )) as unknown as { rows: { kind: string }[] };
    expect(coldRows.rows).toEqual([]);

    const liveNext = structuredClone(fixture("live.json")) as {
      events: Array<{ id: number; home_score: number; away_score: number; current_minute: number }>;
    };
    const qroEvt = liveNext.events.find((e) => e.id === 602407)!;
    qroEvt.home_score = 1;
    qroEvt.away_score = 1;
    qroEvt.current_minute = 41;
    const p2 = fakeProvider({ "/events/live/": liveNext });
    const c = deps("2026-11-14T23:35:00Z", p2.fetch, { store });
    await getLiveScoreboard(c);
    const rows = (await db.execute(
      "SELECT kind, home_score, away_score FROM live_match_events ORDER BY kind" as never,
    )) as unknown as { rows: { kind: string }[] };
    expect(rows.rows.map((r) => r.kind)).toEqual(["goal"]);
    const link = (await db.execute("SELECT game_id, provider_event_id FROM provider_match_links" as never)) as unknown as {
      rows: { game_id: string; provider_event_id: string }[];
    };
    expect(link.rows).toEqual([{ game_id: QRO_MTY, provider_event_id: "602407" }]);
  });
});

describe("cabeceras, cuota y cierre anti-scraping en rutas live/search", () => {
  it("lee lo restante del `RateLimit` de Bzzoiro", () => {
    expect(parseRateLimitRemaining('"football";r=7213;t=52800')).toBe(7213);
    expect(parseRateLimitRemaining(null)).toBeNull();
  });

  it("caché corta en vivo, larga al terminar", () => {
    expect(liveCacheControl(15, false)).toBe("public, s-maxage=10, stale-while-revalidate=20");
    expect(liveCacheControl(null, true)).toMatch(/s-maxage=3600/);
    expect(liveCacheControl(null, false)).toMatch(/s-maxage=120/);
  });

  it("GET /api/live/scoreboard devuelve 401 anónimo y 200 privado con private, no-store", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const unauth = await scoreboardGET(new Request("http://localhost/api/live/scoreboard"));
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("cache-control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const res = await scoreboardGET(new Request("http://localhost/api/live/scoreboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await res.json()) as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("GET /api/live/alerts devuelve 401 sin sesión con private, no-store", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    resetAuthForTests({
      api: {
        getSession: async () => null,
      },
    } as unknown as PitchLabAuth);
    const res = await alertsGET(new Request("http://localhost/api/live/alerts"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /api/search/players devuelve 401 anónimo, exige q.length >= 2 y responde private, no-store", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const unauth = await searchPlayersGET(
      new Request("http://localhost/api/search/players?q=ohtani&league=mlb"),
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("cache-control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const shortQuery = await searchPlayersGET(
      new Request("http://localhost/api/search/players?q=a&league=mlb"),
    );
    expect(shortQuery.status).toBe(200);
    expect(shortQuery.headers.get("cache-control")).toBe("private, no-store");
    expect(await shortQuery.json()).toEqual({ items: [] });

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_BETA);
    const ok = await searchPlayersGET(
      new Request("http://localhost/api/search/players?q=al&limit=99"),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    const body = (await ok.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(40);
  });
});
