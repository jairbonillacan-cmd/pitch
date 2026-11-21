import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  type MatchAnalysis,
  type PlatformSport,
} from "@pitchlab/contracts";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  FOOTBALL_MARKET_FAMILY_IDS,
  FOOTBALL_PROP_MIN_MINUTES,
  MARKET_FAMILIES,
  MARKET_FAMILY_COUNT,
  MARKET_FAMILY_IDS,
  MLB_MARKET_FAMILY_IDS,
  NBA_MARKET_FAMILY_IDS,
  NFL_MARKET_FAMILY_IDS,
  NHL_MARKET_FAMILY_IDS,
  bivariateNormalJointProb,
  buildCatalogPickEvidence,
  buildMatchPicksCatalog,
  buildNumericSeriesEvidenceWindows,
  catalogPickToBetBuilderLeg,
  checkBetBuilderCompatibility,
  checkBetBuilderPairCompatibility,
  computeAdaptiveDeVig,
  computePickPricing,
  computeProportionalDeVig,
  computeShinDeVig,
  evaluateBetBuilder,
  getMarketFamiliesForSport,
  getMarketFamilySpec,
  getPairwiseCorrelationRho,
  gradeCatalogPick,
  resolveRefereeEvidenceSignal,
  resolveXgEvidenceSignal,
  toneForObservedRate,
  type BetBuilderLegInput,
  type FootballPlayerPropCandidateInput,
  type MatchFinalCountStats,
  type NbaPlayerPropCandidateInput,
  type TeamMatchEvidenceRecord,
} from "../src/platform/picks-catalog/index";
import type { PlatformGame } from "../src/platform/types";

function buildSportGame(params: {
  readonly id: string;
  readonly league: Parameters<typeof asLeagueId>[0];
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly homeName: string;
  readonly awayName: string;
  readonly x12: [number, number, number];
  readonly projection: { readonly home: number; readonly away: number; readonly total: number };
  readonly status?: "NS" | "FT" | "LIVE";
  readonly score?: { readonly home: number; readonly away: number };
  readonly referee?: string;
}): PlatformGame {
  const isFootball = params.sport === "football";
  const match: MatchAnalysis = {
    id: params.id,
    league: asLeagueId(params.league),
    leagueLabel: params.leagueLabel,
    sport: params.sport,
    round: "Jornada 14",
    day: "2030-11-14",
    dayLabel: "jueves, 14 de noviembre",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Azteca",
    status: params.status ?? "NS",
    ...(params.score ? { score: params.score } : {}),
    ...(params.referee ? { referee: params.referee } : {}),
    home: {
      slug: params.homeName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
      name: params.homeName,
      shortName: params.homeName,
      code: params.homeName.slice(0, 3).toUpperCase(),
      record: "10G-3E-2P",
    },
    away: {
      slug: params.awayName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
      name: params.awayName,
      shortName: params.awayName,
      code: params.awayName.slice(0, 3).toUpperCase(),
      record: "6G-4E-5P",
    },
    x12: params.x12,
    projection: params.projection,
    outcomes: isFootball
      ? [
          { key: "home", label: `${params.homeName} gana`, probability: params.x12[0] },
          { key: "draw", label: "Empate", probability: params.x12[1] },
          { key: "away", label: `${params.awayName} gana`, probability: params.x12[2] },
        ]
      : [
          { key: "home", label: `${params.homeName} gana`, probability: params.x12[0] },
          { key: "away", label: `${params.awayName} gana`, probability: params.x12[2] },
        ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          {
            market: asMarketKey("h2h"),
            selection: "home",
            label: `${params.homeName} gana`,
            p: params.x12[0],
            fairOdds: 1 / params.x12[0],
          },
          ...(isFootball
            ? [
                {
                  market: asMarketKey("h2h"),
                  selection: "draw",
                  label: "Empate",
                  p: params.x12[1],
                  fairOdds: 1 / params.x12[1],
                },
              ]
            : []),
          {
            market: asMarketKey("h2h"),
            selection: "away",
            label: `${params.awayName} gana`,
            p: params.x12[2],
            fairOdds: 1 / params.x12[2],
          },
        ],
      },
    ],
    factors: [
      {
        label: "Forma local",
        detail: "",
        impact: "",
        value: "G-G-E-G-G · 4-0",
        sub: "11 goles a favor",
      },
      {
        label: "Forma visitante",
        detail: "",
        impact: "",
        value: "P-G-E-P-G · 2-2",
        sub: "6 goles a favor",
      },
    ],
    headToHead: [
      { date: "2026-03-01", home: params.homeName, away: params.awayName, homeGoals: 2, awayGoals: 1 },
      { date: "2025-10-12", home: params.awayName, away: params.homeName, homeGoals: 1, awayGoals: 2 },
      { date: "2025-04-15", home: params.homeName, away: params.awayName, homeGoals: 3, awayGoals: 0 },
      { date: "2024-09-10", home: params.awayName, away: params.homeName, homeGoals: 1, awayGoals: 0 },
    ],
    trace: [],
  };

  return buildPlatformDataset([
    {
      league: asLeagueId(params.league),
      leagueLabel: params.leagueLabel,
      sport: params.sport,
      season: "2030",
      roundLabel: "Jornada 14",
      generatedAt: "2030-11-13T18:00:00Z",
      games: [match],
      standings: [],
    },
  ]).games[0]!;
}

