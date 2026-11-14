"use client";

import React, { useLayoutEffect, useRef } from "react";

/** Hasta este momento (ms desde el inicio de la navegación) se considera la carga inicial. */
const INITIAL_LOAD_WINDOW_MS = 3000;

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
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  const render = (n: number): string => (formatRef.current ? formatRef.current(n) : n.toFixed(decimals));
  const finalText = render(value);

  // Antes del pintado: al cambiar de valor no se ve un cuadro con la cifra final.
  useLayoutEffect(() => {
    const el = ref.current;
    const from = previous.current;
    previous.current = value;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const isFirst = from === null;
    const duration = isFirst ? durationMs : changeDurationMs;
    const origin = isFirst ? 0 : from;
    if (origin === value) return;

    // Primera vez: en la carga de la página el retraso se mide desde el inicio de la navegación,
    // para ir al paso de la entrada CSS aunque la hidratación tarde. Si llega cuando el conteo ya
    // debió terminar, se queda la cifra final. En navegación interna, se cuenta desde el montaje.
    const now = performance.now();
    let start = now;
    if (isFirst) {
      const initialLoad = now < INITIAL_LOAD_WINDOW_MS;
      if (initialLoad && now > delayMs + duration) return;
      start = initialLoad ? Math.max(now, delayMs) : now + delayMs;
    }

    let frame = 0;
    el.textContent = render(origin);
    const tick = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = render(origin + (value - origin) * eased);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      el.textContent = render(value);
    };
    // `render` depende de `decimals` y del formato vigente (ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, durationMs, changeDurationMs, delayMs]);

  return (
    <>
      <span key={finalText} ref={ref} aria-hidden="true">
        {finalText}
      </span>
      <span className="sr-only">{finalText}</span>
    </>
  );
}
