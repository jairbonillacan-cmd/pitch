import React from "react";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge.js";
import { loadClubPlatformState } from "../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function ClubAppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const state = await loadClubPlatformState("member");

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
    >
      {children}
    </PlatformClientBridge>
  );
}
