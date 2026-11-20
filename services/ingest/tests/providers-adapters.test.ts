import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mapBzzoiroLeagueLogoUrl,
  mapBzzoiroTeamLogoUrl,
  toMatchRow as bzRow,
  type BzEvent,
} from "../src/providers/bzzoiro.js";
import { readProviderConfigs } from "../src/providers/config.js";
import {
  collectLeague,
  fiveDollarIntervalMs,
  parseOdds,
  toMatchRow as fdRow,
  type FdFixture,
} from "../src/providers/fivedollar.js";
import { createProviderClient, ProviderBudgetExhaustedError } from "../src/providers/http.js";

// Recortes de respuestas reales del 14 nov 2026.
const BZ_EVENT: BzEvent = {
  id: 211641,
  league_id: 19,
  season_id: 1309,
  home_team_id: 318,
  home_team: "Club León",
  away_team_id: 320,
  away_team: "CD Guadalajara",
  home_coach_id: 347,
  away_coach_id: 444,
  referee_id: 2382,
  venue_id: 305,
  event_date: "2026-11-09T02:10:00+00:00",
  status: "finished",
  round_number: 16,
  stage: "regular-season",
  home_score: 1,
  away_score: 1,
  home_score_ht: 0,
  away_score_ht: 0,
  extra_time_score: null,
  penalty_shootout: null,
  is_local_derby: false,
  is_neutral_ground: false,
  travel_distance_km: 192,
  weather: { code: 2, description: "cloudy", wind_speed: 9.7, temperature_c: 20 },
};

const BZ_STATS = {
  event_id: 211641,
  stats: {
    home: {
      total_shots: 8,
      shots_on_target: 5,
      corner_kicks: 2,
      fouls: 10,
      yellow_cards: 2,
      red_cards: 1,
      ball_possession: 33,
      expected_goals: 0.35,
      expected_goals_on_target: 0.82,
      crosses: { value: 2, total: 9, pct: 22 },
      xg: { actual: 0.35, estimated: false },
    },
    away: { total_shots: 18, corner_kicks: 6, ball_possession: 67, xg: { actual: 1.62, estimated: true } },
  },
};

const BZ_LINEUPS = {
  event_id: 211641,
  lineup_status: "confirmed",
  lineups: {
    home: { formation: "4-4-2", players: [{ id: 10120, position: "G" }, { id: 10125, position: "D" }] },
    away: { formation: "4-3-3", players: [{ id: 10161, position: "G" }] },
  },
  unavailable_players: {
    home: [],
    away: [{ id: 10056, name: "Ángel Sepúlveda", status: "injured", reason: "Muscle Injury" }],
  },
};

const FD_FIXTURE: FdFixture = {
  id: 521852287,
  league: { id: 4160026622, name: "England Premier League" },
  teams: { home: { id: 1298357733, name: "Brighton" }, away: { id: 2493508502, name: "Brentford" } },
  kickoff_utc: "2026-11-08T14:00:00+00:00",
  status: "finished",
  goals: { home: 2, away: 0, half_home: 2, half_away: 0 },
  corners: { home: 7, away: 3, half_home: 3, half_away: 1 },
  cards: { home: { yellow: 4, red: 0 }, away: { yellow: 2, red: 1 } },
};

const FD_ODDS = {
  fixture_id: 521852287,
  bookmakers: [
    {
      name: "Bet 365",
      slug: "bet365",
      odds: {
        "1x2": {
          opening: { home: 1.8, draw: 3.8, away: 3.9, opened_at: "2026-10-24T16:05:00+00:00" },
          closing: { home: 1.75, draw: 4, away: 4.2 },
          inplay: { home: 1.002, draw: 51, away: 451 },
        },
        asian_handicap: { opening: { line: -0.5, home: 1.825, away: 2.025 }, closing: { line: -0.75, home: 2.025, away: 1.825 } },
        goal_line: { opening: { line: 3, over: 1.925, under: 1.925 }, closing: { line: 2.75, over: 1.85, under: 2 } },
        corner_line: { opening: { line: 10, over: 1.9, under: 1.9 }, closing: { line: 10, over: 1.9, under: 1.9 } },
        card_line: { opening: { line: 3.5, over: 1.8, under: 2 }, closing: null },
        btts: { opening: { yes: 1.533, no: 2.375 }, closing: { yes: 1.667, no: 2.1 } },
      },
    },
  ],
};

