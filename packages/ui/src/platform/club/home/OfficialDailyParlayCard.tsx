"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  buildOfficialDailyParlay,
  DAILY_PARLAY_STYLE_SPECS,
  DAILY_PARLAY_STYLES,
  resolveOfficialParlayDay,
} from "../../daily-parlay";
import { usePlatform } from "../../platform-provider";
import type { PlatformGame, RiskBand } from "../../types";
import { longDayLabel } from "./home-model";

export function OfficialDailyParlayCard({
  games,
  selectedDay,
  today,
  isPastDay = false,
}: {
  games: readonly PlatformGame[];
  selectedDay: string;
  today: string;
  isPastDay?: boolean;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, riskPreference, loadParlayPicks, navigateTo } =
    usePlatform();
  const [selectedRisk, setSelectedRisk] = useState<RiskBand>(riskPreference);

  const officialDay = useMemo(
    () => resolveOfficialParlayDay(games, selectedDay, today),
    [games, selectedDay, today],
  );

  const parlaysByRisk = useMemo(() => {
    return {
      conservador: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "conservador",
        viewerRole,
        allowFinished: isPastDay,
      }),
      medio: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "medio",
        viewerRole,
        allowFinished: isPastDay,
      }),
      arriesgado: buildOfficialDailyParlay({
        dayId: officialDay,
        games,
        risk: "arriesgado",
        viewerRole,
        allowFinished: isPastDay,
      }),
    } as const;
  }, [officialDay, games, viewerRole, isPastDay]);

  const active = parlaysByRisk[selectedRisk];
  const spec = DAILY_PARLAY_STYLE_SPECS[selectedRisk];
  const alternativeRisk = DAILY_PARLAY_STYLES.find(
    (r) => r !== selectedRisk && parlaysByRisk[r].status === "ready",
  );

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

  const hasOpenLegs = active.legs.some((l) => l.pick.gameStatus !== "FT");

  return (
    <section
      aria-labelledby="home-daily-parlay-title"
      className="pl-daily-parlay glass-card glass-ring"
      data-daily-parlay-card=""
    >
      <div className="pl-daily-parlay-head">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill pl-pill--brand">
              <MaestroIcon name="sparkles" size={12} />
              <span>Oficial del día</span>
            </span>
            <span className="text-xs font-semibold capitalize" style={{ color: "var(--pl-text-muted)" }}>
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

        {active.status === "ready" ? (
          <div className="pl-daily-parlay-kpis">
            <div className="pl-daily-kpi">
              <span>Prob. combinada</span>
              <strong className="num">
                {(active.combinedProbability * 100).toFixed(1)} %
              </strong>
            </div>
            <div className="pl-daily-kpi">
              <span>Momio justo</span>
              <strong className="num">
                {formatOddsValue(active.fairDecimal, oddsFormat)}
              </strong>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="seg-well pl-daily-styles"
          role="group"
          aria-label="Estilo del parlay oficial del día"
        >
          {DAILY_PARLAY_STYLES.map((styleId) => {
            const styleSpec = DAILY_PARLAY_STYLE_SPECS[styleId];
            return (
              <button
                key={styleId}
                type="button"
                className="seg-btn pl-daily-style-btn"
                aria-pressed={selectedRisk === styleId}
                data-daily-risk={styleId}
                onClick={() => setSelectedRisk(styleId)}
              >
                {styleSpec.label}
              </button>
            );
          })}
        </div>
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {spec.ruleHint} Una selección por partido, sin contradicciones.
        </p>
      </div>

      {active.status === "ready" ? (
        <>
          <ul className="pl-daily-legs" aria-label={`Selecciones del parlay ${spec.label}`}>
            {active.legs.map(({ pick }) => (
              <li key={pick.id} className="pl-daily-leg">
                <LeagueBadge league={pick.league} label={pick.leagueLabel} size={20} />
                <div className="min-w-0 flex-1 flex flex-col">
                  <strong className="text-sm truncate">{pick.label}</strong>
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {pick.matchLabel} · <span className="num">{pick.kickoffLocal}</span>
                  </span>
                </div>
                <div className="pl-daily-leg-meta">
                  <span className="num text-xs font-extrabold">
                    {(pick.p * 100).toFixed(0)} % ·{" "}
                    {formatOddsValue(pick.fairDecimal, oddsFormat)}
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
            ))}
          </ul>

          {hasOpenLegs ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="pl-btn-primary min-h-11 px-4 text-sm inline-flex items-center justify-center gap-1.5"
                data-load-daily-parlay=""
                onClick={() =>
                  loadParlayPicks(
                    active.legs.map((l) => l.pick),
                    {
                      allowSgp: false,
                      toastText: `Parlay del día (${spec.label}) cargado con ${active.legs.length} selecciones.`,
                    },
                  )
                }
              >
                <MaestroIcon name="layers" size={14} />
                <span>Cargar a mi parlay</span>
              </button>
              <button
                type="button"
                className="pl-btn-glass min-h-11 px-4 text-sm inline-flex items-center justify-center gap-1.5"
                onClick={() => {
                  loadParlayPicks(
                    active.legs.map((l) => l.pick),
                    {
                      allowSgp: false,
                      toastText: `Parlay del día (${spec.label}) cargado.`,
                    },
                  );
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
            Sin datos suficientes para el estilo {spec.label}
          </p>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {active.emptyReason}
          </p>
          {alternativeRisk ? (
            <button
              type="button"
              className="pl-btn-glass min-h-11 px-4 text-xs self-start mt-1"
              onClick={() => setSelectedRisk(alternativeRisk)}
            >
              Ver estilo {DAILY_PARLAY_STYLE_SPECS[alternativeRisk].label}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
