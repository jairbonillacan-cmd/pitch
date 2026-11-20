"use client";

import React from "react";
import { formatOddsCaptureEs } from "@pitchlab/contracts";
import { formatOddsValue } from "../../access-guard";
import type { BookQuoteItem, OddsFormat } from "../../types";

export type OddsMovementKind = "steam" | "shortening" | "drifting" | "stable";

export interface OddsMovementInfo {
  readonly kind: OddsMovementKind;
  readonly label: string;
  readonly arrow: "↓↓" | "↓" | "↑" | "→";
  readonly deltaPct: number | null;
}

/**
 * Calcula el valor esperado porcentual `(p * cuotaCasa - 1) * 100` con 1 decimal.
 * Devuelve `null` si la cuota no es válida (`<= 1`).
 */
export function computeExpectedValuePct(
  probability: number,
  houseDecimal: number | null | undefined,
): number | null {
  if (
    !Number.isFinite(probability) ||
    houseDecimal == null ||
    !Number.isFinite(houseDecimal) ||
    houseDecimal <= 1
  ) {
    return null;
  }
  return Math.round((probability * houseDecimal - 1) * 1000) / 10;
}

/**
 * Clasifica el movimiento de línea entre apertura y cuota vigente (`Steam`, `Bajando`, `Subiendo`).
 * Sin números inventados: solo emite señal si hay delta real (`>= 0.01`) o dirección explícita.
 */
export function classifyOddsMovement(
  openingDecimal: number | null | undefined,
  currentDecimal: number | null | undefined,
  explicitDirection?: "shortening" | "drifting" | "stable" | null,
  explicitSignal?: "STEAM" | "SHORTENING" | "DRIFTING" | "STABLE" | null,
): OddsMovementInfo | null {
  const hasBoth =
    openingDecimal != null &&
    currentDecimal != null &&
    Number.isFinite(openingDecimal) &&
    Number.isFinite(currentDecimal) &&
    openingDecimal > 1 &&
    currentDecimal > 1;

  const deltaPct = hasBoth
    ? Math.round(((currentDecimal - openingDecimal) / openingDecimal) * 1000) / 10
    : null;

  if (explicitSignal === "STEAM" || (deltaPct !== null && deltaPct <= -6.0)) {
    return { kind: "steam", label: "Steam", arrow: "↓↓", deltaPct };
  }

  if (
    explicitSignal === "SHORTENING" ||
    explicitDirection === "shortening" ||
    (hasBoth && openingDecimal - currentDecimal >= 0.015)
  ) {
    return { kind: "shortening", label: "Bajando", arrow: "↓", deltaPct };
  }

  if (
    explicitSignal === "DRIFTING" ||
    explicitDirection === "drifting" ||
    (hasBoth && currentDecimal - openingDecimal >= 0.015)
  ) {
    return { kind: "drifting", label: "Subiendo", arrow: "↑", deltaPct };
  }

  return null;
}

export interface BookmakerComparePillProps {
  /** Probabilidad calibrada Spacetime del pick (0..1). */
  readonly probability: number;
  /** Momio justo del modelo (`1 / p`). */
  readonly fairDecimal: number;
  /** Mejor cuota vigente de casa (o cuota manual capturada). */
  readonly houseDecimal: number | null;
  /** Nombre visible de la casa (p. ej. `Pinnacle`, `Bet365`, `Codere`, `Tu momio`). */
  readonly houseBookLabel?: string | null;
  /** Momio de apertura para calcular movimiento de línea. */
  readonly openingDecimal?: number | null;
  /** Dirección explícita de movimiento si el payload ya la entrega. */
  readonly movementDirection?: "shortening" | "drifting" | "stable" | null;
  /** Señal explícita (`STEAM`, `SHORTENING`, `DRIFTING`, `STABLE`). */
  readonly movementSignal?: "STEAM" | "SHORTENING" | "DRIFTING" | "STABLE" | null;
  /** Captura UTC ISO para sello transparente de frescura. */
  readonly capturedAtUtc?: string | null;
  /** Cotizaciones multi-casa para píldoras rápidas de comparación. */
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly oddsFormat: OddsFormat;
  /** Variante de densidad visual. */
  readonly variant?: "box" | "inline" | "compact";
  /** Muestra prefijo `"Casa"` delante del valor en modo `inline` (compatibilidad MatchMarketsGrid). */
  readonly showCasaPrefix?: boolean;
  /** Muestra las mejores casas adicionales cuando hay `> 1` cotización. */
  readonly showMultiBookQuotes?: boolean;
  /** Muestra el sello de captura `<time dateTime=...>`. */
  readonly showCaptureStamp?: boolean;
  /** Ventaja ya calculada en puntos porcentuales (fallback si se desea). */
  readonly edgePtsOverride?: number | null;
}

