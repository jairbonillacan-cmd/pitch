import React from "react";
import type { LiveShotmapSummary, LiveTeamStats } from "@pitchlab/contracts";

export interface LiveScoreTelemetryProps {
  readonly stats?: { readonly home: LiveTeamStats; readonly away: LiveTeamStats } | null;
  readonly shotmapSummary?: LiveShotmapSummary | null;
  readonly compact?: boolean;
}

function finiteNonNegativePair(
  homeRaw: number | null | undefined,
  awayRaw: number | null | undefined,
): readonly [number, number] | null {
  if (
    typeof homeRaw !== "number" ||
    !Number.isFinite(homeRaw) ||
    homeRaw < 0 ||
    typeof awayRaw !== "number" ||
    !Number.isFinite(awayRaw) ||
    awayRaw < 0
  ) {
    return null;
  }
  return [homeRaw, awayRaw];
}

function GoalpostTelemetryIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 20 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 11.5V3.5h15v8" />
    </svg>
  );
}

function PitchTelemetryIcon(): React.JSX.Element {
  return (
    <svg
      width="17"
      height="12"
      viewBox="0 0 20 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="17" height="11" rx="1" />
      <line x1="10" y1="1.5" x2="10" y2="12.5" />
      <circle cx="10" cy="7" r="2.1" />
      <path d="M1.5 4.2h2.7v5.6H1.5" />
      <path d="M18.5 4.2h-2.7v5.6h2.7" />
    </svg>
  );
}

export function LiveScoreTelemetry({
  stats,
  shotmapSummary,
  compact = false,
}: LiveScoreTelemetryProps): React.JSX.Element | null {
  const xgPair =
    finiteNonNegativePair(stats?.home.xg, stats?.away.xg) ??
    finiteNonNegativePair(shotmapSummary?.xgHome, shotmapSummary?.xgAway);
  const sotPair = finiteNonNegativePair(stats?.home.shotsOnTarget, stats?.away.shotsOnTarget);
  const rawPossPair = finiteNonNegativePair(stats?.home.possessionPct, stats?.away.possessionPct);
  const possPair =
    rawPossPair && rawPossPair[0] <= 100 && rawPossPair[1] <= 100 ? rawPossPair : null;

  if (!xgPair && !sotPair && !possPair) {
    return null;
  }

  return (
    <div
      className={`pl-live-telemetry${compact ? " is-compact" : ""}`}
      data-live-telemetry=""
      aria-label="Indicadores en vivo"
    >
      {xgPair ? (
        <div className="pl-live-telemetry-row num" data-telemetry-metric="xg">
          <span className="pl-live-telemetry-val is-home">{xgPair[0].toFixed(2)}</span>
          <span className="pl-live-telemetry-mid">
            <span className="pl-live-telemetry-label">xG</span>
          </span>
          <span className="pl-live-telemetry-val is-away">{xgPair[1].toFixed(2)}</span>
        </div>
      ) : null}

      {sotPair ? (
        <div className="pl-live-telemetry-row num" data-telemetry-metric="sot">
          <span className="pl-live-telemetry-val is-home">{Math.round(sotPair[0])}</span>
          <span className="pl-live-telemetry-mid" title="Tiros a puerta">
            <GoalpostTelemetryIcon />
            <span className="sr-only">Tiros a puerta</span>
          </span>
          <span className="pl-live-telemetry-val is-away">{Math.round(sotPair[1])}</span>
        </div>
      ) : null}

      {possPair ? (
        <div className="pl-live-telemetry-row num" data-telemetry-metric="possession">
          <span className="pl-live-telemetry-val is-home">{Math.round(possPair[0])}%</span>
          <span className="pl-live-telemetry-mid" title="Posesión">
            <PitchTelemetryIcon />
            <span className="sr-only">Posesión</span>
          </span>
          <span className="pl-live-telemetry-val is-away">{Math.round(possPair[1])}%</span>
        </div>
      ) : null}
    </div>
  );
}