function makeLeg(overrides: Partial<BetBuilderLegInput>): BetBuilderLegInput {
  return {
    id: overrides.id ?? "leg-default",
    gameId: overrides.gameId ?? "game-mx-1",
    sport: overrides.sport ?? "football",
    gameStatus: overrides.gameStatus ?? "NS",
    family: overrides.family ?? "1x2",
    axis: overrides.axis ?? "result_ft",
    selectionKey: overrides.selectionKey ?? "home",
    label: overrides.label ?? "América gana",
    line: overrides.line ?? null,
    direction: overrides.direction ?? "home",
    p: overrides.p ?? 0.56,
    marketDecimal: overrides.marketDecimal ?? null,
    isRedacted: overrides.isRedacted ?? false,
    playerKey: overrides.playerKey ?? null,
    playerTeamSide: overrides.playerTeamSide ?? null,
    playerStatKey: overrides.playerStatKey ?? null,
    lineupStatus: overrides.lineupStatus ?? null,
  };
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

describe("Catálogo de Picks Multi-Deporte · 34 familias (20 Fútbol + 14 US)", () => {
  it("expone exactamente 34 familias únicas con metadatos y etiquetas en español sin copy prohibido", () => {
    expect(MARKET_FAMILY_COUNT).toBe(34);
    expect(MARKET_FAMILY_IDS).toHaveLength(34);
    expect(FOOTBALL_MARKET_FAMILY_IDS).toHaveLength(20);
    expect(NBA_MARKET_FAMILY_IDS).toHaveLength(4);
    expect(MLB_MARKET_FAMILY_IDS).toHaveLength(4);
    expect(NHL_MARKET_FAMILY_IDS).toHaveLength(3);
    expect(NFL_MARKET_FAMILY_IDS).toHaveLength(3);

    const usCount =
      NBA_MARKET_FAMILY_IDS.length +
      MLB_MARKET_FAMILY_IDS.length +
      NHL_MARKET_FAMILY_IDS.length +
      NFL_MARKET_FAMILY_IDS.length;
    expect(usCount).toBe(14);
    expect(FOOTBALL_MARKET_FAMILY_IDS.length + usCount).toBe(34);

    // Claves únicas y correspondencia 1:1 con MARKET_FAMILIES
    expect(new Set(MARKET_FAMILY_IDS).size).toBe(34);
    expect(Object.keys(MARKET_FAMILIES)).toHaveLength(34);

    for (const id of MARKET_FAMILY_IDS) {
      const spec = getMarketFamilySpec(id);
      expect(spec.id).toBe(id);
      expect(spec.label.trim().length).toBeGreaterThan(2);
      expect(spec.shortLabel.trim().length).toBeGreaterThan(1);
      expect(spec.description.trim().length).toBeGreaterThan(10);
      expect(CATALOG_CATEGORY_ORDER).toContain(spec.category);
      expect(CATALOG_CATEGORY_LABELS[spec.category].trim().length).toBeGreaterThan(2);
      expect([2, 3]).toContain(spec.ways);
      expect(typeof spec.supportsPush).toBe("boolean");
      expect(typeof spec.requiresLineupGuard).toBe("boolean");
      expect(typeof spec.usesRefereeAdjustment).toBe("boolean");
      expect(typeof spec.sgpEligible).toBe("boolean");

      // ADR-054: cero copy prohibido en etiquetas ni descripciones
      const combined = `${spec.label} ${spec.shortLabel} ${spec.description}`;
      expect(combined).not.toMatch(/confianza|conf\.|datos completos|datos parciales/i);
    }

    // Desglose exacto por deporte
    expect(getMarketFamiliesForSport("football")).toHaveLength(20);
    expect(getMarketFamiliesForSport("basketball")).toHaveLength(4);
    expect(getMarketFamiliesForSport("baseball")).toHaveLength(4);
    expect(getMarketFamiliesForSport("ice-hockey")).toHaveLength(3);
    expect(getMarketFamiliesForSport("american-football")).toHaveLength(3);

    // Metadatos críticos por familia
    expect(MARKET_FAMILIES.player_props_football.requiresLineupGuard).toBe(true);
    expect(MARKET_FAMILIES.nba_player_props.requiresLineupGuard).toBe(true);
    expect(MARKET_FAMILIES.cards_total.usesRefereeAdjustment).toBe(true);
    expect(MARKET_FAMILIES.fouls_total.usesRefereeAdjustment).toBe(true);
    expect(MARKET_FAMILIES.dnb.supportsPush).toBe(true);
    expect(MARKET_FAMILIES.asian_handicap.supportsPush).toBe(true);
  });

  it("buildMatchPicksCatalog cubre las 34 familias en conjunto entre Fútbol, NBA, MLB, NHL y NFL", () => {
    const footballGame = buildSportGame({
      id: "mx-ame-chi",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.52, 0.26, 0.22],
      projection: { home: 1.85, away: 1.05, total: 2.9 },
      referee: "César Ramos",
    });

    const qualifiedPlayer: FootballPlayerPropCandidateInput = {
      playerName: "Henry Martín",
      teamSide: "home",
      teamName: "América",
      position: "FWD",
      lineupStatus: "confirmed",
      matchLogs: [
        { minutesPlayed: 84, isHome: true, shots: 4, shotsOnTarget: 2, goals: 1, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 78, isHome: false, shots: 3, shotsOnTarget: 2, goals: 1, assists: 1, foulsCommitted: 2, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 3, shotsOnTarget: 1, goals: 0, assists: 1, foulsCommitted: 1, yellowCards: 1 },
        { minutesPlayed: 68, isHome: true, shots: 2, shotsOnTarget: 1, goals: 1, assists: 0, foulsCommitted: 2, yellowCards: 0 },
      ],
    };

    const nbaGame = buildSportGame({
      id: "nba-lal-bos",
      league: "nba",
      leagueLabel: "NBA",
      sport: "basketball",
      homeName: "Lakers",
      awayName: "Celtics",
      x12: [0.58, 0, 0.42],
      projection: { home: 116.5, away: 112.0, total: 228.5 },
    });

    const nbaPlayer: NbaPlayerPropCandidateInput = {
      playerName: "LeBron James",
      teamSide: "home",
      teamName: "Lakers",
      position: "F",
      lineupStatus: "confirmed",
      matchLogs: [
        { minutesPlayed: 35, PTS: 27, REB: 8, AST: 9, "3PM": 2 },
        { minutesPlayed: 36, PTS: 24, REB: 7, AST: 8, "3PM": 3 },
        { minutesPlayed: 33, PTS: 29, REB: 9, AST: 7, "3PM": 2 },
        { minutesPlayed: 37, PTS: 26, REB: 8, AST: 10, "3PM": 2 },
      ],
    };

    const mlbGame = buildSportGame({
      id: "mlb-lad-nyy",
      league: "mlb",
      leagueLabel: "MLB",
      sport: "baseball",
      homeName: "Dodgers",
      awayName: "Yankees",
      x12: [0.56, 0, 0.44],
      projection: { home: 4.8, away: 4.0, total: 8.8 },
    });

    const nhlGame = buildSportGame({
      id: "nhl-col-edm",
      league: "nhl",
      leagueLabel: "NHL",
      sport: "ice-hockey",
      homeName: "Avalanche",
      awayName: "Oilers",
      x12: [0.55, 0, 0.45],
      projection: { home: 3.3, away: 2.8, total: 6.1 },
    });

    const nflGame = buildSportGame({
      id: "nfl-kc-buf",
      league: "nfl",
      leagueLabel: "NFL",
      sport: "american-football",
      homeName: "Chiefs",
      awayName: "Bills",
      x12: [0.6, 0, 0.4],
      projection: { home: 25.5, away: 21.0, total: 46.5 },
    });

    const footballCat = buildMatchPicksCatalog(footballGame, { footballPlayers: [qualifiedPlayer] });
    const nbaCat = buildMatchPicksCatalog(nbaGame, { nbaPlayers: [nbaPlayer] });
    const mlbCat = buildMatchPicksCatalog(mlbGame);
    const nhlCat = buildMatchPicksCatalog(nhlGame);
    const nflCat = buildMatchPicksCatalog(nflGame);

    expect(footballCat.availableFamilies).toHaveLength(20);
    expect(nbaCat.availableFamilies).toHaveLength(4);
    expect(mlbCat.availableFamilies).toHaveLength(4);
    expect(nhlCat.availableFamilies).toHaveLength(3);
    expect(nflCat.availableFamilies).toHaveLength(3);

    const emittedUnion = new Set([
      ...footballCat.availableFamilies,
      ...nbaCat.availableFamilies,
      ...mlbCat.availableFamilies,
      ...nhlCat.availableFamilies,
      ...nflCat.availableFamilies,
    ]);
    expect(emittedUnion.size).toBe(34);
    for (const id of MARKET_FAMILY_IDS) {
      expect(emittedUnion.has(id)).toBe(true);
    }
  });
});

