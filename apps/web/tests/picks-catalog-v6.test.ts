import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asTeamId,
  getLeagueCapability,
  isPermittedMarketQuoteBook,
  probabilityToFairOdds,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import type {
  CatalogPickItem,
  FootballPlayerPropCandidateInput,
  MatchFinalCountStats,
  NbaPlayerPropCandidateInput,
  TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";
import { MAX_PARLAY_LEGS, buildSmartAutoParlay } from "@pitchlab/ui/parlay";
import type { PlatformGame, PlatformMarketRow, PlayerPropItem } from "@pitchlab/ui/types";
import {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  applyVennAbersPlayableCalibrationV6,
  buildDailyParlayCandidatesFromCatalogV6,
  buildMatchPlayerPropsCatalogV6,
  buildServerMatchPicksCatalog,
  buildSuggestedMatchSgpCombosV6,
  calibrateVennAbersBinaryPartitionV6,
  calibrateVennAbersThreeWayPartitionV6,
  compactCatalogPayload,
  evaluateServerBetBuilderSgpV6,
  isHardAnomalousCatalogPick,
  isSoccer57LeagueV6,
  redactCatalogPickForVisitor,
  resolveFootballBasePlayerPropV6,
  resolveNbaBasePlayerPropV6,
  type GoalkeeperCatalogCandidateInputV6,
  type UsPlayerCatalogCandidateInputV6,
} from "../src/server/picks-catalog";
import { resolveSnapshotsRoot } from "../src/server/snapshots";

const FIXED_NOW_ISO = "2026-11-22T12:00:00Z";
const FORBIDDEN_SIZING_KEYS = ["stake", "kelly", "kellyFraction", "expectedEdge"] as const;
const FORBIDDEN_MATH_JARGON_RE =
  /fr[eé]chet|armador\s+inteligente\s+geodesic|beta\s*\(\s*\d+\s*,\s*\d+\s*\)|confianza\s+\d+|datos\s+(?:completos|parciales)/i;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function assertNoForbiddenKeysDeep(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const key of FORBIDDEN_SIZING_KEYS) {
    expect(serialized).not.toContain(`"${key}"`);
  }
}

function makeHistory(perspective: "home" | "away"): TeamMatchEvidenceRecord[] {
  const isHomeSide = perspective === "home";
  return [
    {
      dateIso: "2026-11-15",
      isHome: isHomeSide,
      goalsFor: isHomeSide ? 3 : 1,
      goalsAgainst: isHomeSide ? 1 : 2,
      halfTimeGoalsFor: isHomeSide ? 1 : 0,
      halfTimeGoalsAgainst: isHomeSide ? 0 : 1,
      cornersFor: isHomeSide ? 7 : 4,
      cornersAgainst: isHomeSide ? 3 : 6,
      shotsFor: isHomeSide ? 16 : 9,
      shotsAgainst: isHomeSide ? 8 : 14,
      shotsOnTargetFor: isHomeSide ? 7 : 3,
      shotsOnTargetAgainst: isHomeSide ? 3 : 6,
      foulsFor: 11,
      foulsAgainst: 13,
      yellowCardsFor: 2,
      yellowCardsAgainst: 3,
    },
    {
      dateIso: "2026-11-08",
      isHome: isHomeSide,
      goalsFor: isHomeSide ? 2 : 0,
      goalsAgainst: isHomeSide ? 0 : 2,
      halfTimeGoalsFor: isHomeSide ? 1 : 0,
      halfTimeGoalsAgainst: isHomeSide ? 0 : 1,
      cornersFor: isHomeSide ? 6 : 3,
      cornersAgainst: isHomeSide ? 4 : 7,
      shotsFor: isHomeSide ? 15 : 8,
      shotsAgainst: isHomeSide ? 7 : 15,
      shotsOnTargetFor: isHomeSide ? 6 : 2,
      shotsOnTargetAgainst: isHomeSide ? 2 : 6,
      foulsFor: 12,
      foulsAgainst: 12,
      yellowCardsFor: 2,
      yellowCardsAgainst: 2,
    },
    {
      dateIso: "2026-11-01",
      isHome: isHomeSide,
      goalsFor: isHomeSide ? 2 : 1,
      goalsAgainst: isHomeSide ? 1 : 1,
      halfTimeGoalsFor: 1,
      halfTimeGoalsAgainst: 0,
      cornersFor: isHomeSide ? 8 : 5,
      cornersAgainst: isHomeSide ? 4 : 5,
      shotsFor: isHomeSide ? 17 : 10,
      shotsAgainst: isHomeSide ? 9 : 12,
      shotsOnTargetFor: isHomeSide ? 6 : 4,
      shotsOnTargetAgainst: isHomeSide ? 3 : 5,
      foulsFor: 10,
      foulsAgainst: 14,
      yellowCardsFor: 1,
      yellowCardsAgainst: 3,
    },
    {
      dateIso: "2026-10-25",
      isHome: isHomeSide,
      goalsFor: isHomeSide ? 2 : 1,
      goalsAgainst: isHomeSide ? 1 : 2,
      halfTimeGoalsFor: 1,
      halfTimeGoalsAgainst: 1,
      cornersFor: isHomeSide ? 7 : 4,
      cornersAgainst: isHomeSide ? 5 : 6,
      shotsFor: isHomeSide ? 15 : 11,
      shotsAgainst: isHomeSide ? 10 : 14,
      shotsOnTargetFor: isHomeSide ? 6 : 4,
      shotsOnTargetAgainst: isHomeSide ? 4 : 6,
      foulsFor: 12,
      foulsAgainst: 12,
      yellowCardsFor: 2,
      yellowCardsAgainst: 2,
    },
    {
      dateIso: "2026-10-18",
      isHome: !isHomeSide,
      goalsFor: isHomeSide ? 2 : 1,
      goalsAgainst: isHomeSide ? 1 : 2,
      halfTimeGoalsFor: 1,
      halfTimeGoalsAgainst: 0,
      cornersFor: isHomeSide ? 6 : 4,
      cornersAgainst: isHomeSide ? 5 : 6,
      shotsFor: isHomeSide ? 14 : 9,
      shotsAgainst: isHomeSide ? 10 : 13,
      shotsOnTargetFor: isHomeSide ? 5 : 3,
      shotsOnTargetAgainst: isHomeSide ? 4 : 5,
      foulsFor: 11,
      foulsAgainst: 13,
      yellowCardsFor: 2,
      yellowCardsAgainst: 3,
    },
  ];
}

function makeFootballMarkets(options?: {
  readonly homeBook?: string;
  readonly drawBook?: string;
  readonly awayBook?: string;
  readonly homeDecimal?: number;
  readonly drawDecimal?: number;
  readonly awayDecimal?: number;
}): PlatformMarketRow[] {
  const hBook = options?.homeBook ?? "Pinnacle";
  const dBook = options?.drawBook ?? "Pinnacle";
  const aBook = options?.awayBook ?? "Pinnacle";
  const hDec = options?.homeDecimal ?? 2.02;
  const dDec = options?.drawDecimal ?? 3.55;
  const aDec = options?.awayDecimal ?? 3.65;
  const bookKey = (b: string) => b.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return [
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "home",
      label: "Gana Liverpool",
      p: 0.54,
      fairDecimal: 1.85,
      fairAmerican: -117,
      openDecimal: 2.08,
      currentDecimal: hDec,
      movementDirection: "shortening",
      quoteBookLabel: hBook,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      bookQuotes: [
        {
          book: bookKey(hBook),
          bookLabel: hBook,
          decimal: hDec,
          openingDecimal: 2.08,
          movementDirection: "shortening",
          capturedAtUtc: FIXED_NOW_ISO,
          isBest: true,
        },
      ],
      edgePts: 4.5,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "draw",
      label: "Empate",
      p: 0.25,
      fairDecimal: 4.0,
      fairAmerican: 300,
      openDecimal: null,
      currentDecimal: dDec,
      quoteBookLabel: dBook,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      bookQuotes: [
        {
          book: bookKey(dBook),
          bookLabel: dBook,
          decimal: dDec,
          capturedAtUtc: FIXED_NOW_ISO,
          isBest: true,
        },
      ],
      edgePts: -3.1,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "away",
      label: "Gana Arsenal",
      p: 0.21,
      fairDecimal: 4.76,
      fairAmerican: 376,
      openDecimal: null,
      currentDecimal: aDec,
      quoteBookLabel: aBook,
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      bookQuotes: [
        {
          book: bookKey(aBook),
          bookLabel: aBook,
          decimal: aDec,
          capturedAtUtc: FIXED_NOW_ISO,
          isBest: true,
        },
      ],
      edgePts: -6.4,
    },
    {
      group: "Total de goles",
      market: "totals",
      selection: "over",
      line: 2.5,
      label: "Más de 2.5 goles",
      p: 0.56,
      fairDecimal: 1.79,
      fairAmerican: -127,
      openDecimal: 1.98,
      currentDecimal: 1.94,
      quoteBookLabel: "Bet365",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: 4.4,
    },
    {
      group: "Total de goles",
      market: "totals",
      selection: "under",
      line: 2.5,
      label: "Menos de 2.5 goles",
      p: 0.44,
      fairDecimal: 2.27,
      fairAmerican: 127,
      openDecimal: 1.9,
      currentDecimal: 1.92,
      quoteBookLabel: "Bet365",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -8.1,
    },
  ];
}

function makeFootballGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "epl-liv-ars-v6",
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    round: "Jornada 22",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-22T18:00:00Z",
    kickoffLocal: "12:00",
    venue: "Anfield",
    referee: "Michael Oliver",
    status: "NS",
    home: {
      slug: "liverpool",
      name: "Liverpool",
      shortName: "Liverpool",
      code: "LIV",
      record: "14G-4E-3P",
    },
    away: {
      slug: "arsenal",
      name: "Arsenal",
      shortName: "Arsenal",
      code: "ARS",
      record: "13G-5E-3P",
    },
    hasForecast: true,
    x12: [0.54, 0.25, 0.21],
    projection: { home: 1.82, away: 1.03, total: 2.85 },
    goalLine: { line: 2.5, pOver: 0.56 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "XI confirmado",
      lineupsConfirmed60m: true,
      matchContext: {
        referee: "Michael Oliver",
        refereeStats: {
          matches: 30,
          avgYellow: 4.8,
          avgFouls: 24.5,
        },
      },
      absences: [],
      moneyFlow: null,
    },
    markets: makeFootballMarkets(),
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-22",
    spacetime: null,
    ...overrides,
  };
}

