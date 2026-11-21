import { NextResponse } from "next/server";
import { withCronSecret } from "../../../../src/server/api-guards";
import { runScheduledPushAlerts } from "../../../../src/server/push-alerts";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlePushAlerts = withCronSecret({ bucket: "cron-push-alerts" }, async () => {
  const db = serverDb();
  if (!db) {
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }

  const now = new Date();
  const report = await runScheduledPushAlerts(db, { now });

  return NextResponse.json({
    ok: true,
    ranAtUtc: now.toISOString(),
    ...report,
  });
});

export const GET = handlePushAlerts;
export const POST = handlePushAlerts;
