import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  REFERRAL_REWARD_DAYS,
  applyMigrations,
  entitlementGrants,
  eq,
  grantDays,
  referralGrants,
  revokeGrant,
  subscriptions,
  users,
  type Db,
} from "@pitchlab/db";
import { loadMemberPlanSummary } from "../src/server/member-plan";
import { STRIPE_API_VERSION } from "../src/server/billing/stripe-api";
import {
  processStripeEvent,
  RetryLaterError,
  stripeFeeFetcher,
  stripeInvoiceForCharge,
  stripeTrialEndSetter,
  type WebhookDeps,
} from "../src/server/billing/stripe-webhook";

const DAY = 86_400_000;
const now = new Date("2026-11-11T12:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
let db: Db;
let clock: Date;
let trialCalls: Array<{ sub: string; end: Date | "now"; key: string }>;

function deps(): WebhookDeps {
  return {
    now: () => clock,
    getInvoiceFeeCentavos: async () => 1500,
    setSubscriptionTrialEnd: async (sub, end, key) => {
      trialCalls.push({ sub, end, key });
    },
  };
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
  clock = now;
  trialCalls = [];
});

async function pair() {
  const [host] = await db.insert(users).values({ email: "h@x.com" }).returning();
  const [friend] = await db.insert(users).values({ email: "f@x.com" }).returning();
  await db.insert(referralGrants).values({ referrerUserId: host!.id, referredUserId: friend!.id, referralCodeUsed: "SOCIO-1", status: "trial_started" });
  return { host: host!, friend: friend! };
}

function subEvent(id: string, o: { userId: string; customer: string; subId: string; start: Date; end: Date; status?: string; type?: string }) {
  return {
    id,
    type: o.type ?? "customer.subscription.updated",
    created: 0,
    data: {
      object: {
        id: o.subId, customer: o.customer, status: o.status ?? "active", metadata: { user_id: o.userId },
        items: { data: [{ price: { unit_amount: 29900, recurring: { interval: "month" } }, current_period_start: sec(o.start), current_period_end: sec(o.end) }] },
      },
    },
  };
}

function invoiceEvent(id: string, o: { invoice: string; customer: string; amount: number; paidAt: Date; subId?: string; userId?: string }) {
  return {
    id,
    type: "invoice.paid",
    created: 0,
    data: {
      object: {
        id: o.invoice, customer: o.customer, amount_paid: o.amount, status_transitions: { paid_at: sec(o.paidAt) },
        // Formato actual de Stripe: los datos de la suscripción vienen en parent.subscription_details.
        ...(o.subId
          ? { parent: { type: "subscription_details", subscription_details: { subscription: o.subId, metadata: o.userId ? { user_id: o.userId } : {} } } }
          : {}),
      },
    },
  };
}

const refundEvent = (id: string, invoice: string, amount: number, refunded: number) => ({
  id, type: "charge.refunded", created: 0, data: { object: { id: "ch_1", invoice, amount, amount_refunded: refunded } },
});

describe("1) avisos de Stripe fuera de orden", () => {
  it("premia al referido aunque la factura llegue antes que la suscripción (usa los datos de la factura)", async () => {
    const { host, friend } = await pair();
    const res = await processStripeEvent(
      db,
      invoiceEvent("e_inv", { invoice: "in_1", customer: "cus_f", amount: 20900, paidAt: now, subId: "sub_f", userId: friend.id }),
      deps(),
    );
    expect(res).toContain("referido=true");
    expect((await accessUntil(db, host.id, now))!.getTime()).toBe(now.getTime() + REFERRAL_REWARD_DAYS * DAY);
  });

  it("si la factura no trae el usuario, pide reintentar y el reintento sí premia", async () => {
    const { host, friend } = await pair();
    const inv = invoiceEvent("e_inv", { invoice: "in_1", customer: "cus_f", amount: 20900, paidAt: now, subId: "sub_f" });
    await expect(processStripeEvent(db, inv, deps())).rejects.toBeInstanceOf(RetryLaterError);
    await processStripeEvent(db, subEvent("e_sub", { userId: friend.id, customer: "cus_f", subId: "sub_f", start: now, end: new Date(now.getTime() + 30 * DAY), type: "customer.subscription.created" }), deps());
    expect(await processStripeEvent(db, inv, deps())).toContain("referido=true");
    const [row] = await db.select().from(referralGrants);
    expect(row!.status).toBe("rewarded_bilateral");
    expect(await accessUntil(db, host.id, now)).not.toBeNull();
  });

  it("una factura suelta de un cliente desconocido se sigue ignorando (sin reintentos eternos)", async () => {
    const res = await processStripeEvent(db, invoiceEvent("e_x", { invoice: "in_x", customer: "cus_x", amount: 5000, paidAt: now }), deps());
    expect(res).toBe("factura de un cliente sin suscripción registrada: ignorada");
  });
});

