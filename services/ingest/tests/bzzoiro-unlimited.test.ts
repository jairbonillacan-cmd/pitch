import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BzzoiroOddsAdapter,
  classifyLineMovement,
  mapBzzoiroMarketQuote,
  parseBzzoiroBestOdds,
  parseBzzoiroOdds,
  parseBzzoiroOddsComparison,
  type BzOddsEvent,
  type BzOddsRow,
} from "../src/odds/bzzoiro-odds.js";
import { CleanHttpTransport, type HttpRequesterFn } from "../src/odds/legal-registry.js";
import {
  fetchBzzoiroFullPreMatchBundle,
  fetchBzzoiroMatchTelemetry,
  parseBzzoiroEventAvailability,
  parseBzzoiroH2h,
  parseBzzoiroLineupNormalized,
  parseBzzoiroMatchContext,
  parseBzzoiroRefereeProfile,
} from "../src/providers/bzzoiro-enrichment.js";
import {
  extractBzzoiroMatchTelemetry,
  parseBroadcastsMx,
  parseBzzoiroAveragePositions,
  parseBzzoiroShotmap,
  type BzLiveStats,
} from "../src/providers/bzzoiro-live.js";
import {
  buildGuardedNbaPlayerPropSeeds,
  fetchBzzoiroNbaBoxScore,
  fetchBzzoiroNbaOdds,
  fetchBzzoiroNbaPregame,
  parseBzzoiroNbaBoxScoreDetail,
  parseBzzoiroNbaOddsComparison,
  parseBzzoiroNbaPlayerGames,
  parseBzzoiroNbaPregame,
  parseNbaMinutes,
} from "../src/providers/bzzoiro-nba-rich.js";
import type { ProviderClient } from "../src/providers/http.js";

const LIVE_FIX = join(import.meta.dirname, "fixtures", "bzzoiro-live");
const REAL_STATS_FIXTURE = JSON.parse(readFileSync(join(LIVE_FIX, "stats.json"), "utf8")) as BzLiveStats;

const FORBIDDEN_FD16_KEYS = new Set([
  "externalId",
  "external_id",
  "providerId",
  "provider_id",
  "providerEventId",
  "provider_event_id",
  "providerMatchId",
  "providerPlayerId",
  "player_id",
  "playerId",
  "team_id",
  "referee_id",
  "event_id",
  "bookmaker_id",
  "bzzoiroId",
  "bzzoiro_id",
  "photo_url",
  "image_url",
  "url",
]);

function collectObjectKeys(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectObjectKeys(item, out);
    return out;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out.push(k);
    collectObjectKeys(v, out);
  }
  return out;
}

function assertFd16Clean(payload: unknown, sentinelTokens: readonly string[] = []): void {
  const keys = collectObjectKeys(payload);
  for (const k of keys) {
    expect(FORBIDDEN_FD16_KEYS.has(k), `Llave prohibida FD-16 detectada: ${k}`).toBe(false);
  }
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/https?:\/\//i);
  expect(serialized).not.toMatch(/sports\.bzzoiro\.com/i);
  expect(serialized).not.toMatch(/Confianza\s+\d/i);
  for (const token of sentinelTokens) {
    expect(serialized).not.toContain(token);
  }
}

function createMockProviderClient(routes: Readonly<Record<string, unknown>>): {
  client: ProviderClient;
  calls: string[];
} {
  const calls: string[] = [];
  const client: ProviderClient = {
    stats: { requests: 0, cacheHits: 0 },
    isCached: () => false,
    async get<T>(pathWithQuery: string): Promise<T | null> {
      calls.push(pathWithQuery);
      (client.stats as { requests: number }).requests += 1;
      const hit =
        Object.prototype.hasOwnProperty.call(routes, pathWithQuery)
          ? pathWithQuery
          : Object.keys(routes)
              .sort((a, b) => b.length - a.length)
              .find((k) => pathWithQuery.startsWith(k));
      if (!hit) return null;
      return routes[hit] as T;
    },
  };
  return { client, calls };
}

