"use client";

import React, { useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports.js";
import {
  isDisposableEmailDomain,
  normalizeTrialEmail,
} from "../access-guard.js";
import {
  AtmosphereStage,
  PublicFooterV4,
  PublicHeaderV4,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  SPACETIME_METRICS_HEADLINE,
} from "../spacetime-catalog.js";
import type { RiskBand } from "../types.js";

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
    month1NoCardMode,
    openBetaPin,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [email, setEmail] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string>(initialPromoCode || "SOFIA5");
  const [adultConfirmed, setAdultConfirmed] = useState<boolean>(true);
  const [formError, setFormError] = useState<string>("");
  const [verifiedEmailNotice, setVerifiedEmailNotice] = useState<string>("");

  const normalizedPreview = email.includes("@") ? normalizeTrialEmail(email) : "";

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
      `${provider} OAuth listo ($0 MXN anti-abuso). En esta beta cerrada confirma tu PIN de 4 dígitos para entrar.`,
    );
    openBetaPin(mode === "signup" ? "/onboarding" : nextPath);
  };

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath={mode === "login" ? "/login" : "/signup"} />
      <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 space-y-5">
            <span className="pl-pill pl-pill--brand">
              {month1NoCardMode
                ? "Mes 1 de Lanzamiento · Sin Tarjeta"
                : "Prueba Gratis 7 Días · Verificación $0 MXN"}
            </span>
            <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight">
              {mode === "signup"
                ? "Activa tu Pase Total y desbloquea los 5 picks de cada partido"
                : "Entra al Club PitchLab"}
            </h1>
            <p className="m-0 text-sm sm:text-base" style={{ color: "var(--pl-text-secondary)" }}>
              Accede al ecosistema completo de{" "}
              <strong>{SPACETIME_METRICS_HEADLINE.suiteName}</strong>: radiografía previa con
              Cortex IA, alineaciones 60m antes, Armador Inteligente de Parlays y SGP, Player
              Props Lab y Comunidad VIP verificada.
            </p>

            <div className="glass-card glass-ring rounded-2xl p-5 space-y-3 text-xs">
              <strong className="block text-sm">
                Escudo Anti-Abuso $0 MXN (1 dispositivo = 1 prueba gratis)
              </strong>
              <ul className="m-0 pl-4 space-y-1.5" style={{ color: "var(--pl-text-secondary)" }}>
                <li>
                  Autenticación rápida con <strong>Google o Apple OAuth</strong> sin costo de SMS.
                </li>
                <li>
                  Normalización automática de alias (<code>+tag</code> y puntos en Gmail) + bloqueo
                  de correos desechables.
                </li>
                <li>
                  ¿Tienes código de Tipstar (ej. <strong>SOFIA5</strong>) o enlace de amigo? Se
                  acredita automáticamente al crear tu cuenta.
                </li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-6 glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-7 space-y-5">
            {/* Acceso directo con PIN de socio (compatible con /api/beta/unlock) */}
            <div
              className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
              style={{
                background: "var(--pl-surface-elevated)",
                border: "1px solid var(--pl-border-strong)",
              }}
            >
              <div>
                <strong className="block text-sm">¿Ya tienes tu PIN de socio de 4 dígitos?</strong>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Desbloquea tu sesión al instante y entra directo a {nextPath}.
                </span>
              </div>
              <button
                type="button"
                className="btn-beta pl-btn-primary text-xs"
                onClick={() => openBetaPin(nextPath)}
              >
                Ingresar PIN 4 dígitos →
              </button>
            </div>

            <div className="ticket-perf" />

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-10"
                onClick={() => handleOAuthClick("Google")}
              >
                Continuar con Google
              </button>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-10"
                onClick={() => handleOAuthClick("Apple")}
              >
                Continuar con Apple
              </button>
            </div>

            <form className="auth-form space-y-3.5" onSubmit={handleTrialOrLoginSubmit}>
              <div>
                <label htmlFor="auth-email" className="block text-xs font-bold mb-1">
                  Correo electrónico personal
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="glass-input w-full px-3.5 py-2.5 text-sm"
                />
                {normalizedPreview && normalizedPreview !== email.trim().toLowerCase() ? (
                  <p className="m-0 mt-1 text-xs" style={{ color: "var(--pl-info)" }}>
                    Se registrará como cuenta canónica: <strong>{normalizedPreview}</strong>
                  </p>
                ) : null}
              </div>

              {mode === "signup" ? (
                <div>
                  <label htmlFor="auth-promo" className="block text-xs font-bold mb-1">
                    Código de Tipstar o Referido (opcional)
                  </label>
                  <input
                    id="auth-promo"
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="SOFIA5 o código de amigo"
                    className="glass-input w-full px-3.5 py-2 text-sm uppercase font-bold num"
                  />
                </div>
              ) : null}

              {!month1NoCardMode && mode === "signup" ? (
                <div
                  className="rounded-xl p-3 text-xs"
                  style={{
                    background: "var(--pl-surface)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <strong>Modo Mes 2 Activo:</strong> Verificación de tarjeta $0.00 MXN hoy; se
                  cobra ${MEMBERSHIP_SPEC.monthlyMxn} MXN hasta el día 8 si no cancelas antes.
                </div>
              ) : null}

              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={adultConfirmed}
                  onChange={(e) => setAdultConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span style={{ color: "var(--pl-text-secondary)" }}>
                  Confirmo que soy mayor de <strong>18 años (+18)</strong> y entiendo que PitchLab
                  es una plataforma de análisis estadístico en unidades simuladas.
                </span>
              </label>

              {formError ? (
                <p className="m-0 text-xs font-semibold" role="alert" style={{ color: "var(--pl-danger)" }}>
                  {formError}
                </p>
              ) : null}

              {verifiedEmailNotice ? (
                <p className="notice m-0 text-xs font-semibold" style={{ color: "var(--pl-success)" }}>
                  {verifiedEmailNotice}
                </p>
              ) : null}

              <button type="submit" className="pl-btn-accent w-full min-h-11 text-sm">
                {mode === "signup"
                  ? month1NoCardMode
                    ? "Validar correo y activar prueba sin tarjeta"
                    : "Continuar a verificación $0 MXN"
                  : "Continuar con correo verificado"}
              </button>
            </form>

            <div className="flex items-center justify-between text-xs pt-1">
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
                className="underline"
                style={{ color: "var(--pl-brand)" }}
              >
                Configurar perfil +18 →
              </a>
            </div>
          </div>
        </div>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export function OnboardingSurfaceV4(): React.JSX.Element {
  const {
    dataset,
    favoriteLeagues,
    setFavoriteLeagues,
    riskPreference,
    setRiskPreference,
    viewerRole,
    openBetaPin,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  const handleFinish = () => {
    pushToast("Preferencias guardadas en tu perfil cuantitativo.", "success");
    if (viewerRole === "visitor") {
      openBetaPin("/app");
    } else {
      navigateTo("/app");
    }
  };

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/onboarding" />
      <main id="main" className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <span className="pl-pill pl-pill--brand num">Paso {step} de 3</span>
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              Calibración personal · +18 Responsable
            </span>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
                1. Elige tus ligas prioritarias
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Ordenaremos tu Jornada, alertas Cortex IA 60m y el Armador de Parlays según tus
                competiciones favoritas.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {dataset.leagues.map((lg) => {
                  const active = favoriteLeagues.includes(lg.league);
                  return (
                    <button
                      key={lg.league}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLeague(lg.league)}
                      className="glass-card glass-ring rounded-2xl p-3.5 flex items-center gap-2.5 text-left cursor-pointer"
                      style={{
                        border: active
                          ? "1.5px solid var(--pl-brand)"
                          : "1px solid var(--pl-border)",
                      }}
                    >
                      <LeagueBadge league={lg.league} label={lg.label} size={24} />
                      <div>
                        <strong className="block text-sm">{lg.label}</strong>
                        <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                          {lg.totalGames} partidos
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  className="pl-btn-primary"
                  onClick={() => setStep(2)}
                >
                  Siguiente: Perfil de riesgo →
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
                2. Define tu perfil de varianza
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Pre-seleccionaremos este perfil en tus Multi-Picks y en el Auto-Armador de Parlays
                (puedes cambiarlo en cualquier momento).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: "conservador",
                      title: "Escudo Conservador",
                      desc: "Probabilidades de 72 % a 86 %, dobles oportunidades y hándicaps protegidos.",
                    },
                    {
                      id: "medio",
                      title: "Balanceado Medio",
                      desc: "Equilibrio óptimo entre frecuencia (55 %–71 %) y ventaja Geodesic sobre el cierre.",
                    },
                    {
                      id: "arriesgado",
                      title: "Agresivo · Valor",
                      desc: "Cuotas altas (+105 o mayores) donde Geodesic v1.0 detecta sobreprecio.",
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
                      className="glass-card glass-ring rounded-2xl p-4 text-left space-y-1.5 cursor-pointer"
                      style={{
                        border: active
                          ? "1.5px solid var(--pl-brand)"
                          : "1px solid var(--pl-border)",
                      }}
                    >
                      <strong className="block text-sm">{opt.title}</strong>
                      <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  className="pl-btn-glass"
                  onClick={() => setStep(1)}
                >
                  ← Ligas
                </button>
                <button
                  type="button"
                  className="pl-btn-primary"
                  onClick={() => setStep(3)}
                >
                  Siguiente: Juego responsable +18 →
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
                3. Unidades simuladas y compromiso +18
              </h1>
              <div
                className="rounded-2xl p-4 space-y-2 text-sm"
                style={{
                  background: "var(--pl-surface)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                <p className="m-0">
                  En PitchLab todo se mide en <strong>unidades estadísticas simuladas</strong>{" "}
                  (<code>0.5u</code> a <code>5.0u</code>), nunca en promesas de dinero garantizado.
                </p>
                <label className="flex items-start gap-2.5 text-xs pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unitBankrollAck}
                    onChange={(e) => setUnitBankrollAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Soy mayor de 18 años (+18) y acepto usar la plataforma como herramienta de
                    análisis deportivo responsable.
                  </span>
                </label>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  className="pl-btn-glass"
                  onClick={() => setStep(2)}
                >
                  ← Perfil de riesgo
                </button>
                <button
                  type="button"
                  disabled={!unitBankrollAck}
                  className="pl-btn-primary"
                  onClick={handleFinish}
                >
                  Entrar al Club PitchLab →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
