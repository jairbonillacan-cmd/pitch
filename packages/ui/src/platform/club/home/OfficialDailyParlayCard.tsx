"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  buildOfficialDailyParlay,
  DAILY_PARLAY_MODE_SPECS,
  DAILY_PARLAY_MODES,
  pickOfficialParlayDay,
  type DailyParlayMode,
  type PersonalParlayScope,
} from "../../daily-parlay";
import {
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type { OddsFormat, PlatformGame } from "../../types";
import { longDayLabel, shortDateLabel } from "./home-model";

function formatCombinedOdds(decimal: number, oddsFormat: OddsFormat): string {
  const dec = decimal.toFixed(2);
  const am = formatOddsValue(decimal, "american");
  return oddsFormat === "american" ? `${am} (${dec})` : `${dec} (${am})`;
}

export function OfficialDailyParlayCard({
  games,
  selectedDay,
  today,
  isPastDay = false,
  activeLeague = null,
  initialMode,
  embedded = false,
  onLoadedToParlay,
}: {
  games: readonly PlatformGame[];
  selectedDay: string;
  today: string;
  isPastDay?: boolean;
  activeLeague?: LeagueId | null;
  initialMode?: DailyParlayMode;
  embedded?: boolean;
  onLoadedToParlay?: () => void;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, riskPreference } = usePlatformCore();
  const { loadParlayPicks, navigateTo } = usePlatformActions();
  const [selectedMode, setSelectedMode] = useState<DailyParlayMode>(
    initialMode ?? riskPreference,
  );
  const [scopeOverride, setScopeOverride] = useState<LeagueId | "all" | null>(null);

  const effectiveLeagueFilter: LeagueId | "all" =
    scopeOverride !== null ? scopeOverride : (activeLeague ?? "all");

  const scope: PersonalParlayScope = useMemo(
    () =>
      effectiveLeagueFilter === "all"
        ? { kind: "all" }
        : { kind: "league", league: effectiveLeagueFilter },
    [effectiveLeagueFilter],
  );

  const officialDay = useMemo(
    () => pickOfficialParlayDay(games, selectedDay, today, selectedMode, viewerRole, scope),
    [games, selectedDay, today, selectedMode, viewerRole, scope],
  );

  const gamesById = useMemo(() => {
    const map = new Map<string, PlatformGame>();
    for (const g of games) map.set(g.id, g);
    return map;
  }, [games]);

  const availableLeagueScopes = useMemo(() => {
    const counts = new Map<LeagueId, { label: string; count: number }>();
    for (const g of games) {
      if (g.dayId !== officialDay) continue;
      const cur = counts.get(g.league);
      counts.set(g.league, {
        label: g.leagueLabel,
        count: (cur?.count ?? 0) + 1,
      });
    }
    return Array.from(counts.entries())
      .filter(([leagueId, info]) => info.count >= 4 || leagueId === activeLeague)
      .map(([leagueId, info]) => ({ league: leagueId, label: info.label }));
  }, [activeLeague, games, officialDay]);

  const parlaysByMode = useMemo(() => {
    return {
      conservador: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "conservador",
        scope,
        viewerRole,
      }),
      medio: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "medio",
        scope,
        viewerRole,
      }),
      arriesgado: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "arriesgado",
        scope,
        viewerRole,
      }),
      objetivo: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "objetivo",
        scope,
        viewerRole,
      }),
    } as const;
  }, [officialDay, games, scope, viewerRole]);

  const active = parlaysByMode[selectedMode];
  const spec = DAILY_PARLAY_MODE_SPECS[selectedMode];
  const alternativeMode = DAILY_PARLAY_MODES.find(
    (m) => m !== selectedMode && parlaysByMode[m].status === "ready",
  );

  const activeScopeLabel =
    effectiveLeagueFilter === "all"
      ? "Todas las ligas"
      : availableLeagueScopes.find((s) => s.league === effectiveLeagueFilter)?.label ??
        effectiveLeagueFilter.toUpperCase();

  const dayCaption =
    officialDay === today
      ? `Hoy · ${longDayLabel(officialDay).toLowerCase()}`
      : longDayLabel(officialDay);

  const settledStatus = useMemo(() => {
    if (!isPastDay || active.status !== "ready") return null;
    const misses = active.legs.filter((l) => l.pick.result === "miss").length;
    const hits = active.legs.filter((l) => l.pick.result === "hit").length;
    if (misses > 0) return "miss" as const;
    if (hits === active.legs.length) return "hit" as const;
    return "pending" as const;
  }, [isPastDay, active]);

  // Identificar las 1–2 selecciones con mayor probabilidad para destacarlas con texto + ícono (WCAG AA).
  const topProbIds = useMemo(() => {
    if (active.legs.length < 3) return new Set<string>();
    const highlightCount = active.legs.length >= 4 ? 2 : 1;
    const ranked = active.legs
      .slice()
      .sort((a, b) => b.pick.p - a.pick.p || a.pick.id.localeCompare(b.pick.id));
    return new Set(ranked.slice(0, highlightCount).map((l) => l.pick.id));
  }, [active.legs]);

  // Solo se cargan al boleto las selecciones de partidos que no han empezado.
  const openPicks = active.legs.map((l) => l.pick).filter((pick) => pick.gameStatus === "NS");
  const hasOpenLegs = openPicks.length > 0;
  const bookEdgePts =
    active.hasCapturedBookOdds && active.bookDecimal > 1
      ? (active.combinedProbability - 1 / active.bookDecimal) * 100
      : null;

  return (
    <section
      aria-labelledby="home-daily-parlay-title"
      className={embedded ? "pl-daily-parlay is-embedded" : "pl-daily-parlay glass-card glass-ring"}
      data-daily-parlay-card=""
    >
      <div className="pl-daily-parlay-head">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--brand">
              <MaestroIcon name="sparkles" size={12} />
              <span>
                {selectedMode === "objetivo" || effectiveLeagueFilter !== "all"
                  ? `Parlay de jornada · ${effectiveLeagueFilter === "all" ? "Objetivo ~5.0×" : activeScopeLabel}`
                  : "Oficial del día"}
              </span>
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              {dayCaption}
            </span>
            {settledStatus === "hit" ? (
              <span className="pl-pill pl-pill--success">
                <MaestroIcon name="check" size={12} />
                <span>Cumplido</span>
              </span>
            ) : settledStatus === "miss" ? (
              <span className="pl-pill pl-pill--danger">
                <MaestroIcon name="x" size={12} />
                <span>No cumplido</span>
              </span>
            ) : settledStatus === "pending" ? (
              <span className="pl-pill pl-pill--info">En curso</span>
            ) : null}
          </div>
          <h2 id="home-daily-parlay-title" className="m-0 text-xl font-extrabold">
            Parlay del día
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div
          className="seg-well pl-daily-styles"
          role="group"
          aria-label="Estilo del parlay oficial del día"
        >
          {DAILY_PARLAY_MODES.map((modeId) => {
            const modeSpec = DAILY_PARLAY_MODE_SPECS[modeId];
            return (
              <button
                key={modeId}
                type="button"
                className="seg-btn pl-daily-style-btn"
                aria-pressed={selectedMode === modeId}
                data-daily-risk={modeId}
                onClick={() => setSelectedMode(modeId)}
              >
                {modeSpec.label}
              </button>
            );
          })}
        </div>

        {availableLeagueScopes.length > 0 ? (
          <div
            className="pl-daily-scope-chips"
            role="group"
            aria-label="Liga del parlay de jornada"
          >
            <button
              type="button"
              className="pl-btn-glass min-h-11 px-3 text-xs"
              aria-pressed={effectiveLeagueFilter === "all"}
              data-daily-scope="all"
              onClick={() => setScopeOverride("all")}
            >
              Todas las ligas
            </button>
            {availableLeagueScopes.map((sc) => (
              <button
                key={sc.league}
                type="button"
                className="pl-btn-glass min-h-11 px-3 text-xs inline-flex items-center gap-1.5"
                aria-pressed={effectiveLeagueFilter === sc.league}
                data-daily-scope={sc.league}
                onClick={() => setScopeOverride(sc.league)}
              >
                <LeagueBadge league={sc.league} label={sc.label} size={14} />
                <span>{sc.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          {spec.ruleHint} Una selección por partido, sin contradicciones.
        </p>
      </div>

      {active.status === "ready" ? (
        <>
          <ol
            className="pl-daily-legs"
            role="list"
            aria-label={`Selecciones del parlay ${spec.label}`}
          >
            {active.legs.map(({ pick }, index) => {
              const game = gamesById.get(pick.gameId);
              const team = game
                ? pick.conflictGroup === "away_side"
                  ? game.away
                  : game.home
                : null;
              const isTop = topProbIds.has(pick.id);
              const isUsFormat =
                game &&
                (game.sport === "american-football" ||
                  game.sport === "basketball" ||
                  game.sport === "ice-hockey");
              const matchupLabel =
                isUsFormat && game ? `${game.away.code} @ ${game.home.code}` : pick.matchLabel;

              return (
                <li
                  key={pick.id}
                  className={isTop ? "pl-daily-leg is-most-likely" : "pl-daily-leg"}
                  data-daily-leg-rank={index + 1}
                >
                  <span
                    className={
                      isTop ? "pl-daily-leg-rank is-top num" : "pl-daily-leg-rank num"
                    }
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  {team ? (
                    <TeamBadge
                      league={pick.league}
                      slug={team.slug}
                      name={team.name}
                      logoUrl={team.logoUrl}
                      size={24}
                    />
                  ) : (
                    <LeagueBadge league={pick.league} label={pick.leagueLabel} size={22} />
                  )}
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <strong className="text-sm font-bold truncate">{pick.label}</strong>
                      {isTop ? (
                        <span className="pl-pill pl-pill--success text-[11px] shrink-0">
                          <MaestroIcon name="check" size={11} />
                          <span>Más probable</span>
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={embedded ? "text-[11px] leading-snug" : "text-xs truncate"}
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {matchupLabel} ·{" "}
                      <span className="num">
                        {game ? `${shortDateLabel(game.dayId)} · ` : ""}
                        {pick.kickoffLocal}
                      </span>
                      {embedded ? null : ` · ${pick.leagueLabel}`}
                    </span>
                  </div>
                  <div className="pl-daily-leg-meta num">
                    <span
                      className="text-sm font-extrabold"
                      style={{ color: isTop ? "var(--pl-success)" : "var(--pl-brand)" }}
                    >
                      {(pick.p * 100).toFixed(1)} %
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                      Justo {formatOddsValue(pick.fairDecimal, oddsFormat)}
                      {pick.marketDecimal !== null
                        ? ` · ${pick.marketBookLabel ?? "Casa"} ${formatOddsValue(pick.marketDecimal, oddsFormat)}`
                        : ""}
                    </span>
                    {pick.result === "hit" ? (
                      <span className="pl-hist-chip is-hit text-[11px]">
                        <MaestroIcon name="check" size={11} />
                        <span>Acertada</span>
                      </span>
                    ) : pick.result === "miss" ? (
                      <span className="pl-hist-chip is-miss text-[11px]">
                        <MaestroIcon name="x" size={11} />
                        <span>Fallada</span>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="pl-daily-parlay-kpis pl-daily-parlay-summary">
            <div className="pl-daily-kpi">
              <span>Momio justo combinado</span>
              <strong className="num">
                {formatCombinedOdds(active.fairDecimal, oddsFormat)}
              </strong>
            </div>
            <div className="pl-daily-kpi">
              <span>Probabilidad combinada</span>
              <strong className="num">
                {(active.combinedProbability * 100).toFixed(1)} %
              </strong>
            </div>
            {active.hasCapturedBookOdds && bookEdgePts !== null ? (
              <div className="pl-daily-kpi">
                <span>En casa</span>
                <strong className="num" style={{ color: bookEdgePts > 0 ? "var(--pl-success)" : "var(--pl-text)" }}>
                  ~{formatOddsValue(active.bookDecimal, oddsFormat)} · Ventaja{" "}
                  {bookEdgePts >= 0 ? "+" : ""}
                  {bookEdgePts.toFixed(1)} pts
                </strong>
              </div>
            ) : null}
          </div>

          {hasOpenLegs ? (
            <div className="pl-daily-parlay-actions">
              <button
                type="button"
                className="pl-btn-primary min-h-11 px-4 text-sm inline-flex items-center justify-center gap-1.5"
                data-load-daily-parlay=""
                onClick={() => {
                  loadParlayPicks(openPicks, {
                    allowSgp: false,
                    label: `Parlay del día (${spec.label})`,
                  });
                  onLoadedToParlay?.();
                }}
              >
                <MaestroIcon name="layers" size={14} />
                <span>Cargar a mi parlay</span>
              </button>
              <button
                type="button"
                className="pl-btn-glass min-h-11 px-4 text-sm inline-flex items-center justify-center gap-1.5"
                onClick={() => {
                  loadParlayPicks(openPicks, {
                    allowSgp: false,
                    label: `Parlay del día (${spec.label})`,
                  });
                  navigateTo("/app/parlays");
                }}
              >
                <span>Abrir en armador</span>
                <MaestroIcon name="arrowRight" size={14} />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="pl-daily-empty" role="status">
          <p className="m-0 text-sm font-bold">
            Sin datos suficientes para {spec.label}
          </p>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {active.emptyReason}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {effectiveLeagueFilter !== "all" ? (
              <button
                type="button"
                className="pl-btn-glass min-h-11 px-4 text-xs"
                onClick={() => setScopeOverride("all")}
              >
                Ver todas las ligas
              </button>
            ) : null}
            {alternativeMode ? (
              <button
                type="button"
                className="pl-btn-glass min-h-11 px-4 text-xs"
                onClick={() => setSelectedMode(alternativeMode)}
              >
                Ver estilo {DAILY_PARLAY_MODE_SPECS[alternativeMode].label}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
