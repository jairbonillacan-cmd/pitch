import { redirect } from "next/navigation";
import { loadLeagueSnapshotEnvelope } from "../../src/server/snapshots.js";

export default function AppIndexPage(): never {
  const mx = loadLeagueSnapshotEnvelope("liga-mx");
  if (mx.state === "ready" && (mx.data?.games.length ?? 0) > 0) {
    redirect("/app/liga-mx");
  }
  redirect("/app/premier-league");
}
