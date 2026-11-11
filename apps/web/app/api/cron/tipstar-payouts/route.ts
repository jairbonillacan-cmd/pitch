import { NextResponse } from "next/server";
import { createDb, type Db } from "@pitchlab/db";
import { runTipstarPayouts, stripeTransferCreator } from "../../../../src/server/billing/connect.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let db: Db | null = null;

/**
 * Corrida diaria de pagos a tipstars (Vercel Cron, ver vercel.json).
 * Exige `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const url = process.env.DATABASE_URL;
  if (!apiKey || !url) return NextResponse.json({ error: "Cobro no configurado" }, { status: 503 });
  db ??= createDb(url) as unknown as Db;
  const result = await runTipstarPayouts(db, { createTransfer: stripeTransferCreator(apiKey), now: new Date() });
  if (result.failed.length) console.warn("[tipstar-payouts] fallidos:", result.failed);
  return NextResponse.json(result);
}
