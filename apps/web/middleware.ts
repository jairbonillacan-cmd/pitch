import { NextResponse, type NextRequest } from "next/server";
import {
  getBetaCookieName,
  verifyBetaCookieToken,
} from "./src/server/beta-auth";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const cookie = request.cookies.get(getBetaCookieName())?.value;
    const valid = await verifyBetaCookieToken(cookie);
    if (!valid) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
