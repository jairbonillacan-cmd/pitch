import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fc from "fast-check";
import { NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@pitchlab/db";
import {
  checkBetBuilderCompatibility,
  checkBetBuilderPairCompatibility,
  evaluateBetBuilder,
  type BetBuilderBlockCode,
  type BetBuilderCompatibilityOptions,
  type BetBuilderLegInput,
} from "@pitchlab/ui/picks-catalog";
import type { AuthenticatedMember } from "../src/server/session-user";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getViewerAccess: vi.fn(),
  hasActivePaseTotal: vi.fn(),
  incrementPgRateBucket: vi.fn(),
  isAdminEmail: vi.fn(),
  recordSecurityAbuseEvent: vi.fn(),
  requireAdmin: vi.fn(),
  requireMember: vi.fn(),
  requireSocialMember: vi.fn(),
  requireStep1Member: vi.fn(),
  revokeUserActiveSessions: vi.fn(),
  serverDb: vi.fn(),
  signupCompleted: vi.fn(),
}));

vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  hasActivePaseTotal: mocks.hasActivePaseTotal,
  incrementPgRateBucket: mocks.incrementPgRateBucket,
  recordSecurityAbuseEvent: mocks.recordSecurityAbuseEvent,
  revokeUserActiveSessions: mocks.revokeUserActiveSessions,
  signupCompleted: mocks.signupCompleted,
}));

