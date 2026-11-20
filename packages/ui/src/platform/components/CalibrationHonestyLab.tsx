"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatOddsValue } from "../access-guard";
import type { OddsFormat } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export interface CalibrationHonestyLabProps {
  readonly oddsFormat?: OddsFormat;
  readonly settledCount?: number;
}

export interface StreakVsCalibrationResult {
  readonly rawPct: number;
  readonly calibratedProb: number;
  readonly calibratedPct: number;
  readonly fairDecimal: number;
  readonly evPct: number;
}

/**
 * Contracción bayesiana Beta(2, 2) para comparar una racha observada (`k` de `n`)
 * frente a la probabilidad calibrada real y el valor esperado contra un momio de casa.
 */
export function evaluateStreakVsCalibration(
  hits: number,
  sampleSize: number,
  bookDecimal: number,
): StreakVsCalibrationResult {
  const n = Math.max(1, Math.round(sampleSize));
  const k = Math.max(0, Math.min(n, Math.round(hits)));
  const rawPct = Math.round((k / n) * 1000) / 10;
  // Prior simétrico Beta(2, 2) equivalente a 4 observaciones previas centradas en 50 %
  const calibratedProb = Math.min(0.98, Math.max(0.02, (k + 2) / (n + 4)));
  const calibratedPct = Math.round(calibratedProb * 1000) / 10;
  const fairDecimal = Math.round((1 / calibratedProb) * 100) / 100;
  const evPct = Math.round((calibratedProb * bookDecimal - 1) * 1000) / 10;
  return { rawPct, calibratedProb, calibratedPct, fairDecimal, evPct };
}

/**
 * Laboratorio interactivo de 10 segundos: demuestra por qué una racha reciente (ej. 4/5 = 80 %)
 * no equivale a probabilidad real ni a ventaja cuando la casa ofrece un momio corto (ADR-048).
 */
