import { NextResponse } from "next/server";
import {
  FLAG_AI_ENABLED,
  FLAG_MONTH1_NO_CARD,
  FLAG_TIPSTAR_PAYOUTS,
  recordAdminAudit,
  setBoolFlag,
} from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireAdmin } from "../../../../src/server/session-user";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE_FLAGS = new Set([FLAG_MONTH1_NO_CARD, FLAG_TIPSTAR_PAYOUTS, FLAG_AI_ENABLED]);

/** POST { key, value } — cambia una bandera operativa para toda la plataforma y deja rastro en auditoría. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const body = (await request.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
  if (!body || typeof body.key !== "string" || !EDITABLE_FLAGS.has(body.key) || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Bandera no editable" }, { status: 400 });
  }
  await setBoolFlag(admin.db, body.key, body.value, admin.userId);
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  await recordAdminAudit(admin.db, {
    actorUserId: admin.userId,
    actorEmail: admin.email,
    action: "flag.set",
    targetKey: body.key,
    payloadJson: { value: body.value },
    ipSubnetHash,
  });
  return NextResponse.json({ key: body.key, value: body.value });
}
