import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { normalizeReferralCode, ReferralInviteSurface } from "@pitchlab/ui";
import {
  buildInviteShareMetadata,
  lookupReferrerHandleForInvite,
  resolveOgDisplayHandle,
} from "../../../src/server/short-invite";

export const dynamic = "force-dynamic";

export interface ReferralPageSearchParams {
  sku?: string;
  interval?: string;
  code?: string;
  from?: string;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ReferralPageSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const accountsEnabled = Boolean(process.env.DATABASE_URL);
  const code =
    typeof params.code === "string" ? normalizeReferralCode(params.code) : null;
  const dbHandle =
    code && accountsEnabled ? await lookupReferrerHandleForInvite(code) : null;
  const handle = code
    ? resolveOgDisplayHandle({
        code,
        dbHandle,
        explicitFrom: typeof params.from === "string" ? params.from : null,
        accountsEnabled,
      })
    : null;
  return buildInviteShareMetadata({ code, handle });
}

export default async function ReferralPricingPage({
  searchParams,
}: {
  searchParams: Promise<ReferralPageSearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const accountsEnabled = Boolean(process.env.DATABASE_URL);
  const rawCode = typeof params.code === "string" ? params.code : undefined;
  const normalizedCode = normalizeReferralCode(rawCode);

  if (accountsEnabled && !normalizedCode) {
    redirect("/precio");
  }

  const verifiedHandle =
    accountsEnabled && normalizedCode
      ? await lookupReferrerHandleForInvite(normalizedCode)
      : typeof params.from === "string"
        ? params.from
        : undefined;

  return (
    <ReferralInviteSurface
      sku={typeof params.sku === "string" ? params.sku : undefined}
      interval={typeof params.interval === "string" ? params.interval : undefined}
      code={rawCode}
      senderHandle={verifiedHandle ?? undefined}
      accountsEnabled={accountsEnabled}
    />
  );
}
