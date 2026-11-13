"use client";

import React, { useEffect, useRef } from "react";

/**
 * Cifra que cuenta de 0 a su valor (650 ms, ease-out cúbico; INTERACTION_PATTERNS §1).
 * El servidor pinta el valor final, así que sin JavaScript o con movimiento reducido no cambia nada.
 * La versión animada se oculta a lectores de pantalla y estos leen siempre el valor final.
 */
export function CountUpNumber({
  value,
  decimals = 1,
  durationMs = 650,
  delayMs = 0,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  delayMs?: number;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now() + delayMs;
    el.textContent = (0).toFixed(decimals);

    const tick = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (value * eased).toFixed(decimals);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      el.textContent = finalText;
    };
  }, [value, decimals, durationMs, delayMs, finalText]);

  return (
    <>
      <span key={finalText} ref={ref} aria-hidden="true">
        {finalText}
      </span>
      <span className="sr-only">{finalText}</span>
    </>
  );
}
