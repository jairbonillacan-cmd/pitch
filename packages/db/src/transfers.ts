/**
 * Solicitudes de pago por transferencia SPEI y emisión de cupón de acceso (COBRO-SPEI-2).
 *
 * - Calcula montos autoritativos en servidor ($299 mensual, $2,390 anual o $209 primer mes referido).
 * - Asigna a cada cuenta una referencia SPEI permanente y única `PL-{@usuario}-{4 chars}` sin `0/O` ni `1/I`.
 * - Máximo 1 solicitud `pending_review` por socio (respaldado por índice único parcial SQL).
 * - Al aprobar, el fundador confirma el pago y se emite de forma atómica e idempotente un cupón
 *   personal de un solo uso (`max_redemptions = 1`) con vigencia (`TRANSFER_COUPON_VALIDITY_DAYS = 30`),
 *   que el socio recibe desde `noreply@pitchlab.mx` y canjea en `/canjear` para activar su periodo.
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { recordAdminAudit } from "./admin";
import {
  accessCoupons,
  couponRedemptions,
  referralGrants,
  tipsterProfiles,
  transferPaymentRequests,
  users,
} from "./schema";

export type TransferPlanInterval = "monthly" | "annual";
export type TransferRequestStatus = "pending_review" | "approved" | "rejected" | "canceled";

export const MONTHLY_PRICE_CENTAVOS = 29_900;
export const MONTHLY_REFERRAL_PRICE_CENTAVOS = 20_900;
export const ANNUAL_PRICE_CENTAVOS = 239_000;
export const TRANSFER_COUPON_VALIDITY_DAYS = 30;

const DAY_MS = 86_400_000;

/** Alfabeto sin caracteres ambiguos (`0/O`, `1/I`) para referencias SPEI y cupones legibles. */
const SAFE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomSafeChars(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)];
  }
  return out;
}

function buildReferenceStem(handle: string | null | undefined, email: string | null | undefined): string {
  const source = handle?.trim() || email?.split("@")[0] || "SOCIO";
  const cleaned = source
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return (cleaned || "SOCIO").slice(0, 16);
}

function generateSingleUseCouponCode(): string {
  return `PL-${randomSafeChars(4)}-${randomSafeChars(4)}`;
}

function isPgUniqueViolation(error: unknown, expectedConstraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const dbErr = "cause" in error ? error.cause : error;
  if (!dbErr || typeof dbErr !== "object" || !("code" in dbErr)) return false;
  if (dbErr.code !== "23505") return false;
  if (!expectedConstraint) return true;
  const constraint =
    "constraint_name" in dbErr
      ? dbErr.constraint_name
      : "constraint" in dbErr
        ? dbErr.constraint
        : null;
  return constraint === expectedConstraint;
}

function cleanOptionalText(raw: string | null | undefined, maxLen: number): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function cleanOptionalDateIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function computeIncludedVatBreakdown(grossCentavos: number): {
  grossCentavos: number;
  netCentavos: number;
  vatCentavos: number;
  gatewayFeeCentavos: number;
} {
  const netCentavos = Math.round(grossCentavos / 1.16);
  const vatCentavos = Math.max(0, grossCentavos - netCentavos);
  return { grossCentavos, netCentavos, vatCentavos, gatewayFeeCentavos: 0 };
}

export interface TransferPriceQuote {
  planInterval: TransferPlanInterval;
  days: number;
  amountCentavosMxn: number;
  referralDiscountApplied: boolean;
}

/** Calcula el precio exacto que corresponde cobrar al usuario en servidor según plan y referido elegible. */
export async function quoteTransferAmountCentavos(
  db: Db,
  userId: string,
  interval: TransferPlanInterval,
): Promise<TransferPriceQuote> {
  if (interval === "annual") {
    return {
      planInterval: "annual",
      days: 365,
      amountCentavosMxn: ANNUAL_PRICE_CENTAVOS,
      referralDiscountApplied: false,
    };
  }
  const [referral] = await db
    .select({ id: referralGrants.id })
    .from(referralGrants)
    .where(and(eq(referralGrants.referredUserId, userId), eq(referralGrants.status, "trial_started")))
    .limit(1);

  if (referral) {
    return {
      planInterval: "monthly",
      days: 30,
      amountCentavosMxn: MONTHLY_REFERRAL_PRICE_CENTAVOS,
      referralDiscountApplied: true,
    };
  }
  return {
    planInterval: "monthly",
    days: 30,
    amountCentavosMxn: MONTHLY_PRICE_CENTAVOS,
    referralDiscountApplied: false,
  };
}

