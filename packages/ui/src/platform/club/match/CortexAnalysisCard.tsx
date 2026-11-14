"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { PlatformGame } from "../../types";

const THINKING_STEPS = [
  "Leyendo la forma reciente",
  "Cruzando bajas y descanso",
  "Comparando con el panorama del modelo",
  "Redactando el análisis",
] as const;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type Phase = "thinking" | "writing" | "done";

/**
 * Análisis de Cortex IA a lo ancho: primero «piensa» (pasos y renglones en espera), luego
 * escribe el texto palabra por palabra y al final muestra las claves del partido. Con
 * movimiento reducido aparece completo. «Ver completo» salta la animación.
 */
export function CortexAnalysisCard({
  game,
  synthesis,
  unlocked,
}: {
  game: PlatformGame;
  synthesis: string;
  unlocked: boolean;
}): React.JSX.Element {
  const words = useMemo(() => synthesis.split(/(\s+)/), [synthesis]);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase("done");
      setShown(words.length);
      return;
    }
    setPhase("thinking");
    setStep(0);
    setShown(0);
    const timers: number[] = [];
    THINKING_STEPS.forEach((_, i) => timers.push(window.setTimeout(() => setStep(i), i * 420)));
    timers.push(window.setTimeout(() => setPhase("writing"), THINKING_STEPS.length * 420 + 120));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [game.id, words.length]);

  useEffect(() => {
    if (phase !== "writing") return;
    if (shown >= words.length) {
      setPhase("done");
      return;
    }
    const t = window.setTimeout(() => setShown((n) => Math.min(words.length, n + 2)), 28);
    return () => window.clearTimeout(t);
  }, [phase, shown, words.length]);

  const skip = () => {
    setPhase("done");
    setShown(words.length);
  };

  const reasons = game.confidenceDetail?.reasons ?? [];
  const drivers = game.spacetime?.drivers ?? [];
  const maxImpact = Math.max(0.0001, ...drivers.map((d) => Math.abs(d.impactLogit)));

  return (
    <section className="pl-cortex glass-card glass-ring" aria-labelledby="cortex-title" aria-busy={phase !== "done"}>
      <header className="pl-cortex-head">
        <span className="pl-cortex-badge" aria-hidden="true">
          <MaestroIcon name="cpu" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="cortex-title" className="m-0 text-base font-extrabold">
            Análisis antes del partido
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Cortex IA · {game.home.shortName} vs {game.away.shortName}
          </p>
        </div>
        {phase === "done" ? null : (
          <button type="button" className="pl-btn-glass text-xs min-h-8 px-3" onClick={skip}>
            Ver completo
          </button>
        )}
      </header>

      {phase === "thinking" ? (
        <div className="pl-cortex-thinking" role="status">
          <ol className="pl-cortex-steps" aria-label="Cortex IA está trabajando">
            {THINKING_STEPS.map((s, i) => (
              <li key={s} className={i < step ? "is-done" : i === step ? "is-active" : ""}>
                <span className="pl-cortex-dot" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ol>
          <div className="pl-cortex-skeleton" aria-hidden="true">
            <span style={{ width: "96%" }} />
            <span style={{ width: "88%" }} />
            <span style={{ width: "92%" }} />
            <span style={{ width: "54%" }} />
          </div>
        </div>
      ) : (
        <p className="pl-cortex-text">
          {words.slice(0, shown).join("")}
          {phase === "writing" ? <span className="pl-cortex-caret" aria-hidden="true" /> : null}
        </p>
      )}

      {phase === "done" && unlocked ? (
        <div className="pl-cortex-grid">
          {game.preGame.tacticalKeys.length > 0 ? (
            <div className="pl-cortex-block">
              <h3 className="pl-cortex-label">Claves del partido</h3>
              <ul className="pl-cortex-list">
                {game.preGame.tacticalKeys.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {drivers.length > 0 ? (
            <div className="pl-cortex-block">
              <h3 className="pl-cortex-label">Lo que más mueve el pronóstico</h3>
              <ul className="pl-cortex-drivers">
                {drivers.slice(0, 4).map((d) => (
                  <li key={d.label}>
                    <span className="text-xs">{d.label}</span>
                    <span className="pl-cortex-impact" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.round((Math.abs(d.impactLogit) / maxImpact) * 100)}%`,
                          background: d.impactLogit >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                        }}
                      />
                    </span>
                    <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                      {d.impactLogit >= 0 ? `a favor de ${game.home.shortName}` : `a favor de ${game.away.shortName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reasons.length > 0 ? (
            <div className="pl-cortex-block">
              <h3 className="pl-cortex-label">Qué tan firme es</h3>
              <ul className="pl-cortex-list">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
