import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { setSocialCommentHelpful } from "@pitchlab/db";
import { z } from "zod";
import { withActivePaseMutation, type ActivePaseMutationContext } from "../../../../../../../../src/server/api-guards";
import { reasonResponse } from "../../../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentParams = { id: string; commentId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CommentParamsSchema = z.object({
  id: z.string().regex(UUID_RE),
  commentId: z.string().regex(UUID_RE),
});

const HelpfulPayloadSchema = z
  .object({
    helpful: z.boolean(),
  })
  .strict();

export const PUT = withActivePaseMutation(
  {
    bucket: "social-comment-like",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    requireJson: false,
  },
  async ({ request, params, user }: ActivePaseMutationContext<CommentParams>) => {
    const parsedParams = CommentParamsSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    const raw = await request.json().catch(() => null);
    const parsedBody = HelpfulPayloadSchema.safeParse(raw);
    if (!parsedBody.success) {
      const err = createSanitizedErrorPayload("INVALID_INPUT", "Falta helpful.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const result = await setSocialCommentHelpful(
      user.db,
      user.userId,
      parsedParams.data.commentId,
      parsedBody.data.helpful,
      new Date(),
      parsedParams.data.id,
    );
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ helpfulCount: result.helpfulCount, helpfulByMe: result.helpfulByMe });
  },
);
