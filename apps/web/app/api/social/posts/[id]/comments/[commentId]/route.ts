import { NextResponse } from "next/server";
import { deleteSocialComment } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../../../../src/server/request-security";
import { requireMember } from "../../../../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Borra un comentario propio dentro de una publicación. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const originErr = verifySameOriginMutation(request, { requireJson: false });
  if (originErr) return originErr;
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const { id, commentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(commentId)) {
    return NextResponse.json({ error: "Comentario inválido." }, { status: 400 });
  }
  const deleted = await deleteSocialComment(member.db, member.userId, commentId, id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No puedes borrar ese comentario." }, { status: 404 });
}
