import { NextResponse } from "next/server";
import { requireCronAuth } from "../../../../src/server/cron-auth";
import { runScheduledPushAlerts } from "../../../../src/server/push-alerts";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Despacha alertas Web Push (RFC 8291 + VAPID) para:
 * - partidos seguidos a ~60 min del saque inicial, y
 * - movimientos fuertes de línea (≥ 5 %) en partidos próximos.
 */
async function handlePushAlerts(request: Request): Promise<NextResponse> {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const db = serverDb();
  if (!db) {
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }

  const now = new Date();
  const report = await runScheduledPushAlerts(db, { now });

  return NextResponse.json(
    {
      ok: true,
      ranAtUtc: now.toISOString(),
      ...report,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  return handlePushAlerts(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handlePushAlerts(request);
}