function makeUsGame(
  sport: "american-football" | "basketball" | "baseball" | "ice-hockey",
  overrides: Partial<PlatformGame> = {},
): PlatformGame {
  const presets = {
    "american-football": {
      id: "nfl-kc-buf-v6",
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      home: { slug: "kc", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "9G-2P" },
      away: { slug: "buf", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "8G-3P" },
      x12: [0.62, 0, 0.38] as [number, number, number],
      projection: { home: 26.5, away: 21.0, total: 47.5 },
    },
    basketball: {
      id: "nba-bos-lal-v6",
      league: asLeagueId("nba"),
      leagueLabel: "NBA",
      home: { slug: "bos", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "15G-4P" },
      away: { slug: "lal", name: "Los Angeles Lakers", shortName: "Lakers", code: "LAL", record: "12G-7P" },
      x12: [0.64, 0, 0.36] as [number, number, number],
      projection: { home: 118.0, away: 111.5, total: 229.5 },
    },
    baseball: {
      id: "mlb-lad-nyy-v6",
      league: asLeagueId("mlb"),
      leagueLabel: "MLB",
      home: { slug: "lad", name: "Los Angeles Dodgers", shortName: "Dodgers", code: "LAD", record: "92G-60P" },
      away: { slug: "nyy", name: "New York Yankees", shortName: "Yankees", code: "NYY", record: "88G-64P" },
      x12: [0.57, 0, 0.43] as [number, number, number],
      projection: { home: 4.9, away: 4.1, total: 9.0 },
    },
    "ice-hockey": {
      id: "nhl-col-edm-v6",
      league: asLeagueId("nhl"),
      leagueLabel: "NHL",
      home: { slug: "col", name: "Colorado Avalanche", shortName: "Avalanche", code: "COL", record: "18G-9P" },
      away: { slug: "edm", name: "Edmonton Oilers", shortName: "Oilers", code: "EDM", record: "16G-11P" },
      x12: [0.55, 0, 0.45] as [number, number, number],
      projection: { home: 3.4, away: 2.9, total: 6.3 },
    },
  };
  const base = presets[sport];
  return {
    id: base.id,
    league: base.league,
    leagueLabel: base.leagueLabel,
    sport,
    round: "Regular",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-22T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadio Principal",
    status: "NS",
    home: base.home,
    away: base.away,
    hasForecast: true,
    x12: base.x12,
    projection: base.projection,
    confidenceScore: 74,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "XI probable",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-22",
    spacetime: null,
    ...overrides,
  };
}

function makeFootballPlayer(overrides: Partial<FootballPlayerPropCandidateInput> = {}): FootballPlayerPropCandidateInput {
  return {
    playerName: "Mohamed Salah",
    playerSlug: "mohamed-salah",
    teamSide: "home",
    teamName: "Liverpool",
    position: "FWD",
    lineupStatus: "confirmed",
    avgMinutes: 88,
    matchLogs: [
      { minutesPlayed: 90, isHome: true, shots: 4, shotsOnTarget: 2, goals: 1, assists: 1, foulsCommitted: 1, yellowCards: 0 },
      { minutesPlayed: 88, isHome: false, shots: 5, shotsOnTarget: 3, goals: 1, assists: 0, foulsCommitted: 0, yellowCards: 0 },
      { minutesPlayed: 90, isHome: true, shots: 3, shotsOnTarget: 2, goals: 1, assists: 0, foulsCommitted: 1, yellowCards: 0 },
      { minutesPlayed: 85, isHome: true, shots: 4, shotsOnTarget: 2, goals: 0, assists: 1, foulsCommitted: 1, yellowCards: 0 },
      { minutesPlayed: 90, isHome: false, shots: 4, shotsOnTarget: 1, goals: 1, assists: 0, foulsCommitted: 0, yellowCards: 0 },
    ],
    ...overrides,
  };
}

function makeGoalkeeper(overrides: Partial<GoalkeeperCatalogCandidateInputV6> = {}): GoalkeeperCatalogCandidateInputV6 {
  return {
    playerName: "Alisson Becker",
    playerSlug: "alisson-becker",
    teamSide: "home",
    teamName: "Liverpool",
    teamSlug: "liverpool",
    saves: 42,
    shotsFaced: 54,
    goalsConceded: 12,
    appearances: 14,
    subIns: 0,
    avgMinutes: 90,
    availability: "available",
    lineupStatus: "confirmed",
    ...overrides,
  };
}

