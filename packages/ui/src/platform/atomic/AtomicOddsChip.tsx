"use client";

import React from "react";
import { formatOddsValue } from "../access-guard";
import type { OddsFormat } from "../types";

export type OddsMovementDirection = "shortening" | "drifting" | "steam" | "stable";

export interface ResolvedOddsMovement {
  readonly direction: OddsMovementDirection;
  readonly symbol: "↓" | "↑" | null;
  readonly tag: string | null;
  readonly ariaLabel: string | null;
}

export function resolveOddsMovement(opts: {
  readonly marketDecimal?: number | null;
  readonly openingDecimal?: number | null;
  readonly movement?: OddsMovementDirection | null;
}): ResolvedOddsMovement {
  if (opts.movement === "steam") {
    return {
      direction: "steam",
      symbol: "↓",
      tag: "Steam",
      ariaLabel: "Movimiento fuerte a la baja (Steam)",
    };
  }
  if (opts.movement === "shortening") {
    return {
      direction: "shortening",
      symbol: "↓",
      tag: null,
      ariaLabel: "Cuota bajando",
    };
  }
  if (opts.movement === "drifting") {
    return {
      direction: "drifting",
      symbol: "↑",
      tag: null,
      ariaLabel: "Cuota subiendo",
    };
  }

  const cur = opts.marketDecimal;
  const open = opts.openingDecimal;
  if (
    cur != null &&
    open != null &&
    Number.isFinite(cur) &&
    Number.isFinite(open) &&
    cur > 1 &&
    open > 1
  ) {
    const diff = cur - open;
    const relDrop = (open - cur) / open;
    if (relDrop >= 0.07 || open - cur >= 0.18) {
      return {
        direction: "steam",
        symbol: "↓",
        tag: "Steam",
        ariaLabel: "Movimiento fuerte a la baja (Steam)",
      };
    }
    if (diff <= -0.03) {
      return {
        direction: "shortening",
        symbol: "↓",
        tag: null,
        ariaLabel: "Cuota bajando",
      };
    }
    if (diff >= 0.03) {
      return {
        direction: "drifting",
        symbol: "↑",
        tag: null,
        ariaLabel: "Cuota subiendo",
      };
    }
  }

  return { direction: "stable", symbol: null, tag: null, ariaLabel: null };
}

export interface AtomicOddsChipProps {
  readonly fairDecimal: number;
  readonly marketDecimal?: number | null;
  readonly openingDecimal?: number | null;
  readonly movement?: OddsMovementDirection | null;
  readonly oddsFormat?: OddsFormat;
  readonly label?: string;
  readonly valuePct?: number | null;
  readonly highlight?: boolean;
  readonly compact?: boolean;
  readonly variant?: "chip" | "cell";
  readonly className?: string;
}

interface CellIndicator {
  readonly key: string;
  readonly className: string;
  readonly text: string;
  readonly symbol?: string;
  readonly ariaLabel?: string;
}

export function AtomicOddsChip({
  fairDecimal,
  marketDecimal = null,
  openingDecimal = null,
  movement = null,
  oddsFormat = "decimal",
  label,
  valuePct = null,
  highlight = false,
  compact = false,
  variant = "chip",
  className = "",
}: AtomicOddsChipProps): React.JSX.Element {
  const safeFair = Number.isFinite(fairDecimal) && fairDecimal > 1 ? fairDecimal : 1.02;
  const hasMarket = marketDecimal != null && Number.isFinite(marketDecimal) && marketDecimal > 1;
  const resolved = resolveOddsMovement({
    marketDecimal: hasMarket ? marketDecimal : null,
    openingDecimal,
    movement,
  });

  const fairFormatted = formatOddsValue(safeFair, oddsFormat);
  const marketFormatted = hasMarket ? formatOddsValue(marketDecimal!, oddsFormat) : null;
  const showValue = valuePct != null && Number.isFinite(valuePct) && valuePct > 0.4;

  if (variant === "cell") {
    const indicators: CellIndicator[] = [];
    if (showValue) {
      indicators.push({
        key: "ev",
        className: "pl-atom-odds-value",
        text: `+${valuePct!.toFixed(1)}%`,
        ariaLabel: `Valor positivo +${valuePct!.toFixed(1)} por ciento`,
      });
    }
    if (resolved.symbol) {
      indicators.push({
        key: "movement",
        className: `pl-atom-odds-delta is-${resolved.direction}`,
        symbol: resolved.symbol,
        text: resolved.tag ?? "",
        ariaLabel: resolved.ariaLabel ?? undefined,
      });
    }
    const cappedIndicators = indicators.slice(0, 2);

    return (
      <span
        className={`pl-atom-odds pl-atom-odds--cell num${compact ? " is-compact" : ""}${highlight ? " is-highlight" : ""} ${className}`.trim()}
        data-atomic-odds=""
        data-variant="cell"
        data-movement={resolved.direction}
        data-indicator-count={cappedIndicators.length}
      >
        {label ? <span className="pl-atom-odds-label">{label}</span> : null}
        <span className="pl-atom-odds-cell-main">
          <strong className="pl-atom-odds-cell-primary">
            {marketFormatted ?? fairFormatted}
          </strong>
          {cappedIndicators.length > 0 ? (
            <span className="pl-atom-odds-cell-indicators">
              {cappedIndicators.map((ind) => (
                <span key={ind.key} className={ind.className} aria-label={ind.ariaLabel}>
                  {ind.symbol ? <span aria-hidden="true">{ind.symbol}</span> : null}
                  {ind.text ? <span>{ind.text}</span> : null}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="pl-atom-odds-cell-fair">
          {marketFormatted ? `Justo ${fairFormatted}` : "Momio justo"}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`pl-atom-odds pl-atom-odds--chip num${compact ? " is-compact" : ""}${highlight ? " is-highlight" : ""} ${className}`.trim()}
      data-atomic-odds=""
      data-variant="chip"
      data-movement={resolved.direction}
    >
      {label ? <span className="pl-atom-odds-label">{label}</span> : null}

      <span className="pl-atom-odds-row">
        <span className="pl-atom-odds-fair">
          <span className="pl-atom-odds-kicker">Momio justo</span>
          <strong>{fairFormatted}</strong>
        </span>

        {marketFormatted ? (
          <span className="pl-atom-odds-market">
            <span className="pl-atom-odds-kicker">Casa</span>
            <strong>{marketFormatted}</strong>
            {resolved.symbol ? (
              <span
                className={`pl-atom-odds-delta is-${resolved.direction}`}
                aria-label={resolved.ariaLabel ?? undefined}
              >
                <span aria-hidden="true">{resolved.symbol}</span>
                {resolved.tag ? <span>{resolved.tag}</span> : null}
              </span>
            ) : null}
          </span>
        ) : resolved.symbol ? (
          <span
            className={`pl-atom-odds-delta is-${resolved.direction}`}
            aria-label={resolved.ariaLabel ?? undefined}
          >
            <span aria-hidden="true">{resolved.symbol}</span>
            {resolved.tag ? <span>{resolved.tag}</span> : null}
          </span>
        ) : null}

        {showValue ? (
          <span className="pl-atom-odds-value">
            Valor +{valuePct!.toFixed(1)} %
          </span>
        ) : null}
      </span>
    </span>
  );
}
