import { NextResponse } from "next/server";
import { getLiveScoreboard, liveCacheControl } from "../../../../src/server/live";

export const runtime = "nodejs";
// La respuesta es la misma para todos (marcadores públicos): el CDN la comparte con `s-maxage`.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const board = await getLiveScoreboard();
  return NextResponse.json(board, {
    headers: { "Cache-Control": liveCacheControl(board.nextPollSeconds, false) },
  });
}
