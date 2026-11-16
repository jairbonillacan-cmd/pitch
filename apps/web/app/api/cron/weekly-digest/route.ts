import { NextResponse } from "next/server";
import { requireCronAuth } from "../../../../src/server/cron-auth";
import { runWeeklyDigestJob } from "../../../../src/server/lifecycle-emails";
import { getMailer } from "../../../../src/server/mailer";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleWeeklyDigest(request: Request): Promise<NextResponse> {
  const authError = requireCronAuth(request);
  if (authError) return authError;

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
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleWeeklyDigest(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleWeeklyDigest(request);
}
