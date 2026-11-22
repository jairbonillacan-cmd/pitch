"use client";

import React from "react";
import { useCountUpAnimation } from "../hooks/usePublicSurfaceEffects";

/**
 * Cifra que cuenta hasta su valor (ease-out cúbico; INTERACTION_PATTERNS §1).
 * - Al montarse cuenta desde 0 (650 ms por omisión, con `delayMs` opcional).
 * - Si `value` cambia, rueda del valor anterior al nuevo (`changeDurationMs`).
 * El servidor pinta el valor final: sin JavaScript o con movimiento reducido no cambia nada.
 * La versión animada se oculta a lectores de pantalla; estos leen siempre el valor final.
 */
export function CountUpNumber({
  value,
  decimals = 1,
  durationMs = 650,
  changeDurationMs = 420,
  delayMs = 0,
  format,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  changeDurationMs?: number;
  delayMs?: number;
  /** Formato de la cifra (por omisión `toFixed(decimals)`). */
  format?: (n: number) => string;
}): React.JSX.Element {
  const ref = useCountUpAnimation({
    value,
    decimals,
    durationMs,
    changeDurationMs,
    delayMs,
    format,
  });
  const finalText = format ? format(value) : value.toFixed(decimals);

  return (
    <>
      <span key={finalText} ref={ref} aria-hidden="true">
        {finalText}
      </span>
      <span className="sr-only">{finalText}</span>
    </>
  );
}
