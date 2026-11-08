import React from "react";
import { notFound } from "next/navigation";
import { loadAllActiveLeagueSnapshots } from "../../../../../src/server/snapshots.js";
import { PanelClient } from "../../../../../src/client/panel-client.js";

const VALID_PANEL_LEAGUES = ["liga-mx", "premier-league", "nfl"] as const;
type PanelLeague = (typeof VALID_PANEL_LEAGUES)[number];

function isPanelLeague(val: string): val is PanelLeague {
  return (VALID_PANEL_LEAGUES as readonly string[]).includes(val);
}

export default async function LeagueGameModalPage({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}): Promise<React.JSX.Element> {
  const { league, gameId } = await params;
  if (!isPanelLeague(league)) {
    notFound();
  }

  const all = loadAllActiveLeagueSnapshots();
  const envelope = all[league];
  const exists = envelope.data?.games.some((g) => g.id === gameId) ?? false;
  if (!exists) {
    notFound();
  }

  const availability = {
    "liga-mx": (all["liga-mx"].data?.games.length ?? 0) > 0,
    "premier-league": (all["premier-league"].data?.games.length ?? 0) > 0,
    nfl: (all.nfl.data?.games.length ?? 0) > 0,
  };

  return (
    <PanelClient
      league={league}
      envelope={envelope}
      leagueAvailability={availability}
      initialGameId={gameId}
    />
  );
}
