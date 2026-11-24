import "../record-v2.css";
import "../live.css";
import "../atomic-kit.css";
import "../alerts-referees.css";
import "../match-deep-panels.css";
import React, { Suspense } from "react";
import { HomeClubView } from "@pitchlab/ui/home";
import { HomeClubSkeleton } from "@pitchlab/ui/route-skeletons";

export default function ClubHomePage(): React.JSX.Element {
  return (
    <Suspense fallback={<HomeClubSkeleton />}>
      <HomeClubView />
    </Suspense>
  );
}
