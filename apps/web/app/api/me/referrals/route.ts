import { NextResponse } from "next/server";
import { eq, myReferrals, tipstarProfiles, users } from "@pitchlab/db";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const [referrals, [u], [tipstar]] = await Promise.all([
    myReferrals(member.db, member.userId),
    member.db
      .select({
        handle: users.handle,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, member.userId)),
    member.db
      .select({ userId: tipstarProfiles.userId })
      .from(tipstarProfiles)
      .where(eq(tipstarProfiles.userId, member.userId)),
  ]);
  return NextResponse.json({
    ...referrals,
    handle: u?.handle ?? null,
    displayName: u?.displayName ?? null,
    email: u?.email ?? null,
    isTipstar: Boolean(tipstar),
  });
}
