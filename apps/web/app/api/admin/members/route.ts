import { NextResponse } from "next/server";
import { adminFindMembersWithGrants } from "@pitchlab/db";
import { requireAdmin } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/members?q=... — busca socios por correo, `@usuario` o nombre y lista sus concesiones. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const rows = await adminFindMembersWithGrants(admin.db, q, new Date(), 25);

  const members = rows.map((m) => ({
    id: m.id,
    email: m.email,
    handle: m.handle,
    displayName: m.displayName,
    isAmbassador: m.isAmbassador,
    createdAtIso: m.createdAt.toISOString(),
    accessUntilIso: m.accessUntil ? m.accessUntil.toISOString() : null,
    activeSourceKind: m.activeSourceKind,
    grants: m.grants.map((g) => ({
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

  return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
}
