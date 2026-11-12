import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { getBetaCookieName } from "./beta-auth";

export async function hasPublicSessionCookie(): Promise<boolean> {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  return Boolean(getSessionCookie(requestHeaders) || requestCookies.has(getBetaCookieName()));
}
