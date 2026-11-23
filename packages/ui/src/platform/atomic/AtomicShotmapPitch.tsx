"use client";

import React, { useId, useMemo, useState } from "react";
import type { LiveShot, LiveSide } from "@pitchlab/contracts";

export type AtomicShotOutcome =
  | LiveShot["outcome"]
  | "saved"
  | "on_target"
  | "blocked";

export type CanonicalShotBucket = "goal" | "on_target" | "blocked" | "miss";

export interface AtomicShotItem {
  readonly id?: string;
  readonly minute: number;
  readonly addedTime?: number | null;
  readonly side: LiveSide;
  readonly outcome: AtomicShotOutcome;
  readonly xg: number | null;
  readonly x: number | null;
  readonly y: number | null;
  readonly player?: string | null;
  readonly situation?: string | null;
}

export interface AtomicShotmapPitchProps {
  readonly shots: readonly AtomicShotItem[];
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly view?: "auto" | "full" | "half";
  readonly title?: string;
  readonly showEmpty?: boolean;
  readonly onSelectShot?: (shot: AtomicShotItem | null) => void;
  readonly className?: string;
}

type TeamFilter = "all" | "home" | "away";
type OutcomeFilter = "all" | CanonicalShotBucket;

export function normalizeShotBucket(outcome: AtomicShotOutcome): CanonicalShotBucket {
  if (outcome === "goal") return "goal";
  if (outcome === "save" || outcome === "saved" || outcome === "on_target") return "on_target";
  if (outcome === "block" || outcome === "blocked") return "blocked";
  return "miss";
}

export function computeShotRadius(xg: number | null | undefined): number {
  const safe = xg != null && Number.isFinite(xg) && xg > 0 ? xg : 0.05;
  const clamped = Math.max(0.015, Math.min(0.95, safe));
  return Math.round((4.3 + Math.sqrt(clamped) * 8.5) * 10) / 10;
}

const OUTCOME_LABEL_ES: Record<AtomicShotOutcome, string> = {
  goal: "Gol",
  save: "Atajado",
  saved: "Atajado",
  on_target: "A puerta",
  block: "Bloqueado",
  blocked: "Bloqueado",
  miss: "Fuera",
  post: "Al poste",
};

const BUCKET_PAINT_ORDER: Record<CanonicalShotBucket, number> = {
  miss: 0,
  blocked: 1,
  on_target: 2,
  goal: 3,
};

