"use client";

import React, { useEffect, useState } from "react";

/** Isotipo «Campo de corte» (mismo trazo que `pitchlab-isotype-*.svg`). */
const ISOTYPE_PATH = "M8 8H42L56 22V32L44 44H28L40 32H42L44 30V26L38 20H8ZM8 30H32L20 42V56H8Z";

/** Letras del logotipo oficial, en el orden de `pitchlab-horizontal-*.svg`. */
const WORDMARK_GLYPHS: ReadonlyArray<readonly [number, string]> = [
  [0, "M0 2H21Q33 2 33 15Q33 28 21 28H8V44H0ZM8 9V21H20Q25 21 25 15Q25 9 20 9Z"],
  [37, "M0 13H8V44H0ZM0 2H8V9H0Z"],
  [49, "M6 5H14V13H23V20H14V33Q14 37 18 37H23V44H17Q6 44 6 34V20H0V13H6Z"],
  [75, "M17 12Q25 12 30 18L25 23Q22 19 17 19Q8 19 8 29Q8 38 17 38Q22 38 25 34L30 39Q25 45 17 45Q0 45 0 29Q0 12 17 12Z"],
  [110, "M0 2H8V16Q12 12 18 12Q30 12 30 25V44H22V26Q22 19 16 19Q8 19 8 27V44H0Z"],
  [147, "M0 2H8V36H29V44H0Z"],
  [180, "M16 12Q30 12 30 24V44H23V40Q19 45 11 45Q0 45 0 35Q0 25 13 25H22V24Q22 19 16 19Q9 19 5 22L2 16Q8 12 16 12ZM15 31Q8 31 8 35Q8 39 13 39Q21 39 22 33V31Z"],
  [216, "M0 2H8V16Q12 12 19 12Q33 12 33 29Q33 45 18 45Q12 45 8 41V44H0ZM16 19Q8 19 8 29Q8 38 16 38Q25 38 25 29Q25 19 16 19Z"],
];

const STATUS_MESSAGES = ["Preparando tu jornada", "Actualizando momios", "Calculando probabilidades"] as const;
const STATUS_STEP_MS = 1600;
/** A partir de aquí se avisa que la carga va lenta y se ofrece reintentar. */
const SLOW_AFTER_MS = 8000;

export type LaunchScreenVariant = "full" | "inline";

export interface LaunchScreenProps {
  /**
   * `full`: pantalla completa con la atmósfera de pitchlab.mx (entrada a la app después del PIN).
   * `inline`: ocupa solo el área de contenido; el encabezado y la barra lateral siguen visibles.
   */
  variant?: LaunchScreenVariant;
  /** Acceso confirmado (PIN o enlace del correo): muestra la marca de listo en el isotipo. */
  confirmed?: boolean;
  /** Muestra el aviso de carga lenta desde el inicio (para Storybook y pruebas). */
  forceSlow?: boolean;
  /** Acción de «Reintentar». Por defecto recarga la página. */
  onRetry?: () => void;
}

/**
 * Pantalla de arranque de PitchLab: el isotipo se traza una vez y se rellena,
 * debajo una frase de estado y una línea de progreso. Si la carga tarda más de
 * 8 s, aparece «Reintentar». Respeta `prefers-reduced-motion`.
 */
export function LaunchScreen({
  variant = "full",
  confirmed = false,
  forceSlow = false,
  onRetry,
}: LaunchScreenProps): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(forceSlow);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    if (!reduced) {
      for (let i = 1; i < STATUS_MESSAGES.length; i += 1) {
        timers.push(window.setTimeout(() => setStep(i), STATUS_STEP_MS * i + 600));
      }
    }
    timers.push(window.setTimeout(() => setSlow(true), SLOW_AFTER_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const status = confirmed && step === 0 ? "Listo. Entrando a PitchLab" : STATUS_MESSAGES[step];
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div className="pl-launch" data-variant={variant} data-confirmed={confirmed || undefined}>
      {variant === "full" && (
        <div className="pl-launch-atmo" aria-hidden="true">
          <span className="pl-launch-orb pl-launch-orb--violet" />
          <span className="pl-launch-orb pl-launch-orb--emerald" />
          <span className="pl-launch-orb pl-launch-orb--sky" />
          <span className="pl-launch-fieldgrid" />
        </div>
      )}

      <div className="pl-launch-body">
        <div className="pl-launch-mark" aria-hidden="true">
          <span className="pl-launch-halo" />
          <span className="pl-launch-tile glass-ring glass-ring--featured">
            <svg className="pl-launch-iso" viewBox="0 0 64 64" width="56" height="56">
              <path d={ISOTYPE_PATH} pathLength={1} />
            </svg>
          </span>
          {confirmed && (
            <span className="pl-launch-check">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                <path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </div>

        {variant === "full" && (
          <svg className="pl-launch-wordmark" viewBox="0 0 249 46" height="26" width="141" aria-hidden="true">
            {WORDMARK_GLYPHS.map(([x, d]) => (
              <path key={x} transform={`translate(${x} 0)`} d={d} />
            ))}
          </svg>
        )}

        <p className="pl-launch-status" role="status" aria-live="polite">
          <span key={status} className="pl-launch-status-text">
            {status}
          </span>
        </p>

        <div className="pl-launch-bar" aria-hidden="true">
          <i />
        </div>

        <p className="pl-launch-slow" data-visible={slow || undefined} aria-hidden={!slow}>
          Está tardando más de lo normal.
          <button type="button" onClick={retry} tabIndex={slow ? 0 : -1}>
            Reintentar
          </button>
        </p>
      </div>
    </div>
  );
}
