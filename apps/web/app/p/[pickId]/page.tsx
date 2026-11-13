import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeReferralCode, PublicTipsterPickSurface, TIPSTER_CREATORS } from "@pitchlab/ui";
import { PlatformClientBridge } from "../../../src/client/platform-client-bridge";
import { buildServerRawPlatformDataset, loadPublicPlatformState } from "../../../src/server/platform-data";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

function isKnownPublicPickSlug(pickId: string): boolean {
  if (TIPSTER_CREATORS.some((c) => c.weeklyPickSlug === pickId)) return true;
  const raw = buildServerRawPlatformDataset();
  return raw.games.some((g) => g.picks.some((p) => p.id === pickId || p.tipsterSlug === pickId));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pickId: string }>;
}): Promise<Metadata> {
  const { pickId } = await params;
  const creator = TIPSTER_CREATORS.find((c) => c.weeklyPickSlug === pickId);
  return {
    title: creator
      ? `Pick semanal de @${creator.handle} · PitchLab`
      : "Boleto compartido · PitchLab",
    description:
      "Probabilidad estimada y momio justo antes del partido. 7 días gratis sin tarjeta en PitchLab.",
    robots: { index: false, follow: true },
  };
}

export default async function PublicTipsterPickPage({
  params,
  searchParams,
}: {
  params: Promise<{ pickId: string }>;
  searchParams?: Promise<{ code?: string | string[] }>;
}): Promise<React.JSX.Element> {
  const { pickId } = await params;
  if (!isKnownPublicPickSlug(pickId)) {
    notFound();
  }
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const rawCode = Array.isArray(resolvedSearch?.code)
    ? resolvedSearch.code[0]
    : resolvedSearch?.code;
  const inviteCode = rawCode ? normalizeReferralCode(rawCode) ?? undefined : undefined;
  const [state, hasSession] = await Promise.all([
    loadPublicPlatformState(pickId),
    hasPublicSessionCookie(),
  ]);
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
      <PublicTipsterPickSurface
        pickSlug={pickId}
        inviteCode={inviteCode}
        hasSession={hasSession}
      />
    </PlatformClientBridge>
  );
}
