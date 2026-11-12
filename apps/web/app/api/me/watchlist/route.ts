import { NextResponse } from "next/server";
import { listWatchlist, setWatched } from "../../../../src/server/member-data";
import { requireActivePaseMember, requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({ gameIds: await listWatchlist(member.db, member.userId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as { gameId?: unknown; watched?: unknown } | null;
  if (!body || typeof body.gameId !== "string" || typeof body.watched !== "boolean") {
    return NextResponse.json({ error: "Se esperaba { gameId, watched }" }, { status: 400 });
  }
  await setWatched(member.db, member.userId, body.gameId, body.watched);
  return NextResponse.json({ gameIds: await listWatchlist(member.db, member.userId) });
}
