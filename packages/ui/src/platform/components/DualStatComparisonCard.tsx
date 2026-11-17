"use client";

import React from "react";

export interface DualStatComparisonCardProps {
  readonly label: string;
  readonly subtitle?: string;
  readonly badgeText?: string;
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly homeValueText: string;
  readonly awayValueText: string;
  readonly homeNumeric: number;
  readonly awayNumeric: number;
  readonly percentageScale?: boolean;
  readonly dataCountCard?: string;
  readonly footer?: React.ReactNode;
}

/**
 * Tarjeta comparativa de barras duales opuestas (Local `--pl-brand` vs Visita `--pl-accent`).
 * Diseñada para escaneo inmediato en 2 columnas en escritorio y 1 columna en móvil.
 */
export function DualStatComparisonCard({
  label,
  subtitle,
  badgeText,
  homeLabel,
  awayLabel,
  homeValueText,
  awayValueText,
  homeNumeric,
  awayNumeric,
  percentageScale = false,
  dataCountCard,
  footer,
}: DualStatComparisonCardProps): React.JSX.Element {
  const safeHome = Number.isFinite(homeNumeric) && homeNumeric > 0 ? homeNumeric : 0;
  const safeAway = Number.isFinite(awayNumeric) && awayNumeric > 0 ? awayNumeric : 0;
  const sum = safeHome + safeAway;
  const maxVal = Math.max(safeHome, safeAway, percentageScale ? 100 : 0) || 1;

  const homeBarPct = percentageScale
    ? Math.min(100, Math.round(safeHome))
    : sum > 0
      ? Math.min(100, Math.max(8, Math.round((safeHome / maxVal) * 100)))
      : 0;
  const awayBarPct = percentageScale
    ? Math.min(100, Math.round(safeAway))
    : sum > 0
      ? Math.min(100, Math.max(8, Math.round((safeAway / maxVal) * 100)))
      : 0;

  const homeLeads = safeHome > safeAway;
  const awayLeads = safeAway > safeHome;

  return (
    <article
      className="pl-dual-stat-card"
      {...(dataCountCard ? { "data-count-card": dataCountCard } : {})}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-xs sm:text-[13px] font-extrabold leading-snug">{label}</h3>
          {subtitle ? (
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              {subtitle}
            </span>
          ) : null}
        </div>
        {badgeText ? (
          <span className="pl-pill pl-pill--brand num text-[11px] shrink-0">{badgeText}</span>
        ) : null}
      </header>

      <div className="flex items-baseline justify-between gap-2 num">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <strong
            className="text-sm sm:text-base font-extrabold"
            data-lead={homeLeads ? "" : undefined}
            style={{ color: homeLeads ? "var(--pl-brand)" : "var(--pl-text)" }}
          >
            <span className="sr-only">{homeLabel}: </span>
            {homeValueText}
          </strong>
          <span className="text-[11px] truncate" style={{ color: "var(--pl-text-muted)" }}>
            {homeLabel}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5 min-w-0 text-right">
          <span className="text-[11px] truncate" style={{ color: "var(--pl-text-muted)" }}>
            {awayLabel}
          </span>
          <strong
            className="text-sm sm:text-base font-extrabold"
            data-lead={awayLeads ? "" : undefined}
            style={{ color: awayLeads ? "var(--pl-accent)" : "var(--pl-text)" }}
          >
            <span className="sr-only">{awayLabel}: </span>
            {awayValueText}
          </strong>
        </div>
      </div>

      {/* Barras duales opuestas desde el centro */}
      <div className="pl-dual-stat-tracks" aria-hidden="true">
        <div className="pl-dual-stat-half is-home">
          <span className="pl-dual-stat-fill is-home" style={{ width: `${homeBarPct}%` }} />
        </div>
        <div className="pl-dual-stat-half is-away">
          <span className="pl-dual-stat-fill is-away" style={{ width: `${awayBarPct}%` }} />
        </div>
      </div>

      {footer ? <div className="pt-1 space-y-1.5">{footer}</div> : null}
    </article>
  );
}
