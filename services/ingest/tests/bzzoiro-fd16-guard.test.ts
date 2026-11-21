import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseBzzoiroBestOdds,
  parseBzzoiroOddsComparison,
} from "../src/odds/bzzoiro-odds.js";
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
  parsePlayerStats,
  toScoreboardEntry,
  type BzLiveEvent,
  type BzLiveStats,
} from "../src/providers/bzzoiro-live.js";
import {
  buildGuardedNbaPlayerPropSeeds,
  parseBzzoiroNbaBoxScoreDetail,
  parseBzzoiroNbaOddsComparison,
  parseBzzoiroNbaPlayerGames,
  parseBzzoiroNbaPregame,
  parseBzzoiroNbaStandings,
  type BzNbaBoxScoreRaw,
  type BzNbaOddsRowRaw,
  type BzNbaPlayerGameRaw,
  type BzNbaPregameRaw,
  type BzNbaStandingRowRaw,
} from "../src/providers/bzzoiro-nba-rich.js";
import { describeProviders, readProviderConfigs } from "../src/providers/config.js";
import { createProviderClient, type ProviderClient } from "../src/providers/http.js";

const RAW_EVENT_ID = 987654321;
const RAW_PLAYER_ID_1 = 88776655;
const RAW_PLAYER_ID_2 = 77665544;
const RAW_REF_ID = 66554433;
const RAW_TEAM_ID_HOME = 55443322;
const RAW_TEAM_ID_AWAY = 44332211;
const RAW_BOOKMAKER_ID = 33221100;
const SECRET_API_KEY = "bz_live_secret_key_998877";

const POISON_BZ_URL = `https://sports.bzzoiro.com/img/player/${RAW_PLAYER_ID_1}/?api_key=${SECRET_API_KEY}`;
const POISON_ESPN_URL = "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/227.png";
const POISON_WWW_URL = `www.bzzoiro.com/api/v2/events/${RAW_EVENT_ID}/?api_key=${SECRET_API_KEY}`;

const SENTINELS: readonly string[] = [
  String(RAW_EVENT_ID),
  String(RAW_PLAYER_ID_1),
  String(RAW_PLAYER_ID_2),
  String(RAW_REF_ID),
  String(RAW_TEAM_ID_HOME),
  String(RAW_TEAM_ID_AWAY),
  String(RAW_BOOKMAKER_ID),
  "ext-raw-987654321",
  SECRET_API_KEY,
];

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

const FORBIDDEN_FD16_PATTERNS: readonly { readonly rule: string; readonly re: RegExp }[] = [
  { rule: "hotlink http(s)://", re: /https?:\/\//i },
  { rule: "hotlink www.", re: /\bwww\./i },
  { rule: "hotlink protocol-relative", re: /\/\/[a-z0-9.-]+\.[a-z]{2,}/i },
  { rule: "dominio bzzoiro.com", re: /bzzoiro\.com/i },
  { rule: "dominio espncdn", re: /espncdn/i },
  { rule: "parámetro api_key", re: /api[_-]?key/i },
  { rule: "token de autorización", re: /\bToken\s+[A-Za-z0-9_-]{6,}/i },
  { rule: "copy prohibido Confianza N", re: /Confianza\s+\d/i },
];

export function findFd16Violations(
  payload: unknown,
  sentinelTokens: readonly string[] = SENTINELS,
  path = "$",
  out: string[] = [],
): string[] {
  if (payload === null || payload === undefined) return out;

  if (typeof payload === "string") {
    for (const { rule, re } of FORBIDDEN_FD16_PATTERNS) {
      if (re.test(payload)) {
        out.push(`${path}: viola ${rule} -> ${payload}`);
      }
    }
    for (const token of sentinelTokens) {
      if (payload.includes(token)) {
        out.push(`${path}: filtra token centinela '${token}'`);
      }
    }
    return out;
  }

  if (typeof payload === "number") {
    const asStr = String(payload);
    for (const token of sentinelTokens) {
      if (asStr === token) {
        out.push(`${path}: filtra ID numérico centinela '${token}'`);
      }
    }
    return out;
  }

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i += 1) {
      findFd16Violations(payload[i], sentinelTokens, `${path}[${i}]`, out);
    }
    return out;
  }

  if (typeof payload === "object") {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      const childPath = `${path}.${k}`;
      if (FORBIDDEN_FD16_KEYS.has(k.toLowerCase())) {
        out.push(`${childPath}: llave prohibida FD-16 '${k}'`);
      }
      findFd16Violations(v, sentinelTokens, childPath, out);
    }
  }

  return out;
}

