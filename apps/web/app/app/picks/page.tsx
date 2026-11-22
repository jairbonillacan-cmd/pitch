import "../../atomic-kit.css";
import "../../picks-screener.css";
import React from "react";
import { PicksFinderClubView } from "@pitchlab/ui/picks";
import { selectPicksOfTheDay } from "@pitchlab/ui/picks-catalog";
import { loadServerPicksCatalogsForScreener } from "../../../src/server/platform-data";

export default async function ClubPicksPage(): Promise<React.JSX.Element> {
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
