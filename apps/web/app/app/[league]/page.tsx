import React from "react";
import { notFound } from "next/navigation";
import {
  PRODUCT_LEAGUES,
  loadAllActiveLeagueSnapshots,
  type ProductLeague,
} from "../../../src/server/snapshots.js";
import { PanelClient } from "../../../src/client/panel-client.js";

function isPanelLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

export default async function LeaguePanelPage({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<React.JSX.Element> {
  const { league } = await params;
  if (!isPanelLeague(league)) {
    notFound();
  }

  const all = loadAllActiveLeagueSnapshots();
  const availability = Object.fromEntries(
    PRODUCT_LEAGUES.map((key) => [key, (all[key].data?.games.length ?? 0) > 0]),
  ) as Record<ProductLeague, boolean>;

  return (
    <PanelClient
      league={league}
      envelope={all[league]}
      leagueAvailability={availability}
    />
  );
}
