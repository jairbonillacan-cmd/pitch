import { NextResponse } from "next/server";
import {
  withSessionRead,
  type SessionReadContext,
} from "../../../../../src/server/api-guards";
import { loadGamePreviewPayload } from "../../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

type GamePreviewParams = { gameId: string };

function safeDecodeParam(raw: string | undefined, maxLen: number): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (!decoded || decoded.length > maxLen || CONTROL_CHAR_RE.test(decoded)) {
      return null;
    }
    return decoded;
  } catch (err) {
    void err;
    return null;
  }
}

export const GET = withSessionRead(
  {
    bucket: "game-preview",
    limit: 60,
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
    resourceKey: ({ params }: { request: Request; params: GamePreviewParams }) =>
      String(params.gameId ?? ""),
  },
  async ({ params, access }: SessionReadContext<GamePreviewParams>) => {
    const gameId = safeDecodeParam(params.gameId, 160);
    if (!gameId) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const payload = await loadGamePreviewPayload(gameId, access.fullAccess);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  },
);