describe("Bzzoiro", () => {
  it("normaliza partido, xG, córners, alineación y bajas", () => {
    const row = bzRow("liga-mx", BZ_EVENT, BZ_STATS, BZ_LINEUPS);
    expect(row.source).toBe("bzzoiro");
    expect(row.providerMatchId).toBe(211641);
    expect(row.home.slug).toBe("leon");
    expect(row.score).toEqual({ home: 1, away: 1, htHome: 0, htAway: 0 });
    expect(row.stats?.home.xg).toBe(0.35);
    expect(row.stats?.home.xgEstimated).toBe(false);
    expect(row.stats?.away.xgEstimated).toBe(true);
    expect(row.stats?.home.corners).toBe(2);
    expect(row.stats?.home.redCards).toBe(1);
    expect(row.stats?.away.shotsOnTarget).toBeNull();
    expect(row.lineups?.status).toBe("confirmed");
    expect(row.lineups?.home.starterIds).toEqual([10120, 10125]);
    expect(row.lineups?.away.unavailable[0]).toMatchObject({ status: "injured", reason: "Muscle Injury" });
    expect(row.context).toMatchObject({ travelKm: 192, temperatureC: 20, derby: false });
    expect(row.wentBeyond90).toBe(false);
  });

  it("sin detalles deja stats y alineaciones en null", () => {
    const row = bzRow("liga-mx", BZ_EVENT, null, null);
    expect(row.stats).toBeNull();
    expect(row.lineups).toBeNull();
    expect(row.home.logoUrl).toBe("https://sports.bzzoiro.com/img/team/318/?bg=transparent");
    expect(row.away.logoUrl).toBe("https://sports.bzzoiro.com/img/team/320/?bg=transparent");
  });

  it("mapea logoUrl para equipos y ligas de Bzzoiro, rechaza hosts ajenos y omite ligas sin cobertura", () => {
    expect(mapBzzoiroTeamLogoUrl("liga-mx", "queretaro")).toBe(
      "https://sports.bzzoiro.com/img/team/309/?bg=transparent",
    );
    expect(
      mapBzzoiroTeamLogoUrl("premier-league", "arsenal", {
        providerTeamId: 100,
        raw: { logo_url: "https://sports.bzzoiro.com/img/team/999/?bg=transparent" },
      }),
    ).toBe("https://sports.bzzoiro.com/img/team/999/?bg=transparent");
    expect(
      mapBzzoiroTeamLogoUrl("premier-league", "arsenal", {
        providerTeamId: 100,
        raw: { logo_url: "https://cdn.otro-host.example/team/999.png" },
      }),
    ).toBe("https://sports.bzzoiro.com/img/team/100/?bg=transparent");

    expect(mapBzzoiroLeagueLogoUrl("liga-mx")).toBe(
      "https://sports.bzzoiro.com/img/league/19/?bg=transparent",
    );
    expect(mapBzzoiroLeagueLogoUrl("nba")).toBe(
      "https://sports.bzzoiro.com/img/basketball/league/1/?bg=transparent",
    );
    expect(mapBzzoiroTeamLogoUrl("nfl", "kansas-city-chiefs", { providerTeamId: 55 })).toBeUndefined();
    expect(mapBzzoiroLeagueLogoUrl("nfl")).toBeUndefined();
    expect(mapBzzoiroLeagueLogoUrl("nhl")).toBeUndefined();
  });
});

