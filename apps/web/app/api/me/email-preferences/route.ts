import { NextResponse } from "next/server";
import { getEmailPreferences, setEmailPreferences } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Avisos por correo de la persona (hoy: «avisarme cuando se califique un pick»). Apagado por defecto. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json(await getEmailPreferences(member.db, member.userId), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as {
    pickResults?: unknown;
    weeklyDigest?: unknown;
    monthlyRecord?: unknown;
  } | null;
  const patch: { pickResults?: boolean; weeklyDigest?: boolean; monthlyRecord?: boolean } = {};
  if (typeof body?.pickResults === "boolean") patch.pickResults = body.pickResults;
  if (typeof body?.weeklyDigest === "boolean") patch.weeklyDigest = body.weeklyDigest;
  if (typeof body?.monthlyRecord === "boolean") patch.monthlyRecord = body.monthlyRecord;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  await setEmailPreferences(member.db, member.userId, patch);
  return NextResponse.json(await getEmailPreferences(member.db, member.userId));
}
