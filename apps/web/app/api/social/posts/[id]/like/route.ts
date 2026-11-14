import { NextResponse } from "next/server";
import { setSocialLike } from "@pitchlab/db";
import { reasonResponse, requireSocialMember } from "../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ liked: true | false }`: pone o quita el «me gusta». */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reasonResponse("no_existe");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.liked !== "boolean") return NextResponse.json({ error: "Falta liked" }, { status: 400 });
  const result = await setSocialLike(member.db, member.userId, id, body.liked);
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ likes: result.likes, liked: body.liked });
}
