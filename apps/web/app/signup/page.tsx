import React from "react";
import { AuthSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge.js";
import { loadPublicPlatformState } from "../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}): Promise<React.JSX.Element> {
  const { code } = await searchParams;
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
    >
      <AuthSurfaceV4
        mode="signup"
        initialPromoCode={typeof code === "string" ? code.trim().toUpperCase() : ""}
      />
    </PlatformClientBridge>
  );
}
