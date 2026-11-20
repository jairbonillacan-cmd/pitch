"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { PersonAvatar } from "../club/team/PersonAvatar";
import type { LeagueId } from "@pitchlab/contracts";
import type { OddsFormat } from "../types";

export interface PropGamePoint {
  readonly label: string;
  readonly opponent?: string;
  readonly date?: string;
  readonly value: number;
}

export interface PropMetricSeries {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly defaultLine: number;
  readonly step?: number;
  readonly minLine?: number;
  readonly maxLine?: number;
  readonly points: readonly PropGamePoint[];
}

export interface PlayerPropStreakCardProps {
  playerName: string;
  teamName: string;
  teamSlug?: string;
  teamLogoUrl?: string;
  league: LeagueId;
  photoKey?: string | null;
  positionLabel?: string;
  series: readonly PropMetricSeries[];
  playerHref?: string;
  onNavigate?: (href: string) => void;
  /** Ventana inicial de partidos (`5`, `10` o `20`). */
  initialWindow?: 5 | 10 | 20;
  /** Formato de momio para mostrar la cuota justa calibrada. */
  oddsFormat?: OddsFormat;
}

export interface PropStreakSummary {
  hits: number;
  total: number;
  hitRatePct: number;
  /** Probabilidad ajustada por contracción bayesiana Beta(2,2) en `(0.02, 0.98)` (jamás 0 % ni 100 % crudo). */
  pCalibrated: number;
  fairDecimal: number;
  reliabilityLabel: string;
  average: number;
  maxVal: number;
}

export function evaluatePropStreak(
  points: readonly PropGamePoint[],
  line: number,
  windowSize: number,
): PropStreakSummary {
  const sliced = points.slice(-Math.max(1, windowSize));
  const total = sliced.length;
  if (total === 0) {
    return {
      hits: 0,
      total: 0,
      hitRatePct: 0,
      pCalibrated: 0.5,
      fairDecimal: 2.0,
      reliabilityLabel: "Sin muestra",
      average: 0,
      maxVal: Math.max(1, line),
    };
  }
  let hits = 0;
  let sum = 0;
  let maxVal = line;
  for (const pt of sliced) {
    if (pt.value > line) hits += 1;
    sum += pt.value;
    if (pt.value > maxVal) maxVal = pt.value;
  }
  const pCalibrated = Math.min(0.98, Math.max(0.02, (hits + 2) / (total + 4)));
  const fairDecimal = Math.round((1 / pCalibrated) * 100) / 100;
  const reliabilityLabel =
    total >= 15 ? "Muestra sólida" : total >= 10 ? "Muestra media" : "Muestra corta";
  return {
    hits,
    total,
    hitRatePct: Math.round((hits / total) * 1000) / 10,
    pCalibrated: Math.round(pCalibrated * 10_000) / 10_000,
    fairDecimal,
    reliabilityLabel,
    average: Math.round((sum / total) * 100) / 100,
    maxVal: Math.max(1, maxVal * 1.15),
  };
}

const WINDOWS = [5, 10, 20] as const;

/**
 * Tarjeta interactiva de Player Props y racha («Últimos 5 / 10 / 20» vs línea deslizable).
 * Usa `<input type="range">` nativo estilizado con custom properties (`--control-value`,
 * `--attr-min`, `--attr-max`) para máxima accesibilidad y compatibilidad cross-browser.
 */
