import { NextResponse } from "next/server";
import { adminGrantAccessDays } from "@pitchlab/db";
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

/** POST /api/admin/access/grant — concede días manuales (`admin_grant`) con motivo y auditoría. */
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
    targetUserId?: unknown;
    days?: unknown;
    reason?: unknown;
  } | null;

  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: "Socio inválido." }, { status: 400 });
  }
  const days = typeof body?.days === "number" ? body.days : Number(body?.days);
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  const res = await adminGrantAccessDays(admin.db, {
    adminUserId: admin.userId,
    adminEmail: admin.email,
    targetUserId,
    days,
    reason,
    now: new Date(),
    ipSubnetHash,
  });

  if (!res.ok) {
    if (res.reason === "usuario_no_encontrado") {
      return NextResponse.json({ error: "No encontramos a ese socio." }, { status: 404 });
    }
    if (res.reason === "dias_invalidos") {
      return NextResponse.json({ error: "Indica entre 1 y 365 días válidos." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Escribe el motivo de la concesión (mínimo 3 caracteres)." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    grantId: res.grantId,
    newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
  });
}