describe("2) los días ganados recorren el cobro en Stripe", () => {
  it("amigo y anfitrión que ya pagan: Stripe cobra los días del referido después, sin prorrateo", async () => {
    const { host, friend } = await pair();
    const hostEnd = new Date(now.getTime() + 20 * DAY);
    const friendEnd = new Date(now.getTime() + 30 * DAY);
    await processStripeEvent(db, subEvent("e_h", { userId: host.id, customer: "cus_h", subId: "sub_h", start: new Date(now.getTime() - 10 * DAY), end: hostEnd }), deps());
    await processStripeEvent(db, subEvent("e_f", { userId: friend.id, customer: "cus_f", subId: "sub_f", start: now, end: friendEnd }), deps());
    expect(trialCalls).toHaveLength(0);

    await processStripeEvent(db, invoiceEvent("e_inv", { invoice: "in_1", customer: "cus_f", amount: 20900, paidAt: now }), deps());
    expect(trialCalls).toEqual([
      { sub: "sub_f", end: new Date(friendEnd.getTime() + REFERRAL_REWARD_DAYS * DAY), key: `trial_end:sub_f:${sec(friendEnd) + REFERRAL_REWARD_DAYS * 86_400}` },
      { sub: "sub_h", end: new Date(hostEnd.getTime() + REFERRAL_REWARD_DAYS * DAY), key: `trial_end:sub_h:${sec(hostEnd) + REFERRAL_REWARD_DAYS * 86_400}` },
    ]);

    // Stripe confirma el cambio (en prueba hasta la nueva fecha): no se vuelve a llamar.
    await processStripeEvent(db, subEvent("e_f2", { userId: friend.id, customer: "cus_f", subId: "sub_f", start: now, end: new Date(friendEnd.getTime() + REFERRAL_REWARD_DAYS * DAY), status: "trialing" }), deps());
    expect(trialCalls).toHaveLength(2);

    // Tras renovar, el acceso real llega más lejos justo por los días del premio.
    expect((await accessUntil(db, friend.id, now))!.getTime()).toBe(friendEnd.getTime() + REFERRAL_REWARD_DAYS * DAY);
    // Y en Mi cuenta sigue viéndose su plan mensual, no «prueba».
    const summary = await loadMemberPlanSummary(db, friend.id, now, true);
    expect(summary.planState).toBe("mensual");
  });

  it("el socio en prueba con tarjeta (sin premios) sigue viéndose en prueba", async () => {
    const [u] = await db.insert(users).values({ email: "p@x.com" }).returning();
    await grantDays(db, { userId: u!.id, sourceKind: "trial_m1_nocard", days: 7, idempotencyKey: "t", now });
    await processStripeEvent(db, subEvent("e", { userId: u!.id, customer: "cus_p", subId: "sub_p", start: now, end: new Date(now.getTime() + 7 * DAY), status: "trialing" }), deps());
    expect(trialCalls).toHaveLength(0);
    expect((await loadMemberPlanSummary(db, u!.id, now, true)).planState).toBe("prueba");
  });
});

