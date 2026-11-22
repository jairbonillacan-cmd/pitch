"use client";

import React from "react";
import {
  formatOddsCaptureEs,
  isBlockedMarketQuoteBook,
  isSafePublicLabel,
} from "@pitchlab/contracts";
import { formatOddsValue } from "../../access-guard";
import { useOptionalPlatformCore } from "../../platform-provider";
import type { BookQuoteItem, OddsFormat } from "../../types";

const MAX_QUOTE_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 6 * 60 * 60 * 1000;
const MAX_AUDITABLE_EV_PCT = 20;
const MAX_AUDITABLE_EDGE_PTS = 15;

function isFreshQuoteTimestamp(
  capturedAtUtc: string | null | undefined,
  anchorMs: number | null,
): boolean {
  if (anchorMs !== null) {
    if (!capturedAtUtc) return false;
    const ms = Date.parse(capturedAtUtc);
    if (!Number.isFinite(ms)) return false;
    const ageMs = anchorMs - ms;
    return ageMs >= -MAX_FUTURE_SKEW_MS && ageMs <= MAX_QUOTE_AGE_MS;
  }
  if (!capturedAtUtc) return true;
  return Number.isFinite(Date.parse(capturedAtUtc));
}

function isAllowedHouseBookLabel(label: string | null | undefined): boolean {
  if (label == null || label.trim().length === 0) return true;
  const trimmed = label.trim();
  return isSafePublicLabel(trimmed) && !isBlockedMarketQuoteBook(trimmed, trimmed);
}

export type OddsMovementKind = "steam" | "shortening" | "drifting" | "stable";

export interface OddsMovementInfo {
  readonly kind: OddsMovementKind;
  readonly label: string;
  readonly arrow: "↓↓" | "↓" | "↑" | "→";
  readonly deltaPct: number | null;
}

