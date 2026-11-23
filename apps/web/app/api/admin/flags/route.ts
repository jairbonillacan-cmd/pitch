import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import {
  FLAG_AI_ENABLED,
  FLAG_MONTH1_NO_CARD,
  FLAG_TIPSTER_PAYOUTS,
  recordAdminAudit,
  setBoolFlag,
} from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE_FLAG_KEYS = [FLAG_MONTH1_NO_CARD, FLAG_TIPSTER_PAYOUTS, FLAG_AI_ENABLED] as const;

const updateFlagBodySchema = z
  .object({
    key: z.enum(EDITABLE_FLAG_KEYS),
    value: z.boolean(),
  })
  .strict();

function invalidInputResponse(code: string, message: string, status = 400): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code, message: payload.message },
    { status },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

export const POST = withAdminMutation(
  { bucket: "admin-flags", limit: 30 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = updateFlagBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse("INVALID_FLAG", "Bandera no editable");
    }

    await setBoolFlag(user.db, parsed.data.key, parsed.data.value, user.userId);
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    await recordAdminAudit(user.db, {
      actorUserId: user.userId,
      actorEmail: user.email,
      action: "flag.set",
      targetKey: parsed.data.key,
      payloadJson: { value: parsed.data.value },
      ipSubnetHash,
    });
    return NextResponse.json({ key: parsed.data.key, value: parsed.data.value });
  },
);
