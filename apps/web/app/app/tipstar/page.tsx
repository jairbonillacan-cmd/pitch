import React from "react";
import { TipstarPortalClubView } from "@pitchlab/ui";

export default async function ClubTipstarPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const resolved = searchParams ? await searchParams : undefined;
  const rawConnect = Array.isArray(resolved?.connect) ? resolved.connect[0] : resolved?.connect;
  const connectNotice =
    rawConnect === "listo" ? "ready" : rawConnect === "reintentar" ? "retry" : null;
  return <TipstarPortalClubView connectNotice={connectNotice} />;
}
