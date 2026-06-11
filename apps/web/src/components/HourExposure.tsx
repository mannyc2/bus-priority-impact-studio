import { lazy, Suspense } from "react";
import { ChartFallback } from "./ChartFallback.js";
import type { HourExposureProps } from "./HourExposure.chart.js";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const HourExposureChart = lazy(() =>
  import("./HourExposure.chart.js").then((module) => ({ default: module.HourExposureChart })),
);

export function HourExposure(props: HourExposureProps) {
  return (
    <Suspense fallback={<ChartFallback height={props.height ?? 112} />}>
      <HourExposureChart {...props} />
    </Suspense>
  );
}
