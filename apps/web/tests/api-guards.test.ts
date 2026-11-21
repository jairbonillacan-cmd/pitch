import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@pitchlab/db";
import type { AuthenticatedMember } from "../src/server/session-user";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(),
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
  createDb: mocks.createDb,
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

import {
  ApiGuardHttpError,
  recordIdorAttempt,
  resetScrapingVelocityForTests,
  withActivePaseMutation,
  withAdminMutation,
  withCronSecret,
  withMemberMutation,
  withPublicRead,
  withSessionRead,
} from "../src/server/api-guards";
import {
  checkEndpointRateLimit,
  resetRateLimitsForTests,
  setRateLimitDbForTests,
  trustedClientIp,
  verifySameOriginMutation,
} from "../src/server/request-security";
import { hashIpForAudit, logSecurityEvent, redactSensitiveValue } from "../src/server/safe-logger";
import {
  applyMemberWatermarkHeader,
  computeMemberWatermark,
  MEMBER_WATERMARK_HEADER,
  verifyMemberWatermark,
} from "../src/server/watermark";

const ENV_BACKUP = { ...process.env };
const fakeDb = {} as unknown as Db;
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const SAMPLE_MEMBER: AuthenticatedMember = {
  db: fakeDb,
  userId: MEMBER_ID,
  email: "socio@pitchlab.mx",
  emailVerified: true,
  authUserId: "auth_socio_1",
};

const NONE_ACCESS: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const BETA_ACCESS: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

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

const pgRateCounts = new Map<string, number>();

function setNodeEnv(value: string | undefined): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

function sameOriginMutation(
  url: string,
  options: {
    method?: string;
    contentType?: string | null;
    origin?: string | null;
    secFetchSite?: string;
    cookie?: string;
    ip?: string;
    body?: string;
  } = {},
): Request {
  const parsed = new URL(url);
  const headers = new Headers();
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? parsed.origin);
  }
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.secFetchSite) {
    headers.set("sec-fetch-site", options.secFetchSite);
  }
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  if (options.ip) {
    headers.set("cf-connecting-ip", options.ip);
  }
  return new Request(url, {
    method: options.method ?? "POST",
    headers,
    body: options.body ?? JSON.stringify({ ok: true }),
  });
}

