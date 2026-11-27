import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { CLUB_PROFILE_HANDLE_HEADER, CLUB_REQUEST_PATH_HEADER } from "./src/profile-path";
import { THEME_INIT_SCRIPT } from "./src/theme-init-script";

const BETA_COOKIE_NAME = "pl_beta";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DYNAMIC_CSP_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/precio",
  "/canjear",
  "/i",
  "/p",
  "/u",
  "/baja",
  "/pricing/referral",
] as const;

const FORBIDDEN_PROD_COOKIE_SECRETS: ReadonlySet<string> = new Set([
  "reemplazar-con-secreto-aleatorio-de-32-caracteres-minimo",
  "reemplaza-con-32-caracteres-aleatorios-minimo",
  "dev-only-pitchlab-beta-cookie-secret-32chars",
  "local-9990-pitchlab-beta-cookie-secret-32chars!",
  "changeme-changeme-changeme-changeme-32",
]);

function isForbiddenProdCookieSecret(secret: string): boolean {
  return (
    FORBIDDEN_PROD_COOKIE_SECRETS.has(secret) ||
    /^(reemplaz|replace[-_]|changeme|example[-_]|dev-only-|local-9990-|e2e-test-)/i.test(secret)
  );
}

function isBetaPinEnabledEdge(): boolean {
  const accountsOn = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
  if (
    process.env.NODE_ENV === "production" &&
    accountsOn &&
    process.env.PITCHLAB_ALLOW_BETA_PIN_IN_PROD !== "1"
  ) {
    return false;
  }
  if (process.env.NODE_ENV === "production") {
    const code = (process.env.PITCHLAB_BETA_CODE ?? process.env.PREVIEW_ACCESS_CODE ?? "").trim();
    const secret = (
      process.env.PITCHLAB_COOKIE_SECRET ??
      process.env.BETA_COOKIE_SECRET ??
      ""
    ).trim();
    if (!code || secret.length < 32 || isForbiddenProdCookieSecret(secret)) {
      return false;
    }
  }
  return true;
}

function resolveBetaSigningKeyEdge(): string | null {
  if (!isBetaPinEnabledEdge()) return null;
  const envCode = (process.env.PITCHLAB_BETA_CODE ?? process.env.PREVIEW_ACCESS_CODE ?? "").trim();
  const code = envCode || (process.env.NODE_ENV !== "production" ? "2026" : "");
  if (!code) return null;

  const envSecret = (
    process.env.PITCHLAB_COOKIE_SECRET ??
    process.env.BETA_COOKIE_SECRET ??
    ""
  ).trim();
  let secret = "";
  if (envSecret.length >= 32) {
    if (process.env.NODE_ENV === "production" && isForbiddenProdCookieSecret(envSecret)) {
      return null;
    }
    secret = envSecret;
  } else if (process.env.NODE_ENV !== "production") {
    secret = "dev-only-pitchlab-beta-cookie-secret-32chars";
  } else {
    return null;
  }

  return `${secret}|code:${code}`;
}

async function hmacSha256BytesEdge(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

function timingSafeEqualBytesEdge(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function verifyBetaCookieTokenEdge(token: string | undefined): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [iatStr, expStr, sigHex] = parts;
  if (
    !iatStr ||
    !expStr ||
    !sigHex ||
    !/^\d+$/.test(iatStr) ||
    !/^\d+$/.test(expStr) ||
    !/^[0-9a-f]{64}$/i.test(sigHex)
  ) {
    return false;
  }
  const iat = Number.parseInt(iatStr, 10);
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp <= nowSec || iat > nowSec + 300) return false;

  const signingKey = resolveBetaSigningKeyEdge();
  if (!signingKey) return false;

  const expectedBytes = await hmacSha256BytesEdge(signingKey, `${iat}.${exp}`);
  const actualBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    actualBytes[i] = Number.parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }
  return timingSafeEqualBytesEdge(expectedBytes, actualBytes);
}

async function hasValidBetaCookie(request: NextRequest): Promise<boolean> {
  if (!isBetaPinEnabledEdge()) return false;
  try {
    return await verifyBetaCookieTokenEdge(request.cookies.get(BETA_COOKIE_NAME)?.value);
  } catch (err) {
    void err;
    return false;
  }
}

function extractHttpsOrigins(rawValues: Array<string | undefined>): string[] {
  const origins = new Set<string>();
  for (const raw of rawValues) {
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === "https:") {
          origins.add(parsed.origin);
        }
      } catch (err) {
        void err;
      }
    }
  }
  return [...origins];
}

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

let cachedThemeInitHash: string | null = null;

async function getThemeInitCspHash(): Promise<string> {
  if (cachedThemeInitHash) return cachedThemeInitHash;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(THEME_INIT_SCRIPT),
  );
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  cachedThemeInitHash = `sha256-${btoa(binary)}`;
  return cachedThemeInitHash;
}

