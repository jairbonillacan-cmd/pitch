import { NextResponse } from "next/server";
import { LEADERBOARD_MIN_SETTLED, LEADERBOARD_MIN_SETTLED_WEEK } from "@pitchlab/ui/ranking";
import { withSessionRead } from "../../../../src/server/api-guards";
import { loadRankingRows } from "../../../../src/server/ranking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANKING_MAX_ROWS = 40;

export const GET = withSessionRead(
  {
    bucket: "social-ranking",
    limit: 30,
    windowMs: 60_000,
    requireSocialHandle: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  async ({ user }) => {
    const allRows = await loadRankingRows(user.db);
    const rows = [...allRows]
      .sort(
        (a, b) =>
          b.windows["30d"].netUnits - a.windows["30d"].netUnits ||
          b.windows["7d"].netUnits - a.windows["7d"].netUnits ||
          b.windows["30d"].settled - a.windows["30d"].settled ||
          a.handle.localeCompare(b.handle),
      )
      .slice(0, RANKING_MAX_ROWS);
    return NextResponse.json({
      ok: true,
      rows,
      minSettled: { "7d": LEADERBOARD_MIN_SETTLED_WEEK, "30d": LEADERBOARD_MIN_SETTLED },
    });
  },
);
