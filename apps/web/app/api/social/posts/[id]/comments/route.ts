import { NextResponse, after } from "next/server";
import { addSocialComment, listPostComments } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../../../src/server/request-security";
import { checkSocialText, reasonResponse, requireSocialMember } from "../../../../../../src/server/social";
import { isWebPushConfigured, sendPushToUsers } from "../../../../../../src/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reasonResponse("no_existe");
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || 200;
  const result = await listPostComments(member.db, member.userId, id, limit);
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ comments: result.comments, commentsCount: result.commentsCount });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const originErr = verifySameOriginMutation(request, { requireJson: true });
  if (originErr) return originErr;
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reasonResponse("no_existe");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = checkSocialText(body?.body, "comment");
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const parentCommentId = typeof body?.parentCommentId === "string" ? body.parentCommentId.trim() : null;
  const result = await addSocialComment(member.db, member.userId, id, text.text, new Date(), parentCommentId);
  if (!result.ok) return reasonResponse(result.reason);

  const notifiedUserIds = Array.isArray(result.notifiedUserIds) ? result.notifiedUserIds : [];
  if (notifiedUserIds.length > 0 && isWebPushConfigured()) {
    const pushWork = async () => {
      await sendPushToUsers(member.db, notifiedUserIds, "social", {
        title: `${result.comment.authorName} respondió en Comunidad`,
        body: result.comment.body.slice(0, 140),
        url: `/app/social?post=${id}`,
        tag: `social-${id}`,
      });
    };
    try {
      after(pushWork);
    } catch {
      await pushWork();
    }
  }

  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
