import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  annotateBestOddsBySelection,
  BzzoiroOddsAdapter,
  classifyLineMovement,
  mapBzzoiroMarketQuote,
  parseBzzoiroBestOdds,
  parseBzzoiroOdds,
  parseBzzoiroOddsComparison,
  PRIORITY_COMPARISON_BOOKS,
  type BzOddsEvent,
  type BzOddsRow,
} from "../src/odds/bzzoiro-odds.js";
import {
  CleanHttpTransport,
  MissingCredentialsError,
  OddsSourceError,
  type HttpRequesterFn,
} from "../src/odds/legal-registry.js";
import {
  fetchBzzoiroEventAvailability,
  fetchBzzoiroEventBroadcastsMx,
  fetchBzzoiroEventH2h,
  fetchBzzoiroEventLineups,
  fetchBzzoiroFullPreMatchBundle,
  fetchBzzoiroMatchTelemetry,
  fetchBzzoiroRefereeProfile,
  fetchBzzoiroSquadInjuries,
  parseBzzoiroEventAvailability,
  parseBzzoiroH2h,
  parseBzzoiroLineupNormalized,
  parseBzzoiroLineupsToProjection,
  parseBzzoiroMatchContext,
  parseBzzoiroRefereeProfile,
} from "../src/providers/bzzoiro-enrichment.js";
import {
  extractBzzoiroMatchTelemetry,
  normalizeShotBodyPart,
  normalizeShotOutcome,
  parseBroadcastsMx,
  parseBzzoiroAveragePositions,
  parseBzzoiroShotmap,
  type BzLiveStats,
} from "../src/providers/bzzoiro-live.js";
import {
  buildGuardedNbaPlayerPropSeeds,
  buildNbaPlayerPropSeeds,
  DEFAULT_NBA_PROP_MIN_MINUTES,
  fetchBzzoiroNbaBoxScore,
  fetchBzzoiroNbaOdds,
  fetchBzzoiroNbaPlayerGames,
  fetchBzzoiroNbaPregame,
  fetchBzzoiroNbaStandings,
  parseBzzoiroNbaBoxScoreDetail,
  parseBzzoiroNbaOdds,
  parseBzzoiroNbaOddsComparison,
  parseBzzoiroNbaPlayerGames,
  parseBzzoiroNbaPregame,
  parseBzzoiroNbaStandings,
  parseNbaMinutes,
} from "../src/providers/bzzoiro-nba-rich.js";
import type { ProviderClient } from "../src/providers/http.js";

const LIVE_FIX = join(import.meta.dirname, "fixtures", "bzzoiro-live");
const REAL_STATS_FIXTURE = JSON.parse(readFileSync(join(LIVE_FIX, "stats.json"), "utf8")) as BzLiveStats;

const FORBIDDEN_FD16_KEYS = new Set([
  "externalid",
  "external_id",
  "providerid",
  "provider_id",
  "providereventid",
  "provider_event_id",
  "providermatchid",
  "provider_match_id",
  "providerplayerid",
  "provider_player_id",
  "providerteamid",
  "provider_team_id",
  "providerleagueid",
  "provider_league_id",
  "player_id",
  "playerid",
  "team_id",
  "referee_id",
  "refereeid",
  "event_id",
  "eventid",
  "game_id",
  "bookmaker_id",
  "bookmakerid",
  "venue_id",
  "venueid",
  "league_id",
  "leagueid",
  "season_id",
  "seasonid",
  "coach_id",
  "coachid",
  "manager_id",
  "managerid",
  "bzzoiroid",
  "bzzoiro_id",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "authorization",
  "photo_url",
  "photourl",
  "image_url",
  "imageurl",
  "logo_url",
  "logourl",
  "crest_url",
  "badge_url",
  "avatar_url",
  "home_team_logo",
  "away_team_logo",
  "league_logo",
  "url",
  "href",
]);

const FORBIDDEN_FD16_VALUE_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  { label: "hotlink http(s)://", re: /https?:\/\//i },
  { label: "hotlink www.", re: /\bwww\./i },
  { label: "hotlink protocol-relative", re: /\/\/[a-z0-9.-]+\.[a-z]{2,}/i },
  { label: "dominio bzzoiro.com", re: /bzzoiro\.com/i },
  { label: "dominio espncdn", re: /espncdn/i },
  { label: "credencial api_key", re: /api[_-]?key/i },
  { label: "cabecera Token", re: /\bToken\s+[A-Za-z0-9_-]{6,}/i },
  { label: "etiqueta prohibida ADR-054 Confianza N", re: /Confianza\s+\d/i },
];

function walkFd16Violations(
  node: unknown,
  path: string,
  sentinelTokens: readonly string[],
  out: string[],
): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    for (const rule of FORBIDDEN_FD16_VALUE_PATTERNS) {
      if (rule.re.test(node)) {
        out.push(`${path}: valor viola ${rule.label} (${node})`);
      }
    }
    for (const token of sentinelTokens) {
      if (node.includes(token)) {
        out.push(`${path}: expone token centinela '${token}'`);
      }
    }
    return;
  }
  if (typeof node === "number") {
    const asStr = String(node);
    for (const token of sentinelTokens) {
      if (asStr === token) {
        out.push(`${path}: expone ID numérico centinela '${token}'`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkFd16Violations(node[i], `${path}[${i}]`, sentinelTokens, out);
    }
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = `${path}.${k}`;
      if (FORBIDDEN_FD16_KEYS.has(k.toLowerCase())) {
        out.push(`${nextPath}: llave prohibida FD-16 '${k}'`);
      }
      walkFd16Violations(v, nextPath, sentinelTokens, out);
    }
  }
}