export const PlayerPropStreakCard = React.memo(function PlayerPropStreakCard({
  playerName,
  teamName,
  teamSlug = "equipo",
  teamLogoUrl,
  league,
  photoKey,
  positionLabel,
  series,
  playerHref,
  onNavigate,
  initialWindow = 5,
  oddsFormat = "decimal",
}: PlayerPropStreakCardProps): React.JSX.Element {
  const sliderId = useId();
  const [metricKey, setMetricKey] = useState<string>(() => series[0]?.key ?? "");
  const activeSeries = useMemo(
    () => series.find((s) => s.key === metricKey) ?? series[0],
    [series, metricKey],
  );

  const [line, setLine] = useState<number>(() => activeSeries?.defaultLine ?? 0.5);
  const [windowSize, setWindowSize] = useState<5 | 10 | 20>(initialWindow);
  const sliderRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeSeries) {
      setLine(activeSeries.defaultLine);
    }
  }, [activeSeries?.key, activeSeries?.defaultLine]);

  const minLine = activeSeries?.minLine ?? 0.5;
  const maxLine = activeSeries?.maxLine ?? Math.max(4.5, Math.ceil((activeSeries?.defaultLine ?? 1.5) * 3) + 0.5);
  const step = activeSeries?.step ?? 0.5;

  // Fallback Safari/Firefox sin typed `attr()` ni `::-webkit-slider-progress`: sincroniza custom properties en DOM.
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    el.style.setProperty("--attr-min", String(minLine));
    el.style.setProperty("--attr-max", String(maxLine));
    el.style.setProperty("--control-value", String(line));
  }, [minLine, maxLine, line]);

  const points = useMemo(
    () => (activeSeries?.points ?? []).slice(-windowSize),
    [activeSeries, windowSize],
  );
  const summary = useMemo(
    () => evaluatePropStreak(activeSeries?.points ?? [], line, windowSize),
    [activeSeries, line, windowSize],
  );

  const lineBottomPct = Math.max(8, Math.min(82, (line / summary.maxVal) * 82));

  if (!activeSeries) {
    return (
      <article className="pl-prop-card glass-card glass-ring" data-prop-streak-card="">
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Sin registros suficientes por partido para este jugador todavía.
        </p>
      </article>
    );
  }

  return (
    <article className="pl-prop-card glass-card glass-ring" data-prop-streak-card="">
      <header className="pl-prop-head">
        <div className="pl-prop-identity">
          <PersonAvatar photoKey={photoKey} size={40} />
          <div className="min-w-0">
            <h3 className="m-0 text-sm font-extrabold truncate">
              {playerHref ? (
                <a
                  href={playerHref}
                  onClick={(e) => {
                    if (!onNavigate) return;
                    e.preventDefault();
                    onNavigate(playerHref);
                  }}
                  className="pl-team-link"
                >
                  {playerName}
                </a>
              ) : (
                playerName
              )}
            </h3>
            <p className="m-0 flex items-center gap-1.5 text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
              <TeamBadge league={league} slug={teamSlug} name={teamName} logoUrl={teamLogoUrl} size={15} />
              <span className="truncate">{teamName}</span>
              {positionLabel ? <span>· {positionLabel}</span> : null}
            </p>
          </div>
        </div>

        <div className="pl-prop-hit-badge num" data-prop-hit-rate="">
          <strong className={summary.hitRatePct >= 60 ? "is-hot" : ""}>
            {summary.hits}/{summary.total}
          </strong>
          <span>{summary.hitRatePct.toFixed(0)} %</span>
        </div>
      </header>

      {series.length > 1 ? (
        <div className="pl-prop-metrics" role="tablist" aria-label="Estadística del jugador">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s.key === activeSeries.key}
              className={`pl-prop-metric-pill ${s.key === activeSeries.key ? "is-on" : ""}`.trim()}
              onClick={() => setMetricKey(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="pl-prop-controls">
        <div className="pl-prop-slider-wrap">
          <div className="pl-prop-slider-label-row">
            <label htmlFor={sliderId} className="text-xs font-semibold">
              Línea: <strong className="num">Más de {line.toFixed(1)} {activeSeries.unit}</strong>
            </label>
            <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
              Prom. {summary.average.toFixed(2)}
            </span>
          </div>
          <input
            ref={sliderRef}
            id={sliderId}
            type="range"
            className="pl-range-slider"
            min={minLine}
            max={maxLine}
            step={step}
            value={line}
            aria-valuetext={`Más de ${line.toFixed(1)} ${activeSeries.unit} (${summary.hits} de ${summary.total} partidos)`}
            onChange={(e) => setLine(Number(e.target.value))}
          />
        </div>

        <div className="pl-prop-windows" role="group" aria-label="Ventana de últimos partidos">
          {WINDOWS.map((w) => {
            const disabled = activeSeries.points.length < w && w > 5;
            return (
              <button
                key={w}
                type="button"
                className={`pl-prop-win-btn num ${windowSize === w ? "is-on" : ""}`.trim()}
                aria-pressed={windowSize === w}
                disabled={disabled}
                onClick={() => setWindowSize(w)}
              >
                U{w}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="pl-prop-chart"
        role="img"
        aria-label={`Últimos ${points.length} partidos de ${playerName} en ${activeSeries.label}: cumplió ${summary.hits} de ${summary.total} veces arriba de ${line}`}
      >
        <div
          className="pl-prop-threshold"
          style={{ bottom: `${lineBottomPct}%` }}
          aria-hidden="true"
        >
          <span className="num">{line.toFixed(1)}</span>
        </div>
        <ol className="pl-prop-bars" role="list">
          {points.map((pt, idx) => {
            const hit = pt.value > line;
            const heightPct = Math.max(6, Math.min(100, (pt.value / summary.maxVal) * 100));
            return (
              <li key={`${pt.label}-${idx}`} className="pl-prop-bar-col">
                <span className={`pl-prop-bar-val num ${hit ? "is-hit" : ""}`.trim()}>
                  {pt.value}
                </span>
                <div className="pl-prop-bar-track">
                  <span
                    className={`pl-prop-bar-fill ${hit ? "is-hit" : "is-miss"}`.trim()}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="pl-prop-bar-foot" title={pt.opponent ?? pt.label}>
                  {pt.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <footer className="pl-prop-cal-foot num" data-prop-calibrated="">
        <span className="pl-prop-cal-stat">
          <span>Prob. ajustada</span>
          <strong>{(summary.pCalibrated * 100).toFixed(1)} %</strong>
        </span>
        <span className="pl-prop-cal-stat">
          <span>Momio justo</span>
          <strong style={{ color: "var(--pl-brand)" }}>
            {formatOddsValue(summary.fairDecimal, oddsFormat)}
          </strong>
        </span>
        <span className="pl-prop-cal-sample">{summary.reliabilityLabel}</span>
      </footer>
    </article>
  );
});
