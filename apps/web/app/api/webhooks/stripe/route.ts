import { NextResponse } from "next/server";
import { createDb, type Db } from "@pitchlab/db";
import {
  processStripeEvent,
  StripeSignatureError,
  stripeFeeFetcher,
  verifyStripeSignature,
} from "../../../../src/server/billing/stripe-webhook.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let db: Db | null = null;

/**
 * POST /api/webhooks/stripe — se activa cuando existen STRIPE_WEBHOOK_SECRET,
 * STRIPE_SECRET_KEY y DATABASE_URL. Sin ellos responde 503 (cobro no configurado).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.DATABASE_URL;
  if (!secret || !apiKey || !url) {
    return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  }

  const payload = await request.text();
  // Stripe firma los eventos de cuentas conectadas con otro secreto (endpoint de Connect).
  const secrets = [secret, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s));
  let lastError: unknown = null;
  let verified = false;
  for (const s of secrets) {
    try {
      verifyStripeSignature(payload, request.headers.get("stripe-signature"), s);
      verified = true;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!verified) {
    if (lastError instanceof StripeSignatureError) {
      return NextResponse.json({ error: lastError.message }, { status: 400 });
    }
    throw lastError;
  }

  db ??= createDb(url) as unknown as Db;
  try {
    const result = await processStripeEvent(db, JSON.parse(payload), {
      getInvoiceFeeCentavos: stripeFeeFetcher(apiKey),
      now: () => new Date(),
    });
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // 500 para que Stripe reintente.
    return NextResponse.json({ error: "Error al procesar el evento" }, { status: 500 });
  }
}
