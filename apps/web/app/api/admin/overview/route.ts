import { NextResponse } from "next/server";
import {
  adminOverview,
  FLAG_MONTH1_NO_CARD,
  getAdminFunnelSummary,
  getBoolFlag,
  listTipsterCodes,
} from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const now = new Date();
  const [overview, tipsters, month1NoCardMode, funnel] = await Promise.all([
    adminOverview(admin.db),
    listTipsterCodes(admin.db),
    getBoolFlag(admin.db, FLAG_MONTH1_NO_CARD, true),
    getAdminFunnelSummary(admin.db, now, 30),
  ]);
  return NextResponse.json({ overview, tipsters, month1NoCardMode, funnel });
}
