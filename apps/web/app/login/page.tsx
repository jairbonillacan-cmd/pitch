import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authPageRedirect } from "../../src/server/auth-page";
import { getViewerAccess } from "../../src/server/viewer-access";
import { AuthSurfaceV4, LoginPreviewPanel } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { sanitizeNextPath } from "../../src/server/beta-auth";
import { loadPublicPlatformState } from "../../src/server/platform-data";
import { loadLoginPreviewData } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entra a PitchLab",
  description: "Lo más probable de cada partido, con su momio justo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    paso?: string;
    ref?: string;
    invite?: string;
    code?: string;
  }>;
}): Promise<React.JSX.Element> {
  const { next, ref, invite, code, paso } = await searchParams;
  const destination = authPageRedirect("login", paso, next, await getViewerAccess());
  if (destination) redirect(destination);
  const nextPath = sanitizeNextPath(next);
  const initialPromoCode = (ref ?? invite ?? code ?? "").trim();

  const [state, previewData] = await Promise.all([
    loadPublicPlatformState(),
    loadLoginPreviewData(),
  ]);

  const previewSlot = previewData.primaryCard ? (
    <LoginPreviewPanel
      primaryCard={previewData.primaryCard}
      secondaryCard={previewData.secondaryCard}
    />
  ) : null;

  return (
    <PlatformClientBridge
      dataset={{
        ...state.dataset,
        leagues: [],
        games: [],
      }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <AuthSurfaceV4
        mode="login"
        loginStep={paso === "confirmado" ? "confirmed" : paso === "vencido" ? "expired" : undefined}
        nextPath={nextPath}
        initialPromoCode={initialPromoCode}
        previewSlot={previewSlot}
      />
    </PlatformClientBridge>
  );
}
