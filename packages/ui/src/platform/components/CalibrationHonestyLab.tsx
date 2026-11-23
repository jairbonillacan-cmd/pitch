"use client";

import React, { useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  SofascoreCard,
  SofascoreKpiStrip,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
} from "../../components/ui/primitives";
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

export function evaluateStreakVsCalibration(
  hits: number,
  sampleSize: number,
  bookDecimal: number,
): StreakVsCalibrationResult {
  const n = Math.max(1, Math.round(sampleSize));
  const k = Math.max(0, Math.min(n, Math.round(hits)));
  const rawPct = Math.round((k / n) * 1000) / 10;
  const calibratedProb = Math.min(0.98, Math.max(0.02, (k + 2) / (n + 4)));
  const calibratedPct = Math.round(calibratedProb * 1000) / 10;
  const fairDecimal = Math.round((1 / calibratedProb) * 100) / 100;
  const evPct = Math.round((calibratedProb * bookDecimal - 1) * 1000) / 10;
  return { rawPct, calibratedProb, calibratedPct, fairDecimal, evPct };
}

type SampleWindowSize = 5 | 10 | 20;

const SAMPLE_WINDOW_TABS: readonly SofascoreTabItem[] = [
  { id: "5", label: "5 p." },
  { id: "10", label: "10 p." },
  { id: "20", label: "20 p." },
];

function parseSampleWindow(id: string): SampleWindowSize {
  if (id === "10") return 10;
  if (id === "20") return 20;
  return 5;
}

export function CalibrationHonestyLab({
  oddsFormat = "decimal",
  settledCount,
}: CalibrationHonestyLabProps): React.JSX.Element {
  const hitsId = useId();
  const oddsId = useId();

  const [sampleSize, setSampleSize] = useState<SampleWindowSize>(5);
  const [hits, setHits] = useState<number>(4);
  const [bookDecimal, setBookDecimal] = useState<number>(1.35);

  const safeHits = Math.min(hits, sampleSize);

  const metrics = useMemo(
    () => evaluateStreakVsCalibration(safeHits, sampleSize, bookDecimal),
    [safeHits, sampleSize, bookDecimal],
  );

  const evPositive = metrics.evPct > 0;

  const kpiItems: SofascoreKpiItem[] = [
    {
      id: "raw",
      label: "Racha cruda",
      value: `${metrics.rawPct.toFixed(0)} %`,
    },
    {
      id: "calibrated",
      label: "Prob. ajustada",
      value: `${metrics.calibratedPct.toFixed(1)} %`,
      tone: "brand",
    },
    {
      id: "fair",
      label: "Momio justo",
      value: formatOddsValue(metrics.fairDecimal, oddsFormat),
    },
    {
      id: "ev",
      label: "Valor esperado real",
      value:
        metrics.evPct >= 0
          ? `+${metrics.evPct.toFixed(1)} %`
          : `${metrics.evPct.toFixed(1)} %`,
      tone: evPositive ? "positive" : "negative",
    },
  ];

  const handleSampleChange = (tabId: string): void => {
    const nextN = parseSampleWindow(tabId);
    const scaled = Math.round((safeHits / sampleSize) * nextN);
    setSampleSize(nextN);
    setHits(Math.max(0, Math.min(nextN, scaled)));
  };

  const handleHitsChange = (raw: string): void => {
    const parsed = parseStrictFiniteNumber(raw);
    if (parsed !== null) {
      setHits(Math.max(0, Math.min(sampleSize, Math.round(parsed))));
    }
  };

  const handleOddsChange = (raw: string): void => {
    const parsed = parseStrictFiniteNumber(raw);
    if (parsed !== null && parsed >= 1.1 && parsed <= 3.5) {
      setBookDecimal(parsed);
    }
  };

  return (
    <div data-calibration-honesty-lab="">
      <SofascoreCard
        title="¿Por qué una racha reciente no equivale a probabilidad real?"
        meta={
          typeof settledCount === "number" && settledCount > 0
            ? `${settledCount} partidos auditados sin ediciones`
            : "Estándar de integridad PitchLab"
        }
      >
        <div className="pl-ed-stack">
          <p className="pl-ed-subcopy">
            Prueba una racha común (como 4 de 5) frente a un momio de casa. PitchLab aplica
            contracción estadística y compara siempre contra el momio justo antes de marcar ventaja.
          </p>

          <div className="pl-ed-honesty-grid">
            <div className="pl-ed-stack">
              <div className="pl-ed-slider-head">
                <span>Tamaño de muestra</span>
                <SofascoreTabs
                  items={SAMPLE_WINDOW_TABS}
                  value={String(sampleSize)}
                  onChange={handleSampleChange}
                  variant="segmented"
                  ariaLabel="Tamaño de muestra"
                />
              </div>

              <div className="pl-ed-slider-field">
                <div className="pl-ed-slider-head">
                  <label htmlFor={hitsId}>
                    Racha observada:{" "}
                    <strong className="num">
                      {safeHits} de {sampleSize} ({metrics.rawPct.toFixed(0)} %)
                    </strong>
                  </label>
                </div>
                <input
                  id={hitsId}
                  type="range"
                  className="pl-ed-range"
                  min={0}
                  max={sampleSize}
                  step={1}
                  value={safeHits}
                  aria-valuetext={`${safeHits} aciertos de ${sampleSize} partidos (${metrics.rawPct.toFixed(0)} por ciento)`}
                  onChange={(event) => handleHitsChange(event.target.value)}
                />
              </div>

              <div className="pl-ed-slider-field">
                <div className="pl-ed-slider-head">
                  <label htmlFor={oddsId}>
                    Momio de la casa:{" "}
                    <strong className="num">{formatOddsValue(bookDecimal, oddsFormat)}</strong>
                  </label>
                  <span className="num pl-ed-muted">
                    Implícito {((1 / bookDecimal) * 100).toFixed(1)} %
                  </span>
                </div>
                <input
                  id={oddsId}
                  type="range"
                  className="pl-ed-range"
                  min={1.1}
                  max={3.5}
                  step={0.05}
                  value={bookDecimal}
                  aria-valuetext={`Momio de casa ${formatOddsValue(bookDecimal, oddsFormat)}`}
                  onChange={(event) => handleOddsChange(event.target.value)}
                />
              </div>
            </div>

            <div className="pl-ed-stack" aria-live="polite">
              <SofascoreKpiStrip items={kpiItems} />
              <p className="pl-ed-subcopy">
                {evPositive
                  ? `El momio ${formatOddsValue(bookDecimal, oddsFormat)} paga por encima del momio justo (${formatOddsValue(metrics.fairDecimal, oddsFormat)}) incluso tras ajustar el tamaño de muestra.`
                  : `Aunque la racha marque ${metrics.rawPct.toFixed(0)} %, con ${sampleSize} partidos el ajuste bayesiano sitúa la probabilidad real cerca de ${metrics.calibratedPct.toFixed(1)} %: pagar ${formatOddsValue(bookDecimal, oddsFormat)} deja valor esperado negativo.`}
              </p>
            </div>
          </div>

          <ul className="pl-ed-guarantees" role="list">
            <li>
              <MaestroIcon name="lock" size={15} />
              <span>Publicación registrada antes del silbatazo inicial</span>
            </li>
            <li>
              <MaestroIcon name="shield" size={15} />
              <span>Cero picks eliminados ni ocultos tras finalizar el partido</span>
            </li>
            <li>
              <MaestroIcon name="activity" size={15} />
              <span>Aciertos, fallos y calibración real siempre auditables</span>
            </li>
          </ul>
        </div>
      </SofascoreCard>
    </div>
  );
}
