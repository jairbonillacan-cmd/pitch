import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { getLiveScoreboard } from "../../../../src/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  {
    bucket: "live-scoreboard",
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  async () => {
    const board = await getLiveScoreboard();
    return NextResponse.json(board);
  },
);
