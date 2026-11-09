import React from "react";
import { LANDING_COVERAGE, LANDING_PLANS, LandingV2 } from "@pitchlab/ui";
import { loadLandingLeagues } from "../src/server/landing.js";

/** Landing definitiva «Pregunta un partido» (docs/design/UI_LIBRARIES.md). */
export default function HomePage(): React.JSX.Element {
  return (
    <LandingV2
      leagues={loadLandingLeagues()}
      coverage={LANDING_COVERAGE}
      plans={LANDING_PLANS}
      signupHref="/signup"
      loginHref="/login"
    />
  );
}
