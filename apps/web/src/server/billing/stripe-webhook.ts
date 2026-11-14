/**
 * Webhook de Stripe MX (VISION_REESTRUCTURA_CLAUDE_GROWTH.md §5.3).
 *
 * - Verifica la firma `Stripe-Signature` (HMAC-SHA256 de `${t}.${payload}`, tolerancia 5 min).
 * - Cada evento se procesa una sola vez (`processed_payment_events`); si algo falla se borra la
 *   marca y se responde 500 para que Stripe reintente.
 * - `customer.subscription.*` sincroniza la suscripción y recorre la fecha de cobro si el socio
 *   tiene días ganados; `invoice.paid` aplica referidos y comisiones de tipster;
 *   `charge.refunded` revierte la comisión y, si toca, el premio del referido.
 * - Entiende el formato actual de Stripe (sin `invoice.charge` ni `charge.invoice`) y el anterior.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  and,
  applyReferralClawback,
  entitlementGrants,
  eq,
  grantsUntil,
  handleInvoicePaid,
  handleInvoiceRefunded,
  inArray,
  markGrantsAppliedToStripe,
  planReferralClawback,
  processedPaymentEvents,
  referralGrants,
  setConnectPayoutsEnabled,
  subscriptions,
  sql,
  users,
  type Db,
  type ReferralClawbackPlan,
} from "@pitchlab/db";
import { stripeRequest } from "./stripe-api";

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const GRACE_HOURS = 72;
/** Diferencias menores a esto entre fechas se consideran iguales (relojes y redondeo a segundos). */
const DATE_TOLERANCE_MS = 60_000;

export class StripeSignatureError extends Error {}

/** Error que pide a Stripe reintentar más tarde (p. ej. llegó la factura antes que la suscripción). */
export class RetryLaterError extends Error {}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): void {
  if (!header) throw new StripeSignatureError("Falta Stripe-Signature");
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || signatures.length === 0) throw new StripeSignatureError("Firma mal formada");
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) throw new StripeSignatureError("Firma vencida");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  const ok = signatures.some((sig) => {
    const got = Buffer.from(sig);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new StripeSignatureError("Firma inválida");
}

/** Encabezado de prueba con el mismo esquema (para tests y para `stripe trigger` local). */
export function signStripePayload(payload: string, secret: string, timestamp: number): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export interface WebhookDeps {
  /** Comisión de Stripe del cobro de una factura, en centavos. */
  getInvoiceFeeCentavos: (invoice: Record<string, unknown>) => Promise<number>;
  now: () => Date;
  /** Factura de un cargo reembolsado cuando el cargo no la trae (formato actual de Stripe). */
  findInvoiceIdForCharge?: (charge: Record<string, unknown>) => Promise<string | null>;
  /**
   * Recorre la fecha del siguiente cobro (`trial_end` sin prorrateo). Sin esta dependencia
   * no se toca Stripe (pruebas o cobro sin configurar).
   */
  setSubscriptionTrialEnd?: (subscriptionId: string, trialEnd: Date | "now", idempotencyKey: string) => Promise<void>;
  /**
   * Cancela correos programados de fin de prueba (`trial_ending`, `trial_ended`) cuando el socio
   * pasa a suscripción de pago antes de que venzan.
   */
  cancelScheduledTrialEmails?: (userId: string) => Promise<number | void>;
}

const STATUS_MAP: Record<string, typeof subscriptions.$inferInsert.status> = {
  trialing: "trialing_card",
  active: "active",
  past_due: "past_due_grace",
  canceled: "canceled",
  unpaid: "expired",
  incomplete_expired: "expired",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Id de un campo que puede venir como texto o como objeto expandido. */
function idOf(v: unknown): string | null {
  return str(v) ?? str(obj(v).id);
}

function seconds(v: unknown): Date | null {
  const n = num(v);
  return n === null ? null : new Date(n * 1000);
}

const unix = (d: Date): number => Math.floor(d.getTime() / 1000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncSubscription(
  db: Db,
  sub: Record<string, unknown>,
  now: Date,
): Promise<{ message: string; userId: string | null; status: typeof subscriptions.$inferInsert.status | null }> {
  const metadata = obj(sub.metadata);
  const userId = str(metadata.user_id);
  const customer = idOf(sub.customer);
  const status = STATUS_MAP[String(sub.status)];
  if (!userId || !UUID_RE.test(userId) || !customer || !status) {
    return { message: "suscripción sin user_id válido, cliente o estado conocido: ignorada", userId: null, status: null };
  }
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!existingUser) {
    return { message: "suscripción de usuario inexistente: ignorada", userId: null, status: null };
  }

  const item = ((sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [])[0] ?? {};
  const price = obj(item.price);
  const recurring = obj(price.recurring);
  const periodStart = seconds(item.current_period_start) ?? seconds(sub.current_period_start) ?? now;
  const periodEnd = seconds(item.current_period_end) ?? seconds(sub.current_period_end) ?? now;
  const values = {
    userId,
    provider: "stripe",
    providerCustomerId: customer,
    providerSubscriptionId: str(sub.id),
    planInterval: recurring.interval === "year" ? "annual" : "monthly",
    status,
    priceCentavosMxn: num(price.unit_amount) ?? 0,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    canceledAt: seconds(sub.canceled_at),
    graceUntil: status === "past_due_grace" ? new Date(now.getTime() + GRACE_HOURS * 3_600_000) : null,
    updatedAt: now,
  } satisfies typeof subscriptions.$inferInsert;
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        ...values,
        // La gracia de 72 h cuenta desde el primer fallo: otros avisos no la reinician.
        graceUntil: sql`CASE WHEN excluded.status = 'past_due_grace' AND ${subscriptions.status} = 'past_due_grace' AND ${subscriptions.graceUntil} IS NOT NULL THEN ${subscriptions.graceUntil} ELSE excluded.grace_until END`,
      },
    });
  return { message: `suscripción ${values.status}`, userId, status: values.status };
}