beforeEach(() => {
  process.env = { ...ENV_BACKUP };
  setNodeEnv("test");
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.DATABASE_URL;
  delete process.env.CRON_SECRET;
  delete process.env.PITCHLAB_WATERMARK_SECRET;
  delete process.env.PITCHLAB_AUDIT_SALT;
  delete process.env.PITCHLAB_TRUSTED_PROXY;
  process.env.BETTER_AUTH_SECRET = "secreto-test-api-guards-32-caracteres!!";

  pgRateCounts.clear();
  resetRateLimitsForTests();
  setRateLimitDbForTests(null);
  resetScrapingVelocityForTests();

  mocks.createDb.mockReturnValue(fakeDb);
  mocks.getAuth.mockReturnValue({ api: { getSession: vi.fn() } });
  mocks.getViewerAccess.mockResolvedValue(NONE_ACCESS);
  mocks.hasActivePaseTotal.mockResolvedValue(true);
  mocks.isAdminEmail.mockReturnValue(false);
  mocks.recordSecurityAbuseEvent.mockResolvedValue(undefined);
  mocks.revokeUserActiveSessions.mockResolvedValue(2);
  mocks.serverDb.mockReturnValue(fakeDb);
  mocks.signupCompleted.mockResolvedValue(true);

  mocks.requireMember.mockResolvedValue(SAMPLE_MEMBER);
  mocks.requireStep1Member.mockResolvedValue(SAMPLE_MEMBER);
  mocks.requireSocialMember.mockResolvedValue(SAMPLE_MEMBER);
  mocks.requireAdmin.mockResolvedValue({
    db: fakeDb,
    userId: ADMIN_ID,
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
});

afterEach(() => {
  process.env = { ...ENV_BACKUP };
  resetRateLimitsForTests();
  setRateLimitDbForTests(null);
  resetScrapingVelocityForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("safe-logger", () => {
  it("redacta correos, Bearer, Basic, JWT, cookies, credenciales URL, secretos y stacks", () => {
    expect(redactSensitiveValue("Contacto ana.lopez+1@pitchlab.mx falló")).toBe(
      "Contacto [REDACTED_EMAIL] falló",
    );

    const bearerOut = String(redactSensitiveValue("Bearer super_secret_token_98765"));
    expect(bearerOut).toBe("Bearer [REDACTED_TOKEN]");
    expect(bearerOut).not.toContain("super_secret_token_98765");

    const basicOut = String(redactSensitiveValue("Basic dXNlcjpwYXNzMTIzNDU="));
    expect(basicOut).toBe("Basic [REDACTED_TOKEN]");
    expect(basicOut).not.toContain("dXNlcjpwYXNzMTIzNDU=");

    const jwtSample = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.signature_abcdef1234";
    const jwtOut = String(redactSensitiveValue(`token ${jwtSample} recibido`));
    expect(jwtOut).toBe("token [REDACTED_JWT] recibido");
    expect(jwtOut).not.toContain("eyJhbGciOiJIUzI1NiJ9");

    const cookieHeaderOut = String(
      redactSensitiveValue("Cookie: better-auth.session_token=secret123; pl_beta=pin999"),
    );
    expect(cookieHeaderOut).toBe("Cookie: [REDACTED_COOKIE]");
    expect(cookieHeaderOut).not.toContain("secret123");
    expect(cookieHeaderOut).not.toContain("pin999");

    const cookiePairOut = String(
      redactSensitiveValue("pl_beta=pin_value_42; session_id=tok_value_99"),
    );
    expect(cookiePairOut).toBe("pl_beta=[REDACTED_COOKIE]; session_id=[REDACTED_COOKIE]");

    expect(redactSensitiveValue("stripe sk_live_abc1234567890")).toBe("stripe [REDACTED_SECRET]");
    expect(redactSensitiveValue("resend re_abcdefghijklm")).toBe("resend [REDACTED_SECRET]");
    expect(redactSensitiveValue("google ya29.a0AfH6SMBx123456")).toBe("google [REDACTED_SECRET]");
    expect(redactSensitiveValue("postgres://admin:superpass@db.internal:5432/pitchlab")).toBe(
      "postgres://[REDACTED]:[REDACTED]@db.internal:5432/pitchlab",
    );

    const stackOut = String(
      redactSensitiveValue(
        "Fallo en consulta\n    at handler (apps/web/src/server/secret.ts:42:10)\n    at run (node:internal:1:1)",
      ),
    );
    expect(stackOut).toBe("Fallo en consulta");
    expect(stackOut).not.toContain("secret.ts");
    expect(stackOut).not.toContain("at handler");
  });

  it("redacta claves sensibles en objetos, Errors, Headers, ciclos y profundidad", () => {
    const err = new Error("Error para socio@pitchlab.mx con Bearer abcdef123456");
    const redactedErr = redactSensitiveValue(err) as Record<string, unknown>;
    expect(redactedErr).toEqual({
      name: "Error",
      message: "Error para [REDACTED_EMAIL] con Bearer [REDACTED_TOKEN]",
    });
    expect("stack" in redactedErr).toBe(false);

    const obj = redactSensitiveValue({
      email: "privado@pitchlab.mx",
      password: "mi-password",
      authorization: "Bearer secret_123456",
      cookie: "better-auth.session_token=xyz",
      stack: "Error: boom\n    at secret.ts:1:1",
      route: "/api/me/journal",
    }) as Record<string, unknown>;
    expect(obj).toEqual({
      email: "[REDACTED]",
      password: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      stack: "[REDACTED_STACK]",
      route: "/api/me/journal",
    });

    const headers = new Headers({
      authorization: "Bearer secret_header_token",
      "x-trace-note": "socio@pitchlab.mx",
    });
    expect(redactSensitiveValue(headers)).toEqual({
      authorization: "[REDACTED]",
      "x-trace-note": "[REDACTED_EMAIL]",
    });

    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    expect(redactSensitiveValue(circular)).toEqual({ ok: true, self: "[CIRCULAR]" });

    const deep = { a: { b: { c: { d: { e: { f: "hidden" } } } } } };
    expect(redactSensitiveValue(deep)).toEqual({
      a: { b: { c: { d: { e: "[TRUNCATED]" } } } },
    });
  });

  it("hashea IPs con sal determinista y emite JSON redactado en logSecurityEvent", () => {
    process.env.PITCHLAB_AUDIT_SALT = "sal-audit-a";
    const h1 = hashIpForAudit("201.141.88.9");
    const h2 = hashIpForAudit(" 201.141.88.9 ");
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toContain("201.141");

    process.env.PITCHLAB_AUDIT_SALT = "sal-audit-b";
    expect(hashIpForAudit("201.141.88.9")).not.toBe(h1);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logSecurityEvent("warn", "csrf_rejected", {
      email: "victima@pitchlab.mx",
      note: "Bearer secreto_xyz_12345",
    });
    logSecurityEvent("info", "probe_ok", { ok: true });
    logSecurityEvent("error", "boom", { error: new Error("fallo admin@pitchlab.mx") });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnJson = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(warnJson).toContain('"channel":"pitchlab.security"');
    expect(warnJson).toContain('"event":"csrf_rejected"');
    expect(warnJson).not.toContain("victima@pitchlab.mx");
    expect(warnJson).not.toContain("secreto_xyz_12345");

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errJson = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(errJson).not.toContain("admin@pitchlab.mx");
    expect(errJson).not.toContain('"stack"');
  });
});

describe("watermark", () => {
  it("genera, verifica con ventana de 24h y aplica X-PitchLab-Trace", () => {
    process.env.PITCHLAB_WATERMARK_SECRET = "wm-secret-test-key";
    const today = new Date("2026-11-21T15:00:00Z");
    const yesterday = new Date("2026-11-20T15:00:00Z");
    const twoDaysAgo = new Date("2026-11-19T15:00:00Z");

    expect(MEMBER_WATERMARK_HEADER).toBe("X-PitchLab-Trace");

    const tokenToday = computeMemberWatermark(MEMBER_ID, today);
    const tokenTrimmed = computeMemberWatermark(`  ${MEMBER_ID}  `, today);
    const tokenYesterday = computeMemberWatermark(MEMBER_ID, yesterday);
    const tokenTwoDaysAgo = computeMemberWatermark(MEMBER_ID, twoDaysAgo);
    const tokenOtherUser = computeMemberWatermark(ADMIN_ID, today);

    expect(tokenToday).toMatch(/^[0-9a-f]{32}$/);
    expect(tokenToday).toBe(tokenTrimmed);
    expect(tokenToday).not.toBe(tokenYesterday);
    expect(tokenToday).not.toBe(tokenOtherUser);

    expect(verifyMemberWatermark(MEMBER_ID, tokenToday, today)).toBe(true);
    expect(verifyMemberWatermark(MEMBER_ID, tokenYesterday, today)).toBe(true);
    expect(verifyMemberWatermark(MEMBER_ID, tokenTwoDaysAgo, today)).toBe(false);
    expect(verifyMemberWatermark(ADMIN_ID, tokenToday, today)).toBe(false);
    expect(verifyMemberWatermark(MEMBER_ID, tokenToday.toUpperCase(), today)).toBe(false);
    expect(verifyMemberWatermark(MEMBER_ID, "short", today)).toBe(false);
    expect(verifyMemberWatermark("", tokenToday, today)).toBe(false);

    const res = NextResponse.json({ ok: true });
    applyMemberWatermarkHeader(res, MEMBER_ID, today);
    expect(res.headers.get(MEMBER_WATERMARK_HEADER)).toBe(tokenToday);

    const emptyRes = NextResponse.json({ ok: true });
    applyMemberWatermarkHeader(emptyRes, "   ", today);
    expect(emptyRes.headers.get(MEMBER_WATERMARK_HEADER)).toBeNull();
  });
});

describe("request-security", () => {
  it("resuelve IP confiable según modo de proxy y valida CSRF/requireJson", () => {
    const headers = new Headers({
      "cf-connecting-ip": "201.10.20.30",
      "fly-client-ip": "198.51.100.7",
      "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1",
      "x-forwarded-for": "1.1.1.1, 192.0.2.55",
    });

    expect(trustedClientIp(headers, "cloudflare")).toBe("201.10.20.30");
    expect(trustedClientIp(headers, "fly")).toBe("198.51.100.7");
    expect(trustedClientIp(headers, "vercel")).toBe("203.0.113.9");
    expect(trustedClientIp(headers, "xff-last")).toBe("192.0.2.55");
    expect(trustedClientIp(headers, "auto")).toBe("201.10.20.30");
    expect(trustedClientIp(headers, "desconocido")).toBe("");
    expect(trustedClientIp(new Headers({ "cf-connecting-ip": "invalid ip!" }), "cloudflare")).toBe("");

    expect(
      verifySameOriginMutation(
        sameOriginMutation("https://pitchlab.mx/api/me/avatar", {
          contentType: "multipart/form-data; boundary=abc",
        }),
        { requireJson: false },
      ),
    ).toBeNull();

    expect(
      verifySameOriginMutation(
        sameOriginMutation("https://pitchlab.mx/api/me/avatar", {
          contentType: "multipart/form-data; boundary=abc",
        }),
        { requireJson: true },
      )?.status,
    ).toBe(415);
  });

  it("falla cerrado con storeUnavailable en producción cuando Redis y PG fallan", async () => {
    setNodeEnv("production");
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token_test";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const failingFetch = (async () =>
      new Response("upstream down", { status: 500 })) as unknown as typeof fetch;

    const closed = await checkEndpointRateLimit({
      bucket: "prod-fail-closed",
      key: "201.10.20.30",
      limit: 10,
      windowMs: 60_000,
      failClosed: true,
      fetchImpl: failingFetch,
    });
    expect(closed).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
      storeUnavailable: true,
    });

    const open = await checkEndpointRateLimit({
      bucket: "prod-fail-open",
      key: "201.10.20.30",
      limit: 10,
      windowMs: 60_000,
      failClosed: false,
      fetchImpl: failingFetch,
    });
    expect(open.allowed).toBe(true);
    expect(open.storeUnavailable).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("withPublicRead", () => {
  it("aplica headers, rate limit por IP, skipRateLimit y failClosed en producción", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const guarded = withPublicRead<{ handle: string }>(
      { bucket: "pub-read", limit: 2, windowMs: 60_000, cacheControl: "public, max-age=60" },
      ({ params, user, access }) => NextResponse.json({ handle: params.handle, user, access }),
    );

    const req = () =>
      new Request("https://pitchlab.mx/api/u/ana_mx", {
        headers: { "cf-connecting-ip": "201.141.10.1" },
      });
    const ctx = { params: Promise.resolve({ handle: "ana_mx" }) };

    const r1 = await guarded(req(), ctx);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r1.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await r1.json()).toEqual({ handle: "ana_mx", user: null, access: null });

    const r2 = await guarded(req(), ctx);
    expect(r2.status).toBe(200);

    const r3 = await guarded(req(), ctx);
    expect(r3.status).toBe(429);
    expect(r3.headers.get("retry-after")).toBeTruthy();
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ kind: "rate_limit", severity: "low" }),
    );

    setRateLimitDbForTests(fakeDb);
    mocks.incrementPgRateBucket.mockClear();
    const health = withPublicRead(
      { bucket: "health", skipRateLimit: true, limit: 1, failClosed: true, cacheControl: "no-store" },
      () => NextResponse.json({ ok: true }),
    );
    setNodeEnv("production");
    mocks.incrementPgRateBucket.mockRejectedValue(new Error("pg_down"));
    for (let i = 0; i < 4; i += 1) {
      const hRes = await health(new Request("https://pitchlab.mx/api/health"));
      expect(hRes.status).toBe(200);
      expect(hRes.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.incrementPgRateBucket).not.toHaveBeenCalled();

    const closedPublic = withPublicRead(
      { bucket: "pub-closed", limit: 10, failClosed: true },
      () => NextResponse.json({ ok: true }),
    );
    const unavailable = await closedPublic(
      new Request("https://pitchlab.mx/api/handles/check", {
        headers: { "cf-connecting-ip": "201.141.10.2" },
      }),
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("30");
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("valida CSRF y requireJson en mutaciones públicas con verifySameOrigin", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const jsonPost = withPublicRead(
      { bucket: "funnel-post", verifySameOrigin: true, requireJson: true },
      () => NextResponse.json({ ok: true }),
    );
    const noOrigin = await jsonPost(
      sameOriginMutation("https://pitchlab.mx/api/analytics/funnel", { origin: null }),
    );
    expect(noOrigin.status).toBe(403);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ kind: "csrf_rejected", severity: "medium" }),
    );

    const wrongType = await jsonPost(
      sameOriginMutation("https://pitchlab.mx/api/analytics/funnel", { contentType: "text/plain" }),
    );
    expect(wrongType.status).toBe(415);

    const nonJsonAllowed = withPublicRead(
      { bucket: "funnel-beacon", verifySameOrigin: true, requireJson: false },
      () => NextResponse.json({ ok: true }),
    );
    const beaconOk = await nonJsonAllowed(
      sameOriginMutation("https://pitchlab.mx/api/analytics/funnel", {
        contentType: "text/plain",
        body: "ping",
      }),
    );
    expect(beaconOk.status).toBe(200);
  });
});

