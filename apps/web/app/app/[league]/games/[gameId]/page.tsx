import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { MatchStudioClubView } from "@pitchlab/ui";
import { cortexSummary } from "../../../../../src/server/cortex.js";
import {
  buildServerRawPlatformDataset,
  hasAuthenticatedBetaSession,
} from "../../../../../src/server/platform-data.js";
import {
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../../../src/server/snapshots.js";

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

  // Cortex IA con LLM solo para socios con sesión (la inteligencia previa es de Pase Total).
  let cortex: string | null = null;
  if (process.env.OPENROUTER_API_KEY && (await hasAuthenticatedBetaSession())) {
    const game = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
    if (game && game.status !== "FT") cortex = await cortexSummary(game);
  }

  return (
    <MatchStudioClubView leagueId={asLeagueId(league)} gameId={gameId} cortexSynthesisOverride={cortex} />
  );
}
