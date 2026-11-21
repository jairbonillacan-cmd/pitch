"use client";

import React, { useMemo, useState } from "react";
import {
  Button,
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
  const visibleDays = showAllDays ? gradedDays : gradedDays.slice(0, 1);

  return (
    <div data-hist-daily-parlays="">
      <SofascoreCard
        id="hist-daily-parlays"
        title="Parlays oficiales del día"
        meta={
          gradedDays.length > 0
            ? `${gradedDays.length} ${gradedDays.length === 1 ? "jornada" : "jornadas"}`
            : "Sin jornadas"
        }
      >
        <div className="space-y-3">
          <p className="m-0 text-xs [text-wrap:pretty]" style={{ color: "var(--pl-text-muted)" }}>
            Calificación automática con el marcador oficial al terminar los partidos en todas las
            ligas.
          </p>

          {gradedDays.length === 0 ? (
            <SofascoreEmptyState
              title="Sin parlays calificados todavía"
              description="Todavía no hay días terminados con partidos suficientes para calificar parlays del día."
            />
          ) : (
            <div className="space-y-3.5">
              {visibleDays.map((day) => {
                const rawLabel = HIST_DAY_FMT.format(new Date(`${day.dayId}T18:00:00Z`));
                const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
                return (
                  <div key={day.dayId} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="pl-home-day-head m-0 flex-1">{label}</h3>
                      <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                        {day.finishedGamesCount}{" "}
                        {day.finishedGamesCount === 1 ? "partido" : "partidos"}
                      </span>
                    </div>

                    <div className="pl-hist-parlays-grid">
                      {day.entries.map((entry) => {
                        const spec = DAILY_PARLAY_MODE_SPECS[entry.risk];
                        const ready = entry.parlay.status === "ready";
                        return (
                          <article
                            key={`${day.dayId}:${entry.risk}`}
                            className="pl-hist-ed-parlay-card"
                            data-hist-parlay-style={entry.risk}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-extrabold">{spec.label}</span>
                              {entry.outcome === "hit" ? (
                                <span className="pl-pill pl-pill--success text-xs">
                                  <MaestroIcon name="check" size={11} />
                                  <span>Cumplido</span>
                                </span>
                              ) : entry.outcome === "miss" ? (
                                <span className="pl-pill pl-pill--danger text-xs">
                                  <MaestroIcon name="x" size={11} />
                                  <span>No cumplido</span>
                                </span>
                              ) : entry.outcome === "pending" ? (
                                <span className="pl-pill pl-pill--info text-xs">En curso</span>
                              ) : (
                                <span className="pl-pill text-xs">Sin muestra</span>
                              )}
                            </div>

                            {ready ? (
                              <>
                                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs num">
                                  <span style={{ color: "var(--pl-text-secondary)" }}>
                                    Prob.{" "}
                                    <strong style={{ color: "var(--pl-text)" }}>
                                      {(entry.parlay.combinedProbability * 100).toFixed(1)} %
                                    </strong>{" "}
                                    · Justo{" "}
                                    <strong style={{ color: "var(--pl-text)" }}>
                                      {formatOddsValue(entry.parlay.fairDecimal, oddsFormat)}
                                    </strong>
                                  </span>
                                  <span
                                    className="font-bold"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
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
                                          size={15}
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

              {gradedDays.length > 1 ? (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllDays((v) => !v)}
                  >
                    {showAllDays
                      ? "Ver menos días"
                      : `Ver más días (${gradedDays.length - 1})`}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </SofascoreCard>
    </div>
  );
}
