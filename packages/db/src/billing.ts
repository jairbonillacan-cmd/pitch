/**
 * Reglas de cobro y concesiones (docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md §3 y §5).
 *
 * Todo es idempotente: reenviar el mismo evento de la pasarela no duplica días ni comisiones.
 * Funciona con cualquier base Drizzle de Postgres (Neon en producción, PGlite en pruebas).
 */
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  entitlementGrants,
  referralGrants,
  subscriptions,
  tipstarAttributions,
  tipstarCommissionLedger,
  tipstarProfiles,
  users,
} from "./schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, any, any>;

const DAY_MS = 86_400_000;
export const REFERRAL_REWARD_DAYS = 15;
export const AMBASSADOR_BONUS_DAYS = 30;
export const AMBASSADOR_THRESHOLD = 5;
export const MIN_QUALIFYING_PAID_CENTAVOS = 15_000;
export const COMMISSION_CLEARANCE_DAYS = 14;

/** Comisión de tipstar sobre el neto (bruto − IVA − comisión de pasarela). */
export function computeCommission(input: {
  grossCentavos: number;
  vatCentavos: number;
  gatewayFeeCentavos: number;
  commissionBps: number;
}): { netCentavos: number; commissionCentavos: number } {
  const netCentavos = Math.max(0, input.grossCentavos - input.vatCentavos - input.gatewayFeeCentavos);
  return { netCentavos, commissionCentavos: Math.round((netCentavos * input.commissionBps) / 10_000) };
}

/**
 * Concede días al final del acceso vigente del usuario (los días se acumulan, no se pisan).
 * Devuelve el id de la concesión, nueva o existente para esa clave.
 */
export async function grantDays(
  db: Db,
  input: {
    userId: string;
    sourceKind: typeof entitlementGrants.$inferInsert.sourceKind;
    days: number;
    idempotencyKey: string;
    now: Date;
  },
): Promise<string> {
  const existing = await db
    .select({ id: entitlementGrants.id })
    .from(entitlementGrants)
    .where(eq(entitlementGrants.idempotencyKey, input.idempotencyKey));
  if (existing[0]) return existing[0].id;

  const startsAt = new Date(Math.max(input.now.getTime(), (await accessUntil(db, input.userId, input.now))?.getTime() ?? 0));
  const [row] = await db
    .insert(entitlementGrants)
    .values({
      userId: input.userId,
      sourceKind: input.sourceKind,
      daysGranted: input.days,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.days * DAY_MS),
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: entitlementGrants.idempotencyKey })
    .returning({ id: entitlementGrants.id });
  if (row) return row.id;
  const again = await db
    .select({ id: entitlementGrants.id })
    .from(entitlementGrants)
    .where(eq(entitlementGrants.idempotencyKey, input.idempotencyKey));
  return again[0]!.id;
}

