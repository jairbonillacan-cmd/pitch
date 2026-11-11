import { NextResponse } from "next/server";
import { accessUntil, subscriptions, users, eq } from "@pitchlab/db";
import {
  buildCheckoutParams,
  createCheckoutSession,
  priceIdFor,
  type PlanInterval,
} from "../../../../src/server/billing/checkout.js";
import { requireMember } from "../../../../src/server/session-user.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout { interval: "monthly" | "annual" } → { url } de Stripe Checkout.
 * Requiere sesión, STRIPE_SECRET_KEY y el ID de precio del plan.
 */
export async function POST(request: Request): Promise<NextResponse> {
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
    return NextResponse.json({ error: "Ya tienes Pase Total activo" }, { status: 409 });
  }
  const now = new Date();
  const params = buildCheckoutParams({
    userId,
    email: profile!.email,
    interval,
    priceId,
    baseUrl: process.env.BETTER_AUTH_URL ?? new URL(request.url).origin,
    freeAccessUntil: await accessUntil(db, userId, now),
    now,
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
