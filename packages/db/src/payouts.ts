/**
 * Pago a tipsters con Stripe Connect (decisión del fundador 2026-11-11, en lugar de SPEI manual).
 *
 * Ciclo de un asiento de comisión:
 *   pending_clearance --(14 días sin reembolso)--> payable --(reclamo atómico)--> processing_payout --(transferencia)--> paid_out
 *   pending_clearance | payable --(reembolso)--> reversed_refund
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { tipsterCommissionLedger, tipsterProfiles, users } from "./schema";

/** Plazo tras el cual un asiento en `processing_payout` sin transferencia puede retomarse tras caída. */
export const PAYOUT_CLAIM_TIMEOUT_MS = 15 * 60_000;

/** Pasa a `payable` los asientos cuya ventana anti-contracargo ya terminó. */
export async function promoteClearedCommissions(db: Db, now: Date): Promise<number> {
  const rows = await db
    .update(tipsterCommissionLedger)
    .set({ status: "payable" })
    .where(and(eq(tipsterCommissionLedger.status, "pending_clearance"), lte(tipsterCommissionLedger.clearsAt, now)))
    .returning({ id: tipsterCommissionLedger.id });
  return rows.length;
}

export interface PendingTransfer {
  ledgerId: string;
  tipsterUserId: string;
  connectAccountId: string;
  amountCentavos: number;
  stripeInvoiceId: string;
}

/** Asientos pagables de tipsters con cuenta conectada lista para recibir dinero (solo lectura). */
export async function payableTransfers(db: Db): Promise<PendingTransfer[]> {
  const rows = await db
    .select({
      ledgerId: tipsterCommissionLedger.id,
      tipsterUserId: tipsterCommissionLedger.tipsterUserId,
      connectAccountId: tipsterProfiles.stripeConnectAccountId,
      amountCentavos: tipsterCommissionLedger.commissionCentavosMxn,
      stripeInvoiceId: tipsterCommissionLedger.stripeInvoiceId,
    })
    .from(tipsterCommissionLedger)
    .innerJoin(tipsterProfiles, eq(tipsterProfiles.userId, tipsterCommissionLedger.tipsterUserId))
    .where(
      and(
        eq(tipsterCommissionLedger.status, "payable"),
        isNull(tipsterCommissionLedger.stripeTransferId),
        eq(tipsterProfiles.payoutMethod, "stripe_connect"),
        eq(tipsterProfiles.connectPayoutsEnabled, true),
        eq(tipsterProfiles.isActive, true),
        sql`${tipsterCommissionLedger.commissionCentavosMxn} > 0`,
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
        ledgerId: tipsterCommissionLedger.id,
        tipsterUserId: tipsterCommissionLedger.tipsterUserId,
        amountCentavos: tipsterCommissionLedger.commissionCentavosMxn,
        stripeInvoiceId: tipsterCommissionLedger.stripeInvoiceId,
      })
      .from(tipsterCommissionLedger)
      .where(
        and(
          isNull(tipsterCommissionLedger.stripeTransferId),
          sql`${tipsterCommissionLedger.commissionCentavosMxn} > 0`,
          or(
            eq(tipsterCommissionLedger.status, "payable"),
            and(
              eq(tipsterCommissionLedger.status, "processing_payout"),
              or(
                isNull(tipsterCommissionLedger.claimStartedAt),
                lte(tipsterCommissionLedger.claimStartedAt, staleCutoff),
              ),
            ),
          ),
          sql`EXISTS (
            SELECT 1 FROM ${tipsterProfiles}
            WHERE ${tipsterProfiles.userId} = ${tipsterCommissionLedger.tipsterUserId}
              AND ${tipsterProfiles.payoutMethod} = 'stripe_connect'
              AND ${tipsterProfiles.connectPayoutsEnabled} = true
              AND ${tipsterProfiles.isActive} = true
              AND ${tipsterProfiles.stripeConnectAccountId} IS NOT NULL
          )`,
        ),
      )
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];

    const profiles = await t
      .select({
        userId: tipsterProfiles.userId,
        connectAccountId: tipsterProfiles.stripeConnectAccountId,
      })
      .from(tipsterProfiles)
      .where(
        and(
          inArray(tipsterProfiles.userId, [...new Set(candidates.map((c) => c.tipsterUserId))]),
          eq(tipsterProfiles.payoutMethod, "stripe_connect"),
          eq(tipsterProfiles.connectPayoutsEnabled, true),
          eq(tipsterProfiles.isActive, true),
        ),
      );
    const accountByUser = new Map<string, string>();
    for (const p of profiles) {
      if (typeof p.connectAccountId === "string") accountByUser.set(p.userId, p.connectAccountId);
    }

    const claimed: PendingTransfer[] = [];
    for (const c of candidates) {
      const connectAccountId = accountByUser.get(c.tipsterUserId);
      if (!connectAccountId) continue;
      claimed.push({
        ledgerId: c.ledgerId,
        tipsterUserId: c.tipsterUserId,
        connectAccountId,
        amountCentavos: c.amountCentavos,
        stripeInvoiceId: c.stripeInvoiceId,
      });
    }
    if (claimed.length === 0) return [];

    await t
      .update(tipsterCommissionLedger)
      .set({ status: "processing_payout", claimStartedAt: now })
      .where(inArray(tipsterCommissionLedger.id, claimed.map((c) => c.ledgerId)));

    return claimed;
  });
}

