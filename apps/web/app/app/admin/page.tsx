import React from "react";
import { notFound } from "next/navigation";
import { FounderAdminClubView } from "@pitchlab/ui/admin";
import { loadServerDataHealthReport } from "../../../src/server/data-health";
import { previewToolsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

/**
 * Consola del fundador: solo administradores verificados. En desarrollo
 * (`NODE_ENV !== "production"`) `previewToolsEnabled` la abre para revisar la UI;
 * en producción un socio que entró con el PIN beta recibe 404 aunque
 * `PITCHLAB_PREVIEW_TOOLS=1` (decisión del fundador, 2026-11-14).
 */
export default async function ClubAdminPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  if (!access.isAdmin && !previewToolsEnabled(access.isAdmin)) {
    notFound();
  }
  const initialDataHealth = loadServerDataHealthReport();
  return <FounderAdminClubView initialDataHealth={initialDataHealth} />;
}
