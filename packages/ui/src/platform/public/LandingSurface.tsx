"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../sports.js";
import { formatOddsValue } from "../access-guard.js";
import { MatchTicketCard, MultiPickRow } from "../components/MatchTicketCard.js";
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

export function LandingSurface(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    setAuraFromGame,
    openBetaPin,
    navigateTo,
    pushToast,
  } = usePlatform();

  const heroCandidates = useMemo(() => {
    const upcoming = dataset.games.filter((g) => g.status !== "FT");
    const pool = upcoming.length >= 4 ? upcoming : dataset.games;
    // Priorizar el partido que contiene el Pick Abierto del Día en la posición 0
    const sorted = pool.slice().sort((a, b) => {
      const aOpen = a.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      const bOpen = b.picks.some((p) => p.isDailyOpenPromo) ? 1 : 0;
      return bOpen - aOpen;
    });
    return sorted.slice(0, 6);
  }, [dataset.games]);

  const [selectedHeroIdx, setSelectedHeroIdx] = useState<number>(0);
  const [userOddsInput, setUserOddsInput] = useState<string>("2.05");
  const [previewRisk, setPreviewRisk] = useState<"conservador" | "medio" | "arriesgado">("medio");

  const activeGame = heroCandidates[selectedHeroIdx] ?? heroCandidates[0];
  const openHeroPick =
    activeGame?.picks.find((p) => p.isDailyOpenPromo || p.isTipstarWeeklyOpen) ??
    activeGame?.picks[0];

  const parsedUserOdds = useMemo(() => {
    const raw = userOddsInput.trim().replace(",", ".");
    const num = Number(raw);
    if (!Number.isFinite(num)) return 2.0;
    if (/^[+-]/.test(raw) && Math.abs(num) >= 100) {
      return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
    }
    return num > 1.01 ? num : 2.0;
  }, [userOddsInput]);

  const liveEdgePts = openHeroPick
    ? Math.round((openHeroPick.p - 1 / parsedUserOdds) * 1000) / 10
    : 0;

  const settledAuditGames = useMemo(
    () => dataset.games.filter((g) => g.status === "FT" && g.score !== undefined).slice(0, 6),
    [dataset.games],
  );

  const sofiaCreator = TIPSTAR_CREATORS[0]!;
  const tipstarWeeklyGame = useMemo(
    () =>
      dataset.games.find((g) => g.picks.some((p) => p.isTipstarWeeklyOpen)) ??
      heroCandidates[1] ??
      heroCandidates[0],
    [dataset.games, heroCandidates],
  );
  const tipstarWeeklyPick =
    tipstarWeeklyGame?.picks.find((p) => p.isTipstarWeeklyOpen) ??
    tipstarWeeklyGame?.picks[0];

  return (
    <AtmosphereStage>
      <PublicHeaderV4 activePath="/" />

      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-20">
        {/* ==================== HERO: RADIOGRAFÍA + MULTI-PICKS ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex flex-wrap items-center gap-2">
              <span className="pl-pill pl-pill--brand">
                {SPACETIME_METRICS_HEADLINE.suiteName}
              </span>
              <span className="pl-pill pl-pill--success">
                Mes 1: 7 días gratis sin tarjeta
              </span>
            </div>

            <h1
              className="m-0 text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.06]"
            >
              Radiografía cuantitativa y 4 a 5 picks por partido.
            </h1>

            <p className="m-0 text-base sm:text-lg" style={{ color: "var(--pl-text-secondary)" }}>
              Data Science, Machine Learning e Inteligencia Artificial entrenados y
              reentrenados cada jornada sobre{" "}
              <strong className="num">{SPACETIME_METRICS_HEADLINE.historicalMatches}</strong>{" "}
              partidos históricos y{" "}
              <strong className="num">{SPACETIME_METRICS_HEADLINE.telemetryPoints}</strong>{" "}
              registros tácticos. Arma parlays inteligentes y debate en una comunidad
              exclusiva sin ruido.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary px-5 min-h-11 text-sm"
              >
                Iniciar prueba gratis (sin tarjeta) →
              </a>
              <button
                type="button"
                className="btn-beta pl-btn-glass px-4 min-h-11 text-sm"
                onClick={() => openBetaPin("/app")}
              >
                Tengo PIN de socio
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="glass-card glass-ring rounded-xl p-3">
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Registros entrenados
                </span>
                <strong className="num text-lg font-extrabold">
                  {SPACETIME_METRICS_HEADLINE.historicalMatches}
                </strong>
              </div>
              <div className="glass-card glass-ring rounded-xl p-3">
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Supera línea cierre
                </span>
                <strong
                  className="num text-lg font-extrabold"
                  style={{ color: "var(--pl-success)" }}
                >
                  {SPACETIME_METRICS_HEADLINE.closingLineBeatPct}
                </strong>
              </div>
              <div className="glass-card glass-ring rounded-xl p-3">
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Pase Total único
                </span>
                <strong className="num text-lg font-extrabold">
                  ${MEMBERSHIP_SPEC.monthlyMxn}/mes
                </strong>
              </div>
            </div>
          </div>

          {/* Boleto interactivo en vivo (muestra 1 pick abierto y protege el resto en modo visitante) */}
          <div className="lg:col-span-7 space-y-3">
            <div
              className="flex items-center gap-1.5 overflow-x-auto pb-1"
              role="tablist"
              aria-label="Seleccionar partido de muestra"
            >
              {heroCandidates.map((g, idx) => {
                const selected = idx === selectedHeroIdx;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setSelectedHeroIdx(idx);
                      setAuraFromGame(g);
                    }}
                    className="seg-btn text-xs shrink-0"
                    data-hero-game-chip={g.id}
                  >
                    <TeamBadge league={g.league} slug={g.home.slug} name={g.home.name} size={16} />
                    <span>
                      {g.home.shortName} vs {g.away.shortName}
                    </span>
                    {g.picks.some((p) => p.isDailyOpenPromo) ? (
                      <span className="pl-pill pl-pill--info">Abierto</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {activeGame ? (
              <div className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LeagueBadge
                      league={activeGame.league}
                      label={activeGame.leagueLabel}
                      size={22}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {activeGame.leagueLabel} · {activeGame.round} · {activeGame.kickoffLocal}
                    </span>
                  </div>
                  <span className="pl-pill pl-pill--brand num">
                    {activeGame.picks.length} picks generados · Conf. {activeGame.confidenceScore}/100
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="flex items-center gap-3">
                    <TeamBadge
                      league={activeGame.league}
                      slug={activeGame.home.slug}
                      name={activeGame.home.name}
                      size={40}
                    />
                    <div>
                      <p className="m-0 text-base font-extrabold">{activeGame.home.name}</p>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {activeGame.home.record}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <div className="sm:text-right">
                      <p className="m-0 text-base font-extrabold">{activeGame.away.name}</p>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {activeGame.away.record}
                      </span>
                    </div>
                    <TeamBadge
                      league={activeGame.league}
                      slug={activeGame.away.slug}
                      name={activeGame.away.name}
                      size={40}
                    />
                  </div>
                </div>

                <ProbSplit
                  probabilities={
                    activeGame.league === "nfl"
                      ? [activeGame.x12[0], activeGame.x12[2]]
                      : activeGame.x12
                  }
                  labels={
                    activeGame.league === "nfl"
                      ? [activeGame.home.shortName, activeGame.away.shortName]
                      : [activeGame.home.shortName, "Empate", activeGame.away.shortName]
                  }
                />

                {/* Síntesis Cortex IA (protegida si no es el juego promocional y es visitante) */}
                <div
                  className="rounded-2xl p-3.5 text-xs space-y-1"
                  style={{
                    background: "var(--pl-surface)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong style={{ color: "var(--engine-cortex)" }}>
                      ✦ Radiografía Previa · PitchLab Cortex IA
                    </strong>
                    <span style={{ color: "var(--pl-text-muted)" }}>
                      {activeGame.preGame.lineupStatusLabel}
                    </span>
                  </div>
                  <p className="m-0 leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                    {activeGame.preGame.cortexSynthesis}
                  </p>
                </div>

                <div className="ticket-perf" />

                {/* Lista de Picks del Partido (1 abierto + resto con candado Cero-Fuga en modo Visitante) */}
                <div className="space-y-2.5">
                  {activeGame.picks.slice(0, 3).map((pk) => (
                    <MultiPickRow
                      key={pk.id}
                      pick={pk}
                      gameStatus={activeGame.status}
                      compact
                    />
                  ))}
                </div>

                {/* Comparador en vivo Geodesic v1.0 */}
                {openHeroPick && (!openHeroPick.isRedacted || viewerRole !== "visitor") ? (
                  <div
                    className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                    style={{
                      background: "var(--pl-surface-elevated)",
                      border: "1px solid var(--pl-border)",
                    }}
                    data-odds-comparator=""
                  >
                    <div>
                      <label
                        htmlFor="landing-user-odds"
                        className="block text-xs font-bold"
                      >
                        Prueba tu cuota vs Geodesic v1.0 ({openHeroPick.label})
                      </label>
                      <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                        Momio justo sin margen:{" "}
                        {formatOddsValue(openHeroPick.fairDecimal, oddsFormat)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <input
                        id="landing-user-odds"
                        type="text"
                        inputMode="decimal"
                        value={userOddsInput}
                        onChange={(e) => setUserOddsInput(e.target.value)}
                        className="glass-input w-24 px-3 py-1.5 text-sm font-bold num text-center"
                      />
                      <span
                        className="text-xs font-extrabold num"
                        style={{
                          color:
                            liveEdgePts >= 0
                              ? "var(--pl-success)"
                              : "var(--pl-warning)",
                        }}
                      >
                        {liveEdgePts >= 0 ? `+${liveEdgePts.toFixed(1)}` : liveEdgePts.toFixed(1)}{" "}
                        pts
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {/* ==================== SPACETIME SUITE v2.1 ==================== */}
        <section id="tecnologia" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <p className="m-0 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--pl-brand)" }}>
                Arquitectura propietaria · DS + ML + IA
              </p>
              <h2 className="m-0 text-2xl sm:text-3xl font-extrabold">
                Cinco motores especializados reentrenados tras cada jornada
              </h2>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Ningún pronóstico sale de corazonadas. Cada partido atraviesa modelos de Data
                Science y Machine Learning calibrados con Inteligencia Artificial antes de
                publicarse.
              </p>
            </div>
            <a
              href="/tecnologia"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/tecnologia");
              }}
              className="pl-btn-glass text-xs"
            >
              Explorar arquitectura completa →
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {SPACETIME_ENGINES.map((eng) => (
              <article
                key={eng.key}
                className="glass-card glass-ring rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: eng.colorVar }}
                    >
                      {eng.pillar}
                    </span>
                    <span className="pl-pill num">{eng.version}</span>
                  </div>
                  <h3 className="m-0 text-base font-extrabold">{eng.name}</h3>
                  <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                    {eng.domain}
                  </p>
                  <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                    {eng.summary}
                  </p>
                </div>
                <div className="pt-2 hairline-t text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {eng.retrainCadence}
                </div>
              </article>
            ))}
          </div>

          {/* Precisión prometida vs Acierto real en cancha */}
          <div className="glass-card glass-ring rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="m-0 text-lg font-extrabold">
                  Precisión prometida vs. Acierto real en cancha
                </h3>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Auditoría walk-forward verificada sin sesgo retrospectivo · Calibración Horizon ({SPACETIME_METRICS_HEADLINE.calibrationError})
                </p>
              </div>
              <span className="pl-pill pl-pill--success num">
                69.6 % supera el cierre
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PRECISION_BUCKETS.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl p-4 space-y-2.5"
                  style={{
                    background: "var(--pl-surface)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">{b.label}</strong>
                    <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                      {b.rangeLabel}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs num">
                    <div className="flex justify-between">
                      <span>Probabilidad anunciada</span>
                      <strong>{(b.promisedMeanP * 100).toFixed(1)} %</strong>
                    </div>
                    <PBar p={b.promisedMeanP} lead />
                    <div className="flex justify-between pt-1">
                      <span>Acierto real verificado</span>
                      <strong style={{ color: "var(--pl-success)" }}>
                        {(b.actualHitRate * 100).toFixed(1)} %
                      </strong>
                    </div>
                    <div className="pbar pos" style={{ "--w": `${(b.actualHitRate * 100).toFixed(1)}%` } as React.CSSProperties}>
                      <span />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== PARLAYS + PICK SEMANAL TIPSTAR ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 glass-card glass-ring rounded-3xl p-6 flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <span className="pl-pill pl-pill--brand">
                Armador Inteligente de Parlays & SGP
              </span>
              <h2 className="m-0 text-2xl font-extrabold">
                Elige tus ligas y tu perfil de riesgo; Geodesic v1.0 arma la mejor combinada
              </h2>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Filtra entre las 7 ligas, define de 2 a 6 selecciones y activa Mismo Partido
                (SGP) para combinar hasta 2 mercados compatibles con ajuste matemático de
                correlación y bloqueo automático de contradicciones.
              </p>

              <div className="seg-well" role="group" aria-label="Simular nivel de riesgo del parlay">
                {(["conservador", "medio", "arriesgado"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="seg-btn capitalize"
                    aria-pressed={previewRisk === r}
                    onClick={() => setPreviewRisk(r)}
                  >
                    {r === "conservador"
                      ? "Escudo Conservador"
                      : r === "medio"
                        ? "Balanceado Medio"
                        : "Agresivo · Valor"}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">
                  Vista previa · Combinada {previewRisk} (3 selecciones)
                </span>
                <span className="pl-pill pl-pill--success num">
                  {previewRisk === "conservador"
                    ? "+3.8 pts ventaja"
                    : previewRisk === "medio"
                      ? "+5.4 pts ventaja"
                      : "+8.1 pts ventaja"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center num">
                <div className="rounded-xl p-2.5" style={{ background: "var(--pl-surface-elevated)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Prob. conjunta
                  </span>
                  <strong className="text-base font-extrabold">
                    {previewRisk === "conservador"
                      ? "51.4 %"
                      : previewRisk === "medio"
                        ? "29.2 %"
                        : "14.8 %"}
                  </strong>
                </div>
                <div className="rounded-xl p-2.5" style={{ background: "var(--pl-surface-elevated)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Momio combinado
                  </span>
                  <strong className="text-base font-extrabold">
                    {formatOddsValue(
                      previewRisk === "conservador"
                        ? 2.08
                        : previewRisk === "medio"
                          ? 3.72
                          : 7.45,
                      oddsFormat,
                    )}
                  </strong>
                </div>
                <div className="rounded-xl p-2.5" style={{ background: "var(--pl-surface-elevated)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Correlación SGP
                  </span>
                  <strong className="text-base font-extrabold" style={{ color: "var(--pl-brand)" }}>
                    Verificada
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Selecciones exactas protegidas para socios con Pase Total activo.
              </span>
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary text-xs"
              >
                Probar Armador de Parlays →
              </a>
            </div>
          </div>

          {/* Boleto abierto semanal de Tipstar Oficial */}
          <div className="lg:col-span-5 share-ticket-card p-6 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="pl-pill pl-pill--info">
                  Pick Abierto de la Semana · Tipstar Oficial
                </span>
                <span className="text-xs font-bold num" style={{ color: "var(--share-card-muted)" }}>
                  1 / semana
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-sm font-extrabold"
                  style={{ background: sofiaCreator.avatarGradVar, color: "var(--share-card-fg)" }}
                >
                  {sofiaCreator.avatarInitials}
                </span>
                <div>
                  <p className="m-0 text-sm font-extrabold">
                    {sofiaCreator.name} (@{sofiaCreator.handle})
                  </p>
                  <span className="text-xs num" style={{ color: "var(--share-card-success)" }}>
                    Récord auditado: {sofiaCreator.verifiedUnits} · CLV {sofiaCreator.clvAvg}
                  </span>
                </div>
              </div>

              <div className="ticket-perf" />

              {tipstarWeeklyGame && tipstarWeeklyPick ? (
                <div
                  className="rounded-2xl p-4 space-y-1.5"
                  style={{ background: "var(--share-card-surface)" }}
                >
                  <span className="text-xs font-bold" style={{ color: "var(--share-card-accent)" }}>
                    {tipstarWeeklyGame.leagueLabel} · {tipstarWeeklyPick.matchLabel}
                  </span>
                  <p className="m-0 text-lg font-extrabold">{tipstarWeeklyPick.label}</p>
                  <p className="m-0 text-xs num" style={{ color: "var(--share-card-secondary)" }}>
                    Prob. {(tipstarWeeklyPick.p * 100).toFixed(1)} % · Momio{" "}
                    {formatOddsValue(tipstarWeeklyPick.marketDecimal, oddsFormat)} · Los otros 4 picks del partido siguen con candado
                  </p>
                </div>
              ) : null}

              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--share-card-secondary)" }}>
                “{sofiaCreator.weeklyPickThesis}”
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="ticket-perf" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="pl-btn-glass text-xs"
                  onClick={() => {
                    try {
                      void navigator.clipboard?.writeText(sofiaCreator.promoCode);
                    } catch (err) {
                      void err;
                    }
                    pushToast(`Código ${sofiaCreator.promoCode} copiado (5 días gratis).`, "success");
                  }}
                >
                  Código: {sofiaCreator.promoCode} · 5d gratis
                </button>

                <a
                  href="/p/sofia-sem"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/p/sofia-sem");
                  }}
                  className="pl-btn-accent text-xs"
                >
                  Abrir boleto público →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== RESULTADOS CERRADOS FT + 7 LIGAS ==================== */}
        <section id="ligas" className="space-y-6">
          <div className="space-y-1">
            <p className="m-0 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--pl-brand)" }}>
              Transparencia Total · 7 Ligas Cubiertas
            </p>
            <h2 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Cobertura activa y resultados finalizados auditables
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {dataset.leagues.map((lg) => (
              <div
                key={lg.league}
                className="glass-card glass-ring rounded-2xl p-3.5 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <LeagueBadge league={lg.league} label={lg.label} size={22} />
                  <strong className="text-xs font-bold truncate">{lg.label}</strong>
                </div>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  {lg.roundLabel} · {lg.totalGames} juegos
                </p>
                {lg.leaderName ? (
                  <p className="m-0 text-xs truncate" style={{ color: "var(--pl-text-secondary)" }}>
                    Líder: <strong>{lg.leaderName}</strong>
                  </p>
                ) : (
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                    Spacetime activo
                  </p>
                )}
              </div>
            ))}
          </div>

          {settledAuditGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {settledAuditGames.slice(0, 3).map((g) => (
                <MatchTicketCard key={g.id} game={g} />
              ))}
            </div>
          ) : null}
        </section>

        {/* ==================== PASE TOTAL + REFERIDOS DOBLE VÍA ==================== */}
        <section
          id="pase-total"
          className="pl-deferred-section glass-lens glass-ring glass-ring--featured rounded-3xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
        >
          <div className="lg:col-span-7 space-y-3">
            <span className="pl-pill pl-pill--brand">
              Un solo Pase Total · Sin niveles confusos
            </span>
            <h2 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Todo PitchLab por ${MEMBERSHIP_SPEC.monthlyMxn} MXN/mes o $
              {MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")} MXN/año
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Incluye los 4 a 5 picks por partido en las 7 ligas, radiografía Cortex IA con
              alineaciones 60m antes, Armador Inteligente de Parlays y SGP, Player Props Lab,
              Comunidad VIP verificada y facturación CFDI 4.0 automática.
            </p>
            <div
              className="rounded-2xl p-4 text-xs space-y-1"
              style={{
                background: "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <strong style={{ color: "var(--pl-success)" }}>
                ✦ Sistema de Referidos Doble Vía:
              </strong>
              <p className="m-0" style={{ color: "var(--pl-text-secondary)" }}>
                Tu invitado recibe <strong>{MEMBERSHIP_SPEC.referralFriendBenefit}</strong>. En
                cuanto pague su primer mes, <strong>ambos reciben +15 días gratis</strong>{" "}
                acumulados automáticamente en su membresía.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-3">
            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/signup");
              }}
              className="pl-btn-primary min-h-12 text-sm w-full"
            >
              Activar 7 días gratis (Mes 1 sin tarjeta) →
            </a>
            <a
              href="/pricing"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/pricing");
              }}
              className="pl-btn-glass min-h-11 text-xs w-full"
            >
              Ver detalle de Pase Total, CFDI 4.0 y Programa Tipstar
            </a>
          </div>
        </section>
      </main>

      <PublicFooterV4 />
    </AtmosphereStage>
  );
}
