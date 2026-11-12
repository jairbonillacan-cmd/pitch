"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatEdgePts, formatOddsValue } from "../access-guard";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  ExampleBadge,
} from "../components/MaestroPrimitives";
import { usePlatform } from "../platform-provider";
import { TIPSTAR_CREATORS } from "../spacetime-catalog";
import type { RiskBand } from "../types";
import { LoginSurfaceV4, type LoginStep } from "./LoginSurfaceV4";
import { PublicSiteShell } from "./PublicSiteSections";
import { flushSignupDetails, resolveSignupInvite, SignupSurfaceV4 } from "./SignupSurfaceV4";

export function AuthSurfaceV4({
  mode,
  nextPath = "/app",
  initialPromoCode = "",
  previewSlot = null,
  passwordSignInEnabled = false,
  loginStep,
}: {
  mode: "login" | "signup";
  nextPath?: string;
  initialPromoCode?: string;
  previewSlot?: React.ReactNode;
  passwordSignInEnabled?: boolean;
  loginStep?: LoginStep;
}): React.JSX.Element {
  if (mode === "login") {
    return (
      <LoginSurfaceV4
        nextPath={nextPath}
        initialPromoCode={initialPromoCode}
        previewSlot={previewSlot}
        passwordSignInEnabled={passwordSignInEnabled}
        initialStep={loginStep}
      />
    );
  }
  return (
    <SignupSurfaceV4
      initialPromoCode={initialPromoCode}
      nextPath={nextPath}
      previewSlot={previewSlot}
    />
  );
}

