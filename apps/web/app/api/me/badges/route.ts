import { NextResponse } from "next/server";
import { loadMemberBadges } from "../../../../src/server/badges";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/badges — todas tus insignias con su avance, cuáles ve el público y tus destacadas. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const badges = await loadMemberBadges(member.db, member.userId);
  if (!badges) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });
  return NextResponse.json(
    {
      ok: true,
      badges: badges.all,
      publicIds: badges.public.map((b) => b.id),
      featuredIds: badges.featured.map((b) => b.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
