import React from "react";
import { AuthSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge.js";
import { sanitizeNextPath } from "../../src/server/beta-auth.js";
import { loadPublicPlatformState } from "../../src/server/platform-data.js";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<React.JSX.Element> {
  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  const state = await loadPublicPlatformState();

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.hasActiveSession}
    >
      <AuthSurfaceV4 mode="login" nextPath={nextPath} />
    </PlatformClientBridge>
  );
}
