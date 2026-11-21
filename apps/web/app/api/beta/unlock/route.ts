import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getBetaCookieMaxAge,
  getBetaCookieName,
  isBetaPinEnabled,
  sanitizeNextPath,
  signBetaCookieToken,
  verifyPinCodeConstantTime,
} from "../../../../src/server/beta-auth";
import {
  rateLimitResponse,
  serviceUnavailableRateLimitResponse,
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
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) {
    csrfError.headers.set("Cache-Control", "no-store");
    csrfError.headers.set("X-Content-Type-Options", "nosniff");
    return csrfError;
  }

  if (!isBetaPinEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "El acceso por código beta está deshabilitado. Inicia sesión con tu cuenta.",
      },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  const ip = trustedClientIp(request.headers) || "127.0.0.1";

  const rl = await checkRateLimit(ip);
  if (rl.storeUnavailable) {
    return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
  }
  if (!rl.allowed) {
    return rateLimitResponse(
      rl.retryAfterSeconds,
      "Demasiados intentos. Intenta de nuevo en unos minutos.",
    );
  }

  let body: { code?: unknown; next?: unknown } = {};
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { ok: false, error: "Solicitud inválida." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }
    body = parsed as { code?: unknown; next?: unknown };
  } catch (err) {
    void err;
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400, headers: SECURITY_HEADERS },
    );
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  let valid = false;
  try {
    valid = await verifyPinCodeConstantTime(code);
  } catch (err) {
    void err;
    return NextResponse.json(
      {
        ok: false,
        error: "El acceso por código beta está deshabilitado.",
      },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }
  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        error: "Código incorrecto. Si tienes invitación, escríbenos.",
      },
      { status: 401, headers: SECURITY_HEADERS },
    );
  }

  let token: string;
  try {
    token = await signBetaCookieToken();
  } catch (err) {
    void err;
    return NextResponse.json(
      {
        ok: false,
        error: "El acceso por código beta está deshabilitado.",
      },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  const nextParam = typeof body.next === "string" ? body.next : undefined;
  const redirectTo = sanitizeNextPath(nextParam);
  const response = NextResponse.json({ ok: true, redirectTo }, { headers: SECURITY_HEADERS });

  response.cookies.set({
    name: getBetaCookieName(),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getBetaCookieMaxAge(),
  });

  return response;
}
