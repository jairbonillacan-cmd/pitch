"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { Switch } from "@heroui/react";
import { LeagueBadge, TeamBadge } from "../../sports.js";
import { formatOddsValue, isPickUnlocked } from "../access-guard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import {
  buildPlayerPropsCatalog,
  evaluatePropLineProbability,
} from "../match-picks-engine.js";
import { checkParlayCompatibility } from "../parlay-engine.js";
import { usePlatform } from "../platform-provider.js";
import type { RiskBand } from "../types.js";

export function ParlayBuilderClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    parlayLegs,
    allowSgp,
    setAllowSgp,
    parlayStakeUnits,
    setParlayStakeUnits,
    parlaySummary,
    addPickToParlay,
    removePickFromParlay,
    clearParlay,
    generateAutoParlay,
    sealParlayToJournal,
    openShareTicket,
  } = usePlatform();

  const [selectedLeagues, setSelectedLeagues] = useState<LeagueId[]>(() =>
    dataset.leagues.map((l) => l.league),
  );
  const [autoRisk, setAutoRisk] = useState<RiskBand>("medio");
  const [autoLegCount, setAutoLegCount] = useState<number>(3);

  const toggleAutoLeague = (lg: LeagueId) => {
    setSelectedLeagues((prev) =>
      prev.includes(lg)
        ? prev.length > 1
          ? prev.filter((x) => x !== lg)
          : prev
        : [...prev, lg],
    );
  };

  const candidateGames = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status !== "FT" && selectedLeagues.includes(g.league))
        .slice(0, 8),
    [dataset.games, selectedLeagues],
  );

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/parlays">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand">
            Geodesic v1.0 · Auto-Armador & Constructor Manual SGP
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Armador Inteligente de Parlays y Combinadas
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Elige tus ligas, perfil de riesgo y número de selecciones para que el motor construya
            tu boleto óptimo, o combina manualmente con protección automática contra mercados
            contradictorios.
          </p>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Columna izquierda: Auto-Armador + Catálogo Manual */}
          <div className="xl:col-span-7 space-y-5">
            <section className="glass-lens glass-ring rounded-3xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-extrabold">
                  1. Auto-Armador Cuantitativo
                </h2>
                <Switch
                  isSelected={allowSgp}
                  onChange={setAllowSgp}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <span className="text-xs font-bold">
                      Permitir Mismo Partido (SGP · máx. 2)
                    </span>
                  </Switch.Content>
                </Switch>
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ligas para el parlay">
                {dataset.leagues.map((lg) => {
                  const active = selectedLeagues.includes(lg.league);
                  return (
                    <button
                      key={lg.league}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleAutoLeague(lg.league)}
                      className="seg-btn text-xs"
                    >
                      <LeagueBadge league={lg.league} label={lg.label} size={15} />
                      <span>{lg.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="seg-well" role="group" aria-label="Riesgo del parlay">
                  {(["conservador", "medio", "arriesgado"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="seg-btn capitalize"
                      aria-pressed={autoRisk === r}
                      onClick={() => setAutoRisk(r)}
                    >
                      {r === "conservador"
                        ? "Conservador"
                        : r === "medio"
                          ? "Medio"
                          : "Arriesgado"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">Selecciones:</span>
                  <div className="sl-stepper" role="group" aria-label="Número de selecciones">
                    <button
                      type="button"
                      aria-label="Menos selecciones"
                      onClick={() => setAutoLegCount((n) => Math.max(2, n - 1))}
                    >
                      −
                    </button>
                    <span className="num">{autoLegCount}</span>
                    <button
                      type="button"
                      aria-label="Más selecciones"
                      onClick={() => setAutoLegCount((n) => Math.min(6, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="pl-btn-primary w-full min-h-11 text-sm"
                data-generate-parlay=""
                onClick={() =>
                  generateAutoParlay({
                    leagues: selectedLeagues,
                    risk: autoRisk,
                    legCount: autoLegCount,
                    allowSgp,
                  })
                }
              >
                ✦ Generar Mejor Parlay ({autoLegCount} selecciones · {autoRisk})
              </button>
            </section>

            {/* Selección manual con verificación de contradicciones en vivo */}
            <section className="space-y-3">
              <h2 className="m-0 text-lg font-extrabold">
                2. Selección Manual (Bloqueo Inteligente de Contradicciones)
              </h2>

              {candidateGames.map((g) => (
                <div
                  key={g.id}
                  className="glass-card glass-ring rounded-2xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">
                      {g.leagueLabel} · {g.home.shortName} vs {g.away.shortName}
                    </span>
                    <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                      {g.kickoffLocal}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {g.picks.slice(0, 4).map((pk) => {
                      const unlocked = isPickUnlocked(pk, g.status, viewerRole);
                      const inSlip = parlayLegs.some((l) => l.pick.id === pk.id);
                      const compat = checkParlayCompatibility(parlayLegs, pk, allowSgp);

                      if (!unlocked) {
                        return (
                          <div
                            key={pk.id}
                            className="rounded-xl p-2.5 text-xs opacity-70"
                            style={{ background: "var(--pl-surface)" }}
                          >
                            🔒 {pk.categoryLabel} (Pase Total)
                          </div>
                        );
                      }

                      return (
                        <button
                          key={pk.id}
                          type="button"
                          onClick={() =>
                            inSlip ? removePickFromParlay(pk.id) : addPickToParlay(pk)
                          }
                          disabled={!inSlip && !compat.allowed}
                          title={!inSlip && !compat.allowed ? compat.reason : undefined}
                          className="rounded-xl p-2.5 text-left text-xs cursor-pointer transition-opacity disabled:opacity-45 disabled:cursor-not-allowed"
                          style={{
                            background: inSlip
                              ? "var(--pl-surface-active)"
                              : "var(--pl-surface)",
                            border: inSlip
                              ? "1.5px solid var(--pl-brand)"
                              : "1px solid var(--pl-border)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-1 font-bold">
                            <span className="truncate">{pk.label}</span>
                            <span className="num shrink-0">
                              {formatOddsValue(pk.marketDecimal, oddsFormat)}
                            </span>
                          </div>
                          <div
                            className="flex items-center justify-between mt-1 num"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            <span>{(pk.p * 100).toFixed(0)} % prob.</span>
                            <span>
                              {inSlip
                                ? "✓ En boleto"
                                : compat.allowed
                                  ? "+ Agregar"
                                  : "Incompatible"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Columna derecha: Boleto Combinado Perforado */}
          <aside className="xl:col-span-5 glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4 sticky top-20">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                  Boleto Combinado PitchLab
                </span>
                <h2 className="m-0 text-xl font-extrabold">
                  {parlaySummary.legs.length} Selecciones Activas
                </h2>
              </div>
              {parlaySummary.legs.length > 0 ? (
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-8 px-2.5"
                  onClick={clearParlay}
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            <div className="ticket-perf" />

            {parlaySummary.legs.length === 0 ? (
              <p className="m-0 text-sm py-6 text-center" style={{ color: "var(--pl-text-muted)" }}>
                Usa el Auto-Armador o elige de 2 a 6 picks compatibles para calcular momio justo y
                correlación SGP.
              </p>
            ) : (
              <div className="space-y-2.5">
                {parlaySummary.legs.map(({ pick }) => (
                  <div
                    key={pick.id}
                    className="rounded-xl p-3 flex items-start justify-between gap-2"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {pick.leagueLabel} · {pick.matchLabel}
                      </span>
                      <strong className="block text-sm truncate">{pick.label}</strong>
                      <span className="text-xs num" style={{ color: "var(--pl-brand)" }}>
                        {(pick.p * 100).toFixed(1)} % ·{" "}
                        {formatOddsValue(pick.marketDecimal, oddsFormat)}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar ${pick.label}`}
                      onClick={() => removePickFromParlay(pick.id)}
                      className="pl-btn-glass px-2 min-h-7 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="ticket-perf" />

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Unidades simuladas</span>
                <div className="sl-stepper" role="group" aria-label="Unidades del boleto combinado">
                  <button
                    type="button"
                    aria-label="Restar unidades al parlay"
                    onClick={() =>
                      setParlayStakeUnits(Math.max(0.5, Math.round((parlayStakeUnits - 0.5) * 100) / 100))
                    }
                  >
                    −
                  </button>
                  <span className="num">{parlayStakeUnits.toFixed(2)}u</span>
                  <button
                    type="button"
                    aria-label="Sumar unidades al parlay"
                    onClick={() =>
                      setParlayStakeUnits(Math.min(5, Math.round((parlayStakeUnits + 0.5) * 100) / 100))
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              {parlaySummary.hasSgpCorrelation ? (
                <div
                  className="rounded-xl p-2.5 text-xs"
                  style={{
                    background: "var(--pl-surface)",
                    color: "var(--pl-info)",
                  }}
                >
                  ✦ Ajuste SGP activo: Geodesic v1.0 aplicó factor de correlación por selecciones
                  del mismo partido.
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5 num">
                <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Prob. Conjunta Real
                  </span>
                  <strong className="text-base font-extrabold">
                    {(parlaySummary.combinedProbability * 100).toFixed(1)} %
                  </strong>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Momio Combinado
                  </span>
                  <strong className="text-base font-extrabold">
                    {formatOddsValue(parlaySummary.bookDecimal, oddsFormat)}
                  </strong>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Momio Justo Geodesic
                  </span>
                  <strong className="text-base font-bold">
                    {formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}
                  </strong>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Retorno Simulado
                  </span>
                  <strong className="text-base font-extrabold" style={{ color: "var(--pl-success)" }}>
                    {parlaySummary.projectedReturnUnits.toFixed(2)}u
                  </strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={parlaySummary.legs.length < 2}
                className="pl-btn-glass text-xs"
                onClick={() =>
                  openShareTicket({
                    kind: "parlay",
                    title: `Parlay PitchLab (${parlaySummary.legs.length} picks)`,
                    subtitle: "Armador Inteligente · Spacetime Suite v2.1",
                    leagueLabel: "Multi-Liga",
                    pickLabel: parlaySummary.legs.map((l) => l.pick.label).join(" + "),
                    probability: parlaySummary.combinedProbability,
                    fairDecimal: parlaySummary.fairDecimal,
                    marketDecimal: parlaySummary.bookDecimal,
                    units: parlaySummary.stakeUnits,
                    gameStatus: "NS",
                  })
                }
              >
                Exportar boleto
              </button>
              <button
                type="button"
                disabled={parlaySummary.legs.length < 2}
                className="pl-btn-primary text-xs"
                onClick={() => sealParlayToJournal()}
              >
                Sellar Parlay ({parlaySummary.stakeUnits.toFixed(1)}u)
              </button>
            </div>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function PropsLabClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, pushToast, navigateTo } = usePlatform();
  const catalog = useMemo(() => buildPlayerPropsCatalog(dataset.games), [dataset.games]);
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/props">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand">
            Distribuciones Continuas · Minkowski v2.1 & Tachyon v2.1
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Player Props Lab Interactivo
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Mueve la línea alternativa con los controles <code>− / +</code> para recalcular al
            instante la probabilidad exacta Over/Under, el momio justo y la frecuencia en los
            últimos 10 encuentros.
          </p>
        </section>

        {viewerRole === "visitor" ? (
          <div className="glass-lens glass-ring rounded-3xl p-6 space-y-3">
            <h2 className="m-0 text-xl font-extrabold">
              🔒 Player Props Lab reservado para Pase Total
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Activa tus 7 días gratis para explorar proyecciones individuales de NFL y fútbol.
            </p>
            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/signup");
              }}
              className="pl-btn-primary text-xs"
            >
              Activar prueba gratis →
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {catalog.map((prop) => {
              const offset = lineOffsets[prop.id] ?? 0;
              const activeLine = Math.min(
                prop.maxLine,
                Math.max(prop.minLine, prop.baseLine + offset * prop.step),
              );
              const evalRes = evaluatePropLineProbability(
                prop.projectionMean,
                prop.projectionSd,
                activeLine,
              );
              const l10Hits = prop.last10.filter((v) => v > activeLine).length;
              const l5Hits = prop.last10.slice(-5).filter((v) => v > activeLine).length;
              const maxVal = Math.max(...prop.last10, activeLine * 1.2, 1);

              return (
                <article
                  key={prop.id}
                  className="glass-card glass-ring rounded-3xl p-5 space-y-4"
                  data-prop-card={prop.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <TeamBadge
                        league={prop.league}
                        slug={prop.teamSlug}
                        name={prop.teamName}
                        size={34}
                      />
                      <div>
                        <span className="text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                          {prop.leagueLabel} · {prop.matchLabel}
                        </span>
                        <h2 className="m-0 text-lg font-extrabold">
                          {prop.player} · {prop.statLabel}
                        </h2>
                      </div>
                    </div>
                    <span className="pl-pill">{prop.position}</span>
                  </div>

                  {/* Scrubber interactivo de línea */}
                  <div
                    className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div>
                      <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        Línea evaluada ({prop.engineName})
                      </span>
                      <strong className="num text-xl font-extrabold" data-prop-line={prop.id}>
                        {activeLine.toFixed(1)}
                      </strong>
                      <span className="text-xs ml-2 num" style={{ color: "var(--pl-success)" }}>
                        Media proy.: {prop.projectionMean.toFixed(1)}
                      </span>
                    </div>

                    <div className="sl-stepper" role="group" aria-label={`Ajustar línea de ${prop.player}`}>
                      <button
                        type="button"
                        aria-label={`Bajar línea de ${prop.player}`}
                        onClick={() =>
                          setLineOffsets((prev) => ({
                            ...prev,
                            [prop.id]: (prev[prop.id] ?? 0) - 1,
                          }))
                        }
                      >
                        −
                      </button>
                      <span className="num">Línea</span>
                      <button
                        type="button"
                        aria-label={`Subir línea de ${prop.player}`}
                        onClick={() =>
                          setLineOffsets((prev) => ({
                            ...prev,
                            [prop.id]: (prev[prop.id] ?? 0) + 1,
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Barras L10 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs num">
                      <span style={{ color: "var(--pl-text-muted)" }}>
                        Últimos 10 juegos vs línea {activeLine.toFixed(1)}
                      </span>
                      <strong>
                        L5: {l5Hits}/5 · L10: {l10Hits}/10
                      </strong>
                    </div>
                    <div className="grid grid-cols-10 gap-1.5 items-end h-20 pt-2">
                      {prop.last10.map((val, idx) => {
                        const hit = val > activeLine;
                        const pct = Math.max(16, Math.round((val / maxVal) * 100));
                        return (
                          <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end">
                            <div
                              className="w-full rounded-t-md transition-all"
                              style={{
                                height: `${pct}%`,
                                background: hit
                                  ? "var(--pl-success)"
                                  : "var(--pl-surface-hover)",
                              }}
                            />
                            <span className="text-[10px] num" style={{ color: "var(--pl-text-muted)" }}>
                              {val}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs num">
                    <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                      <span className="block" style={{ color: "var(--pl-text-muted)" }}>
                        Más de {activeLine.toFixed(1)}
                      </span>
                      <strong className="text-base font-extrabold" style={{ color: "var(--pl-brand)" }}>
                        {(evalRes.pOver * 100).toFixed(1)} % · Justa{" "}
                        {formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}
                      </strong>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                      <span className="block" style={{ color: "var(--pl-text-muted)" }}>
                        Menos de {activeLine.toFixed(1)}
                      </span>
                      <strong className="text-base font-extrabold">
                        {(evalRes.pUnder * 100).toFixed(1)} % · Justa{" "}
                        {formatOddsValue(evalRes.fairUnderDecimal, oddsFormat)}
                      </strong>
                    </div>
                  </div>

                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                    {prop.contextNote}
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="pl-btn-primary text-xs min-h-8 px-3"
                      onClick={() =>
                        pushToast(
                          `Prop registrado en seguimiento: ${prop.player} Más de ${activeLine.toFixed(1)} (${(evalRes.pOver * 100).toFixed(1)} %).`,
                          "success",
                        )
                      }
                    >
                      + Registrar Prop en Bitácora
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MomiosExplorerClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, openComposer, addPickToParlay } = usePlatform();
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(true);
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const out = [];
    for (const g of dataset.games) {
      if (g.status === "FT") continue;
      if (leagueFilter !== "all" && g.league !== leagueFilter) continue;
      for (const pk of g.picks) {
        if (!isPickUnlocked(pk, g.status, viewerRole)) continue;
        if (onlyPositiveEdge && pk.edgePts <= 0) continue;
        out.push({ game: g, pick: pk });
      }
    }
    return out.sort((a, b) => b.pick.edgePts - a.pick.edgePts).slice(0, 28);
  }, [dataset.games, leagueFilter, onlyPositiveEdge, viewerRole]);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/momios">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand">
              PitchLab Geodesic v1.0 · De-Vigging en Tiempo Real
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Explorador de Momios Limpios y Ventaja (EV)
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Liga en explorador de momios"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="glass-input px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">7 Ligas</option>
              {dataset.leagues.map((l) => (
                <option key={l.league} value={l.league}>
                  {l.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-pressed={onlyPositiveEdge}
              onClick={() => setOnlyPositiveEdge((v) => !v)}
              className="pl-btn-glass text-xs min-h-8 px-3"
            >
              {onlyPositiveEdge ? "✓ Solo Ventaja Positiva" : "Mostrar Todos"}
            </button>
          </div>
        </section>

        <section className="glass-card glass-ring rounded-2xl p-5">
          {rows.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              No hay líneas desbloqueadas con este filtro (activa Pase Total si estás en vista
              Visitante).
            </p>
          ) : (
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label="Tabla de momios y ventaja Geodesic"
            >
              <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">Encuentro</th>
                  <th scope="col" className="py-2 pr-3">Selección & Motor</th>
                  <th scope="col" className="py-2 px-2 text-right">Prob. Real</th>
                  <th scope="col" className="py-2 px-2 text-right">Justa Sin Vig</th>
                  <th scope="col" className="py-2 px-2 text-right">Mercado</th>
                  <th scope="col" className="py-2 px-2 text-right">Ventaja</th>
                  <th scope="col" className="py-2 pl-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ game, pick }) => (
                  <tr key={pick.id} className="hairline-b">
                    <td className="py-2.5 pr-3">
                      <strong className="block text-xs">{pick.matchLabel}</strong>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {game.leagueLabel} · {game.kickoffLocal}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <strong className="block text-sm">{pick.label}</strong>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {pick.engineName}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right num font-bold">
                      {(pick.p * 100).toFixed(1)} %
                    </td>
                    <td className="py-2.5 px-2 text-right num">
                      {formatOddsValue(pick.fairDecimal, oddsFormat)}
                    </td>
                    <td className="py-2.5 px-2 text-right num font-bold">
                      {formatOddsValue(pick.marketDecimal, oddsFormat)}
                    </td>
                    <td
                      className="py-2.5 px-2 text-right num font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                    >
                      +{pick.edgePts.toFixed(1)} pts
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-7 px-2"
                          onClick={() => addPickToParlay(pick)}
                        >
                          + Parlay
                        </button>
                        <button
                          type="button"
                          className="pl-btn-primary text-xs min-h-7 px-2.5"
                          onClick={() => openComposer(pick)}
                        >
                          Sellar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