async function isCodeGloballyFree(db: Db, candidate: string): Promise<boolean> {
  const [[byUserSpei], [byCoupon], [byReferral], [byPromo]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.speiReferenceCode, candidate)).limit(1),
    db.select({ id: accessCoupons.id }).from(accessCoupons).where(eq(accessCoupons.code, candidate)).limit(1),
    db.select({ id: users.id }).from(users).where(sql`upper(${users.referralCode}) = ${candidate}`).limit(1),
    db
      .select({ id: tipsterProfiles.userId })
      .from(tipsterProfiles)
      .where(sql`upper(${tipsterProfiles.promoCode}) = ${candidate}`)
      .limit(1),
  ]);
  return !byUserSpei && !byCoupon && !byReferral && !byPromo;
}

/**
 * Devuelve (o genera y persiste una sola vez) la referencia SPEI única ligada a la cuenta del socio.
 * Formato legible sin caracteres ambiguos: `PL-{HANDLE}-{4 CHARS}` (<= 24 caracteres, apto para SPEI).
 */
export async function ensureUserSpeiReference(db: Db, userId: string): Promise<string> {
  const [user] = await db
    .select({
      id: users.id,
      speiReferenceCode: users.speiReferenceCode,
      handle: users.handle,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("Socio no encontrado para asignar referencia SPEI.");
  }
  if (user.speiReferenceCode) {
    return user.speiReferenceCode;
  }

  const stem = buildReferenceStem(user.handle, user.email);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const suffixLen = attempt < 10 ? 4 : 6;
    const candidate = `PL-${stem}-${randomSafeChars(suffixLen)}`;
    if (!(await isCodeGloballyFree(db, candidate))) continue;

    try {
      const updated = await db
        .update(users)
        .set({ speiReferenceCode: candidate })
        .where(and(eq(users.id, userId), isNull(users.speiReferenceCode)))
        .returning({ speiReferenceCode: users.speiReferenceCode });

      if (updated[0]?.speiReferenceCode) {
        return updated[0].speiReferenceCode;
      }

      const [reread] = await db
        .select({ speiReferenceCode: users.speiReferenceCode })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (reread?.speiReferenceCode) {
        return reread.speiReferenceCode;
      }
    } catch (error) {
      if (isPgUniqueViolation(error, "users_spei_reference_code_unique")) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("No se pudo generar una referencia SPEI única para la cuenta.");
}

/** Alias compatible que garantiza la referencia SPEI permanente del socio. */
export async function generateTransferReferenceCode(db: Db, userId: string): Promise<string> {
  return ensureUserSpeiReference(db, userId);
}

export type TransferRequestRow = typeof transferPaymentRequests.$inferSelect;
export type TransferIssuedCouponRow = typeof accessCoupons.$inferSelect;

export interface UserTransferRequestItem extends TransferRequestRow {
  couponExpiresAt: Date | null;
  couponRedeemedAt: Date | null;
}

export type CreateTransferResult =
  | { ok: true; request: UserTransferRequestItem }
  | {
      ok: false;
      reason: "plan_invalido" | "monto_reportado_invalido" | "solicitud_pendiente_existente";
      existing?: UserTransferRequestItem;
    };

export async function createTransferRequest(
  db: Db,
  input: {
    userId: string;
    planInterval: TransferPlanInterval;
    originBank?: string | null;
    reportedAmountCentavosMxn?: number | null;
    receiptReference?: string | null;
    payerName?: string | null;
    transferDate?: string | null;
    userNote?: string | null;
    now?: Date;
  },
): Promise<CreateTransferResult> {
  if (input.planInterval !== "monthly" && input.planInterval !== "annual") {
    return { ok: false, reason: "plan_invalido" };
  }
  let reportedAmount: number | null = null;
  if (input.reportedAmountCentavosMxn !== undefined && input.reportedAmountCentavosMxn !== null) {
    if (!Number.isInteger(input.reportedAmountCentavosMxn) || input.reportedAmountCentavosMxn <= 0) {
      return { ok: false, reason: "monto_reportado_invalido" };
    }
    reportedAmount = input.reportedAmountCentavosMxn;
  }

  try {
    return await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      const [existingPending] = await t
        .select()
        .from(transferPaymentRequests)
        .where(
          and(
            eq(transferPaymentRequests.userId, input.userId),
            eq(transferPaymentRequests.status, "pending_review"),
          ),
        )
        .limit(1);

      if (existingPending) {
        return {
          ok: false,
          reason: "solicitud_pendiente_existente",
          existing: { ...existingPending, couponExpiresAt: null, couponRedeemedAt: null },
        } as const;
      }

      const quote = await quoteTransferAmountCentavos(t, input.userId, input.planInterval);
      const referenceCode = await ensureUserSpeiReference(t, input.userId);
      const now = input.now ?? new Date();
      const amountMismatch = reportedAmount !== null && reportedAmount !== quote.amountCentavosMxn;

      const [created] = await t
        .insert(transferPaymentRequests)
        .values({
          userId: input.userId,
          planInterval: quote.planInterval,
          amountCentavosMxn: quote.amountCentavosMxn,
          reportedAmountCentavosMxn: reportedAmount,
          amountMismatch,
          referralDiscountApplied: quote.referralDiscountApplied,
          referenceCode,
          originBank: cleanOptionalText(input.originBank, 80),
          receiptReference: cleanOptionalText(input.receiptReference, 120),
          payerName: cleanOptionalText(input.payerName, 120),
          transferDate: cleanOptionalDateIso(input.transferDate),
          userNote: cleanOptionalText(input.userNote, 280),
          status: "pending_review",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        ok: true,
        request: { ...created!, couponExpiresAt: null, couponRedeemedAt: null },
      } as const;
    });
  } catch (error) {
    if (
      isPgUniqueViolation(error, "transfer_requests_one_pending_per_user_uq") ||
      isPgUniqueViolation(error, "transfer_requests_pending_ref_uq")
    ) {
      const [existing] = await db
        .select()
        .from(transferPaymentRequests)
        .where(
          and(
            eq(transferPaymentRequests.userId, input.userId),
            eq(transferPaymentRequests.status, "pending_review"),
          ),
        )
        .limit(1);
      return {
        ok: false,
        reason: "solicitud_pendiente_existente",
        existing: existing ? { ...existing, couponExpiresAt: null, couponRedeemedAt: null } : undefined,
      };
    }
    throw error;
  }
}

export type SubmitTransferReceiptResult =
  | { ok: true; request: UserTransferRequestItem }
  | { ok: false; reason: "monto_reportado_invalido" | "no_encontrada" | "no_pendiente" };

/** Registra o actualiza los datos reportados de la transferencia SPEI (`Ya transferí`). */
export async function submitTransferReceipt(
  db: Db,
  input: {
    requestId: string;
    userId: string;
    originBank?: string | null;
    reportedAmountCentavosMxn?: number | null;
    receiptReference?: string | null;
    payerName?: string | null;
    transferDate?: string | null;
    userNote?: string | null;
    now?: Date;
  },
): Promise<SubmitTransferReceiptResult> {
  if (input.reportedAmountCentavosMxn !== undefined && input.reportedAmountCentavosMxn !== null) {
    if (!Number.isInteger(input.reportedAmountCentavosMxn) || input.reportedAmountCentavosMxn <= 0) {
      return { ok: false, reason: "monto_reportado_invalido" };
    }
  }

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t
      .select()
      .from(transferPaymentRequests)
      .where(and(eq(transferPaymentRequests.id, input.requestId), eq(transferPaymentRequests.userId, input.userId)))
      .for("update");

    if (!row) return { ok: false, reason: "no_encontrada" } as const;
    if (row.status !== "pending_review") return { ok: false, reason: "no_pendiente" } as const;

    const nextReported =
      input.reportedAmountCentavosMxn !== undefined
        ? input.reportedAmountCentavosMxn
        : row.reportedAmountCentavosMxn;
    const amountMismatch = nextReported !== null && nextReported !== row.amountCentavosMxn;

    const [updated] = await t
      .update(transferPaymentRequests)
      .set({
        originBank:
          input.originBank !== undefined ? cleanOptionalText(input.originBank, 80) : row.originBank,
        reportedAmountCentavosMxn: nextReported,
        amountMismatch,
        receiptReference:
          input.receiptReference !== undefined
            ? cleanOptionalText(input.receiptReference, 120)
            : row.receiptReference,
        payerName:
          input.payerName !== undefined ? cleanOptionalText(input.payerName, 120) : row.payerName,
        transferDate:
          input.transferDate !== undefined ? cleanOptionalDateIso(input.transferDate) : row.transferDate,
        userNote: input.userNote !== undefined ? cleanOptionalText(input.userNote, 280) : row.userNote,
        updatedAt: input.now ?? new Date(),
      })
      .where(eq(transferPaymentRequests.id, row.id))
      .returning();

    return {
      ok: true,
      request: { ...updated!, couponExpiresAt: null, couponRedeemedAt: null },
    } as const;
  });
}

