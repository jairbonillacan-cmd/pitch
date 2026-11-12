import React from "react";
import type { Metadata } from "next";
import { normalizeReferralCode, ReferralInviteSurface } from "@pitchlab/ui";
import {
  buildInviteShareMetadata,
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
  const handle = code
    ? resolveOgDisplayHandle({
        code,
        dbHandle: null,
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

  return (
    <ReferralInviteSurface
      sku={typeof params.sku === "string" ? params.sku : undefined}
      interval={typeof params.interval === "string" ? params.interval : undefined}
      code={typeof params.code === "string" ? params.code : undefined}
      senderHandle={typeof params.from === "string" ? params.from : undefined}
      accountsEnabled={accountsEnabled}
    />
  );
}
