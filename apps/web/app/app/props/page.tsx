import React from "react";
import { PropsLabClubView } from "@pitchlab/ui";
import { loadPlayerPropStreakCards } from "../../../src/server/props-explorer";

export default function ClubPropsPage(): React.JSX.Element {
  const streakCards = loadPlayerPropStreakCards(36);
  return <PropsLabClubView streakCards={streakCards} />;
}
