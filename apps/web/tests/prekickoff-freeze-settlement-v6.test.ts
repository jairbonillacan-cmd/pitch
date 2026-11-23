import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asGameId,
  asLeagueId,
  asMarketKey,
  asSeasonId,
  asTeamId,
  parseStrictFiniteNumber,
  type GameAnalysis,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import {
  applyMigrations,
  eq,
  sealedPicks,
  setEmailPreferences,
  upsertClosingOdds,
  users,
  type Db,
} from "@pitchlab/db";
import { solvePowerDevigExactV6, type QuoteTickInputV6 } from "@pitchlab/spacetime/v6";
import { isCredibleClvPct } from "@pitchlab/ui/record-stats";
import type { MatchPick, PlatformDataset } from "@pitchlab/ui/types";
import {
  computeCredibleClvPctV6,
  evaluateProspectiveClosingQuotesV6,
  solveSameBookClosingPowerDevigV6,
} from "../src/server/closing-odds";
import {
  auditServerPreKickoffCausalityV6,
  clearServerFrozenPicksCacheForTests,
  getServerPreKickoffSealRecordV6,
  resolveServerFrozenMainPick,
  verifyPreKickoffSealHashV6,
} from "../src/server/frozen-picks";
import type { Mailer, OutgoingEmail } from "../src/server/mailer";
import { sealPick } from "../src/server/member-data";
import {
  formatPickResultLabelEs,
  settleSealedPick,
  summarizeDailySettledResultsV6,
} from "../src/server/pick-results";
import {
  gradeSelection,
  runPickSettlement,
  type MatchFinalStatsV6,
} from "../src/server/settlement";
import {
  applyPreKickoffCausalityToSnapshot,
  clearSnapshotCausalityCachesForTests,
  getCachedLeagueCausalityAuditV6,
  loadAllActiveLeagueSnapshots,
  loadLeagueSnapshotEnvelope,
} from "../src/server/snapshots";

const mockPlatformState = vi.hoisted(() => ({ dataset: null as PlatformDataset | null }));

vi.mock("../src/server/platform-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/platform-data")>();
  return {
    ...actual,
    buildServerRawPlatformDataset: () =>
      mockPlatformState.dataset ?? actual.buildServerRawPlatformDataset(),
  };
});

const FORBIDDEN_VISITOR_KEYS = new Set([
  "stake",
  "kelly",
  "kellyFraction",
  "expectedEdge",
]);

function collectForbiddenKeys(value: unknown): string[] {
  const hits: string[] = [];
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) hits.push(...collectForbiddenKeys(item));
    } else {
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_VISITOR_KEYS.has(k)) hits.push(k);
        hits.push(...collectForbiddenKeys(v));
      }
    }
  }
  return hits;
}

function makeTestMatchPick(overrides: Partial<MatchPick> = {}): MatchPick {
  return {
    id: "v6-pick-1",
    gameId: "nba-2026-11-20-bos-nyk",
    league: asLeagueId("nba"),
    leagueLabel: "NBA",
    matchLabel: "Celtics vs Knicks",
    kickoffLocal: "19:30",
    gameStatus: "NS",
    slotIndex: 0,
    category: "principal",
    categoryLabel: "Moneyline",
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Spacetime v6.0",
    marketGroup: "Moneyline",
    market: "nba_moneyline",
    selectionKey: "home",
    line: null,
    conflictGroup: "home_side",
    label: "Celtics gana",
    rationale: "Ventaja estructural pre-kickoff.",
    p: 0.612,
    fairDecimal: 1.63,
    fairAmerican: -158,
    marketDecimal: null,
    marketAmerican: null,
    edgePts: null,
    confidenceScore: 72,
    suggestedUnits: 1,
    ...overrides,
  };
}

function makeTestGameAnalysis(
  gameId: string,
  inputsAsOf: string,
  x12: [number, number, number],
  projection: { home: number; away: number; total: number; margin?: number },
): GameAnalysis {
  return {
    game: asGameId(gameId),
    model: {
      id: "spacetime-v6",
      version: "6.0.0",
      status: "candidate",
      label: "Spacetime v6.0",
    },
    projection,
    x12,
    probabilities: [
      { market: asMarketKey("h2h"), selection: "home", p: x12[0], fairOdds: 1 / x12[0] },
      { market: asMarketKey("h2h"), selection: "away", p: x12[2], fairOdds: 1 / x12[2] },
    ],
    marketGroups: [
      {
        group: "Moneyline",
        rows: [
          {
            market: asMarketKey("h2h"),
            selection: "home",
            label: "Local gana",
            p: x12[0],
            fairOdds: 1 / x12[0],
          },
        ],
      },
    ],
    factors: [{ key: "form", label: "Forma reciente", value: "6-4" }],
    steps: [
      "Estado causal",
      "Ajuste localía",
      "Calibración",
      "Distribución",
      "Verificación",
      "Publicación",
    ],
    inputsAsOf,
    publishedAt: inputsAsOf,
    source: "test-fixture",
  };
}

