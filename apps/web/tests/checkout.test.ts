import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { applyMigrations, subscriptions, users, type Db } from "@pitchlab/db";
import {
  buildCheckoutParams,
  createCheckoutSession,
  MIN_TRIAL_LEAD_SECONDS,
  referralCouponFor,
  TRIAL_LEAD_MARGIN_SECONDS,
} from "../src/server/billing/checkout";
import { processStripeEvent } from "../src/server/billing/stripe-webhook";

const now = new Date("2026-11-11T12:00:00Z");
const base = {
  userId: "u-1",
  email: "s@example.com",
  interval: "monthly" as const,
  priceId: "price_mensual",
  baseUrl: "https://pitchlab.mx",
  now,
};

describe("Stripe Checkout", () => {
  it("arma la sesión de suscripción ligada al usuario", () => {
    const p = buildCheckoutParams({ ...base, freeAccessUntil: null });
    expect(p.get("mode")).toBe("subscription");
    expect(p.get("line_items[0][price]")).toBe("price_mensual");
    expect(p.get("client_reference_id")).toBe("u-1");
    expect(p.get("subscription_data[metadata][user_id]")).toBe("u-1");
    expect(p.get("customer_email")).toBe("s@example.com");
    expect(p.get("allow_promotion_codes")).toBe("true");
    expect(p.has("subscription_data[trial_end]")).toBe(false);
  });

  it("no cobra antes de que terminen los días gratis; si faltan menos de 48 h, regala hasta 48 h", () => {
    const tenDays = new Date(now.getTime() + 10 * 86_400_000);
    expect(buildCheckoutParams({ ...base, freeAccessUntil: tenDays }).get("subscription_data[trial_end]")).toBe(
      String(Math.floor(tenDays.getTime() / 1000)),
    );
    const oneDay = new Date(now.getTime() + 86_400_000);
    expect(buildCheckoutParams({ ...base, freeAccessUntil: oneDay }).get("subscription_data[trial_end]")).toBe(
      String(Math.floor(now.getTime() / 1000) + MIN_TRIAL_LEAD_SECONDS + TRIAL_LEAD_MARGIN_SECONDS),
    );
    const past = new Date(now.getTime() - 1000);
    expect(buildCheckoutParams({ ...base, freeAccessUntil: past }).has("subscription_data[trial_end]")).toBe(false);
  });

  it("aplica solo el cupón del amigo invitado en el plan mensual, antes de su primer pago", () => {
    const p = buildCheckoutParams({ ...base, freeAccessUntil: null, couponId: "REFERIDO209" });
    expect(p.get("discounts[0][coupon]")).toBe("REFERIDO209");
    expect(p.has("allow_promotion_codes")).toBe(false);
    const both = buildCheckoutParams({ ...base, freeAccessUntil: null, couponId: "REFERIDO209", promotionCodeId: "promo_1" });
    expect(both.get("discounts[0][promotion_code]")).toBe("promo_1");
    expect(both.has("discounts[0][coupon]")).toBe(false);

    expect(referralCouponFor({ interval: "monthly", referralStatus: "trial_started", couponId: "REFERIDO209" })).toBe("REFERIDO209");
    expect(referralCouponFor({ interval: "annual", referralStatus: "trial_started", couponId: "REFERIDO209" })).toBeNull();
    expect(referralCouponFor({ interval: "monthly", referralStatus: "rewarded_bilateral", couponId: "REFERIDO209" })).toBeNull();
    expect(referralCouponFor({ interval: "monthly", referralStatus: undefined, couponId: "REFERIDO209" })).toBeNull();
    expect(referralCouponFor({ interval: "monthly", referralStatus: "trial_started", couponId: undefined })).toBeNull();
  });

  it("usa el cliente existente y el código promocional validado", () => {
    const p = buildCheckoutParams({ ...base, freeAccessUntil: null, customerId: "cus_1", promotionCodeId: "promo_1" });
    expect(p.get("customer")).toBe("cus_1");
    expect(p.has("customer_email")).toBe(false);
    expect(p.get("discounts[0][promotion_code]")).toBe("promo_1");
    expect(p.has("allow_promotion_codes")).toBe(false);
  });

  it("devuelve la URL de pago de Stripe", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }), { status: 200 })) as unknown as typeof fetch;
    expect(await createCheckoutSession("sk_test", new URLSearchParams(), fakeFetch)).toEqual({
      id: "cs_1",
      url: "https://checkout.stripe.com/c/cs_1",
    });
    const failing = (async () => new Response(JSON.stringify({ error: { message: "No such price" } }), { status: 400 })) as unknown as typeof fetch;
    await expect(createCheckoutSession("sk_test", new URLSearchParams(), failing)).rejects.toThrow("No such price");
  });
});

