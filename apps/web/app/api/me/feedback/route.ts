import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { eq, recordMemberInboxMessage, users } from "@pitchlab/db";
import { supportEmail } from "@pitchlab/emails";
import { withMemberMutation } from "../../../../src/server/api-guards";
import { getMailer } from "../../../../src/server/mailer";
import { logSecurityEvent } from "../../../../src/server/safe-logger";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FeedbackBodySchema = z
  .object({
    kind: z.enum(["feedback", "support"]).optional(),
    category: z.string().max(120).nullable().optional(),
    subject: z.string().max(200).nullable().optional(),
    message: z.string().max(3_000),
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
  { bucket: "me-feedback", limit: 10, windowMs: 3_600_000 },
  async ({ request, user }) => {
    const raw = await request.json().catch(() => null);
    const parsed = FeedbackBodySchema.safeParse(raw);
    if (!parsed.success) {
      const sanitized = createSanitizedErrorPayload(
        "VALIDATION_ERROR",
        "Cuéntanos con un poco más de detalle (al menos 6 caracteres).",
      );
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    const kind = parsed.data.kind ?? "feedback";
    const category = parsed.data.category?.trim().slice(0, 60) || null;
    const subject = parsed.data.subject?.trim().slice(0, 120) || null;
    const message = parsed.data.message.trim().slice(0, 1_500);

    if (message.length < 6) {
      const sanitized = createSanitizedErrorPayload(
        "VALIDATION_ERROR",
        "Cuéntanos con un poco más de detalle (al menos 6 caracteres).",
      );
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    const [profile] = await user.db
      .select({ handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const saved = await recordMemberInboxMessage(user.db, {
      userId: user.userId,
      email: user.email,
      handle: profile?.handle ?? null,
      displayName: profile?.displayName ?? null,
      kind,
      category,
      subject,
      message,
      ipSubnetHash,
    });

    const adminRecipient = process.env.PITCHLAB_SUPPORT_EMAIL?.trim() || supportEmail();
    const handleText = profile?.handle ? `@${profile.handle}` : user.email;
    const label = kind === "feedback" ? "Feedback e ideas" : "Soporte PitchLab";

    try {
      await getMailer().send({
        to: adminRecipient,
        replyTo: user.email,
        subject: `[${label}] ${subject || handleText}`,
        html: `<p><strong>${escapeHtml(label)}</strong> de ${escapeHtml(handleText)} (${escapeHtml(user.email)})</p>
${category ? `<p><strong>Categoría:</strong> ${escapeHtml(category)}</p>` : ""}
${subject ? `<p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>` : ""}
<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
        text: `${label} — ${handleText} (${user.email})\n${category ? `Categoría: ${category}\n` : ""}${subject ? `Asunto: ${subject}\n` : ""}\n${message}`,
        idempotencyKey: `inbox:${saved.id}`,
        tags: [{ name: "tipo", value: kind }],
      });
    } catch (err) {
      logSecurityEvent("warn", "feedback_email_failed", {
        userId: user.userId,
        kind,
        error: err,
      });
    }

    return NextResponse.json({
      ok: true,
      id: saved.id,
      createdAtIso: saved.createdAt.toISOString(),
      message:
        kind === "feedback"
          ? "¡Gracias! Tu idea llegó directo al equipo de PitchLab."
          : "Recibimos tu mensaje. El equipo de PitchLab te responderá pronto.",
    });
  },
);
