import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { buildServerTimingHeader, nowPerfMs } from "../../../../src/server/perf-cache";
import { loadExtendedShellResponsePayload } from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  {
    bucket: "shell-extend",
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  ({ request, access }) => {
    const startedAt = nowPerfMs();
    const payload = loadExtendedShellResponsePayload(access.fullAccess);
    const wantsGzip = /\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "");
    const serverTiming = buildServerTimingHeader([
      { stage: "shell_extend", durationMs: nowPerfMs() - startedAt },
    ]);
    if (wantsGzip) {
      return new NextResponse(new Uint8Array(payload.gzip), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Encoding": "gzip",
          Vary: "Accept-Encoding",
          ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
        },
      });
    }
    return new NextResponse(payload.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Vary: "Accept-Encoding",
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
      },
    });
  },
);