vi.mock("../src/server/auth", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("../src/server/session-user", () => ({
  isAdminEmail: mocks.isAdminEmail,
  requireAdmin: mocks.requireAdmin,
  requireMember: mocks.requireMember,
  requireStep1Member: mocks.requireStep1Member,
  serverDb: mocks.serverDb,
}));

vi.mock("../src/server/social", () => ({
  requireSocialMember: mocks.requireSocialMember,
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

import { applyMigrations, eq, sealedPicks, users } from "@pitchlab/db";
import { resetScrapingVelocityForTests, withSessionRead } from "../src/server/api-guards";
import { resetRateLimitsForTests, setRateLimitDbForTests } from "../src/server/request-security";

const ENV_BACKUP = { ...process.env };
const VELOCITY_MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const VELOCITY_ADMIN_ID = "44444444-4444-4444-8444-444444444444";

function buildVelocityMember(db: Db): AuthenticatedMember {
  return {
    db,
    userId: VELOCITY_MEMBER_ID,
    email: "fsm.velocity@pitchlab.mx",
    emailVerified: true,
    authUserId: "auth_fsm_velocity_1",
  };
}

const ACCOUNT_FULL_ACCESS: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const pgRateCounts = new Map<string, number>();

let pgClient: PGlite;
let sharedDb: Db;
let sealedUserCounter = 0;

function extractErrorDetail(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  if (typeof err === "object" && err !== null && "cause" in err) {
    const causeVal = err.cause;
    const causeText = causeVal instanceof Error ? causeVal.message : String(causeVal ?? "");
    return `${base} ${causeText}`;
  }
  return base;
}

async function expectImmutableTriggerError(
  action: Promise<unknown>,
  expectedCode: RegExp,
): Promise<void> {
  let caught: unknown = null;
  try {
    await action;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  const detail = extractErrorDetail(caught);
  expect(detail).toMatch(/sealed_picks_immutable/);
  expect(detail).toMatch(expectedCode);
}

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  await pgClient.exec("SET pitchlab.allow_historical_seed = 'off'");
  sharedDb = drizzle(pgClient);
});

beforeEach(async () => {
  process.env = { ...ENV_BACKUP };
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.DATABASE_URL;
  delete process.env.PITCHLAB_TRUSTED_PROXY;
  process.env.BETTER_AUTH_SECRET = "secreto-test-state-machines-fc-32-chars!!";

  pgRateCounts.clear();
  resetRateLimitsForTests();
  setRateLimitDbForTests(null);
  resetScrapingVelocityForTests();

  mocks.getAuth.mockReturnValue({ api: { getSession: vi.fn() } });
  mocks.getViewerAccess.mockResolvedValue(ACCOUNT_FULL_ACCESS);
  mocks.hasActivePaseTotal.mockResolvedValue(true);
  mocks.isAdminEmail.mockReturnValue(false);
  mocks.recordSecurityAbuseEvent.mockResolvedValue(undefined);
  mocks.revokeUserActiveSessions.mockResolvedValue(1);
  const velocityMember = buildVelocityMember(sharedDb);
  mocks.serverDb.mockReturnValue(sharedDb);
  mocks.signupCompleted.mockResolvedValue(true);
  mocks.requireMember.mockResolvedValue(velocityMember);
  mocks.requireStep1Member.mockResolvedValue(velocityMember);
  mocks.requireSocialMember.mockResolvedValue(velocityMember);
  mocks.requireAdmin.mockResolvedValue({
    db: sharedDb,
    userId: VELOCITY_ADMIN_ID,
    email: "founder@pitchlab.mx",
  });
  mocks.incrementPgRateBucket.mockImplementation(
    async (
      _db: Db,
      params: { bucket: string; subjectKey: string; windowMs: number; nowMs?: number },
    ) => {
      const key = `${params.bucket}:${params.subjectKey}`;
      const hits = (pgRateCounts.get(key) ?? 0) + 1;
      pgRateCounts.set(key, hits);
      const nowMs = params.nowMs ?? Date.now();
      return { hits, resetAtMs: nowMs + params.windowMs };
    },
  );

  await pgClient.exec("SET pitchlab.allow_historical_seed = 'off'");
});

afterEach(() => {
  process.env = { ...ENV_BACKUP };
  resetRateLimitsForTests();
  setRateLimitDbForTests(null);
  resetScrapingVelocityForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

afterAll(async () => {
  await pgClient?.close();
});

type TerminalPickStatus = "won" | "lost" | "void";
type SealedPickStatus = "pending" | TerminalPickStatus;
type SealedColumnField =
  | "units"
  | "userDecimal"
  | "fairDecimal"
  | "pickLabel"
  | "matchLabel"
  | "sealHash"
  | "kickoffAt"
  | "sealedAt";
type SettledMutationField = "status" | "clvPct" | "closingDecimal" | "settledAt" | "note" | "fairDecimal";

interface SealedPickSnapshot {
  readonly id: string;
  readonly pickId: string;
  readonly gameId: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly origin: string;
  readonly units: string;
  readonly userDecimal: string;
  readonly fairDecimal: string;
  readonly sealHash: string;
  readonly sealedAtMs: number;
  readonly kickoffAtMs: number;
  status: SealedPickStatus;
  clvPct: string | null;
  closingDecimal: string | null;
  note: string | null;
}

interface SealedPicksModel {
  rows: Map<string, SealedPickSnapshot>;
  rejectedPostKickoffCount: number;
  rejectedPreSettledInsertCount: number;
  rejectedDeleteCount: number;
  rejectedSealedMutationCount: number;
  rejectedSettledMutationCount: number;
}

interface SealedPicksReal {
  readonly db: Db;
  readonly userId: string;
  nextSeq: number;
}

async function assertSealedDbMatchesModel(
  model: SealedPicksModel,
  real: SealedPicksReal,
): Promise<void> {
  const dbRows = await real.db
    .select()
    .from(sealedPicks)
    .where(eq(sealedPicks.userId, real.userId));
  expect(dbRows).toHaveLength(model.rows.size);

  for (const row of dbRows) {
    const expected = model.rows.get(row.id);
    expect(expected).toBeDefined();
    expect(row.pickId).toBe(expected!.pickId);
    expect(row.gameId).toBe(expected!.gameId);
    expect(row.leagueLabel).toBe(expected!.leagueLabel);
    expect(row.matchLabel).toBe(expected!.matchLabel);
    expect(row.pickLabel).toBe(expected!.pickLabel);
    expect(row.origin).toBe(expected!.origin);
    expect(row.units).toBe(expected!.units);
    expect(row.userDecimal).toBe(expected!.userDecimal);
    expect(row.fairDecimal).toBe(expected!.fairDecimal);
    expect(row.sealHash).toBe(expected!.sealHash);
    expect(row.sealedAt.getTime()).toBe(expected!.sealedAtMs);
    expect(row.kickoffAt.getTime()).toBe(expected!.kickoffAtMs);
    expect(row.sealedAt.getTime()).toBeLessThan(row.kickoffAt.getTime());
    expect(row.status).toBe(expected!.status);
    expect(row.clvPct).toBe(expected!.clvPct);
    expect(row.closingDecimal).toBe(expected!.closingDecimal);
    expect(row.note).toBe(expected!.note);
  }
}

class InsertPreKickoff implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(
    private readonly hoursAhead: number,
    private readonly unitsHalfSteps: number,
    private readonly userDecimalMilli: number,
    private readonly fairDecimalMilli: number,
  ) {}

  check(m: Readonly<SealedPicksModel>): boolean {
    return m.rows.size < 8;
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    r.nextSeq += 1;
    const seq = r.nextSeq;
    const pickId = `fsm-pre-${seq}`;
    const gameId = `fsm-game-${seq}`;
    const units = (this.unitsHalfSteps / 2).toFixed(2);
    const userDecimal = (this.userDecimalMilli / 1000).toFixed(3);
    const fairDecimal = (this.fairDecimalMilli / 1000).toFixed(3);
    const sealHash = seq.toString(16).padStart(64, "a");
    const kickoffAt = new Date(Date.now() + this.hoursAhead * 3_600_000);

    const [inserted] = await r.db
      .insert(sealedPicks)
      .values({
        userId: r.userId,
        pickId,
        gameId,
        leagueLabel: "Liga MX",
        matchLabel: `Club Local ${seq} vs Club Visita ${seq}`,
        pickLabel: `Local gana ${seq}`,
        origin: "Spacetime v5.1",
        units,
        userDecimal,
        fairDecimal,
        sealHash,
        kickoffAt,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted!.status).toBe("pending");
    expect(inserted!.sealedAt.getTime()).toBeLessThan(inserted!.kickoffAt.getTime());

    m.rows.set(inserted!.id, {
      id: inserted!.id,
      pickId,
      gameId,
      leagueLabel: "Liga MX",
      matchLabel: `Club Local ${seq} vs Club Visita ${seq}`,
      pickLabel: `Local gana ${seq}`,
      origin: "Spacetime v5.1",
      units,
      userDecimal,
      fairDecimal,
      sealHash,
      sealedAtMs: inserted!.sealedAt.getTime(),
      kickoffAtMs: inserted!.kickoffAt.getTime(),
      status: "pending",
      clvPct: null,
      closingDecimal: null,
      note: null,
    });

    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `InsertPreKickoff(+${this.hoursAhead}h, u=${(this.unitsHalfSteps / 2).toFixed(2)})`;
  }
}

class AttemptPostKickoffInsert implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(private readonly minutesAgo: number) {}

  check(): boolean {
    return true;
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    r.nextSeq += 1;
    const seq = r.nextSeq;
    const pastKickoff = new Date(Date.now() - this.minutesAgo * 60_000);
    const spoofedSealedAt = new Date(pastKickoff.getTime() - 3_600_000);

    await expectImmutableTriggerError(
      r.db.insert(sealedPicks).values({
        userId: r.userId,
        pickId: `fsm-retro-${seq}`,
        gameId: `fsm-retro-game-${seq}`,
        leagueLabel: "Premier League",
        matchLabel: `Retro Local ${seq} vs Retro Visita ${seq}`,
        pickLabel: `Retro pick ${seq}`,
        origin: "Spacetime v5.1",
        units: "1.00",
        userDecimal: "2.100",
        fairDecimal: "1.950",
        sealHash: seq.toString(16).padStart(64, "b"),
        sealedAt: spoofedSealedAt,
        kickoffAt: pastKickoff,
      }),
      /RETROACTIVE_SEALED_PICK_FORBIDDEN/,
    );

    m.rejectedPostKickoffCount += 1;
    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `AttemptPostKickoffInsert(-${this.minutesAgo}m)`;
  }
}

type PreSettledAttackVariant =
  | "status_won"
  | "status_lost"
  | "status_void"
  | "settled_at"
  | "closing_decimal"
  | "clv_pct"
  | "parlay_leg_results";

class AttemptPreSettledInsert implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(
    private readonly hoursAhead: number,
    private readonly variant: PreSettledAttackVariant,
  ) {}

  check(): boolean {
    return true;
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    r.nextSeq += 1;
    const seq = r.nextSeq;
    const futureKickoff = new Date(Date.now() + this.hoursAhead * 3_600_000);
    const now = new Date();
    const base = {
      userId: r.userId,
      pickId: `fsm-presettled-${seq}`,
      gameId: `fsm-presettled-game-${seq}`,
      leagueLabel: "Liga MX",
      matchLabel: `Club A ${seq} vs Club B ${seq}`,
      pickLabel: `Local gana ${seq}`,
      origin: "Spacetime v5.1",
      units: "1.00",
      userDecimal: "2.100",
      fairDecimal: "1.950",
      sealHash: seq.toString(16).padStart(64, "c"),
      sealedAt: now,
      kickoffAt: futureKickoff,
    };

    const payload =
      this.variant === "status_won"
        ? { ...base, status: "won" as const }
        : this.variant === "status_lost"
          ? { ...base, status: "lost" as const }
          : this.variant === "status_void"
            ? { ...base, status: "void" as const }
            : this.variant === "settled_at"
              ? { ...base, settledAt: now }
              : this.variant === "closing_decimal"
                ? { ...base, closingDecimal: "1.950" }
                : this.variant === "clv_pct"
                  ? { ...base, clvPct: "4.20" }
                  : {
                      ...base,
                      parlayLegResults: [
                        {
                          pickId: `leg-${seq}`,
                          gameId: `g-${seq}`,
                          status: "won" as const,
                          homeScore: 2,
                          awayScore: 0,
                          settledAt: now.toISOString(),
                        },
                      ],
                    };

    await expectImmutableTriggerError(
      r.db.insert(sealedPicks).values(payload),
      /PRE_SETTLED_INSERT_FORBIDDEN/,
    );

    m.rejectedPreSettledInsertCount += 1;
    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `AttemptPreSettledInsert(+${this.hoursAhead}h, ${this.variant})`;
  }
}

class AttemptDirectDelete implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(private readonly targetSeed: number) {}

  check(m: Readonly<SealedPicksModel>): boolean {
    return m.rows.size > 0;
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    const entries = Array.from(m.rows.values());
    const target = entries[this.targetSeed % entries.length]!;

    await expectImmutableTriggerError(
      r.db.delete(sealedPicks).where(eq(sealedPicks.id, target.id)),
      /IMMUTABLE_SEALED_PICK_DELETE/,
    );

    m.rejectedDeleteCount += 1;
    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `AttemptDirectDelete(seed=${this.targetSeed})`;
  }
}

class AttemptModifySealedColumns implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(
    private readonly targetSeed: number,
    private readonly field: SealedColumnField,
  ) {}

  check(m: Readonly<SealedPicksModel>): boolean {
    return Array.from(m.rows.values()).some((row) => row.status === "pending");
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    const pendingRows = Array.from(m.rows.values()).filter((row) => row.status === "pending");
    const target = pendingRows[this.targetSeed % pendingRows.length]!;

    const runMutation = (): Promise<unknown> => {
      switch (this.field) {
        case "units":
          return r.db
            .update(sealedPicks)
            .set({ units: target.units === "4.50" ? "4.75" : "4.50" })
            .where(eq(sealedPicks.id, target.id));
        case "userDecimal":
          return r.db
            .update(sealedPicks)
            .set({ userDecimal: target.userDecimal === "9.990" ? "8.880" : "9.990" })
            .where(eq(sealedPicks.id, target.id));
        case "fairDecimal":
          return r.db
            .update(sealedPicks)
            .set({ fairDecimal: target.fairDecimal === "7.770" ? "6.660" : "7.770" })
            .where(eq(sealedPicks.id, target.id));
        case "pickLabel":
          return r.db
            .update(sealedPicks)
            .set({ pickLabel: `${target.pickLabel} alterado` })
            .where(eq(sealedPicks.id, target.id));
        case "matchLabel":
          return r.db
            .update(sealedPicks)
            .set({ matchLabel: `${target.matchLabel} alterado` })
            .where(eq(sealedPicks.id, target.id));
        case "sealHash":
          return r.db
            .update(sealedPicks)
            .set({ sealHash: target.sealHash.startsWith("0") ? "f".repeat(64) : "0".repeat(64) })
            .where(eq(sealedPicks.id, target.id));
        case "kickoffAt":
          return r.db
            .update(sealedPicks)
            .set({ kickoffAt: new Date(target.kickoffAtMs + 3_600_000) })
            .where(eq(sealedPicks.id, target.id));
        case "sealedAt":
          return r.db
            .update(sealedPicks)
            .set({ sealedAt: new Date(target.sealedAtMs - 60_000) })
            .where(eq(sealedPicks.id, target.id));
      }
    };

    await expectImmutableTriggerError(runMutation(), /IMMUTABLE_SEALED_PICK_UPDATE/);

    m.rejectedSealedMutationCount += 1;
    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `AttemptModifySealedColumns(${this.field}, seed=${this.targetSeed})`;
  }
}

class SettlePendingToTerminal implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(
    private readonly targetSeed: number,
    private readonly terminalStatus: TerminalPickStatus,
    private readonly clvCents: number,
    private readonly closingMilli: number,
  ) {}

  check(m: Readonly<SealedPicksModel>): boolean {
    return Array.from(m.rows.values()).some((row) => row.status === "pending");
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    const pendingRows = Array.from(m.rows.values()).filter((row) => row.status === "pending");
    const target = pendingRows[this.targetSeed % pendingRows.length]!;
    const clvPct = (this.clvCents / 100).toFixed(2);
    const closingDecimal = (this.closingMilli / 1000).toFixed(3);
    const settledAt = new Date(target.kickoffAtMs + 7_200_000);

    await r.db
      .update(sealedPicks)
      .set({
        status: this.terminalStatus,
        clvPct,
        closingDecimal,
        settledAt,
      })
      .where(eq(sealedPicks.id, target.id));

    target.status = this.terminalStatus;
    target.clvPct = clvPct;
    target.closingDecimal = closingDecimal;

    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `SettlePendingToTerminal(${this.terminalStatus}, seed=${this.targetSeed})`;
  }
}

