import {
  accessUntil,
  and,
  desc,
  entitlementGrants,
  eq,
  hasActivePaseTotal,
  hasAppliedRewardGrant,
  isNull,
  listUserTransferRequests,
  myReferrals,
  quoteTransferAmountCentavos,
  subscriptions,
  users,
  type Db,
  type TransferRequestRow,
} from "@pitchlab/db";
import { supportEmail } from "@pitchlab/emails";
import { referralEarnedDays } from "@pitchlab/ui";
import { getTransferBankConfig, paymentMode, type PaymentMode } from "./billing/payment-mode";

const DAY_MS = 86_400_000;

export type MemberPlanState = "prueba" | "mensual" | "anual" | "sin_renovacion";

export interface TransferBankSummary {
  configured: boolean;
  bank: string | null;
  beneficiary: string | null;
  clabe: string | null;
  clabeMasked: string | null;
  instructions: string | null;
  supportEmail: string;
}

export interface TransferRequestSummary {
  id: string;
  planInterval: "monthly" | "annual";
  amountCentavosMxn: number;
  reportedAmountCentavosMxn: number | null;
  amountMismatch: boolean;
  referralDiscountApplied: boolean;
  referenceCode: string;
  originBank: string | null;
  receiptReference: string | null;
  payerName: string | null;
  transferDate: string | null;
  userNote: string | null;
  status: "pending_review" | "approved" | "rejected" | "canceled";
  rejectionReason: string | null;
  reviewedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export function serializeTransferRequest(row: TransferRequestRow): TransferRequestSummary {
  return {
    id: row.id,
    planInterval: row.planInterval === "annual" ? "annual" : "monthly",
    amountCentavosMxn: row.amountCentavosMxn,
    reportedAmountCentavosMxn: row.reportedAmountCentavosMxn ?? null,
    amountMismatch: row.amountMismatch,
    referralDiscountApplied: row.referralDiscountApplied,
    referenceCode: row.referenceCode,
    originBank: row.originBank ?? null,
    receiptReference: row.receiptReference ?? null,
    payerName: row.payerName ?? null,
    transferDate: row.transferDate ?? null,
    userNote: row.userNote ?? null,
    status:
      row.status === "approved" || row.status === "rejected" || row.status === "canceled"
        ? row.status
        : "pending_review",
    rejectionReason: row.rejectionReason ?? null,
    reviewedAtIso: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    createdAtIso: new Date(row.createdAt).toISOString(),
    updatedAtIso: new Date(row.updatedAt).toISOString(),
  };
}

export interface MemberPlanSummary {
  active: boolean;
  planState: MemberPlanState;
  interval: "monthly" | "annual";
  hasCard: boolean;
  cancelAtPeriodEnd: boolean;
  accessUntilIso: string | null;
  currentPeriodEndIso: string | null;
  memberSinceIso: string | null;
  trialDaysRemaining: number;
  paidFriends: number;
  earnedDays: number;
  stripeConfigured: boolean;
  paymentMode: PaymentMode;
  accessSourceKind: string | null;
  eligibleForReferralDiscount: boolean;
  quotedMonthlyCentavos: number;
  quotedAnnualCentavos: number;
  transferBank: TransferBankSummary;
  transferHistory: TransferRequestSummary[];
  activePendingTransfer: TransferRequestSummary | null;
}

/** Consulta de solo lectura del estado del pase de un socio. Nunca escribe en la base. */
export async function loadMemberPlanSummary(
  db: Db,
  userId: string,
  now: Date = new Date(),
  stripeConfiguredOverride?: boolean,
): Promise<MemberPlanSummary> {
  const activeMode: PaymentMode =
    stripeConfiguredOverride === undefined
      ? paymentMode()
      : stripeConfiguredOverride
        ? "stripe"
        : "transfer";
  const stripeConfigured = activeMode === "stripe";
  const bankConfig = getTransferBankConfig();
  const [
    active,
    until,
    referrals,
    [sub],
    [u],
    giftedRenewal,
    monthlyQuote,
    annualQuote,
    activeGrants,
    rawTransfers,
  ] = await Promise.all([
    hasActivePaseTotal(db, userId, now),
    accessUntil(db, userId, now),
    myReferrals(db, userId),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId)),
    hasAppliedRewardGrant(db, userId),
    quoteTransferAmountCentavos(db, userId, "monthly"),
    quoteTransferAmountCentavos(db, userId, "annual"),
    db
      .select({
        id: entitlementGrants.id,
        sourceKind: entitlementGrants.sourceKind,
        daysGranted: entitlementGrants.daysGranted,
        endsAt: entitlementGrants.endsAt,
      })
      .from(entitlementGrants)
      .where(and(eq(entitlementGrants.userId, userId), isNull(entitlementGrants.revokedAt)))
      .orderBy(desc(entitlementGrants.endsAt)),
    listUserTransferRequests(db, userId, 20),
  ]);

  const transferHistory = rawTransfers.map(serializeTransferRequest);
  const activePendingTransfer =
    transferHistory.find((t) => t.status === "pending_review") ?? null;
  const nowMs = now.getTime();
  const liveGrants = activeGrants.filter((g) => new Date(g.endsAt).getTime() > nowMs);
  const topGrant = liveGrants[0] ?? null;
  const activeTransferGrant = liveGrants.find((g) => g.sourceKind === "transfer_payment") ?? null;
  const latestApprovedTransfer = transferHistory.find((t) => t.status === "approved") ?? null;

  let interval: "monthly" | "annual" =
    sub?.planInterval === "annual"
      ? "annual"
      : activeTransferGrant
        ? activeTransferGrant.daysGranted >= 365 || latestApprovedTransfer?.planInterval === "annual"
          ? "annual"
          : "monthly"
        : "monthly";
  const hasCard = Boolean(
    sub &&
      ["active", "trialing_card", "past_due_grace", "canceled"].includes(
        sub.status,
      ),
  );
  const cancelAtPeriodEnd = Boolean(
    sub && (sub.cancelAtPeriodEnd || sub.status === "canceled"),
  );

  let planState: MemberPlanState = "prueba";
  if (sub) {
    if (sub.cancelAtPeriodEnd || sub.status === "canceled") {
      planState = "sin_renovacion";
    } else if (
      sub.status === "trialing_no_card" ||
      // Si Stripe está «en prueba» solo porque se recorrió el cobro por días ganados, el socio sigue en su plan.
      (sub.status === "trialing_card" && !giftedRenewal)
    ) {
      planState = "prueba";
    } else if (sub.planInterval === "annual") {
      planState = "anual";
    } else {
      planState = "mensual";
    }
  } else if (activeTransferGrant) {
    planState = interval === "annual" ? "anual" : "mensual";
  } else if (!active) {
    planState = "sin_renovacion";
  }

  const trialDaysRemaining = until
    ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS))
    : 0;
  const paidFriends = referrals.paidFriends;

  return {
    active,
    planState,
    interval,
    hasCard,
    cancelAtPeriodEnd,
    accessUntilIso: until ? until.toISOString() : null,
    currentPeriodEndIso: sub?.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toISOString()
      : null,
    memberSinceIso: u?.createdAt ? new Date(u.createdAt).toISOString() : null,
    trialDaysRemaining,
    paidFriends,
    earnedDays: referralEarnedDays(paidFriends),
    stripeConfigured,
    paymentMode: activeMode,
    accessSourceKind: sub ? "subscription" : topGrant?.sourceKind ?? null,
    eligibleForReferralDiscount: monthlyQuote.referralDiscountApplied,
    quotedMonthlyCentavos: monthlyQuote.amountCentavosMxn,
    quotedAnnualCentavos: annualQuote.amountCentavosMxn,
    transferBank: {
      ...bankConfig,
      supportEmail: supportEmail(),
    },
    transferHistory,
    activePendingTransfer,
  };
}
