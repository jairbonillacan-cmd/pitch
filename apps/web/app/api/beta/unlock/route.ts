import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  getBetaCookieMaxAge,
  getBetaCookieName,
  isBetaPinEnabled,
  sanitizeNextPath,
  signBetaCookieToken,
  verifyPinCodeConstantTime,
} from "../../../../src/server/beta-auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isBetaPinEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "El acceso por código beta está deshabilitado. Inicia sesión con tu cuenta.",
      },
      { status: 403 },
    );
  }

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
      { status: 403 },
    );
  }
  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        error: "Código incorrecto. Si tienes invitación, escríbenos.",
      },
      { status: 401 },
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
      { status: 403 },
    );
  }
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
