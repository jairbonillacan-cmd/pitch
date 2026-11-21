import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { toggleCouponActive } from "@pitchlab/db";
import { withAdminMutation, type AdminMutationContext } from "../../../../../src/server/api-guards";
import { trialHashes } from "../../../../../src/server/signup";
import { UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const couponIdSchema = z.string().trim().regex(UUID_RE);

const toggleCouponBodySchema = z
  .object({
    active: z.boolean(),
  })
  .strict();

function invalidInputResponse(code: string, message: string, status = 400): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code, message: payload.message },
    { status },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

export const PATCH = withAdminMutation(
  { bucket: "admin-coupons-toggle", limit: 60 },
  async ({ request, params, user }: AdminMutationContext<{ id: string }>) => {
    const parsedId = couponIdSchema.safeParse(params.id);
    if (!parsedId.success) {
      return invalidInputResponse("INVALID_COUPON_ID", "Cupón inválido.");
    }

    const rawBody = await readJsonBody(request);
    const parsedBody = toggleCouponBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return invalidInputResponse(
        "INVALID_COUPON_STATE",
        "Indica el nuevo estado activo (true/false).",
      );
    }

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const updated = await toggleCouponActive(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      couponId: parsedId.data,
      active: parsedBody.data.active,
      now: new Date(),
      ipSubnetHash,
    });

    if (!updated) {
      return invalidInputResponse("COUPON_NOT_FOUND", "Cupón no encontrado.", 404);
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
  },
);
