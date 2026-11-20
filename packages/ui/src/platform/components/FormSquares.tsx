"use client";

import React from "react";

export type FormLetter = "G" | "E" | "P";

const FORM_LABEL_ES: Record<FormLetter, string> = {
  G: "Ganó",
  E: "Empató",
  P: "Perdió",
};

export function normalizeFormLetter(raw: string): FormLetter | null {
  const ch = raw.trim().toUpperCase();
  if (ch === "G" || ch === "W") return "G";
  if (ch === "E" || ch === "D" || ch === "T") return "E";
  if (ch === "P" || ch === "L") return "P";
  return null;
}

export interface FormSquaresProps {
  /** Racha de resultados (`"GGPEG"`, `["G","P","E"]` o `["W","L"]`). */
  form?: string | readonly string[] | null;
  /** Máximo de cuadros visibles (por defecto 5). */
  max?: number;
  size?: "sm" | "md";
  /** Muestra guión limpio si no hay racha disponible. */
  emptyFallback?: string;
  className?: string;
}

/**
 * Componente atómico «Últimas 5»: cuadros redondeados individuales sin contenedor gris
 * de fondo, con paleta viva de alto contraste en tema oscuro y claro (ADR-044).
 */
export function FormSquares({
  form,
  max = 5,
  size = "md",
  emptyFallback = "—",
  className = "",
}: FormSquaresProps): React.JSX.Element {
  const rawList = Array.isArray(form)
    ? form
    : typeof form === "string"
      ? form.replace(/[^A-Za-z]/g, "").split("")
      : [];

  const letters = rawList
    .map((item) => normalizeFormLetter(String(item)))
    .filter((v): v is FormLetter => v !== null)
    .slice(-max);

  if (letters.length === 0) {
    return (
      <span
        role="img"
        className={`pl-form-sq-empty num ${className}`.trim()}
        aria-label="Sin racha reciente"
      >
        {emptyFallback}
      </span>
    );
  }

  const ariaLabel = `Últimos ${letters.length}: ${letters.map((l) => FORM_LABEL_ES[l]).join(", ")}`;

  return (
    <span
      role="img"
      className={`pl-form-sq-row pl-form-sq-row--${size} ${className}`.trim()}
      aria-label={ariaLabel}
      data-form-squares=""
    >
      {letters.map((letter, idx) => (
        <span
          key={`${letter}-${idx}`}
          className={`pl-form-sq is-${letter}`}
          aria-hidden="true"
          title={FORM_LABEL_ES[letter]}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
