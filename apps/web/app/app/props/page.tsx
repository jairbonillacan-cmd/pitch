import React from "react";
import { PropsLabClubView } from "@pitchlab/ui/parlays";
import { loadShellPlayerProps } from "../../../src/server/platform-data";
import {
  loadPlayerPropStreakCards,
  loadStructuredPlayerProps,
} from "../../../src/server/props-explorer";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export default async function ClubPropsPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  const streakCards = access.fullAccess ? loadPlayerPropStreakCards(36) : [];
  const basePlayerProps = loadShellPlayerProps({ fullAccess: access.fullAccess });
  const playerProps = access.fullAccess
    ? loadStructuredPlayerProps({ fullAccess: true, baseProps: basePlayerProps })
    : [];
  return <PropsLabClubView streakCards={streakCards} playerProps={playerProps} />;
}
