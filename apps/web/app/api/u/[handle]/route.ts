import { NextResponse } from "next/server";
import { loadPublicMemberProfile } from "../../../../src/server/profile";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../src/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const rl = await checkEndpointRateLimit({
    bucket: "public-profile",
    key: trustedClientIp(request.headers) || "local",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const profile = await loadPublicMemberProfile((await params).handle);
  if (!profile) return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
  return NextResponse.json(profile, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
  });
}
