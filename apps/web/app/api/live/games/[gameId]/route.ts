import { NextResponse } from "next/server";
import {
  withSessionRead,
  type SessionReadContext,
} from "../../../../../src/server/api-guards";
import { getLiveMatchDetail } from "../../../../../src/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

type LiveGameParams = { gameId: string };

export const GET = withSessionRead(
  {
    bucket: "live-game",
    allowBetaPin: true,
    watermark: true,
    resourceKey: ({ params }: { request: Request; params: LiveGameParams }) =>
      String(params.gameId ?? ""),
    cacheControl: "private, no-store",
  },
  async ({ params, access }: SessionReadContext<LiveGameParams>) => {
    const gameId = params.gameId ?? "";
    if (!GAME_ID_RE.test(gameId)) {
      return NextResponse.json({ error: "Partido no válido" }, { status: 400 });
    }
    const detail = await getLiveMatchDetail(gameId);
    if (!detail) {
      return NextResponse.json({ error: "Partido sin marcador en vivo" }, { status: 404 });
    }
    if (!access.fullAccess && detail.inPlayWinProb) {
      const { inPlayWinProb: redactedWinProb, ...publicDetail } = detail;
      void redactedWinProb;
      return NextResponse.json(publicDetail);
    }
    return NextResponse.json(detail);
  },
);
