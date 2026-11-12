import React from "react";
import { redirect } from "next/navigation";
import { TipstarPortalClubView } from "@pitchlab/ui";
import { accountsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export default async function ClubTipstarPage(): Promise<React.JSX.Element> {
  if (accountsEnabled()) {
    const access = await getViewerAccess();
    if (!access.isTipstar && !access.isAdmin) {
      redirect("/app");
    }
  }
  return <TipstarPortalClubView />;
}