function assertFd16Strict(payload: unknown, sentinelTokens: readonly string[] = SENTINELS): void {
  const violations = findFd16Violations(payload, sentinelTokens);
  expect(violations, `Violaciones FD-16 detectadas:\n${violations.join("\n")}`).toEqual([]);
}

function withRawNoise<T extends object>(base: T, extra: Record<string, unknown>): T {
  return { ...base, ...extra };
}

function createMockClient(routes: Readonly<Record<string, unknown>>): ProviderClient {
  return {
    stats: { requests: 0, cacheHits: 0 },
    isCached: () => false,
    async get<T>(pathWithQuery: string): Promise<T | null> {
      const hit = Object.prototype.hasOwnProperty.call(routes, pathWithQuery)
        ? pathWithQuery
        : Object.keys(routes)
            .sort((a, b) => b.length - a.length)
            .find((k) => pathWithQuery.startsWith(k));
      return hit ? (routes[hit] as T) : null;
    },
  };
}

describe("Guardia recursiva FD-16 · detección exhaustiva de fugas", () => {
  it("detecta llaves prohibidas, dominios bzzoiro.com/espncdn, api_key, hotlinks e IDs crudos en profundidad", () => {
    const poisoned = {
      nested: {
        items: [
          {
            providerEventId: RAW_EVENT_ID,
            deep: {
              textBz: "bzzoiro.com/img/team/1",
              textEspn: "a.espncdn.com/i/teamlogos/nba/500/bos.png",
              textApiKey: "query?api_key=abc123",
              textToken: `Authorization: Token ${SECRET_API_KEY}`,
              textProtoRel: "//a.espncdn.com/headshots/1.png",
              textWww: "www.bzzoiro.com/live",
              textConfianza: "Confianza 88",
              rawNumericId: RAW_PLAYER_ID_1,
              photo_url: POISON_BZ_URL,
            },
          },
        ],
      },
    };

    const violations = findFd16Violations(poisoned, SENTINELS);
    expect(violations.some((v) => v.includes("$.nested.items[0].providerEventId") && v.includes("llave prohibida"))).toBe(true);
    expect(violations.some((v) => v.includes("$.nested.items[0].providerEventId") && v.includes(String(RAW_EVENT_ID)))).toBe(true);
    expect(violations.some((v) => v.includes("dominio bzzoiro.com"))).toBe(true);
    expect(violations.some((v) => v.includes("dominio espncdn"))).toBe(true);
    expect(violations.some((v) => v.includes("parámetro api_key"))).toBe(true);
    expect(violations.some((v) => v.includes("token de autorización"))).toBe(true);
    expect(violations.some((v) => v.includes("hotlink protocol-relative"))).toBe(true);
    expect(violations.some((v) => v.includes("hotlink www."))).toBe(true);
    expect(violations.some((v) => v.includes("copy prohibido Confianza N"))).toBe(true);
    expect(violations.some((v) => v.includes("ID numérico centinela"))).toBe(true);
    expect(violations.some((v) => v.includes("photo_url"))).toBe(true);
  });

  it("limpia todos los payloads normalizados de fútbol (shotmap, averagePositions, playerStats, scoreboard, odds, árbitro, lineups, bajas, H2H, TV MX y bundle)", async () => {
    const poisonedStats: BzLiveStats = withRawNoise(
      {
        event_id: RAW_EVENT_ID,
        shotmap: [
          withRawNoise(
            {
              min: 23,
              home: true,
              type: "goal",
              xg: 0.44,
              pos: { x: 90, y: 51 },
              player_id: RAW_PLAYER_ID_1,
              player: { id: RAW_PLAYER_ID_1, name: `Henry Martín ${POISON_BZ_URL} ${POISON_ESPN_URL}` },
            },
            { photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY, external_id: "ext-raw-987654321" },
          ),
        ],
        average_positions: {
          home: [
            withRawNoise(
              {
                id: RAW_PLAYER_ID_1,
                player_id: RAW_PLAYER_ID_1,
                external_id: "ext-raw-987654321",
                player: { id: RAW_PLAYER_ID_1, name: `Álvaro Fidalgo ${POISON_WWW_URL}`, shirt_number: 8 },
                position: `CM ${POISON_ESPN_URL}`,
                average_x: 58.2,
                average_y: 46.1,
                touches: 74,
                photo_url: POISON_BZ_URL,
                image_url: POISON_ESPN_URL,
              },
              { api_key: SECRET_API_KEY, logo_url: POISON_BZ_URL },
            ),
          ],
          away: [
            withRawNoise(
              {
                id: RAW_PLAYER_ID_2,
                player_id: RAW_PLAYER_ID_2,
                player_name: `Sergio Canales ${POISON_BZ_URL}`,
                position: "AM",
                average_x: 63.1,
                average_y: 52.4,
                touches: 68,
                photo_url: POISON_ESPN_URL,
              },
              { api_key: SECRET_API_KEY },
            ),
          ],
        },
      },
      { api_key: SECRET_API_KEY, url: POISON_BZ_URL },
    );

    const poisonedPlayerStats = {
      home: [
        withRawNoise(
          {
            id: RAW_PLAYER_ID_1,
            player_id: RAW_PLAYER_ID_1,
            external_id: "ext-raw-987654321",
            player: { id: RAW_PLAYER_ID_1, name: `Henry Martín ${POISON_ESPN_URL}` },
            position: `ST ${POISON_BZ_URL}`,
            minutes_played: 85,
            rating: 8.3,
            goals: 1,
            photo_url: POISON_BZ_URL,
            image_url: POISON_ESPN_URL,
          },
          { api_key: SECRET_API_KEY },
        ),
      ],
    };

    const shotmap = parseBzzoiroShotmap(poisonedStats, poisonedPlayerStats);
    const avgPos = parseBzzoiroAveragePositions(poisonedStats, poisonedPlayerStats);
    const telemetry = extractBzzoiroMatchTelemetry(poisonedStats, poisonedPlayerStats);
    const playerRows = parsePlayerStats(poisonedPlayerStats);
    expect(shotmap.shots[0]?.playerName).toBe("Henry Martín");
    expect(avgPos.home[0]?.playerName).toBe("Álvaro Fidalgo");
    expect(avgPos.away[0]?.playerName).toBe("Sergio Canales");
    expect(playerRows[0]?.player).toBe("Henry Martín");
    assertFd16Strict({ shotmap, avgPos, telemetry, playerRows });

    const poisonedLiveEvent: BzLiveEvent = withRawNoise(
      {
        id: RAW_EVENT_ID,
        league_id: 19,
        home_team_id: RAW_TEAM_ID_HOME,
        away_team_id: RAW_TEAM_ID_AWAY,
        home_team: { id: RAW_TEAM_ID_HOME, name: `América ${POISON_ESPN_URL}` },
        away_team: { id: RAW_TEAM_ID_AWAY, name: `Guadalajara ${POISON_BZ_URL}` },
        status: "inprogress",
        period: "2nd_half",
        current_minute: 62,
        home_score: 2,
        away_score: 1,
        home_score_ht: 1,
        away_score_ht: 0,
        home_red_cards: 0,
        away_red_cards: 1,
        referee: { name: `César Ramos ${POISON_BZ_URL} ${POISON_ESPN_URL}` },
      },
      { api_key: SECRET_API_KEY, logo_url: POISON_BZ_URL, url: POISON_ESPN_URL },
    );
    const scoreboardEntry = toScoreboardEntry(poisonedLiveEvent, "mx-ame-chi-opaque", "liga-mx", "2026-11-22T02:00:00Z");
    expect(scoreboardEntry.referee).toBe("César Ramos");
    assertFd16Strict(scoreboardEntry);

    const freshCapturedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const staleCapturedAt = new Date(Date.now() - 80 * 3_600_000).toISOString();
    const poisonedOdds = {
      event_id: RAW_EVENT_ID,
      api_key: SECRET_API_KEY,
      comparisons: [
        {
          market: "1x2",
          outcome: "home",
          home_team: `América ${POISON_BZ_URL}`,
          away_team: `Guadalajara ${POISON_ESPN_URL}`,
          bookmakers: [
            { bookmaker_id: RAW_BOOKMAKER_ID, bookmaker_slug: "pinnacle", decimal_odds: 1.9, opening_odds: 2.02, updated_at: freshCapturedAt, url: POISON_BZ_URL, api_key: SECRET_API_KEY },
            { bookmaker_id: RAW_BOOKMAKER_ID + 1, bookmaker_slug: "codere", decimal_odds: 1.93, opening_odds: 2.04, updated_at: freshCapturedAt, photo_url: POISON_ESPN_URL },
            { bookmaker_id: RAW_BOOKMAKER_ID + 2, bookmaker_slug: "caliente", decimal_odds: 1.95, opening_odds: 2.05, updated_at: freshCapturedAt },
            { bookmaker_id: RAW_BOOKMAKER_ID + 3, bookmaker_slug: "betfair", decimal_odds: 1.97, opening_odds: 2.05, updated_at: freshCapturedAt },
          ],
        },
      ],
    };
    const oddsComparison = parseBzzoiroOddsComparison(poisonedOdds, { modelProbsByKey: { "1x2|null|home": 0.55 } });
    const poisonedBestOddsPayload = {
      results: [
        {
          event_id: RAW_EVENT_ID,
          home_team: `América ${POISON_ESPN_URL}`,
          away_team: `Guadalajara ${POISON_WWW_URL}`,
          event_date: "2026-11-22T02:00:00Z",
          market: "1x2",
          best_odds: {
            home: { bookmaker_id: RAW_BOOKMAKER_ID, bookmaker_slug: "betcris", decimal_odds: 1.96, opening_odds: 2.1, updated_at: freshCapturedAt, url: POISON_BZ_URL, api_key: SECRET_API_KEY },
          },
        },
      ],
    };
    const bestOdds = parseBzzoiroBestOdds(poisonedBestOddsPayload, {
      modelProbsByKey: { "1x2|null|home": 0.55 },
    });
    expect(oddsComparison).toHaveLength(1);
    expect(oddsComparison[0]?.books.map((b) => b.book)).toEqual(["codere", "pinnacle"]);
    expect(bestOdds).toHaveLength(1);
    expect(bestOdds[0]?.matchLabel).toBe("América vs Guadalajara");
    expect(bestOdds[0]?.fairOdds).toBeCloseTo(1 / 0.55, 2);
    // Licencia Bzzoiro v4.0 + frescura <= 72h: sin probabilidad Spacetime válida o sin/con timestamp obsoleto se descarta fail-closed.
    expect(parseBzzoiroOddsComparison(poisonedOdds)).toEqual([]);
    expect(parseBzzoiroBestOdds(poisonedBestOddsPayload)).toEqual([]);
    expect(
      parseBzzoiroOddsComparison(
        {
          comparisons: [
            {
              market: "1x2",
              outcome: "home",
              bookmakers: [{ bookmaker_slug: "pinnacle", decimal_odds: 1.9, opening_odds: 2.02 }],
            },
          ],
        },
        { modelProbsByKey: { "1x2|null|home": 0.55 } },
      ),
    ).toEqual([]);
    expect(
      parseBzzoiroBestOdds(
        {
          results: [
            {
              home_team: "América",
              away_team: "Guadalajara",
              market: "1x2",
              best_odds: { home: { bookmaker_slug: "betcris", decimal_odds: 1.96, updated_at: staleCapturedAt } },
            },
          ],
        },
        { modelProbsByKey: { "1x2|null|home": 0.55 } },
      ),
    ).toEqual([]);
    assertFd16Strict({ oddsComparison, bestOdds });

    const poisonedReferee = withRawNoise(
      {
        id: RAW_REF_ID,
        name: `César Arturo Ramos ${POISON_BZ_URL}`,
        country: `México ${POISON_ESPN_URL}`,
        matches: 40,
        avg_yellow_per_match: 5.3,
        avg_fouls_per_match: 26.4,
      },
      { referee_id: RAW_REF_ID, photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY },
    );
    const refProfile = parseBzzoiroRefereeProfile(poisonedReferee);
    expect(refProfile?.name).toBe("César Arturo Ramos");
    expect(refProfile?.country).toBe("México");

    const poisonedXi = Array.from({ length: 11 }, (_, i) =>
      withRawNoise(
        {
          id: RAW_PLAYER_ID_1 + i,
          name: `Titular ${i + 1} ${POISON_ESPN_URL}`,
          position: i === 0 ? `GK ${POISON_WWW_URL}` : "MF",
          shirt_number: i + 1,
        },
        { photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY, external_id: "ext-raw-987654321" },
      ),
    );
    const lineup = parseBzzoiroLineupNormalized(
      withRawNoise(
        {
          event_id: RAW_EVENT_ID,
          lineup_status: "confirmed",
          confidence: 92,
          lineups: {
            home: { formation: `4-3-3 ${POISON_BZ_URL}`, players: poisonedXi },
            away: { formation: `4-4-2 ${POISON_ESPN_URL}`, players: poisonedXi },
          },
        },
        { api_key: SECRET_API_KEY, url: POISON_BZ_URL },
      ),
      "2026-11-20T18:00:00Z",
    );
    expect(lineup.home.formation).toBe("4-3-3");
    expect(lineup.home.starters[0]?.playerName).toBe("Titular 1");

    const availability = parseBzzoiroEventAvailability({
      home: [
        withRawNoise(
          {
            id: RAW_PLAYER_ID_1,
            player_id: RAW_PLAYER_ID_1,
            name: `Rodri ${POISON_BZ_URL}`,
            position: `CDM ${POISON_ESPN_URL}`,
            status: "injured",
            injury_type: `Rodilla ${POISON_WWW_URL}`,
            expected_return: "2027-01-10T00:00:00Z",
            is_starter: true,
          },
          { photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY },
        ),
      ],
      away: [],
    });
    expect(availability.home[0]).toMatchObject({ playerName: "Rodri", position: "CDM", injuryType: "Rodilla", returnDate: "2027-01-10" });

    const h2h = parseBzzoiroH2h(
      {
        matches: [
          withRawNoise(
            {
              id: RAW_EVENT_ID,
              event_id: RAW_EVENT_ID,
              event_date: "2026-04-12T15:00:00Z",
              home_team: { id: RAW_TEAM_ID_HOME, name: `América ${POISON_ESPN_URL}` },
              away_team: { id: RAW_TEAM_ID_AWAY, name: `Guadalajara ${POISON_BZ_URL}` },
              home_score: 2,
              away_score: 1,
              league: { id: 19, name: `Liga MX ${POISON_WWW_URL}` },
            },
            { api_key: SECRET_API_KEY, logo_url: POISON_ESPN_URL },
          ),
        ],
      },
      { homeTeamName: "América", awayTeamName: "Guadalajara" },
    );
    expect(h2h.matches[0]).toMatchObject({ homeTeam: "América", awayTeam: "Guadalajara", competition: "Liga MX" });

    const broadcasts = parseBroadcastsMx({
      results: [
        { channel: `TUDN ${POISON_BZ_URL}`, country_code: "MX", url: POISON_BZ_URL },
        { channel: POISON_ESPN_URL, country_code: "MX" },
        { broadcaster: POISON_WWW_URL, country_code: "MX" },
        { name: "ViX+", country_code: "MX", url: POISON_ESPN_URL },
      ],
    });
    expect(broadcasts).toEqual(["TUDN", "ViX+"]);

    const poisonedEvent = withRawNoise(
      {
        id: RAW_EVENT_ID,
        league_id: 19,
        season_id: 1309,
        home_team_id: RAW_TEAM_ID_HOME,
        home_team: "América",
        away_team_id: RAW_TEAM_ID_AWAY,
        away_team: "Guadalajara",
        home_team_logo: POISON_ESPN_URL,
        away_team_logo: POISON_BZ_URL,
        league_logo: POISON_BZ_URL,
        logo_url: POISON_ESPN_URL,
        image_url: POISON_BZ_URL,
        referee_id: RAW_REF_ID,
        venue_id: 505,
        event_date: "2026-11-22T02:00:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        weather: { description: `Despejado ${POISON_BZ_URL}`, temperature_c: 21, wind_speed: 12 },
        is_local_derby: true,
      },
      { api_key: SECRET_API_KEY },
    );
    const matchContext = parseBzzoiroMatchContext(
      poisonedEvent,
      { results: [{ channel: `TUDN ${POISON_ESPN_URL}`, country_code: "MX", url: POISON_BZ_URL }] },
      poisonedReferee,
    );
    expect(matchContext?.weather?.description).toBe("Despejado");
    assertFd16Strict({ refProfile, lineup, availability, h2h, broadcasts, matchContext });

    const mockClient = createMockClient({
      [`/events/${RAW_EVENT_ID}/`]: poisonedEvent,
      [`/referees/${RAW_REF_ID}/`]: poisonedReferee,
      [`/events/${RAW_EVENT_ID}/lineups/`]: {
        event_id: RAW_EVENT_ID,
        lineup_status: "confirmed",
        lineups: { home: { formation: "4-3-3", players: poisonedXi }, away: { formation: "4-4-2", players: poisonedXi } },
      },
      [`/events/${RAW_EVENT_ID}/availability/`]: { home: [{ player_id: RAW_PLAYER_ID_1, name: `Rodri ${POISON_BZ_URL}`, status: "injured" }], away: [] },
      [`/events/${RAW_EVENT_ID}/h2h/`]: { matches: [{ event_id: RAW_EVENT_ID, date: "2026-04-12", home_team: "América", away_team: "Guadalajara", home_score: 2, away_score: 1 }] },
      [`/events/${RAW_EVENT_ID}/broadcasts/?country_code=MX`]: { results: [{ channel: "TUDN", country_code: "MX", url: POISON_BZ_URL }] },
      [`/events/${RAW_EVENT_ID}/stats/`]: poisonedStats,
      [`/events/${RAW_EVENT_ID}/player-stats/`]: poisonedPlayerStats,
    });
    const fullBundle = await fetchBzzoiroFullPreMatchBundle(mockClient, { providerEventId: RAW_EVENT_ID });
    const fullTelemetry = await fetchBzzoiroMatchTelemetry(mockClient, RAW_EVENT_ID);
    assertFd16Strict({ fullBundle, fullTelemetry });
  });

  it("limpia todos los payloads normalizados NBA (/basketball/api/v2/) contra IDs, bzzoiro.com, espncdn, api_key y hotlinks", () => {
    const poisonedStandingsRaw: BzNbaStandingRowRaw[] = [
      withRawNoise(
        {
          team: withRawNoise(
            { id: RAW_TEAM_ID_HOME, name: "Boston Celtics" },
            { logo_url: POISON_ESPN_URL, photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY },
          ),
          wins: 15,
          losses: 3,
          points_for: 2140,
          points_against: 1910,
        },
        { external_id: "ext-raw-987654321", team_id: RAW_TEAM_ID_HOME, url: POISON_BZ_URL },
      ),
    ];
    const standings = parseBzzoiroNbaStandings(poisonedStandingsRaw);
    expect(standings).toHaveLength(1);
    assertFd16Strict(standings);

    const poisonedBoxRaw: BzNbaBoxScoreRaw = withRawNoise(
      {
        team_stats: {
          home: { fg_pct: 49.5, rebounds: 46, pace: 100.2 },
          away: { fg_pct: 44.1, rebounds: 39, pace: 98.4 },
        },
        players: {
          home: [
            withRawNoise(
              {
                id: RAW_PLAYER_ID_1,
                player_id: RAW_PLAYER_ID_1,
                external_id: "ext-raw-987654321",
                player: { id: RAW_PLAYER_ID_1, name: `Jayson Tatum ${POISON_ESPN_URL}`, position: `SF ${POISON_BZ_URL}` },
                starter: true,
                minutes: "36:30",
                points: 31,
                rebounds: 9,
                assists: 6,
                three_pointers_made: 5,
                photo_url: POISON_BZ_URL,
              },
              { image_url: POISON_ESPN_URL, api_key: SECRET_API_KEY },
            ),
          ],
          away: [],
        },
      },
      { event_id: RAW_EVENT_ID, api_key: SECRET_API_KEY },
    );
    const boxDetail = parseBzzoiroNbaBoxScoreDetail(poisonedBoxRaw);
    expect(boxDetail.players.home[0]).toMatchObject({ playerName: "Jayson Tatum", position: "SF" });
    assertFd16Strict(boxDetail);

    const poisonedPregameRaw: BzNbaPregameRaw = withRawNoise(
      {
        event_id: RAW_EVENT_ID,
        officials: [{ id: RAW_REF_ID, name: `Scott Foster ${POISON_BZ_URL}` }],
        rest_days: { home: 2, away: 0 },
        injuries: {
          home: [
            withRawNoise(
              {
                id: RAW_PLAYER_ID_1,
                player_id: RAW_PLAYER_ID_1,
                name: `Kristaps Porzingis ${POISON_ESPN_URL}`,
                position: `C ${POISON_WWW_URL}`,
                status: "Out",
                injury_type: `Tobillo ${POISON_BZ_URL}`,
                expected_return: `2026-12-01 ${POISON_ESPN_URL}`,
              },
              { photo_url: POISON_BZ_URL, api_key: SECRET_API_KEY },
            ),
          ],
          away: [],
        },
        notes: [`Back-to-back visitante ${POISON_BZ_URL} ${POISON_ESPN_URL} ${POISON_WWW_URL}`],
      },
      { api_key: SECRET_API_KEY, url: POISON_BZ_URL },
    );
    const pregame = parseBzzoiroNbaPregame(poisonedPregameRaw);
    expect(pregame?.officials).toEqual(["Scott Foster"]);
    expect(pregame?.injuries.home[0]).toMatchObject({ playerName: "Kristaps Porzingis", injuryType: "Tobillo", returnDate: "2026-12-01" });
    expect(pregame?.notes).toEqual(["Back-to-back visitante"]);
    assertFd16Strict(pregame);

    const freshNbaCapturedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const staleNbaCapturedAt = new Date(Date.now() - 80 * 3_600_000).toISOString();
    const poisonedNbaOdds: BzNbaOddsRowRaw[] = [
      withRawNoise(
        {
          event_id: RAW_EVENT_ID,
          market: "moneyline",
          outcome: "home",
          bookmaker_slug: "pinnacle",
          decimal_odds: 1.54,
          opening_odds: 1.65,
          updated_at: freshNbaCapturedAt,
        },
        { bookmaker_id: RAW_BOOKMAKER_ID, api_key: SECRET_API_KEY, url: POISON_BZ_URL },
      ),
      withRawNoise(
        {
          event_id: RAW_EVENT_ID,
          market: "moneyline",
          outcome: "home",
          bookmaker_slug: "betfair",
          decimal_odds: 1.6,
          updated_at: freshNbaCapturedAt,
        },
        { bookmaker_id: RAW_BOOKMAKER_ID + 1, api_key: SECRET_API_KEY, url: POISON_BZ_URL },
      ),
    ];
    const nbaOddsComp = parseBzzoiroNbaOddsComparison(poisonedNbaOdds, { modelProbsByKey: { "moneyline|null|home": 0.67 } });
    expect(nbaOddsComp).toHaveLength(1);
    expect(nbaOddsComp[0]?.books.map((b) => b.book)).toEqual(["pinnacle"]);
    // Fail-closed ante timestamp ausente o > 72h (sin lanzar RangeError):
    expect(
      parseBzzoiroNbaOddsComparison(
        [{ market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.54 }],
        { modelProbsByKey: { "moneyline|null|home": 0.67 } },
      ),
    ).toEqual([]);
    expect(
      parseBzzoiroNbaOddsComparison(
        [{ market: "moneyline", outcome: "home", bookmaker_slug: "pinnacle", decimal_odds: 1.54, updated_at: staleNbaCapturedAt }],
        { modelProbsByKey: { "moneyline|null|home": 0.67 } },
      ),
    ).toEqual([]);
    assertFd16Strict(nbaOddsComp);

    const poisonedPlayerGames: BzNbaPlayerGameRaw[] = [
      withRawNoise(
        {
          id: RAW_EVENT_ID,
          event_id: RAW_EVENT_ID,
          game_id: `ext-raw-${RAW_EVENT_ID}`,
          game_date: "2026-11-18",
          opponent: { id: RAW_TEAM_ID_AWAY, name: `Miami Heat ${POISON_ESPN_URL}`, abbreviation: `MIA ${POISON_BZ_URL}` },
          score: `115-102 ${POISON_WWW_URL}`,
          result: "W",
          minutes: "35:00",
          points: 30,
          rebounds: 8,
          assists: 6,
          three_pointers_made: 4,
        },
        { api_key: SECRET_API_KEY, photo_url: POISON_BZ_URL },
      ),
      { id: RAW_EVENT_ID + 1, event_id: RAW_EVENT_ID + 1, game_date: "2026-11-16", opponent: "Knicks", minutes: "34:00", points: 28, rebounds: 9, assists: 5, three_pointers_made: 3 },
      { id: RAW_EVENT_ID + 2, event_id: RAW_EVENT_ID + 2, game_date: "2026-11-14", opponent: "76ers", minutes: "36:00", points: 32, rebounds: 7, assists: 7, three_pointers_made: 5 },
    ];
    const nbaGames = parseBzzoiroNbaPlayerGames(poisonedPlayerGames);
    expect(nbaGames[0]).toMatchObject({ opponent: "Miami Heat", opponentAbbr: "MIA", score: "115-102" });
    assertFd16Strict(nbaGames);

    const nbaProps = buildGuardedNbaPlayerPropSeeds({
      player: `Jayson Tatum ${POISON_ESPN_URL} ${POISON_BZ_URL}`,
      teamSlug: "boston-celtics",
      teamName: `Boston Celtics ${POISON_WWW_URL}`,
      position: `SF ${POISON_BZ_URL}`,
      games: poisonedPlayerGames,
    });
    expect(nbaProps.length).toBeGreaterThan(0);
    expect(nbaProps[0]).toMatchObject({ player: "Jayson Tatum", teamName: "Boston Celtics", position: "SF" });
    assertFd16Strict(nbaProps);
  });
});

