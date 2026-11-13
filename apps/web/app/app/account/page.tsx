import React from "react";
import { headers } from "next/headers";
import { createDb, eq, myReferrals, tipsterProfiles, users, type Db } from "@pitchlab/db";
import {
  AccountReferralsClubView,
  type AccountTabKey,
  type MeReferralsPayload,
} from "@pitchlab/ui/account";
import { getAuth } from "../../../src/server/auth";
import { profileIdForAuthUser } from "../../../src/server/member-data";
import { loadMemberPlanSummary, type MemberPlanSummary } from "../../../src/server/member-plan";

function parseAccountTab(value: unknown): AccountTabKey {
  return value === "plan" || value === "prefs" || value === "cfdi"
    ? value
    : "referrals";
}

let cachedDb: Db | null = null;

async function loadInitialAccountSnapshots(): Promise<{
  referrals: MeReferralsPayload | null;
  plan: MemberPlanSummary | null;
}> {
  const url = process.env.DATABASE_URL;
  const auth = getAuth();
  if (!url || !auth) {
    return { referrals: null, plan: null };
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return { referrals: null, plan: null };
    }
    cachedDb ??= createDb(url) as unknown as Db;
    const userId = await profileIdForAuthUser(cachedDb, session.user.id);
    if (!userId) {
      return { referrals: null, plan: null };
    }
    const [referrals, [u], [tipster], plan] = await Promise.all([
      myReferrals(cachedDb, userId),
      cachedDb
        .select({
          handle: users.handle,
          displayName: users.displayName,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId)),
      cachedDb
        .select({ userId: tipsterProfiles.userId })
        .from(tipsterProfiles)
        .where(eq(tipsterProfiles.userId, userId)),
      loadMemberPlanSummary(cachedDb, userId),
    ]);
    return {
      referrals: {
        ...referrals,
        handle: u?.handle ?? null,
        displayName: u?.displayName ?? null,
        email: u?.email ?? null,
        isTipster: Boolean(tipster),
      },
      plan,
    };
  } catch (err) {
    void err;
    return { referrals: null, plan: null };
  }
}

export default async function ClubAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[]; pago?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawTab = Array.isArray(resolvedParams?.tab)
    ? resolvedParams.tab[0]
    : resolvedParams?.tab;
  const rawPago = Array.isArray(resolvedParams?.pago)
    ? resolvedParams.pago[0]
    : resolvedParams?.pago;
  const initialTab = parseAccountTab(rawTab);
  const checkoutNotice =
    rawPago === "ok" ? "success" : rawPago === "cancelado" ? "cancelled" : null;
  const { referrals, plan } = await loadInitialAccountSnapshots();

  return (
    <AccountReferralsClubView
      initialTab={initialTab}
      initialServerReferrals={referrals}
      initialServerPlan={plan}
      checkoutNotice={checkoutNotice}
    />
  );
}
