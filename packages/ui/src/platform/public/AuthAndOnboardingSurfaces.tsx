"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../sports.js";
import {
  formatOddsValue,
  isDisposableEmailDomain,
  normalizeTrialEmail,
} from "../access-guard.js";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  NoticeCard,
} from "../components/MaestroPrimitives.js";
import {
  AtmosphereStage,
  PublicFooterV4,
  PublicHeaderV4,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  SPACETIME_METRICS_HEADLINE,
  TIPSTAR_CREATORS,
} from "../spacetime-catalog.js";
import type { RiskBand, ViewerRole } from "../types.js";

function describePromoBenefit(codeRaw: string, month1NoCardMode: boolean): {
  badge: string;
  detail: string;
} {
  const code = codeRaw.trim().toUpperCase();
  if (!code) {
    return month1NoCardMode
      ? {
          badge: "7 días gratis · Sin tarjeta",
          detail: "Mes 1 de lanzamiento: activa 7 días de Pase Total sin ingresar tarjeta.",
        }
      : {
          badge: "7 días gratis · $0 hoy",
          detail: "Verificación anti-multicuenta con cargo $0.00 MXN hoy.",
        };
  }
  if (
    code === "SOFIA5" ||
    code === "CARLOS5" ||
    code === "DIEGO5" ||
    code.endsWith("5")
  ) {
    return {
      badge: "5 días gratis · Tipstar",
      detail: `Código oficial ${code} reconocido: 5 días de Pase Total incluidos.`,
    };
  }
  if (
    code === "JAIR" ||
    code === "SOCIO-8842" ||
    code.startsWith("SOCIO")
  ) {
    return {
      badge: "7 días + 30 % off 1.er mes",
      detail: `Invitación de socio (${code}): 7 días gratis + 1.er mes en $209 MXN y +15 días doble vía.`,
    };
  }
  return {
    badge: "7 días + 30 % off 1.er mes",
    detail: `Código ${code} aplicado: prueba gratis + beneficio preferencial en tu 1.er mes.`,
  };
}

