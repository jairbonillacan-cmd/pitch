import React from "react";
import { notFound } from "next/navigation";
import { FounderAdminClubView } from "@pitchlab/ui/admin";
import { loadServerDataHealthReport } from "../../../src/server/data-health";
import { accountsEnabled, previewToolsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export default async function ClubAdminPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  const betaPreviewAdminAllowed =
    !accountsEnabled() && access.via === "beta" && process.env.PITCHLAB_PREVIEW_TOOLS === "1";
  if (!access.isAdmin && !previewToolsEnabled(access.isAdmin) && !betaPreviewAdminAllowed) {
    notFound();
  }
  const initialDataHealth = loadServerDataHealthReport();
  return <FounderAdminClubView initialDataHealth={initialDataHealth} />;
}