describe("5DollarFootballAPI", () => {
  it("lee apertura y cierre de Bet365 e ignora en vivo", () => {
    const odds = parseOdds(FD_ODDS);
    expect(odds?.oneXTwo.opening).toEqual({ home: 1.8, draw: 3.8, away: 3.9 });
    expect(odds?.oneXTwo.closing).toEqual({ home: 1.75, draw: 4, away: 4.2 });
    expect(odds?.goalLine.closing).toEqual({ line: 2.75, over: 1.85, under: 2 });
    expect(odds?.cornerLine.opening?.line).toBe(10);
    expect(odds?.cardLine.closing).toBeNull();
    expect(odds?.asianHandicap.closing?.line).toBe(-0.75);
    expect(parseOdds(FD_ODDS, "pinnacle")).toBeNull();
  });

  it("normaliza córners y tarjetas por equipo", () => {
    const row = fdRow("premier-league", FD_FIXTURE, null);
    expect(row.corners).toEqual({ home: 7, away: 3, htHome: 3, htAway: 1 });
    expect(row.cards).toEqual({ homeYellow: 4, homeRed: 0, awayYellow: 2, awayRed: 1 });
    expect(row.home.slug).toBe("brighton");
  });

  it("respeta el límite de cada plan", () => {
    expect(fiveDollarIntervalMs("free")).toBeGreaterThanOrEqual(60_000);
    expect(fiveDollarIntervalMs("pro")).toBeGreaterThanOrEqual(6_000);
    expect(fiveDollarIntervalMs("ultra")).toBeLessThan(2_000);
  });
});

describe("cliente HTTP de proveedores", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function setup(responses: Array<() => Response>, maxRequests = 10) {
    dir = mkdtempSync(join(tmpdir(), "pl-prov-"));
    const calls: { url: string; auth: string | null }[] = [];
    const sleeps: number[] = [];
    let clock = 0;
    const cfg = readProviderConfigs({ FIVEDOLLAR_FOOTBALL_API_KEY: "fb_live_test" }).fivedollar;
    const client = createProviderClient(cfg, {
      cacheDir: dir,
      minIntervalMs: 1_000,
      maxRequests,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
        const next = responses.shift();
        if (!next) throw new Error("sin respuesta preparada");
        return next();
      }) as typeof fetch,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    });
    return { client, calls, sleeps };
  }

  it("cachea, espera entre peticiones y manda la clave solo en la cabecera", async () => {
    const { client, calls, sleeps } = setup([
      () => new Response(JSON.stringify({ a: 1 })),
      () => new Response(JSON.stringify({ b: 2 })),
    ]);
    expect(await client.get("/x")).toEqual({ a: 1 });
    expect(client.isCached("/x")).toBe(true);
    expect(await client.get("/x")).toEqual({ a: 1 });
    expect(await client.get("/y")).toEqual({ b: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.auth).toBe("Bearer fb_live_test");
    expect(calls[0]!.url).not.toContain("fb_live_test");
    expect(sleeps).toContain(1_000);
    expect(client.stats).toEqual({ requests: 2, cacheHits: 1 });
  });

  it("reintenta tras 429 con Retry-After", async () => {
    const { client, sleeps } = setup([
      () => new Response("", { status: 429, headers: { "Retry-After": "7" } }),
      () => new Response(JSON.stringify({ ok: true })),
    ]);
    expect(await client.get("/z")).toEqual({ ok: true });
    expect(sleeps).toContain(7_000);
  });

  it("marca 404 y no vuelve a pedirlo", async () => {
    const { client, calls } = setup([() => new Response("", { status: 404 })]);
    expect(await client.get("/nada")).toBeNull();
    expect(await client.get("/nada")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("corta al agotar el presupuesto y rechaza rutas raras", async () => {
    const { client } = setup([() => new Response("{}")], 1);
    await client.get("/uno");
    await expect(client.get("/dos")).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
    await expect(client.get("/../etc")).rejects.toThrow(/no válida/);
    await expect(client.get("http://otro.com/x")).rejects.toThrow(/no válida/);
  });

  it("5Dollar pide momios solo hasta el tope y deja el resto pendiente", async () => {
    const fixtures = [FD_FIXTURE, { ...FD_FIXTURE, id: 2 }, { ...FD_FIXTURE, id: 3 }];
    const { client, calls } = setup([
      () => new Response(JSON.stringify({ success: 1, data: fixtures, pagination: { has_more: false } })),
      () => new Response(JSON.stringify({ success: 1, data: FD_ODDS })),
    ]);
    const result = await collectLeague(client, "premier-league", { maxOddsRequests: 1 });
    expect(result.rows).toHaveLength(3);
    expect(result.oddsFetched).toBe(1);
    expect(result.oddsPending).toBe(2);
    expect(result.rows[0]!.odds?.oneXTwo.closing?.home).toBe(1.75);
    expect(calls).toHaveLength(2);
  });
});
