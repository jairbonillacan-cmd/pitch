import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import {
  loadScreenerApiPage,
  type ScreenerBandFilter,
  type ScreenerPickTypeFilter,
  type ScreenerSortFilter,
  type ScreenerTabFilter,
} from "../../../../src/server/platform-data";
import { sanitizeQueryText } from "../../../../src/server/query-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 40;
const DEFAULT_PAGE_SIZE = 16;
const SAFE_ID_RE = /^[A-Za-z0-9._:+-]+$/;
const ALLOWED_TABS: ReadonlySet<string> = new Set(["upcoming", "live", "settled", "all"]);
const ALLOWED_SORTS: ReadonlySet<string> = new Set([
  "recomendados",
  "ev",
  "p",
  "movimiento",
  "hora",
  "relevancia",
  "momio",
]);
const ALLOWED_BANDS: ReadonlySet<string> = new Set(["all", "alta", "media", "baja"]);
const ALLOWED_PICK_TYPES: ReadonlySet<string> = new Set(["all", "player", "team_match"]);

function validateSafeId(raw: string | null, maxLen: number): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maxLen ||
    trimmed.includes("..") ||
    !SAFE_ID_RE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseOptionalBool(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  const norm = raw.trim().toLowerCase();
  if (norm === "1" || norm === "true") return true;
  if (norm === "0" || norm === "false") return false;
  return undefined;
}

function parseOptionalText(raw: string | null, maxLen: number): string | undefined {
  const clean = sanitizeQueryText(raw, maxLen);
  return clean || undefined;
}

function parseOptionalOdds(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || parsed < 1.01 || parsed > 100) return undefined;
  return parsed;
}

function parseTabFilter(raw: string | null): ScreenerTabFilter | undefined {
  const norm = parseOptionalText(raw, 24)?.toLowerCase();
  if (!norm || !ALLOWED_TABS.has(norm)) return undefined;
  if (norm === "upcoming" || norm === "live" || norm === "settled" || norm === "all") {
    return norm;
  }
  return undefined;
}

function parseSortFilter(raw: string | null): ScreenerSortFilter | undefined {
  const norm = parseOptionalText(raw, 24)?.toLowerCase();
  if (!norm || !ALLOWED_SORTS.has(norm)) return undefined;
  if (
    norm === "recomendados" ||
    norm === "ev" ||
    norm === "p" ||
    norm === "movimiento" ||
    norm === "hora" ||
    norm === "relevancia" ||
    norm === "momio"
  ) {
    return norm;
  }
  return undefined;
}

function parseBandFilter(raw: string | null): ScreenerBandFilter | undefined {
  const norm = parseOptionalText(raw, 16)?.toLowerCase();
  if (!norm || !ALLOWED_BANDS.has(norm)) return undefined;
  if (norm === "all" || norm === "alta" || norm === "media" || norm === "baja") {
    return norm;
  }
  return undefined;
}

function parsePickTypeFilter(raw: string | null): ScreenerPickTypeFilter | undefined {
  const norm = parseOptionalText(raw, 24)?.toLowerCase();
  if (!norm || !ALLOWED_PICK_TYPES.has(norm)) return undefined;
  if (norm === "all" || norm === "player" || norm === "team_match") {
    return norm;
  }
  return undefined;
}

export const GET = withSessionRead(
  {
    bucket: "picks-screener",
    limit: 40,
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  ({ request, access }) => {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const page = parseBoundedInt(sp.get("page"), 1, 1, 500);
    const pageSize = parseBoundedInt(
      sp.get("pageSize") ?? sp.get("limit"),
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const sport = parseOptionalText(sp.get("sport"), 40);
    const league = parseOptionalText(sp.get("league"), 64);
    const rawGameId = sp.get("gameId");
    let gameId: string | undefined;
    if (rawGameId !== null && rawGameId.trim().length > 0) {
      const validatedGameId = validateSafeId(rawGameId, 160);
      if (!validatedGameId) {
        return NextResponse.json(
          { ok: false, error: "datos_invalidos" },
          {
            status: 400,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
      gameId = validatedGameId;
    }
    const q = parseOptionalText(sp.get("q"), 80);
    const onlyRecommended = parseOptionalBool(sp.get("onlyRecommended"));
    const includeTrivial = parseOptionalBool(sp.get("includeTrivial")) ?? false;
    const tab = parseTabFilter(sp.get("tab"));
    const day = parseOptionalText(sp.get("day"), 24);
    const minOdds = parseOptionalOdds(sp.get("minOdds"));
    const maxOdds = parseOptionalOdds(sp.get("maxOdds"));
    const sort = parseSortFilter(sp.get("sort"));
    const band = parseBandFilter(sp.get("band"));
    const family = parseOptionalText(sp.get("family"), 40);
    const pickType = parsePickTypeFilter(sp.get("pickType"));
    const onlyPositiveEdge = parseOptionalBool(sp.get("onlyPositiveEdge"));

    const payload = loadScreenerApiPage({
      fullAccess: access.fullAccess,
      page,
      pageSize,
      sport,
      league,
      gameId,
      tab,
      day,
      minOdds,
      maxOdds,
      sort,
      band,
      family,
      pickType,
      onlyPositiveEdge,
      onlyRecommended,
      includeTrivial,
      q,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  },
);
