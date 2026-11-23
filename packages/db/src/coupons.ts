import { randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  accessUntil,
  applyInvoicePaidEffects,
  grantDays,
  type Db,
  type InvoicePaidResult,
} from "./billing";
import { recordAdminAudit } from "./admin";
import { withDbTransaction } from "./client";
import {
  accessCoupons,
  couponRedemptions,
  tipsterProfiles,
  transferPaymentRequests,
  users,
} from "./schema";
import { computeIncludedVatBreakdown, type TransferRequestRow } from "./transfers";

const COUPON_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type AccessCouponRow = typeof accessCoupons.$inferSelect;

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateCouponCode(): string {
  const part = () => {
    let s = "";
    for (let i = 0; i < 4; i += 1) s += COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)];
    return s;
  };
  return `PL-${part()}-${part()}`;
}

export type CreateCouponResult =
  | { ok: true; coupon: AccessCouponRow }
  | { ok: false; reason: "codigo_invalido" | "dias_invalidos" | "cupo_invalido" | "duplicado" };

export async function createAccessCoupon(
  db: Db,
  input: {
    adminUserId: string | null;
    adminEmail: string;
    code?: string | null;
    days: number;
    maxRedemptions?: number | null;
    expiresAt?: Date | null;
    note?: string | null;
    now?: Date;
    ipSubnetHash?: string | null;
  },
): Promise<CreateCouponResult> {
  const days = Math.trunc(input.days);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { ok: false, reason: "dias_invalidos" };
  }
  const maxRedemptions = input.maxRedemptions ?? null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
    return { ok: false, reason: "cupo_invalido" };
  }

  let code = input.code?.trim() ? normalizeCouponCode(input.code) : "";
  if (code) {
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      return { ok: false, reason: "codigo_invalido" };
    }
  } else {
    code = generateCouponCode();
  }

  const cleanNote = input.note?.trim().slice(0, 280) || null;
  const now = input.now ?? new Date();

  return withDbTransaction(db, async (tx) => {
    const [[existingCoupon], [existingReferral], [existingPromo], [existingSpeiRef]] =
      await Promise.all([
        tx.select({ id: accessCoupons.id }).from(accessCoupons).where(eq(accessCoupons.code, code)).limit(1),
        tx.select({ id: users.id }).from(users).where(sql`upper(${users.referralCode}) = ${code}`).limit(1),
        tx
          .select({ id: tipsterProfiles.userId })
          .from(tipsterProfiles)
          .where(sql`upper(${tipsterProfiles.promoCode}) = ${code}`)
          .limit(1),
        tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.speiReferenceCode, code))
          .limit(1),
      ]);

    if (existingCoupon || existingReferral || existingPromo || existingSpeiRef) {
      return { ok: false, reason: "duplicado" } as const;
    }

    const [created] = await tx
      .insert(accessCoupons)
      .values({
        code,
        days,
        maxRedemptions,
        expiresAt: input.expiresAt ?? null,
        active: true,
        note: cleanNote,
        createdBy: input.adminUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await recordAdminAudit(tx, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "coupon_create",
      targetKey: created!.id,
      payloadJson: { code, days, maxRedemptions, expiresAt: input.expiresAt?.toISOString() ?? null, note: cleanNote },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return { ok: true, coupon: created! } as const;
  });
}

export async function toggleCouponActive(
  db: Db,
  input: {
    adminUserId: string | null;
    adminEmail: string;
    couponId: string;
    active: boolean;
    now?: Date;
    ipSubnetHash?: string | null;
  },
): Promise<AccessCouponRow | null> {
  const now = input.now ?? new Date();
  return withDbTransaction(db, async (tx) => {
    const [updated] = await tx
      .update(accessCoupons)
      .set({ active: input.active, updatedAt: now })
      .where(eq(accessCoupons.id, input.couponId))
      .returning();
    if (!updated) return null;

    await recordAdminAudit(tx, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "coupon_toggle",
      targetKey: updated.id,
      payloadJson: { code: updated.code, active: input.active },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });
    return updated;
  });
}

export async function listCouponsAdmin(db: Db, limit: number = 40): Promise<AccessCouponRow[]> {
  const boundedLimit = Number.isFinite(limit) ? Math.min(40, Math.max(1, Math.trunc(limit))) : 40;
  return db.select().from(accessCoupons).orderBy(desc(accessCoupons.createdAt)).limit(boundedLimit);
}

export interface CouponRedemptionDetail {
  id: string;
  userId: string;
  email: string;
  handle: string | null;
  displayName: string | null;
  entitlementGrantId: string | null;
  createdAt: Date;
}

