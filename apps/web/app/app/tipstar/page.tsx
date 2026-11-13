import React from "react";
import { redirect } from "next/navigation";
import { TipstarPortalClubView } from "@pitchlab/ui";
import { accountsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export default async function ClubTipstarPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string | string[] }>;
}): Promise<React.JSX.Element> {
  if (accountsEnabled()) {
    const access = await getViewerAccess();
    if (!access.isTipstar && !access.isAdmin) {
      redirect("/app");
    }
  }
  const resolved = searchParams ? await searchParams : undefined;
  const rawConnect = Array.isArray(resolved?.connect) ? resolved.connect[0] : resolved?.connect;
  const connectNotice =
    rawConnect === "listo" ? "ready" : rawConnect === "reintentar" ? "retry" : null;
  return <TipstarPortalClubView connectNotice={connectNotice} />;
}
