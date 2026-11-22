import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import { searchPlayersDirectory } from "../../../../src/server/player-search";
import { sanitizeQueryText } from "../../../../src/server/query-params";

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
      sanitizeQueryText(new URL(request.url).searchParams.get("q"), 80).toLowerCase() || null,
    cacheControl: "private, no-store",
  },
  ({ request }) => {
    const url = new URL(request.url);
    const q = sanitizeQueryText(url.searchParams.get("q"), 80);
    const league = sanitizeQueryText(url.searchParams.get("league"), 64) || null;
    const team = sanitizeQueryText(url.searchParams.get("team"), 120) || null;
    const limit = parseBoundedLimit(url.searchParams.get("limit"));

    if (q.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const items = searchPlayersDirectory(q, { league, teamSlug: team, limit });
    return NextResponse.json({ items });
  },
);
