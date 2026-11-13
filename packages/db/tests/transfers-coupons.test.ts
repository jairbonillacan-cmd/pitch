import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  accessCoupons,
  accessUntil,
  adminAuditLogs,
  adminFindMembersWithGrants,
  adminGrantAccessDays,
  adminRevokeGrant,
  applyMigrations,
  approveTransferRequest,
  cancelTransferRequest,
  claimEmail,
  couponRedemptions,
  createAccessCoupon,
  createTipsterCode,
  createTransferRequest,
  entitlementGrants,
  getUserPreferences,
  grantDays,
  listCouponRedemptionsAdmin,
  listDuePendingEmails,
  listTipsterCommissionsForAdmin,
  markCommissionPaidManually,
  promoteClearedCommissions,
  redeemAccessCoupon,
  referralGrants,
  rejectTransferRequest,
  submitTransferReceipt,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
  toggleCouponActive,
  transferPaymentRequests,
  upsertUserPreferences,
  users,
  validateCouponPreview,
} from "../src/index";

let db: ReturnType<typeof drizzle>;
const now = new Date("2026-11-12T12:00:00Z");
const DAY = 86_400_000;

async function newUser(email: string, handle?: string) {
  const [u] = await db
    .insert(users)
    .values({ email, ...(handle ? { handle } : {}) })
    .returning();
  return u!;
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client);
});

