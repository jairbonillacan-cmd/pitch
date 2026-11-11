import { NextResponse } from "next/server";
import { adminOverview, FLAG_MONTH1_NO_CARD, getBoolFlag, listTipstarCodes } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const [overview, tipstars, month1NoCardMode] = await Promise.all([
    adminOverview(admin.db),
    listTipstarCodes(admin.db),
    getBoolFlag(admin.db, FLAG_MONTH1_NO_CARD, true),
  ]);
  return NextResponse.json({ overview, tipstars, month1NoCardMode });
}
