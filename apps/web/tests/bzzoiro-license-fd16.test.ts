import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import type {
  BzNbaPlayerGameRaw,
  NbaPlayerPropSeed,
} from "@pitchlab/ingest/providers/bzzoiro-nba-rich";
import type { PlayerProfileData } from "@pitchlab/ui/team-profile";
import type { PlatformMarketRow } from "@pitchlab/ui/types";
import sitemap from "../app/sitemap";
import {
  RELEVANT_COMPARISON_BOOKS,
  buildMarketRowComparison,
  classifyQuoteMovement,
  fetchBzzoiroBestOddsWithSpacetime,
  fetchBzzoiroEventComparisonWithSpacetime,
  parseBzzoiroBestOddsPayload,
  parseBzzoiroComparisonPayload,
} from "../src/server/book-quotes";
import {
  JsonLd,
  buildPricingPageJsonLd,
  buildSportsEventJsonLd,
  buildSportsEventListJsonLd,
  isCleanPublicCanonicalPath,
  resolveSportsEventStatus,
  sanitizeCanonicalPublicUrl,
  sanitizeFirstPartyAssetUrl,
} from "../src/server/json-ld";
import {
  buildNbaPlayerProfileBridgeFromBzzoiro,
  buildNbaPropsBridgeFromPlayerGames,
  hydratePlayerLivePerformance,
  loadNbaGuardedPropsBridge,
} from "../src/server/player-live-stats";

const FORBIDDEN_FD16_RE =
  /(?:bzzoiro|espncdn|sofascore|sportmonks|api-football|api-sports|flagcdn|understat|polymarket|kalshi)/i;