/**
 * Iguala la fecha del siguiente cobro en Stripe con el fin de los días ganados. Así los +7 días
 * del referido (o el bono de embajador) también le sirven a quien ya paga: Stripe recorre su
 * renovación sin cobrar ni prorratear. Es idempotente: siempre fija la misma fecha.
 */
export async function reconcileStripeRenewal(db: Db, userId: string, deps: WebhookDeps, now: Date): Promise<Date | null> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  if (!sub || sub.provider !== "stripe" || !sub.providerSubscriptionId) return null;
  if (!["active", "trialing_card"].includes(sub.status) || sub.cancelAtPeriodEnd) return null;

  let end = new Date(sub.currentPeriodEnd);
  let status = sub.status;
  let moved: Date | null = null;
  const target = await grantsUntil(db, userId);
  if (target && deps.setSubscriptionTrialEnd && target.getTime() - end.getTime() > DATE_TOLERANCE_MS) {
    await deps.setSubscriptionTrialEnd(
      sub.providerSubscriptionId,
      target,
      `trial_end:${sub.providerSubscriptionId}:${unix(target)}`,
    );
    await db
      .update(subscriptions)
      .set({ currentPeriodEnd: target, status: "trialing_card", updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    end = target;
    status = "trialing_card";
    moved = target;
  }
  if (status === "trialing_card") await markGrantsAppliedToStripe(db, userId, end, now);
  return moved;
}

/** Recorre hacia atrás la fecha de cobro en Stripe lo que se revoca por un reembolso. */
async function shiftStripeForClawback(db: Db, plan: ReferralClawbackPlan, deps: WebhookDeps, now: Date): Promise<void> {
  if (!deps.setSubscriptionTrialEnd) return;
  for (const [userId, ms] of Object.entries(plan.stripeShiftMs)) {
    if (ms <= 0) continue;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (!sub?.providerSubscriptionId || sub.status !== "trialing_card") continue;
    const newEnd = new Date(new Date(sub.currentPeriodEnd).getTime() - ms);
    const target: Date | "now" = newEnd.getTime() - now.getTime() < DATE_TOLERANCE_MS ? "now" : newEnd;
    await deps.setSubscriptionTrialEnd(
      sub.providerSubscriptionId,
      target,
      `trial_end:${sub.providerSubscriptionId}:${target === "now" ? `now:${plan.referralId}` : unix(target)}`,
    );
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      await t
        .update(subscriptions)
        .set({ currentPeriodEnd: target === "now" ? now : target, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      if (plan.grantIds.length > 0) {
        await t
          .update(entitlementGrants)
          .set({ appliedToStripeSubAt: null })
          .where(and(eq(entitlementGrants.userId, userId), inArray(entitlementGrants.id, plan.grantIds)));
      }
    });
  }
}

function invoiceTaxCentavos(invoice: Record<string, unknown>): number {
  const totalTaxes = invoice.total_taxes ?? invoice.total_tax_amounts;
  if (Array.isArray(totalTaxes)) {
    return totalTaxes.reduce((s: number, t) => s + (num(obj(t).amount) ?? 0), 0);
  }
  return num(invoice.tax) ?? 0;
}

/** Datos de la suscripción copiados en la factura (formato actual y anterior). */
function invoiceSubscriptionDetails(invoice: Record<string, unknown>): { subscriptionId: string | null; userId: string | null } {
  const details = obj(obj(invoice.parent).subscription_details);
  const legacy = obj(invoice.subscription_details);
  const subscriptionId = idOf(details.subscription) ?? idOf(invoice.subscription);
  const userId =
    str(obj(details.metadata).user_id) ?? str(obj(legacy.metadata).user_id) ?? str(obj(invoice.metadata).user_id);
  return { subscriptionId, userId };
}

/** Quién pagó la factura: por cliente registrado o, si aún no llega la suscripción, por los datos de la factura. */
async function resolveInvoiceUser(db: Db, invoice: Record<string, unknown>, customer: string): Promise<string | null> {
  const [sub] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.providerCustomerId, customer));
  if (sub) return sub.userId;
  const { userId } = invoiceSubscriptionDetails(invoice);
  if (!userId || !UUID_RE.test(userId)) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  return u?.id ?? null;
}

