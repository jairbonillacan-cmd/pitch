import { NextResponse } from "next/server";
import { listFollowedGames, setFollowedGame } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireActivePaseMember, requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** «Siguiendo»: partidos que el socio sigue, guardados en Neon (sirve en todos sus dispositivos). */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const follows = await listFollowedGames(member.db, member.userId);
  return NextResponse.json({ gameIds: follows.map((f) => f.gameId), follows });
}

function readAlerts(raw: unknown): { kickoff?: boolean; goals?: boolean; final?: boolean } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  const out: { kickoff?: boolean; goals?: boolean; final?: boolean } = {};
  for (const key of ["kickoff", "goals", "final"] as const) {
    if (typeof a[key] === "boolean") out[key] = a[key];
  }
  return out;
}

export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;
  const body = (await request.json().catch(() => null)) as
    | { gameId?: unknown; watched?: unknown; alerts?: unknown }
    | null;
  if (!body || typeof body.gameId !== "string" || typeof body.watched !== "boolean") {
    return NextResponse.json({ error: "Se esperaba { gameId, watched }" }, { status: 400 });
  }
  const result = await setFollowedGame(member.db, member.userId, body.gameId, body.watched, readAlerts(body.alerts));
  if (!result.ok) return NextResponse.json({ error: "Partido no válido" }, { status: 400 });
  const follows = await listFollowedGames(member.db, member.userId);
  return NextResponse.json({ gameIds: follows.map((f) => f.gameId), follows });
}
