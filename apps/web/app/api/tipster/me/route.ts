import { NextResponse } from "next/server";
import {
  desc,
  eq,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
} from "@pitchlab/db";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tipster/me — estado y comisiones reales del tipster autenticado. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const [profile] = await member.db
    .select({
      userId: tipsterProfiles.userId,
      handle: tipsterProfiles.handle,
      displayName: tipsterProfiles.displayName,
      specialty: tipsterProfiles.specialty,
      promoCode: tipsterProfiles.promoCode,
      freeTrialDays: tipsterProfiles.freeTrialDays,
      commissionBps: tipsterProfiles.commissionBps,
      defaultWeeklySlug: tipsterProfiles.defaultWeeklySlug,
      payoutMethod: tipsterProfiles.payoutMethod,
      connectPayoutsEnabled: tipsterProfiles.connectPayoutsEnabled,
      isActive: tipsterProfiles.isActive,
    })
    .from(tipsterProfiles)
    .where(eq(tipsterProfiles.userId, member.userId))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ isTipster: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const [attributions, ledgerRows] = await Promise.all([
    member.db
      .select({ status: tipsterAttributions.status })
      .from(tipsterAttributions)
      .where(eq(tipsterAttributions.tipsterUserId, member.userId)),
    member.db
      .select({
        id: tipsterCommissionLedger.id,
        grossPaidCentavosMxn: tipsterCommissionLedger.grossPaidCentavosMxn,
        vatCentavosMxn: tipsterCommissionLedger.vatCentavosMxn,
        gatewayFeeCentavosMxn: tipsterCommissionLedger.gatewayFeeCentavosMxn,
        netCommissionableCentavosMxn: tipsterCommissionLedger.netCommissionableCentavosMxn,
        commissionBps: tipsterCommissionLedger.commissionBps,
        commissionCentavosMxn: tipsterCommissionLedger.commissionCentavosMxn,
        status: tipsterCommissionLedger.status,
        clearsAt: tipsterCommissionLedger.clearsAt,
        payoutNote: tipsterCommissionLedger.payoutNote,
        paidOutAt: tipsterCommissionLedger.paidOutAt,
        createdAt: tipsterCommissionLedger.createdAt,
      })
      .from(tipsterCommissionLedger)
      .where(eq(tipsterCommissionLedger.tipsterUserId, member.userId))
      .orderBy(desc(tipsterCommissionLedger.createdAt))
      .limit(100),
  ]);

  let trial5d = 0;
  let activePaying = 0;
  let churned = 0;
  for (const attr of attributions) {
    if (attr.status === "trial_5d") trial5d += 1;
    else if (attr.status === "active_paying") activePaying += 1;
    else if (attr.status === "churned") churned += 1;
  }

  let pendingClearanceCentavos = 0;
  let payableCentavos = 0;
  let paidOutCentavos = 0;
  for (const row of ledgerRows) {
    if (row.status === "pending_clearance") {
      pendingClearanceCentavos += row.commissionCentavosMxn;
    } else if (row.status === "payable" || row.status === "processing_payout") {
      payableCentavos += row.commissionCentavosMxn;
    } else if (row.status === "paid_out") {
      paidOutCentavos += row.commissionCentavosMxn;
    }
  }

  return NextResponse.json(
    {
      isTipster: true,
      profile,
      counts: {
        totalAttributed: attributions.length,
        trial5d,
        activePaying,
        churned,
      },
      totals: {
        pendingClearanceCentavos,
        payableCentavos,
        paidOutCentavos,
      },
      ledger: ledgerRows.map((row) => ({
        ...row,
        clearsAtIso: row.clearsAt.toISOString(),
        paidOutAtIso: row.paidOutAt ? row.paidOutAt.toISOString() : null,
        createdAtIso: row.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