const RAW_PROVIDER_NUMERIC_ID_RE = /(?:^|\/|[-_])\d{5,}(?=\/|$)/;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FD-16 · Sitemap público y datos estructurados JSON-LD (SportsEvent)", () => {
  it("sitemap.ts publica solo rutas canónicas limpias con 0 fugas FD-16, sin rutas privadas ni IDs de proveedor", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://pitchlab.mx");

    const entries = await sitemap();
    expect(entries.length).toBeGreaterThanOrEqual(10);

    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);

    expect(urls).toContain("https://pitchlab.mx/");
    expect(urls).toContain("https://pitchlab.mx/resultados");
    expect(urls).toContain("https://pitchlab.mx/motores");
    expect(urls).toContain("https://pitchlab.mx/precio");
    expect(urls).toContain("https://pitchlab.mx/blog");
    expect(urls).toContain("https://pitchlab.mx/legal/privacidad");
    expect(urls).toContain("https://pitchlab.mx/legal/terminos");
    expect(urls).toContain("https://pitchlab.mx/legal/juego-responsable");
    expect(urls).toContain("https://pitchlab.mx/legal/creditos");
    expect(urls).toContain("https://pitchlab.mx/blog/que-es-el-momio-justo");

    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://pitchlab.mx");
      expect(parsed.search).toBe("");
      expect(parsed.hash).toBe("");
      expect(isCleanPublicCanonicalPath(parsed.pathname)).toBe(true);
      expect(url).not.toMatch(FORBIDDEN_FD16_RE);
      expect(parsed.pathname).not.toMatch(RAW_PROVIDER_NUMERIC_ID_RE);
      expect(parsed.pathname).not.toMatch(
        /^\/(?:app|api|login|signup|onboarding|p|i|offline)(?:\/|$)/i,
      );
    }
  });

  it("json-ld.tsx emite SportsEvent con EventScheduled en NS/LIVE y EventCompleted sin EventScheduled en FT", () => {
    const siteUrl = "https://pitchlab.mx";

    expect(resolveSportsEventStatus("NS")).toEqual({
      phase: "scheduled",
      schemaEventStatus: "https://schema.org/EventScheduled",
      completionLabel: "EventScheduled",
    });
    expect(resolveSportsEventStatus("FT")).toEqual({
      phase: "completed",
      schemaEventStatus: null,
      completionLabel: "EventCompleted",
    });

    const scheduled = buildSportsEventJsonLd(
      {
        sport: "Football",
        leagueName: "Liga MX",
        canonicalPath: "/resultados/liga-mx/america-vs-chivas",
        kickoffUtc: "2026-11-22T03:00:00Z",
        status: "NS",
        homeTeam: {
          name: "Club América",
          canonicalPath: "/resultados/liga-mx",
          logoPath: "/brand/teams/america.svg",
        },
        awayTeam: {
          name: "Guadalajara",
          logoPath: "/brand/teams/chivas.svg",
        },
        venueName: "Estadio Ciudad de los Deportes",
      },
      siteUrl,
    );

    expect(scheduled["@context"]).toBe("https://schema.org");
    expect(scheduled["@type"]).toBe("SportsEvent");
    expect(scheduled.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(scheduled.url).toBe("https://pitchlab.mx/resultados/liga-mx/america-vs-chivas");
    expect(scheduled.endDate).toBeUndefined();
    expect(scheduled.winner).toBeUndefined();
    expect(scheduled.additionalProperty).toEqual(
      expect.arrayContaining([
        {
          "@type": "PropertyValue",
          name: "eventCompletionStatus",
          value: "EventScheduled",
        },
      ]),
    );

    const live = buildSportsEventJsonLd(
      {
        sport: "Football",
        leagueName: "Liga MX",
        kickoffUtc: "2026-11-22T03:00:00Z",
        status: "LIVE",
        homeTeam: { name: "Club América" },
        awayTeam: { name: "Guadalajara" },
        score: { home: 1, away: 0 },
      },
      siteUrl,
    );
    expect(live.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(live.additionalProperty).toEqual(
      expect.arrayContaining([
        {
          "@type": "PropertyValue",
          name: "eventCompletionStatus",
          value: "EventInProgress",
        },
        {
          "@type": "PropertyValue",
          name: "liveScore",
          value: "1-0",
        },
      ]),
    );

    const completed = buildSportsEventJsonLd(
      {
        sport: "Football",
        leagueName: "Liga MX",
        canonicalPath: "/resultados/liga-mx/america-vs-chivas",
        kickoffUtc: "2026-11-20T03:00:00Z",
        status: "FT",
        homeTeam: { name: "Club América" },
        awayTeam: { name: "Guadalajara" },
        score: { home: 2, away: 1 },
      },
      siteUrl,
    );

    // En partidos FT jamás emite `EventScheduled`; declara `endDate`, `winner` y `EventCompleted`.
    expect("eventStatus" in completed).toBe(false);
    expect(typeof completed.endDate).toBe("string");
    expect(Date.parse(String(completed.endDate))).toBeGreaterThan(
      Date.parse("2026-11-20T03:00:00Z"),
    );
    expect(completed.winner).toMatchObject({ "@type": "SportsTeam", name: "Club América" });
    expect(completed.additionalProperty).toEqual(
      expect.arrayContaining([
        {
          "@type": "PropertyValue",
          name: "eventCompletionStatus",
          value: "EventCompleted",
        },
        {
          "@type": "PropertyValue",
          name: "finalScore",
          value: "2-1",
        },
      ]),
    );

    const completedDraw = buildSportsEventJsonLd(
      {
        sport: "Football",
        kickoffUtc: "2026-11-20T03:00:00Z",
        status: "FT",
        homeTeam: { name: "Club América" },
        awayTeam: { name: "Guadalajara" },
        score: { home: 1, away: 1 },
      },
      siteUrl,
    );
    expect("eventStatus" in completedDraw).toBe(false);
    expect(completedDraw.winner).toBeUndefined();
  });

  it("json-ld.tsx bloquea bzzoiro, espncdn, hotlinks externos, rutas privadas e IDs crudos de proveedor (0 FD-16) y escapa HTML", () => {
    const siteUrl = "https://pitchlab.mx";

    expect(isCleanPublicCanonicalPath("/resultados/2026-11-20/america-vs-chivas")).toBe(true);
    expect(isCleanPublicCanonicalPath("/resultados/bzzoiro-fixture")).toBe(false);
    expect(isCleanPublicCanonicalPath("/resultados/espncdn-logo")).toBe(false);
    expect(isCleanPublicCanonicalPath("/resultados/america-vs-chivas-602407")).toBe(false);
    expect(isCleanPublicCanonicalPath("/app/liga-mx")).toBe(false);

    expect(sanitizeCanonicalPublicUrl("https://sports.bzzoiro.com/events/602407", siteUrl)).toBeNull();
    expect(sanitizeCanonicalPublicUrl("/resultados?bzzoiro_id=602407", siteUrl)).toBeNull();
    expect(sanitizeCanonicalPublicUrl("/resultados/evento-37250424", siteUrl)).toBeNull();
    expect(
      sanitizeFirstPartyAssetUrl("https://a.espncdn.com/i/teamlogos/nba/500/bos.png", siteUrl),
    ).toBeNull();
    expect(
      sanitizeFirstPartyAssetUrl("https://sports.bzzoiro.com/media/19621792.png", siteUrl),
    ).toBeNull();
    expect(sanitizeFirstPartyAssetUrl("/brand/teams/602407.png", siteUrl)).toBeNull();
    expect(sanitizeFirstPartyAssetUrl("/brand/teams/america.svg", siteUrl)).toBe(
      "https://pitchlab.mx/brand/teams/america.svg",
    );

    const hostileList = buildSportsEventListJsonLd(
      [
        {
          sport: "Football",
          leagueName: "Liga MX",
          canonicalPath: "/resultados/bzzoiro-partido-602407",
          kickoffUtc: "2026-11-22T03:00:00Z",
          status: "NS",
          homeTeam: {
            name: "Club América",
            canonicalPath: "/app/liga-mx/t/america",
            logoPath: "https://a.espncdn.com/i/teamlogos/soccer/500/227.png",
          },
          awayTeam: {
            name: "Guadalajara",
            canonicalPath: "https://sports.bzzoiro.com/team/19621792",
            logoPath: "https://sports.bzzoiro.com/media/19621792.png",
          },
        },
      ],
      siteUrl,
    );

    const serializedList = JSON.stringify(hostileList);
    expect(serializedList).not.toMatch(FORBIDDEN_FD16_RE);
    expect(serializedList).not.toContain("602407");
    expect(serializedList).not.toContain("19621792");
    expect(serializedList).not.toContain("/app/liga-mx");

    const pricingGraph = buildPricingPageJsonLd(siteUrl, {
      name: "Pase PitchLab Ultra",
      monthlyMxn: 299,
      annualMxn: 2390,
    });
    const serializedPricing = JSON.stringify(pricingGraph);
    expect(serializedPricing).not.toMatch(FORBIDDEN_FD16_RE);
    expect(serializedPricing).not.toMatch(/CLABE|SPEI/i);

    const html = renderToStaticMarkup(
      React.createElement(JsonLd, {
        data: { "@type": "Thing", name: "</script><script>alert(1)</script>" },
      }),
    );
    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("</script><script>");
  });
});

