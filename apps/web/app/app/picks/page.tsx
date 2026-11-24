import "../../atomic-kit.css";
import "../../picks-screener.css";
import React, { Suspense } from "react";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { PicksFinderClubView } from "@pitchlab/ui/picks";
import { selectPicksOfTheDay } from "@pitchlab/ui/picks-catalog";
import { PicksSkeleton } from "@pitchlab/ui/route-skeletons";
import { yieldForStreamFlush } from "../../../src/server/club-shell-viewer";
import {
  loadGameSummary,
  loadInitialShellDatasetForAccess,
  loadServerPicksCatalogsForScreener,
  withoutGameDetail,
} from "../../../src/server/platform-data";
import { getViewerAccess } from "../../../src/server/viewer-access";

async function PicksScreenerStreamContent(): Promise<React.JSX.Element> {
  await yieldForStreamFlush();
  const access = await getViewerAccess();
  const initialCatalogs = await loadServerPicksCatalogsForScreener({
    fullAccess: access.fullAccess,
  });
  const stage1 = loadInitialShellDatasetForAccess(access.fullAccess);
  const stage1Ids = new Set(stage1.games.map((g) => g.id));
  const missingIds = Object.keys(initialCatalogs).filter((id) => !stage1Ids.has(id));
  const extraSummaries = (
    await Promise.all(missingIds.map((id) => loadGameSummary(id)))
  ).filter((g): g is NonNullable<typeof g> => g !== null);
  const slimExtra =
    extraSummaries.length > 0
      ? withoutGameDetail({ ...stage1, games: extraSummaries }).games
      : [];
  const supplementalGames =
    slimExtra.length > 0 ? [...stage1.games, ...slimExtra] : stage1.games;
  const allCatalogPicks = Object.values(initialCatalogs).flatMap((catalog) => catalog.picks);
  const initialPicksOfTheDay = selectPicksOfTheDay(allCatalogPicks, 3);
  return (
    <PlatformGamesSupplement
      games={supplementalGames}
      leagues={stage1.leagues}
      teams={stage1.teams}
      dailyPromoPickId={stage1.dailyPromoPickId}
      tipsterWeeklyPickId={stage1.tipsterWeeklyPickId}
      tipsterWeeklySlug={stage1.tipsterWeeklySlug}
    >
      <PicksFinderClubView
        initialCatalogs={initialCatalogs}
        initialPicksOfTheDay={initialPicksOfTheDay}
      />
    </PlatformGamesSupplement>
  );
}

export default function ClubPicksPage(): React.JSX.Element {
  return (
    <Suspense fallback={<PicksSkeleton />}>
      <PicksScreenerStreamContent />
    </Suspense>
  );
}
