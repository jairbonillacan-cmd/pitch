import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { markSocialNotificationsRead } from "@pitchlab/db";
import { z } from "zod";
import { withMemberMutation } from "../../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTIFICATION_IDS = 100;

const MarkNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().trim().regex(UUID_RE)).max(MAX_NOTIFICATION_IDS).optional(),
  })
  .strict();

export const POST = withMemberMutation(
  {
    bucket: "me-notifications-read-mark",
    limit: 60,
    windowMs: 60_000,
    requireJson: false,
  },
  async ({ request, user }) => {
    const rawText = await request.text();
    let ids: string[] | undefined;
    if (rawText.trim().length > 0) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (err) {
        void err;
        const payload = createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido.");
        return NextResponse.json({ ok: false, error: payload.message, code: payload.code }, { status: 400 });
      }
      const parsed = MarkNotificationsReadSchema.safeParse(parsedJson);
      if (!parsed.success) {
        const payload = createSanitizedErrorPayload("INVALID_INPUT", "Lista de avisos inválida.");
        return NextResponse.json({ ok: false, error: payload.message, code: payload.code }, { status: 400 });
      }
      ids = parsed.data.ids;
    }
    const updated = await markSocialNotificationsRead(user.db, user.userId, ids, new Date());
    return NextResponse.json({ ok: true, updated });
  },
);
