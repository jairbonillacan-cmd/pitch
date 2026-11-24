import "../../sport-outlook.css";
import "../../alerts-referees.css";
import "../../atomic-kit.css";
import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { asLeagueId, COMPETITION_BY_ID } from "@pitchlab/contracts";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { LeagueHubClubView } from "@pitchlab/ui/league-hub";
import { LeagueHubSkeleton } from "@pitchlab/ui/route-skeletons";
import { yieldForStreamFlush } from "../../../src/server/club-shell-viewer";
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
  await yieldForStreamFlush();
  const access = await getViewerAccess();
  const [leagueGames, news, standingsMeta, initialStandings, enrichment] = await Promise.all([
    loadLeagueHubGames(league),
    loadLeagueNews(league, access.fullAccess),
    Promise.resolve().then(() => loadLeagueStandingsMeta(league)),
    Promise.resolve().then(() => loadLeagueStandings(league)),
    Promise.resolve().then(() => loadLeagueHubEnrichment(league, access.fullAccess)),
  ]);

  let upcomingCount = 0;
  let finishedCount = 0;
  for (const g of leagueGames) {
    if (g.status === "FT") finishedCount += 1;
    else upcomingCount += 1;
  }
  const meta = COMPETITION_BY_ID[league];
  const leagueSummaryPatch = {
    league: asLeagueId(league),
    label: meta?.label ?? league,
    sport: meta?.sport ?? "football",
    season: meta?.season ?? "2026",
    roundLabel: meta?.defaultPeriod ?? "Jornada regular",
    generatedAt: new Date().toISOString(),
    totalGames: leagueGames.length,
    upcomingCount,
    finishedCount,
    standings: [...initialStandings],
  };

  return (
    <PlatformGamesSupplement games={leagueGames} leagues={[leagueSummaryPatch]}>
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
