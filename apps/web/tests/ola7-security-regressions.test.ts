import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asLeagueId, asMarketKey, type LeagueId } from "@pitchlab/contracts";
import type { Db } from "@pitchlab/db";
import type { MatchPick, PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import type { AuthenticatedMember } from "../src/server/session-user";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getViewerAccess: vi.fn(),
  hasActivePaseTotal: vi.fn(),
  isAdminEmail: vi.fn(),
  requireAdmin: vi.fn(),
  requireMember: vi.fn(),
  requireSocialMember: vi.fn(),
  requireStep1Member: vi.fn(),
  serverDb: vi.fn(),
  signupCompleted: vi.fn(),
  dataset: null as PlatformDataset | null,
}));

vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  hasActivePaseTotal: mocks.hasActivePaseTotal,
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

vi.mock("../src/server/platform-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/platform-data")>();
  return {
    ...actual,
    buildServerRawPlatformDataset: () => mocks.dataset ?? actual.buildServerRawPlatformDataset(),
  };
});

import {
  applyMigrations,
  eq,
  getEmailPreferences,
  sealedPicks,
  setEmailPreferences,
  users,
} from "@pitchlab/db";
import { GET as getAlerts } from "../app/api/alerts/route";
import { GET as getLiveAlerts } from "../app/api/live/alerts/route";
import {
  GET as getUnsubscribe,
  POST as postUnsubscribe,
} from "../app/api/me/email-preferences/unsubscribe/route";
import { POST as postJournal } from "../app/api/me/journal/route";
import { POST as postSgp } from "../app/api/parlays/sgp/route";
import { signUnsubscribeToken } from "../src/server/lifecycle-emails";
import { consoleMailer } from "../src/server/mailer";
import { resetRateLimitsForTests, setRateLimitDbForTests } from "../src/server/request-security";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const ACCOUNT_FULL_ACCESS: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCOUNT_NO_PASE: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const BETA_FULL_ACCESS: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

let pgClient: PGlite;
let testDb: Db;
let memberId = "";

function buildMember(userId: string, email: string): AuthenticatedMember {
  return {
    db: testDb,
    userId,
    email,
    emailVerified: true,
    authUserId: `auth-${userId}`,
  };
}

function sameOriginJsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

function makeTotalPick(params: {
  readonly gameId: string;
  readonly pickId: string;
  readonly league: LeagueId;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly rawLabel: string;
  readonly line: number;
  readonly p: number;
}): MatchPick {
  const fairDecimal = Math.round((1 / params.p) * 1000) / 1000;
  return {
    id: params.pickId,
    gameId: params.gameId,
    league: params.league,
    leagueLabel: params.leagueLabel,
    matchLabel: params.matchLabel,
    kickoffLocal: "19:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "totales",
    categoryLabel: "Totales",
    risk: "medio",
    engineKey: "singularity",
    engineName: "Spacetime Suite",
    marketGroup: "Totales",
    selectionKey: `over_${params.line}`,
    market: asMarketKey("totals"),
    line: params.line,
    conflictGroup: "over_total",
    label: params.rawLabel,
    rationale: "Prueba de regresión Ola 7",
    p: params.p,
    fairDecimal,
    fairAmerican: -120,
    marketDecimal: null,
    marketAmerican: null,
    edgePts: null,
    confidenceScore: 76,
    suggestedUnits: 1,
  };
}

