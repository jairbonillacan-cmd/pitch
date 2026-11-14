import { NextResponse } from "next/server";
import { rejectTransferRequest } from "@pitchlab/db";
import { getMailer } from "../../../../../../src/server/mailer";
import { serializeTransferRequest } from "../../../../../../src/server/member-plan";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../../src/server/session-user";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTransferRejectedEmail } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/transfers/[id]/reject — rechaza solicitud SPEI con motivo y avisa al socio. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const rl = await checkEndpointRateLimit({
    bucket: "admin-transfer-review",
    key: admin.userId,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { reason?: unknown; adminNotes?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes : null;
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  const res = await rejectTransferRequest(admin.db, {
    requestId: id,
    adminUserId: admin.userId,
    adminEmail: admin.email,
    reason,
    adminNotes,
    now: new Date(),
    ipSubnetHash,
  });

  if (!res.ok) {
    if (res.reason === "motivo_requerido") {
      return NextResponse.json(
        { error: "Escribe el motivo del rechazo (mínimo 3 caracteres)." },
        { status: 400 },
      );
    }
    if (res.reason === "no_encontrada") {
      return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Esta solicitud ya fue resuelta o cancelada." },
      { status: 409 },
    );
  }

  await sendTransferRejectedEmail(getMailer(), res);

  return NextResponse.json({
    ok: true,
    request: serializeTransferRequest(res.request),
  });
}
