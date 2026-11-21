import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_CAPABLE_BZZOIRO_LEAGUES,
  LiveAveragePositionSchema,
  LiveMatchDetailSchema,
  LiveShotSchema,
  LiveShotmapSummarySchema,
} from "@pitchlab/contracts";
import { applyMigrations, type Db } from "@pitchlab/db";
import {
  LIVE_LEAGUES,
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
    expect(detail?.attribution).toBe("Datos en vivo · PitchLab");
    expect(detail?.attribution ?? "").not.toMatch(/bzzoiro/i);
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

describe("telemetría Bzzoiro en vivo (LIVE_LEAGUES, shotmap, posiciones medias y FD-16)", () => {
  it("LIVE_LEAGUES se deriva directamente desde LIVE_CAPABLE_BZZOIRO_LEAGUES de @pitchlab/contracts", () => {
    expect(LIVE_LEAGUES).toBe(LIVE_CAPABLE_BZZOIRO_LEAGUES);
    expect(LIVE_LEAGUES["liga-mx"]).toEqual([19, 20]);
    expect(LIVE_LEAGUES["champions-league"]).toEqual([7]);
    expect(LIVE_LEAGUES["nba"]).toBeUndefined();
  });

  it("en modo estándar puebla shots normalizados, xgTimeline y shotmapSummary desde stats.json sin duplicar requests", async () => {
    const p = fakeProvider();
    const d = deps("2026-11-14T23:34:00Z", p.fetch);
    const first = await getLiveMatchDetail(QRO_MTY, d);
    const second = await getLiveMatchDetail(QRO_MTY, d);

    expect(p.calls.filter((c) => c === "/events/602407/stats/")).toHaveLength(1);
    expect(first?.shots).toHaveLength(6);
    expect(first?.shots.map((s) => s.minute)).toEqual([71, 73, 75, 81, 82, 84]);
    expect(first?.shots.find((s) => s.minute === 81)?.outcome).toBe("save");
    expect(first?.shots.find((s) => s.minute === 84)?.outcome).toBe("goal");
    expect(first?.shotmapSummary).toEqual({
      xgHome: 1.81,
      xgAway: 0.35,
      shotsHome: 20,
      shotsAway: 8,
    });
    expect(first?.xgTimeline.at(-1)).toEqual({ minute: 84, home: 1.815, away: 0.348 });
    expect(second?.shots).toEqual(first?.shots);
    expect(() => LiveMatchDetailSchema.parse(first)).not.toThrow();

    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("602407");
    expect(serialized).not.toContain("654339");
  });

  it("en modo enriquecido reutiliza statsRaw y playerStatsRaw sin duplicar requests, puebla shotmap + averagePositions y cumple FD-16", async () => {
    const p = fakeProvider({
      "/events/602407/stats/": {
        event_id: 602407,
        xg_estimated: false,
        shotmap: [
          {
            min: 24,
            added_time: 2,
            home: true,
            type: "save",
            xg: 0.312,
            pos: { x: 0.88, y: 0.49 },
            player_id: 88776655,
            body_part: "right_foot",
          },
          {
            minute: 41,
            is_home: false,
            outcome: "block",
            expected_goals: 0.145,
            coordinates: { x: 0.78, y: 0.54 },
            player: {
              id: 77665544,
              name: "Sergio Canales https://sports.bzzoiro.com/img/player/77665544/",
            },
            bodyPart: "head",
          },
        ],
        average_positions: {
          home: [
            {
              id: 88776656,
              player_id: 88776656,
              external_id: "ext-secret-602407",
              player: {
                id: 88776656,
                name: "Álvaro Fidalgo https://sports.bzzoiro.com/img/player/88776656/",
                shirt_number: 8,
              },
              average_x: 56.4,
              average_y: 41.2,
              touches: 78,
              photo_url: "https://sports.bzzoiro.com/img/player/88776656/",
            },
          ],
          away: [],
        },
      },
      "/events/602407/player-stats/": {
        home: [
          {
            player_id: 88776655,
            player: { id: 88776655, name: "Henry Martín" },
            position: "ST",
            minutes_played: 41,
            rating: 8.1,
            photo_url: "https://a.espncdn.com/headshots/88776655.png",
          },
          {
            player_id: 88776656,
            player: { id: 88776656, name: "Álvaro Fidalgo" },
            position: "CM",
            minutes_played: 41,
            rating: 8.35,
            touches: 78,
          },
        ],
        away: [
          {
            player_id: 77665544,
            player: {
              id: 77665544,
              name: "Sergio Canales www.bzzoiro.com/player/77665544",
              jersey_number: 10,
            },
            position: "AM",
            minutes_played: 41,
            avg_x: 64.5,
            avg_y: 53.1,
            touches: 69,
            rating: 7.9,
            image_url: "https://sports.bzzoiro.com/img/player/77665544/",
          },
        ],
      },
      "/events/602407/commentary/": { results: [] },
      "/events/602407/broadcasts/": { results: [] },
    });

    const d = deps("2026-11-14T23:34:00Z", p.fetch, {
      budget: { dailyMax: 0, reserve: 0, unlimited: true },
      includeRich: true,
    });

    const detail = await getLiveMatchDetail(QRO_MTY, d);
    await getLiveMatchDetail(QRO_MTY, d);

    expect(p.calls.filter((c) => c === "/events/602407/stats/")).toHaveLength(1);
    expect(p.calls.filter((c) => c === "/events/602407/player-stats/")).toHaveLength(1);

    expect(detail?.shots).toEqual([
      {
        minute: 24,
        addedTime: 2,
        side: "home",
        outcome: "save",
        xg: 0.312,
        x: 88,
        y: 49,
        player: "Henry Martín",
        bodyPart: "right_foot",
      },
      {
        minute: 41,
        side: "away",
        outcome: "block",
        xg: 0.145,
        x: 78,
        y: 54,
        player: "Sergio Canales",
        bodyPart: "head",
      },
    ]);
    expect(detail?.xgTimeline).toEqual([
      { minute: 24, home: 0.312, away: 0 },
      { minute: 41, home: 0.312, away: 0.145 },
    ]);
    expect(detail?.shotmapSummary).toEqual({
      xgHome: 0.312,
      xgAway: 0.145,
      shotsHome: 1,
      shotsAway: 1,
    });
    expect(detail?.averagePositions).toEqual([
      {
        side: "home",
        name: "Álvaro Fidalgo",
        number: 8,
        position: "CM",
        x: 56.4,
        y: 41.2,
        touches: 78,
        rating: 8.35,
      },
      {
        side: "away",
        name: "Sergio Canales",
        number: 10,
        position: "AM",
        x: 64.5,
        y: 53.1,
        touches: 69,
        rating: 7.9,
      },
    ]);

    expect(() => LiveMatchDetailSchema.parse(detail)).not.toThrow();
    for (const shot of detail?.shots ?? []) {
      expect(() => LiveShotSchema.parse(shot)).not.toThrow();
    }
    for (const pos of detail?.averagePositions ?? []) {
      expect(() => LiveAveragePositionSchema.parse(pos)).not.toThrow();
    }
    expect(() => LiveShotmapSummarySchema.parse(detail?.shotmapSummary)).not.toThrow();

    const serialized = JSON.stringify(detail);
    for (const forbidden of [
      "602407",
      "88776655",
      "88776656",
      "77665544",
      "ext-secret-602407",
      "bzzoiro.com",
      "espncdn",
      "https://",
      "http://",
      "www.",
      "photo_url",
      "image_url",
      "player_id",
      "external_id",
      "event_id",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
