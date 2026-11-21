import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminAuditLogs,
  adminOverview,
  applyMigrations,
  createTipsterCode,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  handleInvoicePaid,
  listAdminAuditLogs,
  listAdminInbox,
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

  it("acota listAdminInbox y listAdminAuditLogs a <= 40 y selecciona la resolución más reciente por target_key en SQL", async () => {
    const [member] = await db
      .insert(users)
      .values({ email: "socio-inbox@example.com", handle: "socio_inbox", displayName: "Socio Inbox" })
      .returning();
    const [admin] = await db
      .insert(users)
      .values({ email: "admin-inbox@pitchlab.mx", handle: "admin_inbox", displayName: "Admin" })
      .returning();

    const baseMs = new Date("2026-11-11T10:00:00Z").getTime();
    const totalInboxItems = 55;
    const insertedItems = await db
      .insert(adminAuditLogs)
      .values(
        Array.from({ length: totalInboxItems }, (_, i) => ({
          actorUserId: member!.id,
          actorEmail: member!.email,
          action: i % 2 === 0 ? "member_feedback" : "member_support_contact",
          targetKey: member!.id,
          payloadJson: {
            handle: member!.handle,
            displayName: member!.displayName,
            category: "soporte",
            subject: `Asunto ${i}`,
            message: `Mensaje inbox ${i}`,
          },
          createdAt: new Date(baseMs + i * 1_000),
        })),
      )
      .returning({ id: adminAuditLogs.id, createdAt: adminAuditLogs.createdAt });

    const sortedByNewest = [...insertedItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const latestItem = sortedByNewest[0]!;
    const secondItem = sortedByNewest[1]!;

    const latestResolutionAt = new Date(baseMs + 300_000);
    await db.insert(adminAuditLogs).values([
      {
        actorUserId: admin!.id,
        actorEmail: "primer-admin@pitchlab.mx",
        action: "admin_inbox_resolved",
        targetKey: latestItem.id,
        payloadJson: { note: "Primera resolución vieja" },
        createdAt: new Date(baseMs + 100_000),
      },
      {
        actorUserId: admin!.id,
        actorEmail: "segundo-admin@pitchlab.mx",
        action: "admin_inbox_resolved",
        targetKey: latestItem.id,
        payloadJson: { note: "Segunda resolución intermedia" },
        createdAt: new Date(baseMs + 200_000),
      },
      {
        actorUserId: admin!.id,
        actorEmail: "ultimo-admin@pitchlab.mx",
        action: "admin_inbox_resolved",
        targetKey: latestItem.id,
        payloadJson: { note: "Resolución final más reciente" },
        createdAt: latestResolutionAt,
      },
      {
        actorUserId: admin!.id,
        actorEmail: "soporte-1@pitchlab.mx",
        action: "admin_inbox_resolved",
        targetKey: secondItem.id,
        payloadJson: { note: "Nota inicial" },
        createdAt: new Date(baseMs + 150_000),
      },
      {
        actorUserId: admin!.id,
        actorEmail: "soporte-2@pitchlab.mx",
        action: "admin_inbox_resolved",
        targetKey: secondItem.id,
        payloadJson: { note: "Nota definitiva" },
        createdAt: new Date(baseMs + 250_000),
      },
    ]);

    const inboxDefault = await listAdminInbox(db);
    expect(inboxDefault).toHaveLength(40);

    const inboxCapped = await listAdminInbox(db, 200);
    expect(inboxCapped).toHaveLength(40);
    expect(inboxCapped[0]?.id).toBe(latestItem.id);
    expect(inboxCapped[0]?.resolved).toBe(true);
    expect(inboxCapped[0]?.resolvedByEmail).toBe("ultimo-admin@pitchlab.mx");
    expect(inboxCapped[0]?.resolutionNote).toBe("Resolución final más reciente");
    expect(inboxCapped[0]?.resolvedAtIso).toBe(latestResolutionAt.toISOString());

    expect(inboxCapped[1]?.id).toBe(secondItem.id);
    expect(inboxCapped[1]?.resolved).toBe(true);
    expect(inboxCapped[1]?.resolvedByEmail).toBe("soporte-2@pitchlab.mx");
    expect(inboxCapped[1]?.resolutionNote).toBe("Nota definitiva");

    expect(inboxCapped[2]?.resolved).toBe(false);
    expect(inboxCapped[2]?.resolvedAtIso).toBeNull();

    const auditDefault = await listAdminAuditLogs(db);
    expect(auditDefault).toHaveLength(40);

    const auditCapped = await listAdminAuditLogs(db, 200);
    expect(auditCapped).toHaveLength(40);

    const auditSmall = await listAdminAuditLogs(db, 10);
    expect(auditSmall).toHaveLength(10);
  });
});
