import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { redeemAccessCoupon } from "@pitchlab/db";
import { recordIdorAttempt, withMemberMutation } from "../../../../src/server/api-guards";
import { recordMemberFunnelIfConsented } from "../../../../src/server/funnel";
import { getMailer } from "../../../../src/server/mailer";
import { sendTransferRedeemedEmails } from "../../../../src/server/transfer-emails";
import { COUPON_ERROR_COPY } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RedeemCouponBodySchema = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    codigo: z.string().trim().min(1).max(64).optional(),
  })
  .refine((data) => Boolean(data.code || data.codigo));

export const POST = withMemberMutation(
  {
    bucket: "me-coupons-redeem",
    limit: 10,
    windowMs: 3_600_000,
    failClosed: true,
  },
  async ({ request, user, ipHash }) => {
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = RedeemCouponBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_COUPON_CODE",
        "Escribe el código de tu cupón.",
      );
      return NextResponse.json(
        { ok: false, ...payload, error: payload.message },
        { status: 400 },
      );
    }

    const rawCode = parsed.data.code ?? parsed.data.codigo ?? "";
    const now = new Date();
    const res = await redeemAccessCoupon(user.db, {
      userId: user.userId,
      code: rawCode,
      now,
    });

    if (!res.ok) {
      if (res.reason === "cuenta_distinta") {
        await recordIdorAttempt({
          db: user.db,
          userId: user.userId,
          ipHash,
          route: "/api/me/redeem",
          details: { reason: "cuenta_distinta" },
        });
      }
      const info = COUPON_ERROR_COPY[res.reason];
      return NextResponse.json(
        { ok: false, reason: res.reason, error: info.message },
        { status: info.status },
      );
    }

    if (res.transferActivated) {
      await sendTransferRedeemedEmails(user.db, getMailer(), {
        activated: res.transferActivated,
        newAccessUntil: res.newAccessUntil,
        now,
      });
    }

    await recordMemberFunnelIfConsented(
      user.db,
      user.userId,
      "coupon_redeemed",
      "/app/canjear",
      { grantId: res.grantId, transferActivated: Boolean(res.transferActivated) },
      now,
    );

    return NextResponse.json({
      ok: true,
      code: res.coupon.code,
      days: res.coupon.days,
      grantId: res.grantId,
      transferActivated: Boolean(res.transferActivated),
      newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
    });
  },
);
