import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { adminAuditLogs, eq, users } from "@pitchlab/db";
import { supportEmail } from "@pitchlab/emails";
import { withMemberMutation } from "../../../../src/server/api-guards";
import { getMailer } from "../../../../src/server/mailer";
import { logSecurityEvent } from "../../../../src/server/safe-logger";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DeletionRequestBodySchema = z
  .object({
    reason: z.string().max(2000).nullable().optional(),
  })
  .strict();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const POST = withMemberMutation(
  { bucket: "me-deletion-request", limit: 3, windowMs: 86_400_000 },
  async ({ request, user }) => {
    const raw: unknown = await request.json().catch(() => null);
    const parsed = DeletionRequestBodySchema.safeParse(raw);
    if (!parsed.success) {
      const sanitized = createSanitizedErrorPayload(
        "VALIDATION_ERROR",
        "Datos de solicitud inválidos.",
      );
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    const reason = parsed.data.reason ? parsed.data.reason.trim().slice(0, 500) : "";

    const [profile] = await user.db
      .select({
        email: users.email,
        handle: users.handle,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    const now = new Date();
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");

    await user.db.insert(adminAuditLogs).values({
      actorUserId: user.userId,
      actorEmail: user.email,
      action: "member_deletion_request",
      targetKey: user.userId,
      payloadJson: {
        handle: profile?.handle ?? null,
        displayName: profile?.displayName ?? null,
        reason: reason || null,
        requestedAtIso: now.toISOString(),
      },
      ipSubnetHash,
    });

    const adminRecipient = process.env.PITCHLAB_SUPPORT_EMAIL?.trim() || supportEmail();
    const handleText = profile?.handle ? `@${profile.handle}` : user.userId;
    try {
      await getMailer().send({
        to: adminRecipient,
        replyTo: user.email,
        subject: `Solicitud de baja y borrado de datos · ${handleText}`,
        html: `<p>Un socio solicitó la baja y eliminación de su cuenta en PitchLab:</p>
<ul>
  <li><strong>Usuario:</strong> ${escapeHtml(handleText)} (${escapeHtml(user.email)})</li>
  <li><strong>ID:</strong> ${escapeHtml(user.userId)}</li>
  <li><strong>Fecha:</strong> ${escapeHtml(now.toISOString())}</li>
  <li><strong>Motivo indicado:</strong> ${escapeHtml(reason || "Sin especificar")}</li>
</ul>
<p>Plazo operativo: máximo 72 horas hábiles.</p>`,
        text: `Solicitud de baja y borrado de datos\nUsuario: ${handleText} (${user.email})\nID: ${user.userId}\nFecha: ${now.toISOString()}\nMotivo: ${reason || "Sin especificar"}\nPlazo máximo: 72 horas hábiles.`,
        idempotencyKey: `deletion-req:${user.userId}:${now.toISOString().slice(0, 13)}`,
        tags: [{ name: "tipo", value: "member_deletion_request" }],
      });
    } catch (err) {
      logSecurityEvent("warn", "deletion_request_email_failed", {
        userId: user.userId,
        error: err,
      });
    }

    return NextResponse.json({
      ok: true,
      requestedAtIso: now.toISOString(),
      message:
        "Solicitud registrada; procesamos la baja y borrado en un máximo de 72 horas hábiles.",
    });
  },
);