export function CalibrationHonestyLab({
  oddsFormat = "decimal",
  settledCount,
}: CalibrationHonestyLabProps): React.JSX.Element {
  const hitsId = useId();
  const oddsId = useId();
  const hitsRef = useRef<HTMLInputElement | null>(null);
  const oddsRef = useRef<HTMLInputElement | null>(null);

  const [sampleSize, setSampleSize] = useState<5 | 10 | 20>(5);
  const [hits, setHits] = useState<number>(4);
  const [bookDecimal, setBookDecimal] = useState<number>(1.35);

  const safeHits = Math.min(hits, sampleSize);

  useEffect(() => {
    if (hitsRef.current) {
      hitsRef.current.style.setProperty("--attr-min", "0");
      hitsRef.current.style.setProperty("--attr-max", String(sampleSize));
      hitsRef.current.style.setProperty("--control-value", String(safeHits));
    }
  }, [sampleSize, safeHits]);

  useEffect(() => {
    if (oddsRef.current) {
      oddsRef.current.style.setProperty("--attr-min", "1.1");
      oddsRef.current.style.setProperty("--attr-max", "3.5");
      oddsRef.current.style.setProperty("--control-value", String(bookDecimal));
    }
  }, [bookDecimal]);

  const metrics = useMemo(
    () => evaluateStreakVsCalibration(safeHits, sampleSize, bookDecimal),
    [safeHits, sampleSize, bookDecimal],
  );

  const evPositive = metrics.evPct > 0;

  return (
    <section
      className="pl-honesty-lab glass-card glass-ring rounded-2xl p-5 space-y-4"
      aria-labelledby="pl-honesty-lab-title"
      data-calibration-honesty-lab=""
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="pl-pill pl-pill--brand text-[11px] font-bold">
            Estándar de integridad PitchLab
          </span>
          {typeof settledCount === "number" && settledCount > 0 ? (
            <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
              {settledCount} partidos auditados sin ediciones
            </span>
          ) : null}
        </div>
        <h2 id="pl-honesty-lab-title" className="m-0 text-lg font-extrabold">
          ¿Por qué una racha reciente no equivale a probabilidad real?
        </h2>
        <p className="m-0 text-xs sm:text-sm" style={{ color: "var(--pl-text-secondary)" }}>
          Prueba una racha común (como 4 de 5) frente a un momio de casa. PitchLab aplica contracción
          estadística y compara siempre contra el momio justo antes de marcar ventaja.
        </p>
      </header>

      <div className="pl-honesty-grid">
        <div className="pl-honesty-controls space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
              Tamaño de muestra
            </span>
            <div className="pl-prop-windows" role="group" aria-label="Tamaño de muestra">
              {([5, 10, 20] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={sampleSize === n}
                  className={`pl-prop-win-btn num ${sampleSize === n ? "is-on" : ""}`.trim()}
                  onClick={() => {
                    const scaled = Math.round((safeHits / sampleSize) * n);
                    setSampleSize(n);
                    setHits(Math.max(0, Math.min(n, scaled)));
                  }}
                >
                  {n} p.
                </button>
              ))}
            </div>
          </div>

          <div className="pl-prop-slider-wrap">
            <div className="pl-prop-slider-label-row">
              <label htmlFor={hitsId} className="text-xs font-semibold">
                Racha observada:{" "}
                <strong className="num">
                  {safeHits} de {sampleSize} ({metrics.rawPct.toFixed(0)} %)
                </strong>
              </label>
            </div>
            <input
              ref={hitsRef}
              id={hitsId}
              type="range"
              className="pl-range-slider"
              min={0}
              max={sampleSize}
              step={1}
              value={safeHits}
              aria-valuetext={`${safeHits} aciertos de ${sampleSize} partidos (${metrics.rawPct.toFixed(0)} por ciento)`}
              onChange={(e) => setHits(Number(e.target.value))}
            />
          </div>

          <div className="pl-prop-slider-wrap">
            <div className="pl-prop-slider-label-row">
              <label htmlFor={oddsId} className="text-xs font-semibold">
                Momio de la casa:{" "}
                <strong className="num">{formatOddsValue(bookDecimal, oddsFormat)}</strong>
              </label>
              <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                Implícito {((1 / bookDecimal) * 100).toFixed(1)} %
              </span>
            </div>
            <input
              ref={oddsRef}
              id={oddsId}
              type="range"
              className="pl-range-slider"
              min={1.1}
              max={3.5}
              step={0.05}
              value={bookDecimal}
              aria-valuetext={`Momio de casa ${formatOddsValue(bookDecimal, oddsFormat)}`}
              onChange={(e) => setBookDecimal(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="pl-honesty-output" aria-live="polite">
          <dl className="pl-honesty-kpis num">
            <div>
              <dt>Racha cruda</dt>
              <dd>{metrics.rawPct.toFixed(0)} %</dd>
            </div>
            <div>
              <dt>Prob. ajustada</dt>
              <dd style={{ color: "var(--pl-brand)" }}>{metrics.calibratedPct.toFixed(1)} %</dd>
            </div>
            <div>
              <dt>Momio justo</dt>
              <dd>{formatOddsValue(metrics.fairDecimal, oddsFormat)}</dd>
            </div>
            <div>
              <dt>Valor esperado real</dt>
              <dd style={{ color: evPositive ? "var(--pl-success)" : "var(--pl-danger)" }}>
                {metrics.evPct >= 0 ? `+${metrics.evPct.toFixed(1)} %` : `${metrics.evPct.toFixed(1)} %`}
              </dd>
            </div>
          </dl>

          <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
            {evPositive
              ? `El momio ${formatOddsValue(bookDecimal, oddsFormat)} paga por encima del momio justo (${formatOddsValue(metrics.fairDecimal, oddsFormat)}) incluso tras ajustar el tamaño de muestra.`
              : `Aunque la racha marque ${metrics.rawPct.toFixed(0)} %, con ${sampleSize} partidos el ajuste bayesiano sitúa la probabilidad real cerca de ${metrics.calibratedPct.toFixed(1)} %: pagar ${formatOddsValue(bookDecimal, oddsFormat)} deja valor esperado negativo.`}
          </p>
        </div>
      </div>

      <ul className="pl-honesty-guarantees" role="list">
        <li>
          <MaestroIcon name="lock" size={14} />
          <span>Publicación sellada antes del silbatazo inicial</span>
        </li>
        <li>
          <MaestroIcon name="shield" size={14} />
          <span>Cero picks eliminados ni ocultos tras finalizar el partido</span>
        </li>
        <li>
          <MaestroIcon name="activity" size={14} />
          <span>Aciertos, fallos y calibración real siempre auditables</span>
        </li>
      </ul>
    </section>
  );
}