describe("Bzzoiro Unlimited · 1. Shotmap + xG por disparo/minuto y Posiciones Medias", () => {
  it("normaliza el fixture real stats.json manteniendo xG total, timeline y outcomes canónicos", () => {
    const summary = parseBzzoiroShotmap(REAL_STATS_FIXTURE);
    expect(summary.xgHome).toBe(1.81);
    expect(summary.xgAway).toBe(0.35);
    expect(summary.xgEstimated).toBe(false);
    expect(summary.shotsHome).toBe(20);
    expect(summary.shotsAway).toBe(8);
    expect(summary.shots).toHaveLength(6);
    expect(summary.shots.map((s) => s.minute)).toEqual([71, 73, 75, 81, 82, 84]);
    expect(summary.shots.find((s) => s.minute === 81)?.outcome).toBe("saved");
    expect(summary.shots.find((s) => s.minute === 84)?.outcome).toBe("goal");
    expect(summary.shots.every((s) => s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100)).toBe(true);
    expect(summary.xgTimeline.at(-1)).toMatchObject({ minute: 84, cumHome: 1.815, cumAway: 0.348 });
    assertFd16Clean(summary, ["654339"]);
  });

  it("resuelve nombres desde player-stats, escala coordenadas 0..1 a 0..100, tolera faltantes y sintetiza xgTimeline", () => {
    const rawStats: BzLiveStats = {
      event_id: 987654321,
      shotmap: [
        {
          min: 14,
          home: true,
          type: "save",
          xg: 0.312,
          pos: { x: 0.88, y: 0.48 },
          player_id: 88776655,
          body_part: "right_foot",
        },
        {
          minute: 39,
          is_home: false,
          outcome: "block",
          expected_goals: 0.145,
          coordinates: { x: 0.79, y: 0.55 },
          player: { id: 77665544, name: "Julián Quiñones https://sports.bzzoiro.com/img/player/77665544/" },
          bodyPart: "head",
        },
        {
          min: 67,
          side: "home",
          result: "woodwork",
          x: 0.92,
          y: 0.52,
        },
        // Disparo malformado sin coordenadas: debe ignorarse sin romper
        { min: 70, home: true, type: "miss", xg: 0.05 },
      ],
    };

    const playerStats = {
      home: [{ player_id: 88776655, player: { id: 88776655, name: "Henry Martín" }, position: "ST", rating: 8.1 }],
      away: [{ player_id: 77665544, player: { id: 77665544, name: "Julián Quiñones" }, position: "FW", rating: 7.5 }],
    };

    const summary = parseBzzoiroShotmap(rawStats, playerStats);
    expect(summary.shots).toHaveLength(3);
    expect(summary.shots[0]).toEqual({
      x: 88,
      y: 48,
      minute: 14,
      xg: 0.312,
      outcome: "saved",
      side: "home",
      playerName: "Henry Martín",
      bodyPart: "right_foot",
    });
    expect(summary.shots[1]).toMatchObject({
      x: 79,
      y: 55,
      minute: 39,
      xg: 0.145,
      outcome: "blocked",
      side: "away",
      playerName: "Julián Quiñones",
      bodyPart: "head",
    });
    expect(summary.shots[2]).toMatchObject({
      x: 92,
      y: 52,
      minute: 67,
      xg: 0,
      outcome: "post",
      side: "home",
      playerName: "Jugador local",
    });
    expect(summary.xgHome).toBe(0.312);
    expect(summary.xgAway).toBe(0.145);
    expect(summary.xgTimeline).toEqual([
      { minute: 14, xgHome: 0.312, xgAway: 0, cumHome: 0.312, cumAway: 0 },
      { minute: 39, xgHome: 0, xgAway: 0.145, cumHome: 0.312, cumAway: 0.145 },
      { minute: 67, xgHome: 0, xgAway: 0, cumHome: 0.312, cumAway: 0.145 },
    ]);
    assertFd16Clean(summary, ["987654321", "88776655", "77665544"]);
  });

  it("extrae averagePositions desde stats y player-stats enriqueciendo rating/touches sin filtrar externalId", () => {
    const rawStats: BzLiveStats = {
      event_id: 987654321,
      average_positions: {
        home: [
          {
            external_id: "ext-987654321",
            player_id: 88776655,
            player: { id: 88776655, name: "Álvaro Fidalgo", shirt_number: 8 },
            average_x: 56.4,
            average_y: 41.2,
            touches: 78,
            photo_url: "https://sports.bzzoiro.com/img/player/88776655/",
          },
          {
            player_name: "Luis Malagón",
            jersey_number: 1,
            position: "GK",
            x: -4, // fuera de rango: debe acotarse a 0
            y: 50,
            touches: 31,
          },
        ],
        away: [],
      },
    };
    const playerStats = {
      home: [
        {
          player_id: 88776655,
          player: { id: 88776655, name: "Álvaro Fidalgo" },
          position: "CM",
          rating: 8.35,
          touches: 78,
        },
      ],
      away: [
        // Fallback desde player-stats cuando stats.average_positions.away viene vacío
        {
          player_id: 77665544,
          player: { id: 77665544, name: "Sergio Canales", jersey_number: 10 },
          position: "AM",
          avg_x: 64.5,
          avg_y: 53.1,
          touches: 69,
          rating: 7.9,
        },
      ],
    };

    const positions = parseBzzoiroAveragePositions(rawStats, playerStats);
    expect(positions.home).toHaveLength(2);
    expect(positions.home[0]).toEqual({
      x: 56.4,
      y: 41.2,
      playerName: "Álvaro Fidalgo",
      jerseyNumber: 8,
      position: "CM",
      touches: 78,
      rating: 8.35,
    });
    expect(positions.home[1]).toMatchObject({
      x: 0,
      y: 50,
      playerName: "Luis Malagón",
      jerseyNumber: 1,
      position: "GK",
      touches: 31,
    });
    expect(positions.away).toEqual([
      {
        x: 64.5,
        y: 53.1,
        playerName: "Sergio Canales",
        jerseyNumber: 10,
        position: "AM",
        touches: 69,
        rating: 7.9,
      },
    ]);
    assertFd16Clean(positions, ["987654321", "88776655", "77665544", "ext-987654321"]);

    const telemetry = extractBzzoiroMatchTelemetry(rawStats, playerStats);
    expect(telemetry.averagePositions.home).toHaveLength(2);
    assertFd16Clean(telemetry, ["987654321", "88776655", "77665544"]);
  });

  it("consulta /events/{id}/stats/ y /events/{id}/player-stats/ en paralelo vía fetchBzzoiroMatchTelemetry", async () => {
    const { client, calls } = createMockProviderClient({
      "/events/4200/stats/": REAL_STATS_FIXTURE,
      "/events/4200/player-stats/": {
        home: [{ player_name: "Jugador A", position: "ST", avg_x: 72, avg_y: 49, touches: 40, rating: 7.6 }],
      },
    });
    const telemetry = await fetchBzzoiroMatchTelemetry(client, 4200);
    expect(calls.sort()).toEqual(["/events/4200/player-stats/", "/events/4200/stats/"]);
    expect(telemetry.shotmap.shots).toHaveLength(6);
    expect(telemetry.averagePositions.home).toHaveLength(1);
    assertFd16Clean(telemetry, ["4200", "654339"]);
  });
});

