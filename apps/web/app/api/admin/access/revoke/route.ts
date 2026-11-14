import { NextResponse } from "next/server";
import { adminRevokeGrant } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../src/server/session-user";
import { trialHashes } from "../../../../../src/server/signup";
import { UUID_RE } from "../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/access/revoke — revoca una concesión activa y recorre concesiones posteriores. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const rl = await checkEndpointRateLimit({
    bucket: "admin-access-mutate",
    key: admin.userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as {
    grantId?: unknown;
    reason?: unknown;
  } | null;

  const grantId = typeof body?.grantId === "string" ? body.grantId.trim() : "";
  if (!UUID_RE.test(grantId)) {
    return NextResponse.json({ error: "Concesión inválida." }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  const res = await adminRevokeGrant(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    grantId,
    reason,
    now: new Date(),
    ipSubnetHash,
  });

  if (!res.ok) {
    if (res.reason === "motivo_requerido") {
      return NextResponse.json(
        { error: "Escribe el motivo de la revocación (mínimo 3 caracteres)." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "La concesión no existe o ya estaba revocada." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: res.userId,
    removedMs: res.removedMs,
    newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
  });
}
