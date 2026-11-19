import { NextResponse } from "next/server";
import {
  listComparePlayersForLeague,
  loadPlayerComparison,
  loadTeamComparison,
} from "../../../src/server/compare";
import { getViewerAccess } from "../../../src/server/viewer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/compare?modo=equipos|jugadores&liga=liga-mx&a=...&b=... */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("modo") === "jugadores" ? "jugadores" : "equipos";
  const league = (url.searchParams.get("liga") ?? "liga-mx").trim().toLowerCase();
  const a = (url.searchParams.get("a") ?? "").trim();
  const b = (url.searchParams.get("b") ?? "").trim();

  const access = await getViewerAccess();
  const opts = { fullAccess: access.fullAccess };

  if (mode === "jugadores") {
    const playerOptions = listComparePlayersForLeague(league);
    const refA = a || playerOptions[0]?.ref || "";
    const refB =
      b && b !== refA
        ? b
        : (playerOptions.find((p) => p.ref !== refA)?.ref ?? "");
    const playerComparison =
      refA && refB ? await loadPlayerComparison(league, refA, refB, opts) : null;
    return NextResponse.json(
      { playerOptions, playerComparison },
      { headers: { "Cache-Control": "private, max-age=120" } },
    );
  }

  const teamComparison = a && b ? loadTeamComparison(league, a, b, opts) : null;
  return NextResponse.json(
    { teamComparison },
    { headers: { "Cache-Control": "private, max-age=120" } },
  );
}