describe("withSessionRead", () => {
  it("controla allowBetaPin, allowIncompleteSignup, requireFullAccess, requireSocialHandle, watermark y failClosed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const betaEnabledRoute = withSessionRead(
      { bucket: "live-read", allowBetaPin: true, watermark: true },
      ({ user, access }) => NextResponse.json({ userId: user?.userId ?? null, via: access.via }),
    );

    mocks.getViewerAccess.mockResolvedValueOnce(NONE_ACCESS);
    const anonRes = await betaEnabledRoute(new Request("https://pitchlab.mx/api/live/scoreboard"));
    expect(anonRes.status).toBe(401);
    expect(anonRes.headers.get("cache-control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValueOnce(BETA_ACCESS);
    const betaRes = await betaEnabledRoute(new Request("https://pitchlab.mx/api/live/scoreboard"));
    expect(betaRes.status).toBe(200);
    expect(await betaRes.json()).toEqual({ userId: null, via: "beta" });
    expect(betaRes.headers.get(MEMBER_WATERMARK_HEADER)).toBeNull();

    mocks.getViewerAccess.mockResolvedValueOnce(BETA_ACCESS);
    mocks.requireMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "registro_incompleto" }, { status: 403 }),
    });
    const incompleteWithCookie = await betaEnabledRoute(
      new Request("https://pitchlab.mx/api/live/scoreboard", {
        headers: { cookie: "better-auth.session_token=tok" },
      }),
    );
    expect(incompleteWithCookie.status).toBe(403);

    const noBetaRoute = withSessionRead(
      { bucket: "me-read", allowBetaPin: false, watermark: true },
      ({ user }) => NextResponse.json({ userId: user.userId }),
    );
    mocks.getViewerAccess.mockResolvedValue(BETA_ACCESS);
    mocks.requireMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }),
    });
    const rejectedBeta = await noBetaRoute(new Request("https://pitchlab.mx/api/me/journal"));
    expect(rejectedBeta.status).toBe(401);

    mocks.getViewerAccess.mockResolvedValueOnce(ACCOUNT_FULL_ACCESS);
    const memberOk = await noBetaRoute(new Request("https://pitchlab.mx/api/me/journal"));
    expect(memberOk.status).toBe(200);
    const trace = memberOk.headers.get(MEMBER_WATERMARK_HEADER);
    expect(trace).toBeTruthy();
    expect(verifyMemberWatermark(MEMBER_ID, trace!)).toBe(true);

    const step1Route = withSessionRead(
      { bucket: "me-signup-get", allowBetaPin: false, allowIncompleteSignup: true },
      ({ user }) => NextResponse.json({ userId: user.userId }),
    );
    mocks.requireMember.mockClear();
    mocks.requireStep1Member.mockClear();
    const step1Res = await step1Route(new Request("https://pitchlab.mx/api/me/signup"));
    expect(step1Res.status).toBe(200);
    expect(mocks.requireStep1Member).toHaveBeenCalledTimes(1);
    expect(mocks.requireMember).not.toHaveBeenCalled();

    const fullAccessRoute = withSessionRead(
      { bucket: "shell-extend", allowBetaPin: false, requireFullAccess: true },
      () => NextResponse.json({ ok: true }),
    );
    mocks.getViewerAccess.mockResolvedValueOnce(ACCOUNT_NO_PASE);
    const noPaseRes = await fullAccessRoute(new Request("https://pitchlab.mx/api/shell/extend"));
    expect(noPaseRes.status).toBe(403);
    expect(await noPaseRes.json()).toEqual({ ok: false, error: "pase_requerido" });

    const socialRoute = withSessionRead(
      { bucket: "social-feed", requireSocialHandle: true },
      ({ user }) => NextResponse.json({ userId: user.userId }),
    );
    mocks.requireSocialMember.mockClear();
    const socialRes = await socialRoute(new Request("https://pitchlab.mx/api/social/posts"));
    expect(socialRes.status).toBe(200);
    expect(mocks.requireSocialMember).toHaveBeenCalledTimes(1);

    const customCacheRoute = withSessionRead(
      {
        bucket: "cached-read",
        allowBetaPin: false,
        preserveHandlerCacheControl: true,
        cacheControl: "private, no-store",
      },
      () => NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, max-age=15" } }),
    );
    const customCacheRes = await customCacheRoute(new Request("https://pitchlab.mx/api/cached"));
    expect(customCacheRes.headers.get("cache-control")).toBe("private, max-age=15");

    setNodeEnv("production");
    mocks.incrementPgRateBucket.mockRejectedValue(new Error("pg_down"));
    const unavailable = await noBetaRoute(new Request("https://pitchlab.mx/api/me/journal"));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("30");
  });

  it("aplica umbrales de scraping velocity (35 log / 50 -> 429 / 75 -> revokeUserActiveSessions + 403)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const gameRoute = withSessionRead<{ gameId: string }>(
      {
        bucket: "live-game",
        allowBetaPin: false,
        limit: 200,
        ipLimit: 400,
        resourceKey: ({ params }) => params.gameId,
      },
      ({ params }) => NextResponse.json({ gameId: params.gameId }),
    );

    const callGame = (gameId: string) =>
      gameRoute(
        new Request(`https://pitchlab.mx/api/live/games/${gameId}`, {
          headers: { "cf-connecting-ip": "201.141.50.5" },
        }),
        { params: Promise.resolve({ gameId }) },
      );

    for (let i = 1; i <= 34; i += 1) {
      const res = await callGame(`g-${i}`);
      expect(res.status).toBe(200);
    }
    const repeatRes = await callGame("g-1");
    expect(repeatRes.status).toBe(200);
    expect(mocks.recordSecurityAbuseEvent).not.toHaveBeenCalled();
    expect(mocks.revokeUserActiveSessions).not.toHaveBeenCalled();

    const warnRes = await callGame("g-35");
    expect(warnRes.status).toBe(200);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenLastCalledWith(
      fakeDb,
      expect.objectContaining({
        userId: MEMBER_ID,
        kind: "scraping_velocity",
        severity: "medium",
      }),
    );
    expect(warnSpy).toHaveBeenCalled();

    for (let i = 36; i <= 49; i += 1) {
      const res = await callGame(`g-${i}`);
      expect(res.status).toBe(200);
    }
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledTimes(1);

    const throttleRes = await callGame("g-50");
    expect(throttleRes.status).toBe(429);
    expect(throttleRes.headers.get("retry-after")).toBeTruthy();
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenLastCalledWith(
      fakeDb,
      expect.objectContaining({
        userId: MEMBER_ID,
        kind: "scraping_velocity",
        severity: "high",
      }),
    );
    expect(mocks.revokeUserActiveSessions).not.toHaveBeenCalled();

    for (let i = 51; i <= 74; i += 1) {
      const res = await callGame(`g-${i}`);
      expect(res.status).toBe(429);
    }
    expect(mocks.revokeUserActiveSessions).not.toHaveBeenCalled();

    const revokeRes = await callGame("g-75");
    expect(revokeRes.status).toBe(403);
    expect(await revokeRes.json()).toEqual({ ok: false, error: "sesion_revocada" });
    expect(revokeRes.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.revokeUserActiveSessions).toHaveBeenCalledTimes(1);
    expect(mocks.revokeUserActiveSessions).toHaveBeenCalledWith(fakeDb, MEMBER_ID);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledTimes(3);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenLastCalledWith(
      fakeDb,
      expect.objectContaining({
        userId: MEMBER_ID,
        kind: "session_revoked",
        severity: "critical",
      }),
    );
    expect(errorSpy).toHaveBeenCalled();

    const postRevokeRes = await callGame("g-76");
    expect(postRevokeRes.status).toBe(403);
    expect(mocks.revokeUserActiveSessions).toHaveBeenCalledTimes(1);
  });
});

