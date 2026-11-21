"use client";

import React from "react";

export type LiveAsianPickState =
  | "won_full"
  | "won_half"
  | "push"
  | "lost_half"
  | "lost_full";

export type LivePickLineupAlert = "titular_en_banca" | null;

export const LIVE_ASIAN_STATE_LABEL_ES: Readonly<Record<LiveAsianPickState, string>> = {
  won_full: "Ganado completo",
  won_half: "Medio ganado",
  push: "Empate · Push",
  lost_half: "Medio perdido",
  lost_full: "Perdido",
};

export interface LivePickProgressBarProps {
  readonly pickLabel: string;
  readonly matchLabel: string;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction?: "over" | "under" | "handicap";
  readonly projectedFinal?: number | null;
  readonly asianState?: LiveAsianPickState | null;
  readonly starterAlert?: LivePickLineupAlert;
  readonly starterAlertDetail?: string | null;
  readonly compact?: boolean;
  readonly className?: string;
}

export type LiveProgressTone = "won" | "on_pace" | "push" | "warning" | "lost";

export interface LiveProgressMetrics {
  readonly actualPct: number;
  readonly targetPct: number;
  readonly projectedPct: number | null;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly tone: LiveProgressTone;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function formatNumericValue(value: number, signed = false): string {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = Number.isInteger(safe) ? String(safe) : safe.toFixed(2).replace(/0$/, "");
  if (signed && safe > 0) return `+${formatted}`;
  return formatted;
}

export function computeLiveProgressMetrics(opts: {
  readonly actualValue: number;
  readonly targetLine: number;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal?: number | null;
  readonly asianState?: LiveAsianPickState | null;
}): LiveProgressMetrics {
  const actual = Number.isFinite(opts.actualValue) ? opts.actualValue : 0;
  const target = Number.isFinite(opts.targetLine) ? opts.targetLine : 0;
  const projected =
    opts.projectedFinal != null && Number.isFinite(opts.projectedFinal)
      ? opts.projectedFinal
      : null;

  let tone: LiveProgressTone;
  if (opts.asianState === "won_full" || opts.asianState === "won_half") {
    tone = "won";
  } else if (opts.asianState === "push") {
    tone = "push";
  } else if (opts.asianState === "lost_half") {
    tone = "warning";
  } else if (opts.asianState === "lost_full") {
    tone = "lost";
  } else if (opts.direction === "under") {
    if (actual > target) tone = "lost";
    else if (actual === target) tone = "push";
    else if (projected !== null && projected > target) tone = "warning";
    else tone = "won";
  } else if (opts.direction === "handicap") {
    const adjusted = actual + target;
    if (adjusted > 0) tone = "won";
    else if (adjusted === 0) tone = "push";
    else if (projected !== null && projected + target > 0) tone = "on_pace";
    else tone = "lost";
  } else {
    if (actual > target) tone = "won";
    else if (actual === target) tone = "push";
    else if (projected !== null && projected > target) tone = "on_pace";
    else tone = "warning";
  }

  if (opts.direction === "handicap") {
    const requiredMargin = -target;
    const span = Math.max(
      Math.abs(actual),
      Math.abs(requiredMargin),
      projected !== null ? Math.abs(projected) : 0,
      2,
    ) * 1.2;
    const toPct = (val: number) => clampPct(((val + span) / (span * 2)) * 100);
    return {
      actualPct: toPct(actual),
      targetPct: toPct(requiredMargin),
      projectedPct: projected !== null ? toPct(projected) : null,
      scaleMin: -Math.round(span * 10) / 10,
      scaleMax: Math.round(span * 10) / 10,
      tone,
    };
  }

  const safeTarget = Math.max(0.5, target);
  const safeActual = Math.max(0, actual);
  const safeProj = projected !== null ? Math.max(0, projected) : null;
  const scaleMax = Math.max(safeTarget * 1.25, safeActual, safeProj ?? 0, 1);

  return {
    actualPct: clampPct((safeActual / scaleMax) * 100),
    targetPct: clampPct((safeTarget / scaleMax) * 100),
    projectedPct: safeProj !== null ? clampPct((safeProj / scaleMax) * 100) : null,
    scaleMin: 0,
    scaleMax: Math.round(scaleMax * 10) / 10,
    tone,
  };
}

export function LivePickProgressBar({
  pickLabel,
  matchLabel,
  clockLabel,
  actualValue,
  targetLine,
  unitLabel,
  direction = "over",
  projectedFinal = null,
  asianState = null,
  starterAlert = null,
  starterAlertDetail = null,
  compact = false,
  className = "",
}: LivePickProgressBarProps): React.JSX.Element {
  const safeActual = Number.isFinite(actualValue) ? actualValue : 0;
  const safeTarget = Number.isFinite(targetLine) ? targetLine : 0;
  const safeProjected =
    projectedFinal != null && Number.isFinite(projectedFinal) ? projectedFinal : null;

  const metrics = computeLiveProgressMetrics({
    actualValue: safeActual,
    targetLine: safeTarget,
    direction,
    projectedFinal: safeProjected,
    asianState,
  });

  const isHandicap = direction === "handicap";
  const actualText = formatNumericValue(safeActual, isHandicap);
  const targetText = formatNumericValue(safeTarget, isHandicap);
  const asianLabel = asianState ? LIVE_ASIAN_STATE_LABEL_ES[asianState] : null;
  const valueText = `${actualText} de ${targetText} ${unitLabel}${safeProjected !== null ? `, proyección ${formatNumericValue(safeProjected, isHandicap)} ${unitLabel}` : ""}${asianLabel ? `, estado ${asianLabel}` : ""}`;

  return (
    <article
      className={`pl-atom-livebar${compact ? " is-compact" : ""} ${className}`.trim()}
      data-atomic-livebar=""
      data-direction={direction}
      data-tone={metrics.tone}
      data-asian-state={asianState ?? undefined}
    >
      <div className="pl-atom-livebar-head">
        <div className="pl-atom-livebar-meta">
          <strong className="pl-atom-livebar-pick">{pickLabel}</strong>
          <span className="pl-atom-livebar-match">{matchLabel}</span>
        </div>
        <div className="pl-atom-livebar-badges num">
          <span className="pl-atom-livebar-clock">{clockLabel}</span>
          {asianState && asianLabel ? (
            <span
              className={`pl-atom-livebar-state is-${asianState}`}
              data-asian-state-badge={asianState}
            >
              {asianLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="pl-atom-livebar-meter-row num">
        <span className="pl-atom-livebar-ratio">
          <strong>{actualText}</strong>
          <span className="pl-atom-sep" aria-hidden="true">
            /
          </span>
          <span>{targetText}</span>
          <span className="pl-atom-livebar-unit">{unitLabel}</span>
        </span>
        {safeProjected !== null ? (
          <span className="pl-atom-livebar-proj" data-projected-final={safeProjected}>
            Proy. <strong>{formatNumericValue(safeProjected, isHandicap)}</strong> {unitLabel}
          </span>
        ) : null}
      </div>

      <div
        className="pl-atom-livebar-track"
        role="progressbar"
        aria-label={`Avance de ${pickLabel}`}
        aria-valuemin={metrics.scaleMin}
        aria-valuemax={metrics.scaleMax}
        aria-valuenow={safeActual}
        aria-valuetext={valueText}
      >
        <span
          className={`pl-atom-livebar-fill is-${metrics.tone}`}
          style={{ inlineSize: `${metrics.actualPct}%` }}
        />
        <span
          className="pl-atom-livebar-target-tick"
          style={{ insetInlineStart: `${metrics.targetPct}%` }}
          aria-hidden="true"
        />
        {metrics.projectedPct !== null ? (
          <span
            className="pl-atom-livebar-proj-tick"
            style={{ insetInlineStart: `${metrics.projectedPct}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {starterAlert === "titular_en_banca" ? (
        <div
          className="pl-atom-livebar-alert"
          role="status"
          data-starter-alert="titular_en_banca"
        >
          <strong className="pl-atom-livebar-alert-title">Titular en banca</strong>
          {starterAlertDetail && starterAlertDetail.trim().length > 0 ? (
            <span className="pl-atom-livebar-alert-detail">{starterAlertDetail.trim()}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
