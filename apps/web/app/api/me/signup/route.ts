import { NextResponse, after } from "next/server";
import { z } from "zod";
import {
  createSanitizedErrorPayload,
  isDisposableEmailDomain,
  normalizeTrialEmail,
} from "@pitchlab/contracts";
import {
  authAccount,
  authSession,
  completeSignup,
  desc,
  eq,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  recordFunnelEvent,
  signupCompleted,
  users,
} from "@pitchlab/db";
import { startAccountEmails } from "../../../../src/server/account-emails";
import {
  ApiGuardHttpError,
  readBoundedJson,
  withMemberMutation,
  withSessionRead,
} from "../../../../src/server/api-guards";
import { getAuth } from "../../../../src/server/auth";
import { sendReferralSignedUpEmail } from "../../../../src/server/lifecycle-emails";
import { getMailer } from "../../../../src/server/mailer";
import { trustedClientIp } from "../../../../src/server/request-security";
import { logSecurityEvent } from "../../../../src/server/safe-logger";
import { parseSignupBody, trialHashes } from "../../../../src/server/signup";
import { verifyTurnstile } from "../../../../src/server/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignupRequestBodySchema = z
  .object({
    email: z.string().max(320).optional(),
    displayName: z.string().min(1).max(120),
    handle: z.string().min(1).max(64),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    consents: z
      .object({
        terms: z.literal(true),
        analytics: z.boolean().optional(),
        marketing: z.boolean().optional(),
        version: z.string().min(1).max(64),
      })
      .strict(),
    referralCode: z.string().max(64).nullable().optional(),
    turnstileToken: z.string().max(4_096).nullable().optional(),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "me-signup-read",
    allowBeta: false,
    allowIncompleteSignup: true,
  },
  async ({ user }) => {
    return NextResponse.json({
      completed: await signupCompleted(user.db, user.userId),
      email: user.email,
    });
  },
);

export const POST = withMemberMutation(
  {
    bucket: "me-signup-write",
    allowIncompleteSignup: true,
    limit: 10,
    windowMs: 15 * 60_000,
  },
  async ({ request, user }) => {
    const remoteIp = trustedClientIp(request.headers);
    const raw: unknown = await readBoundedJson(request, 32_768).catch((err) => {
      if (err instanceof ApiGuardHttpError) throw err;
      return null;
    });
    const validated = SignupRequestBodySchema.safeParse(raw);
    const body = validated.success ? parseSignupBody(validated.data) : null;
    if (!body) {
      const sanitized = createSanitizedErrorPayload("VALIDATION_ERROR", "Datos incompletos");
      return NextResponse.json(
        { ok: false, error: sanitized.message, code: sanitized.code },
        { status: 400 },
      );
    }

    if (body.email && body.email !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "cuenta_distinta" }, { status: 403 });
    }
    const { db, userId } = user;
    const [profile] = await db
      .select({ email: users.email, authUserId: users.authUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    if (isDisposableEmailDomain(profile.email)) {
      return NextResponse.json({ error: "correo_desechable" }, { status: 400 });
    }

    const accounts = profile.authUserId
      ? await db
          .select({ providerId: authAccount.providerId })
          .from(authAccount)
          .where(eq(authAccount.userId, profile.authUserId))
          .limit(20)
      : [];
    const provider = accounts.some((a) => a.providerId === "google") ? "google" : "email";

    const captchaDisabled = process.env.PITCHLAB_CAPTCHA_PROVIDER?.trim().toLowerCase() === "none";
    const turnstileSecret = captchaDisabled ? "" : (process.env.TURNSTILE_SECRET_KEY?.trim() ?? "");
    const strictSignupTurnstile =
      Boolean(turnstileSecret) &&
      process.env.NODE_ENV === "production" &&
      process.env.PITCHLAB_REQUIRE_SIGNUP_TURNSTILE === "1";

    let verifiedMagicLinkRecent = false;
    if (strictSignupTurnstile && !body.turnstileToken && provider === "email" && user.emailVerified) {
      const recentCutoffMs = Date.now() - 2 * 60 * 60_000;
      const [latestSession] = await db
        .select({ createdAt: authSession.createdAt, expiresAt: authSession.expiresAt })
        .from(authSession)
        .where(eq(authSession.userId, user.authUserId))
        .orderBy(desc(authSession.createdAt))
        .limit(1);
      if (
        latestSession &&
        latestSession.createdAt.getTime() >= recentCutoffMs &&
        latestSession.expiresAt.getTime() > Date.now()
      ) {
        verifiedMagicLinkRecent = true;
      }
    }

    let turnstileRayId: string | null = null;
    const shouldVerifyTurnstile =
      Boolean(turnstileSecret) &&
      (Boolean(body.turnstileToken) || (strictSignupTurnstile && !verifiedMagicLinkRecent));
    if (shouldVerifyTurnstile) {
      const captchaCheck = await verifyTurnstile(body.turnstileToken, {
        secret: turnstileSecret,
        ...(remoteIp ? { remoteIp } : {}),
      });
      if (!captchaCheck.ok) {
        return NextResponse.json({ error: "verificacion_humana_requerida" }, { status: 403 });
      }
      turnstileRayId = captchaCheck.rayId ?? null;
    }

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
        await db.delete(authSession).where(eq(authSession.userId, user.authUserId));
        const response = NextResponse.json({ error: result.reason }, { status: 403 });
        try {
          const auth = getAuth();
          if (auth) {
            const signOutRes = await auth.api.signOut({
              headers: request.headers,
              asResponse: true,
            });
            for (const setCookie of signOutRes.headers.getSetCookie()) {
              response.headers.append("set-cookie", setCookie);
            }
          }
        } catch (err) {
          logSecurityEvent("warn", "signup_minor_signout_failed", { userId, error: err });
        }
        for (const cookieName of [
          "better-auth.session_token",
          "__Secure-better-auth.session_token",
        ]) {
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

    const postSignupNow = new Date();
    if (body.analyticsConsent) {
      await recordFunnelEvent(db, {
        eventName: "signup_step2",
        sessionKey: userId,
        userId,
        sourcePath: "/app/cuenta",
        meta: { trialGranted: result.trial === "concedida" },
        now: postSignupNow,
      }).catch((err) => {
        logSecurityEvent("warn", "signup_funnel_record_failed", { userId, error: err });
      });
    }

    const runPostSignupEmails = async (): Promise<void> => {
      const mailer = getMailer();
      await startAccountEmails(db, mailer, {
        userId,
        email: profile.email,
        displayName: body.displayName,
        trialGranted: result.trial === "concedida",
        now: postSignupNow,
      }).catch((err) => {
        logSecurityEvent("warn", "signup_welcome_email_failed", { userId, error: err });
      });

      await sendReferralSignedUpEmail(db, mailer, {
        referredUserId: userId,
        friendName: body.displayName,
        status: result.trial === "concedida" ? "trial" : "signed_up",
        now: postSignupNow,
      }).catch((err) => {
        logSecurityEvent("warn", "signup_referral_email_failed", { userId, error: err });
      });
    };

    try {
      after(runPostSignupEmails);
    } catch (err) {
      void err;
      await runPostSignupEmails();
    }

    return NextResponse.json(result);
  },
);