describe("transferencias SPEI, cupones y preferencias (Beta 1.0)", () => {
  it("evita doble solicitud pendiente por socio, detecta diferencia de monto y aprueba de forma idempotente", async () => {
    const socio = await newUser("socio@example.com", "lupita_mx");
    const admin = await newUser("admin@example.com", "jair_op");

    const first = await createTransferRequest(db, {
      userId: socio.id,
      planInterval: "monthly",
      originBank: "BBVA",
      reportedAmountCentavosMxn: 29900,
      receiptReference: "SPEI-001",
      transferDate: "2026-11-12",
      now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unexpected");
    expect(first.request.amountCentavosMxn).toBe(29900);
    expect(first.request.amountMismatch).toBe(false);
    expect(first.request.referenceCode).toMatch(/^PL-LUPITAMX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

    // Segunda pendiente bloqueada
    const dup = await createTransferRequest(db, {
      userId: socio.id,
      planInterval: "annual",
      now,
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe("solicitud_pendiente_existente");

    // Actualizar recibo con diferencia de monto -> bandera amountMismatch
    const updated = await submitTransferReceipt(db, {
      requestId: first.request.id,
      userId: socio.id,
      reportedAmountCentavosMxn: 25000,
      now,
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.request.amountMismatch).toBe(true);

    // Aprobar primera vez otorga 30 días
    const approved1 = await approveTransferRequest(db, {
      requestId: first.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      paidAt: now,
    });
    expect(approved1.ok).toBe(true);
    if (!approved1.ok) throw new Error("unexpected");
    expect(approved1.alreadyApproved).toBe(false);
    expect(approved1.newAccessUntil?.getTime()).toBe(now.getTime() + 30 * DAY);

    // Aprobar segunda vez NO duplica días ni auditoría
    const approved2 = await approveTransferRequest(db, {
      requestId: first.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      paidAt: now,
    });
    expect(approved2.ok).toBe(true);
    if (approved2.ok) expect(approved2.alreadyApproved).toBe(true);
    expect((await accessUntil(db, socio.id, now))!.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(await db.select().from(entitlementGrants)).toHaveLength(1);
  });

  it("rechazar no otorga acceso y cancelar libera al socio para intentar otro plan", async () => {
    const socio = await newUser("rechazo@example.com", "carlos_mx");
    const admin = await newUser("admin2@example.com");

    const req1 = await createTransferRequest(db, { userId: socio.id, planInterval: "monthly", now });
    if (!req1.ok) throw new Error("unexpected");

    const badReject = await rejectTransferRequest(db, {
      requestId: req1.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      reason: "no",
      now,
    });
    expect(badReject.ok).toBe(false);

    const rejected = await rejectTransferRequest(db, {
      requestId: req1.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      reason: "Folio SPEI no localizado en estado de cuenta",
      now,
    });
    expect(rejected.ok).toBe(true);
    expect(await accessUntil(db, socio.id, now)).toBeNull();

    // Tras rechazar puede crear una nueva solicitud anual y luego cancelarla
    const req2 = await createTransferRequest(db, { userId: socio.id, planInterval: "annual", now });
    expect(req2.ok).toBe(true);
    if (!req2.ok) throw new Error("unexpected");
    expect(req2.request.amountCentavosMxn).toBe(239000);

    const canceled = await cancelTransferRequest(db, { requestId: req2.request.id, userId: socio.id, now });
    expect(canceled.ok).toBe(true);
    const [row] = await db
      .select()
      .from(transferPaymentRequests)
      .where(eq(transferPaymentRequests.id, req2.request.id));
    expect(row!.status).toBe("canceled");
  });

  it("dispara referido doble vía (precio $209) y comisión tipster una sola vez al aprobar transferencia", async () => {
    const host = await newUser("host@example.com");
    const friend = await newUser("friend@example.com", "amigo_mx");
    const admin = await newUser("admin3@example.com");

    await createTipsterCode(db, {
      email: "tipster@example.com",
      handle: "pro_picks",
      displayName: "Pro Picks",
      promoCode: "PRO5",
      specialty: "Fútbol",
    });
    const [tip] = await db.select().from(tipsterProfiles);
    await db.insert(tipsterAttributions).values({
      tipsterUserId: tip!.userId,
      referredUserId: friend.id,
      promoCodeUsed: "PRO5",
      status: "trial_5d",
    });
    await db.insert(referralGrants).values({
      referrerUserId: host.id,
      referredUserId: friend.id,
      referralCodeUsed: "SOCIO-H",
      status: "trial_started",
    });

    const req = await createTransferRequest(db, { userId: friend.id, planInterval: "monthly", now });
    if (!req.ok) throw new Error("unexpected");
    // Descuento de referido del 30 % aplicado automáticamente
    expect(req.request.amountCentavosMxn).toBe(20900);
    expect(req.request.referralDiscountApplied).toBe(true);

    const res = await approveTransferRequest(db, {
      requestId: req.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      paidAt: now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unexpected");
    expect(res.paidEffects.referralRewarded).toBe(true);
    // Neto 20900 / 1.16 = 18017; comisión 25 % = 4504
    expect(res.paidEffects.commissionCentavos).toBe(4504);

    // Friend: 30d transferencia + 15d referido = 45d; Host: 15d referido
    expect((await accessUntil(db, friend.id, now))!.getTime()).toBe(now.getTime() + 45 * DAY);
    expect((await accessUntil(db, host.id, now))!.getTime()).toBe(now.getTime() + 15 * DAY);

    // Al aprobar de nuevo no vuelve a premiar ni duplicar comisión
    await approveTransferRequest(db, {
      requestId: req.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      paidAt: now,
    });
    expect(await db.select().from(tipsterCommissionLedger)).toHaveLength(1);

    // Liquidación manual tras 14 días sin colisión por referencia repetida
    const promoted = await promoteClearedCommissions(db, new Date(now.getTime() + 15 * DAY));
    expect(promoted).toBe(1);
    const { ledger, totalsByTipster } = await listTipsterCommissionsForAdmin(db);
    expect(ledger).toHaveLength(1);
    expect(totalsByTipster[0]!.payableCentavos).toBe(4504);

    const paidOut = await markCommissionPaidManually(db, {
      ledgerId: ledger[0]!.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      reference: "SPEI-LOTE-99",
      note: "Liquidado en corte viernes",
      now: new Date(now.getTime() + 15 * DAY),
    });
    expect(paidOut.ok).toBe(true);
  });

  it("canje de cupones: respeta cupo ante dos canjes simultáneos, valida vigencia/activo y acumula días", async () => {
    const admin = await newUser("adminc@example.com");
    const u1 = await newUser("u1@example.com", "uno_mx");
    const u2 = await newUser("u2@example.com", "dos_mx");

    // Cupón único con 1 uso máximo
    const c1 = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      days: 15,
      maxRedemptions: 1,
      note: "Uno solo",
      now,
    });
    expect(c1.ok).toBe(true);
    if (!c1.ok) throw new Error("unexpected");
    expect(c1.coupon.code).toMatch(/^PL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

    // Dos canjes simultáneos sobre cupo 1 -> exactamente 1 éxito y 1 agotado
    const [r1, r2] = await Promise.all([
      redeemAccessCoupon(db, { userId: u1.id, code: c1.coupon.code, now }),
      redeemAccessCoupon(db, { userId: u2.id, code: c1.coupon.code, now }),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    const agotadoCount = [r1, r2].filter((r) => !r.ok && r.reason === "agotado").length;
    expect(okCount).toBe(1);
    expect(agotadoCount).toBe(1);
    const [storedCoupon] = await db.select().from(accessCoupons).where(eq(accessCoupons.id, c1.coupon.id));
    expect(storedCoupon!.redeemedCount).toBe(1);
    expect(await listCouponRedemptionsAdmin(db, c1.coupon.id)).toHaveLength(1);

    // Mismo ganador intenta recanjear -> ya_canjeado
    const winnerId = r1.ok ? u1.id : u2.id;
    const retryWinner = await redeemAccessCoupon(db, { userId: winnerId, code: c1.coupon.code, now });
    expect(retryWinner).toEqual({ ok: false, reason: "ya_canjeado" });

    // Cupón vencido e inactivo fallan
    const cExp = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      code: "VENCID0",
      days: 10,
      expiresAt: new Date(now.getTime() - 1000),
      now,
    });
    if (!cExp.ok) throw new Error("unexpected");
    expect(await redeemAccessCoupon(db, { userId: u2.id, code: "VENCID0", now })).toEqual({
      ok: false,
      reason: "vencido",
    });

    const cInact = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      code: "PAUSADO",
      days: 10,
      now,
    });
    if (!cInact.ok) throw new Error("unexpected");
    await toggleCouponActive(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      couponId: cInact.coupon.id,
      active: false,
      now,
    });
    expect(await validateCouponPreview(db, { code: "PAUSADO", userId: u2.id, now })).toMatchObject({
      valid: false,
      reason: "inactivo",
    });

    // Acumulación real: prueba 7d + transferencia 30d + cupón 15d = 52d
    const uCombo = await newUser("combo@example.com", "combo_mx");
    await grantDays(db, {
      userId: uCombo.id,
      sourceKind: "trial_m1_nocard",
      days: 7,
      idempotencyKey: "trial:combo",
      now,
    });
    const reqCombo = await createTransferRequest(db, { userId: uCombo.id, planInterval: "monthly", now });
    if (!reqCombo.ok) throw new Error("unexpected");
    await approveTransferRequest(db, {
      requestId: reqCombo.request.id,
      adminUserId: admin.id,
      adminEmail: admin.email,
      paidAt: now,
    });
    const cCombo = await createAccessCoupon(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      code: "EXTRA15",
      days: 15,
      now,
    });
    if (!cCombo.ok) throw new Error("unexpected");
    await redeemAccessCoupon(db, { userId: uCombo.id, code: "EXTRA15", now });
    expect((await accessUntil(db, uCombo.id, now))!.getTime()).toBe(now.getTime() + 52 * DAY);
    expect(await db.select().from(couponRedemptions)).toHaveLength(2);
  });

  it("permite al admin buscar socios, dar o revocar días con auditoría, guardar preferencias y encolar correos por ciclo", async () => {
    const admin = await newUser("founder@example.com", "jair_founder");
    const target = await newUser("member@example.com", "ana_apuestas");

    const granted = await adminGrantAccessDays(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      targetUserId: target.id,
      days: 14,
      reason: "Bono beta por reporte",
      now,
    });
    expect(granted.ok).toBe(true);
    if (!granted.ok) throw new Error("unexpected");
    expect(granted.newAccessUntil?.getTime()).toBe(now.getTime() + 14 * DAY);

    const found = await adminFindMembersWithGrants(db, "@ana_apuestas", now);
    expect(found).toHaveLength(1);
    expect(found[0]!.grants).toHaveLength(1);
    expect(found[0]!.activeSourceKind).toBe("admin_grant");

    const revoked = await adminRevokeGrant(db, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      grantId: granted.grantId,
      reason: "Fin de prueba piloto",
      now,
    });
    expect(revoked.ok).toBe(true);
    expect(await accessUntil(db, target.id, now)).toBeNull();
    expect(await db.select().from(adminAuditLogs)).toHaveLength(2);

    // Preferencias en DB + sync de visibilidad pública
    const savedPrefs = await upsertUserPreferences(
      db,
      target.id,
      {
        oddsFormat: "decimal",
        themeMode: "light",
        unitMxnCentavos: 50000,
        showInRanking: false,
        emailPickResults: true,
        responsiblePauseKind: "7d",
      },
      now,
    );
    expect(savedPrefs).toMatchObject({
      oddsFormat: "decimal",
      themeMode: "light",
      unitMxnCentavos: 50000,
      showInRanking: false,
      emailPickResults: true,
      responsiblePauseKind: "7d",
    });
    expect(savedPrefs.responsiblePauseUntil?.getTime()).toBe(now.getTime() + 7 * DAY);
    const [reloaded] = await db.select({ publicProfile: users.publicProfile }).from(users).where(eq(users.id, target.id));
    expect(reloaded!.publicProfile).toBe(false);
    expect((await getUserPreferences(db, target.id)).themeMode).toBe("light");

    // Correos con cycleKey distinto no colisionan y listDuePendingEmails encuentra en ventana
    const c1 = await claimEmail(db, {
      userId: target.id,
      kind: "renewal_reminder",
      cycleKey: "transfer:req-1",
      sendAt: new Date(now.getTime() + 27 * DAY),
    });
    const c2 = await claimEmail(db, {
      userId: target.id,
      kind: "renewal_reminder",
      cycleKey: "transfer:req-2",
      sendAt: new Date(now.getTime() + 60 * DAY),
    });
    expect(c1).toBeTruthy();
    expect(c2).toBeTruthy();
    const due = await listDuePendingEmails(db, new Date(now.getTime() + 28 * DAY));
    expect(due.map((d) => d.cycleKey)).toEqual(["transfer:req-1"]);
  });
});
