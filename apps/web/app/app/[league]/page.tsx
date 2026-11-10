import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { LeagueHubClubView } from "@pitchlab/ui";
import {
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../src/server/snapshots.js";

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

  return <LeagueHubClubView leagueId={asLeagueId(league)} />;
}
