import React from "react";
import { PublicTipstarPickSurface } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../../src/client/platform-client-bridge.js";
import { loadPublicPlatformState } from "../../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function PublicTipstarPickPage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}): Promise<React.JSX.Element> {
  const { pickId } = await params;
  const state = await loadPublicPlatformState(pickId);

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
    >
      <PublicTipstarPickSurface pickSlug={pickId} />
    </PlatformClientBridge>
  );
}
