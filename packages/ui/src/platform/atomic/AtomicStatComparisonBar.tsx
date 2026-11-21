"use client";

import React from "react";

export interface StatBarWidths {
  readonly homePct: number;
  readonly awayPct: number;
  readonly homeNegative: boolean;
  readonly awayNegative: boolean;
  readonly lead: "home" | "away" | "tie";
}

/**
 * Calcula anchos limpios [0..100] para barras comparativas pareadas (ADR-054):
 * - Porcentajes (`pct`): ancho directo sobre 100 %.
 * - Métricas con signo (`signed`, ej. `Goles evitados -0.54 vs -0.44`): escala sobre `max(|h|, |a|)`
 *   para que nunca se rendericen vacías por valores negativos, marcando `homeNegative`/`awayNegative`.
 * - Conteos/acumulados positivos: proporción directa `h / (h + a)` para lectura comparativa instantánea.
 */
export function computeStatBarWidths(
  home: number,
  away: number,
  opts?: { pct?: boolean; signed?: boolean },
): StatBarWidths {
  const h = Number.isFinite(home) ? home : 0;
  const a = Number.isFinite(away) ? away : 0;
  const lead: "home" | "away" | "tie" = h > a ? "home" : a > h ? "away" : "tie";
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
  /** Nombre legible de la métrica (p. ej. "Posesión", "xG", "Goles evitados"). */
  readonly label: string;
  readonly homeValue: number | null | undefined;
  readonly awayValue: number | null | undefined;
  readonly homeLabel?: string;
  readonly awayLabel?: string;
  /** Sobrescritura opcional del texto ya formateado. */
  readonly homeDisplay?: string;
  readonly awayDisplay?: string;
  readonly pct?: boolean;
  readonly signed?: boolean;
  readonly digits?: number;
  /** Variante visual: `default` (Match Center) o `compact` (tarjetas densas). */
  readonly variant?: "default" | "compact";
  /** Muestra los nombres de equipo sobre las cifras cuando el componente vive fuera de una tabla. */
  readonly showTeamLabels?: boolean;
  /** Cuando se renderiza dentro de un `<dl>` existente, emite `<dt>` y `<dd>` semánticos. */
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

/**
 * Barra comparativa plana editorial apoyada en `computeStatBarWidths`:
 * 100 % tokens `--pl-*`, cero gradientes, soporte completo para porcentajes,
 * conteos positivos y métricas negativas (`data-negative="true"`).
 */
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
  variant = "default",
  showTeamLabels = false,
  asDefinitionItem = false,
  className = "",
}: AtomicStatComparisonBarProps): React.JSX.Element {
  const hNum = homeValue != null && Number.isFinite(homeValue) ? homeValue : 0;
  const aNum = awayValue != null && Number.isFinite(awayValue) ? awayValue : 0;
  const bar = computeStatBarWidths(hNum, aNum, { pct, signed });

  const homeText = homeDisplay ?? formatStatValue(homeValue, { pct, digits });
  const awayText = awayDisplay ?? formatStatValue(awayValue, { pct, digits });

  const rowContent = (
    <>
      <span
        className="pl-live-stat-value pl-atom-stat-val num"
        data-lead={bar.lead === "home" ? "" : undefined}
      >
        <span className="sr-only">{homeLabel}: </span>
        {homeText}
      </span>
      <span className="pl-live-stat-track pl-live-stat-track--home pl-atom-stat-track pl-atom-stat-track--home" aria-hidden="true">
        <span
          data-lead={bar.lead === "home" ? "true" : undefined}
          data-negative={bar.homeNegative ? "true" : undefined}
          style={{ inlineSize: `${bar.homePct}%` }}
        />
      </span>
      <span className="pl-live-stat-track pl-live-stat-track--away pl-atom-stat-track pl-atom-stat-track--away" aria-hidden="true">
        <span
          data-lead={bar.lead === "away" ? "true" : undefined}
          data-negative={bar.awayNegative ? "true" : undefined}
          style={{ inlineSize: `${bar.awayPct}%` }}
        />
      </span>
      <span
        className="pl-live-stat-value pl-atom-stat-val num"
        data-lead={bar.lead === "away" ? "" : undefined}
      >
        <span className="sr-only">{awayLabel}: </span>
        {awayText}
      </span>
    </>
  );

  if (asDefinitionItem) {
    return (
      <div
        className={`pl-live-stat pl-atom-stat pl-atom-stat--${variant} ${className}`.trim()}
        data-atomic-stat=""
      >
        <dt className="pl-atom-stat-label">{label}</dt>
        <dd className="pl-atom-stat-row">{rowContent}</dd>
      </div>
    );
  }

  return (
    <div
      className={`pl-atom-stat pl-atom-stat--${variant} ${className}`.trim()}
      data-atomic-stat=""
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