export async function listCouponRedemptionsAdmin(
  db: Db,
  couponId: string,
  limit = 40,
): Promise<CouponRedemptionDetail[]> {
  const boundedLimit = Number.isFinite(limit) ? Math.min(40, Math.max(1, Math.trunc(limit))) : 40;
  return db
    .select({
      id: couponRedemptions.id,
      userId: couponRedemptions.userId,
      email: users.email,
      handle: users.handle,
      displayName: users.displayName,
      entitlementGrantId: couponRedemptions.entitlementGrantId,
      createdAt: couponRedemptions.createdAt,
    })
    .from(couponRedemptions)
    .innerJoin(users, eq(users.id, couponRedemptions.userId))
    .where(eq(couponRedemptions.couponId, couponId))
    .orderBy(desc(couponRedemptions.createdAt))
    .limit(boundedLimit);
}

export type CouponErrorReason =
  | "no_existe"
  | "inactivo"
  | "vencido"
  | "agotado"
  | "ya_canjeado"
  | "cuenta_distinta";

export interface CouponPreviewSummary {
  id: string;
  code: string;
  days: number;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  isTransferCoupon: boolean;
  isPersonal: boolean;
}

export type ValidateCouponPreviewResult =
  | { valid: true; coupon: CouponPreviewSummary }
  | { valid: false; reason: CouponErrorReason; coupon?: CouponPreviewSummary | null };

function toSummary(c: AccessCouponRow): CouponPreviewSummary {
  return {
    id: c.id,
    code: c.code,
    days: c.days,
    expiresAt: c.expiresAt,
    maxRedemptions: c.maxRedemptions,
    redeemedCount: c.redeemedCount,
    isTransferCoupon: Boolean(c.transferRequestId),
    isPersonal: Boolean(c.restrictedToUserId),
  };
}

export async function validateCouponPreview(
  db: Db,
  input: { code: string; userId?: string | null; now?: Date },
): Promise<ValidateCouponPreviewResult> {
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { valid: false, reason: "no_existe", coupon: null };

  const [coupon] = await db.select().from(accessCoupons).where(eq(accessCoupons.code, code)).limit(1);
  if (!coupon) return { valid: false, reason: "no_existe", coupon: null };

  if (coupon.restrictedToUserId && coupon.restrictedToUserId !== input.userId) {
    return { valid: false, reason: "cuenta_distinta", coupon: null };
  }

  const summary = toSummary(coupon);
  if (!coupon.active) return { valid: false, reason: "inactivo", coupon: summary };

  if (input.userId) {
    const [existing] = await db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)))
      .limit(1);
    if (existing) return { valid: false, reason: "ya_canjeado", coupon: summary };
  }

  const now = input.now ?? new Date();
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "vencido", coupon: summary };
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { valid: false, reason: "agotado", coupon: summary };
  }
  return { valid: true, coupon: summary };
}

export interface ActivatedTransferPayment {
  request: TransferRequestRow;
  paidEffects: InvoicePaidResult;
  user: { id: string; email: string; displayName: string | null; handle: string | null };
}

export type RedeemCouponResult =
  | {
      ok: true;
      coupon: CouponPreviewSummary;
      grantId: string;
      newAccessUntil: Date | null;
      transferActivated: ActivatedTransferPayment | null;
    }
  | { ok: false; reason: CouponErrorReason };

