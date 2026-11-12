import { NextResponse } from "next/server";
import { accessUntil, referralGrants, subscriptions, users, eq } from "@pitchlab/db";
import {
  buildCheckoutParams,
  createCheckoutSession,
  priceIdFor,
  referralCouponFor,
  type PlanInterval,
} from "../../../../src/server/billing/checkout";
import {
  trustedAppBaseUrl,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout { interval: "monthly" | "annual" } → { url } de Stripe Checkout.
 * Requiere sesión, STRIPE_SECRET_KEY y el ID de precio del plan.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const body = (await request.json().catch(() => null)) as { interval?: unknown } | null;
  const interval: PlanInterval = body?.interval === "annual" ? "annual" : "monthly";
  const priceId = priceIdFor(interval);
  if (!priceId) return NextResponse.json({ error: "Precio no configurado" }, { status: 503 });

  const { db, userId } = member;
  const [profile] = await db.select().from(users).where(eq(users.id, userId));
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (sub && ["active", "trialing_card"].includes(sub.status)) {
    return NextResponse.json({ error: "Ya tienes Pase PitchLab Ultra activo" }, { status: 409 });
  }
  const now = new Date();
  const [referral] = await db
    .select({ id: referralGrants.id, status: referralGrants.status })
    .from(referralGrants)
    .where(eq(referralGrants.referredUserId, userId));
  const couponId = referralCouponFor({
    interval,
    referralStatus: referral?.status,
    couponId: process.env.STRIPE_COUPON_REFERRAL,
  });
  if (couponId && referral) {
    await db.update(referralGrants).set({ friendDiscountCouponId: couponId }).where(eq(referralGrants.id, referral.id));
  }
  let baseUrl: string;
  try {
    baseUrl = trustedAppBaseUrl(request);
  } catch (err) {
    console.error("[checkout] baseUrl inválida:", err);
    return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  }
  const params = buildCheckoutParams({
    userId,
    email: profile!.email,
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
    console.error("[checkout]", err);
    return NextResponse.json({ error: "No se pudo abrir el pago" }, { status: 502 });
  }
}
