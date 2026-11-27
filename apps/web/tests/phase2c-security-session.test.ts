import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  authAccount,
  authSession,
  authUser,
  eq,
  grantDays,
  securityAbuseEvents,
  securityRateBuckets,
  SIGNUP_CONSENT_VERSION,
  users,
  type Db,
} from "@pitchlab/db";
import { asLeagueId, asTeamId, type TeamSquadEntry } from "@pitchlab/contracts";
import type { PlatformGame } from "@pitchlab/ui/types";
import { POST as postAdminTipsters } from "../app/api/admin/tipsters/route";
import { POST as postMarkPaid } from "../app/api/admin/tipster-payouts/[id]/mark-paid/route";
import { POST as postApproveTransfer } from "../app/api/admin/transfers/[id]/approve/route";
import { POST as postRejectTransfer } from "../app/api/admin/transfers/[id]/reject/route";
import { POST as postBetaUnlock } from "../app/api/beta/unlock/route";
import { GET as getCouponPreview } from "../app/api/me/coupons/preview/route";
import {
  GET as getUnsubscribe,
  POST as postUnsubscribe,
} from "../app/api/me/email-preferences/unsubscribe/route";
import { POST as postPush } from "../app/api/me/push/route";
import { POST as postRedeem } from "../app/api/me/redeem/route";
import { POST as postSignup } from "../app/api/me/signup/route";
import { POST as postTransfers } from "../app/api/me/transfers/route";
import { PATCH as patchTransfer } from "../app/api/me/transfers/[id]/route";
import { POST as postWatchlist } from "../app/api/me/watchlist/route";
import { POST as postSocialCopy } from "../app/api/social/posts/[id]/copy/route";
import { PUT as putCommentLike } from "../app/api/social/posts/[id]/comments/[commentId]/like/route";
import { POST as postSocialPosts } from "../app/api/social/posts/route";
import { middleware } from "../middleware";
import buildNextConfig from "../next.config.mjs";
import {
  readBoundedJson,
  resetScrapingVelocityForTests,
  withSessionRead,
} from "../src/server/api-guards";
import { createAuth, resetAuthForTests } from "../src/server/auth";
import { signBetaCookieToken } from "../src/server/beta-auth";
import {
  buildEnrichedMatchInjuries,
  buildEnrichedMatchLineups,
} from "../src/server/match-enrichment";
import { signUnsubscribeToken } from "../src/server/lifecycle-emails";
import {
  checkEndpointRateLimit,
  resetRateLimitsForTests,
  trustedClientIp,
} from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";
import { verifyTurnstile } from "../src/server/turnstile";

const ORIGIN = "http://localhost:3000";
const SECRET = "secreto-phase2c-pruebas-seguridad-al-menos-32-chars!!";
const ADMIN_EMAIL = "admin.sec@pitchlab.mx";
const ENV_BACKUP = { ...process.env };
const VALID_UUID = "11111111-1111-4111-8111-111111111111";

let pgClient: PGlite;
let sharedDb: Db;

function captureCookies(headers: Headers): string {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }
  const single = headers.get("set-cookie");
  return single ? single.split(";")[0] ?? "" : "";
}

async function signInMagicLink(
  db: Db,
  email: string,
): Promise<{ userId: string; authUserId: string; cookieHeader: string }> {
  let magicUrl = "";
  const auth = createAuth({
    db,
    secret: SECRET,
    baseURL: ORIGIN,
    sendEmail: async (_to, _subject, html) => {
      magicUrl = html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
    },
  });
  resetAuthForTests(auth);
  await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, callbackURL: "/app" }),
    }),
  );
  const verify = await auth.handler(new Request(magicUrl, { headers: { origin: ORIGIN } }));
  const cookieHeader = captureCookies(verify.headers);
  const [userRow] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!userRow?.authUserId) throw new Error("missing user row");
  return { userId: userRow.id, authUserId: userRow.authUserId, cookieHeader };
}

