import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  desc,
  eq,
  sql,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
} from "@pitchlab/db";
import { withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIPSTER_LEDGER_LIMIT = 40;

export const GET = withSessionRead(
  {
    bucket: "tipster-me",
    allowBeta: false,
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const parsedLimit = parseStrictFiniteNumber(rawLimit);
    const ledgerLimit =
      parsedLimit !== null && Number.isInteger(parsedLimit)
        ? Math.min(MAX_TIPSTER_LEDGER_LIMIT, Math.max(1, parsedLimit))
        : MAX_TIPSTER_LEDGER_LIMIT;

    const [profile] = await user.db
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
      .where(eq(tipsterProfiles.userId, user.userId))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ isTipster: false });
    }

    const [attributionCounts, ledgerTotals, ledgerRows] = await Promise.all([
      user.db
        .select({
          status: tipsterAttributions.status,
          total: sql<number>`count(*)::int`,
        })
        .from(tipsterAttributions)
        .where(eq(tipsterAttributions.tipsterUserId, user.userId))
        .groupBy(tipsterAttributions.status),
      user.db
        .select({
          status: tipsterCommissionLedger.status,
          totalCentavos: sql<string>`coalesce(sum(${tipsterCommissionLedger.commissionCentavosMxn}), 0)::text`,
        })
        .from(tipsterCommissionLedger)
        .where(eq(tipsterCommissionLedger.tipsterUserId, user.userId))
        .groupBy(tipsterCommissionLedger.status),
      user.db
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
        .where(eq(tipsterCommissionLedger.tipsterUserId, user.userId))
        .orderBy(desc(tipsterCommissionLedger.createdAt))
        .limit(ledgerLimit),
    ]);

    let totalAttributed = 0;
    let trial5d = 0;
    let activePaying = 0;
    let churned = 0;
    for (const row of attributionCounts) {
      const count = Math.trunc(parseStrictFiniteNumber(row.total) ?? 0);
      totalAttributed += count;
      if (row.status === "trial_5d") trial5d += count;
      else if (row.status === "active_paying") activePaying += count;
      else if (row.status === "churned") churned += count;
    }

    let pendingClearanceCentavos = 0;
    let payableCentavos = 0;
    let paidOutCentavos = 0;
    for (const row of ledgerTotals) {
      const sum = Math.trunc(parseStrictFiniteNumber(row.totalCentavos) ?? 0);
      if (row.status === "pending_clearance") {
        pendingClearanceCentavos += sum;
      } else if (row.status === "payable" || row.status === "processing_payout") {
        payableCentavos += sum;
      } else if (row.status === "paid_out") {
        paidOutCentavos += sum;
      }
    }

    return NextResponse.json({
      isTipster: true,
      profile,
      counts: {
        totalAttributed,
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
    });
  },
);
