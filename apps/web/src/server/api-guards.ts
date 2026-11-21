import { NextResponse } from "next/server";
import {
  hasActivePaseTotal,
  recordSecurityAbuseEvent,
  revokeUserActiveSessions,
  signupCompleted,
  type Db,
} from "@pitchlab/db";
import { getAuth } from "./auth";
import { requireCronAuth } from "./cron-auth";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  serviceUnavailableRateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "./request-security";
import { hashIpForAudit, logSecurityEvent } from "./safe-logger";
import {
  isAdminEmail,
  requireAdmin,
  requireMember,
  requireStep1Member,
  serverDb,
  type AuthenticatedMember,
} from "./session-user";
import { requireSocialMember } from "./social";
import { getViewerAccess, type ViewerAccess } from "./viewer-access";
import { applyMemberWatermarkHeader } from "./watermark";

export type RouteParams = Record<string, string | string[]>;

export interface NextRouteContext<TParams extends RouteParams = Record<string, never>> {
  params: Promise<TParams>;
}

export type GuardedRouteHandler<TParams extends RouteParams = Record<string, never>> = (
  request?: Request,
  ctx?: NextRouteContext<TParams>,
) => Promise<Response>;

export interface AdminMember {
  db: Db;
  userId: string;
  email: string;
  emailVerified: true;
}

export interface BaseGuardContext<
  TParams extends RouteParams,
  TUser,
  TAccess,
> {
  request: Request;
  params: TParams;
  ip: string;
  ipHash: string;
  user: TUser;
  access: TAccess;
}

export type PublicReadContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, null, null>;

export type SessionReadContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AuthenticatedMember | null, ViewerAccess>;

export type MemberSessionReadContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AuthenticatedMember, ViewerAccess>;

export type MemberMutationContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AuthenticatedMember, ViewerAccess | null>;

export type ActivePaseMutationContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AuthenticatedMember, ViewerAccess>;

export type ActivePaseBetaMutationContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AuthenticatedMember | null, ViewerAccess>;

export type AdminMutationContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, AdminMember, ViewerAccess>;

export type CronSecretContext<TParams extends RouteParams = Record<string, never>> =
  BaseGuardContext<TParams, null, null>;

export interface PublicReadConfig {
  bucket: string;
  limit?: number;
  windowMs?: number;
  failClosed?: boolean;
  skipRateLimit?: boolean;
  verifySameOrigin?: boolean;
  requireJson?: boolean;
  cacheControl?: string;
}

export interface SessionReadConfig<TParams extends RouteParams = Record<string, never>> {
  bucket: string;
  limit?: number;
  ipLimit?: number;
  windowMs?: number;
  failClosed?: boolean;
  allowBeta?: boolean;
  allowBetaPin?: boolean;
  allowStep1?: boolean;
  allowIncompleteSignup?: boolean;
  requireFullAccess?: boolean;
  requireSocialHandle?: boolean;
  watermark?: boolean;
  cacheControl?: string;
  preserveHandlerCacheControl?: boolean;
  resourceKey?: (input: { request: Request; params: TParams }) => string | null | undefined;
}

export interface MemberMutationConfig {
  bucket: string;
  limit?: number;
  windowMs?: number;
  failClosed?: boolean;
  requireJson?: boolean;
  allowStep1?: boolean;
  allowIncompleteSignup?: boolean;
  requireSocialHandle?: boolean;
  watermark?: boolean;
}

export interface ActivePaseMutationConfig extends MemberMutationConfig {
  allowBeta?: boolean;
  allowBetaPin?: boolean;
}

export interface AdminMutationConfig {
  bucket: string;
  limit?: number;
  windowMs?: number;
  failClosed?: boolean;
  allowGet?: boolean;
  requireJson?: boolean;
}

export interface CronSecretConfig {
  bucket: string;
  limit?: number;
  windowMs?: number;
}

