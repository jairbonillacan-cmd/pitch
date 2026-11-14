import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  REFERRAL_REWARD_DAYS,
  applyMigrations,
  computeCommission,
  entitlementGrants,
  grantDays,
  handleInvoicePaid,
  handleInvoiceRefunded,
  hasActivePaseTotal,
  referralGrants,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
  users,
} from "../src/index";

let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-11T12:00:00Z");
const DAY = 86_400_000;

async function user(email: string) {
  const [u] = await db.insert(users).values({ email }).returning();
  return u!;
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

describe("cobro y concesiones", () => {
  it("comisión del 25 % sobre el neto", () => {
    expect(
      computeCommission({ grossCentavos: 29900, vatCentavos: 4124, gatewayFeeCentavos: 1500, commissionBps: 2500 }),
    ).toEqual({ netCentavos: 24276, commissionCentavos: 6069 });
  });

  it("los días se acumulan y la misma clave no duplica", async () => {
    const u = await user("u@example.com");
    expect(await hasActivePaseTotal(db, u.id, now)).toBe(false);
    await grantDays(db, { userId: u.id, sourceKind: "trial_m1_nocard", days: 7, idempotencyKey: "trial_once:u", now });
    await grantDays(db, { userId: u.id, sourceKind: "trial_m1_nocard", days: 7, idempotencyKey: "trial_once:u", now });
    await grantDays(db, { userId: u.id, sourceKind: "admin_grant", days: 3, idempotencyKey: "admin:1", now });
    expect((await accessUntil(db, u.id, now))!.getTime()).toBe(now.getTime() + 10 * DAY);
    expect(await db.select().from(entitlementGrants)).toHaveLength(2);
    expect(await hasActivePaseTotal(db, u.id, new Date(now.getTime() + 11 * DAY))).toBe(false);
  });

  it("referido doble vía: +7 días a ambos con el primer cobro, una sola vez", async () => {
    const host = await user("host@example.com");
    const friend = await user("friend@example.com");
    await db.insert(referralGrants).values({
      referrerUserId: host.id,
      referredUserId: friend.id,
      referralCodeUsed: "SOCIO-1",
      status: "trial_started",
    });
    const paid = { userId: friend.id, stripeInvoiceId: "in_1", grossCentavos: 20930, vatCentavos: 2887, gatewayFeeCentavos: 900, paidAt: now };
    const first = await handleInvoicePaid(db, paid);
    const again = await handleInvoicePaid(db, paid);
    expect(first.referralRewarded).toBe(true);
    expect(again.referralRewarded).toBe(false);
    expect((await accessUntil(db, host.id, now))!.getTime()).toBe(now.getTime() + REFERRAL_REWARD_DAYS * DAY);
    expect((await accessUntil(db, friend.id, now))!.getTime()).toBe(now.getTime() + REFERRAL_REWARD_DAYS * DAY);
    const [row] = await db.select().from(referralGrants);
    expect(row!.status).toBe("rewarded_bilateral");
  });

  it("no premia cobros menores a $150 MXN", async () => {
    const host = await user("h2@example.com");
    const friend = await user("f2@example.com");
    await db.insert(referralGrants).values({ referrerUserId: host.id, referredUserId: friend.id, referralCodeUsed: "SOCIO-2", status: "trial_started" });
    const res = await handleInvoicePaid(db, { userId: friend.id, stripeInvoiceId: "in_small", grossCentavos: 9900, vatCentavos: 0, gatewayFeeCentavos: 0, paidAt: now });
    expect(res.referralRewarded).toBe(false);
  });

  it("el 5.º amigo pagado convierte al anfitrión en embajador (+30 días una vez)", async () => {
    const host = await user("amb@example.com");
    for (let i = 1; i <= 5; i += 1) {
      const f = await user(`f${i}@example.com`);
      await db.insert(referralGrants).values({ referrerUserId: host.id, referredUserId: f.id, referralCodeUsed: "SOCIO-A", status: "trial_started" });
      const res = await handleInvoicePaid(db, { userId: f.id, stripeInvoiceId: `in_${i}`, grossCentavos: 29900, vatCentavos: 4124, gatewayFeeCentavos: 1500, paidAt: now });
      expect(res.ambassadorBonus).toBe(i === 5);
    }
    const [h] = await db.select().from(users).where(eq(users.id, host.id));
    expect(h!.isAmbassador).toBe(true);
    // 5 × días del referido + 30 de embajador, acumulados.
    expect((await accessUntil(db, host.id, now))!.getTime()).toBe(now.getTime() + (5 * REFERRAL_REWARD_DAYS + 30) * DAY);
  });

  it("tipster: un asiento por factura y se revierte con reembolso", async () => {
    const t = await user("tip@example.com");
    const fan = await user("fan@example.com");
    await db.insert(tipsterProfiles).values({ userId: t.id, handle: "tip", displayName: "Tip", specialty: "NFL", promoCode: "TIP5", defaultWeeklySlug: "tip-sem" });
    await db.insert(tipsterAttributions).values({ tipsterUserId: t.id, referredUserId: fan.id, promoCodeUsed: "TIP5", status: "trial_5d" });
    const paid = { userId: fan.id, stripeInvoiceId: "in_t1", grossCentavos: 29900, vatCentavos: 4124, gatewayFeeCentavos: 1500, paidAt: now };
    expect((await handleInvoicePaid(db, paid)).commissionCentavos).toBe(6069);
    await handleInvoicePaid(db, paid);
    const ledger = await db.select().from(tipsterCommissionLedger);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.clearsAt.getTime()).toBe(now.getTime() + 14 * DAY);
    const [attr] = await db.select().from(tipsterAttributions);
    expect(attr!.status).toBe("active_paying");
    expect(await handleInvoiceRefunded(db, "in_t1")).toBe(true);
    const [after] = await db.select().from(tipsterCommissionLedger);
    expect(after!.status).toBe("reversed_refund");
  });
});