/** Procesa un evento ya verificado. Devuelve qué hizo (para registro). */
export async function processStripeEvent(db: Db, event: StripeEvent, deps: WebhookDeps): Promise<string> {
  const inserted = await db
    .insert(processedPaymentEvents)
    .values({ eventId: event.id, provider: "stripe", eventType: event.type })
    .onConflictDoNothing({ target: processedPaymentEvents.eventId })
    .returning({ id: processedPaymentEvents.eventId });
  if (inserted.length === 0) return "evento repetido: sin cambios";

  try {
    const o = event.data.object;
    const now = deps.now();
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const { message, userId, status } = await syncSubscription(db, o, now);
        if (!userId || event.type === "customer.subscription.deleted") return message;
        if ((status === "active" || status === "trialing_card") && deps.cancelScheduledTrialEmails) {
          await deps
            .cancelScheduledTrialEmails(userId)
            .catch((e) => console.error("[stripe-webhook] no se pudieron cancelar correos de prueba:", e));
        }
        const moved = await reconcileStripeRenewal(db, userId, deps, now);
        return moved ? `${message} · cobro recorrido al ${moved.toISOString()}` : message;
      }

      case "invoice.paid": {
        const customer = idOf(o.customer);
        const invoiceId = str(o.id);
        const gross = num(o.amount_paid) ?? 0;
        if (!customer || !invoiceId || gross <= 0) return "factura sin cliente o sin monto: ignorada";
        const userId = await resolveInvoiceUser(db, o, customer);
        if (!userId) {
          // Stripe no garantiza el orden: si la factura es de una suscripción que aún no llega,
          // se pide reintentar en vez de perder el premio del referido.
          if (invoiceSubscriptionDetails(o).subscriptionId) {
            throw new RetryLaterError("La suscripción de esta factura aún no está registrada; Stripe reintentará.");
          }
          return "factura de un cliente sin suscripción registrada: ignorada";
        }
        const res = await handleInvoicePaid(db, {
          userId,
          stripeInvoiceId: invoiceId,
          grossCentavos: gross,
          vatCentavos: invoiceTaxCentavos(o),
          gatewayFeeCentavos: await deps.getInvoiceFeeCentavos(o),
          paidAt: seconds(obj(o.status_transitions).paid_at) ?? now,
        });
        if (deps.cancelScheduledTrialEmails) {
          await deps
            .cancelScheduledTrialEmails(userId)
            .catch((e) => console.error("[stripe-webhook] no se pudieron cancelar correos de prueba:", e));
        }
        // Recorre el cobro de quien pagó y, si fue invitado, de su anfitrión (idempotente, sirve en reintentos).
        await reconcileStripeRenewal(db, userId, deps, now);
        const [ref] = await db
          .select({ host: referralGrants.referrerUserId, status: referralGrants.status })
          .from(referralGrants)
          .where(eq(referralGrants.referredUserId, userId));
        if (ref?.status === "rewarded_bilateral") await reconcileStripeRenewal(db, ref.host, deps, now);
        return `factura pagada: referido=${res.referralRewarded}, embajador=${res.ambassadorBonus}, comisión=${res.commissionCentavos ?? "—"}`;
      }

      case "account.updated": {
        // Evento de Connect: la cuenta del tipster ya puede (o ya no puede) recibir pagos.
        const accountId = str(o.id);
        if (!accountId) return "cuenta sin id: ignorada";
        const known = await setConnectPayoutsEnabled(db, accountId, o.payouts_enabled === true);
        return known ? `cuenta conectada: pagos ${o.payouts_enabled === true ? "habilitados" : "pendientes"}` : "cuenta conectada desconocida";
      }

      case "checkout.session.completed": {
        // La suscripción llega con metadata.user_id en customer.subscription.*; aquí solo se
        // confirma que el pago corresponde a un usuario conocido.
        const userId = str(o.client_reference_id);
        return userId ? "checkout completado" : "checkout sin usuario: ignorado";
      }

      case "invoice.payment_failed": {
        const customer = idOf(o.customer);
        if (!customer) return "fallo de pago sin cliente: ignorado";
        const newGrace = new Date(now.getTime() + GRACE_HOURS * 3_600_000);
        const updated = await db
          .update(subscriptions)
          .set({
            status: "past_due_grace",
            // Si ya estaba en gracia, se conserva la fecha límite original.
            graceUntil: sql`CASE WHEN ${subscriptions.status} = 'past_due_grace' AND ${subscriptions.graceUntil} IS NOT NULL THEN ${subscriptions.graceUntil} ELSE ${newGrace} END`,
            updatedAt: now,
          })
          .where(eq(subscriptions.providerCustomerId, customer))
          .returning({ id: subscriptions.id });
        return updated.length ? `suscripción en gracia de ${GRACE_HOURS} h` : "fallo de pago de cliente desconocido";
      }

      case "charge.refunded": {
        const invoiceId =
          idOf(o.invoice) ?? (deps.findInvoiceIdForCharge ? await deps.findInvoiceIdForCharge(o) : null);
        if (!invoiceId) return "reembolso sin factura: ignorado";
        const commission = await handleInvoiceRefunded(db, invoiceId);
        let clawed = false;
        const amount = num(o.amount);
        const refunded = num(o.amount_refunded);
        if (amount !== null && refunded !== null) {
          const plan = await planReferralClawback(db, {
            stripeInvoiceId: invoiceId,
            remainingPaidCentavos: amount - refunded,
            now,
          });
          if (plan) {
            // Primero Stripe: si falla, la base queda igual y el reintento vuelve a calcular lo mismo.
            await shiftStripeForClawback(db, plan, deps, now);
            await applyReferralClawback(db, plan, now);
            clawed = true;
          }
        }
        const base = commission ? "comisión revertida" : "sin comisión que revertir";
        return clawed ? `${base} · premio del referido revertido` : base;
      }

      default:
        return `evento ${event.type} sin acción`;
    }
  } catch (err) {
    // Si falla, se borra la marca para que Stripe pueda reintentar.
    await db.delete(processedPaymentEvents).where(eq(processedPaymentEvents.eventId, event.id));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dependencias reales (API de Stripe)
// ---------------------------------------------------------------------------

async function chargeFeeCentavos(secretKey: string, chargeId: string, fetchImpl?: typeof fetch): Promise<number> {
  const charge = await stripeRequest<{ balance_transaction?: { fee?: number } }>(
    secretKey,
    "GET",
    `/charges/${encodeURIComponent(chargeId)}`,
    new URLSearchParams({ "expand[]": "balance_transaction" }),
    { fetchImpl },
  );
  const fee = charge.balance_transaction?.fee;
  if (typeof fee !== "number") throw new Error(`El cargo ${chargeId} no trae balance_transaction.fee`);
  return fee;
}

async function paymentIntentFeeCentavos(secretKey: string, paymentIntentId: string, fetchImpl?: typeof fetch): Promise<number> {
  const pi = await stripeRequest<{ latest_charge?: { balance_transaction?: { fee?: number } } | string }>(
    secretKey,
    "GET",
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    new URLSearchParams({ "expand[]": "latest_charge.balance_transaction" }),
    { fetchImpl },
  );
  const fee = typeof pi.latest_charge === "object" ? pi.latest_charge?.balance_transaction?.fee : undefined;
  if (typeof fee !== "number") throw new Error(`El pago ${paymentIntentId} no trae la comisión de Stripe`);
  return fee;
}

interface InvoicePaymentList {
  data?: Array<{ status?: string; invoice?: unknown; payment?: { payment_intent?: unknown; charge?: unknown } }>;
}

/** Comisión real de Stripe de una factura (formato actual vía Invoice Payments y formato anterior). */
export function stripeFeeFetcher(secretKey: string, fetchImpl?: typeof fetch): WebhookDeps["getInvoiceFeeCentavos"] {
  return async (invoice) => {
    const legacyCharge = idOf(invoice.charge);
    if (legacyCharge) return chargeFeeCentavos(secretKey, legacyCharge, fetchImpl);
    const invoiceId = str(invoice.id);
    if (!invoiceId) throw new Error("La factura no trae id; no se puede calcular la comisión de Stripe.");
    const list = await stripeRequest<InvoicePaymentList>(
      secretKey,
      "GET",
      "/invoice_payments",
      new URLSearchParams({ invoice: invoiceId, limit: "20" }),
      { fetchImpl },
    );
    let total = 0;
    for (const p of list.data ?? []) {
      if (p.status !== "paid") continue;
      const pi = idOf(p.payment?.payment_intent);
      const ch = idOf(p.payment?.charge);
      if (pi) total += await paymentIntentFeeCentavos(secretKey, pi, fetchImpl);
      else if (ch) total += await chargeFeeCentavos(secretKey, ch, fetchImpl);
    }
    // Sin pagos con tarjeta (saldo a favor o pago fuera de Stripe) no hay comisión de pasarela.
    return total;
  };
}

/** Factura de un cargo: `charge.invoice` (formato anterior) o Invoice Payments por PaymentIntent. */
export function stripeInvoiceForCharge(secretKey: string, fetchImpl?: typeof fetch): NonNullable<WebhookDeps["findInvoiceIdForCharge"]> {
  return async (charge) => {
    const legacy = idOf(charge.invoice);
    if (legacy) return legacy;
    const pi = idOf(charge.payment_intent);
    if (!pi) return null;
    const list = await stripeRequest<InvoicePaymentList>(
      secretKey,
      "GET",
      "/invoice_payments",
      new URLSearchParams({ "payment[type]": "payment_intent", "payment[payment_intent]": pi, limit: "1" }),
      { fetchImpl },
    );
    return idOf(list.data?.[0]?.invoice);
  };
}

/** Recorre la fecha de cobro de una suscripción sin cobrar ni prorratear. */
export function stripeTrialEndSetter(secretKey: string, fetchImpl?: typeof fetch): NonNullable<WebhookDeps["setSubscriptionTrialEnd"]> {
  return async (subscriptionId, trialEnd, idempotencyKey) => {
    const p = new URLSearchParams();
    p.set("trial_end", trialEnd === "now" ? "now" : String(unix(trialEnd)));
    p.set("proration_behavior", "none");
    await stripeRequest(secretKey, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, p, { idempotencyKey, fetchImpl });
  };
}
