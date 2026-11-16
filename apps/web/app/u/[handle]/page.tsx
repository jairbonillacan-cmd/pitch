import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import { PublicAnalystProfileSurface } from "@pitchlab/ui/public-profile";
import { PlatformClientBridge } from "../../../src/client/platform-client-bridge";
import { paymentMode } from "../../../src/server/billing/payment-mode";
import {
  accountsEnabled,
  loadMonth1Flag,
  loadViewerIdentity,
  previewToolsEnabled,
} from "../../../src/server/platform-data";
import { loadPublicShareProfile } from "../../../src/server/public-profile";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const data = await loadPublicShareProfile(handle);
  if (!data) {
    return {
      title: "Perfil no disponible · PitchLab",
      robots: { index: false, follow: false },
    };
  }

  const { profile, publicRecord } = data;
  const roleLabel = profile.isTipster ? "Tipster Oficial" : "Socio PitchLab";
  let statsSummary = "Récord verificado en unidades en PitchLab.";
  if (publicRecord && !publicRecord.hidden && publicRecord.settled > 0) {
    const parts: string[] = [];
    if (publicRecord.view.hitRatePct !== null) {
      parts.push(`${publicRecord.view.hitRatePct.toFixed(1)} % acierto`);
    }
    if (publicRecord.view.yieldPct !== null) {
      const sign = publicRecord.view.yieldPct > 0 ? "+" : "";
      parts.push(`${sign}${publicRecord.view.yieldPct.toFixed(1)} % rendimiento`);
    }
    if (publicRecord.view.avgClvPct !== null) {
      const sign = publicRecord.view.avgClvPct > 0 ? "+" : "";
      parts.push(`${sign}${publicRecord.view.avgClvPct.toFixed(1)} % ventaja`);
    }
    if (parts.length > 0) {
      statsSummary = `${parts.join(" · ")} (${publicRecord.settled} cerrados).`;
    }
  }

  const title = `${profile.displayName} (@${profile.handle}) · ${roleLabel} · PitchLab`;
  const description = profile.bio
    ? `${profile.bio} — ${statsSummary}`
    : `${roleLabel} en PitchLab. ${statsSummary}`;
  const ogUrl = `/u/${profile.handle}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `/u/${profile.handle}`,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function PublicShareProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<React.JSX.Element> {
  const [{ handle }, access] = await Promise.all([params, getViewerAccess()]);
  const data = await loadPublicShareProfile(handle);
  if (!data) {
    notFound();
  }

  const [serverMonth1NoCardMode, viewerIdentity] = await Promise.all([
    loadMonth1Flag(),
    loadViewerIdentity(),
  ]);
  const initialRole = access.fullAccess
    ? access.isAdmin
      ? "admin"
      : access.isTipster
        ? "tipster"
        : "member"
    : "visitor";

  return (
    <PlatformClientBridge
      dataset={buildPlatformDataset([])}
      initialRole={initialRole}
      allowRoleSimulation={access.fullAccess && previewToolsEnabled(access.isAdmin)}
      accountsEnabled={accountsEnabled()}
      viewerVia={access.via}
      paymentMode={paymentMode()}
      serverMonth1NoCardMode={serverMonth1NoCardMode}
      viewerIdentity={viewerIdentity}
    >
      <PublicAnalystProfileSurface
        profile={data.profile}
        publicRecord={data.publicRecord}
        badges={data.badges}
        hasSession={access.fullAccess}
      />
    </PlatformClientBridge>
  );
}
