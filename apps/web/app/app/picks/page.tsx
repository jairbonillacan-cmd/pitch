import "../../picks-screener.css";
import React from "react";
import { PicksFinderClubView } from "@pitchlab/ui/picks";
import { loadServerPicksCatalogsForScreener } from "../../../src/server/platform-data";

export default async function ClubPicksPage(): Promise<React.JSX.Element> {
  const initialCatalogs = await loadServerPicksCatalogsForScreener();
  return <PicksFinderClubView initialCatalogs={initialCatalogs} />;
}
