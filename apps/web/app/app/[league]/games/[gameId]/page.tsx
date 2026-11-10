import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { MatchStudioClubView } from "@pitchlab/ui";
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

  return <MatchStudioClubView leagueId={asLeagueId(league)} gameId={gameId} />;
}
