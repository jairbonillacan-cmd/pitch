import { NextResponse } from "next/server";
import { disconnectX, memberProfile } from "@pitchlab/db";
import { getAuth } from "../../../../../src/server/auth";
import { requireMember } from "../../../../../src/server/session-user";
import { twitterCredentials } from "../../../../../src/server/twitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = getAuth();
  if (!auth || !twitterCredentials()) {
    return NextResponse.json({ error: "x_no_disponible" }, { status: 503 });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "origen_invalido" }, { status: 403 });
  }
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const profile = await memberProfile(member.db, member.userId);
  if (!profile?.handle) return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
  if (profile.xUsername) return NextResponse.json({ error: "x_ya_conectada" }, { status: 409 });
  const path = `/app/u/${profile.handle}`;
  return auth.api.linkSocialAccount({
    headers: request.headers,
    body: {
      provider: "twitter",
      callbackURL: `${path}?x=conectada`,
      errorCallbackURL: `${path}?x=error`,
      disableRedirect: true,
    },
    asResponse: true,
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  await disconnectX(member.db, member.userId);
  return new Response(null, { status: 204 });
}
