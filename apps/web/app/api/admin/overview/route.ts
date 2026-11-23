import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  adminOverview,
  FLAG_MONTH1_NO_CARD,
  getAdminFunnelSummary,
  getBoolFlag,
  listTipsterCodes,
} from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

export const GET = withAdminMutation(
  { bucket: "admin-overview", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const now = new Date();
    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const [overview, tipsters, month1NoCardMode, funnel] = await Promise.all([
      adminOverview(user.db),
      listTipsterCodes(user.db),
      getBoolFlag(user.db, FLAG_MONTH1_NO_CARD, true),
      getAdminFunnelSummary(user.db, now, 30),
    ]);
    return NextResponse.json({
      overview,
      tipsters: tipsters.slice(0, limit),
      month1NoCardMode,
      funnel,
    });
  },
);
