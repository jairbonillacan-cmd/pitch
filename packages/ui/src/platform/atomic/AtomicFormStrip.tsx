"use client";

import React from "react";
import type { PlatformSport } from "@pitchlab/contracts";

export type AtomicFormOutcome = "win" | "draw" | "loss";
export type AtomicFormNotation = "auto" | "es" | "us";

export interface AtomicFormEntry {
  readonly outcome: AtomicFormOutcome;
  readonly glyph: "G" | "E" | "P" | "W" | "L" | "T";
  readonly spoken: string;
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

function outcomeToEntry(outcome: AtomicFormOutcome, resolved: "es" | "us"): AtomicFormEntry {
  if (resolved === "us") {
    if (outcome === "win") return { outcome, glyph: "W", spoken: "Victoria" };
    if (outcome === "draw") return { outcome, glyph: "T", spoken: "Empate" };
    return { outcome, glyph: "L", spoken: "Derrota" };
  }
  if (outcome === "win") return { outcome, glyph: "G", spoken: "Ganó" };
  if (outcome === "draw") return { outcome, glyph: "E", spoken: "Empató" };
  return { outcome, glyph: "P", spoken: "Perdió" };
}

/**
 * Normaliza una racha en cadena (`"G-E-P-G-G · 3-1"`, `"WWLWW"`) o arreglo (`["G","E","P"]`)
 * hacia entradas tipadas en notación española (`G/E/P`) o US (`W/L`/`T`).
 */
export function parseAtomicForm(
  form: string | readonly string[] | null | undefined,
  opts?: {
    readonly notation?: AtomicFormNotation;
    readonly sport?: PlatformSport;
    readonly max?: number;
  },
): AtomicFormEntry[] {
  const resolved = resolveNotation(opts?.notation ?? "auto", opts?.sport);
  const max = opts?.max ?? 5;

  let tokens: string[];
  if (Array.isArray(form)) {
    tokens = form.map((item) => String(item).trim().toUpperCase());
  } else if (typeof form === "string") {
    const head = form.split("·")[0] ?? "";
    tokens = (head.toUpperCase().match(/[GEPWDLT]/g) ?? []);
  } else {
    tokens = [];
  }

  const out: AtomicFormEntry[] = [];
  for (const ch of tokens) {
    if (ch === "G" || ch === "W") out.push(outcomeToEntry("win", resolved));
    else if (ch === "E" || ch === "D" || ch === "T") out.push(outcomeToEntry("draw", resolved));
    else if (ch === "P" || ch === "L") out.push(outcomeToEntry("loss", resolved));
  }

  return max > 0 ? out.slice(-max) : out;
}

export interface AtomicFormStripProps {
  /** Racha cruda (`"G-E-P-G-G · 3-1"`, `"WWLWL"`) o lista de resultados. */
  readonly form: string | readonly string[] | null | undefined;
  /** Deporte para elegir automáticamente `G/E/P` (fútbol) o `W/L` (ligas US). */
  readonly sport?: PlatformSport;
  /** Fuerza notación `es` (`G/E/P`), `us` (`W/L`) o `auto` según `sport`. */
  readonly notation?: AtomicFormNotation;
  /** Máximo de resultados visibles (por defecto 5). */
  readonly max?: number;
  readonly size?: "xs" | "sm" | "md";
  /** Nombre opcional del club para enriquecer `aria-label`. */
  readonly teamName?: string;
  /** Texto discreto si no hay forma disponible (`null` omite el nodo). */
  readonly emptyFallback?: string | null;
  readonly className?: string;
}

/**
 * Tira compacta de forma reciente (`G/E/P` y `W/L` US) con diseño plano editorial,
 * contraste WCAG AA en tema oscuro y claro y `role="img"` accesible.
 */
export function AtomicFormStrip({
  form,
  sport,
  notation = "auto",
  max = 5,
  size = "sm",
  teamName,
  emptyFallback = "—",
  className = "",
}: AtomicFormStripProps): React.JSX.Element | null {
  const entries = parseAtomicForm(form, { notation, sport, max });

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
  const ariaLabel = `${prefix} (últimos ${entries.length}): ${entries.map((e) => e.spoken).join(", ")}`;

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
          className={`pl-atom-form-cell is-${entry.outcome}`}
          aria-hidden="true"
        >
          {entry.glyph}
        </span>
      ))}
    </span>
  );
}
