"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../../primitives";
import { isDisposableEmailDomain, normalizeTrialEmail } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { BetaPinModal, ToastViewport } from "../components/PlatformOverlays";
import { usePlatform } from "../platform-provider";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import { requestLoginMagicLink, startLoginSocialSignIn } from "./LoginSurfaceV4";

import {
  EmailConfirmationStatus,
  emailConfirmationCallbacks,
  useContinueAfterConfirmation,
  useEmailConfirmation,
  type ConfirmedSession,
  type EmailConfirmationStep,
} from "./email-confirmation";

import { normalizeSignupHandle, SIGNUP_HANDLE_PATTERN, useHandleAvailability } from "./use-handle-availability";

export { normalizeSignupHandle, SIGNUP_HANDLE_PATTERN, type HandleStatus } from "./use-handle-availability";

export type SignupStep = "method" | "details" | EmailConfirmationStep;

/** Versión de los textos legales que la persona acepta en el paso 2. */
export const SIGNUP_CONSENT_VERSION = "2026-11-11";
const SIGNUP_DETAILS_STORAGE_KEY = "pitchlab.signup.details";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_COOLDOWN_SECONDS = 30;
const MIN_AGE_YEARS = 18;
const MAX_AGE_YEARS = 100;

const MONTHS_LONG = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;
const MONTHS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export interface SignupDetails {
  /** Cuenta para la que se prepararon los datos antes de confirmar el enlace. */
  email?: string;
  /** Nombre visible (2 a 40 caracteres). */
  displayName: string;
  /** Usuario sin @ (3 a 20: minúsculas, números y _; empieza con letra). */
  handle: string;
  /** Fecha ISO `AAAA-MM-DD`. */
  birthDate: string;
  consents: {
    terms: boolean;
    analytics: boolean;
    marketing: boolean;
    version: string;
  };
  /** Código de quien invitó (`?code=`), para registrar el referido. */
  referralCode?: string;
}

/** Respuesta de `POST /api/me/signup`. */
export type SignupFlushResult =
  | { status: "saved"; trial: "concedida" | "ya_usada" | "apagada" }
  | { status: "none" }
  | { status: "underage" }
  | { status: "handle_taken" }
  | { status: "error" };

/** Sugerencia de usuario a partir del nombre o el correo (el servidor confirma si está libre). */
export function suggestSignupHandle(base: string): string {
  const ascii = base
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split("@")[0]!
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 20);
  return ascii.length >= 3 ? ascii : "";
}

/** Los datos del paso 2 esperan al enlace mágico como máximo un día. */
const SIGNUP_DETAILS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SignupInvite {
  code: string;
  inviterName: string | null;
  freeDays: number;
}

/**
 * Lee el código de `?code=` y, si es de un creador conocido, su nombre de pila.
 * Un código vacío o con caracteres inválidos no muestra aviso.
 */
export function resolveSignupInvite(rawCode: string): SignupInvite | null {
  const code = rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
  if (code.length < 3) return null;
  const creator = TIPSTER_CREATORS.find(
    (c) => c.promoCode.toUpperCase() === code,
  );
  const firstName = creator?.name.split(" ")[0] ?? null;
  return { code, inviterName: firstName, freeDays: creator?.freeDays ?? 7 };
}

