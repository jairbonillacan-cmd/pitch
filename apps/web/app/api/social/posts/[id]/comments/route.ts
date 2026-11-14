import { NextResponse } from "next/server";
import { addSocialComment } from "@pitchlab/db";
import { checkSocialText, reasonResponse, requireSocialMember } from "../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reasonResponse("no_existe");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = checkSocialText(body?.body, "comment");
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const result = await addSocialComment(member.db, member.userId, id, text.text, new Date());
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
