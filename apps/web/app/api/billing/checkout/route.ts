import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { accessUntil, eq, referralGrants, subscriptions, users } from "@pitchlab/db";
import { withMemberMutation } from "../../../../src/server/api-guards";
import {
  buildCheckoutParams,
  createCheckoutSession,
  priceIdFor,
  referralCouponFor,
  type PlanInterval,
} from "../../../../src/server/billing/checkout";
import { paymentMode } from "../../../../src/server/billing/payment-mode";
import { trustedAppBaseUrl } from "../../../../src/server/request-security";
import { logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutBodySchema = z
  .object({
    interval: z.enum(["monthly", "annual"]).optional(),
  })
  .strict();

export const POST = withMemberMutation(
  {
    bucket: "billing-checkout",
    limit: 20,
    windowMs: 60_000,
    failClosed: true,
  },
  async ({ request, user }) => {
    if (paymentMode() === "transfer") {
      return NextResponse.json(
        {
          error:
            "El pago con tarjeta se activará pronto; en Beta 1.0 activa tu pase por transferencia SPEI o cupón en Mi plan.",
        },
        { status: 503 },
      );
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = CheckoutBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload("INVALID_INPUT", "Plan de cobro inválido.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const interval: PlanInterval = parsed.data.interval ?? "monthly";
    const priceId = priceIdFor(interval);
    if (!priceId) {
      return NextResponse.json({ error: "Precio no configurado" }, { status: 503 });
    }

    const { db, userId } = user;
    const [profile] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!profile) {
      const payload = createSanitizedErrorPayload("PROFILE_NOT_FOUND", "Perfil no encontrado.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 404 });
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (sub && ["active", "trialing_card"].includes(sub.status)) {
      return NextResponse.json({ error: "Ya tienes Pase PitchLab Ultra activo" }, { status: 409 });
    }

    const now = new Date();
    const [referral] = await db
      .select({ id: referralGrants.id, status: referralGrants.status })
      .from(referralGrants)
      .where(eq(referralGrants.referredUserId, userId))
      .limit(1);

    const couponId = referralCouponFor({
      interval,
      referralStatus: referral?.status,
      couponId: process.env.STRIPE_COUPON_REFERRAL,
    });
    if (couponId && referral) {
      await db
        .update(referralGrants)
        .set({ friendDiscountCouponId: couponId })
        .where(eq(referralGrants.id, referral.id));
    }

    let baseUrl: string;
    try {
      baseUrl = trustedAppBaseUrl(request);
    } catch (err) {
      logSecurityEvent("error", "billing_checkout_invalid_base_url", { userId, error: err });
      return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
    }

    const params = buildCheckoutParams({
      userId,
      email: profile.email,
      interval,
      priceId,
      baseUrl,
      freeAccessUntil: await accessUntil(db, userId, now),
      now,
      couponId,
      customerId: sub?.providerCustomerId ?? null,
    });

    try {
      const session = await createCheckoutSession(apiKey, params);
      return NextResponse.json({ url: session.url });
    } catch (err) {
      logSecurityEvent("error", "billing_checkout_session_failed", { userId, error: err });
      return NextResponse.json({ error: "No se pudo abrir el pago" }, { status: 502 });
    }
  },
);