class AttemptModifySettledRow implements fc.AsyncCommand<SealedPicksModel, SealedPicksReal> {
  constructor(
    private readonly targetSeed: number,
    private readonly field: SettledMutationField,
  ) {}

  check(m: Readonly<SealedPicksModel>): boolean {
    return Array.from(m.rows.values()).some((row) => row.status !== "pending");
  }

  async run(m: SealedPicksModel, r: SealedPicksReal): Promise<void> {
    const settledRows = Array.from(m.rows.values()).filter((row) => row.status !== "pending");
    const target = settledRows[this.targetSeed % settledRows.length]!;

    const runMutation = (): Promise<unknown> => {
      switch (this.field) {
        case "status":
          return r.db
            .update(sealedPicks)
            .set({ status: target.status === "won" ? "lost" : "won" })
            .where(eq(sealedPicks.id, target.id));
        case "clvPct":
          return r.db
            .update(sealedPicks)
            .set({ clvPct: target.clvPct === "9.99" ? "8.88" : "9.99" })
            .where(eq(sealedPicks.id, target.id));
        case "closingDecimal":
          return r.db
            .update(sealedPicks)
            .set({ closingDecimal: target.closingDecimal === "5.550" ? "4.440" : "5.550" })
            .where(eq(sealedPicks.id, target.id));
        case "settledAt":
          return r.db
            .update(sealedPicks)
            .set({ settledAt: new Date(target.kickoffAtMs + 14_400_000) })
            .where(eq(sealedPicks.id, target.id));
        case "note":
          return r.db
            .update(sealedPicks)
            .set({ note: "nota ilegal post liquidacion" })
            .where(eq(sealedPicks.id, target.id));
        case "fairDecimal":
          return r.db
            .update(sealedPicks)
            .set({ fairDecimal: target.fairDecimal === "1.110" ? "1.220" : "1.110" })
            .where(eq(sealedPicks.id, target.id));
      }
    };

    await expectImmutableTriggerError(runMutation(), /IMMUTABLE_SETTLED_PICK_UPDATE/);

    m.rejectedSettledMutationCount += 1;
    await assertSealedDbMatchesModel(m, r);
  }

