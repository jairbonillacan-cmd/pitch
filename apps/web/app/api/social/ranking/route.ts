import { NextResponse } from "next/server";
import { LEADERBOARD_MIN_SETTLED, LEADERBOARD_MIN_SETTLED_WEEK } from "@pitchlab/ui/ranking";
import { loadRankingRows } from "../../../../src/server/ranking";
import { checkEndpointRateLimit, rateLimitResponse } from "../../../../src/server/request-security";
import { requireSocialMember } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — ranking de Comunidad de 7 y 30 días. Solo socios que eligieron aparecer; viajan
 * cifras agregadas (saldo, cumplidos, ventaja contra el cierre), nunca picks ni pesos.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const rl = await checkEndpointRateLimit({ bucket: "social-ranking", key: member.userId, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
  const rows = await loadRankingRows(member.db);
  return NextResponse.json(
    { ok: true, rows, minSettled: { "7d": LEADERBOARD_MIN_SETTLED_WEEK, "30d": LEADERBOARD_MIN_SETTLED } },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
