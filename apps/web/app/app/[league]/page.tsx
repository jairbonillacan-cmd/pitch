import "../../sport-outlook.css";
import "../../alerts-referees.css";
import "../../atomic-kit.css";
import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { LeagueHubClubView } from "@pitchlab/ui/league-hub";
import { LeagueHubSkeleton } from "@pitchlab/ui/route-skeletons";
import { loadLeagueNews } from "../../../src/server/league-news";
import { loadLeagueHubGames, loadLeagueStandings } from "../../../src/server/platform-data";
import { loadLeagueHubEnrichment } from "../../../src/server/standings-brackets";
import { loadLeagueStandingsMeta } from "../../../src/server/team-profile";
import {
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../src/server/snapshots";
import { getViewerAccess } from "../../../src/server/viewer-access";

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

async function LeagueHubStreamContent({
  league,
}: {
  league: ProductLeague;
}): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  const [leagueGames, news, standingsMeta, initialStandings, enrichment] = await Promise.all([
    loadLeagueHubGames(league),
    loadLeagueNews(league, access.fullAccess),
    Promise.resolve().then(() => loadLeagueStandingsMeta(league)),
    Promise.resolve().then(() => loadLeagueStandings(league)),
    Promise.resolve().then(() => loadLeagueHubEnrichment(league, access.fullAccess)),
  ]);

  return (
    <PlatformGamesSupplement games={leagueGames}>
      <LeagueHubClubView
        leagueId={asLeagueId(league)}
        initialNews={news}
        standingsMeta={standingsMeta}
        initialStandings={initialStandings}
        enrichment={enrichment}
      />
    </PlatformGamesSupplement>
  );
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

  return (
    <Suspense fallback={<LeagueHubSkeleton />}>
      <LeagueHubStreamContent league={league} />
    </Suspense>
  );
}
