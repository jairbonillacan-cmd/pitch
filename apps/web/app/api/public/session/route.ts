import { NextResponse } from "next/server";
import { withPublicRead } from "../../../../src/server/api-guards";
import { getPublicSessionStatus } from "../../../../src/server/public-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPublicRead(
  {
    bucket: "public-session",
    limit: 120,
    windowMs: 60_000,
    cacheControl: "private, no-store, max-age=0",
  },
  async () => {
    const status = await getPublicSessionStatus();
    return NextResponse.json(status);
  },
);
