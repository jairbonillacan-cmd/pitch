import React from "react";
import { TechPrecisionSurface } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge.js";
import { loadPublicPlatformState } from "../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function TecnologiaPage(): Promise<React.JSX.Element> {
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
    >
      <TechPrecisionSurface />
    </PlatformClientBridge>
  );
}