function makeUsLeagueSnapshot(params: {
  readonly league: "nba" | "nhl";
  readonly gameId: string;
  readonly startTime: string;
  readonly status: "scheduled" | "in_progress" | "final";
  readonly homeSlug: string;
  readonly homeName: string;
  readonly homeCode: string;
  readonly awaySlug: string;
  readonly awayName: string;
  readonly awayCode: string;
  readonly score?: { home: number; away: number };
  readonly analysis?: GameAnalysis;
}): LeagueSnapshot {
  const leagueId = asLeagueId(params.league);
  const seasonId = asSeasonId("2026-27");
  return {
    schemaVersion: 1,
    league: leagueId,
    season: seasonId,
    seasonLabel: "2026-27",
    periodLabel: "Temporada Regular",
    updatedAt: "2026-11-20T23:55:00Z",
    source: "test-fixture",
    provenance: "provider",
    isDemo: false,
    teamRates: {},
    games: [
      {
        id: asGameId(params.gameId),
        league: leagueId,
        season: seasonId,
        startTime: params.startTime,
        status: params.status,
        neutralSite: false,
        home: {
          id: asTeamId(`${params.league}.${params.homeSlug}`),
          league: leagueId,
          name: params.homeName,
          shortName: params.homeName,
          code: params.homeCode,
        },
        away: {
          id: asTeamId(`${params.league}.${params.awaySlug}`),
          league: leagueId,
          name: params.awayName,
          shortName: params.awayName,
          code: params.awayCode,
        },
        ...(params.score
          ? {
              result: {
                home: params.score.home,
                away: params.score.away,
                observedAt: "2026-11-21T03:00:00Z",
                source: "test-fixture",
              },
            }
          : {}),
      },
    ],
    analyses: params.analysis ? { [params.gameId]: params.analysis } : {},
  };
}