export function OnboardingSurfaceV4({
  hasSession = false,
}: {
  hasSession?: boolean;
} = {}): React.JSX.Element {
  const {
    rawDataset,
    dataset,
    favoriteLeagues,
    setFavoriteLeagues,
    riskPreference,
    setRiskPreference,
    oddsFormat,
    setOddsFormat,
    unitMxn,
    setUnitMxn,
    hasAccountSession,
    viewerRole,
    openBetaPin,
    navigateTo,
    pushToast,
    accountsEnabled,
  } = usePlatform();

  // Con cuentas, aquí llega el enlace mágico (o la vuelta de Google): se guardan la fecha de
  // nacimiento y los consentimientos del paso 2, y con eso se activa la prueba.
  useEffect(() => {
    if (!accountsEnabled) return;
    let cancelled = false;
    const finishSignup = async () => {
      try {
        const trial = window.sessionStorage.getItem("pitchlab.signup.trial");
        window.sessionStorage.removeItem("pitchlab.signup.trial");
        if (trial === "concedida" || trial === "ya_usada" || trial === "apagada") {
          return { status: "saved", trial } as const;
        }
      } catch {
        // Continue without a message if browser storage is unavailable.
      }
      return flushSignupDetails();
    };
    void finishSignup().then((result) => {
      if (cancelled) return;
      if (result.status === "saved" && result.trial === "concedida") {
        pushToast("Tu prueba de 7 días ya está activa.", "success");
      } else if (result.status === "saved" && result.trial === "ya_usada") {
        pushToast("Este correo ya usó su prueba gratis.", "warning");
      } else if (result.status === "handle_taken") {
        pushToast("Ese usuario lo acaba de tomar alguien más. Elige otro.", "warning");
        navigateTo("/signup?paso=2&via=cuenta");
      } else if (result.status === "underage") {
        pushToast("PitchLab es solo para mayores de 18.", "warning");
        navigateTo("/");
      } else if (result.status === "error") {
        pushToast("No pudimos guardar tus datos. Te los pediremos de nuevo al entrar.", "warning");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, navigateTo, pushToast]);

  const [unitBankrollAck, setUnitBankrollAck] = useState<boolean>(true);
  const canFinish = hasAccountSession || unitBankrollAck;

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
    pushToast(
      `Perfil guardado (${favoriteLeagues.length} ligas · 1.0u = $${unitMxn} MXN simulados).`,
      "success",
    );
    // Con cuentas, el servidor decide el acceso al entrar a /app (sesión, registro y Pase).
    if (accountsEnabled) {
      navigateTo("/app");
      return;
    }
    if (viewerRole === "visitor" && rawDataset.isServerRedactedForVisitor) {
      openBetaPin("/app");
      return;
    }
    if (rawDataset.isServerRedactedForVisitor) {
      openBetaPin("/app");
      return;
    }
    navigateTo("/app");
  };

  return (
    <PublicSiteShell hasSession={hasSession || hasAccountSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
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
                {favoriteLeagues.length} ligas activas · 1.0u = ${unitMxn} MXN
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Elige tus ligas y tu estilo
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Con esto ordenamos tus partidos, alertas y parlays.
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
                      title: "Conservador",
                      desc: "Alta probabilidad (~72–86 %), dobles oportunidades y líneas protegidas.",
                    },
                    {
                      id: "medio",
                      title: "Balanceado Medio",
                      desc: "Picks de 56–71 % con algo de ventaja sobre el momio.",
                    },
                    {
                      id: "arriesgado",
                      title: "Agresivo · Valor",
                      desc: "Momios altos (+105 o más) donde el modelo ve valor.",
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
                      aria-pressed={unitMxn === amount}
                      onClick={() => setUnitMxn(amount)}
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

            {/* Confirmación +18 (solo si aún no tiene cuenta) y CTA blanco */}
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
              {!hasAccountSession ? (
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
              ) : null}
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
                disabled={!canFinish}
                className="pl-btn-primary min-h-11 px-6 text-sm"
                onClick={handleFinish}
              >
                <span>
                  {hasAccountSession
                    ? "Guardar preferencias y entrar al Club"
                    : "Guardar preferencias y continuar"}
                </span>
                <MaestroIcon name="check" size={15} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  );
}

export const OnboardingSurface = OnboardingSurfaceV4;

export function PublicSharedPickSurface({
  pickSlug,
  inviteCode = null,
  hasSession = false,
}: {
  pickSlug: string;
  inviteCode?: string | null;
  hasSession?: boolean;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    month1NoCardMode,
    hasAccountSession,
    navigateTo,
    pushToast,
  } = usePlatform();

  const matchedCreator =
    TIPSTAR_CREATORS.find((c) => c.weeklyPickSlug === pickSlug) ?? null;

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

  const effectivePromoCode = inviteCode ?? matchedCreator?.promoCode ?? null;
  const inviteInfo = effectivePromoCode ? resolveSignupInvite(effectivePromoCode) : null;
  const freeDays = inviteInfo?.freeDays ?? matchedCreator?.freeDays ?? 7;
  const signupTarget = effectivePromoCode
    ? `/signup?code=${encodeURIComponent(effectivePromoCode)}`
    : "/signup";
  const canRevealUnlockedPick = Boolean(
    unlockedPick &&
      (Boolean(matchedCreator) || !unlockedPick.isRedacted || viewerRole !== "visitor"),
  );

  return (
    <PublicSiteShell hasSession={hasSession || hasAccountSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-6">
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
                <MaestroIcon name={canRevealUnlockedPick ? "unlock" : "lock"} size={13} />
                <span>
                  {matchedCreator
                    ? "Pick abierto de la semana · Tipstar Oficial"
                    : "Boleto compartido · Club PitchLab"}
                </span>
              </span>
              <span className="num text-xs font-bold" style={{ color: "var(--share-card-muted)" }}>
                pitchlab.mx/p/{matchedCreator?.weeklyPickSlug ?? pickSlug}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              {matchedCreator ? (
                <div className="flex items-center gap-3.5">
                  <span
                    className="w-12 h-12 rounded-full inline-flex items-center justify-center text-base font-extrabold shrink-0 avatar-ring"
                    style={{
                      background: matchedCreator.avatarGradVar,
                      color: "var(--share-card-fg)",
                    }}
                  >
                    {matchedCreator.avatarInitials}
                  </span>
                  <div>
                    <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                      {matchedCreator.name} (@{matchedCreator.handle})
                    </h1>
                    {matchedCreator.isExample ? <ExampleBadge className="mt-1" /> : null}
                    <p
                      className="m-0 mt-0.5 text-xs num font-semibold"
                      style={{ color: "var(--share-card-success)" }}
                    >
                      Récord: {matchedCreator.verifiedUnits} ·{" "}
                      {matchedCreator.settledCount} picks liquidados
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                    {targetGame
                      ? `${targetGame.home.name} vs ${targetGame.away.name}`
                      : "Pick compartido de PitchLab"}
                  </h1>
                  <p
                    className="m-0 mt-0.5 text-xs font-semibold"
                    style={{ color: "var(--share-card-secondary)" }}
                  >
                    Boleto público verificado desde el analizador del club.
                  </p>
                </div>
              )}

              {effectivePromoCode ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard?.writeText(effectivePromoCode);
                    } catch (err) {
                      void err;
                    }
                    pushToast(
                      `Código ${effectivePromoCode} copiado (${freeDays} días gratis).`,
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
                    Código {effectivePromoCode} ({freeDays}d gratis)
                  </span>
                </button>
              ) : null}
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
                    {unlockedPick.categoryLabel}
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
                    className="text-xs font-bold"
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

                {/* Pick semanal desbloqueado o protegido */}
                {canRevealUnlockedPick ? (
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
                        <span>
                          {matchedCreator ? "PICK ABIERTO DE LA SEMANA" : "PICK COMPARTIDO"}
                        </span>
                      </span>
                      <span className="num font-bold" style={{ color: "var(--share-card-muted)" }}>
                        Sugerencia {unlockedPick.suggestedUnits.toFixed(1)}u
                      </span>
                    </div>

                    <p className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
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
                      {unlockedPick.marketDecimal !== null ? (
                        <strong style={{ color: "var(--share-card-success)" }}>
                          Momio {formatOddsValue(unlockedPick.marketDecimal, oddsFormat)} (
                          {formatEdgePts(unlockedPick.edgePts)})
                        </strong>
                      ) : null}
                    </div>

                    {matchedCreator ? (
                      <p
                        className="m-0 pt-1 text-xs leading-relaxed"
                        style={{ color: "var(--share-card-secondary)" }}
                      >
                        “{matchedCreator.weeklyPickThesis}”
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 text-xs"
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
                      <MaestroIcon name="lock" size={14} />
                      <span>{unlockedPick.categoryLabel} · Seleccionado en Pase Ultra</span>
                    </span>
                    <span className="locked-redact font-extrabold" aria-hidden="true">
                      RESERVADO PASE PITCHLAB ULTRA
                    </span>
                  </div>
                )}

                <div className="ticket-perf" />

                {/* Candado explícito sobre los otros 4 picks del mismo partido */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      className="m-0 text-xs sm:text-sm font-extrabold"
                      style={{ color: "var(--share-card-secondary)" }}
                    >
                      Otros {otherPicks.length} picks de este partido
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
                            <span>{lp.categoryLabel}</span>
                          </span>
                          <span
                            className="locked-redact font-extrabold"
                            aria-hidden="true"
                          >
                            RESERVADO PASE PITCHLAB ULTRA
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="ticket-perf" />

            {/* CTA 1-clic para canjear código o activar prueba */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs space-y-0.5">
                <strong className="block text-sm" style={{ color: "var(--share-card-fg)" }}>
                  {effectivePromoCode
                    ? `Código ${effectivePromoCode} · ${freeDays} días gratis de Pase PitchLab Ultra`
                    : `${freeDays} días gratis de Pase PitchLab Ultra`}
                </strong>
                <span style={{ color: "var(--share-card-secondary)" }}>
                  {month1NoCardMode
                    ? "Todos los picks de cada partido y el armador de parlays, sin tarjeta."
                    : "Todos los picks de cada partido y el armador de parlays."}
                </span>
              </div>

              <a
                href={signupTarget}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(signupTarget);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-11 text-xs sm:text-sm font-extrabold no-underline shrink-0"
                style={{
                  background: "var(--share-card-fg)",
                  color: "var(--share-card-bg)",
                }}
              >
                <span>
                  {effectivePromoCode
                    ? `Canjear ${effectivePromoCode} · ${freeDays}d gratis`
                    : `Probar ${freeDays}d gratis`}
                </span>
                <MaestroIcon name="arrowRight" size={15} />
              </a>
            </div>
          </div>
        </article>
      </div>
    </PublicSiteShell>
  );
}
