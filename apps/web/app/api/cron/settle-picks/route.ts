import { NextResponse } from "next/server";
import { requireCronAuth } from "../../../../src/server/cron-auth";
import { getMailer } from "../../../../src/server/mailer";
import { runPickSettlement } from "../../../../src/server/settlement";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liquida picks simples y parlays pendientes cuyos partidos ya tienen marcador final,
 * captura las cuotas de cierre pre-kickoff reales, calcula CLV y dispara correo / Web Push.
 */
async function handleSettlePicks(request: Request): Promise<NextResponse> {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = serverDb();
  if (!db) {
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }

  const now = new Date();
  const summary = await runPickSettlement(db, getMailer(), { now });

  return NextResponse.json({
    ok: true,
    ranAtUtc: now.toISOString(),
    ...summary,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleSettlePicks(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleSettlePicks(request);
}
