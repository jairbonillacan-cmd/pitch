import React from "react";
import { OnboardingSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge.js";
import { loadPublicPlatformState } from "../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
    >
      <OnboardingSurfaceV4 />
    </PlatformClientBridge>
  );
}
