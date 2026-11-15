import React from "react";
import { notFound } from "next/navigation";
import { FounderAdminClubView } from "@pitchlab/ui/admin";
import { loadServerDataHealthReport } from "../../../src/server/data-health";
import { accountsEnabled, previewToolsEnabled } from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export default async function ClubAdminPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  // Mismo criterio que /api/admin/data-health: administrador verificado o herramientas de preview.
  const adminToolsAllowed = access.isAdmin || previewToolsEnabled(access.isAdmin);
  // Sin cuentas, el PIN beta con PITCHLAB_PREVIEW_TOOLS=1 abre la consola como demo local del
  // cobro SPEI, pero sin «Salud de datos»: ese panel sigue reservado al resguardo de arriba.
  const betaPreviewAdminAllowed =
    !accountsEnabled() && access.via === "beta" && process.env.PITCHLAB_PREVIEW_TOOLS === "1";
  if (!adminToolsAllowed && !betaPreviewAdminAllowed) {
    notFound();
  }
  if (!adminToolsAllowed) {
    return <FounderAdminClubView showDataHealth={false} />;
  }
  const initialDataHealth = loadServerDataHealthReport();
  return <FounderAdminClubView initialDataHealth={initialDataHealth} />;
}
