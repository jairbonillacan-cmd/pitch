import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  containsForbiddenFd16Term,
  type LiveMatchDetail,
  type LiveScoreboard,
} from "@pitchlab/contracts";
import {
  applyMigrations,
  claimLiveCacheSlotOnce,
  eq,
  grantDays,
  sealedPicks,
  users,
  type Db,
} from "@pitchlab/db";
import type { PlatformDataset } from "@pitchlab/ui/types";
import type { AuthenticatedMember } from "../src/server/session-user";
import type { ViewerAccess } from "../src/server/viewer-access";
import type { WebPushMessagePayload } from "../src/server/web-push";

const EMPTY_DATASET: PlatformDataset = {
  generatedAt: "2026-11-20T20:00:00.000Z",
  leagues: [],
  games: [],
  dailyPromoPickId: "",
  tipsterWeeklyPickId: "",
  tipsterWeeklySlug: "",
  isServerRedactedForVisitor: false,
};

const mocks = vi.hoisted(() => {
  const initialDataset: PlatformDataset = {
    generatedAt: "2026-11-20T20:00:00.000Z",
    leagues: [],
    games: [],
    dailyPromoPickId: "",
    tipsterWeeklyPickId: "",
    tipsterWeeklySlug: "",
    isServerRedactedForVisitor: false,
  };
  return {
    requireMember: vi.fn(),
    getViewerAccess: vi.fn(),
    getLiveScoreboard: vi.fn(),
    getLiveMatchDetail: vi.fn(),
    dataset: initialDataset,
  };
});

vi.mock("../src/server/session-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/session-user")>()),
  requireMember: mocks.requireMember,
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/live")>()),
  getLiveScoreboard: mocks.getLiveScoreboard,
  getLiveMatchDetail: mocks.getLiveMatchDetail,
}));

vi.mock("../src/server/platform-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/platform-data")>()),
  buildServerRawPlatformDataset: () => mocks.dataset,
}));

import { GET as livePicksGET } from "../app/api/me/live-picks/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  computeResidualProjection,
  detectStarterOnBench,
  evaluateAsianHandicapQuarterState,
  loadUserLiveTrackedPicks,
  type UserLiveTrackedPicksPayload,
} from "../src/server/live-pick-tracker";
import { sealPick } from "../src/server/member-data";
import {
  buildLivePickMilestoneHash,
  dispatchLivePickMilestonePushes,
} from "../src/server/push-alerts";
import { resetRateLimitsForTests } from "../src/server/request-security";
import {
  MEMBER_WATERMARK_HEADER,
  verifyMemberWatermark,
} from "../src/server/watermark";

const ACCESS_ACTIVE_MEMBER: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const SEAL_AT = new Date("2026-11-20T17:00:00.000Z");
const KICKOFF_AT = new Date("2026-11-20T19:00:00.000Z");
const LIVE_NOW = new Date("2026-11-20T20:05:00.000Z");
const ENV_BACKUP = { ...process.env };

let pgClient: PGlite;
let db: Db;

function makeLiveDetail(input: {
  gameId: string;
  league: string;
  phase: LiveMatchDetail["entry"]["phase"];
  clock: string | null;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  playerStats?: LiveMatchDetail["playerStats"];
  corners?: { home: number; away: number };
}): LiveMatchDetail {
  return {
    gameId: input.gameId,
    generatedAt: LIVE_NOW.toISOString(),
    sourceFetchedAt: LIVE_NOW.toISOString(),
    entry: {
      gameId: input.gameId,
      league: input.league,
      phase: input.phase,
      clock: input.clock,
      minute: input.minute,
      score: { home: input.homeScore, away: input.awayScore },
      htScore: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
      kickoffUtc: KICKOFF_AT.toISOString(),
    },
    incidents: [],
    stats: input.corners
      ? {
          home: {
            xg: 1.2,
            shots: 8,
            shotsOnTarget: 4,
            corners: input.corners.home,
            possessionPct: 55,
            fouls: 6,
            yellowCards: 1,
            redCards: 0,
            offsides: 1,
            bigChances: 2,
          },
          away: {
            xg: 0.7,
            shots: 5,
            shotsOnTarget: 2,
            corners: input.corners.away,
            possessionPct: 45,
            fouls: 7,
            yellowCards: 2,
            redCards: 0,
            offsides: 0,
            bigChances: 1,
          },
        }
      : null,
    xgEstimated: false,
    momentum: [],
    xgTimeline: [],
    shots: [],
    ...(input.playerStats ? { playerStats: input.playerStats } : {}),
    nextPollSeconds: input.phase === "final" ? null : 15,
    notice: null,
    attribution: "PitchLab En Vivo",
  };
}

async function seedMemberWithPass(handle: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      authUserId: `auth-${handle}`,
      email: `${handle}@pitchlab.test`,
      displayName: `Socio ${handle}`,
      handle,
      isAdult: true,
    })
    .returning({ id: users.id });
  const userId = row!.id;
  await grantDays(db, {
    userId,
    sourceKind: "admin_grant",
    days: 3650,
    idempotencyKey: `grant-${handle}`,
    now: SEAL_AT,
  });
  return userId;
}

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  await pgClient.exec("SET pitchlab.allow_historical_seed = 'on'");
  db = drizzle(pgClient);
});

