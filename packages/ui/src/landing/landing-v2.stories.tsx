import React from "react";
import ligaMx from "../../../../data/snapshots/liga-mx/latest.json";
import premier from "../../../../data/snapshots/premier-league/latest.json";
import laliga from "../../../../data/snapshots/laliga/latest.json";
import nfl from "../../../../data/snapshots/nfl/latest.json";
import { landingLeagueFromSnapshot, type LandingSnapshot } from "./data.js";
import { LANDING_COVERAGE, LANDING_PLANS } from "./content.js";
import { LandingV2 } from "./landing-v2.js";

/** Landing definitiva «Pregunta un partido», con los snapshots reales del repo. */
export default {
  title: "PitchLab/Landing definitiva",
  id: "pitchlab-landing",
  parameters: { layout: "fullscreen" },
};

const snaps = [ligaMx, premier, laliga, nfl] as unknown as LandingSnapshot[];
const leagues = snaps.map(landingLeagueFromSnapshot);

export const PreguntaUnPartido = () => (
  <LandingV2 leagues={leagues} coverage={LANDING_COVERAGE} plans={LANDING_PLANS} />
);
PreguntaUnPartido.storyName = "Pregunta un partido";
