import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { listFollowing, setSocialFollow } from "@pitchlab/db";
import { z } from "zod";
import { withActivePaseMutation, withSessionRead } from "../../../../src/server/api-guards";
import { reasonResponse } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOLLOWING_LIMIT = 40;

const FollowPayloadSchema = z
  .object({
    handle: z
      .string()
      .transform((value) => value.replace(/^@/, "").trim())
      .refine((value) => value.length >= 1 && value.length <= 32, "invalid_handle"),
    follow: z.boolean(),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "social-follows-read",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ user }) => {
    const handles = await listFollowing(user.db, user.userId, FOLLOWING_LIMIT);
    return NextResponse.json({ handles });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "social-follows-write",
    limit: 30,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const parsed = FollowPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const err = createSanitizedErrorPayload("INVALID_INPUT", "Faltan datos.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const result = await setSocialFollow(user.db, user.userId, parsed.data.handle, parsed.data.follow);
    if (!result.ok) return reasonResponse(result.reason);
    return NextResponse.json({ following: result.following });
  },
);