describe("withMemberMutation", () => {
  it("valida CSRF, requireJson: false, allowIncompleteSignup, rate limit, watermark y failClosed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const jsonMutation = withMemberMutation(
      { bucket: "member-mut", limit: 2, watermark: true },
      ({ user }) => NextResponse.json({ ok: true, userId: user.userId }),
    );

    const missingOrigin = await jsonMutation(
      sameOriginMutation("https://pitchlab.mx/api/me/preferences", { origin: null }),
    );
    expect(missingOrigin.status).toBe(403);

    const crossSite = await jsonMutation(
      sameOriginMutation("https://pitchlab.mx/api/me/preferences", { secFetchSite: "cross-site" }),
    );
    expect(crossSite.status).toBe(403);

    const badCt = await jsonMutation(
      sameOriginMutation("https://pitchlab.mx/api/me/preferences", { contentType: "text/plain" }),
    );
    expect(badCt.status).toBe(415);

    const ok1 = await jsonMutation(sameOriginMutation("https://pitchlab.mx/api/me/preferences"));
    expect(ok1.status).toBe(200);
    expect(ok1.headers.get("cache-control")).toBe("private, no-store");
    expect(verifyMemberWatermark(MEMBER_ID, ok1.headers.get(MEMBER_WATERMARK_HEADER) ?? "")).toBe(true);

    const ok2 = await jsonMutation(sameOriginMutation("https://pitchlab.mx/api/me/preferences"));
    expect(ok2.status).toBe(200);

    const limited = await jsonMutation(sameOriginMutation("https://pitchlab.mx/api/me/preferences"));
    expect(limited.status).toBe(429);

    const uploadMutation = withMemberMutation(
      { bucket: "member-avatar", requireJson: false },
      () => NextResponse.json({ uploaded: true }),
    );
    const multipartOk = await uploadMutation(
      sameOriginMutation("https://pitchlab.mx/api/me/avatar", {
        contentType: "multipart/form-data; boundary=test",
        body: "binary",
      }),
    );
    expect(multipartOk.status).toBe(200);

    const signupMutation = withMemberMutation(
      { bucket: "member-signup", allowIncompleteSignup: true },
      ({ user }) => NextResponse.json({ userId: user.userId }),
    );
    mocks.requireMember.mockClear();
    mocks.requireStep1Member.mockClear();
    const signupOk = await signupMutation(sameOriginMutation("https://pitchlab.mx/api/me/signup"));
    expect(signupOk.status).toBe(200);
    expect(mocks.requireStep1Member).toHaveBeenCalledTimes(1);
    expect(mocks.requireMember).not.toHaveBeenCalled();

    setNodeEnv("production");
    mocks.incrementPgRateBucket.mockRejectedValue(new Error("pg_down"));
    const unavailable = await uploadMutation(
      sameOriginMutation("https://pitchlab.mx/api/me/avatar", {
        contentType: "multipart/form-data; boundary=test",
        body: "binary",
      }),
    );
    expect(unavailable.status).toBe(503);
  });
});

