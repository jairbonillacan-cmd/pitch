import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { adminFindMembersWithGrants } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MEMBERS_LIMIT = 25;
const MAX_ADMIN_LIST_LIMIT = 40;
const MAX_SEARCH_QUERY_LEN = 120;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

export const GET = withAdminMutation(
  { bucket: "admin-members", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const searchParams = new URL(request.url).searchParams;
    const q = (searchParams.get("q")?.trim() ?? "").slice(0, MAX_SEARCH_QUERY_LEN);
    const limit = parseBoundedLimit(request, DEFAULT_MEMBERS_LIMIT);
    const rows = await adminFindMembersWithGrants(user.db, q, new Date(), limit);

    const members = rows.map((m) => ({
      id: m.id,
      email: m.email,
      handle: m.handle,
      displayName: m.displayName,
      isAmbassador: m.isAmbassador,
      createdAtIso: m.createdAt.toISOString(),
      accessUntilIso: m.accessUntil ? m.accessUntil.toISOString() : null,
      activeSourceKind: m.activeSourceKind,
      grants: m.grants.slice(0, MAX_ADMIN_LIST_LIMIT).map((g) => ({
        id: g.id,
        sourceKind: g.sourceKind,
        daysGranted: g.daysGranted,
        startsAtIso: g.startsAt.toISOString(),
        endsAtIso: g.endsAt.toISOString(),
        revokedAtIso: g.revokedAt ? g.revokedAt.toISOString() : null,
        revokeReason: g.revokeReason,
        note: g.note,
        createdAtIso: g.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({ members });
  },
);
