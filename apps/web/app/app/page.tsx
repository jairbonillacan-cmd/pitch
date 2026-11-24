import "../record-v2.css";
import "../live.css";
import "../atomic-kit.css";
import "../alerts-referees.css";
import "../match-deep-panels.css";
import React, { Suspense } from "react";
import { PlatformGamesSupplement } from "@pitchlab/ui/games-supplement";
import { HomeClubView } from "@pitchlab/ui/home";
import { HomeClubSkeleton } from "@pitchlab/ui/route-skeletons";
import { yieldForStreamFlush } from "../../src/server/club-shell-viewer";
import { loadInitialShellDatasetForAccess } from "../../src/server/platform-data";
import { getViewerAccess } from "../../src/server/viewer-access";

async function HomeClubStreamContent(): Promise<React.JSX.Element> {
  await yieldForStreamFlush();
  const access = await getViewerAccess();
  const stage1 = loadInitialShellDatasetForAccess(access.fullAccess);
  return (
    <PlatformGamesSupplement
      games={stage1.games}
      leagues={stage1.leagues}
      teams={stage1.teams}
      dailyPromoPickId={stage1.dailyPromoPickId}
      tipsterWeeklyPickId={stage1.tipsterWeeklyPickId}
      tipsterWeeklySlug={stage1.tipsterWeeklySlug}
    >
      <HomeClubView />
    </PlatformGamesSupplement>
  );
}

export default function ClubHomePage(): React.JSX.Element {
  return (
    <Suspense fallback={<HomeClubSkeleton />}>
      <HomeClubStreamContent />
    </Suspense>
  );
}
