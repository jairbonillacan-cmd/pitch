import React from "react";
import { notFound } from "next/navigation";
import { PublicTipstarPickSurface } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../../src/client/platform-client-bridge";
import { loadPublicPlatformState } from "../../../src/server/platform-data";

export const dynamic = "force-dynamic";

export default async function PublicTipstarPickPage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}): Promise<React.JSX.Element> {
  const { pickId } = await params;
  const state = await loadPublicPlatformState(pickId);
  if (!state.publicPickResolved) {
    notFound();
  }

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <PublicTipstarPickSurface pickSlug={pickId} />
    </PlatformClientBridge>
  );
}
