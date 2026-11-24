import "../../atomic-kit.css";
import "../../picks-screener.css";
import React, { Suspense } from "react";
import { PicksFinderClubView } from "@pitchlab/ui/picks";
import { selectPicksOfTheDay } from "@pitchlab/ui/picks-catalog";
import { PicksSkeleton } from "@pitchlab/ui/route-skeletons";
import { loadServerPicksCatalogsForScreener } from "../../../src/server/platform-data";

async function PicksScreenerStreamContent(): Promise<React.JSX.Element> {
  const initialCatalogs = await loadServerPicksCatalogsForScreener();
  const allCatalogPicks = Object.values(initialCatalogs).flatMap((catalog) => catalog.picks);
  const initialPicksOfTheDay = selectPicksOfTheDay(allCatalogPicks, 3);
  return (
    <PicksFinderClubView
      initialCatalogs={initialCatalogs}
      initialPicksOfTheDay={initialPicksOfTheDay}
    />
  );
}

export default function ClubPicksPage(): React.JSX.Element {
  return (
    <Suspense fallback={<PicksSkeleton />}>
      <PicksScreenerStreamContent />
    </Suspense>
  );
}
