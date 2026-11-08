const COOKIE_NAME = "pl_beta";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

interface RateEntry {
  count: number;
  resetAt: number;
}

const memoryRateStore = new Map<string, RateEntry>();

export function getBetaCookieName(): string {
  return COOKIE_NAME;
}

export function getBetaCookieMaxAge(): number {
  return COOKIE_MAX_AGE_SECONDS;
}

function getPreviewAccessCode(): string {
  const envCode = process.env.PREVIEW_ACCESS_CODE;
  if (envCode && envCode.trim().length > 0) {
    return envCode.trim();
  }
  if (process.env.NODE_ENV !== "production") {
    return "2026";
  }
  throw new Error("PREVIEW_ACCESS_CODE is not configured in production.");
}

function getBetaCookieSecret(): string {
  const envSecret = process.env.BETA_COOKIE_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-pitchlab-beta-cookie-secret-32chars";
  }
  throw new Error("BETA_COOKIE_SECRET (>= 32 chars) is not configured in production.");
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
  const secret = secretOverride ?? getBetaCookieSecret();
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
  const secret = secretOverride ?? getBetaCookieSecret();
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
  const key = `pl:beta:rl:${ip || "unknown"}`;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const incrRes = await fetch(`${upstashUrl}/incr/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${upstashToken}` },
      });
      if (incrRes.ok) {
        const data = (await incrRes.json()) as { result?: number };
        const count = Number(data.result ?? 1);
        if (count === 1) {
          await fetch(
            `${upstashUrl}/expire/${encodeURIComponent(key)}/${Math.floor(RATE_LIMIT_WINDOW_MS / 1000)}`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${upstashToken}` },
            },
          );
        }
        const allowed = count <= RATE_LIMIT_MAX_ATTEMPTS;
        return {
          allowed,
          remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - count),
          retryAfterSeconds: allowed ? 0 : Math.floor(RATE_LIMIT_WINDOW_MS / 1000),
        };
      }
    } catch (err) {
      // Fallback to in-memory rate limiter if Upstash is unreachable
      void err;
    }
  }

  const existing = memoryRateStore.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    const entry: RateEntry = {
      count: 1,
      resetAt: nowMs + RATE_LIMIT_WINDOW_MS,
    };
    memoryRateStore.set(key, entry);
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_ATTEMPTS - 1,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= RATE_LIMIT_MAX_ATTEMPTS;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));

  return {
    allowed,
    remaining: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - existing.count),
    retryAfterSeconds,
  };
}

export function resetMemoryRateLimitForTests(): void {
  memoryRateStore.clear();
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
