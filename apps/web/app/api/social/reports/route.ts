import { NextResponse } from "next/server";
import { reportSocialContent } from "@pitchlab/db";
import { reasonResponse, requireSocialMember } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { postId?, commentId?, reason } — reporta una publicación o comentario ajeno. */
export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await reportSocialContent(
    member.db,
    member.userId,
    {
      postId: typeof body?.postId === "string" ? body.postId : null,
      commentId: typeof body?.commentId === "string" ? body.commentId : null,
      reason: body?.reason,
    },
    new Date(),
  );
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ ok: true, id: result.id, autoHidden: result.autoHidden }, { status: 201 });
}
