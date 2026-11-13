import { NextResponse } from "next/server";
import { checkHandleFormat, createDb, isHandleAvailable, type Db } from "@pitchlab/db";
import { getAuth } from "../../../../src/server/auth";
import { profileIdForAuthUser } from "../../../../src/server/member-data";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
} from "../../../../src/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let db: Db | null = null;

/**
 * ¿Está libre este usuario? `GET /api/handles/check?h=ana_lopez`
 * Responde `{ ok: true }` o `{ ok: false, reason: "formato" | "reservado" | "ocupado" }`.
 * Con sesión, el usuario propio cuenta como libre.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rl = await checkEndpointRateLimit({
    bucket: "handles-check",
    key: trustedClientIp(request.headers) || "local",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 });
  const raw = new URL(request.url).searchParams.get("h") ?? "";
  const check = checkHandleFormat(raw.slice(0, 40));
  if (!check.ok) return NextResponse.json({ ok: false, reason: check.reason });

  db ??= createDb(url) as unknown as Db;
  let ownId: string | undefined;
  const auth = getAuth();
  if (auth) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session) ownId = (await profileIdForAuthUser(db, session.user.id)) ?? undefined;
  }
  const free = await isHandleAvailable(db, check.handle, ownId);
  return NextResponse.json(
    free ? { ok: true, handle: check.handle } : { ok: false, reason: "ocupado" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
