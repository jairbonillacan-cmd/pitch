import React from "react";
import { PropsLabClubView } from "@pitchlab/ui/parlays";
import { loadShellPlayerProps } from "../../../src/server/platform-data";
import { loadPlayerPropStreakCards } from "../../../src/server/props-explorer";

export default function ClubPropsPage(): React.JSX.Element {
  const streakCards = loadPlayerPropStreakCards(36);
  const playerProps = loadShellPlayerProps();
  return <PropsLabClubView streakCards={streakCards} playerProps={playerProps} />;
}
