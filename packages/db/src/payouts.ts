/**
 * Pago a tipstars con Stripe Connect (decisión del fundador 2026-11-11, en lugar de SPEI manual).
 *
 * Ciclo de un asiento de comisión:
 *   pending_clearance --(14 días sin reembolso)--> payable --(reclamo atómico)--> processing_payout --(transferencia)--> paid_out
 *   pending_clearance | payable --(reembolso)--> reversed_refund
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { tipstarCommissionLedger, tipstarProfiles, users } from "./schema";

/** Plazo tras el cual un asiento en `processing_payout` sin transferencia puede retomarse tras caída. */
export const PAYOUT_CLAIM_TIMEOUT_MS = 15 * 60_000;

/** Pasa a `payable` los asientos cuya ventana anti-contracargo ya terminó. */
export async function promoteClearedCommissions(db: Db, now: Date): Promise<number> {
  const rows = await db
    .update(tipstarCommissionLedger)
    .set({ status: "payable" })
    .where(and(eq(tipstarCommissionLedger.status, "pending_clearance"), lte(tipstarCommissionLedger.clearsAt, now)))
    .returning({ id: tipstarCommissionLedger.id });
  return rows.length;
}

export interface PendingTransfer {
  ledgerId: string;
  tipstarUserId: string;
  connectAccountId: string;
  amountCentavos: number;
  stripeInvoiceId: string;
}

/** Asientos pagables de tipstars con cuenta conectada lista para recibir dinero (solo lectura). */
export async function payableTransfers(db: Db): Promise<PendingTransfer[]> {
  const rows = await db
    .select({
      ledgerId: tipstarCommissionLedger.id,
      tipstarUserId: tipstarCommissionLedger.tipstarUserId,
      connectAccountId: tipstarProfiles.stripeConnectAccountId,
      amountCentavos: tipstarCommissionLedger.commissionCentavosMxn,
      stripeInvoiceId: tipstarCommissionLedger.stripeInvoiceId,
    })
    .from(tipstarCommissionLedger)
    .innerJoin(tipstarProfiles, eq(tipstarProfiles.userId, tipstarCommissionLedger.tipstarUserId))
    .where(
      and(
        eq(tipstarCommissionLedger.status, "payable"),
        isNull(tipstarCommissionLedger.stripeTransferId),
        eq(tipstarProfiles.payoutMethod, "stripe_connect"),
        eq(tipstarProfiles.connectPayoutsEnabled, true),
        eq(tipstarProfiles.isActive, true),
        sql`${tipstarCommissionLedger.commissionCentavosMxn} > 0`,
      ),
    );
  return rows.filter((r): r is PendingTransfer => typeof r.connectAccountId === "string");
}

/**
 * Reclama de forma atómica (`FOR UPDATE SKIP LOCKED`) los asientos listos para pagarse
 * (y los que quedaron en `processing_payout` por más de 15 min tras una caída), pasándolos
 * a `processing_payout` antes de llamar a Stripe para cerrar carreras con `charge.refunded`
 * y corridas paralelas del cron.
 */
