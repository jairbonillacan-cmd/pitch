"use client";

import React, { useMemo } from "react";
import {
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreTable,
  type SofascoreKpiItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";

export interface CalibrationSample {
  readonly p: number;
  readonly hit: boolean;
}

export interface CalibrationBucketRow {
  readonly key: string;
  readonly label: string;
  readonly minP: number;
  readonly maxP: number;
  readonly count: number;
  readonly hits: number;
  readonly meanPredicted: number;
  readonly observedRate: number;
  readonly gapPts: number;
}

export interface ModelCalibrationSummary {
  readonly total: number;
  readonly hits: number;
  readonly overallHitRate: number;
  readonly meanPredicted: number;
  readonly brierScore: number | null;
  readonly ece: number | null;
  readonly buckets: readonly CalibrationBucketRow[];
}

const BUCKET_DEFS = [
  { key: "b35", label: "35–49 %", minP: 0, maxP: 0.5 },
  { key: "b50", label: "50–59 %", minP: 0.5, maxP: 0.6 },
  { key: "b60", label: "60–69 %", minP: 0.6, maxP: 0.7 },
  { key: "b70", label: "70–79 %", minP: 0.7, maxP: 0.8 },
  { key: "b80", label: "80 %+", minP: 0.8, maxP: 1.01 },
] as const;

export function computeModelCalibration(
  samples: readonly CalibrationSample[],
): ModelCalibrationSummary {
  const valid = samples.filter((s) => Number.isFinite(s.p) && s.p > 0 && s.p < 1);
  const total = valid.length;
  if (total === 0) {
    return {
      total: 0,
      hits: 0,
      overallHitRate: 0,
      meanPredicted: 0,
      brierScore: null,
      ece: null,
      buckets: [],
    };
  }

  let totalHits = 0;
  let sumP = 0;
  let sumBrier = 0;

  for (const s of valid) {
    const y = s.hit ? 1 : 0;
    totalHits += y;
    sumP += s.p;
    sumBrier += (s.p - y) ** 2;
  }

  const buckets: CalibrationBucketRow[] = [];
  let weightedEce = 0;

  for (const def of BUCKET_DEFS) {
    const inBucket = valid.filter((s) => s.p >= def.minP && s.p < def.maxP);
    if (inBucket.length === 0) continue;
    const hits = inBucket.filter((s) => s.hit).length;
    const meanPredicted = inBucket.reduce((acc, s) => acc + s.p, 0) / inBucket.length;
    const observedRate = hits / inBucket.length;
    weightedEce += (inBucket.length / total) * Math.abs(observedRate - meanPredicted);
    buckets.push({
      key: def.key,
      label: def.label,
      minP: def.minP,
      maxP: def.maxP,
      count: inBucket.length,
      hits,
      meanPredicted,
      observedRate,
      gapPts: Math.round((observedRate - meanPredicted) * 1000) / 10,
    });
  }

  return {
    total,
    hits: totalHits,
    overallHitRate: totalHits / total,
    meanPredicted: sumP / total,
    brierScore: Math.round((sumBrier / total) * 1000) / 1000,
    ece: Math.round(weightedEce * 1000) / 1000,
    buckets,
  };
}

export interface CalibrationCurveChartProps {
  samples?: readonly CalibrationSample[];
  summaryOverride?: ModelCalibrationSummary;
  title?: string;
  subtitle?: string;
}

const CALIBRATION_COLUMNS: readonly SofascoreTableColumn<CalibrationBucketRow>[] = [
  {
    key: "band",
    header: "Banda",
    sticky: true,
    render: (row) => row.label,
  },
  {
    key: "estimated",
    header: "Est.",
    numeric: true,
    align: "end",
    render: (row) => `${(row.meanPredicted * 100).toFixed(1)} %`,
  },
  {
    key: "observed",
    header: "Real",
    numeric: true,
    align: "end",
    render: (row) => <strong>{(row.observedRate * 100).toFixed(1)} %</strong>,
  },
  {
    key: "gap",
    header: "Dif.",
    numeric: true,
    align: "end",
    render: (row) => {
      const sign = row.gapPts > 0 ? "+" : "";
      return `${sign}${row.gapPts.toFixed(1)} pp`;
    },
  },
  {
    key: "sample",
    header: "n",
    numeric: true,
    align: "end",
    render: (row) => `${row.hits}/${row.count}`,
  },
];

export function CalibrationCurveChart({
  samples = [],
  summaryOverride,
  title = "Calibración real del motor",
  subtitle = "Cuando el modelo estima una probabilidad, ¿con qué frecuencia ocurre en la cancha?",
}: CalibrationCurveChartProps): React.JSX.Element {
  const summary = useMemo(
    () => summaryOverride ?? computeModelCalibration(samples),
    [summaryOverride, samples],
  );

  const w = 360;
  const h = 220;
  const pad = { top: 18, right: 20, bottom: 30, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const scaleX = (p: number) => pad.left + ((Math.max(0.3, Math.min(1, p)) - 0.3) / 0.7) * plotW;
  const scaleY = (p: number) => pad.top + (1 - (Math.max(0.3, Math.min(1, p)) - 0.3) / 0.7) * plotH;

  const polylinePoints = summary.buckets
    .map((b) => `${scaleX(b.meanPredicted).toFixed(1)},${scaleY(b.observedRate).toFixed(1)}`)
    .join(" ");

  const ticks = [0.4, 0.6, 0.8, 1.0] as const;

  const kpiItems: SofascoreKpiItem[] =
    summary.total > 0
      ? [
          {
            id: "sample",
            label: "Muestra FT",
            value: String(summary.total),
            delta: `${summary.hits} cumplidos`,
          },
          {
            id: "ece",
            label: "ECE",
            value: summary.ece !== null ? `${(summary.ece * 100).toFixed(1)} pp` : "—",
            tone: summary.ece !== null && summary.ece <= 0.05 ? "positive" : "default",
          },
          {
            id: "brier",
            label: "Brier",
            value: summary.brierScore !== null ? summary.brierScore.toFixed(3) : "—",
            tone: summary.brierScore !== null && summary.brierScore <= 0.22 ? "brand" : "default",
          },
          {
            id: "rate",
            label: "Real vs. Est.",
            value: `${(summary.overallHitRate * 100).toFixed(1)} %`,
            delta: `Est. ${(summary.meanPredicted * 100).toFixed(1)} %`,
          },
        ]
      : [];

  return (
    <div data-calibration-curve="">
      <SofascoreCard
        title={title}
        meta={summary.total > 0 ? `${summary.total} partidos FT` : "Sin muestra"}
      >
        <div className="pl-ed-stack">
          <p className="pl-ed-subcopy">{subtitle}</p>

          {kpiItems.length > 0 ? (
            <SofascoreKpiStrip items={kpiItems} className="pl-ed-kpi-4" />
          ) : null}

          {summary.total === 0 ? (
            <SofascoreEmptyState
              title="Sin partidos suficientes en este filtro"
              description="Todavía no hay suficientes partidos finalizados en este filtro para trazar la curva."
            />
          ) : (
            <div className="pl-ed-cal-grid">
              <figure className="pl-ed-cal-figure">
                <svg
                  viewBox={`0 0 ${w} ${h}`}
                  className="pl-cal-svg"
                  role="img"
                  aria-label={`Curva de calibración sobre ${summary.total} partidos: probabilidad media anunciada ${(summary.meanPredicted * 100).toFixed(1)} %, acierto observado ${(summary.overallHitRate * 100).toFixed(1)} %`}
                >
                  {ticks.map((t) => {
                    const y = scaleY(t);
                    const x = scaleX(t);
                    return (
                      <g key={t}>
                        <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} className="pl-cal-grid" />
                        <text x={pad.left - 6} y={y + 3} textAnchor="end" className="pl-cal-axis num">
                          {Math.round(t * 100)}%
                        </text>
                        <text x={x} y={h - 8} textAnchor="middle" className="pl-cal-axis num">
                          {Math.round(t * 100)}%
                        </text>
                      </g>
                    );
                  })}

                  <line
                    x1={scaleX(0.3)}
                    y1={scaleY(0.3)}
                    x2={scaleX(1)}
                    y2={scaleY(1)}
                    className="pl-cal-ideal"
                  />

                  {summary.buckets.length > 1 ? (
                    <polyline points={polylinePoints} fill="none" className="pl-cal-line" />
                  ) : null}

                  {summary.buckets.map((b) => {
                    const cx = scaleX(b.meanPredicted);
                    const cy = scaleY(b.observedRate);
                    const r = Math.min(8.5, Math.max(4, 3 + Math.sqrt(b.count) * 0.8));
                    return (
                      <g key={b.key}>
                        <circle cx={cx} cy={cy} r={r} className="pl-cal-dot" />
                        <title>
                          {`${b.label}: estimado ${(b.meanPredicted * 100).toFixed(1)} %, real ${(b.observedRate * 100).toFixed(1)} % (${b.hits}/${b.count})`}
                        </title>
                      </g>
                    );
                  })}
                </svg>
                <figcaption className="pl-cal-caption">
                  Línea punteada = calibración ideal. Puntos más cerca de la diagonal indican probabilidades más honestas.
                </figcaption>
              </figure>

              <div className="pl-ed-stack">
                <SofascoreTable
                  caption="Resumen de calibración por banda de probabilidad"
                  columns={CALIBRATION_COLUMNS}
                  rows={summary.buckets}
                  rowKey={(row) => row.key}
                  density="compact"
                />
                {summary.total < 20 ? (
                  <p className="pl-ed-muted num">
                    Muestra pequeña ({summary.total} partidos): los porcentajes por banda se estabilizan al superar 20 registros.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </SofascoreCard>
    </div>
  );
}
