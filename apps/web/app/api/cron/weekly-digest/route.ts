import { NextResponse } from "next/server";
import { withCronSecret } from "../../../../src/server/api-guards";
import { runWeeklyDigestJob } from "../../../../src/server/lifecycle-emails";
import { getMailer } from "../../../../src/server/mailer";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleWeeklyDigest = withCronSecret({ bucket: "cron-weekly-digest" }, async () => {
  const db = serverDb();
  if (!db) {
    return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  }

  const now = new Date();
  const summary = await runWeeklyDigestJob(db, getMailer(), { now });
  return NextResponse.json({
    ok: true,
    ranAtUtc: now.toISOString(),
    ...summary,
  });
});

export const GET = handleWeeklyDigest;
export const POST = handleWeeklyDigest;
