import { NextResponse } from "next/server";
import { suggestHandles } from "@pitchlab/db";
import { getAuth } from "../../../../src/server/auth";
import { profileIdForAuthUser } from "../../../../src/server/member-data";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../src/server/request-security";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sugiere 3 `@usuario` válidos y libres: `GET /api/handles/suggest?name=…`
 * Nunca lee correo de la URL; solo toma el correo o nombre de la sesión activa.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = getAuth();
  const session = auth
    ? await auth.api.getSession({ headers: request.headers }).catch(() => null)
    : null;

  const rateKey = session?.user?.id
    ? `user:${session.user.id}`
    : `ip:${trustedClientIp(request.headers) || "local"}`;

  const rl = await checkEndpointRateLimit({
    bucket: "handles-suggest",
    key: rateKey,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const db = serverDb();
  if (!db) {
    return NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 });
  }

  const rawName = new URL(request.url).searchParams.get("name")?.slice(0, 60) ?? "";
  const bases = [rawName, session?.user?.name ?? "", session?.user?.email ?? ""]
    .map((value) => value.trim())
    .filter(Boolean);

  const ownId = session?.user?.id
    ? ((await profileIdForAuthUser(db, session.user.id)) ?? undefined)
    : undefined;

  const suggestions = await suggestHandles(db, bases, 3, { exceptUserId: ownId });

  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
