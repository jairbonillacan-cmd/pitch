import { NextResponse } from "next/server";
import {
  FLAG_TIPSTER_PAYOUTS,
  getBoolFlag,
  promoteClearedCommissions,
} from "@pitchlab/db";
import { withCronSecret } from "../../../../src/server/api-guards";
import {
  runTipsterPayouts,
  stripeTransferCreator,
  stripeTransferFinder,
} from "../../../../src/server/billing/connect";
import { paymentMode } from "../../../../src/server/billing/payment-mode";
import { getMailer } from "../../../../src/server/mailer";
import { logSecurityEvent } from "../../../../src/server/safe-logger";
import { serverDb } from "../../../../src/server/session-user";
import { dispatchDueScheduledEmails } from "../../../../src/server/transfer-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCronSecret({ bucket: "cron-tipster-payouts" }, async () => {
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
    logSecurityEvent("warn", "tipster_payouts_failed_entries", {
      failedCount: result.failed.length,
      ledgerIds: result.failed.map((item) => item.ledgerId),
    });
  }
  return NextResponse.json({
    mode: "stripe",
    promoted: result.promoted,
    paid: result.paid,
    paidCentavos: result.paidCentavos,
    failed: result.failed.map((item) => ({
      ledgerId: item.ledgerId,
      error: "transfer_failed",
    })),
  });
});
