import React from "react";
import { HistorialClubView, PlatformGamesSupplement } from "@pitchlab/ui";
import { loadFinishedGames } from "../../../src/server/platform-data";

export default async function ClubHistorialPage(): Promise<React.JSX.Element> {
  // El layout solo trae los partidos por jugar; Resultados pide los terminados.
  const finished = await loadFinishedGames();
  return (
    <PlatformGamesSupplement games={finished}>
      <HistorialClubView />
    </PlatformGamesSupplement>
  );
}