describe("Bzzoiro Unlimited · 2. Comparativa multi-casa, movimiento (SHORTENING/DRIFTING/STEAM) y mercados extendidos", () => {
  it("clasifica correctamente SHORTENING, DRIFTING, STEAM y STABLE con deltaPct exacto", () => {
    const shortening = classifyLineMovement({ openingDecimal: 2.05, currentDecimal: 1.95 });
    expect(shortening.signal).toBe("SHORTENING");
    expect(shortening.deltaPct).toBe(-4.88);
    expect(shortening.legacyDirection).toBe("shortening");

    const drifting = classifyLineMovement({ openingDecimal: 2.1, currentDecimal: 2.25 });
    expect(drifting.signal).toBe("DRIFTING");
    expect(drifting.deltaPct).toBe(7.14);
    expect(drifting.legacyDirection).toBe("drifting");

    const steamMagnitude = classifyLineMovement({ openingDecimal: 2.2, currentDecimal: 1.95 });
    expect(steamMagnitude.signal).toBe("STEAM");
    expect(steamMagnitude.deltaPct).toBe(-11.36);
    expect(steamMagnitude.legacyDirection).toBe("shortening");

    const steamCoordinated = classifyLineMovement({
      openingDecimal: 2.0,
      currentDecimal: 1.91,
      coordinatedShorteningBooks: 3,
      sharpShortened: true,
    });
    expect(steamCoordinated.signal).toBe("STEAM");

    const stable = classifyLineMovement({ openingDecimal: 1.95, currentDecimal: 1.95 });
    expect(stable.signal).toBe("STABLE");
    expect(stable.deltaPct).toBe(0);
    expect(stable.legacyDirection).toBe("stable");
  });

  it("mapea todos los mercados extendidos: corners, asian_handicap, double_chance, dnb, clean_sheet, win_to_nil, 1x2, totals, btts", () => {
    expect(mapBzzoiroMarketQuote({ market: "total_corners", outcome: "over", line: 9.5 })).toEqual({
      market: "corners_total",
      line: 9.5,
      selection: "over",
    });
    expect(mapBzzoiroMarketQuote({ market: "total_corners_105", outcome: "under" })).toEqual({
      market: "corners_total",
      line: 10.5,
      selection: "under",
    });
    expect(mapBzzoiroMarketQuote({ market: "asian_handicap", outcome: "home", line: -1.5 })).toEqual({
      market: "ah",
      line: -1.5,
      selection: "home",
    });
    expect(mapBzzoiroMarketQuote({ market: "double_chance", outcome: "home_or_draw" })).toEqual({
      market: "double_chance",
      line: null,
      selection: "1X",
    });
    expect(mapBzzoiroMarketQuote({ market: "draw_no_bet", outcome: "away" })).toEqual({
      market: "dnb",
      line: null,
      selection: "away",
    });
    expect(mapBzzoiroMarketQuote({ market: "clean_sheet", outcome: "away_yes" })).toEqual({
      market: "clean_sheet_away",
      line: null,
      selection: "yes",
    });
    expect(mapBzzoiroMarketQuote({ market: "win_to_nil", outcome: "home_yes" })).toEqual({
      market: "win_to_nil_home",
      line: null,
      selection: "yes",
    });
    expect(mapBzzoiroMarketQuote({ market: "over_under_25", outcome: "over" })).toEqual({
      market: "totals",
      line: 2.5,
      selection: "over",
    });
    expect(mapBzzoiroMarketQuote({ market: "btts", outcome: "yes" })).toEqual({
      market: "btts",
      line: null,
      selection: "yes",
    });
  });

  it("parsea /events/{id}/odds/comparison/ en las 8 casas relevantes con STEAM coordinado y anclaje Spacetime fairOdds", () => {
    const rawComparison = {
      event_id: 987654321,
      comparisons: [
        {
          market: "1x2",
          outcome: "home",
          bookmakers: [
            { bookmaker_slug: "pinnacle", decimal_odds: 1.88, opening_odds: 1.98 },
            { bookmaker_slug: "bet365", decimal_odds: 1.9, opening_odds: 2.0 },
            { bookmaker_slug: "codere", decimal_odds: 1.86, opening_odds: 1.95 },
            { bookmaker_slug: "betcris", decimal_odds: 1.92, opening_odds: 2.02 },
            { bookmaker_slug: "draftkings", decimal_odds: 1.87, opening_odds: 1.96 },
            { bookmaker_slug: "fanduel", decimal_odds: 1.89, opening_odds: 1.99 },
            { bookmaker_slug: "betmgm", decimal_odds: 1.85, opening_odds: 1.95 },
            { bookmaker_slug: "caliente", decimal_odds: 1.91, opening_odds: 2.01 },
          ],
        },
        {
          market: "win_to_nil",
          outcome: "home_yes",
          bookmakers: [
            { bookmaker_slug: "bet365", decimal_odds: 3.1, opening_odds: 2.85 },
            { bookmaker_slug: "codere", decimal_odds: 3.0, opening_odds: 2.8 },
          ],
        },
      ],
    };

    const parsed = parseBzzoiroOddsComparison(rawComparison, {
      modelProbsByKey: {
        "1x2|null|home": 0.56,
        "win_to_nil_home|null|yes": 0.36,
      },
      priorityBooksOnly: true,
    });

    const homeRow = parsed.find((r) => r.market === "1x2" && r.selection === "home")!;
    expect(homeRow.books).toHaveLength(8);
    expect(homeRow.books.map((b) => b.bookLabel)).toEqual(
      expect.arrayContaining([
        "Pinnacle",
        "Bet365",
        "Codere",
        "Betcris",
        "DraftKings",
        "FanDuel",
        "BetMGM",
        "Caliente",
      ]),
    );
    expect(homeRow.bestBook).toBe("betcris");
    expect(homeRow.bestDecimal).toBe(1.92);
    expect(homeRow.pinnacleDecimal).toBe(1.88);
    expect(homeRow.signal).toBe("STEAM");
    expect(homeRow.fairOdds).toBeCloseTo(1 / 0.56, 2);
    expect(homeRow.evPct).toBeCloseTo((0.56 * 1.92 - 1) * 100, 1);

    const wtnRow = parsed.find((r) => r.market === "win_to_nil_home" && r.selection === "yes")!;
    expect(wtnRow.signal).toBe("DRIFTING");
    expect(wtnRow.bestBookLabel).toBe("Bet365");
    assertFd16Clean(parsed, ["987654321"]);
  });

  it("parsea /api/v2/odds/best/ en formato anidado y plano, y BzzoiroOddsAdapter consulta endpoints v2 con BZZOIRO_UNLIMITED=1", async () => {
    const nestedBest = {
      results: [
        {
          event_id: 987654321,
          home_team: "Arsenal",
          away_team: "Chelsea",
          event_date: "2026-11-22T16:30:00Z",
          market: "1x2",
          best_odds: {
            home: { bookmaker_slug: "pinnacle", decimal_odds: 1.82, opening_odds: 2.02 },
            draw: { bookmaker_slug: "betcris", decimal_odds: 3.7, opening_odds: 3.65 },
            away: { bookmaker_slug: "codere", decimal_odds: 4.5, opening_odds: 4.1 },
          },
        },
      ],
    };

    const bestParsed = parseBzzoiroBestOdds(nestedBest, {
      modelProbsByKey: { "1x2|null|home": 0.58 },
    });
    expect(bestParsed).toHaveLength(3);
    expect(bestParsed.find((b) => b.selection === "home")).toMatchObject({
      matchLabel: "Arsenal vs Chelsea",
      book: "pinnacle",
      signal: "STEAM",
      fairOdds: expect.any(Number),
      evPct: expect.any(Number),
    });
    assertFd16Clean(bestParsed, ["987654321"]);

    const calledPaths: string[] = [];
    const requester: HttpRequesterFn = async ({ url }) => {
      const u = new URL(url);
      calledPaths.push(`${u.pathname}${u.search}`);
      const body = u.pathname.includes("/odds/comparison/")
        ? {
            results: [
              { market: "total_corners", outcome: "over", line: 9.5, bookmaker_slug: "pinnacle", decimal_odds: 1.9, opening_odds: 2.05 },
            ],
          }
        : nestedBest;
      return { url, status: 200, headers: {}, bodyText: JSON.stringify(body), sha256: "" };
    };
    const adapter = new BzzoiroOddsAdapter({
      env: { BZZOIRO_API_KEY: "test-unlimited", BZZOIRO_UNLIMITED: "1" },
      transport: new CleanHttpTransport({ rateLimitRps: 1000, requester }),
    });

    const bestRows = await adapter.fetchBestOddsExtendedMarkets(["1x2", "total_corners"], {
      modelProbsByKey: { "1x2|null|home": 0.58 },
    });
    const compRows = await adapter.fetchEventOddsComparisonAnalyzed(987654321, {
      modelProbsByKey: { "corners_total|9.5|over": 0.56 },
    });
    expect(bestRows.length).toBeGreaterThan(0);
    expect(compRows[0]).toMatchObject({ market: "corners_total", line: 9.5, signal: "SHORTENING" });
    expect(calledPaths.some((p) => p.includes("/odds/best/?market=total_corners"))).toBe(true);
    expect(calledPaths.some((p) => p.includes("/events/987654321/odds/comparison/"))).toBe(true);
    assertFd16Clean(compRows, ["987654321"]);
  });

  it("parseBzzoiroOdds mantiene compatibilidad y valida win_to_nil_home y total_corners en snapshot rows", () => {
    const capturedAtIso = "2026-11-18T18:00:00Z";
    const events: BzOddsEvent[] = [
      { id: 101, home_team: "Arsenal", away_team: "Chelsea", event_date: "2026-11-22T16:30:00Z", status: "notstarted" },
    ];
    const rows: BzOddsRow[] = [
      { market: "win_to_nil", outcome: "home_yes", bookmaker_slug: "bet365", decimal_odds: 2.8, opening_odds: 3.1 },
      { market: "win_to_nil", outcome: "home_no", bookmaker_slug: "bet365", decimal_odds: 1.45, opening_odds: 1.38 },
      { market: "total_corners", outcome: "over", line: 10.5, bookmaker_slug: "pinnacle", decimal_odds: 2.05 },
      { market: "total_corners", outcome: "under", line: 10.5, bookmaker_slug: "pinnacle", decimal_odds: 1.82 },
    ];
    const accepted = parseBzzoiroOdds({
      events,
      oddsByEvent: new Map([[101, rows]]),
      appLeague: "premier-league",
      capturedAtIso,
      nowMs: Date.parse(capturedAtIso),
    });
    expect(accepted.filter((r) => r.market === "win_to_nil_home")).toHaveLength(2);
    expect(accepted.find((r) => r.market === "win_to_nil_home" && r.selection === "yes")?.movement_direction).toBe("shortening");
    expect(accepted.filter((r) => r.market === "corners_total")).toHaveLength(2);
  });
});