function assertFd16Clean(payload: unknown, sentinelTokens: readonly string[] = []): void {
  const violations: string[] = [];
  walkFd16Violations(payload, "$", sentinelTokens, violations);
  expect(violations, `Violaciones FD-16:\n${violations.join("\n")}`).toEqual([]);
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

  it("normaliza todos los alias de outcome (gol/atajada/poste/bloqueado/desviado) y parte del cuerpo", () => {
    expect(normalizeShotOutcome("goal")).toBe("goal");
    expect(normalizeShotOutcome("own_goal")).toBe("goal");
    expect(normalizeShotOutcome("penalty_goal")).toBe("goal");
    expect(normalizeShotOutcome("scored")).toBe("goal");
    expect(normalizeShotOutcome("Own-Goal")).toBe("goal");

    expect(normalizeShotOutcome("save")).toBe("saved");
    expect(normalizeShotOutcome("saved")).toBe("saved");
    expect(normalizeShotOutcome("attempt_saved")).toBe("saved");
    expect(normalizeShotOutcome("on_target")).toBe("saved");

    expect(normalizeShotOutcome("block")).toBe("blocked");
    expect(normalizeShotOutcome("blocked")).toBe("blocked");
    expect(normalizeShotOutcome("blocked_shot")).toBe("blocked");

    expect(normalizeShotOutcome("post")).toBe("post");
    expect(normalizeShotOutcome("woodwork")).toBe("post");
    expect(normalizeShotOutcome("hit_woodwork")).toBe("post");
    expect(normalizeShotOutcome("crossbar")).toBe("post");

    expect(normalizeShotOutcome("miss")).toBe("miss");
    expect(normalizeShotOutcome("missed")).toBe("miss");
    expect(normalizeShotOutcome("off_target")).toBe("miss");
    expect(normalizeShotOutcome("wide")).toBe("miss");
    expect(normalizeShotOutcome("high")).toBe("miss");
    expect(normalizeShotOutcome("wayward")).toBe("miss");

    expect(normalizeShotOutcome("")).toBeNull();
    expect(normalizeShotOutcome(null)).toBeNull();
    expect(normalizeShotOutcome(undefined)).toBeNull();
    expect(normalizeShotOutcome("foul")).toBeNull();

    expect(normalizeShotBodyPart("right_foot")).toBe("right_foot");
    expect(normalizeShotBodyPart("pie_derecho")).toBe("right_foot");
    expect(normalizeShotBodyPart("left")).toBe("left_foot");
    expect(normalizeShotBodyPart("pie_izquierdo")).toBe("left_foot");
    expect(normalizeShotBodyPart("header")).toBe("head");
    expect(normalizeShotBodyPart("cabeza")).toBe("head");
    expect(normalizeShotBodyPart("chest")).toBe("other");
    expect(normalizeShotBodyPart("otro")).toBe("other");
    expect(normalizeShotBodyPart("knee")).toBeUndefined();
    expect(normalizeShotBodyPart(null)).toBeUndefined();
  });

  it("maneja payloads vacíos o incompletos de shotmap/xG, acota coordenadas, agrega xG del mismo minuto y cae a player-stats", () => {
    const emptyExpected = {
      shots: [],
      xgHome: 0,
      xgAway: 0,
      xgEstimated: null,
      shotsHome: 0,
      shotsAway: 0,
      xgTimeline: [],
    };
    expect(parseBzzoiroShotmap(null)).toEqual(emptyExpected);
    expect(parseBzzoiroShotmap(undefined)).toEqual(emptyExpected);
    expect(parseBzzoiroShotmap({})).toEqual(emptyExpected);

    const noisy: BzLiveStats = {
      event_id: 987654321,
      xg_estimated: true,
      shots: [
        { minute: "45", added_time: 3, side: "away", result: "crossbar", x: "108.5", y: "-5", xG: "0.22", body_part: "left_foot" },
        { minute: 45, added_time: 1, side: "local", type: "penalty_goal", position: { x: 88, y: 50 }, xg: 0.76, part: "pie_derecho", shooter: { name: "André-Pierre Gignac" } },
        { time: 45, added_time: 1, team: "home", shot_type: "on_target", coordinates: { x: 91.2, y: 46.8 }, xg: 0.12, playerName: "Sebastián Córdova" },
        { min: 145, home: false, outcome: "wayward", x: 75, y: 30, xg: 1.85 },
        { min: 12, home: true, outcome: "miss", x: 80, y: 60, xg: -0.3 },
        { min: -2, home: true, outcome: "goal", x: 90, y: 50, xg: 0.4 },
        { min: 20, side: "neutral", outcome: "goal", x: 90, y: 50, xg: 0.4 },
        { min: 22, home: true, outcome: "pass", x: 90, y: 50, xg: 0.4 },
      ],
    };

    const parsed = parseBzzoiroShotmap(noisy);
    expect(parsed.xgEstimated).toBe(true);
    expect(parsed.shots).toHaveLength(5);
    expect(parsed.shots.map((s) => `${s.minute}${s.addedTime ? `+${s.addedTime}` : ""}:${s.side}:${s.outcome}`)).toEqual([
      "12:home:miss",
      "45+1:home:goal",
      "45+1:home:saved",
      "45+3:away:post",
      "130:away:miss",
    ]);
    expect(parsed.shots[3]).toMatchObject({ x: 100, y: 0, xg: 0.22, bodyPart: "left_foot", playerName: "Jugador visitante" });
    expect(parsed.shots[0]?.xg).toBe(0);
    expect(parsed.shots[4]?.xg).toBe(0);
    expect(parsed.xgHome).toBe(0.88);
    expect(parsed.xgAway).toBe(0.22);
    expect(parsed.shotsHome).toBe(3);
    expect(parsed.shotsAway).toBe(2);
    expect(parsed.xgTimeline).toEqual([
      { minute: 12, xgHome: 0, xgAway: 0, cumHome: 0, cumAway: 0 },
      { minute: 45, xgHome: 0.88, xgAway: 0.22, cumHome: 0.88, cumAway: 0.22 },
      { minute: 130, xgHome: 0, xgAway: 0, cumHome: 0.88, cumAway: 0.22 },
    ]);
    assertFd16Clean(parsed, ["987654321"]);

    // xg_per_minute solo con incrementales (sin acumulados) y desordenado
    const incOnly = parseBzzoiroShotmap({
      xg_per_minute: [
        { minute: 30, xg_home: 0.25, xg_away: 0.1 },
        { m: 10, xg_home: 0.4, xg_away: 0 },
      ],
    });
    expect(incOnly.xgTimeline).toEqual([
      { minute: 10, xgHome: 0.4, xgAway: 0, cumHome: 0.4, cumAway: 0 },
      { minute: 30, xgHome: 0.25, xgAway: 0.1, cumHome: 0.65, cumAway: 0.1 },
    ]);
    expect(incOnly.xgHome).toBe(0.65);
    expect(incOnly.xgAway).toBe(0.1);

    // xg_per_minute solo con acumulados (sin incrementales)
    const cumOnly = parseBzzoiroShotmap({
      xg_per_minute: [
        { m: 15, cum_home: 0.3, cum_away: 0.05 },
        { m: 50, cum_home: 0.85, cum_away: 0.45 },
      ],
    });
    expect(cumOnly.xgTimeline).toEqual([
      { minute: 15, xgHome: 0.3, xgAway: 0.05, cumHome: 0.3, cumAway: 0.05 },
      { minute: 50, xgHome: 0.55, xgAway: 0.4, cumHome: 0.85, cumAway: 0.45 },
    ]);

    // Fallback de xG total desde player-stats cuando stats y shotmap vienen vacíos
    const fromPlayers = parseBzzoiroShotmap(
      {},
      {
        home: [
          { player: "Jugador Local 1", xg: 0.42 },
          { player: "Jugador Local 2", expected_goals: 0.28 },
        ],
        away: [{ player: "Jugador Visita 1", xg: 0.51 }],
      },
    );
    expect(fromPlayers.xgHome).toBe(0.7);
    expect(fromPlayers.xgAway).toBe(0.51);
    expect(fromPlayers.shots).toEqual([]);
    assertFd16Clean(fromPlayers);
  });

  it("normaliza alineación completa 11 vs 11 en averagePositions con escala 0..1, deduplicación y fallback seguro", () => {
    const homeRaw = Array.from({ length: 11 }, (_, i) => ({
      player_id: 881000 + i,
      external_id: `ext-h-${881000 + i}`,
      player: { id: 881000 + i, name: `Local ${i + 1}`, shirt_number: i + 1 },
      position: i === 0 ? "GK" : i <= 4 ? "DF" : i <= 8 ? "MF" : "FW",
      average_x: Number((0.1 + i * 0.075).toFixed(3)),
      average_y: Number((0.15 + (i % 5) * 0.175).toFixed(3)),
      touches: 30 + i * 4,
      photo_url: `https://sports.bzzoiro.com/img/player/${881000 + i}/`,
    }));
    const awayRaw = Array.from({ length: 11 }, (_, i) => ({
      player_id: 771000 + i,
      external_id: `ext-a-${771000 + i}`,
      player: { id: 771000 + i, name: `Visita ${i + 1}`, shirt_number: i + 1 },
      position: i === 0 ? "GK" : i <= 4 ? "DF" : i <= 8 ? "MF" : "FW",
      average_x: Number((0.12 + i * 0.072).toFixed(3)),
      average_y: Number((0.14 + (i % 5) * 0.17).toFixed(3)),
      touches: 25 + i * 3,
      image_url: `https://a.espncdn.com/i/headshots/soccer/${771000 + i}.png`,
    }));

    const full11 = parseBzzoiroAveragePositions(
      { event_id: 987654321, average_positions: { home: homeRaw, away: awayRaw } },
      {
        home: [
          // Solapado con average_positions: enriquece rating sin duplicar el jugador
          { player_id: 881010, player: { id: 881010, name: "Local 11" }, position: "ST", rating: 8.4, avg_x: 0.85, avg_y: 0.15 },
        ],
        away: [
          { player_id: 771000, player: { id: 771000, name: "Visita 1" }, position: "GK", rating: 7.2, avg_x: 0.12, avg_y: 0.14 },
        ],
      },
    );

    expect(full11.home).toHaveLength(11);
    expect(full11.away).toHaveLength(11);
    expect(full11.home[0]).toMatchObject({ playerName: "Local 11", jerseyNumber: 11, x: 85, y: 15, touches: 70, rating: 8.4 });
    expect(full11.away[0]).toMatchObject({ playerName: "Visita 11", jerseyNumber: 11, x: 84, y: 14, touches: 55 });
    expect(full11.away.at(-1)).toMatchObject({ playerName: "Visita 1", jerseyNumber: 1, x: 12, y: 14, touches: 25, rating: 7.2 });
    expect([...full11.home, ...full11.away].every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)).toBe(true);
    assertFd16Clean(full11, ["987654321", "881000", "881010", "771000", "ext-h-881000", "ext-a-771000"]);

    // Fallbacks seguros con payloads vacíos, nulos y contenedores alternos (`averagePositions` / `positions`)
    expect(parseBzzoiroAveragePositions(null)).toEqual({ home: [], away: [] });
    expect(parseBzzoiroAveragePositions(undefined)).toEqual({ home: [], away: [] });
    expect(parseBzzoiroAveragePositions({})).toEqual({ home: [], away: [] });

    const altContainer = parseBzzoiroAveragePositions({
      averagePositions: {
        results: [
          { player_name: "Sin Coords", is_home: true },
          { x: 50, y: 50, is_home: true },
          { player_name: "Defensa Local", side: "local", x: -8, y: 115, jersey_number: 0, touches: -4, rating: 11.5 },
          { player_name: "Extremo Visita", side: "visita", average_position: { x: 72.5, y: 20.4 }, number: 105, ball_touches: 42 },
        ],
      },
    });
    expect(altContainer.home).toEqual([
      { x: 0, y: 100, playerName: "Defensa Local", jerseyNumber: null, position: "N/D", touches: 0 },
    ]);
    expect(altContainer.away).toEqual([
      { x: 72.5, y: 20.4, playerName: "Extremo Visita", jerseyNumber: null, position: "N/D", touches: 42 },
    ]);

    const positionsArray = parseBzzoiroAveragePositions({
      positions: [
        { name: "Capitán Local", home: true, pos: { x: 55, y: 45 }, shirt_number: 4, position: "CB", points_count: 61 },
      ],
    });
    expect(positionsArray.home).toEqual([
      { x: 55, y: 45, playerName: "Capitán Local", jerseyNumber: 4, position: "CB", touches: 61 },
    ]);

    const onlyFromPlayerStats = parseBzzoiroAveragePositions(null, [
      { player_name: "Mediocampista Fallback", is_home: false, avg_x: 48, avg_y: 52, shirt_number: 6, position: "CM", touches: 50, rating: 7.7 },
    ]);
    expect(onlyFromPlayerStats.home).toEqual([]);
    expect(onlyFromPlayerStats.away).toEqual([
      { x: 48, y: 52, playerName: "Mediocampista Fallback", jerseyNumber: 6, position: "CM", touches: 50, rating: 7.7 },
    ]);
    assertFd16Clean({ altContainer, positionsArray, onlyFromPlayerStats });
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
      modelProbsByKey: {
        "1x2|null|home": 0.58,
        "1x2|null|draw": 0.24,
        "1x2|null|away": 0.18,
      },
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

    // Licencia Bzzoiro v4.0: las selecciones sin probabilidad Spacetime válida se descartan por defecto.
    const partialBestParsed = parseBzzoiroBestOdds(nestedBest, {
      modelProbsByKey: { "1x2|null|home": 0.58 },
    });
    expect(partialBestParsed).toHaveLength(1);
    expect(partialBestParsed[0]?.selection).toBe("home");
    expect(parseBzzoiroBestOdds(nestedBest)).toEqual([]);

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

  it("cubre todas las ramas de classifyLineMovement (raw STEAM/DOWN/UP, prob implícita >=4pts, 3 casas coordinadas, sharp+2 y ±0.02)", () => {
    expect(classifyLineMovement({ currentDecimal: 1.9, rawMovement: "STEAM_MOVE" })).toMatchObject({
      signal: "STEAM",
      legacyDirection: "shortening",
      openingDecimal: null,
      deltaPct: null,
      impliedProbDeltaPts: null,
    });
    expect(classifyLineMovement({ currentDecimal: 1.9, rawMovement: "SHARP_STEAM" }).signal).toBe("STEAM");

    // impliedProbDeltaPts >= 4.0 con deltaPct entre -5.0 y -8.0 dispara STEAM
    const sharpProbJump = classifyLineMovement({ openingDecimal: 1.6, currentDecimal: 1.5 });
    expect(sharpProbJump.deltaPct).toBe(-6.25);
    expect(sharpProbJump.impliedProbDeltaPts).toBe(4.17);
    expect(sharpProbJump.signal).toBe("STEAM");

    // 3+ casas acortando >= 3% incluso sin sharp -> STEAM
    expect(
      classifyLineMovement({
        openingDecimal: 2.0,
        currentDecimal: 1.93,
        coordinatedShorteningBooks: 3,
        sharpShortened: false,
      }).signal,
    ).toBe("STEAM");

    // 2 casas con sharp acortando >= 3.5% -> STEAM; sin sharp se queda en SHORTENING
    expect(
      classifyLineMovement({
        openingDecimal: 2.0,
        currentDecimal: 1.92,
        coordinatedShorteningBooks: 2,
        sharpShortened: true,
      }).signal,
    ).toBe("STEAM");
    expect(
      classifyLineMovement({
        openingDecimal: 2.0,
        currentDecimal: 1.92,
        coordinatedShorteningBooks: 2,
        sharpShortened: false,
      }).signal,
    ).toBe("SHORTENING");

    // Dirección cruda sin cuota de apertura
    expect(classifyLineMovement({ currentDecimal: 2.1, rawMovement: "DOWN" })).toMatchObject({
      signal: "SHORTENING",
      legacyDirection: "shortening",
      deltaPct: null,
    });
    expect(classifyLineMovement({ currentDecimal: 2.1, rawMovement: "UP" })).toMatchObject({
      signal: "DRIFTING",
      legacyDirection: "drifting",
      deltaPct: null,
    });

    // Umbral absoluto ±0.02 vs ruido menor STABLE y apertura fuera de rango
    expect(classifyLineMovement({ openingDecimal: 2.0, currentDecimal: 1.98 }).signal).toBe("SHORTENING");
    expect(classifyLineMovement({ openingDecimal: 2.0, currentDecimal: 2.02 }).signal).toBe("DRIFTING");
    expect(classifyLineMovement({ openingDecimal: 2.0, currentDecimal: 1.99 }).signal).toBe("STABLE");
    expect(classifyLineMovement({ openingDecimal: 0.95, currentDecimal: 2.0 })).toMatchObject({
      openingDecimal: null,
      deltaPct: null,
      signal: "STABLE",
    });
  });

  it("valida casas MX prioritarias (Caliente/Codere/Betcris/Bet365 + Pinnacle), filtra secundarias/live/no autorizadas y resuelve empates de mejor cuota", () => {
    expect([...PRIORITY_COMPARISON_BOOKS].sort()).toEqual([
      "bet365",
      "betcris",
      "betmgm",
      "caliente_mx",
      "codere",
      "draftkings",
      "fanduel",
      "pinnacle",
    ]);

    const nestedMarketsPayload = {
      event_id: 987654321,
      markets: {
        "1x2": {
          home: [
            { bookmaker_slug: "caliente-mx", decimal_odds: 1.99, opening_odds: 2.08 },
            { bookmaker_slug: "codere", decimal_odds: 1.98, opening_odds: 2.06 },
            { bookmaker_slug: "betcris", decimal_odds: 2.02, opening_odds: 2.1 },
            { bookmaker_slug: "bet365", decimal_odds: 1.97, opening_odds: 2.05 },
            { bookmaker_slug: "bet365", decimal_odds: 4.0, is_live: true },
            { bookmaker_slug: "pinnacle", decimal_odds: 1.96, opening_odds: 2.04 },
            { bookmaker_slug: "bwin", decimal_odds: 2.01, opening_odds: 2.04 },
            { bookmaker_slug: "unibet", decimal_odds: 2.0, opening_odds: 2.03 },
            { bookmaker_slug: "william-hill", decimal_odds: 1.99, opening_odds: 2.02 },
            { bookmaker_slug: "betonline", decimal_odds: 1.98, opening_odds: 2.01 },
            { bookmaker_slug: "1xbet", decimal_odds: 2.5, opening_odds: 2.5 },
          ],
        },
      },
    };

    const priorityOnly = parseBzzoiroOddsComparison(nestedMarketsPayload, {
      priorityBooksOnly: true,
      modelProbsByKey: new Map([["1x2|null|home", 0.52]]),
    });
    expect(priorityOnly).toHaveLength(1);
    const mxRow = priorityOnly[0]!;
    expect(mxRow.books).toHaveLength(5);
    expect(mxRow.books.map((b) => b.book)).toEqual(["betcris", "caliente_mx", "codere", "bet365", "pinnacle"]);
    expect(mxRow.books.find((b) => b.book === "caliente_mx")?.bookLabel).toBe("Caliente");
    expect(mxRow.bestBook).toBe("betcris");
    expect(mxRow.bestDecimal).toBe(2.02);
    expect(mxRow.pinnacleDecimal).toBe(1.96);
    expect(mxRow.signal).toBe("STEAM");
    expect(mxRow.fairOdds).toBe(1.923);
    expect(mxRow.evPct).toBe(5.04);
    assertFd16Clean(priorityOnly, ["987654321"]);

    const allBooks = parseBzzoiroOddsComparison(nestedMarketsPayload, {
      priorityBooksOnly: false,
      modelProbsByKey: { "1x2|null|home": 0.52 },
    });
    expect(allBooks[0]?.books).toHaveLength(9);
    expect(allBooks[0]?.books.some((b) => b.book === "1xbet")).toBe(false);
    expect(allBooks[0]?.modelProb).toBe(0.52);
    expect(allBooks[0]?.fairOdds).toBe(1.923);
    expect(allBooks[0]?.evPct).toBe(5.04);

    // Licencia Bzzoiro v4.0: sin probabilidad Spacetime válida (fuera de rango o ausente) se descarta la fila.
    expect(
      parseBzzoiroOddsComparison(nestedMarketsPayload, {
        priorityBooksOnly: false,
        modelProbsByKey: { "1x2|null|home": 1.2 },
      }),
    ).toEqual([]);
    expect(parseBzzoiroOddsComparison(nestedMarketsPayload, { priorityBooksOnly: false })).toEqual([]);

    const bestMxPayload = {
      odds: [
        { market: "1x2", outcome: "home", bookmaker_slug: "caliente_mx", decimal_odds: 2.1, opening_odds: 2.2 },
        { market: "1x2", outcome: "home", bookmaker_slug: "bwin", decimal_odds: 2.15, opening_odds: 2.15 },
        { market: "1x2", outcome: "home", bookmaker_slug: "codere", decimal_odds: 2.12, is_live: true },
      ],
    };
    const bestMxOnly = parseBzzoiroBestOdds(bestMxPayload, {
      priorityBooksOnly: true,
      modelProbsByKey: { "1x2|null|home": 0.51 },
    });
    expect(bestMxOnly).toHaveLength(1);
    expect(bestMxOnly[0]).toMatchObject({
      book: "caliente_mx",
      bookLabel: "Caliente",
      signal: "SHORTENING",
      modelProb: 0.51,
      fairOdds: 1.961,
    });
    assertFd16Clean(bestMxOnly);
    expect(parseBzzoiroBestOdds(bestMxPayload, { priorityBooksOnly: true })).toEqual([]);

    // En snapshots canónicos (parseBzzoiroOdds), casas MX legales api_only (codere/betcris/bet365) pasan y caliente/1xbet se descartan
    const capturedAtIso = "2026-11-18T18:00:00Z";
    const ligaMxSnap = parseBzzoiroOdds({
      events: [{ id: 301, home_team: "Club América", away_team: "Guadalajara", event_date: "2026-11-22T03:00:00Z", status: "notstarted" }],
      oddsByEvent: new Map([
        [
          301,
          [
            { market: "1x2", outcome: "home", bookmaker_slug: "codere", decimal_odds: 2.15 },
            { market: "1x2", outcome: "draw", bookmaker_slug: "codere", decimal_odds: 3.3 },
            { market: "1x2", outcome: "away", bookmaker_slug: "codere", decimal_odds: 3.4 },
            { market: "1x2", outcome: "home", bookmaker_slug: "betcris", decimal_odds: 2.15 },
            { market: "1x2", outcome: "draw", bookmaker_slug: "betcris", decimal_odds: 3.25 },
            { market: "1x2", outcome: "away", bookmaker_slug: "betcris", decimal_odds: 3.45 },
            { market: "1x2", outcome: "home", bookmaker_slug: "caliente", decimal_odds: 2.5 },
            { market: "1x2", outcome: "draw", bookmaker_slug: "caliente", decimal_odds: 3.5 },
            { market: "1x2", outcome: "away", bookmaker_slug: "caliente", decimal_odds: 3.5 },
          ],
        ],
      ]),
      appLeague: "liga-mx",
      capturedAtIso,
      nowMs: Date.parse(capturedAtIso),
    });
    expect(ligaMxSnap.some((r) => r.book.includes("caliente"))).toBe(false);
    const tiedHomeBest = annotateBestOddsBySelection(ligaMxSnap).filter(
      (r) => r.market === "1x2" && r.selection === "home" && r.is_best_odds === true,
    );
    expect(tiedHomeBest.map((r) => r.book).sort()).toEqual(["betcris", "codere"]);
  });

  it("BzzoiroOddsAdapter exige credenciales, propaga errores HTTP y pagina >10 páginas con BZZOIRO_UNLIMITED=1", async () => {
    const noKeyAdapter = new BzzoiroOddsAdapter({ env: {} });
    await expect(noKeyAdapter.fetchBestOddsAnalyzed("1x2")).rejects.toBeInstanceOf(MissingCredentialsError);

    const errTransport = new CleanHttpTransport({
      rateLimitRps: 1000,
      sleepFn: async () => undefined,
      requester: async ({ url }) => ({ url, status: 401, headers: {}, bodyText: "Unauthorized", sha256: "" }),
    });
    const badAuthAdapter = new BzzoiroOddsAdapter({
      env: { BZZOIRO_API_KEY: "bad-key" },
      transport: errTransport,
    });
    await expect(badAuthAdapter.fetchEventOddsComparison(100)).rejects.toBeInstanceOf(OddsSourceError);

    const makePagingRequester = (): HttpRequesterFn => async ({ url }) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/events/")) {
        const offset = Number(u.searchParams.get("offset") ?? "0");
        const page = Math.floor(offset / 200);
        if (page < 11) {
          return {
            url,
            status: 200,
            headers: {},
            bodyText: JSON.stringify({
              results: [{ id: 100 + page, home_team: "Arsenal", away_team: "Chelsea", event_date: "2026-11-10T15:00:00Z", status: "finished" }],
              next: `${u.origin}${u.pathname}?offset=${(page + 1) * 200}`,
            }),
            sha256: "",
          };
        }
        return {
          url,
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            results: [{ id: 9012, home_team: "Arsenal", away_team: "Chelsea", event_date: "2026-11-22T16:30:00Z", status: "notstarted" }],
            next: null,
          }),
          sha256: "",
        };
      }
      return {
        url,
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          results: [
            { market: "1x2", outcome: "home", bookmaker_slug: "bet365", decimal_odds: 1.9 },
            { market: "1x2", outcome: "draw", bookmaker_slug: "bet365", decimal_odds: 3.5 },
            { market: "1x2", outcome: "away", bookmaker_slug: "bet365", decimal_odds: 4.1 },
          ],
          next: null,
        }),
        sha256: "",
      };
    };

    const standardAdapter = new BzzoiroOddsAdapter({
      env: { BZZOIRO_API_KEY: "std-key" },
      transport: new CleanHttpTransport({ rateLimitRps: 1000, sleepFn: async () => undefined, requester: makePagingRequester() }),
    });
    const limitedRows = await standardAdapter.fetchSnapshots({
      activeLeagues: ["premier-league"],
      capturedAtIso: "2026-11-18T18:00:00Z",
    });
    expect(limitedRows).toEqual([]);

    const unlimitedAdapter = new BzzoiroOddsAdapter({
      env: { BZZOIRO_API_KEY: "unl-key", BZZOIRO_UNLIMITED: "1" },
      transport: new CleanHttpTransport({ rateLimitRps: 1000, sleepFn: async () => undefined, requester: makePagingRequester() }),
    });
    const unlimitedRows = await unlimitedAdapter.fetchSnapshots({
      activeLeagues: ["premier-league"],
      capturedAtIso: "2026-11-18T18:00:00Z",
    });
    expect(unlimitedRows).toHaveLength(3);
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

  it("cubre tiers arbitrales (permisivo/medio/estricto), cotas bayesianas, matches=0, árbitro embebido y niveles de cancha", () => {
    expect(parseBzzoiroRefereeProfile(null)).toBeNull();
    expect(parseBzzoiroRefereeProfile({ name: "https://sports.bzzoiro.com/ref/9" })).toBeNull();

    const permissive = parseBzzoiroRefereeProfile({
      id: 901,
      name: "Árbitro Permisivo",
      matches: 40,
      avg_yellow_per_match: 2.8,
      avg_red_per_match: 0.05,
      avg_fouls_per_match: 18.0,
    });
    expect(permissive).toMatchObject({
      rigorTier: "permisivo",
      cardsMultiplier: 0.744,
      foulsMultiplier: 0.82,
      redsMultiplier: 0.65,
    });

    const neutral = parseBzzoiroRefereeProfile({
      name: "Árbitro Medio",
      matches: 20,
      avg_yellow_per_match: 4.2,
      avg_red_per_match: 0.22,
      avg_fouls_per_match: 23.5,
    });
    expect(neutral).toMatchObject({
      rigorTier: "medio",
      cardsMultiplier: 1,
      foulsMultiplier: 1,
      redsMultiplier: 1,
    });

    const clampedUpper = parseBzzoiroRefereeProfile({
      name: "Árbitro Extremo",
      matches: 100,
      avg_yellow_per_match: 9.0,
      avg_red_per_match: 1.0,
      avg_fouls_per_match: 40.0,
    });
    expect(clampedUpper).toMatchObject({
      rigorTier: "estricto",
      cardsMultiplier: 1.35,
      foulsMultiplier: 1.28,
      redsMultiplier: 1.55,
    });

    const zeroMatches = parseBzzoiroRefereeProfile({ name: "Sin Historial", matches: 0 });
    expect(zeroMatches).toEqual({
      name: "Sin Historial",
      matches: 0,
      avgYellow: null,
      avgRed: null,
      avgCardsTotal: null,
      avgFouls: null,
      avgGoals: null,
      cardsMultiplier: 1,
      foulsMultiplier: 1,
      redsMultiplier: 1,
      rigorTier: "medio",
    });

    const customPrior = parseBzzoiroRefereeProfile(
      { name: "Árbitro Liga MX", matches: 20, avg_yellow_per_match: 5.0 },
      { leagueAvgYellow: 5.0, priorMatches: 10 },
    );
    expect(customPrior).toMatchObject({ cardsMultiplier: 1, rigorTier: "medio" });

    expect(parseBzzoiroMatchContext(null, null, null)).toBeNull();
    const pitchLevels: Array<[number, string | undefined]> = [
      [1, "Óptimo"],
      [2, "Bueno"],
      [3, "Regular"],
      [4, "Pesado / Húmedo"],
      [5, "Dañado"],
      [99, undefined],
    ];
    for (const [code, expectedPitch] of pitchLevels) {
      const ctx = parseBzzoiroMatchContext({
        id: 800 + code,
        league_id: 19,
        season_id: 1,
        home_team_id: 1,
        home_team: "América",
        away_team_id: 2,
        away_team: "Tigres",
        event_date: "2026-11-22T02:00:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        pitch_condition: code,
        travel_distance_km: -10,
        referee: { id: 777, name: "Fernando Guerrero", matches: 35, avg_yellow_per_match: 5.1, avg_fouls_per_match: 25.0 },
      });
      expect(ctx?.pitchCondition).toBe(expectedPitch);
      expect(ctx?.travelDistanceKm).toBeUndefined();
      expect(ctx?.referee).toBe("Fernando Guerrero");
      expect(ctx?.refereeStats?.avgYellow).toBe(5.1);
      assertFd16Clean(ctx, ["777"]);
    }
  });

  it("degrada alineaciones incompletas (<11) a unavailable, acota >11 a 11 y soporta alias official/expected", () => {
    expect(parseBzzoiroLineupNormalized(null, "2026-11-20T18:00:00Z")).toEqual({
      status: "unavailable",
      internalConfidence: null,
      updatedAtUtc: "2026-11-20T18:00:00Z",
      home: { formation: null, starters: [] },
      away: { formation: null, starters: [] },
    });

    const makePlayers = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: 660000 + i,
        name: `Jugador ${i + 1}`,
        position: i === 0 ? "GK" : "MF",
        shirt_number: i === 0 ? 0 : i === 1 ? 100 : i + 1,
      }));

    // 10 titulares locales -> degradado a unavailable aunque lineup_status diga confirmed
    const incomplete = parseBzzoiroLineupNormalized(
      {
        event_id: 987654321,
        lineup_status: "confirmed",
        confidence: 95,
        lineups: {
          home: { formation: "4-3-3", players: makePlayers(10) },
          away: { formation: "4-4-2", players: makePlayers(11) },
        },
      },
      "2026-11-20T18:00:00Z",
    );
    expect(incomplete.status).toBe("unavailable");
    expect(incomplete.internalConfidence).toBeNull();
    expect(incomplete.home.starters).toHaveLength(10);
    expect(incomplete.away.starters).toHaveLength(11);

    // 12 titulares + alias official -> confirmed y recortado a 11, dorsales 0/100 saneados a null
    const officialOver = parseBzzoiroLineupNormalized(
      {
        event_id: 987654321,
        lineup_status: "official",
        lineups: {
          home: { formation: "3-5-2", players: makePlayers(12) },
          away: { formation: "4-2-3-1", players: makePlayers(12) },
        },
      },
      "2026-11-20T18:10:00Z",
    );
    expect(officialOver.status).toBe("confirmed");
    expect(officialOver.internalConfidence).toBe(1);
    expect(officialOver.home.starters).toHaveLength(11);
    expect(officialOver.away.starters).toHaveLength(11);
    expect(officialOver.home.starters[0]?.jerseyNumber).toBeNull();
    expect(officialOver.home.starters[1]?.jerseyNumber).toBeNull();
    expect(officialOver.home.starters[2]?.jerseyNumber).toBe(3);

    // Alias expected con confianza 0..1
    const expectedLineup = parseBzzoiroLineupNormalized(
      {
        event_id: 987654321,
        lineup_status: "expected",
        confidence: 0.74,
        lineups: {
          home: { formation: "4-3-3", players: makePlayers(11) },
          away: { formation: "4-3-3", players: makePlayers(11) },
        },
      },
      "2026-11-20T17:00:00Z",
    );
    expect(expectedLineup.status).toBe("probable");
    expect(expectedLineup.internalConfidence).toBe(0.74);
    assertFd16Clean({ incomplete, officialOver, expectedLineup }, ["987654321", "660000"]);

    // parseBzzoiroLineupsToProjection conserva bajas aunque falten titulares
    const partialProj = parseBzzoiroLineupsToProjection({
      raw: {
        event_id: 99,
        lineup_status: "confirmed",
        lineups: { home: { players: makePlayers(9) }, away: { players: makePlayers(11) } },
        unavailable_players: {
          home: [{ id: 501, name: "Igor Lichnovsky", status: "injured", reason: "Rodilla" }],
        },
      },
      homeTeamId: "liga-mx.america",
      awayTeamId: "liga-mx.chivas",
      gameId: "mx-ame-chi",
      updatedAtIso: "2026-11-20T18:00:00Z",
    });
    expect(partialProj.projection).toBeNull();
    expect(partialProj.unavailableHome).toHaveLength(1);
    expect(partialProj.unavailableHome[0]?.player).toBe("Igor Lichnovsky");

    // FD-16: parseBzzoiroLineupsToProjection usa copy editorial propio (jamás nombre del proveedor).
    const fullProj = parseBzzoiroLineupsToProjection({
      raw: {
        event_id: 987654321,
        lineup_status: "predicted",
        confidence: 82,
        lineups: {
          home: { formation: "4-3-3", players: makePlayers(11) },
          away: { formation: "4-4-2", players: makePlayers(11) },
        },
      },
      homeTeamId: "liga-mx.america",
      awayTeamId: "liga-mx.chivas",
      gameId: "mx-ame-chi",
      updatedAtIso: "2026-11-20T18:00:00Z",
    });
    expect(fullProj.projection?.sourceLabel).toBe("Modelo editorial PitchLab");
    expect(fullProj.projection?.sourceLabel.toLowerCase()).not.toContain("bzzoiro");
    assertFd16Clean(fullProj.projection, ["987654321", "660000"]);
  });

  it("parsea availability (unavailable_players y plano), H2H con acentos/limit y broadcastsMx con tope de 8 canales", () => {
    expect(parseBzzoiroEventAvailability(null)).toEqual({ home: [], away: [] });

    const fromUnavailableNode = parseBzzoiroEventAvailability({
      unavailable_players: {
        home: [
          { player_id: 8801, name: "Jugador Suspendido", status: "suspended" },
          { player_id: 8802, name: "jugador suspendido", status: "suspended" }, // duplicado insensible a mayúsculas
          { player_id: 8803, name: "Jugador Lesionado", status: "injured", expected_return: "2026-12-15T00:00:00Z" },
        ],
        away: [
          { player_id: 8804, name: "Jugador en Duda", availability: "doubtful" },
          { player_id: 8805, name: "Jugador Disponible", availability: "fit" },
        ],
      },
    });
    expect(fromUnavailableNode.home).toHaveLength(2);
    expect(fromUnavailableNode.home[0]).toMatchObject({
      playerName: "Jugador Suspendido",
      status: "Baja",
      category: "suspended",
      detail: "Suspensión disciplinaria",
    });
    expect(fromUnavailableNode.home[1]).toMatchObject({
      playerName: "Jugador Lesionado",
      status: "Baja",
      category: "injured",
      detail: "Baja reportada por el club",
      returnDate: "2026-12-15",
    });
    expect(fromUnavailableNode.away).toEqual([
      {
        playerName: "Jugador en Duda",
        status: "Duda",
        category: "doubtful",
        detail: "En duda por evaluación médica",
      },
    ]);

    const flatAvailability = parseBzzoiroEventAvailability([
      { player: { id: 9901, name: "Portero Local" }, is_home: true, status: "out" },
      { player: "Defensa Visita", side: "away", status: "doubtful" },
      { player: "Delantero Sano", team: "away", status: "available" },
    ]);
    expect(flatAvailability.home.map((e) => e.playerName)).toEqual(["Portero Local"]);
    expect(flatAvailability.away.map((e) => e.playerName)).toEqual(["Defensa Visita"]);
    assertFd16Clean({ fromUnavailableNode, flatAvailability }, ["8801", "8803", "9901"]);

    expect(parseBzzoiroH2h(null)).toEqual({
      matches: [],
      totalMatches: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      avgTotalGoals: null,
      bttsRate: null,
      over25Rate: null,
    });

    const h2hRaw = {
      head_to_head: [
        { event_id: 7001, date: "2026-09-14", home_team: "Club América", away_team: "CD Guadalajara", home_score: 2, away_score: 0, competition: "Liga MX" },
        { event_id: 7002, date: "2026-09-14", home_team: "Club América", away_team: "CD Guadalajara", home_score: 2, away_score: 0 }, // duplicado exacto
        { event_id: 7003, event_date: "2026-03-15T03:00:00Z", home_team: "Guadalajara", away_team: "America", home_score: 1, away_score: 2, league: { id: 19, name: "Liga MX" } },
        { event_id: 7004, event_date: "2025-10-18T03:00:00Z", home_team: "Guadalajara", away_team: "Club América", home_score: 2, away_score: 1 },
        { event_id: 7005, event_date: "TBD", home_team: "América", away_team: "Guadalajara", home_score: 1, away_score: 1 }, // fecha inválida
        { event_id: 7006, event_date: "2025-05-01", home_team: "América", away_team: "Guadalajara", home_score: null, away_score: 0 }, // marcador nulo
      ],
    };
    const h2hFull = parseBzzoiroH2h(h2hRaw, { homeTeamName: "América", awayTeamName: "Guadalajara", limit: 10 });
    expect(h2hFull.totalMatches).toBe(3);
    expect(h2hFull.matches.map((m) => m.dateIso)).toEqual(["2026-09-14", "2026-03-15", "2025-10-18"]);
    expect(h2hFull.homeWins).toBe(2);
    expect(h2hFull.draws).toBe(0);
    expect(h2hFull.awayWins).toBe(1);
    expect(h2hFull.avgTotalGoals).toBe(2.67);
    expect(h2hFull.bttsRate).toBe(0.667);
    expect(h2hFull.over25Rate).toBe(0.667);
    assertFd16Clean(h2hFull, ["7001", "7003", "7004"]);

    const h2hLimited = parseBzzoiroH2h(h2hRaw, { homeTeamName: "América", awayTeamName: "Guadalajara", limit: 2 });
    expect(h2hLimited.totalMatches).toBe(2);
    expect(h2hLimited.matches.map((m) => m.dateIso)).toEqual(["2026-09-14", "2026-03-15"]);

    expect(parseBroadcastsMx(null)).toEqual([]);
    const tenMxChannels = Array.from({ length: 10 }, (_, i) => ({
      channel: `Canal MX ${i + 1}`,
      country_code: i % 2 === 0 ? "mx" : undefined,
    }));
    const cappedBroadcasts = parseBroadcastsMx([
      ...tenMxChannels,
      { broadcaster: "Canal MX 1", country_code: "MX" },
      { name: "DAZN España", country_code: "ES" },
      { channel: "www.bzzoiro.com/live", country_code: "MX" },
    ]);
    expect(cappedBroadcasts).toHaveLength(8);
    expect(cappedBroadcasts[0]).toBe("Canal MX 1");
    expect(cappedBroadcasts[7]).toBe("Canal MX 8");
    assertFd16Clean(cappedBroadcasts);
  });

  it("fetchers individuales y fetchBzzoiroFullPreMatchBundle resuelven árbitro embebido sin /referees/ y toleran respuestas null", async () => {
    const { client, calls } = createMockProviderClient({
      "/referees/88/": { id: 88, name: "Adonai Escobedo", matches: 25, avg_yellow_per_match: 4.8, avg_fouls_per_match: 25.2 },
      "/events/600/lineups/": { event_id: 600, lineup_status: "unavailable" },
      "/events/600/availability/": { home: [{ player_id: 881212, name: "Diego Valdés", status: "doubtful", reason: "Gemelo" }], away: [] },
      "/events/600/h2h/": { matches: [{ date: "2026-02-01", home_team: "América", away_team: "Toluca", home_score: 2, away_score: 2 }] },
      "/events/600/broadcasts/?country_code=MX": { results: [{ broadcaster: "Canal 5", country_code: "MX" }] },
      "/teams/318/squad/": {
        players: [{ id: 90, name: "Andrés Guardado", position: "CM", availability: "injured", injury_type: "Muscular" }],
      },
      "/events/601/": {
        id: 601,
        league_id: 19,
        season_id: 1,
        home_team_id: 1,
        home_team: "América",
        away_team_id: 2,
        away_team: "Toluca",
        event_date: "2026-11-23T01:00:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        referee: { id: 88, name: "Adonai Escobedo", matches: 25, avg_yellow_per_match: 4.8, avg_fouls_per_match: 25.2 },
      },
      "/events/601/lineups/": { event_id: 601, lineup_status: "unavailable" },
      "/events/601/availability/": { home: [], away: [] },
      "/events/601/h2h/": { matches: [] },
      "/events/601/broadcasts/?country_code=MX": { results: [{ channel: "TUDN", country_code: "MX" }] },
    });

    const ref = await fetchBzzoiroRefereeProfile(client, 88);
    const lin = await fetchBzzoiroEventLineups(client, 600, "2026-11-20T18:00:00Z");
    const ava = await fetchBzzoiroEventAvailability(client, 600);
    const h2h = await fetchBzzoiroEventH2h(client, 600, { homeTeamName: "América", awayTeamName: "Toluca" });
    const tv = await fetchBzzoiroEventBroadcastsMx(client, 600);
    const sqInj = await fetchBzzoiroSquadInjuries({
      client,
      league: "liga-mx",
      providerTeamId: 318,
      teamId: "liga-mx.leon",
      observedAtIso: "2026-11-20T18:00:00Z",
    });
    expect(ref?.name).toBe("Adonai Escobedo");
    expect(lin.status).toBe("unavailable");
    expect(ava.home[0]?.playerName).toBe("Diego Valdés");
    expect(h2h.draws).toBe(1);
    expect(tv).toEqual(["Canal 5"]);
    expect(sqInj).toHaveLength(1);
    expect(sqInj[0]?.player).toBe("Andrés Guardado");

    const callsBeforeEmbedded = calls.length;
    const embeddedBundle = await fetchBzzoiroFullPreMatchBundle(client, { providerEventId: 601 });
    const embeddedCalls = calls.slice(callsBeforeEmbedded);
    expect(embeddedCalls.some((c) => c.startsWith("/referees/"))).toBe(false);
    expect(embeddedBundle.referee?.name).toBe("Adonai Escobedo");
    expect(embeddedBundle.context?.referee).toBe("Adonai Escobedo");
    expect(embeddedBundle.broadcastsMx).toEqual(["TUDN"]);
    assertFd16Clean({ ref, lin, ava, h2h, tv, embeddedBundle }, ["88", "600", "601", "881212"]);

    // Todos los endpoints devuelven null -> paquete vacío sin lanzar excepción
    const { client: emptyClient } = createMockProviderClient({});
    const emptyBundle = await fetchBzzoiroFullPreMatchBundle(emptyClient, {
      providerEventId: 9999,
      updatedAtIso: "2026-11-20T18:00:00Z",
    });
    expect(emptyBundle).toEqual({
      context: null,
      referee: null,
      lineups: {
        status: "unavailable",
        internalConfidence: null,
        updatedAtUtc: "2026-11-20T18:00:00Z",
        home: { formation: null, starters: [] },
        away: { formation: null, starters: [] },
      },
      availability: { home: [], away: [] },
      h2h: {
        matches: [],
        totalMatches: 0,
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        avgTotalGoals: null,
        bttsRate: null,
        over25Rate: null,
      },
      broadcastsMx: [],
    });
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

  it("cubre bordes de parseNbaMinutes, parseBzzoiroNbaStandings plano/LA Clippers y fetchBzzoiroNbaStandings", async () => {
    expect(parseNbaMinutes("00:45")).toBe(0.75);
    expect(parseNbaMinutes("48:00")).toBe(48);
    expect(parseNbaMinutes("70:00")).toBe(70);
    expect(parseNbaMinutes("28.5")).toBe(28.5);
    expect(parseNbaMinutes(0)).toBe(0);
    expect(parseNbaMinutes(70)).toBe(70);
    expect(parseNbaMinutes("36:60")).toBeNull();
    expect(parseNbaMinutes("71:00")).toBeNull();
    expect(parseNbaMinutes(-1)).toBeNull();
    expect(parseNbaMinutes(70.1)).toBeNull();
    expect(parseNbaMinutes(Number.NaN)).toBeNull();
    expect(parseNbaMinutes("")).toBeNull();
    expect(parseNbaMinutes(null)).toBeNull();
    expect(parseNbaMinutes(undefined)).toBeNull();

    expect(parseBzzoiroNbaStandings(null)).toEqual([]);
    const standingsPayload = {
      results: [
        { team: { id: 9001, name: "Boston Celtics" }, wins: 14, losses: 4, points_for: 2100, points_against: 1920 },
        { team_name: "New York Knicks", wins: 11, losses: 7, points_for: 2010, points_against: 1960 },
        { team: "Denver Nuggets", wins: 13, losses: 5, win_pct: 72.2, points_for: 2050, points_against: 1940 },
        { team: "LA Clippers", wins: 10, losses: 8, points_for: 1980, points_against: 1950 },
      ],
    };
    const standings = parseBzzoiroNbaStandings(standingsPayload);
    expect(standings).toHaveLength(4);
    expect(standings.find((s) => s.teamId === "nba.boston-celtics")).toMatchObject({
      conference: "Este",
      division: "Atlántico",
      seed: 1,
      gamesBehind: "-",
      winPct: 0.778,
    });
    expect(standings.find((s) => s.teamId === "nba.new-york-knicks")).toMatchObject({
      conference: "Este",
      seed: 2,
      gamesBehind: "3",
    });
    expect(standings.find((s) => s.teamId === "nba.denver-nuggets")).toMatchObject({
      conference: "Oeste",
      seed: 1,
      gamesBehind: "-",
      winPct: 0.722,
    });
    expect(standings.find((s) => s.teamId === "nba.los-angeles-clippers")).toMatchObject({
      name: "Los Angeles Clippers",
      conference: "Oeste",
      division: "Pacífico",
      seed: 2,
      gamesBehind: "3",
    });
    assertFd16Clean(standings, ["9001"]);

    const { client, calls } = createMockProviderClient({
      "/basketball/api/v2/standings/?league=1": standingsPayload,
    });
    const fetched = await fetchBzzoiroNbaStandings(client);
    expect(calls).toEqual(["/basketball/api/v2/standings/?league=1"]);
    expect(fetched).toHaveLength(4);
  });

  it("cubre fallback /team-stats/ en fetchBzzoiroNbaBoxScore, contenedores alternos de jugadores y estados pregame NBA", async () => {
    expect(parseBzzoiroNbaBoxScoreDetail(null)).toEqual({ teamMetrics: null, players: { home: [], away: [] } });

    const fromHomeAwayPlayers = parseBzzoiroNbaBoxScoreDetail({
      home_players: [
        { player_id: 5001, name: "Suplente", minutes: "14:00", points: 10 },
        { player_id: 5002, name: "Titular", starter: true, minutes: "35:00", points: 26, three_pointers_made: 4 },
      ],
      away_players: [
        { player_id: 5003, name: "Base Visita", is_starter: true, min: "34:30", pts: 22, ast: 9 },
      ],
    });
    expect(fromHomeAwayPlayers.players.home.map((p) => p.playerName)).toEqual(["Titular", "Suplente"]);
    expect(fromHomeAwayPlayers.players.away[0]).toMatchObject({ playerName: "Base Visita", minutes: 34.5, assists: 9 });

    const fromFlatPlayers = parseBzzoiroNbaBoxScoreDetail({
      players: [
        { player_name: "Local A", is_home: true, minutes: 30, points: 18 },
        { player_name: "Visita B", side: "away", minutes: 32, points: 20 },
      ],
    });
    expect(fromFlatPlayers.players.home).toHaveLength(1);
    expect(fromFlatPlayers.players.away).toHaveLength(1);

    // Cuando /box-score/ no trae métricas de equipo, cae automáticamente a /team-stats/
    const { client, calls } = createMockProviderClient({
      "/basketball/api/v2/events/990/box-score/": {
        players: { home: [{ player_id: 5004, name: "Jaylen Brown", starter: true, minutes: "36:00", points: 27 }] },
      },
      "/basketball/api/v2/events/990/team-stats/": {
        home: { fg_pct: 51.2, pace: 101.4, offensive_rating: 122.0 },
        away: { fg_pct: 44.5, defensive_rating: 119.5 },
      },
    });
    const fallbackBox = await fetchBzzoiroNbaBoxScore(client, 990);
    expect(calls).toEqual([
      "/basketball/api/v2/events/990/box-score/",
      "/basketball/api/v2/events/990/team-stats/",
    ]);
    expect(fallbackBox.teamMetrics?.home.fgPct).toBe(51.2);
    expect(fallbackBox.players.home[0]?.playerName).toBe("Jaylen Brown");
    assertFd16Clean({ fromHomeAwayPlayers, fromFlatPlayers, fallbackBox }, ["5001", "5002", "5003", "5004", "990"]);

    expect(parseBzzoiroNbaPregame(null)).toBeNull();
    expect(parseBzzoiroNbaPregame({})).toBeNull();
    expect(
      parseBzzoiroNbaPregame({
        injuries: { home: [{ name: "Jugador Probable", status: "Probable" }] },
      }),
    ).toBeNull();

    const richPregame = parseBzzoiroNbaPregame({
      event_id: 991122,
      officials: [{ id: 10, name: "Scott Foster" }],
      referees: ["scott foster", { id: 11, name: "Zach Zarba" }],
      is_back_to_back_home: true,
      home_rest_days: 1,
      away_rest_days: 3,
      unavailable_players: {
        home: [{ player_id: 7101, name: "Jugador O", status: "O", injury: "Rodilla" }],
        away: [{ player_id: 7102, name: "Jugador Susp", status: "Suspended" }],
      },
      availability: [
        { player_id: 7103, name: "Jugador GTD", is_home: true, status: "GTD" },
        { player_id: 7104, name: "Jugador D", side: "away", status: "D" },
        { player_id: 7105, name: "Jugador P", is_home: true, status: "P" },
      ],
      notes: ["Nota 1", "Nota 2", "Nota 3", "Nota 4"],
      tipoff_notes: ["Nota 5", "Nota 6", "Nota 7"],
    });
    expect(richPregame?.officials).toEqual(["Scott Foster", "Zach Zarba"]);
    expect(richPregame?.backToBack).toEqual({ home: true, away: false });
    expect(richPregame?.injuries.home.map((i) => `${i.playerName}:${i.status}:${i.rawStatus}`)).toEqual([
      "Jugador O:Baja:out",
      "Jugador GTD:Duda:questionable",
    ]);
    expect(richPregame?.injuries.away.map((i) => `${i.playerName}:${i.status}:${i.rawStatus}`)).toEqual([
      "Jugador Susp:Baja:out",
      "Jugador D:Duda:doubtful",
    ]);
    expect(richPregame?.notes).toHaveLength(6);
    assertFd16Clean(richPregame, ["991122", "7101", "7102", "7103", "7104", "7105"]);
  });

  it("cubre alias y rechazos en parseBzzoiroNbaOdds, Map priors en comparación NBA y fetchBzzoiroNbaPlayerGames", async () => {
    const oddsRows = parseBzzoiroNbaOdds({
      homeTeamRaw: "Boston Celtics",
      awayTeamRaw: "Miami Heat",
      kickoffUtc: "2026-11-22T00:30:00Z",
      capturedAtUtc: "2026-11-21T18:00:00Z",
      odds: [
        { market: "h2h", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.52, opening_odds: 1.6 },
        { market: "point_spread", selection: "away", line: 5.5, bookmaker_slug: "betcris", decimal_odds: 1.91 },
        { market: "total_points", outcome: "under", line: 224.5, bookmaker_slug: "codere", decimal_odds: 1.9, opening_odds: 1.82 },
        { market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.4, is_live: true },
        { market: "moneyline", outcome: "home", bookmaker_slug: "1xbet", decimal_odds: 1.6 },
        { market: "moneyline", outcome: "home", bookmaker_slug: "caliente", decimal_odds: 1.55 },
        { market: "moneyline", outcome: "home", bookmaker_slug: "bet365", decimal_odds: 1.0 },
      ],
    });
    expect(oddsRows).toHaveLength(3);
    expect(oddsRows.every((r) => r.event_id === "ws:basketball:NBA:20261122:boston-celtics:miami-heat")).toBe(true);
    expect(oddsRows.find((r) => r.market === "totals")?.movement_direction).toBe("drifting");

    expect(
      parseBzzoiroNbaOdds({
        homeTeamRaw: "Boston Celtics",
        awayTeamRaw: "Boston Celtics",
        kickoffUtc: "2026-11-22T00:30:00Z",
        capturedAtUtc: "2026-11-21T18:00:00Z",
        odds: [{ market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.9 }],
      }),
    ).toEqual([]);

    expect(parseBzzoiroNbaOddsComparison(null)).toEqual([]);
    const mapComp = parseBzzoiroNbaOddsComparison(
      [{ market: "spread", outcome: "home", line: -5.5, bookmaker_slug: "betcris", decimal_odds: 1.92, opening_odds: 1.92 }],
      { modelProbsByKey: new Map([["spread|-5.5|home", 0.56]]) },
    );
    expect(mapComp[0]).toMatchObject({ market: "spread", line: -5.5, fairOdds: 1.786, signal: "STABLE" });
    assertFd16Clean(mapComp);

    expect(parseBzzoiroNbaPlayerGames(null)).toEqual([]);
    const rawGamesResp = {
      results: [
        {
          id: 991001,
          event_id: 992002,
          game_id: "bz-g-992002",
          date: "2026-11-18T00:30:00Z",
          opponent: { id: 44, name: "Miami Heat", abbreviation: "MIA" },
          is_home: true,
          score: "118-104",
          result: "w",
          min: "33:30",
          pts: 29,
          reb: 7,
          ast: 6,
          tpm: 4,
          stl: 2,
          blk: 1,
          tov: 3,
        },
      ],
    };
    const { client, calls } = createMockProviderClient({
      "/basketball/api/v2/players/4455/games/?limit=15": rawGamesResp,
    });
    const fetchedGames = await fetchBzzoiroNbaPlayerGames(client, 4455);
    expect(calls).toEqual(["/basketball/api/v2/players/4455/games/?limit=15"]);
    const normalized = parseBzzoiroNbaPlayerGames(fetchedGames);
    expect(normalized).toEqual([
      {
        dateIso: "2026-11-18",
        opponent: "Miami Heat",
        opponentAbbr: "MIA",
        isHome: true,
        score: "118-104",
        result: "W",
        minutes: 33.5,
        points: 29,
        rebounds: 7,
        assists: 6,
        threePointersMade: 4,
        steals: 2,
        blocks: 1,
        turnovers: 3,
      },
    ]);
    assertFd16Clean(normalized, ["991001", "992002", "bz-g-992002", "4455"]);
  });

  it("calcula props PTS/REB/AST/3PM/PRA exactos, corta promedios <0.8, respeta piso SD=0.6, tope last10 y guardias de minutos/disponibilidad", () => {
    expect(DEFAULT_NBA_PROP_MIN_MINUTES).toBe(18);

    const guardGames = [
      { minutes: "34:00", points: 28, rebounds: 5, assists: 6, three_pointers_made: 5 },
      { minutes: "36:00", points: 32, rebounds: 4, assists: 8, three_pointers_made: 6 },
      { minutes: "32:00", points: 24, rebounds: 6, assists: 5, three_pointers_made: 4 },
      { minutes: "34:00", points: 28, rebounds: 5, assists: 5, three_pointers_made: 5 },
    ];
    const seeds = buildGuardedNbaPlayerPropSeeds({
      player: "Stephen Curry",
      teamSlug: "golden-state-warriors",
      teamName: "Golden State Warriors",
      position: "PG",
      games: guardGames,
    });
    expect(seeds.map((s) => s.statKey)).toEqual(["pts", "reb", "ast", "tpm", "pra"]);
    expect(seeds.find((s) => s.statKey === "pts")).toMatchObject({
      statLabel: "Puntos anotados",
      baseLine: 28.5,
      projectionMean: 28,
      projectionSd: 2.83,
      avgMinutes: 34,
      sampleGames: 4,
      last10: [28, 32, 24, 28],
    });
    expect(seeds.find((s) => s.statKey === "reb")).toMatchObject({
      statLabel: "Rebotes totales",
      baseLine: 5.5,
      projectionMean: 5,
      projectionSd: 0.71,
    });
    expect(seeds.find((s) => s.statKey === "ast")).toMatchObject({
      statLabel: "Asistencias",
      baseLine: 6.5,
      projectionMean: 6,
      projectionSd: 1.22,
    });
    expect(seeds.find((s) => s.statKey === "tpm")).toMatchObject({
      statLabel: "Triples anotados",
      baseLine: 5.5,
      projectionMean: 5,
      projectionSd: 0.71,
    });
    expect(seeds.find((s) => s.statKey === "pra")).toMatchObject({
      statLabel: "Puntos + Rebotes + Asistencias",
      baseLine: 39.5,
      projectionMean: 39,
      projectionSd: 3.24,
    });
    assertFd16Clean(seeds);

    // Pívot con varianza 0 en PTS (piso SD=0.6) y promedio de 3PM < 0.8 (se omite tpm)
    const centerSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Rudy Gobert",
      teamSlug: "minnesota-timberwolves",
      teamName: "Minnesota Timberwolves",
      position: "C",
      games: [
        { minutes: 32, points: 20, rebounds: 12, assists: 2, three_pointers_made: 0 },
        { minutes: 33, points: 20, rebounds: 14, assists: 1, three_pointers_made: 0 },
        { minutes: 31, points: 20, rebounds: 13, assists: 2, three_pointers_made: 1 },
        { minutes: 34, points: 20, rebounds: 11, assists: 2, three_pointers_made: 0 },
      ],
    });
    expect(centerSeeds.find((s) => s.statKey === "pts")?.projectionSd).toBe(0.6);
    expect(centerSeeds.some((s) => s.statKey === "tpm")).toBe(false);
    expect(centerSeeds.map((s) => s.statKey)).toEqual(["pts", "reb", "ast", "pra"]);

    // Ventana acotada a los 10 partidos elegibles más recientes
    const fourteenGames = Array.from({ length: 14 }, (_, i) => ({
      minutes: 30,
      points: 20 + i,
      rebounds: 6,
      assists: 4,
      three_pointers_made: 2,
    }));
    const cappedSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Titular Regular",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: fourteenGames,
    });
    expect(cappedSeeds.find((s) => s.statKey === "pts")?.last10).toHaveLength(10);
    expect(cappedSeeds.find((s) => s.statKey === "pts")?.sampleGames).toBe(10);

    // Partidos con minutos ausentes (null) no pasan la guardia minMinutes=18
    const missingMinsSeeds = buildGuardedNbaPlayerPropSeeds({
      player: "Sin Minutos",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: [
        { minutes: 30, points: 22, rebounds: 5, assists: 4, three_pointers_made: 2 },
        { minutes: 28, points: 19, rebounds: 6, assists: 3, three_pointers_made: 1 },
        { minutes: null, points: 24, rebounds: 5, assists: 5, three_pointers_made: 3 },
        { points: 21, rebounds: 4, assists: 4, three_pointers_made: 2 },
        { minutes: 12, points: 8, rebounds: 2, assists: 1, three_pointers_made: 0 },
      ],
    });
    expect(missingMinsSeeds).toEqual([]);

    // Guardia minAvgMinutes bloquea cuando el promedio no alcanza el mínimo
    const lowAvgMins = buildNbaPlayerPropSeeds({
      player: "Rotación Baja",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: [
        { minutes: 15, points: 10, rebounds: 4, assists: 2, three_pointers_made: 1 },
        { minutes: 16, points: 12, rebounds: 3, assists: 2, three_pointers_made: 2 },
        { minutes: 17, points: 11, rebounds: 4, assists: 3, three_pointers_made: 1 },
        { minutes: 16, points: 9, rebounds: 5, assists: 2, three_pointers_made: 1 },
      ],
      minMinutes: 14,
      minAvgMinutes: 20,
    });
    expect(lowAvgMins).toEqual([]);

    // Disponibilidad: bajas confirmadas (out/injured/suspended/baja) se bloquean; questionable/doubtful no se bloquean
    for (const blockedStatus of ["out", "injured", "suspended", "baja"]) {
      expect(
        buildGuardedNbaPlayerPropSeeds({
          player: "Stephen Curry",
          teamSlug: "golden-state-warriors",
          teamName: "Golden State Warriors",
          games: guardGames,
          availabilityStatus: blockedStatus,
        }),
      ).toEqual([]);
    }
    for (const playableStatus of ["questionable", "doubtful", "probable", "available"]) {
      expect(
        buildGuardedNbaPlayerPropSeeds({
          player: "Stephen Curry",
          teamSlug: "golden-state-warriors",
          teamName: "Golden State Warriors",
          games: guardGames,
          availabilityStatus: playableStatus,
        }).length,
      ).toBeGreaterThan(0);
    }
  });
});