  toString(): string {
    return `AttemptModifySettledRow(${this.field}, seed=${this.targetSeed})`;
  }
}

interface LegTemplate {
  readonly id: string;
  readonly gameId: string;
  readonly sport: BetBuilderLegInput["sport"];
  readonly family: BetBuilderLegInput["family"];
  readonly axis: BetBuilderLegInput["axis"];
  readonly selectionKey: string;
  readonly label: string;
  readonly line: number | null;
  readonly direction: BetBuilderLegInput["direction"];
}

const SGP_GAME_PRIMARY = "sgp-fsm-game-1";
const SGP_GAME_SECONDARY = "sgp-fsm-game-2";
const SGP_GAME_CLOSED = "sgp-fsm-game-3";
const SGP_MAX_LEGS_PER_GAME = 5;

const SGP_OPTIONS: BetBuilderCompatibilityOptions = {
  allowSameGame: true,
  maxLegsPerGame: SGP_MAX_LEGS_PER_GAME,
  allowLive: false,
};

const COMPATIBLE_LEG_POOL: readonly LegTemplate[] = [
  {
    id: "g1-1x2-home",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "1x2",
    axis: "result_ft",
    selectionKey: "home",
    label: "Gana Local",
    line: null,
    direction: "home",
  },
  {
    id: "g1-goals-o25",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "totals",
    axis: "goals_total",
    selectionKey: "over_2.5",
    label: "Más de 2.5 goles",
    line: 2.5,
    direction: "over",
  },
  {
    id: "g1-btts-yes",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "btts",
    axis: "btts",
    selectionKey: "yes",
    label: "Ambos anotan Sí",
    line: null,
    direction: "yes",
  },
  {
    id: "g1-corners-o95",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "corners_total",
    axis: "corners_total",
    selectionKey: "over_9.5",
    label: "Más de 9.5 córners",
    line: 9.5,
    direction: "over",
  },
  {
    id: "g1-cards-o45",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "cards_total",
    axis: "cards_total",
    selectionKey: "over_4.5",
    label: "Más de 4.5 tarjetas",
    line: 4.5,
    direction: "over",
  },
  {
    id: "g1-shots-o225",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "shots_total",
    axis: "shots_total",
    selectionKey: "over_22.5",
    label: "Más de 22.5 remates",
    line: 22.5,
    direction: "over",
  },
  {
    id: "g1-fouls-o215",
    gameId: SGP_GAME_PRIMARY,
    sport: "football",
    family: "fouls_total",
    axis: "fouls_total",
    selectionKey: "over_21.5",
    label: "Más de 21.5 faltas",
    line: 21.5,
    direction: "over",
  },
  {
    id: "g2-1x2-home",
    gameId: SGP_GAME_SECONDARY,
    sport: "football",
    family: "1x2",
    axis: "result_ft",
    selectionKey: "home",
    label: "Gana Local Partido 2",
    line: null,
    direction: "home",
  },
  {
    id: "g2-goals-o15",
    gameId: SGP_GAME_SECONDARY,
    sport: "football",
    family: "totals",
    axis: "goals_total",
    selectionKey: "over_1.5",
    label: "Más de 1.5 goles Partido 2",
    line: 1.5,
    direction: "over",
  },
];

