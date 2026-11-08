import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyPinCodeConstantTime,
  signBetaCookieToken,
  verifyBetaCookieToken,
  checkRateLimit,
  resetMemoryRateLimitForTests,
  sanitizeNextPath,
} from "../src/server/beta-auth.js";

describe("beta-auth", () => {
  beforeEach(() => {
    resetMemoryRateLimitForTests();
  });

  it("verifies 4-digit PIN in constant time", async () => {
    expect(await verifyPinCodeConstantTime("2026", "2026")).toBe(true);
    expect(await verifyPinCodeConstantTime("1234", "2026")).toBe(false);
    expect(await verifyPinCodeConstantTime("202", "2026")).toBe(false);
    expect(await verifyPinCodeConstantTime("abcd", "2026")).toBe(false);
  });

  it("signs and verifies HMAC cookie tokens and rejects tampering or expiry", async () => {
    const now = 1_762_620_000_000;
    const secret = "test-secret-of-at-least-32-characters-long!!";
    const token = await signBetaCookieToken(now, secret);

    expect(await verifyBetaCookieToken(token, now + 1000, secret)).toBe(true);
    expect(await verifyBetaCookieToken(token + "a", now + 1000, secret)).toBe(false);
    expect(
      await verifyBetaCookieToken(
        token,
        now + 31 * 24 * 60 * 60 * 1000,
        secret,
      ),
    ).toBe(false);
  });

  it("enforces 5 attempts per 15 minutes rate limit per IP", async () => {
    const now = 1_762_620_000_000;
    for (let i = 1; i <= 5; i++) {
      const r = await checkRateLimit("203.0.113.10", now);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit("203.0.113.10", now + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // After 15 minutes window resets
    const afterWindow = await checkRateLimit(
      "203.0.113.10",
      now + 16 * 60 * 1000,
    );
    expect(afterWindow.allowed).toBe(true);
  });

  it("sanitizes ?next= parameter against open redirects", () => {
    expect(sanitizeNextPath("/app/nfl")).toBe("/app/nfl");
    expect(sanitizeNextPath("/app/premier-league/games/epl-ars-new")).toBe(
      "/app/premier-league/games/epl-ars-new",
    );
    expect(sanitizeNextPath("https://evil.com")).toBe("/app");
    expect(sanitizeNextPath("//evil.com")).toBe("/app");
    expect(sanitizeNextPath("/login")).toBe("/app");
    expect(sanitizeNextPath("/app/../evil")).toBe("/app");
  });
});
