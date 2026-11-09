import React from "react";
import { LeagueSnapshotSchema, snapshotToMatchAnalyses } from "@pitchlab/contracts";
import ligaMx from "../../../../data/snapshots/liga-mx/latest.json";
import nfl from "../../../../data/snapshots/nfl/latest.json";
import premier from "../../../../data/snapshots/premier-league/latest.json";
import laliga from "../../../../data/snapshots/laliga/latest.json";
import bundesliga from "../../../../data/snapshots/bundesliga/latest.json";
import serieA from "../../../../data/snapshots/serie-a/latest.json";
import ligue1 from "../../../../data/snapshots/ligue-1/latest.json";
import { AppHome } from "./app-home.js";
import { buildAppHome } from "./data.js";

export default {
  title: "PitchLab/Inicio",
  id: "pitchlab-inicio",
  parameters: { layout: "fullscreen" },
};

const snapshots = [
  [ligaMx, "Liga MX"],
  [nfl, "NFL"],
  [premier, "Premier League"],
  [laliga, "LaLiga"],
  [bundesliga, "Bundesliga"],
  [serieA, "Serie A"],
  [ligue1, "Ligue 1"],
].map(([raw, label]) => {
  const snapshot = LeagueSnapshotSchema.parse(raw);
  return {
    league: snapshot.league,
    leagueLabel: String(label),
    generatedAt: snapshot.updatedAt,
    games: snapshotToMatchAnalyses(snapshot).matches,
    standings: snapshot.standings,
  };
});

const cutoff = new Date(nfl.updatedAt);
const home = buildAppHome(snapshots, cutoff);
const empty = buildAppHome([], cutoff);
const partial = buildAppHome(snapshots.filter(({ league }) => league !== "nfl"), cutoff, true);

export const Jornada = () => <AppHome data={home} />;
export const SinDatos = () => <AppHome data={empty} />;
export const DatosParciales = () => <AppHome data={partial} />;
