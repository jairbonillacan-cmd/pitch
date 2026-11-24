import { NextResponse } from "next/server";
import {
  withSessionRead,
  type SessionReadContext,
} from "../../../../../src/server/api-guards";
import { buildServerTimingHeader, nowPerfMs } from "../../../../../src/server/perf-cache";
import { loadGamePreviewResponsePayload } from "../../../../../src/server/platform-data";

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
  async ({ request, params, access }: SessionReadContext<GamePreviewParams>) => {
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
    const wire = await loadGamePreviewResponsePayload(gameId, access.fullAccess);
    const serverTiming = buildServerTimingHeader([
      { stage: "preview", durationMs: nowPerfMs() - startedAt },
    ]);
    if (!wire) {
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

    const wantsGzip = /\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "");
    if (wantsGzip) {
      return new NextResponse(new Uint8Array(wire.gzip), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Encoding": "gzip",
          Vary: "Accept-Encoding",
          "Cache-Control": "private, no-store",
          ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
        },
      });
    }

    return new NextResponse(wire.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Vary: "Accept-Encoding",
        "Cache-Control": "private, no-store",
        ...(serverTiming ? { "Server-Timing": serverTiming } : {}),
      },
    });
  },
);
