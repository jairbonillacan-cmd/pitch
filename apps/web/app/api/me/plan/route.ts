import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { loadMemberPlanSummary } from "../../../../src/server/member-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  {
    bucket: "me-plan",
    allowBeta: false,
    limit: 60,
    windowMs: 60_000,
  },
  async ({ user }) => {
    const summary = await loadMemberPlanSummary(user.db, user.userId, new Date());
    return NextResponse.json(summary);
  },
);