export async function claimPayableTransfers(db: Db, now: Date): Promise<PendingTransfer[]> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const staleCutoff = new Date(now.getTime() - PAYOUT_CLAIM_TIMEOUT_MS);
    const candidates = await t
      .select({
        ledgerId: tipstarCommissionLedger.id,
        tipstarUserId: tipstarCommissionLedger.tipstarUserId,
        amountCentavos: tipstarCommissionLedger.commissionCentavosMxn,
        stripeInvoiceId: tipstarCommissionLedger.stripeInvoiceId,
      })
      .from(tipstarCommissionLedger)
      .where(
        and(
          isNull(tipstarCommissionLedger.stripeTransferId),
          sql`${tipstarCommissionLedger.commissionCentavosMxn} > 0`,
          or(
            eq(tipstarCommissionLedger.status, "payable"),
            and(
              eq(tipstarCommissionLedger.status, "processing_payout"),
              or(
                isNull(tipstarCommissionLedger.claimStartedAt),
                lte(tipstarCommissionLedger.claimStartedAt, staleCutoff),
              ),
            ),
          ),
          sql`EXISTS (
            SELECT 1 FROM ${tipstarProfiles}
            WHERE ${tipstarProfiles.userId} = ${tipstarCommissionLedger.tipstarUserId}
              AND ${tipstarProfiles.payoutMethod} = 'stripe_connect'
              AND ${tipstarProfiles.connectPayoutsEnabled} = true
              AND ${tipstarProfiles.isActive} = true
              AND ${tipstarProfiles.stripeConnectAccountId} IS NOT NULL
          )`,
        ),
      )
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];

    const profiles = await t
      .select({
        userId: tipstarProfiles.userId,
        connectAccountId: tipstarProfiles.stripeConnectAccountId,
      })
      .from(tipstarProfiles)
      .where(
        and(
          inArray(tipstarProfiles.userId, [...new Set(candidates.map((c) => c.tipstarUserId))]),
          eq(tipstarProfiles.payoutMethod, "stripe_connect"),
          eq(tipstarProfiles.connectPayoutsEnabled, true),
          eq(tipstarProfiles.isActive, true),
        ),
      );
    const accountByUser = new Map<string, string>();
    for (const p of profiles) {
      if (typeof p.connectAccountId === "string") accountByUser.set(p.userId, p.connectAccountId);
    }

    const claimed: PendingTransfer[] = [];
    for (const c of candidates) {
      const connectAccountId = accountByUser.get(c.tipstarUserId);
      if (!connectAccountId) continue;
      claimed.push({
        ledgerId: c.ledgerId,
        tipstarUserId: c.tipstarUserId,
        connectAccountId,
        amountCentavos: c.amountCentavos,
        stripeInvoiceId: c.stripeInvoiceId,
      });
    }
    if (claimed.length === 0) return [];

    await t
      .update(tipstarCommissionLedger)
      .set({ status: "processing_payout", claimStartedAt: now })
      .where(inArray(tipstarCommissionLedger.id, claimed.map((c) => c.ledgerId)));

    return claimed;
  });
}

/** Marca el asiento como pagado con su transferencia de Stripe Connect. */
export async function markCommissionPaid(db: Db, ledgerId: string, transferId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(tipstarCommissionLedger)
    .set({ status: "paid_out", stripeTransferId: transferId, paidOutAt: now, claimStartedAt: null })
    .where(
      and(
        eq(tipstarCommissionLedger.id, ledgerId),
        isNull(tipstarCommissionLedger.stripeTransferId),
        sql`${tipstarCommissionLedger.status} IN ('payable', 'processing_payout')`,
      ),
    )
    .returning({ id: tipstarCommissionLedger.id });
  return rows.length > 0;
}

/** Libera un asiento reclamado cuando falla el envío a Stripe antes de registrar transferencia. */
export async function releaseCommissionClaim(db: Db, ledgerId: string): Promise<boolean> {
  const rows = await db
    .update(tipstarCommissionLedger)
    .set({ status: "payable", claimStartedAt: null })
    .where(
      and(
        eq(tipstarCommissionLedger.id, ledgerId),
        eq(tipstarCommissionLedger.status, "processing_payout"),
        isNull(tipstarCommissionLedger.stripeTransferId),
      ),
    )
    .returning({ id: tipstarCommissionLedger.id });
  return rows.length > 0;
}

/** Perfil de tipstar del usuario (para el alta en Connect). */
export async function tipstarProfileForUser(db: Db, userId: string) {
  const [row] = await db
    .select({ profile: tipstarProfiles, email: users.email })
    .from(tipstarProfiles)
    .innerJoin(users, eq(users.id, tipstarProfiles.userId))
    .where(eq(tipstarProfiles.userId, userId));
  return row ?? null;
}

export async function setConnectAccount(db: Db, userId: string, accountId: string): Promise<void> {
  await db
    .update(tipstarProfiles)
    .set({ stripeConnectAccountId: accountId, payoutMethod: "stripe_connect" })
    .where(eq(tipstarProfiles.userId, userId));
}

/** Refleja `account.updated`: si Stripe ya permite pagarle. */
export async function setConnectPayoutsEnabled(db: Db, accountId: string, enabled: boolean): Promise<boolean> {
  const rows = await db
    .update(tipstarProfiles)
    .set({ connectPayoutsEnabled: enabled })
    .where(eq(tipstarProfiles.stripeConnectAccountId, accountId))
    .returning({ id: tipstarProfiles.userId });
  return rows.length > 0;
}