export async function cancelTransferRequest(
  db: Db,
  input: { requestId: string; userId: string; now?: Date },
): Promise<{ ok: true; request: UserTransferRequestItem } | { ok: false; reason: "no_encontrada_o_no_pendiente" }> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(transferPaymentRequests)
    .set({ status: "canceled", updatedAt: now })
    .where(
      and(
        eq(transferPaymentRequests.id, input.requestId),
        eq(transferPaymentRequests.userId, input.userId),
        eq(transferPaymentRequests.status, "pending_review"),
      ),
    )
    .returning();
  if (!rows[0]) return { ok: false, reason: "no_encontrada_o_no_pendiente" };
  return {
    ok: true,
    request: { ...rows[0], couponExpiresAt: null, couponRedeemedAt: null },
  };
}

export async function listUserTransferRequests(
  db: Db,
  userId: string,
  limit = 20,
): Promise<UserTransferRequestItem[]> {
  const rows = await db
    .select({
      request: transferPaymentRequests,
      couponExpiresAt: accessCoupons.expiresAt,
      couponRedeemedAt: couponRedemptions.createdAt,
    })
    .from(transferPaymentRequests)
    .leftJoin(accessCoupons, eq(accessCoupons.id, transferPaymentRequests.issuedCouponId))
    .leftJoin(
      couponRedemptions,
      and(
        eq(couponRedemptions.couponId, accessCoupons.id),
        eq(couponRedemptions.userId, transferPaymentRequests.userId),
      ),
    )
    .where(eq(transferPaymentRequests.userId, userId))
    .orderBy(desc(transferPaymentRequests.createdAt))
    .limit(Math.min(40, Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : 20)));

  return rows.map((r) => ({
    ...r.request,
    couponExpiresAt: r.couponExpiresAt ?? null,
    couponRedeemedAt: r.couponRedeemedAt ?? null,
  }));
}

