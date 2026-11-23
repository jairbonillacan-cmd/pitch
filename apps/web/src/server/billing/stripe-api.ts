export const STRIPE_API_VERSION = "2025-09-30.clover";
export const STRIPE_API_BASE = "https://api.stripe.com/v1";

export class StripeRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function stripeHeaders(secretKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${secretKey}`, "stripe-version": STRIPE_API_VERSION, ...extra };
}

export async function stripeRequest<T = Record<string, unknown>>(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  params: URLSearchParams = new URLSearchParams(),
  options: { idempotencyKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const extra: Record<string, string> = {};
  if (method === "POST") extra["content-type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) extra["idempotency-key"] = options.idempotencyKey;
  const query = method === "GET" && [...params.keys()].length ? `?${params.toString()}` : "";
  const res = await (options.fetchImpl ?? fetch)(`${STRIPE_API_BASE}${path}${query}`, {
    method,
    headers: stripeHeaders(secretKey, extra),
    body: method === "POST" ? params.toString() : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new StripeRequestError(`Stripe respondió ${res.status} en ${path}: ${json.error?.message ?? "sin detalle"}`, res.status);
  }
  return json;
}
