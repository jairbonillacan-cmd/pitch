import { NextResponse } from "next/server";
import { listTipsterCommissionsForAdmin } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/tipster-payouts — lista comisiones de tipsters y saldos por liquidar. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { ledger, totalsByTipster } = await listTipsterCommissionsForAdmin(admin.db, { limit: 120 });

  return NextResponse.json(
    {
      totalsByTipster,
      ledger: ledger.map((r) => ({
        ...r,
        clearsAtIso: r.clearsAt.toISOString(),
        paidOutAtIso: r.paidOutAt ? r.paidOutAt.toISOString() : null,
        createdAtIso: r.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
