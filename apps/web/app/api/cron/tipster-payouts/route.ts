import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  FLAG_TIPSTER_PAYOUTS,
  getBoolFlag,
  promoteClearedCommissions,
} from "@pitchlab/db";
import {
  runTipsterPayouts,
  stripeTransferCreator,
  stripeTransferFinder,
} from "../../../../src/server/billing/connect";
import { paymentMode } from "../../../../src/server/billing/payment-mode";
import { getMailer } from "../../../../src/server/mailer";
import { serverDb } from "../../../../src/server/session-user";
import { dispatchDueScheduledEmails } from "../../../../src/server/transfer-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyBearerSecret(authorization: string | null, secret: string | undefined): boolean {
  const expectedSecret = secret?.trim();
  if (!expectedSecret || !authorization) return false;
  const expectedHeader = `Bearer ${expectedSecret}`;
  const gotDigest = createHash("sha256").update(authorization).digest();
  const expectedDigest = createHash("sha256").update(expectedHeader).digest();
  return timingSafeEqual(gotDigest, expectedDigest);
}

/**
 * Corrida diaria (Vercel Cron, ver vercel.json).
 * Exige `Authorization: Bearer ${CRON_SECRET}` y respeta `tipster_payouts_enabled`.
 * En modo `transfer`, promueve comisiones maduras a `payable` para liquidación manual del
 * fundador sin requerir llaves de Stripe.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyBearerSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = serverDb();
  if (!db) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });

  const mode = paymentMode();
  const payoutsEnabled = await getBoolFlag(db, FLAG_TIPSTER_PAYOUTS, true);

  if (mode === "transfer") {
    const promoted = payoutsEnabled ? await promoteClearedCommissions(db, new Date()) : 0;
    const emailsDispatched = await dispatchDueScheduledEmails(db, getMailer(), new Date());
    return NextResponse.json({
      mode: "transfer",
      paused: !payoutsEnabled,
      promoted,
      emailsDispatched,
      paid: 0,
      paidCentavos: 0,
      failed: [],
    });
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  if (!payoutsEnabled) {
    return NextResponse.json({
      mode: "stripe",
      paused: true,
      promoted: 0,
      paid: 0,
      paidCentavos: 0,
      failed: [],
    });
  }
  const result = await runTipsterPayouts(db, {
    createTransfer: stripeTransferCreator(apiKey),
    findExistingTransfer: stripeTransferFinder(apiKey),
    now: new Date(),
  });
  if (result.failed.length) {
    console.warn(
      "[tipster-payouts] asientos con fallo:",
      result.failed.map((item) => item.ledgerId),
    );
  }
  return NextResponse.json({ mode: "stripe", ...result });
}