describe("Bzzoiro Unlimited · 3. Árbitros, alineaciones, disponibilidad, H2H y TV MX", () => {
  it("normaliza rigor arbitral bayesiano (tarjetas/faltas/rojas y tier) e inyecta refereeStats en MatchContext", () => {
    const strictRef = parseBzzoiroRefereeProfile({
      id: 987654321,
      name: "César Arturo Ramos",
      country: "México",
      matches: 40,
      avg_yellow_per_match: 5.5,
      avg_red_per_match: 0.35,
      avg_fouls_per_match: 27.4,
      avg_goals_per_match: 2.6,
    });
    expect(strictRef).toMatchObject({
      name: "César Arturo Ramos",
      country: "México",
      matches: 40,
      avgYellow: 5.5,
      avgRed: 0.35,
      avgCardsTotal: 5.85,
      avgFouls: 27.4,
      rigorTier: "estricto",
    });
    expect(strictRef!.cardsMultiplier).toBeGreaterThan(1.15);
    expect(strictRef!.foulsMultiplier).toBeGreaterThan(1.08);
    assertFd16Clean(strictRef, ["987654321"]);

    // Muestra pequeña con totales crudos: el encogimiento bayesiano evita extremos exagerados
    const smallSample = parseBzzoiroRefereeProfile({
      name: "Árbitro Novato",
      matches: 2,
      yellow_cards: 14, // 7 por partido en solo 2 juegos
      red_cards: 0,
      fouls: 46,
    });
    expect(smallSample?.avgYellow).toBe(7);
    expect(smallSample!.cardsMultiplier).toBeLessThan(1.15);

    const ctx = parseBzzoiroMatchContext(
      {
        id: 987654321,
        league_id: 19,
        season_id: 1,
        home_team_id: 1,
        home_team: "América",
        away_team_id: 2,
        away_team: "Guadalajara",
        event_date: "2026-11-22T02:00:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        is_local_derby: true,
      },
      {
        results: [
          { channel: "TUDN", country_code: "MX", url: "https://sports.bzzoiro.com/tv/1" },
          { channel: "tudn", country_code: "MX" },
          { channel: "ViX+", country_code: "MX" },
          { channel: "Sky Sports UK", country_code: "GB" },
        ],
      },
      {
        id: 987654321,
        name: "César Arturo Ramos",
        matches: 40,
        avg_yellow_per_match: 5.5,
        avg_fouls_per_match: 27.4,
      },
    );
    expect(ctx?.referee).toBe("César Arturo Ramos");
    expect(ctx?.refereeStats?.avgYellow).toBe(5.5);
    expect(ctx?.broadcastsMx).toEqual(["TUDN", "ViX+"]);
    assertFd16Clean(ctx, ["987654321"]);
  });

  it("normaliza alineaciones confirmed | probable con internalConfidence sin exponer 'Confianza N' ni IDs", () => {
    const xi = Array.from({ length: 11 }, (_, i) => ({
      id: 88776655 + i,
      name: `Titular ${i + 1}`,
      position: i === 0 ? "GK" : "MF",
      shirt_number: i + 1,
    }));

    const probable = parseBzzoiroLineupNormalized(
      {
        event_id: 987654321,
        lineup_status: "predicted",
        confidence: 86,
        lineups: {
          home: { formation: "4-3-3", players: xi },
          away: { formation: "4-4-2", players: xi },
        },
      },
      "2026-11-20T15:00:00Z",
    );
    expect(probable.status).toBe("probable");
    expect(probable.internalConfidence).toBe(0.86);
    expect(probable.home.starters).toHaveLength(11);
    assertFd16Clean(probable, ["987654321", "88776655"]);

    const confirmed = parseBzzoiroLineupNormalized(
      {
        event_id: 987654321,
        lineup_status: "confirmed",
        lineups: {
          home: { formation: "4-2-3-1", players: xi },
          away: { formation: "3-5-2", players: xi },
        },
      },
      "2026-11-20T18:00:00Z",
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.internalConfidence).toBe(1);
    assertFd16Clean(confirmed, ["987654321", "88776655"]);
  });

  it("parsea availability real, H2H con inversión de localía y broadcasts MX deduplicados", async () => {
    const avail = parseBzzoiroEventAvailability({
      home: [
        { player_id: 88776655, name: "Rodri", position: "CDM", availability: "injured", injury_type: "Ligamento cruzado", expected_return: "2027-01-10", is_starter: true },
        { player_id: 88776656, name: "Erling Haaland", position: "ST", availability: "available" },
      ],
      away: [
        { player_id: 77665544, name: "Bruno Fernandes", position: "AM", status: "suspended" },
        { player_id: 77665545, name: "Luke Shaw", position: "LB", status: "doubtful", reason: "Tobillo" },
      ],
    });
    expect(avail.home).toHaveLength(1);
    expect(avail.home[0]).toMatchObject({ playerName: "Rodri", status: "Baja", category: "injured", returnDate: "2027-01-10", isStarter: true });
    expect(avail.away).toHaveLength(2);
    expect(avail.away[0]).toMatchObject({ playerName: "Bruno Fernandes", status: "Baja", category: "suspended" });
    expect(avail.away[1]).toMatchObject({ playerName: "Luke Shaw", status: "Duda", category: "doubtful" });
    assertFd16Clean(avail, ["88776655", "77665544"]);

    const h2h = parseBzzoiroH2h(
      {
        matches: [
          { event_id: 987654321, event_date: "2026-04-12T15:00:00Z", home_team: "Arsenal", away_team: "Chelsea", home_score: 2, away_score: 1, league: "Premier League" },
          { event_id: 987654322, event_date: "2025-11-10T16:30:00Z", home_team: "Chelsea", away_team: "Arsenal", home_score: 1, away_score: 3, league: "Premier League" },
          { event_id: 987654323, event_date: "2025-03-02T14:00:00Z", home_team: "Chelsea", away_team: "Arsenal", home_score: 1, away_score: 1 },
        ],
      },
      { homeTeamName: "Arsenal", awayTeamName: "Chelsea" },
    );
    expect(h2h.totalMatches).toBe(3);
    expect(h2h.homeWins).toBe(2); // Arsenal ganó tanto de local (2-1) como de visita (1-3)
    expect(h2h.draws).toBe(1);
    expect(h2h.awayWins).toBe(0);
    expect(h2h.avgTotalGoals).toBe(3);
    expect(h2h.bttsRate).toBe(1);
    expect(h2h.over25Rate).toBeCloseTo(2 / 3, 2);
    assertFd16Clean(h2h, ["987654321", "987654322"]);

    expect(
      parseBroadcastsMx({
        results: [
          { channel: "Fox Sports", country_code: "MX" },
          { channel: "fox sports", country_code: "MX" },
          { channel: "https://evil.example/stream", country_code: "MX" },
          { channel: "ESPN+", country_code: "US" },
        ],
      }),
    ).toEqual(["Fox Sports"]);

    const { client, calls } = createMockProviderClient({
      "/events/555/": {
        id: 555,
        league_id: 1,
        season_id: 1,
        home_team_id: 1,
        home_team: "Arsenal",
        away_team_id: 2,
        away_team: "Chelsea",
        event_date: "2026-11-22T16:30:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        referee_id: 77,
      },
      "/referees/77/": { id: 77, name: "Anthony Taylor", matches: 30, avg_yellow_per_match: 4.9, avg_fouls_per_match: 24.5 },
      "/events/555/lineups/": { event_id: 555, lineup_status: "unavailable" },
      "/events/555/availability/": { home: [], away: [] },
      "/events/555/h2h/": { matches: [] },
      "/events/555/broadcasts/?country_code=MX": { results: [{ channel: "Max", country_code: "MX" }] },
    });
    const bundle = await fetchBzzoiroFullPreMatchBundle(client, { providerEventId: 555 });
    expect(bundle.referee?.name).toBe("Anthony Taylor");
    expect(bundle.broadcastsMx).toEqual(["Max"]);
    expect(calls).toContain("/events/555/broadcasts/?country_code=MX");
    expect(calls).toContain("/referees/77/");
    assertFd16Clean(bundle, ["555", "77"]);
  });
});

