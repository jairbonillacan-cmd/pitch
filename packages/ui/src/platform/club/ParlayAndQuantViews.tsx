"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { Switch } from "@heroui/react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../sports.js";
import {
  decimalToAmericanInt,
  formatOddsValue,
  isPickUnlocked,
} from "../access-guard.js";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  NoticeCard,
} from "../components/MaestroPrimitives.js";
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
import type { MatchPick, PlayerPropItem, RiskBand } from "../types.js";

function getCompactBlockReason(
  sameGameExists: boolean,
  allowSgp: boolean,
  rawReason: string | undefined,
): string {
  if (sameGameExists && !allowSgp) {
    return "Mismo partido — activa SGP";
  }
  if (!rawReason) {
    return "Mercado contradictorio";
  }
  const lower = rawReason.toLowerCase();
  if (lower.includes("mismo partido") && !allowSgp) {
    return "Mismo partido — activa SGP";
  }
  if (lower.includes("contradic") || lower.includes("opuest")) {
    return "Mercado contradictorio";
  }
  if (lower.includes("máximo 2") || lower.includes("2 selecciones")) {
    return "Máx. 2 SGP por partido";
  }
  return rawReason;
}

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
    navigateTo,
  } = usePlatform();

  const [selectedLeagues, setSelectedLeagues] = useState<LeagueId[]>(() =>
    dataset.leagues.map((l) => l.league),
  );
  const [autoRisk, setAutoRisk] = useState<RiskBand>("medio");
  const [autoLegCount, setAutoLegCount] = useState<number>(3);
  const [bookParlayOddsRaw, setBookParlayOddsRaw] = useState<string>("");

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

  const candidateGames = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status !== "FT" && selectedLeagues.includes(g.league))
        .slice(0, 8),
    [dataset.games, selectedLeagues],
  );

  const effectiveSlipBookDec =
    parsedBookParlayDec && parsedBookParlayDec > 1
      ? parsedBookParlayDec
      : parlaySummary.bookDecimal;
  const effectiveSlipEdgePts =
    parlaySummary.legs.length > 0 && effectiveSlipBookDec > 1
      ? (parlaySummary.combinedProbability - 1 / effectiveSlipBookDec) * 100
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
            <span>Geodesic v1.0 · Auto-Armador & Constructor Manual SGP</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Armador Inteligente de Parlays y Combinadas
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Configura los 4 pasos del motor cuantitativo para construir tu combinada óptima, o
            elige selecciones manualmente con bloqueo en vivo de mercados contradictorios.
          </p>
        </section>

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
                    <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                      1. Ligas ({selectedLeagues.length}/{dataset.leagues.length})
                    </span>
                    <button
                      type="button"
                      onClick={selectAllLeagues}
                      className="pl-btn-glass text-[11px] min-h-7 px-2.5"
                    >
                      Seleccionar las 7 ligas
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
                          <LeagueBadge league={lg.league} label={lg.label} size={15} />
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
                      className="text-xs font-extrabold uppercase tracking-wider block"
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

                  {/* Paso 3: Selecciones 2–6 */}
                  <div className="space-y-2">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider block"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      3. Selecciones 2–6
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="seg-well"
                        role="group"
                        aria-label="3. Selecciones 2–6"
                      >
                        {[2, 3, 4, 5, 6].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            className="seg-btn num text-xs px-2.5"
                            aria-pressed={autoLegCount === cnt}
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
                </div>

                {/* Paso 4: SGP */}
                <div
                  className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <div className="space-y-0.5">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider block"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      4. SGP (Mismo Partido)
                    </span>
                    <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                      Permite hasta 2 selecciones compatibles del mismo encuentro con factor de correlación Geodesic v1.0.
                    </span>
                  </div>

                  <Switch isSelected={allowSgp} onChange={setAllowSgp}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>
                      <span className="text-xs font-bold">
                        {allowSgp ? "SGP Activo" : "Activar SGP"}
                      </span>
                    </Switch.Content>
                  </Switch>
                </div>

                <button
                  type="button"
                  className="pl-btn-primary w-full min-h-11 text-sm inline-flex items-center justify-center gap-2"
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
                  <MaestroIcon name="sparkles" size={15} />
                  <span>
                    Generar Mejor Parlay ({autoLegCount} selecciones · {autoRisk})
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
                      <LeagueBadge league={g.league} label={g.leagueLabel} size={16} />
                      <span>
                        {g.leagueLabel} · {g.home.shortName} vs {g.away.shortName}
                      </span>
                    </span>
                    <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                      {g.kickoffLocal}
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
                            href="/signup"
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo("/signup");
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
                            <span className="pl-pill text-[10px] shrink-0">
                              Pase Total
                            </span>
                          </a>
                        );
                      }

                      const blockedReason =
                        !inSlip && !compat.allowed
                          ? getCompactBlockReason(
                              sameGameExists,
                              allowSgp,
                              compat.reason,
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
                              {formatOddsValue(pk.marketDecimal, oddsFormat)}
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
            </section>
          </div>

          {/* Columna derecha: Boleto Combinado PitchLab Perforado */}
          <aside className="xl:col-span-5 glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4 sticky top-20 relative overflow-hidden">
            <LensGlowOrbs subtle />

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span
                    className="text-xs font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5"
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
                    Pulsa «Generar Mejor Parlay» o selecciona de 2 a 6 picks compatibles del catálogo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {parlaySummary.legs.map(({ pick }) => (
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
                        </span>
                        <strong className="block text-sm truncate">{pick.label}</strong>
                        <span
                          className="text-xs num font-bold"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          {(pick.p * 100).toFixed(1)} % ·{" "}
                          {formatOddsValue(pick.marketDecimal, oddsFormat)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${pick.label}`}
                        onClick={() => removePickFromParlay(pick.id)}
                        className="pl-btn-glass px-2 min-h-7 text-xs inline-flex items-center justify-center shrink-0"
                      >
                        <MaestroIcon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

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
                  <NoticeCard
                    tone="info"
                    icon="activity"
                    badgeText="Correlación SGP"
                    title="Ajuste Geodesic v1.0 Activo"
                  >
                    Probabilidad conjunta ajustada por dependencia estadística entre selecciones del mismo encuentro.
                  </NoticeCard>
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
                      {(parlaySummary.combinedProbability * 100).toFixed(1)} %
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
                      Justa Geodesic
                    </span>
                    <strong className="text-base font-bold">
                      {formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}
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
                      subtitle: "Armador Inteligente · Spacetime Suite v2.1",
                      leagueLabel: "Multi-Liga",
                      pickLabel: parlaySummary.legs
                        .map((l) => l.pick.label)
                        .join(" + "),
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
            </div>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function PropsLabClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    journal,
    sealPickToJournal,
    navigateTo,
  } = usePlatform();
  const catalog = useMemo(
    () => buildPlayerPropsCatalog(dataset.games),
    [dataset.games],
  );
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});
  const [propOddsInputs, setPropOddsInputs] = useState<Record<string, string>>(
    {},
  );

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
      `Player Props Lab · Media proyectada ${prop.projectionMean.toFixed(1)}`,
    );
  };

  return (
    <AtmosphereStage activePath="/app/props">
      <ClubWorkspaceShell activePath="/app/props">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand inline-flex items-center gap-1.5">
            <MaestroIcon name="sliders" size={12} />
            <span>Distribuciones Continuas · Minkowski v2.1 & Tachyon v2.1</span>
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Player Props Lab Interactivo
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Mueve la línea alternativa con <code>− / +</code>, regresa a la línea{" "}
            <strong>Base</strong> en un clic, evalúa el momio de tu casa con Geodesic v1.0 y sella
            el prop directo en tu Bitácora.
          </p>
        </section>

        {viewerRole === "visitor" ? (
          <div className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-3 relative overflow-hidden">
            <LensGlowOrbs subtle />
            <div className="relative z-10 space-y-3">
              <h2 className="m-0 text-xl font-extrabold inline-flex items-center gap-2">
                <MaestroIcon name="lock" size={18} style={{ color: "var(--pl-brand)" }} />
                <span>Player Props Lab reservado para Pase Total</span>
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
                className="pl-btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <span>Activar prueba gratis</span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </div>
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
                        Ventaja Geodesic:{" "}
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
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MomiosExplorerClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    parlayLegs,
    openComposer,
    addPickToParlay,
    navigateTo,
  } = usePlatform();
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(true);
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const out: Array<{
      game: (typeof dataset.games)[number];
      pick: MatchPick;
      openDecimal: number;
      steamEntering: boolean;
    }> = [];

    let seedIdx = 0;
    for (const g of dataset.games) {
      if (g.status === "FT") continue;
      if (leagueFilter !== "all" && g.league !== leagueFilter) continue;
      for (const pk of g.picks) {
        seedIdx += 1;
        if (!isPickUnlocked(pk, g.status, viewerRole)) continue;
        if (onlyPositiveEdge && pk.edgePts <= 0) continue;

        const matchedMkt = g.markets.find((m) => m.label === pk.label);
        const fallbackDelta =
          seedIdx % 2 === 0 ? 0.06 : -0.05;
        const openDecimal = matchedMkt
          ? matchedMkt.openDecimal
          : Math.max(
              1.08,
              Math.round((pk.marketDecimal + fallbackDelta) * 100) / 100,
            );
        const steamEntering = pk.marketDecimal <= openDecimal;

        out.push({ game: g, pick: pk, openDecimal, steamEntering });
      }
    }
    return out.sort((a, b) => b.pick.edgePts - a.pick.edgePts).slice(0, 28);
  }, [dataset.games, leagueFilter, onlyPositiveEdge, viewerRole]);

  return (
    <AtmosphereStage activePath="/app/momios">
      <ClubWorkspaceShell activePath="/app/momios">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand inline-flex items-center gap-1.5">
              <MaestroIcon name="activity" size={12} />
              <span>PitchLab Geodesic v1.0 · De-Vigging & Movimiento de Línea</span>
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Explorador de Momios Limpios y Ventaja (EV)
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
            >
              {onlyPositiveEdge ? <MaestroIcon name="check" size={12} /> : null}
              <span>
                {onlyPositiveEdge ? "Solo Ventaja Positiva" : "Mostrar Todos"}
              </span>
            </button>
          </div>
        </section>

        <section className="glass-lens glass-ring rounded-3xl p-5">
          {rows.length === 0 ? (
            <div className="py-6 space-y-3">
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                No hay líneas desbloqueadas con este filtro (activa Pase Total si estás en vista
                Visitante).
              </p>
              {viewerRole === "visitor" ? (
                <a
                  href="/signup"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/signup");
                  }}
                  className="pl-btn-primary text-xs inline-flex items-center gap-1.5"
                >
                  <MaestroIcon name="unlock" size={13} />
                  <span>Desbloquear 7 días gratis</span>
                </a>
              ) : null}
            </div>
          ) : (
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label="Tabla de momios y ventaja Geodesic"
            >
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr
                    className="hairline-b text-xs uppercase"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <th scope="col" className="py-2 pr-3">
                      Encuentro
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Selección & Motor
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Apertura
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Actual Casa
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Justa Geodesic
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      Ventaja
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ game, pick, openDecimal, steamEntering }) => {
                    const inSlip = parlayLegs.some(
                      (l) => l.pick.id === pick.id,
                    );
                    return (
                      <tr key={pick.id} className="hairline-b">
                        <td className="py-2.5 pr-3">
                          <a
                            href={`/app/${game.league}/games/${game.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(`/app/${game.league}/games/${game.id}`);
                            }}
                            className="inline-flex items-center gap-1.5 font-bold text-xs no-underline hover:underline"
                          >
                            <LeagueBadge
                              league={game.league}
                              label={game.leagueLabel}
                              size={15}
                            />
                            <span>{pick.matchLabel}</span>
                          </a>
                          <span
                            className="block text-[11px]"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {game.leagueLabel} · {game.kickoffLocal}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <strong className="block text-sm">{pick.label}</strong>
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            <MaestroIcon name="cpu" size={11} />
                            <span>{pick.engineName}</span>
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-2 text-right num"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {formatOddsValue(openDecimal, oddsFormat)}
                        </td>
                        <td className="py-2.5 px-2 text-right num">
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <strong className="font-bold">
                              {formatOddsValue(pick.marketDecimal, oddsFormat)}
                            </strong>
                            <span
                              className={`pl-pill text-[10px] ${
                                steamEntering
                                  ? "pl-pill--info"
                                  : "pl-pill--success"
                              }`}
                            >
                              {steamEntering ? "↓ dinero entra" : "↑ valor"}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right num">
                          <strong className="block font-semibold">
                            {formatOddsValue(pick.fairDecimal, oddsFormat)}
                          </strong>
                          <span
                            className="text-[11px]"
                            style={{ color: "var(--pl-brand)" }}
                          >
                            {(pick.p * 100).toFixed(1)} %
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-2 text-right num font-extrabold"
                          style={{
                            color:
                              pick.edgePts >= 0
                                ? "var(--pl-success)"
                                : "var(--pl-warning)",
                          }}
                        >
                          {pick.edgePts >= 0
                            ? `+${pick.edgePts.toFixed(1)}`
                            : pick.edgePts.toFixed(1)}{" "}
                          pts
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className="pl-btn-glass text-xs min-h-7 px-2 inline-flex items-center gap-1"
                              onClick={() => addPickToParlay(pick)}
                            >
                              <MaestroIcon
                                name={inSlip ? "check" : "plus"}
                                size={11}
                              />
                              <span>{inSlip ? "En Parlay" : "+ Parlay"}</span>
                            </button>
                            <button
                              type="button"
                              className="pl-btn-primary text-xs min-h-7 px-2.5 inline-flex items-center gap-1"
                              onClick={() => openComposer(pick)}
                            >
                              <MaestroIcon name="ticket" size={11} />
                              <span>Sellar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
