import "../shell-ergonomics.css";
import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import {
  CLUB_PROFILE_HANDLE_HEADER,
  CLUB_REQUEST_PATH_HEADER,
} from "../../src/profile-path";
import { canonicalGameHref, resolveGameBySlugOrId } from "@pitchlab/contracts";
import { ExpiredPassGate } from "@pitchlab/ui/expired-pass";
import { ClubShellBridge } from "../../src/client/club-shell-bridge";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { sanitizeNextPath } from "../../src/server/beta-auth";
import { resolveClubRoute } from "../../src/server/club-route-guard";
import {
  loadClubShellViewerState,
  shouldDeferLayoutDataset,
} from "../../src/server/club-shell-viewer";
import { loadClubPlatformState, loadMonth1Flag } from "../../src/server/platform-data";
import {
  playerExistsInSnapshots,
  teamExistsInSnapshots,
} from "../../src/server/team-profile";
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
  const [reqHeaders, access, serverMonth1NoCardMode] = await Promise.all([
    headers(),
    getViewerAccess(),
    loadMonth1Flag(),
  ]);
  const rawClubPath = reqHeaders.get(CLUB_REQUEST_PATH_HEADER) ?? "/app";
  const safeNext = sanitizeNextPath(rawClubPath);

  if (access.via === "none") {
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }
  if (access.via === "account" && !access.signupComplete) {
    redirect(`/signup?paso=2&via=cuenta&next=${encodeURIComponent(safeNext)}`);
  }

  const envelopeMemo = new Map<
    ProductLeague,
    ReturnType<typeof loadLeagueSnapshotEnvelope>
  >();
  const getEnvelope = (league: ProductLeague) => {
    const cached = envelopeMemo.get(league);
    if (cached) return cached;
    const loaded = loadLeagueSnapshotEnvelope(league);
    envelopeMemo.set(league, loaded);
    return loaded;
  };

  const routeCheck = resolveClubRoute(rawClubPath, {
    isLeague: isProductLeague,
    gameExists: (league, gameSlugOrId) => {
      if (!isProductLeague(league)) return false;
      const env = getEnvelope(league);
      return env.data ? resolveGameBySlugOrId(env.data.games, gameSlugOrId) !== null : false;
    },
    canonicalGameHrefFor: (league, gameSlugOrId) => {
      if (!isProductLeague(league)) return null;
      const env = getEnvelope(league);
      const found = env.data ? resolveGameBySlugOrId(env.data.games, gameSlugOrId) : null;
      return found ? canonicalGameHref(league, found) : null;
    },
    teamExists: teamExistsInSnapshots,
    playerExists: playerExistsInSnapshots,
  });
  if (routeCheck.kind === "permanent_redirect") {
    permanentRedirect(routeCheck.to);
  }
  if (routeCheck.kind === "redirect") {
    redirect(routeCheck.to);
  }
  if (routeCheck.kind === "not_found") {
    notFound();
  }

  const requestedProfile = reqHeaders.get(CLUB_PROFILE_HANDLE_HEADER);
  if (requestedProfile) {
    const { clubHandleFromHeader, loadClubProfile } = await import(
      "../../src/server/club-profile"
    );
    const handle = clubHandleFromHeader(requestedProfile);
    if (!handle || !(await loadClubProfile(handle, access.via === "beta"))) notFound();
  }

  const resolvedPath = routeCheck.kind === "ok" ? routeCheck.pathname : safeNext;
  const state = shouldDeferLayoutDataset(resolvedPath)
    ? await loadClubShellViewerState("member", {
        access,
        serverMonth1NoCardMode,
      })
    : await loadClubPlatformState("member", {
        access,
        serverMonth1NoCardMode,
      });
  const passExpired =
    access.via === "account" &&
    !access.fullAccess &&
    !access.isAdmin;
  const showExpiredPassGate =
    passExpired &&
    !isAllowedRecoveryRoute(safeNext);

  return (
    <PlatformClientBridge
      dataset={state.dataset}
      deferredShellExtend
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      viewerVia={state.viewerVia}
      paymentMode={state.paymentMode}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      {showExpiredPassGate ? (
        <ExpiredPassGate
          memberHandle={state.viewerIdentity?.handle ?? null}
          paymentMode={state.paymentMode}
        />
      ) : (
        <ClubShellBridge
          expiredPassGate={
            passExpired
              ? {
                  memberHandle: state.viewerIdentity?.handle ?? null,
                  paymentMode: state.paymentMode,
                }
              : null
          }
        >
          {children}
        </ClubShellBridge>
      )}
    </PlatformClientBridge>
  );
}
