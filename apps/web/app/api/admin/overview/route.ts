import { NextResponse } from "next/server";
import { adminOverview, FLAG_MONTH1_NO_CARD, getBoolFlag, listTipsterCodes } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const [overview, tipsters, month1NoCardMode] = await Promise.all([
    adminOverview(admin.db),
    listTipsterCodes(admin.db),
    getBoolFlag(admin.db, FLAG_MONTH1_NO_CARD, true),
  ]);
  return NextResponse.json({ overview, tipsters, month1NoCardMode });
}