/**
 * Comparativa editorial plana `Momio justo` vs mejor casa + insignia `Valor +X.X %`
 * + indicador de movimiento (`Steam` / `↓ Bajando` / `↑ Subiendo`).
 * 100 % tokens `--pl-*`, cifras tabulares `.num`, cero enlaces de afiliado.
 */
export function BookmakerComparePill({
  probability,
  fairDecimal,
  houseDecimal,
  houseBookLabel,
  openingDecimal,
  movementDirection,
  movementSignal,
  capturedAtUtc,
  bookQuotes,
  oddsFormat,
  variant = "box",
  showCasaPrefix = false,
  showMultiBookQuotes = false,
  showCaptureStamp = false,
  edgePtsOverride,
}: BookmakerComparePillProps): React.JSX.Element {
  const effectiveHouse =
    houseDecimal != null && Number.isFinite(houseDecimal) && houseDecimal > 1
      ? houseDecimal
      : null;

  // Resolver cuota de apertura desde prop explícita o desde la mejor cotización con openingDecimal
  const quoteWithOpening = bookQuotes?.find(
    (q) => q.openingDecimal != null && Number.isFinite(q.openingDecimal),
  );
  const effectiveOpen =
    openingDecimal != null && Number.isFinite(openingDecimal) && openingDecimal > 1
      ? openingDecimal
      : (quoteWithOpening?.openingDecimal ?? null);
  const effectiveDir = movementDirection ?? quoteWithOpening?.movementDirection ?? null;

  const valuePct = computeExpectedValuePct(probability, effectiveHouse);
  const edgePts =
    effectiveHouse !== null
      ? Math.round((probability - 1 / effectiveHouse) * 1000) / 10
      : (edgePtsOverride ?? null);

  const movement = classifyOddsMovement(
    effectiveOpen,
    effectiveHouse,
    effectiveDir,
    movementSignal,
  );

  const fairFormatted = formatOddsValue(fairDecimal, oddsFormat);
  const houseFormatted =
    effectiveHouse !== null ? formatOddsValue(effectiveHouse, oddsFormat) : null;
  const openFormatted =
    effectiveOpen !== null ? formatOddsValue(effectiveOpen, oddsFormat) : null;

  if (variant === "inline") {
    return (
      <span className="pl-bk-inline num" data-bookmaker-compare="inline">
        <span className="pl-mkt-row-fair num" title="Momio justo del modelo">
          Justo {fairFormatted}
        </span>

        {houseFormatted !== null ? (
          <span className="pl-mkt-row-fair num" data-market-house-quote="">
            {showCasaPrefix ? `Casa ${houseFormatted}` : `${houseBookLabel ?? "Casa"} ${houseFormatted}`}
            {effectiveOpen !== null &&
            effectiveHouse !== null &&
            Math.abs(effectiveOpen - effectiveHouse) >= 0.01 &&
            openFormatted ? (
              <>
                {" · Ap. "}
                {openFormatted}{" "}
                {movement?.kind === "steam" || movement?.kind === "shortening"
                  ? "↓"
                  : movement?.kind === "drifting"
                    ? "↑"
                    : "→"}
              </>
            ) : null}
            {showCaptureStamp && capturedAtUtc ? (
              <>
                {" · "}
                <time dateTime={capturedAtUtc} data-quote-captured="">
                  {houseBookLabel ? `${houseBookLabel} · ` : ""}
                  {formatOddsCaptureEs(capturedAtUtc)}
                </time>
              </>
            ) : null}
          </span>
        ) : null}

        {valuePct !== null && valuePct > 0 ? (
          <span
            className="pl-bk-ev-badge is-positive num"
            data-ev-positive="true"
            title="Valor esperado positivo frente al momio de casa"
          >
            Valor +{valuePct.toFixed(1)} %
          </span>
        ) : null}

        {movement && movement.kind !== "stable" ? (
          <span
            className={`pl-bk-move-chip is-${movement.kind} num`}
            data-line-movement={movement.kind}
            title={
              openFormatted
                ? `Apertura ${openFormatted} → Actual ${houseFormatted ?? "—"}`
                : `Movimiento de línea: ${movement.label}`
            }
          >
            {movement.kind === "steam" ? (
              <>
                <span aria-hidden="true">⚡</span> Steam
              </>
            ) : (
              <>
                {movement.arrow} {movement.label}
              </>
            )}
          </span>
        ) : null}

        {showMultiBookQuotes && bookQuotes && bookQuotes.length > 1 ? (
          <span className="inline-flex flex-wrap gap-1">
            {bookQuotes.slice(0, 3).map((q) => (
              <span
                key={q.book}
                className={`pl-pill text-[10px] num ${q.isBest ? "pl-pill--brand" : ""}`.trim()}
              >
                {q.bookLabel} {formatOddsValue(q.decimal, oddsFormat)}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      className={`pl-bk-pill ${variant === "compact" ? "is-compact" : ""} num`.trim()}
      data-bookmaker-compare={variant}
    >
      <div className="pl-bk-pill-top">
        <span className="pl-bk-pill-book">
          {effectiveHouse !== null ? (houseBookLabel ?? "Mejor casa") : "Momio justo"}
        </span>
        <strong className="pl-bk-pill-odds">
          {houseFormatted ?? fairFormatted}
        </strong>
      </div>

      <div className="pl-bk-pill-meta">
        <span className="pl-bk-pill-fair">
          {effectiveHouse !== null ? `Justo ${fairFormatted}` : "Sin cuota capturada"}
        </span>

        {valuePct !== null && valuePct > 0 ? (
          <span className="pl-bk-ev-badge is-positive" data-ev-positive="true">
            Valor +{valuePct.toFixed(1)} %
          </span>
        ) : edgePts !== null && edgePts > 0 ? (
          <span className="pl-bk-ev-badge is-positive">
            +{edgePts.toFixed(1)} pts
          </span>
        ) : null}
      </div>

      {movement && movement.kind !== "stable" ? (
        <div className="pl-bk-pill-move-row">
          <span
            className={`pl-bk-move-chip is-${movement.kind}`}
            data-line-movement={movement.kind}
          >
            {movement.kind === "steam"
              ? "↓↓ Steam"
              : `${movement.arrow} ${movement.label}`}
          </span>
          {openFormatted ? (
            <span className="pl-bk-open-ref">Ap. {openFormatted}</span>
          ) : null}
        </div>
      ) : null}

      {showMultiBookQuotes && bookQuotes && bookQuotes.length > 1 ? (
        <div className="pl-bk-quotes-strip" aria-label="Comparativa por casa">
          {bookQuotes.slice(0, 3).map((q) => (
            <span
              key={q.book}
              className={`pl-bk-quote-tag ${q.isBest ? "is-best" : ""}`.trim()}
            >
              <span>{q.bookLabel}</span>
              <strong>{formatOddsValue(q.decimal, oddsFormat)}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {showCaptureStamp && capturedAtUtc && effectiveHouse !== null ? (
        <time className="pl-bk-stamp" dateTime={capturedAtUtc} data-quote-captured="">
          {formatOddsCaptureEs(capturedAtUtc)}
        </time>
      ) : null}
    </div>
  );
}
