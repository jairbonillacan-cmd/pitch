import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listFollowedGames, setFollowedGame } from "@pitchlab/db";
import {
  ApiGuardHttpError,
  readBoundedJson,
  withActivePaseMutation,
  withSessionRead,
} from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WATCHLIST_LIMIT = 40;

const WatchlistAlertsSchema = z
  .object({
    kickoff: z.boolean().optional(),
    goals: z.boolean().optional(),
    final: z.boolean().optional(),
  })
  .strict()
  .optional();

const WatchlistMutationSchema = z
  .object({
    gameId: z.string().trim().min(1).max(128),
    watched: z.boolean(),
    alerts: WatchlistAlertsSchema,
  })
  .strict();

function parseBoundedLimit(raw: string | null): number {
  if (raw === null) return MAX_WATCHLIST_LIMIT;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) return MAX_WATCHLIST_LIMIT;
  return Math.max(1, Math.min(MAX_WATCHLIST_LIMIT, Math.trunc(parsed)));
}

export const GET = withSessionRead(
  {
    bucket: "me-watchlist-read",
    allowBetaPin: false,
    cacheControl: "private, no-store",
  },
  async ({ request, user }) => {
    const limit = parseBoundedLimit(new URL(request.url).searchParams.get("limit"));
    const follows = (await listFollowedGames(user.db, user.userId)).slice(0, limit);
    return NextResponse.json({ gameIds: follows.map((f) => f.gameId), follows });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "me-watchlist-write",
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    let rawBody: unknown;
    try {
      rawBody = await readBoundedJson(request, 16_384);
    } catch (err) {
      if (err instanceof ApiGuardHttpError) throw err;
      return NextResponse.json(
        createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido."),
        { status: 400 },
      );
    }

    const parsed = WatchlistMutationSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Se esperaba { gameId, watched }",
          ...createSanitizedErrorPayload(
            "INVALID_WATCHLIST_PAYLOAD",
            "Se esperaba { gameId, watched }.",
          ),
        },
        { status: 400 },
      );
    }

    const result = await setFollowedGame(
      user.db,
      user.userId,
      parsed.data.gameId,
      parsed.data.watched,
      parsed.data.alerts,
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Partido no válido",
          ...createSanitizedErrorPayload("INVALID_GAME_ID", "Partido no válido."),
        },
        { status: 400 },
      );
    }

    const follows = (await listFollowedGames(user.db, user.userId)).slice(0, MAX_WATCHLIST_LIMIT);
    return NextResponse.json({ gameIds: follows.map((f) => f.gameId), follows });
  },
);
