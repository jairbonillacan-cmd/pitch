import { NextResponse } from "next/server";
import { adminAuditLogs, eq, users } from "@pitchlab/db";
import { supportEmail } from "@pitchlab/emails";
import { getMailer } from "../../../../src/server/mailer";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireMember } from "../../../../src/server/session-user";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** POST /api/me/deletion-request — registra la solicitud formal de baja y borrado de datos. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-deletion-request",
    key: member.userId,
    limit: 3,
    windowMs: 86_400_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const [user] = await member.db
    .select({
      email: users.email,
      handle: users.handle,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, member.userId))
    .limit(1);

  const now = new Date();
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

  await member.db.insert(adminAuditLogs).values({
    actorUserId: member.userId,
    actorEmail: member.email,
    action: "member_deletion_request",
    targetKey: member.userId,
    payloadJson: {
      handle: user?.handle ?? null,
      displayName: user?.displayName ?? null,
      reason: reason || null,
      requestedAtIso: now.toISOString(),
    },
    ipSubnetHash,
  });

  const adminRecipient = process.env.PITCHLAB_SUPPORT_EMAIL?.trim() || supportEmail();
  const handleText = user?.handle ? `@${user.handle}` : member.userId;
  try {
    await getMailer().send({
      to: adminRecipient,
      replyTo: member.email,
      subject: `Solicitud de baja y borrado de datos · ${handleText}`,
      html: `<p>Un socio solicitó la baja y eliminación de su cuenta en PitchLab:</p>
<ul>
  <li><strong>Usuario:</strong> ${escapeHtml(handleText)} (${escapeHtml(member.email)})</li>
  <li><strong>ID:</strong> ${escapeHtml(member.userId)}</li>
  <li><strong>Fecha:</strong> ${escapeHtml(now.toISOString())}</li>
  <li><strong>Motivo indicado:</strong> ${escapeHtml(reason || "Sin especificar")}</li>
</ul>
<p>Plazo operativo: máximo 72 horas hábiles.</p>`,
      text: `Solicitud de baja y borrado de datos\nUsuario: ${handleText} (${member.email})\nID: ${member.userId}\nFecha: ${now.toISOString()}\nMotivo: ${reason || "Sin especificar"}\nPlazo máximo: 72 horas hábiles.`,
      idempotencyKey: `deletion-req:${member.userId}:${now.toISOString().slice(0, 13)}`,
      tags: [{ name: "tipo", value: "member_deletion_request" }],
    });
  } catch (err) {
    console.error("[correo] no se pudo enviar aviso de baja:", err);
  }

  return NextResponse.json(
    {
      ok: true,
      requestedAtIso: now.toISOString(),
      message: "Solicitud registrada; procesamos la baja y borrado en un máximo de 72 horas hábiles.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
