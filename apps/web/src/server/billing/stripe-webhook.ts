/**
 * Webhook de Stripe MX (VISION_REESTRUCTURA_CLAUDE_GROWTH.md §5.3).
 *
 * - Verifica la firma `Stripe-Signature` (HMAC-SHA256 de `${t}.${payload}`, tolerancia 5 min).
 * - Cada evento se procesa una sola vez (`processed_payment_events`).
 * - `customer.subscription.*` sincroniza la suscripción; `invoice.paid` aplica referidos y
 *   comisiones de tipstar; `charge.refunded` revierte la comisión.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  handleInvoicePaid,
  handleInvoiceRefunded,
  processedPaymentEvents,
  subscriptions,
  type Db,
} from "@pitchlab/db";
import { eq } from "@pitchlab/db";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeSignatureError extends Error {}

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
  /** Comisión de Stripe del cobro de una factura, en centavos (balance_transaction.fee). */
  getInvoiceFeeCentavos: (invoice: Record<string, unknown>) => Promise<number>;
  now: () => Date;
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

function seconds(v: unknown): Date | null {
  const n = num(v);
  return n === null ? null : new Date(n * 1000);
}

async function syncSubscription(db: Db, sub: Record<string, unknown>, now: Date): Promise<string> {
  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const userId = str(metadata.user_id);
  const customer = str(sub.customer);
  const status = STATUS_MAP[String(sub.status)];
  if (!userId || !customer || !status) return "suscripción sin user_id, cliente o estado conocido: ignorada";

  const item = ((sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [])[0] ?? {};
  const price = (item.price ?? {}) as Record<string, unknown>;
  const recurring = (price.recurring ?? {}) as Record<string, unknown>;
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
    graceUntil: status === "past_due_grace" ? new Date(now.getTime() + 72 * 3_600_000) : null,
    updatedAt: now,
  } satisfies typeof subscriptions.$inferInsert;
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });
  return `suscripción ${values.status}`;
}

function invoiceTaxCentavos(invoice: Record<string, unknown>): number {
  const totalTaxes = invoice.total_tax_amounts;
  if (Array.isArray(totalTaxes)) {
    return totalTaxes.reduce((s: number, t) => s + (num((t as Record<string, unknown>).amount) ?? 0), 0);
  }
  return num(invoice.tax) ?? 0;
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
    const obj = event.data.object;
    const now = deps.now();
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return await syncSubscription(db, obj, now);

      case "invoice.paid": {
        const customer = str(obj.customer);
        const invoiceId = str(obj.id);
        const gross = num(obj.amount_paid) ?? 0;
        if (!customer || !invoiceId || gross <= 0) return "factura sin cliente o sin monto: ignorada";
        const [sub] = await db
          .select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.providerCustomerId, customer));
        if (!sub) return "factura de un cliente sin suscripción registrada: ignorada";
        const res = await handleInvoicePaid(db, {
          userId: sub.userId,
          stripeInvoiceId: invoiceId,
          grossCentavos: gross,
          vatCentavos: invoiceTaxCentavos(obj),
          gatewayFeeCentavos: await deps.getInvoiceFeeCentavos(obj),
          paidAt: seconds((obj.status_transitions as Record<string, unknown> | undefined)?.paid_at) ?? now,
        });
        return `factura pagada: referido=${res.referralRewarded}, embajador=${res.ambassadorBonus}, comisión=${res.commissionCentavos ?? "—"}`;
      }

      case "charge.refunded": {
        const invoiceId = str(obj.invoice);
        if (!invoiceId) return "reembolso sin factura: ignorado";
        return (await handleInvoiceRefunded(db, invoiceId)) ? "comisión revertida" : "sin comisión que revertir";
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

/** Comisión real de Stripe vía API (requiere STRIPE_SECRET_KEY). */
export function stripeFeeFetcher(secretKey: string): WebhookDeps["getInvoiceFeeCentavos"] {
  return async (invoice) => {
    const chargeId = str(invoice.charge);
    if (!chargeId) throw new Error("La factura no trae el cargo; no se puede calcular la comisión de Stripe.");
    const res = await fetch(
      `https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
      { headers: { authorization: `Bearer ${secretKey}` } },
    );
    if (!res.ok) throw new Error(`Stripe respondió ${res.status} al pedir el cargo ${chargeId}`);
    const charge = (await res.json()) as { balance_transaction?: { fee?: number } };
    const fee = charge.balance_transaction?.fee;
    if (typeof fee !== "number") throw new Error(`El cargo ${chargeId} no trae balance_transaction.fee`);
    return fee;
  };
}