interface BetBuilderModel {
  legs: BetBuilderLegInput[];
}

interface BetBuilderReal {
  legs: BetBuilderLegInput[];
}

function makeLegFromTemplate(template: LegTemplate, p: number): BetBuilderLegInput {
  return {
    ...template,
    gameStatus: "NS",
    p,
    marketDecimal: null,
    isRedacted: false,
  };
}

function assertBetBuilderInvariants(model: BetBuilderModel, real: BetBuilderReal): void {
  expect(real.legs.map((l) => l.id)).toEqual(model.legs.map((l) => l.id));

  const idSet = new Set<string>();
  const perGameCount = new Map<string, number>();

  for (let i = 0; i < real.legs.length; i += 1) {
    const leg = real.legs[i]!;
    expect(leg.gameStatus).toBe("NS");
    expect(leg.isRedacted).not.toBe(true);
    expect(idSet.has(leg.id)).toBe(false);
    idSet.add(leg.id);

    const nextCount = (perGameCount.get(leg.gameId) ?? 0) + 1;
    expect(nextCount).toBeLessThanOrEqual(SGP_MAX_LEGS_PER_GAME);
    perGameCount.set(leg.gameId, nextCount);

    for (let j = i + 1; j < real.legs.length; j += 1) {
      const other = real.legs[j]!;
      expect(checkBetBuilderPairCompatibility(leg, other).allowed).toBe(true);
    }
  }

  const evaluation = evaluateBetBuilder(real.legs);
  expect(evaluation.legsCount).toBe(real.legs.length);
  expect(evaluation.gamesCount).toBe(perGameCount.size);

  if (real.legs.length === 0) {
    expect(evaluation.hasSgp).toBe(false);
    expect(evaluation.sgpGamesCount).toBe(0);
    expect(evaluation.jointProbability).toBe(0);
    expect(evaluation.independentProbability).toBe(0);
    expect(evaluation.fairCombinedDecimal).toBe(1);
    return;
  }

  const expectedSgpGames = Array.from(perGameCount.values()).filter((count) => count >= 2).length;
  expect(evaluation.sgpGamesCount).toBe(expectedSgpGames);
  expect(evaluation.hasSgp).toBe(expectedSgpGames > 0);
  expect(Number.isFinite(evaluation.jointProbability)).toBe(true);
  expect(Number.isFinite(evaluation.independentProbability)).toBe(true);
  expect(Number.isFinite(evaluation.correlationMultiplier)).toBe(true);
  expect(Number.isFinite(evaluation.fairCombinedDecimal)).toBe(true);
  expect(evaluation.fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);

  const probs = real.legs.map((l) => l.p);
  const globalFrechetLo = Math.max(
    0,
    probs.reduce((acc, p) => acc + p, 0) - (probs.length - 1),
  );
  const globalFrechetHi = Math.min(...probs);
  expect(evaluation.jointProbability).toBeGreaterThanOrEqual(globalFrechetLo - 2e-4);
  expect(evaluation.jointProbability).toBeLessThanOrEqual(globalFrechetHi + 2e-4);

  const byGame = new Map<string, number[]>();
  for (const leg of real.legs) {
    const arr = byGame.get(leg.gameId) ?? [];
    arr.push(leg.p);
    byGame.set(leg.gameId, arr);
  }
  let perGameUpperProduct = 1;
  let perGameLowerProduct = 1;
  for (const gameProbs of byGame.values()) {
    perGameUpperProduct *= Math.min(...gameProbs);
    const gLo = Math.max(
      0,
      gameProbs.reduce((acc, p) => acc + p, 0) - (gameProbs.length - 1),
    );
    perGameLowerProduct *= gLo;
  }
  expect(evaluation.jointProbability).toBeGreaterThanOrEqual(perGameLowerProduct - 2e-4);
  expect(evaluation.jointProbability).toBeLessThanOrEqual(perGameUpperProduct + 2e-4);
}

class AddValidLeg implements fc.Command<BetBuilderModel, BetBuilderReal> {
  constructor(
    private readonly templateIdx: number,
    private readonly prob: number,
  ) {}

  check(m: Readonly<BetBuilderModel>): boolean {
    const template = COMPATIBLE_LEG_POOL[this.templateIdx % COMPATIBLE_LEG_POOL.length]!;
    return !m.legs.some((leg) => leg.id === template.id);
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    const template = COMPATIBLE_LEG_POOL[this.templateIdx % COMPATIBLE_LEG_POOL.length]!;
    const candidate = makeLegFromTemplate(template, this.prob);
    const sameGameCount = m.legs.filter((leg) => leg.gameId === candidate.gameId).length;
    const compat = checkBetBuilderCompatibility(r.legs, candidate, SGP_OPTIONS);

    if (sameGameCount >= SGP_MAX_LEGS_PER_GAME) {
      expect(compat.allowed).toBe(false);
      expect(compat.code).toBe("sgp_limit");
    } else {
      expect(compat.allowed).toBe(true);
      m.legs.push(candidate);
      r.legs.push(candidate);
    }

    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    const template = COMPATIBLE_LEG_POOL[this.templateIdx % COMPATIBLE_LEG_POOL.length]!;
    return `AddValidLeg(${template.id}, p=${this.prob.toFixed(2)})`;
  }
}

