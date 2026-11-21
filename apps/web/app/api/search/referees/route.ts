import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import {
  isProductLeagueKey,
  MAX_REFEREE_SEARCH_LIMIT,
  searchRefereesDirectory,
  type RefereeProfileTier,
} from "../../../../src/server/referees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 12;

function parseBoundedLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_REFEREE_SEARCH_LIMIT, Math.round(parsed)));
}

function parseTierParam(raw: string | null): RefereeProfileTier | null | "invalid" {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "estricto" || normalized === "promedio" || normalized === "permisivo") {
    return normalized;
  }
  return "invalid";
}

export const GET = withSessionRead(
  {
    bucket: "search-referees",
    allowBeta: true,
    allowBetaPin: true,
    watermark: true,
    resourceKey: ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = (params.get("q") ?? "").trim().toLowerCase();
      const league = (params.get("league") ?? "").trim().toLowerCase();
      const tier = (params.get("tier") ?? "").trim().toLowerCase();
      const combined = [league, tier, q].filter(Boolean).join(":");
      return combined || null;
    },
    cacheControl: "private, no-store",
  },
  ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const rawLeague = (url.searchParams.get("league") ?? "").trim().toLowerCase();
    if (rawLeague && !isProductLeagueKey(rawLeague)) {
      return NextResponse.json({ error: "Liga no válida" }, { status: 400 });
    }
    const league = rawLeague || null;

    const parsedTier = parseTierParam(url.searchParams.get("tier"));
    if (parsedTier === "invalid") {
      return NextResponse.json({ error: "Perfil arbitral no válido" }, { status: 400 });
    }

    const limit = parseBoundedLimit(url.searchParams.get("limit"));

    if (q.length < 2 && !league && !parsedTier) {
      return NextResponse.json({ items: [] });
    }

    const items = searchRefereesDirectory(q, {
      league,
      tier: parsedTier,
      limit,
    });
    return NextResponse.json({ items });
  },
);
