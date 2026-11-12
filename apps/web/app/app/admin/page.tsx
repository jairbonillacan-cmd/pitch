import React from "react";
import { redirect } from "next/navigation";
import { FounderAdminClubView } from "@pitchlab/ui";
import { accountsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export default async function ClubAdminPage(): Promise<React.JSX.Element> {
  if (accountsEnabled()) {
    const access = await getViewerAccess();
    if (!access.isAdmin) {
      redirect("/app");
    }
  }
  return <FounderAdminClubView />;
}
