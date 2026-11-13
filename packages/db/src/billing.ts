/**
 * Reglas de cobro y concesiones (docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md §3 y §5).
 *
 * Todo es idempotente: reenviar el mismo evento de la pasarela no duplica días ni comisiones.
 * Funciona con cualquier base Drizzle de Postgres (Neon en producción, PGlite en pruebas).
 */
import { and, count, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  entitlementGrants,
  referralGrants,
  subscriptions,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
  users,
} from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, any, any>;

const DAY_MS = 86_400_000;
export const REFERRAL_REWARD_DAYS = 15;
export const AMBASSADOR_BONUS_DAYS = 30;
export const AMBASSADOR_THRESHOLD = 5;
export const MIN_QUALIFYING_PAID_CENTAVOS = 15_000;
export const COMMISSION_CLEARANCE_DAYS = 14;
/** Un reembolso dentro de este plazo desde el premio revierte los días del referido. */
export const REFERRAL_CLAWBACK_DAYS = 14;
/** Concesiones que son premio (no prueba): al recorrer el cobro en Stripe, el socio sigue en su plan. */
export const REWARD_GRANT_KINDS = ["referral_host_15d", "referral_friend_15d", "ambassador_bonus_30d", "admin_grant"] as const;

/** Comisión de tipster sobre el neto (bruto − IVA − comisión de pasarela). */
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
 * 2. Tipster: asiento de comisión sobre el neto, liquidable a los 14 días.
 */
export async function handleInvoicePaid(db: Db, input: InvoicePaidInput): Promise<InvoicePaidResult> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const result: InvoicePaidResult = { referralRewarded: false, ambassadorBonus: false, commissionCentavos: null };

    const [referral] = await t
      .select()
      .from(referralGrants)
      .where(eq(referralGrants.referredUserId, input.userId))
      .for("update");
    if (
      referral &&
      referral.status === "trial_started" &&
      input.grossCentavos >= MIN_QUALIFYING_PAID_CENTAVOS
    ) {
      const hostGrant = await grantDays(t, {
        userId: referral.referrerUserId,
        sourceKind: "referral_host_15d",
        days: REFERRAL_REWARD_DAYS,
        idempotencyKey: `ref_host_15d:${referral.id}`,
        now: input.paidAt,
      });
      const friendGrant = await grantDays(t, {
        userId: referral.referredUserId,
        sourceKind: "referral_friend_15d",
        days: REFERRAL_REWARD_DAYS,
        idempotencyKey: `ref_friend_15d:${referral.id}`,
        now: input.paidAt,
      });
      const transitioned = await t
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
        .where(and(eq(referralGrants.id, referral.id), eq(referralGrants.status, "trial_started")))
        .returning({ id: referralGrants.id });

      if (transitioned.length > 0) {
        result.referralRewarded = true;

        const [host] = await t
          .select()
          .from(users)
          .where(eq(users.id, referral.referrerUserId))
          .for("update");
        const [{ n } = { n: 0 }] = await t
          .select({ n: count() })
          .from(referralGrants)
          .where(
            and(
              eq(referralGrants.referrerUserId, referral.referrerUserId),
              eq(referralGrants.status, "rewarded_bilateral"),
            ),
          );
        if (Number(n) >= AMBASSADOR_THRESHOLD && host && !host.isAmbassador) {
          const promoted = await t
            .update(users)
            .set({ isAmbassador: true })
            .where(and(eq(users.id, referral.referrerUserId), eq(users.isAmbassador, false)))
            .returning({ id: users.id });
          if (promoted.length > 0) {
            const bonus = await grantDays(t, {
              userId: referral.referrerUserId,
              sourceKind: "ambassador_bonus_30d",
              days: AMBASSADOR_BONUS_DAYS,
              idempotencyKey: `ambassador_30d:${referral.referrerUserId}`,
              now: input.paidAt,
            });
            await t
              .update(referralGrants)
              .set({ triggeredAmbassadorBonusGrantId: bonus })
              .where(eq(referralGrants.id, referral.id));
            result.ambassadorBonus = true;
          }
        }
      }
    }

    const [attribution] = await t
      .select({ attr: tipsterAttributions, bps: tipsterProfiles.commissionBps })
      .from(tipsterAttributions)
      .innerJoin(tipsterProfiles, eq(tipsterProfiles.userId, tipsterAttributions.tipsterUserId))
      .where(
        and(
          eq(tipsterAttributions.referredUserId, input.userId),
          eq(tipsterProfiles.isActive, true),
          gt(tipsterProfiles.commissionBps, 0),
        ),
      );
    if (attribution && attribution.attr.status !== "fraud_blocked") {
      const { netCentavos, commissionCentavos } = computeCommission({
        grossCentavos: input.grossCentavos,
        vatCentavos: input.vatCentavos,
        gatewayFeeCentavos: input.gatewayFeeCentavos,
        commissionBps: attribution.bps,
      });
      await t
        .insert(tipsterCommissionLedger)
        .values({
          attributionId: attribution.attr.id,
          tipsterUserId: attribution.attr.tipsterUserId,
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
        .onConflictDoNothing({ target: tipsterCommissionLedger.stripeInvoiceId });
      await t
        .update(tipsterAttributions)
        .set({
          status: "active_paying",
          firstPaidAt: attribution.attr.firstPaidAt ?? input.paidAt,
          lastPaidAt: input.paidAt,
        })
        .where(eq(tipsterAttributions.id, attribution.attr.id));
      result.commissionCentavos = commissionCentavos;
    }

    return result;
  });
}