function makeFootballGame(params: {
  readonly id: string;
  readonly league: LeagueId;
  readonly leagueLabel: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly kickoffIso: string;
  readonly picks: MatchPick[];
}): PlatformGame {
  return {
    id: params.id,
    league: params.league,
    leagueLabel: params.leagueLabel,
    sport: "football",
    round: "J14",
    dayId: params.kickoffIso.slice(0, 10),
    dayLabel: "domingo",
    kickoffUtc: params.kickoffIso,
    kickoffLocal: "19:00",
    venue: "Estadio Prueba",
    status: "NS",
    home: {
      slug: `${params.id}-home`,
      name: params.homeName,
      shortName: params.homeName,
      code: params.homeName.slice(0, 3).toUpperCase(),
      record: "",
    },
    away: {
      slug: `${params.id}-away`,
      name: params.awayName,
      shortName: params.awayName,
      code: params.awayName.slice(0, 3).toUpperCase(),
      record: "",
    },
    x12: [0.46, 0.27, 0.27],
    projection: { home: 2.1, away: 1.7, total: 3.8 },
    confidenceScore: 76,
    confidenceLevel: "media",
    picks: params.picks,
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "",
    spacetime: null,
  };
}

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  await pgClient.exec("SET pitchlab.allow_historical_seed = 'on'");
  testDb = drizzle(pgClient);
}, 120_000);