describe("withActivePaseMutation", () => {
  it("exige Pase Total vigente, soporta allowBetaPin y bloquea failClosed en producción", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const strictPase = withActivePaseMutation(
      { bucket: "journal-post", watermark: true },
      ({ user, access }) => NextResponse.json({ userId: user.userId, fullAccess: access.fullAccess }),
    );

    mocks.getViewerAccess.mockResolvedValueOnce(ACCOUNT_NO_PASE);
    const noPase = await strictPase(sameOriginMutation("https://pitchlab.mx/api/me/journal"));
    expect(noPase.status).toBe(403);
    expect(await noPase.json()).toEqual({ ok: false, error: "pase_requerido" });

    mocks.getViewerAccess.mockResolvedValueOnce(NONE_ACCESS);
    mocks.hasActivePaseTotal.mockResolvedValueOnce(true);
    const withPase = await strictPase(sameOriginMutation("https://pitchlab.mx/api/me/journal"));
    expect(withPase.status).toBe(200);
    expect(await withPase.json()).toEqual({ userId: MEMBER_ID, fullAccess: true });
    expect(verifyMemberWatermark(MEMBER_ID, withPase.headers.get(MEMBER_WATERMARK_HEADER) ?? "")).toBe(true);

    const betaPase = withActivePaseMutation(
      { bucket: "sgp-post", allowBetaPin: true },
      ({ user, access }) => NextResponse.json({ userId: user?.userId ?? null, via: access.via }),
    );

    mocks.getViewerAccess.mockResolvedValueOnce(BETA_ACCESS);
    const betaOk = await betaPase(sameOriginMutation("https://pitchlab.mx/api/parlays/sgp"));
    expect(betaOk.status).toBe(200);
    expect(await betaOk.json()).toEqual({ userId: null, via: "beta" });

    mocks.getViewerAccess.mockResolvedValueOnce(NONE_ACCESS);
    const anonFail = await betaPase(sameOriginMutation("https://pitchlab.mx/api/parlays/sgp"));
    expect(anonFail.status).toBe(401);

    mocks.getViewerAccess.mockResolvedValueOnce(BETA_ACCESS);
    mocks.requireMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "registro_incompleto" }, { status: 403 }),
    });
    const step1Fail = await betaPase(
      sameOriginMutation("https://pitchlab.mx/api/parlays/sgp", {
        cookie: "better-auth.session_token=tok",
      }),
    );
    expect(step1Fail.status).toBe(403);

    setNodeEnv("production");
    mocks.incrementPgRateBucket.mockRejectedValue(new Error("pg_down"));
    mocks.getViewerAccess.mockResolvedValueOnce(ACCOUNT_FULL_ACCESS);
    const unavailable = await strictPase(sameOriginMutation("https://pitchlab.mx/api/me/journal"));
    expect(unavailable.status).toBe(503);
  });
});

