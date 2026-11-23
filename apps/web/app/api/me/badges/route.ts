import { NextResponse } from "next/server";
import { withSessionRead } from "../../../../src/server/api-guards";
import { loadMemberBadges } from "../../../../src/server/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSessionRead(
  { bucket: "me-badges", allowBeta: false },
  async ({ user }) => {
    const badges = await loadMemberBadges(user.db, user.userId);
    if (!badges) {
      return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      badges: badges.all,
      publicIds: badges.public.map((b) => b.id),
      featuredIds: badges.featured.map((b) => b.id),
    });
  },
);
