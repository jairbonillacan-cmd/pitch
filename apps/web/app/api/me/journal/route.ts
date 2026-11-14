import { NextResponse } from "next/server";
import { listJournal, sealPick } from "../../../../src/server/member-data";
import { buildServerRawPlatformDataset } from "../../../../src/server/platform-data";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireActivePaseMember, requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({ entries: await listJournal(member.db, member.userId) });
}

/**
 * Sella un pick oficial antes del inicio. El momio justo (`fairDecimal`), las etiquetas y la hora
 * de inicio provienen exclusivamente del catálogo de servidor (SEC-07), nunca del cliente.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "journal-seal",
    key: member.userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : null);
  const num = (k: string) => (typeof body?.[k] === "number" ? (body[k] as number) : null);
  const gameId = str("gameId")?.trim() ?? null;
  const pickId = str("pickId")?.trim() ?? null;
  const units = num("units");
  const userDecimal = num("userDecimal");
  if (!body || !gameId || !pickId || units === null || userDecimal === null) {
    return NextResponse.json({ error: "Datos del pick incompletos" }, { status: 400 });
  }

  const catalogGame = buildServerRawPlatformDataset().games.find((g) => g.id === gameId);
  if (!catalogGame) return NextResponse.json({ error: "Partido desconocido" }, { status: 404 });
  if (catalogGame.status !== "NS") {
    return NextResponse.json({ ok: false, reason: "partido_iniciado" }, { status: 409 });
  }
  const serverPick = catalogGame.picks.find((p) => p.id === pickId);
  if (!serverPick) {
    return NextResponse.json({ error: "Pick desconocido en el catálogo oficial" }, { status: 404 });
  }

  const { findGameKickoff } = await import("../../../../src/server/game-kickoff");
  const kickoffAt = findGameKickoff(gameId);
  if (!kickoffAt) return NextResponse.json({ error: "Partido desconocido" }, { status: 404 });

  const result = await sealPick(
    member.db,
    member.userId,
    {
      pickId: serverPick.id,
      gameId: catalogGame.id,
      leagueLabel: serverPick.leagueLabel,
      matchLabel: serverPick.matchLabel,
      pickLabel: serverPick.label,
      origin: "Spacetime Suite",
      units,
      userDecimal,
      fairDecimal: serverPick.fairDecimal,
      kickoffAt,
      note: str("note") ?? undefined,
    },
    new Date(),
  );
  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
