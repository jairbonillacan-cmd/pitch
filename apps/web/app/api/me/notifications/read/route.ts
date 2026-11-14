import { NextResponse } from "next/server";
import { markSocialNotificationsRead } from "@pitchlab/db";
import { requireMember } from "../../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ids =
    raw && Array.isArray(raw.ids)
      ? raw.ids.filter((id): id is string => typeof id === "string")
      : undefined;
  const updated = await markSocialNotificationsRead(member.db, member.userId, ids, new Date());
  return NextResponse.json({ ok: true, updated });
}
