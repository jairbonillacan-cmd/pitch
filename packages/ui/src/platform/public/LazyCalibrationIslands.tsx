"use client";

import React, { Suspense, lazy } from "react";
import type { CalibrationCurveChartProps } from "../components/CalibrationCurveChart";
import type { CalibrationHonestyLabProps } from "../components/CalibrationHonestyLab";

const LazyCalibrationCurveChartImpl = lazy(() =>
  import("../components/CalibrationCurveChart").then((m) => ({
    default: m.CalibrationCurveChart,
  })),
);

const LazyCalibrationHonestyLabImpl = lazy(() =>
  import("../components/CalibrationHonestyLab").then((m) => ({
    default: m.CalibrationHonestyLab,
  })),
);

export function LazyCalibrationCurveChart(
  props: CalibrationCurveChartProps,
): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div
          className="glass-card glass-ring rounded-2xl p-5 space-y-3"
          style={{ minHeight: 280 }}
          role="status"
          aria-busy="true"
          aria-label="Cargando curva de calibración"
        >
          <span className="pl-skel-bar" style={{ width: "44%", height: 14 }} />
          <span className="pl-skel-bar" style={{ width: "100%", height: 190 }} />
          <span className="pl-skel-bar" style={{ width: "62%", height: 11 }} />
        </div>
      }
    >
      <LazyCalibrationCurveChartImpl {...props} />
    </Suspense>
  );
}

export function LazyCalibrationHonestyLab(
  props: CalibrationHonestyLabProps,
): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div
          className="glass-card glass-ring rounded-2xl p-5 space-y-3"
          style={{ minHeight: 220 }}
          role="status"
          aria-busy="true"
          aria-label="Cargando laboratorio de calibración"
        >
          <span className="pl-skel-bar" style={{ width: "50%", height: 14 }} />
          <span className="pl-skel-bar" style={{ width: "100%", height: 120 }} />
          <span className="pl-skel-bar" style={{ width: "75%", height: 11 }} />
        </div>
      }
    >
      <LazyCalibrationHonestyLabImpl {...props} />
    </Suspense>
  );
}
