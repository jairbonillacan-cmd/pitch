import { LeagueSnapshotSchema, snapshotToMatchAnalyses } from "@pitchlab/contracts";
import bundesliga from "../../../../data/snapshots/bundesliga/latest.json";
import laliga from "../../../../data/snapshots/laliga/latest.json";
import ligaMx from "../../../../data/snapshots/liga-mx/latest.json";
import ligue1 from "../../../../data/snapshots/ligue-1/latest.json";
import nfl from "../../../../data/snapshots/nfl/latest.json";
import premier from "../../../../data/snapshots/premier-league/latest.json";
import serieA from "../../../../data/snapshots/serie-a/latest.json";
import { buildAppHome } from "../app/data.js";
import { landingLeagueFromSnapshot, leagueLabel } from "../landing/data.js";

const snapshots = [bundesliga, laliga, ligaMx, ligue1, nfl, premier, serieA]
  .map((raw) => LeagueSnapshotSchema.parse(raw));
const cutoff = new Date(Math.max(...snapshots.map(({ updatedAt }) => Date.parse(updatedAt))));
const home = buildAppHome(snapshots.map((snapshot) => ({
  league: snapshot.league,
  leagueLabel: leagueLabel(snapshot.league),
  generatedAt: snapshot.updatedAt,
  games: snapshotToMatchAnalyses(snapshot).matches,
})), cutoff);

export const loginRanking = home.ranked;
const football = home.upcoming.filter(({ sport, outcome }) => sport === "football" && outcome)
  .sort((a, b) => (b.outcome?.p ?? 0) - (a.outcome?.p ?? 0))[0];
const league = snapshots.find(({ league }) => league === football?.league);
export const signupMatch = league ? landingLeagueFromSnapshot(league).upcoming.find(({ id }) => id === football?.id) : undefined;
