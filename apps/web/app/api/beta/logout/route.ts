import { NextResponse } from "next/server";
import { getBetaCookieName } from "../../../../src/server/beta-auth";
import { verifySameOriginMutation } from "../../../../src/server/request-security";

export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
  if (csrfError) return csrfError;

  const response = NextResponse.json({ ok: true, redirectTo: "/" });
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
