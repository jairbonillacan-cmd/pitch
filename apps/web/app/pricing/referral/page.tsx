import React from "react";
import { ReferralInviteSurface } from "@pitchlab/ui";

export const dynamic = "force-dynamic";

export interface ReferralPageSearchParams {
  sku?: string;
  interval?: string;
  code?: string;
  from?: string;
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
