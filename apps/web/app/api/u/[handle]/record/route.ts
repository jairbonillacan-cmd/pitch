import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { checkHandleFormat } from "@pitchlab/db";
import {
  withPublicRead,
  type PublicReadContext,
} from "../../../../../src/server/api-guards";
import { loadPublicRecord } from "../../../../../src/server/public-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUBLIC_RECORD_PICKS = 40;

function parseBoundedPickLimit(request: Request): number {
  const rawLimit = new URL(request.url).searchParams.get("limit");
  if (!rawLimit) return MAX_PUBLIC_RECORD_PICKS;
  const parsed = parseStrictFiniteNumber(rawLimit);
  if (parsed === null || parsed < 1) return MAX_PUBLIC_RECORD_PICKS;
  return Math.min(MAX_PUBLIC_RECORD_PICKS, Math.trunc(parsed));
}

export const GET = withPublicRead(
  {
    bucket: "public-record",
    limit: 60,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ request, params }: PublicReadContext<{ handle: string }>) => {
    const rawHandle = typeof params.handle === "string" ? params.handle.slice(0, 40) : "";
    const handleCheck = checkHandleFormat(rawHandle);
    if (!handleCheck.ok) {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    const record = await loadPublicRecord(handleCheck.handle);
    if (!record) {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    if (record.hidden) {
      return NextResponse.json(record, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    }

    const maxPicks = parseBoundedPickLimit(request);
    const boundedRecord = {
      ...record,
      view: {
        ...record.view,
        settledPicks: record.view.settledPicks
          ? record.view.settledPicks.slice(0, maxPicks)
          : null,
      },
    };

    return NextResponse.json(boundedRecord, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  },
);
