import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { adminGrantAccessDays } from "@pitchlab/db";
import { withAdminMutation } from "../../../../../src/server/api-guards";
import { trialHashes } from "../../../../../src/server/signup";
import { UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStrictIntInRange(raw: number | string, min: number, max: number): number | null {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

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

const grantAccessBodySchema = z
  .object({
    targetUserId: z.string().trim().regex(UUID_RE),
    days: z
      .union([z.number(), z.string()])
      .refine((raw) => parseStrictIntInRange(raw, 1, 365) !== null)
      .transform((raw) => parseStrictIntInRange(raw, 1, 365) ?? 1),
    reason: z.string().trim().min(3).max(280),
  })
  .strict();

export const POST = withAdminMutation(
  { bucket: "admin-access-grant", limit: 60 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = grantAccessBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(
        "INVALID_ACCESS_GRANT",
        "Indica un socio válido, entre 1 y 365 días y un motivo de al menos 3 caracteres.",
      );
    }

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const res = await adminGrantAccessDays(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      targetUserId: parsed.data.targetUserId,
      days: parsed.data.days,
      reason: parsed.data.reason,
      now: new Date(),
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "usuario_no_encontrado") {
        return invalidInputResponse("MEMBER_NOT_FOUND", "No encontramos a ese socio.", 404);
      }
      if (res.reason === "dias_invalidos") {
        return invalidInputResponse("INVALID_GRANT_DAYS", "Indica entre 1 y 365 días válidos.");
      }
      return invalidInputResponse(
        "INVALID_GRANT_REASON",
        "Escribe el motivo de la concesión (mínimo 3 caracteres).",
      );
    }

    return NextResponse.json({
      ok: true,
      grantId: res.grantId,
      newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
    });
  },
);