describe("withAdminMutation", () => {
  it("bloquea GET sin allowGet, permite GET con allowGet, exige CSRF/RBAC y failClosed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const postOnlyAdmin = withAdminMutation(
      { bucket: "admin-flags", limit: 2 },
      ({ user, access }) =>
        NextResponse.json({
          userId: user.userId,
          emailVerified: user.emailVerified,
          isAdmin: access.isAdmin,
        }),
    );

    const getDenied = await postOnlyAdmin(new Request("https://pitchlab.mx/api/admin/flags"));
    expect(getDenied.status).toBe(405);
    expect(await getDenied.json()).toEqual({ ok: false, error: "metodo_no_permitido" });

    const csrfDenied = await postOnlyAdmin(
      sameOriginMutation("https://pitchlab.mx/api/admin/flags", { origin: "https://evil.example" }),
    );
    expect(csrfDenied.status).toBe(403);
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ kind: "csrf_rejected", severity: "high" }),
    );

    mocks.requireAdmin.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Solo para el equipo fundador" }, { status: 403 }),
    });
    const nonAdmin = await postOnlyAdmin(sameOriginMutation("https://pitchlab.mx/api/admin/flags"));
    expect(nonAdmin.status).toBe(403);
    expect(warnSpy).toHaveBeenCalled();

    const adminPostOk = await postOnlyAdmin(sameOriginMutation("https://pitchlab.mx/api/admin/flags"));
    expect(adminPostOk.status).toBe(200);
    expect(await adminPostOk.json()).toEqual({
      userId: ADMIN_ID,
      emailVerified: true,
      isAdmin: true,
    });

    const readAdmin = withAdminMutation(
      { bucket: "admin-overview", allowGet: true },
      ({ user }) => NextResponse.json({ admin: user.email }),
    );
    const adminGetOk = await readAdmin(new Request("https://pitchlab.mx/api/admin/overview"));
    expect(adminGetOk.status).toBe(200);
    expect(await adminGetOk.json()).toEqual({ admin: "founder@pitchlab.mx" });

    setNodeEnv("production");
    mocks.incrementPgRateBucket.mockRejectedValue(new Error("pg_down"));
    const unavailable = await readAdmin(new Request("https://pitchlab.mx/api/admin/overview"));
    expect(unavailable.status).toBe(503);
  });
});