describe("Licencia Bzzoiro v4.0 y FD-16 · book-quotes.ts (valoración PitchLab sin feeds crudos ni URLs)", () => {
  it("mapea /events/{id}/odds/comparison/ a estructura de valoración PitchLab (modelProb, fairDecimal, edgePts, evPct) sin fugas FD-16", () => {
    const rawComparisonPayload = {
      event_id: 602407,
      provider_id: 998877,
      bzzoiro_url: "https://sports.bzzoiro.com/api/v2/events/602407/odds/comparison/",
      external_link: "https://a.espncdn.com/odds/602407",
      comparisons: [
        {
          event_id: 602407,
          market: "1x2",
          outcome: "home",
          line: null,
          bookmaker_slug: "pinnacle",
          decimal_odds: 1.94,
          opening_odds: 2.15,
          updated_at: "2026-11-20T15:00:00Z",
          affiliate_url: "https://book.example/pinnacle?aff=999",
        },
        {
          event_id: 602407,
          market: "1x2",
          outcome: "home",
          line: null,
          bookmaker_slug: "bet365",
          decimal_odds: 2.02,
          opening_odds: 2.18,
          updated_at: "2026-11-20T15:05:00Z",
          affiliate_url: "https://book.example/bet365?aff=999",
        },
        // Cuota en vivo: descartada del comparador prepartido.
        {
          event_id: 602407,
          market: "1x2",
          outcome: "home",
          line: null,
          bookmaker_slug: "codere",
          decimal_odds: 2.6,
          is_live: true,
        },
        // Casa fuera de la lista blanca relevante: descartada por defecto.
        {
          event_id: 602407,
          market: "1x2",
          outcome: "home",
          line: null,
          bookmaker_slug: "unlisted_offshore_book",
          decimal_odds: 2.95,
        },
      ],
    };

    const parsed = parseBzzoiroComparisonPayload(rawComparisonPayload, {
      modelProbsByKey: { "1x2|null|home": 0.56 },
    });

    expect(parsed).toHaveLength(1);
    const comp = parsed[0]!;
    expect(comp.market).toBe("1x2");
    expect(comp.selection).toBe("home");
    expect(comp.bestBook).toBe("bet365");
    expect(comp.bestBookLabel).toBe("Bet365");
    expect(comp.bestDecimal).toBe(2.02);
    expect(comp.pinnacleDecimal).toBe(1.94);
    expect(comp.signal).toBe("STEAM");
    expect(comp.books.map((b) => b.book)).toEqual(["bet365", "pinnacle"]);
    expect(comp.books.every((b) => RELEVANT_COMPARISON_BOOKS.has(b.book))).toBe(true);

    // Anclaje obligatorio a valoración PitchLab Spacetime v5.1:
    expect(comp.modelProb).toBe(0.56);
    expect(comp.fairDecimal).toBeCloseTo(1 / 0.56, 2);
    expect(comp.edgePts).toBeCloseTo((0.56 - 1 / 2.02) * 100, 1);
    expect(comp.evPct).toBeCloseTo((0.56 * 2.02 - 1) * 100, 1);

    // Cero redistribución de feed crudo, IDs de proveedor ni URLs externas:
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toMatch(FORBIDDEN_FD16_RE);
    expect(serialized).not.toMatch(/https?:\/\/|www\./i);
    expect(serialized).not.toContain("602407");
    expect(serialized).not.toContain("998877");
    expect(serialized).not.toContain("event_id");
    expect(serialized).not.toContain("provider_id");
    expect(serialized).not.toContain("affiliate_url");
    expect(serialized).not.toContain("unlisted_offshore_book");
  });

  it("limpia URLs inyectadas en /odds/best/ y ancla cada cuota al modelo PitchLab vía fetch server-side", async () => {
    const rawBestPayload = {
      results: [
        {
          event_id: 884210,
          source_url: "https://sports.bzzoiro.com/api/v2/odds/best/",
          home_team: "Club América https://sports.bzzoiro.com/team/884210",
          away_team: { name: "Guadalajara www.espncdn.com/chivas" },
          event_date: "2026-11-22T03:00:00Z",
          market: "totals",
          line: 2.5,
          best_odds: {
            over: {
              bookmaker_slug: "pinnacle",
              decimal_odds: 1.98,
              opening_odds: 2.08,
              bookmaker_url: "https://pinnacle.example/redirect",
            },
          },
        },
      ],
    };

    const bestDirect = parseBzzoiroBestOddsPayload(rawBestPayload, {
      modelProbsByKey: { "totals|2.5|over": 0.55 },
    });
    expect(bestDirect).toHaveLength(1);
    expect(bestDirect[0]!.matchLabel).toBe("Club América vs Guadalajara");
    expect(bestDirect[0]!.book).toBe("pinnacle");
    expect(bestDirect[0]!.modelProb).toBe(0.55);
    expect(bestDirect[0]!.fairDecimal).toBeCloseTo(1 / 0.55, 2);
    expect(bestDirect[0]!.evPct).toBeCloseTo((0.55 * 1.98 - 1) * 100, 1);

    const directSerialized = JSON.stringify(bestDirect);
    expect(directSerialized).not.toMatch(FORBIDDEN_FD16_RE);
    expect(directSerialized).not.toMatch(/https?:\/\/|www\./i);
    expect(directSerialized).not.toContain("884210");

    // Fetch en servidor autenticado + caché + fail-closed en modo offline o sin clave:
    const seenAuthHeaders: string[] = [];
    const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      seenAuthHeaders.push(headers?.Authorization ?? "");
      return new Response(JSON.stringify(rawBestPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const fetchedBest = await fetchBzzoiroBestOddsWithSpacetime({
      market: "totals",
      modelProbsByKey: { "totals|2.5|over": 0.55 },
      fetchImpl: fakeFetch,
      env: { BZZOIRO_API_KEY: "token-server-only" },
    });
    expect(seenAuthHeaders).toEqual(["Token token-server-only"]);
    expect(fetchedBest).toHaveLength(1);
    expect(JSON.stringify(fetchedBest)).not.toMatch(FORBIDDEN_FD16_RE);
    expect(JSON.stringify(fetchedBest)).not.toMatch(/https?:\/\/|www\./i);

    let offlineCalls = 0;
    const offlineFetch = (async () => {
      offlineCalls += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect(
      await fetchBzzoiroEventComparisonWithSpacetime({
        providerEventId: 884211,
        modelProbsByKey: { "1x2|null|home": 0.55 },
        fetchImpl: offlineFetch,
        env: { PITCHLAB_OFFLINE: "1", BZZOIRO_API_KEY: "token-server-only" },
      }),
    ).toEqual([]);
    expect(
      await fetchBzzoiroEventComparisonWithSpacetime({
        providerEventId: 884212,
        modelProbsByKey: { "1x2|null|home": 0.55 },
        fetchImpl: offlineFetch,
        env: {},
      }),
    ).toEqual([]);
    expect(offlineCalls).toBe(0);

    // Comparativa desde `PlatformMarketRow` y clasificación determinista de movimiento.
    const row: PlatformMarketRow = {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "home",
      label: "Gana América",
      p: 0.57,
      fairDecimal: 1.75,
      fairAmerican: -133,
      openDecimal: 2.1,
      currentDecimal: 1.9,
      edgePts: 4.4,
      bookQuotes: [
        {
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimal: 1.9,
          openingDecimal: 2.1,
          capturedAtUtc: "2026-11-20T15:00:00Z",
        },
        {
          book: "bet365",
          bookLabel: "Bet365",
          decimal: 1.94,
          openingDecimal: 2.12,
          capturedAtUtc: "2026-11-20T15:05:00Z",
        },
      ],
    };
    const rowComparison = buildMarketRowComparison(row);
    expect(rowComparison).not.toBeNull();
    expect(rowComparison!.modelProb).toBe(0.57);
    expect(rowComparison!.fairDecimal).toBeCloseTo(1 / 0.57, 2);
    expect(rowComparison!.signal).toBe("STEAM");
    expect(
      classifyQuoteMovement({ openingDecimal: 2.1, currentDecimal: 1.9 }).signal,
    ).toBe("STEAM");
  });
});

describe("Licencia Bzzoiro v4.0 y FD-16 · player-live-stats.ts (puente NBA y perfiles sin fugas)", () => {
  const richNbaGames: BzNbaPlayerGameRaw[] = [
    {
      id: 910001,
      event_id: 602407,
      game_id: "bzzoiro_nba_888111",
      game_date: "2026-11-18T00:30:00Z",
      opponent: {
        id: 551122,
        name: "Boston Celtics https://sports.bzzoiro.com/basketball/team/551122",
        abbreviation: "BOS",
      },
      is_home: true,
      score: "118-112",
      result: "W",
      minutes: "34:30",
      points: 29,
      rebounds: 8,
      assists: 7,
      three_pointers_made: 3,
      ...({ photo_url: "https://a.espncdn.com/i/headshots/nba/players/full/3975.png" } as object),
    },
    {
      id: 910002,
      event_id: 602408,
      game_id: "bzzoiro_nba_888112",
      game_date: "2026-11-16T01:00:00Z",
      opponent: { id: 551123, name: "New York Knicks www.espncdn.com/nyk", abbreviation: "NYK" },
      is_home: false,
      score: "110-104",
      result: "W",
      minutes: "35:00",
      points: 26,
      rebounds: 6,
      assists: 8,
      three_pointers_made: 4,
    },
    {
      id: 910003,
      event_id: 602409,
      game_id: "bzzoiro_nba_888113",
      game_date: "2026-11-14T02:00:00Z",
      opponent: { id: 551124, name: "Miami Heat", abbreviation: "MIA" },
      is_home: true,
      score: "105-109",
      result: "L",
      minutes: "34:00",
      points: 24,
      rebounds: 7,
      assists: 5,
      three_pointers_made: 2,
    },
    {
      id: 910004,
      event_id: 602410,
      game_id: "bzzoiro_nba_888114",
      game_date: "2026-11-12T00:00:00Z",
      opponent: { id: 551125, name: "Milwaukee Bucks", abbreviation: "MIL" },
      is_home: false,
      score: "121-115",
      result: "W",
      minutes: "34:30",
      points: 31,
      rebounds: 9,
      assists: 6,
      three_pointers_made: 4,
    },
  ];

  it("normaliza perfil y props NBA con valoración PitchLab (pOver, fairOverDecimal) y 0 IDs/URLs crudas FD-16", () => {
    const profileBridge = buildNbaPlayerProfileBridgeFromBzzoiro({
      player: "Jayson Tatum",
      teamSlug: "nba.boston-celtics",
      teamName: "Boston Celtics",
      position: "SF",
      games: richNbaGames,
    });

    expect(profileBridge.appearances).toBe(4);
    expect(profileBridge.avgMinutes).toBeCloseTo(34.5, 1);
    expect(profileBridge.seasonMetrics.length).toBeGreaterThan(0);
    expect(profileBridge.recentGames).toHaveLength(4);
    expect(profileBridge.recentGames[0]!.opponent).toBe("Boston Celtics");
    expect(profileBridge.recentGames[1]!.opponent).toBe("New York Knicks");
    expect(profileBridge.guardedProps.length).toBeGreaterThan(0);

    for (const prop of profileBridge.guardedProps) {
      expect(prop.pOver).toBeGreaterThanOrEqual(0.08);
      expect(prop.pOver).toBeLessThanOrEqual(0.92);
      expect(prop.pUnder).toBeGreaterThanOrEqual(0.08);
      expect(prop.pUnder).toBeLessThanOrEqual(0.92);
      expect(prop.pOver + prop.pUnder).toBeCloseTo(1, 2);
      expect(prop.fairOverDecimal).toBeGreaterThanOrEqual(1.05);
      expect(prop.fairUnderDecimal).toBeGreaterThanOrEqual(1.05);
      expect(prop.fairOverDecimal).toBeCloseTo(1 / prop.pOver, 1);
      expect(prop.availabilityStatus).toBe("available");
    }

    const serialized = JSON.stringify(profileBridge);
    expect(serialized).not.toMatch(FORBIDDEN_FD16_RE);
    expect(serialized).not.toMatch(/https?:\/\/|www\./i);
    expect(serialized).not.toContain("910001");
    expect(serialized).not.toContain("602407");
    expect(serialized).not.toContain("888111");
    expect(serialized).not.toContain("551122");
    expect(serialized).not.toContain("3975");
  });

  it("aplica guardia minMinutes (>= 18) y exclusión de bajas confirmadas en buildNbaPropsBridgeFromPlayerGames y loadNbaGuardedPropsBridge", () => {
    const lowMinutesGames: BzNbaPlayerGameRaw[] = richNbaGames.map((g) => ({
      ...g,
      minutes: "11:00",
    }));

    expect(
      buildNbaPropsBridgeFromPlayerGames({
        player: "Suplente NBA",
        teamSlug: "boston-celtics",
        teamName: "Boston Celtics",
        games: lowMinutesGames,
      }),
    ).toEqual([]);

    expect(
      buildNbaPropsBridgeFromPlayerGames({
        player: "Jayson Tatum",
        teamSlug: "boston-celtics",
        teamName: "Boston Celtics",
        games: richNbaGames,
        injuries: [
          {
            teamSlug: "boston-celtics",
            player: "Jayson Tatum",
            status: "Baja",
            detail: "Lesión de tobillo",
          },
        ],
      }),
    ).toEqual([]);

    const doubtfulProps = buildNbaPropsBridgeFromPlayerGames({
      player: "Jayson Tatum",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      games: richNbaGames,
      injuries: [
        {
          teamSlug: "boston-celtics",
          player: "Jayson Tatum",
          status: "Duda",
          detail: "Evaluación previa al salto",
        },
      ],
    });
    expect(doubtfulProps.length).toBeGreaterThan(0);
    expect(
      doubtfulProps.every(
        (p) =>
          p.availabilityStatus === "doubtful" &&
          p.injuryNote === "Evaluación previa al salto",
      ),
    ).toBe(true);

    const seeds: NbaPlayerPropSeed[] = [
      {
        player: "Titular Activo",
        teamSlug: "nba.boston-celtics",
        teamName: "Boston Celtics",
        position: "SG",
        statKey: "pts",
        statLabel: "Puntos anotados",
        baseLine: 22.5,
        projectionMean: 24.4,
        projectionSd: 4.8,
        last10: [25, 22, 27, 24, 21],
        avgMinutes: 33.2,
        sampleGames: 5,
      },
      {
        player: "Banca Corta",
        teamSlug: "nba.boston-celtics",
        teamName: "Boston Celtics",
        position: "PG",
        statKey: "pts",
        statLabel: "Puntos anotados",
        baseLine: 6.5,
        projectionMean: 7.2,
        projectionSd: 2.5,
        last10: [8, 6, 7, 8, 7],
        avgMinutes: 12.0,
        sampleGames: 5,
      },
      {
        player: "Descartado Oficial",
        teamSlug: "nba.boston-celtics",
        teamName: "Boston Celtics",
        position: "C",
        statKey: "reb",
        statLabel: "Rebotes totales",
        baseLine: 9.5,
        projectionMean: 10.6,
        projectionSd: 2.4,
        last10: [11, 10, 12, 9, 11],
        avgMinutes: 30.5,
        sampleGames: 5,
      },
    ];

    const guarded = loadNbaGuardedPropsBridge({
      seeds,
      minMinutes: 18,
      injuries: [
        {
          teamSlug: "boston-celtics",
          player: "Descartado Oficial",
          status: "Baja",
          detail: "Fuera de convocatoria",
        },
      ],
    });

    expect(guarded).toHaveLength(1);
    expect(guarded[0]!.player).toBe("Titular Activo");
    expect(guarded[0]!.fairOverDecimal).toBeGreaterThan(1.05);
    expect(guarded[0]!.pOver).toBeGreaterThan(0.5);
  });

  it("hydratePlayerLivePerformance respeta PITCHLAB_OFFLINE y no filtra URLs ni IDs crudos del proveedor al hidratar", async () => {
    const baseProfile: PlayerProfileData = {
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      sport: "basketball",
      seasonLabel: "2026-27",
      updatedAt: "2026-11-20T00:00:00Z",
      team: {
        id: "nba.boston-celtics",
        slug: "boston-celtics",
        name: "Boston Celtics",
        shortName: "Boston",
        code: "BOS",
      },
      coachName: "Joe Mazzulla",
      player: {
        id: "9988776",
        slug: "jayson-tatum",
        name: "Jayson Tatum",
        shortName: "J. Tatum",
        jersey: "0",
        positionGroup: "FWD",
        positionLabel: "Alero",
        age: 28,
        heightCm: 203,
        weightKg: 95,
        nationality: "Estados Unidos",
        nationalityCode: "US",
        stats: {
          appearances: 0,
          subIns: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          foulsCommitted: 0,
          foulsSuffered: 0,
          yellowCards: 0,
          redCards: 0,
          offsides: 0,
          saves: 0,
          shotsFaced: 0,
          goalsConceded: 0,
        },
        seasonMetrics: [],
        recentGames: [],
        candidatePicks: [],
      },
      picksLocked: false,
      nextFixture: null,
      teammates: [],
    };

    // En modo offline jamás invoca red.
    vi.stubEnv("PITCHLAB_OFFLINE", "1");
    const offlineFetchSpy = vi.fn();
    vi.stubGlobal("fetch", offlineFetchSpy);
    const offlineResult = await hydratePlayerLivePerformance(baseProfile);
    expect(offlineFetchSpy).not.toHaveBeenCalled();
    expect(offlineResult.player.seasonMetrics).toEqual([]);

    // Con hidratación simulada, solo expone métricas y juegos normalizados sin rastro FD-16.
    vi.stubEnv("PITCHLAB_OFFLINE", "0");
    vi.stubEnv("PLAYWRIGHT_TEST", "0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            statistics: {
              labels: ["GP", "MIN", "PTS", "REB", "AST"],
              splits: [{ displayName: "Regular Season", stats: ["14", "35.2", "27.8", "8.4", "5.9"] }],
            },
            gameLog: {
              statistics: [
                {
                  labels: ["MIN", "PTS", "REB", "AST"],
                  events: [{ eventId: "401876999", stats: ["36", "30", "9", "6"] }],
                },
              ],
              events: {
                "401876999": {
                  gameDate: "2026-11-18T00:30:00Z",
                  atVs: "vs",
                  score: "118-112",
                  gameResult: "W",
                  opponent: { displayName: "Miami Heat", abbreviation: "MIA" },
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const hydrated = await hydratePlayerLivePerformance(baseProfile);
    expect(hydrated.player.stats.appearances).toBe(14);
    expect(hydrated.player.seasonMetrics?.length).toBeGreaterThanOrEqual(5);
    expect(hydrated.player.recentGames).toHaveLength(1);
    expect(hydrated.player.recentGames?.[0]).toMatchObject({
      dateIso: "2026-11-18",
      opponent: "Miami Heat",
      result: "W",
    });

    const hydratedPayload = JSON.stringify({
      seasonMetrics: hydrated.player.seasonMetrics,
      recentGames: hydrated.player.recentGames,
    });
    expect(hydratedPayload).not.toMatch(FORBIDDEN_FD16_RE);
    expect(hydratedPayload).not.toMatch(/https?:\/\/|espn/i);
    expect(hydratedPayload).not.toContain("401876999");
  });
});
