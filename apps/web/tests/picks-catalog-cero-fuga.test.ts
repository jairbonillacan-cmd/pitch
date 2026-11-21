import { describe, expect, it } from "vitest";
import {
  MARKET_FAMILY_IDS,
  TIER1_LEAGUE_IDS,
  asLeagueId,
  getLeagueCapability,
} from "@pitchlab/contracts";
import type {
  FootballPlayerPropCandidateInput,
  NbaPlayerPropCandidateInput,
  TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";
import type { MatchPick, PlatformGame, PlatformMarketRow } from "@pitchlab/ui/types";
import {
  buildServerMatchPicksCatalog,
  buildServerMatchPicksCatalogsBatch,
  redactCatalogPickForVisitor,
} from "../src/server/picks-catalog";
import {
  buildServerRawPlatformDataset,
  loadGameDetail,
  loadServerPicksCatalogsForScreener,
  loadShellPlayerProps,
} from "../src/server/platform-data";

const FIXED_NOW_ISO = "2026-11-22T12:00:00Z";

function makeSampleHistory(perspective: "home" | "away"): TeamMatchEvidenceRecord[] {
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
      goalsFor: isHomeSide ? 3 : 1,
      goalsAgainst: isHomeSide ? 1 : 3,
      halfTimeGoalsFor: isHomeSide ? 2 : 1,
      halfTimeGoalsAgainst: isHomeSide ? 1 : 2,
      cornersFor: isHomeSide ? 7 : 4,
      cornersAgainst: isHomeSide ? 5 : 6,
      shotsFor: isHomeSide ? 18 : 11,
      shotsAgainst: isHomeSide ? 10 : 16,
      shotsOnTargetFor: isHomeSide ? 8 : 4,
      shotsOnTargetAgainst: isHomeSide ? 4 : 7,
      foulsFor: 13,
      foulsAgainst: 11,
      yellowCardsFor: 3,
      yellowCardsAgainst: 2,
    },
    {
      dateIso: "2026-10-18",
      isHome: !isHomeSide,
      goalsFor: isHomeSide ? 2 : 1,
      goalsAgainst: isHomeSide ? 1 : 2,
      halfTimeGoalsFor: 1,
      halfTimeGoalsAgainst: 1,
      cornersFor: isHomeSide ? 6 : 4,
      cornersAgainst: isHomeSide ? 5 : 6,
      shotsFor: isHomeSide ? 14 : 9,
      shotsAgainst: isHomeSide ? 11 : 13,
      shotsOnTargetFor: isHomeSide ? 5 : 3,
      shotsOnTargetAgainst: isHomeSide ? 4 : 5,
      foulsFor: 12,
      foulsAgainst: 13,
      yellowCardsFor: 2,
      yellowCardsAgainst: 3,
    },
    {
      dateIso: "2026-10-11",
      isHome: !isHomeSide,
      goalsFor: isHomeSide ? 1 : 0,
      goalsAgainst: isHomeSide ? 0 : 1,
      halfTimeGoalsFor: 0,
      halfTimeGoalsAgainst: 0,
      cornersFor: isHomeSide ? 5 : 4,
      cornersAgainst: isHomeSide ? 4 : 5,
      shotsFor: isHomeSide ? 13 : 8,
      shotsAgainst: isHomeSide ? 9 : 12,
      shotsOnTargetFor: isHomeSide ? 4 : 2,
      shotsOnTargetAgainst: isHomeSide ? 2 : 4,
      foulsFor: 11,
      foulsAgainst: 12,
      yellowCardsFor: 2,
      yellowCardsAgainst: 2,
    },
  ];
}

