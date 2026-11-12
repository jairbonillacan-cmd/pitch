import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { CLUB_PROFILE_HANDLE_HEADER } from "./src/profile-path";
import {
  getBetaCookieName,
  verifyBetaCookieToken,
} from "./src/server/beta-auth";

async function hasValidBetaCookie(request: NextRequest): Promise<boolean> {
  try {
    return await verifyBetaCookieToken(request.cookies.get(getBetaCookieName())?.value);
  } catch (err) {
    // Sin PITCHLAB_BETA_CODE en producción no hay acceso por PIN; las cuentas siguen.
    void err;
    return false;
  }
}

/**
 * Filtro rápido de `/app`: deja pasar con el PIN de la beta o con la cookie de sesión de una
 * cuenta. La sesión, el registro completo y el Pase se validan en el servidor
 * (`app/app/layout.tsx` → `getViewerAccess`).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // /i/* son invitaciones personales públicas: nunca piden sesión y siempre llevan noindex.
  if (pathname.startsWith("/i/")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const accountsOn = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
    const allowed =
      (await hasValidBetaCookie(request)) || (accountsOn && getSessionCookie(request) !== null);
    if (!allowed) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    const profileHandle = /^\/app\/u\/([^/]+)\/?$/.exec(pathname)?.[1];
    let requestHeaders: Headers | undefined;
    if (profileHandle || request.headers.has(CLUB_PROFILE_HANDLE_HEADER)) {
      requestHeaders = new Headers(request.headers);
      requestHeaders.delete(CLUB_PROFILE_HANDLE_HEADER);
      if (profileHandle) requestHeaders.set(CLUB_PROFILE_HANDLE_HEADER, profileHandle);
    }
    const response = NextResponse.next(requestHeaders && { request: { headers: requestHeaders } });
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*", "/i/:path*"],
};
