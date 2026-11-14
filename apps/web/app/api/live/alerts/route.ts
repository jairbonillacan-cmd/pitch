import { NextResponse } from "next/server";
import { listLiveAlertsForUser } from "@pitchlab/db";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/**
 * Avisos de inicio, gol, medio tiempo y final de los partidos que el socio sigue. Los detecta el
 * lector en vivo del servidor; el navegador solo pregunta aquí (privado, sin caché compartida).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const sinceRaw = new URL(request.url).searchParams.get("since");
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : Number.NaN;
  // Nunca más de 2 días atrás.
  const floor = Date.now() - 2 * DAY_MS;
  const since = new Date(Number.isFinite(sinceMs) ? Math.max(sinceMs, floor) : floor);
  const alerts = await listLiveAlertsForUser(member.db, member.userId, since, 50);
  return NextResponse.json({ alerts }, { headers: { "Cache-Control": "private, no-store" } });
}
