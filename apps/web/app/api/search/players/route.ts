import { NextResponse } from "next/server";
import { searchPlayersDirectory } from "../../../../src/server/player-search";

export const runtime = "nodejs";

/** GET /api/search/players?q=ohtani&league=mlb&limit=8 — búsqueda ligera en nóminas reales. */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const league = url.searchParams.get("league")?.trim() || null;
  const team = url.searchParams.get("team")?.trim() || null;
  const rawLimit = Number(url.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : 8;

  if (q.length < 2 && !league && !team) {
    return NextResponse.json(
      { items: [] },
      { headers: { "Cache-Control": "public, max-age=120" } },
    );
  }

  const items = searchPlayersDirectory(q, { league, teamSlug: team, limit });
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
