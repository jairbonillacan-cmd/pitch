import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  applyMigrations,
  referralGrants,
  subscriptions,
  tipstarAttributions,
  tipstarCommissionLedger,
  tipstarProfiles,
  users,
  type Db,
} from "@pitchlab/db";
import {
  processStripeEvent,
  signStripePayload,
  StripeSignatureError,
  verifyStripeSignature,
} from "../src/server/billing/stripe-webhook.js";

const SECRET = "whsec_prueba_local";
const now = new Date("2026-11-11T12:00:00Z");
const deps = { getInvoiceFeeCentavos: async () => 1500, now: () => now };
let db: Db;

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
});

describe("firma de Stripe", () => {
  const payload = JSON.stringify({ id: "evt_1" });
  const t = 1_794_400_000;

  it("acepta una firma válida", () => {
    expect(() => verifyStripeSignature(payload, signStripePayload(payload, SECRET, t), SECRET, t + 10)).not.toThrow();
  });

  it("rechaza firma alterada, vencida o ausente", () => {
    const header = signStripePayload(payload, SECRET, t);
    expect(() => verifyStripeSignature(payload + " ", header, SECRET, t)).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(payload, header, SECRET, t + 301)).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(payload, header, "otro_secreto", t)).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(payload, null, SECRET, t)).toThrow(StripeSignatureError);
  });
});

describe("eventos de Stripe", () => {
  it("suscripción, cobro con referido y tipstar, evento repetido y reembolso", async () => {
    const [host] = await db.insert(users).values({ email: "host@example.com" }).returning();
    const [friend] = await db.insert(users).values({ email: "friend@example.com" }).returning();
    const [tip] = await db.insert(users).values({ email: "tip@example.com" }).returning();
    await db.insert(referralGrants).values({ referrerUserId: host!.id, referredUserId: friend!.id, referralCodeUsed: "SOCIO-1", status: "trial_started" });
    await db.insert(tipstarProfiles).values({ userId: tip!.id, handle: "tip", displayName: "Tip", specialty: "NFL", promoCode: "TIP5", defaultWeeklySlug: "tip-sem" });
    await db.insert(tipstarAttributions).values({ tipstarUserId: tip!.id, referredUserId: friend!.id, promoCodeUsed: "TIP5", status: "trial_5d" });

    const periodEnd = Math.floor(now.getTime() / 1000) + 30 * 86_400;
    const subEvent = {
      id: "evt_sub",
      type: "customer.subscription.created",
      created: 0,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { user_id: friend!.id },
          items: { data: [{ price: { unit_amount: 29900, recurring: { interval: "month" } }, current_period_start: Math.floor(now.getTime() / 1000), current_period_end: periodEnd }] },
        },
      },
    };
    expect(await processStripeEvent(db, subEvent, deps)).toBe("suscripción active");
    const [sub] = await db.select().from(subscriptions);
    expect(sub).toMatchObject({ status: "active", planInterval: "monthly", priceCentavosMxn: 29900 });

    const invoiceEvent = {
      id: "evt_inv",
      type: "invoice.paid",
      created: 0,
      data: { object: { id: "in_1", customer: "cus_1", amount_paid: 29900, total_tax_amounts: [{ amount: 4124 }], charge: "ch_1" } },
    };
    expect(await processStripeEvent(db, invoiceEvent, deps)).toContain("referido=true");
    expect(await processStripeEvent(db, invoiceEvent, deps)).toBe("evento repetido: sin cambios");
    expect((await accessUntil(db, host!.id, now))!.getTime()).toBe(now.getTime() + 15 * 86_400_000);
    const ledger = await db.select().from(tipstarCommissionLedger);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.commissionCentavosMxn).toBe(6069);

    const refund = { id: "evt_ref", type: "charge.refunded", created: 0, data: { object: { id: "ch_1", invoice: "in_1" } } };
    expect(await processStripeEvent(db, refund, deps)).toBe("comisión revertida");
  });

  it("si falla el cálculo de la comisión, el evento se puede reintentar", async () => {
    const [u] = await db.insert(users).values({ email: "x@example.com" }).returning();
    const [t] = await db.insert(users).values({ email: "t@example.com" }).returning();
    await db.insert(tipstarProfiles).values({ userId: t!.id, handle: "t", displayName: "T", specialty: "NFL", promoCode: "T5", defaultWeeklySlug: "t-sem" });
    await db.insert(tipstarAttributions).values({ tipstarUserId: t!.id, referredUserId: u!.id, promoCodeUsed: "T5", status: "trial_5d" });
    await db.insert(subscriptions).values({
      userId: u!.id, provider: "stripe", providerCustomerId: "cus_x", planInterval: "monthly", status: "active",
      priceCentavosMxn: 29900, currentPeriodStart: now, currentPeriodEnd: now,
    });
    const ev = { id: "evt_fail", type: "invoice.paid", created: 0, data: { object: { id: "in_x", customer: "cus_x", amount_paid: 29900 } } };
    await expect(
      processStripeEvent(db, ev, { now: () => now, getInvoiceFeeCentavos: async () => { throw new Error("sin cargo"); } }),
    ).rejects.toThrow("sin cargo");
    // Sin IVA en la factura: neto 29,900 − 1,500 = 28,400; 25 % = 7,100.
    expect(await processStripeEvent(db, ev, deps)).toContain("comisión=7100");
  });
});
