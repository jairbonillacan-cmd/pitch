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
          className="glass-card glass-ring rounded-2xl p-5"
          style={{ minHeight: 280 }}
          aria-busy="true"
        />
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
          className="glass-card glass-ring rounded-2xl p-5"
          style={{ minHeight: 220 }}
          aria-busy="true"
        />
      }
    >
      <LazyCalibrationHonestyLabImpl {...props} />
    </Suspense>
  );
}