describe("Valoración financiera (de-vig proporcional/Shin, fairOdds y EV+)", () => {
  it("remueve margen de casa con de-vig proporcional y Shin, corrigiendo sesgo favorito-underdog", () => {
    const sym = computeProportionalDeVig([1.91, 1.91]);
    expect(sym).not.toBeNull();
    expect(sym!.method).toBe("proportional");
    expect(sym!.probs).toEqual([0.5, 0.5]);
    expect(sym!.overroundPct).toBeCloseTo(4.71, 2);

    const threeWayProp = computeProportionalDeVig([1.5, 3.8, 6.5]);
    const threeWayShin = computeShinDeVig([1.5, 3.8, 6.5]);
    expect(threeWayProp).not.toBeNull();
    expect(threeWayShin).not.toBeNull();
    expect(threeWayShin!.method).toBe("shin");
    expect(threeWayShin!.shinZ).toBeGreaterThan(0);
    expect(threeWayShin!.overroundPct).toBeCloseTo(threeWayProp!.overroundPct, 2);

    const propSum = threeWayProp!.probs.reduce((a, b) => a + b, 0);
    const shinSum = threeWayShin!.probs.reduce((a, b) => a + b, 0);
    expect(propSum).toBeCloseTo(1, 3);
    expect(shinSum).toBeCloseTo(1, 3);

    // Shin asigna mayor probabilidad al favorito y menor al underdog extremo que proporcional
    expect(threeWayShin!.probs[0]!).toBeGreaterThan(threeWayProp!.probs[0]!);
    expect(threeWayShin!.probs[2]!).toBeLessThan(threeWayProp!.probs[2]!);

    // Adaptive de-vig elige proporcional en mercados sharp (< 3.5 %) y Shin en overround >= 3.5 %
    const sharpAuto = computeAdaptiveDeVig([1.96, 1.96], "auto");
    expect(sharpAuto?.method).toBe("proportional");
    const recAuto = computeAdaptiveDeVig([1.5, 3.8, 6.5], "auto");
    expect(recAuto?.method).toBe("shin");

    // Entradas inválidas o fuera de rango devuelven null
    expect(computeProportionalDeVig([1.9])).toBeNull();
    expect(computeShinDeVig([1.0, 2.0])).toBeNull();
    expect(computeProportionalDeVig([1.1, 1.1])).toBeNull();
  });

  it("calcula fairOdds = 1/p, EV+, edgePts, noVigEdgePts y respeta ausencia de cuota real", () => {
    const pos = computePickPricing({
      calibratedProb: 0.6,
      marketDecimal: 1.85,
      companionMarketDecimals: [1.85, 1.95],
      companionIndex: 0,
      marketBookLabel: "Pinnacle",
      marketCapturedAtUtc: "2030-11-14T15:00:00Z",
    });
    expect(pos.p).toBe(0.6);
    expect(pos.fairOdds).toBe(1.67);
    expect(pos.marketDecimal).toBe(1.85);
    expect(pos.deVigMethod).toBe("shin");
    expect(pos.deVigMarketProb).not.toBeNull();
    expect(pos.evPct).toBe(11);
    expect(pos.edgePts).toBe(5.9);
    expect(pos.noVigEdgePts).toBeGreaterThan(5);
    expect(pos.hasPositiveValue).toBe(true);
    expect(pos.valueLabel).toBe("Valor +11.0 %");

    const neg = computePickPricing({
      calibratedProb: 0.45,
      marketDecimal: 2.0,
      companionMarketDecimals: [2.0, 1.9],
      companionIndex: 0,
    });
    expect(neg.fairOdds).toBe(2.22);
    expect(neg.evPct).toBe(-10);
    expect(neg.hasPositiveValue).toBe(false);
    expect(neg.valueLabel).toBeNull();

    const noMarket = computePickPricing({ calibratedProb: 0.5 });
    expect(noMarket.fairOdds).toBe(2);
    expect(noMarket.marketDecimal).toBeNull();
    expect(noMarket.deVigMethod).toBe("none");
    expect(noMarket.evPct).toBeNull();
    expect(noMarket.valueLabel).toBeNull();

    // Nunca emite fairOdds = 1.00 ni probabilidad fuera de (0.01, 0.99)
    const extreme = computePickPricing({ calibratedProb: 1.0 });
    expect(extreme.p).toBe(0.99);
    expect(extreme.fairOdds).toBeGreaterThanOrEqual(1.01);
  });
});

