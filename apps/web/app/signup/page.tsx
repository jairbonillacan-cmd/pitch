import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authPageRedirect } from "../../src/server/auth-page";
import { SignupPreviewPanel, SignupSurfaceV4 } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../src/client/platform-client-bridge";
import { sanitizeNextPath } from "../../src/server/beta-auth";
import { loadPublicPlatformState } from "../../src/server/platform-data";
import { loadLoginPreviewData } from "../../src/server/public-site-data";
import { getViewerAccess } from "../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crea tu cuenta · PitchLab",
  description: "7 días gratis, sin tarjeta. Al terminar decides si sigues.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; ref?: string; paso?: string; via?: string; next?: string }>;
}): Promise<React.JSX.Element> {
  const { code, ref, paso, via, next } = await searchParams;
  const access = await getViewerAccess();
  const destination = authPageRedirect("signup", paso, next, access);
  if (destination) redirect(destination);
  const nextPath = sanitizeNextPath(next);
  const initialPromoCode = (code ?? ref ?? "").trim().toUpperCase();
  const returningProvider =
    via === "google" ? "Google" : via === "apple" ? "Apple" : null;

  const [state, previewData] = await Promise.all([
    loadPublicPlatformState(),
    loadLoginPreviewData(),
  ]);
  // Con sesión (Google o al volver desde /app): nombre y usuario ya escritos.
  const profile = access.via === "account" ? access.profile : null;

  const previewSlot = previewData.primaryCard ? (
    <SignupPreviewPanel card={previewData.primaryCard} />
  ) : null;

  const allowStep2 = state.accountsEnabled
    ? access.via === "account"
    : Boolean(returningProvider || via === "cuenta" || profile);

  return (
    <PlatformClientBridge
      dataset={{ ...state.dataset, leagues: [], games: [] }}
      initialRole={state.initialRole}
      allowRoleSimulation={state.allowRoleSimulation}
      accountsEnabled={state.accountsEnabled}
      serverMonth1NoCardMode={state.serverMonth1NoCardMode}
      viewerIdentity={state.viewerIdentity}
    >
      <SignupSurfaceV4
        initialPromoCode={initialPromoCode}
        nextPath={nextPath}
        previewSlot={previewSlot}
        initialStep={
          paso === "confirmado" ? "confirmed" :
          paso === "vencido" ? "expired" :
          paso === "2" && allowStep2 ? "details" : "method"
        }
        returningProvider={returningProvider}
        initialDisplayName={profile?.displayName ?? ""}
        initialHandle={profile?.handle ?? profile?.suggestedHandle ?? ""}
      />
    </PlatformClientBridge>
  );
}
