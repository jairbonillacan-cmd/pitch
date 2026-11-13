/**
 * Stripe Checkout para el Pase PitchLab Ultra (VISION_REESTRUCTURA_CLAUDE_GROWTH.md §5.1–5.2).
 * Los IDs de precio vienen del entorno (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL) para que
 * baste pegarlos cuando el fundador cree el producto en Stripe.
 */

import { stripeHeaders } from "./stripe-api";

export type PlanInterval = "monthly" | "annual";

export interface CheckoutInput {
  userId: string;
  email: string;
  interval: PlanInterval;
  priceId: string;
  baseUrl: string;
  /** Fin del acceso gratis vigente (días concedidos): Stripe no cobra antes de esa fecha. */
  freeAccessUntil: Date | null;
  now: Date;
  /** ID de Promotion Code de Stripe ya validado en servidor (tipster o referido), si aplica. */
  promotionCodeId?: string | null;
  /** Cupón que se aplica solo (descuento del amigo invitado). El Promotion Code tiene prioridad. */
  couponId?: string | null;
  /** ID de cliente de Stripe existente, para no duplicar clientes. */
  customerId?: string | null;
}

/** Stripe exige que trial_end esté al menos 48 h en el futuro. */
export const MIN_TRIAL_LEAD_SECONDS = 48 * 3600;
/** Margen sobre las 48 h para que Stripe no rechace la sesión por segundos. */
export const TRIAL_LEAD_MARGIN_SECONDS = 600;

/**
 * Cupón del amigo invitado: solo en el plan mensual («tu primer mes») y solo si todavía no
 * hizo su primer pago con el código (el referido sigue en `trial_started`).
 */
export function referralCouponFor(input: {
  interval: PlanInterval;
  referralStatus: string | null | undefined;
  couponId: string | null | undefined;
}): string | null {
  const id = input.couponId?.trim();
  return id && input.interval === "monthly" && input.referralStatus === "trial_started" ? id : null;
}

/** Parámetros de `POST /v1/checkout/sessions` en formato form-urlencoded de Stripe. */
export function buildCheckoutParams(input: CheckoutInput): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", "subscription");
  p.set("line_items[0][price]", input.priceId);
  p.set("line_items[0][quantity]", "1");
  p.set("client_reference_id", input.userId);
  p.set("success_url", `${input.baseUrl}/app/account?tab=plan&pago=ok&session_id={CHECKOUT_SESSION_ID}`);
  p.set("cancel_url", `${input.baseUrl}/app/account?tab=plan&pago=cancelado`);
  p.set("locale", "es-419");
  p.set("currency", "mxn");
  p.set("subscription_data[metadata][user_id]", input.userId);
  p.set("subscription_data[metadata][plan_interval]", input.interval);
  p.set("metadata[user_id]", input.userId);
  if (input.customerId) {
    p.set("customer", input.customerId);
  } else {
    p.set("customer_email", input.email);
  }
  if (input.promotionCodeId) {
    p.set("discounts[0][promotion_code]", input.promotionCodeId);
  } else if (input.couponId) {
    p.set("discounts[0][coupon]", input.couponId);
  } else {
    p.set("allow_promotion_codes", "true");
  }
  if (input.freeAccessUntil) {
    const trialEnd = Math.floor(input.freeAccessUntil.getTime() / 1000);
    const nowSec = Math.floor(input.now.getTime() / 1000);
    if (trialEnd > nowSec) {
      // Si faltan menos de 48 h, se regala lo que falte para llegar a 48 h: nadie pierde días.
      const minEnd = nowSec + MIN_TRIAL_LEAD_SECONDS + TRIAL_LEAD_MARGIN_SECONDS;
      p.set("subscription_data[trial_end]", String(Math.max(trialEnd, minEnd)));
    }
  }
  return p;
}

export async function createCheckoutSession(
  secretKey: string,
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: stripeHeaders(secretKey, { "content-type": "application/x-www-form-urlencoded" }),
    body: params.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !json.id || !json.url) {
    throw new Error(`Stripe Checkout respondió ${res.status}: ${json.error?.message ?? "sin URL"}`);
  }
  return { id: json.id, url: json.url };
}

export function priceIdFor(interval: PlanInterval): string | null {
  const id = interval === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  return id && id.startsWith("price_") ? id : null;
}