describe("Bzzoiro Unlimited · 4. NBA /basketball/api/v2/ (odds, box-score, player-games, pregame y guardia minMinutes)", () => {
  it("parsea pregame NBA con oficiales, descanso, B2B y bajas reales sin filtrar IDs", () => {
    const pregame = parseBzzoiroNbaPregame({
      event_id: 987654321,
      officials: [{ id: 111, name: "Scott Foster" }, { name: "Tony Brothers" }],
      rest_days: { home: 2, away: 0 },
      injuries: {
        home: [
          { player_id: 88776655, name: "Kristaps Porzingis", position: "C", status: "Out", injury_type: "Tobillo derecho", expected_return: "2026-12-01" },
          { player_id: 88776656, name: "Jaylen Brown", position: "SG", status: "Questionable", reason: "Cadera" },
          { player_id: 88776657, name: "Jayson Tatum", position: "SF", status: "Probable" },
        ],
        away: [
          { player_id: 77665544, name: "Jimmy Butler", position: "SF", status: "Doubtful", injury: "Rodilla" },
        ],
      },
      projected_pace: 99.8,
      expected_total: 223.5,
      notes: ["Miami en segundo partido de back-to-back https://sports.bzzoiro.com/nba/1"],
    });

    expect(pregame).toMatchObject({
      officials: ["Scott Foster", "Tony Brothers"],
      restDays: { home: 2, away: 0 },
      backToBack: { home: false, away: true },
      projectedPace: 99.8,
      expectedTotal: 223.5,
    });
    expect(pregame?.injuries.home).toHaveLength(2);
    expect(pregame?.injuries.home[0]).toMatchObject({ playerName: "Kristaps Porzingis", status: "Baja", rawStatus: "out", returnDate: "2026-12-01" });
    expect(pregame?.injuries.home[1]).toMatchObject({ playerName: "Jaylen Brown", status: "Duda", rawStatus: "questionable" });
    expect(pregame?.injuries.away[0]).toMatchObject({ playerName: "Jimmy Butler", status: "Duda", rawStatus: "doubtful" });
    assertFd16Clean(pregame, ["987654321", "88776655", "77665544"]);
  });

  it("parsea box-score NBA por equipo y por jugador con minutos MM:SS y comparativa NBA con STEAM", () => {
    expect(parseNbaMinutes("36:30")).toBe(36.5);
    expect(parseNbaMinutes(29.4)).toBe(29.4);
    expect(parseNbaMinutes("invalid")).toBeNull();

    const detail = parseBzzoiroNbaBoxScoreDetail({
      team_stats: {
        home: { fg_pct: 50.4, three_pt_pct: 41.2, rebounds: 45, assists: 29, pace: 100.1, offensive_rating: 121.4 },
        away: { fg_pct: 44.8, rebounds: 38, turnovers: 14, defensive_rating: 118.2 },
      },
      players: {
        home: [
          {
            player_id: 88776655,
            player: { id: 88776655, name: "Jayson Tatum", position: "SF" },
            starter: true,
            minutes: "37:30",
            points: 32,
            rebounds: 9,
            assists: 6,
            three_pointers_made: 5,
            plus_minus: 14,
            photo_url: "https://sports.bzzoiro.com/img/basketball/player/88776655/",
          },
        ],
        away: [
          {
            player_id: 77665544,
            player_name: "Bam Adebayo",
            position: "C",
            is_starter: true,
            minutes: 34,
            pts: 21,
            reb: 11,
            ast: 4,
          },
        ],
      },
    });
    expect(detail.teamMetrics?.home.offRating).toBe(121.4);
    expect(detail.players.home[0]).toMatchObject({ playerName: "Jayson Tatum", minutes: 37.5, points: 32, starter: true });
    expect(detail.players.away[0]).toMatchObject({ playerName: "Bam Adebayo", minutes: 34, rebounds: 11 });
    assertFd16Clean(detail, ["88776655", "77665544"]);

    const nbaComp = parseBzzoiroNbaOddsComparison(
      [
        { market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.5, opening_odds: 1.66 },
        { market: "moneyline", outcome: "home", bookmaker_slug: "draftkings", decimal_odds: 1.54, opening_odds: 1.68 },
        { market: "moneyline", outcome: "home", bookmaker_slug: "fanduel", decimal_odds: 1.52, opening_odds: 1.67 },
        { market: "totals", outcome: "over", line: 224.5, bookmaker_slug: "betmgm", decimal_odds: 1.95, opening_odds: 1.88 },
      ],
      { modelProbsByKey: { "moneyline|null|home": 0.68 } },
    );
    const mlHome = nbaComp.find((c) => c.market === "moneyline" && c.selection === "home")!;
    expect(mlHome.signal).toBe("STEAM");
    expect(mlHome.bestBook).toBe("draftkings");
    expect(mlHome.fairOdds).toBeCloseTo(1 / 0.68, 2);
    expect(nbaComp.find((c) => c.market === "totals")?.signal).toBe("DRIFTING");
    assertFd16Clean(nbaComp);
  });

  it("aplica estrictamente la guardia minMinutes y bloquea props de jugadores con baja real (Out/Injured)", () => {
    const rawGames = [
      { id: 1, event_id: 987654321, game_date: "2026-11-18", opponent: "Heat", minutes: "35:00", points: 30, rebounds: 8, assists: 6, three_pointers_made: 4 },
      { id: 2, event_id: 987654322, game_date: "2026-11-16", opponent: "Knicks", minutes: "06:00", points: 2, rebounds: 1, assists: 0, three_pointers_made: 0 }, // salida temprana por lesión: excluido
      { id: 3, event_id: 987654323, game_date: "2026-11-14", opponent: "76ers", minutes: 34, points: 28, rebounds: 9, assists: 5, three_pointers_made: 3 },
      { id: 4, event_id: 987654324, game_date: "2026-11-12", opponent: "Bucks", minutes: 36, points: 33, rebounds: 10, assists: 7, three_pointers_made: 5 },
    ];

    const normalizedGames = parseBzzoiroNbaPlayerGames(rawGames);
    expect(normalizedGames).toHaveLength(4);
    expect(normalizedGames[0]?.minutes).toBe(35);
    assertFd16Clean(normalizedGames, ["987654321", "987654322"]);

    // Con guardia minMinutes=18, el juego de 6 minutos se excluye y el promedio real de puntos es (30+28+33)/3 = 30.33
    const starterSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Jayson Tatum",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      position: "SF",
      games: rawGames,
      minMinutes: 18,
    });
    const ptsSeed = starterSeeds.find((s) => s.statKey === "pts")!;
    expect(ptsSeed.sampleGames).toBe(3);
    expect(ptsSeed.last10).toEqual([30, 28, 33]);
    expect(ptsSeed.projectionMean).toBeCloseTo(30.33, 2);
    expect(ptsSeed.avgMinutes).toBe(35);
    assertFd16Clean(starterSeeds);

    // Jugador de banca con < 18 min en sus partidos: debe devolver []
    const benchSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Suplente NBA",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: [
        { minutes: 11, points: 6, rebounds: 2, assists: 1 },
        { minutes: 14, points: 8, rebounds: 3, assists: 2 },
        { minutes: 9, points: 4, rebounds: 1, assists: 1 },
        { minutes: 12, points: 5, rebounds: 2, assists: 1 },
      ],
      minMinutes: 18,
    });
    expect(benchSeeds).toEqual([]);

    // Jugador titular pero reportado Out / Baja real: debe devolver []
    const injuredSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Kristaps Porzingis",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: rawGames,
      minMinutes: 18,
      availabilityStatus: "out",
    });
    expect(injuredSeeds).toEqual([]);
  });

  it("fetchers NBA consultan rutas exactas de /basketball/api/v2/ (box-score, pregame, odds)", async () => {
    const { client, calls } = createMockProviderClient({
      "/basketball/api/v2/events/880/box-score/": {
        home: { fg_pct: 48.5, rebounds: 44 },
        away: { fg_pct: 45.0, rebounds: 40 },
      },
      "/basketball/api/v2/events/880/pregame/": {
        officials: ["Marc Davis"],
        rest_days: { home: 1, away: 2 },
      },
      "/basketball/api/v2/events/880/odds/": {
        results: [{ market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.75, opening_odds: 1.85 }],
      },
    });

    const box = await fetchBzzoiroNbaBoxScore(client, 880);
    const pre = await fetchBzzoiroNbaPregame(client, 880);
    const odds = await fetchBzzoiroNbaOdds(client, {
      providerEventId: 880,
      homeTeamRaw: "Boston Celtics",
      awayTeamRaw: "Miami Heat",
      kickoffUtc: "2026-11-22T00:30:00Z",
      capturedAtUtc: "2026-11-21T18:00:00Z",
    });

    expect(calls).toEqual([
      "/basketball/api/v2/events/880/box-score/",
      "/basketball/api/v2/events/880/pregame/",
      "/basketball/api/v2/events/880/odds/",
    ]);
    expect(box.teamMetrics?.home.fgPct).toBe(48.5);
    expect(pre?.officials).toEqual(["Marc Davis"]);
    expect(odds.snapshotRows).toHaveLength(1);
    expect(odds.comparison[0]?.signal).toBe("SHORTENING");
    assertFd16Clean({ box, pre, comparison: odds.comparison }, ["880"]);
  });
});
