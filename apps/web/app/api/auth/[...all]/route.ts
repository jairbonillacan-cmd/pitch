import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../src/server/auth";
import { finishTwitterLink } from "../../../../src/server/profile-x";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  serviceUnavailableRateLimitResponse,
  trustedClientIp,
} from "../../../../src/server/request-security";
import { hashIpForAudit, logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_POST_LIMIT = 20;
const AUTH_CALLBACK_LIMIT = 20;
const AUTH_GET_LIMIT = 120;
const AUTH_WINDOW_MS = 60_000;

function withAuthSecurityHeaders(response: Response): Response {
  try {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    void err;
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function notConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: "Autenticación no configurada" },
    {
      status: 503,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    },
  );
}

function normalizeAuthPathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function resolveAuthPathname(request: Request): string {
  try {
    return normalizeAuthPathname(new URL(request.url).pathname);
  } catch (err) {
    void err;
    return "/api/auth";
  }
}

async function enforceAuthRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  pathname: string,
  failClosed = true,
): Promise<Response | null> {
  const ip = trustedClientIp(request.headers) || "127.0.0.1";
  const rl = await checkEndpointRateLimit({
    bucket,
    key: ip,
    limit,
    windowMs: AUTH_WINDOW_MS,
    failClosed,
  });
  if (rl.storeUnavailable) {
    return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
  }
  if (!rl.allowed) {
    logSecurityEvent("warn", "rate_limit_exceeded", {
      bucket,
      route: pathname,
      ipHash: hashIpForAudit(ip),
    });
    return rateLimitResponse(rl.retryAfterSeconds);
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const pathname = resolveAuthPathname(request);
  const isCallback =
    pathname === "/api/auth/callback" ||
    pathname.startsWith("/api/auth/callback/") ||
    pathname === "/api/auth/magic-link/verify" ||
    pathname.startsWith("/api/auth/magic-link/verify/");

  const blocked = isCallback
    ? await enforceAuthRateLimit(request, "auth-callback", AUTH_CALLBACK_LIMIT, pathname, true)
    : await enforceAuthRateLimit(request, "auth-get", AUTH_GET_LIMIT, pathname, true);
  if (blocked) return blocked;

  if (pathname === "/api/auth/callback/twitter") {
    return withAuthSecurityHeaders(await finishTwitterLink(request));
  }

  const auth = getAuth();
  if (!auth) return notConfiguredResponse();
  return withAuthSecurityHeaders(await toNextJsHandler(auth).GET(request));
}

export async function POST(request: Request): Promise<Response> {
  const pathname = resolveAuthPathname(request);
  const blocked = await enforceAuthRateLimit(request, "auth-post", AUTH_POST_LIMIT, pathname, true);
  if (blocked) return blocked;

  const auth = getAuth();
  if (!auth) return notConfiguredResponse();
  return withAuthSecurityHeaders(await toNextJsHandler(auth).POST(request));
}
