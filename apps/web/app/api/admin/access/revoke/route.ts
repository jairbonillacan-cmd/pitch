import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { adminRevokeGrant } from "@pitchlab/db";
import { withAdminMutation } from "../../../../../src/server/api-guards";
import { trialHashes } from "../../../../../src/server/signup";
import { UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const revokeAccessBodySchema = z
  .object({
    grantId: z.string().trim().regex(UUID_RE),
    reason: z.string().trim().min(3).max(280),
  })
  .strict();

export const POST = withAdminMutation(
  { bucket: "admin-access-revoke", limit: 60 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = revokeAccessBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(
        "INVALID_ACCESS_REVOKE",
        "Indica una concesión válida y el motivo de la revocación (mínimo 3 caracteres).",
      );
    }

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const res = await adminRevokeGrant(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      grantId: parsed.data.grantId,
      reason: parsed.data.reason,
      now: new Date(),
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "motivo_requerido") {
        return invalidInputResponse(
          "INVALID_REVOKE_REASON",
          "Escribe el motivo de la revocación (mínimo 3 caracteres).",
        );
      }
      return invalidInputResponse(
        "GRANT_NOT_FOUND",
        "La concesión no existe o ya estaba revocada.",
        404,
      );
    }

    return NextResponse.json({
      ok: true,
      userId: res.userId,
      removedMs: res.removedMs,
      newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
    });
  },
);