export class ApiGuardHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage?: string;

  constructor(status: number, code: string, publicMessage?: string) {
    super(code);
    this.name = "ApiGuardHttpError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

type AbuseKind =
  | "rate_limit"
  | "scraping_velocity"
  | "session_revoked"
  | "csrf_rejected"
  | "idor_attempt";

type AbuseSeverity = "low" | "medium" | "high" | "critical";

interface VelocityWindowEntry {
  resetAt: number;
  resources: Set<string>;
  warned: boolean;
  throttledLogged: boolean;
  revoked: boolean;
}

const DEFAULT_WINDOW_MS = 60_000;
const VELOCITY_WINDOW_MS = 5 * 60_000;
const VELOCITY_WARN_THRESHOLD = 35;
const VELOCITY_THROTTLE_THRESHOLD = 50;
const VELOCITY_REVOKE_THRESHOLD = 75;
const MAX_VELOCITY_ENTRIES = 5_000;
const PRIVATE_NO_STORE = "private, no-store";
const NO_STORE = "no-store";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const velocityStore = new Map<string, VelocityWindowEntry>();

export function resetScrapingVelocityForTests(): void {
  velocityStore.clear();
}

function pruneVelocityStore(nowMs: number): void {
  if (velocityStore.size < MAX_VELOCITY_ENTRIES) return;
  for (const [key, entry] of velocityStore) {
    if (entry.resetAt <= nowMs) {
      velocityStore.delete(key);
    }
    if (velocityStore.size < MAX_VELOCITY_ENTRIES * 0.8) return;
  }
  while (velocityStore.size >= MAX_VELOCITY_ENTRIES) {
    const oldest = velocityStore.keys().next().value;
    if (oldest === undefined) break;
    velocityStore.delete(oldest);
  }
}

function normalizeRequest(request?: Request): Request {
  return request ?? new Request("http://127.0.0.1/");
}

function routePathForAudit(request: Request, fallbackBucket: string): string {
  try {
    const pathname = new URL(request.url).pathname;
    return pathname || `/${fallbackBucket}`;
  } catch (err) {
    void err;
    return `/${fallbackBucket}`;
  }
}

async function resolveParams<TParams extends RouteParams>(
  ctx?: NextRouteContext<TParams>,
): Promise<TParams> {
  if (!ctx?.params) {
    return {} as TParams;
  }
  return await ctx.params;
}

function applyGuardHeaders(
  response: Response,
  headersToSet: Record<string, string>,
  preserveCacheControl = false,
): Response {
  const effectiveEntries = Object.entries(headersToSet).filter(([key]) => {
    if (preserveCacheControl && key.toLowerCase() === "cache-control") {
      return !response.headers.has("cache-control");
    }
    return true;
  });

  try {
    for (const [key, value] of effectiveEntries) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    void err;
    const clonedHeaders = new Headers(response.headers);
    for (const [key, value] of effectiveEntries) {
      clonedHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: clonedHeaders,
    });
  }
}

