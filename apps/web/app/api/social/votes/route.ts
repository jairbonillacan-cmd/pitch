import { NextResponse } from "next/server";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { castMatchVote, matchVoteTally } from "@pitchlab/db";
import { z } from "zod";
import { withActivePaseMutation, withSessionRead } from "../../../../src/server/api-guards";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

const GameIdSchema = z.string().regex(GAME_ID_RE);

const VotePayloadSchema = z.discriminatedUnion("question", [
  z
    .object({
      gameId: GameIdSchema,
      question: z.literal("ganador"),
      choice: z.enum(["home", "draw", "away"]),
    })
    .strict(),
  z
    .object({
      gameId: GameIdSchema,
      question: z.literal("pick"),
      choice: z.enum(["si", "no"]),
    })
    .strict(),
]);

export const GET = withSessionRead(
  {
    bucket: "social-votes-read",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    resourceKey: ({ request }) => new URL(request.url).searchParams.get("gameId")?.trim() ?? null,
  },
  async ({ request, user }) => {
    const rawGameId = new URL(request.url).searchParams.get("gameId") ?? "";
    const parsedGameId = GameIdSchema.safeParse(rawGameId);
    if (!parsedGameId.success) {
      const err = createSanitizedErrorPayload("INVALID_GAME_ID", "Partido inválido.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const tally = await matchVoteTally(user.db, parsedGameId.data, user.userId);
    return NextResponse.json({ ok: true, tally });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "social-votes-write",
    limit: 40,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const parsed = VotePayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const err = createSanitizedErrorPayload("INVALID_VOTE", "Voto inválido.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const { gameId, question, choice } = parsed.data;
    const game = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
    if (!game) {
      return NextResponse.json({ ok: false, error: "Ese partido no está en la jornada." }, { status: 404 });
    }
    const kickoff = Date.parse(game.kickoffUtc);
    if (game.status !== "NS" || (Number.isFinite(kickoff) && Date.now() >= kickoff)) {
      return NextResponse.json(
        { ok: false, error: "Las votaciones cierran al empezar el partido." },
        { status: 409 },
      );
    }
    if (question === "ganador" && choice === "draw" && game.sport !== "football") {
      const err = createSanitizedErrorPayload("INVALID_VOTE", "Voto inválido.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    await castMatchVote(user.db, user.userId, { gameId, question, choice }, new Date());
    const tally = await matchVoteTally(user.db, gameId, user.userId);
    return NextResponse.json({ ok: true, tally });
  },
);