function clampCoord(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function formatShotMinute(shot: AtomicShotItem): string {
  return `${Math.round(shot.minute)}${shot.addedTime ? `+${shot.addedTime}` : ""}'`;
}

export function AtomicShotmapPitch({
  shots,
  homeLabel,
  awayLabel,
  view = "auto",
  title = "Mapa de tiros",
  showEmpty = false,
  onSelectShot,
  className = "",
}: AtomicShotmapPitchProps): React.JSX.Element | null {
  const uid = useId().replace(/:/g, "");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const summary = useMemo(() => {
    let homeXg = 0;
    let awayXg = 0;
    let homeCount = 0;
    let awayCount = 0;
    let homeGoals = 0;
    let awayGoals = 0;

    for (const s of shots) {
      const xgVal = s.xg != null && Number.isFinite(s.xg) && s.xg > 0 ? s.xg : 0;
      const isGoal = normalizeShotBucket(s.outcome) === "goal";
      if (s.side === "home") {
        homeXg += xgVal;
        homeCount += 1;
        if (isGoal) homeGoals += 1;
      } else {
        awayXg += xgVal;
        awayCount += 1;
        if (isGoal) awayGoals += 1;
      }
    }
    return { homeXg, awayXg, homeCount, awayCount, homeGoals, awayGoals };
  }, [shots]);

  const filteredShots = useMemo(() => {
    return shots.filter((s) => {
      if (teamFilter !== "all" && s.side !== teamFilter) return false;
      if (outcomeFilter !== "all" && normalizeShotBucket(s.outcome) !== outcomeFilter) return false;
      return true;
    });
  }, [shots, teamFilter, outcomeFilter]);

  const plottedShots = useMemo(() => {
    return filteredShots
      .map((shot, idx) => ({ shot, idx, bucket: normalizeShotBucket(shot.outcome) }))
      .filter(
        (item) =>
          item.shot.x != null &&
          item.shot.y != null &&
          Number.isFinite(item.shot.x) &&
          Number.isFinite(item.shot.y),
      )
      .sort((a, b) => BUCKET_PAINT_ORDER[a.bucket] - BUCKET_PAINT_ORDER[b.bucket]);
  }, [filteredShots]);

  const hasPlayers = useMemo(() => shots.some((s) => Boolean(s.player)), [shots]);

  if (shots.length === 0) {
    if (!showEmpty) return null;
    return (
      <section className={`pl-atom-shotmap pl-atom-card ${className}`.trim()} data-atomic-shotmap="empty">
        <p className="pl-atom-empty">Sin coordenadas de remates registradas para este partido.</p>
      </section>
    );
  }

  const effectiveView: "full" | "half" =
    view === "auto" ? (teamFilter === "all" ? "full" : "half") : view;

  const activeShot =
    selectedIdx !== null && selectedIdx < filteredShots.length ? filteredShots[selectedIdx]! : null;

  const selectShotIndex = (nextIdx: number | null) => {
    setSelectedIdx(nextIdx);
    const nextShot = nextIdx !== null && nextIdx < filteredShots.length ? filteredShots[nextIdx]! : null;
    onSelectShot?.(nextShot);
  };

  const fullW = 360;
  const fullH = 224;
  const fullPad = 10;
  const fullInnerW = fullW - fullPad * 2;
  const fullInnerH = fullH - fullPad * 2;

  const halfW = 320;
  const halfH = 216;
  const halfPad = 10;
  const halfInnerW = halfW - halfPad * 2;
  const halfInnerH = halfH - halfPad * 2;

  const projectPoint = (shot: AtomicShotItem): { cx: number; cy: number } => {
    const rawX = clampCoord(shot.x ?? 80);
    const rawY = clampCoord(shot.y ?? 50);

    if (effectiveView === "half") {
      const depth = Math.max(0, Math.min(50, 100 - rawX));
      const cy = halfPad + (depth / 50) * halfInnerH;
      const cx = halfPad + (rawY / 100) * halfInnerW;
      return { cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10 };
    }

    const normX = shot.side === "home" ? rawX : 100 - rawX;
    const normY = shot.side === "home" ? rawY : 100 - rawY;
    const cx = fullPad + (normX / 100) * fullInnerW;
    const cy = fullPad + (normY / 100) * fullInnerH;
    return { cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10 };
  };

  const renderShotMarkers = () =>
    plottedShots.map(({ shot, idx, bucket }) => {
      const { cx, cy } = projectPoint(shot);
      const r = computeShotRadius(shot.xg);
      const isSelected = selectedIdx === idx;
      const isPost = shot.outcome === "post";
      const teamName = shot.side === "home" ? homeLabel : awayLabel;
      const shotLabel = `${shot.player ?? teamName} · ${shot.minute}'${shot.xg != null ? ` · xG ${shot.xg.toFixed(2)}` : ""}`;
      const toggleSelection = () => selectShotIndex(isSelected ? null : idx);

      return (
        <g
          key={shot.id ?? `${shot.side}-${shot.minute}-${idx}`}
          role="button"
          tabIndex={0}
          aria-pressed={isSelected}
          aria-label={shotLabel}
          className={`pl-atom-shot pl-atom-shot--${shot.side} pl-atom-shot--${bucket}${isPost ? " is-post" : ""}${isSelected ? " is-selected" : ""}`}
          onClick={toggleSelection}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              toggleSelection();
            } else if (e.key === " ") {
              e.preventDefault();
            } else if (e.key === "Escape" && isSelected) {
              e.preventDefault();
              selectShotIndex(null);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " ") {
              toggleSelection();
            }
          }}
        >
          {isSelected ? <circle cx={cx} cy={cy} r={r + 4} className="pl-atom-shot-focus" /> : null}
          {bucket === "goal" ? (
            <circle cx={cx} cy={cy} r={r + 2.2} className="pl-atom-shot-goal-ring" />
          ) : null}
          <circle cx={cx} cy={cy} r={r} className="pl-atom-shot-dot" />
          {bucket === "goal" ? (
            <circle cx={cx} cy={cy} r={Math.max(1.8, r * 0.28)} className="pl-atom-shot-goal-core" />
          ) : null}
          {bucket === "blocked" ? (
            <path
              d={`M ${cx - 2.3} ${cy - 2.3} L ${cx + 2.3} ${cy + 2.3} M ${cx + 2.3} ${cy - 2.3} L ${cx - 2.3} ${cy + 2.3}`}
              className="pl-atom-shot-block-x"
            />
          ) : null}
        </g>
      );
    });

  const unplottedCount = filteredShots.length - plottedShots.length;

  return (
    <figure
      className={`pl-atom-shotmap pl-atom-card ${className}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-atomic-shotmap=""
      data-pitch-view={effectiveView}
    >
      <figcaption className="pl-atom-shotmap-head">
        <div className="pl-atom-shotmap-title-row">
          <span id={`${uid}-title`} className="pl-atom-title pl-atom-shotmap-title">
            {title}
          </span>
          <div
            className="pl-atom-shotmap-xg num"
            aria-label={`xG ${homeLabel} ${summary.homeXg.toFixed(2)} contra ${awayLabel} ${summary.awayXg.toFixed(2)}`}
          >
            <span className="pl-atom-team-dot is-home" aria-hidden="true" />
            <span className="pl-atom-shotmap-team">{homeLabel}</span>
            <strong>{summary.homeXg.toFixed(2)}</strong>
            <span className="pl-atom-sep" aria-hidden="true">
              vs
            </span>
            <strong>{summary.awayXg.toFixed(2)}</strong>
            <span className="pl-atom-shotmap-team">{awayLabel}</span>
            <span className="pl-atom-team-dot is-away" aria-hidden="true" />
          </div>
        </div>

        <div className="pl-atom-shotmap-controls">
          <div className="pl-atom-seg-group" role="group" aria-label="Filtrar tiros por equipo">
            {(
              [
                ["all", `Todos (${shots.length})`],
                ["home", `${homeLabel} (${summary.homeCount})`],
                ["away", `${awayLabel} (${summary.awayCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`pl-atom-seg-btn num${teamFilter === key ? " is-active" : ""}`}
                aria-pressed={teamFilter === key}
                onClick={() => {
                  setTeamFilter(key);
                  selectShotIndex(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pl-atom-seg-group" role="group" aria-label="Filtrar tiros por resultado">
            {(
              [
                ["all", "Todos"],
                ["goal", "Goles"],
                ["on_target", "A puerta"],
                ["blocked", "Bloq."],
                ["miss", "Fuera"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`pl-atom-seg-btn${outcomeFilter === key ? " is-active" : ""}`}
                aria-pressed={outcomeFilter === key}
                onClick={() => {
                  setOutcomeFilter(key);
                  selectShotIndex(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </figcaption>

      <div className="pl-atom-pitch-frame">
        {effectiveView === "full" ? (
          <svg
            viewBox={`0 0 ${fullW} ${fullH}`}
            className="pl-atom-pitch-svg"
            role="group"
            aria-label={`${title}: ${homeLabel} ${summary.homeCount} tiros (${summary.homeXg.toFixed(2)} xG), ${awayLabel} ${summary.awayCount} tiros (${summary.awayXg.toFixed(2)} xG).`}
          >
            <rect
              x={fullPad}
              y={fullPad}
              width={fullInnerW}
              height={fullInnerH}
              rx="8"
              className="pl-atom-pitch-grass"
            />
            <line
              x1={fullW / 2}
              y1={fullPad}
              x2={fullW / 2}
              y2={fullH - fullPad}
              className="pl-atom-pitch-line"
            />
            <circle cx={fullW / 2} cy={fullH / 2} r="28" className="pl-atom-pitch-line" />
            <circle cx={fullW / 2} cy={fullH / 2} r="2" className="pl-atom-pitch-spot" />

            <rect x={fullPad} y={fullH / 2 - 58} width="54" height="116" className="pl-atom-pitch-line" />
            <rect x={fullPad} y={fullH / 2 - 26} width="18" height="52" className="pl-atom-pitch-line" />
            <circle cx={fullPad + 36} cy={fullH / 2} r="1.8" className="pl-atom-pitch-spot" />
            <path
              d={`M ${fullPad + 54} ${fullH / 2 - 24} A 28 28 0 0 1 ${fullPad + 54} ${fullH / 2 + 24}`}
              className="pl-atom-pitch-line"
            />

            <rect x={fullW - fullPad - 54} y={fullH / 2 - 58} width="54" height="116" className="pl-atom-pitch-line" />
            <rect x={fullW - fullPad - 18} y={fullH / 2 - 26} width="18" height="52" className="pl-atom-pitch-line" />
            <circle cx={fullW - fullPad - 36} cy={fullH / 2} r="1.8" className="pl-atom-pitch-spot" />
            <path
              d={`M ${fullW - fullPad - 54} ${fullH / 2 - 24} A 28 28 0 0 0 ${fullW - fullPad - 54} ${fullH / 2 + 24}`}
              className="pl-atom-pitch-line"
            />

            <text x={fullPad + 8} y={fullH - fullPad - 6} className="pl-atom-pitch-hint">
              ← {awayLabel}
            </text>
            <text x={fullW - fullPad - 8} y={fullH - fullPad - 6} textAnchor="end" className="pl-atom-pitch-hint">
              {homeLabel} →
            </text>

            {renderShotMarkers()}
          </svg>
        ) : (
          <svg
            viewBox={`0 0 ${halfW} ${halfH}`}
            className="pl-atom-pitch-svg"
            role="group"
            aria-label={`${title} en media cancha (${teamFilter === "home" ? homeLabel : teamFilter === "away" ? awayLabel : `${homeLabel} y ${awayLabel}`}).`}
          >
            <rect
              x={halfPad}
              y={halfPad}
              width={halfInnerW}
              height={halfInnerH}
              rx="8"
              className="pl-atom-pitch-grass"
            />
            <rect x={halfW / 2 - 22} y={halfPad - 5} width="44" height="5" className="pl-atom-pitch-line" />
            <rect x={halfW / 2 - 88} y={halfPad} width="176" height="64" className="pl-atom-pitch-line" />
            <rect x={halfW / 2 - 42} y={halfPad} width="84" height="22" className="pl-atom-pitch-line" />
            <circle cx={halfW / 2} cy={halfPad + 44} r="2" className="pl-atom-pitch-spot" />
            <path
              d={`M ${halfW / 2 - 30} ${halfPad + 64} A 34 34 0 0 0 ${halfW / 2 + 30} ${halfPad + 64}`}
              className="pl-atom-pitch-line"
            />
            <path
              d={`M ${halfW / 2 - 38} ${halfH - halfPad} A 38 38 0 0 1 ${halfW / 2 + 38} ${halfH - halfPad}`}
              className="pl-atom-pitch-line"
            />

            {renderShotMarkers()}
          </svg>
        )}
      </div>

      <div className="pl-atom-shotmap-foot">
        {activeShot ? (
          <div className="pl-atom-shot-readout num" role="status" aria-live="polite">
            <strong>{formatShotMinute(activeShot)}</strong>
            <span>{activeShot.side === "home" ? homeLabel : awayLabel}</span>
            {activeShot.player ? <span>· {activeShot.player}</span> : null}
            <span>· {OUTCOME_LABEL_ES[activeShot.outcome]}</span>
            <span>· xG {activeShot.xg != null ? activeShot.xg.toFixed(2) : "—"}</span>
          </div>
        ) : (
          <div className="pl-atom-shot-legend" aria-hidden="true">
            <span className="pl-atom-legend-item">
              <span className="pl-atom-swatch is-goal" /> Gol
            </span>
            <span className="pl-atom-legend-item">
              <span className="pl-atom-swatch is-on-target" /> A puerta
            </span>
            <span className="pl-atom-legend-item">
              <span className="pl-atom-swatch is-blocked" /> Bloqueado
            </span>
            <span className="pl-atom-legend-item">
              <span className="pl-atom-swatch is-miss" /> Fuera / Poste
            </span>
            <span className="pl-atom-legend-hint">Tamaño = xG</span>
          </div>
        )}
        {unplottedCount > 0 ? (
          <span className="pl-atom-shot-note num">
            {unplottedCount}{" "}
            {unplottedCount === 1 ? "tiro sin coordenada en mapa" : "tiros sin coordenada en mapa"}
          </span>
        ) : null}
      </div>

      <details className="pl-atom-disclosure">
        <summary className="num">Ver tiros como tabla ({filteredShots.length})</summary>
        <div
          className="pl-atom-table-wrap"
          role="region"
          tabIndex={0}
          aria-labelledby={`${uid}-table-cap`}
        >
          <table className="pl-atom-table">
            <caption id={`${uid}-table-cap`} className="sr-only">
              Listado detallado de remates y xG de {homeLabel} contra {awayLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Min</th>
                <th scope="col">Equipo</th>
                {hasPlayers ? <th scope="col">Jugador</th> : null}
                <th scope="col">Resultado</th>
                <th scope="col" className="num">
                  xG
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredShots.map((shot, idx) => (
                <tr key={shot.id ?? `row-${shot.side}-${shot.minute}-${idx}`}>
                  <th scope="row" className="num">
                    {formatShotMinute(shot)}
                  </th>
                  <td data-label="Equipo">{shot.side === "home" ? homeLabel : awayLabel}</td>
                  {hasPlayers ? <td data-label="Jugador">{shot.player ?? "—"}</td> : null}
                  <td data-label="Resultado">{OUTCOME_LABEL_ES[shot.outcome]}</td>
                  <td className="num" data-label="xG">
                    {shot.xg != null && Number.isFinite(shot.xg) ? shot.xg.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
