import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import {
  loadUserLiveTrackedPicks,
  MAX_LIVE_TRACKED_PICKS,
} from "../../../../src/server/live-pick-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBoundedLimit(raw: string | null): number {
  if (raw === null) return MAX_LIVE_TRACKED_PICKS;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return MAX_LIVE_TRACKED_PICKS;
  return Math.max(1, Math.min(MAX_LIVE_TRACKED_PICKS, Math.trunc(parsed)));
}

export const GET = withSessionRead(
  {
    bucket: "me-live-picks",
    allowBeta: false,
    watermark: true,
    cacheControl: "private, no-store",
  },
  async ({ request, user, access }) => {
    const url = new URL(request.url);
    const limit = parseBoundedLimit(url.searchParams.get("limit"));
    const payload = await loadUserLiveTrackedPicks(user.db, user.userId, {
      limit,
      fullAccess: access.fullAccess,
    });
    return NextResponse.json(payload);
  },
);
