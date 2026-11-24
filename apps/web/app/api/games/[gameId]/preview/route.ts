import { NextResponse } from "next/server";
import {
  withSessionRead,
  type SessionReadContext,
} from "../../../../../src/server/api-guards";
import { buildServerTimingHeader, nowPerfMs } from "../../../../../src/server/perf-cache";
import { loadGamePreviewSerializedJson } from "../../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ID_RE = /^[A-Za-z0-9._:+-]+$/;

type GamePreviewParams = { gameId: string };

function validateSafeId(raw: string | undefined, maxLen: number): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maxLen ||
    trimmed.includes("..") ||
    !SAFE_ID_RE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export const GET = withSessionRead(
  {
    bucket: "game-preview",
    limit: 60,
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
    resourceKey: ({ params }: { request: Request; params: GamePreviewParams }) =>
      validateSafeId(params.gameId, 160) ?? "invalid",
  },
  async ({ params, access }: SessionReadContext<GamePreviewParams>) => {
    const gameId = validateSafeId(params.gameId, 160);
    if (!gameId) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const startedAt = nowPerfMs();
    const jsonBody = await loadGamePreviewSerializedJson(gameId, access.fullAccess);
    const serverTiming = buildServerTimingHeader([
      { stage: "preview", durationMs: nowPerfMs() - startedAt },
    ]);
    if (!jsonBody) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "private, no-store",
            ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
          },
        },
      );
    }

    return new NextResponse(jsonBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
      },
    });
  },
);