describe("Liquidación FT (hit/miss/push/pending), ventanas de evidencia y guardia minMinutes >= 45", () => {
  it("liquida correctamente hit, miss, push y pending en partidos NS y FT", () => {
    const nsGame = buildSportGame({
      id: "mx-ns",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.52, 0.26, 0.22],
      projection: { home: 1.85, away: 1.05, total: 2.9 },
      status: "NS",
    });
    expect(
      gradeCatalogPick({ game: nsGame, family: "1x2", selectionKey: "home", line: null }),
    ).toBe("pending");

    const ftWinGame = buildSportGame({
      id: "mx-ft-2-1",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.52, 0.26, 0.22],
      projection: { home: 1.85, away: 1.05, total: 2.9 },
      status: "FT",
      score: { home: 2, away: 1 },
    });

    const ftDrawGame = buildSportGame({
      id: "mx-ft-1-1",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.52, 0.26, 0.22],
      projection: { home: 1.85, away: 1.05, total: 2.9 },
      status: "FT",
      score: { home: 1, away: 1 },
    });

    const finalStats: MatchFinalCountStats = {
      cornersHome: 6,
      cornersAway: 5,
      playerStats: {
        "henry-martin": { shots: 4, shots_on_target: 2 },
      },
    };

    // Hits
    expect(gradeCatalogPick({ game: ftWinGame, family: "1x2", selectionKey: "home", line: null })).toBe("hit");
    expect(gradeCatalogPick({ game: ftWinGame, family: "btts", selectionKey: "yes", line: null })).toBe("hit");
    expect(gradeCatalogPick({ game: ftWinGame, family: "totals", selectionKey: "over_2.5", line: 2.5 })).toBe("hit");
    expect(
      gradeCatalogPick({
        game: ftWinGame,
        family: "corners_total",
        selectionKey: "over_10.5",
        line: 10.5,
        finalStats,
      }),
    ).toBe("hit");
    expect(
      gradeCatalogPick({
        game: ftWinGame,
        family: "player_props_football",
        selectionKey: "henry-martin_shots_over_2.5",
        line: 2.5,
        finalStats,
        playerKey: "henry-martin",
        playerStatKey: "shots",
      }),
    ).toBe("hit");

    // Misses
    expect(gradeCatalogPick({ game: ftWinGame, family: "1x2", selectionKey: "away", line: null })).toBe("miss");
    expect(gradeCatalogPick({ game: ftWinGame, family: "btts", selectionKey: "no", line: null })).toBe("miss");
    expect(gradeCatalogPick({ game: ftWinGame, family: "totals", selectionKey: "under_2.5", line: 2.5 })).toBe("miss");

    // Pushes exactos (DNB en empate, AH -1.0 en 2-1, Total 3.0 en 2-1)
    expect(gradeCatalogPick({ game: ftDrawGame, family: "dnb", selectionKey: "home", line: null })).toBe("push");
    expect(
      gradeCatalogPick({ game: ftWinGame, family: "asian_handicap", selectionKey: "home_-1.0", line: -1 }),
    ).toBe("push");
    expect(
      gradeCatalogPick({ game: ftWinGame, family: "totals", selectionKey: "over_3", line: 3 }),
    ).toBe("push");

    // Pending honesto cuando un mercado de conteo en FT carece de finalStats reales
    expect(
      gradeCatalogPick({ game: ftWinGame, family: "corners_total", selectionKey: "over_10.5", line: 10.5 }),
    ).toBe("pending");
  });

  it("construye ventanas reales L5, L10, L20, Local-Visita y H2H junto con xG y señal arbitral", () => {
    const game = buildSportGame({
      id: "mx-ev-win",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.54, 0.25, 0.21],
      projection: { home: 1.9, away: 1.0, total: 2.9 },
      referee: "César Ramos",
    });

    const homeHistory: TeamMatchEvidenceRecord[] = Array.from({ length: 20 }, (_, i) => ({
      isHome: i % 2 === 0,
      goalsFor: i < 16 ? 2 : 0,
      goalsAgainst: 1,
    }));

    const xgSignal = resolveXgEvidenceSignal(game);
    const refSignal = resolveRefereeEvidenceSignal(game);
    expect(xgSignal).not.toBeNull();
    expect(xgSignal!.totalXg).toBe(2.9);
    expect(refSignal).not.toBeNull();
    expect(refSignal!.name).toBe("César Ramos");

    const ev = buildCatalogPickEvidence({
      game,
      family: "totals",
      selectionKey: "over_2.5",
      line: 2.5,
      direction: "over",
      xgSignal,
      refereeSignal: refSignal,
      homeHistory,
    });

    const keys = ev.windows.map((w) => w.window);
    expect(keys).toEqual(["L5", "L10", "L20", "home_away", "h2h"]);

    const l5 = ev.windows.find((w) => w.window === "L5")!;
    const l10 = ev.windows.find((w) => w.window === "L10")!;
    const l20 = ev.windows.find((w) => w.window === "L20")!;
    const split = ev.windows.find((w) => w.window === "home_away")!;
    const h2h = ev.windows.find((w) => w.window === "h2h")!;

    expect(l5.hits).toBe(5);
    expect(l5.ratePct).toBe(100);
    expect(l5.tone).toBe("high");
    expect(l10.sample).toBe(10);
    expect(l10.ratePct).toBe(100);
    expect(l20.hits).toBe(16);
    expect(l20.sample).toBe(20);
    expect(l20.ratePct).toBe(80);
    expect(split.label).toContain("Local");
    expect(split.hits).toBe(8);
    expect(split.sample).toBe(10);
    expect(split.ratePct).toBe(80);
    expect(h2h.hits).toBe(3);
    expect(h2h.sample).toBe(4);
    expect(h2h.ratePct).toBe(75);

    // Serie numérica con pushes excluidos del denominador
    const series = buildNumericSeriesEvidenceWindows({
      values: [3, 2, 4, 2, 1, 3, 2, 3, 4, 2, 3, 2, 1, 3, 2, 3],
      homeAwayValues: [3, 4, 3, 1, 3],
      venueLabel: "Local",
      line: 2,
      direction: "over",
      subjectLabel: "Henry Martín",
    });
    expect(series.map((w) => w.window)).toEqual(["L5", "L10", "L20", "home_away"]);
    expect(series[0]!.pushes).toBe(2);
    expect(series[0]!.hits).toBe(2);
    expect(series[0]!.ratePct).toBe(67);
    expect(toneForObservedRate(72)).toBe("high");
    expect(toneForObservedRate(55)).toBe("mid");
    expect(toneForObservedRate(30)).toBe("low");
  });

  it("impone guardia estricta minMinutes >= 45 en player props de fútbol y descarta bajas", () => {
    expect(FOOTBALL_PROP_MIN_MINUTES).toBe(45);

    const game = buildSportGame({
      id: "mx-props-guard",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.55, 0.25, 0.2],
      projection: { home: 1.9, away: 1.0, total: 2.9 },
    });
    game.preGame.absences.push({
      teamSide: "home",
      player: "Lesionado Baja",
      role: "FWD",
      status: "Baja",
      impactNote: "Fuera por lesión",
    });

    const candidates: FootballPlayerPropCandidateInput[] = [
      // Intenta bajar el umbral a 20 min, pero ningún partido alcanza 45 min -> rechazado
      {
        playerName: "Suplente Corto",
        teamSide: "home",
        teamName: "América",
        position: "FWD",
        minMinutes: 20,
        matchLogs: [
          { minutesPlayed: 30, shots: 4, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 35, shots: 3, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 40, shots: 4, shotsOnTarget: 3, goals: 1 },
          { minutesPlayed: 44, shots: 3, shotsOnTarget: 1, goals: 0 },
        ],
      },
      // Respaldo seasonTotals con media < 45 min -> rechazado
      {
        playerName: "Rotación Baja",
        teamSide: "away",
        teamName: "Chivas",
        position: "MID",
        avgMinutes: 38,
        seasonTotals: { appearances: 10, shots: 28, shotsOnTarget: 12 },
      },
      // Jugador listado como Baja -> rechazado aunque tenga logs >= 45 min
      {
        playerName: "Lesionado Baja",
        teamSide: "home",
        teamName: "América",
        position: "FWD",
        matchLogs: [
          { minutesPlayed: 85, shots: 4, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 90, shots: 3, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 75, shots: 3, shotsOnTarget: 1, goals: 1 },
        ],
      },
      // Mezcla de 4 partidos >= 45 min y 3 apariciones cortas (< 45 min) -> solo cuenta las 4 válidas y fuerza guardia >= 45
      {
        playerName: "Henry Martín",
        teamSide: "home",
        teamName: "América",
        position: "FWD",
        lineupStatus: "confirmed",
        minMinutes: 30,
        matchLogs: [
          { minutesPlayed: 80, isHome: true, shots: 3, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 75, isHome: true, shots: 4, shotsOnTarget: 2, goals: 1 },
          { minutesPlayed: 90, isHome: true, shots: 3, shotsOnTarget: 1, goals: 0 },
          { minutesPlayed: 62, isHome: false, shots: 2, shotsOnTarget: 1, goals: 1 },
          { minutesPlayed: 15, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0 },
          { minutesPlayed: 25, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0 },
          { minutesPlayed: 44, isHome: false, shots: 0, shotsOnTarget: 0, goals: 0 },
        ],
      },
    ];

    const catalog = buildMatchPicksCatalog(game, { footballPlayers: candidates });
    const propPicks = catalog.picks.filter((p) => p.family === "player_props_football");

    expect(propPicks.length).toBeGreaterThan(0);
    expect(propPicks.every((p) => p.playerMeta?.playerName === "Henry Martín")).toBe(true);
    for (const pk of propPicks) {
      expect(pk.playerMeta?.minMinutesGuard).toBe(45);
      expect(pk.playerMeta?.qualifyingMatches).toBe(4);
      expect(pk.playerMeta?.avgMinutes).toBe(76.8);
      expect(pk.playerMeta?.lineupStatus).toBe("confirmed");
    }
  });
});

