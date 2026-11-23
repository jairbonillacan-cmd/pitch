import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { setSocialLike } from "@pitchlab/db";
import { z } from "zod";
import { withActivePaseMutation, type ActivePaseMutationContext } from "../../../../../../src/server/api-guards";
import { reasonResponse } from "../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostIdParams = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PostIdParamSchema = z.object({
  id: z.string().regex(UUID_RE),
});

const LikePayloadSchema = z
  .object({
    liked: z.boolean(),
  })
  .strict();

export const PUT = withActivePaseMutation(
  {
    bucket: "social-post-like",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    requireJson: false,
  },
  async ({ request, params, user }: ActivePaseMutationContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    const raw = await request.json().catch(() => null);
    const parsedBody = LikePayloadSchema.safeParse(raw);
    if (!parsedBody.success) {
      const err = createSanitizedErrorPayload("INVALID_INPUT", "Falta liked.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const result = await setSocialLike(user.db, user.userId, parsedParams.data.id, parsedBody.data.liked);
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ likes: result.likes, liked: parsedBody.data.liked });
  },
);