beforeEach(async () => {
  await pgClient.exec(
    "TRUNCATE TABLE users, market_alerts, funnel_events, security_rate_buckets, security_abuse_events CASCADE",
  );
  const [inserted] = await testDb
    .insert(users)
    .values({
      email: "ola7.socio@pitchlab.mx",
      handle: "ola7_socio",
      authUserId: "auth-ola7",
      isAdult: true,
    })
    .returning({ id: users.id });
  memberId = inserted!.id;

  resetRateLimitsForTests();
  setRateLimitDbForTests(testDb);
  mocks.dataset = null;
  mocks.getAuth.mockReturnValue(null);
  mocks.isAdminEmail.mockReturnValue(false);
  mocks.signupCompleted.mockResolvedValue(true);
  mocks.hasActivePaseTotal.mockResolvedValue(true);
  mocks.serverDb.mockReturnValue(testDb);
  mocks.getViewerAccess.mockResolvedValue(ACCOUNT_FULL_ACCESS);
  mocks.requireMember.mockResolvedValue(buildMember(memberId, "ola7.socio@pitchlab.mx"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

afterAll(async () => {
  setRateLimitDbForTests(null);
  await pgClient.close();
});

describe("Ola 7 · regresiones de seguridad, Cero-Fuga y APIs de parlays", () => {
  it("GET /api/me/email-preferences/unsubscribe valida sin mutar BD ni enlazar a /app/cuenta, y POST ejecuta la baja", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "ola7-unsubscribe-regression-secret-123456");
    await setEmailPreferences(testDb, memberId, {
      pickResults: false,
      weeklyDigest: true,
      monthlyRecord: true,
    });

    const weeklyToken = signUnsubscribeToken(memberId, "weekly_digest");
    const monthlyToken = signUnsubscribeToken(memberId, "monthly_record");
    expect(weeklyToken).toBeTruthy();
    expect(monthlyToken).toBeTruthy();

    const getRes = await getUnsubscribe(
      new Request(
        `https://pitchlab.mx/api/me/email-preferences/unsubscribe?token=${encodeURIComponent(weeklyToken!)}`,
      ),
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("cache-control")).toBe("no-store");
    expect(getRes.headers.get("content-type")).toContain("text/html");
    const getHtml = await getRes.text();
    expect(getHtml).toContain('<form method="POST"');
    expect(getHtml).toContain("Confirmar baja de correos");
    expect(getHtml).toContain("/app/account");
    expect(getHtml).not.toContain("/app/cuenta");

    const prefsAfterGet = await getEmailPreferences(testDb, memberId);
    expect(prefsAfterGet.weeklyDigest).toBe(true);
    expect(prefsAfterGet.monthlyRecord).toBe(true);

    const invalidGetRes = await getUnsubscribe(
      new Request("https://pitchlab.mx/api/me/email-preferences/unsubscribe?token=invalido.firma"),
    );
    expect(invalidGetRes.status).toBe(400);
    const invalidHtml = await invalidGetRes.text();
    expect(invalidHtml).toContain("/app/account");
    expect(invalidHtml).not.toContain("/app/cuenta");

    const formPostRes = await postUnsubscribe(
      new Request("https://pitchlab.mx/api/me/email-preferences/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: weeklyToken!, format: "html" }).toString(),
      }),
    );
    expect(formPostRes.status).toBe(200);
    expect(formPostRes.headers.get("content-type")).toContain("text/html");
    const confirmedHtml = await formPostRes.text();
    expect(confirmedHtml).toContain("/app/account");
    expect(confirmedHtml).not.toContain("/app/cuenta");

    const prefsAfterFormPost = await getEmailPreferences(testDb, memberId);
    expect(prefsAfterFormPost.weeklyDigest).toBe(false);
    expect(prefsAfterFormPost.monthlyRecord).toBe(true);

    const rfc8058Res = await postUnsubscribe(
      new Request(
        `https://pitchlab.mx/api/me/email-preferences/unsubscribe?token=${encodeURIComponent(monthlyToken!)}`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        },
      ),
    );
    expect(rfc8058Res.status).toBe(200);
    expect(await rfc8058Res.json()).toEqual({ ok: true, scope: "monthly_record" });

    const prefsAfterRfcPost = await getEmailPreferences(testDb, memberId);
    expect(prefsAfterRfcPost.monthlyRecord).toBe(false);
  });

  it("GET /api/alerts y GET /api/live/alerts exigen requireFullAccess (403 pase_requerido sin pase, 200 con pase)", async () => {
    mocks.getViewerAccess.mockResolvedValue(ACCOUNT_NO_PASE);
    mocks.hasActivePaseTotal.mockResolvedValue(false);

    const alertsDenied = await getAlerts(new Request("http://localhost:3000/api/alerts"));
    expect(alertsDenied.status).toBe(403);
    expect(alertsDenied.headers.get("cache-control")).toBe("private, no-store");
    expect(await alertsDenied.json()).toEqual({ ok: false, error: "pase_requerido" });

    const liveAlertsDenied = await getLiveAlerts(
      new Request("http://localhost:3000/api/live/alerts"),
    );
    expect(liveAlertsDenied.status).toBe(403);
    expect(liveAlertsDenied.headers.get("cache-control")).toBe("private, no-store");
    expect(await liveAlertsDenied.json()).toEqual({ ok: false, error: "pase_requerido" });

    mocks.getViewerAccess.mockResolvedValue(ACCOUNT_FULL_ACCESS);
    mocks.hasActivePaseTotal.mockResolvedValue(true);

    const alertsAllowed = await getAlerts(new Request("http://localhost:3000/api/alerts"));
    expect(alertsAllowed.status).toBe(200);
    expect(alertsAllowed.headers.get("cache-control")).toBe("private, no-store");

    const liveAlertsAllowed = await getLiveAlerts(
      new Request("http://localhost:3000/api/live/alerts"),
    );
    expect(liveAlertsAllowed.status).toBe(200);
    expect(liveAlertsAllowed.headers.get("cache-control")).toBe("private, no-store");

    mocks.requireMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });
    const liveUnauth = await getLiveAlerts(new Request("http://localhost:3000/api/live/alerts"));
    expect(liveUnauth.status).toBe(401);
  });

  it("POST /api/me/journal formatea matchLabel y pickLabel de parlays con equipos y unidad y mantiene tope <= 6 piernas", async () => {
    const kickoffA = new Date(Date.now() + 6 * 3_600_000).toISOString();
    const kickoffB = new Date(Date.now() + 8 * 3_600_000).toISOString();

    const belLeague = asLeagueId("pro-league-belgica");
    const engLeague = asLeagueId("championship");

    const gameA = makeFootballGame({
      id: "ola7-bel-charleroi",
      league: belLeague,
      leagueLabel: "Pro League Bélgica",
      homeName: "Charleroi",
      awayName: "Sint-Truidense",
      kickoffIso: kickoffA,
      picks: [
        makeTotalPick({
          gameId: "ola7-bel-charleroi",
          pickId: "pk-bel-over35",
          league: belLeague,
          leagueLabel: "Pro League Bélgica",
          matchLabel: "Charleroi vs Sint-Truidense",
          rawLabel: "Más de 3.5",
          line: 3.5,
          p: 0.56,
        }),
      ],
    });

    const gameB = makeFootballGame({
      id: "ola7-eng-norwich",
      league: engLeague,
      leagueLabel: "Championship",
      homeName: "Norwich",
      awayName: "Cardiff",
      kickoffIso: kickoffB,
      picks: [
        makeTotalPick({
          gameId: "ola7-eng-norwich",
          pickId: "pk-eng-over35",
          league: engLeague,
          leagueLabel: "Championship",
          matchLabel: "Norwich vs Cardiff",
          rawLabel: "Más de 3.5",
          line: 3.5,
          p: 0.58,
        }),
      ],
    });

    mocks.dataset = {
      generatedAt: new Date().toISOString(),
      leagues: [],
      games: [gameA, gameB],
      dailyPromoPickId: "",
      tipsterWeeklyPickId: "",
      tipsterWeeklySlug: "",
      isServerRedactedForVisitor: false,
    };

    const res = await postJournal(
      sameOriginJsonPost("/api/me/journal", {
        gameId: gameA.id,
        pickId: "parlay:pk-bel-over35+pk-eng-over35",
        pickKind: "parlay",
        parlayLegs: [
          { gameId: gameA.id, pickId: "pk-bel-over35" },
          { gameId: gameB.id, pickId: "pk-eng-over35" },
        ],
        units: 1,
        userDecimal: 3.4,
      }),
    );
    expect(res.status).toBe(201);

    const [saved] = await testDb
      .select()
      .from(sealedPicks)
      .where(eq(sealedPicks.userId, memberId));
    expect(saved).toBeDefined();
    expect(saved!.matchLabel).toContain("Charleroi vs Sint-Truidense");
    expect(saved!.matchLabel).toContain("Norwich vs Cardiff");
    expect(saved!.pickLabel).not.toBe("Más de 3.5 + Más de 3.5");
    expect(saved!.pickLabel).toContain("Charleroi vs Sint-Truidense: Más de 3.5 goles");
    expect(saved!.pickLabel).toContain("Norwich vs Cardiff: Más de 3.5 goles");
    expect(saved!.parlayLegs).toHaveLength(2);
    expect(saved!.parlayLegs?.[0]?.pickLabel).toBe("Más de 3.5 goles");
    expect(saved!.parlayLegs?.[1]?.pickLabel).toBe("Más de 3.5 goles");

    const sevenLegsRes = await postJournal(
      sameOriginJsonPost("/api/me/journal", {
        gameId: gameA.id,
        pickId: "parlay:too-many",
        pickKind: "parlay",
        parlayLegs: Array.from({ length: 7 }, (_, idx) => ({
          gameId: idx % 2 === 0 ? gameA.id : gameB.id,
          pickId: idx % 2 === 0 ? "pk-bel-over35" : "pk-eng-over35",
        })),
        units: 1,
        userDecimal: 12.5,
      }),
    );
    expect(sevenLegsRes.status).toBe(400);

    const extraFieldRes = await postJournal(
      sameOriginJsonPost("/api/me/journal", {
        gameId: gameA.id,
        pickId: "pk-bel-over35",
        units: 1,
        userDecimal: 2.1,
        status: "won",
      }),
    );
    expect(extraFieldRes.status).toBe(400);

    const singleRes = await postJournal(
      sameOriginJsonPost("/api/me/journal", {
        gameId: gameA.id,
        pickId: "pk-bel-over35",
        units: 1,
        userDecimal: 2.1,
      }),
    );
    expect(singleRes.status).toBe(201);
    const savedRows = await testDb
      .select()
      .from(sealedPicks)
      .where(eq(sealedPicks.userId, memberId));
    const singleRow = savedRows.find((r) => r.pickKind === "single");
    expect(singleRow?.pickLabel).toBe("Más de 3.5 goles");
  });

  it("POST /api/parlays/sgp soporta football, soccer, nfl, basketball, baseball y ice-hockey y rechaza deportes inválidos", async () => {
    mocks.getViewerAccess.mockResolvedValue(BETA_FULL_ACCESS);

    const cases: ReadonlyArray<{
      readonly sport: string;
      readonly expectedAuditSport: string;
      readonly legs: ReadonlyArray<{
        readonly legId: string;
        readonly factor: string;
        readonly marginalProbability: number;
        readonly direction: 1 | -1;
      }>;
    }> = [
      {
        sport: "football",
        expectedAuditSport: "soccer",
        legs: [
          { legId: "f1", factor: "goal_diff", marginalProbability: 0.54, direction: 1 },
          { legId: "f2", factor: "total_goals", marginalProbability: 0.56, direction: 1 },
        ],
      },
      {
        sport: "soccer",
        expectedAuditSport: "soccer",
        legs: [
          { legId: "s1", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
          { legId: "s2", factor: "total_shots_on_target", marginalProbability: 0.55, direction: 1 },
        ],
      },
      {
        sport: "nfl",
        expectedAuditSport: "nfl",
        legs: [
          { legId: "n1", factor: "home_margin", marginalProbability: 0.52, direction: 1 },
          { legId: "n2", factor: "total_points", marginalProbability: 0.54, direction: 1 },
        ],
      },
      {
        sport: "basketball",
        expectedAuditSport: "basketball",
        legs: [
          { legId: "b1", factor: "home_margin", marginalProbability: 0.55, direction: 1 },
          { legId: "b2", factor: "total_points", marginalProbability: 0.52, direction: 1 },
          { legId: "b3", factor: "player_points", marginalProbability: 0.58, direction: 1 },
        ],
      },
      {
        sport: "baseball",
        expectedAuditSport: "baseball",
        legs: [
          { legId: "m1", factor: "home_margin", marginalProbability: 0.54, direction: 1 },
          { legId: "m2", factor: "total_runs", marginalProbability: 0.51, direction: 1 },
        ],
      },
      {
        sport: "ice-hockey",
        expectedAuditSport: "ice-hockey",
        legs: [
          { legId: "h1", factor: "goal_diff", marginalProbability: 0.53, direction: 1 },
          { legId: "h2", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
        ],
      },
    ];

    for (const testCase of cases) {
      const res = await postSgp(
        sameOriginJsonPost("/api/parlays/sgp", {
          sport: testCase.sport,
          legs: testCase.legs,
          offeredCombinedDecimalOdds: 2.9,
        }),
      );
      expect(res.status, testCase.sport).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const json = (await res.json()) as {
        audit: {
          sport: string;
          nLegs: number;
          independentProbability: number;
          jointProbability: number;
          correlationMultiplier: number;
          fairCombinedDecimal: number;
          bookQuoteAudit: { effectiveHoldPct: number } | null;
        };
      };
      expect(json.audit.sport).toBe(testCase.expectedAuditSport);
      expect(json.audit.nLegs).toBe(testCase.legs.length);
      expect(json.audit.jointProbability).toBeGreaterThan(0);
      expect(json.audit.jointProbability).toBeLessThan(1);
      expect(json.audit.fairCombinedDecimal).toBeGreaterThanOrEqual(1.01);
      expect(Number.isFinite(json.audit.correlationMultiplier)).toBe(true);
      expect(json.audit.bookQuoteAudit).not.toBeNull();
    }

    const unsupportedRes = await postSgp(
      sameOriginJsonPost("/api/parlays/sgp", {
        sport: "cricket",
        legs: [
          { legId: "c1", factor: "total_points", marginalProbability: 0.5, direction: 1 },
          { legId: "c2", factor: "home_margin", marginalProbability: 0.5, direction: 1 },
        ],
      }),
    );
    expect(unsupportedRes.status).toBe(400);
    const unsupportedJson = (await unsupportedRes.json()) as { code?: string };
    expect(unsupportedJson.code).toBe("INVALID_SGP_REQUEST");

    const sevenLegSgpRes = await postSgp(
      sameOriginJsonPost("/api/parlays/sgp", {
        sport: "basketball",
        legs: Array.from({ length: 7 }, (_, idx) => ({
          legId: `b${idx + 1}`,
          factor: "total_points",
          marginalProbability: 0.52,
          direction: 1,
        })),
      }),
    );
    expect(sevenLegSgpRes.status).toBe(400);

    const strictExtraSgpRes = await postSgp(
      sameOriginJsonPost("/api/parlays/sgp", {
        sport: "basketball",
        legs: [
          { legId: "b1", factor: "home_margin", marginalProbability: 0.55, direction: 1 },
          { legId: "b2", factor: "total_points", marginalProbability: 0.52, direction: 1 },
        ],
        unexpectedField: true,
      }),
    );
    expect(strictExtraSgpRes.status).toBe(400);
  });

  it("verifica Cero-Fuga RSC en árbitros, safeLogger en servidor, beta/logout fail-closed y hardening de redirecciones cliente", async () => {
    const loggedLines: string[] = [];
    await consoleMailer((line) => loggedLines.push(line)).send({
      to: "privado.ola7@pitchlab.mx",
      subject: "Aviso de prueba",
      html: "<p>Hola</p>",
    });
    expect(loggedLines[0]).toContain("Aviso de prueba");
    expect(loggedLines[0]).not.toContain("privado.ola7@pitchlab.mx");

    const refereeDirSrc = readFileSync(
      resolve(REPO_ROOT, "apps/web/app/app/[league]/arbitros/page.tsx"),
      "utf8",
    );
    expect(refereeDirSrc).toContain("getViewerAccess()");
    expect(refereeDirSrc).toContain("if (!access.fullAccess)");

    const refereeProfileSrc = readFileSync(
      resolve(REPO_ROOT, "apps/web/app/app/[league]/r/[refereeSlug]/page.tsx"),
      "utf8",
    );
    expect(refereeProfileSrc).toContain("getViewerAccess()");
    expect(refereeProfileSrc).toContain("if (!access.fullAccess)");

    const betaLogoutSrc = readFileSync(
      resolve(REPO_ROOT, "apps/web/app/api/beta/logout/route.ts"),
      "utf8",
    );
    expect(betaLogoutSrc).toContain("withPublicRead");
    expect(betaLogoutSrc).toContain("failClosed: true");

    const lifecycleSrc = readFileSync(
      resolve(REPO_ROOT, "apps/web/src/server/lifecycle-emails.ts"),
      "utf8",
    );
    expect(lifecycleSrc).not.toContain("/app/cuenta");

    for (const serverFile of [
      "apps/web/src/server/auth.ts",
      "apps/web/src/server/viewer-access.ts",
      "apps/web/src/server/billing/stripe-webhook.ts",
      "apps/web/src/server/cortex.ts",
      "apps/web/src/server/mailer.ts",
      "apps/web/src/server/lifecycle-emails.ts",
    ]) {
      const src = readFileSync(resolve(REPO_ROOT, serverFile), "utf8");
      expect(src, serverFile).toContain("logSecurityEvent");
      expect(src, serverFile).not.toMatch(/\bconsole\.(?:info|warn|error|log)\s*\(/);
    }

    for (const externalRedirectFile of [
      "packages/ui/src/platform/club/account/PlanTab.tsx",
      "packages/ui/src/platform/club/EditProfileDialog.tsx",
      "packages/ui/src/platform/club/SocialAndTipsterViews.tsx",
      "packages/ui/src/platform/public/LoginSurfaceV4.tsx",
      "packages/ui/src/platform/public/TechAndPricingSurfaces.tsx",
    ]) {
      const src = readFileSync(resolve(REPO_ROOT, externalRedirectFile), "utf8");
      expect(src, externalRedirectFile).toContain("sanitizeInternalHref");
      expect(src, externalRedirectFile).toContain('parsed.port !== ""');
    }

    const emailConfirmSrc = readFileSync(
      resolve(REPO_ROOT, "packages/ui/src/platform/public/email-confirmation.tsx"),
      "utf8",
    );
    expect(emailConfirmSrc).toContain("sanitizeInternalHref");
  });
});
