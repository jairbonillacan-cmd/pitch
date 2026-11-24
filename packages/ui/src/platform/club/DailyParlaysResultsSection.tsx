"use client";

import React, { useMemo, useState } from "react";
import {
  SofascoreCard,
  SofascoreEmptyState,
} from "../../components/ui/primitives";
import { LeagueBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  DAILY_PARLAY_MODE_SPECS,
  gradeOfficialDailyParlays,
} from "../daily-parlay";
import type { OddsFormat, PlatformGame } from "../types";

function formatGradedDayLabel(dayId: string, timeZone: string): string {
  try {
    const raw = new Intl.DateTimeFormat("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(new Date(`${dayId}T18:00:00Z`));
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch (err) {
    void err;
    return dayId;
  }
}

export function DailyParlaysResultsSection({
  games,
  oddsFormat,
  timeZone = "America/Mexico_City",
  compact = false,
}: {
  games: readonly PlatformGame[];
  oddsFormat: OddsFormat;
  timeZone?: string;
  compact?: boolean;
}): React.JSX.Element {
  const [dayIndex, setDayIndex] = useState(0);

  const gradedDays = useMemo(() => gradeOfficialDailyParlays(games, 7), [games]);
  const safeIndex = gradedDays.length > 0 ? Math.min(dayIndex, gradedDays.length - 1) : 0;
  const activeDay = gradedDays[safeIndex] ?? null;

  return (
    <div data-hist-daily-parlays="">
      <SofascoreCard
        id="hist-daily-parlays"
        title="Parlays oficiales del día"
        meta={
          activeDay ? (
            <div className="pl-hist-day-nav">
              {gradedDays.length > 1 ? (
                <button
                  type="button"
                  className="pl-hist-day-nav-btn"
                  aria-label="Jornada anterior"
                  disabled={safeIndex >= gradedDays.length - 1}
                  onClick={() => setDayIndex((i) => Math.min(gradedDays.length - 1, i + 1))}
                >
                  <MaestroIcon name="chevronLeft" size={14} />
                </button>
              ) : null}
              <span className="pl-hist-day-nav-label num">
                {formatGradedDayLabel(activeDay.dayId, timeZone)}
              </span>
              {gradedDays.length > 1 ? (
                <button
                  type="button"
                  className="pl-hist-day-nav-btn"
                  aria-label="Jornada más reciente"
                  disabled={safeIndex <= 0}
                  onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
                >
                  <MaestroIcon name="chevronRight" size={14} />
                </button>
              ) : null}
            </div>
          ) : (
            "Sin jornadas"
          )
        }
      >
        <div className="space-y-3">
          {!activeDay ? (
            <SofascoreEmptyState
              title="Sin parlays calificados todavía"
              description="Cuando terminen suficientes partidos de una jornada verás aquí los 3 perfiles calificados."
            />
          ) : (
            <div className={compact ? "pl-hist-parlays-stack" : "pl-hist-parlays-grid"}>
              {activeDay.entries.map((entry, idx) => {
                const spec = DAILY_PARLAY_MODE_SPECS[entry.risk];
                const ready = entry.parlay.status === "ready";
                const statusLabel =
                  entry.outcome === "hit"
                    ? "Cumplido"
                    : entry.outcome === "miss"
                      ? "No cumplido"
                      : entry.outcome === "pending"
                        ? "En curso"
                        : "Sin muestra";
                const statusTone =
                  entry.outcome === "hit"
                    ? "is-hit"
                    : entry.outcome === "miss"
                      ? "is-miss"
                      : entry.outcome === "pending"
                        ? "is-pending"
                        : "is-empty";

                if (!ready) {
                  return (
                    <article
                      key={`${activeDay.dayId}:${entry.risk}`}
                      className="pl-hist-parlay-item"
                      data-hist-parlay-style={entry.risk}
                    >
                      <div className="pl-hist-parlay-head">
                        <span className="pl-hist-parlay-name">{spec.label}</span>
                        <span className={`pl-hist-parlay-status ${statusTone}`}>{statusLabel}</span>
                      </div>
                      <p className="pl-hist-parlay-empty">{entry.parlay.emptyReason}</p>
                    </article>
                  );
                }

                return (
                  <details
                    key={`${activeDay.dayId}:${entry.risk}`}
                    className="pl-hist-parlay-item"
                    data-hist-parlay-style={entry.risk}
                    open={idx === 0 || !compact}
                  >
                    <summary className="pl-hist-parlay-summary">
                      <div className="pl-hist-parlay-head">
                        <span className="pl-hist-parlay-name">{spec.label}</span>
                        <span className="pl-hist-parlay-right">
                          <span className="pl-hist-parlay-legs-score num">
                            {entry.hitLegs}/{entry.parlay.legs.length}
                          </span>
                          <span className={`pl-hist-parlay-status ${statusTone}`}>
                            <MaestroIcon
                              name={
                                entry.outcome === "hit"
                                  ? "check"
                                  : entry.outcome === "miss"
                                    ? "x"
                                    : "minus"
                              }
                              size={11}
                            />
                            <span>{statusLabel}</span>
                          </span>
                        </span>
                      </div>
                      <div className="pl-hist-parlay-sub num">
                        <span>
                          Prob. {(entry.parlay.combinedProbability * 100).toFixed(0)} % · Momio
                          justo {formatOddsValue(entry.parlay.fairDecimal, oddsFormat)}
                        </span>
                        <span className="pl-hist-parlay-chev" aria-hidden="true">
                          <MaestroIcon name="chevronDown" size={13} />
                        </span>
                      </div>
                    </summary>

                    <ul className="pl-daily-hist-legs">
                      {entry.parlay.legs.map(({ pick }) => {
                        const legHit = pick.result === "hit";
                        const legMiss = pick.result === "miss";
                        return (
                          <li key={pick.id} className="pl-daily-hist-leg">
                            <LeagueBadge
                              league={pick.league}
                              label={pick.leagueLabel}
                              size={15}
                            />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {pick.label}
                            </span>
                            <span
                              role="img"
                              className={`pl-daily-hist-mark ${
                                legHit ? "is-hit" : legMiss ? "is-miss" : "is-pending"
                              }`}
                              aria-label={
                                legHit ? "Acertada" : legMiss ? "Fallada" : "Pendiente"
                              }
                            >
                              <MaestroIcon
                                name={legHit ? "check" : legMiss ? "x" : "minus"}
                                size={11}
                              />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </SofascoreCard>
    </div>
  );
}