class AddDuplicateLeg implements fc.Command<BetBuilderModel, BetBuilderReal> {
  constructor(
    private readonly targetSeed: number,
    private readonly sameId: boolean,
  ) {}

  check(m: Readonly<BetBuilderModel>): boolean {
    return m.legs.length > 0;
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    const existing = m.legs[this.targetSeed % m.legs.length]!;
    const sameGameCount = m.legs.filter((leg) => leg.gameId === existing.gameId).length;
    const candidate: BetBuilderLegInput = this.sameId
      ? { ...existing }
      : { ...existing, id: `${existing.id}__dup_${this.targetSeed}` };

    const compat = checkBetBuilderCompatibility(r.legs, candidate, SGP_OPTIONS);
    expect(compat.allowed).toBe(false);
    if (this.sameId || sameGameCount < SGP_MAX_LEGS_PER_GAME) {
      expect(compat.code).toBe("duplicate");
    } else {
      expect(compat.code).toBe("sgp_limit");
    }

    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    return `AddDuplicateLeg(seed=${this.targetSeed}, sameId=${String(this.sameId)})`;
  }
}

class AddConflictingLeg implements fc.Command<BetBuilderModel, BetBuilderReal> {
  constructor(
    private readonly variant: 0 | 1 | 2,
    private readonly targetSeed: number,
  ) {}

  check(m: Readonly<BetBuilderModel>): boolean {
    return m.legs.some((leg) => leg.gameId === SGP_GAME_PRIMARY);
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    const game1Legs = m.legs.filter((leg) => leg.gameId === SGP_GAME_PRIMARY);
    const atLimit = game1Legs.length >= SGP_MAX_LEGS_PER_GAME;
    const anchor = game1Legs[this.targetSeed % game1Legs.length]!;

    let candidate: BetBuilderLegInput;
    let expectedCodes: readonly BetBuilderBlockCode[];

    if (this.variant === 0) {
      candidate = {
        ...anchor,
        id: `conflict-axis-${anchor.id}-${this.targetSeed}`,
        selectionKey: `${anchor.selectionKey}_alt`,
        label: `Opuesto ${anchor.label}`,
        direction: anchor.direction === "over" ? "under" : anchor.direction === "yes" ? "no" : "away",
      };
      expectedCodes = atLimit ? ["sgp_limit"] : ["same_axis_redundant"];
    } else if (this.variant === 1) {
      candidate = {
        id: `conflict-exact-${this.targetSeed}`,
        gameId: SGP_GAME_PRIMARY,
        sport: "football",
        gameStatus: "NS",
        family: "correct_score",
        axis: "exact_score",
        selectionKey: "2-1",
        label: "Marcador exacto 2-1",
        line: null,
        direction: "combo",
        p: 0.14,
        marketDecimal: null,
        isRedacted: false,
      };
      expectedCodes = atLimit ? ["sgp_limit"] : ["exact_score_lock"];
    } else {
      const hasHomeOrBtts = game1Legs.some(
        (leg) => leg.axis === "result_ft" || leg.axis === "btts",
      );
      if (hasHomeOrBtts) {
        candidate = {
          id: `conflict-cs-away-${this.targetSeed}`,
          gameId: SGP_GAME_PRIMARY,
          sport: "football",
          gameStatus: "NS",
          family: "clean_sheet",
          axis: "clean_sheet_away",
          selectionKey: "away_yes",
          label: "Visitante deja portería a cero",
          line: null,
          direction: "yes",
          p: 0.28,
          marketDecimal: null,
          isRedacted: false,
        };
        expectedCodes = atLimit ? ["sgp_limit"] : ["logical_contradiction"];
      } else {
        candidate = {
          id: `conflict-exact-fallback-${this.targetSeed}`,
          gameId: SGP_GAME_PRIMARY,
          sport: "football",
          gameStatus: "NS",
          family: "correct_score",
          axis: "exact_score",
          selectionKey: "1-0",
          label: "Marcador exacto 1-0",
          line: null,
          direction: "combo",
          p: 0.16,
          marketDecimal: null,
          isRedacted: false,
        };
        expectedCodes = atLimit ? ["sgp_limit"] : ["exact_score_lock"];
      }
    }

    const compat = checkBetBuilderCompatibility(r.legs, candidate, SGP_OPTIONS);
    expect(compat.allowed).toBe(false);
    expect(expectedCodes).toContain(compat.code);

    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    return `AddConflictingLeg(v=${this.variant}, seed=${this.targetSeed})`;
  }
}

class AddFinishedOrLiveLeg implements fc.Command<BetBuilderModel, BetBuilderReal> {
  constructor(
    private readonly status: "FT" | "LIVE",
    private readonly prob: number,
  ) {}

  check(): boolean {
    return true;
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    const candidate: BetBuilderLegInput = {
      id: `closed-${this.status}-${Math.round(this.prob * 1000)}`,
      gameId: SGP_GAME_CLOSED,
      sport: "football",
      gameStatus: this.status,
      family: "1x2",
      axis: "result_ft",
      selectionKey: "home",
      label: `Partido ${this.status}`,
      line: null,
      direction: "home",
      p: this.prob,
      marketDecimal: null,
      isRedacted: false,
    };

    const compat = checkBetBuilderCompatibility(r.legs, candidate, SGP_OPTIONS);
    expect(compat.allowed).toBe(false);
    expect(compat.code).toBe(this.status === "FT" ? "finished" : "live");

    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    return `AddFinishedOrLiveLeg(${this.status}, p=${this.prob.toFixed(2)})`;
  }
}

class RemoveLeg implements fc.Command<BetBuilderModel, BetBuilderReal> {
  constructor(private readonly targetSeed: number) {}

