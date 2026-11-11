"use client";

import React, { useState } from "react";
import { PBar } from "../../sports.js";
import {
  LensGlowOrbs,
  MaestroIcon,
} from "../components/MaestroPrimitives.js";
import {
  AtmosphereStage,
  PublicFooterV4,
  PublicHeaderV4,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  PRECISION_BUCKETS,
  SPACETIME_ENGINES,
  SPACETIME_METRICS_HEADLINE,
} from "../spacetime-catalog.js";

export { PublicSharedPickSurface as PublicTipstarPickSurface } from "./AuthAndOnboardingSurfaces.js";

export function TechPrecisionSection({
  inClub = false,
  isStandalone = false,
}: {
  inClub?: boolean;
  isStandalone?: boolean;
}): React.JSX.Element {
  const { viewerRole, navigateTo } = usePlatform();
  const hasFullAccess = viewerRole !== "visitor";
  const isPrimaryHeading = isStandalone || inClub;
  const PrimaryHeadingTag = isPrimaryHeading ? "h1" : "h2";
  const SubHeadingTag = isPrimaryHeading ? "h2" : "h3";

  return (
    <section id="motores" className="space-y-6">
      <div className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-2xl p-6 sm:p-8 space-y-6">
        <LensGlowOrbs
          primaryColor="var(--pl-orb-violet)"
          secondaryColor="var(--pl-orb-emerald)"
        />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <span className="pl-pill pl-pill--brand">
                <MaestroIcon name="cpu" size={14} />
                <span>
                  Arquitectura Propietaria · {SPACETIME_METRICS_HEADLINE.suiteName}
                </span>
              </span>

              <PrimaryHeadingTag
                className={`m-0 ${
                  isPrimaryHeading ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
                } font-extrabold tracking-tight leading-tight`}
              >
                No somos corazonadas.
                <br />
                Somos Data Science, Machine Learning e IA entrenados cada jornada.
              </PrimaryHeadingTag>

              <p
                className="m-0 text-sm sm:text-base leading-relaxed"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                Cinco motores propietarios procesan{" "}
                <strong className="num">
                  {SPACETIME_METRICS_HEADLINE.historicalMatches} partidos de prueba fuera de muestra
                </strong>{" "}
                y{" "}
                <strong className="num">
                  {SPACETIME_METRICS_HEADLINE.telemetryPoints} registros de 28 fuentes
                </strong>
                ; cada versión se valida contra el mercado antes de publicarse y entrega
                varios picks y parlays por partido.
              </p>
            </div>

            <div
              className="glass-ring rounded-xl p-4 space-y-1.5 shrink-0"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center gap-2 text-xs font-bold"
                style={{ color: "var(--pl-success)" }}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: "var(--pl-success)" }}
                  aria-hidden="true"
                />
                <span>Validación fuera de muestra</span>
              </div>
              <div
                className="num text-xs"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                Temporada de prueba: <strong>2024–25</strong>
              </div>
              <div className="num text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Integridad SHA-256 · 0 fuga temporal
              </div>
            </div>
          </div>

          {/* 4 KPIs globales del laboratorio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 num">
            <div
              className="glass-ring rounded-xl p-4"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {SPACETIME_METRICS_HEADLINE.historicalMatches}
              </div>
              <div
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Partidos de prueba 2024–25
              </div>
            </div>

            <div
              className="glass-ring rounded-xl p-4"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold"
                style={{ color: "var(--pl-accent)" }}
              >
                {SPACETIME_METRICS_HEADLINE.telemetryPoints}
              </div>
              <div
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Registros del feature store (28 fuentes)
              </div>
            </div>

            <div
              className="glass-ring rounded-xl p-4"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="text-2xl sm:text-3xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                {SPACETIME_METRICS_HEADLINE.closingLineBeatPct}
              </div>
              <div
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                ROI fuera de muestra de Geodesic
              </div>
            </div>

            <div
              className="glass-ring rounded-xl p-4"
              style={{ background: "var(--pl-surface)" }}
            >
              <div className="text-2xl sm:text-3xl font-extrabold">5 Motores</div>
              <div
                className="text-xs font-medium mt-0.5"
                style={{ color: "var(--pl-text-muted)" }}
              >
                DS + ML + IA trabajando en cadena
              </div>
            </div>
          </div>

          {/* 6-card 3x2 grid: 5 motores propietarios + 6ta tarjeta comparativa */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SPACETIME_ENGINES.map((eng) => {
              const pillarPillClass =
                eng.pillar === "Inteligencia Artificial"
                  ? "pl-pill pl-pill--cortex"
                  : eng.pillar === "Machine Learning"
                    ? "pl-pill pl-pill--brand"
                    : "pl-pill pl-pill--info";

              return (
                <article
                  key={eng.key}
                  className="glass-ring glass-card rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={pillarPillClass}>{eng.pillar}</span>
                      <span
                        className="num text-xs font-semibold"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {eng.version}
                      </span>
                    </div>
                    <SubHeadingTag className="m-0 text-base font-extrabold tracking-tight">
                      {eng.name}
                    </SubHeadingTag>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {eng.domain} · {eng.retrainCadence}
                    </div>
                    <p
                      className="m-0 text-xs leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      {eng.summary}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="ticket-perf" />
                    <div
                      className="text-xs font-bold flex items-start gap-1.5"
                      style={{ color: "var(--pl-success)" }}
                    >
                      <MaestroIcon name="check" size={13} className="mt-0.5" />
                      <span>{eng.inputsLabel}</span>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* 6ta tarjeta: Comparativa directa contra Tipster Tradicional */}
            <article
              className="glass-ring rounded-xl p-4 flex flex-col justify-between gap-3"
              style={{ background: "var(--pl-compare-surface)" }}
            >
              <div className="space-y-2">
                <span className="pl-pill pl-pill--brand">Por qué ganamos</span>
                <SubHeadingTag className="m-0 text-base font-extrabold tracking-tight">
                  PitchLab vs Tipster Tradicional
                </SubHeadingTag>
                <ul
                  className="m-0 p-0 list-none space-y-1.5 text-xs"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  <li className="flex items-start gap-1.5">
                    <MaestroIcon
                      name="check"
                      size={13}
                      className="mt-0.5"
                      style={{ color: "var(--pl-success)" }}
                    />
                    <span>
                      <strong>hasta 5 picks por partido</strong> + Armador de Parlays sin choques
                      lógicos.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <MaestroIcon
                      name="check"
                      size={13}
                      className="mt-0.5"
                      style={{ color: "var(--pl-success)" }}
                    />
                    <span>
                      <strong>Boletos inmutables:</strong> nadie borra derrotas después del
                      silbatazo.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <MaestroIcon
                      name="check"
                      size={13}
                      className="mt-0.5"
                      style={{ color: "var(--pl-success)" }}
                    />
                    <span>
                      <strong>${MEMBERSHIP_SPEC.monthlyMxn} MXN/mes todo incluido</strong> frente a
                      grupos de $1,200+ sin ciencia.
                    </span>
                  </li>
                </ul>
              </div>

              <a
                href={hasFullAccess ? "/app/parlays" : "/signup"}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(hasFullAccess ? "/app/parlays" : "/signup");
                }}
                className="pl-btn-primary w-full !min-h-[36px] !text-xs"
              >
                <span>
                  {hasFullAccess ? "Armar un Parlay con la Suite" : "Activar Pase Total"}
                </span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </article>
          </div>
        </div>
      </div>

      {/* Termómetro de Precisión Real en Cancha (4 bloques calibrados) */}
      <div className="glass-ring glass-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <SubHeadingTag className="m-0 text-xl font-extrabold tracking-tight">
              Precisión prometida vs Acierto real en cancha
            </SubHeadingTag>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              Auditoría histórica sobre +23,600 predicciones cerradas: cuando nuestro motor
              declara una probabilidad, la cancha lo confirma punto por punto.
            </p>
          </div>
          <span className="pl-pill pl-pill--success num">
            Publicación abierta de aciertos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRECISION_BUCKETS.map((b) => (
            <div
              key={b.id}
              className="glass-ring rounded-xl p-4 space-y-2.5"
              style={{ background: "var(--pl-surface)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="font-bold text-sm">{b.label}</strong>
                <span
                  className="num text-xs font-semibold"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  {b.auditedPicksCount === null
                    ? "Auditoría en curso"
                    : `${b.auditedPicksCount.toLocaleString("es-MX")} auditados`}
                </span>
              </div>

              <div className="space-y-1.5 num text-xs">
                <div className="flex justify-between">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    Prometido: <strong style={{ color: "var(--pl-text)" }}>{(b.promisedMeanP * 100).toFixed(1)} %</strong>
                  </span>
                  <span style={{ color: "var(--pl-success)" }}>
                    Real auditado:{" "}
                    <strong>
                      {b.actualHitRate === null ? "se publica con los primeros picks" : `${(b.actualHitRate * 100).toFixed(1)} %`}
                    </strong>
                  </span>
                </div>
                <PBar p={b.promisedMeanP} lead />
                {b.actualHitRate !== null ? (
                  <div
                    className="pbar pos"
                    style={
                      {
                        "--w": `${(b.actualHitRate * 100).toFixed(1)}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span />
                  </div>
                ) : null}
              </div>

              <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                {b.rangeLabel}
                {b.closingBeatRate !== null
                  ? ` · Supera el cierre en ${(b.closingBeatRate * 100).toFixed(1)} %`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PlansAndReferralsSection({
  isStandalone = false,
}: {
  isStandalone?: boolean;
}): React.JSX.Element {
  const { month1NoCardMode, navigateTo, accountsEnabled, pushToast } = usePlatform();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [checkoutBusy, setCheckoutBusy] = useState<boolean>(false);

  // Con cuentas activas y sin la prueba sin tarjeta, el botón abre Stripe Checkout.
  const handleSubscribe = async () => {
    if (!accountsEnabled || month1NoCardMode) {
      navigateTo("/signup");
      return;
    }
    setCheckoutBusy(true);
    const result = await startCheckout(billing);
    setCheckoutBusy(false);
    if (result.url) {
      window.location.assign(result.url);
    } else if (result.status === 401) {
      navigateTo("/signup");
    } else {
      pushToast(result.error ?? "No se pudo abrir el pago.", "warning");
    }
  };
  const isAnnual = billing === "annual";
  const HeadingTag = isStandalone ? "h1" : "h2";
  const SubHeadingTag = isStandalone ? "h2" : "h3";

  const checklistItems = [
    "hasta 5 picks por partido (Conservador, Medio, Arriesgado y Totales)",
    "Armador Inteligente de Parlays (2 a 6 patas + modo SGP)",
    "Spacetime Suite v3.0 completa + resumen Cortex IA y bajas reportadas",
    "Player Prop Lab, comparador Geodesic v2.0 y debate exclusivo de pago",
  ];

  return (
    <section id="pase-total" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <HeadingTag
            className={`m-0 ${
              isStandalone ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
            } font-extrabold tracking-tight`}
          >
            Un solo Pase Total. Cero niveles recortados.
          </HeadingTag>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
            Menos de $10 pesos al día por toda la {SPACETIME_METRICS_HEADLINE.suiteName},
            multi-picks, parlays ilimitados y comunidad verificada. IVA y CFDI 4.0 incluidos.
          </p>
        </div>

        <div
          className="seg-well glass-ring"
          role="group"
          aria-label="Periodicidad de facturación"
        >
          <button
            type="button"
            className="seg-btn"
            aria-pressed={!isAnnual}
            onClick={() => setBilling("monthly")}
          >
            Mensual · ${MEMBERSHIP_SPEC.monthlyMxn}
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={isAnnual}
            onClick={() => setBilling("annual")}
          >
            Anual · ${MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")} (Ahorras 4 meses)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Columna izquierda: Pase Total PitchLab */}
        <div className="lg:col-span-7 glass-ring glass-lens glass-ring--featured relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between gap-5">
          <LensGlowOrbs
            primaryColor="var(--pl-orb-violet)"
            secondaryColor="var(--pl-orb-emerald)"
            subtle
          />

          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-lg uppercase tracking-wide">
                {MEMBERSHIP_SPEC.name}
              </span>
              <span className="pl-pill pl-pill--success">
                {month1NoCardMode
                  ? "Promo Mes 1 · Prueba sin tarjeta"
                  : "Prueba con código de socio o Tipstar"}
              </span>
            </div>

            <div className="ticket-perf" />

            <div className="num flex items-baseline gap-2">
              <span className="text-xl font-bold">$</span>
              <span className="text-4xl sm:text-5xl font-extrabold">
                {isAnnual
                  ? MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")
                  : MEMBERSHIP_SPEC.monthlyMxn}
              </span>
              <span className="text-sm" style={{ color: "var(--pl-text-muted)" }}>
                MXN /{" "}
                {isAnnual
                  ? `año (equivale a $${MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn}/mes)`
                  : "mes · cancela en 1 clic"}
              </span>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              {checklistItems.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <MaestroIcon
                    name="check"
                    size={15}
                    className="mt-0.5"
                    style={{ color: "var(--pl-success)" }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <a
              href="/signup"
              aria-busy={checkoutBusy}
              onClick={(e) => {
                e.preventDefault();
                if (!checkoutBusy) void handleSubscribe();
              }}
              className="pl-btn-primary !min-h-[44px] flex-1 text-sm"
            >
              <span>
                {month1NoCardMode
                  ? "Iniciar prueba gratis sin tarjeta"
                  : "Suscribirme al Pase Total"}
              </span>
              <MaestroIcon name="arrowRight" size={15} />
            </a>
            <a
              href="/onboarding"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/onboarding");
              }}
              className="pl-btn-glass glass-ring !min-h-[44px] text-sm"
            >
              Personalizar ligas (18+)
            </a>
          </div>
        </div>

        {/* Columna derecha: Referidos Doble Vía + Portal Tipstar Oficial */}
        <div className="lg:col-span-5 glass-ring glass-card rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <span className="pl-pill pl-pill--brand">
              <MaestroIcon name="gift" size={14} />
              <span>Referidos Doble Vía · Ambos ganan</span>
            </span>

            <SubHeadingTag className="m-0 text-xl font-extrabold tracking-tight">
              Invita a tu bolita y ambos suman días gratis
            </SubHeadingTag>

            <ul
              className="m-0 p-0 list-none space-y-2 text-xs sm:text-sm"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              <li className="flex items-start gap-2">
                <strong style={{ color: "var(--pl-brand)" }}>1.</strong>
                <span>
                  Tu amigo recibe{" "}
                  <strong>7 días de Pase Total gratis + 30 % de descuento</strong> en su 1.er
                  mes ($209 MXN).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <strong style={{ color: "var(--pl-brand)" }}>2.</strong>
                <span>
                  En cuanto paga su primer mes,{" "}
                  <strong>ambos reciben +15 días gratis</strong> acumulados automáticamente.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <strong style={{ color: "var(--pl-brand)" }}>3.</strong>
                <span>
                  Al llegar a 5 amigos activos ganas <strong>+1 mes completo extra</strong> e
                  insignia Embajador.
                </span>
              </li>
            </ul>

            <div className="ticket-perf" />

            <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
              <strong style={{ color: "var(--pl-text)" }}>¿Eres creador o tipster?</strong>{" "}
              Aplica como <strong>Tipstar Oficial</strong>: obtén Pase Total incluido, 1 Pick
              Gratis semanal con tu boleto brandeado y{" "}
              <strong>25 % de comisión recurrente</strong>.
            </p>
          </div>

          <a
            href="/app/tipstar"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/app/tipstar");
            }}
            className="pl-btn-glass glass-ring w-full !min-h-[40px] !text-xs"
          >
            <MaestroIcon name="trophy" size={14} />
            <span>Ver Portal de Tipstars Oficiales</span>
          </a>
        </div>
      </div>
    </section>
  );
}

export function TechPrecisionSurface(): React.JSX.Element {
  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/tecnologia" />
      <main id="main" className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-12">
        <TechPrecisionSection isStandalone />
        <PlansAndReferralsSection />
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export function PricingSurface(): React.JSX.Element {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "¿Por qué solo existe un Pase Total PitchLab?",
      a: "Eliminamos escalones artificiales. Con una sola suscripción ($299 MXN/mes o $2,390 MXN/año) tienes acceso a todos los picks de cada partido (hasta 5), la radiografía de Cortex IA, el Armador de Parlays & SGP y la Comunidad VIP; Player Props Lab llega cuando su motor pase validación.",
    },
    {
      q: "¿Cómo funciona la prueba gratis del primer mes sin tarjeta?",
      a: "Durante nuestro Mes 1 de lanzamiento activas tus 7 días gratis registrándote con Google, Apple o correo verificado sin ingresar tarjeta bancaria, protegido por nuestro sistema anti-multicuenta (1 dispositivo = 1 prueba).",
    },
    {
      q: "¿Cómo ganamos días gratis mi amigo y yo con los referidos?",
      a: "Tu invitado recibe 7 días gratis + 30 % de descuento en su primer mes ($209 MXN). En cuanto completa el pago de su primer mes, el sistema abona automáticamente +15 días gratis tanto a tu cuenta como a la suya.",
    },
    {
      q: "¿Emiten factura fiscal mexicana CFDI 4.0?",
      a: "Sí. Todos los precios incluyen IVA y puedes descargar tu factura CFDI 4.0 en PDF y XML desde Cuenta & Referidos en segundos.",
    },
  ];

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/pricing" />
      <main id="main" className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-12">
        <PlansAndReferralsSection isStandalone />
        <TechPrecisionSection />

        <section className="glass-card glass-ring rounded-2xl p-6 space-y-3">
          <h2 className="m-0 text-xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {faqs.map((f, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={f.q}
                  className="glass-ring rounded-xl p-3.5"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-3 text-left font-bold text-sm bg-transparent border-0 cursor-pointer p-0"
                    style={{ color: "var(--pl-text)" }}
                  >
                    <span>{f.q}</span>
                    <MaestroIcon name={isOpen ? "minus" : "plus"} size={14} />
                  </button>
                  {isOpen ? (
                    <p
                      className="m-0 mt-2 text-xs leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      {f.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

/** Pide al servidor una sesión de Stripe Checkout para el plan elegido. */
async function startCheckout(
  interval: "monthly" | "annual",
): Promise<{ url?: string; status: number; error?: string }> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    return { url: json.url, status: res.status, error: json.error };
  } catch (err) {
    void err;
    return { status: 0, error: "Sin conexión" };
  }
}
