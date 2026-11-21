import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const MEMBER_WATERMARK_HEADER = "X-PitchLab-Trace";

const DAY_MS = 86_400_000;
const WATERMARK_HEX_LENGTH = 32;

function resolveWatermarkSecret(): string {
  const explicit = process.env.PITCHLAB_WATERMARK_SECRET?.trim();
  if (explicit) return explicit;
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (authSecret) return authSecret;
  return "pitchlab-dev-wm";
}

function normalizeDate(now?: Date): Date {
  if (now instanceof Date && Number.isFinite(now.getTime())) {
    return now;
  }
  return new Date();
}

function utcDayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function constantTimeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function computeMemberWatermark(userId: string, now?: Date): string {
  const normalizedUser = userId.trim();
  const dayBucket = utcDayBucket(normalizeDate(now));
  return createHmac("sha256", resolveWatermarkSecret())
    .update(`pl-wm:v1:${normalizedUser}:${dayBucket}`)
    .digest("hex")
    .slice(0, WATERMARK_HEX_LENGTH);
}

export function verifyMemberWatermark(userId: string, token: string, now?: Date): boolean {
  if (typeof userId !== "string" || typeof token !== "string") return false;
  const normalizedUser = userId.trim();
  const candidate = token.trim();
  if (!normalizedUser || candidate.length !== WATERMARK_HEX_LENGTH) return false;
  if (!/^[0-9a-f]{32}$/.test(candidate)) return false;

  const baseDate = normalizeDate(now);
  const previousDate = new Date(baseDate.getTime() - DAY_MS);
  const expectedToday = computeMemberWatermark(normalizedUser, baseDate);
  const expectedPrevious = computeMemberWatermark(normalizedUser, previousDate);

  const matchesToday = constantTimeHexEqual(candidate, expectedToday);
  const matchesPrevious = constantTimeHexEqual(candidate, expectedPrevious);
  return matchesToday || matchesPrevious;
}

export function applyMemberWatermarkHeader<T extends Response = NextResponse>(
  response: T,
  userId: string,
  now?: Date,
): T {
  const normalizedUser = userId.trim();
  if (normalizedUser) {
    response.headers.set(MEMBER_WATERMARK_HEADER, computeMemberWatermark(normalizedUser, now));
  }
  return response;
}
