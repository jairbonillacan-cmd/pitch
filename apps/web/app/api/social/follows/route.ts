import { NextResponse } from "next/server";
import { listFollowing, setSocialFollow } from "@pitchlab/db";
import { reasonResponse, requireSocialMember } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @usuarios que sigue el socio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({ handles: await listFollowing(member.db, member.userId) });
}

/** `{ handle, follow }`: seguir o dejar de seguir. */
export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const handle = typeof body?.handle === "string" ? body.handle.replace(/^@/, "").trim() : "";
  if (!handle || typeof body?.follow !== "boolean") {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  const result = await setSocialFollow(member.db, member.userId, handle, body.follow);
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ following: result.following });
}