/** Edad en años cumplidos a la fecha `today`. */
export function ageOn(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type BirthDateCheck =
  | { ok: true; iso: string }
  | { ok: false; reason: "incomplete" | "invalid" | "underage" };

/** Valida día/mes/año (mes 1–12) y la edad mínima de 18. */
export function checkBirthDate(
  day: string,
  month: string,
  year: string,
  today: Date = new Date(),
): BirthDateCheck {
  if (!day || !month || !year) return { ok: false, reason: "incomplete" };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(y, m - 1, d);
  if (
    !Number.isInteger(d) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (ageOn(date, today) < MIN_AGE_YEARS) return { ok: false, reason: "underage" };
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { ok: true, iso };
}

/**
 * Deja los datos del paso 2 listos para /onboarding, donde `flushSignupDetails` los guarda en
 * el servidor. Van en `localStorage` porque el enlace mágico se abre en otra pestaña.
 */
export function submitSignupDetails(details: SignupDetails, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(
      SIGNUP_DETAILS_STORAGE_KEY,
      JSON.stringify({ ...details, savedAt: now }),
    );
  } catch (err) {
    void err;
  }
}

/** Lee los datos pendientes del paso 2; null si no hay o ya vencieron. */
export function readPendingSignupDetails(now: number = Date.now()): SignupDetails | null {
  try {
    const raw = window.localStorage.getItem(SIGNUP_DETAILS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupDetails & { savedAt?: number };
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > SIGNUP_DETAILS_MAX_AGE_MS) {
      window.localStorage.removeItem(SIGNUP_DETAILS_STORAGE_KEY);
      return null;
    }
    const { savedAt: _savedAt, ...details } = parsed;
    void _savedAt;
    return details;
  } catch (err) {
    void err;
    return null;
  }
}

/** Guarda en el servidor los datos pendientes del paso 2 (con sesión de cuenta). */
export async function flushSignupDetails(email?: string): Promise<SignupFlushResult> {
  const details = readPendingSignupDetails();
  if (!details || (email && details.email && details.email !== email.toLowerCase())) return { status: "none" };
  try {
    const res = await fetch("/api/me/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(details),
    });
    if (res.status === 403) {
      window.localStorage.removeItem(SIGNUP_DETAILS_STORAGE_KEY);
      const { error } = await res.json() as { error?: string };
      return { status: error === "menor_de_edad" ? "underage" : "error" };
    }
    if (res.status === 409) {
      window.localStorage.removeItem(SIGNUP_DETAILS_STORAGE_KEY);
      return { status: "handle_taken" };
    }
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as { trial?: "concedida" | "ya_usada" | "apagada" };
    window.localStorage.removeItem(SIGNUP_DETAILS_STORAGE_KEY);
    return { status: "saved", trial: json.trial ?? "apagada" };
  } catch (err) {
    void err;
    return { status: "error" };
  }
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

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = (): void => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function GoogleMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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


function GiftIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M12 8c-2-3-6-3-6 0 0 1.5 2 2 6 0zM12 8c2-3 6-3 6 0 0 1.5-2 2-6 0z" />
    </svg>
  );
}

