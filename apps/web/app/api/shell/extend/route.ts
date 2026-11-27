import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { buildServerTimingHeader, nowPerfMs } from "../../../../src/server/perf-cache";
import {
  loadExtendedShellSerializedJson,
  type ShellExtendScope,
} from "../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveExtendScope(raw: string | null): ShellExtendScope | null {
  if (raw === null || raw.trim() === "" || raw.trim() === "base") {
    return "base";
  }
  if (raw.trim() === "parlays") {
    return "parlays";
  }
  return null;
}

export const GET = withSessionRead(
  {
    bucket: "shell-extend",
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
  },
  ({ request, access }) => {
    const scope = resolveExtendScope(new URL(request.url).searchParams.get("scope"));
    if (!scope) {
      return NextResponse.json(
        { error: "datos_invalidos" },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    const startedAt = nowPerfMs();
    const jsonBody = loadExtendedShellSerializedJson(access.fullAccess, scope);
    const serverTiming = buildServerTimingHeader([
      {
        stage: scope === "parlays" ? "shell_extend_parlays" : "shell_extend",
        durationMs: nowPerfMs() - startedAt,
      },
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