beforeEach(async () => {
  process.env = { ...ENV_BACKUP };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.DATABASE_URL;
  delete process.env.PITCHLAB_WATERMARK_SECRET;
  process.env.BETTER_AUTH_SECRET = "secreto-live-tracker-test-32-caracteres-valido!";
  await pgClient.exec(
    "TRUNCATE TABLE users, sealed_picks, live_feed_cache, push_subscriptions, entitlement_grants, security_rate_buckets, security_abuse_events CASCADE",
  );
  mocks.dataset = EMPTY_DATASET;
  mocks.requireMember.mockReset();
  mocks.getViewerAccess.mockReset();
  mocks.getLiveScoreboard.mockReset();
  mocks.getLiveMatchDetail.mockReset();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  process.env = { ...ENV_BACKUP };
  await pgClient.close();
});

describe("evaluateAsianHandicapQuarterState (.0 / .25 / .5 / .75)", () => {
  it("evalua los 5 estados exactos en lineas .0, .5, .25 y .75 positivas y negativas", () => {
    const cases: ReadonlyArray<{
      margin: number;
      line: number;
      state: "won_full" | "won_half" | "push" | "lost_half" | "lost_full";
      payoutMultiplier: number;
    }> = [
      { margin: 1, line: 0, state: "won_full", payoutMultiplier: 1 },
      { margin: 0, line: 0, state: "push", payoutMultiplier: 0 },
      { margin: -1, line: 0, state: "lost_full", payoutMultiplier: -1 },
      { margin: 2, line: -1, state: "won_full", payoutMultiplier: 1 },
      { margin: 1, line: -1, state: "push", payoutMultiplier: 0 },
      { margin: 0, line: -1, state: "lost_full", payoutMultiplier: -1 },
      { margin: 0, line: 1, state: "won_full", payoutMultiplier: 1 },
      { margin: -1, line: 1, state: "push", payoutMultiplier: 0 },
      { margin: -2, line: 1, state: "lost_full", payoutMultiplier: -1 },
      { margin: 1, line: -0.5, state: "won_full", payoutMultiplier: 1 },
      { margin: 0, line: -0.5, state: "lost_full", payoutMultiplier: -1 },
      { margin: 0, line: 0.5, state: "won_full", payoutMultiplier: 1 },
      { margin: -1, line: 0.5, state: "lost_full", payoutMultiplier: -1 },
      { margin: 1, line: -0.25, state: "won_full", payoutMultiplier: 1 },
      { margin: 0, line: -0.25, state: "lost_half", payoutMultiplier: -0.5 },
      { margin: -1, line: -0.25, state: "lost_full", payoutMultiplier: -1 },
      { margin: 1, line: 0.25, state: "won_full", payoutMultiplier: 1 },
      { margin: 0, line: 0.25, state: "won_half", payoutMultiplier: 0.5 },
      { margin: -1, line: 0.25, state: "lost_full", payoutMultiplier: -1 },
      { margin: 2, line: -0.75, state: "won_full", payoutMultiplier: 1 },
      { margin: 1, line: -0.75, state: "won_half", payoutMultiplier: 0.5 },
      { margin: 0, line: -0.75, state: "lost_full", payoutMultiplier: -1 },
      { margin: 0, line: 0.75, state: "won_full", payoutMultiplier: 1 },
      { margin: -1, line: 0.75, state: "lost_half", payoutMultiplier: -0.5 },
      { margin: -2, line: 0.75, state: "lost_full", payoutMultiplier: -1 },
      { margin: 2, line: -1.25, state: "won_full", payoutMultiplier: 1 },
      { margin: 1, line: -1.25, state: "lost_half", payoutMultiplier: -0.5 },
      { margin: 0, line: -1.25, state: "lost_full", payoutMultiplier: -1 },
      { margin: 0, line: 1.25, state: "won_full", payoutMultiplier: 1 },
      { margin: -1, line: 1.25, state: "won_half", payoutMultiplier: 0.5 },
      { margin: -2, line: 1.25, state: "lost_full", payoutMultiplier: -1 },
      { margin: 3, line: -1.75, state: "won_full", payoutMultiplier: 1 },
      { margin: 2, line: -1.75, state: "won_half", payoutMultiplier: 0.5 },
      { margin: 1, line: -1.75, state: "lost_full", payoutMultiplier: -1 },
      { margin: -1, line: 1.75, state: "won_full", payoutMultiplier: 1 },
      { margin: -2, line: 1.75, state: "lost_half", payoutMultiplier: -0.5 },
      { margin: -3, line: 1.75, state: "lost_full", payoutMultiplier: -1 },
    ];

    for (const tc of cases) {
      const result = evaluateAsianHandicapQuarterState(tc.margin, tc.line);
      expect(result.state).toBe(tc.state);
      expect(result.payoutMultiplier).toBe(tc.payoutMultiplier);
      expect(result.label.length).toBeGreaterThan(3);
      expect(containsForbiddenFd16Term(result.label)).toBe(false);
    }

    const nonFinite = evaluateAsianHandicapQuarterState(Number.NaN, -0.75);
    expect(nonFinite.state).toBe("push");
    expect(nonFinite.payoutMultiplier).toBe(0);
  });
});

