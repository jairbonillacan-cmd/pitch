import { NextResponse } from "next/server";
import { createDb, incrementPgRateBucket, type Db } from "@pitchlab/db";
import { logSecurityEvent } from "./safe-logger";
import { serverDb } from "./session-user";

interface MemoryRateEntry {
  count: number;
  resetAt: number;
}

const MAX_MEMORY_ENTRIES = 5_000;
const FAIL_CLOSED_RETRY_SECONDS = 30;
const LOCAL_LOOPBACK_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
const memoryStore = new Map<string, MemoryRateEntry>();
let warnedMemoryFallback = false;
let rateLimitDbOverride: Db | null = null;
let cachedPgDb: Db | null = null;
let cachedPgDbUrl = "";

export function setRateLimitDbForTests(instance: Db | null): void {
  rateLimitDbOverride = instance;
}

export function resetRateLimitsForTests(): void {
  memoryStore.clear();
  warnedMemoryFallback = false;
  cachedPgDb = null;
  cachedPgDbUrl = "";
}

function parseFiniteNumericResult(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function resolvePgRateLimitDb(explicitDb: Db | undefined, databaseUrl: string): Db | null {
  if (explicitDb) return explicitDb;
  if (rateLimitDbOverride) return rateLimitDbOverride;
  const existingSessionDb = serverDb("");
  if (existingSessionDb) return existingSessionDb;
  if (!databaseUrl) return null;
  if (!cachedPgDb || cachedPgDbUrl !== databaseUrl) {
    cachedPgDb = createDb(databaseUrl);
    cachedPgDbUrl = databaseUrl;
  }
  return cachedPgDb;
}

function sanitizeIpCandidate(raw: string | null | undefined): string {
  if (!raw) return "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 64) return "";
  if (!/^[0-9a-fA-F:.]+$/.test(candidate)) return "";
  return candidate;
}

function parseRfc7239ForwardedFor(header: string | null): string {
  if (!header) return "";
  const firstEntry = header.split(",")[0] ?? "";
  const match = /(?:^|;)\s*for=(?:"([^"]+)"|([^;\s]+))/i.exec(firstEntry);
  if (!match) return "";
  let raw = (match[1] ?? match[2] ?? "").trim();
  if (!raw || raw.startsWith("_")) return "";
  if (raw.startsWith("[")) {
    const endBracket = raw.indexOf("]");
    if (endBracket <= 1) return "";
    raw = raw.slice(1, endBracket);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(raw)) {
    raw = raw.slice(0, raw.lastIndexOf(":"));
  }
  return sanitizeIpCandidate(raw);
}

export type TrustedProxyMode = "cloudflare" | "fly" | "vercel" | "xff-last" | "auto";

function parseXForwardedForLast(header: string | null): string {
  if (!header) return "";
  const parts = header.split(",");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const ip = sanitizeIpCandidate(parts[i]);
    if (ip) return ip;
  }
  return "";
}

