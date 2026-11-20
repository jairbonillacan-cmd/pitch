import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
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
import { GET as scoreboardGET } from "../app/api/live/scoreboard/route";
import { GET as gameGET } from "../app/api/live/games/[gameId]/route";

// Respuestas reales de Bzzoiro (2026-11-14), recortadas; las comparte la prueba del adaptador.
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

/** Proveedor falso: cuenta las peticiones y responde con los fixtures. */
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
    // Permite adelantar el reloj en la prueba.
    ...({ advance: (ms: number) => (clock += ms) } as object),
  } as LiveDeps;
}

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
    // Nunca sale el id del proveedor.
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
    expect(calls).toHaveLength(1); // ya no gasta: quedan 250 y la reserva es 300
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
    // live + incidentes + stats; el enlace salió de la lista en vivo (sin pedir la liga del día).
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
    expect(p.calls.length).toBe(firstCalls); // todo sale de la caché
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
          remaining: 10, // bajo respecto a reserva, pero modo ilimitado lo permite
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

  it("partido desconocido: 404", async () => {
    const res = await gameGET(new Request("http://localhost/api/live/games/no-existe"), {
      params: Promise.resolve({ gameId: "no-existe" }),
    });
    expect(res.status).toBe(404);
  });

  it("id con caracteres raros: 400", async () => {
    const res = await gameGET(new Request("http://localhost/api/live/games/x"), {
      params: Promise.resolve({ gameId: "x;drop" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("caché compartida en Neon (dos instancias)", () => {
  let db: Db;
  beforeEach(async () => {
    const client = new PGlite();
    await applyMigrations((sql) => client.exec(sql));
    db = drizzle(client) as unknown as Db;
  }, 120_000);

  it("la segunda instancia lee lo que trajo la primera, y el gol queda para los avisos", async () => {
    const p = fakeProvider();
    const a = deps("2026-11-14T23:34:00Z", p.fetch, { store: dbLiveStore(db) });
    const b = deps("2026-11-14T23:34:05Z", p.fetch, { store: dbLiveStore(db) });
    await getLiveScoreboard(a);
    const fromB = await getLiveScoreboard(b);
    expect(p.calls).toEqual(["/events/live/"]);
    expect(fromB.entries[0]?.score).toEqual({ home: 0, away: 1 });
    const rows = (await db.execute(
      "SELECT kind, home_score, away_score FROM live_match_events ORDER BY kind" as never,
    )) as unknown as { rows: { kind: string }[] };
    expect(rows.rows.map((r) => r.kind)).toEqual(["goal", "kickoff"]);
    const link = (await db.execute("SELECT game_id, provider_event_id FROM provider_match_links" as never)) as unknown as {
      rows: { game_id: string; provider_event_id: string }[];
    };
    expect(link.rows).toEqual([{ game_id: QRO_MTY, provider_event_id: "602407" }]);
  });
});

describe("cabeceras y cuota", () => {
  it("lee lo restante del `RateLimit` de Bzzoiro", () => {
    expect(parseRateLimitRemaining('"football";r=7213;t=52800')).toBe(7213);
    expect(parseRateLimitRemaining(null)).toBeNull();
  });

  it("caché corta en vivo, larga al terminar", () => {
    expect(liveCacheControl(15, false)).toBe("public, s-maxage=10, stale-while-revalidate=20");
    expect(liveCacheControl(null, true)).toMatch(/s-maxage=3600/);
    expect(liveCacheControl(null, false)).toMatch(/s-maxage=120/);
  });

  it("la ruta del marcador responde con `Cache-Control` para el CDN", async () => {
    const res = await scoreboardGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/^public, s-maxage=/);
    const body = (await res.json()) as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });
});
