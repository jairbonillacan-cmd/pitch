import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDb, FLAG_TIPSTER_PAYOUTS, getBoolFlag, type Db } from "@pitchlab/db";
import {
  runTipsterPayouts,
  stripeTransferCreator,
  stripeTransferFinder,
} from "../../../../src/server/billing/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let db: Db | null = null;

function verifyBearerSecret(authorization: string | null, secret: string | undefined): boolean {
  const expectedSecret = secret?.trim();
  if (!expectedSecret || !authorization) return false;
  const expectedHeader = `Bearer ${expectedSecret}`;
  const gotDigest = createHash("sha256").update(authorization).digest();
  const expectedDigest = createHash("sha256").update(expectedHeader).digest();
  return timingSafeEqual(gotDigest, expectedDigest);
}

/**
 * Corrida diaria de pagos a tipsters (Vercel Cron, ver vercel.json).
 * Exige `Authorization: Bearer ${CRON_SECRET}` y respeta la bandera operativa `tipster_payouts_enabled`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyBearerSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.DATABASE_URL;
  if (!apiKey || !url) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  db ??= createDb(url) as unknown as Db;
  if (!(await getBoolFlag(db, FLAG_TIPSTER_PAYOUTS, true))) {
    return NextResponse.json({ paused: true, promoted: 0, paid: 0, paidCentavos: 0, failed: [] });
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
  return NextResponse.json(result);
}
