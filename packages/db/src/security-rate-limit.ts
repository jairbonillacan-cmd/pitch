import { eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { authSession, securityAbuseEvents, securityRateBuckets, users } from "./schema";

export interface PgRateBucketResult {
  hits: number;
  resetAtMs: number;
}

export type SecurityAbuseKind =
  | "rate_limit"
  | "scraping_velocity"
  | "session_revoked"
  | "csrf_rejected"
  | "idor_attempt";

export type SecurityAbuseSeverity = "low" | "medium" | "high" | "critical";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_ABUSE_KINDS = new Set<SecurityAbuseKind>([
  "rate_limit",
  "scraping_velocity",
  "session_revoked",
  "csrf_rejected",
  "idor_attempt",
]);

const VALID_ABUSE_SEVERITIES = new Set<SecurityAbuseSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

function sanitizeDetails(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const trimmedKey = key.trim().slice(0, 64);
    if (!trimmedKey) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      clean[trimmedKey] = typeof value === "string" ? value.slice(0, 512) : value;
      count += 1;
    } else if (Array.isArray(value)) {
      clean[trimmedKey] = value.slice(0, 20).map((item) =>
        typeof item === "string"
          ? item.slice(0, 128)
          : typeof item === "number" || typeof item === "boolean" || item === null
            ? item
            : String(item).slice(0, 128),
      );
      count += 1;
    }
    if (count >= 32) break;
  }
  return clean;
}

export async function incrementPgRateBucket(
  db: Db,
  params: { bucket: string; subjectKey: string; windowMs: number; nowMs?: number },
): Promise<PgRateBucketResult> {
  const bucket = params.bucket.trim().slice(0, 128);
  const subjectKey = params.subjectKey.trim().slice(0, 256);
  if (!bucket) {
    throw new Error("INVALID_RATE_BUCKET");
  }
  if (!subjectKey) {
    throw new Error("INVALID_RATE_SUBJECT");
  }
  const windowMs =
    Number.isFinite(params.windowMs) && params.windowMs > 0
      ? Math.max(1, Math.floor(params.windowMs))
      : 60_000;
  const nowMs =
    params.nowMs !== undefined && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const resetAtMs = windowStart + windowMs;
  const expiresAt = new Date(resetAtMs);

  const rows = await db
    .insert(securityRateBuckets)
    .values({
      bucket,
      subjectKey,
      windowStart,
      hits: 1,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        securityRateBuckets.bucket,
        securityRateBuckets.subjectKey,
        securityRateBuckets.windowStart,
      ],
      set: {
        hits: sql`${securityRateBuckets.hits} + 1`,
      },
    })
    .returning({ hits: securityRateBuckets.hits });

  const rawHits = rows[0]?.hits;
  const parsedHits =
    typeof rawHits === "number"
      ? rawHits
      : typeof rawHits === "string"
        ? Number.parseInt(rawHits, 10)
        : 1;
  const hits = Number.isFinite(parsedHits) && parsedHits > 0 ? Math.trunc(parsedHits) : 1;
  return { hits, resetAtMs };
}

export async function pruneExpiredPgRateBuckets(db: Db, nowMs = Date.now()): Promise<number> {
  const cutoffMs = Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
  const deleted = await db
    .delete(securityRateBuckets)
    .where(lte(securityRateBuckets.expiresAt, new Date(cutoffMs)))
    .returning({ bucket: securityRateBuckets.bucket });
  return deleted.length;
}

export async function recordSecurityAbuseEvent(
  db: Db,
  params: {
    userId?: string | null;
    ipHash: string;
    route: string;
    kind: SecurityAbuseKind;
    severity: SecurityAbuseSeverity;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const userId =
    typeof params.userId === "string" && UUID_RE.test(params.userId.trim())
      ? params.userId.trim()
      : null;
  const ipHash = params.ipHash.trim().slice(0, 128) || "unknown";
  const route = params.route.trim().slice(0, 256) || "/";
  const kind: SecurityAbuseKind = VALID_ABUSE_KINDS.has(params.kind) ? params.kind : "rate_limit";
  const severity: SecurityAbuseSeverity = VALID_ABUSE_SEVERITIES.has(params.severity)
    ? params.severity
    : "medium";
  const details = sanitizeDetails(params.details);

  await db.insert(securityAbuseEvents).values({
    userId,
    ipHash,
    route,
    kind,
    severity,
    details,
  });
}

export async function revokeUserActiveSessions(db: Db, userId: string): Promise<number> {
  const normalized = userId.trim();
  if (!normalized) return 0;

  const targetAuthUserIds = new Set<string>([normalized]);
  if (UUID_RE.test(normalized)) {
    const rows = await db
      .select({ authUserId: users.authUserId })
      .from(users)
      .where(eq(users.id, normalized))
      .limit(1);
    const authUserId = rows[0]?.authUserId?.trim();
    if (authUserId) {
      targetAuthUserIds.add(authUserId);
    }
  }

  const deleted = await db
    .delete(authSession)
    .where(inArray(authSession.userId, Array.from(targetAuthUserIds)))
    .returning({ id: authSession.id });
  return deleted.length;
}
