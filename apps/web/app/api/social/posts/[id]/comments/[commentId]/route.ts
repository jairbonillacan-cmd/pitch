import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { deleteSocialComment } from "@pitchlab/db";
import { z } from "zod";
import { withMemberMutation, type MemberMutationContext } from "../../../../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentParams = { id: string; commentId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CommentParamsSchema = z
  .object({
    id: z.string().regex(UUID_RE),
    commentId: z.string().regex(UUID_RE),
  })
  .strict();

export const DELETE = withMemberMutation(
  {
    bucket: "social-comment-delete",
    limit: 30,
    windowMs: 60_000,
    requireJson: false,
  },
  async ({ params, user }: MemberMutationContext<CommentParams>) => {
    const parsedParams = CommentParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const err = createSanitizedErrorPayload("INVALID_COMMENT_ID", "Comentario inválido.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const deleted = await deleteSocialComment(
      user.db,
      user.userId,
      parsedParams.data.commentId,
      parsedParams.data.id,
    );
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "No puedes borrar ese comentario." }, { status: 404 });
  },
);