export function trustedClientIp(
  headers: Headers,
  proxyMode: string | undefined = process.env.PITCHLAB_TRUSTED_PROXY,
  socketRemoteIp?: string | null,
): string {
  const configuredMode = proxyMode?.trim().toLowerCase();
  const mode =
    configuredMode ||
    (process.env.NODE_ENV === "production" || isHostedRemoteEnvironment() ? "xff-last" : "auto");

  if (mode === "cloudflare") {
    return sanitizeIpCandidate(headers.get("cf-connecting-ip"));
  }
  if (mode === "fly") {
    return sanitizeIpCandidate(headers.get("fly-client-ip"));
  }
  if (mode === "vercel") {
    return sanitizeIpCandidate(headers.get("x-vercel-forwarded-for")?.split(",")[0]);
  }
  if (mode === "xff-last") {
    return parseXForwardedForLast(headers.get("x-forwarded-for")) || sanitizeIpCandidate(socketRemoteIp);
  }
  if (mode !== "auto") {
    return "";
  }

  const cfIp = sanitizeIpCandidate(headers.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  const flyIp = sanitizeIpCandidate(headers.get("fly-client-ip"));
  if (flyIp) return flyIp;

  const trueClientIp = sanitizeIpCandidate(headers.get("true-client-ip"));
  if (trueClientIp) return trueClientIp;

  const vercelIp = sanitizeIpCandidate(headers.get("x-vercel-forwarded-for")?.split(",")[0]);
  if (vercelIp) return vercelIp;

  const realIp = sanitizeIpCandidate(headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedRfc = parseRfc7239ForwardedFor(headers.get("forwarded"));
  if (forwardedRfc) return forwardedRfc;

  const forwardedFirst = sanitizeIpCandidate(headers.get("x-forwarded-for")?.split(",")[0]);
  return forwardedFirst;
}

export function verifySameOriginMutation(
  request: Request,
  options: { requireJson?: boolean } = {},
): NextResponse | null {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const rawOrigin = request.headers.get("origin")?.trim();
  if (!rawOrigin || rawOrigin === "null") {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(request.url).origin);
  } catch (err) {
    void err;
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    try {
      allowedOrigins.add(new URL(`${new URL(request.url).protocol}//${host}`).origin);
    } catch (err) {
      void err;
    }
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (forwardedProto === "https" || forwardedProto === "http") {
      try {
        allowedOrigins.add(new URL(`${forwardedProto}://${host}`).origin);
      } catch (err) {
        void err;
      }
    }
  }

  const configuredBase = process.env.BETTER_AUTH_URL?.trim();
  if (configuredBase) {
    try {
      allowedOrigins.add(new URL(configuredBase).origin);
    } catch (err) {
      void err;
    }
  }

  if (!allowedOrigins.has(rawOrigin)) {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }

  if (options.requireJson !== false) {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      return NextResponse.json({ error: "tipo_contenido_invalido" }, { status: 415 });
    }
  }

  return null;
}

export function trustedAppBaseUrl(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    const parsed = new URL(configured);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new Error("BETTER_AUTH_URL debe usar https:// en producción.");
    }
    return parsed.origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_URL es obligatoria en producción para generar URLs de retorno.");
  }
  const reqOrigin = new URL(request.url).origin;
  if (
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin) ||
    reqOrigin === "https://pitchlab.mx"
  ) {
    return reqOrigin;
  }
  throw new Error("Origen de solicitud no autorizado para URLs de retorno sin BETTER_AUTH_URL.");
}

function pruneMemoryStore(nowMs: number): void {
  if (memoryStore.size < MAX_MEMORY_ENTRIES) return;
  for (const [k, v] of memoryStore) {
    if (v.resetAt <= nowMs) memoryStore.delete(k);
    if (memoryStore.size < MAX_MEMORY_ENTRIES * 0.8) return;
  }
  while (memoryStore.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryStore.keys().next().value;
    if (oldest === undefined) break;
    memoryStore.delete(oldest);
  }
}

function isHostedRemoteEnvironment(): boolean {
  const explicit = process.env.PITCHLAB_HOSTED?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  return Boolean(
    process.env.VERCEL ||
      process.env.K_SERVICE ||
      process.env.FLY_APP_NAME ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RENDER ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.ECS_CONTAINER_METADATA_URI ||
      process.env.ECS_CONTAINER_METADATA_URI_V4 ||
      process.env.CONTAINER_APP_NAME ||
      process.env.WEBSITE_SITE_NAME ||
      process.env.DO_APP_PLATFORM ||
      process.env.COOLIFY_APP_ID,
  );
}

function allowLocalLoopbackMemoryRateLimit(
  hasRedisConfigured: boolean,
  hasDatabaseConfigured: boolean,
): boolean {
  if (process.env.PITCHLAB_LOCAL_MEMORY_RATE_LIMIT !== "1") return false;
  if (isHostedRemoteEnvironment()) return false;
  if (hasRedisConfigured || hasDatabaseConfigured) return false;
  const configuredAuthUrl = process.env.BETTER_AUTH_URL?.trim();
  if (configuredAuthUrl && !LOCAL_LOOPBACK_ORIGIN_RE.test(configuredAuthUrl)) {
    return false;
  }
  return true;
}

export interface RateLimitCheckOptions {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  failClosed?: boolean;
  db?: Db;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  storeUnavailable?: boolean;
}