describe("3) reembolso del referido", () => {
  async function rewarded() {
    const { host, friend } = await pair();
    const friendEnd = new Date(now.getTime() + 30 * DAY);
    await processStripeEvent(db, subEvent("e_f", { userId: friend.id, customer: "cus_f", subId: "sub_f", start: now, end: friendEnd }), deps());
    await processStripeEvent(db, invoiceEvent("e_inv", { invoice: "in_1", customer: "cus_f", amount: 20900, paidAt: now }), deps());
    await processStripeEvent(db, subEvent("e_f2", { userId: friend.id, customer: "cus_f", subId: "sub_f", start: now, end: new Date(friendEnd.getTime() + REFERRAL_REWARD_DAYS * DAY), status: "trialing" }), deps());
    return { host, friend, friendEnd };
  }

  it("reembolso total: quita los días a ambos y regresa la fecha de cobro de Stripe", async () => {
    const { host, friend, friendEnd } = await rewarded();
    trialCalls = [];
    clock = new Date(now.getTime() + 2 * DAY);
    const res = await processStripeEvent(db, refundEvent("e_ref", "in_1", 20900, 20900), deps());
    expect(res).toContain("premio del referido revertido");
    const [row] = await db.select().from(referralGrants);
    expect(row!.status).toBe("clawed_back");
    expect(await accessUntil(db, host.id, clock)).toBeNull();
    expect(trialCalls).toEqual([{ sub: "sub_f", end: friendEnd, key: `trial_end:sub_f:${sec(friendEnd)}` }]);
    expect((await db.select().from(subscriptions).where(eq(subscriptions.userId, friend.id)))[0]!.currentPeriodEnd.getTime()).toBe(friendEnd.getTime());
  });

  it("un reembolso parcial que deja $150 o más no quita el premio; tampoco uno después de 14 días", async () => {
    await rewarded();
    expect(await processStripeEvent(db, refundEvent("e_r1", "in_1", 20900, 5000), deps())).not.toContain("referido");
    clock = new Date(now.getTime() + 15 * DAY);
    expect(await processStripeEvent(db, refundEvent("e_r2", "in_1", 20900, 20900), deps())).not.toContain("referido");
    expect((await db.select().from(referralGrants))[0]!.status).toBe("rewarded_bilateral");
  });

  it("si el anfitrión baja de 5 amigos pagados pierde el bono de embajador, y puede volver a ganarlo", async () => {
    const [host] = await db.insert(users).values({ email: "amb@x.com" }).returning();
    const friends = [];
    for (let i = 0; i < 6; i++) {
      const [f] = await db.insert(users).values({ email: `f${i}@x.com` }).returning();
      await db.insert(referralGrants).values({ referrerUserId: host!.id, referredUserId: f!.id, referralCodeUsed: "AMB", status: "trial_started" });
      await processStripeEvent(db, subEvent(`s${i}`, { userId: f!.id, customer: `cus_${i}`, subId: `sub_${i}`, start: now, end: new Date(now.getTime() + 30 * DAY) }), deps());
      friends.push(f!);
    }
    for (let i = 0; i < 5; i++) {
      await processStripeEvent(db, invoiceEvent(`i${i}`, { invoice: `in_${i}`, customer: `cus_${i}`, amount: 20900, paidAt: now }), deps());
    }
    expect((await db.select().from(users).where(eq(users.id, host!.id)))[0]!.isAmbassador).toBe(true);
    // 5 × días del referido + 30 de embajador.
    expect((await accessUntil(db, host!.id, now))!.getTime()).toBe(now.getTime() + (5 * REFERRAL_REWARD_DAYS + 30) * DAY);

    await processStripeEvent(db, refundEvent("r0", "in_0", 20900, 20900), deps());
    expect((await db.select().from(users).where(eq(users.id, host!.id)))[0]!.isAmbassador).toBe(false);
    // Quedan 4 × días del referido: los días encadenados después se recorren, no quedan huecos regalados.
    expect((await accessUntil(db, host!.id, now))!.getTime()).toBe(now.getTime() + 4 * REFERRAL_REWARD_DAYS * DAY);

    await processStripeEvent(db, invoiceEvent("i5", { invoice: "in_5", customer: "cus_5", amount: 20900, paidAt: now }), deps());
    expect((await db.select().from(users).where(eq(users.id, host!.id)))[0]!.isAmbassador).toBe(true);
    expect((await accessUntil(db, host!.id, now))!.getTime()).toBe(now.getTime() + (5 * REFERRAL_REWARD_DAYS + 30) * DAY);
  });
});