function makeSampleMarkets(): PlatformMarketRow[] {
  return [
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "home",
      label: "Gana Liverpool",
      p: 0.56,
      fairDecimal: 1.79,
      fairAmerican: -127,
      openDecimal: 2.22,
      currentDecimal: 2.15,
      movementDirection: "shortening",
      quoteBookLabel: "Pinnacle",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      bookQuotes: [
        {
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimal: 2.15,
          openingDecimal: 2.22,
          movementDirection: "shortening",
          capturedAtUtc: FIXED_NOW_ISO,
          isBest: true,
        },
        {
          book: "bet365",
          bookLabel: "Bet365",
          decimal: 2.1,
          capturedAtUtc: FIXED_NOW_ISO,
        },
      ],
      edgePts: 9.5,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "draw",
      label: "Empate",
      p: 0.24,
      fairDecimal: 4.17,
      fairAmerican: 317,
      openDecimal: null,
      currentDecimal: 3.55,
      quoteBookLabel: "Pinnacle",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -4.2,
    },
    {
      group: "Resultado 1X2",
      market: "1x2",
      selection: "away",
      label: "Gana Arsenal",
      p: 0.2,
      fairDecimal: 5.0,
      fairAmerican: 400,
      openDecimal: null,
      currentDecimal: 3.6,
      quoteBookLabel: "Pinnacle",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -7.8,
    },
    {
      group: "Total de goles",
      market: "totals",
      selection: "over",
      line: 2.5,
      label: "Más de 2.5 goles",
      p: 0.57,
      fairDecimal: 1.75,
      fairAmerican: -133,
      openDecimal: 2.04,
      currentDecimal: 1.98,
      movementDirection: "shortening",
      quoteBookLabel: "Bet365",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: 6.5,
    },
    {
      group: "Total de goles",
      market: "totals",
      selection: "under",
      line: 2.5,
      label: "Menos de 2.5 goles",
      p: 0.43,
      fairDecimal: 2.33,
      fairAmerican: 133,
      openDecimal: 1.86,
      currentDecimal: 1.9,
      movementDirection: "drifting",
      quoteBookLabel: "Bet365",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -9.6,
    },
    {
      group: "Ambos anotan",
      market: "btts",
      selection: "yes",
      label: "Ambos anotan · Sí",
      p: 0.58,
      fairDecimal: 1.72,
      fairAmerican: -139,
      openDecimal: null,
      currentDecimal: 1.85,
      quoteBookLabel: "Codere",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: 3.9,
    },
    {
      group: "Ambos anotan",
      market: "btts",
      selection: "no",
      label: "Ambos anotan · No",
      p: 0.42,
      fairDecimal: 2.38,
      fairAmerican: 138,
      openDecimal: null,
      currentDecimal: 2.02,
      quoteBookLabel: "Codere",
      quoteCapturedAtUtc: FIXED_NOW_ISO,
      edgePts: -7.5,
    },
  ];
}

function makeSampleFootballPlayers(): FootballPlayerPropCandidateInput[] {
  return [
    {
      playerName: "Mohamed Salah",
      playerSlug: "mohamed-salah",
      teamSide: "home",
      teamName: "Liverpool",
      position: "FWD",
      lineupStatus: "confirmed",
      matchLogs: [
        { minutesPlayed: 90, isHome: true, shots: 4, shotsOnTarget: 2, goals: 1, assists: 1, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 88, isHome: false, shots: 5, shotsOnTarget: 3, goals: 1, assists: 0, foulsCommitted: 0, yellowCards: 0 },
        { minutesPlayed: 90, isHome: true, shots: 3, shotsOnTarget: 2, goals: 1, assists: 0, foulsCommitted: 1, yellowCards: 0 },
        { minutesPlayed: 85, isHome: true, shots: 4, shotsOnTarget: 2, goals: 0, assists: 1, foulsCommitted: 1, yellowCards: 1 },
        { minutesPlayed: 90, isHome: false, shots: 4, shotsOnTarget: 1, goals: 1, assists: 0, foulsCommitted: 0, yellowCards: 0 },
      ],
      marketQuotes: {
        shots: {
          line: 2.5,
          overDecimal: 1.95,
          underDecimal: 1.88,
          bookLabel: "Bet365",
          capturedAtUtc: FIXED_NOW_ISO,
        },
      },
    },
  ];
}

function makeFootballGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "epl-liv-ars-cero-fuga",
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
    x12: [0.56, 0.24, 0.2],
    projection: { home: 1.85, away: 0.95, total: 2.8 },
    goalLine: { line: 2.5, pOver: 0.57 },
    confidenceScore: 78,
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
    markets: makeSampleMarkets(),
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-22",
    spacetime: null,
    ...overrides,
  };
}

function makePromoPrimaryPick(game: PlatformGame): MatchPick {
  return {
    id: `${game.id}__promo_daily`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 0,
    category: "principal",
    categoryLabel: "Pick principal",
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Spacetime v5.1",
    marketGroup: "Resultado 1X2",
    market: "1x2",
    selectionKey: "home",
    line: null,
    conflictGroup: "home_side",
    label: "Gana Liverpool",
    rationale: "Pick Abierto del Día",
    p: 0.56,
    fairDecimal: 1.79,
    fairAmerican: -127,
    marketDecimal: 2.15,
    marketAmerican: 115,
    marketBookLabel: "Pinnacle",
    marketCapturedAtUtc: FIXED_NOW_ISO,
    edgePts: 9.5,
    confidenceScore: 78,
    suggestedUnits: 1.5,
    isDailyOpenPromo: true,
    isRedacted: false,
  };
}

