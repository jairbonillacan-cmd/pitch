import React from "react";
import type { Metadata } from "next";
import { SignupPreviewPanel, SignupSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadPublicPlatformState } from "../../src/server/platform-data";
import { loadLoginPreviewData } from "../../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crea tu cuenta · PitchLab",
  description: "7 días gratis, sin tarjeta. Al terminar decides si sigues.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; ref?: string; paso?: string; via?: string }>;
}): Promise<React.JSX.Element> {
  const { code, ref, paso, via } = await searchParams;
  const initialPromoCode = (code ?? ref ?? "").trim().toUpperCase();
  const returningProvider =
    via === "google" ? "Google" : via === "apple" ? "Apple" : null;

  const [state, previewData] = await Promise.all([
    loadPublicPlatformState(),
    loadLoginPreviewData(),
  ]);

  const previewSlot = previewData.primaryCard ? (
    <SignupPreviewPanel card={previewData.primaryCard} />
  ) : null;

  return (
    <PlatformClientBridge
      dataset={{ ...state.dataset, leagues: [], games: [] }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
    >
      <SignupSurfaceV4
        initialPromoCode={initialPromoCode}
        previewSlot={previewSlot}
        initialStep={paso === "2" && returningProvider ? "details" : "method"}
        returningProvider={returningProvider}
      />
    </PlatformClientBridge>
  );
}
