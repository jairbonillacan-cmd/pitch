import React from "react";
import { notFound } from "next/navigation";
import { asLeagueId } from "@pitchlab/contracts";
import { LeagueHubClubView, PlatformGamesSupplement } from "@pitchlab/ui";
import { loadLeagueNews } from "../../../src/server/league-news";
import { loadFinishedGames } from "../../../src/server/platform-data";
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

  // Los resultados de la liga no vienen en el layout: se piden aquí junto con sus noticias reales.
  const access = await getViewerAccess();
  const [finished, news] = await Promise.all([
    loadFinishedGames(league),
    loadLeagueNews(league, access.fullAccess),
  ]);
  const standingsMeta = loadLeagueStandingsMeta(league);

  return (
    <PlatformGamesSupplement games={finished}>
      <LeagueHubClubView
        leagueId={asLeagueId(league)}
        initialNews={news}
        standingsMeta={standingsMeta}
      />
    </PlatformGamesSupplement>
  );
}