  check(m: Readonly<BetBuilderModel>): boolean {
    return m.legs.length > 0;
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    const idx = this.targetSeed % m.legs.length;
    m.legs.splice(idx, 1);
    r.legs.splice(idx, 1);
    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    return `RemoveLeg(seed=${this.targetSeed})`;
  }
}

class ClearSlip implements fc.Command<BetBuilderModel, BetBuilderReal> {
  check(m: Readonly<BetBuilderModel>): boolean {
    return m.legs.length > 0;
  }

  run(m: BetBuilderModel, r: BetBuilderReal): void {
    m.legs = [];
    r.legs = [];
    assertBetBuilderInvariants(m, r);
  }

  toString(): string {
    return "ClearSlip()";
  }
}

interface VelocityModel {
  seenResources: string[];
  seenSet: Set<string>;
  revoked: boolean;
  expectedAbuseEvents: number;
}

interface VelocityReal {
  readonly callResource: (resourceId: string) => Promise<Response>;
  nextResourceSeq: number;
}

function assertVelocityResponseState(
  model: VelocityModel,
  status: number,
  bodyJson: Record<string, unknown>,
  headers: Headers,
): void {
  const distinct = model.seenSet.size;
  if (distinct >= 75) {
    expect(status).toBe(403);
    expect(bodyJson).toEqual({ ok: false, error: "sesion_revocada" });
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.revokeUserActiveSessions).toHaveBeenCalledTimes(1);
    expect(mocks.revokeUserActiveSessions).toHaveBeenCalledWith(sharedDb, VELOCITY_MEMBER_ID);
  } else if (distinct >= 50) {
    expect(status).toBe(429);
    expect(headers.get("retry-after")).toBeTruthy();
    expect(mocks.revokeUserActiveSessions).not.toHaveBeenCalled();
  } else {
    expect(status).toBe(200);
    expect(bodyJson.ok).toBe(true);
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.revokeUserActiveSessions).not.toHaveBeenCalled();
  }
  expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledTimes(model.expectedAbuseEvents);
}

function advanceVelocityModelForResource(model: VelocityModel, resourceId: string): void {
  const prevSize = model.seenSet.size;
  if (!model.seenSet.has(resourceId)) {
    model.seenSet.add(resourceId);
    model.seenResources.push(resourceId);
  }
  const nextSize = model.seenSet.size;
  if (prevSize < 35 && nextSize >= 35) {
    model.expectedAbuseEvents += 1;
  }
  if (prevSize < 50 && nextSize >= 50) {
    model.expectedAbuseEvents += 1;
  }
  if (prevSize < 75 && nextSize >= 75) {
    model.revoked = true;
    model.expectedAbuseEvents += 1;
  }
}

class LegalBurstRead implements fc.AsyncCommand<VelocityModel, VelocityReal> {
  constructor(
    private readonly resourceSeed: number,
    private readonly burstCount: number,
  ) {}

  check(m: Readonly<VelocityModel>): boolean {
    return m.seenResources.length > 0;
  }

  async run(m: VelocityModel, r: VelocityReal): Promise<void> {
    const resourceId = m.seenResources[this.resourceSeed % m.seenResources.length]!;
    const beforeDistinct = m.seenSet.size;

    for (let i = 0; i < this.burstCount; i += 1) {
      const response = await r.callResource(resourceId);
      const body = (await response.json()) as Record<string, unknown>;
      expect(m.seenSet.size).toBe(beforeDistinct);
      assertVelocityResponseState(m, response.status, body, response.headers);
    }
  }

  toString(): string {
    return `LegalBurstRead(seed=${this.resourceSeed}, x${this.burstCount})`;
  }
}

class DistinctResourceRead implements fc.AsyncCommand<VelocityModel, VelocityReal> {
  constructor(private readonly batchSize: number) {}

  check(m: Readonly<VelocityModel>): boolean {
    return m.seenSet.size < 95;
  }

  async run(m: VelocityModel, r: VelocityReal): Promise<void> {
    for (let i = 0; i < this.batchSize; i += 1) {
      r.nextResourceSeq += 1;
      const resourceId = `game-fsm-${r.nextResourceSeq}`;
      advanceVelocityModelForResource(m, resourceId);

      const response = await r.callResource(resourceId);
      const body = (await response.json()) as Record<string, unknown>;
      assertVelocityResponseState(m, response.status, body, response.headers);
    }
  }

  toString(): string {
    return `DistinctResourceRead(batch=${this.batchSize})`;
  }
}

