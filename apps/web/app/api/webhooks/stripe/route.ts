import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { createDb, type Db } from "@pitchlab/db";
import { cancelTrialEmails } from "../../../../src/server/account-emails";
import {
  processStripeEvent,
  StripeSignatureError,
  stripeFeeFetcher,
  stripeInvoiceForCharge,
  stripeTrialEndSetter,
  verifyStripeSignature,
} from "../../../../src/server/billing/stripe-webhook";
import { getMailer } from "../../../../src/server/mailer";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../src/server/request-security";
import { hashIpForAudit, logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024;
const WEBHOOK_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const StripeEventEnvelopeSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(128),
  created: z.number().finite(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
});

let db: Db | null = null;

async function readBoundedPayloadText(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    const declaredBytes = parseStrictFiniteNumber(rawContentLength);
    if (declaredBytes !== null && declaredBytes > maxBytes) {
      return { ok: false };
    }
  }

  if (!request.body) {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      return { ok: false };
    }
    return { ok: true, text };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch((err) => {
        void err;
      });
      return { ok: false };
    }
    chunks.push(value);
  }

  return { ok: true, text: Buffer.concat(chunks, totalBytes).toString("utf8") };
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = trustedClientIp(request.headers) || "127.0.0.1";
  const ipHash = hashIpForAudit(ip);

  const rl = await checkEndpointRateLimit({
    bucket: "stripe-webhook",
    key: ip,
    limit: 180,
    windowMs: 60_000,
    failClosed: false,
  });
  if (!rl.allowed) {
    logSecurityEvent("warn", "stripe_webhook_rate_limited", { ipHash });
    return rateLimitResponse(rl.retryAfterSeconds);
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.DATABASE_URL;
  if (!secret || !apiKey || !url) {
    return NextResponse.json(
      { error: "Cobro no configurado" },
      { status: 503, headers: WEBHOOK_HEADERS },
    );
  }

  const bounded = await readBoundedPayloadText(request, MAX_WEBHOOK_PAYLOAD_BYTES);
  if (!bounded.ok) {
    logSecurityEvent("warn", "stripe_webhook_payload_too_large", { ipHash });
    const errPayload = createSanitizedErrorPayload(
      "PAYLOAD_TOO_LARGE",
      "Payload excede el tamaño permitido.",
    );
    return NextResponse.json(
      { ...errPayload, error: errPayload.message },
      { status: 413, headers: WEBHOOK_HEADERS },
    );
  }

  const payload = bounded.text;
  const secrets = [secret, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
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
    logSecurityEvent("warn", "stripe_webhook_signature_rejected", {
      ipHash,
      signatureError: lastError instanceof StripeSignatureError,
    });
    const errPayload = createSanitizedErrorPayload("INVALID_SIGNATURE", "Firma inválida");
    return NextResponse.json(
      { ...errPayload, error: errPayload.message },
      { status: 400, headers: WEBHOOK_HEADERS },
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(payload);
  } catch (err) {
    logSecurityEvent("warn", "stripe_webhook_invalid_json", { ipHash, error: err });
    const errPayload = createSanitizedErrorPayload("INVALID_PAYLOAD", "Payload inválido");
    return NextResponse.json(
      { ...errPayload, error: errPayload.message },
      { status: 400, headers: WEBHOOK_HEADERS },
    );
  }

  const parsedEvent = StripeEventEnvelopeSchema.safeParse(rawJson);
  if (!parsedEvent.success) {
    logSecurityEvent("warn", "stripe_webhook_invalid_event_shape", { ipHash });
    const errPayload = createSanitizedErrorPayload("INVALID_PAYLOAD", "Evento inválido");
    return NextResponse.json(
      { ...errPayload, error: errPayload.message },
      { status: 400, headers: WEBHOOK_HEADERS },
    );
  }

  const activeDb = (db ??= createDb(url) as unknown as Db);
  try {
    const result = await processStripeEvent(activeDb, parsedEvent.data, {
      getInvoiceFeeCentavos: stripeFeeFetcher(apiKey),
      findInvoiceIdForCharge: stripeInvoiceForCharge(apiKey),
      setSubscriptionTrialEnd: stripeTrialEndSetter(apiKey),
      cancelScheduledTrialEmails: (userId) => cancelTrialEmails(activeDb, getMailer(), userId),
      now: () => new Date(),
    });
    return NextResponse.json({ received: true, result }, { headers: WEBHOOK_HEADERS });
  } catch (err) {
    logSecurityEvent("error", "stripe_webhook_process_failed", {
      ipHash,
      eventType: parsedEvent.data.type,
      error: err,
    });
    return NextResponse.json(
      { error: "Error al procesar el evento" },
      { status: 500, headers: WEBHOOK_HEADERS },
    );
  }
}
