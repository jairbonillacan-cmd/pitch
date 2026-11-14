import { NextResponse } from "next/server";
import { winnerVoteTallies } from "@pitchlab/db";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";
import { checkEndpointRateLimit, rateLimitResponse } from "../../../../src/server/request-security";
import { requireSocialMember } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — votos de «¿Quién gana?» de los partidos por jugar, para el consenso de Comunidad. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const rl = await checkEndpointRateLimit({ bucket: "social-consensus", key: member.userId, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
  const upcoming = buildServerRawPlatformDataset()
    .games.filter((g) => g.status === "NS")
    .map((g) => g.id);
  const tallies = await winnerVoteTallies(member.db, upcoming);
  return NextResponse.json({ ok: true, tallies }, { headers: { "Cache-Control": "private, max-age=60" } });
}