describe("withCronSecret", () => {
  it("exige CRON_SECRET con Bearer válido, aplica rate limit y opera fail-open en producción", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const cronRoute = withCronSecret(
      { bucket: "cron-settle", limit: 2, windowMs: 60_000 },
      ({ user, access }) => NextResponse.json({ ok: true, user, access }),
    );

    const noEnv = await cronRoute(new Request("https://pitchlab.mx/api/cron/settle-picks"));
    expect(noEnv.status).toBe(503);
    expect(noEnv.headers.get("cache-control")).toBe("no-store");

    process.env.CRON_SECRET = "cron-super-secret-2026";

    const wrongToken = await cronRoute(
      new Request("https://pitchlab.mx/api/cron/settle-picks", {
        headers: { authorization: "Bearer incorrecto" },
      }),
    );
    expect(wrongToken.status).toBe(401);

    setNodeEnv("production");
    const validReq = () =>
      new Request("https://pitchlab.mx/api/cron/settle-picks", {
        headers: {
          authorization: "Bearer cron-super-secret-2026",
          "cf-connecting-ip": "198.51.100.22",
        },
      });

    const ok1 = await cronRoute(validReq());
    expect(ok1.status).toBe(200);
    expect(ok1.headers.get("cache-control")).toBe("no-store");
    expect(ok1.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await ok1.json()).toEqual({ ok: true, user: null, access: null });

    const ok2 = await cronRoute(validReq());
    expect(ok2.status).toBe(200);

    const limited = await cronRoute(validReq());
    expect(limited.status).toBe(429);
  });
});

