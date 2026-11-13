import { NextResponse } from "next/server";
import {
  eq,
  markCommissionPaidManually,
  tipsterCommissionLedger,
  tipsterProfiles,
  users,
} from "@pitchlab/db";
import { getMailer } from "../../../../../../src/server/mailer";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../../src/server/session-user";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTipsterManualPayoutEmail } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/tipster-payouts/[id]/mark-paid — marca una comisión como pagada vía transferencia manual. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Comisión inválida." }, { status: 400 });
  }

  const rl = await checkEndpointRateLimit({
    bucket: "admin-tipster-payout",
    key: admin.userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { reference?: unknown; note?: unknown } | null;
  const reference = typeof body?.reference === "string" ? body.reference : "";
  const note = typeof body?.note === "string" ? body.note : null;
  const now = new Date();
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  const res = await markCommissionPaidManually(admin.db, {
    ledgerId: id,
    adminUserId: admin.userId,
    adminEmail: admin.email,
    reference,
    note,
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

  const [ledgerRow] = await admin.db
    .select({
      tipsterEmail: users.email,
      tipsterName: tipsterProfiles.displayName,
      commissionCentavosMxn: tipsterCommissionLedger.commissionCentavosMxn,
    })
    .from(tipsterCommissionLedger)
    .innerJoin(tipsterProfiles, eq(tipsterProfiles.userId, tipsterCommissionLedger.tipsterUserId))
    .innerJoin(users, eq(users.id, tipsterProfiles.userId))
    .where(eq(tipsterCommissionLedger.id, id))
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
}
