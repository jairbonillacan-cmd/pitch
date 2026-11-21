import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listSocialNotifications } from "@pitchlab/db";
import { withSessionRead } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTIFICATIONS_LIMIT_MAX = 40;

export const GET = withSessionRead(
  {
    bucket: "me-notifications-read",
    limit: 60,
    windowMs: 60_000,
    allowBeta: false,
  },
  async ({ request, user }) => {
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const parsedLimit = rawLimit === null ? null : parseStrictFiniteNumber(rawLimit);
    const limit =
      parsedLimit !== null && parsedLimit >= 1
        ? Math.min(Math.trunc(parsedLimit), NOTIFICATIONS_LIMIT_MAX)
        : NOTIFICATIONS_LIMIT_MAX;
    const notifications = await listSocialNotifications(user.db, user.userId, limit);
    return NextResponse.json({ notifications });
  },
);