describe("Aislamiento de credenciales BZZOIRO_API_KEY en cliente HTTP y configuración", () => {
  let cacheDir = "";
  afterEach(() => {
    if (cacheDir) {
      rmSync(cacheDir, { recursive: true, force: true });
      cacheDir = "";
    }
  });

  it("nunca expone BZZOIRO_API_KEY en URLs ni en describeProviders y honra BZZOIRO_UNLIMITED=1", async () => {
    const env = { BZZOIRO_API_KEY: SECRET_API_KEY, BZZOIRO_UNLIMITED: "1" };
    const summary = describeProviders(env).find((p) => p.id === "bzzoiro");
    expect(summary?.enabled).toBe(true);
    expect(summary?.key).toBe("cargada (…8877)");
    expect(JSON.stringify(summary)).not.toContain(SECRET_API_KEY);

    cacheDir = mkdtempSync(join(tmpdir(), "pl-bz-fd16-"));
    const observedCalls: Array<{ url: string; auth: string | null }> = [];
    const cfg = readProviderConfigs(env).bzzoiro;
    expect(cfg.unlimitedQuota).toBe(true);

    const client = createProviderClient(cfg, {
      cacheDir,
      minIntervalMs: 0,
      maxRequests: 1,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        observedCalls.push({
          url: String(url),
          auth: new Headers(init?.headers).get("authorization"),
        });
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as typeof fetch,
    });

    await client.get("/events/?league_id=19", { cache: false });
    await client.get("/basketball/api/v2/standings/?league=1", { cache: false });

    expect(observedCalls).toHaveLength(2);
    for (const call of observedCalls) {
      expect(call.auth).toBe(`Token ${SECRET_API_KEY}`);
      expect(call.url).not.toContain(SECRET_API_KEY);
      expect(call.url.toLowerCase()).not.toContain("api_key");
    }
  });
});
