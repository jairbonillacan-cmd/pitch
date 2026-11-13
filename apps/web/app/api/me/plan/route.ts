import { NextResponse } from "next/server";
import { loadMemberPlanSummary } from "../../../../src/server/member-plan";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const summary = await loadMemberPlanSummary(
    member.db,
    member.userId,
    new Date(),
  );
  return NextResponse.json(summary);
}
