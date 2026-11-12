"use client";

import React, { useEffect, useRef, useState } from "react";
import { BrandLogo } from "../../primitives";
import { isDisposableEmailDomain } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { BetaPinModal, ToastViewport } from "../components/PlatformOverlays";
import { usePlatform } from "../platform-provider";
import {
  getTurnstileToken,
  TURNSTILE_ACTION_MAGIC_LINK,
  turnstileSiteKey,
} from "../turnstile-client";

export type LoginStep = "email" | "password" | "sent";

export interface LoginSurfaceV4Props {
  nextPath?: string;
  initialPromoCode?: string;
  previewSlot?: React.ReactNode;
  /**
   * Better Auth solo tiene enlace mágico, Google y Apple activos hoy.
   * Mientras correo + contraseña no se habilite en el backend, queda en `false`.
   */
  passwordSignInEnabled?: boolean;
  initialStep?: LoginStep;
  initialEmail?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_COOLDOWN_SECONDS = 30;

function sanitizePromoCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
}

function isPlainLeftClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Pide a Better Auth el enlace mágico de acceso. */
export async function requestLoginMagicLink(
  email: string,
  callbackURL: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (turnstileSiteKey()) {
      const token = await getTurnstileToken(TURNSTILE_ACTION_MAGIC_LINK);
      if (!token) return false;
      headers["x-captcha-response"] = token;
    }
    const res = await fetch("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, callbackURL }),
    });
    return res.ok;
  } catch (err) {
    void err;
    return false;
  }
}

/** Inicia el acceso con Google o Apple y redirige al proveedor. */
export async function startLoginSocialSignIn(
  provider: "google" | "apple",
  callbackURL: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, callbackURL }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { url?: string };
    if (!json.url) return false;
    window.location.assign(json.url);
    return true;
  } catch (err) {
    void err;
    return false;
  }
}

function GoogleMark(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="var(--pl-google-blue)"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"
      />
      <path
        fill="var(--pl-google-green)"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="var(--pl-google-yellow)"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"
      />
      <path
        fill="var(--pl-google-red)"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

function AppleMark(): React.JSX.Element {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8s2.3-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
    </svg>
  );
}

function MailEnvelopeIcon(): React.JSX.Element {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

function EyeOffIcon(): React.JSX.Element {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    </svg>
  );
}

