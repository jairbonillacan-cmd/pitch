import { NextResponse } from "next/server";
import { checkHandleFormat } from "@pitchlab/db";
import {
  withPublicRead,
  type PublicReadContext,
} from "../../../../src/server/api-guards";
import { loadPublicMemberProfile } from "../../../../src/server/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPublicRead(
  {
    bucket: "public-profile",
    limit: 60,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ params }: PublicReadContext<{ handle: string }>) => {
    const rawHandle = typeof params.handle === "string" ? params.handle.slice(0, 40) : "";
    const handleCheck = checkHandleFormat(rawHandle);
    if (!handleCheck.ok) {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    const profile = await loadPublicMemberProfile(handleCheck.handle);
    if (!profile) {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    return NextResponse.json(profile, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  },
);