describe("sanitización de errores y auditoría IDOR", () => {
  it("no filtra detalles internos en errores inesperados, ZodError ni SyntaxError y respeta ApiGuardHttpError", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const crashingRoute = withSessionRead(
      { bucket: "crash-test", allowBetaPin: false },
      () => {
        throw new Error(
          "PG_FAIL para socio@pitchlab.mx con Bearer sk_live_secret_99999999 y postgres://root:topsecret@10.0.0.9/db",
        );
      },
    );
    const crashRes = await crashingRoute(new Request("https://pitchlab.mx/api/crash"));
    expect(crashRes.status).toBe(500);
    expect(crashRes.headers.get("cache-control")).toBe("private, no-store");
    expect(crashRes.headers.get("x-content-type-options")).toBe("nosniff");
    const crashText = await crashRes.text();
    expect(JSON.parse(crashText)).toEqual({ ok: false, error: "error_interno" });
    expect(crashText).not.toContain("PG_FAIL");
    expect(crashText).not.toContain("socio@pitchlab.mx");
    expect(crashText).not.toContain("sk_live_secret");
    expect(crashText).not.toContain("topsecret");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedError = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(loggedError).not.toContain("socio@pitchlab.mx");
    expect(loggedError).not.toContain("sk_live_secret_99999999");
    expect(loggedError).not.toContain("topsecret");

    const stringThrowRoute = withPublicRead(
      { bucket: "throw-string", skipRateLimit: true },
      () => {
        throw "secreto_crudo_sin_error_instance";
      },
    );
    const stringRes = await stringThrowRoute(new Request("https://pitchlab.mx/api/throw-string"));
    expect(stringRes.status).toBe(500);
    const stringText = await stringRes.text();
    expect(JSON.parse(stringText)).toEqual({ ok: false, error: "error_interno" });
    expect(stringText).not.toContain("secreto_crudo");

    const zodLikeRoute = withMemberMutation({ bucket: "zod-like" }, () => {
      const zodErr = Object.assign(new Error("Zod internal schema path"), {
        name: "ZodError",
        issues: [{ path: ["columna_secreta"], message: "Expected positive integer" }],
      });
      throw zodErr;
    });
    const zodRes = await zodLikeRoute(sameOriginMutation("https://pitchlab.mx/api/zod"));
    expect(zodRes.status).toBe(400);
    const zodText = await zodRes.text();
    expect(JSON.parse(zodText)).toEqual({ ok: false, error: "datos_invalidos" });
    expect(zodText).not.toContain("columna_secreta");
    expect(zodText).not.toContain("Expected positive integer");

    const syntaxRoute = withMemberMutation({ bucket: "syntax-err" }, async ({ request }) => {
      await request.json();
      return NextResponse.json({ ok: true });
    });
    const syntaxRes = await syntaxRoute(
      sameOriginMutation("https://pitchlab.mx/api/syntax", { body: "{invalido" }),
    );
    expect(syntaxRes.status).toBe(400);
    expect(await syntaxRes.json()).toEqual({ ok: false, error: "cuerpo_json_invalido" });

    const httpErrorRoute = withPublicRead({ bucket: "http-err", skipRateLimit: true }, () => {
      throw new ApiGuardHttpError(409, "conflicto_negocio", "Operación ya procesada");
    });
    const httpErrRes = await httpErrorRoute(new Request("https://pitchlab.mx/api/conflict"));
    expect(httpErrRes.status).toBe(409);
    expect(await httpErrRes.json()).toEqual({
      ok: false,
      error: "conflicto_negocio",
      message: "Operación ya procesada",
    });

    await recordIdorAttempt({
      db: fakeDb,
      userId: MEMBER_ID,
      ipHash: hashIpForAudit("201.141.88.9"),
      route: "/api/social/posts/otro-id",
      details: { targetId: "otro-id" },
    });
    expect(mocks.recordSecurityAbuseEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        userId: MEMBER_ID,
        route: "/api/social/posts/otro-id",
        kind: "idor_attempt",
        severity: "high",
      }),
    );
    expect(warnSpy).toHaveBeenCalled();
  });
});
