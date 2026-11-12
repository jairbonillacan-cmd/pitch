import { NextResponse, after } from "next/server";
import {
  authAccount,
  completeSignup,
  eq,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  signupCompleted,
  users,
} from "@pitchlab/db";
import { normalizeTrialEmail } from "@pitchlab/ui";
import { startAccountEmails } from "../../../../src/server/account-emails";
import { getMailer } from "../../../../src/server/mailer";
import { requireMember } from "../../../../src/server/session-user";
import { parseSignupBody, trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ¿Ya completó el paso 2 del registro? */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  return NextResponse.json({
    completed: await signupCompleted(member.db, member.userId),
    email: member.email,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Guarda fecha de nacimiento y consentimientos; concede la prueba y registra el referido. */
export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const body = parseSignupBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });

  if (body.email && body.email !== member.email.toLowerCase()) {
    return NextResponse.json({ error: "cuenta_distinta" }, { status: 403 });
  }
  const { db, userId } = member;
  const [profile] = await db
    .select({ email: users.email, authUserId: users.authUserId })
    .from(users)
    .where(eq(users.id, userId));
  if (!profile) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const accounts = profile.authUserId
    ? await db.select({ providerId: authAccount.providerId }).from(authAccount).where(eq(authAccount.userId, profile.authUserId))
    : [];
  const provider = accounts.some((a) => a.providerId === "google")
    ? "google"
    : accounts.some((a) => a.providerId === "apple")
      ? "apple"
      : "email";

  const trialOn = await getBoolFlag(db, FLAG_MONTH1_NO_CARD, true);
  const result = await completeSignup(db, {
    userId,
    displayName: body.displayName,
    handle: body.handle,
    birthDate: body.birthDate,
    termsVersion: body.termsVersion,
    analyticsConsent: body.analyticsConsent,
    marketingConsent: body.marketingConsent,
    referralCode: body.referralCode,
    trial: trialOn
      ? {
          canonicalEmail: normalizeTrialEmail(profile.email),
          provider,
          ...trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? ""),
        }
      : null,
    now: new Date(),
  });

  if (!result.ok) {
    const status =
      result.reason === "menor_de_edad" ? 403 : result.reason === "usuario_ocupado" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  // Bienvenida y avisos de la prueba. Va después de responder: un fallo de correo no rompe el registro.
  // Es seguro repetirlo: cada correo se reserva una sola vez por persona.
  after(() =>
    startAccountEmails(db, getMailer(), {
      userId,
      email: profile.email,
      displayName: body.displayName,
      trialGranted: result.trial === "concedida",
      now: new Date(),
    }).catch((error) => console.error("[correo] registro:", error)),
  );
  return NextResponse.json(result);
}
