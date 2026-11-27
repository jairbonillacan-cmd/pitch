import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { validateCouponPreview } from "@pitchlab/db";
import { recordIdorAttempt, withSessionRead } from "../../../../../src/server/api-guards";
import { COUPON_ERROR_COPY } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CouponPreviewQuerySchema = z
  .object({
    code: z.string().trim().min(1).max(64),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "me-coupons-preview",
    allowBeta: false,
    limit: 20,
    windowMs: 60_000,
    resourceKey: ({ request }) => {
      const sp = new URL(request.url).searchParams;
      return sp.get("codigo") ?? sp.get("code");
    },
  },
  async ({ request, user, ipHash }) => {
    const sp = new URL(request.url).searchParams;
    const rawCode = sp.get("codigo") ?? sp.get("code") ?? "";
    const parsed = CouponPreviewQuerySchema.safeParse({ code: rawCode });
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_COUPON_CODE",
        "Escribe un código para validarlo.",
      );
      return NextResponse.json(
        { valid: false, reason: "no_existe", ...payload, error: payload.message, coupon: null },
        { status: 400 },
      );
    }

    const res = await validateCouponPreview(user.db, {
      code: parsed.data.code,
      userId: user.userId,
      now: new Date(),
    });

    if (!res.valid) {
      if (res.reason === "cuenta_distinta") {
        await recordIdorAttempt({
          db: user.db,
          userId: user.userId,
          ipHash,
          route: "/api/me/coupons/preview",
          details: { reason: "cuenta_distinta" },
        });
      }
      return NextResponse.json({
        valid: false,
        reason: res.reason,
        error: COUPON_ERROR_COPY[res.reason].message,
        coupon:
          res.reason === "cuenta_distinta" || !res.coupon
            ? null
            : {
                code: res.coupon.code,
                days: res.coupon.days,
                maxRedemptions: res.coupon.maxRedemptions,
                expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
                isTransferCoupon: res.coupon.isTransferCoupon,
                isPersonal: res.coupon.isPersonal,
              },
      });
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        code: res.coupon.code,
        days: res.coupon.days,
        maxRedemptions: res.coupon.maxRedemptions,
        expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
        isTransferCoupon: res.coupon.isTransferCoupon,
        isPersonal: res.coupon.isPersonal,
      },
    });
  },
);