export interface AdminTransferRequestItem extends TransferRequestRow {
  userEmail: string;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedCouponCode: string | null;
  couponExpiresAt: Date | null;
  couponRedeemedAt: Date | null;
}

export async function listAdminTransferRequests(
  db: Db,
  opts?: { status?: TransferRequestStatus | "all"; query?: string; limit?: number },
): Promise<AdminTransferRequestItem[]> {
  const q = opts?.query?.trim();
  const handleQ = q?.replace(/^@+/, "");
  const statusFilter =
    opts?.status && opts.status !== "all" ? eq(transferPaymentRequests.status, opts.status) : undefined;
  const searchFilter = q
    ? or(
        ilike(users.email, `%${q}%`),
        ilike(users.handle, `%${handleQ}%`),
        ilike(transferPaymentRequests.referenceCode, `%${q}%`),
        ilike(transferPaymentRequests.receiptReference, `%${q}%`),
        ilike(transferPaymentRequests.originBank, `%${q}%`),
        ilike(accessCoupons.code, `%${q}%`),
      )
    : undefined;

  const whereClause =
    statusFilter && searchFilter ? and(statusFilter, searchFilter) : statusFilter ?? searchFilter;

  const rows = await db
    .select({
      request: transferPaymentRequests,
      userEmail: users.email,
      userHandle: users.handle,
      userDisplayName: users.displayName,
      issuedCouponCode: accessCoupons.code,
      couponExpiresAt: accessCoupons.expiresAt,
      couponRedeemedAt: couponRedemptions.createdAt,
    })
    .from(transferPaymentRequests)
    .innerJoin(users, eq(users.id, transferPaymentRequests.userId))
    .leftJoin(accessCoupons, eq(accessCoupons.id, transferPaymentRequests.issuedCouponId))
    .leftJoin(
      couponRedemptions,
      and(
        eq(couponRedemptions.couponId, accessCoupons.id),
        eq(couponRedemptions.userId, transferPaymentRequests.userId),
      ),
    )
    .where(whereClause)
    .orderBy(
      sql`CASE WHEN ${transferPaymentRequests.status} = 'pending_review' THEN 0 ELSE 1 END`,
      asc(transferPaymentRequests.createdAt),
    )
    .limit(
      Math.min(
        40,
        Math.max(
          1,
          typeof opts?.limit === "number" && Number.isFinite(opts.limit)
            ? Math.trunc(opts.limit)
            : 40,
        ),
      ),
    );

  return rows.map((r) => ({
    ...r.request,
    userEmail: r.userEmail,
    userHandle: r.userHandle,
    userDisplayName: r.userDisplayName,
    issuedCouponCode: r.issuedCouponCode ?? null,
    couponExpiresAt: r.couponExpiresAt ?? null,
    couponRedeemedAt: r.couponRedeemedAt ?? null,
  }));
}

