import "../../record-v2.css";
import React from "react";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { HistorialClubView } from "@pitchlab/ui/historial";
import { loadFinishedGames } from "../../../src/server/platform-data";

export default async function ClubHistorialPage(): Promise<React.JSX.Element> {
  const finished = await loadFinishedGames();
  return (
    <PlatformGamesSupplement games={finished}>
      <HistorialClubView />
    </PlatformGamesSupplement>
  );
}
