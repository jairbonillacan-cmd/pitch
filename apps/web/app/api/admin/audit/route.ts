import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listAdminAuditLogs } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

export const GET = withAdminMutation(
  { bucket: "admin-audit", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const entries = await listAdminAuditLogs(user.db, limit);
    return NextResponse.json({ entries });
  },
);