describe("Spacetime v6.0 · Pre-kickoff Seal & Causality (frozen-picks.ts)", () => {
  beforeEach(() => {
    clearServerFrozenPicksCacheForTests();
  });

  it("acepta inputsAsOf <= startTime, rechaza inputsAsOf > startTime y preserva el sello existente de forma inmutable", async () => {
    const kickoffUtc = "2026-11-20T23:00:00Z";
    const baseGame = {
      id: "nba-2026-11-20-bos-nyk",
      league: asLeagueId("nba"),
      sport: "basketball" as const,
      kickoffUtc,
      status: "NS" as const,
      home: { slug: "boston-celtics", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "" },
      away: { slug: "new-york-knicks", name: "New York Knicks", shortName: "Knicks", code: "NYK", record: "" },
      x12: [0.612, 0, 0.388] as [number, number, number],
      projection: { home: 116.5, away: 111.2, total: 227.7 },
      picks: [makeTestMatchPick()],
    };

    const contaminatedFirst = await resolveServerFrozenMainPick(baseGame, {
      now: new Date("2026-11-20T22:15:00Z"),
      inputsAsOfUtc: "2026-11-20T23:05:00Z",
    });
    expect(contaminatedFirst).toBeNull();
    expect(getServerPreKickoffSealRecordV6(baseGame.id)).toBeNull();

    const postKickoffUnsealed = await resolveServerFrozenMainPick(
      { ...baseGame, status: "FT" },
      { now: new Date("2026-11-21T02:00:00Z") },
    );
    expect(postKickoffUnsealed).toBeNull();

    const liveUnsealed = await resolveServerFrozenMainPick(
      { ...baseGame, status: "LIVE" },
      { now: new Date("2026-11-20T23:10:00Z") },
    );
    expect(liveUnsealed).toBeNull();

    const sealedPre = await resolveServerFrozenMainPick(baseGame, {
      now: new Date("2026-11-20T22:00:00Z"),
      inputsAsOfUtc: "2026-11-20T21:45:00Z",
    });
    expect(sealedPre).not.toBeNull();
    expect(sealedPre?.pickId).toBe("v6-pick-1");
    expect(sealedPre?.p).toBeCloseTo(0.612, 5);

    const sealRecord = getServerPreKickoffSealRecordV6(baseGame.id);
    expect(sealRecord).not.toBeNull();
    expect(sealRecord!.inputsAsOfEpochMs).toBeLessThanOrEqual(sealRecord!.kickoffEpochMs);
    expect(verifyPreKickoffSealHashV6(sealRecord!)).toBe(true);
    const originalSha = sealRecord!.sealSha256;

    const afterContaminatedOverwrite = await resolveServerFrozenMainPick(
      {
        ...baseGame,
        status: "FT",
        x12: [0.99, 0, 0.01],
        picks: [
          makeTestMatchPick({
            id: "v6-pick-contaminated",
            label: "Knicks gana",
            p: 0.99,
            fairDecimal: 1.01,
          }),
        ],
      },
      {
        now: new Date("2026-11-21T02:30:00Z"),
        inputsAsOfUtc: "2026-11-21T02:20:00Z",
      },
    );
    expect(afterContaminatedOverwrite?.pickId).toBe("v6-pick-1");
    expect(afterContaminatedOverwrite?.label).toBe("Celtics gana");
    expect(afterContaminatedOverwrite?.p).toBeCloseTo(0.612, 5);
    expect(getServerPreKickoffSealRecordV6(baseGame.id)?.sealSha256).toBe(originalSha);

    const audit = auditServerPreKickoffCausalityV6([
      {
        matchId: baseGame.id,
        sport: "nba",
        league: "nba",
        homeTeam: "boston-celtics",
        awayTeam: "new-york-knicks",
        kickoffUtc,
        status: "scheduled",
        incomingAnalysis: {
          inputsAsOfUtc: "2026-11-20T21:45:00Z",
          probabilities: { pHome: 0.612, pDraw: null, pAway: 0.388 },
          projection: { home: 116.5, away: 111.2, total: 227.7 },
        },
      },
      {
        matchId: baseGame.id,
        sport: "nba",
        league: "nba",
        homeTeam: "boston-celtics",
        awayTeam: "new-york-knicks",
        kickoffUtc,
        status: "final",
        incomingAnalysis: {
          inputsAsOfUtc: "2026-11-21T02:20:00Z",
          probabilities: { pHome: 0.99, pDraw: null, pAway: 0.01 },
          projection: { home: 130, away: 100, total: 230 },
        },
      },
    ]);
    expect(audit.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(audit.rescuedFromPriorSealCount).toBe(1);
    expect(audit.finalMatchesWithSealedForecast).toBe(1);
    expect(audit.ledgerSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Spacetime v6.0 · Preservación de pronósticos FT en NBA y NHL (snapshots.ts)", () => {
  beforeEach(() => {
    clearSnapshotCausalityCachesForTests();
  });

  it("preserva hasForecast = true y proyección pre-kickoff cuando NBA y NHL transicionan a FT sin análisis o con análisis contaminado", () => {
    const nbaScheduled = makeUsLeagueSnapshot({
      league: "nba",
      gameId: "nba-2026-11-20-bos-nyk",
      startTime: "2026-11-20T23:00:00Z",
      status: "scheduled",
      homeSlug: "boston-celtics",
      homeName: "Boston Celtics",
      homeCode: "BOS",
      awaySlug: "new-york-knicks",
      awayName: "New York Knicks",
      awayCode: "NYK",
      analysis: makeTestGameAnalysis(
        "nba-2026-11-20-bos-nyk",
        "2026-11-20T18:00:00Z",
        [0.64, 0, 0.36],
        { home: 118.4, away: 112.1, total: 230.5, margin: 6.3 },
      ),
    });

    const nhlScheduled = makeUsLeagueSnapshot({
      league: "nhl",
      gameId: "nhl-2026-11-20-car-sea",
      startTime: "2026-11-20T23:00:00Z",
      status: "scheduled",
      homeSlug: "carolina-hurricanes",
      homeName: "Carolina Hurricanes",
      homeCode: "CAR",
      awaySlug: "seattle-kraken",
      awayName: "Seattle Kraken",
      awayCode: "SEA",
      analysis: makeTestGameAnalysis(
        "nhl-2026-11-20-car-sea",
        "2026-11-20T17:30:00Z",
        [0.585, 0, 0.415],
        { home: 3.45, away: 2.85, total: 6.3, margin: 0.6 },
      ),
    });

    const preNba = applyPreKickoffCausalityToSnapshot(nbaScheduled);
    const preNhl = applyPreKickoffCausalityToSnapshot(nhlScheduled);
    expect(preNba.matches[0]?.hasForecast).toBe(true);
    expect(preNhl.matches[0]?.hasForecast).toBe(true);

    const nbaFinalWiped = makeUsLeagueSnapshot({
      league: "nba",
      gameId: "nba-2026-11-20-bos-nyk",
      startTime: "2026-11-20T23:00:00Z",
      status: "final",
      homeSlug: "boston-celtics",
      homeName: "Boston Celtics",
      homeCode: "BOS",
      awaySlug: "new-york-knicks",
      awayName: "New York Knicks",
      awayCode: "NYK",
      score: { home: 121, away: 109 },
    });

    const nhlFinalContaminated = makeUsLeagueSnapshot({
      league: "nhl",
      gameId: "nhl-2026-11-20-car-sea",
      startTime: "2026-11-20T23:00:00Z",
      status: "final",
      homeSlug: "carolina-hurricanes",
      homeName: "Carolina Hurricanes",
      homeCode: "CAR",
      awaySlug: "seattle-kraken",
      awayName: "Seattle Kraken",
      awayCode: "SEA",
      score: { home: 4, away: 1 },
      analysis: makeTestGameAnalysis(
        "nhl-2026-11-20-car-sea",
        "2026-11-21T03:15:00Z",
        [0.98, 0, 0.02],
        { home: 4, away: 1, total: 5, margin: 3 },
      ),
    });

    const postNba = applyPreKickoffCausalityToSnapshot(nbaFinalWiped);
    const postNhl = applyPreKickoffCausalityToSnapshot(nhlFinalContaminated);

    expect(postNba.audit.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(postNba.audit.rescuedFromPriorSealCount).toBe(1);
    expect(postNba.matches[0]?.status).toBe("FT");
    expect(postNba.matches[0]?.hasForecast).toBe(true);
    expect(postNba.matches[0]?.x12?.[0]).toBeCloseTo(0.64, 4);
    expect(postNba.matches[0]?.projection?.home).toBeCloseTo(118.4, 1);

    expect(postNhl.audit.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(postNhl.audit.rescuedFromPriorSealCount).toBe(1);
    expect(postNhl.matches[0]?.status).toBe("FT");
    expect(postNhl.matches[0]?.hasForecast).toBe(true);
    expect(postNhl.matches[0]?.x12?.[0]).toBeCloseTo(0.585, 4);
    expect(postNhl.matches[0]?.projection?.home).toBeCloseTo(3.45, 2);
  });

  it("recupera pronósticos pre-kickoff causales para todos los FT reales de NBA y NHL sin contaminar el ledger", () => {
    const nbaEnv = loadLeagueSnapshotEnvelope("nba");
    const nhlEnv = loadLeagueSnapshotEnvelope("nhl");

    expect(nbaEnv.state).toBe("ready");
    expect(nhlEnv.state).toBe("ready");

    const nbaFt = (nbaEnv.data?.games ?? []).filter((g) => g.status === "FT");
    const nhlFt = (nhlEnv.data?.games ?? []).filter((g) => g.status === "FT");
    expect(nbaFt.length).toBeGreaterThan(0);
    expect(nhlFt.length).toBeGreaterThan(0);

    for (const game of [...nbaFt, ...nhlFt]) {
      expect(game.hasForecast).toBe(true);
      expect(game.x12).toBeDefined();
      expect(game.x12?.[1]).toBe(0);
      expect((game.x12?.[0] ?? 0) + (game.x12?.[2] ?? 0)).toBeCloseTo(1, 4);
      expect(game.projection?.home).toBeGreaterThan(0);
      expect(game.projection?.away).toBeGreaterThan(0);
    }

    const nbaAudit = getCachedLeagueCausalityAuditV6("nba");
    const nhlAudit = getCachedLeagueCausalityAuditV6("nhl");
    expect(nbaAudit?.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(nhlAudit?.contaminatedAcceptedIntoLedgerCount).toBe(0);
    expect(nbaAudit?.finalMatchesWithSealedForecast).toBe(nbaAudit?.finalMatchesTotal);
    expect(nhlAudit?.finalMatchesWithSealedForecast).toBe(nhlAudit?.finalMatchesTotal);

    const allEnvelopes = loadAllActiveLeagueSnapshots();
    const allNbaFt = (allEnvelopes.nba.data?.games ?? []).filter((g) => g.status === "FT");
    const allNhlFt = (allEnvelopes.nhl.data?.games ?? []).filter((g) => g.status === "FT");
    expect(allNbaFt.every((g) => g.hasForecast === true)).toBe(true);
    expect(allNhlFt.every((g) => g.hasForecast === true)).toBe(true);
  });
});

describe("Spacetime v6.0 · Closing Power De-Vig misma casa, CLV creíble y evaluación prospectiva (closing-odds.ts)", () => {
  it("aplica solvePowerDevigExactV6 solo en misma casa completa pre-kickoff (0 cross-book y 0 casas bloqueadas)", () => {
    const kickoffAt = new Date("2026-11-20T20:00:00Z");
    const preCap = "2026-11-20T19:50:00Z";
    const postCap = "2026-11-20T20:05:00Z";

    const rows = solveSameBookClosingPowerDevigV6(
      [
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "spreads",
          selection: "home_-3.5",
          line: -3.5,
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimalOdds: 1.95,
          capturedAtUtc: preCap,
          source: "test_pin",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "spreads",
          selection: "away_+3.5",
          line: 3.5,
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimalOdds: 1.95,
          capturedAtUtc: preCap,
          source: "test_pin",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "totals",
          selection: "over_30.5",
          line: 30.5,
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimalOdds: 1.91,
          capturedAtUtc: preCap,
          source: "test_cross",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "totals",
          selection: "under_30.5",
          line: 30.5,
          book: "bet365",
          bookLabel: "Bet365",
          decimalOdds: 1.91,
          capturedAtUtc: preCap,
          source: "test_cross",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "h2h",
          selection: "home",
          line: null,
          book: "caliente",
          bookLabel: "Caliente",
          decimalOdds: 1.85,
          capturedAtUtc: preCap,
          source: "test_blocked",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "h2h",
          selection: "away",
          line: null,
          book: "caliente",
          bookLabel: "Caliente",
          decimalOdds: 2.05,
          capturedAtUtc: preCap,
          source: "test_blocked",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "h2h",
          selection: "home",
          line: null,
          book: "bet365",
          bookLabel: "Bet365",
          decimalOdds: 1.8,
          capturedAtUtc: postCap,
          source: "test_late",
        },
        {
          gameId: "nfl-g1",
          sport: "american-football",
          market: "h2h",
          selection: "away",
          line: null,
          book: "bet365",
          bookLabel: "Bet365",
          decimalOdds: 2.1,
          capturedAtUtc: postCap,
          source: "test_late",
        },
      ],
      kickoffAt,
    );

    expect(rows).toHaveLength(2);
    const homeSpread = rows.find((r) => r.market === "spreads" && r.selection === "home");
    const awaySpread = rows.find((r) => r.market === "spreads" && r.selection === "away");
    expect(homeSpread?.lineKey).toBe("-3.5");
    expect(awaySpread?.lineKey).toBe("3.5");
    expect(homeSpread?.book).toBe("pinnacle");
    expect(awaySpread?.book).toBe("pinnacle");

    const expectedPow = solvePowerDevigExactV6([1.95, 1.95]);
    expect(homeSpread?.noVigProb).toBeCloseTo(expectedPow.probsNoVig[0]!, 10);
    expect(awaySpread?.noVigProb).toBeCloseTo(expectedPow.probsNoVig[1]!, 10);
    expect((homeSpread?.noVigProb ?? 0) + (awaySpread?.noVigProb ?? 0)).toBeCloseTo(1, 12);

    expect(rows.some((r) => r.market === "totals")).toBe(false);
    expect(rows.some((r) => r.book === "caliente")).toBe(false);
    expect(rows.some((r) => r.market === "h2h")).toBe(false);
  });

  it("filtra CLV fuera de rango creíble [-60, 25] simples y [-60, 50] parlays y ejecuta evaluación prospectiva v6.0", () => {
    expect(isCredibleClvPct(9.76, false)).toBe(true);
    expect(computeCredibleClvPctV6(2.25, 2.05, false)).toBeCloseTo(9.76, 2);
    expect(computeCredibleClvPctV6(4.0, 2.0, false)).toBeNull();
    expect(computeCredibleClvPctV6(1.2, 4.0, false)).toBeNull();

    expect(computeCredibleClvPctV6(5.8, 4.0, true)).toBeCloseTo(45, 2);
    expect(computeCredibleClvPctV6(7.0, 4.0, true)).toBeNull();

    const ticks: QuoteTickInputV6[] = [
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "home",
        book: "pinnacle",
        price_decimal: 2.05,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "draw",
        book: "pinnacle",
        price_decimal: 3.55,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "away",
        book: "pinnacle",
        price_decimal: 3.7,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "home",
        book: "caliente",
        price_decimal: 2.1,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "draw",
        book: "caliente",
        price_decimal: 3.4,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
      {
        event_id: "epl-ev-1",
        sport: "football",
        league: "premier-league",
        market: "1x2",
        line: null,
        selection: "away",
        book: "caliente",
        price_decimal: 3.5,
        ts_captured: "2026-11-20T14:50:00Z",
        ts_event_start: "2026-11-20T15:00:00Z",
      },
    ];

    const report = evaluateProspectiveClosingQuotesV6({
      ticks,
      enginePreKickoffByEvent: {
        "epl-ev-1": { pHome: 0.49, pDraw: 0.27, pAway: 0.24 },
      },
      settledScoresByEvent: {
        "epl-ev-1": { homeScore: 2, awayScore: 1 },
      },
      nResamples: 50,
    });

    expect(report.n_complete_markets).toBe(1);
    expect(report.evaluated_markets[0]?.book).toBe("pinnacle");
    expect(report.settled_outcome_calibration.n_settled_markets).toBe(1);
    expect(report.settled_outcome_calibration.logloss_v6).not.toBeNull();
    expect(collectForbiddenKeys(report)).toEqual([]);
  });
});

describe("Spacetime v6.0 · Liquidación FT multi-deporte, SGP, Parlays, Props e inmutabilidad DB", () => {
  let pgClient: PGlite;
  let db: Db;
  const sent: OutgoingEmail[] = [];

  const fakeMailer: Mailer = {
    async send(email) {
      sent.push(email);
      return { id: `v6-mail-${sent.length}` };
    },
    async cancel() {},
  };

  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations((sqlText) => pgClient.exec(sqlText));
    await pgClient.exec("SET pitchlab.allow_historical_seed = 'on'");
    db = drizzle(pgClient);
  });

  beforeEach(async () => {
    await pgClient.exec(
      "TRUNCATE TABLE users, closing_odds, match_results, push_subscriptions, funnel_events, security_rate_buckets, security_abuse_events CASCADE",
    );
    sent.length = 0;
    mockPlatformState.dataset = null;
  });

  afterAll(async () => {
    mockPlatformState.dataset = null;
    await pgClient.close();
  });

  it("califica Moneyline, alt Spreads (-3.5/+7.5/-15.5), alt Totals (Over 30.5 y push 30.0), micro-conteos, Goalkeeper Saves y Player Props", () => {
    expect(gradeSelection({ market: "nba_moneyline", selection: "home" }, 114, 108)).toBe("won");
    expect(gradeSelection({ market: "nba_moneyline", selection: "away" }, 114, 108)).toBe("lost");
    expect(gradeSelection({ market: "nfl_moneyline", selection: "home" }, 20, 20)).toBe("void");

    expect(gradeSelection({ market: "1x2", selection: "1" }, 2, 1)).toBe("won");
    expect(gradeSelection({ market: "double_chance", selection: "1x" }, 1, 1)).toBe("won");
    expect(gradeSelection({ market: "dnb", selection: "home" }, 1, 1)).toBe("void");
    expect(gradeSelection({ market: "btts", selection: "yes" }, 2, 1)).toBe("won");

    expect(gradeSelection({ market: "alt_spreads", selection: "home_-3.5" }, 24, 20)).toBe("won");
    expect(gradeSelection({ market: "alt_spreads", selection: "home_-3.5" }, 23, 20)).toBe("lost");
    expect(gradeSelection({ market: "alt_spreads", selection: "away_+7.5" }, 27, 20)).toBe("won");
    expect(gradeSelection({ market: "alt_spreads", selection: "away_+7.5" }, 28, 20)).toBe("lost");
    expect(gradeSelection({ market: "nba_spread", selection: "home_-15.5" }, 120, 104)).toBe("won");
    expect(gradeSelection({ market: "nba_spread", selection: "home_-15.5" }, 119, 104)).toBe("lost");
    expect(gradeSelection({ market: "asian_handicap", selection: "home_-1" }, 2, 1)).toBe("void");

    expect(gradeSelection({ market: "alt_totals", selection: "over_30.5" }, 17, 14)).toBe("won");
    expect(gradeSelection({ market: "alt_totals", selection: "over_30.5" }, 17, 13)).toBe("lost");
    expect(gradeSelection({ market: "alt_totals", selection: "over_30.0" }, 17, 13)).toBe("void");
    expect(gradeSelection({ market: "totals", selection: "under_30.0" }, 17, 13)).toBe("void");

    const stats: MatchFinalStatsV6 = {
      cornersHome: 6,
      cornersAway: 4,
      yellowCardsHome: 3,
      yellowCardsAway: 2,
      redCardsHome: 1,
      redCardsAway: 0,
      shotsOnTargetHome: 6,
      shotsOnTargetAway: 3,
      goalkeeperSaves: { courtois: 4, oblak: 3 },
      playerStats: {
        mbappe: { shots_on_target: 2, shots: 5 },
        "lebron-james": { PTS: 28, AST: 8 },
      },
      didNotPlayPlayers: ["benched-player"],
    };

    expect(gradeSelection({ market: "corners_total", selection: "over_9.5" }, 2, 1, stats)).toBe("won");
    expect(gradeSelection({ market: "corners_total", selection: "over_10.0" }, 2, 1, stats)).toBe("void");
    expect(gradeSelection({ market: "cards_total", selection: "over_4.5" }, 2, 1, stats)).toBe("won");
    expect(gradeSelection({ market: "booking_points", selection: "over_55.5" }, 2, 1, stats)).toBe("won");
    expect(gradeSelection({ market: "shots_on_target", selection: "over_8.5" }, 2, 1, stats)).toBe("won");

    expect(
      gradeSelection({ market: "goalkeeper_saves", selection: "gk_saves:courtois:over_3.5" }, 2, 1, stats),
    ).toBe("won");
    expect(
      gradeSelection({ market: "goalkeeper_saves", selection: "gk_saves:oblak:over_3.5" }, 2, 1, stats),
    ).toBe("lost");
    expect(
      gradeSelection({ market: "goalkeeper_saves", selection: "gk_saves:oblak:over_3.0" }, 2, 1, stats),
    ).toBe("void");
    expect(
      gradeSelection(
        { market: "goalkeeper_saves", selection: "gk_saves:benched-player:over_2.5" },
        2,
        1,
        stats,
      ),
    ).toBe("void");

    expect(
      gradeSelection(
        { market: "player_props_football", selection: "player:mbappe:shots_on_target:over_1.5" },
        2,
        1,
        stats,
      ),
    ).toBe("won");
    expect(
      gradeSelection(
        { market: "nba_player_props", selection: "lebron-james:PTS:over_27.5" },
        118,
        110,
        stats,
      ),
    ).toBe("won");
    expect(
      gradeSelection(
        { market: "nba_player_props", selection: "lebron-james:AST:over_8.0" },
        118,
        110,
        stats,
      ),
    ).toBe("void");
  });

  it("liquida en FT singles, alt spreads, alt totals, goalkeeper saves, SGP y Daily Parlays con CLV real e inmutabilidad estricta", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pl-v6-settle-"));
    try {
      const snapDir = path.join(root, "snapshots");
      const histDir = path.join(root, "history");
      mkdirSync(snapDir, { recursive: true });
      mkdirSync(histDir, { recursive: true });

      const [user] = await db
        .insert(users)
        .values({ email: "v6-settle@pitchlab.mx", displayName: "Sofía V6", handle: "sofiav6" })
        .returning({ id: users.id });
      const userId = user!.id;
      await setEmailPreferences(db, userId, { pickResults: false });

      const sealTime = new Date("2026-11-19T12:00:00Z");
      const koFootball = new Date("2026-11-20T18:00:00Z");
      const koNfl = new Date("2026-11-20T20:00:00Z");
      const settleTime = new Date("2026-11-21T01:00:00Z");

      const h2hPow = solvePowerDevigExactV6([1.95, 3.6, 4.1]);
      await upsertClosingOdds(db, [
        {
          gameId: "laliga-g1",
          market: "h2h",
          selection: "home",
          lineKey: "",
          book: "pinnacle",
          decimalOdds: 1.95,
          fairDecimal: 1 / h2hPow.probsNoVig[0]!,
          noVigProb: h2hPow.probsNoVig[0]!,
          source: "spacetime_power_devig_v6",
          kickoffAt: koFootball,
          capturedAt: new Date("2026-11-20T17:55:00Z"),
        },
        {
          gameId: "nfl-g1",
          market: "spreads",
          selection: "home",
          lineKey: "-3.5",
          book: "pinnacle",
          decimalOdds: 1.92,
          fairDecimal: 1.98,
          noVigProb: 1 / 1.98,
          source: "market_book_power_devig_v6",
          kickoffAt: koNfl,
          capturedAt: new Date("2026-11-20T19:55:00Z"),
        },
      ]);

      await sealPick(
        db,
        userId,
        {
          pickId: "v6-single-spread-won",
          gameId: "nfl-g1",
          leagueLabel: "NFL",
          matchLabel: "Chiefs vs Bills",
          pickLabel: "Chiefs -3.5",
          origin: "Spacetime Suite",
          pickKind: "single",
          pickMarket: "alt_spreads",
          pickSelection: "home_-3.5",
          pickLine: -3.5,
          units: 1,
          userDecimal: 2.1,
          fairDecimal: 2.0,
          kickoffAt: koNfl,
        },
        sealTime,
      );

      await sealPick(
        db,
        userId,
        {
          pickId: "v6-single-total-push",
          gameId: "nfl-g1",
          leagueLabel: "NFL",
          matchLabel: "Chiefs vs Bills",
          pickLabel: "Over 30.0 puntos",
          origin: "Spacetime Suite",
          pickKind: "single",
          pickMarket: "alt_totals",
          pickSelection: "over_30.0",
          pickLine: 30,
          units: 1,
          userDecimal: 1.95,
          fairDecimal: 1.9,
          kickoffAt: koNfl,
        },
        sealTime,
      );

      await sealPick(
        db,
        userId,
        {
          pickId: "v6-single-gk-saves",
          gameId: "laliga-g1",
          leagueLabel: "LaLiga",
          matchLabel: "Real Madrid vs Sevilla",
          pickLabel: "Courtois Más de 3.5 atajadas",
          origin: "Player Prop",
          pickKind: "single",
          pickMarket: "goalkeeper_saves",
          pickSelection: "gk_saves:courtois:over_3.5",
          pickLine: 3.5,
          units: 1,
          userDecimal: 2.15,
          fairDecimal: 2.05,
          kickoffAt: koFootball,
        },
        sealTime,
      );

      await sealPick(
        db,
        userId,
        {
          pickId: "parlay:sgp-laliga-1",
          gameId: "laliga-g1",
          leagueLabel: "LaLiga",
          matchLabel: "Real Madrid vs Sevilla · 2 selecciones · SGP",
          pickLabel: "Real Madrid gana · Courtois Más de 3.5 atajadas",
          origin: "Bet Builder SGP",
          pickKind: "parlay",
          parlayLegs: [
            {
              pickId: "sgp-l1",
              gameId: "laliga-g1",
              leagueLabel: "LaLiga",
              matchLabel: "Real Madrid vs Sevilla",
              pickLabel: "Real Madrid gana",
              market: "1x2",
              selection: "home",
              line: null,
              p: 0.51,
              fairDecimal: 1.96,
              kickoffAt: koFootball.toISOString(),
            },
            {
              pickId: "sgp-l2",
              gameId: "laliga-g1",
              leagueLabel: "LaLiga",
              matchLabel: "Real Madrid vs Sevilla",
              pickLabel: "Courtois Más de 3.5 atajadas",
              market: "goalkeeper_saves",
              selection: "gk_saves:courtois:over_3.5",
              line: 3.5,
              p: 0.54,
              fairDecimal: 1.85,
              kickoffAt: koFootball.toISOString(),
            },
          ],
          units: 1,
          userDecimal: 3.9,
          fairDecimal: 3.6,
          kickoffAt: koFootball,
        },
        sealTime,
      );

      await sealPick(
        db,
        userId,
        {
          pickId: "parlay:daily-v6-1",
          gameId: "laliga-g1",
          leagueLabel: "Combinada Multi-Liga",
          matchLabel: "Real Madrid vs Sevilla · Chiefs vs Bills",
          pickLabel: "Real Madrid gana · Chiefs -3.5",
          origin: "Parlay del Día",
          pickKind: "parlay",
          parlayLegs: [
            {
              pickId: "dp-l1",
              gameId: "laliga-g1",
              leagueLabel: "LaLiga",
              matchLabel: "Real Madrid vs Sevilla",
              pickLabel: "Real Madrid gana",
              market: "1x2",
              selection: "home",
              line: null,
              p: 0.51,
              fairDecimal: 1.96,
              kickoffAt: koFootball.toISOString(),
            },
            {
              pickId: "dp-l2",
              gameId: "nfl-g1",
              leagueLabel: "NFL",
              matchLabel: "Chiefs vs Bills",
              pickLabel: "Chiefs -3.5",
              market: "alt_spreads",
              selection: "home_-3.5",
              line: -3.5,
              p: 0.52,
              fairDecimal: 1.92,
              kickoffAt: koNfl.toISOString(),
            },
          ],
          units: 1,
          userDecimal: 4.1,
          fairDecimal: 3.76,
          kickoffAt: koFootball,
        },
        sealTime,
      );

      await sealPick(
        db,
        userId,
        {
          pickId: "v6-single-noncredible-clv",
          gameId: "nfl-g1",
          leagueLabel: "NFL",
          matchLabel: "Chiefs vs Bills",
          pickLabel: "Chiefs -15.5",
          origin: "Spacetime Suite",
          pickKind: "single",
          pickMarket: "alt_spreads",
          pickSelection: "home_-15.5",
          pickLine: -15.5,
          units: 1,
          userDecimal: 6.5,
          fairDecimal: 2.0,
          kickoffAt: koNfl,
        },
        sealTime,
      );

      writeFileSync(
        path.join(histDir, "v6-ft.jsonl"),
        [
          JSON.stringify({ id: "laliga-g1", homeScore: 2, awayScore: 1 }),
          JSON.stringify({ id: "nfl-g1", homeScore: 17, awayScore: 13 }),
        ].join("\n") + "\n",
      );

      const finalStatsByGame = new Map<string, MatchFinalStatsV6>([
        ["laliga-g1", { goalkeeperSaves: { courtois: 5 } }],
      ]);

      mockPlatformState.dataset = {
        generatedAt: "2026-11-20T17:00:00Z",
        leagues: [],
        games: [],
        dailyPromoPickId: "",
        tipsterWeeklyPickId: "",
        tipsterWeeklySlug: "",
        isServerRedactedForVisitor: false,
      };

      const report = await runPickSettlement(db, fakeMailer, {
        now: settleTime,
        snapshotsRoot: snapDir,
        historyRoot: histDir,
        finalStatsByGame,
      });

      expect(report.settledSingles).toBe(4);
      expect(report.settledParlays).toBe(2);
      expect(report.skippedUnresolved).toBe(0);

      const rows = await db.select().from(sealedPicks).where(eq(sealedPicks.userId, userId));
      const byPickId = new Map(rows.map((r) => [r.pickId, r]));

      expect(byPickId.get("v6-single-spread-won")?.status).toBe("won");
      expect(
        parseStrictFiniteNumber(byPickId.get("v6-single-spread-won")?.clvPct),
      ).toBeCloseTo(6.06, 1);

      expect(byPickId.get("v6-single-total-push")?.status).toBe("void");
      expect(byPickId.get("v6-single-gk-saves")?.status).toBe("won");
      expect(byPickId.get("parlay:sgp-laliga-1")?.status).toBe("won");
      expect(byPickId.get("parlay:daily-v6-1")?.status).toBe("won");
      expect(byPickId.get("v6-single-noncredible-clv")?.status).toBe("lost");
      expect(byPickId.get("v6-single-noncredible-clv")?.clvPct).toBeNull();

      const replayBlocked = await settleSealedPick(db, {
        userId,
        pickId: "v6-single-spread-won",
        result: "lost",
        clvPct: -20,
        now: new Date("2026-11-21T03:00:00Z"),
      });
      expect(replayBlocked).toBeNull();

      const secondRun = await runPickSettlement(db, fakeMailer, {
        now: new Date("2026-11-21T03:05:00Z"),
        snapshotsRoot: snapDir,
        historyRoot: histDir,
        finalStatsByGame,
      });
      expect(secondRun.checkedPending).toBe(0);

      const dailySummary = summarizeDailySettledResultsV6(rows);
      expect(dailySummary.settledCount).toBe(6);
      expect(dailySummary.wonCount).toBe(4);
      expect(dailySummary.lostCount).toBe(1);
      expect(dailySummary.voidCount).toBe(1);
      expect(formatPickResultLabelEs("won")).toBe("Ganada");
      expect(formatPickResultLabelEs("lost")).toBe("Perdida");
      expect(formatPickResultLabelEs("void")).toBe("Push");
      expect(dailySummary.avgCredibleClvPct).not.toBeNull();
      expect(collectForbiddenKeys(dailySummary)).toEqual([]);
      expect(collectForbiddenKeys(report)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
