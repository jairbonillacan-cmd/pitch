import { NextResponse } from "next/server";
import { recordSocialPostPickCopy } from "@pitchlab/db";
import { reasonResponse, requireSocialMember } from "../../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Incrementa el conteo de socios que siguieron este pick en su bitácora. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reasonResponse("no_existe");
  const result = await recordSocialPostPickCopy(member.db, member.userId, id);
  if (!result.ok) return reasonResponse(result.reason);
  return NextResponse.json({ copiesCount: result.copiesCount });
}
