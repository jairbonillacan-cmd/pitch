import React from "react";
import { OnboardingSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadPublicPlatformState } from "../../src/server/platform-data";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={{ ...state.dataset, leagues: [], games: [] }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <OnboardingSurfaceV4 />
    </PlatformClientBridge>
  );
}
