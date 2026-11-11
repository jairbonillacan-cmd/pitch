import { NextResponse } from "next/server";
import { myReferrals } from "@pitchlab/db";
import { requireMember } from "../../../../src/server/session-user.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json(await myReferrals(member.db, member.userId));
}
