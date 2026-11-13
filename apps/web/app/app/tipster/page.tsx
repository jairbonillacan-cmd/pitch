import React from "react";
import { redirect } from "next/navigation";
import { TipsterPortalClubView } from "@pitchlab/ui";
import { accountsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export default async function ClubTipsterPage({
  searchParams,
}: {
  searchParams?: Promise<{ connect?: string | string[] }>;
}): Promise<React.JSX.Element> {
  if (accountsEnabled()) {
    const access = await getViewerAccess();
    if (!access.isTipster && !access.isAdmin) {
      redirect("/app");
    }
  }
  const resolved = searchParams ? await searchParams : undefined;
  const rawConnect = Array.isArray(resolved?.connect) ? resolved.connect[0] : resolved?.connect;
  const connectNotice =
    rawConnect === "listo" ? "ready" : rawConnect === "reintentar" ? "retry" : null;
  return <TipsterPortalClubView connectNotice={connectNotice} />;
}
