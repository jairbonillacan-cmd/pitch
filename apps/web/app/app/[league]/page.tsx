import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { LeagueHubClubView } from "@pitchlab/ui/match-studio";
import { loadLeagueNews } from "../../../src/server/league-news";
import { loadLeagueHubGames, loadLeagueStandings } from "../../../src/server/platform-data";
import { loadLeagueStandingsMeta } from "../../../src/server/team-profile";
import {
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../src/server/snapshots";
import { getViewerAccess } from "../../../src/server/viewer-access";

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

  // Los partidos y tabla de la liga se entregan puntualmente aquí (fuera del shell compartido).
  const access = await getViewerAccess();
  const [leagueGames, news] = await Promise.all([
    loadLeagueHubGames(league),
    loadLeagueNews(league, access.fullAccess),
  ]);
  const standingsMeta = loadLeagueStandingsMeta(league);
  const initialStandings = loadLeagueStandings(league);

  return (
    <PlatformGamesSupplement games={leagueGames}>
      <LeagueHubClubView
        leagueId={asLeagueId(league)}
        initialNews={news}
        standingsMeta={standingsMeta}
        initialStandings={initialStandings}
      />
    </PlatformGamesSupplement>
  );
}
