import { NextResponse } from "next/server";
import { eq, myReferrals, tipsterProfiles, users } from "@pitchlab/db";
import { withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  { bucket: "me-referrals", allowBeta: false },
  async ({ user }) => {
    const [referrals, [u], [tipster]] = await Promise.all([
      myReferrals(user.db, user.userId),
      user.db
        .select({
          handle: users.handle,
          displayName: users.displayName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, user.userId))
        .limit(1),
      user.db
        .select({ userId: tipsterProfiles.userId })
        .from(tipsterProfiles)
        .where(eq(tipsterProfiles.userId, user.userId))
        .limit(1),
    ]);
    return NextResponse.json({
      ...referrals,
      handle: u?.handle ?? null,
      displayName: u?.displayName ?? null,
      email: u?.email ?? null,
      avatarUrl: u?.avatarUrl ?? null,
      isTipster: Boolean(tipster),
    });
  },
);
