import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminOverview,
  applyMigrations,
  createTipsterCode,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  handleInvoicePaid,
  listTipsterCodes,
  myReferrals,
  referralGrants,
  setBoolFlag,
  tipsterAttributions,
  tipsterProfiles,
  users,
} from "../src/index";

let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-11T12:00:00Z");

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

describe("consola del fundador", () => {
  it("bandera Mes 1 sin tarjeta: valor por defecto y cambio persistente", async () => {
    expect(await getBoolFlag(db, FLAG_MONTH1_NO_CARD, true)).toBe(true);
    await setBoolFlag(db, FLAG_MONTH1_NO_CARD, false, null);
    expect(await getBoolFlag(db, FLAG_MONTH1_NO_CARD, true)).toBe(false);
    await setBoolFlag(db, FLAG_MONTH1_NO_CARD, true, null);
    expect(await getBoolFlag(db, FLAG_MONTH1_NO_CARD, false)).toBe(true);
  });

  it("emite códigos de tipster validados y sin duplicados", async () => {
    expect(await createTipsterCode(db, { email: "Alex@Example.com", handle: "@alex_futbol", displayName: "Alex", promoCode: "alex5", specialty: "Liga MX" })).toEqual({ ok: true });
    expect(await createTipsterCode(db, { email: "otro@example.com", handle: "otro", displayName: "Otro", promoCode: "ALEX5", specialty: "" })).toEqual({ ok: false, reason: "duplicado" });
    expect(await createTipsterCode(db, { email: "x@example.com", handle: "x", displayName: "X", promoCode: "A", specialty: "" })).toEqual({ ok: false, reason: "codigo_invalido" });
    const [p] = await db.select().from(tipsterProfiles);
    expect(p).toMatchObject({ promoCode: "ALEX5", handle: "alex_futbol", defaultWeeklySlug: "alex-futbol-sem" });
  });

  it("resume métricas reales y lista comisiones por tipster", async () => {
    await createTipsterCode(db, { email: "t@example.com", handle: "tip", displayName: "Tip", promoCode: "TIP5", specialty: "NFL" });
    const [tip] = await db.select().from(tipsterProfiles);
    const [fan] = await db.insert(users).values({ email: "fan@example.com" }).returning();
    const [host] = await db.insert(users).values({ email: "host@example.com", referralCode: "SOCIO-1" }).returning();
    await db.insert(tipsterAttributions).values({ tipsterUserId: tip!.userId, referredUserId: fan!.id, promoCodeUsed: "TIP5", status: "trial_5d" });
    await db.insert(referralGrants).values({ referrerUserId: host!.id, referredUserId: fan!.id, referralCodeUsed: "SOCIO-1", status: "trial_started" });
    await handleInvoicePaid(db, { userId: fan!.id, stripeInvoiceId: "in_1", grossCentavos: 29900, vatCentavos: 4124, gatewayFeeCentavos: 1500, paidAt: now });

    const o = await adminOverview(db);
    expect(o).toMatchObject({ members: 3, referralsRewarded: 1, commissionsPayableCentavos: 6069, activeSubscriptions: 0 });
    const codes = await listTipsterCodes(db);
    expect(codes).toEqual([
      { code: "TIP5", handle: "tip", name: "Tip", freeDays: 5, commissionPct: 25, activeReferrals: 1, pendingCommissionCentavos: 6069 },
    ]);
    expect(await myReferrals(db, host!.id)).toEqual({ referralCode: "SOCIO-1", paidFriends: 1, pendingFriends: 0 });
  });
});
