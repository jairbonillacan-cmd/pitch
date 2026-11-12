import { NextResponse } from "next/server";
import { deleteSocialPost } from "@pitchlab/db";
import { requireMember } from "../../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Borra una publicación propia. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Publicación inválida" }, { status: 400 });
  const deleted = await deleteSocialPost(member.db, member.userId, id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No puedes borrar esa publicación." }, { status: 404 });
}
