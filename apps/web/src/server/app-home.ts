import { buildAppHome, type AppHomeData } from "@pitchlab/ui/app";
import { loadAllActiveLeagueSnapshots } from "./snapshots.js";

export function loadAppHome(): AppHomeData {
  const envelopes = Object.values(loadAllActiveLeagueSnapshots());
  const snapshots = envelopes.flatMap(({ data, state }) =>
    data && (state === "ready" || data.standings?.length) ? [data] : [],
  );
  return buildAppHome(snapshots, new Date(), envelopes.some(({ state }) => state === "error"));
}
