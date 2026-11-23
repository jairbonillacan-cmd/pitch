import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { loadExtendedShellPayload } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  {
    bucket: "shell-extend",
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  ({ access }) => {
    const payload = loadExtendedShellPayload(access.fullAccess);
    return NextResponse.json(payload);
  },
);
