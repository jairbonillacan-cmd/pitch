/**
 * Pago a tipstars con Stripe Connect (decisión del fundador 2026-11-11, en lugar de SPEI manual).
 *
 * Ciclo de un asiento de comisión:
 *   pending_clearance --(14 días sin reembolso)--> payable --(transferencia)--> paid_out
 *   pending_clearance | payable --(reembolso)--> reversed_refund
 */
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { tipstarCommissionLedger, tipstarProfiles, users } from "./schema";

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

/** Asientos pagables de tipstars con cuenta conectada lista para recibir dinero. */
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

/** Marca el asiento como pagado con su transferencia (solo si seguía pagable). */
export async function markCommissionPaid(db: Db, ledgerId: string, transferId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(tipstarCommissionLedger)
    .set({ status: "paid_out", stripeTransferId: transferId, paidOutAt: now })
    .where(and(eq(tipstarCommissionLedger.id, ledgerId), eq(tipstarCommissionLedger.status, "payable")))
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
