import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listLiveAlertsForUser } from "@pitchlab/db";
import { withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_ALERTS_LIMIT = 40;

function parseBoundedLimit(raw: string | null): number {
  if (!raw) return MAX_ALERTS_LIMIT;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return MAX_ALERTS_LIMIT;
  return Math.max(1, Math.min(MAX_ALERTS_LIMIT, Math.trunc(parsed)));
}

export const GET = withSessionRead(
  {
    bucket: "live-alerts",
    allowBetaPin: false,
    requireFullAccess: true,
    cacheControl: "private, no-store",
  },
  async ({ request, user }) => {
    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get("since");
    const sinceMs = sinceRaw ? Date.parse(sinceRaw) : Number.NaN;
    const floor = Date.now() - 2 * DAY_MS;
    const since = new Date(Number.isFinite(sinceMs) ? Math.max(sinceMs, floor) : floor);
    const limit = parseBoundedLimit(url.searchParams.get("limit"));
    const alerts = await listLiveAlertsForUser(user.db, user.userId, since, limit);
    return NextResponse.json({ alerts });
  },
);
