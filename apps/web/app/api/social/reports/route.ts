import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { reportSocialContent, SOCIAL_REPORT_REASONS } from "@pitchlab/db";
import { z } from "zod";
import { withActivePaseMutation } from "../../../../src/server/api-guards";
import { reasonResponse } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ReportPayloadSchema = z
  .object({
    postId: z.string().trim().regex(UUID_RE).nullish(),
    commentId: z.string().trim().regex(UUID_RE).nullish(),
    reason: z.enum(SOCIAL_REPORT_REASONS),
  })
  .strict()
  .refine((data) => Boolean(data.postId) !== Boolean(data.commentId), "invalid_target");

export const POST = withActivePaseMutation(
  {
    bucket: "social-reports",
    limit: 20,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const parsed = ReportPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const err = createSanitizedErrorPayload("INVALID_REPORT", "Revisa los datos del reporte.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const result = await reportSocialContent(
      user.db,
      user.userId,
      {
        postId: parsed.data.postId ?? null,
        commentId: parsed.data.commentId ?? null,
        reason: parsed.data.reason,
      },
      new Date(),
    );
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ ok: true, id: result.id, autoHidden: result.autoHidden }, { status: 201 });
  },
);
