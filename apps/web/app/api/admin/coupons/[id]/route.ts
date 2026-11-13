import { NextResponse } from "next/server";
import { toggleCouponActive } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../src/server/session-user";
import { trialHashes } from "../../../../../src/server/signup";
import { UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/coupons/[id] { active } — activa o desactiva un cupón existente. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Cupón inválido." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Indica el nuevo estado activo (true/false)." }, { status: 400 });
  }

  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  const updated = await toggleCouponActive(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    couponId: id,
    active: body.active,
    now: new Date(),
    ipSubnetHash,
  });

  if (!updated) {
    return NextResponse.json({ error: "Cupón no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    coupon: {
      id: updated.id,
      code: updated.code,
      days: updated.days,
      maxRedemptions: updated.maxRedemptions,
      redeemedCount: updated.redeemedCount,
      expiresAtIso: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      active: updated.active,
      note: updated.note,
      createdAtIso: updated.createdAt.toISOString(),
      updatedAtIso: updated.updatedAt.toISOString(),
    },
  });
}