describe("picks-catalog · Frontera Cero-Fuga en NS/LIVE, auditoría íntegra en FT y /app/props", () => {
  it("redacta estrictamente todo pick reservado en NS y LIVE cuando fullAccess=false frente a fullAccess=true", () => {
    const markets = makeSampleMarkets();
    const homeHistory = makeSampleHistory("home");
    const awayHistory = makeSampleHistory("away");
    const footballPlayers = makeSampleFootballPlayers();

    for (const status of ["NS", "LIVE"] as const) {
      const game = makeFootballGame({
        id: `epl-liv-ars-${status.toLowerCase()}`,
        status,
        ...(status === "LIVE" ? { score: { home: 1, away: 0 } } : {}),
      });

      const memberCatalog = buildServerMatchPicksCatalog(game, {
        fullAccess: true,
        markets,
        homeHistory,
        awayHistory,
        footballPlayers,
        nowIso: FIXED_NOW_ISO,
      });

      const visitorCatalog = buildServerMatchPicksCatalog(game, {
        fullAccess: false,
        markets,
        homeHistory,
        awayHistory,
        footballPlayers,
        nowIso: FIXED_NOW_ISO,
      });

      // Socio con pase activo recibe valoración, cuotas, EV/edge, evidencia y props completos.
      expect(memberCatalog.isRedactedForVisitor).toBe(false);
      expect(memberCatalog.picks.length).toBeGreaterThan(8);
      expect(memberCatalog.picks.every((item) => !item.isRedacted)).toBe(true);

      const memberHome1x2 = memberCatalog.picks.find(
        (item) => item.family === "1x2" && item.selectionKey === "home",
      );
      expect(memberHome1x2).toBeDefined();
      expect(memberHome1x2!.pricing.p).toBeGreaterThan(0.4);
      expect(memberHome1x2!.pricing.fairOdds).toBeGreaterThan(1);
      expect(memberHome1x2!.pricing.marketDecimal).toBe(2.15);
      expect(memberHome1x2!.pricing.edgePts).not.toBeNull();
      expect(memberHome1x2!.pricing.evPct).not.toBeNull();
      expect(memberHome1x2!.pricing.deVigMarketProb).not.toBeNull();
      expect(memberHome1x2!.bookQuotes?.length ?? 0).toBeGreaterThan(0);
      expect(memberHome1x2!.evidence.windows.length).toBeGreaterThan(0);
      expect(memberHome1x2!.evidence.xgSignal).not.toBeNull();
      expect(memberHome1x2!.evidence.bullets.length).toBeGreaterThan(0);

      const memberPlayerProp = memberCatalog.picks.find(
        (item) => item.family === "player_props_football",
      );
      expect(memberPlayerProp?.playerMeta?.playerName).toBe("Mohamed Salah");

      const memberCards = memberCatalog.picks.find((item) => item.family === "cards_total");
      expect(memberCards?.evidence.refereeSignal?.name).toBe("Michael Oliver");

      // Visitante sin pase activo en NS/LIVE: Cero-Fuga estricta en cada pick reservado.
      expect(visitorCatalog.isRedactedForVisitor).toBe(true);
      expect(visitorCatalog.picks.length).toBeGreaterThan(0);
      expect(visitorCatalog.picks.length).toBeLessThanOrEqual(8);

      for (const item of visitorCatalog.picks) {
        expect(item.isRedacted).toBe(true);
        expect(item.selectionKey).toBe("locked");
        expect(item.direction).toBe("combo");
        expect(item.line).toBeNull();
        expect(item.label).toBe("Selección reservada Pase PitchLab Ultra");
        expect(item.conflictGroup).toBe("independent");
        expect(item.settlement).toBe("pending");
        expect(item.playerMeta).toBeNull();
        expect(item.bookQuotes).toBeUndefined();
        expect(item.isDailyOpenPromo).toBe(false);
        expect(item.isTipsterWeeklyOpen).toBe(false);

        expect(item.pricing).toEqual({
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

        expect(item.evidence).toEqual({
          windows: [],
          xgSignal: null,
          refereeSignal: null,
          bullets: [],
          avgObservedRatePct: null,
        });
      }

      // Ningún valor sensible serializado al payload de visitante.
      const serializedVisitorPicks = JSON.stringify(visitorCatalog.picks);
      expect(serializedVisitorPicks).not.toContain("Pinnacle");
      expect(serializedVisitorPicks).not.toContain("Bet365");
      expect(serializedVisitorPicks).not.toContain("Codere");
      expect(serializedVisitorPicks).not.toContain("Mohamed Salah");
      expect(serializedVisitorPicks).not.toContain("Michael Oliver");
      expect(serializedVisitorPicks).not.toContain("Gana Liverpool");
      expect(serializedVisitorPicks).not.toContain("Más de 2.5");
      expect(serializedVisitorPicks).not.toContain("2.15");
    }
  });

  it("permite únicamente el pick promocional autorizado para visitante y redacta todo el resto del catálogo", () => {
    const baseGame = makeFootballGame({ id: "epl-liv-ars-promo" });
    const promoPick = makePromoPrimaryPick(baseGame);
    const gameWithPromo = makeFootballGame({
      id: "epl-liv-ars-promo",
      picks: [promoPick],
    });

    const visitorCatalog = buildServerMatchPicksCatalog(gameWithPromo, {
      fullAccess: false,
      markets: makeSampleMarkets(),
      homeHistory: makeSampleHistory("home"),
      awayHistory: makeSampleHistory("away"),
      nowIso: FIXED_NOW_ISO,
    });

    const openPicks = visitorCatalog.picks.filter((item) => !item.isRedacted);
    const lockedPicks = visitorCatalog.picks.filter((item) => item.isRedacted === true);

    expect(openPicks).toHaveLength(1);
    expect(openPicks[0]!.id).toBe(promoPick.id);
    expect(openPicks[0]!.isDailyOpenPromo).toBe(true);
    expect(openPicks[0]!.selectionKey).toBe("home");
    expect(openPicks[0]!.pricing.p).toBeGreaterThan(0.4);
    expect(openPicks[0]!.pricing.fairOdds).toBeGreaterThan(1);

    expect(lockedPicks.length).toBeGreaterThan(0);
    for (const locked of lockedPicks) {
      expect(locked.selectionKey).toBe("locked");
      expect(locked.line).toBeNull();
      expect(locked.pricing.p).toBe(0);
      expect(locked.pricing.fairOdds).toBe(0);
      expect(locked.pricing.marketDecimal).toBeNull();
      expect(locked.pricing.edgePts).toBeNull();
      expect(locked.pricing.evPct).toBeNull();
      expect(locked.evidence.windows).toEqual([]);
      expect(locked.evidence.bullets).toEqual([]);
      expect(locked.bookQuotes).toBeUndefined();
    }

    // `redactCatalogPickForVisitor` limpia incluso un pick previamente abierto.
    const manuallyRedacted = redactCatalogPickForVisitor(openPicks[0]!);
    expect(manuallyRedacted.isRedacted).toBe(true);
    expect(manuallyRedacted.isDailyOpenPromo).toBe(false);
    expect(manuallyRedacted.pricing.p).toBe(0);
    expect(manuallyRedacted.pricing.fairOdds).toBe(0);
    expect(manuallyRedacted.bookQuotes).toBeUndefined();
    expect(manuallyRedacted.evidence.windows).toEqual([]);
  });

  it("preserva en partidos FT todos los picks y su liquidación auditable (hit/miss/push/pending) incluso con fullAccess=false", () => {
    const drawFtGame = makeFootballGame({
      id: "epl-liv-ars-ft-draw",
      status: "FT",
      score: { home: 1, away: 1 },
      preGame: {
        cortexSynthesis: "",
        tacticalKeys: [],
        lineupStatusLabel: "Finalizado",
        lineupsConfirmed60m: true,
        matchContext: {
          referee: "Michael Oliver",
          // Sin halfTimeScore para comprobar que half_time_result conserva `pending` sin inventar resultado.
        },
        absences: [],
        moneyFlow: null,
      },
    });

    const selectedFamilies = [
      "1x2",
      "dnb",
      "btts",
      "totals",
      "half_time_result",
      "corners_total",
    ] as const;

    const memberFt = buildServerMatchPicksCatalog(drawFtGame, {
      fullAccess: true,
      markets: makeSampleMarkets(),
      homeHistory: makeSampleHistory("home"),
      awayHistory: makeSampleHistory("away"),
      families: selectedFamilies,
      maxPicksPerFamily: 4,
      maxTotalPicks: 40,
      nowIso: FIXED_NOW_ISO,
    });

    const visitorFt = buildServerMatchPicksCatalog(drawFtGame, {
      fullAccess: false,
      markets: makeSampleMarkets(),
      homeHistory: makeSampleHistory("home"),
      awayHistory: makeSampleHistory("away"),
      families: selectedFamilies,
      maxPicksPerFamily: 4,
      maxTotalPicks: 40,
      nowIso: FIXED_NOW_ISO,
    });

    expect(visitorFt.isRedactedForVisitor).toBe(false);
    expect(visitorFt.picks).toEqual(memberFt.picks);
    expect(visitorFt.picks.length).toBeGreaterThan(0);
    expect(visitorFt.picks.every((item) => !item.isRedacted)).toBe(true);
    expect(
      visitorFt.picks.every((item) => item.pricing.p > 0 && item.pricing.fairOdds > 1),
    ).toBe(true);

    // Liquidación exacta de los 4 estados auditables en FT 1-1:
    const draw1x2 = visitorFt.picks.find(
      (item) => item.family === "1x2" && item.selectionKey === "draw",
    );
    const home1x2 = visitorFt.picks.find(
      (item) => item.family === "1x2" && item.selectionKey === "home",
    );
    const dnbHome = visitorFt.picks.find(
      (item) => item.family === "dnb" && item.selectionKey === "home",
    );
    const htPick = visitorFt.picks.find((item) => item.family === "half_time_result");
    const cornersWithoutStats = visitorFt.picks.find((item) => item.family === "corners_total");

    expect(draw1x2?.settlement).toBe("hit");
    expect(home1x2?.settlement).toBe("miss");
    expect(dnbHome?.settlement).toBe("push");
    expect(htPick?.settlement).toBe("pending");
    expect(cornersWithoutStats?.settlement).toBe("pending");

    const settlements = new Set(visitorFt.picks.map((item) => item.settlement));
    expect(settlements.has("hit")).toBe(true);
    expect(settlements.has("miss")).toBe(true);
    expect(settlements.has("push")).toBe(true);
    expect(settlements.has("pending")).toBe(true);

    // Con finalStats en partido FT 2-1, también se liquidan totales y córners sin ocultarlos.
    const decisiveFtGame = makeFootballGame({
      id: "epl-liv-ars-ft-win",
      status: "FT",
      score: { home: 2, away: 1 },
    });
    const decisiveFt = buildServerMatchPicksCatalog(decisiveFtGame, {
      fullAccess: false,
      markets: makeSampleMarkets(),
      finalStats: { cornersHome: 9, cornersAway: 7 },
      families: ["1x2", "btts", "totals", "corners_total"],
      maxPicksPerFamily: 10,
      maxTotalPicks: 40,
      nowIso: FIXED_NOW_ISO,
    });

    expect(decisiveFt.isRedactedForVisitor).toBe(false);
    expect(
      decisiveFt.picks.find((p) => p.family === "1x2" && p.selectionKey === "home")?.settlement,
    ).toBe("hit");
    expect(
      decisiveFt.picks.find((p) => p.family === "1x2" && p.selectionKey === "away")?.settlement,
    ).toBe("miss");
    expect(
      decisiveFt.picks.find((p) => p.family === "btts" && p.selectionKey === "yes")?.settlement,
    ).toBe("hit");
    expect(
      decisiveFt.picks.find((p) => p.family === "totals" && p.selectionKey === "over_2.5")
        ?.settlement,
    ).toBe("hit");
    const cornerOvers = decisiveFt.picks.filter(
      (p) => p.family === "corners_total" && p.direction === "over",
    );
    expect(cornerOvers.length).toBeGreaterThan(0);
    expect(cornerOvers.every((p) => p.settlement === "hit")).toBe(true);

    // En lote multi-partido, NS y LIVE se redactan mientras FT permanece íntegro.
    const nsGame = makeFootballGame({ id: "batch-ns", status: "NS" });
    const liveGame = makeFootballGame({
      id: "batch-live",
      status: "LIVE",
      score: { home: 0, away: 0 },
    });
    const batch = buildServerMatchPicksCatalogsBatch([nsGame, liveGame, drawFtGame], {
      fullAccess: false,
      nowIso: FIXED_NOW_ISO,
    });

    expect(batch.get("batch-ns")?.isRedactedForVisitor).toBe(true);
    expect(batch.get("batch-ns")?.picks.every((p) => p.isRedacted === true)).toBe(true);
    expect(batch.get("batch-live")?.isRedactedForVisitor).toBe(true);
    expect(batch.get("batch-live")?.picks.every((p) => p.isRedacted === true)).toBe(true);
    expect(batch.get(drawFtGame.id)?.isRedactedForVisitor).toBe(false);
    expect(batch.get(drawFtGame.id)?.picks.every((p) => !p.isRedacted)).toBe(true);
  });

  it("loadShellPlayerProps aplica Cero-Fuga en /app/props: vacío para fullAccess=false y catálogo real para fullAccess=true", () => {
    const visitorProps = loadShellPlayerProps({ fullAccess: false });
    expect(visitorProps).toEqual([]);

    const memberProps = loadShellPlayerProps({ fullAccess: true });
    expect(memberProps.length).toBeGreaterThan(0);

    for (const prop of memberProps.slice(0, 10)) {
      expect(prop.id.length).toBeGreaterThan(0);
      expect(prop.player.length).toBeGreaterThan(1);
      expect(prop.statLabel.length).toBeGreaterThan(1);
      expect(prop.baseLine).toBeGreaterThan(0);
      expect(prop.projectionMean).toBeGreaterThan(0);
      expect(prop.marketOverDecimal).toBeGreaterThan(1);
      expect(prop.marketUnderDecimal).toBeGreaterThan(1);
    }

    expect(loadShellPlayerProps()).toEqual(memberProps);
  });

  it("respeta supportedMarketFamilies de LeagueCapabilityContract y cubre las 34 familias en producción", () => {
    const footballPlayers = makeSampleFootballPlayers();
    const premierCat = buildServerMatchPicksCatalog(makeFootballGame(), {
      fullAccess: true,
      markets: makeSampleMarkets(),
      footballPlayers,
      maxPicksPerFamily: 2,
      maxTotalPicks: 60,
      nowIso: FIXED_NOW_ISO,
    });
    expect(premierCat.availableFamilies).toHaveLength(20);
    expect(premierCat.availableFamilies).toContain("player_props_football");

    const brasileiraoGame = makeFootballGame({
      id: "bra-fla-pal",
      league: asLeagueId("brasileirao"),
      leagueLabel: "Brasileirão",
    });
    const brasileiraoCap = getLeagueCapability("brasileirao");
    const brasileiraoCat = buildServerMatchPicksCatalog(brasileiraoGame, {
      fullAccess: true,
      markets: makeSampleMarkets(),
      footballPlayers,
      maxPicksPerFamily: 2,
      maxTotalPicks: 60,
      nowIso: FIXED_NOW_ISO,
    });
    expect(brasileiraoCat.availableFamilies).not.toContain("player_props_football");
    expect(
      brasileiraoCat.availableFamilies.every((fam) =>
        brasileiraoCap.supportedMarketFamilies.includes(fam),
      ),
    ).toBe(true);

    const wcGame = makeFootballGame({
      id: "wc-mex-bra",
      league: asLeagueId("copa-del-mundo"),
      leagueLabel: "Copa del Mundo",
    });
    const wcCap = getLeagueCapability("copa-del-mundo");
    const wcCat = buildServerMatchPicksCatalog(wcGame, {
      fullAccess: true,
      markets: makeSampleMarkets(),
      footballPlayers,
      maxPicksPerFamily: 2,
      maxTotalPicks: 60,
      nowIso: FIXED_NOW_ISO,
    });
    expect(wcCat.availableFamilies).not.toContain("corners_total");
    expect(wcCat.availableFamilies).not.toContain("cards_total");
    expect(wcCat.availableFamilies).not.toContain("player_props_football");
    expect(
      wcCat.availableFamilies.every((fam) => wcCap.supportedMarketFamilies.includes(fam)),
    ).toBe(true);

    const nbaPlayer: NbaPlayerPropCandidateInput = {
      playerName: "Luka Doncic",
      teamSide: "home",
      teamName: "Lakers",
      position: "G",
      lineupStatus: "confirmed",
      matchLogs: [
        { minutesPlayed: 36, PTS: 31, REB: 9, AST: 10, "3PM": 4 },
        { minutesPlayed: 35, PTS: 28, REB: 8, AST: 9, "3PM": 3 },
        { minutesPlayed: 37, PTS: 34, REB: 10, AST: 8, "3PM": 4 },
      ],
    };
    const nbaCat = buildServerMatchPicksCatalog(
      makeFootballGame({
        id: "nba-lal-bos",
        league: asLeagueId("nba"),
        leagueLabel: "NBA",
        sport: "basketball",
        x12: [0.58, 0, 0.42],
        projection: { home: 116.5, away: 112.0, total: 228.5 },
        markets: [],
      }),
      {
        fullAccess: true,
        nbaPlayers: [nbaPlayer],
        maxPicksPerFamily: 2,
        maxTotalPicks: 30,
        nowIso: FIXED_NOW_ISO,
      },
    );
    const mlbCat = buildServerMatchPicksCatalog(
      makeFootballGame({
        id: "mlb-lad-nyy",
        league: asLeagueId("mlb"),
        leagueLabel: "MLB",
        sport: "baseball",
        x12: [0.56, 0, 0.44],
        projection: { home: 4.8, away: 4.0, total: 8.8 },
        markets: [],
      }),
      { fullAccess: true, maxPicksPerFamily: 2, maxTotalPicks: 30, nowIso: FIXED_NOW_ISO },
    );
    const nhlCat = buildServerMatchPicksCatalog(
      makeFootballGame({
        id: "nhl-col-edm",
        league: asLeagueId("nhl"),
        leagueLabel: "NHL",
        sport: "ice-hockey",
        x12: [0.55, 0, 0.45],
        projection: { home: 3.3, away: 2.8, total: 6.1 },
        markets: [],
      }),
      { fullAccess: true, maxPicksPerFamily: 2, maxTotalPicks: 30, nowIso: FIXED_NOW_ISO },
    );
    const nflCat = buildServerMatchPicksCatalog(
      makeFootballGame({
        id: "nfl-kc-buf",
        league: asLeagueId("nfl"),
        leagueLabel: "NFL",
        sport: "american-football",
        x12: [0.6, 0, 0.4],
        projection: { home: 25.5, away: 21.0, total: 46.5 },
        markets: [],
      }),
      { fullAccess: true, maxPicksPerFamily: 2, maxTotalPicks: 30, nowIso: FIXED_NOW_ISO },
    );

    const covered = new Set([
      ...premierCat.availableFamilies,
      ...nbaCat.availableFamilies,
      ...mlbCat.availableFamilies,
      ...nhlCat.availableFamilies,
      ...nflCat.availableFamilies,
    ]);
    expect(covered.size).toBe(34);
    for (const fam of MARKET_FAMILY_IDS) {
      expect(covered.has(fam)).toBe(true);
    }
  });

  it("loadGameDetail y loadServerPicksCatalogsForScreener cablean picksCatalog con Cero-Fuga en NS/LIVE y auditoría en FT", async () => {
    const raw = buildServerRawPlatformDataset();
    const upcoming = raw.games.find((g) => g.status !== "FT" && g.hasForecast !== false);
    if (upcoming) {
      const visitorDetail = await loadGameDetail(upcoming.id);
      expect(visitorDetail).not.toBeNull();
      expect(visitorDetail!.markets).toEqual([]);
      expect(visitorDetail!.factors).toEqual([]);
      expect(visitorDetail!.picksCatalog).toBeDefined();
      expect(visitorDetail!.picksCatalog?.isRedactedForVisitor).toBe(true);
      for (const item of visitorDetail!.picksCatalog?.picks ?? []) {
        const isPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
        if (!isPromo) {
          expect(item.isRedacted).toBe(true);
          expect(item.pricing.p).toBe(0);
          expect(item.pricing.fairOdds).toBe(0);
          expect(item.pricing.marketDecimal).toBeNull();
          expect(item.evidence.windows).toEqual([]);
        }
      }
    }

    const finished = raw.games.find(
      (g) => g.status === "FT" && g.score !== undefined && g.hasForecast !== false,
    );
    if (finished) {
      const ftDetail = await loadGameDetail(finished.id);
      expect(ftDetail?.picksCatalog).toBeDefined();
      expect(ftDetail?.picksCatalog?.isRedactedForVisitor).toBe(false);
      expect(ftDetail?.picksCatalog?.picks.length ?? 0).toBeGreaterThan(0);
      expect(ftDetail?.picksCatalog?.picks.every((p) => !p.isRedacted)).toBe(true);
    }

    const visitorScreener = await loadServerPicksCatalogsForScreener({
      fullAccess: false,
      maxGames: 8,
    });
    expect(visitorScreener instanceof Map).toBe(false);
    expect(() => JSON.stringify(visitorScreener)).not.toThrow();
    for (const catalog of Object.values(visitorScreener)) {
      expect(catalog.isRedactedForVisitor).toBe(true);
      for (const item of catalog.picks) {
        const isPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
        if (!isPromo) {
          expect(item.isRedacted).toBe(true);
          expect(item.pricing.p).toBe(0);
          expect(item.pricing.fairOdds).toBe(0);
        }
      }
    }

    const memberScreener = await loadServerPicksCatalogsForScreener({
      fullAccess: true,
      maxGames: 8,
    });
    const memberCatalogs = Object.values(memberScreener);
    expect(TIER1_LEAGUE_IDS).toHaveLength(15);
    expect(memberCatalogs.length).toBeGreaterThan(0);
    for (const catalog of memberCatalogs) {
      expect(catalog.isRedactedForVisitor).toBe(false);
      expect(catalog.picks.every((p) => !p.isRedacted)).toBe(true);
    }
  });
});
