import React from "react";
import { notFound } from "next/navigation";
import { FounderAdminClubView } from "@pitchlab/ui";
import { previewToolsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export default async function ClubAdminPage(): Promise<React.JSX.Element> {
  if (!previewToolsEnabled()) {
    const access = await getViewerAccess();
    if (!access.isAdmin) {
      notFound();
    }
  }
  return <FounderAdminClubView />;
}