describe("revocar una concesión acorta el acceso aunque haya otras encadenadas", () => {
  it("recorre las siguientes lo que faltaba por usar", async () => {
    const [u] = await db.insert(users).values({ email: "c@x.com" }).returning();
    const a = await grantDays(db, { userId: u!.id, sourceKind: "admin_grant", days: 10, idempotencyKey: "a", now });
    await grantDays(db, { userId: u!.id, sourceKind: "admin_grant", days: 5, idempotencyKey: "b", now });
    const later = new Date(now.getTime() + 4 * DAY);
    const res = await revokeGrant(db, a, "prueba", later);
    expect(res!.removedMs).toBe(6 * DAY);
    expect((await accessUntil(db, u!.id, later))!.getTime()).toBe(now.getTime() + 9 * DAY);
    const rows = await db.select().from(entitlementGrants);
    expect(rows.find((r) => r.id === a)!.idempotencyKey).toBe(`a:revocada:${a}`);
  });
});

describe("API de Stripe con versión fija y formato actual", () => {
  function fakeStripe(routes: Record<string, unknown>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const path = new URL(url).pathname.replace("/v1", "");
      const body = routes[path];
      return new Response(JSON.stringify(body ?? { error: { message: `sin ruta ${path}` } }), { status: body ? 200 : 404 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("calcula la comisión con Invoice Payments cuando la factura no trae `charge`", async () => {
    const { f, calls } = fakeStripe({
      "/invoice_payments": { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } }, { status: "canceled", payment: { payment_intent: "pi_x" } }] },
      "/payment_intents/pi_1": { latest_charge: { balance_transaction: { fee: 1234 } } },
    });
    expect(await stripeFeeFetcher("sk_test", f)({ id: "in_1" })).toBe(1234);
    expect(calls.every((c) => (c.init.headers as Record<string, string>)["stripe-version"] === STRIPE_API_VERSION)).toBe(true);
    expect(calls[0]!.url).toContain("invoice=in_1");
  });

  it("sigue entendiendo el formato anterior (`invoice.charge`)", async () => {
    const { f } = fakeStripe({ "/charges/ch_1": { balance_transaction: { fee: 900 } } });
    expect(await stripeFeeFetcher("sk_test", f)({ id: "in_1", charge: "ch_1" })).toBe(900);
  });

  it("encuentra la factura de un reembolso por su PaymentIntent", async () => {
    const { f, calls } = fakeStripe({ "/invoice_payments": { data: [{ invoice: "in_9" }] } });
    expect(await stripeInvoiceForCharge("sk_test", f)({ id: "ch_1", payment_intent: "pi_9" })).toBe("in_9");
    expect(decodeURIComponent(calls[0]!.url)).toContain("payment[payment_intent]=pi_9");
    expect(await stripeInvoiceForCharge("sk_test", f)({ id: "ch_2", invoice: "in_old" })).toBe("in_old");
  });

  it("recorre el cobro con trial_end y proration_behavior=none, con clave de idempotencia", async () => {
    const { f, calls } = fakeStripe({ "/subscriptions/sub_1": { id: "sub_1" } });
    await stripeTrialEndSetter("sk_test", f)("sub_1", new Date("2026-12-26T12:00:00Z"), "k1");
    const body = new URLSearchParams(String(calls[0]!.init.body));
    expect(body.get("trial_end")).toBe(String(sec(new Date("2026-12-26T12:00:00Z"))));
    expect(body.get("proration_behavior")).toBe("none");
    expect((calls[0]!.init.headers as Record<string, string>)["idempotency-key"]).toBe("k1");
  });
});
