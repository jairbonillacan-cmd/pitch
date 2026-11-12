import { checkEndpointRateLimit, resetRateLimitsForTests } from "./request-security";

const COOKIE_NAME = "pl_beta";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

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

export function getBetaCookieName(): string {
  return COOKIE_NAME;
}

export function getBetaCookieMaxAge(): number {
  return COOKIE_MAX_AGE_SECONDS;
}

/**
 * En producción con cuentas reales activas, el acceso compartido por PIN (`pl_beta`) queda
 * apagado salvo que se autorice explícitamente con `PITCHLAB_ALLOW_BETA_PIN_IN_PROD=1`.
 */
export function isBetaPinEnabled(): boolean {
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
    const secret = (process.env.PITCHLAB_COOKIE_SECRET ?? process.env.BETA_COOKIE_SECRET ?? "").trim();
    if (!code || secret.length < 32 || isForbiddenProdCookieSecret(secret)) {
      return false;
    }
  }
  return true;
}

function getPreviewAccessCode(): string {
  if (!isBetaPinEnabled()) {
    throw new Error("El acceso por PIN beta está deshabilitado en producción.");
  }
  const envCode = process.env.PITCHLAB_BETA_CODE ?? process.env.PREVIEW_ACCESS_CODE;
  if (envCode && envCode.trim().length > 0) {
    return envCode.trim();
  }
  if (process.env.NODE_ENV !== "production") {
    return "2026";
  }
  throw new Error("PITCHLAB_BETA_CODE (o PREVIEW_ACCESS_CODE) is not configured in production.");
}

function getBetaCookieSecret(): string {
  const envSecret = process.env.PITCHLAB_COOKIE_SECRET ?? process.env.BETA_COOKIE_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    const trimmed = envSecret.trim();
    if (process.env.NODE_ENV === "production" && isForbiddenProdCookieSecret(trimmed)) {
      throw new Error("PITCHLAB_COOKIE_SECRET usa un valor de ejemplo prohibido en producción.");
    }
    return trimmed;
  }
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-pitchlab-beta-cookie-secret-32chars";
  }
  throw new Error("PITCHLAB_COOKIE_SECRET (>= 32 chars) is not configured in production.");
}

/**
 * Clave con la que se firma la cookie: el secreto más el código vigente.
 * Cambiar PITCHLAB_BETA_CODE invalida todas las cookies emitidas con el código
 * anterior, sin tener que rotar también PITCHLAB_COOKIE_SECRET.
 */
export function betaCookieSigningKey(secret: string, code: string): string {
  return `${secret}|code:${code}`;
}

function defaultCookieSigningKey(): string {
  return betaCookieSigningKey(getBetaCookieSecret(), getPreviewAccessCode());
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Bytes(secret: string, message: string): Promise<Uint8Array> {
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

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Constant-time comparison of the user-submitted PIN against PREVIEW_ACCESS_CODE
 * by comparing their HMAC-SHA256 digests of fixed 32-byte length.
 */
export async function verifyPinCodeConstantTime(
  candidate: string,
  expectedOverride?: string,
): Promise<boolean> {
  if (typeof candidate !== "string" || !/^\d{4}$/.test(candidate)) {
    return false;
  }
  const expected = expectedOverride ?? getPreviewAccessCode();
  const secret = getBetaCookieSecret();
  const [digestA, digestB] = await Promise.all([
    hmacSha256Bytes(secret, `pin:${candidate}`),
    hmacSha256Bytes(secret, `pin:${expected}`),
  ]);
  return timingSafeEqualBytes(digestA, digestB);
}

export async function signBetaCookieToken(
  nowMs: number = Date.now(),
  secretOverride?: string,
): Promise<string> {
  const secret = secretOverride ?? defaultCookieSigningKey();
  const issuedAt = Math.floor(nowMs / 1000);
  const exp = issuedAt + COOKIE_MAX_AGE_SECONDS;
  const payload = `${issuedAt}.${exp}`;
  const sigBytes = await hmacSha256Bytes(secret, payload);
  return `${payload}.${toHex(sigBytes)}`;
}

export async function verifyBetaCookieToken(
  token: string | undefined | null,
  nowMs: number = Date.now(),
  secretOverride?: string,
): Promise<boolean> {
  if (!token || typeof token !== "string") {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [iatStr, expStr, sigHex] = parts;
  if (!iatStr || !expStr || !sigHex || !/^[0-9a-f]{64}$/i.test(sigHex)) {
    return false;
  }
  const iat = Number(iatStr);
  const exp = Number(expStr);
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) {
    return false;
  }
  const nowSec = Math.floor(nowMs / 1000);
  if (exp <= nowSec || iat > nowSec + 300) {
    return false;
  }
  const secret = secretOverride ?? defaultCookieSigningKey();
  const expectedBytes = await hmacSha256Bytes(secret, `${iat}.${exp}`);
  const actualBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    actualBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }
  return timingSafeEqualBytes(expectedBytes, actualBytes);
}

export async function checkRateLimit(
  ip: string,
  nowMs: number = Date.now(),
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  return checkEndpointRateLimit({
    bucket: "beta-pin",
    key: ip || "unknown",
    limit: RATE_LIMIT_MAX_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    nowMs,
  });
}

export function resetMemoryRateLimitForTests(): void {
  resetRateLimitsForTests();
}

/**
 * Ensures `?next=` only redirects to internal `/app` routes (prevents open redirects).
 */
export function sanitizeNextPath(nextParam: string | null | undefined): string {
  if (!nextParam || typeof nextParam !== "string") {
    return "/app";
  }
  const trimmed = nextParam.trim();
  if (
    !trimmed.startsWith("/app") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    return "/app";
  }
  if (trimmed === "/app" || trimmed.startsWith("/app/")) {
    return trimmed;
  }
  return "/app";
}
