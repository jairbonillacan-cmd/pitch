"use client";

import React from "react";
import type { PlatformSport } from "@pitchlab/contracts";

export type AtomicFormOutcome = "win" | "draw" | "loss";
export type AtomicFormNotation = "auto" | "es" | "us";

export interface AtomicFormEntry {
  readonly outcome: AtomicFormOutcome;
  readonly glyph: "G" | "E" | "P" | "W" | "L" | "T";
  readonly spoken: string;
  readonly tooltip?: string | null;
}

const US_SPORTS: ReadonlySet<PlatformSport> = new Set([
  "american-football",
  "basketball",
  "baseball",
  "ice-hockey",
]);

function resolveNotation(
  notation: AtomicFormNotation,
  sport?: PlatformSport,
): "es" | "us" {
  if (notation === "es" || notation === "us") return notation;
  if (sport && US_SPORTS.has(sport)) return "us";
  return "es";
}

function outcomeToEntry(
  outcome: AtomicFormOutcome,
  resolved: "es" | "us",
  tooltip?: string | null,
): AtomicFormEntry {
  const cleanTooltip =
    typeof tooltip === "string" && tooltip.trim().length > 0 ? tooltip.trim() : null;
  if (resolved === "us") {
    if (outcome === "win") {
      return cleanTooltip
        ? { outcome, glyph: "W", spoken: "Victoria", tooltip: cleanTooltip }
        : { outcome, glyph: "W", spoken: "Victoria" };
    }
    if (outcome === "draw") {
      return cleanTooltip
        ? { outcome, glyph: "T", spoken: "Empate", tooltip: cleanTooltip }
        : { outcome, glyph: "T", spoken: "Empate" };
    }
    return cleanTooltip
      ? { outcome, glyph: "L", spoken: "Derrota", tooltip: cleanTooltip }
      : { outcome, glyph: "L", spoken: "Derrota" };
  }
  if (outcome === "win") {
    return cleanTooltip
      ? { outcome, glyph: "G", spoken: "Ganó", tooltip: cleanTooltip }
      : { outcome, glyph: "G", spoken: "Ganó" };
  }
  if (outcome === "draw") {
    return cleanTooltip
      ? { outcome, glyph: "E", spoken: "Empató", tooltip: cleanTooltip }
      : { outcome, glyph: "E", spoken: "Empató" };
  }
  return cleanTooltip
    ? { outcome, glyph: "P", spoken: "Perdió", tooltip: cleanTooltip }
    : { outcome, glyph: "P", spoken: "Perdió" };
}

export function parseAtomicForm(
  form: string | readonly string[] | null | undefined,
  opts?: {
    readonly notation?: AtomicFormNotation;
    readonly sport?: PlatformSport;
    readonly max?: number;
    readonly tooltips?: readonly string[];
  },
): AtomicFormEntry[] {
  const resolved = resolveNotation(opts?.notation ?? "auto", opts?.sport);
  const max = opts?.max ?? 5;

  let tokens: string[];
  if (Array.isArray(form)) {
    tokens = form.map((item) => String(item).trim().toUpperCase());
  } else if (typeof form === "string") {
    const head = form.split("·")[0] ?? "";
    tokens = head.toUpperCase().match(/[GEPWDLT]/g) ?? [];
  } else {
    tokens = [];
  }

  const outcomes: AtomicFormOutcome[] = [];
  for (const ch of tokens) {
    if (ch === "G" || ch === "W") outcomes.push("win");
    else if (ch === "E" || ch === "D" || ch === "T") outcomes.push("draw");
    else if (ch === "P" || ch === "L") outcomes.push("loss");
  }

  const slicedOutcomes = max > 0 ? outcomes.slice(-max) : outcomes;
  const rawTooltips = opts?.tooltips;
  const alignedTooltips =
    rawTooltips && rawTooltips.length > 0
      ? rawTooltips.length >= outcomes.length && max > 0
        ? rawTooltips.slice(-slicedOutcomes.length)
        : rawTooltips
      : undefined;

  return slicedOutcomes.map((outcome, idx) =>
    outcomeToEntry(outcome, resolved, alignedTooltips?.[idx]),
  );
}

export interface AtomicFormStripProps {
  readonly form: string | readonly string[] | null | undefined;
  readonly sport?: PlatformSport;
  readonly notation?: AtomicFormNotation;
  readonly max?: number;
  readonly size?: "xs" | "sm" | "md";
  readonly teamName?: string;
  readonly emptyFallback?: string | null;
  readonly tooltips?: readonly string[];
  readonly className?: string;
}

export function AtomicFormStrip({
  form,
  sport,
  notation = "auto",
  max = 5,
  size = "sm",
  teamName,
  emptyFallback = "—",
  tooltips,
  className = "",
}: AtomicFormStripProps): React.JSX.Element | null {
  const entries = parseAtomicForm(form, { notation, sport, max, tooltips });

  if (entries.length === 0) {
    if (emptyFallback === null) return null;
    return (
      <span
        role="img"
        className={`pl-atom-form-empty num ${className}`.trim()}
        aria-label={teamName ? `${teamName}: sin forma reciente` : "Sin forma reciente"}
        data-atomic-form="empty"
      >
        {emptyFallback}
      </span>
    );
  }

  const prefix = teamName ? `Forma de ${teamName}` : "Forma reciente";
  const ariaLabel = `${prefix} (últimos ${entries.length}): ${entries
    .map((e) => (e.tooltip ? `${e.spoken} (${e.tooltip})` : e.spoken))
    .join(", ")}`;

  return (
    <span
      role="img"
      className={`pl-atom-form pl-atom-form--${size} ${className}`.trim()}
      aria-label={ariaLabel}
      data-atomic-form=""
    >
      {entries.map((entry, idx) => (
        <span
          key={`${entry.glyph}-${idx}`}
          className={`pl-atom-form-cell is-${entry.outcome}${entry.tooltip ? " has-tooltip" : ""}`}
          title={entry.tooltip ?? undefined}
          data-tooltip={entry.tooltip ?? undefined}
          aria-hidden="true"
        >
          {entry.glyph}
        </span>
      ))}
    </span>
  );
}
