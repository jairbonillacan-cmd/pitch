import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIER1_MAJOR_CUP_IDS } from "@pitchlab/contracts";
import {
  BZZOIRO_ODDS_LEAGUES,
  BZZOIRO_TIER1_CUP_ODDS_LEAGUES,
  BzzoiroOddsAdapter,
  parseBzzoiroOdds,
  toSpacetimeAnchoredQuote,
  type BzOddsEvent,
  type BzOddsRow,
} from "../src/odds/bzzoiro-odds.js";
import { buildPermittedActiveOddsAdapters } from "../src/odds/betfair-exchange.js";
import { TheOddsApiAdapter } from "../src/odds/the-odds-api.js";
import { CleanHttpTransport, type HttpRequesterFn } from "../src/odds/legal-registry.js";

const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "bzzoiro-odds", "juarez-atlas.json"), "utf8"),
) as { events: BzOddsEvent[]; odds: BzOddsRow[] };

const CAPTURED = "2026-11-15T02:00:00Z";
const EVENT_ID = "ws:football:MEX:20261121:fc_juarez:atlas";

function parseFixture() {
  return parseBzzoiroOdds({
    events: FIXTURE.events,
    oddsByEvent: new Map([[211644, FIXTURE.odds]]),
    appLeague: "liga-mx",
    capturedAtIso: CAPTURED,
    nowMs: Date.parse(CAPTURED),
  });
}

