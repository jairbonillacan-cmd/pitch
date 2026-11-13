import { NextResponse } from "next/server";
import { memberProfile, updateMemberProfile } from "@pitchlab/db";
import { parseProfileChanges } from "../../../../src/server/profile";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileMissing = () => NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const profile = await memberProfile(member.db, member.userId);
  return profile ? NextResponse.json(profile, noStore) : profileMissing();
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const body = parseProfileChanges(await request.json().catch(() => null));
  if ("error" in body) return NextResponse.json(body, { status: 400 });
  const result = await updateMemberProfile(member.db, member.userId, body.changes);
  if (result.status === "missing") return profileMissing();
  if (result.status === "taken") return NextResponse.json({ error: "usuario_ocupado" }, { status: 409 });
  return NextResponse.json(result.profile, noStore);
}
