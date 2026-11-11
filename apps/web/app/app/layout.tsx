import React from "react";
import { ClubShellBridge } from "../../src/client/club-shell-bridge";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadClubPlatformState } from "../../src/server/platform-data";

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
      {/* Encabezado y barra lateral montados una sola vez; cada página aporta su contenido. */}
      <ClubShellBridge>{children}</ClubShellBridge>
    </PlatformClientBridge>
  );
}
