import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiGuardHttpError, readBoundedJson, withPublicRead } from "../../../../src/server/api-guards";
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
} from "../../../../src/server/request-security";
import { logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const BETA_PIN_RATE_LIMIT = 5;
const BETA_PIN_WINDOW_MS = 15 * 60 * 1000;
const BetaUnlockBodySchema = z
  .object({
    code: z.string().max(128),
    next: z.string().max(512).optional(),
  })
  .strict();

export const POST = withPublicRead(
  {
    bucket: "beta-pin",
    limit: BETA_PIN_RATE_LIMIT,
    windowMs: BETA_PIN_WINDOW_MS,
    failClosed: true,
    skipRateLimit: true,
    verifySameOrigin: true,
    requireJson: true,
    cacheControl: "no-store",
  },
  async ({ request, ip, ipHash }) => {
    if (!isBetaPinEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          error: "El acceso por código beta está deshabilitado. Inicia sesión con tu cuenta.",
        },
        { status: 403, headers: SECURITY_HEADERS },
      );
    }

    const rl = await checkRateLimit(ip);
    if (rl.storeUnavailable) {
      return serviceUnavailableRateLimitResponse(rl.retryAfterSeconds);
    }
    if (!rl.allowed) {
      logSecurityEvent("warn", "rate_limit_exceeded", {
        bucket: "beta-pin",
        route: "/api/beta/unlock",
        ipHash,
      });
      return rateLimitResponse(
        rl.retryAfterSeconds,
        "Demasiados intentos. Intenta de nuevo en unos minutos.",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await readBoundedJson(request, 8_192);
    } catch (err) {
      if (err instanceof ApiGuardHttpError) throw err;
      return NextResponse.json(
        { ok: false, error: "Solicitud inválida." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    const parsedBody = BetaUnlockBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: "Solicitud inválida." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    const code = parsedBody.data.code.trim();
    const rawNext = parsedBody.data.next;
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

    const nextParam = typeof rawNext === "string" ? rawNext : undefined;
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
  },
);
