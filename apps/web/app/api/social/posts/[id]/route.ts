import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { deleteSocialPost, getSocialPostById } from "@pitchlab/db";
import { z } from "zod";
import {
  withMemberMutation,
  withSessionRead,
  type MemberMutationContext,
  type MemberSessionReadContext,
} from "../../../../../src/server/api-guards";
import { withAuthorBadges } from "../../../../../src/server/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostIdParams = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PostIdParamSchema = z
  .object({
    id: z.string().regex(UUID_RE),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "social-post-detail",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    watermark: true,
    resourceKey: ({ params }: { request: Request; params: PostIdParams }) => params.id,
  },
  async ({ params, user }: MemberSessionReadContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      const err = createSanitizedErrorPayload("INVALID_POST_ID", "Publicación inválida.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const post = await getSocialPostById(user.db, user.userId, parsedParams.data.id);
    return post
      ? NextResponse.json({ post: (await withAuthorBadges(user.db, [post]))[0] })
      : NextResponse.json({ ok: false, error: "Publicación no encontrada." }, { status: 404 });
  },
);

export const DELETE = withMemberMutation(
  {
    bucket: "social-post-delete",
    limit: 30,
    windowMs: 60_000,
    requireJson: false,
  },
  async ({ params, user }: MemberMutationContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) {
      const err = createSanitizedErrorPayload("INVALID_POST_ID", "Publicación inválida.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const deleted = await deleteSocialPost(user.db, user.userId, parsedParams.data.id);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "No puedes borrar esa publicación." }, { status: 404 });
  },
);
