import { NextResponse } from "next/server";
import { isLivePhaseTerminal } from "@pitchlab/contracts";
import { getLiveMatchDetail, liveCacheControl } from "../../../../../src/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }): Promise<NextResponse> {
  const { gameId } = await params;
  if (!GAME_ID_RE.test(gameId)) {
    return NextResponse.json({ error: "Partido no válido" }, { status: 400 });
  }
  const detail = await getLiveMatchDetail(gameId);
  if (!detail) {
    return NextResponse.json({ error: "Partido sin marcador en vivo" }, { status: 404 });
  }
  return NextResponse.json(detail, {
    headers: { "Cache-Control": liveCacheControl(detail.nextPollSeconds, isLivePhaseTerminal(detail.entry.phase)) },
  });
}
