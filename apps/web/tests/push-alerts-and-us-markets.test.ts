import { describe, expect, it } from "vitest";
import { asLeagueId, CLIENT_MATCH_CONTEXT_FACTOR_LABELS } from "@pitchlab/contracts";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import { platformGameToSportOutlook } from "@pitchlab/ui/sport-outlook";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { buildDerivedUsSportRows } from "../src/server/outlook-derived-rows";
import {
  detectSignificantLineMoves,
  findPreMatchPushGames,
} from "../src/server/push-alerts";
import {
  loadAllActiveLeagueSnapshots,
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
} from "../src/server/snapshots";
import { loadPlayerPropStreakCards } from "../src/server/props-explorer";

describe("Paridad US/MLB, despachador Push y shell-index (ADR-045 / ADR-047)", () => {
  it("deriva mercados completos para NBA, NHL y MLB a partir de las proyecciones calibradas", () => {
    const nbaRows = buildDerivedUsSportRows({
      sport: "basketball",
      home: { name: "Boston Celtics" },
      away: { name: "New York Knicks" },
      projection: { home: 116.5, away: 109.2, total: 225.7 },
    });
    expect(nbaRows.some((r) => r.market === "spread")).toBe(true);
    expect(nbaRows.some((r) => r.market === "totals")).toBe(true);
    expect(nbaRows.some((r) => r.market === "first_half_totals")).toBe(true);
    expect(nbaRows.every((r) => r.isDerived === true)).toBe(true);

    const nhlRows = buildDerivedUsSportRows({
      sport: "ice-hockey",
      home: { name: "Florida Panthers" },
      away: { name: "Toronto Maple Leafs" },
      projection: { home: 3.4, away: 2.8, total: 6.2 },
    });
    expect(nhlRows.some((r) => r.group === "Puck line")).toBe(true);
    expect(nhlRows.some((r) => r.market === "first_period_totals")).toBe(true);

    const mlbRows = buildDerivedUsSportRows({
      sport: "baseball",
      home: { name: "Los Angeles Dodgers" },
      away: { name: "San Diego Padres" },
      projection: { home: 4.9, away: 3.8, total: 8.7 },
    });
    expect(mlbRows.some((r) => r.group === "Run line")).toBe(true);
    expect(mlbRows.some((r) => r.market === "f5_totals")).toBe(true);
    expect(mlbRows.some((r) => r.market === "f5_moneyline")).toBe(true);
  });

  it("detecta alertas prepartido (45-75 min) y movimientos de línea ≥ 5 % para Web Push", () => {
    const nowMs = Date.parse("2026-11-20T18:00:00Z");
    const game: PlatformGame = {
      id: "liga-mx-2026-11-20-america-chivas-abc123",
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      round: "Jornada 17",
      dayId: "2026-11-20",
      dayLabel: "viernes",
      kickoffUtc: "2026-11-20T19:00:00Z",
      kickoffLocal: "13:00",
      venue: "Estadio Azteca",
      status: "NS",
      home: { slug: "america", name: "Club América", shortName: "América", code: "AME", record: "9G" },
      away: { slug: "chivas", name: "Guadalajara", shortName: "Chivas", code: "GDL", record: "6G" },
      x12: [0.62, 0.22, 0.16],
      projection: { home: 1.85, away: 0.95, total: 2.8 },
      confidenceScore: 72,
      confidenceLevel: "alta",
      picks: [],
      factors: [],
      headToHead: [],
      preGame: {
        cortexSynthesis: "",
        tacticalKeys: [],
        lineupStatusLabel: "XI probable",
        lineupsConfirmed60m: false,
        absences: [],
        moneyFlow: null,
        probableLineups: null,
        confirmedLineups: null,
        matchContext: null,
      },
      markets: [
        {
          group: "Resultado 1X2",
          market: "1x2",
          selection: "home",
          label: "América gana",
          p: 0.62,
          fairDecimal: 1.61,
          fairAmerican: -163,
          openDecimal: 1.95,
          currentDecimal: 1.78,
          movementDirection: "shortening",
          quoteBookLabel: "Bet365",
          edgePts: 5.8,
        },
      ],
      updatedAtLabel: "2026-11-20",
      spacetime: null,
    };

    const dataset: PlatformDataset = {
      generatedAt: "2026-11-20T17:50:00Z",
      leagues: [],
      games: [game],
      dailyPromoPickId: "",
      tipsterWeeklyPickId: "",
      tipsterWeeklySlug: "",
      isServerRedactedForVisitor: false,
    };

    const prematch = findPreMatchPushGames(dataset, nowMs);
    expect(prematch.map((g) => g.id)).toEqual([game.id]);

    const moves = detectSignificantLineMoves(dataset, nowMs);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.shiftPct).toBeGreaterThanOrEqual(8);
    expect(moves[0]!.bookLabel).toBe("Bet365");
  });

  it("carga todas las 57 competencias aprovechando shell-index.json y lee tendencias de jugadores", () => {
    const envelopes = loadAllActiveLeagueSnapshots();
    expect(Object.keys(envelopes).length).toBe(PRODUCT_LEAGUES.length);
    expect(envelopes["champions-league"]?.state).toBe("ready");

    const streakCards = loadPlayerPropStreakCards(12);
    expect(Array.isArray(streakCards)).toBe(true);
  });

  it("conserva el factor «Abridores» en loadLeagueSnapshotEnvelope('mlb') y loadAllActiveLeagueSnapshots().mlb y devuelve abridores probables reales en platformGameToSportOutlook", () => {
    expect(CLIENT_MATCH_CONTEXT_FACTOR_LABELS).toContain("Abridores");

    const mlbEnvelopes = [
      loadLeagueSnapshotEnvelope("mlb"),
      loadAllActiveLeagueSnapshots().mlb,
    ];

    for (const mlbEnvelope of mlbEnvelopes) {
      expect(mlbEnvelope.state).toBe("ready");
      expect(mlbEnvelope.data).toBeDefined();

      const mlbData = mlbEnvelope.data!;
      const rawGamesWithPitchers = mlbData.games.filter((g) =>
        g.factors.some((f) => f.label === "Abridores"),
      );
      expect(rawGamesWithPitchers.length).toBeGreaterThan(0);

      const dataset = buildPlatformDataset([mlbData]);
      const targetRaw = rawGamesWithPitchers[0]!;
      const targetPlatformGame = dataset.games.find((g) => g.id === targetRaw.id);
      expect(targetPlatformGame).toBeDefined();
      expect(
        targetPlatformGame!.factors.some((f) => f.label === "Abridores"),
      ).toBe(true);

      if (targetPlatformGame!.hasForecast === false) {
        expect(platformGameToSportOutlook(targetPlatformGame!)).toBeNull();
      }

      const forecastEnabledGame: PlatformGame = {
        ...targetPlatformGame!,
        hasForecast: true,
        projection: targetPlatformGame!.projection ?? { home: 4.5, away: 4.1, total: 8.6 },
        x12: targetPlatformGame!.x12 ?? [0.54, 0, 0.46],
      };

      const outlook = platformGameToSportOutlook(forecastEnabledGame);
      expect(outlook).not.toBeNull();
      expect(outlook!.sport).toBe("mlb");

      const probablePitchers = (outlook!.confirmations ?? []).filter(
        (c) =>
          c.kind === "starting_pitcher" &&
          c.status === "probable" &&
          typeof c.playerName === "string" &&
          c.playerName.trim().length > 0,
      );
      expect(probablePitchers.length).toBeGreaterThanOrEqual(1);
      expect(
        probablePitchers.every(
          (c) => !/por confirmar|por definir|tbd/i.test(c.playerName ?? ""),
        ),
      ).toBe(true);
    }
  });
});
