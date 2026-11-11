import { NextResponse } from "next/server";
import { listJournal, sealPick } from "../../../../src/server/member-data";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({ entries: await listJournal(member.db, member.userId) });
}

/** Sella un pick. El inicio del partido lo pone el servidor desde los snapshots, no el cliente. */
export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : null);
  const num = (k: string) => (typeof body?.[k] === "number" ? (body[k] as number) : null);
  const gameId = str("gameId");
  const pickId = str("pickId");
  if (!body || !gameId || !pickId || num("units") === null || num("userDecimal") === null || num("fairDecimal") === null) {
    return NextResponse.json({ error: "Datos del pick incompletos" }, { status: 400 });
  }
  const { findGameKickoff } = await import("../../../../src/server/game-kickoff");
  const kickoffAt = findGameKickoff(gameId);
  if (!kickoffAt) return NextResponse.json({ error: "Partido desconocido" }, { status: 404 });
  const result = await sealPick(
    member.db,
    member.userId,
    {
      pickId,
      gameId,
      leagueLabel: str("leagueLabel") ?? "",
      matchLabel: str("matchLabel") ?? "",
      pickLabel: str("pickLabel") ?? "",
      origin: str("origin") ?? "Spacetime Suite",
      units: num("units")!,
      userDecimal: num("userDecimal")!,
      fairDecimal: num("fairDecimal")!,
      kickoffAt,
      note: str("note") ?? undefined,
    },
    new Date(),
  );
  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