describe("picks-catalog Spacetime v6.0 · Soccer 53-league, Venn-Abers playable, conformal 90% y coherencia", () => {
  it("calibración Venn-Abers es estrictamente monótona, actúa en [1.55, 2.60] y mantiene fairOdds = 1 / p", () => {
    const grid = [0.12, 0.25, 0.35, 0.39, 0.44, 0.48, 0.52, 0.56, 0.6, 0.64, 0.72, 0.85];
    for (const league of ["premier-league", "liga-mx"]) {
      let prevP = 0;
      for (const pRaw of grid) {
        const res = applyVennAbersPlayableCalibrationV6(pRaw, league);
        expect(res.pCalibrated).toBeGreaterThan(0);
        expect(res.pCalibrated).toBeLessThan(1);
        expect(res.pCalibrated).toBeGreaterThanOrEqual(prevP);
        prevP = res.pCalibrated;

        const rawOdds = 1 / res.pRaw;
        const expectedZone = rawOdds >= PLAYABLE_ODDS_MIN_V60 && rawOdds <= PLAYABLE_ODDS_MAX_V60;
        expect(res.inPlayableZone).toBe(expectedZone);
        expect(res.applied).toBe(expectedZone);
        expect(res.fairOdds).toBe(Math.max(1.01, round2(1 / res.pCalibrated)));
      }
    }
  });

  it("alimenta ligas de las 6 confederaciones con v6.0, banda conformal 90 %, pago anticipado +2 goles y micro-mercados", () => {
    const leagues = [
      { id: "premier-league", label: "Premier League" },
      { id: "liga-mx", label: "Liga MX" },
      { id: "brasileirao", label: "Brasileirão" },
      { id: "j1-league", label: "J1 League" },
      { id: "copa-del-mundo", label: "Copa del Mundo" },
    ] as const;

    for (const lg of leagues) {
      expect(isSoccer57LeagueV6(lg.id)).toBe(true);
      const game = makeFootballGame({
        id: `v6-${lg.id}`,
        league: asLeagueId(lg.id),
        leagueLabel: lg.label,
      });
      const catalog = buildServerMatchPicksCatalog(game, {
        fullAccess: true,
        markets: makeFootballMarkets(),
        homeHistory: makeHistory("home"),
        awayHistory: makeHistory("away"),
        preserveAll: true,
        compact: false,
        nowIso: FIXED_NOW_ISO,
      });

      const cap = getLeagueCapability(lg.id);
      expect(catalog.picks.length).toBeGreaterThan(8);
      expect(
        catalog.availableFamilies.every((fam) => cap.supportedMarketFamilies.includes(fam)),
      ).toBe(true);
      expect(catalog.picks.every((p) => p.engineName === "PitchLab Spacetime v6.0")).toBe(true);
      expect(
        catalog.picks.every(
          (p) =>
            p.pricing.p > 0 &&
            p.pricing.p < 1 &&
            Math.abs(p.pricing.fairOdds - Math.max(1.01, round2(1 / p.pricing.p))) <= 0.01,
        ),
      ).toBe(true);

      const home1x2 = catalog.picks.find((p) => p.family === "1x2" && p.selectionKey === "home");
      expect(home1x2).toBeDefined();
      expect(home1x2!.evidence.bullets.some((b) => b.label.includes("Banda 90 %:"))).toBe(true);
      expect(home1x2!.evidence.bullets.some((b) => b.label.includes("Pago anticipado +2 goles"))).toBe(
        true,
      );

      const over15 = catalog.picks.find((p) => p.family === "totals" && p.direction === "over" && p.line === 1.5);
      const over25 = catalog.picks.find((p) => p.family === "totals" && p.direction === "over" && p.line === 2.5);
      const over35 = catalog.picks.find((p) => p.family === "totals" && p.direction === "over" && p.line === 3.5);
      expect(over15 && over25 && over35).toBeTruthy();
      expect(over15!.pricing.p).toBeGreaterThanOrEqual(over25!.pricing.p);
      expect(over25!.pricing.p).toBeGreaterThanOrEqual(over35!.pricing.p);
      expect(over25!.evidence.bullets.some((b) => b.label.includes("Banda 90 %:"))).toBe(true);

      const bttsYes = catalog.picks.find((p) => p.family === "btts" && p.direction === "yes");
      expect(bttsYes?.evidence.bullets.some((b) => b.label.includes("Banda 90 %:"))).toBe(true);

      const ahHomePicks = catalog.picks
        .filter((p) => p.family === "asian_handicap" && p.direction === "home" && p.line !== null)
        .slice()
        .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
      expect(ahHomePicks.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < ahHomePicks.length; i += 1) {
        expect(ahHomePicks[i]!.pricing.p).toBeGreaterThanOrEqual(ahHomePicks[i - 1]!.pricing.p - 0.001);
      }

      assertNoForbiddenKeysDeep(catalog);
    }

    const eplFull = buildServerMatchPicksCatalog(makeFootballGame(), {
      fullAccess: true,
      markets: makeFootballMarkets(),
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const cardsPick = eplFull.picks.find((p) => p.family === "cards_total");
    expect(cardsPick).toBeDefined();
    expect(
      cardsPick!.evidence.bullets.some((b) => b.label.includes("Puntos por tarjeta proyectados")),
    ).toBe(true);
    expect(eplFull.availableFamilies).toContain("corners_total");
    expect(eplFull.availableFamilies).toContain("shots_total");
    expect(eplFull.availableFamilies).toContain("shots_on_target");
  });
});

describe("picks-catalog Spacetime v6.0 · US multi-deporte, spreads/totales alternativos NFL y Early Payout", () => {
  it("genera Moneyline, alt Spreads (-15.5, -3.5, +7.5) y alt Totals (Over 30.5) NFL vía PMFs discretas con monotonicidad y liquidación FT", () => {
    const nflGame = makeUsGame("american-football");
    const catalog = buildServerMatchPicksCatalog(nflGame, {
      fullAccess: true,
      nflAltSpreadLines: [-15.5, -3.5, -3.0, 7.5],
      nflAltTotalLines: [30.5, 44.5, 51.5],
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });

    const mlHome = catalog.picks.find((p) => p.family === "nfl_moneyline" && p.selectionKey === "home");
    expect(mlHome).toBeDefined();
    expect(mlHome!.engineName).toBe("PitchLab Spacetime v6.0");
    expect(mlHome!.evidence.bullets.some((b) => b.label.includes("Banda 90 %:"))).toBe(true);
    expect(mlHome!.evidence.bullets.some((b) => b.label.includes("Pago anticipado +17 puntos"))).toBe(
      true,
    );

    const spreadMinus155 = catalog.picks.find(
      (p) => p.family === "nfl_spread" && p.direction === "home" && p.line === -15.5,
    );
    const spreadMinus35 = catalog.picks.find(
      (p) => p.family === "nfl_spread" && p.direction === "home" && p.line === -3.5,
    );
    const spreadPlus75 = catalog.picks.find(
      (p) => p.family === "nfl_spread" && p.direction === "home" && p.line === 7.5,
    );
    expect(spreadMinus155).toBeDefined();
    expect(spreadMinus35).toBeDefined();
    expect(spreadPlus75).toBeDefined();
    expect(spreadMinus155!.pricing.p).toBeLessThan(spreadMinus35!.pricing.p);
    expect(spreadMinus35!.pricing.p).toBeLessThan(spreadPlus75!.pricing.p);
    expect(spreadMinus35!.conflictGroup).toBe("home_side");

    const over305 = catalog.picks.find(
      (p) => p.family === "nfl_totals" && p.direction === "over" && p.line === 30.5,
    );
    const over445 = catalog.picks.find(
      (p) => p.family === "nfl_totals" && p.direction === "over" && p.line === 44.5,
    );
    const over515 = catalog.picks.find(
      (p) => p.family === "nfl_totals" && p.direction === "over" && p.line === 51.5,
    );
    expect(over305 && over445 && over515).toBeTruthy();
    expect(over305!.pricing.p).toBeGreaterThan(over445!.pricing.p);
    expect(over445!.pricing.p).toBeGreaterThan(over515!.pricing.p);
    expect(over305!.pricing.fairOdds).toBe(Math.max(1.01, round2(1 / over305!.pricing.p)));

    const nflFt = makeUsGame("american-football", {
      id: "nfl-kc-buf-ft-v6",
      status: "FT",
      score: { home: 24, away: 21 },
    });
    const ftCatalog = buildServerMatchPicksCatalog(nflFt, {
      fullAccess: false,
      nflAltSpreadLines: [-3.5, -3.0, 7.5],
      nflAltTotalLines: [30.5],
      nowIso: FIXED_NOW_ISO,
    });
    expect(ftCatalog.isRedactedForVisitor).toBe(false);
    expect(
      ftCatalog.picks.find((p) => p.family === "nfl_spread" && p.direction === "home" && p.line === -3.0)
        ?.settlement,
    ).toBe("push");
    expect(
      ftCatalog.picks.find((p) => p.family === "nfl_spread" && p.direction === "home" && p.line === -3.5)
        ?.settlement,
    ).toBe("miss");
    expect(
      ftCatalog.picks.find((p) => p.family === "nfl_spread" && p.direction === "home" && p.line === 7.5)
        ?.settlement,
    ).toBe("hit");
    expect(
      ftCatalog.picks.find((p) => p.family === "nfl_totals" && p.direction === "over" && p.line === 30.5)
        ?.settlement,
    ).toBe("hit");
  });

  it("cubre MLB (+5 carreras, Run Line, F5), NHL (+3 goles, Puck Line) y NBA (+20 puntos, Spread, Totals) con v6.0", () => {
    const mlbCat = buildServerMatchPicksCatalog(makeUsGame("baseball"), {
      fullAccess: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const nhlCat = buildServerMatchPicksCatalog(makeUsGame("ice-hockey"), {
      fullAccess: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const nbaCat = buildServerMatchPicksCatalog(makeUsGame("basketball"), {
      fullAccess: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });

    const mlbMl = mlbCat.picks.find((p) => p.family === "mlb_moneyline" && p.selectionKey === "home");
    expect(mlbMl?.evidence.bullets.some((b) => b.label.includes("Pago anticipado +5 carreras"))).toBe(
      true,
    );
    expect(mlbCat.availableFamilies).toContain("mlb_run_line");
    expect(mlbCat.availableFamilies).toContain("mlb_f5");
    expect(mlbCat.availableFamilies).toContain("mlb_totals");

    const nhlMl = nhlCat.picks.find((p) => p.family === "nhl_moneyline" && p.selectionKey === "home");
    expect(nhlMl?.evidence.bullets.some((b) => b.label.includes("Pago anticipado +3 goles"))).toBe(
      true,
    );
    expect(nhlCat.availableFamilies).toContain("nhl_puck_line");
    expect(nhlCat.availableFamilies).toContain("nhl_totals");

    const nbaMl = nbaCat.picks.find((p) => p.family === "nba_moneyline" && p.selectionKey === "home");
    expect(nbaMl?.evidence.bullets.some((b) => b.label.includes("Pago anticipado +20 puntos"))).toBe(
      true,
    );
    expect(nbaCat.availableFamilies).toContain("nba_spread");
    expect(nbaCat.availableFamilies).toContain("nba_totals");
  });
});

describe("picks-catalog Spacetime v6.0 · Props acoplados, atajadas de portero, US lossless y bloqueo estricto Baja/minutos", () => {
  it("emite tiros/SoT acoplados 0.5+..3.5+ y atajadas de portero 1.5+..4.5+ con monotonicidad y GK SGP", () => {
    const game = makeFootballGame();
    const player = makeFootballPlayer();
    const gk = makeGoalkeeper();

    const catalog = buildServerMatchPicksCatalog(game, {
      fullAccess: true,
      footballPlayers: [player],
      footballGoalkeepers: [gk],
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });

    const gkCatalogPicks = catalog.picks.filter(
      (p) => p.family === "player_props_football" && p.selectionKey.includes("player_saves"),
    );
    expect(gkCatalogPicks.length).toBeGreaterThan(0);
    expect(gkCatalogPicks.every((p) => p.label.toLowerCase().includes("atajadas"))).toBe(true);

    const propCatalog = buildMatchPlayerPropsCatalogV6(game, {
      fullAccess: true,
      footballPlayers: [player],
      footballGoalkeepers: [gk],
    });
    expect(propCatalog.isRedactedForVisitor).toBe(false);

    const shotLines = propCatalog.props
      .filter((p) => p.playerSlug === "mohamed-salah" && p.marketKey === "player_shots")
      .slice()
      .sort((a, b) => a.line - b.line);
    expect(shotLines.map((l) => l.line)).toEqual([...CANONICAL_SHOT_LINES_V6]);
    for (let i = 1; i < shotLines.length; i += 1) {
      expect(shotLines[i]!.pOver).toBeLessThanOrEqual(shotLines[i - 1]!.pOver);
    }

    const sotLines = propCatalog.props
      .filter((p) => p.playerSlug === "mohamed-salah" && p.marketKey === "player_sot")
      .slice()
      .sort((a, b) => a.line - b.line);
    expect(sotLines.map((l) => l.line)).toEqual([...CANONICAL_SHOT_LINES_V6]);
    for (let i = 1; i < sotLines.length; i += 1) {
      expect(sotLines[i]!.pOver).toBeLessThanOrEqual(sotLines[i - 1]!.pOver);
    }

    const gkSaveLines = propCatalog.props
      .filter((p) => p.playerSlug === "alisson-becker" && p.marketKey === "player_saves")
      .slice()
      .sort((a, b) => a.line - b.line);
    expect(gkSaveLines.map((l) => l.line)).toEqual([...CANONICAL_GK_SAVES_LINES_V6]);
    for (let i = 1; i < gkSaveLines.length; i += 1) {
      expect(gkSaveLines[i]!.pOver).toBeLessThanOrEqual(gkSaveLines[i - 1]!.pOver);
    }

    expect(propCatalog.goalkeeperSgpCombos.length).toBe(3);
    for (const combo of propCatalog.goalkeeperSgpCombos) {
      expect(combo.eligible).toBe(true);
      expect(combo.jointProbability).not.toBeNull();
      expect(combo.probabilityLowerBound).not.toBeNull();
      expect(combo.probabilityUpperBound).not.toBeNull();
      expect(combo.jointProbability!).toBeGreaterThanOrEqual(combo.probabilityLowerBound! - 1e-4);
      expect(combo.jointProbability!).toBeLessThanOrEqual(combo.probabilityUpperBound! + 1e-4);
      expect(FORBIDDEN_MATH_JARGON_RE.test(combo.comboLabelEs)).toBe(false);
    }

    const visitorProps = buildMatchPlayerPropsCatalogV6(game, {
      fullAccess: false,
      footballPlayers: [player],
      footballGoalkeepers: [gk],
    });
    expect(visitorProps.isRedactedForVisitor).toBe(true);
    expect(visitorProps.props).toEqual([]);
    expect(visitorProps.goalkeeperSgpCombos).toEqual([]);
  });

  it("aplica bloqueo duro (0 picks) en out/Baja y guardia estricta de minutos (>= 45 fútbol / >= 18 NBA) y emite props US lossless", () => {
    const injuredGame = makeFootballGame({
      preGame: {
        cortexSynthesis: "",
        tacticalKeys: [],
        lineupStatusLabel: "XI probable",
        lineupsConfirmed60m: false,
        matchContext: { referee: "Michael Oliver" },
        absences: [
          {
            teamSide: "home",
            player: "Mohamed Salah",
            role: "FWD",
            status: "Baja",
            impactNote: "Baja confirmada",
          },
        ],
        moneyFlow: null,
      },
    });
    const injuredPlayer = makeFootballPlayer();
    const lowMinutesPlayer = makeFootballPlayer({
      playerName: "Harvey Elliott",
      playerSlug: "harvey-elliott",
      avgMinutes: 32,
      matchLogs: [
        { minutesPlayed: 30, isHome: true, shots: 2, shotsOnTarget: 1, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 34, isHome: false, shots: 1, shotsOnTarget: 1, goals: 0, assists: 0, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 32, isHome: true, shots: 2, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
      ],
    });
    const injuredGk = makeGoalkeeper({ availability: "out" });
    const lowMinGk = makeGoalkeeper({
      playerName: "Caoimhin Kelleher",
      playerSlug: "caoimhin-kelleher",
      avgMinutes: 40,
    });

    const footballCat = buildServerMatchPicksCatalog(injuredGame, {
      fullAccess: true,
      footballPlayers: [injuredPlayer, lowMinutesPlayer],
      footballGoalkeepers: [injuredGk, lowMinGk],
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    expect(footballCat.picks.filter((p) => p.family === "player_props_football")).toHaveLength(0);

    const footballPropCat = buildMatchPlayerPropsCatalogV6(injuredGame, {
      fullAccess: true,
      footballPlayers: [injuredPlayer, lowMinutesPlayer],
      footballGoalkeepers: [injuredGk, lowMinGk],
    });
    expect(footballPropCat.props).toHaveLength(0);
    expect(footballPropCat.goalkeeperSgpCombos).toHaveLength(0);

    const nbaGame = makeUsGame("basketball");
    const nbaLowMin: NbaPlayerPropCandidateInput = {
      playerName: "Payton Pritchard",
      playerSlug: "payton-pritchard",
      teamSide: "home",
      teamName: "Boston Celtics",
      position: "G",
      avgMinutes: 14,
      matchLogs: [
        { minutesPlayed: 14, PTS: 10, REB: 2, AST: 3, "3PM": 2 },
        { minutesPlayed: 15, PTS: 12, REB: 3, AST: 2, "3PM": 3 },
        { minutesPlayed: 13, PTS: 9, REB: 2, AST: 2, "3PM": 1 },
      ],
    };
    const nbaOut: NbaPlayerPropCandidateInput = {
      playerName: "Jaylen Brown",
      playerSlug: "jaylen-brown",
      teamSide: "home",
      teamName: "Boston Celtics",
      position: "F",
      avgMinutes: 35,
      matchLogs: [
        { minutesPlayed: 35, PTS: 26, REB: 6, AST: 4, "3PM": 2 },
        { minutesPlayed: 36, PTS: 24, REB: 5, AST: 3, "3PM": 3 },
        { minutesPlayed: 34, PTS: 28, REB: 7, AST: 5, "3PM": 2 },
      ],
    };
    const nbaActive: NbaPlayerPropCandidateInput = {
      playerName: "Jayson Tatum",
      playerSlug: "jayson-tatum",
      teamSide: "home",
      teamName: "Boston Celtics",
      position: "F",
      avgMinutes: 36,
      matchLogs: [
        { minutesPlayed: 37, PTS: 29, REB: 9, AST: 5, "3PM": 3 },
        { minutesPlayed: 36, PTS: 31, REB: 8, AST: 6, "3PM": 4 },
        { minutesPlayed: 35, PTS: 27, REB: 10, AST: 4, "3PM": 3 },
      ],
    };
    const nbaCat = buildServerMatchPicksCatalog(nbaGame, {
      fullAccess: true,
      nbaPlayers: [nbaLowMin, nbaOut, nbaActive],
      injuryStatusByTeamPlayer: new Map([["home|jaylen brown", "Baja"]]),
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    const nbaPropNames = new Set(
      nbaCat.picks
        .filter((p) => p.family === "nba_player_props")
        .map((p) => p.playerMeta?.playerName),
    );
    expect(nbaPropNames.has("Jayson Tatum")).toBe(true);
    expect(nbaPropNames.has("Jaylen Brown")).toBe(false);
    expect(nbaPropNames.has("Payton Pritchard")).toBe(false);

    const usProfiles: UsPlayerCatalogCandidateInputV6[] = [
      {
        sport: "nba",
        playerName: "Jayson Tatum",
        teamSide: "home",
        teamSlug: "bos",
        teamName: "Boston Celtics",
        positionLabel: "SF",
        availability: "available",
        explicitAvgMinutes: 36,
        seasonMetrics: [
          { key: "gp", label: "JJ", value: 20 },
          { key: "min", label: "MIN", value: 36 },
          { key: "pts", label: "PTS", value: 28.5 },
          { key: "reb", label: "REB", value: 8.6 },
          { key: "ast", label: "AST", value: 5.2 },
          { key: "3pm", label: "3PM", value: 3.4 },
        ],
        recentGames: [
          { stats: [{ label: "MIN", value: "37" }, { label: "PTS", value: "30" }, { label: "REB", value: "9" }, { label: "AST", value: "5" }, { label: "3PM", value: "4" }] },
          { stats: [{ label: "MIN", value: "36" }, { label: "PTS", value: "28" }, { label: "REB", value: "8" }, { label: "AST", value: "6" }, { label: "3PM", value: "3" }] },
          { stats: [{ label: "MIN", value: "35" }, { label: "PTS", value: "27" }, { label: "REB", value: "9" }, { label: "AST", value: "4" }, { label: "3PM", value: "3" }] },
        ],
      },
      {
        sport: "nba",
        playerName: "Baja NBA",
        teamSide: "home",
        teamSlug: "bos",
        teamName: "Boston Celtics",
        positionLabel: "SG",
        availability: "out",
        explicitAvgMinutes: 34,
        seasonMetrics: [
          { key: "gp", label: "JJ", value: 18 },
          { key: "min", label: "MIN", value: 34 },
          { key: "pts", label: "PTS", value: 24.0 },
        ],
        recentGames: [],
      },
      {
        sport: "mlb",
        playerName: "Yoshinobu Yamamoto",
        teamSide: "home",
        teamSlug: "lad",
        teamName: "Los Angeles Dodgers",
        positionLabel: "SP",
        availability: "available",
        seasonMetrics: [
          { key: "gp", label: "JJ", value: 15 },
          { key: "so", label: "SO", value: 102 },
          { key: "ip", label: "IP", value: 88.2 },
        ],
        recentGames: [
          { stats: [{ label: "SO", value: "7" }, { label: "IP", value: "6.0" }] },
          { stats: [{ label: "SO", value: "8" }, { label: "IP", value: "6.2" }] },
          { stats: [{ label: "SO", value: "6" }, { label: "IP", value: "5.1" }] },
        ],
      },
      {
        sport: "nhl",
        playerName: "Nathan MacKinnon",
        teamSide: "home",
        teamSlug: "col",
        teamName: "Colorado Avalanche",
        positionLabel: "C",
        availability: "available",
        seasonMetrics: [
          { key: "gp", label: "JJ", value: 24 },
          { key: "sog", label: "SOG", value: 108 },
          { key: "pts", label: "PTS", value: 38 },
          { key: "toi", label: "TOI", value: "22:30" },
        ],
        recentGames: [
          { stats: [{ label: "SOG", value: "5" }, { label: "PTS", value: "2" }, { label: "TOI", value: "22:45" }] },
          { stats: [{ label: "SOG", value: "4" }, { label: "PTS", value: "1" }, { label: "TOI", value: "21:50" }] },
          { stats: [{ label: "SOG", value: "6" }, { label: "PTS", value: "2" }, { label: "TOI", value: "23:10" }] },
        ],
      },
      {
        sport: "nfl",
        playerName: "Patrick Mahomes",
        teamSide: "home",
        teamSlug: "kc",
        teamName: "Kansas City Chiefs",
        positionLabel: "QB",
        availability: "available",
        seasonMetrics: [
          { key: "gp", label: "JJ", value: 11 },
          { key: "yds", label: "YDS", value: 3080 },
          { key: "td", label: "TD", value: 23 },
        ],
        recentGames: [
          { stats: [{ label: "YDS", value: "295" }, { label: "TD", value: "2" }] },
          { stats: [{ label: "YDS", value: "272" }, { label: "TD", value: "3" }] },
          { stats: [{ label: "YDS", value: "310" }, { label: "TD", value: "2" }] },
        ],
      },
    ];

    const usPropCat = buildMatchPlayerPropsCatalogV6(nbaGame, {
      fullAccess: true,
      usPlayerProfiles: usProfiles,
    });
    expect(usPropCat.props.some((p) => p.marketKey === "nba_pts")).toBe(true);
    expect(usPropCat.props.some((p) => p.marketKey === "mlb_so")).toBe(true);
    expect(usPropCat.props.some((p) => p.marketKey === "nhl_sog")).toBe(true);
    expect(usPropCat.props.some((p) => p.marketKey.startsWith("nfl_"))).toBe(true);
    expect(usPropCat.props.some((p) => p.playerName === "Baja NBA")).toBe(false);
    assertNoForbiddenKeysDeep(usPropCat);
  });
});

describe("picks-catalog Spacetime v6.0 · Bet Builder SGP, Daily Parlay y cero jerga prohibida", () => {
  it("evalúa SGP correlacionados (NFL Spread + Over, Portero + Portería a cero, player_linked) respetando cotas numéricas y bloqueando conflictos", () => {
    const nflGame = makeUsGame("american-football");
    const nflCat = buildServerMatchPicksCatalog(nflGame, {
      fullAccess: true,
      nflAltSpreadLines: [-3.5, 7.5],
      nflAltTotalLines: [44.5],
      nowIso: FIXED_NOW_ISO,
    });
    const spreadHome = nflCat.picks.find(
      (p) => p.family === "nfl_spread" && p.direction === "home" && p.line === -3.5,
    )!;
    const spreadAway = nflCat.picks.find(
      (p) => p.family === "nfl_spread" && p.direction === "away" && p.line === 3.5,
    )!;
    const overTotal = nflCat.picks.find(
      (p) => p.family === "nfl_totals" && p.direction === "over" && p.line === 44.5,
    )!;

    const sgpNfl = evaluateServerBetBuilderSgpV6({
      mode: "copula",
      fullAccess: true,
      legs: [spreadHome, overTotal],
      offeredCombinedDecimalOdds: 3.6,
      offeredBookLabel: "Bet365",
    });
    expect(sgpNfl.ok).toBe(true);
    expect(sgpNfl.jointProbability).not.toBeNull();
    expect(sgpNfl.probabilityLowerBound).not.toBeNull();
    expect(sgpNfl.probabilityUpperBound).not.toBeNull();
    expect(sgpNfl.jointProbability!).toBeGreaterThanOrEqual(sgpNfl.probabilityLowerBound! - 1e-4);
    expect(sgpNfl.jointProbability!).toBeLessThanOrEqual(sgpNfl.probabilityUpperBound! + 1e-4);
    expect(sgpNfl.fairCombinedDecimal).toBeGreaterThan(1.01);
    expect(FORBIDDEN_MATH_JARGON_RE.test(sgpNfl.summaryEs)).toBe(false);
    assertNoForbiddenKeysDeep(sgpNfl);

    const contradictory = evaluateServerBetBuilderSgpV6({
      mode: "copula",
      fullAccess: true,
      legs: [spreadHome, spreadAway],
    });
    expect(contradictory.ok).toBe(false);
    expect(contradictory.blockedReason).not.toBeNull();

    const visitorSgp = evaluateServerBetBuilderSgpV6({
      mode: "copula",
      fullAccess: false,
      legs: [spreadHome, overTotal],
    });
    expect(visitorSgp.ok).toBe(false);
    expect(visitorSgp.isRedacted).toBe(true);
    expect(visitorSgp.jointProbability).toBeNull();

    const gkSgp = evaluateServerBetBuilderSgpV6({
      mode: "goalkeeper_saves",
      fullAccess: true,
      playerName: "Alisson Becker",
      savesLine: 2.5,
      ebSaveRate: 0.75,
      oppExpectedSoT: 4.1,
      teamExpectedGoals: 1.8,
      opponentExpectedGoals: 1.0,
      matchOutcome: "clean_sheet",
      expectedMinutes: 90,
      offeredCombinedDecimalOdds: 4.5,
      offeredBookLabel: "1xBet",
    });
    expect(gkSgp.ok).toBe(true);
    expect(gkSgp.offeredBookDecimal).toBeNull();
    expect(gkSgp.offeredBookLabel).toBeNull();
    expect(gkSgp.bookQuoteAudit).toBeNull();
    expect(gkSgp.evPct).toBeNull();
    expect(gkSgp.jointProbability!).toBeGreaterThanOrEqual(gkSgp.probabilityLowerBound! - 1e-4);
    expect(gkSgp.jointProbability!).toBeLessThanOrEqual(gkSgp.probabilityUpperBound! + 1e-4);
    expect(FORBIDDEN_MATH_JARGON_RE.test(gkSgp.summaryEs)).toBe(false);

    const unattributedSgp = evaluateServerBetBuilderSgpV6({
      mode: "copula",
      fullAccess: true,
      legs: [spreadHome, overTotal],
      offeredCombinedDecimalOdds: 4.0,
    });
    expect(unattributedSgp.ok).toBe(true);
    expect(unattributedSgp.offeredBookDecimal).toBeNull();
    expect(unattributedSgp.offeredBookLabel).toBeNull();
    expect(unattributedSgp.bookQuoteAudit).toBeNull();
    expect(unattributedSgp.evPct).toBeNull();

    const injuredGkSgp = evaluateServerBetBuilderSgpV6({
      mode: "goalkeeper_saves",
      fullAccess: true,
      playerName: "Alisson Becker",
      savesLine: 2.5,
      ebSaveRate: 0.75,
      oppExpectedSoT: 4.1,
      teamExpectedGoals: 1.8,
      opponentExpectedGoals: 1.0,
      matchOutcome: "clean_sheet",
      expectedMinutes: 90,
      injuryStatus: "Baja",
    });
    expect(injuredGkSgp.ok).toBe(false);
    expect(injuredGkSgp.blockedReason).toBe("jugador_baja");

    const playerLinked = evaluateServerBetBuilderSgpV6({
      mode: "player_linked",
      fullAccess: true,
      playerName: "Mohamed Salah",
      pPlayerAnytimeGoal: 0.44,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 1.0,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      expectedMinutes: 88,
    });
    expect(playerLinked.ok).toBe(true);
    expect(playerLinked.legsCount).toBe(3);
    expect(playerLinked.jointProbability!).toBeGreaterThanOrEqual(
      playerLinked.probabilityLowerBound! - 1e-4,
    );
    expect(playerLinked.jointProbability!).toBeLessThanOrEqual(
      playerLinked.probabilityUpperBound! + 1e-4,
    );
    expect(FORBIDDEN_MATH_JARGON_RE.test(playerLinked.summaryEs)).toBe(false);
    assertNoForbiddenKeysDeep(playerLinked);

    const footballGame = makeFootballGame();
    const footballCat = buildServerMatchPicksCatalog(footballGame, {
      fullAccess: true,
      markets: makeFootballMarkets(),
      footballGoalkeepers: [makeGoalkeeper()],
      nowIso: FIXED_NOW_ISO,
    });
    const suggested = buildSuggestedMatchSgpCombosV6(footballGame, footballCat, {
      fullAccess: true,
      footballGoalkeepers: [makeGoalkeeper()],
    });
    expect(suggested.length).toBeGreaterThanOrEqual(2);
    expect(suggested.some((c) => c.titleEs.includes("Portería a cero"))).toBe(true);
    expect(
      buildSuggestedMatchSgpCombosV6(footballGame, footballCat, { fullAccess: false }),
    ).toEqual([]);
  });

  it("produce candidatos v6.0 para Daily Parlay excluyendo picks redactados o anómalos", () => {
    const games = [
      makeFootballGame({ id: "dp-epl-1" }),
      makeUsGame("american-football", { id: "dp-nfl-1" }),
      makeUsGame("basketball", { id: "dp-nba-1" }),
    ];
    const catalogs = new Map(
      games.map((g) => [
        g.id,
        buildServerMatchPicksCatalog(g, {
          fullAccess: true,
          markets: g.sport === "football" ? makeFootballMarkets() : [],
          nowIso: FIXED_NOW_ISO,
        }),
      ]),
    );
    const candidatesByGame = buildDailyParlayCandidatesFromCatalogV6(games, catalogs, {
      fullAccess: true,
      maxCandidatesPerGame: 2,
    });
    expect(candidatesByGame.size).toBe(3);

    const hydratedGames = games.map((g) => ({
      ...g,
      picks: [...(candidatesByGame.get(g.id) ?? [])],
    }));
    const dailyLegs = buildSmartAutoParlay(hydratedGames, {
      leagues: [],
      risk: "medio",
      legCount: 3,
      allowSgp: false,
      viewerRole: "member",
    });
    expect(dailyLegs.length).toBeGreaterThanOrEqual(2);
    expect(dailyLegs.length).toBeLessThanOrEqual(MAX_PARLAY_LEGS);
    expect(dailyLegs.every((leg) => !leg.pick.isRedacted && leg.pick.p > 0)).toBe(true);

    const visitorCandidates = buildDailyParlayCandidatesFromCatalogV6(games, catalogs, {
      fullAccess: false,
      maxCandidatesPerGame: 2,
    });
    expect(visitorCandidates.size).toBe(0);
  });
});

describe("picks-catalog Spacetime v6.0 · Cero-Fuga, isPermittedMarketQuoteBook, same-book de-vig, Anti-EV y preservación FT", () => {
  it("redacta estrictamente todo pick en redactCatalogPickForVisitor sin filtrar llaves ni métricas prohibidas", () => {
    const game = makeFootballGame();
    const memberCat = buildServerMatchPicksCatalog(game, {
      fullAccess: true,
      markets: makeFootballMarkets(),
      footballPlayers: [makeFootballPlayer()],
      nowIso: FIXED_NOW_ISO,
    });
    const sample = memberCat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    const redacted = redactCatalogPickForVisitor(sample, 0);

    expect(redacted.isRedacted).toBe(true);
    expect(redacted.isPrimaryModelPick).toBe(false);
    expect(redacted.isDerived).toBe(false);
    expect(redacted.isDailyOpenPromo).toBe(false);
    expect(redacted.isTipsterWeeklyOpen).toBe(false);
    expect(redacted.playerMeta).toBeNull();
    expect(redacted.bookQuotes).toBeUndefined();
    expect(redacted.pricing).toEqual({
      p: 0,
      fairOdds: 0,
      fairAmerican: 0,
      marketDecimal: null,
      marketAmerican: null,
      marketBookLabel: null,
      marketCapturedAtUtc: null,
      deVigMarketProb: null,
      deVigMethod: "none",
      overroundPct: null,
      evPct: null,
      edgePts: null,
      noVigEdgePts: null,
      valueLabel: null,
      hasPositiveValue: false,
    });
    expect(redacted.evidence).toEqual({
      windows: [],
      xgSignal: null,
      refereeSignal: null,
      bullets: [],
      avgObservedRatePct: null,
    });
    assertNoForbiddenKeysDeep(redacted);
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("Pinnacle");
    expect(serialized).not.toContain("fairDecimal");
    expect(serialized).not.toContain("modelProb");
  });

  it("bloquea casas no permitidas y exige de-vig exclusivamente de la misma casa (0 cross-book de-vig)", () => {
    expect(isPermittedMarketQuoteBook("pinnacle", "Pinnacle")).toBe(true);
    expect(isPermittedMarketQuoteBook("1xbet", "1xBet")).toBe(false);

    const blockedBookGame = makeFootballGame({ id: "epl-blocked-book" });
    const blockedCat = buildServerMatchPicksCatalog(blockedBookGame, {
      fullAccess: true,
      markets: makeFootballMarkets({
        homeBook: "1xBet",
        drawBook: "1xBet",
        awayBook: "1xBet",
      }),
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    const blockedHome = blockedCat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    expect(blockedHome.pricing.marketDecimal).toBeNull();
    expect(blockedHome.pricing.marketBookLabel).toBeNull();
    expect(blockedHome.pricing.deVigMarketProb).toBeNull();
    expect(blockedHome.bookQuotes).toBeUndefined();

    const crossBookGame = makeFootballGame({ id: "epl-cross-book" });
    const crossCat = buildServerMatchPicksCatalog(crossBookGame, {
      fullAccess: true,
      markets: makeFootballMarkets({
        homeBook: "Pinnacle",
        drawBook: "Bet365",
        awayBook: "Codere",
      }),
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    const crossHome = crossCat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    expect(crossHome.pricing.marketDecimal).toBe(2.02);
    expect(crossHome.pricing.marketBookLabel).toBe("Pinnacle");
    expect(crossHome.pricing.deVigMarketProb).toBeNull();
    expect(crossHome.pricing.deVigMethod).toBe("none");

    const sameBookCat = buildServerMatchPicksCatalog(makeFootballGame({ id: "epl-same-book" }), {
      fullAccess: true,
      markets: makeFootballMarkets({
        homeBook: "Pinnacle",
        drawBook: "Pinnacle",
        awayBook: "Pinnacle",
      }),
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    const sameHome = sameBookCat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    expect(sameHome.pricing.deVigMarketProb).not.toBeNull();
    expect(sameHome.pricing.deVigMethod).not.toBe("none");
  });

  it("aplica Anti-EV ADR-062 (18 % sharp / 22 % soft y |p - deVig| <= 12 %) y preserva el 100 % de picks en partidos FT", () => {
    const sharpAnomCat = buildServerMatchPicksCatalog(makeFootballGame({ id: "epl-anti-ev-sharp" }), {
      fullAccess: true,
      markets: makeFootballMarkets({
        homeBook: "Pinnacle",
        drawBook: "Pinnacle",
        awayBook: "Pinnacle",
        homeDecimal: 2.6,
        drawDecimal: 3.1,
        awayDecimal: 2.8,
      }),
      preserveAll: true,
      nowIso: FIXED_NOW_ISO,
    });
    const sharpHome = sharpAnomCat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    expect(isHardAnomalousCatalogPick(sharpHome)).toBe(true);
    expect(sharpHome.pricing.evPct).toBeNull();
    expect(sharpHome.pricing.hasPositiveValue).toBe(false);

    const compactedNs = compactCatalogPayload(sharpAnomCat, {
      maxPicksPerFamily: 4,
      maxTotalPicks: 48,
      preserveAll: false,
    });
    expect(
      compactedNs.picks.some((p) => p.family === "1x2" && p.selectionKey === "home"),
    ).toBe(false);

    const softBorderlineBase: CatalogPickItem = {
      ...sharpHome,
      pricing: {
        ...sharpHome.pricing,
        p: 0.5,
        fairOdds: 2.0,
        marketDecimal: 2.42,
        marketBookLabel: "Bet365",
        deVigMarketProb: 0.42,
        noVigEdgePts: 8.0,
        evPct: 21.0,
        edgePts: 8.7,
        hasPositiveValue: true,
      },
    };
    const sharpSameQuote: CatalogPickItem = {
      ...softBorderlineBase,
      pricing: {
        ...softBorderlineBase.pricing,
        marketBookLabel: "Pinnacle",
      },
    };
    expect(isHardAnomalousCatalogPick(softBorderlineBase)).toBe(false);
    expect(isHardAnomalousCatalogPick(sharpSameQuote)).toBe(true);

    const ftGame = makeFootballGame({
      id: "epl-ft-preserve-all",
      status: "FT",
      score: { home: 2, away: 1 },
    });
    const ftAll = buildServerMatchPicksCatalog(ftGame, {
      fullAccess: false,
      markets: makeFootballMarkets({
        homeBook: "Pinnacle",
        drawBook: "Pinnacle",
        awayBook: "Pinnacle",
        homeDecimal: 2.6,
        drawDecimal: 3.1,
        awayDecimal: 2.8,
      }),
      nowIso: FIXED_NOW_ISO,
    });
    expect(ftAll.isRedactedForVisitor).toBe(false);
    expect(ftAll.picks.length).toBeGreaterThan(20);
    expect(ftAll.picks.every((p) => !p.isRedacted)).toBe(true);
    const ftAnomalousHome = ftAll.picks.find((p) => p.family === "1x2" && p.selectionKey === "home");
    expect(ftAnomalousHome).toBeDefined();
    expect(ftAnomalousHome!.settlement).toBe("hit");
  });
});

function makeEmptySquadStats(
  overrides: Partial<TeamSquadEntry["players"][number]["stats"]> = {},
): TeamSquadEntry["players"][number]["stats"] {
  return {
    appearances: 14,
    subIns: 0,
    goals: 4,
    assists: 2,
    shots: 42,
    shotsOnTarget: 18,
    foulsCommitted: 10,
    foulsSuffered: 12,
    yellowCards: 2,
    redCards: 0,
    offsides: 5,
    saves: 0,
    shotsFaced: 0,
    goalsConceded: 0,
    ...overrides,
  };
}

describe("picks-catalog Spacetime v6.0 · Regresiones Error-Driven Block 4A (pstack)", () => {
  it("ALTO #2: aísla mapas multi-equipo, preserva precedencia de Baja y aplica fallback de injuries.json en disco", () => {
    const footballGame = makeFootballGame({ id: "epl-inj-isolation-v6" });
    const salah = makeFootballPlayer();

    const unrelatedTeamMap = new Map<string, string>([
      ["chelsea|mohamed salah", "Baja"],
      ["manchester-city|mohamed salah", "out"],
    ]);
    const unaffectedCat = buildServerMatchPicksCatalog(footballGame, {
      fullAccess: true,
      footballPlayers: [salah],
      injuryStatusByTeamPlayer: unrelatedTeamMap,
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    expect(
      unaffectedCat.picks.some(
        (p) => p.family === "player_props_football" && p.playerMeta?.playerName === "Mohamed Salah",
      ),
    ).toBe(true);

    const precedenceMaps = [
      new Map<string, string>([
        ["liverpool|mohamed salah", "Baja"],
        ["home|mohamed salah", "active"],
      ]),
      new Map<string, string>([
        ["home|mohamed salah", "active"],
        ["liverpool|mohamed salah", "out"],
      ]),
    ];
    for (const map of precedenceMaps) {
      const blockedCat = buildServerMatchPicksCatalog(footballGame, {
        fullAccess: true,
        footballPlayers: [salah],
        injuryStatusByTeamPlayer: map,
        preserveAll: true,
        compact: false,
        nowIso: FIXED_NOW_ISO,
      });
      expect(
        blockedCat.picks.filter(
          (p) => p.family === "player_props_football" && p.playerMeta?.playerName === "Mohamed Salah",
        ),
      ).toHaveLength(0);
    }

    const absencesSquad: TeamSquadEntry = {
      teamId: asTeamId("premier-league.liverpool"),
      teamSlug: "liverpool",
      teamName: "Liverpool",
      coachName: "Arne Slot",
      updatedAt: FIXED_NOW_ISO,
      players: [
        {
          id: "pl-salah",
          slug: "mohamed-salah",
          name: "Mohamed Salah",
          shortName: "M. Salah",
          jersey: "11",
          positionGroup: "FWD",
          positionLabel: "FWD",
          age: 34,
          heightCm: 175,
          weightKg: 71,
          nationality: "Egipto",
          nationalityCode: "EGY",
          availability: "available",
          stats: makeEmptySquadStats(),
          seasonMetrics: [{ key: "min", label: "MIN", value: "88" }],
          candidatePicks: [],
        },
        {
          id: "pl-diaz",
          slug: "luis-diaz",
          name: "Luis Diaz",
          shortName: "L. Diaz",
          jersey: "7",
          positionGroup: "FWD",
          positionLabel: "FWD",
          age: 29,
          heightCm: 178,
          weightKg: 65,
          nationality: "Colombia",
          nationalityCode: "COL",
          availability: "available",
          stats: makeEmptySquadStats({ appearances: 14, shots: 36, shotsOnTarget: 15 }),
          seasonMetrics: [{ key: "min", label: "MIN", value: "84" }],
          candidatePicks: [],
        },
      ],
    };
    const absencesGame = makeFootballGame({
      id: "epl-absences-squad-v6",
      preGame: {
        cortexSynthesis: "",
        tacticalKeys: [],
        lineupStatusLabel: "XI probable",
        lineupsConfirmed60m: false,
        matchContext: { referee: "Michael Oliver" },
        absences: [
          {
            teamSide: "home",
            player: "Mohamed Salah",
            role: "FWD",
            status: "Baja",
            impactNote: "Baja confirmada",
          },
        ],
        moneyFlow: null,
      },
    });
    const absencesCat = buildServerMatchPicksCatalog(absencesGame, {
      fullAccess: true,
      homeSquad: absencesSquad,
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    expect(
      absencesCat.picks.filter(
        (p) => p.family === "player_props_football" && p.playerMeta?.playerName === "Mohamed Salah",
      ),
    ).toHaveLength(0);
    expect(
      absencesCat.picks.some(
        (p) => p.family === "player_props_football" && p.playerMeta?.playerName === "Luis Diaz",
      ),
    ).toBe(true);

    const nbaSnapshotsDir = path.join(resolveSnapshotsRoot(), "nba");
    const nbaInjuriesDisk = JSON.parse(
      fs.readFileSync(path.join(nbaSnapshotsDir, "injuries.json"), "utf8"),
    ) as { entries?: Array<{ teamId: string; player: string; position?: string; status: string }> };
    const nbaSquadsDisk = JSON.parse(
      fs.readFileSync(path.join(nbaSnapshotsDir, "squads.json"), "utf8"),
    ) as {
      teams?: Array<{
        teamId: string;
        teamSlug: string;
        teamName: string;
        players?: Array<{ name: string; slug: string }>;
      }>;
    };
    const bajaEntries = (nbaInjuriesDisk.entries ?? []).filter((e) => e.status === "Baja");
    const injuredEntry = bajaEntries[0]!;
    expect(injuredEntry).toBeDefined();
    const injuredTeamSlug = injuredEntry.teamId.replace(/^nba\./, "");
    const injuredDiskTeam = nbaSquadsDisk.teams?.find((t) => t.teamId === injuredEntry.teamId);
    const injuredTeamName =
      injuredDiskTeam?.teamName ??
      injuredTeamSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    const injuredPlayerSlug = injuredEntry.player
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const bajaNamesByTeam = new Set(bajaEntries.map((e) => `${e.teamId}::${e.player.toLowerCase()}`));
    const healthyDiskTeam =
      nbaSquadsDisk.teams?.find(
        (t) =>
          t.teamId !== injuredEntry.teamId &&
          (t.players ?? []).some((p) => !bajaNamesByTeam.has(`${t.teamId}::${p.name.toLowerCase()}`)),
      ) ?? null;
    const healthyTeamId = healthyDiskTeam?.teamId ?? "nba.boston-celtics";
    const healthyTeamSlug = healthyDiskTeam?.teamSlug ?? "boston-celtics";
    const healthyTeamName = healthyDiskTeam?.teamName ?? "Boston Celtics";
    const healthyPlayerName =
      healthyDiskTeam?.players?.find(
        (p) => !bajaNamesByTeam.has(`${healthyTeamId}::${p.name.toLowerCase()}`),
      )?.name ?? "Jaylen Brown";
    const healthyPlayerSlug = healthyPlayerName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const nbaGame = makeUsGame("basketball", {
      id: "nba-disk-injuries-fallback-v6",
      home: {
        slug: healthyTeamSlug,
        name: healthyTeamName,
        shortName: healthyTeamName,
        code: healthyTeamSlug.slice(0, 3).toUpperCase(),
        record: "14G-5P",
      },
      away: {
        slug: injuredTeamSlug,
        name: injuredTeamName,
        shortName: injuredTeamName,
        code: injuredTeamSlug.slice(0, 3).toUpperCase(),
        record: "12G-7P",
      },
    });
    const injuredCand: NbaPlayerPropCandidateInput = {
      playerName: injuredEntry.player,
      playerSlug: injuredPlayerSlug,
      teamSide: "away",
      teamName: injuredTeamName,
      position: injuredEntry.position || "G",
      avgMinutes: 35,
      matchLogs: [
        { minutesPlayed: 35, PTS: 21, REB: 5, AST: 6, "3PM": 3 },
        { minutesPlayed: 36, PTS: 23, REB: 4, AST: 5, "3PM": 2 },
        { minutesPlayed: 34, PTS: 19, REB: 5, AST: 7, "3PM": 3 },
      ],
    };
    const healthyCand: NbaPlayerPropCandidateInput = {
      playerName: healthyPlayerName,
      playerSlug: healthyPlayerSlug,
      teamSide: "home",
      teamName: healthyTeamName,
      position: "F",
      avgMinutes: 35,
      matchLogs: [
        { minutesPlayed: 35, PTS: 26, REB: 6, AST: 4, "3PM": 2 },
        { minutesPlayed: 36, PTS: 25, REB: 5, AST: 3, "3PM": 3 },
        { minutesPlayed: 34, PTS: 27, REB: 7, AST: 5, "3PM": 2 },
      ],
    };
    const injuredTeamSquad: TeamSquadEntry = {
      teamId: asTeamId(injuredEntry.teamId),
      teamSlug: injuredTeamSlug,
      teamName: injuredTeamName,
      coachName: "Head Coach",
      updatedAt: FIXED_NOW_ISO,
      players: [
        {
          id: `nba-${injuredPlayerSlug}`,
          slug: injuredPlayerSlug,
          name: injuredEntry.player,
          shortName: injuredEntry.player,
          jersey: "15",
          positionGroup: "MID",
          positionLabel: injuredEntry.position || "SG",
          age: 28,
          heightCm: 196,
          weightKg: 89,
          nationality: "Estados Unidos",
          nationalityCode: "USA",
          availability: "available",
          stats: makeEmptySquadStats({ appearances: 20, shots: 0, shotsOnTarget: 0 }),
          seasonMetrics: [
            { key: "gp", label: "JJ", value: "20" },
            { key: "min", label: "MIN", value: "35" },
            { key: "pts", label: "PTS", value: "21.5" },
          ],
          recentGames: [
            { dateIso: "2026-11-15", opponent: "BOS", stats: [{ label: "MIN", value: "35" }, { label: "PTS", value: "22" }] },
            { dateIso: "2026-11-13", opponent: "DEN", stats: [{ label: "MIN", value: "36" }, { label: "PTS", value: "24" }] },
            { dateIso: "2026-11-11", opponent: "PHX", stats: [{ label: "MIN", value: "34" }, { label: "PTS", value: "19" }] },
          ],
          candidatePicks: [],
        },
      ],
    };
    const healthyTeamSquad: TeamSquadEntry = {
      teamId: asTeamId(healthyTeamId),
      teamSlug: healthyTeamSlug,
      teamName: healthyTeamName,
      coachName: "Joe Mazzulla",
      updatedAt: FIXED_NOW_ISO,
      players: [
        {
          id: `nba-${healthyPlayerSlug}`,
          slug: healthyPlayerSlug,
          name: healthyPlayerName,
          shortName: healthyPlayerName,
          jersey: "7",
          positionGroup: "FWD",
          positionLabel: "SF",
          age: 30,
          heightCm: 198,
          weightKg: 101,
          nationality: "Estados Unidos",
          nationalityCode: "USA",
          availability: "available",
          stats: makeEmptySquadStats({ appearances: 20, shots: 0, shotsOnTarget: 0 }),
          seasonMetrics: [
            { key: "gp", label: "JJ", value: "20" },
            { key: "min", label: "MIN", value: "35" },
            { key: "pts", label: "PTS", value: "26.0" },
          ],
          recentGames: [
            { dateIso: "2026-11-15", opponent: "LAL", stats: [{ label: "MIN", value: "35" }, { label: "PTS", value: "26" }] },
            { dateIso: "2026-11-13", opponent: "NYK", stats: [{ label: "MIN", value: "36" }, { label: "PTS", value: "25" }] },
            { dateIso: "2026-11-11", opponent: "MIA", stats: [{ label: "MIN", value: "34" }, { label: "PTS", value: "27" }] },
          ],
          candidatePicks: [],
        },
      ],
    };

    const diskFallbackCat = buildServerMatchPicksCatalog(nbaGame, {
      fullAccess: true,
      nbaPlayers: [injuredCand, healthyCand],
      homeSquad: healthyTeamSquad,
      awaySquad: injuredTeamSquad,
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const emittedNbaNames = new Set(
      diskFallbackCat.picks
        .filter((p) => p.family === "nba_player_props")
        .map((p) => p.playerMeta?.playerName),
    );
    expect(emittedNbaNames.has(injuredEntry.player)).toBe(false);
    expect(emittedNbaNames.has(healthyPlayerName)).toBe(true);

    const diskFallbackProps = buildMatchPlayerPropsCatalogV6(nbaGame, {
      fullAccess: true,
      homeSquad: healthyTeamSquad,
      awaySquad: injuredTeamSquad,
    });
    expect(diskFallbackProps.props.some((p) => p.playerName === injuredEntry.player)).toBe(false);
    expect(diskFallbackProps.props.some((p) => p.playerName === healthyPlayerName)).toBe(true);

    const homeOnlyInjuredGame = makeUsGame("basketball", {
      id: "nba-home-disk-inj-v6",
      home: {
        slug: injuredTeamSlug,
        name: injuredTeamName,
        shortName: injuredTeamName,
        code: injuredTeamSlug.slice(0, 3).toUpperCase(),
        record: "9G-8P",
      },
    });
    const homeInjuredCand: NbaPlayerPropCandidateInput = {
      ...injuredCand,
      teamSide: "home",
    };
    const homeInjuredCat = buildServerMatchPicksCatalog(homeOnlyInjuredGame, {
      fullAccess: true,
      nbaPlayers: [homeInjuredCand],
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    expect(
      homeInjuredCat.picks.filter(
        (p) => p.family === "nba_player_props" && p.playerMeta?.playerName === injuredEntry.player,
      ),
    ).toHaveLength(0);
  });

  it("ALTO #3: liquida FT de player_saves sin usar shots_on_target = 0 como falso miss", () => {
    const ftGame = makeFootballGame({
      id: "epl-gk-saves-ft-v6",
      status: "FT",
      score: { home: 2, away: 1 },
    });
    const gk = makeGoalkeeper();

    const noSavesStatCat = buildServerMatchPicksCatalog(ftGame, {
      fullAccess: true,
      footballGoalkeepers: [gk],
      finalStats: {
        playerStats: {
          "alisson-becker": { shots_on_target: 0 },
        },
      },
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const gkPicksNoSaves = noSavesStatCat.picks.filter(
      (p) => p.family === "player_props_football" && p.selectionKey.includes("_player_saves_"),
    );
    expect(gkPicksNoSaves.length).toBeGreaterThan(0);
    expect(gkPicksNoSaves.every((p) => p.settlement === "pending")).toBe(true);
    expect(gkPicksNoSaves.some((p) => p.settlement === "miss")).toBe(false);

    const gkStatsWithSaves = { shots_on_target: 0, saves: 5 };
    const playerStatsWithSaves: NonNullable<MatchFinalCountStats["playerStats"]> = {
      "alisson-becker": gkStatsWithSaves,
    };
    const withSavesCat = buildServerMatchPicksCatalog(ftGame, {
      fullAccess: true,
      footballGoalkeepers: [gk],
      finalStats: {
        playerStats: playerStatsWithSaves,
      },
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const gkPicksWithSaves = withSavesCat.picks.filter(
      (p) => p.family === "player_props_football" && p.selectionKey.includes("_player_saves_"),
    );
    expect(gkPicksWithSaves.length).toBeGreaterThan(0);
    expect(
      gkPicksWithSaves.filter((p) => p.line !== null && p.line < 5).every((p) => p.settlement === "hit"),
    ).toBe(true);
    expect(gkPicksWithSaves.some((p) => p.settlement === "miss")).toBe(false);
  });

  it("ALTO #4: preserva coherencia de particiones Venn-Abers en bordes 0.645/0.355 (Liga MX y Premier League)", () => {
    for (const league of ["liga-mx", "premier-league"] as const) {
      const binDirect = calibrateVennAbersBinaryPartitionV6(0.645, 0.355, league, true);
      const binSwapped = calibrateVennAbersBinaryPartitionV6(0.355, 0.645, league, true);
      expect(Math.abs(binDirect.first + binDirect.second - 1)).toBeLessThan(1e-3);
      expect(Math.abs(binSwapped.first + binSwapped.second - 1)).toBeLessThan(1e-3);
      expect(binDirect.first).toBe(binSwapped.second);
      expect(binDirect.second).toBe(binSwapped.first);
      expect(binDirect.first).toBeLessThan(0.64);

      const tri = calibrateVennAbersThreeWayPartitionV6(0.645, 0.2, 0.155, league, true);
      expect(Math.abs(tri.home + tri.draw + tri.away - 1)).toBeLessThan(1e-3);
      expect(Math.abs(tri.home + tri.dcx2 - 1)).toBeLessThan(1e-3);
      expect(Math.abs(tri.away + tri.dc1x - 1)).toBeLessThan(1e-3);
      expect(Math.abs(tri.draw + tri.dc12 - 1)).toBeLessThan(1e-3);

      const boundaryGame = makeFootballGame({
        id: `boundary-va-${league}`,
        league: asLeagueId(league),
        leagueLabel: league === "liga-mx" ? "Liga MX" : "Premier League",
        x12: [0.645, 0.2, 0.155],
        projection: { home: 2.32, away: 1.0, total: 3.32 },
        goalLine: { line: 2.5, pOver: 0.645 },
      });
      const cat = buildServerMatchPicksCatalog(boundaryGame, {
        fullAccess: true,
        preserveAll: true,
        compact: false,
        nowIso: FIXED_NOW_ISO,
      });

      const pHome = cat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
      const pDraw = cat.picks.find((p) => p.family === "1x2" && p.selectionKey === "draw")!;
      const pAway = cat.picks.find((p) => p.family === "1x2" && p.selectionKey === "away")!;
      const dc1x = cat.picks.find((p) => p.family === "double_chance" && p.selectionKey === "1x")!;
      const dcx2 = cat.picks.find((p) => p.family === "double_chance" && p.selectionKey === "x2")!;
      const dc12 = cat.picks.find((p) => p.family === "double_chance" && p.selectionKey === "12")!;
      expect(Math.abs(pHome.pricing.p + pDraw.pricing.p + pAway.pricing.p - 1)).toBeLessThan(1e-3);
      expect(Math.abs(pHome.pricing.p + dcx2.pricing.p - 1)).toBeLessThan(1e-3);
      expect(Math.abs(pAway.pricing.p + dc1x.pricing.p - 1)).toBeLessThan(1e-3);
      expect(Math.abs(pDraw.pricing.p + dc12.pricing.p - 1)).toBeLessThan(1e-3);

      const totalsLines = Array.from(
        new Set(
          cat.picks
            .filter((p) => p.family === "totals" && p.line !== null)
            .map((p) => p.line!),
        ),
      );
      expect(totalsLines).toContain(2.5);
      for (const ln of totalsLines) {
        const over = cat.picks.find((p) => p.family === "totals" && p.direction === "over" && p.line === ln);
        const under = cat.picks.find((p) => p.family === "totals" && p.direction === "under" && p.line === ln);
        expect(over && under).toBeTruthy();
        expect(Math.abs(over!.pricing.p + under!.pricing.p - 1)).toBeLessThan(1e-3);
      }

      const bttsYes = cat.picks.find((p) => p.family === "btts" && p.direction === "yes")!;
      const bttsNo = cat.picks.find((p) => p.family === "btts" && p.direction === "no")!;
      expect(Math.abs(bttsYes.pricing.p + bttsNo.pricing.p - 1)).toBeLessThan(1e-3);

      const dnbHome = cat.picks.find((p) => p.family === "dnb" && p.selectionKey === "home")!;
      const dnbAway = cat.picks.find((p) => p.family === "dnb" && p.selectionKey === "away")!;
      expect(Math.abs(dnbHome.pricing.p + dnbAway.pricing.p - 1)).toBeLessThan(1e-3);

      const ahHomePicks = cat.picks.filter(
        (p) => p.family === "asian_handicap" && p.direction === "home" && p.line !== null,
      );
      expect(ahHomePicks.length).toBeGreaterThan(0);
      for (const ahH of ahHomePicks) {
        const expectedAwayLine = ahH.line === 0 ? 0 : -ahH.line!;
        const ahA = cat.picks.find(
          (p) =>
            p.family === "asian_handicap" &&
            p.direction === "away" &&
            p.line !== null &&
            Math.abs(p.line - expectedAwayLine) < 0.01,
        );
        if (ahA) {
          expect(Math.abs(ahH.pricing.p + ahA.pricing.p - 1)).toBeLessThan(1e-3);
        }
      }

      for (const pick of cat.picks) {
        expect(Number.isFinite(pick.pricing.fairOdds)).toBe(true);
        expect(pick.pricing.fairOdds).toBeGreaterThanOrEqual(1.01);
        expect(pick.pricing.fairOdds).toBe(
          Math.max(1.01, probabilityToFairOdds(pick.pricing.p).decimal),
        );
      }
    }
  });

  it("ALTO #5: bloquea fuga de extremos 0.08..0.92, elimina fallback legacy en shots/SoT y descarta props sin playerMeta", () => {
    const game = makeFootballGame({ id: "epl-alto5-guards-v6" });

    const ultraHighShooter = makeFootballPlayer({
      playerName: "Erling Haaland",
      playerSlug: "erling-haaland",
      position: "FWD",
      avgMinutes: 90,
      matchLogs: [
        { minutesPlayed: 90, isHome: true, shots: 9, shotsOnTarget: 5, goals: 2, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 8, shotsOnTarget: 4, goals: 1, assists: 0, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 10, shotsOnTarget: 5, goals: 2, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 8, shotsOnTarget: 4, goals: 1, assists: 1, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 9, shotsOnTarget: 5, goals: 2, assists: 0, foulsCommitted: 1, yellowCards: 0 },
      ],
      marketQuotes: {
        shots: { line: 0.5 },
      },
    });
    const zeroShotsPlayer = makeFootballPlayer({
      playerName: "Virgil van Dijk",
      playerSlug: "virgil-van-dijk",
      position: "DEF",
      avgMinutes: 90,
      matchLogs: [
        { minutesPlayed: 90, isHome: true, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 0, yellowCards: 0 },
      ],
    });
    const lowVolumeDefender = makeFootballPlayer({
      playerName: "Ibrahima Konate",
      playerSlug: "ibrahima-konate",
      position: "DEF",
      avgMinutes: 90,
      matchLogs: [
        { minutesPlayed: 90, isHome: true, shots: 1, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 90, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, foulsCommitted: 0, yellowCards: 0 },
      ],
      marketQuotes: {
        shots: { line: 3.5 },
      },
    });
    const outOfRangeLinePlayer = makeFootballPlayer({
      playerName: "Cody Gakpo",
      playerSlug: "cody-gakpo",
      position: "FWD",
      avgMinutes: 84,
      marketQuotes: {
        shots: { line: 4.5 },
      },
    });

    const legacyPlayerProp: PlayerPropItem & {
      readonly minutesPlayed: readonly number[];
      readonly avgMinutes: number;
    } = {
      id: "legacy-shot-prop-1",
      league: asLeagueId("premier-league"),
      leagueLabel: "Premier League",
      gameId: game.id,
      matchLabel: "Liverpool vs Arsenal",
      kickoffLocal: "12:00",
      player: "Bukayo Saka",
      teamSlug: "arsenal",
      teamName: "Arsenal",
      position: "FWD",
      statLabel: "Tiros",
      baseLine: 1.5,
      step: 0.5,
      minLine: 0.5,
      maxLine: 3.5,
      projectionMean: 2.6,
      projectionSd: 1.4,
      engineName: "Legacy",
      marketOverDecimal: 1.85,
      marketUnderDecimal: 1.95,
      last10: [3, 2, 4, 2, 3],
      contextNote: "Legacy test prop",
      minutesPlayed: [90, 88, 90, 86, 90],
      avgMinutes: 88.8,
    };

    const guardedCat = buildServerMatchPicksCatalog(game, {
      fullAccess: true,
      footballPlayers: [ultraHighShooter, zeroShotsPlayer, lowVolumeDefender, outOfRangeLinePlayer],
      playerProps: [legacyPlayerProp],
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });

    const shotAndSotPicks = guardedCat.picks.filter(
      (p) =>
        p.family === "player_props_football" &&
        (p.playerMeta?.statKey === "shots" || p.playerMeta?.statKey === "shots_on_target"),
    );
    expect(shotAndSotPicks.length).toBeGreaterThan(0);
    expect(shotAndSotPicks.every((p) => p.pricing.p >= 0.08 && p.pricing.p <= 0.92)).toBe(true);
    expect(
      shotAndSotPicks.some(
        (p) => p.playerMeta?.playerName === "Ibrahima Konate" && p.line === 3.5,
      ),
    ).toBe(false);
    expect(
      shotAndSotPicks.some((p) => p.playerMeta?.playerName === "Virgil van Dijk"),
    ).toBe(false);
    expect(
      shotAndSotPicks.some((p) => p.playerMeta?.playerName === "Bukayo Saka"),
    ).toBe(false);
    expect(
      shotAndSotPicks.some(
        (p) => p.playerMeta?.playerName === "Cody Gakpo" && p.line === 4.5,
      ),
    ).toBe(false);

    const sampleFootballProp = shotAndSotPicks[0]!;
    const emptyLookup = {
      bySidePlayer: new Map<string, string>(),
      byPlayer: new Map<string, string>(),
    };
    expect(
      resolveFootballBasePlayerPropV6({
        item: { ...sampleFootballProp, playerMeta: null },
        injuryLookup: emptyLookup,
        coupledShotsByPlayerLine: new Map(),
        rejectedCoupledPlayerMetrics: new Set(),
      }),
    ).toBeNull();
    expect(
      resolveFootballBasePlayerPropV6({
        item: { ...sampleFootballProp, playerMeta: undefined },
        injuryLookup: emptyLookup,
        coupledShotsByPlayerLine: new Map(),
        rejectedCoupledPlayerMetrics: new Set(),
      }),
    ).toBeNull();
    expect(
      resolveFootballBasePlayerPropV6({
        item: sampleFootballProp,
        injuryLookup: emptyLookup,
        coupledShotsByPlayerLine: new Map(),
        rejectedCoupledPlayerMetrics: new Set(),
      }),
    ).toBeNull();

    const nbaGame = makeUsGame("basketball", { id: "nba-meta-guard-v6" });
    const nbaCat = buildServerMatchPicksCatalog(nbaGame, {
      fullAccess: true,
      nbaPlayers: [
        {
          playerName: "Jayson Tatum",
          playerSlug: "jayson-tatum",
          teamSide: "home",
          teamName: "Boston Celtics",
          position: "F",
          avgMinutes: 36,
          matchLogs: [
            { minutesPlayed: 36, PTS: 28, REB: 9, AST: 5, "3PM": 3 },
            { minutesPlayed: 35, PTS: 30, REB: 8, AST: 6, "3PM": 4 },
            { minutesPlayed: 37, PTS: 26, REB: 10, AST: 4, "3PM": 3 },
          ],
        },
      ],
      preserveAll: true,
      compact: false,
      nowIso: FIXED_NOW_ISO,
    });
    const sampleNbaProp = nbaCat.picks.find((p) => p.family === "nba_player_props")!;
    expect(sampleNbaProp).toBeDefined();
    expect(
      resolveNbaBasePlayerPropV6({
        item: { ...sampleNbaProp, playerMeta: null },
        injuryLookup: emptyLookup,
        nbaCandidatesBySlug: new Map(),
      }),
    ).toBeNull();
    expect(
      resolveNbaBasePlayerPropV6({
        item: { ...sampleNbaProp, playerMeta: undefined },
        injuryLookup: emptyLookup,
        nbaCandidatesBySlug: new Map(),
      }),
    ).toBeNull();

    const strippedCatalog = compactCatalogPayload(
      {
        ...guardedCat,
        picks: [
          { ...sampleFootballProp, id: "missing-meta-fb", playerMeta: null },
          { ...sampleNbaProp, id: "missing-meta-nba", playerMeta: null },
        ],
      },
      { preserveAll: true, compact: false },
    );
    expect(strippedCatalog.picks).toHaveLength(0);
  });

  it("MEDIO #6: evaluateServerBetBuilderSgpV6 modo player_linked exige >= 2 piernas", () => {
    const singleLegNull = evaluateServerBetBuilderSgpV6({
      mode: "player_linked",
      fullAccess: true,
      playerName: "Mohamed Salah",
      pPlayerAnytimeGoal: 0.44,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 1.0,
      teamOutcome: "any",
      matchTotalOverLine: null,
      expectedMinutes: 88,
    });
    expect(singleLegNull.ok).toBe(false);
    expect(singleLegNull.blockedReason).toBe("minimo_dos_piernas");
    expect(singleLegNull.legsCount).toBe(0);
    expect(singleLegNull.jointProbability).toBeNull();

    const singleLegOmitted = evaluateServerBetBuilderSgpV6({
      mode: "player_linked",
      fullAccess: true,
      playerName: "Mohamed Salah",
      pPlayerAnytimeGoal: 0.44,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 1.0,
      teamOutcome: "any",
      expectedMinutes: 88,
    });
    expect(singleLegOmitted.ok).toBe(false);
    expect(singleLegOmitted.blockedReason).toBe("minimo_dos_piernas");
    expect(singleLegOmitted.legsCount).toBe(0);

    const twoLegsWithTotal = evaluateServerBetBuilderSgpV6({
      mode: "player_linked",
      fullAccess: true,
      playerName: "Mohamed Salah",
      pPlayerAnytimeGoal: 0.44,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 1.0,
      teamOutcome: "any",
      matchTotalOverLine: 2.5,
      expectedMinutes: 88,
    });
    expect(twoLegsWithTotal.ok).toBe(true);
    expect(twoLegsWithTotal.legsCount).toBe(2);

    const twoLegsWithOutcome = evaluateServerBetBuilderSgpV6({
      mode: "player_linked",
      fullAccess: true,
      playerName: "Mohamed Salah",
      pPlayerAnytimeGoal: 0.44,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 1.0,
      teamOutcome: "team_win",
      matchTotalOverLine: null,
      expectedMinutes: 88,
    });
    expect(twoLegsWithOutcome.ok).toBe(true);
    expect(twoLegsWithOutcome.legsCount).toBe(2);
  });
});
