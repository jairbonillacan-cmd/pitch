"use client";

import React, { useId, useMemo, useState } from "react";

export interface PropBetLabPoint {
  readonly id: string;
  readonly label: string;
  readonly opponent: string;
  readonly date?: string;
  readonly value: number;
  readonly minutes: number;
  readonly xg?: number | null;
  readonly isHome?: boolean;
}

export interface PropBetLabChartProps {
  readonly playerName: string;
  readonly statLabel: string;
  readonly unitLabel: string;
  readonly sport: "football" | "basketball";
  readonly line: number;
  readonly points: readonly PropBetLabPoint[];
  readonly maxMinutes?: 90 | 48;
  readonly rivalDefenseRank?: number | null;
  readonly rivalLeagueSize?: number | null;
  readonly rivalEbLabel?: string | null;
  readonly calibratedProb?: number | null;
  readonly fairDecimal?: number | null;
  readonly onLineChange?: (nextLine: number) => void;
  readonly className?: string;
}

export type PropPointOutcome = "hit" | "push" | "miss";

export interface PropHitRateWindow {
  readonly hits: number;
  readonly total: number;
  readonly pct: number;
}

export interface PropHitRateSummary {
  readonly l5: PropHitRateWindow;
  readonly l10: PropHitRateWindow;
  readonly l20: PropHitRateWindow;
}

export function classifyPropPointHit(value: number, line: number): PropPointOutcome {
  const safeVal = Number.isFinite(value) ? value : 0;
  const safeLine = Number.isFinite(line) ? line : 0;
  if (safeVal > safeLine) return "hit";
  if (safeVal === safeLine) return "push";
  return "miss";
}

function summarizeWindow(points: readonly PropBetLabPoint[], line: number, size: number): PropHitRateWindow {
  const slice = points.slice(-size);
  const total = slice.length;
  if (total === 0) return { hits: 0, total: 0, pct: 0 };
  let hits = 0;
  for (const pt of slice) {
    if (classifyPropPointHit(pt.value, line) === "hit") {
      hits += 1;
    }
  }
  return {
    hits,
    total,
    pct: Math.round((hits / total) * 100),
  };
}

export function computePropHitRates(
  points: readonly PropBetLabPoint[],
  line: number,
): PropHitRateSummary {
  return {
    l5: summarizeWindow(points, line, 5),
    l10: summarizeWindow(points, line, 10),
    l20: summarizeWindow(points, line, 20),
  };
}

function formatLineNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1);
}

function formatValueCompact(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1);
}

function formatMinuteAxis(value: number, sport: "football" | "basketball"): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(safe);
  return sport === "basketball" ? `${rounded}m` : `${rounded}'`;
}

function formatMinuteRange(maxMin: number, sport: "football" | "basketball"): string {
  return sport === "basketball" ? `0–${maxMin}m` : `0'–${maxMin}'`;
}

