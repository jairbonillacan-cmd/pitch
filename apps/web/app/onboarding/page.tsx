import React from "react";
import type { Metadata } from "next";
import { OnboardingSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadPublicPlatformState } from "../../src/server/platform-data";
import { hasPublicSessionCookie } from "../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configura tu perfil · PitchLab",
  description:
    "Elige tus ligas prioritarias, perfil de riesgo y formato de momios en PitchLab.",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const [state, hasSession] = await Promise.all([
    loadPublicPlatformState(),
    hasPublicSessionCookie(),
  ]);

  return (
    <PlatformClientBridge
      dataset={{ ...state.dataset, leagues: [], games: [] }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      viewerVia={state.viewerVia}
      paymentMode={state.paymentMode}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <OnboardingSurfaceV4 hasSession={hasSession} />
    </PlatformClientBridge>
  );
}
