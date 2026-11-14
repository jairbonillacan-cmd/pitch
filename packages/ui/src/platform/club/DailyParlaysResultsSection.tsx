"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  DAILY_PARLAY_STYLE_SPECS,
  gradeOfficialDailyParlays,
} from "../daily-parlay";
import type { OddsFormat, PlatformGame } from "../types";

const HIST_DAY_FMT = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Mexico_City",
});

export function DailyParlaysResultsSection({
  games,
  oddsFormat,
}: {
  games: readonly PlatformGame[];
  oddsFormat: OddsFormat;
}): React.JSX.Element {
  const [showAllDays, setShowAllDays] = useState(false);

  const gradedDays = useMemo(() => gradeOfficialDailyParlays(games, 7), [games]);
  const visibleDays = showAllDays ? gradedDays : gradedDays.slice(0, 2);

  return (
    <section
      aria-labelledby="hist-daily-parlays-title"
      className="space-y-3"
      data-hist-daily-parlays=""
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="hist-daily-parlays-title" className="m-0 text-lg font-extrabold">
            Parlays oficiales del día
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Calificación automática con el marcador oficial al terminar los partidos en todas las ligas.
          </p>
        </div>
      </div>

      {gradedDays.length === 0 ? (
        <div
          className="glass-card glass-ring rounded-2xl p-5 text-sm"
          style={{ color: "var(--pl-text-muted)" }}
        >
          Todavía no hay días terminados con partidos suficientes para calificar parlays del día.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleDays.map((day) => {
            const label = HIST_DAY_FMT.format(new Date(`${day.dayId}T18:00:00Z`));
            return (
              <div key={day.dayId} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="pl-home-day-head m-0 capitalize flex-1">{label}</h3>
                  <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                    {day.finishedGamesCount}{" "}
                    {day.finishedGamesCount === 1 ? "partido" : "partidos"}
                  </span>
                </div>

                <div className="pl-hist-parlays-grid">
                  {day.entries.map((entry) => {
                    const spec = DAILY_PARLAY_STYLE_SPECS[entry.risk];
                    const ready = entry.parlay.status === "ready";
                    return (
                      <article
                        key={`${day.dayId}:${entry.risk}`}
                        className="pl-hist-card glass-card glass-ring"
                        data-hist-parlay-style={entry.risk}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{spec.label}</span>
                          {entry.outcome === "hit" ? (
                            <span className="pl-hist-chip is-hit text-xs">
                              <MaestroIcon name="check" size={12} />
                              <span>Cumplido</span>
                            </span>
                          ) : entry.outcome === "miss" ? (
                            <span className="pl-hist-chip is-miss text-xs">
                              <MaestroIcon name="x" size={12} />
                              <span>No cumplido</span>
                            </span>
                          ) : entry.outcome === "pending" ? (
                            <span className="pl-pill pl-pill--info text-xs">En curso</span>
                          ) : (
                            <span className="pl-pill pl-pill--info text-xs">Sin muestra</span>
                          )}
                        </div>

                        {ready ? (
                          <>
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                              <span className="num" style={{ color: "var(--pl-text-secondary)" }}>
                                Prob.{" "}
                                <strong style={{ color: "var(--pl-text)" }}>
                                  {(entry.parlay.combinedProbability * 100).toFixed(1)} %
                                </strong>{" "}
                                · Justo{" "}
                                <strong style={{ color: "var(--pl-text)" }}>
                                  {formatOddsValue(entry.parlay.fairDecimal, oddsFormat)}
                                </strong>
                              </span>
                              <span className="num font-bold" style={{ color: "var(--pl-text-muted)" }}>
                                {entry.hitLegs}/{entry.parlay.legs.length}
                              </span>
                            </div>

                            <ul className="pl-daily-hist-legs">
                              {entry.parlay.legs.map(({ pick }) => {
                                const legHit = pick.result === "hit";
                                const legMiss = pick.result === "miss";
                                return (
                                  <li key={pick.id} className="pl-daily-hist-leg">
                                    <LeagueBadge
                                      league={pick.league}
                                      label={pick.leagueLabel}
                                      size={16}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                                      {pick.label}
                                    </span>
                                    <span
                                      className={`pl-daily-hist-mark ${
                                        legHit
                                          ? "is-hit"
                                          : legMiss
                                            ? "is-miss"
                                            : "is-pending"
                                      }`}
                                      aria-label={
                                        legHit
                                          ? "Acertada"
                                          : legMiss
                                            ? "Fallada"
                                            : "Pendiente"
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
                          </>
                        ) : (
                          <p
                            className="m-0 text-xs leading-relaxed"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {entry.parlay.emptyReason}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {gradedDays.length > 2 ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="pl-btn-glass text-sm min-h-11 px-5"
                onClick={() => setShowAllDays((v) => !v)}
              >
                {showAllDays ? "Ver menos días" : `Ver más días (${gradedDays.length - 2})`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