export function computeExpectedValuePct(
  probability: number,
  houseDecimal: number | null | undefined,
): number | null {
  if (
    !Number.isFinite(probability) ||
    probability <= 0.005 ||
    probability >= 0.995 ||
    houseDecimal == null ||
    !Number.isFinite(houseDecimal) ||
    houseDecimal <= 1.01
  ) {
    return null;
  }
  return Math.round((probability * houseDecimal - 1) * 1000) / 10;
}

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
  readonly probability: number;
  readonly fairDecimal: number;
  readonly houseDecimal: number | null;
  readonly houseBookLabel?: string | null;
  readonly openingDecimal?: number | null;
  readonly movementDirection?: "shortening" | "drifting" | "stable" | null;
  readonly movementSignal?: "STEAM" | "SHORTENING" | "DRIFTING" | "STABLE" | null;
  readonly capturedAtUtc?: string | null;
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly oddsFormat: OddsFormat;
  readonly variant?: "box" | "inline" | "compact";
  readonly showCasaPrefix?: boolean;
  readonly showMultiBookQuotes?: boolean;
  readonly showCaptureStamp?: boolean;
  readonly edgePtsOverride?: number | null;
  readonly referenceNowUtc?: string | null;
}

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
  referenceNowUtc,
}: BookmakerComparePillProps): React.JSX.Element {
  const platformCore = useOptionalPlatformCore();
  const resolvedAnchorUtc =
    referenceNowUtc ?? platformCore?.dataset.serverNowUtc ?? platformCore?.dataset.generatedAt ?? null;
  const parsedAnchorMs = resolvedAnchorUtc ? Date.parse(resolvedAnchorUtc) : Number.NaN;
  const anchorMs = Number.isFinite(parsedAnchorMs) ? parsedAnchorMs : null;

  const hasValidSpacetimeAnchor =
    Number.isFinite(probability) &&
    probability > 0.005 &&
    probability < 0.995 &&
    Number.isFinite(fairDecimal) &&
    fairDecimal > 1.01;

  const safeBookQuotes = hasValidSpacetimeAnchor
    ? (bookQuotes ?? []).filter(
        (q) =>
          Number.isFinite(q.decimal) &&
          q.decimal > 1.01 &&
          !isBlockedMarketQuoteBook(q.book, q.bookLabel) &&
          isFreshQuoteTimestamp(q.capturedAtUtc, anchorMs),
      )
    : [];

  const houseAllowed =
    hasValidSpacetimeAnchor &&
    isAllowedHouseBookLabel(houseBookLabel) &&
    isFreshQuoteTimestamp(capturedAtUtc, anchorMs);

  const effectiveHouse =
    houseAllowed && houseDecimal != null && Number.isFinite(houseDecimal) && houseDecimal > 1.01
      ? houseDecimal
      : null;

  const quoteWithOpening = safeBookQuotes.find(
    (q) => q.openingDecimal != null && Number.isFinite(q.openingDecimal),
  );
  const effectiveOpen =
    effectiveHouse !== null &&
    openingDecimal != null &&
    Number.isFinite(openingDecimal) &&
    openingDecimal > 1.01
      ? openingDecimal
      : effectiveHouse !== null
        ? (quoteWithOpening?.openingDecimal ?? null)
        : null;
  const effectiveDir =
    effectiveHouse !== null
      ? (movementDirection ?? quoteWithOpening?.movementDirection ?? null)
      : null;

  const valuePct = hasValidSpacetimeAnchor
    ? computeExpectedValuePct(probability, effectiveHouse)
    : null;
  const edgePts = !hasValidSpacetimeAnchor
    ? null
    : effectiveHouse !== null
      ? Math.round((probability - 1 / effectiveHouse) * 1000) / 10
      : (edgePtsOverride ?? null);

  const isOutlierEv = valuePct !== null && valuePct > MAX_AUDITABLE_EV_PCT;
  const auditablePositiveEv =
    valuePct !== null && valuePct > 0 && !isOutlierEv ? valuePct : null;
  const isOutlierEdgePts =
    !isOutlierEv &&
    valuePct === null &&
    edgePts !== null &&
    edgePts > MAX_AUDITABLE_EDGE_PTS;
  const auditablePositiveEdgePts =
    !isOutlierEv &&
    edgePts !== null &&
    edgePts > 0 &&
    edgePts <= MAX_AUDITABLE_EDGE_PTS
      ? edgePts
      : null;

  const movement =
    effectiveHouse !== null
      ? classifyOddsMovement(effectiveOpen, effectiveHouse, effectiveDir, movementSignal)
      : null;

  const fairFormatted = hasValidSpacetimeAnchor
    ? formatOddsValue(fairDecimal, oddsFormat)
    : "—";
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
            {showCasaPrefix
              ? `Casa ${houseFormatted}`
              : `${houseBookLabel ?? "Casa"} ${houseFormatted}`}
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

        {auditablePositiveEv !== null ? (
          <span
            className="pl-bk-ev-badge is-positive num"
            data-ev-positive="true"
            title="Valor esperado positivo frente al momio de casa"
          >
            Valor +{auditablePositiveEv.toFixed(1)} %
          </span>
        ) : isOutlierEv ? (
          <span
            className="pl-bk-ev-badge is-neutral num"
            data-ev-outlier="true"
            title="Divergencia atípica entre el modelo y la cuota capturada; verifica la línea antes de jugar"
          >
            Divergencia
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
            {movement.kind === "steam"
              ? "↓↓ Steam"
              : `${movement.arrow} ${movement.label}`}
          </span>
        ) : null}

        {showMultiBookQuotes && safeBookQuotes.length > 1 ? (
          <span className="inline-flex flex-wrap gap-1">
            {safeBookQuotes.slice(0, 3).map((q) => (
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

        {auditablePositiveEv !== null ? (
          <span className="pl-bk-ev-badge is-positive" data-ev-positive="true">
            Valor +{auditablePositiveEv.toFixed(1)} %
          </span>
        ) : isOutlierEv || isOutlierEdgePts ? (
          <span
            className="pl-bk-ev-badge is-neutral"
            data-ev-outlier="true"
            title="Divergencia atípica entre el modelo y la cuota capturada; verifica la línea antes de jugar"
          >
            Divergencia
          </span>
        ) : auditablePositiveEdgePts !== null ? (
          <span className="pl-bk-ev-badge is-positive">
            +{auditablePositiveEdgePts.toFixed(1)} pts
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

      {showMultiBookQuotes && safeBookQuotes.length > 1 ? (
        <div className="pl-bk-quotes-strip" aria-label="Comparativa por casa">
          {safeBookQuotes.slice(0, 3).map((q) => (
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
