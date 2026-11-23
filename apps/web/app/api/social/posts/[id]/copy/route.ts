import { NextResponse } from "next/server";
import { recordSocialPostPickCopy } from "@pitchlab/db";
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

export const POST = withActivePaseMutation(
  {
    bucket: "social-post-copy",
    limit: 40,
    windowMs: 60_000,
    requireSocialHandle: true,
    requireJson: false,
  },
  async ({ params, user }: ActivePaseMutationContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    const result = await recordSocialPostPickCopy(user.db, user.userId, parsedParams.data.id);
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ copiesCount: result.copiesCount });
  },
);