export async function redeemAccessCoupon(
  db: Db,
  input: { userId: string; code: string; now?: Date },
): Promise<RedeemCouponResult> {
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { ok: false, reason: "no_existe" };
  const now = input.now ?? new Date();

  return withDbTransaction(db, async (tx) => {
    const [coupon] = await tx
      .select()
      .from(accessCoupons)
      .where(eq(accessCoupons.code, code))
      .for("update");

    if (!coupon) return { ok: false, reason: "no_existe" } as const;
    if (!coupon.active) return { ok: false, reason: "inactivo" } as const;

    const [already] = await tx
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)))
      .limit(1);
    if (already) return { ok: false, reason: "ya_canjeado" } as const;

    if (coupon.restrictedToUserId && coupon.restrictedToUserId !== input.userId) {
      return { ok: false, reason: "cuenta_distinta" } as const;
    }

    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "vencido" } as const;
    }

    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      return { ok: false, reason: "agotado" } as const;
    }

    let grantId: string;
    let transferActivated: ActivatedTransferPayment | null = null;

    if (coupon.transferRequestId) {
      const [transferRow] = await tx
        .select()
        .from(transferPaymentRequests)
        .where(eq(transferPaymentRequests.id, coupon.transferRequestId))
        .for("update");

      if (!transferRow) {
        return { ok: false, reason: "inactivo" } as const;
      }

      const idempotencyKey = `transfer:${transferRow.id}`;
      grantId = await grantDays(tx, {
        userId: input.userId,
        sourceKind: "transfer_payment",
        days: coupon.days,
        idempotencyKey,
        now,
        note: `Transferencia ${transferRow.referenceCode} · Cupón ${coupon.code}`,
      });

      const vat = computeIncludedVatBreakdown(transferRow.amountCentavosMxn);
      const paidEffects = await applyInvoicePaidEffects(tx, {
        userId: input.userId,
        stripeInvoiceId: idempotencyKey,
        grossCentavos: vat.grossCentavos,
        vatCentavos: vat.vatCentavos,
        gatewayFeeCentavos: 0,
        paidAt: now,
      });

      const [updatedTransfer] = await tx
        .update(transferPaymentRequests)
        .set({
          entitlementGrantId: grantId,
          updatedAt: now,
        })
        .where(eq(transferPaymentRequests.id, transferRow.id))
        .returning();

      const [member] = await tx
        .select({ id: users.id, email: users.email, displayName: users.displayName, handle: users.handle })
        .from(users)
        .where(eq(users.id, input.userId));

      await tx.insert(couponRedemptions).values({
        couponId: coupon.id,
        userId: input.userId,
        entitlementGrantId: grantId,
        transferRequestId: transferRow.id,
        createdAt: now,
      });

      transferActivated = {
        request: updatedTransfer ?? transferRow,
        paidEffects,
        user: member!,
      };
    } else {
      grantId = await grantDays(tx, {
        userId: input.userId,
        sourceKind: "coupon",
        days: coupon.days,
        idempotencyKey: `coupon:${coupon.id}:${input.userId}`,
        now,
        note: `Cupón ${coupon.code}`,
      });

      await tx.insert(couponRedemptions).values({
        couponId: coupon.id,
        userId: input.userId,
        entitlementGrantId: grantId,
        transferRequestId: null,
        createdAt: now,
      });
    }

    const [updatedCoupon] = await tx
      .update(accessCoupons)
      .set({
        redeemedCount: sql`${accessCoupons.redeemedCount} + 1`,
        updatedAt: now,
      })
      .where(eq(accessCoupons.id, coupon.id))
      .returning();

    const newAccessUntil = await accessUntil(tx, input.userId, now);
    return {
      ok: true,
      coupon: toSummary(updatedCoupon ?? coupon),
      grantId,
      newAccessUntil,
      transferActivated,
    } as const;
  });
}

export type CreateCouponBatchResult =
  | { ok: true; coupons: AccessCouponRow[] }
  | { ok: false; reason: "cantidad_invalida" | "dias_invalidos" | "prefijo_invalido" };

export async function createAccessCouponBatch(
  db: Db,
  input: {
    adminUserId: string | null;
    adminEmail: string;
    count: number;
    days: number;
    prefix?: string | null;
    expiresAt?: Date | null;
    note?: string | null;
    now?: Date;
    ipSubnetHash?: string | null;
  },
): Promise<CreateCouponBatchResult> {
  const batchCount = Math.trunc(input.count);
  if (!Number.isFinite(batchCount) || batchCount < 1 || batchCount > 50) {
    return { ok: false, reason: "cantidad_invalida" };
  }
  const days = Math.trunc(input.days);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { ok: false, reason: "dias_invalidos" };
  }

  let cleanPrefix = "PL";
  if (input.prefix?.trim()) {
    cleanPrefix = normalizeCouponCode(input.prefix);
    if (!/^[A-Z0-9]{2,10}$/.test(cleanPrefix)) {
      return { ok: false, reason: "prefijo_invalido" };
    }
  }

  const cleanNote = input.note?.trim().slice(0, 280) || null;
  const now = input.now ?? new Date();

  const makeCode = () => {
    const part = (len: number) => {
      let s = "";
      for (let i = 0; i < len; i += 1) s += COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)];
      return s;
    };
    return `${cleanPrefix}-${part(4)}-${part(4)}`;
  };

  return withDbTransaction(db, async (tx) => {
    const generated = new Set<string>();
    const createdRows: AccessCouponRow[] = [];

    for (let guard = 0; createdRows.length < batchCount && guard < batchCount * 6; guard += 1) {
      const candidate = makeCode();
      if (generated.has(candidate)) continue;
      generated.add(candidate);

      const [existing] = await tx
        .select({ id: accessCoupons.id })
        .from(accessCoupons)
        .where(eq(accessCoupons.code, candidate))
        .limit(1);
      if (existing) continue;

      const [row] = await tx
        .insert(accessCoupons)
        .values({
          code: candidate,
          days,
          maxRedemptions: 1,
          expiresAt: input.expiresAt ?? null,
          active: true,
          note: cleanNote,
          createdBy: input.adminUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (row) createdRows.push(row);
    }

    await recordAdminAudit(tx, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "coupon_batch_create",
      targetKey: `${cleanPrefix}:${createdRows.length}`,
      payloadJson: {
        count: createdRows.length,
        days,
        prefix: cleanPrefix,
        expiresAt: input.expiresAt?.toISOString() ?? null,
        note: cleanNote,
        codesSample: createdRows.slice(0, 5).map((r) => r.code),
      },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return { ok: true, coupons: createdRows } as const;
  });
}