export type ApproveTransferResult =
  | {
      ok: true;
      alreadyApproved: boolean;
      request: TransferRequestRow;
      coupon: TransferIssuedCouponRow;
      user: { id: string; email: string; displayName: string | null; handle: string | null };
    }
  | { ok: false; reason: "no_encontrada" | "estado_invalido" };

export async function approveTransferRequest(
  db: Db,
  input: {
    requestId: string;
    adminUserId: string | null;
    adminEmail: string;
    paidAt: Date;
    adminNotes?: string | null;
    ipSubnetHash?: string | null;
  },
): Promise<ApproveTransferResult> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t
      .select()
      .from(transferPaymentRequests)
      .where(eq(transferPaymentRequests.id, input.requestId))
      .for("update");

    if (!row) return { ok: false, reason: "no_encontrada" } as const;

    const [member] = await t
      .select({ id: users.id, email: users.email, displayName: users.displayName, handle: users.handle })
      .from(users)
      .where(eq(users.id, row.userId));

    if (row.status === "approved") {
      const [existingCoupon] = await t
        .select()
        .from(accessCoupons)
        .where(
          row.issuedCouponId
            ? eq(accessCoupons.id, row.issuedCouponId)
            : eq(accessCoupons.transferRequestId, row.id),
        )
        .limit(1);

      if (existingCoupon) {
        return {
          ok: true,
          alreadyApproved: true,
          request: row,
          coupon: existingCoupon,
          user: member!,
        } as const;
      }
    }

    if (row.status !== "pending_review") {
      return { ok: false, reason: "estado_invalido" } as const;
    }

    const days = row.planInterval === "annual" ? 365 : 30;
    const expiresAt = new Date(input.paidAt.getTime() + TRANSFER_COUPON_VALIDITY_DAYS * DAY_MS);

    let couponCode = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateSingleUseCouponCode();
      if (await isCodeGloballyFree(t, candidate)) {
        couponCode = candidate;
        break;
      }
    }
    if (!couponCode) {
      throw new Error("No se pudo generar un código de cupón único para la transferencia.");
    }

    const [createdCoupon] = await t
      .insert(accessCoupons)
      .values({
        code: couponCode,
        days,
        maxRedemptions: 1,
        redeemedCount: 0,
        expiresAt,
        active: true,
        transferRequestId: row.id,
        restrictedToUserId: row.userId,
        note: `Pago SPEI ${row.referenceCode} (${row.planInterval === "annual" ? "anual" : "mensual"})`,
        createdBy: input.adminUserId,
        createdAt: input.paidAt,
        updatedAt: input.paidAt,
      })
      .returning();

    const cleanNotes = cleanOptionalText(input.adminNotes, 280);
    const [updated] = await t
      .update(transferPaymentRequests)
      .set({
        status: "approved",
        issuedCouponId: createdCoupon!.id,
        reviewedByUserId: input.adminUserId,
        reviewedAt: input.paidAt,
        adminNotes: cleanNotes ?? row.adminNotes,
        updatedAt: input.paidAt,
      })
      .where(eq(transferPaymentRequests.id, row.id))
      .returning();

    await recordAdminAudit(t, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "transfer_approve",
      targetKey: row.id,
      payloadJson: {
        userId: row.userId,
        planInterval: row.planInterval,
        amountCentavosMxn: row.amountCentavosMxn,
        referenceCode: row.referenceCode,
        couponId: createdCoupon!.id,
        couponCode: createdCoupon!.code,
        days,
        couponExpiresAt: expiresAt.toISOString(),
      },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return {
      ok: true,
      alreadyApproved: false,
      request: updated!,
      coupon: createdCoupon!,
      user: member!,
    } as const;
  });
}

