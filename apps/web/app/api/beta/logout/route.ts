import { NextResponse } from "next/server";
import { getBetaCookieName } from "../../../../src/server/beta-auth";

export async function POST(): Promise<NextResponse> {
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
