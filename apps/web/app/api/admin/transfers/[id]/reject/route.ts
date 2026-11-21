import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { rejectTransferRequest } from "@pitchlab/db";
import {
  withAdminMutation,
  type AdminMutationContext,
  type GuardedRouteHandler,
} from "../../../../../../src/server/api-guards";
import { getMailer } from "../../../../../../src/server/mailer";
import { serializeTransferRequest } from "../../../../../../src/server/member-plan";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTransferRejectedEmail } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TransferIdParamsSchema = z.object({
  id: z.string().regex(UUID_RE),
});

const RejectTransferBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
  adminNotes: z.string().max(500).nullable().optional(),
});

export const POST: GuardedRouteHandler<{ id: string }> = withAdminMutation(
  {
    bucket: "admin-transfer-review",
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, params, user }: AdminMutationContext<{ id: string }>) => {
    const parsedParams = TransferIdParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_ID", "Solicitud inválida.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsedBody = RejectTransferBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_REJECT_REASON",
        "Escribe el motivo del rechazo (mínimo 3 caracteres).",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

    const res = await rejectTransferRequest(user.db, {
      requestId: parsedParams.data.id,
      adminUserId: user.userId,
      adminEmail: user.email,
      reason: parsedBody.data.reason,
      adminNotes: parsedBody.data.adminNotes ?? null,
      now: new Date(),
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "motivo_requerido") {
        return NextResponse.json(
          { error: "Escribe el motivo del rechazo (mínimo 3 caracteres)." },
          { status: 400 },
        );
      }
      if (res.reason === "no_encontrada") {
        return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Esta solicitud ya fue resuelta o cancelada." },
        { status: 409 },
      );
    }

    await sendTransferRejectedEmail(getMailer(), res);

    return NextResponse.json({
      ok: true,
      request: serializeTransferRequest(res.request),
    });
  },
);