describe("Máquinas de estado fast-check (fc.commands) · Invariantes críticas", () => {
  it("Ciclo sealed_picks en PGlite real (0025): inmutabilidad, bloqueo post-kickoff, no borrado directo y liquidación irreversible", async () => {
    const sealedCommands: fc.Arbitrary<fc.AsyncCommand<SealedPicksModel, SealedPicksReal>>[] = [
      fc
        .tuple(
          fc.integer({ min: 1, max: 48 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1200, max: 4500 }),
          fc.integer({ min: 1150, max: 4200 }),
        )
        .map(
          ([hoursAhead, unitsHalfSteps, userDec, fairDec]) =>
            new InsertPreKickoff(hoursAhead, unitsHalfSteps, userDec, fairDec),
        ),
      fc
        .integer({ min: 5, max: 1440 })
        .map((minutesAgo) => new AttemptPostKickoffInsert(minutesAgo)),
      fc
        .tuple(
          fc.integer({ min: 1, max: 48 }),
          fc.constantFrom<PreSettledAttackVariant>(
            "status_won",
            "status_lost",
            "status_void",
            "settled_at",
            "closing_decimal",
            "clv_pct",
            "parlay_leg_results",
          ),
        )
        .map(([hoursAhead, variant]) => new AttemptPreSettledInsert(hoursAhead, variant)),
      fc.integer({ min: 0, max: 31 }).map((seed) => new AttemptDirectDelete(seed)),
      fc
        .tuple(
          fc.integer({ min: 0, max: 31 }),
          fc.constantFrom<SealedColumnField>(
            "units",
            "userDecimal",
            "fairDecimal",
            "pickLabel",
            "matchLabel",
            "sealHash",
            "kickoffAt",
            "sealedAt",
          ),
        )
        .map(([seed, field]) => new AttemptModifySealedColumns(seed, field)),
      fc
        .tuple(
          fc.integer({ min: 0, max: 31 }),
          fc.constantFrom<TerminalPickStatus>("won", "lost", "void"),
          fc.integer({ min: -2500, max: 2500 }),
          fc.integer({ min: 1100, max: 5000 }),
        )
        .map(
          ([seed, status, clvCents, closingMilli]) =>
            new SettlePendingToTerminal(seed, status, clvCents, closingMilli),
        ),
      fc
        .tuple(
          fc.integer({ min: 0, max: 31 }),
          fc.constantFrom<SettledMutationField>(
            "status",
            "clvPct",
            "closingDecimal",
            "settledAt",
            "note",
            "fairDecimal",
          ),
        )
        .map(([seed, field]) => new AttemptModifySettledRow(seed, field)),
    ];

    await fc.assert(
      fc.asyncProperty(fc.commands(sealedCommands, { maxCommands: 20 }), async (cmds) => {
        sealedUserCounter += 1;
        const [user] = await sharedDb
          .insert(users)
          .values({ email: `fsm-sealed-${sealedUserCounter}@example.com` })
          .returning();
        expect(user).toBeDefined();

        const setup = () => ({
          model: {
            rows: new Map<string, SealedPickSnapshot>(),
            rejectedPostKickoffCount: 0,
            rejectedPreSettledInsertCount: 0,
            rejectedDeleteCount: 0,
            rejectedSealedMutationCount: 0,
            rejectedSettledMutationCount: 0,
          },
          real: {
            db: sharedDb,
            userId: user!.id,
            nextSeq: 0,
          },
        });

        await fc.asyncModelRun(setup, cmds);
      }),
      { numRuns: 15 },
    );
  });

  it("Ciclo BetBuilder SGP: conflictos bloqueados, límite SGP y cotas de Fréchet-Hoeffding en jointProbability", () => {
    const arbValidProb = fc.double({
      min: 0.08,
      max: 0.92,
      noNaN: true,
      noDefaultInfinity: true,
    });

    const betBuilderCommands: fc.Arbitrary<fc.Command<BetBuilderModel, BetBuilderReal>>[] = [
      fc
        .tuple(fc.integer({ min: 0, max: COMPATIBLE_LEG_POOL.length - 1 }), arbValidProb)
        .map(([idx, prob]) => new AddValidLeg(idx, prob)),
      fc
        .tuple(fc.integer({ min: 0, max: 31 }), fc.boolean())
        .map(([seed, sameId]) => new AddDuplicateLeg(seed, sameId)),
      fc
        .tuple(fc.constantFrom<0 | 1 | 2>(0, 1, 2), fc.integer({ min: 0, max: 31 }))
        .map(([variant, seed]) => new AddConflictingLeg(variant, seed)),
      fc
        .tuple(fc.constantFrom<"FT" | "LIVE">("FT", "LIVE"), arbValidProb)
        .map(([status, prob]) => new AddFinishedOrLiveLeg(status, prob)),
      fc.integer({ min: 0, max: 31 }).map((seed) => new RemoveLeg(seed)),
      fc.constant(new ClearSlip()),
    ];

    fc.assert(
      fc.property(fc.commands(betBuilderCommands, { maxCommands: 30 }), (cmds) => {
        const setup = () => ({
          model: { legs: [] as BetBuilderLegInput[] },
          real: { legs: [] as BetBuilderLegInput[] },
        });
        fc.modelRun(setup, cmds);
      }),
      { numRuns: 60 },
    );
  });

  it("Ciclo Scraping Velocity (withSessionRead real): transición determinista 200 (<50) -> 429 (>=50) -> revocación + 403 (>=75)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const velocityCommands: fc.Arbitrary<fc.AsyncCommand<VelocityModel, VelocityReal>>[] = [
      fc
        .tuple(fc.integer({ min: 0, max: 63 }), fc.integer({ min: 1, max: 6 }))
        .map(([seed, burstCount]) => new LegalBurstRead(seed, burstCount)),
      fc.integer({ min: 1, max: 14 }).map((batchSize) => new DistinctResourceRead(batchSize)),
    ];

    let runIdx = 0;

    await fc.assert(
      fc.asyncProperty(fc.commands(velocityCommands, { maxCommands: 24 }), async (cmds) => {
        runIdx += 1;
        pgRateCounts.clear();
        resetRateLimitsForTests();
        resetScrapingVelocityForTests();
        mocks.revokeUserActiveSessions.mockClear();
        mocks.recordSecurityAbuseEvent.mockClear();

        const guardedRoute = withSessionRead<{ gameId: string }>(
          {
            bucket: `fsm-velocity-${runIdx}`,
            allowBetaPin: false,
            limit: 1_000,
            ipLimit: 2_000,
            resourceKey: ({ params }) => params.gameId,
          },
          ({ params }) => NextResponse.json({ ok: true, gameId: params.gameId }),
        );

        const setup = () => ({
          model: {
            seenResources: [] as string[],
            seenSet: new Set<string>(),
            revoked: false,
            expectedAbuseEvents: 0,
          },
          real: {
            nextResourceSeq: 0,
            callResource: (resourceId: string) =>
              guardedRoute(
                new Request(`https://pitchlab.mx/api/live/games/${resourceId}`, {
                  headers: { "cf-connecting-ip": "201.141.77.10" },
                }),
                { params: Promise.resolve({ gameId: resourceId }) },
              ),
          },
        });

        await fc.asyncModelRun(setup, cmds);
      }),
      { numRuns: 40 },
    );
  });
});
