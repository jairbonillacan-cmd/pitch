import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { LeagueHubClubView, PlatformGamesSupplement } from "@pitchlab/ui";
import { loadFinishedGames } from "../../../src/server/platform-data";
import {
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../src/server/snapshots";

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

export default async function ClubLeaguePage({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<React.JSX.Element> {
  const { league } = await params;
  if (!isProductLeague(league)) {
    notFound();
  }

  // Los resultados de la liga no vienen en el layout: se piden aquí.
  const finished = await loadFinishedGames(league);
  return (
    <PlatformGamesSupplement games={finished}>
      <LeagueHubClubView leagueId={asLeagueId(league)} />
    </PlatformGamesSupplement>
  );
}
