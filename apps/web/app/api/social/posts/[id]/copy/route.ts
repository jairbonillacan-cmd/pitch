import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { recordSocialPostPickCopy } from "@pitchlab/db";
import { z } from "zod";
import {
  ApiGuardHttpError,
  readBoundedJson,
  withActivePaseMutation,
  type ActivePaseMutationContext,
} from "../../../../../../src/server/api-guards";
import { reasonResponse } from "../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostIdParams = { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PostIdParamSchema = z
  .object({
    id: z.string().regex(UUID_RE),
  })
  .strict();

const EmptyCopyBodySchema = z.object({}).strict().optional();

export const POST = withActivePaseMutation(
  {
    bucket: "social-post-copy",
    limit: 40,
    windowMs: 60_000,
    requireSocialHandle: true,
    requireJson: false,
  },
  async ({ request, params, user }: ActivePaseMutationContext<PostIdParams>) => {
    const parsedParams = PostIdParamSchema.safeParse(params);
    if (!parsedParams.success) return reasonResponse("no_existe");
    let rawBody: unknown;
    try {
      rawBody = await readBoundedJson(request, 4_096, { allowEmpty: true });
    } catch (err) {
      if (err instanceof ApiGuardHttpError) throw err;
      const errPayload = createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido.");
      return NextResponse.json({ ok: false, error: errPayload.message, code: errPayload.code }, { status: 400 });
    }
    if (!EmptyCopyBodySchema.safeParse(rawBody).success) {
      const errPayload = createSanitizedErrorPayload("INVALID_INPUT", "Datos inválidos.");
      return NextResponse.json({ ok: false, error: errPayload.message, code: errPayload.code }, { status: 400 });
    }
    const result = await recordSocialPostPickCopy(user.db, user.userId, parsedParams.data.id);
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ copiesCount: result.copiesCount });
  },
);