describe("computeResidualProjection (min 0, 2, 15, 60, 90 y 0 NaN)", () => {
  it("ancla al valor prepartido en min 0 y suaviza primeros minutos sin explosiones", () => {
    const min0 = computeResidualProjection({
      actualValue: 0,
      targetLine: 2.5,
      elapsedMinutes: 0,
      totalMinutes: 90,
      preMatchExpected: 2.6,
    });
    expect(min0.projectedFinal).toBe(2.6);
    expect(min0.remainingNeeded).toBe(2.5);
    expect(min0.remainingMinutes).toBe(90);
    expect(min0.paceRatio).toBe(1.04);

    const min2EarlyGoal = computeResidualProjection({
      actualValue: 1,
      targetLine: 2.5,
      elapsedMinutes: 2,
      totalMinutes: 90,
      preMatchExpected: 2.6,
    });
    expect(min2EarlyGoal.projectedFinal).toBeGreaterThan(2.6);
    expect(min2EarlyGoal.projectedFinal).toBeLessThan(5.5);
    expect(min2EarlyGoal.remainingNeeded).toBe(1.5);
    expect(min2EarlyGoal.remainingMinutes).toBe(88);
  });

  it("evoluciona de forma monotona en min 15, 60 y 90 y nunca emite NaN ni Infinity", () => {
    const min15Quiet = computeResidualProjection({
      actualValue: 0,
      targetLine: 2.5,
      elapsedMinutes: 15,
      totalMinutes: 90,
      preMatchExpected: 2.6,
    });
    expect(min15Quiet.projectedFinal).toBeLessThan(2.6);
    expect(min15Quiet.projectedFinal).toBeGreaterThan(1.2);
    expect(min15Quiet.remainingMinutes).toBe(75);

    const min60OnTrack = computeResidualProjection({
      actualValue: 2,
      targetLine: 2.5,
      elapsedMinutes: 60,
      totalMinutes: 90,
      preMatchExpected: 2.6,
    });
    expect(min60OnTrack.projectedFinal).toBeGreaterThan(2.6);
    expect(min60OnTrack.projectedFinal).toBeLessThan(3.5);
    expect(min60OnTrack.remainingNeeded).toBe(0.5);
    expect(min60OnTrack.remainingMinutes).toBe(30);
    expect(min60OnTrack.paceRatio).toBeGreaterThan(1);

    const min90Final = computeResidualProjection({
      actualValue: 3,
      targetLine: 2.5,
      elapsedMinutes: 90,
      totalMinutes: 90,
      preMatchExpected: 2.6,
    });
    expect(min90Final.projectedFinal).toBe(3);
    expect(min90Final.remainingNeeded).toBe(0);
    expect(min90Final.remainingMinutes).toBe(0);
    expect(min90Final.paceRatio).toBe(1.2);

    const degenerateInputs = [
      {
        actualValue: Number.NaN,
        targetLine: Number.POSITIVE_INFINITY,
        elapsedMinutes: -10,
        totalMinutes: 0,
        preMatchExpected: Number.NaN,
      },
      {
        actualValue: 0,
        targetLine: 0,
        elapsedMinutes: 135,
        totalMinutes: -90,
        preMatchExpected: null,
      },
      {
        actualValue: 22,
        targetLine: 24.5,
        elapsedMinutes: 36,
        totalMinutes: 48,
        preMatchExpected: 26,
      },
    ];

    for (const input of degenerateInputs) {
      const res = computeResidualProjection(input);
      expect(Number.isFinite(res.projectedFinal)).toBe(true);
      expect(Number.isFinite(res.remainingNeeded)).toBe(true);
      expect(Number.isFinite(res.remainingMinutes)).toBe(true);
      expect(Number.isFinite(res.paceRatio)).toBe(true);
    }
  });

  it("calcula remainingNeeded con signo correcto para líneas de hándicap negativas y positivas", () => {
    const negHandicap = computeResidualProjection({
      actualValue: 0,
      targetLine: -0.75,
      elapsedMinutes: 60,
      totalMinutes: 90,
      preMatchExpected: 0.5,
      direction: "handicap",
    });
    expect(negHandicap.remainingNeeded).toBe(0.75);

    const posHandicapCovering = computeResidualProjection({
      actualValue: -1,
      targetLine: 1.5,
      elapsedMinutes: 60,
      totalMinutes: 90,
      preMatchExpected: -0.5,
      direction: "handicap",
    });
    expect(posHandicapCovering.remainingNeeded).toBe(0);

    const posHandicapBehind = computeResidualProjection({
      actualValue: -2,
      targetLine: 1.5,
      elapsedMinutes: 60,
      totalMinutes: 90,
      preMatchExpected: -0.5,
      direction: "handicap",
    });
    expect(posHandicapBehind.remainingNeeded).toBe(0.5);
  });
});