export type RejectTransferResult =
  | {
      ok: true;
      request: TransferRequestRow;
      user: { id: string; email: string; displayName: string | null; handle: string | null };
    }
  | { ok: false; reason: "motivo_requerido" | "no_encontrada" | "estado_invalido" };

export async function rejectTransferRequest(
  db: Db,
  input: {
    requestId: string;
    adminUserId: string | null;
    adminEmail: string;
    reason: string;
    adminNotes?: string | null;
    now: Date;
    ipSubnetHash?: string | null;
  },
): Promise<RejectTransferResult> {
  const cleanReason = cleanOptionalText(input.reason, 280);
  if (!cleanReason || cleanReason.length < 3) {
    return { ok: false, reason: "motivo_requerido" };
  }

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t
      .select()
      .from(transferPaymentRequests)
      .where(eq(transferPaymentRequests.id, input.requestId))
      .for("update");

    if (!row) return { ok: false, reason: "no_encontrada" } as const;
    if (row.status !== "pending_review") return { ok: false, reason: "estado_invalido" } as const;

    const cleanNotes = cleanOptionalText(input.adminNotes, 280);
    const [updated] = await t
      .update(transferPaymentRequests)
      .set({
        status: "rejected",
        reviewedByUserId: input.adminUserId,
        reviewedAt: input.now,
        rejectionReason: cleanReason,
        adminNotes: cleanNotes ?? row.adminNotes,
        updatedAt: input.now,
      })
      .where(eq(transferPaymentRequests.id, row.id))
      .returning();

    const [member] = await t
      .select({ id: users.id, email: users.email, displayName: users.displayName, handle: users.handle })
      .from(users)
      .where(eq(users.id, row.userId));

    await recordAdminAudit(t, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "transfer_reject",
      targetKey: row.id,
      payloadJson: {
        userId: row.userId,
        referenceCode: row.referenceCode,
        reason: cleanReason,
      },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return { ok: true, request: updated!, user: member! } as const;
  });
}

/** Obtiene resumen mínimo de los socios cuyas solicitudes fueron aprobadas (p. ej. si el referido fue premiado). */
export async function lookupReferrerByReferredUserId(
  db: Db,
  referredUserId: string,
): Promise<{ referrerUserId: string; referrerEmail: string; referrerName: string | null } | null> {
  const [row] = await db
    .select({
      referrerUserId: referralGrants.referrerUserId,
      referrerEmail: users.email,
      referrerName: users.displayName,
    })
    .from(referralGrants)
    .innerJoin(users, eq(users.id, referralGrants.referrerUserId))
    .where(and(eq(referralGrants.referredUserId, referredUserId), eq(referralGrants.status, "rewarded_bilateral")))
    .limit(1);
  return row ?? null;
}

export async function lookupTransferUsersByIds(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: users.id, email: users.email, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
}