function ChevronDown(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MailEnvelopeIcon(): React.JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export interface SignupSurfaceV4Props {
  initialPromoCode?: string;
  previewSlot?: React.ReactNode;
  initialStep?: SignupStep;
  initialEmail?: string;
  /** Al volver de Google sin fecha ni consentimientos. */
  returningProvider?: "Google" | null;
  /** Fecha de referencia para la edad (pruebas). */
  today?: Date;
  /** Con cuenta (Google o al volver a /app): nombre y usuario sugerido para prellenar. */
  initialDisplayName?: string;
  initialHandle?: string;
  /** Destino al terminar el registro cuando el enlace vino de una ruta protegida. */
  nextPath?: string;
}

export function SignupSurfaceV4({
  initialPromoCode = "",
  previewSlot = null,
  initialStep = "method",
  initialEmail = "",
  returningProvider = null,
  today,
  initialDisplayName = "",
  initialHandle = "",
  nextPath = "/app",
}: SignupSurfaceV4Props): React.JSX.Element {
  const { accountsEnabled, openBetaPin, navigateTo } = usePlatform();
  const narrow = useNarrowViewport();
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    emailError: `${uid}-email-error`,
    emailHint: `${uid}-email-hint`,
    dobHint: `${uid}-dob-hint`,
    nameError: `${uid}-name-error`,
    handleHint: `${uid}-handle-hint`,
    dobError: `${uid}-dob-error`,
  };

  const invite = useMemo(
    () => resolveSignupInvite(initialPromoCode),
    [initialPromoCode],
  );

  const [step, setStep] = useState<SignupStep>(initialStep);
  const [confirmedSession, setConfirmedSession] = useState<ConfirmedSession | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [confirmationAttempt, setConfirmationAttempt] = useState(0);
  const [email, setEmail] = useState(initialEmail);
  const [provider, setProvider] = useState<"Google" | null>(
    returningProvider,
  );
  const [emailError, setEmailError] = useState("");
  const [emailErrorIsDisposable, setEmailErrorIsDisposable] = useState(false);
  const [betaNotice, setBetaNotice] = useState("");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [handle, setHandle] = useState(initialHandle);
  const [handleTouched, setHandleTouched] = useState(Boolean(initialHandle));
  const handleStatus = useHandleAvailability(handle, accountsEnabled);
  const [nameError, setNameError] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [terms, setTerms] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [dobError, setDobError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [resendNotice, setResendNotice] = useState("");

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const didMountRef = useRef(false);

  const normalizedEmail = email.trim() ? normalizeTrialEmail(email.trim()) : "";

  useEmailConfirmation(
    step === "sent" || (step === "confirmed" && !confirmedSession) ? step : null,
    step === "sent" ? email : "",
    accountsEnabled,
    confirmationAttempt,
    (session) => {
      setStep("confirmed");
      setConfirmedSession(session);
    },
    () => setStep("expired"),
  );

  useEffect(() => {
    if (!confirmedSession) return;
    let active = true;
    void flushSignupDetails(confirmedSession.email).then(async (result) => {
      if (!active) return;
      if (result.status === "saved") {
        try {
          window.sessionStorage.setItem("pitchlab.signup.trial", result.trial);
        } catch (err) {
          // The confirmation can continue if browser storage is unavailable.
          void err;
        }
      }
      if (result.status === "underage") {
        setDestination("/");
        return;
      }
      const postSignupDest = nextPath && nextPath !== "/app" ? nextPath : "/onboarding";
      if (result.status === "saved" || confirmedSession.completed) {
        setDestination(postSignupDest);
        return;
      }
      // The other tab may have saved and removed the draft after our initial session check.
      const latest = await fetch("/api/me/signup", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<ConfirmedSession> : null)
        .catch(() => null);
      if (!active) return;
      const completedHere = latest?.completed && latest.email === confirmedSession.email;
      const step2Params = new URLSearchParams({ paso: "2", via: "cuenta" });
      if (nextPath && nextPath !== "/app") step2Params.set("next", nextPath);
      setDestination(completedHere ? postSignupDest : `/signup?${step2Params.toString()}`);
    });
    return () => {
      active = false;
    };
  }, [confirmedSession]);

  useContinueAfterConfirmation(destination);

  const shownHandle = normalizeSignupHandle(handle);
  const handleProblem =
    handleStatus === "taken" || handleStatus === "reserved" || (handleStatus === "invalid" && handleTouched);
  const handleMessage =
    handleStatus === "taken"
      ? `@${shownHandle} ya está ocupado. Prueba otro.`
      : handleStatus === "reserved"
        ? "Ese usuario no se puede usar. Prueba otro."
        : handleStatus === "invalid" && handleTouched
          ? "De 3 a 20 caracteres: minúsculas, números y _, empezando con letra."
          : handleStatus === "checking"
            ? "Revisando…"
            : handleStatus === "free" && accountsEnabled
              ? `@${shownHandle} está libre. Así te verán en Comunidad.`
              : "Así te verán en Comunidad.";

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendSecondsLeft]);

  // Mientras no lo edite a mano, el usuario se sugiere del nombre (o del correo).
  useEffect(() => {
    if (handleTouched) return;
    const suggestion = suggestSignupHandle(displayName) || suggestSignupHandle(email);
    setHandle(suggestion);
  }, [displayName, email, handleTouched]);

  const referenceToday = useMemo(() => today ?? new Date(), [today]);
  const years = useMemo(() => {
    const top = referenceToday.getFullYear() - MIN_AGE_YEARS;
    const list: number[] = [];
    for (let y = top; y >= top - (MAX_AGE_YEARS - MIN_AGE_YEARS); y -= 1) {
      list.push(y);
    }
    return list;
  }, [referenceToday]);
  const months = narrow ? MONTHS_SHORT : MONTHS_LONG;

  const dobComplete = Boolean(day && month && year);
  const createDisabled = !dobComplete || !terms || submitting;

  const goToDetails = (): void => {
    setStep("details");
  };

  const handleMethodSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBetaNotice("");
    const clean = email.trim();
    let error = "";
    let disposable = false;
    if (!clean) {
      error = "Escribe tu correo electrónico.";
    } else if (!EMAIL_PATTERN.test(clean)) {
      error = "Escribe un correo electrónico válido, como tu@correo.com.";
    } else if (isDisposableEmailDomain(clean)) {
      error = "No aceptamos correos temporales. Usa Google o tu correo personal.";
      disposable = true;
    }
    if (error) {
      setEmailError(error);
      setEmailErrorIsDisposable(disposable);
      emailInputRef.current?.focus();
      return;
    }
    setEmailError("");
    setEmailErrorIsDisposable(false);
    setProvider(null);
    goToDetails();
  };

  const handleSocial = async (label: "Google"): Promise<void> => {
    if (submitting) return;
    setEmailError("");
    setBetaNotice("");
    if (accountsEnabled) {
      setSubmitting(true);
      const socialParams = new URLSearchParams({
        paso: "2",
        via: label.toLowerCase(),
      });
      if (invite) socialParams.set("code", invite.code);
      if (nextPath && nextPath !== "/app") socialParams.set("next", nextPath);
      const ok = await startLoginSocialSignIn(
        "google",
        `/signup?${socialParams.toString()}`,
      );
      setSubmitting(false);
      if (!ok) setEmailError(`El acceso con ${label} todavía no está disponible.`);
      return;
    }
    setBetaNotice(
      `El acceso con ${label} llega con las cuentas. Durante la beta entras con tu PIN de 4 dígitos.`,
    );
    setProvider(label);
    setEmail("");
    goToDetails();
  };

  const handleDetailsSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError("");
    const cleanName = displayName.replace(/\s+/g, " ").trim();
    const cleanHandle = normalizeSignupHandle(handle);
    let identityOk = true;
    if (cleanName.length < 2 || cleanName.length > 40) {
      setNameError("Escribe tu nombre (2 a 40 caracteres).");
      identityOk = false;
    }
    if (!SIGNUP_HANDLE_PATTERN.test(cleanHandle)) {
      setHandleTouched(true);
      identityOk = false;
    } else if (handleStatus === "taken" || handleStatus === "reserved") {
      identityOk = false;
    }
    const check = checkBirthDate(day, month, year, referenceToday);
    if (!check.ok) {
      setDobError(
        check.reason === "underage"
          ? "PitchLab es solo para mayores de 18. No creamos la cuenta ni guardamos tus datos."
          : check.reason === "invalid"
            ? "Esa fecha no existe. Revisa el día y el mes."
            : "Elige día, mes y año.",
      );
      return;
    }
    if (!terms || !identityOk) return;
    setDobError("");

    const details: SignupDetails = {
      ...(email.trim() && !provider ? { email: email.trim().toLowerCase() } : {}),
      displayName: cleanName,
      handle: cleanHandle,
      birthDate: check.iso,
      consents: {
        terms,
        analytics,
        marketing,
        version: SIGNUP_CONSENT_VERSION,
      },
      ...(invite ? { referralCode: invite.code } : {}),
    };

    setSubmitting(true);
    submitSignupDetails(details);

    if (!accountsEnabled) {
      setSubmitting(false);
      openBetaPin(nextPath && nextPath !== "/app" ? nextPath : "/onboarding");
      return;
    }

    if (provider || !normalizedEmail) {
      setSubmitting(false);
      navigateTo(nextPath && nextPath !== "/app" ? nextPath : "/onboarding");
      return;
    }

    const ok = await requestLoginMagicLink(email.trim(), emailConfirmationCallbacks("signup"));
    setSubmitting(false);
    if (ok) {
      setResendNotice("");
      setStep("sent");
    } else {
      setSubmitError("No pudimos enviar el enlace. Intenta de nuevo en un momento.");
    }
  };

  const handleResend = async (): Promise<void> => {
    if (submitting || resendSecondsLeft > 0) return;
    setResendNotice("");
    if (!accountsEnabled) {
      openBetaPin("/onboarding");
      return;
    }
    setSubmitting(true);
    const ok = await requestLoginMagicLink(email.trim(), emailConfirmationCallbacks("signup"));
    setSubmitting(false);
    if (ok) {
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setConfirmationAttempt((current) => current + 1);
      setResendNotice("Enviamos un nuevo enlace a tu correo.");
    } else {
      setResendNotice("No pudimos reenviar el enlace. Intenta de nuevo en un momento.");
    }
  };

  const handleUseAnotherEmail = (): void => {
    setEmail("");
    setProvider(null);
    setEmailError("");
    setResendNotice("");
    setResendSecondsLeft(0);
    setStep("method");
  };

  const loginParams = new URLSearchParams();
  if (invite?.code) loginParams.set("code", invite.code);
  if (nextPath && nextPath !== "/app") loginParams.set("next", nextPath);
  const loginQuery = loginParams.toString();
  const loginHref = loginQuery ? `/login?${loginQuery}` : "/login";
  const onLoginClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (isPlainLeftClick(e)) {
      e.preventDefault();
      navigateTo(loginHref);
    }
  };

  const hasPreview = Boolean(previewSlot);
  const shownEmail =
    normalizedEmail ||
    (provider ? `tu cuenta de ${provider}` : "tu correo");
  const emailDescribedBy = [emailError ? ids.emailError : "", ids.emailHint]
    .filter(Boolean)
    .join(" ");

  const inviteNotice = invite ? (
    <div className="pl-auth-invite glass-card glass-ring" data-testid="invite-notice">
      <span className="pl-auth-invite-icon" aria-hidden="true">
        <GiftIcon />
      </span>
      <p className="pl-auth-invite-copy">
        <strong>
          {invite.inviterName
            ? `${invite.inviterName} te invitó.`
            : `${invite.code} aplicado.`}
        </strong>{" "}
        Tus {invite.freeDays} días gratis ya están apartados.
      </p>
    </div>
  ) : null;

  const stepper =
    step === "method" || step === "details" ? (
      <div className="pl-auth-steps" aria-hidden="true">
        <span className="pl-auth-step pl-auth-step--on" />
        <span
          className={[
            "pl-auth-step",
            step === "details" ? "pl-auth-step--on" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
    ) : null;

  return (
    <div className="pl-stage pl-auth pl-auth--signup">
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
          className="pl-auth-back-link pl-auth-back-link--mobile"
          onClick={(e) => {
            if (isPlainLeftClick(e)) {
              e.preventDefault();
              navigateTo("/");
            }
          }}
        >
          <MaestroIcon name="arrowLeft" size={18} />
          <span className="pl-auth-back-text">Volver al inicio</span>
        </a>
        <p className="pl-auth-have-account">
          ¿Ya tienes cuenta?{" "}
          <a href={loginHref} className="pl-auth-link" onClick={onLoginClick}>
            Entrar
          </a>
        </p>
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
          <section aria-labelledby={ids.title} className="pl-auth-form-col">
            <div className="pl-auth-form-inner">
              {inviteNotice}
              {stepper}

              {step === "method" ? (
                <div key="step-method" className="pl-auth-fade">
                  <div className="pl-auth-head">
                    <p className="pl-auth-step-label num">Paso 1 de 2</p>
                    <h1 id={ids.title} ref={titleRef} tabIndex={-1} className="pl-auth-title">
                      Crea tu cuenta
                    </h1>
                    <p className="pl-auth-subtitle">
                      7 días gratis, sin tarjeta. Al terminar decides si sigues.
                    </p>
                  </div>

                  <div className="pl-auth-card">
                    <div className="pl-auth-social-grid">
                      <button
                        type="button"
                        className="pl-auth-btn pl-auth-btn-social"
                        disabled={submitting}
                        onClick={() => void handleSocial("Google")}
                      >
                        <GoogleMark />
                        <span>Continuar con Google</span>
                      </button>
                    </div>

                    <p className="pl-auth-divider">o con tu correo</p>

                    <form
                      className="pl-auth-form auth-form"
                      noValidate
                      onSubmit={handleMethodSubmit}
                    >
                      <div className="pl-auth-field">
                        <label className="pl-auth-label" htmlFor="auth-email">
                          Correo
                        </label>
                        <input
                          ref={emailInputRef}
                          id="auth-email"
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
                          aria-invalid={emailError ? true : undefined}
                          aria-describedby={emailDescribedBy}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError("");
                          }}
                        />
                      </div>

                      <div
                        id={ids.emailError}
                        className="pl-auth-error-slot"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {emailError ? (
                          <p
                            className="pl-auth-error"
                            role={emailErrorIsDisposable ? "alert" : undefined}
                          >
                            {emailError}
                          </p>
                        ) : null}
                      </div>

                      <button type="submit" className="pl-auth-btn pl-auth-btn-primary">
                        Continuar
                      </button>
                    </form>
                    <p id={ids.emailHint} className="pl-auth-fineprint">
                      {narrow
                        ? "Sin contraseña: te mandamos un enlace para confirmar."
                        : "Sin contraseña: te mandamos un enlace para confirmar tu correo."}
                    </p>
                  </div>
                </div>
              ) : null}

              {step === "details" ? (
                <div key="step-details" className="pl-auth-fade">
                  <div className="pl-auth-head">
                    <p className="pl-auth-step-label num">Paso 2 de 2</p>
                    <h1 id={ids.title} ref={titleRef} tabIndex={-1} className="pl-auth-title">
                      Unos datos más
                    </h1>
                    <p className="pl-auth-subtitle">
                      Para <strong className="pl-auth-strong">{shownEmail}</strong>
                    </p>
                  </div>

                  {betaNotice ? (
                    <p className="pl-auth-beta-notice" role="status">
                      {betaNotice}
                    </p>
                  ) : null}

                  <form
                    className="pl-auth-card pl-auth-details-form auth-form"
                    noValidate
                    onSubmit={(e) => void handleDetailsSubmit(e)}
                  >
                    <div className="pl-auth-field">
                      <label className="pl-auth-label" htmlFor="auth-name">
                        Tu nombre
                      </label>
                      <input
                        id="auth-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        maxLength={40}
                        placeholder="Ana López"
                        className="pl-auth-input"
                        value={displayName}
                        aria-invalid={nameError ? true : undefined}
                        aria-describedby={nameError ? ids.nameError : undefined}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          if (nameError) setNameError("");
                        }}
                      />
                      <div id={ids.nameError} className="pl-auth-error-slot" aria-live="polite" aria-atomic="true">
                        {nameError ? <p className="pl-auth-error">{nameError}</p> : null}
                      </div>
                    </div>

                    <div className="pl-auth-field">
                      <label className="pl-auth-label" htmlFor="auth-handle">
                        Usuario
                      </label>
                      <input
                        id="auth-handle"
                        name="username"
                        type="text"
                        autoComplete="username"
                        spellCheck={false}
                        autoCapitalize="none"
                        autoCorrect="off"
                        maxLength={21}
                        placeholder="ana_lopez"
                        className="pl-auth-input"
                        value={handle}
                        aria-invalid={handleProblem ? true : undefined}
                        aria-describedby={ids.handleHint}
                        onChange={(e) => {
                          setHandleTouched(true);
                          setHandle(normalizeSignupHandle(e.target.value));
                        }}
                      />
                      <div id={ids.handleHint} aria-live="polite" aria-atomic="true">
                        {handleProblem ? (
                          <p className="pl-auth-error">{handleMessage}</p>
                        ) : (
                          <p className="pl-auth-fineprint pl-auth-fineprint--left">{handleMessage}</p>
                        )}
                      </div>
                    </div>

                    <fieldset className="pl-auth-fieldset">
                      <legend className="pl-auth-label">Fecha de nacimiento</legend>
                      <div className="pl-auth-dob">
                        <div className="pl-auth-select">
                          <select
                            className="pl-auth-input num"
                            aria-label="Día"
                            autoComplete="bday-day"
                            value={day}
                            aria-invalid={dobError ? true : undefined}
                            aria-describedby={[ids.dobHint, dobError ? ids.dobError : ""].filter(Boolean).join(" ")}
                            onChange={(e) => {
                              setDay(e.target.value);
                              setDobError("");
                            }}
                          >
                            <option value="">Día</option>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={String(d)}>
                                {d}
                              </option>
                            ))}
                          </select>
                          <ChevronDown />
                        </div>
                        <div className="pl-auth-select">
                          <select
                            className="pl-auth-input"
                            aria-label="Mes"
                            autoComplete="bday-month"
                            value={month}
                            aria-invalid={dobError ? true : undefined}
                            aria-describedby={[ids.dobHint, dobError ? ids.dobError : ""].filter(Boolean).join(" ")}
                            onChange={(e) => {
                              setMonth(e.target.value);
                              setDobError("");
                            }}
                          >
                            <option value="">Mes</option>
                            {months.map((label, i) => (
                              <option key={label} value={String(i + 1)}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown />
                        </div>
                        <div className="pl-auth-select">
                          <select
                            className="pl-auth-input num"
                            aria-label="Año"
                            autoComplete="bday-year"
                            value={year}
                            aria-invalid={dobError ? true : undefined}
                            aria-describedby={[ids.dobHint, dobError ? ids.dobError : ""].filter(Boolean).join(" ")}
                            onChange={(e) => {
                              setYear(e.target.value);
                              setDobError("");
                            }}
                          >
                            <option value="">Año</option>
                            {years.map((y) => (
                              <option key={y} value={String(y)}>
                                {y}
                              </option>
                            ))}
                          </select>
                          <ChevronDown />
                        </div>
                      </div>
                      <p id={ids.dobHint} className="pl-auth-fineprint pl-auth-fineprint--left">
                        {narrow
                          ? "Solo mayores de 18. Si no cumples la edad, no guardamos tus datos."
                          : "Solo mayores de 18. Si no cumples la edad, no creamos la cuenta ni guardamos tus datos."}
                      </p>
                      <div
                        id={ids.dobError}
                        className="pl-auth-error-slot"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {dobError ? (
                          <p className="pl-auth-error pl-auth-error--block" role="alert">
                            {dobError}
                          </p>
                        ) : null}
                      </div>
                    </fieldset>

                    <fieldset className="pl-auth-fieldset pl-auth-consents">
                      <legend className="sr-only">Consentimientos</legend>
                      <label className="pl-auth-check">
                        <input
                          type="checkbox"
                          checked={terms}
                          required
                          aria-required="true"
                          onChange={(e) => setTerms(e.target.checked)}
                        />
                        <span className="pl-auth-check-text">
                          Acepto los{" "}
                          <a className="pl-auth-inline-link" href="/legal/terminos" target="_blank" rel="noopener">
                            Términos
                          </a>{" "}
                          y el{" "}
                          <a className="pl-auth-inline-link" href="/legal/privacidad" target="_blank" rel="noopener">
                            Aviso de privacidad
                          </a>
                        </span>
                        <span className="pl-auth-tag">Obligatorio</span>
                      </label>
                      <label className="pl-auth-check">
                        <input
                          type="checkbox"
                          checked={analytics}
                          onChange={(e) => setAnalytics(e.target.checked)}
                        />
                        <span className="pl-auth-check-text">
                          {narrow ? "Analítica anónima" : "Analítica anónima para mejorar PitchLab"}
                        </span>
                        <span className="pl-auth-tag">Opcional</span>
                      </label>
                      <label className="pl-auth-check">
                        <input
                          type="checkbox"
                          checked={marketing}
                          onChange={(e) => setMarketing(e.target.checked)}
                        />
                        <span className="pl-auth-check-text">Novedades por correo</span>
                        <span className="pl-auth-tag">Opcional</span>
                      </label>
                    </fieldset>

                    <div className="pl-auth-error-slot" aria-live="polite" aria-atomic="true">
                      {submitError ? <p className="pl-auth-error">{submitError}</p> : null}
                    </div>

                    <button
                      type="submit"
                      className="pl-auth-btn pl-auth-btn-primary pl-auth-btn-create"
                      disabled={createDisabled}
                      aria-busy={submitting || undefined}
                    >
                      {submitting ? "Creando…" : "Crear cuenta"}
                    </button>
                  </form>
                  <div className="pl-auth-alt-row">
                    <button
                      type="button"
                      className="pl-auth-quiet"
                      onClick={() => {
                        setSubmitError("");
                        setDobError("");
                        setStep("method");
                      }}
                    >
                      <MaestroIcon name="arrowLeft" size={15} />
                      Atrás
                    </button>
                  </div>
                </div>
              ) : null}

              {step === "confirmed" || step === "expired" ? (
                <EmailConfirmationStatus step={step} onRetry={handleUseAnotherEmail} />
              ) : null}
              {step === "sent" ? (
                <div key="step-sent" className="pl-auth-sent pl-auth-sent--signup pl-auth-fade" role="status">
                  <div className="pl-auth-sent-icon glass-card glass-ring" aria-hidden="true">
                    <MailEnvelopeIcon />
                  </div>
                  <h1
                    id={ids.title}
                    ref={titleRef}
                    tabIndex={-1}
                    className="pl-auth-title pl-auth-title--sent"
                  >
                    Confirma tu correo
                  </h1>
                  <p className="pl-auth-sent-copy">
                    Mandamos un enlace a{" "}
                    <strong className="pl-auth-sent-email">{shownEmail}</strong>.
                    Al abrirlo empiezan tus 7 días gratis.
                  </p>
                  <div className="pl-auth-error-slot" aria-live="polite" aria-atomic="true">
                    {resendNotice ? <p className="pl-auth-resend-note">{resendNotice}</p> : null}
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
                    <button type="button" className="pl-auth-quiet" onClick={handleUseAnotherEmail}>
                      Usar otro correo
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {previewSlot}
        </div>
      </main>

      <footer className="pl-auth-footer pl-auth-footer--signup">
        <p className="pl-auth-footer-login">
          ¿Ya tienes cuenta?{" "}
          <a href={loginHref} className="pl-auth-link" onClick={onLoginClick}>
            Entrar
          </a>
        </p>
        <p className="pl-auth-legal">Solo mayores de 18. PitchLab no acepta apuestas.</p>
        <p className="pl-auth-trial-note">Un periodo de prueba por persona.</p>
      </footer>

      <BetaPinModal />
      <ToastViewport />
    </div>
  );
}