describe("detectStarterOnBench", () => {
  const confirmedElevenHome = [
    { name: "Luis Malagón" },
    { name: "Israel Reyes" },
    { name: "Sebastián Cáceres" },
    { name: "Ramón Juárez" },
    { name: "Cristian Borja" },
    { name: "Jonathan dos Santos" },
    { name: "Álvaro Fidalgo" },
    { name: "Alejandro Zendejas" },
    { name: "Diego Valdés" },
    { name: "Brian Rodríguez" },
    { name: "Rodrigo Aguirre" },
  ];

  it("detecta titular_en_banca cuando falta en el XI confirmado o figura en banca", () => {
    const missingFromXi = detectStarterOnBench({
      playerName: "Henry Martín",
      lineups: {
        status: "confirmed",
        homeStarters: confirmedElevenHome,
        awayStarters: [],
      },
    });
    expect(missingFromXi.alert).toBe("titular_en_banca");
    expect(missingFromXi.detail).toContain("Henry Martín");
    expect(containsForbiddenFd16Term(missingFromXi.detail ?? "")).toBe(false);

    const explicitBench = detectStarterOnBench({
      playerName: "H. Martin",
      lineups: {
        status: "confirmed",
        homeStarters: confirmedElevenHome,
        homeBench: [{ name: "Henry Martín" }],
      },
    });
    expect(explicitBench.alert).toBe("titular_en_banca");

    const starterConfirmed = detectStarterOnBench({
      playerName: "A. Fidalgo",
      lineups: {
        status: "confirmed",
        homeStarters: confirmedElevenHome,
      },
    });
    expect(starterConfirmed).toEqual({ alert: null, detail: null });

    const predictedOnly = detectStarterOnBench({
      playerName: "Henry Martín",
      lineups: {
        status: "predicted",
        homeStarters: confirmedElevenHome,
      },
    });
    expect(predictedOnly).toEqual({ alert: null, detail: null });
  });

  it("detecta titular_en_banca desde playerStats en vivo sin falsos positivos", () => {
    const zeroMinutes = detectStarterOnBench({
      playerName: "Lamine Yamal",
      playerStats: [{ player: "Lamine Yamal", side: "home", minutes: 0, shotsOnTarget: 0 }],
      matchMinute: 28,
    });
    expect(zeroMinutes.alert).toBe("titular_en_banca");

    const subFlag = detectStarterOnBench({
      playerName: "Lamine Yamal",
      playerStats: [{ player: "Lamine Yamal", side: "home", substitute: true, minutes: 14 }],
      matchMinute: 74,
    });
    expect(subFlag.alert).toBe("titular_en_banca");

    const activeStarter = detectStarterOnBench({
      playerName: "Lamine Yamal",
      playerStats: [{ player: "Lamine Yamal", side: "home", minutes: 62, shotsOnTarget: 2 }],
      matchMinute: 62,
    });
    expect(activeStarter).toEqual({ alert: null, detail: null });

    expect(detectStarterOnBench({ playerName: null })).toEqual({ alert: null, detail: null });
  });

  it("evita falsos positivos por homónimos Jr/II, nombres compuestos hispanos, monónimos, precedencia starters y status predicted", () => {
    const jrSameFirst = detectStarterOnBench({
      playerName: "Michael Porter Jr.",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "Michael Porter Jr." }],
        homeBench: [{ name: "Michael Beasley Jr." }],
      },
    });
    expect(jrSameFirst).toEqual({ alert: null, detail: null });

    const jrWithoutStarterEntry = detectStarterOnBench({
      playerName: "Michael Porter Jr.",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "Nikola Jokic" }],
        homeBench: [{ name: "Michael Beasley Jr." }],
      },
    });
    expect(jrWithoutStarterEntry).toEqual({ alert: null, detail: null });

    const hispanicCompound = detectStarterOnBench({
      playerName: "José Juan Macías",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "José Juan Macías" }],
        homeBench: [{ name: "José Juan Vázquez" }],
      },
    });
    expect(hispanicCompound).toEqual({ alert: null, detail: null });

    const hispanicCompoundNoStarter = detectStarterOnBench({
      playerName: "José Juan Macías",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "Roberto Alvarado" }],
        homeBench: [{ name: "José Juan Vázquez" }],
      },
    });
    expect(hispanicCompoundNoStarter).toEqual({ alert: null, detail: null });

    const mononymBench = detectStarterOnBench({
      playerName: "Gabriel Magalhães",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "Gabriel Magalhães" }],
        awayBench: [{ name: "Gabriel" }],
      },
    });
    expect(mononymBench).toEqual({ alert: null, detail: null });

    const initialBenchExactStarter = detectStarterOnBench({
      playerName: "Jonathan Rodríguez",
      lineups: {
        status: "confirmed",
        homeStarters: [{ name: "Jonathan Rodríguez" }],
        awayBench: [{ name: "J. Rodríguez" }],
      },
    });
    expect(initialBenchExactStarter).toEqual({ alert: null, detail: null });

    const predictedBench = detectStarterOnBench({
      playerName: "Henry Martín",
      lineups: {
        status: "predicted",
        homeBench: [{ name: "Henry Martín" }],
      },
    });
    expect(predictedBench).toEqual({ alert: null, detail: null });
  });
});