function makeFootballGame(status: "NS" | "LIVE" | "FT"): PlatformGame {
  return {
    id: `laliga-bar-rma-${status.toLowerCase()}`,
    league: asLeagueId("laliga"),
    leagueLabel: "LaLiga",
    sport: "football",
    round: "J14",
    dayId: "2026-11-28",
    dayLabel: "Sábado",
    kickoffUtc: "2026-11-28T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Camp Nou",
    status,
    home: { slug: "fc-barcelona", name: "FC Barcelona", shortName: "Barcelona", code: "BAR", record: "10-2-1" },
    away: { slug: "real-madrid", name: "Real Madrid", shortName: "Real Madrid", code: "RMA", record: "9-3-1" },
    hasForecast: true,
    x12: [0.48, 0.26, 0.26],
    projection: { home: 1.7, away: 1.1, total: 2.8 },
    confidenceScore: 78,
    confidenceLevel: "alta",
    picks: [],
    parlayCandidates: [],
    preGame: {
      cortexSynthesis: "Lectura cerrada.",
      tacticalKeys: ["Presión alta"],
      lineupStatusLabel: "Probable",
      lineupsConfirmed60m: true,
      confirmedLineups: {
        sourceLabel: "LaLiga",
        verifiedAtUtc: "2026-11-28T19:00:00Z",
        homeFormation: "4-3-3",
        awayFormation: "4-4-2",
        homeStarters: [
          "Lamine Yamal",
          "Lewandowski",
          "Pedri",
          "Gavi",
          "Cubarsi",
          "Araujo",
          "Kounde",
          "Balde",
          "Olmo",
          "Raphinha",
          "Ter Stegen",
        ].map((name) => ({ name })),
        awayStarters: [
          "Vinicius",
          "Mbappe",
          "Bellingham",
          "Valverde",
          "Camavinga",
          "Tchouameni",
          "Rudiger",
          "Militao",
          "Carvajal",
          "Mendy",
          "Courtois",
        ].map((name) => ({ name })),
      },
      absences: [
        {
          teamSide: "home",
          player: "Frenkie de Jong",
          status: "Baja",
          role: "MED",
          impactNote: "Titular en mediocampo",
          injuryType: "Tobillo",
          returnDate: "2026-12-10",
        },
      ],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Hace 5 min",
    spacetime: null,
  };
}

function makeSquad(slug: string, teamName: string): TeamSquadEntry {
  const players = Array.from({ length: 12 }, (_, idx) => ({
    id: `${slug}-p-${idx + 1}`,
    slug: `${slug}-jugador-${idx + 1}`,
    name: idx === 11 ? `${teamName} Lesionado` : `${teamName} Titular ${idx + 1}`,
    shortName: `${teamName.slice(0, 3)} ${idx + 1}`,
    jersey: String(idx + 1),
    positionGroup: (idx === 0 ? "GK" : idx <= 4 ? "DEF" : idx <= 8 ? "MID" : "FWD") as
      | "GK"
      | "DEF"
      | "MID"
      | "FWD",
    positionLabel: idx === 0 ? "POR" : "MED",
    age: 24,
    heightCm: 180,
    weightKg: 75,
    nationality: "España",
    nationalityCode: "ESP",
    photoKey: `pl-p:${idx + 1}`,
    fallbackPhotoKey: null,
    availability: (idx === 11 ? "injured" : "available") as "injured" | "available",
    injuryDetail: idx === 11 ? "Isquiotibiales" : null,
    expectedReturn: idx === 11 ? "2026-12-08" : null,
    stats: {
      appearances: 10,
      subIns: 0,
      goals: 2,
      assists: 2,
      shots: 12,
      shotsOnTarget: 6,
      foulsCommitted: 3,
      foulsSuffered: 4,
      yellowCards: 1,
      redCards: 0,
      offsides: 1,
      saves: idx === 0 ? 25 : 0,
      shotsFaced: idx === 0 ? 32 : 0,
      goalsConceded: idx === 0 ? 7 : 0,
    },
    seasonMetrics: [],
    recentGames: [],
    candidatePicks: [],
  }));
  return {
    teamId: asTeamId(`laliga.${slug}`),
    teamName,
    teamSlug: slug,
    coachName: `DT ${teamName}`,
    updatedAt: "2026-11-27T10:00:00Z",
    players,
  };
}

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  sharedDb = drizzle(pgClient) as unknown as Db;
});

