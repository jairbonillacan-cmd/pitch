import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { withSessionRead } from "../../../../src/server/api-guards";
import {
  lookupLeagueForOpaqueNewsId,
  parseOpaqueNewsId,
  resolveVerifiedNewsArticleSummary,
} from "../../../../src/server/espn-news";
import { PRODUCT_LEAGUES, type ProductLeague } from "../../../../src/server/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProductLeague(value: string): value is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(value);
}

export const GET = withSessionRead(
  {
    bucket: "news-article",
    allowBetaPin: true,
    resourceKey: ({ request }) => new URL(request.url).searchParams.get("id"),
    cacheControl: "private, no-store",
  },
  async ({ request }) => {
    const { searchParams } = new URL(request.url);
    if (searchParams.has("url") || searchParams.has("href")) {
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_NEWS_PARAMS", "Parámetros de noticia inválidos."),
        { status: 400 },
      );
    }

    const idRaw = (searchParams.get("id") ?? "").trim();
    const opaqueId = parseOpaqueNewsId(idRaw);
    if (!opaqueId) {
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_NEWS_PARAMS", "Parámetros de noticia inválidos."),
        { status: 400 },
      );
    }

    const leagueParam = searchParams.get("league");
    let league: ProductLeague | null = null;
    if (leagueParam !== null) {
      const trimmedLeague = leagueParam.trim();
      if (!isProductLeague(trimmedLeague)) {
        return NextResponse.json(
          createSanitizedErrorPayload("INVALID_NEWS_PARAMS", "Parámetros de noticia inválidos."),
          { status: 400 },
        );
      }
      league = trimmedLeague;
    } else {
      league = lookupLeagueForOpaqueNewsId(opaqueId);
      if (!league) {
        return NextResponse.json(
          createSanitizedErrorPayload("INVALID_NEWS_PARAMS", "Parámetros de noticia inválidos."),
          { status: 400 },
        );
      }
    }

    const summary = await resolveVerifiedNewsArticleSummary(league, opaqueId);
    if (!summary) {
      return NextResponse.json(
        createSanitizedErrorPayload("NEWS_NOT_FOUND", "Nota no encontrada."),
        { status: 404 },
      );
    }

    return NextResponse.json(summary, { status: 200 });
  },
);
