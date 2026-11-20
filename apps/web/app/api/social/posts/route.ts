import { NextResponse } from "next/server";
import { createSocialPost, getSocialPostById, listSocialFeed } from "@pitchlab/db";
import { withAuthorBadges } from "../../../../src/server/badges";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { parseNewPost, reasonResponse, requireSocialMember } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feed de Comunidad. `?author=`, `?following=1`, `?gameId=`, `?league=`, `?openPick=1`, `?sort=most_commented`, `?before=ISO`. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const beforeDate = before ? new Date(before) : undefined;
  const sort = url.searchParams.get("sort") === "most_commented" ? "most_commented" : "recent";
  const posts = await listSocialFeed(member.db, member.userId, {
    limit: Number(url.searchParams.get("limit")) || undefined,
    before: beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined,
    authorHandle: url.searchParams.get("author") ?? undefined,
    following: url.searchParams.get("following") === "1",
    gameId: url.searchParams.get("gameId") ?? undefined,
    leagueLabel: url.searchParams.get("league") ?? undefined,
    openPickOnly: url.searchParams.get("openPick") === "1",
    sort,
  });
  return NextResponse.json({ posts: await withAuthorBadges(member.db, posts) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const originErr = verifySameOriginMutation(request, { requireJson: true });
  if (originErr) return originErr;
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseNewPost(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await createSocialPost(member.db, member.userId, parsed.post, new Date());
  if (!result.ok) return reasonResponse(result.reason);
  const post = await getSocialPostById(member.db, member.userId, result.id);
  const withBadge = post ? (await withAuthorBadges(member.db, [post]))[0] : null;
  return NextResponse.json({ post: withBadge ?? { id: result.id } }, { status: 201 });
}