describe("Momios de fútbol desde Bzzoiro", () => {
  it("convierte 1X2, doble oportunidad, DNB, totales, ambos anotan y hándicap asiático al contrato canónico", () => {
    const rows = parseFixture();
    expect(new Set(rows.map((r) => r.event_id))).toEqual(new Set([EVENT_ID]));
    expect(rows.every((r) => r.book === "bet365" && r.league === "MEX")).toBe(true);
    expect(rows.every((r) => r.ts_event_start === "2026-11-21T03:00:00Z")).toBe(true);

    const pick = (market: string, selection: string, line: number | null) =>
      rows.find((r) => r.market === market && r.selection === selection && r.line === line)
        ?.price_decimal;
    expect(pick("1x2", "home", null)).toBe(3.2);
    expect(pick("1x2", "draw", null)).toBe(3.6);
    expect(pick("1x2", "away", null)).toBe(2.01);
    expect(pick("double_chance", "1X", null)).toBeGreaterThan(1);
    expect(pick("dnb", "home", null)).toBeGreaterThan(1);
    expect(pick("totals", "over", 2.5)).toBe(1.667);
    expect(pick("totals", "under", 3.5)).toBe(1.444);
    expect(pick("btts", "yes", null)).toBe(1.571);
    // Bzzoiro publica la línea del local en ambos lados: «Away +1.25» llega como -1.25.
    expect(pick("ah", "home", -1.25)).toBe(1.375);
    expect(pick("ah", "away", -1.25)).toBe(3);

    const markets = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.market] = (acc[r.market] ?? 0) + 1;
      return acc;
    }, {});
    expect(markets).toEqual({
      "1x2": 3,
      double_chance: 3,
      dnb: 2,
      totals: 8,
      btts: 2,
      ah: 4,
    });
  });

  it("descarta momios en vivo, casas no autorizadas y mercados no soportados", () => {
    const rows = parseFixture();
    expect(rows.some((r) => r.book === "pinnacle")).toBe(false); // copias marcadas is_live
    expect(rows.some((r) => r.book === "1xbet")).toBe(false);
    expect(rows.some((r) => r.market === "corners_total")).toBe(false); // total_corners venía solo en 1xbet
    const withUnknown = parseBzzoiroOdds({
      events: FIXTURE.events,
      oddsByEvent: new Map([
        [
          211644,
          [
            ...FIXTURE.odds,
            { market: "total_cards_unsupported", outcome: "over", line: 4.5, bookmaker_slug: "bet365", decimal_odds: 1.9, is_live: false },
          ],
        ],
      ]),
      appLeague: "liga-mx",
      capturedAtIso: CAPTURED,
      nowMs: Date.parse(CAPTURED),
    });
    expect(withUnknown).toHaveLength(22);
  });

  it("omite el partido cuando un equipo no está en el mapeo", () => {
    const rows = parseBzzoiroOdds({
      events: [{ ...FIXTURE.events[0], home_team: "Equipo Inexistente FC" }],
      oddsByEvent: new Map([[211644, FIXTURE.odds]]),
      appLeague: "liga-mx",
      capturedAtIso: CAPTURED,
      nowMs: Date.parse(CAPTURED),
    });
    expect(rows).toEqual([]);
  });

  it("pide eventos y momios con el token y pagina hasta agotar `next`", async () => {
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    const requester: HttpRequesterFn = async ({ url, headers }) => {
      calls.push({ url, auth: headers.authorization });
      const u = new URL(url);
      let body: unknown = { results: [], next: null };
      if (u.pathname.endsWith("/events/") && u.searchParams.get("league_id") === "19") {
        body = { results: FIXTURE.events, next: null };
      } else if (u.pathname.endsWith("/odds/")) {
        const offset = Number(u.searchParams.get("offset"));
        body =
          offset === 0
            ? { results: FIXTURE.odds.slice(0, 10), next: `${u.origin}${u.pathname}?offset=200` }
            : { results: FIXTURE.odds.slice(10), next: null };
      }
      const text = JSON.stringify(body);
      return { url, status: 200, headers: {}, bodyText: text, sha256: "" };
    };
    const adapter = new BzzoiroOddsAdapter({
      env: { BZZOIRO_API_KEY: "clave_de_prueba" },
      transport: new CleanHttpTransport({ rateLimitRps: 1000, requester }),
    });
    const rows = await adapter.fetchSnapshots({ activeLeagues: ["liga-mx", "nfl"], capturedAtIso: CAPTURED });

    expect(rows).toHaveLength(22);
    expect(calls.every((c) => c.auth === "Token clave_de_prueba")).toBe(true);
    // Liga MX tiene dos ids (Apertura y Clausura); la NFL no se pide a Bzzoiro.
    expect(calls.filter((c) => c.url.includes("/events/")).map((c) => new URL(c.url).searchParams.get("league_id")))
      .toEqual(["19", "20"]);
    expect(calls.filter((c) => c.url.includes("/odds/"))).toHaveLength(2);
  });

  it("con clave de Bzzoiro, The Odds API queda solo para la NFL", () => {
    const { adapters } = buildPermittedActiveOddsAdapters({
      THE_ODDS_API_KEY: "a",
      BZZOIRO_API_KEY: "b",
    });
    expect(adapters.map((a) => a.metadata.sourceId).sort()).toEqual(["bzzoiro_odds", "the_odds_api"]);
    const theOdds = adapters.find((a) => a instanceof TheOddsApiAdapter) as TheOddsApiAdapter;
    expect((theOdds as unknown as { options: { excludeLeagues?: string[] } }).options.excludeLeagues)
      .toContain("liga-mx");

    const soloTheOdds = buildPermittedActiveOddsAdapters({ THE_ODDS_API_KEY: "a" }).adapters;
    expect(soloTheOdds.map((a) => a.metadata.sourceId)).toEqual(["the_odds_api"]);
    expect((soloTheOdds[0] as unknown as { options: { excludeLeagues?: string[] } }).options.excludeLeagues)
      .toBeUndefined();
  });

  it("conserva intacto BZZOIRO_ODDS_LEAGUES (6 ligas canónicas) y exporta aparte BZZOIRO_TIER1_CUP_ODDS_LEAGUES desde TIER1_MAJOR_CUP_IDS", () => {
    expect(BZZOIRO_ODDS_LEAGUES).toEqual([
      "liga-mx",
      "premier-league",
      "laliga",
      "bundesliga",
      "serie-a",
      "ligue-1",
    ]);
    expect(BZZOIRO_TIER1_CUP_ODDS_LEAGUES).toEqual([
      "champions-league",
      "europa-league",
      "libertadores",
      "mls",
    ]);
    expect(BZZOIRO_TIER1_CUP_ODDS_LEAGUES.every((id) => TIER1_MAJOR_CUP_IDS.includes(id))).toBe(true);
    expect(BZZOIRO_TIER1_CUP_ODDS_LEAGUES).not.toContain("concacaf-champions");
  });

  it("toSpacetimeAnchoredQuote construye SpacetimeAnchoredQuote congelado y rechaza probabilidades fuera de (0.001, 0.999) o fugas FD-16", () => {
    const anchored = toSpacetimeAnchoredQuote({
      bookLabel: "Pinnacle",
      marketKey: "1x2",
      selection: "home",
      line: null,
      bookDecimal: 2.05,
      modelProb: 0.55,
      movement: "STEAM",
      capturedAtIso: "2026-11-20T15:00:00Z",
    });

    expect(Object.isFrozen(anchored)).toBe(true);
    expect(anchored).toMatchObject({
      bookLabel: "Pinnacle",
      marketKey: "1x2",
      selection: "home",
      line: null,
      bookDecimal: 2.05,
      modelProb: 0.55,
      edgePts: 6.2,
      evPct: 12.8,
      movement: "STEAM",
      capturedAtIso: "2026-11-20T15:00:00Z",
    });
    expect(anchored.fairDecimal).toBeCloseTo(1 / 0.55, 4);

    for (const badProb of [0, 0.001, 0.999, 1, Number.NaN]) {
      expect(() =>
        toSpacetimeAnchoredQuote({
          bookLabel: "Pinnacle",
          marketKey: "1x2",
          selection: "home",
          bookDecimal: 2.05,
          modelProb: badProb,
          capturedAtIso: "2026-11-20T15:00:00Z",
        }),
      ).toThrow(RangeError);
    }

    expect(() =>
      toSpacetimeAnchoredQuote({
        bookLabel: "Bzzoiro Feed",
        marketKey: "1x2",
        selection: "home",
        bookDecimal: 2.05,
        modelProb: 0.55,
        capturedAtIso: "2026-11-20T15:00:00Z",
      }),
    ).toThrow(RangeError);

    expect(() =>
      toSpacetimeAnchoredQuote({
        bookLabel: "Pinnacle",
        marketKey: "1x2",
        selection: "home",
        bookDecimal: 1.0,
        modelProb: 0.55,
        capturedAtIso: "2026-11-20T15:00:00Z",
      }),
    ).toThrow(RangeError);
  });
});
