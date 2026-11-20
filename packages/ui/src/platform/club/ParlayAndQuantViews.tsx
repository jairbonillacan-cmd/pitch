"use client";

import React, { useMemo, useState } from "react";
import { OddsCompareClubView } from "./OddsCompareView";
import { PersonalParlayQuickBar } from "./PersonalParlayQuickBar";
import { shortDateLabel } from "./home/home-model";
import type { LeagueId } from "@pitchlab/contracts";
import { Switch } from "@heroui/react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../sports";
import {
  decimalToAmericanInt,
  formatEdgePts,
  formatOddsValue,
  isPickUnlocked,
  pickReferenceDecimal,
} from "../access-guard";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
} from "../components/MaestroPrimitives";
import { PlLeagueSelect } from "../components/PlSelect";
import {
  PlayerPropStreakCard,
  type PlayerPropStreakCardProps,
} from "../components/PlayerPropStreakCard";
import { SgpCopulaAuditCard } from "../components/SgpCopulaAuditCard";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  buildPlayerPropsCatalog,
  evaluatePropLineProbability,
} from "../match-picks-engine";
import {
  assessParlayRisk,
  checkParlayCompatibility,
  PARLAY_NON_COMBINABLE_RULES,
  type ParlayCompatibilityResult,
} from "../parlay-engine";
import {
  useJournalEntries,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { MatchPick, PlayerPropItem, RiskBand, SgpCopulaAuditView } from "../types";

function riskToneCss(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

function getCompactBlockReason(
  sameGameExists: boolean,
  allowSgp: boolean,
  compat: ParlayCompatibilityResult,
): string {
  if (compat.code === "live") {
    return "Partido en vivo (cerrado)";
  }
  if (compat.code === "finished") {
    return "Partido finalizado";
  }
  if (compat.code === "invalid_odds") {
    return "Línea cerrada para parlay";
  }
  if ((compat.code === "same_game_disabled" || sameGameExists) && !allowSgp) {
    return "Mismo partido: actívalo en el paso 4";
  }
  if (compat.code === "sgp_limit") {
    return "Máx. 2 selecciones por partido";
  }
  if (compat.code === "exact_score_sgp") {
    return "Marcador exacto: no combinable en SGP";
  }
  if (compat.code === "logical_contradiction") {
    return "Contradicción lógica en el partido";
  }
  if (compat.code === "same_axis") {
    return "Mismo eje de mercado (opuesto o redundante)";
  }
  const rawReason = compat.reason;
  if (!rawReason) {
    return "Mercado contradictorio";
  }
  const lower = rawReason.toLowerCase();
  if (lower.includes("mismo partido") && !allowSgp) {
    return "Mismo partido: actívalo en el paso 4";
  }
  if (lower.includes("contradic") || lower.includes("opuest") || lower.includes("choca")) {
    return "Mercado contradictorio";
  }
  if (lower.includes("máximo 2") || lower.includes("2 selecciones")) {
    return "Máx. 2 selecciones por partido";
  }
  return rawReason;
}

export function ParlayBuilderClubView(): React.JSX.Element {
  const { dataset, viewerRole, hasAccountSession, upgradeHref, oddsFormat } = usePlatformCore();
  const { setAllowSgp, setParlayStakeUnits, addPickToParlay, removePickFromParlay, clearParlay, generateAutoParlay, sealParlayToJournal, openShareTicket, navigateTo } = usePlatformActions();
  const { parlayLegs, allowSgp, parlayStakeUnits, parlaySummary } = useParlayState();

  const [selectedLeagues, setSelectedLeagues] = useState<LeagueId[]>(() =>
    dataset.leagues.map((l) => l.league),
  );
  const [autoRisk, setAutoRisk] = useState<RiskBand>("medio");
  const [autoLegCount, setAutoLegCount] = useState<number>(3);
  const [catalogLimit, setCatalogLimit] = useState<number>(12);
  const [bookParlayOddsRaw, setBookParlayOddsRaw] = useState<string>("");
  const [resolvedSgpAudit, setResolvedSgpAudit] = useState<SgpCopulaAuditView | null>(null);

  const parsedBookParlayDec = useMemo(
    () => (bookParlayOddsRaw.trim() ? parseUserOdds(bookParlayOddsRaw) : null),
    [bookParlayOddsRaw],
  );

  const toggleAutoLeague = (lg: LeagueId) => {
    setSelectedLeagues((prev) =>
      prev.includes(lg)
        ? prev.length > 1
          ? prev.filter((x) => x !== lg)
          : prev
        : [...prev, lg],
    );
  };

  const selectAllLeagues = () => {
    setSelectedLeagues(dataset.leagues.map((l) => l.league));
  };

  const allOpenGames = useMemo(
    () =>
      dataset.games.filter(
        (g) => g.status !== "FT" && g.status !== "LIVE" && selectedLeagues.includes(g.league),
      ),
    [dataset.games, selectedLeagues],
  );

  const candidateGames = useMemo(
    () => allOpenGames.slice(0, catalogLimit),
    [allOpenGames, catalogLimit],
  );

  const maxAutoLegs = Math.max(2, allowSgp ? allOpenGames.length * 2 : allOpenGames.length);
  const effectiveAutoLegCount = Math.min(maxAutoLegs, Math.max(2, autoLegCount));

  // Cuando la Cópula Student-t v5.1 (/api/parlays/sgp) responde, alinea el resumen del boleto
  // para que Prob. Conjunta Real, Momio justo y Nivel de riesgo coincidan exactamente.
  const activeSgpAudit = parlaySummary.hasSgpCorrelation ? resolvedSgpAudit : null;
  const effectiveSlipProb = useMemo(() => {
    if (!activeSgpAudit || parlaySummary.legs.length === 0) {
      return parlaySummary.combinedProbability;
    }
    if (parlaySummary.legs.length === activeSgpAudit.nLegs) {
      return activeSgpAudit.jointProbability;
    }
    const localMult = parlaySummary.sgpCorrelationMultiplier ?? 1;
    const adjusted =
      (parlaySummary.combinedProbability / Math.max(localMult, 0.05)) *
      activeSgpAudit.correlationMultiplier;
    return Math.min(0.92, Math.max(0.0001, adjusted));
  }, [activeSgpAudit, parlaySummary]);

  const effectiveSlipFairDec = useMemo(() => {
    if (
      activeSgpAudit &&
      parlaySummary.legs.length === activeSgpAudit.nLegs &&
      activeSgpAudit.fairCombinedDecimal > 1
    ) {
      return activeSgpAudit.fairCombinedDecimal;
    }
    return parlaySummary.legs.length > 0
      ? Math.max(1.05, Math.round((1 / Math.max(effectiveSlipProb, 0.0001)) * 100) / 100)
      : parlaySummary.fairDecimal;
  }, [activeSgpAudit, effectiveSlipProb, parlaySummary.fairDecimal, parlaySummary.legs.length]);

  const slipRisk = useMemo(
    () =>
      assessParlayRisk({
        ...parlaySummary,
        combinedProbability: effectiveSlipProb,
      }),
    [effectiveSlipProb, parlaySummary],
  );

  const effectiveSlipBookDec =
    parsedBookParlayDec && parsedBookParlayDec > 1
      ? parsedBookParlayDec
      : parlaySummary.bookDecimal;
  const effectiveSlipEdgePts =
    parlaySummary.legs.length > 0 && effectiveSlipBookDec > 1
      ? (effectiveSlipProb - 1 / effectiveSlipBookDec) * 100
      : parlaySummary.edgePts;
  const effectiveReturnUnits =
    parlaySummary.legs.length > 0
      ? Math.round(parlaySummary.stakeUnits * effectiveSlipBookDec * 100) / 100
      : 0;

  return (
    <AtmosphereStage activePath="/app/parlays">
      <ClubWorkspaceShell activePath="/app/parlays">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand inline-flex items-center gap-1.5">
            <MaestroIcon name="layers" size={12} />
            <span>Automático o a mano</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Armar parlay
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Configura los 4 pasos del motor cuantitativo para construir tu combinada óptima, o
            elige selecciones manualmente con bloqueo en vivo de mercados contradictorios.
          </p>
        </section>

        <PersonalParlayQuickBar />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Columna izquierda: 4 Pasos Numerados + Catálogo Manual */}
          <div className="xl:col-span-7 space-y-5">
            <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-5 relative overflow-hidden">
              <LensGlowOrbs subtle />

              <div className="space-y-5 relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-lg font-extrabold">
                    Auto-Armador Cuantitativo en 4 Pasos
                  </h2>
                  <span className="pl-pill pl-pill--info text-xs">
                    Sin contradicciones
                  </span>
                </div>

                {/* Paso 1: Ligas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold" style={{ color: "var(--pl-brand)" }}>
                      1. Ligas ({selectedLeagues.length}/{dataset.leagues.length})
                    </span>
                    <button
                      type="button"
                      onClick={selectAllLeagues}
                      className="pl-btn-glass text-[11px] min-h-9 px-3"
                    >
                      Seleccionar las {dataset.leagues.length} ligas
                    </button>
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="1. Ligas para el parlay"
                  >
                    {dataset.leagues.map((lg) => {
                      const active = selectedLeagues.includes(lg.league);
                      return (
                        <button
                          key={lg.league}
                          type="button"
                          aria-pressed={active}
                          data-active={active ? "true" : undefined}
                          onClick={() => toggleAutoLeague(lg.league)}
                          className="seg-btn text-xs glass-ring"
                        >
                          <LeagueBadge league={lg.league} label={lg.label} logoUrl={lg.logoUrl} size={15} />
                          <span>{lg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Paso 2 y Paso 3 en rejilla */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Paso 2: Riesgo */}
                  <div className="space-y-2">
                    <span
                      className="text-xs font-extrabold block"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      2. Riesgo
                    </span>
                    <div
                      className="seg-well w-full"
                      role="group"
                      aria-label="2. Riesgo del parlay"
                    >
                      {(["conservador", "medio", "arriesgado"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="seg-btn flex-1 justify-center capitalize text-xs"
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
                  </div>

                  {/* Paso 3: Selecciones libres (mín. 2) */}
                  <div className="space-y-2">
                    <span
                      className="text-xs font-extrabold block"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      3. Selecciones ({effectiveAutoLegCount} de {maxAutoLegs} disp.)
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="seg-well"
                        role="group"
                        aria-label="3. Selecciones"
                      >
                        {[2, 3, 4, 5, 6, 8, 10].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            disabled={cnt > maxAutoLegs}
                            className="seg-btn num text-xs px-2.5"
                            aria-pressed={effectiveAutoLegCount === cnt}
                            onClick={() => setAutoLegCount(cnt)}
                          >
                            {cnt}
                          </button>
                        ))}
                      </div>
                      <div
                        className="sl-stepper"
                        role="group"
                        aria-label="Ajustar número de selecciones"
                      >
                        <button
                          type="button"
                          aria-label="Menos selecciones"
                          disabled={effectiveAutoLegCount <= 2}
                          onClick={() => setAutoLegCount(Math.max(2, effectiveAutoLegCount - 1))}
                        >
                          −
                        </button>
                        <span className="num">{effectiveAutoLegCount}</span>
                        <button
                          type="button"
                          aria-label="Más selecciones"
                          disabled={effectiveAutoLegCount >= maxAutoLegs}
                          onClick={() => setAutoLegCount(Math.min(maxAutoLegs, effectiveAutoLegCount + 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Paso 4: SGP */}
                <div
                  className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <div className="space-y-0.5">
                    <span
                      className="text-xs font-extrabold block"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      4. Mismo partido
                    </span>
                    <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                      Permite hasta 2 selecciones de distinto eje del mismo partido (ej. Ganador + Totales). Bloquea líneas redundantes, marcador exacto y contradicciones.
                    </span>
                  </div>

                  <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>
                      <span className="text-xs font-bold">
                        {allowSgp ? "Mismo partido activado" : "Permitir mismo partido"}
                      </span>
                    </Switch.Content>
                  </Switch>
                </div>

                <button
                  type="button"
                  className="pl-btn-primary pl-btn-wrap w-full min-h-11 text-sm inline-flex items-center justify-center gap-2"
                  data-generate-parlay=""
                  onClick={() =>
                    generateAutoParlay({
                      leagues: selectedLeagues,
                      risk: autoRisk,
                      legCount: effectiveAutoLegCount,
                      allowSgp,
                    })
                  }
                >
                  <MaestroIcon name="sparkles" size={15} />
                  <span>
                    Generar Mejor Parlay ({effectiveAutoLegCount} selecciones · {autoRisk})
                  </span>
                </button>
              </div>
            </section>

            {/* Catálogo Manual con explicación explícita de incompatibilidad */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-extrabold">
                  Catálogo Manual · Protección Anti-Contradicción
                </h2>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Haz clic para agregar o quitar del boleto
                </span>
              </div>

              {candidateGames.map((g) => (
                <div
                  key={g.id}
                  className="glass-card glass-ring rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-2 font-bold">
                      <LeagueBadge league={g.league} label={g.leagueLabel} logoUrl={g.leagueLogoUrl} size={16} />
                      <span>
                        {g.leagueLabel} · {g.home.shortName} vs {g.away.shortName}
                      </span>
                    </span>
                    <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                      {shortDateLabel(g.dayId)} · {g.kickoffLocal}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {g.picks.slice(0, 4).map((pk) => {
                      const unlocked = isPickUnlocked(pk, g.status, viewerRole);
                      const inSlip = parlayLegs.some((l) => l.pick.id === pk.id);
                      const sameGameExists = parlayLegs.some(
                        (l) => l.pick.gameId === pk.gameId && l.pick.id !== pk.id,
                      );
                      const compat = checkParlayCompatibility(
                        parlayLegs,
                        pk,
                        allowSgp,
                      );

                      if (!unlocked) {
                        return (
                          <a
                            key={pk.id}
                            href={upgradeHref}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(upgradeHref);
                            }}
                            className="rounded-xl p-2.5 text-xs flex items-center justify-between gap-2 no-underline"
                            style={{
                              background: "var(--pl-surface)",
                              color: "var(--pl-text-secondary)",
                            }}
                          >
                            <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                              <MaestroIcon name="lock" size={12} />
                              <span className="truncate">{pk.categoryLabel}</span>
                            </span>
                            <span className="pl-pill text-[11px] shrink-0">
                              {hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}
                            </span>
                          </a>
                        );
                      }

                      const blockedReason =
                        !inSlip && !compat.allowed
                          ? getCompactBlockReason(
                              sameGameExists,
                              allowSgp,
                              compat,
                            )
                          : null;

                      return (
                        <button
                          key={pk.id}
                          type="button"
                          onClick={() =>
                            inSlip
                              ? removePickFromParlay(pk.id)
                              : addPickToParlay(pk)
                          }
                          disabled={!inSlip && !compat.allowed}
                          title={blockedReason ?? undefined}
                          className="rounded-xl p-3 text-left text-xs cursor-pointer transition-opacity disabled:opacity-60 disabled:cursor-not-allowed space-y-1"
                          style={{
                            background: inSlip
                              ? "var(--pl-surface-active)"
                              : "var(--pl-surface)",
                            boxShadow: inSlip
                              ? "inset 0 0 0 1.5px var(--pl-brand)"
                              : "inset 0 0 0 1px var(--pl-border)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-1.5 font-bold">
                            <span className="truncate">{pk.label}</span>
                            <span className="num shrink-0">
                              {formatOddsValue(pickReferenceDecimal(pk), oddsFormat)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1.5 num">
                            <span style={{ color: "var(--pl-text-muted)" }}>
                              {(pk.p * 100).toFixed(0)} % · {pk.categoryLabel}
                            </span>
                            {inSlip ? (
                              <span
                                className="inline-flex items-center gap-1 font-extrabold shrink-0"
                                style={{ color: "var(--pl-brand)" }}
                              >
                                <MaestroIcon name="check" size={11} />
                                <span>En boleto</span>
                              </span>
                            ) : compat.allowed ? (
                              <span
                                className="inline-flex items-center gap-1 font-bold shrink-0"
                                style={{ color: "var(--pl-success)" }}
                              >
                                <MaestroIcon name="plus" size={11} />
                                <span>Agregar</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 font-bold shrink-0"
                                style={{ color: "var(--pl-warning)" }}
                              >
                                <MaestroIcon name="x" size={11} />
                                <span>{blockedReason}</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {allOpenGames.length > catalogLimit ? (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-11 px-4"
                    onClick={() => setCatalogLimit((c) => c + 12)}
                  >
                    Ver más partidos ({allOpenGames.length - catalogLimit} restantes)
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          {/* Columna derecha: Boleto Combinado PitchLab Perforado */}
          <aside className="xl:col-span-5 glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto relative overflow-x-hidden">
            <LensGlowOrbs subtle />

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span
                    className="text-xs font-extrabold inline-flex items-center gap-1.5"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="ticket" size={13} />
                    <span>Boleto Combinado PitchLab</span>
                  </span>
                  <h2 className="m-0 text-xl font-extrabold">
                    {parlaySummary.legs.length} Selecciones Activas
                  </h2>
                </div>
                {parlaySummary.legs.length > 0 ? (
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
                    onClick={clearParlay}
                  >
                    <MaestroIcon name="x" size={12} />
                    <span>Limpiar</span>
                  </button>
                ) : null}
              </div>

              <div className="ticket-perf" />

              {parlaySummary.legs.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <p className="m-0 text-sm font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                    Tu boleto combinado está vacío
                  </p>
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Pulsa «Generar Mejor Parlay» o selecciona todas las jugadas compatibles que quieras del catálogo (mínimo 2 para sellar).
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {parlaySummary.legs.map(({ pick }) => {
                    const gm = dataset.games.find((g) => g.id === pick.gameId);
                    return (
                    <div
                      key={pick.id}
                      className="rounded-2xl p-3 flex items-start justify-between gap-2"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="min-w-0">
                        <span
                          className="block text-[11px] truncate"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {pick.leagueLabel} · {pick.matchLabel}
                          {gm ? ` · ${shortDateLabel(gm.dayId)} · ${gm.kickoffLocal}` : ` · ${pick.kickoffLocal}`}
                        </span>
                        <strong className="block text-sm truncate">{pick.label}</strong>
                        <span
                          className="text-xs num font-bold"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          {(pick.p * 100).toFixed(1)} % ·{" "}
                          {formatOddsValue(pickReferenceDecimal(pick), oddsFormat)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${pick.label}`}
                        onClick={() => removePickFromParlay(pick.id)}
                        className="pl-btn-glass px-2.5 min-h-9 text-xs inline-flex items-center justify-center shrink-0"
                      >
                        <MaestroIcon name="x" size={12} />
                      </button>
                    </div>
                  );
                  })}
                </div>
              )}

              <div
                className="rounded-2xl p-3.5 space-y-2"
                style={{
                  background: "var(--pl-surface)",
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${riskToneCss(slipRisk.tone)} 38%, var(--pl-border))`,
                }}
                data-parlay-risk-meter={slipRisk.level}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
                    Nivel de riesgo del boleto
                  </span>
                  <span
                    className="text-xs font-extrabold num"
                    style={{ color: riskToneCss(slipRisk.tone) }}
                  >
                    {slipRisk.label}
                  </span>
                </div>
                {parlaySummary.legs.length > 0 ? (
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--pl-surface-hover)" }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${slipRisk.meterPct}%`,
                        background: riskToneCss(slipRisk.tone),
                      }}
                    />
                  </div>
                ) : null}
                <p className="m-0 text-xs font-semibold num" style={{ color: "var(--pl-text)" }}>
                  {slipRisk.headline}
                </p>
                <p className="m-0 text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
                  {slipRisk.guidance}
                </p>
                {slipRisk.warnings.length > 0 ? (
                  <ul className="m-0 pl-4 space-y-1 text-[11px] font-semibold" style={{ color: riskToneCss(slipRisk.tone) }}>
                    {slipRisk.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="ticket-perf" />

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">Unidades simuladas</span>
                  <div
                    className="sl-stepper"
                    role="group"
                    aria-label="Unidades del boleto combinado"
                  >
                    <button
                      type="button"
                      aria-label="Restar unidades al parlay"
                      onClick={() =>
                        setParlayStakeUnits(
                          Math.max(
                            0.5,
                            Math.round((parlayStakeUnits - 0.5) * 100) / 100,
                          ),
                        )
                      }
                    >
                      −
                    </button>
                    <span className="num">{parlayStakeUnits.toFixed(2)}u</span>
                    <button
                      type="button"
                      aria-label="Sumar unidades al parlay"
                      onClick={() =>
                        setParlayStakeUnits(
                          Math.min(
                            5,
                            Math.round((parlayStakeUnits + 0.5) * 100) / 100,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Calculadora de momio total de casa */}
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="parlay-book-odds-input"
                    className="text-xs font-bold"
                  >
                    Momio total en tu casa:
                  </label>
                  <input
                    id="parlay-book-odds-input"
                    type="text"
                    value={bookParlayOddsRaw}
                    onChange={(e) => setBookParlayOddsRaw(e.target.value)}
                    placeholder="Opcional (+340 / 4.40)"
                    className="glass-input px-2.5 py-1 text-xs font-bold num w-40 text-right"
                  />
                </div>

                {parlaySummary.hasSgpCorrelation ? (
                  <SgpCopulaAuditCard
                    legs={parlaySummary.legs}
                    oddsFormat={oddsFormat}
                    offeredCombinedDecimalOdds={parsedBookParlayDec}
                    onAuditResolved={setResolvedSgpAudit}
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-2.5 num">
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Prob. Conjunta Real
                    </span>
                    <strong className="text-base font-extrabold">
                      {effectiveSlipProb * 100 < 0.1 && parlaySummary.legs.length > 0
                        ? "< 0.1 %"
                        : `${(effectiveSlipProb * 100).toFixed(1)} %`}
                    </strong>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {parsedBookParlayDec ? "Tu Momio Total" : "Momio Combinado"}
                    </span>
                    <strong className="text-base font-extrabold">
                      {formatOddsValue(effectiveSlipBookDec, oddsFormat)}
                    </strong>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Momio justo
                    </span>
                    <strong className="text-base font-bold">
                      {formatOddsValue(effectiveSlipFairDec, oddsFormat)}
                    </strong>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Retorno ({effectiveSlipEdgePts >= 0 ? `+${effectiveSlipEdgePts.toFixed(1)}` : effectiveSlipEdgePts.toFixed(1)} pts)
                    </span>
                    <strong
                      className="text-base font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                    >
                      {effectiveReturnUnits.toFixed(2)}u
                    </strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={parlaySummary.legs.length < 2}
                  className="pl-btn-glass text-xs inline-flex items-center justify-center gap-1.5"
                  onClick={() =>
                    openShareTicket({
                      kind: "parlay",
                      title: `Parlay PitchLab (${parlaySummary.legs.length} picks)`,
                      subtitle: "Armador Inteligente · Spacetime Suite v3.0",
                      leagueLabel: "Multi-Liga",
                      pickLabel: parlaySummary.legs
                        .map((l) => l.pick.label)
                        .join(" + "),
                      legs: parlaySummary.legs.map(({ pick }) => ({
                        label: pick.label,
                        matchLabel: `${pick.matchLabel} · ${pick.kickoffLocal}`,
                        p: pick.p,
                        fairDecimal: pick.fairDecimal,
                        marketDecimal: pick.marketDecimal,
                        kickoffLocal: pick.kickoffLocal,
                      })),
                      probability: parlaySummary.combinedProbability,
                      fairDecimal: parlaySummary.fairDecimal,
                      marketDecimal: effectiveSlipBookDec,
                      units: parlaySummary.stakeUnits,
                      gameStatus: "NS",
                    })
                  }
                >
                  <MaestroIcon name="share" size={13} />
                  <span>Exportar boleto</span>
                </button>
                <button
                  type="button"
                  disabled={parlaySummary.legs.length < 2}
                  className="pl-btn-primary text-xs inline-flex items-center justify-center gap-1.5"
                  onClick={() => sealParlayToJournal()}
                >
                  <MaestroIcon name="ticket" size={13} />
                  <span>Sellar Parlay ({parlaySummary.stakeUnits.toFixed(1)}u)</span>
                </button>
              </div>

              <div
                className="rounded-2xl p-3.5 space-y-2"
                style={{ background: "var(--pl-surface)" }}
                data-parlay-rules=""
              >
                <span className="text-xs font-extrabold block" style={{ color: "var(--pl-text)" }}>
                  Qué no se puede combinar en parlay
                </span>
                <ul className="m-0 pl-4 space-y-1 text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
                  {PARLAY_NON_COMBINABLE_RULES.map((rule) => (
                    <li key={rule.title}>
                      <strong style={{ color: "var(--pl-text-secondary)" }}>{rule.title}:</strong> {rule.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export interface PropsStreakExplorerItem extends PlayerPropStreakCardProps {
  readonly id: string;
  readonly sport: string;
  readonly leagueLabel: string;
}

export interface PropsLabClubViewProps {
  streakCards?: readonly PropsStreakExplorerItem[];
  playerProps?: readonly PlayerPropItem[];
}

const INITIAL_STREAK_PAGE_SIZE = 8;
const INITIAL_CATALOG_PAGE_SIZE = 10;

export function PropsLabClubView({
  streakCards = [],
  playerProps,
}: PropsLabClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, hasAccountSession, upgradeHref, oddsFormat } = usePlatformCore();
  const { sealPickToJournal, navigateTo } = usePlatformActions();
  const journal = useJournalEntries();
  const effectivePlayerProps = playerProps ?? dataset.playerProps;
  const catalog = useMemo(
    () => buildPlayerPropsCatalog(dataset.games, effectivePlayerProps),
    [dataset.games, effectivePlayerProps],
  );
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});
  const [propOddsInputs, setPropOddsInputs] = useState<Record<string, string>>(
    {},
  );
  const [streakSport, setStreakSport] = useState<string>("all");
  const [streakQuery, setStreakQuery] = useState<string>("");
  const [streakVisibleCount, setStreakVisibleCount] = useState<number>(INITIAL_STREAK_PAGE_SIZE);
  const [catalogVisibleCount, setCatalogVisibleCount] = useState<number>(INITIAL_CATALOG_PAGE_SIZE);

  const filteredStreaks = useMemo(() => {
    const q = streakQuery.trim().toLowerCase();
    return streakCards.filter((card) => {
      if (streakSport !== "all" && card.sport !== streakSport) return false;
      if (!q) return true;
      return (
        card.playerName.toLowerCase().includes(q) ||
        card.teamName.toLowerCase().includes(q) ||
        card.leagueLabel.toLowerCase().includes(q)
      );
    });
  }, [streakCards, streakSport, streakQuery]);

  const availableStreakSports = useMemo(() => {
    const set = new Set(streakCards.map((c) => c.sport));
    const labels: Record<string, string> = {
      football: "Fútbol",
      basketball: "NBA",
      "american-football": "NFL",
      "ice-hockey": "NHL",
      baseball: "MLB",
    };
    return Array.from(set).map((id) => ({ id, label: labels[id] ?? id }));
  }, [streakCards]);

  const handleSealProp = (
    prop: PlayerPropItem,
    activeLine: number,
    pOver: number,
    fairOverDecimal: number,
    userDecimal: number,
  ) => {
    const propPickId = `${prop.id}-over-${activeLine.toFixed(1)}`;
    const syntheticPropPick: MatchPick = {
      id: propPickId,
      gameId: prop.gameId,
      league: prop.league,
      leagueLabel: prop.leagueLabel,
      matchLabel: prop.matchLabel,
      kickoffLocal: prop.kickoffLocal,
      gameStatus: "NS",
      slotIndex: 99,
      category: "valor",
      categoryLabel: `Player Prop · ${prop.statLabel}`,
      risk: pOver >= 0.66 ? "conservador" : pOver >= 0.52 ? "medio" : "arriesgado",
      engineKey: prop.league === "nfl" ? "minkowski" : "tachyon",
      engineName: prop.engineName,
      marketGroup: "Player Props",
      selectionKey: `over_${activeLine.toFixed(1)}`,
      conflictGroup: "independent",
      label: `${prop.player} · Más de ${activeLine.toFixed(1)} ${prop.statLabel}`,
      rationale: prop.contextNote,
      p: pOver,
      fairDecimal: fairOverDecimal,
      fairAmerican: decimalToAmericanInt(fairOverDecimal),
      marketDecimal: userDecimal,
      marketAmerican: decimalToAmericanInt(userDecimal),
      edgePts: (pOver - 1 / userDecimal) * 100,
      confidenceScore: Math.round(Math.min(94, Math.max(55, pOver * 100 + 8))),
      suggestedUnits: 1.0,
    };

    sealPickToJournal(
      syntheticPropPick,
      1.0,
      userDecimal,
      `Props de jugadores · Media proyectada ${prop.projectionMean.toFixed(1)}`,
    );
  };

  return (
    <AtmosphereStage activePath="/app/props">
      <ClubWorkspaceShell activePath="/app/props">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand pl-pill--wrap inline-flex items-center gap-1.5">
            <MaestroIcon name="sliders" size={12} />
            <span>Líneas alternativas</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Tendencias y props de jugadores
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Explora rachas reales en los últimos 5, 10 o 20 partidos contra una línea deslizable y compara el momio de tu casa contra la proyección.
          </p>
        </section>

        {viewerRole !== "visitor" && streakCards.length > 0 ? (
          <section className="space-y-4" aria-label="Tendencias de jugadores contra línea">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar tendencias por deporte">
                <button
                  type="button"
                  className={`pl-prop-metric-pill ${streakSport === "all" ? "is-on" : ""}`.trim()}
                  aria-pressed={streakSport === "all"}
                  onClick={() => setStreakSport("all")}
                >
                  Todos ({streakCards.length})
                </button>
                {availableStreakSports.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className={`pl-prop-metric-pill ${streakSport === sp.id ? "is-on" : ""}`.trim()}
                    aria-pressed={streakSport === sp.id}
                    onClick={() => setStreakSport(sp.id)}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={streakQuery}
                onChange={(e) => setStreakQuery(e.target.value)}
                placeholder="Buscar jugador, equipo o liga…"
                aria-label="Buscar jugador en tendencias"
                className="glass-input text-base sm:text-xs min-h-11 sm:min-h-9 px-3 w-full sm:w-64"
              />
            </div>

            {filteredStreaks.length > 0 ? (
              <>
                <div className="pl-props-grid">
                  {filteredStreaks.slice(0, streakVisibleCount).map((card) => (
                    <PlayerPropStreakCard
                      key={card.id}
                      {...card}
                      oddsFormat={oddsFormat}
                      onNavigate={navigateTo}
                    />
                  ))}
                </div>
                {filteredStreaks.length > streakVisibleCount ? (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      className="pl-btn-glass min-h-11 px-5 text-xs font-bold"
                      onClick={() => setStreakVisibleCount((c) => c + INITIAL_STREAK_PAGE_SIZE)}
                    >
                      Mostrar más tendencias ({filteredStreaks.length - streakVisibleCount} restantes)
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Ningún jugador coincide con «{streakQuery}». Prueba con otro nombre o deporte.
              </p>
            )}
          </section>
        ) : null}

        {viewerRole === "visitor" ? (
          <div className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-3 relative overflow-hidden">
            <LensGlowOrbs subtle />
            <div className="relative z-10 space-y-3">
              <h2 className="m-0 text-xl font-extrabold inline-flex items-center gap-2">
                <MaestroIcon name="lock" size={18} style={{ color: "var(--pl-brand)" }} />
                <span>Props de jugadores para Pase PitchLab Ultra</span>
              </h2>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                {hasAccountSession
                  ? "Activa tu Pase PitchLab Ultra para explorar proyecciones individuales de NFL y fútbol."
                  : "Activa tus 7 días gratis para explorar proyecciones individuales de NFL y fútbol."}
              </p>
              <a
                href={upgradeHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(upgradeHref);
                }}
                className="pl-btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <span>{hasAccountSession ? "Activar Pase Ultra" : "Activar prueba gratis"}</span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </div>
          </div>
        ) : catalog.length === 0 && streakCards.length === 0 ? (
          <div className="glass-lens glass-ring rounded-3xl p-6 space-y-2" data-props-empty="">
            <h2 className="m-0 text-xl font-extrabold">Props de jugadores: próximamente</h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Spacetime Suite v3.0 todavía no proyecta estadísticas individuales. Cuando el motor
              de jugadores pase su validación, aquí verás líneas, proyección y ventaja contra tu casa.
            </p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {catalog.slice(0, catalogVisibleCount).map((prop) => {
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
              const l5Hits = prop.last10
                .slice(-5)
                .filter((v) => v > activeLine).length;
              const maxVal = Math.max(...prop.last10, activeLine * 1.2, 1);

              const teamColor =
                getTeamColors(prop.league, prop.teamSlug)?.[0] ??
                "var(--pl-aura-default-home)";

              const rawOddsText = propOddsInputs[prop.id] ?? "";
              const parsedCustomDec = rawOddsText.trim()
                ? parseUserOdds(rawOddsText)
                : null;
              const activeBookOverDec =
                parsedCustomDec && parsedCustomDec > 1
                  ? parsedCustomDec
                  : prop.marketOverDecimal;
              const liveEdgePts = (evalRes.pOver - 1 / activeBookOverDec) * 100;

              const propPickId = `${prop.id}-over-${activeLine.toFixed(1)}`;
              const alreadySealed = journal.some((j) => j.pickId === propPickId);

              return (
                <article
                  key={prop.id}
                  className="glass-lens glass-ring rounded-3xl p-5 space-y-4 relative overflow-hidden"
                  data-prop-card={prop.id}
                >
                  <LensGlowOrbs primaryColor={teamColor} subtle />

                  <div className="space-y-4 relative z-10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <CrestPedestal size="md" glowColor={teamColor}>
                          <TeamBadge
                            league={prop.league}
                            slug={prop.teamSlug}
                            name={prop.teamName}
                            size={30}
                          />
                        </CrestPedestal>
                        <div className="min-w-0">
                          <span
                            className="text-xs font-bold block truncate"
                            style={{ color: "var(--pl-brand)" }}
                          >
                            {prop.leagueLabel} · {prop.matchLabel}
                          </span>
                          <h2 className="m-0 text-lg font-extrabold truncate">
                            {prop.player} · {prop.statLabel}
                          </h2>
                        </div>
                      </div>
                      <span className="pl-pill shrink-0">{prop.position}</span>
                    </div>

                    {/* Scrubber interactivo − / + con botón Base */}
                    <div
                      className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Línea evaluada ({prop.engineName})
                        </span>
                        <div className="flex items-baseline gap-2">
                          <strong
                            className="num text-xl font-extrabold"
                            data-prop-line={prop.id}
                          >
                            {activeLine.toFixed(1)}
                          </strong>
                          <span
                            className="text-xs num font-bold"
                            style={{ color: "var(--pl-success)" }}
                          >
                            Media proy.: {prop.projectionMean.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={offset === 0}
                          onClick={() =>
                            setLineOffsets((prev) => ({
                              ...prev,
                              [prop.id]: 0,
                            }))
                          }
                          className="pl-btn-glass text-xs min-h-8 px-2.5 num"
                        >
                          Base ({prop.baseLine.toFixed(1)})
                        </button>

                        <div
                          className="sl-stepper"
                          role="group"
                          aria-label={`Ajustar línea de ${prop.player}`}
                        >
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
                    </div>

                    {/* Barras L10 o muestra agregada de temporada */}
                    {prop.last10.length > 0 ? (
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
                            const pct = Math.max(
                              16,
                              Math.round((val / maxVal) * 100),
                            );
                            return (
                              <div
                                key={idx}
                                className="flex flex-col items-center gap-1 h-full justify-end"
                              >
                                <div
                                  className="w-full rounded-t-md transition-all"
                                  style={{
                                    height: `${pct}%`,
                                    background: hit
                                      ? "var(--pl-success)"
                                      : "var(--pl-surface-hover)",
                                  }}
                                />
                                <span
                                  className="text-[10px] num"
                                  style={{ color: "var(--pl-text-muted)" }}
                                >
                                  {val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl px-3 py-2 text-xs num flex items-center justify-between"
                        style={{
                          background: "var(--pl-surface-soft)",
                          border: "1px solid var(--pl-border-subtle)",
                          color: "var(--pl-text-muted)",
                        }}
                      >
                        <span>Media proyectada por aparición</span>
                        <strong style={{ color: "var(--pl-text-primary)" }}>
                          {prop.projectionMean.toFixed(2)} ± {prop.projectionSd.toFixed(2)}
                        </strong>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 text-xs num">
                      <div
                        className="rounded-xl p-3"
                        style={{ background: "var(--pl-surface)" }}
                      >
                        <span
                          className="block"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Más de {activeLine.toFixed(1)}
                        </span>
                        <strong
                          className="text-base font-extrabold"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          {(evalRes.pOver * 100).toFixed(1)} % · Justa{" "}
                          {formatOddsValue(evalRes.fairOverDecimal, oddsFormat)}
                        </strong>
                      </div>
                      <div
                        className="rounded-xl p-3"
                        style={{ background: "var(--pl-surface)" }}
                      >
                        <span
                          className="block"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          Menos de {activeLine.toFixed(1)}
                        </span>
                        <strong className="text-base font-extrabold">
                          {(evalRes.pUnder * 100).toFixed(1)} % · Justa{" "}
                          {formatOddsValue(evalRes.fairUnderDecimal, oddsFormat)}
                        </strong>
                      </div>
                    </div>

                    {/* Calculadora en vivo Geodesic por tarjeta */}
                    <div
                      className="rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={`prop-odds-${prop.id}`}
                          className="font-bold inline-flex items-center gap-1"
                        >
                          <MaestroIcon
                            name="activity"
                            size={13}
                            style={{ color: "var(--pl-brand)" }}
                          />
                          <span>Tu momio Over:</span>
                        </label>
                        <input
                          id={`prop-odds-${prop.id}`}
                          type="text"
                          value={rawOddsText}
                          onChange={(e) =>
                            setPropOddsInputs((prev) => ({
                              ...prev,
                              [prop.id]: e.target.value,
                            }))
                          }
                          placeholder={formatOddsValue(
                            prop.marketOverDecimal,
                            oddsFormat,
                          )}
                          className="glass-input px-2.5 py-1 text-xs font-bold num w-28"
                        />
                      </div>

                      <span
                        className={`pl-pill num ${
                          liveEdgePts >= 0
                            ? "pl-pill--success"
                            : "pl-pill--warning"
                        }`}
                      >
                        Ventaja:{" "}
                        {liveEdgePts >= 0
                          ? `+${liveEdgePts.toFixed(1)}`
                          : liveEdgePts.toFixed(1)}{" "}
                        pts
                      </span>
                    </div>

                    <p
                      className="m-0 text-xs leading-relaxed"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      {prop.contextNote}
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-1 hairline-t">
                      <span
                        className="text-xs num"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        1.00u · Casa{" "}
                        {formatOddsValue(activeBookOverDec, oddsFormat)}
                      </span>
                      <button
                        type="button"
                        className="pl-btn-primary text-xs min-h-9 px-3.5 inline-flex items-center gap-1.5"
                        onClick={() =>
                          handleSealProp(
                            prop,
                            activeLine,
                            evalRes.pOver,
                            evalRes.fairOverDecimal,
                            activeBookOverDec,
                          )
                        }
                      >
                        <MaestroIcon
                          name={alreadySealed ? "check" : "ticket"}
                          size={13}
                        />
                        <span>
                          {alreadySealed
                            ? "Prop sellado en Bitácora"
                            : "Sellar Prop en mi Bitácora"}
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {catalog.length > catalogVisibleCount ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="pl-btn-glass min-h-11 px-5 text-xs font-bold"
                onClick={() => setCatalogVisibleCount((c) => c + INITIAL_CATALOG_PAGE_SIZE)}
              >
                Mostrar más props ({catalog.length - catalogVisibleCount} restantes)
              </button>
            </div>
          ) : null}
          </>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

/** /app/momios: compara tu momio contra el justo (ver OddsCompareView). */
export function MomiosExplorerClubView(): React.JSX.Element {
  return <OddsCompareClubView />;
}
