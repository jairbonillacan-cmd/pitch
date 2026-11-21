import { NextResponse } from "next/server";
import { winnerVoteTallies } from "@pitchlab/db";
import { withSessionRead } from "../../../../src/server/api-guards";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  {
    bucket: "social-consensus",
    limit: 30,
    windowMs: 60_000,
    requireSocialHandle: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  async ({ user }) => {
    const upcoming = buildServerRawPlatformDataset()
      .games.filter((g) => g.status === "NS")
      .map((g) => g.id);
    const tallies = await winnerVoteTallies(user.db, upcoming);
    return NextResponse.json({ ok: true, tallies });
  },
);
