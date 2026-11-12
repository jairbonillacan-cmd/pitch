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
    if (profileHandle || request.headers.has(CLUB_PROFILE_HANDLE_HEADER)) {
      const headers = new Headers(request.headers);
      headers.delete(CLUB_PROFILE_HANDLE_HEADER);
      if (profileHandle) headers.set(CLUB_PROFILE_HANDLE_HEADER, profileHandle);
      return NextResponse.next({ request: { headers } });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
