import React from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CLUB_PROFILE_HANDLE_HEADER } from "../../src/profile-path";
import { ClubShellBridge } from "../../src/client/club-shell-bridge";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { loadClubPlatformState } from "../../src/server/platform-data";
import { getViewerAccess } from "../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export default async function ClubAppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  // La cookie de sesión existía pero ya no es válida (vencida o cerrada en otro equipo).
  if (access.via === "none") redirect("/login?next=/app");
  // Cuenta nueva sin fecha de nacimiento ni términos: primero el paso 2.
  if (access.via === "account" && !access.signupComplete) redirect("/signup?paso=2&via=cuenta");

  const requestedProfile = (await headers()).get(CLUB_PROFILE_HANDLE_HEADER);
  if (requestedProfile) {
    // Resolve a missing profile before loading.tsx can commit a streamed 200 response.
    const { clubHandleFromHeader, loadClubProfile } = await import("../../src/server/club-profile");
    const handle = clubHandleFromHeader(requestedProfile);
    if (!handle || !(await loadClubProfile(handle, access.via === "beta"))) notFound();
  }

  const state = await loadClubPlatformState("member");

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      {/* Encabezado y barra lateral montados una sola vez; cada página aporta su contenido. */}
      <ClubShellBridge>{children}</ClubShellBridge>
    </PlatformClientBridge>
  );
}
