import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { MatchStudioClubView, PlatformGamesSupplement } from "@pitchlab/ui";
import { cortexSummary } from "../../../../../src/server/cortex";
import {
  buildServerRawPlatformDataset,
  hasAuthenticatedBetaSession,
  loadGameDetail,
  loadGameSummary,
} from "../../../../../src/server/platform-data";
import {
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../../../src/server/snapshots";

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
  if (process.env.OPENROUTER_API_KEY && (await hasAuthenticatedBetaSession())) {
    const game = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
    if (game && game.status !== "FT") cortex = await cortexSummary(game);
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
