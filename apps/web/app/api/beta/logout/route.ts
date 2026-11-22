import { NextResponse } from "next/server";
import { withPublicRead } from "../../../../src/server/api-guards";
import { getBetaCookieName } from "../../../../src/server/beta-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export const POST = withPublicRead(
  {
    bucket: "beta-logout",
    limit: 30,
    windowMs: 60_000,
    failClosed: true,
    verifySameOrigin: true,
    requireJson: false,
    cacheControl: "no-store",
  },
  async () => {
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
  },
);
