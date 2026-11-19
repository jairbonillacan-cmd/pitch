import { NextResponse } from "next/server";
import { eq, recordMemberInboxMessage, users } from "@pitchlab/db";
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

/** POST /api/me/feedback — registra Feedback e ideas o Contactar con soporte en bandeja Admin + correo. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-feedback",
    key: member.userId,
    limit: 10,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    category?: unknown;
    subject?: unknown;
    message?: unknown;
  } | null;

  const kind = body?.kind === "support" ? "support" : "feedback";
  const category = typeof body?.category === "string" ? body.category.trim().slice(0, 60) : null;
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 120) : null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1500) : "";

  if (message.length < 6) {
    return NextResponse.json(
      { error: "Cuéntanos con un poco más de detalle (al menos 6 caracteres)." },
      { status: 400 },
    );
  }

  const [user] = await member.db
    .select({ handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, member.userId))
    .limit(1);

  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  const saved = await recordMemberInboxMessage(member.db, {
    userId: member.userId,
    email: member.email,
    handle: user?.handle ?? null,
    displayName: user?.displayName ?? null,
    kind,
    category,
    subject,
    message,
    ipSubnetHash,
  });

  const adminRecipient = process.env.PITCHLAB_SUPPORT_EMAIL?.trim() || supportEmail();
  const handleText = user?.handle ? `@${user.handle}` : member.email;
  const label = kind === "feedback" ? "Feedback e ideas" : "Soporte PitchLab";

  try {
    await getMailer().send({
      to: adminRecipient,
      replyTo: member.email,
      subject: `[${label}] ${subject || handleText}`,
      html: `<p><strong>${escapeHtml(label)}</strong> de ${escapeHtml(handleText)} (${escapeHtml(member.email)})</p>
${category ? `<p><strong>Categoría:</strong> ${escapeHtml(category)}</p>` : ""}
${subject ? `<p><strong>Asunto:</strong> ${escapeHtml(subject)}</p>` : ""}
<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
      text: `${label} — ${handleText} (${member.email})\n${category ? `Categoría: ${category}\n` : ""}${subject ? `Asunto: ${subject}\n` : ""}\n${message}`,
      idempotencyKey: `inbox:${saved.id}`,
      tags: [{ name: "tipo", value: kind }],
    });
  } catch (err) {
    console.error("[correo] no se pudo notificar mensaje de bandeja:", err);
  }

  return NextResponse.json(
    {
      ok: true,
      id: saved.id,
      createdAtIso: saved.createdAt.toISOString(),
      message:
        kind === "feedback"
          ? "¡Gracias! Tu idea llegó directo al equipo de PitchLab."
          : "Recibimos tu mensaje. El equipo de PitchLab te responderá pronto.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
