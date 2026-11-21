import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  and,
  desc,
  eq,
  securityAbuseEvents,
  sql,
  type SecurityAbuseKind,
  type SecurityAbuseSeverity,
} from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ABUSE_EVENTS_LIMIT = 40;
const SUMMARY_WINDOW_HOURS = 24;
const SUMMARY_WINDOW_MS = SUMMARY_WINDOW_HOURS * 60 * 60 * 1000;

const ALLOWED_KINDS: ReadonlySet<SecurityAbuseKind> = new Set([
  "rate_limit",
  "scraping_velocity",
  "session_revoked",
  "csrf_rejected",
  "idor_attempt",
]);

const ALLOWED_SEVERITIES: ReadonlySet<SecurityAbuseSeverity> = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

const SAFE_DETAIL_KEYS: readonly string[] = [
  "bucket",
  "distinctResources",
  "windowMs",
  "status",
  "reason",
];

const FORBIDDEN_KEY_RE = /token|secret|password|cookie|auth|clabe|email|phone|key/i;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ABUSE_EVENTS_LIMIT, parsed));
}

function parseKindFilter(raw: string | null): SecurityAbuseKind | null {
  if (!raw) return null;
  const clean = raw.trim();
  for (const kind of ALLOWED_KINDS) {
    if (kind === clean) return kind;
  }
  return null;
}

function parseSeverityFilter(raw: string | null): SecurityAbuseSeverity | null {
  if (!raw) return null;
  const clean = raw.trim();
  for (const severity of ALLOWED_SEVERITIES) {
    if (severity === clean) return severity;
  }
  return null;
}

function normalizeKind(raw: string): SecurityAbuseKind {
  return parseKindFilter(raw) ?? "rate_limit";
}

function normalizeSeverity(raw: string): SecurityAbuseSeverity {
  return parseSeverityFilter(raw) ?? "medium";
}

function formatSafeDetail(details: Record<string, unknown> | null | undefined): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "—";
  }
  const parts: string[] = [];
  for (const key of SAFE_DETAIL_KEYS) {
    if (FORBIDDEN_KEY_RE.test(key)) continue;
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      if (key === "distinctResources") {
        parts.push(`${Math.trunc(value)} recursos`);
      } else if (key === "windowMs") {
        parts.push(`${Math.max(1, Math.round(value / 60_000))} min`);
      } else if (key === "status") {
        parts.push(`HTTP ${Math.trunc(value)}`);
      }
    } else if (typeof value === "string") {
      const clean = value.trim().slice(0, 64);
      if (clean.length > 0 && !FORBIDDEN_KEY_RE.test(clean)) {
        if (key === "bucket") {
          parts.push(`cubeta ${clean}`);
        } else if (key === "reason") {
          parts.push(clean);
        }
      }
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function maskIpHash(ipHash: string): string {
  const clean = ipHash.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) return "anon";
  return clean.slice(0, 12);
}

function maskUserId(userId: string | null): string | null {
  if (!userId) return null;
  const clean = userId.trim().replace(/[^a-zA-Z0-9-]/g, "");
  if (!clean) return null;
  return `u:${clean.slice(0, 8)}`;
}

export const GET = withAdminMutation(
  { bucket: "admin-security-abuse", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const searchParams = new URL(request.url).searchParams;
    const limit = parseBoundedLimit(request, MAX_ABUSE_EVENTS_LIMIT);
    const kindFilter = parseKindFilter(searchParams.get("kind"));
    const severityFilter = parseSeverityFilter(searchParams.get("severity"));

    const now = new Date();
    const since24h = new Date(now.getTime() - SUMMARY_WINDOW_MS);

    const whereClause =
      kindFilter && severityFilter
        ? and(
            eq(securityAbuseEvents.kind, kindFilter),
            eq(securityAbuseEvents.severity, severityFilter),
          )
        : kindFilter
          ? eq(securityAbuseEvents.kind, kindFilter)
          : severityFilter
            ? eq(securityAbuseEvents.severity, severityFilter)
            : undefined;

    const [eventRows, summaryRows] = await Promise.all([
      user.db
        .select({
          id: securityAbuseEvents.id,
          userId: securityAbuseEvents.userId,
          ipHash: securityAbuseEvents.ipHash,
          route: securityAbuseEvents.route,
          kind: securityAbuseEvents.kind,
          severity: securityAbuseEvents.severity,
          details: securityAbuseEvents.details,
          createdAt: securityAbuseEvents.createdAt,
        })
        .from(securityAbuseEvents)
        .where(whereClause)
        .orderBy(desc(securityAbuseEvents.createdAt))
        .limit(limit),
      user.db
        .select({
          kind: securityAbuseEvents.kind,
          severity: securityAbuseEvents.severity,
          total: sql<number>`count(*)::int`,
        })
        .from(securityAbuseEvents)
        .where(sql`${securityAbuseEvents.createdAt} >= ${since24h.toISOString()}::timestamptz`)
        .groupBy(securityAbuseEvents.kind, securityAbuseEvents.severity),
    ]);

    let total24h = 0;
    let critical24h = 0;
    let high24h = 0;
    let revocations24h = 0;
    let scraping24h = 0;
    let rateLimit24h = 0;
    let csrf24h = 0;
    let idor24h = 0;

    for (const row of summaryRows) {
      const count = Math.trunc(parseStrictFiniteNumber(row.total) ?? 0);
      total24h += count;
      if (row.severity === "critical") critical24h += count;
      if (row.severity === "high") high24h += count;
      if (row.kind === "session_revoked") revocations24h += count;
      else if (row.kind === "scraping_velocity") scraping24h += count;
      else if (row.kind === "rate_limit") rateLimit24h += count;
      else if (row.kind === "csrf_rejected") csrf24h += count;
      else if (row.kind === "idor_attempt") idor24h += count;
    }

    const events = eventRows.map((row) => ({
      id: row.id,
      kind: normalizeKind(row.kind),
      severity: normalizeSeverity(row.severity),
      route: row.route.slice(0, 160),
      ipHashPrefix: maskIpHash(row.ipHash),
      userRef: maskUserId(row.userId),
      summaryDetail: formatSafeDetail(row.details),
      createdAtIso: row.createdAt.toISOString(),
    }));

    return NextResponse.json({
      generatedAtIso: now.toISOString(),
      windowHours: SUMMARY_WINDOW_HOURS,
      summary: {
        total24h,
        critical24h,
        high24h,
        revocations24h,
        scraping24h,
        rateLimit24h,
        csrf24h,
        idor24h,
      },
      events,
    });
  },
);