/** Fin del acceso: lo más lejano entre la suscripción activa y las concesiones vigentes. */
export async function accessUntil(db: Db, userId: string, now: Date): Promise<Date | null> {
  const [grant] = await db
    .select({ endsAt: sql<Date | null>`max(${entitlementGrants.endsAt})` })
    .from(entitlementGrants)
    .where(and(eq(entitlementGrants.userId, userId), isNull(entitlementGrants.revokedAt)));
  const [sub] = await db
    .select({ end: subscriptions.currentPeriodEnd, grace: subscriptions.graceUntil, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  const candidates: number[] = [];
  if (grant?.endsAt) candidates.push(new Date(grant.endsAt).getTime());
  if (sub && ["active", "trialing_card", "trialing_no_card"].includes(sub.status)) {
    candidates.push(new Date(sub.end).getTime());
  }
  if (sub?.status === "past_due_grace" && sub.grace) candidates.push(new Date(sub.grace).getTime());
  const best = candidates.length ? Math.max(...candidates) : null;
  return best !== null && best > now.getTime() ? new Date(best) : null;
}

export async function hasActivePaseTotal(db: Db, userId: string, now: Date): Promise<boolean> {
  return (await accessUntil(db, userId, now)) !== null;
}

export interface InvoicePaidInput {
  userId: string;
  stripeInvoiceId: string;
  grossCentavos: number;
  vatCentavos: number;
  gatewayFeeCentavos: number;
  paidAt: Date;
}

export interface InvoicePaidResult {
  referralRewarded: boolean;
  ambassadorBonus: boolean;
  commissionCentavos: number | null;
}

/**
 * Efectos de un cobro liquidado (`invoice.paid`):
 * 1. Referido doble vía: el primer cobro ≥ $150 MXN del invitado da +15 días a ambos; el 5.º
 *    amigo pagado del anfitrión le da +30 días extra una sola vez.
 * 2. Tipstar: asiento de comisión sobre el neto, liquidable a los 14 días.
 */
export async function handleInvoicePaid(db: Db, input: InvoicePaidInput): Promise<InvoicePaidResult> {
  const result: InvoicePaidResult = { referralRewarded: false, ambassadorBonus: false, commissionCentavos: null };

  const [referral] = await db
    .select()
    .from(referralGrants)
    .where(eq(referralGrants.referredUserId, input.userId));
  if (
    referral &&
    referral.status === "trial_started" &&
    input.grossCentavos >= MIN_QUALIFYING_PAID_CENTAVOS
  ) {
    const hostGrant = await grantDays(db, {
      userId: referral.referrerUserId,
      sourceKind: "referral_host_15d",
      days: REFERRAL_REWARD_DAYS,
      idempotencyKey: `ref_host_15d:${referral.id}`,
      now: input.paidAt,
    });
    const friendGrant = await grantDays(db, {
      userId: referral.referredUserId,
      sourceKind: "referral_friend_15d",
      days: REFERRAL_REWARD_DAYS,
      idempotencyKey: `ref_friend_15d:${referral.id}`,
      now: input.paidAt,
    });
    await db
      .update(referralGrants)
      .set({
        status: "rewarded_bilateral",
        qualifyingStripeInvoiceId: input.stripeInvoiceId,
        qualifyingPaidCentavosMxn: input.grossCentavos,
        referrerGrantId: hostGrant,
        referredGrantId: friendGrant,
        qualifiedAt: input.paidAt,
        rewardedAt: input.paidAt,
      })
      .where(eq(referralGrants.id, referral.id));
    result.referralRewarded = true;

    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(referralGrants)
      .where(and(eq(referralGrants.referrerUserId, referral.referrerUserId), eq(referralGrants.status, "rewarded_bilateral")));
    const [host] = await db.select().from(users).where(eq(users.id, referral.referrerUserId));
    if (Number(n) >= AMBASSADOR_THRESHOLD && host && !host.isAmbassador) {
      const bonus = await grantDays(db, {
        userId: referral.referrerUserId,
        sourceKind: "ambassador_bonus_30d",
        days: AMBASSADOR_BONUS_DAYS,
        idempotencyKey: `ambassador_30d:${referral.referrerUserId}`,
        now: input.paidAt,
      });
      await db.update(users).set({ isAmbassador: true }).where(eq(users.id, referral.referrerUserId));
      await db
        .update(referralGrants)
        .set({ triggeredAmbassadorBonusGrantId: bonus })
        .where(eq(referralGrants.id, referral.id));
      result.ambassadorBonus = true;
    }
  }

  const [attribution] = await db
    .select({ attr: tipstarAttributions, bps: tipstarProfiles.commissionBps })
    .from(tipstarAttributions)
    .innerJoin(tipstarProfiles, eq(tipstarProfiles.userId, tipstarAttributions.tipstarUserId))
    .where(
      and(
        eq(tipstarAttributions.referredUserId, input.userId),
        gt(tipstarProfiles.commissionBps, 0),
      ),
    );
  if (attribution && attribution.attr.status !== "fraud_blocked") {
    const { netCentavos, commissionCentavos } = computeCommission({
      grossCentavos: input.grossCentavos,
      vatCentavos: input.vatCentavos,
      gatewayFeeCentavos: input.gatewayFeeCentavos,
      commissionBps: attribution.bps,
    });
    await db
      .insert(tipstarCommissionLedger)
      .values({
        attributionId: attribution.attr.id,
        tipstarUserId: attribution.attr.tipstarUserId,
        stripeInvoiceId: input.stripeInvoiceId,
        grossPaidCentavosMxn: input.grossCentavos,
        vatCentavosMxn: input.vatCentavos,
        gatewayFeeCentavosMxn: input.gatewayFeeCentavos,
        netCommissionableCentavosMxn: netCentavos,
        commissionBps: attribution.bps,
        commissionCentavosMxn: commissionCentavos,
        status: "pending_clearance",
        clearsAt: new Date(input.paidAt.getTime() + COMMISSION_CLEARANCE_DAYS * DAY_MS),
      })
      .onConflictDoNothing({ target: tipstarCommissionLedger.stripeInvoiceId });
    await db
      .update(tipstarAttributions)
      .set({
        status: "active_paying",
        firstPaidAt: attribution.attr.firstPaidAt ?? input.paidAt,
        lastPaidAt: input.paidAt,
      })
      .where(eq(tipstarAttributions.id, attribution.attr.id));
    result.commissionCentavos = commissionCentavos;
  }

  return result;
}

/** Reembolso: revierte la comisión del cobro (si aún no se pagó al tipstar). */
export async function handleInvoiceRefunded(db: Db, stripeInvoiceId: string): Promise<boolean> {
  const rows = await db
    .update(tipstarCommissionLedger)
    .set({ status: "reversed_refund" })
    .where(
      and(
        eq(tipstarCommissionLedger.stripeInvoiceId, stripeInvoiceId),
        sql`${tipstarCommissionLedger.status} IN ('pending_clearance', 'payable')`,
      ),
    )
    .returning({ id: tipstarCommissionLedger.id });
  return rows.length > 0;
}
