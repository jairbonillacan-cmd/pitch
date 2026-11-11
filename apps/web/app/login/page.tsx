import React from "react";
import type { Metadata } from "next";
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
    ref?: string;
    invite?: string;
    code?: string;
  }>;
}): Promise<React.JSX.Element> {
  const { next, ref, invite, code } = await searchParams;
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
    >
      <AuthSurfaceV4
        mode="login"
        nextPath={nextPath}
        initialPromoCode={initialPromoCode}
        previewSlot={previewSlot}
      />
    </PlatformClientBridge>
  );
}
