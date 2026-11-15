"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MaestroIcon, type MaestroIconName } from "../../components/MaestroPrimitives";
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
export interface CortexStatView {
  label: string;
  value?: string;
  home?: number;
  away?: number;
}

export interface CortexSectionView {
  key: string;
  title: string;
  text: string;
  origin?: "ia" | "plantilla";
  stats?: readonly CortexStatView[];
}

const SECTION_ICON: Record<string, MaestroIconName> = {
  goles: "flame",
  ritmo: "activity",
  tabla: "trophy",
  cambia: "eye",
};

/** «26 %» nunca se parte entre líneas. */
const NBSP = String.fromCharCode(160);
const keepUnits = (text: string) => text.replace(/(\d) (%)/g, `$1${NBSP}$2`);

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(x < 10 ? 2 : 1).replace(/0$/, ""));

/** Comparación local/visitante en una barra: el lado más grande se nota sin leer números. */
function SplitStat({ stat, home, away }: { stat: CortexStatView; home: string; away: string }): React.JSX.Element {
  const h = stat.home ?? 0;
  const a = stat.away ?? 0;
  const share = h + a > 0 ? (h / (h + a)) * 100 : 50;
  return (
    <div className="pl-cortex-split" role="group" aria-label={`${stat.label}: ${home} ${fmt(h)}, ${away} ${fmt(a)}`}>
      <span className="pl-cortex-split-num num" aria-hidden="true">{fmt(h)}</span>
      <span className="pl-cortex-split-mid" aria-hidden="true">
        <span className="pl-cortex-split-label">{stat.label}</span>
        <span className="pl-cortex-split-bar">
          <span className="is-home" style={{ inlineSize: `${share}%` }} />
          <span className="is-away" />
        </span>
      </span>
      <span className="pl-cortex-split-num num" aria-hidden="true">{fmt(a)}</span>
    </div>
  );
}

/**
 * Lectura de Cortex por secciones. A diferencia de un texto suelto, cada sección trae su
 * evidencia al lado (barras local/visitante o cifras clave que salen del motor) y el bloque
 * «Qué podría cambiarlo» se distingue como aviso. Al pie, cómo se verificó el texto.
 */
function CortexReading({
  sections,
  home,
  away,
}: {
  sections: readonly CortexSectionView[];
  home: string;
  away: string;
}): React.JSX.Element {
  const body = sections.filter((s) => s.key !== "lectura");
  const direct = sections.filter((s) => s.origin === "plantilla").length;
  return (
    <div className="pl-cortex-reading">
      <div className="pl-cortex-legend" aria-hidden="true">
        <span className="is-home">{home}</span>
        <span className="is-away">{away}</span>
      </div>
      <div className="pl-cortex-sections">
        {body.map((sec) => {
          const splits = (sec.stats ?? []).filter((st) => st.home !== undefined && st.away !== undefined);
          const values = (sec.stats ?? []).filter((st) => st.value !== undefined);
          return (
            <section
              key={sec.key}
              className={`pl-cortex-sec${sec.key === "cambia" ? " pl-cortex-sec--watch" : ""}`}
              aria-labelledby={`cortex-${sec.key}`}
            >
              <h3 id={`cortex-${sec.key}`} className="pl-cortex-sec-title">
                <MaestroIcon name={SECTION_ICON[sec.key] ?? "sparkles"} size={15} />
                {sec.title}
              </h3>
              {splits.length > 0 ? (
                <div className="pl-cortex-splits">
                  {splits.map((st) => (
                    <SplitStat key={st.label} stat={st} home={home} away={away} />
                  ))}
                </div>
              ) : null}
              {values.length > 0 ? (
                <dl className="pl-cortex-values">
                  {values.map((st) => (
                    <div key={st.label}>
                      <dt>{st.label}</dt>
                      <dd className="num">{st.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="pl-cortex-sec-text">{keepUnits(sec.text)}</p>
            </section>
          );
        })}
      </div>
      <details className="pl-cortex-trust">
        <summary>Cómo se escribió esta lectura</summary>
        <p>
          Las cifras salen del modelo de PitchLab y se calculan antes del partido. Cortex IA las redacta y
          cada frase se revisa antes de publicarse: si menciona un número que el modelo no dio o confunde
          local y visitante, se reemplaza por el texto directo con los números.
          {direct > 0
            ? ` En este partido, ${direct === 1 ? "una sección usa" : `${direct} secciones usan`} el texto directo.`
            : ""}
        </p>
      </details>
    </div>
  );
}

export function CortexAnalysisCard({
  game,
  synthesis,
  unlocked,
  sections,
  headline,
}: {
  game: PlatformGame;
  synthesis: string;
  unlocked: boolean;
  /**
   * Lectura por secciones redactada en el corte (La lectura, Goles, Ritmo del partido, Tabla y
   * descanso, Qué podría cambiarlo). «La lectura» se escribe con la animación; el resto, al final.
   */
  sections?: readonly CortexSectionView[] | null;
  /** Idea central del partido en una línea. */
  headline?: string | null;
}): React.JSX.Element {
  const words = useMemo(() => keepUnits(synthesis).split(/( +)/), [synthesis]);
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
            {sections?.length ? "La lectura de Cortex" : "Análisis antes del partido"}
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
        <>
        {headline && unlocked ? <p className="pl-cortex-headline">{keepUnits(headline)}</p> : null}
        <p className="pl-cortex-text">
          {words.slice(0, shown).join("")}
          {phase === "writing" ? <span className="pl-cortex-caret" aria-hidden="true" /> : null}
        </p>
        </>
      )}

      {phase === "done" && unlocked && sections && sections.length > 0 ? (
        <CortexReading sections={sections} home={game.home.shortName} away={game.away.shortName} />
      ) : null}

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
