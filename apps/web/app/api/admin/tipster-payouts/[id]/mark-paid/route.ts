import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import {
  eq,
  markCommissionPaidManually,
  tipsterCommissionLedger,
  tipsterProfiles,
  users,
} from "@pitchlab/db";
import {
  ApiGuardHttpError,
  readBoundedJson,
  withAdminMutation,
  type AdminMutationContext,
  type GuardedRouteHandler,
} from "../../../../../../src/server/api-guards";
import { getMailer } from "../../../../../../src/server/mailer";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTipsterManualPayoutEmail } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LedgerIdParamsSchema = z
  .object({
    id: z.string().regex(UUID_RE),
  })
  .strict();

const MarkPaidBodySchema = z
  .object({
    reference: z.string().trim().min(3).max(80),
    note: z.string().max(200).nullable().optional(),
  })
  .strict();

export const POST: GuardedRouteHandler<{ id: string }> = withAdminMutation(
  {
    bucket: "admin-tipster-payout",
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, params, user }: AdminMutationContext<{ id: string }>) => {
    const parsedParams = LedgerIdParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      const payload = createSanitizedErrorPayload("INVALID_COMMISSION_ID", "Comisión inválida.");
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const rawBody: unknown = await readBoundedJson(request, 16_384).catch((err) => {
      if (err instanceof ApiGuardHttpError) throw err;
      return null;
    });
    const parsedBody = MarkPaidBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_PAYOUT_REFERENCE",
        "Escribe el folio o referencia de pago (mínimo 3 caracteres).",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const now = new Date();
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

    const res = await markCommissionPaidManually(user.db, {
      ledgerId: parsedParams.data.id,
      adminUserId: user.userId,
      adminEmail: user.email,
      reference: parsedBody.data.reference,
      note: parsedBody.data.note ?? null,
      now,
      ipSubnetHash,
    });

    if (!res.ok) {
      if (res.reason === "referencia_invalida") {
        return NextResponse.json(
          { error: "Escribe el folio o referencia de pago (mínimo 3 caracteres)." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Esta comisión ya fue liquidada o no está disponible para pago." },
        { status: 409 },
      );
    }

    const [ledgerRow] = await user.db
      .select({
        tipsterEmail: users.email,
        tipsterName: tipsterProfiles.displayName,
        commissionCentavosMxn: tipsterCommissionLedger.commissionCentavosMxn,
      })
      .from(tipsterCommissionLedger)
      .innerJoin(tipsterProfiles, eq(tipsterProfiles.userId, tipsterCommissionLedger.tipsterUserId))
      .innerJoin(users, eq(users.id, tipsterProfiles.userId))
      .where(eq(tipsterCommissionLedger.id, parsedParams.data.id))
      .limit(1);

    if (ledgerRow) {
      await sendTipsterManualPayoutEmail(getMailer(), {
        tipsterEmail: ledgerRow.tipsterEmail,
        tipsterName: ledgerRow.tipsterName,
        amountCentavos: ledgerRow.commissionCentavosMxn,
        paidAt: now,
        reference: res.reference,
      });
    }

    return NextResponse.json({
      ok: true,
      ledgerId: res.ledgerId,
      reference: res.reference,
      paidOutAtIso: res.paidOutAt.toISOString(),
    });
  },
);
