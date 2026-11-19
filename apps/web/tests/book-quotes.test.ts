import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import {
  enrichDatasetWithBookQuotes,
  enrichMarketRowsWithBookQuotes,
  parseQuotesLedgerTicks,
} from "../src/server/book-quotes";

describe("book-quotes · Integración de las 9 casas Bzzoiro desde quotes_latest.json", () => {
  const nowMs = Date.parse("2026-11-17T12:00:00Z");

  it("filtra cuotas vencidas (>= 72h), conserva la captura más reciente por casa y enriquece picks y mercados", () => {
    const byLeague = parseQuotesLedgerTicks(
      [
        {
          event_id: "ws:football:D1:20261120:bayern_munchen:koln",
          sport: "football",
          league: "D1",
          market: "1x2",
          line: null,
          selection: "home",
          book: "bet365",
          price_decimal: 1.25,
          ts_captured: "2026-11-16T10:00:00Z",
        },
        {
          event_id: "ws:football:D1:20261120:bayern_munchen:koln",
          sport: "football",
          league: "D1",
          market: "1x2",
          line: null,
          selection: "home",
          book: "pinnacle",
          price_decimal: 1.3,
          ts_captured: "2026-11-16T11:00:00Z",
        },
        // Cuota vencida (> 72h antes de nowMs): debe descartarse
        {
          event_id: "ws:football:D1:20261120:bayern_munchen:koln",
          sport: "football",
          league: "D1",
          market: "1x2",
          line: null,
          selection: "home",
          book: "codere",
          price_decimal: 1.99,
          ts_captured: "2026-11-10T10:00:00Z",
        },
      ],
      nowMs,
    );

    const matchFixture: MatchAnalysis = {
      id: "bun-fcb-koe",
      league: asLeagueId("bundesliga"),
      leagueLabel: "Bundesliga",
      sport: "football",
      round: "Jornada 11",
      day: "2026-11-20",
      dayLabel: "viernes, 20 de noviembre",
      kickoffUtc: "2026-11-20T19:30:00Z",
      kickoffLocal: "13:30",
      venue: "Allianz Arena",
      status: "NS",
      home: {
        slug: "bayern-munchen",
        name: "FC Bayern München",
        shortName: "FC Bayern München",
        code: "FCB",
        record: "8G-2E-0P",
      },
      away: {
        slug: "koln",
        name: "1. FC Köln",
        shortName: "1. FC Köln",
        code: "KOE",
        record: "3G-3E-4P",
      },
      projection: { home: 2.8, away: 0.6, total: 3.4 },
      x12: [0.8, 0.13, 0.07],
      outcomes: [
        {
          key: "home",
          label: "FC Bayern München gana",
          probability: 0.8,
          fairOdds: { decimal: 1.25, american: -400 },
        },
        {
          key: "draw",
          label: "Empate",
          probability: 0.13,
          fairOdds: { decimal: 7.69, american: 669 },
        },
        {
          key: "away",
          label: "1. FC Köln gana",
          probability: 0.07,
          fairOdds: { decimal: 14.29, american: 1329 },
        },
      ],
      marketGroups: [
        {
          group: "Resultado",
          rows: [
            {
              market: asMarketKey("h2h"),
              selection: "home",
              label: "FC Bayern München gana",
              p: 0.8,
              fairOdds: 1.25,
            },
          ],
        },
      ],
      factors: [],
      trace: [],
      confidence: { score: 84, level: "alta", reasons: [] },
    };

    const rawDataset = buildPlatformDataset([
      {
        league: asLeagueId("bundesliga"),
        leagueLabel: "Bundesliga",
        sport: "football",
        season: "2026-27",
        roundLabel: "Jornada 11",
        generatedAt: "2026-11-17T10:00:00Z",
        games: [matchFixture],
      },
    ]);

    const enriched = enrichDatasetWithBookQuotes(rawDataset, nowMs, byLeague);
    const mainPick = enriched.games[0]!.picks[0]!;
    expect(mainPick.bookQuotes?.map((q) => q.book)).toEqual(["pinnacle", "bet365"]);
    expect(mainPick.marketDecimal).toBe(1.3);
    expect(mainPick.marketBookLabel).toBe("Pinnacle");
    expect(mainPick.edgePts).toBeCloseTo((0.8 - 1 / 1.3) * 100, 1);

    const enrichedRows = enrichMarketRowsWithBookQuotes(
      enriched.games[0]!,
      [
        {
          group: "Resultado 1X2",
          market: "1x2",
          selection: "home",
          label: "Gana FC Bayern München",
          p: 0.8,
          fairDecimal: 1.25,
          fairAmerican: -400,
          openDecimal: null,
          currentDecimal: null,
          edgePts: null,
        },
      ],
      nowMs,
      byLeague,
    );
    expect(enrichedRows[0]!.currentDecimal).toBe(1.3);
    expect(enrichedRows[0]!.quoteBookLabel).toBe("Pinnacle");
    expect(enrichedRows[0]!.bookQuotes).toHaveLength(2);
  });

  it("soporta Betcris, BetMGM, corners_total con línea, clean_sheet/win_to_nil y movimiento de apertura", () => {
    const byLeague = parseQuotesLedgerTicks(
      [
        {
          event_id: "ws:football:MEX:20261120:america:chivas",
          sport: "football",
          league: "MEX",
          market: "total_corners",
          line: 9.5,
          selection: "over",
          book: "betcris",
          price_decimal: 1.9,
          opening_price: 2.05,
          movement_direction: "shortening",
          ts_captured: "2026-11-17T10:00:00Z",
        },
        {
          event_id: "ws:football:MEX:20261120:america:chivas",
          sport: "football",
          league: "MEX",
          market: "total_corners",
          line: 9.5,
          selection: "over",
          book: "betmgm",
          price_decimal: 1.85,
          opening_price: 1.85,
          ts_captured: "2026-11-17T10:00:00Z",
        },
        {
          event_id: "ws:football:MEX:20261120:america:chivas",
          sport: "football",
          league: "MEX",
          market: "clean_sheet_home",
          line: null,
          selection: "yes",
          book: "codere",
          price_decimal: 2.4,
          ts_captured: "2026-11-17T10:00:00Z",
        },
      ],
      nowMs,
    );

    const mxEvents = byLeague.get("liga-mx") ?? [];
    expect(mxEvents).toHaveLength(1);
    const cornerQuotes = mxEvents[0]!.bySelectionKey.get("corners_total|9.5|over") ?? [];
    expect(cornerQuotes.map((q) => q.book)).toEqual(["betcris", "betmgm"]);
    expect(cornerQuotes[0]).toMatchObject({
      bookLabel: "Betcris",
      openingDecimal: 2.05,
      movementDirection: "shortening",
      isBest: true,
    });
    expect(mxEvents[0]!.bySelectionKey.get("clean_sheet_home|null|yes")?.[0]?.book).toBe("codere");

    const enrichedRows = enrichMarketRowsWithBookQuotes(
      {
        league: asLeagueId("liga-mx"),
        home: { slug: "america", name: "Club América", shortName: "América", code: "AME", record: "7G" },
        away: { slug: "chivas", name: "Guadalajara", shortName: "Chivas", code: "GDL", record: "5G" },
        status: "NS",
      },
      [
        {
          group: "Tiros de esquina",
          market: "corners_total",
          selection: "over",
          line: 9.5,
          label: "Más de 9.5 corners",
          p: 0.56,
          fairDecimal: 1.79,
          fairAmerican: -127,
          openDecimal: null,
          currentDecimal: null,
          edgePts: null,
        },
      ],
      nowMs,
      byLeague,
    );
    expect(enrichedRows[0]!.openDecimal).toBe(2.05);
    expect(enrichedRows[0]!.currentDecimal).toBe(1.9);
    expect(enrichedRows[0]!.movementDirection).toBe("shortening");
    expect(enrichedRows[0]!.quoteBookLabel).toBe("Betcris");
  });

  it("normaliza mercados over_under_* y ligas de expansión (ADR-043) con movimiento de apertura", () => {
    const byLeague = parseQuotesLedgerTicks(
      [
        {
          event_id: "ws:football:champions-league:20261125:shakhtar:fenerbahce",
          sport: "football",
          league: "champions-league",
          market: "over_under_25",
          line: 2.5,
          selection: "over",
          book: "bet365",
          price_decimal: 1.727,
          opening_price: 1.85,
          movement_direction: "shortening",
          ts_captured: "2026-11-17T11:00:00Z",
        },
      ],
      nowMs,
    );

    const ucl = byLeague.get("champions-league") ?? [];
    expect(ucl).toHaveLength(1);
    const overQuotes = ucl[0]!.bySelectionKey.get("totals|2.5|over") ?? [];
    expect(overQuotes).toHaveLength(1);
    expect(overQuotes[0]).toMatchObject({
      book: "bet365",
      decimal: 1.727,
      openingDecimal: 1.85,
      movementDirection: "shortening",
      isBest: true,
    });
  });

  it("enriquece en vivo partidos de expansión desde data/snapshots/<league>/market-lines.json", () => {
    const mlPath = path.resolve(
      process.cwd(),
      "..",
      "..",
      "data",
      "snapshots",
      "champions-league",
      "market-lines.json",
    );
    const snapPath = path.resolve(
      process.cwd(),
      "..",
      "..",
      "data",
      "snapshots",
      "champions-league",
      "latest.json",
    );
    if (!existsSync(mlPath) || !existsSync(snapPath)) return;
    const ml = JSON.parse(readFileSync(mlPath, "utf8")) as {
      updatedAt: string;
      lines: Array<{ gameId: string; market: string; outcome: string; decimal: number }>;
    };
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
      games: Array<{
        id: string;
        home: { name: string; shortName: string; code: string };
        away: { name: string; shortName: string; code: string };
      }>;
    };
    const firstHomeLine = ml.lines.find(
      (l) => l.market === "1x2" && l.outcome.toUpperCase() === "HOME",
    );
    expect(firstHomeLine).toBeDefined();
    const matchingGame = snap.games.find((g) => g.id === firstHomeLine!.gameId);
    expect(matchingGame).toBeDefined();

    const rows = enrichMarketRowsWithBookQuotes(
      {
        id: matchingGame!.id,
        league: asLeagueId("champions-league"),
        home: {
          slug: "home",
          name: matchingGame!.home.name,
          shortName: matchingGame!.home.shortName,
          code: matchingGame!.home.code,
          record: "0G",
        },
        away: {
          slug: "away",
          name: matchingGame!.away.name,
          shortName: matchingGame!.away.shortName,
          code: matchingGame!.away.code,
          record: "0G",
        },
        status: "NS",
      },
      [
        {
          group: "Resultado 1X2",
          market: "1x2",
          selection: "home",
          label: `Gana ${matchingGame!.home.shortName}`,
          p: 0.55,
          fairDecimal: 1.82,
          fairAmerican: -122,
          openDecimal: null,
          currentDecimal: null,
          edgePts: null,
        },
      ],
      Date.parse(ml.updatedAt),
    );
    expect(rows[0]!.currentDecimal).toBeGreaterThan(1.01);
    expect(rows[0]!.bookQuotes?.length ?? 0).toBeGreaterThan(0);
  });
});
