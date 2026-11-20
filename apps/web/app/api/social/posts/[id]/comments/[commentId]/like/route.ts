import { NextResponse } from "next/server";
import { setSocialCommentHelpful } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../../../../../src/server/request-security";
import { reasonResponse, requireSocialMember } from "../../../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ helpful: true | false }`: marca o quita «Útil» en un comentario. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const originErr = verifySameOriginMutation(request, { requireJson: false });
  if (originErr) return originErr;
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id, commentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(commentId)) {
    return reasonResponse("no_existe");
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.helpful !== "boolean") {
    return NextResponse.json({ error: "Falta helpful" }, { status: 400 });
  }
  const result = await setSocialCommentHelpful(member.db, member.userId, commentId, body.helpful, new Date(), id);
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ helpfulCount: result.helpfulCount, helpfulByMe: result.helpfulByMe });
}
