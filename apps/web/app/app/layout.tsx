import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  CLUB_PROFILE_HANDLE_HEADER,
  CLUB_REQUEST_PATH_HEADER,
} from "../../src/profile-path";
import { ExpiredPassGate } from "@pitchlab/ui/expired-pass";
import { ClubShellBridge } from "../../src/client/club-shell-bridge";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { sanitizeNextPath } from "../../src/server/beta-auth";
import { resolveClubRoute } from "../../src/server/club-route-guard";
import { loadClubPlatformState } from "../../src/server/platform-data";
import {
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../src/server/snapshots";
import { getViewerAccess } from "../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

function isAllowedRecoveryRoute(rawPath: string): boolean {
  const pathOnly = (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  return (
    pathOnly === "/app/account" ||
    pathOnly.startsWith("/app/account/") ||
    pathOnly === "/app/canjear" ||
    pathOnly.startsWith("/app/canjear/")
  );
}

export default async function ClubAppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const reqHeaders = await headers();
  const rawClubPath = reqHeaders.get(CLUB_REQUEST_PATH_HEADER) ?? "/app";
  const safeNext = sanitizeNextPath(rawClubPath);

  const access = await getViewerAccess();
  // La cookie de sesión existía pero ya no es válida (vencida o cerrada en otro equipo).
  if (access.via === "none") {
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }
  // Cuenta nueva sin fecha de nacimiento ni términos: primero el paso 2.
  if (access.via === "account" && !access.signupComplete) {
    redirect(`/signup?paso=2&via=cuenta&next=${encodeURIComponent(safeNext)}`);
  }

  // Resolver alias y rutas inexistentes antes de que `loading.tsx` confirme un HTTP 200.
  const routeCheck = resolveClubRoute(rawClubPath, {
    isLeague: isProductLeague,
    gameExists: (league, gameId) => {
      if (!isProductLeague(league)) return false;
      const env = loadLeagueSnapshotEnvelope(league);
      return env.data?.games.some((g) => g.id === gameId) ?? false;
    },
  });
  if (routeCheck.kind === "redirect") {
    redirect(routeCheck.to);
  }
  if (routeCheck.kind === "not_found") {
    notFound();
  }

  const requestedProfile = reqHeaders.get(CLUB_PROFILE_HANDLE_HEADER);
  if (requestedProfile) {
    // Resolve a missing profile before loading.tsx can commit a streamed 200 response.
    const { clubHandleFromHeader, loadClubProfile } = await import(
      "../../src/server/club-profile"
    );
    const handle = clubHandleFromHeader(requestedProfile);
    if (!handle || !(await loadClubProfile(handle, access.via === "beta"))) notFound();
  }

  const state = await loadClubPlatformState("member");
  const showExpiredPassGate =
    access.via === "account" &&
    !access.fullAccess &&
    !access.isAdmin &&
    !isAllowedRecoveryRoute(safeNext);

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      viewerVia={state.viewerVia}
      paymentMode={state.paymentMode}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      {/* Encabezado y barra lateral montados una sola vez; cada página aporta su contenido. */}
      {showExpiredPassGate ? (
        <ExpiredPassGate
          memberHandle={state.viewerIdentity?.handle ?? null}
          paymentMode={state.paymentMode}
        />
      ) : (
        <ClubShellBridge>{children}</ClubShellBridge>
      )}
    </PlatformClientBridge>
  );
}
