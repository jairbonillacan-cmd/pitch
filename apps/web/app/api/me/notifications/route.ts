import { NextResponse } from "next/server";
import { listSocialNotifications } from "@pitchlab/db";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const notifications = await listSocialNotifications(member.db, member.userId, 50);
  return NextResponse.json({ notifications });
}