export async function checkEndpointRateLimit(
  options: RateLimitCheckOptions,
): Promise<RateLimitCheckResult> {
  const nowMs = options.nowMs ?? Date.now();
  const subjectKey = (options.key || "unknown").slice(0, 128);
  const safeKey = `pl:rl:${options.bucket}:${subjectKey}`;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (upstashUrl && upstashToken) {
    try {
      const endpoint = `${upstashUrl.replace(/\/+$/, "")}/pipeline`;
      const res = await (options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", safeKey],
          ["PEXPIRE", safeKey, String(options.windowMs), "NX"],
          ["PTTL", safeKey],
        ]),
        signal: AbortSignal.timeout(1_500),
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ result?: unknown }>;
        const count = parseFiniteNumericResult(rows?.[0]?.result, 1);
        const ttlMs = parseFiniteNumericResult(rows?.[2]?.result, options.windowMs);
        if (ttlMs < 0) {
          await (options.fetchImpl ?? fetch)(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${upstashToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([["PEXPIRE", safeKey, String(options.windowMs)]]),
            signal: AbortSignal.timeout(1_500),
          });
        }
        const effectiveTtlMs = ttlMs > 0 ? ttlMs : options.windowMs;
        const allowed = count <= options.limit;
        return {
          allowed,
          remaining: Math.max(0, options.limit - count),
          retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(effectiveTtlMs / 1000)),
        };
      }
      logSecurityEvent("warn", "rate_limit_redis_http_error", {
        bucket: options.bucket,
        status: res.status,
      });
    } catch (err) {
      logSecurityEvent("warn", "rate_limit_redis_error", {
        bucket: options.bucket,
        error: err,
      });
    }
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!options.fetchImpl && (options.db || rateLimitDbOverride || databaseUrl)) {
    try {
      const pgDb = resolvePgRateLimitDb(options.db, databaseUrl);
      if (pgDb) {
        const pgResult = await incrementPgRateBucket(pgDb, {
          bucket: options.bucket,
          subjectKey,
          windowMs: options.windowMs,
          nowMs,
        });
        const hits = parseFiniteNumericResult(pgResult.hits, 1);
        const resetAtMs = parseFiniteNumericResult(pgResult.resetAtMs, nowMs + options.windowMs);
        const allowed = hits <= options.limit;
        return {
          allowed,
          remaining: Math.max(0, options.limit - hits),
          retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
        };
      }
    } catch (err) {
      logSecurityEvent("warn", "rate_limit_pg_error", {
        bucket: options.bucket,
        error: err,
      });
    }
  }

  const hasRedisConfigured = Boolean(upstashUrl && upstashToken);
  const hasDatabaseConfigured = Boolean(databaseUrl);

  if (
    process.env.NODE_ENV === "production" &&
    options.failClosed === true &&
    !allowLocalLoopbackMemoryRateLimit(hasRedisConfigured, hasDatabaseConfigured)
  ) {
    logSecurityEvent("error", "rate_limit_fail_closed", {
      bucket: options.bucket,
      hasRedis: hasRedisConfigured,
      hasDatabase: hasDatabaseConfigured,
    });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS,
      storeUnavailable: true,
    };
  }

  if (process.env.NODE_ENV === "production" && !warnedMemoryFallback) {
    warnedMemoryFallback = true;
    logSecurityEvent("warn", "rate_limit_memory_fallback", {
      bucket: options.bucket,
    });
  }

  const existing = memoryStore.get(safeKey);
  if (!existing || existing.resetAt <= nowMs) {
    pruneMemoryStore(nowMs);
    memoryStore.set(safeKey, { count: 1, resetAt: nowMs + options.windowMs });
    return {
      allowed: 1 <= options.limit,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds:
        1 <= options.limit ? 0 : Math.max(1, Math.ceil(options.windowMs / 1000)),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
  };
}

export function rateLimitResponse(
  retryAfterSeconds: number,
  message: string = "Demasiadas solicitudes. Intenta de nuevo en unos momentos.",
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function serviceUnavailableRateLimitResponse(
  retryAfterSeconds: number = FAIL_CLOSED_RETRY_SECONDS,
  message: string = "Servicio temporalmente no disponible. Intenta de nuevo en unos momentos.",
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status: 503,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
