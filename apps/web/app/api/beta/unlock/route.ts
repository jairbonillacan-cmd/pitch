import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  getBetaCookieMaxAge,
  getBetaCookieName,
  sanitizeNextPath,
  signBetaCookieToken,
  verifyPinCodeConstantTime,
} from "../../../../src/server/beta-auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Demasiados intentos. Intenta de nuevo en unos minutos.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
        },
      },
    );
  }

  let body: { code?: string; next?: string } = {};
  try {
    body = (await request.json()) as { code?: string; next?: string };
  } catch (err) {
    void err;
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const valid = await verifyPinCodeConstantTime(code);
  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        error: "Código incorrecto. Si tienes invitación, escríbenos.",
      },
      { status: 401 },
    );
  }

  const token = await signBetaCookieToken();
  const redirectTo = sanitizeNextPath(body.next);
  const response = NextResponse.json({ ok: true, redirectTo });

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
