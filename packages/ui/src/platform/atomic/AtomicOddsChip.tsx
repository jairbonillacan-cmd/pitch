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

/**
 * Resuelve la dirección del movimiento de mercado entre cuota de apertura y cuota actual.
 * Una caída brusca (≥ 7 % o ≥ 0.18 en decimal) se señaliza como `steam` (`↓ Steam`).
 */
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
  /** Momio justo calculado por PitchLab (`1 / p`). Obligatorio por licencia/FD-16. */
  readonly fairDecimal: number;
  /** Cuota vigente de casa verificada (opcional). */
  readonly marketDecimal?: number | null;
  /** Cuota de apertura para detectar caída/subida o Steam (opcional). */
  readonly openingDecimal?: number | null;
  /** Dirección explícita si ya viene calculada desde el servidor. */
  readonly movement?: OddsMovementDirection | null;
  readonly oddsFormat?: OddsFormat;
  /** Etiqueta superior opcional (p. ej. "Momio justo" o nombre de selección). */
  readonly label?: string;
  /** Porcentaje de valor esperado positivo (`Valor +X.X %`). Solo se muestra si es > 0. */
  readonly valuePct?: number | null;
  readonly highlight?: boolean;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Chip compacto de cuota estilo Sofascore / PitchLab:
 * siempre anclado a `Momio justo`, con cuota de casa opcional y delta direccional (`↓`, `↑`, `Steam`) en `.num`.
 */
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

  return (
    <span
      className={`pl-atom-odds num${compact ? " is-compact" : ""}${highlight ? " is-highlight" : ""} ${className}`.trim()}
      data-atomic-odds=""
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
