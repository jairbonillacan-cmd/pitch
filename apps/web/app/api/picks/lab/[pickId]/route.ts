import { NextResponse } from "next/server";
import {
  withSessionRead,
  type SessionReadContext,
} from "../../../../../src/server/api-guards";
import { loadPickEvidenceLabData } from "../../../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

type PickLabParams = { pickId: string };

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
    bucket: "picks-lab",
    limit: 60,
    allowBetaPin: true,
    watermark: true,
    cacheControl: "private, no-store",
    resourceKey: ({ params }: { request: Request; params: PickLabParams }) =>
      String(params.pickId ?? ""),
  },
  async ({ params, access }: SessionReadContext<PickLabParams>) => {
    const pickId = safeDecodeParam(params.pickId, 220);
    if (!pickId) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const payload = await loadPickEvidenceLabData(pickId, access.fullAccess);
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
