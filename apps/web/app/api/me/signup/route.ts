import { NextResponse, after } from "next/server";
import {
  authAccount,
  authSession,
  completeSignup,
  eq,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  signupCompleted,
  users,
} from "@pitchlab/db";
import { isDisposableEmailDomain, normalizeTrialEmail } from "@pitchlab/contracts";
import { startAccountEmails } from "../../../../src/server/account-emails";
import { getAuth } from "../../../../src/server/auth";
import { getMailer } from "../../../../src/server/mailer";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireStep1Member } from "../../../../src/server/session-user";
import { parseSignupBody, trialHashes } from "../../../../src/server/signup";
import { verifyTurnstile } from "../../../../src/server/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ¿Ya completó el paso 2 del registro? */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireStep1Member(request);
  if ("error" in member) return member.error;
  return NextResponse.json(
    {
      completed: await signupCompleted(member.db, member.userId),
      email: member.email,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Guarda fecha de nacimiento y consentimientos; concede la prueba y registra el referido. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireStep1Member(request);
  if ("error" in member) return member.error;

  const remoteIp = trustedClientIp(request.headers);
  const rl = await checkEndpointRateLimit({
    bucket: "signup-step2",
    key: `${member.userId}:${remoteIp || "local"}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

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

  if (isDisposableEmailDomain(profile.email)) {
    return NextResponse.json({ error: "correo_desechable" }, { status: 400 });
  }

  let turnstileRayId: string | null = null;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const requireSignupTurnstile =
    Boolean(turnstileSecret) &&
    (Boolean(body.turnstileToken) ||
      (process.env.NODE_ENV === "production" && process.env.PITCHLAB_REQUIRE_SIGNUP_TURNSTILE === "1"));
  if (requireSignupTurnstile) {
    const captchaCheck = await verifyTurnstile(body.turnstileToken, {
      secret: turnstileSecret,
      ...(remoteIp ? { remoteIp } : {}),
    });
    if (!captchaCheck.ok) {
      return NextResponse.json({ error: "verificacion_humana_requerida" }, { status: 403 });
    }
    turnstileRayId = captchaCheck.rayId ?? null;
  }

  const accounts = profile.authUserId
    ? await db
        .select({ providerId: authAccount.providerId })
        .from(authAccount)
        .where(eq(authAccount.userId, profile.authUserId))
    : [];
  const provider = accounts.some((a) => a.providerId === "google") ? "google" : "email";

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
          turnstileRayId,
        }
      : null,
    now: new Date(),
  });

  if (!result.ok) {
    if (result.reason === "menor_de_edad") {
      await db.delete(authSession).where(eq(authSession.userId, member.authUserId));
      const response = NextResponse.json({ error: result.reason }, { status: 403 });
      try {
        const auth = getAuth();
        if (auth) {
          const signOutRes = await auth.api.signOut({ headers: request.headers, asResponse: true });
          for (const setCookie of signOutRes.headers.getSetCookie()) {
            response.headers.append("set-cookie", setCookie);
          }
        }
      } catch (err) {
        void err;
      }
      for (const cookieName of ["better-auth.session_token", "__Secure-better-auth.session_token"]) {
        response.cookies.set({
          name: cookieName,
          value: "",
          httpOnly: true,
          secure: cookieName.startsWith("__Secure-") || process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }
      return response;
    }
    const status = result.reason === "usuario_ocupado" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

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