afterAll(async () => {
  await pgClient.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  resetScrapingVelocityForTests();
  resetRateLimitsForTests();
  resetAuthForTests();
  setSessionDbForTests(sharedDb);
  await pgClient.exec(
    "TRUNCATE TABLE security_rate_buckets, security_abuse_events, auth_session, auth_account, auth_user, users CASCADE;",
  );
  process.env.DATABASE_URL = "postgresql://local/pglite-test";
  process.env.BETTER_AUTH_SECRET = SECRET;
  process.env.BETTER_AUTH_URL = ORIGIN;
  process.env.PITCHLAB_ADMIN_EMAILS = ADMIN_EMAIL;
  delete process.env.PITCHLAB_TRUSTED_PROXY;
  delete process.env.PITCHLAB_HOSTED;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.PITCHLAB_REQUIRE_SIGNUP_TURNSTILE;
  delete process.env.PITCHLAB_CAPTCHA_PROVIDER;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_BACKUP)) {
      delete process.env[key];
    } else {
      process.env[key] = ENV_BACKUP[key];
    }
  }
  resetAuthForTests();
  setSessionDbForTests(null);
});

describe("Fase 2C · Seguridad de borde, IP confiable, C1/C2, PG velocity y Zod .strict()", () => {
  it("trustedClientIp usa xff-last en producción o PITCHLAB_HOSTED=1 sin aceptar cabeceras spoofeables ni colapsar clientes", () => {
    const spoofedHeaders = new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "true-client-ip": "203.0.113.11",
      "fly-client-ip": "203.0.113.12",
      "x-vercel-forwarded-for": "203.0.113.13",
      "x-real-ip": "203.0.113.14",
      "x-forwarded-for": "1.1.1.1, 198.51.100.77",
    });

    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.PITCHLAB_TRUSTED_PROXY;
    expect(trustedClientIp(spoofedHeaders)).toBe("198.51.100.77");
    expect(trustedClientIp(new Headers({ "cf-connecting-ip": "8.8.8.8" }), undefined, "192.0.2.9")).toBe("192.0.2.9");
    expect(trustedClientIp(spoofedHeaders, "cloudflare")).toBe("203.0.113.10");

    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.PITCHLAB_HOSTED = "1";
    expect(trustedClientIp(spoofedHeaders)).toBe("198.51.100.77");
  });

  it("readBoundedJson rechaza 413 en Content-Length y streaming chunked y pasa AbortSignal en Redis y Turnstile", async () => {
    const headerTooBig = new Request(`${ORIGIN}/api/test`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999999" },
      body: "{}",
    });
    await expect(readBoundedJson(headerTooBig, 1024)).rejects.toMatchObject({ status: 413 });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600).fill(97));
        controller.enqueue(new Uint8Array(600).fill(97));
        controller.close();
      },
    });
    const chunkedTooBig = new Request(`${ORIGIN}/api/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: string });
    await expect(readBoundedJson(chunkedTooBig, 1024)).rejects.toMatchObject({ status: 413 });

    const emptyAllowed = new Request(`${ORIGIN}/api/test`, { method: "POST" });
    expect(await readBoundedJson(emptyAllowed, 1024, { allowEmpty: true })).toBeUndefined();

    const signals: Array<AbortSignal | null | undefined> = [];
    const spyFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return new Response(JSON.stringify([{ result: 1 }, { result: 1 }, { result: 1000 }]), { status: 200 });
    }) as typeof fetch;

    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    await checkEndpointRateLimit({
      bucket: "sig-test",
      key: "k1",
      limit: 5,
      windowMs: 60_000,
      fetchImpl: spyFetch,
    });
    expect(signals[0]).toBeInstanceOf(AbortSignal);

    const turnstileSignals: Array<AbortSignal | null | undefined> = [];
    const tsFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      turnstileSignals.push(init?.signal);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    await verifyTurnstile("tok", { secret: "sec", fetchImpl: tsFetch });
    expect(turnstileSignals[0]).toBeInstanceOf(AbortSignal);
  });

  it("persiste scraping velocity y revocación de sesión cuenta/beta en PostgreSQL aún tras limpiar memoria", async () => {
    const member = await signInMagicLink(sharedDb, "scraper.account@pitchlab.mx");
    await sharedDb
      .update(users)
      .set({
        handle: "scraper_acc",
        displayName: "Scraper Acc",
        isAdult: true,
        birthDate: "1994-03-10",
        termsVersion: SIGNUP_CONSENT_VERSION,
        termsAcceptedAt: new Date(),
      })
      .where(eq(users.id, member.userId));
    await grantDays(sharedDb, {
      userId: member.userId,
      sourceKind: "admin_grant",
      days: 7,
      idempotencyKey: "sec-vel-grant",
      now: new Date(),
    });

    const guardedRoute = withSessionRead<{ id: string }>(
      {
        bucket: "pg-velocity-test",
        limit: 500,
        ipLimit: 500,
        resourceKey: ({ params }) => params.id,
      },
      async () => Response.json({ ok: true }),
    );

    const callAccount = (id: string) =>
      guardedRoute(
        new Request(`${ORIGIN}/api/test/${id}`, {
          headers: { cookie: member.cookieHeader, "x-forwarded-for": "198.51.100.20" },
        }),
        { params: Promise.resolve({ id }) },
      );

    for (let i = 1; i <= 49; i += 1) {
      expect((await callAccount(`res-${i}`)).status).toBe(200);
    }
    expect((await callAccount("res-50")).status).toBe(429);
    for (let i = 51; i <= 74; i += 1) {
      expect((await callAccount(`res-${i}`)).status).toBe(429);
    }
    const revokedRes = await callAccount("res-75");
    expect(revokedRes.status).toBe(403);
    expect(await revokedRes.json()).toEqual({ ok: false, error: "sesion_revocada" });
    expect(await sharedDb.select().from(authSession)).toHaveLength(0);

    const abuseRows = await sharedDb.select().from(securityAbuseEvents);
    expect(abuseRows.some((r) => r.kind === "session_revoked")).toBe(true);

    const bucketRows = await sharedDb.select().from(securityRateBuckets);
    expect(bucketRows.some((r) => r.bucket === "vel:revoked")).toBe(true);

    const betaToken = await signBetaCookieToken();
    const betaCookie = `pl_beta=${betaToken}`;
    const callBeta = (id: string) =>
      guardedRoute(
        new Request(`${ORIGIN}/api/test/${id}`, {
          headers: { cookie: betaCookie, "x-forwarded-for": "198.51.100.99" },
        }),
        { params: Promise.resolve({ id }) },
      );

    for (let i = 1; i <= 74; i += 1) {
      await callBeta(`beta-res-${i}`);
    }
    const betaRevokeRes = await callBeta("beta-res-75");
    expect(betaRevokeRes.status).toBe(403);
    expect(betaRevokeRes.headers.get("set-cookie") ?? "").toContain("pl_beta=;");
    expect(betaRevokeRes.headers.get("set-cookie") ?? "").toContain("Max-Age=0");

    resetScrapingVelocityForTests();

    const postRestartBeta = await callBeta("beta-res-76");
    expect(postRestartBeta.status).toBe(403);
    expect(await postRestartBeta.json()).toEqual({ ok: false, error: "sesion_revocada" });

    const nonResourceBetaRoute = withSessionRead(
      { bucket: "pg-velocity-other", limit: 100, ipLimit: 100 },
      async () => Response.json({ ok: true }),
    );
    const blockedEverywhere = await nonResourceBetaRoute(
      new Request(`${ORIGIN}/api/other`, {
        headers: { cookie: betaCookie, "x-forwarded-for": "198.51.100.99" },
      }),
    );
    expect(blockedEverywhere.status).toBe(403);
  });

  it("Contrato C1: redacta lineups e injuries prepartido NS/LIVE cuando allowFull=false y libera en FT o allowFull=true", () => {
    const homeSquad = makeSquad("fc-barcelona", "Barcelona");
    const awaySquad = makeSquad("real-madrid", "Real Madrid");
    const sanitize = (raw?: string | null) => (raw && raw.startsWith("pl-") ? raw : null);

    for (const status of ["NS", "LIVE"] as const) {
      const game = makeFootballGame(status);
      expect(
        buildEnrichedMatchLineups({
          game,
          allowFull: false,
          homeSquad,
          awaySquad,
          confirmedLineups: game.preGame.confirmedLineups,
          sanitizePhotoKey: sanitize,
        }),
      ).toBeNull();

      expect(
        buildEnrichedMatchInjuries({
          game,
          allowFull: false,
          leagueInjuries: [
            {
              teamId: asTeamId("laliga.fc-barcelona"),
              player: "Gavi",
              position: "MED",
              status: "Baja",
              detail: "Rodilla",
              injuryType: "Ligamentos",
              returnDate: "2026-12-20",
              reportedAt: "2026-11-25T10:00:00Z",
            },
          ],
          homeSquad,
          awaySquad,
          sanitizePhotoKey: sanitize,
        }),
      ).toEqual([]);

      expect(
        buildEnrichedMatchLineups({
          game,
          allowFull: true,
          homeSquad,
          awaySquad,
          confirmedLineups: game.preGame.confirmedLineups,
          sanitizePhotoKey: sanitize,
        }),
      ).not.toBeNull();
    }

    const ftGame = makeFootballGame("FT");
    expect(
      buildEnrichedMatchLineups({
        game: ftGame,
        allowFull: false,
        homeSquad,
        awaySquad,
        confirmedLineups: ftGame.preGame.confirmedLineups,
        sanitizePhotoKey: sanitize,
      }),
    ).not.toBeNull();
    expect(
      buildEnrichedMatchInjuries({
        game: ftGame,
        allowFull: false,
        leagueInjuries: [],
        homeSquad,
        awaySquad,
        sanitizePhotoKey: sanitize,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("Contrato C2: magic-link recién verificado completa paso 2 sin atrapar mientras OAuth y sesiones viejas exigen Turnstile", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.TURNSTILE_SECRET_KEY = "prod-turnstile-secret";
    process.env.PITCHLAB_REQUIRE_SIGNUP_TURNSTILE = "1";

    const magicMember = await signInMagicLink(sharedDb, "magic.paso2@gmail.com");
    await sharedDb
      .update(authUser)
      .set({ emailVerified: true })
      .where(eq(authUser.id, magicMember.authUserId));

    const magicRes = await postSignup(
      new Request(`${ORIGIN}/api/me/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: magicMember.cookieHeader,
        },
        body: JSON.stringify({
          displayName: "Magic Paso Dos",
          handle: "magic_paso_dos",
          birthDate: "1992-05-10",
          consents: { terms: true, analytics: false, marketing: false, version: SIGNUP_CONSENT_VERSION },
        }),
      }),
    );
    expect(magicRes.status).toBe(200);

    const oauthMember = await signInMagicLink(sharedDb, "oauth.paso2@gmail.com");
    await sharedDb
      .update(authUser)
      .set({ emailVerified: true })
      .where(eq(authUser.id, oauthMember.authUserId));
    await sharedDb.insert(authAccount).values({
      id: "acct-google-1",
      accountId: "google-sub-1",
      providerId: "google",
      userId: oauthMember.authUserId,
    });

    const oauthBlocked = await postSignup(
      new Request(`${ORIGIN}/api/me/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: oauthMember.cookieHeader,
        },
        body: JSON.stringify({
          displayName: "OAuth Paso Dos",
          handle: "oauth_paso_dos",
          birthDate: "1992-05-10",
          consents: { terms: true, analytics: false, marketing: false, version: SIGNUP_CONSENT_VERSION },
        }),
      }),
    );
    expect(oauthBlocked.status).toBe(403);
    expect(await oauthBlocked.json()).toEqual({ error: "verificacion_humana_requerida" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const oauthRetry = await postSignup(
      new Request(`${ORIGIN}/api/me/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: oauthMember.cookieHeader,
        },
        body: JSON.stringify({
          displayName: "OAuth Paso Dos",
          handle: "oauth_paso_dos",
          birthDate: "1992-05-10",
          consents: { terms: true, analytics: false, marketing: false, version: SIGNUP_CONSENT_VERSION },
          turnstileToken: "valid-turnstile-token",
        }),
      }),
    );
    expect(oauthRetry.status).toBe(200);

    const staleMember = await signInMagicLink(sharedDb, "stale.paso2@gmail.com");
    await sharedDb
      .update(authUser)
      .set({ emailVerified: true })
      .where(eq(authUser.id, staleMember.authUserId));
    await sharedDb
      .update(authSession)
      .set({ createdAt: new Date(Date.now() - 3 * 60 * 60_000) })
      .where(eq(authSession.userId, staleMember.authUserId));

    const staleBlocked = await postSignup(
      new Request(`${ORIGIN}/api/me/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: staleMember.cookieHeader,
        },
        body: JSON.stringify({
          displayName: "Stale Paso Dos",
          handle: "stale_paso_dos",
          birthDate: "1992-05-10",
          consents: { terms: true, analytics: false, marketing: false, version: SIGNUP_CONSENT_VERSION },
        }),
      }),
    );
    expect(staleBlocked.status).toBe(403);
  });

  it("aplica CSP estricto en /unsubscribe, CSP dinámico en /i /p /u /baja y Cache-Control inmutable en /fonts/*", async () => {
    const unsubUser = await signInMagicLink(sharedDb, "unsub.sec@pitchlab.mx");
    const tok = signUnsubscribeToken(unsubUser.userId, "all") ?? "";
    expect(tok.length).toBeGreaterThan(20);
    const unsubGet = await getUnsubscribe(
      new Request(`${ORIGIN}/api/me/email-preferences/unsubscribe?token=${encodeURIComponent(tok)}`),
    );
    expect(unsubGet.status).toBe(200);
    const unsubCsp = unsubGet.headers.get("Content-Security-Policy") ?? "";
    expect(unsubCsp).toContain("script-src 'none'");
    expect(unsubCsp).toContain("style-src 'sha256-");
    expect(unsubCsp).toContain("default-src 'none'");
    expect(unsubCsp).not.toContain("'unsafe-inline'");
    const unsubHtml = await unsubGet.text();
    const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(unsubHtml);
    expect(styleMatch?.[1]).toBeTruthy();
    const expectedStyleHash = createHash("sha256")
      .update(styleMatch?.[1] ?? "", "utf8")
      .digest("base64");
    expect(unsubCsp).toBe(
      `default-src 'none'; script-src 'none'; style-src 'sha256-${expectedStyleHash}'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    );

    const unsubMiddlewareGet = await middleware(
      new NextRequest(`${ORIGIN}/api/me/email-preferences/unsubscribe?token=${encodeURIComponent(tok)}`, {
        method: "GET",
      }),
    );
    expect(unsubMiddlewareGet.headers.get("Content-Security-Policy")).toBe(unsubCsp);
    expect(unsubMiddlewareGet.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(unsubMiddlewareGet.headers.get("Cache-Control")).toBe("private, no-store");

    const unsubMiddlewarePost = await middleware(
      new NextRequest(`${ORIGIN}/api/me/email-preferences/unsubscribe/`, {
        method: "POST",
        headers: {
          "sec-fetch-site": "cross-site",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    expect(unsubMiddlewarePost.status).toBe(200);
    expect(unsubMiddlewarePost.headers.get("Content-Security-Policy")).toBe(unsubCsp);
    expect(unsubMiddlewarePost.headers.get("Referrer-Policy")).toBe("no-referrer");

    const tooBigUnsub = await postUnsubscribe(
      new Request(`${ORIGIN}/api/me/email-preferences/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ token: "a".repeat(10_000) }),
      }),
    );
    expect(tooBigUnsub.status).toBe(413);

    const extraKeyUnsub = await postUnsubscribe(
      new Request(`${ORIGIN}/api/me/email-preferences/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ token: tok, unexpectedKey: true }),
      }),
    );
    expect(extraKeyUnsub.status).toBe(400);

    for (const path of ["/i/SOFIA5", "/p/carlos-sem", "/u/carlos_mx", "/baja"]) {
      const res = await middleware(new NextRequest(`http://127.0.0.1:6420${path}`, { method: "GET" }));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("'nonce-");
      expect(csp).toContain("'sha256-");
      expect(csp).toContain("'strict-dynamic'");
    }

    const cfg = buildNextConfig("phase-production-server");
    const headerRules = await cfg.headers();
    const rootRuleIndex = headerRules.findIndex((r: { source: string }) => r.source === "/:path*");
    const unsubRuleIndex = headerRules.findIndex(
      (r: { source: string }) => r.source === "/api/me/email-preferences/unsubscribe",
    );
    expect(rootRuleIndex).toBeGreaterThanOrEqual(0);
    expect(unsubRuleIndex).toBeGreaterThan(rootRuleIndex);
    const unsubRuleHeaders = headerRules[unsubRuleIndex]?.headers ?? [];
    expect(
      unsubRuleHeaders.find((h: { key: string }) => h.key === "Content-Security-Policy")?.value,
    ).toBe(unsubCsp);
    expect(unsubRuleHeaders.find((h: { key: string }) => h.key === "Referrer-Policy")?.value).toBe(
      "no-referrer",
    );
    const fontsRule = headerRules.find((r: { source: string }) => r.source === "/fonts/:path*");
    expect(fontsRule?.headers.find((h: { key: string }) => h.key === "Cache-Control")?.value).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("rechaza claves extra (.strict()) y cuerpos > límite (413) en los endpoints Zod endurecidos", async () => {
    const member = await signInMagicLink(sharedDb, "strict.member@pitchlab.mx");
    await sharedDb
      .update(users)
      .set({
        handle: "strict_member",
        displayName: "Strict Member",
        isAdult: true,
        birthDate: "1995-01-15",
        termsVersion: SIGNUP_CONSENT_VERSION,
        termsAcceptedAt: new Date(),
      })
      .where(eq(users.id, member.userId));
    await grantDays(sharedDb, {
      userId: member.userId,
      sourceKind: "admin_grant",
      days: 30,
      idempotencyKey: "strict-grant",
      now: new Date(),
    });

    const admin = await signInMagicLink(sharedDb, ADMIN_EMAIL);
    await sharedDb
      .update(authUser)
      .set({ emailVerified: true })
      .where(eq(authUser.id, admin.authUserId));
    await sharedDb
      .update(users)
      .set({
        handle: "admin_sec",
        displayName: "Admin Sec",
        isAdult: true,
        birthDate: "1990-01-15",
        termsVersion: SIGNUP_CONSENT_VERSION,
        termsAcceptedAt: new Date(),
      })
      .where(eq(users.id, admin.userId));

    const oversized = JSON.stringify({ code: "A", padding: "x".repeat(80_000) });
    const makePost = (url: string, cookie: string, body: unknown) =>
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, cookie },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

    expect((await postBetaUnlock(makePost(`${ORIGIN}/api/beta/unlock`, "", { code: "2026", evil: 1 }))).status).toBe(400);
    expect((await postBetaUnlock(makePost(`${ORIGIN}/api/beta/unlock`, "", oversized))).status).toBe(413);

    expect((await postRedeem(makePost(`${ORIGIN}/api/me/redeem`, member.cookieHeader, { code: "ABC", evil: 1 }))).status).toBe(400);
    expect((await postRedeem(makePost(`${ORIGIN}/api/me/redeem`, member.cookieHeader, oversized))).status).toBe(413);

    expect(
      (await postTransfers(makePost(`${ORIGIN}/api/me/transfers`, member.cookieHeader, { planInterval: "monthly", evil: 1 }))).status,
    ).toBe(400);
    expect(
      (
        await patchTransfer(
          new Request(`${ORIGIN}/api/me/transfers/${VALID_UUID}`, {
            method: "PATCH",
            headers: { "content-type": "application/json", origin: ORIGIN, cookie: member.cookieHeader },
            body: JSON.stringify({ originBank: "BBVA", evil: 1 }),
          }),
          { params: Promise.resolve({ id: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);

    expect(
      (await postWatchlist(makePost(`${ORIGIN}/api/me/watchlist`, member.cookieHeader, { gameId: "g1", watched: true, evil: 1 }))).status,
    ).toBe(400);
    expect(
      (
        await postPush(
          makePost(`${ORIGIN}/api/me/push`, member.cookieHeader, {
            endpoint: "https://fcm.googleapis.com/fcm/send/abc",
            keys: { p256dh: "a".repeat(20), auth: "b".repeat(12), extra: 1 },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await getCouponPreview(new Request(`${ORIGIN}/api/me/coupons/preview?codigo=VIP10`, { headers: { cookie: member.cookieHeader } }))).status,
    ).toBe(200);

    expect(
      (await postSocialPosts(makePost(`${ORIGIN}/api/social/posts`, member.cookieHeader, { body: "Hola", extraField: true }))).status,
    ).toBe(400);
    expect(
      (
        await postSocialCopy(
          makePost(`${ORIGIN}/api/social/posts/${VALID_UUID}/copy`, member.cookieHeader, { extra: 1 }),
          { params: Promise.resolve({ id: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await putCommentLike(
          new Request(`${ORIGIN}/api/social/posts/${VALID_UUID}/comments/${VALID_UUID}/like`, {
            method: "PUT",
            headers: { "content-type": "application/json", origin: ORIGIN, cookie: member.cookieHeader },
            body: JSON.stringify({ helpful: true, extra: 1 }),
          }),
          { params: Promise.resolve({ id: VALID_UUID, commentId: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);

    expect(
      (
        await postAdminTipsters(
          makePost(`${ORIGIN}/api/admin/tipsters`, admin.cookieHeader, {
            email: "t@pitchlab.mx",
            handle: "tipster_x",
            displayName: "Tipster X",
            promoCode: "TIPX",
            extra: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postMarkPaid(
          makePost(`${ORIGIN}/api/admin/tipster-payouts/${VALID_UUID}/mark-paid`, admin.cookieHeader, {
            reference: "FOL-123",
            extra: 1,
          }),
          { params: Promise.resolve({ id: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postApproveTransfer(
          makePost(`${ORIGIN}/api/admin/transfers/${VALID_UUID}/approve`, admin.cookieHeader, {
            adminNotes: "ok",
            extra: 1,
          }),
          { params: Promise.resolve({ id: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await postRejectTransfer(
          makePost(`${ORIGIN}/api/admin/transfers/${VALID_UUID}/reject`, admin.cookieHeader, {
            reason: "Falta monto",
            extra: 1,
          }),
          { params: Promise.resolve({ id: VALID_UUID }) },
        )
      ).status,
    ).toBe(400);
  });
});
