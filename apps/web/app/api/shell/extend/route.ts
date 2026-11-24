import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { buildServerTimingHeader, nowPerfMs } from "../../../../src/server/perf-cache";
import { loadExtendedShellSerializedJson } from "../../../../src/server/platform-data";

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
    const startedAt = nowPerfMs();
    const jsonBody = loadExtendedShellSerializedJson(access.fullAccess);
    const serverTiming = buildServerTimingHeader([
      { stage: "shell_extend", durationMs: nowPerfMs() - startedAt },
    ]);
    return new NextResponse(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
      },
    });
  },
);