export function LoginSurfaceV4({
  nextPath = "/app",
  initialPromoCode = "",
  previewSlot = null,
  passwordSignInEnabled = false,
  initialStep = "email",
  initialEmail = "",
}: LoginSurfaceV4Props): React.JSX.Element {
  const { accountsEnabled, openBetaPin, navigateTo } = usePlatform();

  const resolvedInitialStep: LoginStep =
    initialStep === "sent"
      ? "sent"
      : passwordSignInEnabled && initialStep === "password"
        ? "password"
        : "email";

  const [step, setStep] = useState<LoginStep>(resolvedInitialStep);
  const [email, setEmail] = useState<string>(initialEmail);
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [sentEmail, setSentEmail] = useState<string>(
    initialEmail || "tu@correo.com",
  );
  const [formError, setFormError] = useState<string>("");
  const [betaNotice, setBetaNotice] = useState<string>("");
  const [resendNotice, setResendNotice] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState<number>(0);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const promoCode = sanitizePromoCode(initialPromoCode);
  const signupHref = promoCode
    ? `/signup?code=${encodeURIComponent(promoCode)}`
    : "/signup";

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendSecondsLeft]);

  const validateEmailField = (raw: string): string | null => {
    const clean = raw.trim();
    if (!clean) {
      return "Escribe tu correo electrónico.";
    }
    if (!EMAIL_PATTERN.test(clean)) {
      return "Escribe un correo electrónico válido, como tu@correo.com.";
    }
    if (isDisposableEmailDomain(clean)) {
      return "No aceptamos correos temporales. Usa Google, Apple o tu correo personal.";
    }
    return null;
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (submitting) return;

    setBetaNotice("");
    const cleanEmail = email.trim();
    const validationError = validateEmailField(cleanEmail);
    if (validationError) {
      setFormError(validationError);
      emailInputRef.current?.focus();
      return;
    }

    if (passwordSignInEnabled && step === "password") {
      if (!password) {
        setFormError("Escribe tu contraseña o entra sin contraseña.");
        return;
      }
      setFormError("El acceso con contraseña aún no está activo. Entra sin contraseña.");
      return;
    }

    setFormError("");

    if (!accountsEnabled) {
      openBetaPin(nextPath);
      return;
    }

    setSubmitting(true);
    const ok = await requestLoginMagicLink(cleanEmail, nextPath);
    setSubmitting(false);

    if (ok) {
      setSentEmail(cleanEmail);
      setResendNotice("");
      setStep("sent");
    } else {
      setFormError(
        "No pudimos enviar el enlace. Intenta de nuevo en un momento.",
      );
    }
  };

  const handleSocialClick = async (
    providerLabel: "Google" | "Apple",
  ): Promise<void> => {
    if (submitting) return;
    setFormError("");
    setBetaNotice("");

    if (accountsEnabled) {
      setSubmitting(true);
      const ok = await startLoginSocialSignIn(
        providerLabel === "Google" ? "google" : "apple",
        nextPath,
      );
      setSubmitting(false);
      if (!ok) {
        setFormError(
          `El acceso con ${providerLabel} todavía no está disponible.`,
        );
      }
      return;
    }

    setBetaNotice(
      `El acceso con ${providerLabel} llega con las cuentas. Durante la beta entra con tu PIN de 4 dígitos.`,
    );
    openBetaPin(nextPath);
  };

  const handleResend = async (): Promise<void> => {
    if (submitting || resendSecondsLeft > 0) return;
    setResendNotice("");

    if (!accountsEnabled) {
      openBetaPin(nextPath);
      return;
    }

    setSubmitting(true);
    const ok = await requestLoginMagicLink(sentEmail, nextPath);
    setSubmitting(false);

    if (ok) {
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setResendNotice("Enviamos un nuevo enlace a tu correo.");
    } else {
      setResendNotice(
        "No pudimos reenviar el enlace. Intenta de nuevo en un momento.",
      );
    }
  };

  const handleUseAnotherEmail = (): void => {
    setFormError("");
    setResendNotice("");
    setResendSecondsLeft(0);
    setStep("email");
    window.requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });
  };

  const activeFormMode: "email" | "password" =
    passwordSignInEnabled && step === "password" ? "password" : "email";
  const hasPreview = Boolean(previewSlot);
  const emailDescribedBy = [
    formError ? "pl-login-error" : "",
    activeFormMode === "email" ? "pl-login-email-hint" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="pl-stage pl-auth">
      <a className="skip-link" href="#main">
        Saltar al contenido principal
      </a>

      <div className="pl-auth-atmo" aria-hidden="true" />
      <div className="pl-auth-beam" aria-hidden="true" />
      <div className="pl-auth-grain" aria-hidden="true" />

      <header className="pl-auth-header">
        <a
          href="/"
          aria-label="PitchLab, inicio"
          className="pl-auth-logo-link"
          onClick={(e) => {
            if (isPlainLeftClick(e)) {
              e.preventDefault();
              navigateTo("/");
            }
          }}
        >
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>

        <a
          href="/"
          className="pl-auth-back-link"
          onClick={(e) => {
            if (isPlainLeftClick(e)) {
              e.preventDefault();
              navigateTo("/");
            }
          }}
        >
          <MaestroIcon name="arrowLeft" size={16} />
          <span className="pl-auth-back-text">Volver al inicio</span>
        </a>
      </header>

      <main id="main" className="pl-auth-main">
        <div
          className={[
            "pl-auth-sheet glass-lens glass-ring",
            hasPreview ? "" : "pl-auth-sheet--single",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <section
            aria-labelledby="pl-login-title"
            className="pl-auth-form-col"
          >
            <div className="pl-auth-form-inner">
              {promoCode ? (
                <div
                  className="pl-auth-promo glass-card glass-ring"
                  role="status"
                >
                  <span className="pl-auth-promo-dot" aria-hidden="true" />
                  <span>
                    <strong>{promoCode}</strong> aplicado: 7 días gratis, sin
                    tarjeta
                  </span>
                </div>
              ) : null}

              {step !== "sent" ? (
                <>
                  <div
                    key={`head-${activeFormMode}`}
                    className="pl-auth-head pl-auth-fade"
                  >
                    <h1 id="pl-login-title" className="pl-auth-title">
                      Entra a PitchLab
                    </h1>
                    <p className="pl-auth-subtitle">
                      Lo más probable de cada partido, con su momio justo.
                    </p>
                  </div>

                  <div
                    key={`card-${activeFormMode}`}
                    className="pl-auth-card pl-auth-fade"
                  >
                    <div className="pl-auth-social-grid">
                      <button
                        type="button"
                        className="pl-auth-btn pl-auth-btn-social"
                        disabled={submitting}
                        onClick={() => void handleSocialClick("Google")}
                      >
                        <GoogleMark />
                        <span>Google</span>
                      </button>
                      <button
                        type="button"
                        className="pl-auth-btn pl-auth-btn-social"
                        disabled={submitting}
                        onClick={() => void handleSocialClick("Apple")}
                      >
                        <AppleMark />
                        <span>Apple</span>
                      </button>
                    </div>

                    {betaNotice ? (
                      <p className="pl-auth-beta-notice" role="status">
                        {betaNotice}
                      </p>
                    ) : null}

                    <p className="pl-auth-divider">o con tu correo</p>

                    <form
                      className="pl-auth-form"
                      noValidate
                      onSubmit={(e) => void handleSubmit(e)}
                    >
                      <div className="pl-auth-field">
                        <label
                          className="pl-auth-label"
                          htmlFor="pl-login-email"
                        >
                          Correo
                        </label>
                        <input
                          ref={emailInputRef}
                          id="pl-login-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          spellCheck={false}
                          autoCapitalize="none"
                          autoCorrect="off"
                          placeholder="tu@correo.com"
                          className="pl-auth-input"
                          value={email}
                          aria-invalid={formError ? true : undefined}
                          aria-describedby={emailDescribedBy || undefined}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (formError) setFormError("");
                          }}
                        />
                      </div>

                      {activeFormMode === "password" ? (
                        <div className="pl-auth-field">
                          <div className="pl-auth-label-row">
                            <label
                              className="pl-auth-label pl-auth-label--inline"
                              htmlFor="pl-login-password"
                            >
                              Contraseña
                            </label>
                            <button
                              type="button"
                              className="pl-auth-small-link"
                              onClick={() => {
                                setFormError("");
                                setStep("email");
                              }}
                            >
                              ¿La olvidaste?
                            </button>
                          </div>
                          <div className="pl-auth-pw-wrap">
                            <input
                              id="pl-login-password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              placeholder="Tu contraseña"
                              className="pl-auth-input pl-auth-input--pw"
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                if (formError) setFormError("");
                              }}
                            />
                            <button
                              type="button"
                              className="pl-auth-eye"
                              aria-label={
                                showPassword
                                  ? "Ocultar contraseña"
                                  : "Mostrar contraseña"
                              }
                              aria-pressed={showPassword}
                              onClick={() => setShowPassword((prev) => !prev)}
                            >
                              {showPassword ? (
                                <EyeOffIcon />
                              ) : (
                                <MaestroIcon name="eye" size={19} />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p id="pl-login-email-hint" className="pl-auth-hint">
                          Te mandamos un enlace para entrar sin contraseña.
                          Vence en 15 minutos.
                        </p>
                      )}

                      <div
                        id="pl-login-error"
                        className="pl-auth-error-slot"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {formError ? (
                          <p className="pl-auth-error">{formError}</p>
                        ) : null}
                      </div>

                      <button
                        type="submit"
                        className="pl-auth-btn pl-auth-btn-primary"
                        disabled={submitting}
                        aria-busy={submitting || undefined}
                      >
                        {submitting
                          ? "Enviando…"
                          : activeFormMode === "email"
                            ? "Enviarme el enlace"
                            : "Entrar"}
                      </button>
                    </form>

                    {passwordSignInEnabled ? (
                      <div className="pl-auth-alt-row">
                        <button
                          type="button"
                          className="pl-auth-quiet"
                          onClick={() => {
                            setFormError("");
                            setStep(
                              activeFormMode === "email"
                                ? "password"
                                : "email",
                            );
                          }}
                        >
                          {activeFormMode === "email"
                            ? "Entrar con contraseña"
                            : "Entrar sin contraseña"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div
                  key="step-sent"
                  className="pl-auth-card pl-auth-sent pl-auth-fade"
                  role="status"
                >
                  <div
                    className="pl-auth-sent-icon glass-card glass-ring"
                    aria-hidden="true"
                  >
                    <MailEnvelopeIcon />
                  </div>
                  <h1
                    id="pl-login-title"
                    className="pl-auth-title pl-auth-title--sent"
                  >
                    Revisa tu correo
                  </h1>
                  <p className="pl-auth-sent-copy">
                    Mandamos un enlace a{" "}
                    <strong className="pl-auth-sent-email">{sentEmail}</strong>.
                    Ábrelo en este dispositivo; vence en 15 minutos.
                  </p>

                  <div
                    className="pl-auth-error-slot"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {resendNotice ? (
                      <p className="pl-auth-resend-note">{resendNotice}</p>
                    ) : null}
                  </div>

                  <div className="pl-auth-sent-actions">
                    <button
                      type="button"
                      className="pl-auth-quiet num"
                      disabled={submitting || resendSecondsLeft > 0}
                      onClick={() => void handleResend()}
                    >
                      {submitting
                        ? "Enviando…"
                        : resendSecondsLeft > 0
                          ? `Reenviar (${resendSecondsLeft} s)`
                          : "Reenviar"}
                    </button>
                    <button
                      type="button"
                      className="pl-auth-quiet"
                      onClick={handleUseAnotherEmail}
                    >
                      Usar otro correo
                    </button>
                  </div>
                </div>
              )}

              <div className="pl-auth-signup-note">
                <p className="pl-auth-signup-line">
                  ¿No tienes cuenta?{" "}
                  <a
                    href={signupHref}
                    className="pl-auth-link"
                    onClick={(e) => {
                      if (isPlainLeftClick(e)) {
                        e.preventDefault();
                        navigateTo(signupHref);
                      }
                    }}
                  >
                    Crear cuenta
                  </a>
                </p>
                <p className="pl-auth-signup-sub">7 días gratis, sin tarjeta</p>
              </div>
            </div>
          </section>

          {previewSlot}
        </div>
      </main>

      <footer className="pl-auth-footer">
        <p className="pl-auth-legal">
          Solo mayores de 18. PitchLab no acepta apuestas.
        </p>
        <button
          type="button"
          className="btn-beta pl-auth-quiet pl-auth-pin-trigger"
          onClick={() => openBetaPin(nextPath)}
        >
          ¿Eres socio? Entra con tu PIN
        </button>
      </footer>

      <BetaPinModal />
      <ToastViewport />
    </div>
  );
}
