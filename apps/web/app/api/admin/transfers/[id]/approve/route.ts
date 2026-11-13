import { NextResponse } from "next/server";
import { approveTransferRequest } from "@pitchlab/db";
import { getMailer } from "../../../../../../src/server/mailer";
import { serializeTransferRequest } from "../../../../../../src/server/member-plan";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../../../src/server/request-security";
import { requireAdmin } from "../../../../../../src/server/session-user";
import { trialHashes } from "../../../../../../src/server/signup";
import { sendTransferApprovedEmails } from "../../../../../../src/server/transfer-emails";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/transfers/[id]/approve — aprueba SPEI, suma días, dispara referidos/comisiones y recibo. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request, { requireJson: false });
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

  const body = (await request.json().catch(() => null)) as { adminNotes?: unknown } | null;
  const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes : null;
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  const now = new Date();

  const res = await approveTransferRequest(admin.db, {
    requestId: id,
    adminUserId: admin.userId,
    adminEmail: admin.email,
    paidAt: now,
    adminNotes,
    ipSubnetHash,
  });

  if (!res.ok) {
    if (res.reason === "no_encontrada") {
      return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Solo se pueden aprobar solicitudes en revisión." },
      { status: 409 },
    );
  }

  await sendTransferApprovedEmails(admin.db, getMailer(), res, now);

  return NextResponse.json({
    ok: true,
    alreadyApproved: res.alreadyApproved,
    request: serializeTransferRequest(res.request),
    grantId: res.grantId,
    newAccessUntilIso: res.newAccessUntil ? res.newAccessUntil.toISOString() : null,
    paidEffects: res.paidEffects,
  });
}
