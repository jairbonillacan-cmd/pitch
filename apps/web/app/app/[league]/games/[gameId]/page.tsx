import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { MatchStudioClubView, PlatformGamesSupplement } from "@pitchlab/ui";
import { cortexSummary } from "../../../../../src/server/cortex";
import {
  buildServerRawPlatformDataset,
  loadGameDetail,
  loadGameSummary,
} from "../../../../../src/server/platform-data";
import { trustedClientIp } from "../../../../../src/server/request-security";
import {
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../../../src/server/snapshots";
import { getViewerAccess } from "../../../../../src/server/viewer-access";

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

export default async function ClubMatchStudioPage({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}): Promise<React.JSX.Element> {
  const { league, gameId } = await params;
  if (!isProductLeague(league)) {
    notFound();
  }

  const envelope = loadLeagueSnapshotEnvelope(league);
  const exists = envelope.data?.games.some((g) => g.id === gameId) ?? false;
  if (!exists) {
    notFound();
  }

  // Cortex IA con LLM solo para socios con sesión (la inteligencia previa es de Pase PitchLab Ultra).
  let cortex: string | null = null;
  if (process.env.OPENROUTER_API_KEY) {
    const access = await getViewerAccess();
    if (access.fullAccess) {
      const game = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
      if (game && game.status !== "FT") {
        const viewerKey = access.profile?.handle ?? (trustedClientIp(await headers()) || "socio");
        cortex = await cortexSummary(game, { viewerKey });
      }
    }
  }

  // El layout solo trae partidos por jugar: si este ya terminó, se agrega aquí.
  const [detail, summary] = await Promise.all([loadGameDetail(gameId), loadGameSummary(gameId)]);

  return (
    <PlatformGamesSupplement games={summary ? [summary] : []}>
      <MatchStudioClubView
        leagueId={asLeagueId(league)}
        gameId={gameId}
        cortexSynthesisOverride={cortex}
        detail={detail}
      />
    </PlatformGamesSupplement>
  );
}
