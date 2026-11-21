"use client";

import React from "react";

export interface StatBarWidths {
  readonly homePct: number;
  readonly awayPct: number;
  readonly homeNegative: boolean;
  readonly awayNegative: boolean;
  readonly lead: "home" | "away" | "tie";
}

export function computeStatBarWidths(
  home: number,
  away: number,
  opts?: { pct?: boolean; signed?: boolean; lowerIsBetter?: boolean },
): StatBarWidths {
  const h = Number.isFinite(home) ? home : 0;
  const a = Number.isFinite(away) ? away : 0;
  const lead: "home" | "away" | "tie" = opts?.lowerIsBetter
    ? h < a
      ? "home"
      : a < h
        ? "away"
        : "tie"
    : h > a
      ? "home"
      : a > h
        ? "away"
        : "tie";
  const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

  if (opts?.pct) {
    return {
      homePct: clampPct(h),
      awayPct: clampPct(a),
      homeNegative: false,
      awayNegative: false,
      lead,
    };
  }

  if (opts?.signed || h < 0 || a < 0) {
    const maxAbs = Math.max(Math.abs(h), Math.abs(a));
    if (maxAbs <= 0) {
      return { homePct: 0, awayPct: 0, homeNegative: false, awayNegative: false, lead: "tie" };
    }
    return {
      homePct: clampPct((Math.abs(h) / maxAbs) * 100),
      awayPct: clampPct((Math.abs(a) / maxAbs) * 100),
      homeNegative: h < 0,
      awayNegative: a < 0,
      lead,
    };
  }

  const total = h + a;
  if (total <= 0) {
    return { homePct: 0, awayPct: 0, homeNegative: false, awayNegative: false, lead: "tie" };
  }
  return {
    homePct: clampPct((h / total) * 100),
    awayPct: clampPct((a / total) * 100),
    homeNegative: false,
    awayNegative: false,
    lead,
  };
}

export interface AtomicStatComparisonBarProps {
  readonly label: string;
  readonly homeValue: number | null | undefined;
  readonly awayValue: number | null | undefined;
  readonly homeLabel?: string;
  readonly awayLabel?: string;
  readonly homeDisplay?: string;
  readonly awayDisplay?: string;
  readonly pct?: boolean;
  readonly signed?: boolean;
  readonly digits?: number;
  readonly lowerIsBetter?: boolean;
  readonly rankA?: number | null;
  readonly rankB?: number | null;
  readonly variant?: "default" | "compact";
  readonly showTeamLabels?: boolean;
  readonly asDefinitionItem?: boolean;
  readonly className?: string;
}

function formatStatValue(
  value: number | null | undefined,
  opts: { pct?: boolean; digits?: number },
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (opts.pct) return `${Math.round(value)} %`;
  if (opts.digits !== undefined) return value.toFixed(opts.digits);
  return String(Math.round(value));
}

function normalizeOrdinalRank(rank: number | null | undefined): number | null {
  if (rank == null || !Number.isFinite(rank)) return null;
  const rounded = Math.round(rank);
  return rounded > 0 ? rounded : null;
}

export function AtomicStatComparisonBar({
  label,
  homeValue,
  awayValue,
  homeLabel = "Local",
  awayLabel = "Visita",
  homeDisplay,
  awayDisplay,
  pct,
  signed,
  digits,
  lowerIsBetter = false,
  rankA = null,
  rankB = null,
  variant = "default",
  showTeamLabels = false,
  asDefinitionItem = false,
  className = "",
}: AtomicStatComparisonBarProps): React.JSX.Element {
  const hNum = homeValue != null && Number.isFinite(homeValue) ? homeValue : 0;
  const aNum = awayValue != null && Number.isFinite(awayValue) ? awayValue : 0;
  const bar = computeStatBarWidths(hNum, aNum, { pct, signed, lowerIsBetter });

  const homeText = homeDisplay ?? formatStatValue(homeValue, { pct, digits });
  const awayText = awayDisplay ?? formatStatValue(awayValue, { pct, digits });
  const resolvedRankA = normalizeOrdinalRank(rankA);
  const resolvedRankB = normalizeOrdinalRank(rankB);
  const hasRanks = resolvedRankA !== null || resolvedRankB !== null;

  const rowContent = (
    <>
      <span
        className={`pl-live-stat-value pl-atom-stat-val num${hasRanks ? " has-rank" : ""}`}
        data-lead={bar.lead === "home" ? "" : undefined}
      >
        <span className="sr-only">{homeLabel}: </span>
        <span>{homeText}</span>
        {resolvedRankA !== null ? (
          <span
            className="pl-atom-stat-rank num"
            data-rank={resolvedRankA}
            aria-label={`Puesto ${resolvedRankA} de liga`}
          >
            {`${resolvedRankA}.º`}
          </span>
        ) : null}
      </span>
      <span
        className="pl-live-stat-track pl-live-stat-track--home pl-atom-stat-track pl-atom-stat-track--home"
        aria-hidden="true"
      >
        <span
          data-lead={bar.lead === "home" ? "true" : undefined}
          data-negative={bar.homeNegative ? "true" : undefined}
          style={{ inlineSize: `${bar.homePct}%` }}
        />
      </span>
      <span
        className="pl-live-stat-track pl-live-stat-track--away pl-atom-stat-track pl-atom-stat-track--away"
        aria-hidden="true"
      >
        <span
          data-lead={bar.lead === "away" ? "true" : undefined}
          data-negative={bar.awayNegative ? "true" : undefined}
          style={{ inlineSize: `${bar.awayPct}%` }}
        />
      </span>
      <span
        className={`pl-live-stat-value pl-atom-stat-val pl-atom-stat-val--away num${hasRanks ? " has-rank" : ""}`}
        data-lead={bar.lead === "away" ? "" : undefined}
      >
        <span className="sr-only">{awayLabel}: </span>
        <span>{awayText}</span>
        {resolvedRankB !== null ? (
          <span
            className="pl-atom-stat-rank num"
            data-rank={resolvedRankB}
            aria-label={`Puesto ${resolvedRankB} de liga`}
          >
            {`${resolvedRankB}.º`}
          </span>
        ) : null}
      </span>
    </>
  );

  const rootClassName = `pl-atom-stat pl-atom-stat--${variant}${hasRanks ? " has-ranks" : ""} ${className}`.trim();

  if (asDefinitionItem) {
    return (
      <div
        className={`pl-live-stat ${rootClassName}`.trim()}
        data-atomic-stat=""
        data-lower-is-better={lowerIsBetter ? "true" : undefined}
      >
        <dt className="pl-atom-stat-label">{label}</dt>
        <dd className="pl-atom-stat-row">{rowContent}</dd>
      </div>
    );
  }

  return (
    <div
      className={rootClassName}
      data-atomic-stat=""
      data-lower-is-better={lowerIsBetter ? "true" : undefined}
    >
      {showTeamLabels ? (
        <div className="pl-atom-stat-teams">
          <span className="truncate">{homeLabel}</span>
          <span className="pl-atom-stat-label">{label}</span>
          <span className="truncate text-right">{awayLabel}</span>
        </div>
      ) : label ? (
        <span className="pl-atom-stat-label">{label}</span>
      ) : null}
      <div className="pl-atom-stat-row">{rowContent}</div>
    </div>
  );
}
