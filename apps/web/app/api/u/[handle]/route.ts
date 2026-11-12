import { NextResponse } from "next/server";
import { loadPublicMemberProfile } from "../../../../src/server/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }): Promise<NextResponse> {
  const profile = await loadPublicMemberProfile((await params).handle);
  if (!profile) return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
  return NextResponse.json(profile);
}
