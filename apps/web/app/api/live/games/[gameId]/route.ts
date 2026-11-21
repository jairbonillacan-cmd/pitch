import { NextResponse } from "next/server";
import { isLivePhaseTerminal } from "@pitchlab/contracts";
import { getLiveMatchDetail, liveCacheControl } from "../../../../../src/server/live";
import { getViewerAccess } from "../../../../../src/server/viewer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }): Promise<NextResponse> {
  const { gameId } = await params;
  if (!GAME_ID_RE.test(gameId)) {
    return NextResponse.json({ error: "Partido no válido" }, { status: 400 });
  }
  const [detail, access] = await Promise.all([getLiveMatchDetail(gameId), getViewerAccess()]);
  if (!detail) {
    return NextResponse.json({ error: "Partido sin marcador en vivo" }, { status: 404 });
  }

  // Cero-Fuga: nunca exponer `inPlayWinProb` en caché pública ni a visitantes sin pase vigente.
  if (!access.fullAccess && detail.inPlayWinProb) {
    const { inPlayWinProb: _redacted, ...publicDetail } = detail;
    return NextResponse.json(publicDetail, {
      headers: { "Cache-Control": liveCacheControl(detail.nextPollSeconds, isLivePhaseTerminal(detail.entry.phase)) },
    });
  }

  const headers: Record<string, string> = detail.inPlayWinProb
    ? { "Cache-Control": "private, no-store" }
    : { "Cache-Control": liveCacheControl(detail.nextPollSeconds, isLivePhaseTerminal(detail.entry.phase)) };

  return NextResponse.json(detail, { headers });
}
