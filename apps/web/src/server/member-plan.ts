import {
  accessUntil,
  eq,
  hasActivePaseTotal,
  myReferrals,
  subscriptions,
  users,
  type Db,
} from "@pitchlab/db";
import { referralEarnedDays } from "@pitchlab/ui";

const DAY_MS = 86_400_000;

export type MemberPlanState = "prueba" | "mensual" | "anual" | "sin_renovacion";

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
}

/** Consulta de solo lectura del estado del pase de un socio. Nunca escribe en la base. */
export async function loadMemberPlanSummary(
  db: Db,
  userId: string,
  now: Date = new Date(),
  stripeConfigured: boolean = Boolean(process.env.STRIPE_SECRET_KEY),
): Promise<MemberPlanSummary> {
  const [active, until, referrals, [sub], [u]] = await Promise.all([
    hasActivePaseTotal(db, userId, now),
    accessUntil(db, userId, now),
    myReferrals(db, userId),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId)),
  ]);

  const interval: "monthly" | "annual" =
    sub?.planInterval === "annual" ? "annual" : "monthly";
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
      sub.status === "trialing_card"
    ) {
      planState = "prueba";
    } else if (sub.planInterval === "annual") {
      planState = "anual";
    } else {
      planState = "mensual";
    }
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
  };
}
