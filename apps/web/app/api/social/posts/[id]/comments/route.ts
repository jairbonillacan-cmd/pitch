import { NextResponse, after } from "next/server";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { addSocialComment, listPostComments } from "@pitchlab/db";
import { z } from "zod";
import {
  withActivePaseMutation,
  withSessionRead,
  type ActivePaseMutationContext,
  type MemberSessionReadContext,
} from "../../../../../../src/server/api-guards";
import { logSecurityEvent } from "../../../../../../src/server/safe-logger";
import { checkSocialText, reasonResponse } from "../../../../../../src/server/social";
import { isWebPushConfigured, sendPushToUsers } from "../../../../../../src/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostIdParams = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENTS_LIMIT_MAX = 40;

const PostIdParamSchema = z.object({
  id: z.string().regex(UUID_RE),
});

const CommentPayloadSchema = z
  .object({
    body: z.string().max(800),
    parentCommentId: z.string().trim().regex(UUID_RE).nullish(),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "social-comments-read",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    resourceKey: ({ params }: { request: Request; params: PostIdParams }) => params.id,
  },
  async ({ request, params, user }: MemberSessionReadContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit === null ? null : parseStrictFiniteNumber(rawLimit);
    const limit =
      parsedLimit !== null && parsedLimit >= 1
        ? Math.min(Math.trunc(parsedLimit), COMMENTS_LIMIT_MAX)
        : COMMENTS_LIMIT_MAX;
    const result = await listPostComments(user.db, user.userId, parsedParams.data.id, limit);
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ comments: result.comments, commentsCount: result.commentsCount });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "social-comments-write",
    limit: 30,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ request, params, user }: ActivePaseMutationContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    const raw = await request.json().catch(() => null);
    const parsedBody = CommentPayloadSchema.safeParse(raw);
    if (!parsedBody.success) {
      const err = createSanitizedErrorPayload("INVALID_COMMENT", "Escribe un comentario válido.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const text = checkSocialText(parsedBody.data.body, "comment");
    if (!text.ok) {
      const err = createSanitizedErrorPayload("INVALID_COMMENT", text.error);
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const parentCommentId = parsedBody.data.parentCommentId ?? null;
    const result = await addSocialComment(
      user.db,
      user.userId,
      parsedParams.data.id,
      text.text,
      new Date(),
      parentCommentId,
    );
    if (!result.ok) return reasonResponse(result.reason);

    const notifiedUserIds = Array.isArray(result.notifiedUserIds) ? result.notifiedUserIds : [];
    if (notifiedUserIds.length > 0 && isWebPushConfigured()) {
      const pushWork = async () => {
        await sendPushToUsers(user.db, notifiedUserIds, "social", {
          title: `${result.comment.authorName} respondió en Comunidad`,
          body: result.comment.body.slice(0, 140),
          url: `/app/social?post=${parsedParams.data.id}`,
          tag: `social-${parsedParams.data.id}`,
        });
      };
      try {
        after(pushWork);
      } catch (err) {
        logSecurityEvent("info", "social_comment_push_inline_fallback", {
          postId: parsedParams.data.id,
          error: err,
        });
        await pushWork();
      }
    }

    return NextResponse.json({ comment: result.comment }, { status: 201 });
  },
);
