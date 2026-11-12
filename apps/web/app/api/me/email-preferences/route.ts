import { NextResponse } from "next/server";
import { getEmailPreferences, setEmailPreferences } from "@pitchlab/db";
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
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as { pickResults?: unknown } | null;
  if (typeof body?.pickResults !== "boolean") {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  await setEmailPreferences(member.db, member.userId, { pickResults: body.pickResults });
  return NextResponse.json({ pickResults: body.pickResults });
}
