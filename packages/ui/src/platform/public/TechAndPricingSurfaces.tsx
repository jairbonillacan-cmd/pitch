"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge, PBar, TeamBadge } from "../../sports.js";
import { MultiPickRow } from "../components/MatchTicketCard.js";
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
  TIPSTAR_CREATORS,
} from "../spacetime-catalog.js";

export function TechPrecisionSection({
  inClub = false,
}: {
  inClub?: boolean;
}): React.JSX.Element {
  const { navigateTo } = usePlatform();

  const comparisonRows = [
    {
      feature: "Origen de cada selección",
      pitchlab: "5 motores Spacetime Suite v2.1 (DS + ML + IA) sobre +358,400 juegos",
      traditional: "Opinión subjetiva sin validación estadística",
    },
    {
      feature: "Picks por encuentro",
      pitchlab: "4 a 5 picks estructurados por partido (Principal, Conservador, Totales, Táctico, Valor)",
      traditional: "1 pick aislado sin contexto de mercado ni momio justo",
    },
    {
      feature: "Armador de Parlays & SGP",
      pitchlab: "Auto-armador multi-liga con bloqueo de contradicciones y ajuste SGP Geodesic v1.0",
      traditional: "Combinadas improvisadas con alta comisión oculta",
    },
    {
      feature: "Auditoría de resultados",
      pitchlab: "100 % de partidos cerrados FT visibles con calibración prometida vs. real",
      traditional: "Mensajes editados o borrados en grupos externos",
    },
  ];

  return (
    <div className="space-y-10">
      <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pl-pill pl-pill--brand">
            {SPACETIME_METRICS_HEADLINE.suiteName}
          </span>
          <span className="pl-pill pl-pill--info">
            {SPACETIME_METRICS_HEADLINE.retrainSchedule}
          </span>
        </div>

        <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight">
          Data Science, Machine Learning e IA diseñados para vencer la línea de cierre
        </h1>

        <p className="m-0 text-base max-w-3xl" style={{ color: "var(--pl-text-secondary)" }}>
          Nuestro ecosistema propietario procesa{" "}
          <strong className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</strong>{" "}
          encuentros históricos y{" "}
          <strong className="num">{SPACETIME_METRICS_HEADLINE.telemetryPoints}</strong>{" "}
          puntos de telemetría deportiva. Tras el silbatazo final de cada jornada, los pesos se
          recalibran en ventana móvil para adaptarse al momento real de cada plantilla.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Partidos entrenados
            </span>
            <strong className="num text-2xl font-extrabold">
              {SPACETIME_METRICS_HEADLINE.historicalMatches}
            </strong>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Puntos de telemetría
            </span>
            <strong className="num text-2xl font-extrabold">
              {SPACETIME_METRICS_HEADLINE.telemetryPoints}
            </strong>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Supera momio de cierre
            </span>
            <strong
              className="num text-2xl font-extrabold"
              style={{ color: "var(--pl-success)" }}
            >
              {SPACETIME_METRICS_HEADLINE.closingLineBeatPct}
            </strong>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Error de calibración
            </span>
            <strong className="num text-2xl font-extrabold">
              {SPACETIME_METRICS_HEADLINE.calibrationError}
            </strong>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="m-0 text-2xl font-extrabold">
          Los 5 motores de PitchLab Spacetime Suite v2.1
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SPACETIME_ENGINES.map((eng) => (
            <article
              key={eng.key}
              className="glass-card glass-ring rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: eng.colorVar }}
                >
                  {eng.pillar} · {eng.domain}
                </span>
                <span className="pl-pill num">{eng.version}</span>
              </div>
              <h3 className="m-0 text-xl font-extrabold">{eng.name}</h3>
              <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                {eng.summary}
              </p>
              <div
                className="rounded-xl p-3 text-xs space-y-1"
                style={{ background: "var(--pl-surface)" }}
              >
                <p className="m-0">
                  <strong>Variables clave:</strong> {eng.inputsLabel}
                </p>
                <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
                  <strong>Ciclo:</strong> {eng.retrainCadence}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card glass-ring rounded-3xl p-6 space-y-4">
        <h2 className="m-0 text-2xl font-extrabold">
          Calibración Horizon: cuando anunciamos 80 %, se cumple 80 % en cancha
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRECISION_BUCKETS.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl p-4 space-y-2.5"
              style={{
                background: "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="m-0 text-base font-bold">{b.label}</h3>
                <span className="pl-pill num">{b.auditedPicksCount} auditados</span>
              </div>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {b.rangeLabel} · Supera cierre en {(b.closingBeatRate * 100).toFixed(1)} %
              </p>
              <div className="space-y-1 text-xs num">
                <div className="flex justify-between">
                  <span>Prometido por el motor</span>
                  <strong>{(b.promisedMeanP * 100).toFixed(1)} %</strong>
                </div>
                <PBar p={b.promisedMeanP} lead />
                <div className="flex justify-between pt-1">
                  <span>Acierto real auditado</span>
                  <strong style={{ color: "var(--pl-success)" }}>
                    {(b.actualHitRate * 100).toFixed(1)} %
                  </strong>
                </div>
                <div
                  className="pbar pos"
                  style={{ "--w": `${(b.actualHitRate * 100).toFixed(1)}%` } as React.CSSProperties}
                >
                  <span />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pl-deferred-section glass-card glass-ring rounded-3xl p-6 space-y-4">
        <h2 className="m-0 text-2xl font-extrabold">
          PitchLab Spacetime Suite vs. Tipster Tradicional
        </h2>
        <div
          className="pl-table-region"
          tabIndex={0}
          role="region"
          aria-label="Comparativa PitchLab Spacetime Suite frente a tipster tradicional"
        >
          <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
              <th scope="col" className="py-2.5 pr-4">Criterio</th>
              <th scope="col" className="py-2.5 pr-4">PitchLab Pase Total</th>
              <th scope="col" className="py-2.5">Tipster Tradicional</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.feature} className="hairline-b">
                <td className="py-3 pr-4 font-bold">{row.feature}</td>
                <td className="py-3 pr-4 font-semibold" style={{ color: "var(--pl-success)" }}>
                  {row.pitchlab}
                </td>
                <td className="py-3" style={{ color: "var(--pl-text-muted)" }}>
                  {row.traditional}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {!inClub ? (
          <div className="pt-2 flex justify-end">
            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/signup");
              }}
              className="pl-btn-primary text-xs"
            >
              Probar Spacetime Suite 7 días gratis →
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TechPrecisionSurface(): React.JSX.Element {
  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/tecnologia" />
      <main id="main" className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <TechPrecisionSection />
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export function PricingSurface(): React.JSX.Element {
  const { month1NoCardMode, navigateTo } = usePlatform();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "¿Por qué solo existe un Pase Total PitchLab?",
      a: "Eliminamos escalones artificiales. Con una sola suscripción ($299 MXN/mes o $2,390 MXN/año) tienes acceso absoluto a los 4–5 picks por partido, radiografía Cortex IA 60m, Armador de Parlays & SGP, Player Props Lab y la Comunidad VIP.",
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

  const includedFeatures = [
    "Radiografía previa Cortex IA + alineaciones confirmadas 60m antes",
    "4 a 5 picks estructurados por cada partido en las 7 ligas",
    "Armador Inteligente de Parlays + modo Mismo Partido (SGP) con Geodesic v1.0",
    "Player Props Lab interactivo (NFL y ligas europeas / Liga MX)",
    "Comunidad VIP exclusiva de suscriptores con récords verificados",
    "Bitácora personal auditada con cálculo de CLV y exportación CSV",
    "IVA incluido + Facturación automática CFDI 4.0",
  ];

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/pricing" />
      <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <span className="pl-pill pl-pill--brand">
            Membresía Única · Acceso Total
          </span>
          <h1 className="m-0 text-3xl sm:text-5xl font-extrabold tracking-tight">
            Un solo Pase Total. Cero letras chiquitas.
          </h1>
          <p className="m-0 text-base" style={{ color: "var(--pl-text-secondary)" }}>
            {month1NoCardMode
              ? MEMBERSHIP_SPEC.trialMonth1Label
              : MEMBERSHIP_SPEC.trialMonth2Label}{" "}
            · {MEMBERSHIP_SPEC.cfdiNote}
          </p>

          <div className="pt-2 flex justify-center">
            <div className="seg-well" role="group" aria-label="Periodicidad de facturación">
              <button
                type="button"
                className="seg-btn"
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Mensual · $299 MXN
              </button>
              <button
                type="button"
                className="seg-btn"
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Anual · $2,390 MXN (Ahorra 33 %)
              </button>
            </div>
          </div>
        </div>

        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-2xl font-extrabold">{MEMBERSHIP_SPEC.name}</h2>
              <span className="pl-pill pl-pill--success">Todo incluido</span>
            </div>
            <ul className="m-0 p-0 list-none space-y-2.5 text-sm">
              {includedFeatures.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span style={{ color: "var(--pl-success)" }} className="font-extrabold">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="lg:col-span-5 rounded-2xl p-6 space-y-4"
            style={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border-strong)",
            }}
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                {billing === "monthly" ? "Facturación mensual" : "Pago único anual (-33 %)"}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <strong className="num text-4xl font-extrabold">
                  $
                  {billing === "monthly"
                    ? MEMBERSHIP_SPEC.monthlyMxn
                    : MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")}
                </strong>
                <span className="text-sm" style={{ color: "var(--pl-text-muted)" }}>
                  MXN / {billing === "monthly" ? "mes" : "año ($199/mes eq.)"}
                </span>
              </div>
            </div>

            <div className="ticket-perf" />

            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/signup");
              }}
              className="pl-btn-primary w-full min-h-12 text-sm"
            >
              {month1NoCardMode
                ? "Empezar 7 días gratis sin tarjeta →"
                : "Empezar 7 días gratis ($0 hoy) →"}
            </a>

            <p className="m-0 text-xs text-center" style={{ color: "var(--pl-text-muted)" }}>
              Cancela en 1 clic antes del día 7. Incluye CFDI 4.0 automático.
            </p>
          </div>
        </section>

        {/* Referidos Doble Vía + Tipstars */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass-card glass-ring rounded-2xl p-6 space-y-3">
            <span className="pl-pill pl-pill--success">Socio ↔ Socio · Doble Vía</span>
            <h2 className="m-0 text-xl font-extrabold">
              Invita amigos: +15 días gratis para ambos
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Tu amigo entra con <strong>7 días gratis + 30 % de descuento</strong> en su primer
              mes ($209 MXN). Al confirmarse su primer pago mensual, ambos suman{" "}
              <strong>+15 días gratis</strong> automáticos. Al llegar a 5 amigos activos obtienes
              la insignia <strong>Embajador</strong> y +30 días adicionales.
            </p>
          </div>

          <div className="glass-card glass-ring rounded-2xl p-6 space-y-3">
            <span className="pl-pill pl-pill--info">Creadores Deportivos</span>
            <h2 className="m-0 text-xl font-extrabold">
              Programa Tipstar Oficial · 25 % recurrente
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              ¿Tienes comunidad deportiva? Recibe tu Pase Total incluido, comparte{" "}
              <strong>1 Pick Abierto de la Semana</strong> con boleto oficial PitchLab + tu código
              de 5 días gratis, y gana <strong>25 % de comisión mensual recurrente</strong> por
              cada suscriptor activo.
            </p>
          </div>
        </section>

        {/* Preguntas frecuentes */}
        <section className="pl-deferred-section glass-card glass-ring rounded-2xl p-6 space-y-3">
          <h2 className="m-0 text-xl font-extrabold">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {faqs.map((f, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={f.q}
                  className="rounded-xl p-3.5"
                  style={{
                    background: "var(--pl-surface)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-3 text-left font-bold text-sm bg-transparent border-0 cursor-pointer p-0"
                    style={{ color: "var(--pl-text)" }}
                  >
                    <span>{f.q}</span>
                    <span>{isOpen ? "−" : "+"}</span>
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

export function PublicTipstarPickSurface({
  pickSlug,
}: {
  pickSlug: string;
}): React.JSX.Element {
  const { dataset, navigateTo, pushToast } = usePlatform();

  const creator =
    TIPSTAR_CREATORS.find((c) => c.weeklyPickSlug === pickSlug) ?? TIPSTAR_CREATORS[0]!;

  const targetGame = useMemo(
    () =>
      dataset.games.find((g) =>
        g.picks.some((p) => p.tipstarSlug === pickSlug || p.isTipstarWeeklyOpen || p.id === pickSlug),
      ) ??
      dataset.games.find((g) => g.status !== "FT") ??
      dataset.games[0],
    [dataset.games, pickSlug],
  );

  const unlockedPick =
    targetGame?.picks.find(
      (p) => p.tipstarSlug === pickSlug || p.isTipstarWeeklyOpen || p.id === pickSlug,
    ) ?? targetGame?.picks[0];

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/p/sofia-sem" />
      <main id="main" className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-8">
        <div className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="w-12 h-12 rounded-full inline-flex items-center justify-center text-base font-extrabold"
                style={{ background: creator.avatarGradVar, color: "var(--share-card-fg)" }}
              >
                {creator.avatarInitials}
              </span>
              <div>
                <span className="pl-pill pl-pill--info">
                  Pick Abierto de la Semana · Tipstar Oficial
                </span>
                <h1 className="m-0 mt-1 text-2xl font-extrabold">
                  {creator.name} (@{creator.handle})
                </h1>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-success)" }}>
                  Récord verificado en PitchLab: {creator.verifiedUnits} · CLV {creator.clvAvg} ·{" "}
                  {creator.settledCount} picks auditados
                </p>
              </div>
            </div>

            <button
              type="button"
              className="pl-btn-primary text-xs"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(creator.promoCode);
                } catch (err) {
                  void err;
                }
                pushToast(
                  `Código ${creator.promoCode} copiado: úsalo al registrarte para obtener ${creator.freeDays} días gratis.`,
                  "success",
                );
              }}
            >
              Copiar código {creator.promoCode} ({creator.freeDays}d gratis)
            </button>
          </div>

          <div className="ticket-perf" />

          {targetGame && unlockedPick ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LeagueBadge
                    league={targetGame.league}
                    label={targetGame.leagueLabel}
                    size={22}
                  />
                  <span className="text-sm font-bold">
                    {targetGame.leagueLabel} · {targetGame.round} · {targetGame.kickoffLocal}
                  </span>
                </div>
                <span className="pl-pill pl-pill--brand">
                  Origen:{" "}
                  {creator.weeklyPickOrigin === "spacetime"
                    ? "Pick Oficial Spacetime Suite v2.1"
                    : "Pick Sellado de Bitácora"}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 font-bold">
                  <TeamBadge
                    league={targetGame.league}
                    slug={targetGame.home.slug}
                    name={targetGame.home.name}
                    size={30}
                  />
                  <span>{targetGame.home.name}</span>
                </div>
                <span style={{ color: "var(--pl-text-muted)" }}>vs</span>
                <div className="flex items-center gap-2 font-bold">
                  <TeamBadge
                    league={targetGame.league}
                    slug={targetGame.away.slug}
                    name={targetGame.away.name}
                    size={30}
                  />
                  <span>{targetGame.away.name}</span>
                </div>
              </div>

              {/* Único pick liberado de este partido */}
              <MultiPickRow
                pick={{ ...unlockedPick, isTipstarWeeklyOpen: true, isRedacted: false }}
                gameStatus={targetGame.status}
              />

              <div
                className="rounded-2xl p-4 text-sm space-y-1"
                style={{
                  background: "var(--pl-surface)",
                  border: "1px solid var(--pl-border)",
                }}
              >
                <strong className="block text-xs uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                  Tesis de @{creator.handle}
                </strong>
                <p className="m-0 leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                  {creator.weeklyPickThesis}
                </p>
              </div>

              <div className="ticket-perf" />

              {/* Los otros 4 picks del mismo partido permanecen protegidos */}
              <div className="space-y-2.5">
                <h2 className="m-0 text-base font-extrabold">
                  Otros {Math.max(0, targetGame.picks.length - 1)} picks de este mismo partido (protegidos)
                </h2>
                {targetGame.picks
                  .filter((p) => p.id !== unlockedPick.id)
                  .map((pk) => (
                    <MultiPickRow key={pk.id} pick={pk} gameStatus={targetGame.status} compact />
                  ))}
              </div>
            </div>
          ) : null}

          <div
            className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            style={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border-strong)",
            }}
          >
            <div>
              <strong className="block text-sm">
                ¿Quieres desbloquear los 5 picks de cada partido y el Armador de Parlays?
              </strong>
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Activa tus {creator.freeDays} días gratis con el código{" "}
                <strong>{creator.promoCode}</strong> (sin tarjeta en Mes 1).
              </span>
            </div>
            <a
              href={`/signup?code=${creator.promoCode}`}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(`/signup?code=${creator.promoCode}`);
              }}
              className="pl-btn-primary text-xs"
            >
              Canjear {creator.promoCode} →
            </a>
          </div>
        </div>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