export function PropBetLabChart({
  playerName,
  statLabel,
  unitLabel,
  sport,
  line,
  points,
  maxMinutes,
  rivalDefenseRank = null,
  rivalLeagueSize = null,
  rivalEbLabel = null,
  calibratedProb = null,
  fairDecimal = null,
  onLineChange,
  className = "",
}: PropBetLabChartProps): React.JSX.Element {
  const uid = useId().replace(/:/g, "");
  const [windowCap, setWindowCap] = useState<5 | 10 | 20>(20);
  const safeLine = Number.isFinite(line) && line >= 0 ? line : 0.5;
  const resolvedMaxMinutes: 90 | 48 = maxMinutes ?? (sport === "basketball" ? 48 : 90);

  const rates = useMemo(() => computePropHitRates(points, safeLine), [points, safeLine]);

  const visiblePoints = useMemo(() => points.slice(-windowCap), [points, windowCap]);

  const pointsWithXg = useMemo(
    () => visiblePoints.filter((p) => p.xg != null && Number.isFinite(p.xg)),
    [visiblePoints],
  );

  const normalizedProbPct = useMemo(() => {
    if (calibratedProb == null || !Number.isFinite(calibratedProb) || calibratedProb <= 0) {
      return null;
    }
    const rawPct = calibratedProb <= 1 ? calibratedProb * 100 : calibratedProb;
    return Math.max(0.1, Math.min(99.9, Math.round(rawPct * 10) / 10));
  }, [calibratedProb]);

  const resolvedFairDecimal = useMemo(() => {
    if (fairDecimal != null && Number.isFinite(fairDecimal) && fairDecimal > 1) {
      return fairDecimal;
    }
    if (normalizedProbPct !== null && normalizedProbPct > 1 && normalizedProbPct < 99) {
      return Math.max(1.02, 100 / normalizedProbPct);
    }
    return null;
  }, [fairDecimal, normalizedProbPct]);

  if (points.length === 0) {
    return (
      <section
        className={`pl-atom-betlab pl-atom-card ${className}`.trim()}
        aria-labelledby={`${uid}-title`}
        data-atomic-betlab="empty"
        data-sport={sport}
      >
        <div className="pl-atom-betlab-heading">
          <h3 id={`${uid}-title`} className="pl-atom-title">
            {playerName} · {statLabel}
          </h3>
        </div>
        <p className="pl-atom-empty">Sin partidos recientes registrados para este jugador.</p>
      </section>
    );
  }

  const svgW = 360;
  const svgH = 196;
  const padLeft = 28;
  const padRight = 32;
  const padTop = 20;
  const padBottom = 34;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const maxObserved = visiblePoints.reduce(
    (acc, pt) => (Number.isFinite(pt.value) && pt.value > acc ? pt.value : acc),
    0,
  );
  const yMax = Math.max(safeLine * 1.35, maxObserved * 1.15, 1);

  const valueToY = (val: number): number => {
    const safe = Number.isFinite(val) ? Math.max(0, val) : 0;
    return Math.round((padTop + plotH - (safe / yMax) * plotH) * 10) / 10;
  };

  const minuteToY = (min: number): number => {
    const safe = Number.isFinite(min) ? Math.max(0, Math.min(resolvedMaxMinutes, min)) : 0;
    return Math.round((padTop + plotH - (safe / resolvedMaxMinutes) * plotH) * 10) / 10;
  };

  const slotW = plotW / Math.max(1, visiblePoints.length);
  const barW = Math.max(6, Math.min(26, Math.round(slotW * 0.58 * 10) / 10));
  const lineY = valueToY(safeLine);
  const showBarValues = visiblePoints.length <= 12;
  const showAllXLabels = visiblePoints.length <= 10;

  const plottedBars = visiblePoints.map((pt, idx) => {
    const centerX = Math.round((padLeft + slotW * (idx + 0.5)) * 10) / 10;
    const barX = Math.round((centerX - barW / 2) * 10) / 10;
    const barTop = valueToY(pt.value);
    const barHeight = Math.max(2, Math.round((padTop + plotH - barTop) * 10) / 10);
    const minY = minuteToY(pt.minutes);
    const outcome = classifyPropPointHit(pt.value, safeLine);
    return { pt, idx, centerX, barX, barTop, barHeight, minY, outcome };
  });

  const minutePolylinePoints = plottedBars.map((item) => `${item.centerX},${item.minY}`).join(" ");
  const minuteRangeText = formatMinuteRange(resolvedMaxMinutes, sport);
  const hasRivalBand =
    (rivalDefenseRank != null && Number.isFinite(rivalDefenseRank) && rivalDefenseRank > 0) ||
    (typeof rivalEbLabel === "string" && rivalEbLabel.trim().length > 0);

  const svgTitle = `${playerName}: ${statLabel} (${unitLabel}) frente a línea ${formatLineNumber(safeLine)} en últimos ${visiblePoints.length} partidos, con curva de minutos ${minuteRangeText}. Acierto L5 ${rates.l5.hits}/${rates.l5.total} (${rates.l5.pct} %).`;

  const stepLine = (delta: number) => {
    if (!onLineChange) return;
    const next = Math.max(0, Math.round((safeLine + delta) * 10) / 10);
    onLineChange(next);
  };

  return (
    <figure
      className={`pl-atom-betlab pl-atom-card ${className}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-atomic-betlab=""
      data-sport={sport}
      data-max-minutes={resolvedMaxMinutes}
    >
      <figcaption className="pl-atom-betlab-head">
        <div className="pl-atom-betlab-title-row">
          <div className="pl-atom-betlab-heading">
            <span id={`${uid}-title`} className="pl-atom-title">
              {playerName}
            </span>
            <span className="pl-atom-sub">
              {statLabel} · {unitLabel}
            </span>
          </div>

          <div className="pl-atom-betlab-line-ctrl num" role="group" aria-label="Línea objetivo">
            {onLineChange ? (
              <button
                type="button"
                className="pl-atom-betlab-step-btn"
                aria-label="Bajar línea en 0.5"
                disabled={safeLine <= 0}
                onClick={() => stepLine(-0.5)}
              >
                −
              </button>
            ) : null}
            <span className="pl-atom-betlab-line-pill">
              Línea <strong>{formatLineNumber(safeLine)}</strong>
            </span>
            {onLineChange ? (
              <button
                type="button"
                className="pl-atom-betlab-step-btn"
                aria-label="Subir línea en 0.5"
                onClick={() => stepLine(0.5)}
              >
                +
              </button>
            ) : null}
          </div>
        </div>

        {points.length > 5 ? (
          <div className="pl-atom-seg-group" role="group" aria-label="Ventana de partidos">
            {([5, 10, 20] as const).map((win) => (
              <button
                key={win}
                type="button"
                aria-pressed={windowCap === win}
                className={`pl-atom-seg-btn num${windowCap === win ? " is-active" : ""}`}
                onClick={() => setWindowCap(win)}
              >
                {`L${win}`}
              </button>
            ))}
          </div>
        ) : null}
      </figcaption>

      {hasRivalBand ? (
        <div className="pl-atom-betlab-rival num" data-betlab-rival="">
          {rivalDefenseRank != null && Number.isFinite(rivalDefenseRank) && rivalDefenseRank > 0 ? (
            <span className="pl-atom-betlab-rival-rank">
              Defensa rival <strong>{`${Math.round(rivalDefenseRank)}.º`}</strong>
              {rivalLeagueSize != null && Number.isFinite(rivalLeagueSize) && rivalLeagueSize > 0
                ? ` / ${Math.round(rivalLeagueSize)}`
                : ""}
            </span>
          ) : null}
          {rivalEbLabel && rivalEbLabel.trim().length > 0 ? (
            <span className="pl-atom-betlab-rival-eb">{rivalEbLabel.trim()}</span>
          ) : null}
        </div>
      ) : null}

      <div className="pl-atom-betlab-canvas">
        <svg
          role="img"
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="pl-atom-betlab-svg"
        >
          <title>{svgTitle}</title>

          <line
            x1={padLeft}
            y1={padTop}
            x2={svgW - padRight}
            y2={padTop}
            className="pl-atom-betlab-grid"
          />
          <line
            x1={padLeft}
            y1={Math.round((padTop + plotH / 2) * 10) / 10}
            x2={svgW - padRight}
            y2={Math.round((padTop + plotH / 2) * 10) / 10}
            className="pl-atom-betlab-grid"
          />
          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={svgW - padRight}
            y2={padTop + plotH}
            className="pl-atom-betlab-axis"
          />

          <text x={padLeft - 4} y={padTop + 3} textAnchor="end" className="pl-atom-betlab-axis-lbl">
            {formatValueCompact(yMax)}
          </text>
          <text x={padLeft - 4} y={padTop + plotH + 3} textAnchor="end" className="pl-atom-betlab-axis-lbl">
            0
          </text>

          <text
            x={svgW - padRight + 4}
            y={padTop + 3}
            textAnchor="start"
            className="pl-atom-betlab-axis-min"
          >
            {formatMinuteAxis(resolvedMaxMinutes, sport)}
          </text>
          <text
            x={svgW - padRight + 4}
            y={padTop + plotH + 3}
            textAnchor="start"
            className="pl-atom-betlab-axis-min"
          >
            {formatMinuteAxis(0, sport)}
          </text>

          {plottedBars.map((item) => (
            <g key={item.pt.id} data-betlab-bar={item.outcome}>
              <rect
                x={item.barX}
                y={item.barTop}
                width={barW}
                height={item.barHeight}
                rx="3"
                className={`pl-atom-betlab-bar is-${item.outcome}`}
              />
              {showBarValues ? (
                <text
                  x={item.centerX}
                  y={Math.max(padTop - 4, item.barTop - 4)}
                  textAnchor="middle"
                  className="pl-atom-betlab-val-lbl"
                >
                  {formatValueCompact(item.pt.value)}
                </text>
              ) : null}
              {showAllXLabels || item.idx % 2 === 0 || item.idx === plottedBars.length - 1 ? (
                <text
                  x={item.centerX}
                  y={padTop + plotH + 14}
                  textAnchor="middle"
                  className="pl-atom-betlab-x-lbl"
                >
                  {item.pt.label.slice(0, 5)}
                </text>
              ) : null}
            </g>
          ))}

          <line
            x1={padLeft}
            y1={lineY}
            x2={svgW - padRight}
            y2={lineY}
            className="pl-atom-betlab-threshold"
          />

          {plottedBars.length >= 2 ? (
            <polyline
              points={minutePolylinePoints}
              className="pl-atom-betlab-min-line"
            />
          ) : null}

          {plottedBars.map((item) => (
            <circle
              key={`min-${item.pt.id}`}
              cx={item.centerX}
              cy={item.minY}
              r="2.8"
              className="pl-atom-betlab-min-dot"
            />
          ))}
        </svg>
      </div>

      <div className="pl-atom-betlab-legend" aria-hidden="true">
        <span className="pl-atom-legend-item">
          <span className="pl-atom-betlab-swatch is-hit" /> Supera línea
        </span>
        <span className="pl-atom-legend-item">
          <span className="pl-atom-betlab-swatch is-miss" /> Debajo
        </span>
        <span className="pl-atom-legend-item">
          <span className="pl-atom-betlab-swatch is-line" /> Línea {formatLineNumber(safeLine)}
        </span>
        <span className="pl-atom-legend-item">
          <span className="pl-atom-betlab-swatch is-min" /> Minutos ({minuteRangeText})
        </span>
      </div>

      {pointsWithXg.length > 0 ? (
        <div className="pl-atom-betlab-xg-strip" data-betlab-xg-strip="" aria-label="xG por partido">
          {pointsWithXg.map((pt) => (
            <span key={`xg-${pt.id}`} className="pl-atom-betlab-xg-badge num" data-betlab-xg-badge="">
              <span className="pl-atom-betlab-xg-lbl">{pt.label}</span>
              <strong>xG {pt.xg!.toFixed(2)}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <div className="pl-atom-betlab-summary num" data-betlab-summary="">
        <div className="pl-atom-betlab-kpi">
          <span className="pl-atom-betlab-kpi-label">L5</span>
          <strong>{`${rates.l5.hits}/${rates.l5.total}`}</strong>
          <span className="pl-atom-betlab-kpi-sub">{`${rates.l5.pct} %`}</span>
        </div>
        <div className="pl-atom-betlab-kpi">
          <span className="pl-atom-betlab-kpi-label">L10</span>
          <strong>{`${rates.l10.hits}/${rates.l10.total}`}</strong>
          <span className="pl-atom-betlab-kpi-sub">{`${rates.l10.pct} %`}</span>
        </div>
        <div className="pl-atom-betlab-kpi">
          <span className="pl-atom-betlab-kpi-label">L20</span>
          <strong>{`${rates.l20.hits}/${rates.l20.total}`}</strong>
          <span className="pl-atom-betlab-kpi-sub">{`${rates.l20.pct} %`}</span>
        </div>
        {normalizedProbPct !== null ? (
          <div className="pl-atom-betlab-kpi is-accent">
            <span className="pl-atom-betlab-kpi-label">p calibrada</span>
            <strong>{`${normalizedProbPct.toFixed(1)} %`}</strong>
          </div>
        ) : null}
        {resolvedFairDecimal !== null ? (
          <div className="pl-atom-betlab-kpi is-accent">
            <span className="pl-atom-betlab-kpi-label">Momio justo</span>
            <strong>{resolvedFairDecimal.toFixed(2)}</strong>
          </div>
        ) : null}
      </div>

      <details className="pl-atom-disclosure">
        <summary className="num">Ver historial como tabla ({visiblePoints.length})</summary>
        <div
          className="pl-atom-table-wrap"
          role="region"
          tabIndex={0}
          aria-labelledby={`${uid}-table-cap`}
        >
          <table className="pl-atom-table">
            <caption id={`${uid}-table-cap`} className="sr-only">
              Historial de {statLabel} de {playerName} frente a línea {formatLineNumber(safeLine)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Partido</th>
                <th scope="col">Rival</th>
                <th scope="col" className="num">
                  {unitLabel}
                </th>
                <th scope="col" className="num">
                  Min
                </th>
                {pointsWithXg.length > 0 ? (
                  <th scope="col" className="num">
                    xG
                  </th>
                ) : null}
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((pt) => {
                const outcome = classifyPropPointHit(pt.value, safeLine);
                const stateLabel =
                  outcome === "hit" ? "Superó" : outcome === "push" ? "Igualó" : "Debajo";
                return (
                  <tr key={`row-${pt.id}`}>
                    <th scope="row">{pt.label}</th>
                    <td data-label="Rival">
                      {pt.isHome === false ? `@ ${pt.opponent}` : pt.opponent}
                    </td>
                    <td className="num" data-label={unitLabel}>
                      {formatValueCompact(pt.value)}
                    </td>
                    <td className="num" data-label="Min">
                      {formatMinuteAxis(pt.minutes, sport)}
                    </td>
                    {pointsWithXg.length > 0 ? (
                      <td className="num" data-label="xG">
                        {pt.xg != null && Number.isFinite(pt.xg) ? pt.xg.toFixed(2) : "—"}
                      </td>
                    ) : null}
                    <td data-label="Estado">{stateLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
