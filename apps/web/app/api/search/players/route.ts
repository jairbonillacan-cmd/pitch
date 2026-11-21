import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import { searchPlayersDirectory } from "../../../../src/server/player-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 40;

function parseBoundedLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(parsed)));
}

export const GET = withSessionRead(
  {
    bucket: "search-players",
    allowBetaPin: true,
    watermark: true,
    resourceKey: ({ request }) =>
      new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? null,
    cacheControl: "private, no-store",
  },
  ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const league = url.searchParams.get("league")?.trim() || null;
    const team = url.searchParams.get("team")?.trim() || null;
    const limit = parseBoundedLimit(url.searchParams.get("limit"));

    if (q.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const items = searchPlayersDirectory(q, { league, teamSlug: team, limit });
    return NextResponse.json({ items });
  },
);