async function safeRecordAbuse(
  db: Db | null,
  params: {
    userId?: string | null;
    ipHash: string;
    route: string;
    kind: AbuseKind;
    severity: AbuseSeverity;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const targetDb = db ?? serverDb("");
  if (!targetDb) return;
  try {
    await recordSecurityAbuseEvent(targetDb, params);
  } catch (err) {
    logSecurityEvent("warn", "security_abuse_record_failed", {
      route: params.route,
      kind: params.kind,
      error: err,
    });
  }
}

export async function recordIdorAttempt(params: {
  db?: Db | null;
  userId?: string | null;
  ipHash: string;
  route: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  logSecurityEvent("warn", "idor_attempt", {
    userId: params.userId ?? null,
    ipHash: params.ipHash,
    route: params.route,
    details: params.details,
  });
  await safeRecordAbuse(params.db ?? null, {
    userId: params.userId ?? null,
    ipHash: params.ipHash,
    route: params.route,
    kind: "idor_attempt",
    severity: "high",
    details: params.details,
  });
}

function isValidationLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (error instanceof Error && error.name === "ZodError") return true;
  if ("issues" in error && Array.isArray((error as { issues?: unknown }).issues)) return true;
  return false;
}

function sanitizeErrorResponse(
  error: unknown,
  route: string,
  ipHash: string,
  userId: string | null,
  cacheControl: string,
): NextResponse {
  if (error instanceof ApiGuardHttpError) {
    const body: Record<string, unknown> = { ok: false, error: error.code };
    if (error.publicMessage) {
      body.message = error.publicMessage;
    }
    return NextResponse.json(body, {
      status: error.status,
      headers: {
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (isValidationLikeError(error)) {
    logSecurityEvent("warn", "api_validation_rejected", { route, ipHash, userId });
    return NextResponse.json(
      { ok: false, error: "datos_invalidos" },
      {
        status: 400,
        headers: {
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { ok: false, error: "cuerpo_json_invalido" },
      {
        status: 400,
        headers: {
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  logSecurityEvent("error", "api_unhandled_error", {
    route,
    ipHash,
    userId,
    error,
  });

  return NextResponse.json(
    { ok: false, error: "error_interno" },
    {
      status: 500,
      headers: {
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function safeGetViewerAccess(): Promise<ViewerAccess | null> {
  try {
    return await getViewerAccess();
  } catch (err) {
    void err;
    return null;
  }
}

async function synthesizeAccessFromMember(
  member: AuthenticatedMember,
  knownSignupComplete?: boolean,
  knownFullAccess?: boolean,
): Promise<ViewerAccess> {
  const verifiedAdmin = Boolean(member.emailVerified) && isAdminEmail(member.email);
  let complete = knownSignupComplete ?? false;
  if (knownSignupComplete === undefined) {
    try {
      complete = await signupCompleted(member.db, member.userId);
    } catch (err) {
      void err;
      complete = false;
    }
  }
  let hasPass = knownFullAccess ?? verifiedAdmin;
  if (knownFullAccess === undefined && !verifiedAdmin) {
    try {
      hasPass = await hasActivePaseTotal(member.db, member.userId, new Date());
    } catch (err) {
      void err;
      hasPass = false;
    }
  }
  return {
    via: "account",
    signupComplete: complete,
    fullAccess: complete && (hasPass || verifiedAdmin),
    isAdmin: complete && verifiedAdmin,
    isTipster: false,
    profile: null,
  };
}

async function evaluateScrapingVelocity(params: {
  subjectKey: string;
  bucket: string;
  resource: string;
  route: string;
  ipHash: string;
  user: AuthenticatedMember | null;
}): Promise<Response | null> {
  const nowMs = Date.now();
  const mapKey = `${params.subjectKey}:${params.bucket}`;
  let entry = velocityStore.get(mapKey);
  if (!entry || entry.resetAt <= nowMs) {
    pruneVelocityStore(nowMs);
    entry = {
      resetAt: nowMs + VELOCITY_WINDOW_MS,
      resources: new Set<string>(),
      warned: false,
      throttledLogged: false,
      revoked: false,
    };
    velocityStore.set(mapKey, entry);
  }

  entry.resources.add(params.resource.slice(0, 160));
  const distinctCount = entry.resources.size;

  if (distinctCount >= VELOCITY_REVOKE_THRESHOLD) {
    const alreadyRevoked = entry.revoked;
    entry.revoked = true;
    logSecurityEvent("error", "session_revoked", {
      bucket: params.bucket,
      route: params.route,
      userId: params.user?.userId ?? null,
      ipHash: params.ipHash,
      distinctResources: distinctCount,
    });
    if (!alreadyRevoked) {
      if (params.user) {
        try {
          await revokeUserActiveSessions(params.user.db, params.user.userId);
        } catch (err) {
          logSecurityEvent("error", "session_revoke_failed", {
            route: params.route,
            userId: params.user.userId,
            error: err,
          });
        }
      }
      await safeRecordAbuse(params.user?.db ?? null, {
        userId: params.user?.userId ?? null,
        ipHash: params.ipHash,
        route: params.route,
        kind: "session_revoked",
        severity: "critical",
        details: {
          bucket: params.bucket,
          distinctResources: distinctCount,
          windowMs: VELOCITY_WINDOW_MS,
        },
      });
    }
    return NextResponse.json(
      { ok: false, error: "sesion_revocada" },
      {
        status: 403,
        headers: {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  if (distinctCount >= VELOCITY_THROTTLE_THRESHOLD) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - nowMs) / 1000));
    if (!entry.throttledLogged) {
      entry.throttledLogged = true;
      logSecurityEvent("warn", "scraping_velocity", {
        bucket: params.bucket,
        route: params.route,
        userId: params.user?.userId ?? null,
        ipHash: params.ipHash,
        distinctResources: distinctCount,
        severity: "high",
      });
      await safeRecordAbuse(params.user?.db ?? null, {
        userId: params.user?.userId ?? null,
        ipHash: params.ipHash,
        route: params.route,
        kind: "scraping_velocity",
        severity: "high",
        details: {
          bucket: params.bucket,
          distinctResources: distinctCount,
          windowMs: VELOCITY_WINDOW_MS,
        },
      });
    }
    return rateLimitResponse(
      retryAfterSeconds,
      "Actividad automatizada detectada. Intenta de nuevo más tarde.",
    );
  }

  if (distinctCount >= VELOCITY_WARN_THRESHOLD && !entry.warned) {
    entry.warned = true;
    logSecurityEvent("warn", "scraping_velocity", {
      bucket: params.bucket,
      route: params.route,
      userId: params.user?.userId ?? null,
      ipHash: params.ipHash,
      distinctResources: distinctCount,
      severity: "medium",
    });
    await safeRecordAbuse(params.user?.db ?? null, {
      userId: params.user?.userId ?? null,
      ipHash: params.ipHash,
      route: params.route,
      kind: "scraping_velocity",
      severity: "medium",
      details: {
        bucket: params.bucket,
        distinctResources: distinctCount,
        windowMs: VELOCITY_WINDOW_MS,
      },
    });
  }

  return null;
}

export function withPublicRead<TParams extends RouteParams = Record<string, never>>(
  config: PublicReadConfig,
  handler: (ctx: PublicReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 60;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const failClosed = config.failClosed ?? false;
  const skipRateLimit = config.skipRateLimit === true;
  const verifySameOrigin = config.verifySameOrigin === true;
  const requireJson = config.requireJson === true;

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);

    if (verifySameOrigin && MUTATION_METHODS.has(req.method.toUpperCase())) {
      const csrfError = verifySameOriginMutation(req, { requireJson });
      if (csrfError) {
        logSecurityEvent("warn", "csrf_rejected", {
          bucket: config.bucket,
          route,
          ipHash,
          status: csrfError.status,
        });
        await safeRecordAbuse(null, {
          userId: null,
          ipHash,
          route,
          kind: "csrf_rejected",
          severity: "medium",
          details: { bucket: config.bucket, status: csrfError.status },
        });
        return applyGuardHeaders(csrfError, {
          "Cache-Control": NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
    }

    if (!skipRateLimit) {
      const rl = await checkEndpointRateLimit({
        bucket: config.bucket,
        key: ip,
        limit,
        windowMs,
        failClosed,
      });
      if (rl.storeUnavailable) {
        return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
      }
      if (!rl.allowed) {
        logSecurityEvent("warn", "rate_limit_exceeded", {
          bucket: config.bucket,
          route,
          ipHash,
        });
        await safeRecordAbuse(null, {
          userId: null,
          ipHash,
          route,
          kind: "rate_limit",
          severity: "low",
          details: { bucket: config.bucket },
        });
        return rateLimitResponse(rl.retryAfterSeconds);
      }
    }

    try {
      const params = await resolveParams(ctx);
      const response = await handler({
        request: req,
        params,
        ip,
        ipHash,
        user: null,
        access: null,
      });
      const headersToSet: Record<string, string> = {
        "X-Content-Type-Options": "nosniff",
      };
      if (config.cacheControl && !response.headers.has("cache-control")) {
        headersToSet["Cache-Control"] = config.cacheControl;
      }
      return applyGuardHeaders(response, headersToSet);
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, null, NO_STORE);
    }
  };
}

export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams> & { allowBeta: false },
  handler: (ctx: MemberSessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams> & { allowBetaPin: false },
  handler: (ctx: MemberSessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams> & { requireSocialHandle: true },
  handler: (ctx: MemberSessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams> & { allowBeta?: true; allowBetaPin?: true },
  handler: (ctx: SessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams>,
  handler: (ctx: SessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withSessionRead<TParams extends RouteParams = Record<string, never>>(
  config: SessionReadConfig<TParams>,
  handler: (ctx: MemberSessionReadContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 90;
  const ipLimit = config.ipLimit ?? Math.max(limit * 2, 120);
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const failClosed = config.failClosed ?? true;
  const requireSocialHandle = config.requireSocialHandle === true;
  const allowBeta =
    !requireSocialHandle &&
    config.allowBeta !== false &&
    config.allowBetaPin !== false;
  const allowStep1 = config.allowStep1 === true || config.allowIncompleteSignup === true;
  const cacheControl = config.cacheControl ?? PRIVATE_NO_STORE;

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);

    let user: AuthenticatedMember | null = null;
    let access: ViewerAccess | null = null;

    if (requireSocialHandle) {
      const socialMemberRes = await requireSocialMember(req);
      if ("error" in socialMemberRes) {
        return applyGuardHeaders(socialMemberRes.error, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
      user = socialMemberRes;
      const viewer = await safeGetViewerAccess();
      access =
        viewer && viewer.via === "account"
          ? viewer
          : await synthesizeAccessFromMember(socialMemberRes, true, true);
    } else if (!allowBeta) {
      const memberRes = allowStep1
        ? await requireStep1Member(req)
        : await requireMember(req);
      if ("error" in memberRes) {
        return applyGuardHeaders(memberRes.error, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
      user = memberRes;
      const viewer = await safeGetViewerAccess();
      access =
        viewer && viewer.via === "account"
          ? viewer
          : await synthesizeAccessFromMember(memberRes, allowStep1 ? undefined : true);
    } else {
      let step1ErrorResponse: NextResponse | null = null;
      if (req.headers.get("cookie")) {
        try {
          if (getAuth()) {
            const memberRes = allowStep1
              ? await requireStep1Member(req)
              : await requireMember(req);
            if ("error" in memberRes) {
              if (memberRes.error.status === 403) {
                step1ErrorResponse = memberRes.error;
              }
            } else {
              user = memberRes;
            }
          }
        } catch (err) {
          void err;
        }
      }

      const viewer = await safeGetViewerAccess();
      if (user) {
        access =
          viewer && viewer.via === "account"
            ? viewer
            : await synthesizeAccessFromMember(user, allowStep1 ? undefined : true);
      } else if (step1ErrorResponse) {
        return applyGuardHeaders(step1ErrorResponse, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      } else if (viewer && viewer.via !== "none") {
        access = viewer;
      } else {
        return NextResponse.json(
          { error: "unauthorized" },
          {
            status: 401,
            headers: {
              "Cache-Control": PRIVATE_NO_STORE,
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
    }

    if (config.requireFullAccess === true && !access.fullAccess) {
      return NextResponse.json(
        { ok: false, error: "pase_requerido" },
        {
          status: 403,
          headers: {
            "Cache-Control": PRIVATE_NO_STORE,
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    const subjectKey = user ? `u:${user.userId}` : `b:${ipHash}`;
    const [subjectRl, ipRl] = await Promise.all([
      checkEndpointRateLimit({
        bucket: config.bucket,
        key: subjectKey,
        limit,
        windowMs,
        failClosed,
        db: user?.db,
      }),
      checkEndpointRateLimit({
        bucket: `${config.bucket}:ip`,
        key: ip,
        limit: ipLimit,
        windowMs,
        failClosed,
        db: user?.db,
      }),
    ]);

    if (subjectRl.storeUnavailable || ipRl.storeUnavailable) {
      return serviceUnavailableRateLimitResponse(
        Math.max(subjectRl.retryAfterSeconds, ipRl.retryAfterSeconds),
      );
    }

    if (!subjectRl.allowed || !ipRl.allowed) {
      const retryAfterSeconds = Math.max(subjectRl.retryAfterSeconds, ipRl.retryAfterSeconds);
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: config.bucket,
        route,
        userId: user?.userId ?? null,
        ipHash,
      });
      await safeRecordAbuse(user?.db ?? null, {
        userId: user?.userId ?? null,
        ipHash,
        route,
        kind: "rate_limit",
        severity: "low",
        details: { bucket: config.bucket },
      });
      return rateLimitResponse(retryAfterSeconds);
    }

    try {
      const params = await resolveParams(ctx);
      if (config.resourceKey) {
        const resource = config.resourceKey({ request: req, params })?.trim();
        if (resource) {
          const velocityBlocked = await evaluateScrapingVelocity({
            subjectKey,
            bucket: config.bucket,
            resource,
            route,
            ipHash,
            user,
          });
          if (velocityBlocked) {
            return velocityBlocked;
          }
        }
      }

      const rawResponse = await (
        handler as (ctx: SessionReadContext<TParams>) => Promise<Response> | Response
      )({
        request: req,
        params,
        ip,
        ipHash,
        user,
        access,
      });

      let response = applyGuardHeaders(
        rawResponse,
        {
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
        },
        config.preserveHandlerCacheControl === true,
      );

      if (config.watermark === true && user?.userId) {
        response = applyMemberWatermarkHeader(response, user.userId);
      }

      return response;
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, user?.userId ?? null, PRIVATE_NO_STORE);
    }
  };
}

export function withMemberMutation<TParams extends RouteParams = Record<string, never>>(
  config: MemberMutationConfig,
  handler: (ctx: MemberMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 30;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const failClosed = config.failClosed ?? true;
  const requireJson = config.requireJson ?? true;
  const allowStep1 = config.allowStep1 === true || config.allowIncompleteSignup === true;
  const requireSocialHandle = config.requireSocialHandle === true;

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);

    const csrfError = verifySameOriginMutation(req, { requireJson });
    if (csrfError) {
      logSecurityEvent("warn", "csrf_rejected", {
        bucket: config.bucket,
        route,
        ipHash,
        status: csrfError.status,
      });
      await safeRecordAbuse(null, {
        userId: null,
        ipHash,
        route,
        kind: "csrf_rejected",
        severity: "medium",
        details: { bucket: config.bucket, status: csrfError.status },
      });
      return applyGuardHeaders(csrfError, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    }

    const memberRes = requireSocialHandle
      ? await requireSocialMember(req)
      : allowStep1
        ? await requireStep1Member(req)
        : await requireMember(req);
    if ("error" in memberRes) {
      return applyGuardHeaders(memberRes.error, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    }

    const rl = await checkEndpointRateLimit({
      bucket: config.bucket,
      key: memberRes.userId,
      limit,
      windowMs,
      failClosed,
      db: memberRes.db,
    });
    if (rl.storeUnavailable) {
      return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
    }
    if (!rl.allowed) {
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: config.bucket,
        route,
        userId: memberRes.userId,
        ipHash,
      });
      await safeRecordAbuse(memberRes.db, {
        userId: memberRes.userId,
        ipHash,
        route,
        kind: "rate_limit",
        severity: "low",
        details: { bucket: config.bucket },
      });
      return rateLimitResponse(rl.retryAfterSeconds);
    }

    try {
      const params = await resolveParams(ctx);
      const rawResponse = await handler({
        request: req,
        params,
        ip,
        ipHash,
        user: memberRes,
        access: null,
      });
      let response = applyGuardHeaders(rawResponse, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
      if (config.watermark === true) {
        response = applyMemberWatermarkHeader(response, memberRes.userId);
      }
      return response;
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, memberRes.userId, PRIVATE_NO_STORE);
    }
  };
}

export function withActivePaseMutation<TParams extends RouteParams = Record<string, never>>(
  config: ActivePaseMutationConfig & { allowBeta: true },
  handler: (ctx: ActivePaseBetaMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withActivePaseMutation<TParams extends RouteParams = Record<string, never>>(
  config: ActivePaseMutationConfig & { allowBetaPin: true },
  handler: (ctx: ActivePaseBetaMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withActivePaseMutation<TParams extends RouteParams = Record<string, never>>(
  config: ActivePaseMutationConfig & { allowBeta?: false; allowBetaPin?: false },
  handler: (ctx: ActivePaseMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withActivePaseMutation<TParams extends RouteParams = Record<string, never>>(
  config: ActivePaseMutationConfig,
  handler: (ctx: ActivePaseBetaMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams>;
export function withActivePaseMutation<TParams extends RouteParams = Record<string, never>>(
  config: ActivePaseMutationConfig,
  handler: (ctx: ActivePaseMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 30;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const failClosed = config.failClosed ?? true;
  const requireJson = config.requireJson ?? true;
  const requireSocialHandle = config.requireSocialHandle === true;
  const allowBeta =
    !requireSocialHandle && (config.allowBeta === true || config.allowBetaPin === true);

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);

    const csrfError = verifySameOriginMutation(req, { requireJson });
    if (csrfError) {
      logSecurityEvent("warn", "csrf_rejected", {
        bucket: config.bucket,
        route,
        ipHash,
        status: csrfError.status,
      });
      await safeRecordAbuse(null, {
        userId: null,
        ipHash,
        route,
        kind: "csrf_rejected",
        severity: "medium",
        details: { bucket: config.bucket, status: csrfError.status },
      });
      return applyGuardHeaders(csrfError, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    }

    let user: AuthenticatedMember | null = null;
    let access: ViewerAccess | null = null;

    if (requireSocialHandle) {
      const socialMemberRes = await requireSocialMember(req);
      if ("error" in socialMemberRes) {
        return applyGuardHeaders(socialMemberRes.error, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
      user = socialMemberRes;
      const viewer = await safeGetViewerAccess();
      access =
        viewer && viewer.via === "account"
          ? viewer
          : await synthesizeAccessFromMember(socialMemberRes, true, true);
    } else if (!allowBeta) {
      const memberRes = await requireMember(req);
      if ("error" in memberRes) {
        return applyGuardHeaders(memberRes.error, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
      user = memberRes;
      const viewer = await safeGetViewerAccess();
      access =
        viewer && viewer.via === "account"
          ? viewer
          : await synthesizeAccessFromMember(memberRes, true);
    } else {
      let step1ErrorResponse: NextResponse | null = null;
      if (req.headers.get("cookie")) {
        try {
          if (getAuth()) {
            const memberRes = await requireMember(req);
            if ("error" in memberRes) {
              if (memberRes.error.status === 403) {
                step1ErrorResponse = memberRes.error;
              }
            } else {
              user = memberRes;
            }
          }
        } catch (err) {
          void err;
        }
      }

      const viewer = await safeGetViewerAccess();
      if (user) {
        access =
          viewer && viewer.via === "account"
            ? viewer
            : await synthesizeAccessFromMember(user, true);
      } else if (step1ErrorResponse) {
        return applyGuardHeaders(step1ErrorResponse, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      } else if (viewer && viewer.via !== "none") {
        access = viewer;
      } else {
        return NextResponse.json(
          { ok: false, error: "unauthorized" },
          {
            status: 401,
            headers: {
              "Cache-Control": PRIVATE_NO_STORE,
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
    }

    if (!access.fullAccess) {
      return NextResponse.json(
        { ok: false, error: "pase_requerido" },
        {
          status: 403,
          headers: {
            "Cache-Control": PRIVATE_NO_STORE,
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    const rateSubject = user ? user.userId : `b:${ipHash}`;
    const rl = await checkEndpointRateLimit({
      bucket: config.bucket,
      key: rateSubject,
      limit,
      windowMs,
      failClosed,
      db: user?.db,
    });
    if (rl.storeUnavailable) {
      return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
    }
    if (!rl.allowed) {
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: config.bucket,
        route,
        userId: user?.userId ?? null,
        ipHash,
      });
      await safeRecordAbuse(user?.db ?? null, {
        userId: user?.userId ?? null,
        ipHash,
        route,
        kind: "rate_limit",
        severity: "low",
        details: { bucket: config.bucket },
      });
      return rateLimitResponse(rl.retryAfterSeconds);
    }

    try {
      const params = await resolveParams(ctx);
      const rawResponse = await (
        handler as (ctx: ActivePaseBetaMutationContext<TParams>) => Promise<Response> | Response
      )({
        request: req,
        params,
        ip,
        ipHash,
        user,
        access,
      });
      let response = applyGuardHeaders(rawResponse, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
      if (config.watermark === true && user?.userId) {
        response = applyMemberWatermarkHeader(response, user.userId);
      }
      return response;
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, user?.userId ?? null, PRIVATE_NO_STORE);
    }
  };
}

export function withAdminMutation<TParams extends RouteParams = Record<string, never>>(
  config: AdminMutationConfig,
  handler: (ctx: AdminMutationContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 30;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const failClosed = config.failClosed ?? true;
  const allowGet = config.allowGet === true;
  const requireJson = config.requireJson ?? true;

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);
    const method = req.method.toUpperCase();
    const isReadMethod = method === "GET" || method === "HEAD";

    if (isReadMethod && !allowGet) {
      return NextResponse.json(
        { ok: false, error: "metodo_no_permitido" },
        {
          status: 405,
          headers: {
            "Cache-Control": PRIVATE_NO_STORE,
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }

    if (!isReadMethod) {
      const csrfError = verifySameOriginMutation(req, { requireJson });
      if (csrfError) {
        logSecurityEvent("warn", "csrf_rejected", {
          bucket: config.bucket,
          route,
          ipHash,
          status: csrfError.status,
        });
        await safeRecordAbuse(null, {
          userId: null,
          ipHash,
          route,
          kind: "csrf_rejected",
          severity: "high",
          details: { bucket: config.bucket, status: csrfError.status },
        });
        return applyGuardHeaders(csrfError, {
          "Cache-Control": PRIVATE_NO_STORE,
          "X-Content-Type-Options": "nosniff",
        });
      }
    }

    const adminRes = await requireAdmin(req);
    if ("error" in adminRes) {
      if (adminRes.error.status === 403) {
        logSecurityEvent("warn", "admin_access_denied", {
          bucket: config.bucket,
          route,
          ipHash,
        });
      }
      return applyGuardHeaders(adminRes.error, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    }

    const rl = await checkEndpointRateLimit({
      bucket: config.bucket,
      key: `admin:${adminRes.userId}`,
      limit,
      windowMs,
      failClosed,
      db: adminRes.db,
    });
    if (rl.storeUnavailable) {
      return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
    }
    if (!rl.allowed) {
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: config.bucket,
        route,
        userId: adminRes.userId,
        ipHash,
      });
      await safeRecordAbuse(adminRes.db, {
        userId: adminRes.userId,
        ipHash,
        route,
        kind: "rate_limit",
        severity: "medium",
        details: { bucket: config.bucket },
      });
      return rateLimitResponse(rl.retryAfterSeconds);
    }

    const adminUser: AdminMember = {
      db: adminRes.db,
      userId: adminRes.userId,
      email: adminRes.email,
      emailVerified: true,
    };

    const viewer = await safeGetViewerAccess();
    const access: ViewerAccess =
      viewer && viewer.via === "account" && viewer.isAdmin
        ? viewer
        : {
            via: "account",
            signupComplete: true,
            fullAccess: true,
            isAdmin: true,
            isTipster: false,
            profile: null,
          };

    try {
      const params = await resolveParams(ctx);
      const rawResponse = await handler({
        request: req,
        params,
        ip,
        ipHash,
        user: adminUser,
        access,
      });
      return applyGuardHeaders(rawResponse, {
        "Cache-Control": PRIVATE_NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, adminRes.userId, PRIVATE_NO_STORE);
    }
  };
}

export function withCronSecret<TParams extends RouteParams = Record<string, never>>(
  config: CronSecretConfig,
  handler: (ctx: CronSecretContext<TParams>) => Promise<Response> | Response,
): GuardedRouteHandler<TParams> {
  const limit = config.limit ?? 60;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;

  return async (request?: Request, ctx?: NextRouteContext<TParams>): Promise<Response> => {
    const req = normalizeRequest(request);
    const ip = trustedClientIp(req.headers) || "127.0.0.1";
    const ipHash = hashIpForAudit(ip);
    const route = routePathForAudit(req, config.bucket);

    const authError = requireCronAuth(req);
    if (authError) {
      logSecurityEvent("warn", "cron_auth_rejected", {
        bucket: config.bucket,
        route,
        ipHash,
        status: authError.status,
      });
      return applyGuardHeaders(authError, {
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    }

    const rl = await checkEndpointRateLimit({
      bucket: config.bucket,
      key: `cron:${ip}`,
      limit,
      windowMs,
      failClosed: false,
    });
    if (!rl.allowed) {
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: config.bucket,
        route,
        ipHash,
      });
      return rateLimitResponse(rl.retryAfterSeconds);
    }

    try {
      const params = await resolveParams(ctx);
      const rawResponse = await handler({
        request: req,
        params,
        ip,
        ipHash,
        user: null,
        access: null,
      });
      return applyGuardHeaders(rawResponse, {
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
      });
    } catch (err) {
      return sanitizeErrorResponse(err, route, ipHash, null, NO_STORE);
    }
  };
}