/** Reembolso: revierte la comisión del cobro (si aún no se pagó al tipster). */
export async function handleInvoiceRefunded(db: Db, stripeInvoiceId: string): Promise<boolean> {
  const rows = await db
    .update(tipsterCommissionLedger)
    .set({ status: "reversed_refund" })
    .where(
      and(
        eq(tipsterCommissionLedger.stripeInvoiceId, stripeInvoiceId),
        sql`${tipsterCommissionLedger.status} IN ('pending_clearance', 'payable')`,
      ),
    )
    .returning({ id: tipsterCommissionLedger.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Días concedidos frente a la fecha de cobro de Stripe
// ---------------------------------------------------------------------------

/** Fin de los días concedidos vigentes, sin contar la suscripción. */
export async function grantsUntil(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ endsAt: sql<Date | null>`max(${entitlementGrants.endsAt})` })
    .from(entitlementGrants)
    .where(and(eq(entitlementGrants.userId, userId), isNull(entitlementGrants.revokedAt)));
  return row?.endsAt ? new Date(row.endsAt) : null;
}

/** Tiempo de una concesión que aún no se usa (0 si ya se consumió). */
export function remainingGrantMs(grant: { startsAt: Date; endsAt: Date }, now: Date): number {
  const start = Math.max(now.getTime(), new Date(grant.startsAt).getTime());
  return Math.max(0, new Date(grant.endsAt).getTime() - start);
}

/**
 * Marca como «ya reflejadas en Stripe» las concesiones que caen dentro del periodo gratis
 * de la suscripción (`trial_end`). Si luego se revocan, se sabe cuánto recorrer el cobro hacia atrás.
 */
export async function markGrantsAppliedToStripe(db: Db, userId: string, stripePeriodEnd: Date, now: Date): Promise<void> {
  await db
    .update(entitlementGrants)
    .set({ appliedToStripeSubAt: now })
    .where(
      and(
        eq(entitlementGrants.userId, userId),
        isNull(entitlementGrants.revokedAt),
        isNull(entitlementGrants.appliedToStripeSubAt),
        gt(entitlementGrants.endsAt, now),
        lte(entitlementGrants.endsAt, new Date(stripePeriodEnd.getTime() + 60_000)),
      ),
    );
}

/** ¿Tiene premios (no pruebas) ya reflejados en la fecha de cobro de Stripe? */
export async function hasAppliedRewardGrant(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(entitlementGrants)
    .where(
      and(
        eq(entitlementGrants.userId, userId),
        isNull(entitlementGrants.revokedAt),
        sql`${entitlementGrants.appliedToStripeSubAt} IS NOT NULL`,
        inArray(entitlementGrants.sourceKind, [...REWARD_GRANT_KINDS]),
      ),
    );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Revoca una concesión. Las concesiones encadenadas después se recorren hacia atrás lo que
 * le faltaba por usar, para que el acceso realmente se acorte. La clave de idempotencia se
 * libera (p. ej. para que el bono de embajador pueda ganarse de nuevo).
 */
export async function revokeGrant(
  db: Db,
  grantId: string,
  reason: string,
  now: Date,
): Promise<{ userId: string; removedMs: number; appliedToStripe: boolean } | null> {
  const [g] = await db.select().from(entitlementGrants).where(eq(entitlementGrants.id, grantId));
  if (!g || g.revokedAt) return null;
  const removedMs = remainingGrantMs(g, now);
  await db
    .update(entitlementGrants)
    .set({ revokedAt: now, revokeReason: reason, idempotencyKey: `${g.idempotencyKey}:revocada:${g.id}` })
    .where(eq(entitlementGrants.id, g.id));
  if (removedMs > 0) {
    const shift = sql`(${removedMs})::double precision * interval '1 millisecond'`;
    await db
      .update(entitlementGrants)
      .set({
        startsAt: sql`${entitlementGrants.startsAt} - ${shift}`,
        endsAt: sql`${entitlementGrants.endsAt} - ${shift}`,
      })
      .where(
        and(
          eq(entitlementGrants.userId, g.userId),
          isNull(entitlementGrants.revokedAt),
          ne(entitlementGrants.id, g.id),
          gte(entitlementGrants.startsAt, g.endsAt),
        ),
      );
  }
  return { userId: g.userId, removedMs, appliedToStripe: g.appliedToStripeSubAt !== null };
}

// ---------------------------------------------------------------------------
// Reembolso de un referido
// ---------------------------------------------------------------------------

export interface ReferralClawbackPlan {
  referralId: string;
  hostUserId: string;
  friendUserId: string;
  /** Concesiones a revocar (anfitrión, amigo y, si aplica, bono de embajador). */
  grantIds: string[];
  revokeAmbassador: boolean;
  /** Por usuario: cuánto hay que recorrer hacia atrás la fecha de cobro ya movida en Stripe. */
  stripeShiftMs: Record<string, number>;
}

/**
 * Decide si un reembolso revierte el premio del referido (solo lectura). Aplica si lo que quedó
 * pagado baja de $150 MXN y el premio tiene menos de 14 días. Se revierten los días de ambos;
 * si el anfitrión baja de 5 amigos pagados, también el bono de embajador.
 */
export async function planReferralClawback(
  db: Db,
  input: { stripeInvoiceId: string; remainingPaidCentavos: number; now: Date },
): Promise<ReferralClawbackPlan | null> {
  if (input.remainingPaidCentavos >= MIN_QUALIFYING_PAID_CENTAVOS) return null;
  const [ref] = await db
    .select()
    .from(referralGrants)
    .where(eq(referralGrants.qualifyingStripeInvoiceId, input.stripeInvoiceId));
  if (!ref || ref.status !== "rewarded_bilateral") return null;
  const rewardedAt = ref.rewardedAt ? new Date(ref.rewardedAt).getTime() : input.now.getTime();
  if (input.now.getTime() - rewardedAt > REFERRAL_CLAWBACK_DAYS * DAY_MS) return null;

  const grantIds = [ref.referrerGrantId, ref.referredGrantId].filter((id): id is string => Boolean(id));

  let revokeAmbassador = false;
  const [host] = await db.select().from(users).where(eq(users.id, ref.referrerUserId));
  if (host?.isAmbassador) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(referralGrants)
      .where(
        and(
          eq(referralGrants.referrerUserId, ref.referrerUserId),
          eq(referralGrants.status, "rewarded_bilateral"),
          ne(referralGrants.id, ref.id),
        ),
      );
    if (Number(n) < AMBASSADOR_THRESHOLD) {
      revokeAmbassador = true;
      const bonus = await db
        .select({ id: entitlementGrants.id })
        .from(entitlementGrants)
        .where(
          and(
            eq(entitlementGrants.userId, ref.referrerUserId),
            eq(entitlementGrants.sourceKind, "ambassador_bonus_30d"),
            isNull(entitlementGrants.revokedAt),
          ),
        );
      grantIds.push(...bonus.map((b) => b.id));
    }
  }

  const stripeShiftMs: Record<string, number> = {};
  if (grantIds.length) {
    const grants = await db
      .select()
      .from(entitlementGrants)
      .where(and(inArray(entitlementGrants.id, grantIds), isNull(entitlementGrants.revokedAt)));
    for (const g of grants) {
      if (!g.appliedToStripeSubAt) continue;
      stripeShiftMs[g.userId] = (stripeShiftMs[g.userId] ?? 0) + remainingGrantMs(g, input.now);
    }
  }

  return {
    referralId: ref.id,
    hostUserId: ref.referrerUserId,
    friendUserId: ref.referredUserId,
    grantIds,
    revokeAmbassador,
    stripeShiftMs,
  };
}

/** Aplica la reversión en la base (en una transacción). */
export async function applyReferralClawback(db: Db, plan: ReferralClawbackPlan, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    for (const id of plan.grantIds) await revokeGrant(t, id, "reembolso del referido", now);
    await t
      .update(referralGrants)
      .set({ status: "clawed_back", clawedBackAt: now })
      .where(eq(referralGrants.id, plan.referralId));
    if (plan.revokeAmbassador) {
      await t.update(users).set({ isAmbassador: false }).where(eq(users.id, plan.hostUserId));
    }
  });
}
