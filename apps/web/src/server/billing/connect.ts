/**
 * Stripe Connect Express para tipsters (MX): alta de la cuenta, enlace de alta y
 * transferencias de comisión. Usa la API REST de Stripe (sin SDK).
 */
import {
  claimPayableTransfers,
  markCommissionPaid,
  promoteClearedCommissions,
  releaseCommissionClaim,
  type Db,
} from "@pitchlab/db";
import { stripeHeaders, stripeRequest } from "./stripe-api";

const STRIPE_API = "https://api.stripe.com/v1";

export class StripeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function stripePost(
  secretKey: string,
  path: string,
  params: URLSearchParams,
  options: { idempotencyKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = stripeHeaders(secretKey, {
    "content-type": "application/x-www-form-urlencoded",
  });
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  const res = await (options.fetchImpl ?? fetch)(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: params.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new StripeApiError(json.error?.message ?? `Stripe respondió ${res.status}`, res.status);
  return json;
}

/** Crea la cuenta Express del tipster en México, solo con capacidad de recibir transferencias. */
export async function createExpressAccount(
  secretKey: string,
  input: { email: string; tipsterUserId: string; handle: string },
  fetchImpl?: typeof fetch,
): Promise<string> {
  const p = new URLSearchParams();
  p.set("type", "express");
  p.set("country", "MX");
  p.set("email", input.email);
  p.set("capabilities[transfers][requested]", "true");
  p.set("business_type", "individual");
  p.set("metadata[tipster_user_id]", input.tipsterUserId);
  p.set("metadata[handle]", input.handle);
  const json = await stripePost(secretKey, "/accounts", p, {
    idempotencyKey: `connect-account:${input.tipsterUserId}`,
    fetchImpl,
  });
  if (typeof json.id !== "string") throw new StripeApiError("Stripe no devolvió el id de la cuenta", 502);
  return json.id;
}

/** Enlace de alta (o de actualización de datos) de la cuenta conectada. */
export async function createOnboardingLink(
  secretKey: string,
  input: { accountId: string; baseUrl: string },
  fetchImpl?: typeof fetch,
): Promise<string> {
  const p = new URLSearchParams();
  p.set("account", input.accountId);
  p.set("type", "account_onboarding");
  p.set("refresh_url", `${input.baseUrl}/app/tipster?connect=reintentar`);
  p.set("return_url", `${input.baseUrl}/app/tipster?connect=listo`);
  const json = await stripePost(secretKey, "/account_links", p, { fetchImpl });
  if (typeof json.url !== "string") throw new StripeApiError("Stripe no devolvió el enlace de alta", 502);
  return json.url;
}

export type CreateTransfer = (input: {
  ledgerId: string;
  destination: string;
  amountCentavos: number;
  stripeInvoiceId: string;
}) => Promise<string>;

export type FindExistingTransfer = (input: {
  ledgerId: string;
  stripeInvoiceId: string;
}) => Promise<string | null>;

interface StripeTransferList {
  data?: Array<{
    id?: unknown;
    reversed?: unknown;
    metadata?: Record<string, unknown>;
  }>;
}

/** Transferencia en MXN a la cuenta del tipster; la clave de idempotencia es el asiento. */
export function stripeTransferCreator(secretKey: string, fetchImpl?: typeof fetch): CreateTransfer {
  return async ({ ledgerId, destination, amountCentavos, stripeInvoiceId }) => {
    const p = new URLSearchParams();
    p.set("amount", String(amountCentavos));
    p.set("currency", "mxn");
    p.set("destination", destination);
    p.set("transfer_group", stripeInvoiceId);
    p.set("description", "Comisión PitchLab · Tipster Oficial");
    p.set("metadata[ledger_id]", ledgerId);
    const json = await stripePost(secretKey, "/transfers", p, { idempotencyKey: `tipster-payout:${ledgerId}`, fetchImpl });
    if (typeof json.id !== "string") throw new StripeApiError("Stripe no devolvió el id de la transferencia", 502);
    return json.id;
  };
}

/**
 * Reconcilia si Stripe ya ejecutó una transferencia no revertida para este asiento
 * (protege contra doble pago cuando un reintento ocurre > 24 h después de una caída).
 */
export function stripeTransferFinder(secretKey: string, fetchImpl?: typeof fetch): FindExistingTransfer {
  return async ({ ledgerId, stripeInvoiceId }) => {
    const list = await stripeRequest<StripeTransferList>(
      secretKey,
      "GET",
      "/transfers",
      new URLSearchParams({ transfer_group: stripeInvoiceId, limit: "20" }),
      { fetchImpl },
    );
    for (const item of list.data ?? []) {
      if (item.reversed === true) continue;
      if (typeof item.id === "string" && item.metadata?.ledger_id === ledgerId) {
        return item.id;
      }
    }
    return null;
  };
}

export interface PayoutRunResult {
  promoted: number;
  paid: number;
  paidCentavos: number;
  failed: Array<{ ledgerId: string; error: string }>;
}

/**
 * Corrida diaria: libera comisiones que cumplieron 14 días, reclama de forma atómica las
 * pagables (`FOR UPDATE SKIP LOCKED`), reconcilia transferencias previas y ejecuta las nuevas.
 * Un error en un asiento libera el reclamo sin detener a los demás.
 */
export async function runTipsterPayouts(
  db: Db,
  deps: { createTransfer: CreateTransfer; findExistingTransfer?: FindExistingTransfer; now: Date },
): Promise<PayoutRunResult> {
  const result: PayoutRunResult = {
    promoted: await promoteClearedCommissions(db, deps.now),
    paid: 0,
    paidCentavos: 0,
    failed: [],
  };
  for (const t of await claimPayableTransfers(db, deps.now)) {
    try {
      const existingTransferId = deps.findExistingTransfer
        ? await deps.findExistingTransfer({ ledgerId: t.ledgerId, stripeInvoiceId: t.stripeInvoiceId })
        : null;
      const transferId =
        existingTransferId ??
        (await deps.createTransfer({
          ledgerId: t.ledgerId,
          destination: t.connectAccountId,
          amountCentavos: t.amountCentavos,
          stripeInvoiceId: t.stripeInvoiceId,
        }));
      if (await markCommissionPaid(db, t.ledgerId, transferId, deps.now)) {
        result.paid += 1;
        result.paidCentavos += t.amountCentavos;
      }
    } catch (err) {
      await releaseCommissionClaim(db, t.ledgerId).catch((releaseErr) => {
        console.error("[tipster-payouts] no se pudo liberar el asiento reclamado:", t.ledgerId, releaseErr);
      });
      result.failed.push({ ledgerId: t.ledgerId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
