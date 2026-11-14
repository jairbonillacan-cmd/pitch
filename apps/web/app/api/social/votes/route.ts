import { NextResponse } from "next/server";
import { castMatchVote, isValidMatchVote, matchVoteTally } from "@pitchlab/db";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";
import { requireSocialMember } from "../../../../src/server/social";
import { verifySameOriginMutation } from "../../../../src/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

/** GET ?gameId= — conteo de votos del partido y el voto propio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const gameId = new URL(request.url).searchParams.get("gameId") ?? "";
  if (!GAME_ID_RE.test(gameId)) return NextResponse.json({ error: "Partido inválido." }, { status: 400 });
  const tally = await matchVoteTally(member.db, gameId, member.userId);
  return NextResponse.json({ ok: true, tally });
}

/** POST { gameId, question: "ganador" | "pick", choice } — vota o cambia el voto antes del inicio. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrf = verifySameOriginMutation(request);
  if (csrf) return csrf;
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const gameId = typeof body?.gameId === "string" ? body.gameId : "";
  const question = body?.question;
  const choice = typeof body?.choice === "string" ? body.choice : "";
  if (!GAME_ID_RE.test(gameId) || !isValidMatchVote(question, choice)) {
    return NextResponse.json({ error: "Voto inválido." }, { status: 400 });
  }
  const game = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
  if (!game) return NextResponse.json({ error: "Ese partido no está en la jornada." }, { status: 404 });
  const kickoff = Date.parse(game.kickoffUtc);
  if (game.status !== "NS" || (Number.isFinite(kickoff) && Date.now() >= kickoff)) {
    return NextResponse.json({ error: "Las votaciones cierran al empezar el partido." }, { status: 409 });
  }
  if (question === "ganador" && choice === "draw" && game.sport === "american-football") {
    return NextResponse.json({ error: "Voto inválido." }, { status: 400 });
  }
  await castMatchVote(member.db, member.userId, { gameId, question, choice }, new Date());
  const tally = await matchVoteTally(member.db, gameId, member.userId);
  return NextResponse.json({ ok: true, tally });
}
