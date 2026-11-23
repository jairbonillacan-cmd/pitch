import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { getEmailPreferences, setEmailPreferences } from "@pitchlab/db";
import { withMemberMutation, withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EmailPreferencesPatchSchema = z
  .object({
    pickResults: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    monthlyRecord: z.boolean().optional(),
  })
  .strict();

export const GET = withSessionRead(
  { bucket: "me-email-preferences", allowBeta: false },
  async ({ user }) => {
    return NextResponse.json(await getEmailPreferences(user.db, user.userId));
  },
);

export const PUT = withMemberMutation(
  { bucket: "me-email-preferences" },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const parsed = EmailPreferencesPatchSchema.safeParse(raw);
    if (!parsed.success) {
      const sanitized = createSanitizedErrorPayload("VALIDATION_ERROR", "Datos incompletos");
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    const patch: { pickResults?: boolean; weeklyDigest?: boolean; monthlyRecord?: boolean } = {};
    if (parsed.data.pickResults !== undefined) patch.pickResults = parsed.data.pickResults;
    if (parsed.data.weeklyDigest !== undefined) patch.weeklyDigest = parsed.data.weeklyDigest;
    if (parsed.data.monthlyRecord !== undefined) patch.monthlyRecord = parsed.data.monthlyRecord;

    if (Object.keys(patch).length === 0) {
      const sanitized = createSanitizedErrorPayload("VALIDATION_ERROR", "Datos incompletos");
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    await setEmailPreferences(user.db, user.userId, patch);
    return NextResponse.json(await getEmailPreferences(user.db, user.userId));
  },
);
