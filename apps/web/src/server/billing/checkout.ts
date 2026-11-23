import { stripeHeaders } from "./stripe-api";

export type PlanInterval = "monthly" | "annual";

export interface CheckoutInput {
  userId: string;
  email: string;
  interval: PlanInterval;
  priceId: string;
  baseUrl: string;
  freeAccessUntil: Date | null;
  now: Date;
  promotionCodeId?: string | null;
  couponId?: string | null;
  customerId?: string | null;
}

export const MIN_TRIAL_LEAD_SECONDS = 48 * 3600;
export const TRIAL_LEAD_MARGIN_SECONDS = 600;

export function referralCouponFor(input: {
  interval: PlanInterval;
  referralStatus: string | null | undefined;
  couponId: string | null | undefined;
}): string | null {
  const id = input.couponId?.trim();
  return id && input.interval === "monthly" && input.referralStatus === "trial_started" ? id : null;
}

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
