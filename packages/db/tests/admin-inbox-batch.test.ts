import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createAccessCouponBatch,
  listAdminAuditLogs,
  listAdminInbox,
  listCouponRedemptionsAdmin,
  markAdminInboxResolved,
  recordMemberInboxMessage,
  redeemAccessCoupon,
  users,
} from "../src/index";

let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-19T12:00:00Z");

async function newUser(email: string, handle: string) {
  const [u] = await db.insert(users).values({ email, handle, displayName: handle }).returning();
  return u!;
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

describe("ADR-044 · Admin batch single-use coupons, inbox & security audit", () => {
  it("generates a batch of single-use coupons with configurable days, tracks who redeemed, and records audit logs", async () => {
    const admin = await newUser("admin@pitchlab.mx", "fundador");
    const member = await newUser("socio@example.com", "carlos_mx");
    const secondMember = await newUser("otro@example.com", "elena_mx");

    const batch = await createAccessCouponBatch(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      count: 4,
      days: 45,
      prefix: "VIP",
      note: "Lote lanzamiento",
      now,
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;
    expect(batch.coupons).toHaveLength(4);
    expect(batch.coupons.every((c) => c.maxRedemptions === 1 && c.days === 45)).toBe(true);
    expect(batch.coupons.every((c) => c.code.startsWith("VIP-"))).toBe(true);

    const first = batch.coupons[0]!;
    const redeem1 = await redeemAccessCoupon(db, { userId: member.id, code: first.code, now });
    expect(redeem1.ok).toBe(true);

    // Segundo intento sobre código de un solo uso debe fallar
    const redeem2 = await redeemAccessCoupon(db, { userId: secondMember.id, code: first.code, now });
    expect(redeem2.ok).toBe(false);

    const redemptions = await listCouponRedemptionsAdmin(db, first.id);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]?.handle).toBe("carlos_mx");

    const audit = await listAdminAuditLogs(db, 10);
    expect(audit.some((a) => a.action === "coupon_batch_create")).toBe(true);
  });

  it("records feedback/support messages in Admin Inbox and marks them resolved with audit trail", async () => {
    const admin = await newUser("admin@pitchlab.mx", "fundador");
    const member = await newUser("socio@example.com", "maria_mx");

    const msg = await recordMemberInboxMessage(db, {
      userId: member.id,
      email: member.email,
      handle: member.handle,
      displayName: member.displayName,
      kind: "feedback",
      category: "Nueva liga o mercado",
      subject: "Agregar Copa MX",
      message: "Sería genial ver tabla y momios de copa en móvil.",
    });
    expect(msg.id).toBeTruthy();

    const inboxBefore = await listAdminInbox(db, 20);
    expect(inboxBefore).toHaveLength(1);
    expect(inboxBefore[0]?.resolved).toBe(false);
    expect(inboxBefore[0]?.kind).toBe("feedback");

    const resolved = await markAdminInboxResolved(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      itemId: msg.id,
      note: "Anotado en roadmap",
    });
    expect(resolved.ok).toBe(true);

    const inboxAfter = await listAdminInbox(db, 20);
    expect(inboxAfter[0]?.resolved).toBe(true);
    expect(inboxAfter[0]?.resolvedByEmail).toBe("admin@pitchlab.mx");
  });
});
