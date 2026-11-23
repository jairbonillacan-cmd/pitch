import { NextResponse } from "next/server";
import { withCronSecret } from "../../../../src/server/api-guards";
import { getMailer } from "../../../../src/server/mailer";
import { runPickSettlement } from "../../../../src/server/settlement";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleSettlePicks = withCronSecret({ bucket: "cron-settle-picks" }, async () => {
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
});

export const GET = handleSettlePicks;
export const POST = handleSettlePicks;