async function buildDynamicCsp(nonce: string): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  const captchaDisabled = process.env.PITCHLAB_CAPTCHA_PROVIDER?.trim().toLowerCase() === "none";
  const turnstileOrigin = captchaDisabled ? "" : " https://challenges.cloudflare.com";
  const themeHash = await getThemeInitCspHash();

  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' '${themeHash}' 'strict-dynamic' 'unsafe-eval'${turnstileOrigin}`
    : `script-src 'self' 'nonce-${nonce}' '${themeHash}' 'strict-dynamic'${turnstileOrigin}`;
  const connectSrc = isDev
    ? `connect-src 'self' ws: wss:${turnstileOrigin}`
    : `connect-src 'self'${turnstileOrigin}`;

  const extraMediaOrigins = extractHttpsOrigins([
    process.env.PITCHLAB_MEDIA_ORIGINS,
    process.env.AVATAR_PUBLIC_BASE_URL,
    process.env.S3_AVATAR_PUBLIC_BASE_URL,
    process.env.S3_AVATAR_ENDPOINT,
    process.env.GCS_AVATAR_PUBLIC_BASE_URL,
  ]);
  const baseImgSources = [
    "'self'",
    "data:",
    "blob:",
    "https://sports.bzzoiro.com",
    "https://a.espncdn.com",
    "https://*.blob.vercel-storage.com",
    "https://storage.googleapis.com",
    ...extraMediaOrigins,
  ];
  const imgSrc = `img-src ${[...new Set(baseImgSources)].join(" ")}`;
  const frameSrc = captchaDisabled
    ? "frame-src 'none'"
    : "frame-src https://challenges.cloudflare.com";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    imgSrc,
    "font-src 'self' data:",
    connectSrc,
    frameSrc,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function isDynamicCspRoute(pathname: string): boolean {
  for (const prefix of DYNAMIC_CSP_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

function normalizeApiPathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function isCrossSiteExemptApiPath(pathname: string): boolean {
  const normalized = normalizeApiPathname(pathname);
  return (
    normalized === "/api/webhooks/stripe" ||
    normalized.startsWith("/api/webhooks/stripe/") ||
    normalized === "/api/cron" ||
    normalized.startsWith("/api/cron/") ||
    normalized === "/api/me/email-preferences/unsubscribe"
  );
}

function isPrivateNoStoreApiPath(pathname: string): boolean {
  return (
    pathname === "/api/me" ||
    pathname.startsWith("/api/me/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

function shouldSendHsts(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.PITCHLAB_HOSTED === "1") return true;
  if (request.nextUrl.protocol === "https:") return true;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProto === "https";
}

function appendVaryHeader(response: NextResponse, tokens: readonly string[]): void {
  const current = response.headers.get("Vary");
  const seen = new Set(
    (current ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
  for (const token of tokens) {
    seen.add(token);
  }
  response.headers.set("Vary", [...seen].join(", "));
}

function applyBaselineSecurityHeaders(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (shouldSendHsts(request)) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const method = request.method.toUpperCase();
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    if (
      MUTATION_METHODS.has(method) &&
      fetchSite === "cross-site" &&
      !isCrossSiteExemptApiPath(pathname)
    ) {
      const blocked = NextResponse.json(
        { ok: false, error: "origen_invalido" },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
      appendVaryHeader(blocked, ["Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site"]);
      return applyBaselineSecurityHeaders(blocked, request);
    }

    const response = NextResponse.next();
    appendVaryHeader(response, ["Sec-Fetch-Dest", "Sec-Fetch-Mode", "Sec-Fetch-Site"]);
    if (isPrivateNoStoreApiPath(pathname)) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return applyBaselineSecurityHeaders(response, request);
  }

  if (pathname.startsWith("/i/")) {
    const nonce = generateCspNonce();
    const csp = await buildDynamicCsp(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applyBaselineSecurityHeaders(res, request);
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const accountsOn = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
    const allowed =
      (await hasValidBetaCookie(request)) || (accountsOn && getSessionCookie(request) !== null);
    if (!allowed) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      return applyBaselineSecurityHeaders(NextResponse.redirect(loginUrl), request);
    }

    const nonce = generateCspNonce();
    const csp = await buildDynamicCsp(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(CLUB_PROFILE_HANDLE_HEADER);
    requestHeaders.delete(CLUB_REQUEST_PATH_HEADER);
    requestHeaders.set(CLUB_REQUEST_PATH_HEADER, `${pathname}${search}`);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const profileHandle = /^\/app\/u\/([^/]+)\/?$/.exec(pathname)?.[1];
    if (profileHandle) {
      requestHeaders.set(CLUB_PROFILE_HANDLE_HEADER, profileHandle);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applyBaselineSecurityHeaders(response, request);
  }

  if (isDynamicCspRoute(pathname)) {
    const nonce = generateCspNonce();
    const csp = await buildDynamicCsp(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return applyBaselineSecurityHeaders(response, request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app",
    "/app/:path*",
    "/api/:path*",
    "/login",
    "/signup",
    "/onboarding",
    "/precio",
    "/canjear",
    "/i/:path*",
    "/p/:path*",
    "/u/:path*",
    "/baja",
    "/pricing/referral",
  ],
};