/** Marca el asiento como pagado con su transferencia de Stripe Connect. */
export async function markCommissionPaid(db: Db, ledgerId: string, transferId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(tipsterCommissionLedger)
    .set({ status: "paid_out", stripeTransferId: transferId, paidOutAt: now, claimStartedAt: null })
    .where(
      and(
        eq(tipsterCommissionLedger.id, ledgerId),
        isNull(tipsterCommissionLedger.stripeTransferId),
        sql`${tipsterCommissionLedger.status} IN ('payable', 'processing_payout')`,
      ),
    )
    .returning({ id: tipsterCommissionLedger.id });
  return rows.length > 0;
}

/** Libera un asiento reclamado cuando falla el envío a Stripe antes de registrar transferencia. */
export async function releaseCommissionClaim(db: Db, ledgerId: string): Promise<boolean> {
  const rows = await db
    .update(tipsterCommissionLedger)
    .set({ status: "payable", claimStartedAt: null })
    .where(
      and(
        eq(tipsterCommissionLedger.id, ledgerId),
        eq(tipsterCommissionLedger.status, "processing_payout"),
        isNull(tipsterCommissionLedger.stripeTransferId),
      ),
    )
    .returning({ id: tipsterCommissionLedger.id });
  return rows.length > 0;
}

/** Perfil de tipster activo del usuario (para el alta en Connect). */
export async function tipsterProfileForUser(db: Db, userId: string) {
  const [row] = await db
    .select({ profile: tipsterProfiles, email: users.email })
    .from(tipsterProfiles)
    .innerJoin(users, eq(users.id, tipsterProfiles.userId))
    .where(and(eq(tipsterProfiles.userId, userId), eq(tipsterProfiles.isActive, true)));
  return row ?? null;
}

export async function setConnectAccount(db: Db, userId: string, accountId: string): Promise<void> {
  await db
    .update(tipsterProfiles)
    .set({ stripeConnectAccountId: accountId, payoutMethod: "stripe_connect" })
    .where(and(eq(tipsterProfiles.userId, userId), eq(tipsterProfiles.isActive, true)));
}

/** Refleja `account.updated`: si Stripe ya permite pagarle. */
export async function setConnectPayoutsEnabled(db: Db, accountId: string, enabled: boolean): Promise<boolean> {
  const rows = await db
    .update(tipsterProfiles)
    .set({ connectPayoutsEnabled: enabled })
    .where(eq(tipsterProfiles.stripeConnectAccountId, accountId))
    .returning({ id: tipsterProfiles.userId });
  return rows.length > 0;
}