describe("webhook: fallo de pago", () => {
  it("pone la suscripción en gracia de 72 h", async () => {
    const client = new PGlite();
    await applyMigrations((sql) => client.exec(sql));
    const db = drizzle(client) as unknown as Db;
    const [u] = await db.insert(users).values({ email: "f@example.com" }).returning();
    await db.insert(subscriptions).values({
      userId: u!.id, provider: "stripe", providerCustomerId: "cus_f", planInterval: "monthly", status: "active",
      priceCentavosMxn: 29900, currentPeriodStart: now, currentPeriodEnd: now,
    });
    const deps = { now: () => now, getInvoiceFeeCentavos: async () => 0 };
    const res = await processStripeEvent(db, { id: "evt_f", type: "invoice.payment_failed", created: 0, data: { object: { customer: "cus_f" } } }, deps);
    expect(res).toBe("suscripción en gracia de 72 h");
    const [sub] = await db.select().from(subscriptions);
    expect(sub!.status).toBe("past_due_grace");
    expect(sub!.graceUntil!.getTime()).toBe(now.getTime() + 72 * 3_600_000);

    // Un segundo fallo (o un aviso de cambio) un día después no reinicia la gracia.
    const later = new Date(now.getTime() + 86_400_000);
    const laterDeps = { now: () => later, getInvoiceFeeCentavos: async () => 0 };
    await processStripeEvent(db, { id: "evt_f2", type: "invoice.payment_failed", created: 0, data: { object: { customer: "cus_f" } } }, laterDeps);
    await processStripeEvent(db, {
      id: "evt_f3", type: "customer.subscription.updated", created: 0,
      data: { object: { id: "sub_f", customer: "cus_f", status: "past_due", metadata: { user_id: u!.id },
        items: { data: [{ price: { unit_amount: 29900, recurring: { interval: "month" } }, current_period_start: Math.floor(now.getTime() / 1000), current_period_end: Math.floor(now.getTime() / 1000) }] } } },
    }, laterDeps);
    const [again] = await db.select().from(subscriptions);
    expect(again!.graceUntil!.getTime()).toBe(now.getTime() + 72 * 3_600_000);

    // Al recuperarse el pago se borra la gracia; un fallo nuevo empieza otra de 72 h.
    await processStripeEvent(db, {
      id: "evt_f4", type: "customer.subscription.updated", created: 0,
      data: { object: { id: "sub_f", customer: "cus_f", status: "active", metadata: { user_id: u!.id },
        items: { data: [{ price: { unit_amount: 29900, recurring: { interval: "month" } }, current_period_start: Math.floor(now.getTime() / 1000), current_period_end: Math.floor(later.getTime() / 1000) + 30 * 86_400 }] } } },
    }, laterDeps);
    expect((await db.select().from(subscriptions))[0]!.graceUntil).toBeNull();
    await processStripeEvent(db, { id: "evt_f5", type: "invoice.payment_failed", created: 0, data: { object: { customer: "cus_f" } } }, laterDeps);
    expect((await db.select().from(subscriptions))[0]!.graceUntil!.getTime()).toBe(later.getTime() + 72 * 3_600_000);
  });
});
