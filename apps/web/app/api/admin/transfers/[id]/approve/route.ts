import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { approveTransferRequest } from "@pitchlab/db";
import {
  withAdminMutation,
  type AdminMutationContext,
  type GuardedRouteHandler,
} from "../../../../../../src/server/api-guards";
import { getMailer } from "../../../../../../src/server/mailer";
import { serializeTransferRequest } from "../../../../../../src/server/member-plan";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTransferApprovedEmails } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TransferIdParamsSchema = z.object({
  id: z.string().regex(UUID_RE),
});

const ApproveTransferBodySchema = z
  .object({
    adminNotes: z.string().max(500).nullable().optional(),
  })
  .optional();

export const POST: GuardedRouteHandler<{ id: string }> = withAdminMutation(
  {
    bucket: "admin-transfer-review",
    limit: 60,
    windowMs: 60_000,
    requireJson: false,
  },
  async ({ request, params, user }: AdminMutationContext<{ id: string }>) => {
    const parsedParams = TransferIdParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const payload = createSanitizedErrorPayload("INVALID_TRANSFER_ID", "Solicitud inválida.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const rawText = await request.text();
    let rawBody: unknown = undefined;
    if (rawText.trim().length > 0) {
      try {
        rawBody = JSON.parse(rawText);
      } catch (err) {
        void err;
        const payload = createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido.");
        return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
      }
    }

    const parsedBody = ApproveTransferBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_INPUT",
        "Datos inválidos para aprobar la solicitud.",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const adminNotes = parsedBody.data?.adminNotes ?? null;
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const now = new Date();

    const res = await approveTransferRequest(user.db, {
      requestId: parsedParams.data.id,
      adminUserId: user.userId,
      adminEmail: user.email,
      paidAt: now,
      adminNotes,
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "no_encontrada") {
        return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Solo se pueden aprobar solicitudes en revisión." },
        { status: 409 },
      );
    }

    await sendTransferApprovedEmails(user.db, getMailer(), res, now);

    return NextResponse.json({
      ok: true,
      alreadyApproved: res.alreadyApproved,
      request: serializeTransferRequest({
        ...res.request,
        couponExpiresAt: res.coupon.expiresAt,
        couponRedeemedAt: null,
      }),
      coupon: {
        id: res.coupon.id,
        code: res.coupon.code,
        days: res.coupon.days,
        maxRedemptions: res.coupon.maxRedemptions,
        expiresAtIso: res.coupon.expiresAt ? res.coupon.expiresAt.toISOString() : null,
      },
    });
  },
);
