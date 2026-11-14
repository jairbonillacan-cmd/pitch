import { NextResponse } from "next/server";
import { listCouponRedemptionsAdmin } from "@pitchlab/db";
import { requireAdmin } from "../../../../../../src/server/session-user";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/coupons/[id]/redemptions — quién canjeó un cupón y cuándo. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Cupón inválido." }, { status: 400 });
  }

  const rows = await listCouponRedemptionsAdmin(admin.db, id);
  return NextResponse.json(
    {
      redemptions: rows.map((r) => ({
        ...r,
        createdAtIso: r.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
