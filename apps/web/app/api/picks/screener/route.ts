import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import { loadScreenerApiPage } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 40;
const DEFAULT_PAGE_SIZE = 16;
const SAFE_ID_RE = /^[A-Za-z0-9._:+-]+$/;

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
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
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

    const payload = loadScreenerApiPage({
      fullAccess: access.fullAccess,
      page,
      pageSize,
      sport,
      league,
      gameId,
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
