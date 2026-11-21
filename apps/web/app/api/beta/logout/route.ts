import { NextResponse } from "next/server";
import { getBetaCookieName } from "../../../../src/server/beta-auth";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
  if (csrfError) {
    csrfError.headers.set("Cache-Control", "no-store");
    csrfError.headers.set("X-Content-Type-Options", "nosniff");
    return csrfError;
  }

  const ip = trustedClientIp(request.headers) || "127.0.0.1";
  const rl = await checkEndpointRateLimit({
    bucket: "beta-logout",
    key: ip,
    limit: 30,
    windowMs: 60_000,
    failClosed: false,
  });
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterSeconds);
  }

  const response = NextResponse.json({ ok: true, redirectTo: "/" }, { headers: SECURITY_HEADERS });
  response.cookies.set({
    name: getBetaCookieName(),
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
