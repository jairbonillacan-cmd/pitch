import React from "react";
import { LandingSurface } from "@pitchlab/ui";
import { PlatformClientBridge } from "../src/client/platform-client-bridge.js";
import { loadPublicPlatformState } from "../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<React.JSX.Element> {
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
    >
      <LandingSurface />
    </PlatformClientBridge>
  );
}
