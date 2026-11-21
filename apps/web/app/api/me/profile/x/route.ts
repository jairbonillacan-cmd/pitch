import { NextResponse } from "next/server";
import { disconnectX, memberProfile } from "@pitchlab/db";
import { withMemberMutation } from "../../../../../src/server/api-guards";
import { getAuth } from "../../../../../src/server/auth";
import { twitterCredentials } from "../../../../../src/server/twitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMemberMutation(
  { bucket: "me-profile-x", requireJson: false },
  async ({ request, user }) => {
    const auth = getAuth();
    if (!auth || !twitterCredentials()) {
      return NextResponse.json({ error: "x_no_disponible" }, { status: 503 });
    }
    const profile = await memberProfile(user.db, user.userId);
    if (!profile?.handle) {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }
    if (profile.xUsername) {
      return NextResponse.json({ error: "x_ya_conectada" }, { status: 409 });
    }
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
  },
);

export const DELETE = withMemberMutation(
  { bucket: "me-profile-x", requireJson: false },
  async ({ user }) => {
    await disconnectX(user.db, user.userId);
    return new Response(null, { status: 204 });
  },
);