describe("loadUserLiveTrackedPicks, hitos #hash Web Push y ruta /api/me/live-picks", () => {
  it("cruza picks simples, parlays, asiaticos, props en banca, deduplica #hash en live_feed_cache y evita fugas FD-16", async () => {
    const userId = await seedMemberWithPass("tracker_socio");
    const otherUserId = await seedMemberWithPass("tracker_otro");

    const gameLive = "mx-2026-j17-america-chivas";
    const gameFinal = "epl-2026-md12-arsenal-chelsea";

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-ah-075",
        gameId: gameLive,
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        pickLabel: "América -0.75",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "asian_handicap",
        pickSelection: "home_-0.75",
        pickLine: -0.75,
        units: 1.5,
        userDecimal: 1.95,
        fairDecimal: 1.88,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-over-25",
        gameId: gameLive,
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        pickLabel: "Más de 2.5 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_2.5",
        pickLine: 2.5,
        units: 1,
        userDecimal: 1.9,
        fairDecimal: 1.82,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-prop-bench",
        gameId: gameLive,
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        pickLabel: "Henry Martín · Más de 1.5 tiros a puerta",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "player_shots_on_target",
        pickSelection: "player:henry_martin:over_1.5",
        pickLine: 1.5,
        units: 1,
        userDecimal: 2.1,
        fairDecimal: 1.98,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-final-over",
        gameId: gameFinal,
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Chelsea",
        pickLabel: "Más de 1.5 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_1.5",
        pickLine: 1.5,
        units: 1,
        userDecimal: 1.55,
        fairDecimal: 1.5,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "parlay:combo-live-1",
        gameId: gameLive,
        leagueLabel: "Combinada Multi-Liga",
        matchLabel: "2 selecciones",
        pickLabel: "Más de 2.5 goles + Más de 8.5 córners",
        origin: "Parlay Combinado",
        pickKind: "parlay",
        parlayLegs: [
          {
            pickId: "leg-goals",
            gameId: gameLive,
            leagueLabel: "Liga MX",
            matchLabel: "América vs Chivas",
            pickLabel: "Más de 2.5 goles",
            market: "totals",
            selection: "over_2.5",
            line: 2.5,
            p: 0.56,
            fairDecimal: 1.79,
            kickoffAt: KICKOFF_AT.toISOString(),
          },
          {
            pickId: "leg-corners",
            gameId: gameLive,
            leagueLabel: "Liga MX",
            matchLabel: "América vs Chivas",
            pickLabel: "Más de 8.5 córners",
            market: "corners",
            selection: "over_8.5",
            line: 8.5,
            p: 0.54,
            fairDecimal: 1.85,
            kickoffAt: KICKOFF_AT.toISOString(),
          },
        ],
        units: 1,
        userDecimal: 3.3,
        fairDecimal: 3.1,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    const settledSeed = await sealPick(
      db,
      userId,
      {
        pickId: "pick-already-settled",
        gameId: gameFinal,
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Chelsea",
        pickLabel: "Arsenal gana",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "h2h",
        pickSelection: "home",
        units: 1,
        userDecimal: 1.85,
        fairDecimal: 1.8,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );
    if (settledSeed.ok) {
      await db
        .update(sealedPicks)
        .set({ status: "won", settledAt: LIVE_NOW })
        .where(eq(sealedPicks.id, settledSeed.id));
    }

    await sealPick(
      db,
      otherUserId,
      {
        pickId: "pick-other-user",
        gameId: gameLive,
        leagueLabel: "Liga MX",
        matchLabel: "América vs Chivas",
        pickLabel: "Más de 0.5 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_0.5",
        pickLine: 0.5,
        units: 1,
        userDecimal: 1.12,
        fairDecimal: 1.1,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    const detailLive = makeLiveDetail({
      gameId: gameLive,
      league: "liga-mx",
      phase: "live",
      clock: "62",
      minute: 62,
      homeScore: 2,
      awayScore: 1,
      corners: { home: 4, away: 2 },
      playerStats: [{ player: "Henry Martín", side: "home", minutes: 0, shotsOnTarget: 0 }],
    });
    const detailFinal = makeLiveDetail({
      gameId: gameFinal,
      league: "premier-league",
      phase: "final",
      clock: "FT",
      minute: 90,
      homeScore: 2,
      awayScore: 0,
    });
    const scoreboard: LiveScoreboard = {
      generatedAt: LIVE_NOW.toISOString(),
      sourceFetchedAt: LIVE_NOW.toISOString(),
      active: true,
      nextPollSeconds: 15,
      notice: null,
      entries: [detailLive.entry, detailFinal.entry],
    };
    const matchDetails = new Map<string, LiveMatchDetail>([
      [gameLive, detailLive],
      [gameFinal, detailFinal],
    ]);

    const tracked = await loadUserLiveTrackedPicks(db, userId, {
      now: LIVE_NOW,
      scoreboard,
      matchDetails,
      dataset: EMPTY_DATASET,
    });

    expect(tracked.nextPollSeconds).toBe(15);
    expect(tracked.items).toHaveLength(5);
    expect(tracked.items.some((item) => item.pickId === "pick-already-settled")).toBe(false);
    expect(tracked.items.some((item) => item.pickId === "pick-other-user")).toBe(false);

    const asianItem = tracked.items.find((item) => item.pickId === "pick-ah-075");
    expect(asianItem).toBeDefined();
    expect(asianItem?.actualValue).toBe(1);
    expect(asianItem?.targetLine).toBe(-0.75);
    expect(asianItem?.asianState).toBe("won_half");
    expect(asianItem?.payoutMultiplier).toBe(0.5);

    const overItem = tracked.items.find((item) => item.pickId === "pick-over-25");
    expect(overItem?.actualValue).toBe(3);
    expect(overItem?.hitLocked).toBe(true);
    expect(overItem?.milestoneCandidates.some((m) => m.milestone === "hit_locked")).toBe(true);

    const propItem = tracked.items.find((item) => item.pickId === "pick-prop-bench");
    expect(propItem?.starterAlert).toBe("titular_en_banca");
    expect(propItem?.milestoneCandidates.some((m) => m.milestone === "starter_on_bench")).toBe(true);

    const parlayItem = tracked.items.find((item) => item.pickId === "parlay:combo-live-1");
    expect(parlayItem?.pickKind).toBe("parlay");
    expect(parlayItem?.legs).toHaveLength(2);
    expect(parlayItem?.actualValue).toBe(1);
    expect(parlayItem?.targetLine).toBe(2);
    expect(parlayItem?.milestoneCandidates.some((m) => m.milestone === "half_way")).toBe(true);

    const finalItem = tracked.items.find((item) => item.pickId === "pick-final-over");
    expect(finalItem?.phase).toBe("final");
    expect(finalItem?.milestoneCandidates.some((m) => m.milestone === "final_settled")).toBe(true);

    const serialized = JSON.stringify(tracked);
    expect(serialized.toLowerCase()).not.toContain("bzzoiro");
    expect(serialized.toLowerCase()).not.toContain("sofascore");
    expect(serialized.toLowerCase()).not.toContain("sportmonks");

    const h1 = buildLivePickMilestoneHash("pick-over-25", "hit_locked", "locked:2.5");
    const h2 = buildLivePickMilestoneHash("pick-over-25", "hit_locked", "locked:2.5");
    const h3 = buildLivePickMilestoneHash("pick-over-25", "final_settled", "final:3:hit");
    expect(h1).toMatch(/^[0-9a-f]{12}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);

    const sentPayloads: Array<{ userIds: readonly string[]; payload: WebPushMessagePayload }> = [];
    const sendPushSpy = vi.fn(
      async (
        _db: Db,
        userIds: readonly string[],
        _topic: "picks" | "live" | "social",
        payload: WebPushMessagePayload,
        _fetchImpl?: typeof fetch,
      ) => {
        void _fetchImpl;
        sentPayloads.push({ userIds, payload });
        return { sent: userIds.length, failed: 0, pruned: 0 };
      },
    );

    const unconfiguredReport = await dispatchLivePickMilestonePushes(db, {
      now: LIVE_NOW,
      userIds: [userId],
      scoreboard,
      matchDetails,
      dataset: EMPTY_DATASET,
      forceConfiguredCheck: false,
      sendPushImpl: sendPushSpy,
    });
    expect(unconfiguredReport.configured).toBe(false);
    expect(sendPushSpy).not.toHaveBeenCalled();

    const firstDispatch = await dispatchLivePickMilestonePushes(db, {
      now: LIVE_NOW,
      userIds: [userId],
      scoreboard,
      matchDetails,
      dataset: EMPTY_DATASET,
      forceConfiguredCheck: true,
      sendPushImpl: sendPushSpy,
    });

    expect(firstDispatch.configured).toBe(true);
    expect(firstDispatch.usersChecked).toBe(1);
    expect(firstDispatch.picksEvaluated).toBe(5);
    expect(firstDispatch.milestonesDetected).toBeGreaterThanOrEqual(4);
    expect(firstDispatch.pushesSent).toBe(firstDispatch.milestonesDetected);
    expect(firstDispatch.duplicatesSkipped).toBe(0);

    for (const entry of sentPayloads) {
      expect(entry.userIds).toEqual([userId]);
      expect(entry.payload.url).toMatch(/#pick-[0-9a-f]{12}$/);
      expect(containsForbiddenFd16Term(entry.payload.title)).toBe(false);
      expect(containsForbiddenFd16Term(entry.payload.body)).toBe(false);
    }

    const expectedHitUrlSuffix = `#pick-${h1}`;
    const expectedHalfWaySuffix = `#pick-${buildLivePickMilestoneHash("parlay:combo-live-1", "half_way", "50pct:2")}`;
    const expectedBenchSuffix = `#pick-${buildLivePickMilestoneHash("pick-prop-bench", "starter_on_bench", "bench")}`;
    const expectedFinalSuffix = `#pick-${buildLivePickMilestoneHash("pick-final-over", "final_settled", "final:2:hit")}`;
    expect(sentPayloads.some((item) => item.payload.url?.endsWith(expectedHitUrlSuffix))).toBe(true);
    expect(sentPayloads.some((item) => item.payload.url?.endsWith(expectedHalfWaySuffix))).toBe(true);
    expect(sentPayloads.some((item) => item.payload.url?.endsWith(expectedBenchSuffix))).toBe(true);
    expect(sentPayloads.some((item) => item.payload.url?.endsWith(expectedFinalSuffix))).toBe(true);

    const secondDispatch = await dispatchLivePickMilestonePushes(db, {
      now: LIVE_NOW,
      userIds: [userId],
      scoreboard,
      matchDetails,
      dataset: EMPTY_DATASET,
      forceConfiguredCheck: true,
      sendPushImpl: sendPushSpy,
    });
    expect(secondDispatch.pushesSent).toBe(0);
    expect(secondDispatch.duplicatesSkipped).toBe(firstDispatch.milestonesDetected);
  });

  it("aplica guardas 401/200, Cache-Control private no-store y watermark en GET /api/me/live-picks", async () => {
    mocks.requireMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }),
    });

    const unauthRes = await livePicksGET(new Request("http://localhost:3000/api/me/live-picks"));
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("cache-control")).toBe("private, no-store");

    const userId = await seedMemberWithPass("route_socio");
    const gameId = "mx-2026-j17-pumas-cruz-azul";
    await sealPick(
      db,
      userId,
      {
        pickId: "route-pick-over-15",
        gameId,
        leagueLabel: "Liga MX",
        matchLabel: "Pumas vs Cruz Azul",
        pickLabel: "Más de 1.5 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_1.5",
        pickLine: 1.5,
        units: 1,
        userDecimal: 1.45,
        fairDecimal: 1.4,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    const detail = makeLiveDetail({
      gameId,
      league: "liga-mx",
      phase: "live",
      clock: "54",
      minute: 54,
      homeScore: 1,
      awayScore: 1,
    });
    const scoreboard: LiveScoreboard = {
      generatedAt: LIVE_NOW.toISOString(),
      sourceFetchedAt: LIVE_NOW.toISOString(),
      active: true,
      nextPollSeconds: 15,
      notice: null,
      entries: [detail.entry],
    };

    const member: AuthenticatedMember = {
      db,
      userId,
      email: "route_socio@pitchlab.test",
      emailVerified: true,
      authUserId: "auth-route_socio",
    };
    mocks.requireMember.mockResolvedValueOnce(member);
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_ACTIVE_MEMBER);
    mocks.getLiveScoreboard.mockResolvedValueOnce(scoreboard);
    mocks.getLiveMatchDetail.mockResolvedValueOnce(detail);

    const okRes = await livePicksGET(
      new Request("http://localhost:3000/api/me/live-picks?limit=10"),
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("cache-control")).toBe("private, no-store");
    expect(okRes.headers.get("x-content-type-options")).toBe("nosniff");

    const watermark = okRes.headers.get(MEMBER_WATERMARK_HEADER);
    expect(watermark).toBeTruthy();
    expect(verifyMemberWatermark(userId, watermark ?? "")).toBe(true);

    const body: UserLiveTrackedPicksPayload = await okRes.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.pickId).toBe("route-pick-over-15");
    expect(body.items[0]?.actualValue).toBe(2);
    expect(body.items[0]?.hitLocked).toBe(true);
    expect(body.nextPollSeconds).toBe(15);
  });

  it("evita hit_locked prematuro en Over 2.75, corrige projectedHitLegs en Under 2.5 y hándicap, y reclama caché atómicamente", async () => {
    const userId = await seedMemberWithPass("signs_socio");
    const gameQuiet = "mx-2026-j18-quiet-0-0";
    const gameBlowout = "mx-2026-j18-blowout-3-0";
    const gameOverHalf = "mx-2026-j18-over275-half";
    const gameOverFull = "mx-2026-j18-over275-full";
    const gameAwayLead = "mx-2026-j18-away-0-1";

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-over-275-half",
        gameId: gameOverHalf,
        leagueLabel: "Liga MX",
        matchLabel: "Tigres vs Toluca",
        pickLabel: "Más de 2.75 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_2.75",
        pickLine: 2.75,
        units: 1,
        userDecimal: 2.02,
        fairDecimal: 1.94,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-over-275-full",
        gameId: gameOverFull,
        leagueLabel: "Liga MX",
        matchLabel: "León vs Pachuca",
        pickLabel: "Más de 2.75 goles",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "totals",
        pickSelection: "over_2.75",
        pickLine: 2.75,
        units: 1,
        userDecimal: 2.02,
        fairDecimal: 1.94,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-ah-neg-075-00",
        gameId: gameQuiet,
        leagueLabel: "Liga MX",
        matchLabel: "Atlas vs Santos",
        pickLabel: "Atlas -0.75",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "asian_handicap",
        pickSelection: "home_-0.75",
        pickLine: -0.75,
        units: 1,
        userDecimal: 1.95,
        fairDecimal: 1.9,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "pick-ah-pos-15-01",
        gameId: gameAwayLead,
        leagueLabel: "Liga MX",
        matchLabel: "Puebla vs Monterrey",
        pickLabel: "Puebla +1.5",
        origin: "Spacetime Suite",
        pickKind: "single",
        pickMarket: "asian_handicap",
        pickSelection: "home_+1.5",
        pickLine: 1.5,
        units: 1,
        userDecimal: 1.85,
        fairDecimal: 1.8,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "parlay:under-and-ah-winning",
        gameId: gameQuiet,
        leagueLabel: "Combinada",
        matchLabel: "2 selecciones",
        pickLabel: "Menos de 2.5 goles + Puebla +1.5",
        origin: "Parlay Combinado",
        pickKind: "parlay",
        parlayLegs: [
          {
            pickId: "leg-under-winning",
            gameId: gameQuiet,
            leagueLabel: "Liga MX",
            matchLabel: "Atlas vs Santos",
            pickLabel: "Menos de 2.5 goles",
            market: "totals",
            selection: "under_2.5",
            line: 2.5,
            p: 0.54,
            fairDecimal: 1.85,
            kickoffAt: KICKOFF_AT.toISOString(),
          },
          {
            pickId: "leg-ah-covering",
            gameId: gameAwayLead,
            leagueLabel: "Liga MX",
            matchLabel: "Puebla vs Monterrey",
            pickLabel: "Puebla +1.5",
            market: "asian_handicap",
            selection: "home_+1.5",
            line: 1.5,
            p: 0.56,
            fairDecimal: 1.79,
            kickoffAt: KICKOFF_AT.toISOString(),
          },
        ],
        units: 1,
        userDecimal: 3.1,
        fairDecimal: 2.95,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    await sealPick(
      db,
      userId,
      {
        pickId: "parlay:under-losing",
        gameId: gameBlowout,
        leagueLabel: "Combinada",
        matchLabel: "1 selección",
        pickLabel: "Menos de 2.5 goles",
        origin: "Parlay Combinado",
        pickKind: "parlay",
        parlayLegs: [
          {
            pickId: "leg-under-busted",
            gameId: gameBlowout,
            leagueLabel: "Liga MX",
            matchLabel: "América vs Juárez",
            pickLabel: "Menos de 2.5 goles",
            market: "totals",
            selection: "under_2.5",
            line: 2.5,
            p: 0.52,
            fairDecimal: 1.92,
            kickoffAt: KICKOFF_AT.toISOString(),
          },
        ],
        units: 1,
        userDecimal: 1.95,
        fairDecimal: 1.92,
        kickoffAt: KICKOFF_AT,
      },
      SEAL_AT,
    );

    const details = [
      makeLiveDetail({
        gameId: gameQuiet,
        league: "liga-mx",
        phase: "live",
        clock: "60",
        minute: 60,
        homeScore: 0,
        awayScore: 0,
      }),
      makeLiveDetail({
        gameId: gameBlowout,
        league: "liga-mx",
        phase: "live",
        clock: "60",
        minute: 60,
        homeScore: 3,
        awayScore: 0,
      }),
      makeLiveDetail({
        gameId: gameOverHalf,
        league: "liga-mx",
        phase: "live",
        clock: "65",
        minute: 65,
        homeScore: 2,
        awayScore: 1,
      }),
      makeLiveDetail({
        gameId: gameOverFull,
        league: "liga-mx",
        phase: "live",
        clock: "78",
        minute: 78,
        homeScore: 3,
        awayScore: 1,
      }),
      makeLiveDetail({
        gameId: gameAwayLead,
        league: "liga-mx",
        phase: "live",
        clock: "60",
        minute: 60,
        homeScore: 0,
        awayScore: 1,
      }),
    ];

    const scoreboard: LiveScoreboard = {
      generatedAt: LIVE_NOW.toISOString(),
      sourceFetchedAt: LIVE_NOW.toISOString(),
      active: true,
      nextPollSeconds: 15,
      notice: null,
      entries: details.map((d) => d.entry),
    };
    const matchDetails = new Map<string, LiveMatchDetail>(details.map((d) => [d.gameId, d]));

    const tracked = await loadUserLiveTrackedPicks(db, userId, {
      now: LIVE_NOW,
      scoreboard,
      matchDetails,
      dataset: EMPTY_DATASET,
    });

    const over275Half = tracked.items.find((item) => item.pickId === "pick-over-275-half");
    expect(over275Half?.asianState).toBe("won_half");
    expect(over275Half?.hitLocked).toBe(false);
    expect(over275Half?.milestoneCandidates.some((m) => m.milestone === "hit_locked")).toBe(false);

    const over275Full = tracked.items.find((item) => item.pickId === "pick-over-275-full");
    expect(over275Full?.asianState).toBe("won_full");
    expect(over275Full?.hitLocked).toBe(true);
    expect(over275Full?.milestoneCandidates.some((m) => m.milestone === "hit_locked")).toBe(true);

    const ahNeg = tracked.items.find((item) => item.pickId === "pick-ah-neg-075-00");
    expect(ahNeg?.remainingNeeded).toBe(0.75);

    const ahPos = tracked.items.find((item) => item.pickId === "pick-ah-pos-15-01");
    expect(ahPos?.remainingNeeded).toBe(0);

    const parlayWin = tracked.items.find((item) => item.pickId === "parlay:under-and-ah-winning");
    expect(parlayWin?.projectedFinal).toBe(2);

    const parlayLose = tracked.items.find((item) => item.pickId === "parlay:under-losing");
    expect(parlayLose?.projectedFinal).toBe(0);

    const atomicKey = "push:livepick:signs_socio:abcdef123456";
    const [claimA, claimB] = await Promise.all([
      claimLiveCacheSlotOnce(db, atomicKey, { sentAt: LIVE_NOW.toISOString() }, LIVE_NOW, 60_000),
      claimLiveCacheSlotOnce(db, atomicKey, { sentAt: LIVE_NOW.toISOString() }, LIVE_NOW, 60_000),
    ]);
    expect([claimA, claimB].filter(Boolean)).toHaveLength(1);

    const claimWhileFresh = await claimLiveCacheSlotOnce(
      db,
      atomicKey,
      { sentAt: LIVE_NOW.toISOString() },
      new Date(LIVE_NOW.getTime() + 30_000),
      60_000,
    );
    expect(claimWhileFresh).toBe(false);

    const claimAfterExpiry = await claimLiveCacheSlotOnce(
      db,
      atomicKey,
      { sentAt: LIVE_NOW.toISOString() },
      new Date(LIVE_NOW.getTime() + 61_000),
      60_000,
    );
    expect(claimAfterExpiry).toBe(true);
  });
});
