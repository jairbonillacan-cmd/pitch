/**
 * Cupones de acceso temporal (Beta 1.0).
 *
 * - Códigos generados automáticamente sin `0/O` ni `1/I` (alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
 * - Canje atómico en transacción con bloqueo de fila `FOR UPDATE`, 1 uso por usuario y respaldo
 *   SQL (`access_coupons_quota_ck` + índice único `(coupon_id, user_id)`).
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { accessUntil, grantDays, type Db } from "./billing";
import { recordAdminAudit } from "./admin";
import { accessCoupons, couponRedemptions, tipsterProfiles, users } from "./schema";

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

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;

    const [[existingCoupon], [existingReferral], [existingPromo]] = await Promise.all([
      t.select({ id: accessCoupons.id }).from(accessCoupons).where(eq(accessCoupons.code, code)).limit(1),
      t.select({ id: users.id }).from(users).where(sql`upper(${users.referralCode}) = ${code}`).limit(1),
      t
        .select({ id: tipsterProfiles.userId })
        .from(tipsterProfiles)
        .where(sql`upper(${tipsterProfiles.promoCode}) = ${code}`)
        .limit(1),
    ]);

    if (existingCoupon || existingReferral || existingPromo) {
      return { ok: false, reason: "duplicado" } as const;
    }

    const [created] = await t
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

    await recordAdminAudit(t, {
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
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [updated] = await t
      .update(accessCoupons)
      .set({ active: input.active, updatedAt: now })
      .where(eq(accessCoupons.id, input.couponId))
      .returning();
    if (!updated) return null;

    await recordAdminAudit(t, {
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

export async function listCouponsAdmin(db: Db, limit = 100): Promise<AccessCouponRow[]> {
  return db.select().from(accessCoupons).orderBy(desc(accessCoupons.createdAt)).limit(limit);
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

export async function listCouponRedemptionsAdmin(db: Db, couponId: string): Promise<CouponRedemptionDetail[]> {
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
    .orderBy(desc(couponRedemptions.createdAt));
}

export type CouponErrorReason = "no_existe" | "inactivo" | "vencido" | "agotado" | "ya_canjeado";

export interface CouponPreviewSummary {
  id: string;
  code: string;
  days: number;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  redeemedCount: number;
}

export type ValidateCouponPreviewResult =
  | { valid: true; coupon: CouponPreviewSummary }
  | { valid: false; reason: CouponErrorReason; coupon?: CouponPreviewSummary };

function toSummary(c: AccessCouponRow): CouponPreviewSummary {
  return {
    id: c.id,
    code: c.code,
    days: c.days,
    expiresAt: c.expiresAt,
    maxRedemptions: c.maxRedemptions,
    redeemedCount: c.redeemedCount,
  };
}

/** Previsualización de solo lectura para `/canjear?codigo=...` (sin consumir usos). */
export async function validateCouponPreview(
  db: Db,
  input: { code: string; userId?: string | null; now?: Date },
): Promise<ValidateCouponPreviewResult> {
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { valid: false, reason: "no_existe" };

  const [coupon] = await db.select().from(accessCoupons).where(eq(accessCoupons.code, code)).limit(1);
  if (!coupon) return { valid: false, reason: "no_existe" };

  const summary = toSummary(coupon);
  if (!coupon.active) return { valid: false, reason: "inactivo", coupon: summary };
  const now = input.now ?? new Date();
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "vencido", coupon: summary };
  }
  if (input.userId) {
    const [existing] = await db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)))
      .limit(1);
    if (existing) return { valid: false, reason: "ya_canjeado", coupon: summary };
  }
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { valid: false, reason: "agotado", coupon: summary };
  }
  return { valid: true, coupon: summary };
}

export type RedeemCouponResult =
  | { ok: true; coupon: CouponPreviewSummary; grantId: string; newAccessUntil: Date | null }
  | { ok: false; reason: CouponErrorReason };

/** Canjea un cupón en transacción con bloqueo de fila (`FOR UPDATE`), sumando días al acceso actual. */
export async function redeemAccessCoupon(
  db: Db,
  input: { userId: string; code: string; now?: Date },
): Promise<RedeemCouponResult> {
  const code = normalizeCouponCode(input.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { ok: false, reason: "no_existe" };
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [coupon] = await t
      .select()
      .from(accessCoupons)
      .where(eq(accessCoupons.code, code))
      .for("update");

    if (!coupon) return { ok: false, reason: "no_existe" } as const;
    if (!coupon.active) return { ok: false, reason: "inactivo" } as const;
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "vencido" } as const;
    }

    const [already] = await t
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)))
      .limit(1);
    if (already) return { ok: false, reason: "ya_canjeado" } as const;

    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      return { ok: false, reason: "agotado" } as const;
    }

    const grantId = await grantDays(t, {
      userId: input.userId,
      sourceKind: "coupon",
      days: coupon.days,
      idempotencyKey: `coupon:${coupon.id}:${input.userId}`,
      now,
      note: `Cupón ${coupon.code}`,
    });

    await t.insert(couponRedemptions).values({
      couponId: coupon.id,
      userId: input.userId,
      entitlementGrantId: grantId,
      createdAt: now,
    });

    const [updatedCoupon] = await t
      .update(accessCoupons)
      .set({
        redeemedCount: sql`${accessCoupons.redeemedCount} + 1`,
        updatedAt: now,
      })
      .where(eq(accessCoupons.id, coupon.id))
      .returning();

    const newAccessUntil = await accessUntil(t, input.userId, now);
    return { ok: true, coupon: toSummary(updatedCoupon ?? coupon), grantId, newAccessUntil } as const;
  });
}