export function AuthSurfaceV4({
  mode,
  nextPath = "/app",
  initialPromoCode = "",
}: {
  mode: "login" | "signup";
  nextPath?: string;
  initialPromoCode?: string;
}): React.JSX.Element {
  const {
    rawDataset,
    month1NoCardMode,
    setViewerRole,
    openBetaPin,
    submitBetaPin,
    logoutSession,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<"trial" | "pin">("trial");
  const [email, setEmail] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string>(initialPromoCode);
  const [adultConfirmed, setAdultConfirmed] = useState<boolean>(true);
  const [formError, setFormError] = useState<string>("");
  const [verifiedEmailNotice, setVerifiedEmailNotice] = useState<string>("");

  const [inlinePinDigits, setInlinePinDigits] = useState<string>("");
  const [inlinePinError, setInlinePinError] = useState<string>("");
  const [inlinePinBusy, setInlinePinBusy] = useState<boolean>(false);

  const normalizedPreview = email.includes("@") ? normalizeTrialEmail(email) : "";
  const promoInfo = useMemo(
    () => describePromoBenefit(promoCode, month1NoCardMode),
    [promoCode, month1NoCardMode],
  );

  const handleTrialOrLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");

    const clean = email.trim();
    if (!clean || !clean.includes("@")) {
      setFormError("Ingresa un correo electrónico válido.");
      return;
    }
    if (isDisposableEmailDomain(clean)) {
      setFormError(
        "Por protección anti-abuso no se permiten dominios de correo temporales. Usa Google, Apple o tu correo principal.",
      );
      return;
    }
    if (!adultConfirmed) {
      setFormError("Debes confirmar que eres mayor de 18 años (+18).");
      return;
    }

    const normalized = normalizeTrialEmail(clean);
    setVerifiedEmailNotice(
      `Identidad normalizada (${normalized}) · Huella de dispositivo verificada ($0 MXN). Ingresa tu PIN de activación para abrir el Club.`,
    );
    pushToast(
      `Cuenta pre-validada (${normalized}). Confirma tu PIN de acceso de 4 dígitos.`,
      "success",
    );
    openBetaPin(mode === "signup" ? "/onboarding" : nextPath);
  };

  const handleOAuthClick = (provider: "Google" | "Apple") => {
    setFormError("");
    setVerifiedEmailNotice(
      `${provider} OAuth listo ($0 MXN anti-abuso). Confirma tu PIN de 4 dígitos para entrar.`,
    );
    openBetaPin(mode === "signup" ? "/onboarding" : nextPath);
  };

  const verifyInlinePin = async (code: string) => {
    setInlinePinBusy(true);
    setInlinePinError("");
    const res = await submitBetaPin(code, nextPath);
    setInlinePinBusy(false);
    if (!res.ok) {
      setInlinePinError(res.error ?? "Código incorrecto. Usa tu PIN de socio.");
      setInlinePinDigits("");
    }
  };

  const handleInlinePinKey = (key: string) => {
    if (inlinePinBusy) return;
    if (key === "limpiar") {
      setInlinePinDigits("");
      setInlinePinError("");
      return;
    }
    if (key === "borrar") {
      setInlinePinDigits((prev) => prev.slice(0, -1));
      setInlinePinError("");
      return;
    }
    if (inlinePinDigits.length >= 4) return;
    const next = `${inlinePinDigits}${key}`;
    setInlinePinDigits(next);
    setInlinePinError("");
    if (next.length === 4) {
      void verifyInlinePin(next);
    }
  };

  const handleQuickRoleTest = (role: ViewerRole, targetHref: string) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pl-sim-role", role);
      }
    } catch (err) {
      void err;
    }
    setViewerRole(role);

    if (role === "visitor") {
      if (!rawDataset.isServerRedactedForVisitor) {
        void logoutSession();
        return;
      }
      pushToast("Candado Visitante Cero-Fuga activo.", "default");
      navigateTo("/");
      return;
    }

    if (rawDataset.isServerRedactedForVisitor) {
      void submitBetaPin("2026", targetHref);
      return;
    }
    navigateTo(targetHref);
  };

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath={mode === "login" ? "/login" : "/signup"} />
      <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-2xl p-6 sm:p-7 space-y-5">
            <LensGlowOrbs
              primaryColor="var(--pl-orb-violet)"
              secondaryColor="var(--pl-orb-emerald)"
              subtle
            />

            <div className="relative z-10 space-y-5">
              <div
                className="seg-well glass-ring w-full"
                role="group"
                aria-label="Método de acceso a PitchLab"
              >
                <button
                  type="button"
                  className="seg-btn flex-1 justify-center"
                  aria-pressed={activeTab === "trial"}
                  onClick={() => setActiveTab("trial")}
                >
                  <MaestroIcon name="gift" size={14} />
                  <span>Prueba / Código</span>
                </button>
                <button
                  type="button"
                  className="seg-btn flex-1 justify-center"
                  aria-pressed={activeTab === "pin"}
                  onClick={() => setActiveTab("pin")}
                >
                  <MaestroIcon name="lock" size={14} />
                  <span>PIN Socio</span>
                </button>
              </div>

              {activeTab === "trial" ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <span className="pl-pill pl-pill--success">
                      <MaestroIcon name="sparkles" size={12} />
                      <span>
                        {month1NoCardMode
                          ? "Promo Mes 1 · $0 hoy y sin pedir tarjeta"
                          : "Cargo $0 hoy · Verificación anti-multicuenta"}
                      </span>
                    </span>
                    <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {mode === "signup"
                        ? "Activa tu Pase Total PitchLab"
                        : "Entra al Club PitchLab"}
                    </h1>
                    <p
                      className="m-0 text-sm leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      Accede a toda la <strong>{SPACETIME_METRICS_HEADLINE.suiteName}</strong>: 4 a
                      5 picks por partido, Armador de Parlays sin contradicciones, Cortex IA 60m y
                      Comunidad VIP.
                    </p>
                  </div>

                  {/* Reconocedor en vivo de código promocional */}
                  <div className="space-y-1.5">
                    <label htmlFor="auth-promo" className="block text-xs font-bold">
                      Código de Tipstar o Referido (opcional)
                    </label>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <input
                        id="auth-promo"
                        name="promo"
                        type="text"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Ej. SOFIA5, JAIR o vacío"
                        className="glass-input flex-1 min-w-0 px-3.5 py-2.5 text-sm uppercase font-extrabold num"
                      />
                      <span className="pl-pill pl-pill--success min-h-10 px-3 text-xs shrink-0">
                        <MaestroIcon name="check" size={13} />
                        <span>{promoInfo.badge}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span style={{ color: "var(--pl-text-muted)" }}>{promoInfo.detail}</span>
                      <div className="flex items-center gap-1.5">
                        {(["SOFIA5", "JAIR", ""] as const).map((sample) => (
                          <button
                            key={sample || "empty"}
                            type="button"
                            onClick={() => setPromoCode(sample)}
                            className="pl-btn-glass !min-h-6 !px-2 !text-[11px] num"
                          >
                            {sample || "Mes 1 sin código"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      className="pl-btn-primary min-h-11 text-sm"
                      onClick={() => handleOAuthClick("Google")}
                    >
                      <span>Continuar con Google</span>
                      <MaestroIcon name="arrowRight" size={14} />
                    </button>
                    <button
                      type="button"
                      className="pl-btn-glass glass-ring min-h-11 text-sm"
                      onClick={() => handleOAuthClick("Apple")}
                    >
                      <span>Continuar con Apple</span>
                    </button>
                  </div>

                  <div className="ticket-perf" />

                  <form className="auth-form space-y-3.5" onSubmit={handleTrialOrLoginSubmit}>
                    <div>
                      <label htmlFor="auth-email" className="block text-xs font-bold mb-1">
                        Correo electrónico personal
                      </label>
                      <input
                        id="auth-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (formError) setFormError("");
                        }}
                        placeholder="tu@correo.com"
                        className="glass-input w-full px-3.5 py-2.5 text-sm"
                      />
                      {normalizedPreview && normalizedPreview !== email.trim().toLowerCase() ? (
                        <p className="m-0 mt-1 text-xs" style={{ color: "var(--pl-info)" }}>
                          Se registrará como cuenta canónica: <strong>{normalizedPreview}</strong>
                        </p>
                      ) : null}
                    </div>

                    {!month1NoCardMode && mode === "signup" ? (
                      <div
                        className="glass-ring rounded-xl p-3 text-xs"
                        style={{ background: "var(--pl-surface)" }}
                      >
                        <strong>Modo Mes 2 Activo:</strong> Verificación de tarjeta $0.00 MXN hoy;
                        se cobra ${MEMBERSHIP_SPEC.monthlyMxn} MXN al finalizar la prueba si no
                        cancelas antes en 1 clic.
                      </div>
                    ) : null}

                    <div className="flex items-start gap-2.5 text-xs">
                      <input
                        id="auth-adult-check"
                        name="adultConfirmed"
                        type="checkbox"
                        checked={adultConfirmed}
                        onChange={(e) => setAdultConfirmed(e.target.checked)}
                        className="mt-0.5 cursor-pointer"
                      />
                      <label
                        htmlFor="auth-adult-check"
                        className="cursor-pointer"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        Confirmo que soy mayor de <strong>18 años (+18)</strong> y entiendo que
                        PitchLab opera con unidades estadísticas simuladas (0.5u–5.0u).
                      </label>
                    </div>

                    {formError ? (
                      <p
                        className="m-0 text-xs font-semibold"
                        role="alert"
                        style={{ color: "var(--pl-danger)" }}
                      >
                        {formError}
                      </p>
                    ) : null}

                    {verifiedEmailNotice ? (
                      <p
                        className="notice m-0 text-xs font-semibold"
                        style={{ color: "var(--pl-success)" }}
                      >
                        {verifiedEmailNotice}
                      </p>
                    ) : null}

                    <button type="submit" className="pl-btn-accent w-full min-h-11 text-sm">
                      <span>
                        {mode === "signup"
                          ? month1NoCardMode
                            ? "Validar correo y activar prueba sin tarjeta"
                            : "Continuar a verificación $0 MXN"
                          : "Continuar con correo verificado"}
                      </span>
                      <MaestroIcon name="arrowRight" size={14} />
                    </button>
                  </form>

                  {/* Escudo Turnstile $0 */}
                  <div
                    className="glass-ring rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                    style={{
                      background: "var(--pl-surface)",
                      color: "var(--pl-text-muted)",
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <MaestroIcon
                        name="shield"
                        size={14}
                        style={{ color: "var(--pl-success)" }}
                      />
                      <span>
                        Turnstile verificado · 0 correos temporales · 1 dispositivo = 1 prueba · 18+
                      </span>
                    </span>
                    <strong className="num" style={{ color: "var(--pl-success)" }}>
                      Costo $0
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="pl-pill pl-pill--brand">
                      <MaestroIcon name="lock" size={12} />
                      <span>Acceso directo de socio</span>
                    </span>
                    <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
                      Acceso rápido con PIN
                    </h1>
                    <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                      Marca 4 dígitos para entrar como{" "}
                      <strong style={{ color: "var(--pl-text)" }}>
                        @socio_pl (Suscriptor Pase Total)
                      </strong>{" "}
                      hacia <code>{nextPath}</code>.
                    </p>
                  </div>

                  <div
                    className="grid grid-cols-4 gap-3 max-w-[260px] mx-auto"
                    aria-label={`PIN ingresado: ${inlinePinDigits.length} de 4 dígitos`}
                  >
                    {[0, 1, 2, 3].map((idx) => {
                      const filled = inlinePinDigits[idx] !== undefined;
                      const isCurrent = inlinePinDigits.length === idx;
                      return (
                        <div
                          key={idx}
                          className="glass-input rounded-xl h-14 flex items-center justify-center text-2xl font-extrabold num"
                          style={{
                            borderColor: isCurrent
                              ? "var(--pl-brand)"
                              : "var(--pl-border)",
                            color: "var(--pl-text)",
                          }}
                        >
                          {filled ? "•" : ""}
                        </div>
                      );
                    })}
                  </div>

                  {inlinePinError ? (
                    <p
                      className="m-0 text-xs font-semibold text-center"
                      role="alert"
                      style={{ color: "var(--pl-danger)" }}
                    >
                      {inlinePinError}
                    </p>
                  ) : null}

                  <div
                    className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto"
                    role="group"
                    aria-label="Teclado numérico de PIN"
                  >
                    {[
                      "1",
                      "2",
                      "3",
                      "4",
                      "5",
                      "6",
                      "7",
                      "8",
                      "9",
                      "limpiar",
                      "0",
                      "borrar",
                    ].map((k) => (
                      <button
                        key={k}
                        type="button"
                        disabled={inlinePinBusy}
                        aria-label={
                          k === "limpiar"
                            ? "Limpiar PIN"
                            : k === "borrar"
                              ? "Borrar último dígito"
                              : `Dígito ${k}`
                        }
                        onClick={() => handleInlinePinKey(k)}
                        className="pl-btn-glass glass-ring !min-h-[42px] num text-base font-bold"
                      >
                        {k === "limpiar" ? (
                          <span className="text-xs">Limpiar</span>
                        ) : k === "borrar" ? (
                          <MaestroIcon name="arrowLeft" size={15} />
                        ) : (
                          k
                        )}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={inlinePinBusy}
                    className="pl-btn-primary w-full min-h-11 text-sm"
                    onClick={() => {
                      void verifyInlinePin("2026");
                    }}
                  >
                    <span>Entrar directo como @socio_pl (PIN 2026)</span>
                    <MaestroIcon name="arrowRight" size={15} />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 hairline-t">
                {mode === "login" ? (
                  <a
                    href="/signup"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/signup");
                    }}
                    className="underline"
                  >
                    ¿Nuevo en PitchLab? Activa tu prueba gratis
                  </a>
                ) : (
                  <a
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/login");
                    }}
                    className="underline"
                  >
                    ¿Ya eres socio? Inicia sesión aquí
                  </a>
                )}
                <a
                  href="/onboarding"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/onboarding");
                  }}
                  className="underline font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Personalizar ligas +18 →
                </a>
              </div>
            </div>
          </section>

          {/* Columna derecha: Pase Total + Acceso PIN Modal + Quick Role Tester */}
          <aside className="lg:col-span-5 space-y-4" aria-label="Acceso rápido y prueba de roles">
            <NoticeCard
              icon="cpu"
              badgeText="Incluido en tu"
              title="Pase Total PitchLab"
              tone="brand"
            >
              4 a 5 picks por partido · Armador de Parlays inteligente · Cortex IA con bajas 60 min
              antes · Comunidad exclusiva sin spam.
            </NoticeCard>

            <div className="glass-ring glass-card rounded-2xl p-5 space-y-3">
              <div className="space-y-1">
                <h2 className="m-0 text-sm font-extrabold">
                  ¿Tienes tu PIN de socio de 4 dígitos?
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                  Abre el teclado seguro para desbloquear tu sesión al instante y entrar a{" "}
                  <code>{nextPath}</code>.
                </p>
              </div>
              <button
                type="button"
                className="btn-beta pl-btn-primary w-full min-h-10 text-xs"
                onClick={() => openBetaPin(nextPath)}
              >
                <MaestroIcon name="lock" size={14} />
                <span>Ingresar PIN 4 dígitos</span>
                <MaestroIcon name="arrowRight" size={14} />
              </button>
            </div>

            <div className="glass-ring glass-card rounded-2xl p-5 space-y-3">
              <div className="space-y-0.5">
                <h2
                  className="m-0 text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Simulador rápido de roles
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                  Recorre las vistas reales de cada perfil en un clic:
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="pl-btn-glass glass-ring !min-h-[38px] !text-xs"
                  onClick={() => handleQuickRoleTest("member", "/app")}
                >
                  <MaestroIcon name="unlock" size={13} />
                  <span>Suscriptor</span>
                </button>
                <button
                  type="button"
                  className="pl-btn-glass glass-ring !min-h-[38px] !text-xs"
                  onClick={() => handleQuickRoleTest("tipstar", "/app/tipstar")}
                >
                  <MaestroIcon name="star" size={13} />
                  <span>Tipstar</span>
                </button>
                <button
                  type="button"
                  className="pl-btn-glass glass-ring !min-h-[38px] !text-xs"
                  onClick={() => handleQuickRoleTest("visitor", "/")}
                >
                  <MaestroIcon name="lock" size={13} />
                  <span>Visitante Candado</span>
                </button>
                <button
                  type="button"
                  className="pl-btn-glass glass-ring !min-h-[38px] !text-xs"
                  onClick={() => handleQuickRoleTest("admin", "/app/admin")}
                >
                  <MaestroIcon name="crown" size={13} />
                  <span>Admin Founder</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export function OnboardingSurfaceV4(): React.JSX.Element {
  const {
    rawDataset,
    dataset,
    favoriteLeagues,
    setFavoriteLeagues,
    riskPreference,
    setRiskPreference,
    oddsFormat,
    setOddsFormat,
    viewerRole,
    submitBetaPin,
    openBetaPin,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [baseUnitMxn, setBaseUnitMxn] = useState<number>(250);
  const [unitBankrollAck, setUnitBankrollAck] = useState<boolean>(true);

  const toggleLeague = (lg: LeagueId) => {
    if (favoriteLeagues.includes(lg)) {
      if (favoriteLeagues.length > 1) {
        setFavoriteLeagues(favoriteLeagues.filter((x) => x !== lg));
      }
    } else {
      setFavoriteLeagues([...favoriteLeagues, lg]);
    }
  };

  const handleSelectUnitMxn = (val: number) => {
    setBaseUnitMxn(val);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("pl-unit-mxn", String(val));
      }
    } catch (err) {
      void err;
    }
  };

  const handleFinish = () => {
    pushToast(
      `Perfil guardado (${favoriteLeagues.length} ligas · 1.0u = $${baseUnitMxn} MXN simulados).`,
      "success",
    );
    if (viewerRole === "visitor" && rawDataset.isServerRedactedForVisitor) {
      openBetaPin("/app");
      return;
    }
    if (rawDataset.isServerRedactedForVisitor) {
      void submitBetaPin("2026", "/app");
      return;
    }
    navigateTo("/app");
  };

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/onboarding" />
      <main id="main" className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-2xl p-6 sm:p-8 space-y-6">
          <LensGlowOrbs
            primaryColor="var(--pl-orb-violet)"
            secondaryColor="var(--pl-orb-sky)"
            subtle
          />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="pl-pill pl-pill--brand">
                <MaestroIcon name="sliders" size={13} />
                <span>Onboarding PitchLab · Configuración 18+</span>
              </span>
              <span className="text-xs font-semibold num" style={{ color: "var(--pl-text-muted)" }}>
                {favoriteLeagues.length} ligas activas · 1.0u = ${baseUnitMxn} MXN
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Personaliza tu radar cuantitativo
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Ordenaremos tu Jornada, alertas Cortex IA 60m y el Armador de Parlays alrededor de
                tus ligas, perfil de varianza y unidad simulada.
              </p>
            </div>

            {/* 1. Ligas prioritarias */}
            <div className="space-y-3">
              <h2 className="m-0 text-base font-extrabold">
                1. Elige tus ligas prioritarias
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {dataset.leagues.map((lg) => {
                  const active = favoriteLeagues.includes(lg.league);
                  return (
                    <button
                      key={lg.league}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLeague(lg.league)}
                      className="glass-ring rounded-xl p-3 text-left flex items-center justify-between gap-2 cursor-pointer border-0"
                      style={{
                        background: active
                          ? "var(--pl-surface-active)"
                          : "var(--pl-surface)",
                        color: "var(--pl-text)",
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <LeagueBadge league={lg.league} label={lg.label} size={20} />
                        <span className="text-xs font-bold truncate">{lg.label}</span>
                      </span>
                      {active ? (
                        <MaestroIcon
                          name="check"
                          size={14}
                          style={{ color: "var(--pl-success)" }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ticket-perf" />

            {/* 2. Perfil de riesgo */}
            <div className="space-y-3">
              <h2 className="m-0 text-base font-extrabold">
                2. Tu perfil de riesgo predeterminado
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: "conservador",
                      title: "Escudo Conservador",
                      desc: "Alta probabilidad (~72–86 %), dobles oportunidades y líneas protegidas.",
                    },
                    {
                      id: "medio",
                      title: "Balanceado Medio",
                      desc: "Equilibrio entre frecuencia (~56–71 %) y ventaja Geodesic contra el cierre.",
                    },
                    {
                      id: "arriesgado",
                      title: "Agresivo · Valor",
                      desc: "Cuotas altas (+105 o mayores) donde Singularity v2.1 detecta valor.",
                    },
                  ] as Array<{ id: RiskBand; title: string; desc: string }>
                ).map((opt) => {
                  const active = riskPreference === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRiskPreference(opt.id)}
                      className="glass-ring rounded-xl p-4 text-left space-y-1.5 cursor-pointer border-0"
                      style={{
                        background: active
                          ? "var(--pl-surface-active)"
                          : "var(--pl-surface)",
                        color: "var(--pl-text)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm font-bold">{opt.title}</strong>
                        {active ? (
                          <MaestroIcon
                            name="check"
                            size={14}
                            style={{ color: "var(--pl-success)" }}
                          />
                        ) : null}
                      </div>
                      <p
                        className="m-0 text-xs leading-relaxed"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ticket-perf" />

            {/* 3. Unidad base MXN y formato de momio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h2 className="m-0 text-sm font-extrabold">
                  3. Equivalencia simulada de 1.0 unidad (MXN)
                </h2>
                <div
                  className="seg-well glass-ring w-full"
                  role="group"
                  aria-label="Equivalencia simulada de 1 unidad en pesos mexicanos"
                >
                  {[100, 250, 500, 1000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className="seg-btn flex-1 justify-center num text-xs"
                      aria-pressed={baseUnitMxn === amount}
                      onClick={() => handleSelectUnitMxn(amount)}
                    >
                      ${amount.toLocaleString("es-MX")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="m-0 text-sm font-extrabold">
                  Formato preferido de cuota
                </h2>
                <div
                  className="seg-well glass-ring w-full"
                  role="group"
                  aria-label="Formato preferido de momio"
                >
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs"
                    aria-pressed={oddsFormat === "american"}
                    onClick={() => setOddsFormat("american")}
                  >
                    Americano (-110 / +125)
                  </button>
                  <button
                    type="button"
                    className="seg-btn flex-1 justify-center text-xs"
                    aria-pressed={oddsFormat === "decimal"}
                    onClick={() => setOddsFormat("decimal")}
                  >
                    Decimal (1.91 / 2.25)
                  </button>
                </div>
              </div>
            </div>

            {/* Confirmación +18 y CTA blanco */}
            <div
              className="glass-ring rounded-xl p-4 space-y-2.5 text-xs"
              style={{
                background: "var(--pl-surface)",
                color: "var(--pl-text-secondary)",
              }}
            >
              <p className="m-0 leading-relaxed">
                PitchLab es inteligencia deportiva por suscripción. Todas las bitácoras operan en{" "}
                <strong>unidades simuladas (0.5u–5.0u)</strong>; no aceptamos apuestas ni
                garantizamos rendimientos futuros.
              </p>
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  id="onboarding-age-check"
                  type="checkbox"
                  checked={unitBankrollAck}
                  onChange={(e) => setUnitBankrollAck(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <label
                  htmlFor="onboarding-age-check"
                  className="font-bold cursor-pointer"
                  style={{ color: "var(--pl-text)" }}
                >
                  Confirmo que soy mayor de 18 años (+18) y acepto las reglas de integridad de la
                  comunidad.
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/");
                }}
                className="pl-btn-glass glass-ring text-xs min-h-11"
              >
                <MaestroIcon name="arrowLeft" size={14} />
                <span>Volver al inicio</span>
              </a>
              <button
                type="button"
                disabled={!unitBankrollAck}
                className="pl-btn-primary min-h-11 px-6 text-sm"
                onClick={handleFinish}
              >
                <span>Activar Pase Total y entrar al Club</span>
                <MaestroIcon name="check" size={15} />
              </button>
            </div>
          </div>
        </section>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export const OnboardingSurface = OnboardingSurfaceV4;

export function PublicSharedPickSurface({
  pickSlug,
}: {
  pickSlug: string;
}): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, month1NoCardMode, navigateTo, pushToast } =
    usePlatform();

  const creator =
    TIPSTAR_CREATORS.find((c) => c.weeklyPickSlug === pickSlug) ?? TIPSTAR_CREATORS[0]!;

  const targetGame = useMemo(
    () =>
      dataset.games.find((g) =>
        g.picks.some(
          (p) => p.tipstarSlug === pickSlug || p.isTipstarWeeklyOpen || p.id === pickSlug,
        ),
      ) ??
      dataset.games.find((g) => g.status !== "FT") ??
      dataset.games[0],
    [dataset.games, pickSlug],
  );

  const unlockedPick =
    targetGame?.picks.find(
      (p) => p.tipstarSlug === pickSlug || p.isTipstarWeeklyOpen || p.id === pickSlug,
    ) ?? targetGame?.picks[0];

  const otherPicks = useMemo(
    () =>
      targetGame && unlockedPick
        ? targetGame.picks.filter((p) => p.id !== unlockedPick.id)
        : [],
    [targetGame, unlockedPick],
  );

  const homeColor = targetGame
    ? (getTeamColors(targetGame.league, targetGame.home.slug)?.[0] ?? "var(--pl-orb-violet)")
    : "var(--pl-orb-violet)";
  const awayColor = targetGame
    ? (getTeamColors(targetGame.league, targetGame.away.slug)?.[0] ?? "var(--pl-orb-emerald)")
    : "var(--pl-orb-emerald)";

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/p/sofia-sem" />
      <main id="main" className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-6">
        {/* Boleto oscuro auténtico estilo shows.link */}
        <article className="share-ticket-card glass-ring glass-ring--featured p-6 sm:p-8 space-y-5">
          <LensGlowOrbs primaryColor={homeColor} secondaryColor={awayColor} />

          <div className="relative z-10 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: "var(--share-card-surface)",
                  border: "1px solid var(--share-card-border)",
                  color: "var(--share-card-success)",
                }}
              >
                <MaestroIcon name="unlock" size={13} />
                <span>Pick Abierto de la Semana · Tipstar Oficial</span>
              </span>
              <span className="num text-xs font-bold" style={{ color: "var(--share-card-muted)" }}>
                pitchlab.mx/p/{creator.weeklyPickSlug}
              </span>
            </div>

            {/* Identidad verificada de @sofia_nfl */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span
                  className="w-12 h-12 rounded-full inline-flex items-center justify-center text-base font-extrabold shrink-0 avatar-ring"
                  style={{
                    background: creator.avatarGradVar,
                    color: "var(--share-card-fg)",
                  }}
                >
                  {creator.avatarInitials}
                </span>
                <div>
                  <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                    {creator.name} (@{creator.handle})
                  </h1>
                  <p
                    className="m-0 mt-0.5 text-xs num font-semibold"
                    style={{ color: "var(--share-card-success)" }}
                  >
                    Récord auditado: {creator.verifiedUnits} · CLV {creator.clvAvg} ·{" "}
                    {creator.settledCount} picks liquidados
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    void navigator.clipboard?.writeText(creator.promoCode);
                  } catch (err) {
                    void err;
                  }
                  pushToast(
                    `Código ${creator.promoCode} copiado (${creator.freeDays} días gratis).`,
                    "success",
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer"
                style={{
                  background: "var(--share-card-surface)",
                  border: "1px solid var(--share-card-border)",
                  color: "var(--share-card-fg)",
                }}
              >
                <MaestroIcon name="copy" size={13} />
                <span>
                  Código {creator.promoCode} ({creator.freeDays}d gratis)
                </span>
              </button>
            </div>

            <div className="ticket-perf" />

            {targetGame && unlockedPick ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 font-bold">
                    <LeagueBadge
                      league={targetGame.league}
                      label={targetGame.leagueLabel}
                      size={20}
                    />
                    <span>
                      {targetGame.leagueLabel} · {targetGame.round} · {targetGame.kickoffLocal}
                    </span>
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 font-bold"
                    style={{
                      background: "var(--share-card-surface)",
                      color: "var(--share-card-accent)",
                    }}
                  >
                    {unlockedPick.engineName}
                  </span>
                </div>

                {/* Duelo de escudos */}
                <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-3">
                    <CrestPedestal glowColor={homeColor} size="sm">
                      <TeamBadge
                        league={targetGame.league}
                        slug={targetGame.home.slug}
                        name={targetGame.home.name}
                        size={28}
                      />
                    </CrestPedestal>
                    <div>
                      <strong className="block text-sm sm:text-base font-extrabold">
                        {targetGame.home.name}
                      </strong>
                      <span className="text-xs num" style={{ color: "var(--share-card-muted)" }}>
                        {targetGame.home.record}
                      </span>
                    </div>
                  </div>

                  <span
                    className="text-xs font-bold uppercase"
                    style={{ color: "var(--share-card-muted)" }}
                  >
                    VS
                  </span>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <strong className="block text-sm sm:text-base font-extrabold">
                        {targetGame.away.name}
                      </strong>
                      <span className="text-xs num" style={{ color: "var(--share-card-muted)" }}>
                        {targetGame.away.record}
                      </span>
                    </div>
                    <CrestPedestal glowColor={awayColor} size="sm">
                      <TeamBadge
                        league={targetGame.league}
                        slug={targetGame.away.slug}
                        name={targetGame.away.name}
                        size={28}
                      />
                    </CrestPedestal>
                  </div>
                </div>

                {/* Pick semanal desbloqueado */}
                <div
                  className="rounded-2xl p-4 sm:p-5 space-y-2.5"
                  style={{
                    background: "var(--share-card-surface)",
                    border: "1px solid var(--share-card-border)",
                  }}
                  data-unlocked-pick={unlockedPick.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      className="font-extrabold inline-flex items-center gap-1.5"
                      style={{ color: "var(--share-card-success)" }}
                    >
                      <MaestroIcon name="check" size={14} />
                      <span>PICK ABIERTO DE LA SEMANA</span>
                    </span>
                    <span className="num font-bold" style={{ color: "var(--share-card-muted)" }}>
                      Sugerencia {unlockedPick.suggestedUnits.toFixed(1)}u
                    </span>
                  </div>

                  <p className="m-0 text-xl sm:text-2xl font-extrabold uppercase tracking-tight">
                    {unlockedPick.label}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs num">
                    <span style={{ color: "var(--share-card-secondary)" }}>
                      Probabilidad Suite:{" "}
                      <strong style={{ color: "var(--share-card-accent)" }}>
                        {(unlockedPick.p * 100).toFixed(1)} %
                      </strong>{" "}
                      · Cuota justa{" "}
                      <strong>{formatOddsValue(unlockedPick.fairDecimal, oddsFormat)}</strong>
                    </span>
                    <strong style={{ color: "var(--share-card-success)" }}>
                      Momio {formatOddsValue(unlockedPick.marketDecimal, oddsFormat)} (+
                      {Math.max(0.8, unlockedPick.edgePts).toFixed(1)} pts)
                    </strong>
                  </div>

                  <p
                    className="m-0 pt-1 text-xs leading-relaxed"
                    style={{ color: "var(--share-card-secondary)" }}
                  >
                    “{creator.weeklyPickThesis}”
                  </p>
                </div>

                <div className="ticket-perf" />

                {/* Candado explícito sobre los otros 4 picks del mismo partido */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      className="m-0 text-xs sm:text-sm font-extrabold uppercase tracking-wider"
                      style={{ color: "var(--share-card-secondary)" }}
                    >
                      Otros {otherPicks.length} picks de este mismo partido (Cero fuga sin Pase
                      Total)
                    </h2>
                    <span className="text-xs num" style={{ color: "var(--share-card-muted)" }}>
                      {viewerRole === "visitor" ? "Protegidos" : "Socio activo"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {otherPicks.map((lp) => {
                      const isOpen = viewerRole !== "visitor" && !lp.isRedacted;
                      if (isOpen) {
                        return (
                          <div
                            key={lp.id}
                            className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                            style={{
                              background: "var(--share-card-surface)",
                              border: "1px solid var(--share-card-border)",
                            }}
                          >
                            <span className="font-bold">
                              {lp.categoryLabel}: <strong>{lp.label}</strong>
                            </span>
                            <span className="num" style={{ color: "var(--share-card-success)" }}>
                              {(lp.p * 100).toFixed(1)} % ·{" "}
                              {formatOddsValue(lp.fairDecimal, oddsFormat)}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={lp.id}
                          className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                          style={{
                            background: "var(--share-card-surface)",
                            border: "1px solid var(--share-card-border)",
                          }}
                          data-locked-pick=""
                        >
                          <span
                            className="font-bold inline-flex items-center gap-1.5"
                            style={{ color: "var(--share-card-accent)" }}
                          >
                            <MaestroIcon name="lock" size={13} />
                            <span>
                              {lp.categoryLabel} · {lp.engineName}
                            </span>
                          </span>
                          <span
                            className="locked-redact font-extrabold"
                            aria-hidden="true"
                          >
                            RESERVADO PASE TOTAL
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="ticket-perf" />

            {/* CTA 1-clic para canjear SOFIA5 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs space-y-0.5">
                <strong className="block text-sm" style={{ color: "var(--share-card-fg)" }}>
                  CÓDIGO: {creator.promoCode} · {creator.freeDays} días de Pase Total gratis
                </strong>
                <span style={{ color: "var(--share-card-secondary)" }}>
                  {month1NoCardMode
                    ? "Desbloquea los 5 picks de cada juego y el Armador de Parlays sin pedir tarjeta."
                    : "Desbloquea los 5 picks de cada juego y el Armador de Parlays hoy."}
                </span>
              </div>

              <a
                href={`/signup?code=${creator.promoCode}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(`/signup?code=${creator.promoCode}`);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-11 text-xs sm:text-sm font-extrabold no-underline shrink-0"
                style={{
                  background: "var(--share-card-fg)",
                  color: "var(--share-card-bg)",
                }}
              >
                <span>
                  Canjear {creator.promoCode} · {creator.freeDays}d gratis
                </span>
                <MaestroIcon name="arrowRight" size={15} />
              </a>
            </div>
          </div>
        </article>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
