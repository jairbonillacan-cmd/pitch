import { NextResponse } from "next/server";
import { z } from "zod";
import { memberProfile, updateMemberProfile } from "@pitchlab/db";
import { withMemberMutation, withSessionRead } from "../../../../src/server/api-guards";
import { parseProfileChanges } from "../../../../src/server/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProfilePatchBodySchema = z
  .object({
    displayName: z.string().max(120).optional(),
    handle: z.string().max(64).optional(),
    bio: z.string().max(1_000).nullable().optional(),
    publicProfile: z.boolean().optional(),
  })
  .strict();

function profileMissing(): NextResponse {
  return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
}

export const GET = withSessionRead(
  { bucket: "me-profile", allowBeta: false },
  async ({ user }) => {
    const profile = await memberProfile(user.db, user.userId);
    return profile ? NextResponse.json(profile) : profileMissing();
  },
);

export const PATCH = withMemberMutation(
  { bucket: "me-profile" },
  async ({ request, user }) => {
    const raw: unknown = await request.json().catch(() => null);
    const validated = ProfilePatchBodySchema.safeParse(raw);
    if (!validated.success) {
      return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
    }
    const body = parseProfileChanges(validated.data);
    if ("error" in body) {
      return NextResponse.json(body, { status: 400 });
    }
    const result = await updateMemberProfile(user.db, user.userId, body.changes);
    if (result.status === "missing") return profileMissing();
    if (result.status === "taken") {
      return NextResponse.json({ error: "usuario_ocupado" }, { status: 409 });
    }
    return NextResponse.json(result.profile);
  },
);