describe("Bet Builder / SGP (`bet-builder-math.ts`): conflictos, correlaciones y momio acotado", () => {
  it("bloquea selecciones mutuamente excluyentes, redundantes, marcador exacto, FT/LIVE y contradicciones multi-pierna", () => {
    const homeWin = makeLeg({
      id: "home-win",
      family: "1x2",
      axis: "result_ft",
      selectionKey: "home",
      label: "América gana",
      direction: "home",
      p: 0.54,
    });
    const awayWin = makeLeg({
      id: "away-win",
      family: "1x2",
      axis: "result_ft",
      selectionKey: "away",
      label: "Chivas gana",
      direction: "away",
      p: 0.22,
    });
    const drawLeg = makeLeg({
      id: "draw",
      family: "1x2",
      axis: "result_ft",
      selectionKey: "draw",
      label: "Empate",
      direction: "draw",
      p: 0.24,
    });
    const ahHome = makeLeg({
      id: "ah-home",
      family: "asian_handicap",
      axis: "handicap",
      selectionKey: "home_-0.5",
      label: "América (-0.5) AH",
      line: -0.5,
      direction: "home",
      p: 0.54,
    });
    const bttsYes = makeLeg({
      id: "btts-yes",
      family: "btts",
      axis: "btts",
      selectionKey: "yes",
      label: "Ambos anotan: Sí",
      direction: "yes",
      p: 0.58,
    });
    const bttsNo = makeLeg({
      id: "btts-no",
      family: "btts",
      axis: "btts",
      selectionKey: "no",
      label: "Ambos anotan: No",
      direction: "no",
      p: 0.42,
    });
    const under15 = makeLeg({
      id: "under-15",
      family: "totals",
      axis: "goals_total",
      selectionKey: "under_1.5",
      label: "Menos de 1.5 goles",
      line: 1.5,
      direction: "under",
      p: 0.28,
    });
    const over05 = makeLeg({
      id: "over-05",
      family: "totals",
      axis: "goals_total",
      selectionKey: "over_0.5",
      label: "Más de 0.5 goles",
      line: 0.5,
      direction: "over",
      p: 0.92,
    });
    const over25 = makeLeg({
      id: "over-25",
      family: "totals",
      axis: "goals_total",
      selectionKey: "over_2.5",
      label: "Más de 2.5 goles",
      line: 2.5,
      direction: "over",
      p: 0.56,
    });
    const cleanHomeYes = makeLeg({
      id: "cs-home",
      family: "clean_sheet",
      axis: "clean_sheet_home",
      selectionKey: "home_yes",
      label: "América · Portería a cero: Sí",
      direction: "yes",
      p: 0.36,
    });
    const exactScore = makeLeg({
      id: "exact-2-1",
      family: "correct_score",
      axis: "exact_score",
      selectionKey: "2-1",
      label: "Marcador exacto 2-1",
      direction: "combo",
      p: 0.11,
    });
    const sotOver10 = makeLeg({
      id: "sot-over",
      family: "shots_on_target",
      axis: "sot_total",
      selectionKey: "over_10.5",
      label: "Más de 10.5 remates a puerta",
      line: 10.5,
      direction: "over",
      p: 0.25,
    });
    const shotsUnder9 = makeLeg({
      id: "shots-under",
      family: "shots_total",
      axis: "shots_total",
      selectionKey: "under_9.5",
      label: "Menos de 9.5 remates totales",
      line: 9.5,
      direction: "under",
      p: 0.2,
    });

    // Duplicado, mismo eje y resultado + hándicap
    expect(checkBetBuilderPairCompatibility(homeWin, homeWin)).toMatchObject({
      allowed: false,
      code: "duplicate",
    });
    expect(checkBetBuilderPairCompatibility(homeWin, awayWin)).toMatchObject({
      allowed: false,
      code: "same_axis_redundant",
    });
    expect(checkBetBuilderPairCompatibility(homeWin, ahHome)).toMatchObject({
      allowed: false,
      code: "same_axis_redundant",
    });

    // Marcador exacto bloqueado en SGP
    expect(checkBetBuilderPairCompatibility(homeWin, exactScore)).toMatchObject({
      allowed: false,
      code: "exact_score_lock",
    });

    // Contradicciones lógicas de 2 piernas
    expect(checkBetBuilderPairCompatibility(bttsYes, under15)).toMatchObject({
      allowed: false,
      code: "logical_contradiction",
    });
    expect(checkBetBuilderPairCompatibility(cleanHomeYes, awayWin)).toMatchObject({
      allowed: false,
      code: "logical_contradiction",
    });
    expect(checkBetBuilderPairCompatibility(sotOver10, shotsUnder9)).toMatchObject({
      allowed: false,
      code: "logical_contradiction",
    });

    // Contradicción multi-pierna de 3 piernas: Empate + BTTS No + Más de 0.5 goles (imposible)
    expect(checkBetBuilderCompatibility([drawLeg, bttsNo], over05)).toMatchObject({
      allowed: false,
      code: "multi_leg_contradiction",
    });

    // Contradicción multi-pierna: Local +0.5 goles + Visita +0.5 goles + BTTS No
    const homeScores = makeLeg({
      id: "home-g-05",
      family: "team_totals",
      axis: "team_goals_home",
      selectionKey: "home_over_0.5",
      label: "América · Más de 0.5 goles",
      line: 0.5,
      direction: "over",
      p: 0.82,
    });
    const awayScores = makeLeg({
      id: "away-g-05",
      family: "team_totals",
      axis: "team_goals_away",
      selectionKey: "away_over_0.5",
      label: "Chivas · Más de 0.5 goles",
      line: 0.5,
      direction: "over",
      p: 0.68,
    });
    expect(checkBetBuilderCompatibility([homeScores, awayScores], bttsNo)).toMatchObject({
      allowed: false,
      code: "multi_leg_contradiction",
    });

    // Guardias de estado, redacción y límite SGP
    expect(checkBetBuilderCompatibility([], makeLeg({ gameStatus: "FT" }))).toMatchObject({
      allowed: false,
      code: "finished",
    });
    expect(checkBetBuilderCompatibility([], makeLeg({ gameStatus: "LIVE" }))).toMatchObject({
      allowed: false,
      code: "live",
    });
    expect(checkBetBuilderCompatibility([], makeLeg({ isRedacted: true }))).toMatchObject({
      allowed: false,
      code: "redacted",
    });
    expect(
      checkBetBuilderCompatibility([homeWin], over25, { allowSameGame: false }),
    ).toMatchObject({
      allowed: false,
      code: "sgp_limit",
    });

    // Combinación SGP válida permitida
    expect(checkBetBuilderCompatibility([homeWin], over25)).toEqual({ allowed: true });
    expect(checkBetBuilderCompatibility([bttsYes], over25)).toEqual({ allowed: true });

    // Player props: mismo jugador + misma estadística bloqueado; distinta estadística permitido
    const pShots1 = makeLeg({
      id: "p-shots-1",
      family: "player_props_football",
      axis: "player_prop",
      selectionKey: "henry_shots_1.5",
      label: "Henry Martín +1.5 tiros",
      line: 1.5,
      direction: "over",
      playerKey: "henry-martin",
      playerStatKey: "shots",
    });
    const pShots2 = makeLeg({
      id: "p-shots-2",
      family: "player_props_football",
      axis: "player_prop",
      selectionKey: "henry_shots_2.5",
      label: "Henry Martín +2.5 tiros",
      line: 2.5,
      direction: "over",
      playerKey: "henry-martin",
      playerStatKey: "shots",
    });
    const pSot = makeLeg({
      id: "p-sot",
      family: "player_props_football",
      axis: "player_prop",
      selectionKey: "henry_sot_0.5",
      label: "Henry Martín +0.5 a puerta",
      line: 0.5,
      direction: "over",
      playerKey: "henry-martin",
      playerStatKey: "shots_on_target",
    });
    expect(checkBetBuilderPairCompatibility(pShots1, pShots2)).toMatchObject({
      allowed: false,
      code: "same_axis_redundant",
    });
    expect(checkBetBuilderPairCompatibility(pShots1, pSot)).toEqual({ allowed: true });
  });

  it("evalúa correlaciones SGP con cópula gaussiana y acota probabilidad conjunta y momio combinado", () => {
    const bttsYes = makeLeg({
      id: "sgp-btts",
      gameId: "g-1",
      family: "btts",
      axis: "btts",
      selectionKey: "yes",
      label: "Ambos anotan: Sí",
      direction: "yes",
      p: 0.58,
    });
    const over25 = makeLeg({
      id: "sgp-over",
      gameId: "g-1",
      family: "totals",
      axis: "goals_total",
      selectionKey: "over_2.5",
      label: "Más de 2.5 goles",
      line: 2.5,
      direction: "over",
      p: 0.56,
    });
    const under25 = makeLeg({
      id: "sgp-under",
      gameId: "g-1",
      family: "totals",
      axis: "goals_total",
      selectionKey: "under_2.5",
      label: "Menos de 2.5 goles",
      line: 2.5,
      direction: "under",
      p: 0.44,
    });

    const posRho = getPairwiseCorrelationRho(bttsYes, over25);
    const negRho = getPairwiseCorrelationRho(bttsYes, under25);
    expect(posRho.rho).toBe(0.52);
    expect(negRho.rho).toBe(-0.52);

    // Fréchet-Hoeffding en Φ₂(a, b; ρ)
    const jZero = bivariateNormalJointProb(0.5, 0.6, 0);
    expect(jZero).toBeCloseTo(0.3, 6);
    const jPos = bivariateNormalJointProb(0.58, 0.56, 0.52);
    expect(jPos).toBeGreaterThan(0.58 * 0.56);
    expect(jPos).toBeLessThanOrEqual(Math.min(0.58, 0.56));
    const jNeg = bivariateNormalJointProb(0.58, 0.44, -0.52);
    expect(jNeg).toBeLessThan(0.58 * 0.44);
    expect(jNeg).toBeGreaterThanOrEqual(Math.max(0.0001, 0.58 + 0.44 - 1));

    // Evaluación SGP completa con correlación positiva y auditoría de margen oculto
    const posEval = evaluateBetBuilder([bttsYes, over25], { offeredBookDecimal: 1.5 });
    expect(posEval.hasSgp).toBe(true);
    expect(posEval.sgpGamesCount).toBe(1);
    expect(posEval.pairAudits).toHaveLength(1);
    expect(posEval.pairAudits[0]!.direction).toBe("positively_correlated");
    expect(posEval.jointProbability).toBeGreaterThan(posEval.independentProbability);
    expect(posEval.jointProbability).toBeLessThanOrEqual(Math.min(0.58, 0.56));
    expect(posEval.correlationMultiplier).toBeGreaterThan(1);
    expect(posEval.correlationDirection).toBe("positively_correlated");
    expect(posEval.fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);
    expect(posEval.fairCombinedDecimal).toBeLessThan(1 / posEval.independentProbability);
    expect(posEval.warnings.some((w) => w.code === "high_positive_correlation")).toBe(true);
    expect(posEval.warnings.some((w) => w.code === "excessive_sgp_hold")).toBe(true);

    // Misma combinada con cuota atractiva -> EV+ positivo
    const valueEval = evaluateBetBuilder([bttsYes, over25], { offeredBookDecimal: 3.1 });
    expect(valueEval.evPct).toBeGreaterThan(0);
    expect(valueEval.valueLabel).toMatch(/^Valor \+\d+\.\d %$/);

    // Parlay multi-partido independiente: sin ajuste SGP
    const otherGameLeg = makeLeg({
      id: "g2-home",
      gameId: "g-2",
      p: 0.6,
    });
    const indepEval = evaluateBetBuilder([bttsYes, otherGameLeg]);
    expect(indepEval.hasSgp).toBe(false);
    expect(indepEval.jointProbability).toBeCloseTo(indepEval.independentProbability, 4);
    expect(indepEval.correlationMultiplier).toBe(1);

    // Acotación estricta del momio combinado en longshots extremos (p >= 0.0001 => cuota <= 10000)
    const extremeLegs = Array.from({ length: 6 }, (_, i) =>
      makeLeg({ id: `ext-${i}`, gameId: `g-ext-${i}`, p: 0.15 }),
    );
    const extremeEval = evaluateBetBuilder(extremeLegs);
    expect(Number.isFinite(extremeEval.fairCombinedDecimal)).toBe(true);
    expect(extremeEval.jointProbability).toBeGreaterThanOrEqual(0.0001);
    expect(extremeEval.fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);
    expect(extremeEval.fairCombinedDecimal).toBeLessThanOrEqual(10_000);
    expect(extremeEval.warnings.some((w) => w.code === "high_leg_count")).toBe(true);
    expect(extremeEval.warnings.some((w) => w.code === "extreme_difficulty")).toBe(true);

    // Adaptador catalogPickToBetBuilderLeg interoperable con buildMatchPicksCatalog
    const sampleGame = buildSportGame({
      id: "mx-adapter",
      league: "liga-mx",
      leagueLabel: "Liga MX",
      sport: "football",
      homeName: "América",
      awayName: "Chivas",
      x12: [0.54, 0.25, 0.21],
      projection: { home: 1.8, away: 1.0, total: 2.8 },
    });
    const cat = buildMatchPicksCatalog(sampleGame);
    const p1x2 = cat.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")!;
    const pTot = cat.picks.find((p) => p.family === "totals" && p.selectionKey === "over_2.5")!;
    const legA = catalogPickToBetBuilderLeg(p1x2);
    const legB = catalogPickToBetBuilderLeg(pTot);
    expect(checkBetBuilderCompatibility([legA], legB)).toEqual({ allowed: true });
    expect(evaluateBetBuilder([legA, legB]).fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);
  });
});

describe("Guardia de retiro de `@base-ui/react` en `@pitchlab/ui`", () => {
  it("verifica que `@base-ui/react` no figura en package.json ni existe ningún import en packages/ui/src", () => {
    const uiRoot = path.resolve(import.meta.dirname, "..");
    const pkgPath = path.join(uiRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["@base-ui/react"]).toBeUndefined();
    expect(pkg.devDependencies?.["@base-ui/react"]).toBeUndefined();
    expect(pkg.peerDependencies?.["@base-ui/react"]).toBeUndefined();

    const srcDir = path.join(uiRoot, "src");
    const files = collectSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("@base-ui/react")) {
        offenders.push(path.relative(uiRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
